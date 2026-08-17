/**
 * Entity handles: allocation, destruction and generation bits (BL-007).
 *
 * `04` §4.3 pins the shape in one line — `type EntityId = number; // dense,
 * recycled with generation bits` — and `05` §1 names this file. Everything
 * below follows from taking "a number" literally: an entity handle is a single
 * primitive, so it survives `structuredClone`, hashes with `core/math/hash.ts`
 * unchanged, and can sit in a component as a reference to another entity
 * without introducing an object graph (`04` §4.3: components hold "only
 * `EntityId`s").
 *
 * ## What the generation bits are for
 *
 * A dense allocator recycles indices, and a recycled index is how a stale
 * handle turns into a silent bug: system A keeps `e` after entity `e` is
 * destroyed, index 7 is handed to a new entity, and A's next read finds real
 * data belonging to somebody else. Nothing throws; the game just does the
 * wrong thing. Packing a generation counter alongside the index makes the
 * stale handle *detectable* — index 7's generation moved on, so the old handle
 * no longer validates.
 *
 * ## The bit layout, and why it is 32 bits
 *
 *     bit 31                    20 19                     0
 *          +---------------------+-----------------------+
 *          |  generation (12)    |      index (20)       |
 *          +---------------------+-----------------------+
 *
 * 32 bits so the handle stays inside the int32 world `core/math/hash.ts` and
 * `sim/rng/Rng.ts` already live in — FNV-1a over a canonical serialisation
 * (`04` §4.2 item 6) mixes a 32-bit integer exactly, with no engine latitude.
 * A wider handle would either need a pair of numbers, which is no longer "a
 * number", or the 2⁵³ float range, which is exact but stops being bit-mixable
 * the same way.
 *
 * The split is 20/12: **1,048,576 indices** (max simultaneously live) against
 * **4,095 uses of each index**. Both are far above anything `04` budgets for —
 * §2 measures its indirection cost "at 3,000 entities" and BL-059's query
 * criterion is stated at 10,000 — and the split does not change the total
 * number of handles the space can ever issue, which is 2³² either way. It only
 * trades max-live against reuses-per-index.
 *
 * ## Two decisions that are easy to get wrong
 *
 * **Generations start at 1, not 0**, so handle `0` is never a valid entity and
 * can be {@link NULL_ENTITY}. Without that, index 0's first entity *is* the
 * number 0, and every `if (entity)` in the codebase silently means "every
 * entity except the first one". That is a bug class, not a style preference.
 *
 * **An index whose generation is exhausted is retired, not wrapped.** Wrapping
 * generation 4095 back to 1 would re-issue a handle that was already live once
 * — aliasing, exactly what the generation bits exist to prevent, arriving
 * quietly after a few thousand reuses. Retiring costs one index out of a
 * million and cannot produce a wrong answer. The allocator throws only when
 * the *index* space is genuinely spent.
 *
 * ## Purity
 *
 * This module is under `sim/`: no clock, no DOM, no `Math.random`, no
 * module-level mutable state. An `EntityAllocator` is state the caller owns,
 * the same way `RngState` is.
 */

/** A packed entity handle. Always an unsigned 32-bit integer. */
export type EntityId = number;

/**
 * The handle that is never a live entity.
 *
 * Zero, and reachable as a value only because generations start at 1 — see the
 * module comment.
 */
export const NULL_ENTITY: EntityId = 0;

const INDEX_BITS = 20;
const GENERATION_BITS = 12;

/** Highest index the layout can address: 1,048,575. */
export const MAX_INDEX = (1 << INDEX_BITS) - 1;

/** Highest generation an index can reach before it is retired: 4,095. */
export const MAX_GENERATION = (1 << GENERATION_BITS) - 1;

const INDEX_MASK = MAX_INDEX;

/** The index half of a handle. Meaningful for live and stale handles alike. */
export function indexOf(entity: EntityId): number {
  return entity & INDEX_MASK;
}

/** The generation half of a handle. `0` only for {@link NULL_ENTITY}. */
export function generationOf(entity: EntityId): number {
  return entity >>> INDEX_BITS;
}

/**
 * Packs an index and a generation into a handle.
 *
 * The `>>> 0` is not decoration. JavaScript's bitwise operators yield *signed*
 * int32, so any generation from 2048 up sets bit 31 and `(g << 20) | i` comes
 * back negative — the same handle would then compare unequal to the unsigned
 * one a caller reconstructed, and would hash differently. Every handle this
 * module produces goes through here.
 */
function pack(index: number, generation: number): EntityId {
  return ((generation << INDEX_BITS) | index) >>> 0;
}

/**
 * Allocates, recycles and validates entity handles.
 *
 * Iteration order is ascending index, always — not allocation order, and not
 * free-list order. `04` §4.2 item 3 requires a defined iteration order for
 * anything whose output depends on it, and "ascending" is the only order that
 * stays stable when the free list reshuffles under churn.
 */
export class EntityAllocator {
  /** Current generation per index. Length is the high-water mark. */
  private readonly generations: number[] = [];

  /** Liveness per index, parallel to {@link generations}. */
  private readonly alive: boolean[] = [];

  /** Indices available for reuse, most recently freed last (LIFO). */
  private readonly free: number[] = [];

  private liveEntityCount = 0;

  private retiredIndexCount = 0;

  /**
   * Current generation of an index, or `0` for an index that does not exist.
   *
   * `noUncheckedIndexedAccess` is on, so every read of the parallel arrays is
   * `number | undefined`, and `06` bans the non-null assertion that would
   * paper over it. `0` is not an arbitrary fallback: generations start at 1,
   * which is exactly what makes {@link NULL_ENTITY} representable, so `0`
   * already means "no such entity" everywhere else in this file.
   */
  private generationAt(index: number): number {
    return this.generations[index] ?? 0;
  }

  /** Number of live entities. */
  get liveCount(): number {
    return this.liveEntityCount;
  }

  /**
   * Number of indices permanently withdrawn because their generation space is
   * spent. Exposed because a number that climbs in a long session is a signal
   * about churn, not a fault.
   */
  get retiredCount(): number {
    return this.retiredIndexCount;
  }

  /** Highest index ever allocated, plus one. */
  get capacity(): number {
    return this.generations.length;
  }

  /**
   * Allocates a handle.
   *
   * Prefers a recycled index over a fresh one, so the index space stays dense
   * — that density is what lets component stores be arrays rather than maps.
   *
   * @throws if every index is either live or retired.
   */
  create(): EntityId {
    const recycled = this.free.pop();
    if (recycled !== undefined) {
      const generation = this.generationAt(recycled);
      this.alive[recycled] = true;
      this.liveEntityCount += 1;
      return pack(recycled, generation);
    }

    const index = this.generations.length;
    if (index > MAX_INDEX) {
      throw new Error(
        `EntityAllocator: index space exhausted (${String(MAX_INDEX + 1)} indices, ` +
          `${String(this.retiredIndexCount)} retired by generation exhaustion)`,
      );
    }
    this.generations.push(1);
    this.alive.push(true);
    this.liveEntityCount += 1;
    return pack(index, 1);
  }

  /**
   * Destroys the entity a handle names.
   *
   * Returns `false` for a handle that is not live — already destroyed, from an
   * older generation of the same index, or {@link NULL_ENTITY}. Returning
   * rather than throwing is deliberate: double-destroy is a normal race
   * between two systems reacting to the same event in one tick, and `04` §4.4
   * makes that shape common. A caller that *needs* it to be an error can check
   * the return value; one that does not, does not have to guard every call.
   */
  destroy(entity: EntityId): boolean {
    if (!this.isLive(entity)) return false;

    const index = indexOf(entity);
    this.alive[index] = false;
    this.liveEntityCount -= 1;

    const generation = this.generationAt(index);
    if (generation >= MAX_GENERATION) {
      // Retired, not wrapped. See the module comment.
      this.retiredIndexCount += 1;
      return true;
    }
    this.generations[index] = generation + 1;
    this.free.push(index);
    return true;
  }

  /**
   * Whether a handle names a currently live entity.
   *
   * The generation comparison is the whole point: an index can be live while
   * *this* handle to it is stale.
   */
  isLive(entity: EntityId): boolean {
    const index = indexOf(entity);
    const generation = generationOf(entity);
    if (generation === 0) return false;
    return this.alive[index] === true && this.generations[index] === generation;
  }

  /**
   * Live entities in ascending index order.
   *
   * Cost is O(`capacity`), not O(`liveCount`) — a scan of the index range,
   * skipping dead slots. That is the right trade here (no per-entity bookkeeping
   * to keep sorted, and the dense index space keeps the two close), and it is
   * explicitly *not* where the ECS's performance criterion lives: BL-059's
   * cached queries carry the 10,000 x 6 ≤ 0.15 ms budget, and they are the
   * thing systems will actually iterate.
   */
  *liveEntities(): IterableIterator<EntityId> {
    for (let index = 0; index < this.generations.length; index += 1) {
      if (this.alive[index] === true) {
        yield pack(index, this.generationAt(index));
      }
    }
  }
}
