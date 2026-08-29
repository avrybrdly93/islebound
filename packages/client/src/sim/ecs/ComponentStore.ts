/**
 * Component storage: `ComponentDef<T>`, the sparse-set `ComponentStore<T>`,
 * and the registry that is `World.store(def)` (BL-058).
 *
 * `04` §4.3 pins the interface in one line —
 * `interface Store<T> { has(e); get(e); set(e, v); remove(e); entities(); }` —
 * and the paragraph under it pins the data model: components are **plain
 * serialisable data**, no methods, no class instances, no references to other
 * objects, only `EntityId`s. Everything here follows from those two.
 *
 * ## Why a sparse set
 *
 * The allocator hands out a *dense* index space precisely so a store can be
 * arrays rather than a `Map`. A sparse set is the standard pairing:
 *
 *     sparse[index]  ->  position in the dense arrays, or ABSENT
 *     dense[pos]     ->  the entity handle occupying that position
 *     values[pos]    ->  its component value
 *
 * `has`/`get`/`set`/`remove` are all O(1), and the dense half is contiguous so
 * iteration touches only entities that actually have the component — which is
 * the whole reason not to key on the entity handle in a `Map`.
 *
 * ## Two things the naive sparse set gets wrong here
 *
 * **1. The dense array holds the whole handle, not the index.** A recycled
 * index is the failure BL-007's generation bits exist to catch, and it arrives
 * here as: entity `(index 7, gen 3)` has a `Transform`, is destroyed, and
 * index 7 comes back as `(7, gen 4)`. If `dense` stored `7`, the new entity
 * would read the old one's component. Storing the handle makes
 * `dense[pos] === e` an exact identity test, so a stale handle misses and a
 * recycled one does not inherit.
 *
 * **2. "Ascending entity order" means ascending *index*, not ascending
 * handle.** The generation occupies the high 12 bits, so sorting handles
 * numerically sorts by generation first. Every entity in a fresh test has
 * generation 1, so a handle sort and an index sort agree exactly until the
 * first index is recycled — a store that sorts raw handles passes its own
 * tests and then silently reorders itself under churn. `entities()` sorts by
 * {@link indexOf}. `04` §4.2 item 3 is what makes this a determinism bug
 * rather than a tidiness one.
 *
 * The sorted view is *cached* and invalidated by mutation, so the O(n log n)
 * is paid once per mutation batch rather than once per iteration. Mutation is
 * still O(1): nothing is kept sorted, only re-sorted on demand.
 *
 * ## The destroyed-handle rule, which criterion 3 leaves to us
 *
 * BL-058's third criterion says a store must "reject (or ignore, documented
 * either way) a destroyed entity's handle rather than resurrecting it". This
 * store is **asymmetric, deliberately**:
 *
 * | operation | on a dead or stale handle | why |
 * |---|---|---|
 * | `set` | **throws** | a dropped write is data loss with no signal, and "resurrect or discard" has no safe default |
 * | `get` | `undefined` | a read of something that is gone has an obvious answer |
 * | `has` | `false` | same |
 * | `remove` | `false` | idempotent by design, exactly like `EntityAllocator.destroy` |
 * | `entities` | skipped | a dead entity is not iterated even before its component is removed |
 *
 * The asymmetry is the point. `destroy` returns `false` rather than throwing
 * because double-destroy is a normal race between two systems reacting to one
 * event (`04` §4.4 makes that shape common) and the second call has nothing to
 * do. A `set` in the same race is not nothing to do — it is a value the caller
 * computed, and silently discarding it would make the bug show up somewhere
 * else entirely.
 *
 * **The allocator is the single owner of the liveness judgement.** Every check
 * above is `allocator.isLive(e)`; nothing here re-derives it from generation
 * bits. A second implementation of that rule is a second thing to keep in
 * sync.
 *
 * ## Reclamation: eager through a `World`, lazy through `prune` (BL-060)
 *
 * A `ComponentStore` on its own still knows nothing about entity destruction:
 * the allocator does not call it, so a handle destroyed behind the store's
 * back leaves its slot occupied until either the index is reused (`set`
 * overwrites it) or {@link ComponentStore.prune} sweeps it.
 *
 * What changed with BL-060 is that a store reached through a `World` is no
 * longer in that position. `World.destroyEntity` calls
 * {@link ComponentRegistry.removeEntity}, which removes the entity from every
 * store it owns **before** the handle is destroyed — so under a `World` the
 * slot is gone at the moment of destruction and there is nothing to sweep.
 *
 * `prune()` therefore stays, and its job is now specific rather than
 * universal: it is for a store driven directly by an `EntityAllocator` with no
 * `World` between them, which is what this file's own tests do and what a
 * future non-`World` owner would do. See its doc for the cost of each.
 *
 * ## Purity
 *
 * Under `sim/`: no clock, no DOM, no `Math.random`, no module-level mutable
 * state. A store is state its owner holds, like `EntityAllocator` and
 * `RngState`.
 */

import { type EntityAllocator, type EntityId, indexOf } from '@sim/ecs/EntityAllocator';

/**
 * Phantom brand carrying a component's value type on its definition.
 *
 * `07` §2.1 uses exactly this shape for branded IDs. It is a type-level
 * marker: `declare const` emits nothing, the property is optional and never
 * assigned, and `structuredClone` of a def is not something anything does.
 * Without it `ComponentDef<Transform>` and `ComponentDef<Velocity>` are the
 * same type and `store()` would hand back the wrong store with no complaint.
 */
declare const componentValue: unique symbol;

/**
 * The identity of a component type.
 *
 * A def is a *name plus a type*, and deliberately not a schema, a default
 * value or a factory. `04` §4.3 says components are plain serialisable data;
 * anything richer here would be a place to put a method, and the first method
 * on a component is the end of `structuredClone` working.
 *
 * `name` is for saves, dev tooling and error messages. It is not what the
 * registry keys on — the def object's identity is (see
 * {@link ComponentRegistry}) — so two defs with the same name are two
 * different components, and that is a bug the {@link defineComponent} guard
 * catches rather than a feature.
 */
export interface ComponentDef<T> {
  readonly name: string;
  readonly [componentValue]?: T;
}

/**
 * Declares a component type.
 *
 * ```ts
 * interface Transform { x: number; y: number; z: number }
 * const Transform = defineComponent<Transform>('Transform');
 * ```
 *
 * @throws if `name` is empty — a nameless component produces error messages
 *   and save keys that name nothing, and the mistake is silent otherwise.
 */
export function defineComponent<T>(name: string): ComponentDef<T> {
  if (name.length === 0) {
    throw new Error('defineComponent: a component definition needs a non-empty name');
  }
  return { name };
}

/**
 * The read/write surface of a component store, as `04` §4.3 declares it.
 *
 * Separate from {@link ComponentStore} so a system can be written against the
 * capability rather than the implementation, and so a future store with a
 * different layout (a tag store with no values, a chunked one) is a drop-in.
 */
export interface Store<T> {
  has(entity: EntityId): boolean;
  get(entity: EntityId): T | undefined;
  set(entity: EntityId, value: T): void;
  remove(entity: EntityId): boolean;
  entities(): IterableIterator<EntityId>;
}

/**
 * The part of a store that does not mention its value type.
 *
 * {@link ComponentRegistry} holds one store per component and cannot name
 * their differing `T`s in a single map, so the map's value type was `unknown`
 * and every read out of it needed an assertion. BL-060 needs to call `remove`
 * across *all* of them, and `remove` is precisely a method that does not read
 * `T` — so the map is typed as this instead. `ComponentRegistry.removeEntity`
 * then needs no assertion at all, and the one that remains in
 * {@link ComponentRegistry.store} is unchanged in kind: still a single
 * downcast, in the one place that owns the map.
 */
export interface EntityScopedStore {
  remove(entity: EntityId): boolean;
}

/**
 * A store seen without its value type — what {@link ComponentRegistry.stores}
 * yields (BL-066).
 *
 * ## Why this can exist, when the obvious argument says it cannot
 *
 * BL-060's handoff recorded the constraint: TypeScript has no existential
 * types, so an enumerator whose element type mentions the component's `T`
 * cannot be written, and every widening either loses the value type or adds an
 * assertion per call site. True — and not the end of it, because **neither
 * caller BL-066 names needs `T`.** A debug overlay (`13`) wants a name and a
 * count. A save pass (`23`) wants to write the values *out*, and `04` §4.3
 * makes components plain serialisable data, so serialising one is
 * `structuredClone`-shaped work on an opaque value: the serialiser copies, it
 * never branches on the type. `unknown` is the honest type for that, not a
 * lossy one.
 *
 * Every member below is covariant in `T` — `ComponentDef<T>` widens to
 * `ComponentDef<unknown>` because the brand is optional, and `T | undefined`
 * widens to `unknown` on `get` — so a `ComponentStore<T>` satisfies this
 * **structurally, for every `T`, with no assertion**. That is what makes
 * BL-066's second criterion (the `as` count must not rise) satisfiable rather
 * than merely aspirational.
 *
 * ## The absence of `set` is the load-bearing half
 *
 * `set` is *contravariant* in `T`, so an erased `set(entity, value: unknown)`
 * would let a caller write a `Velocity` into the `Transform` store with the
 * compiler's blessing — the confusion the `componentValue` brand exists to
 * prevent, reintroduced one level up. It would also need an assertion inside
 * `ComponentStore`, breaking the second criterion.
 *
 * The consequence shapes `23`: **a save pass can write itself out through this
 * interface but cannot read itself back in through it.** Loading goes through
 * {@link ComponentRegistry.store} with a real `ComponentDef<T>`, which means
 * the load side needs a name-to-def table that content code owns. Nothing
 * loads anything yet; filed as BL-067.
 */
export interface ErasedStore extends EntityScopedStore {
  /** The component this store holds. `def.name` is the save key and debug label. */
  readonly def: ComponentDef<unknown>;

  /** Entries held, live and not-yet-pruned alike — see {@link ComponentStore.size}. */
  readonly size: number;

  /** Membership/order mutation counter — see {@link ComponentStore.version}. */
  readonly version: number;

  /** This entity's component as an opaque value, or `undefined`. */
  get(entity: EntityId): unknown;

  /** Live entities with this component, ascending by index. */
  entities(): IterableIterator<EntityId>;
}

/** Sentinel for "this index has no component here". */
const ABSENT = -1;

/**
 * A sparse-set component store over one component type.
 *
 * See the module comment for the layout, the recycled-index trap, the
 * ascending-order trap and the destroyed-handle rule.
 */
export class ComponentStore<T> implements Store<T> {
  /** Position in {@link dense} per entity index, or {@link ABSENT}. */
  private readonly sparse: number[] = [];

  /** Occupying handle per dense position. Full handles, not indices. */
  private readonly dense: EntityId[] = [];

  /** Component values, parallel to {@link dense}. */
  private readonly values: T[] = [];

  /** Ascending-by-index view of {@link dense}, rebuilt on demand. */
  private sortedCache: EntityId[] | undefined = undefined;

  /**
   * Monotonic counter bumped by every mutation that can change *which*
   * entities this store holds, or their order.
   *
   * Added by BL-059, which needs an invalidation signal a query cache can
   * compare cheaply: the store invalidates its own {@link sortedCache} on
   * mutation but tells nobody, so a cache built on top has no way to know.
   *
   * **It is bumped in exactly the places `sortedCache` is cleared, and that
   * pairing is deliberate rather than incidental.** "The sorted view is no
   * longer valid" and "a query over this store may have a different answer"
   * are the same condition — membership or order changed — so keeping them on
   * the same lines is what stops the two from drifting apart as this class
   * grows. In particular a {@link set} that only replaces the *value* for an
   * entity already present does neither: it cannot change any query result,
   * and it does not bump.
   */
  private mutations = 0;

  /** The allocator that owns the liveness judgement for every handle here. */
  private readonly allocator: EntityAllocator;

  /** The component this store holds. Exposed for debug views and save keys. */
  readonly def: ComponentDef<T>;

  // Explicit fields rather than TypeScript parameter properties: this
  // repository's test runner is `node --test` over strip-only type stripping,
  // which rejects `constructor(private readonly x: T)` outright
  // (ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX) because stripping the type would
  // change runtime behaviour. See `34_DEVELOPMENT_LOG.md`, BL-058.
  constructor(allocator: EntityAllocator, def: ComponentDef<T>) {
    this.allocator = allocator;
    this.def = def;
  }

  /** Number of stored components, live and not-yet-pruned alike. */
  get size(): number {
    return this.dense.length;
  }

  /**
   * How many membership- or order-changing mutations this store has seen.
   *
   * A cache holds the value it last computed against and compares; anything
   * else is an equality test on the store's contents, which is the work the
   * cache exists to avoid. Monotonic, so it cannot return to a previous value
   * the way {@link size} can — a component added and another removed leaves
   * `size` unchanged and this number two higher.
   */
  get version(): number {
    return this.mutations;
  }

  /**
   * Dense position of an entity's component, or {@link ABSENT}.
   *
   * The handle comparison is what makes a recycled index miss instead of
   * inheriting; see the module comment. `noUncheckedIndexedAccess` is on and
   * `07` §"Never use `!`" applies in `sim/`, so both reads are guarded rather
   * than asserted.
   */
  private positionOf(entity: EntityId): number {
    const position = this.sparse[indexOf(entity)] ?? ABSENT;
    if (position === ABSENT) return ABSENT;
    return this.dense[position] === entity ? position : ABSENT;
  }

  /** Whether `entity` is live and has this component. */
  has(entity: EntityId): boolean {
    if (!this.allocator.isLive(entity)) return false;
    return this.positionOf(entity) !== ABSENT;
  }

  /** This entity's component, or `undefined` if it is absent, dead or stale. */
  get(entity: EntityId): T | undefined {
    if (!this.allocator.isLive(entity)) return undefined;
    const position = this.positionOf(entity);
    if (position === ABSENT) return undefined;
    return this.values[position];
  }

  /**
   * Writes this entity's component, replacing any previous value.
   *
   * @throws if `entity` is not live — destroyed, stale, or `NULL_ENTITY`. See
   *   the module comment's table for why this one throws where `get`, `remove`
   *   and `entities` do not.
   */
  set(entity: EntityId, value: T): void {
    if (!this.allocator.isLive(entity)) {
      throw new Error(
        `ComponentStore(${this.def.name}).set: entity ${String(entity)} is not live ` +
          `(index ${String(indexOf(entity))}); writing to it would resurrect a destroyed ` +
          'entity or attribute the value to a stale handle',
      );
    }

    const index = indexOf(entity);
    const existing = this.sparse[index] ?? ABSENT;
    if (existing !== ABSENT) {
      if (this.dense[existing] === entity) {
        // Same entity, new value. Order is unchanged, so the cache survives.
        this.values[existing] = value;
        return;
      }
      // The index was recycled while the previous entity's component was still
      // here. The previous entity is necessarily dead (its index was reissued),
      // so its value is overwritten rather than kept alongside.
      this.dense[existing] = entity;
      this.values[existing] = value;
      this.sortedCache = undefined;
      this.mutations += 1;
      return;
    }

    this.sparse[index] = this.dense.length;
    this.dense.push(entity);
    this.values.push(value);
    this.sortedCache = undefined;
    this.mutations += 1;
  }

  /**
   * Removes this entity's component.
   *
   * Returns `false` for an entity that has no component here, or whose handle
   * is dead or stale — idempotent, like `EntityAllocator.destroy`.
   *
   * Removal is swap-with-last, which is what keeps it O(1) and is exactly why
   * `dense` is not a sorted array: see {@link entities}.
   */
  remove(entity: EntityId): boolean {
    if (!this.allocator.isLive(entity)) return false;
    const position = this.positionOf(entity);
    if (position === ABSENT) return false;
    this.removeAt(position);
    this.sortedCache = undefined;
    this.mutations += 1;
    return true;
  }

  /** Swap-with-last removal of a dense position. Does not touch the cache. */
  private removeAt(position: number): void {
    const last = this.dense.length - 1;

    // Clear the removed entity's sparse slot *before* the swap. Doing it after
    // reads `dense[last]`, which by then holds the entity that was just moved
    // into `position` — so the clear would undo the assignment below and leave
    // a live component unreachable. The two can never be the same entity: one
    // index occupies at most one dense position.
    const removed = this.dense[position];
    if (removed !== undefined) this.sparse[indexOf(removed)] = ABSENT;

    if (position !== last) {
      const movedEntity = this.dense[last];
      const movedValue = this.values[last];
      if (movedEntity !== undefined && movedValue !== undefined) {
        this.dense[position] = movedEntity;
        this.values[position] = movedValue;
        this.sparse[indexOf(movedEntity)] = position;
      }
    }

    this.dense.length = last;
    this.values.length = last;
  }

  /**
   * Entities with this component, in **ascending index order**, skipping any
   * whose handle is no longer live.
   *
   * Ascending index, not ascending handle — the generation bits sit above the
   * index, so a numeric sort of handles orders by generation first and only
   * agrees with this one until an index is recycled. The module comment has
   * the long version.
   *
   * The sorted view is cached and invalidated by every mutation that can
   * reorder it, so repeated iteration between mutations costs a scan rather
   * than a sort. The liveness filter is applied at yield time and not baked
   * into the cache, because an entity can be destroyed without touching this
   * store at all.
   */
  *entities(): IterableIterator<EntityId> {
    const sorted = this.sortedEntities();
    for (const entity of sorted) {
      if (this.allocator.isLive(entity)) yield entity;
    }
  }

  /** The cached ascending-by-index view, rebuilt if a mutation invalidated it. */
  private sortedEntities(): readonly EntityId[] {
    const cached = this.sortedCache;
    if (cached !== undefined) return cached;
    const rebuilt = [...this.dense].sort((a, b) => indexOf(a) - indexOf(b));
    this.sortedCache = rebuilt;
    return rebuilt;
  }

  /**
   * Drops every entry whose handle is no longer live, and returns how many
   * were dropped.
   *
   * **This is the sweep, and it is the alternative BL-060 did not take.** The
   * two ways to reclaim a destroyed entity's slots differ in cost and, more
   * importantly, in *when* they move {@link version}:
   *
   * - Per-store `remove` at destroy time — what `World.destroyEntity` does —
   *   is `O(stores)` per destroy, each `remove` being an O(1) swap. It moves
   *   the version of exactly the stores that held the entity, exactly when it
   *   was destroyed.
   * - This sweep is `O(size)` per store per call, so `O(total entries)` for a
   *   world, and on a cadence it would bump the version of every store it
   *   touched on the tick it happened to run. `QueryCache` keys on version, so
   *   every cached query would miss on that tick for reasons no system could
   *   see.
   *
   * That is why the eager fan-out is the default and this is not called from
   * `World` at all. It stays for a store driven directly by an
   * `EntityAllocator` with no `World` between them — this file's own tests,
   * and any future non-`World` owner.
   *
   * Calling it changes nothing observable through `has`, `get` or `entities`
   * — they already skip these — only {@link size}, {@link version} and memory.
   */
  prune(): number {
    let dropped = 0;
    for (let position = this.dense.length - 1; position >= 0; position -= 1) {
      const entity = this.dense[position];
      if (entity === undefined || this.allocator.isLive(entity)) continue;
      this.removeAt(position);
      dropped += 1;
    }
    if (dropped > 0) {
      this.sortedCache = undefined;
      this.mutations += 1;
    }
    return dropped;
  }
}

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
