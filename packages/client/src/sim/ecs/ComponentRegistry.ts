/**
 * `ComponentRegistry`: which stores exist (BL-058, split out of
 * `ComponentStore.ts` by BL-068).
 *
 * A different concern from what a store *holds*, which is `ComponentStore.ts`,
 * and from what a component *is*, which is `ComponentDef.ts`. This is the seam
 * BL-068 named, and the dependency direction is acyclic: this file imports
 * both of the others, and neither imports it.
 *
 * One consequence of the split is worth stating, because the original file's
 * prose crossed it freely: several doc comments here refer to
 * {@link ComponentStore.prune} and {@link ComponentStore.remove} for the
 * reasoning behind an ordering or a cost. Those references now cross a file
 * boundary. They are kept rather than inlined — the argument belongs with the
 * method that embodies it, and duplicating it is how two copies drift.
 *
 * ## Purity
 *
 * Under `sim/`: no clock, no DOM, no `Math.random`, no module-level mutable
 * state. A registry is state its owner holds — today a `World` (BL-061).
 */

import type { ComponentDef, ErasedStore } from '@sim/ecs/ComponentDef';
import { ComponentStore } from '@sim/ecs/ComponentStore';
import type { EntityAllocator, EntityId } from '@sim/ecs/EntityAllocator';
/**
 * Owns one {@link ComponentStore} per {@link ComponentDef}, created on first
 * use — the `store<T>(def: ComponentDef<T>): Store<T>` accessor of `04` §4.3.
 *
 * Standing alone rather than as a method on `World` because there is no
 * `World` yet: BL-007's handoff note 6 records that `04` §4.3 sketches one
 * holding `tick`, the stores, `query`, `events` and `step`, and that BL-058
 * and BL-059 build two of its pieces. When it is assembled (BL-061),
 * `World.store` delegates here rather than reimplementing it.
 *
 * Keyed on the **def object's identity**, not on `def.name`: two defs are two
 * components even if somebody names them the same, and identity is the only
 * key that cannot be spoofed by a string. A name collision is caught by
 * {@link registerName} instead, where the error can say which name.
 */
export class ComponentRegistry {
  // Typed `ErasedStore` rather than `unknown` so that both the destroy
  // fan-out (BL-060) and the enumerator (BL-066) can be written without an
  // assertion. Every member of that interface is covariant in the component's
  // `T`, so a `ComponentStore<T>` satisfies it structurally; see its doc for
  // why `set` is not among them.
  private readonly storesByDef = new Map<ComponentDef<unknown>, ErasedStore>();

  private readonly names = new Map<string, ComponentDef<unknown>>();

  private readonly allocator: EntityAllocator;

  // Explicit field, not a parameter property — see ComponentStore's
  // constructor for why they cannot be used in this repository.
  constructor(allocator: EntityAllocator) {
    this.allocator = allocator;
  }

  /** Number of stores created so far. */
  get storeCount(): number {
    return this.storesByDef.size;
  }

  /**
   * The store for a component, created on first request.
   *
   * @throws if a *different* def with the same `name` already has a store —
   *   the two would collide in a save file and in every debug view, and the
   *   identity keying above means nothing else would notice.
   */
  store<T>(def: ComponentDef<T>): ComponentStore<T> {
    const erased: ComponentDef<unknown> = def;
    const existing = this.storesByDef.get(erased);
    if (existing !== undefined) {
      // Safe by construction: `stores` is written only below, keyed by the
      // very def whose `T` the value was built for, and `ComponentDef<T>` is
      // branded so two component types are never the same key. TypeScript has
      // no existential types, so a heterogeneous map cannot be expressed
      // without one assertion; `07` §10's "fix the model" has no reading that
      // removes it. Kept to this one line, in the one place that owns the map.
      return existing as ComponentStore<T>;
    }
    this.registerName(def);
    const created = new ComponentStore<T>(this.allocator, def);
    this.storesByDef.set(erased, created);
    return created;
  }

  /** Whether a store has been created for this def. */
  has<T>(def: ComponentDef<T>): boolean {
    return this.storesByDef.has(def);
  }

  /**
   * Every store this registry owns, without their value types (BL-066).
   *
   * For the two callers that must walk *all* stores rather than reach one by
   * def — a save pass (`23`) serialising each store's entries, a debug overlay
   * (`13`) counting them. Both sit outside this class and so cannot do what
   * {@link removeEntity} does, which is iterate the map from inside it.
   *
   * **Read-only, and {@link ErasedStore} explains why that is not a hedge**:
   * its members are covariant in the component's `T`, so neither this method
   * nor any caller needs an assertion, and `set` is contravariant and so
   * absent.
   *
   * Iteration order is insertion order — `Map`'s guarantee — which is the
   * order stores were first *requested*, so it is deterministic within a run
   * and **not stable across runs**: it depends on which system touched which
   * component first. A save format must key on `def.name` and must not rely on
   * this order. Sorting by name belongs at the call site that needs it, not
   * here, where it would cost every debug-overlay frame a sort it does not.
   */
  *stores(): IterableIterator<ErasedStore> {
    yield* this.storesByDef.values();
  }

  /**
   * Removes `entity`'s component from every store this registry owns, and
   * returns how many stores held one (BL-060).
   *
   * `World.destroyEntity` is the caller, and the **order there is
   * load-bearing**: {@link ComponentStore.remove} refuses a dead or stale
   * handle, so this must run *before* the allocator destroys it. Called after,
   * every `remove` returns `false` and the entity's slots stay exactly where
   * they were — the leak this method exists to close, with a green suite,
   * because nothing else in the store's surface changes. `World.test.ts`
   * asserts the order rather than only the outcome.
   *
   * Harmless on a handle that is already dead or was never live: every
   * `remove` refuses it and the return is `0`. That is what lets
   * `World.destroyEntity` call this unconditionally instead of re-asking the
   * allocator a liveness question it is about to ask anyway.
   *
   * `O(stores)`, each `remove` being an O(1) swap. The sweeping alternative
   * and why it was not taken are in {@link ComponentStore.prune}.
   *
   * Iterates every store rather than only those that have the entity, because
   * nothing indexes entity → stores; building that index would cost a write
   * per `set` to save a read per destroy, on a store count that is the number
   * of *component types* and so is small and fixed.
   */
  removeEntity(entity: EntityId): number {
    let removed = 0;
    for (const store of this.storesByDef.values()) {
      if (store.remove(entity)) removed += 1;
    }
    return removed;
  }

  private registerName<T>(def: ComponentDef<T>): void {
    const claimed = this.names.get(def.name);
    if (claimed !== undefined && claimed !== def) {
      throw new Error(
        `ComponentRegistry.store: two different component definitions are both named ` +
          `"${def.name}". Names reach save files and debug views, so they must be unique`,
      );
    }
    this.names.set(def.name, def);
  }
}
