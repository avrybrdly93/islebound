/**
 * Cached queries by component signature — the `query(...defs)` of `04` §4.3
 * (BL-059), the third and last slice of ECS-lite.
 *
 * A query is the intersection: every live entity that has *all* of the given
 * components, in ascending entity order. `04` §4.3 asks for it to be
 * "computed lazily and cached per-tick by component-set signature", and
 * BL-059's third acceptance criterion asks for a component added or removed
 * mid-tick to be reflected rather than served stale.
 *
 * ## Those two asks are not the same, and where they differ this follows the
 * stricter one
 *
 * A cache cleared once per tick satisfies the first and **fails** the second:
 * inside a tick it is exactly the stale cache criterion 3 forbids, and
 * `04` §4.4's intent-in/event-out shape makes mid-tick component churn the
 * normal case rather than an exotic one — a `gather` intent removes a
 * `ResourceNode` in the same tick a later system queries for it.
 *
 * So invalidation here is **version-keyed, not tick-keyed**: each cached
 * result records the `version` of every store it was computed from plus the
 * allocator's, and is reused only while all of them still match. That is
 * strictly fresher than per-tick — it can never serve something a per-tick
 * cache would not have served — and it is also *cheaper*, because a cache
 * that nothing invalidated survives across ticks instead of being thrown away
 * 30 times a second. The wording in `04` §4.3 is a description of when a
 * result may be reused, and this reuses less. Logged as a note in
 * `34_DEVELOPMENT_LOG.md` and recorded in `40_DECISION_LOG.md`.
 *
 * ## The signature
 *
 * Order-independent and identity-based: `query(A, B)` and `query(B, A)` are
 * the same query, and a repeated def is not a second constraint. The key is
 * built from a per-def integer assigned on first sight, sorted and joined —
 * **not** from `def.name`, for the same reason {@link ComponentRegistry} keys
 * on identity: two defs with the same name are two different components, and
 * a name-keyed cache would hand one's result to the other.
 *
 * ## How a cold result is computed
 *
 * Drive from the **smallest** store's `entities()` and test the rest with
 * `has()`. `store.size` is O(1) and `has()` is O(1), so the cost is
 * `min(size) x defs` rather than `sum(size)`, and the answer arrives already
 * ascending because `entities()` is — no sort, no merge.
 *
 * Two things about `size` that matter here. It counts not-yet-pruned dead
 * slots, so it is an *upper bound* on the live count — fine for choosing which
 * store to drive from (a wrong choice costs time, not correctness) and wrong
 * as a result count, which is why nothing here returns it. And the driving
 * store's `entities()` already filters to live entities, so the intersection
 * inherits that filter and no separate liveness pass is needed.
 *
 * ## What the result is, and why it is an array
 *
 * `04` §4.3 types `query` as `Iterable<EntityId>`. This returns a frozen
 * array, which is one. The criterion this task carries is about **iteration**
 * cost at 10,000 x 6, and a generator pays a call per element where an array
 * pays an index — the difference is the criterion. The freeze is what makes
 * handing out the cache's own array safe: a caller that spliced it would
 * corrupt every later query with the same signature, and that bug would
 * surface arbitrarily far away.
 *
 * ## Purity
 *
 * Under `sim/`: no clock, no DOM, no `Math.random`, no module-level mutable
 * state. The cache is state its owner holds, like `EntityAllocator`,
 * `ComponentRegistry` and `RngState`. Nothing here observes time — the
 * "per-tick" in `04` is about *when results may be reused*, and this needs no
 * tick number to answer that.
 */

import type { ComponentDef, ComponentRegistry, ComponentStore } from '@sim/ecs/ComponentStore';
import type { EntityAllocator, EntityId } from '@sim/ecs/EntityAllocator';

/** A def with its value type erased, which is all a query needs. */
export type AnyComponentDef = ComponentDef<never>;

/** One cached intersection, with everything needed to decide if it is stale. */
interface CachedQuery {
  /** The stores the result was computed from, in signature order. */
  readonly stores: readonly ComponentStore<never>[];
  /** Each store's `version` at computation time, parallel to {@link stores}. */
  readonly storeVersions: number[];
  /** The allocator's `version` at computation time. */
  allocatorVersion: number;
  /** The result, frozen before it leaves {@link QueryCache.query}. */
  result: readonly EntityId[];
}

/**
 * Lazily computes and caches component-set intersections over one allocator
 * and one registry.
 *
 * Standing alone rather than as a method on `World` for the reason
 * {@link ComponentRegistry} does: there is no `World` yet. `04` §4.3 sketches
 * one holding `tick`, the stores, `query`, `events` and `step`; assembling it
 * is BL-061, and `World.query` will delegate here rather than reimplement.
 */
export class QueryCache {
  private readonly allocator: EntityAllocator;

  private readonly registry: ComponentRegistry;

  /** Stable small integer per def, assigned on first sight. */
  private readonly defIds = new Map<AnyComponentDef, number>();

  /** Cached results by signature. */
  private readonly cache = new Map<string, CachedQuery>();

  /** Cold computations performed. Diagnostic; see {@link misses}. */
  private computations = 0;

  /** Cached results served. Diagnostic; see {@link hits}. */
  private reuses = 0;

  // Explicit fields rather than TypeScript parameter properties: this
  // repository's test runner is `node --test` over strip-only type stripping,
  // which rejects `constructor(private readonly x: T)` outright. See
  // `34_DEVELOPMENT_LOG.md`, BL-058.
  constructor(allocator: EntityAllocator, registry: ComponentRegistry) {
    this.allocator = allocator;
    this.registry = registry;
  }

  /** Distinct signatures held. */
  get size(): number {
    return this.cache.size;
  }

  /**
   * How many times a query was answered from cache.
   *
   * Exposed because the performance criterion this task carries is about the
   * cached path, and a benchmark that silently recomputed every call would
   * report a number about the wrong thing. A test asserts this moves.
   */
  get hits(): number {
    return this.reuses;
  }

  /** How many times a query had to be computed. Counterpart to {@link hits}. */
  get misses(): number {
    return this.computations;
  }

  /**
   * Every live entity holding all of `defs`, in ascending entity order.
   *
   * Ascending **index** order, which is what "ascending entity order" means
   * throughout this package: the generation bits sit above the index, so a
   * numeric handle sort orders by generation first and agrees with this one
   * only until an index is recycled (`ComponentStore`'s module comment has the
   * long version). Nothing here re-sorts — the order is inherited from the
   * driving store's `entities()`, which is already correct.
   *
   * The returned array is frozen and owned by the cache. Do not hold it across
   * a mutation expecting it to update; call again, which is a `Map` lookup and
   * a handful of integer comparisons when nothing changed.
   *
   * @throws if called with no defs. "Every live entity" is a real question
   *   with a real answer — `EntityAllocator.liveEntities()` — and it is not
   *   this one; an empty intersection almost always means a spread that came
   *   out empty, and returning everything would turn that into a system
   *   silently operating on the whole world.
   */
  query(...defs: readonly AnyComponentDef[]): readonly EntityId[] {
    if (defs.length === 0) {
      throw new Error(
        'QueryCache.query: a query needs at least one component definition. For every live ' +
          'entity regardless of components, use EntityAllocator.liveEntities()',
      );
    }

    const ids = this.signatureIds(defs);
    const signature = ids.join(',');
    const cached = this.cache.get(signature);
    if (cached !== undefined) {
      if (this.isFresh(cached)) {
        this.reuses += 1;
        return cached.result;
      }
      this.recompute(cached);
      this.computations += 1;
      return cached.result;
    }

    const stores = this.storesFor(defs);
    const entry: CachedQuery = {
      stores,
      storeVersions: stores.map((store) => store.version),
      allocatorVersion: this.allocator.version,
      result: Object.freeze(intersect(stores)),
    };
    this.cache.set(signature, entry);
    this.computations += 1;
    return entry.result;
  }

  /**
   * Sorted, de-duplicated def ids for a signature.
   *
   * Sorting is what makes `query(A, B)` and `query(B, A)` one cache entry
   * rather than two that must be kept in agreement. De-duplication is what
   * makes `query(A, A)` mean `query(A)` — a repeated constraint is not a
   * second one, and leaving it in would drive an extra `has()` per entity for
   * a test that cannot fail.
   */
  private signatureIds(defs: readonly AnyComponentDef[]): number[] {
    const ids: number[] = [];
    for (const def of defs) {
      let id = this.defIds.get(def);
      if (id === undefined) {
        id = this.defIds.size;
        this.defIds.set(def, id);
      }
      if (!ids.includes(id)) ids.push(id);
    }
    return ids.sort((a, b) => a - b);
  }

  /** The stores a signature spans, deduplicated the same way. */
  private storesFor(defs: readonly AnyComponentDef[]): ComponentStore<never>[] {
    const stores: ComponentStore<never>[] = [];
    const seen = new Set<AnyComponentDef>();
    for (const def of defs) {
      if (seen.has(def)) continue;
      seen.add(def);
      stores.push(this.registry.store(def));
    }
    return stores;
  }

  /** Whether every version a cached result was computed from still holds. */
  private isFresh(entry: CachedQuery): boolean {
    if (entry.allocatorVersion !== this.allocator.version) return false;
    for (let i = 0; i < entry.stores.length; i += 1) {
      const store = entry.stores[i];
      if (store === undefined) return false;
      if (store.version !== entry.storeVersions[i]) return false;
    }
    return true;
  }

  /** Recomputes a stale entry in place, keeping its identity in the map. */
  private recompute(entry: CachedQuery): void {
    for (let i = 0; i < entry.stores.length; i += 1) {
      const store = entry.stores[i];
      if (store !== undefined) entry.storeVersions[i] = store.version;
    }
    entry.allocatorVersion = this.allocator.version;
    entry.result = Object.freeze(intersect(entry.stores));
  }
}

/**
 * The intersection itself: drive from the smallest store, `has()` on the rest.
 *
 * Kept a free function rather than a method because it reads no cache state —
 * which also makes it directly testable against a hand-built store set,
 * without a cache in the way.
 */
function intersect(stores: readonly ComponentStore<never>[]): EntityId[] {
  let driver = stores[0];
  if (driver === undefined) return [];
  for (const store of stores) {
    if (store.size < driver.size) driver = store;
  }

  const result: EntityId[] = [];
  outer: for (const entity of driver.entities()) {
    for (const store of stores) {
      if (store === driver) continue;
      if (!store.has(entity)) continue outer;
    }
    result.push(entity);
  }
  return result;
}
