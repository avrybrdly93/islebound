/**
 * The vocabulary of component storage: what a component *is*, and what a store
 * *offers* (BL-058, split out of `ComponentStore.ts` by BL-068).
 *
 * `04` §4.3 pins the interface in one line —
 * `interface Store<T> { has(e); get(e); set(e, v); remove(e); entities(); }` —
 * and the paragraph under it pins the data model: components are **plain
 * serialisable data**, no methods, no class instances, no references to other
 * objects, only `EntityId`s. Everything in this file and its two siblings
 * follows from those two.
 *
 * Nothing here mentions a storage layout. That is the seam BL-068 split on:
 * these declarations are what every consumer imports as *types*, while
 * {@link ../ComponentStore} holds one particular implementation of them and
 * `ComponentRegistry.ts` holds the question of which ones exist. The
 * dependency direction is acyclic — registry → store → these → allocator.
 *
 * ## Purity
 *
 * Under `sim/`: no clock, no DOM, no `Math.random`, no module-level mutable
 * state. `defineComponent` returns a fresh object and registers nothing
 * globally, which is exactly why a save file's `"Transform"` cannot be
 * resolved back to a def without a table somebody owns (BL-067).
 */

import type { EntityId } from '@sim/ecs/EntityAllocator';
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
