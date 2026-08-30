/**
 * The sparse-set `ComponentStore<T>` (BL-058), one particular implementation
 * of the `Store<T>` interface in `ComponentDef.ts`.
 *
 * `04` §4.3's data model — components are **plain serialisable data**, no
 * methods, no class instances, no references to other objects, only
 * `EntityId`s — is what makes the layout below possible. The declarations it
 * implements live in `ComponentDef.ts`; which stores exist is
 * `ComponentRegistry.ts`. BL-068 split the three apart.
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
 * `ComponentRegistry.removeEntity`, which removes the entity from every
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

import type { ComponentDef, Store } from '@sim/ecs/ComponentDef';
import { type EntityAllocator, type EntityId, indexOf } from '@sim/ecs/EntityAllocator';
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
