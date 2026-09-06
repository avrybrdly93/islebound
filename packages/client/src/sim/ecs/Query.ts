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
 * ## Signatures must be statically known, and that is checked (BL-063)
 *
 * The map holds one entry per distinct signature and **drops none**. That is
 * correct and bounded for the design `04` §4.3 describes — systems are a fixed
 * list in `sim/systems/order.ts`, so the set of signatures a build can produce
 * is finite, small, and decided at authoring time. It stops being bounded the
 * moment a signature is built from *data*: a query per structure type or per
 * crop species grows the map for the lifetime of the session, and each entry
 * holds an array as long as its result.
 *
 * So the rule is: **`query` accepts only statically-known signatures** — the
 * defs at a call site are written there, not assembled from content. It is a
 * rule rather than a hope because {@link SIGNATURE_LIMIT} enforces it: a
 * *new* signature beyond the limit throws, naming the rule and what to do.
 * Failing loudly is this package's existing answer to exhaustion
 * ({@link EntityAllocator} refuses to alias when it runs out rather than
 * quietly recycling), and it is deterministic — the same call sequence throws
 * at the same point in every build, so `sim/`'s hashability is unaffected.
 *
 * ## Why not eviction (LRU on a cap, or drop-if-unqueried-for-N-ticks)
 *
 * BL-063 offers eviction as the alternative and it is deliberately not taken.
 *
 * 1. **It would be a guess.** Nothing in the repository builds a dynamic
 *    signature, so there is no caller whose behaviour would size the policy.
 *    `35` §3 forbids inventing one anyway.
 * 2. **It makes the cache slower in exactly the case it is for.** BL-059
 *    measured a cold intersection at **1.00 ms** against **0.0784 ms** cached.
 *    Evicting a signature that is still in the system list converts a hit into
 *    that cold path — about 13x — on a 6 ms CPU budget. An LRU sized slightly
 *    too small thrashes; sized generously it never evicts, which is this
 *    limit with more machinery. Drop-if-unqueried-for-N-ticks has the same
 *    shape and additionally needs a tick number, which this class deliberately
 *    does not observe (see **Purity** below).
 * 3. **There is no process-lifetime leak to fix.** One `QueryCache` per
 *    `World`, constructed with it and unreachable from outside, so the map
 *    dies with the world. The risk is unbounded growth *within* one session,
 *    which a limit addresses directly and an eviction policy would hide.
 *
 * If a caller ever genuinely needs many signatures, the honest change is to
 * raise {@link SIGNATURE_LIMIT} deliberately, in a diff a reviewer sees —
 * or, if the set is truly unbounded, to implement eviction *then*, against a
 * real access pattern rather than an imagined one.
 *
 * ## Purity
 *
 * Under `sim/`: no clock, no DOM, no `Math.random`, no module-level mutable
 * state. The cache is state its owner holds, like `EntityAllocator`,
 * `ComponentRegistry` and `RngState`. Nothing here observes time — the
 * "per-tick" in `04` is about *when results may be reused*, and this needs no
 * tick number to answer that.
 */

import type { ComponentDef } from '@sim/ecs/ComponentDef';
import type { ComponentRegistry } from '@sim/ecs/ComponentRegistry';
import type { ComponentStore } from '@sim/ecs/ComponentStore';
import type { EntityAllocator, EntityId } from '@sim/ecs/EntityAllocator';

/**
 * A def in the position a query uses it: identity only, value type unread.
 *
 * **This is the *top* of the def family, and which end it is matters.** It was
 * `ComponentDef<never>` until BL-065 — the *bottom*, which nothing but itself
 * is assignable to under `exactOptionalPropertyTypes`, so every caller holding
 * a real `ComponentDef<Transform>` had to cast to reach `query`. The top is the
 * correct parameter because a query never reads `T`: it uses a def for map
 * identity and hands it to {@link ComponentRegistry.store}. Every
 * `ComponentDef<T>` is a `ComponentDef<unknown>`, since `T` appears only in an
 * optional readable property and is therefore covariant, so callers lose their
 * casts with no assertion anywhere.
 *
 * That is decision **0027**'s widening applied one level down — 0027 chose
 * exactly this direction for `ErasedStore` and said in as many words that it
 * did not solve this. The reasoning transfers because the reason is the same:
 * the value type is not read on this path.
 *
 * **It is a parameter type, not a storage type.** Anything that would *write* a
 * component value is contravariant in `T` and cannot use it — that is why
 * `ErasedStore` has no `set` (0027 again), and the same argument applies here.
 */
export type AnyComponentDef = ComponentDef<unknown>;

/**
 * The most distinct signatures one cache will hold before it refuses a new one.
 *
 * **Reasoned, not picked.** `05` §1 lists thirteen files under `sim/systems/`,
 * and `SYSTEM_ORDER` is the whole set of systems a build runs. At a handful of
 * distinct queries each, a fully populated Phase-6 game is order-50 signatures,
 * so 64 clears any static set this design admits while sitting far below what a
 * signature derived from content reaches — a query per crop species passes it
 * within one save file.
 *
 * It is therefore a **tripwire for a design error**, not a capacity limit to be
 * tuned: hitting it means a call site is assembling defs from data, which is
 * the thing the module comment rules out. Raising it is a one-line diff a
 * reviewer sees, which is the intended way to disagree with it.
 */
export const SIGNATURE_LIMIT = 64;

/** One cached intersection, with everything needed to decide if it is stale. */
interface CachedQuery {
  /** The stores the result was computed from, in signature order. */
  readonly stores: readonly ComponentStore<unknown>[];
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

    // BL-063. Only a genuinely new signature can reach here -- a cached one
    // returned above, fresh or recomputed -- so a build with a fixed system
    // list stops adding entries early and never tests this again. Checked
    // *before* the stores are resolved so a refused query has no side effect
    // beyond the def ids already assigned in `signatureIds`, which are
    // idempotent.
    if (this.cache.size >= SIGNATURE_LIMIT) {
      throw new Error(
        `QueryCache: refusing a ${String(this.cache.size + 1)}th distinct query signature ` +
          `(limit ${String(SIGNATURE_LIMIT)}). Queries must use statically-known component ` +
          'sets -- defs written at the call site, not assembled from content -- because the ' +
          'cache holds one entry per signature and never evicts. Hitting this almost always ' +
          'means a signature is being built from data (a query per structure type, per crop ' +
          'species). Fix the call site; or, if the set really is this large and static, raise ' +
          'SIGNATURE_LIMIT in sim/ecs/Query.ts deliberately. See BL-063.',
      );
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
  private storesFor(defs: readonly AnyComponentDef[]): ComponentStore<unknown>[] {
    const stores: ComponentStore<unknown>[] = [];
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
function intersect(stores: readonly ComponentStore<unknown>[]): EntityId[] {
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
