import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { type ComponentDef, defineComponent } from '@sim/ecs/ComponentDef';
import { ComponentRegistry } from '@sim/ecs/ComponentRegistry';
import { EntityAllocator } from '@sim/ecs/EntityAllocator';
import { QueryCache, SIGNATURE_LIMIT, type AnyComponentDef } from '@sim/ecs/Query';

/**
 * BL-063: the signature limit, which is the *check* half of that item's first
 * acceptance criterion.
 *
 * **A separate file rather than more cases in `Query.test.ts`, and that is the
 * `max-lines` rule working as designed.** BL-069 left that file at 499 lines
 * against a 500-line hard limit and recorded the prediction verbatim: *"the
 * next case anybody adds now fails lint, which is the rule working, and the
 * failure says what to do."* This is the next case. Split at the seam BL-063
 * creates rather than by cutting the existing file, since the limit is a
 * different concern from the intersection semantics that file grades.
 *
 * **What is worth testing here is that the check can fail.** A limit nothing
 * ever reaches is indistinguishable from no limit at all, so the cases below
 * drive the cache past it deliberately, and one of them pins the boundary from
 * *below* — 64 distinct signatures must be accepted, or the limit is off by one
 * in the direction that breaks a legitimate build.
 */

/** Enough distinct defs to build more signatures than the limit allows. */
const DEFS: readonly ComponentDef<number>[] = Array.from(
  { length: SIGNATURE_LIMIT + 8 },
  (_unused, i) => defineComponent<number>(`Limit${String(i)}`),
);

function anyDef<T>(def: ComponentDef<T>): AnyComponentDef {
  return def as unknown as AnyComponentDef;
}

function freshCache(): QueryCache {
  const allocator = new EntityAllocator();
  return new QueryCache(allocator, new ComponentRegistry(allocator));
}

/** Issues `count` pairwise-distinct single-def queries against `cache`. */
function querySignatures(cache: QueryCache, count: number): void {
  for (let i = 0; i < count; i += 1) {
    const def = DEFS[i];
    assert.ok(def !== undefined, `fixture is too small for ${String(count)} signatures`);
    cache.query(anyDef(def));
  }
}

describe('QueryCache signature limit (BL-063)', () => {
  it('accepts exactly SIGNATURE_LIMIT distinct signatures', () => {
    // The boundary from below. An off-by-one here refuses a build that is
    // within its stated budget, which is worse than the unbounded map this
    // item started from -- it turns a documented rule into a crash.
    const cache = freshCache();
    querySignatures(cache, SIGNATURE_LIMIT);
    assert.equal(cache.size, SIGNATURE_LIMIT);
  });

  it('refuses the one after that, rather than growing silently', () => {
    const cache = freshCache();
    querySignatures(cache, SIGNATURE_LIMIT);

    const overflow = DEFS[SIGNATURE_LIMIT];
    assert.ok(overflow !== undefined);
    assert.throws(
      () => cache.query(anyDef(overflow)),
      /refusing a 65th distinct query signature/,
      'a new signature past the limit must throw; the whole point of the limit is that it fires',
    );
  });

  it('says what went wrong and what to do about it', () => {
    // The message is the entire user interface of this check. A bare "limit
    // exceeded" would leave the reader to rediscover BL-063's reasoning from
    // scratch, at the moment they are least inclined to.
    const cache = freshCache();
    querySignatures(cache, SIGNATURE_LIMIT);
    const overflow = DEFS[SIGNATURE_LIMIT];
    assert.ok(overflow !== undefined);

    let message = '';
    try {
      cache.query(anyDef(overflow));
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    assert.match(message, /statically-known/, 'must state the rule that was broken');
    assert.match(message, /SIGNATURE_LIMIT/, 'must name the constant to raise');
    assert.match(message, /BL-063/, 'must cite the item that decided this');
    assert.match(message, /built from data/, 'must name the likely cause');
  });

  it('leaves the cache usable after a refusal', () => {
    // A throw mid-`query` must not have half-registered the signature it
    // refused, or the limit would corrupt the very cache it protects. The
    // refused query is retried and must still throw -- not succeed because a
    // partial entry from the first attempt is now serving it.
    const cache = freshCache();
    querySignatures(cache, SIGNATURE_LIMIT);
    const overflow = DEFS[SIGNATURE_LIMIT];
    const existing = DEFS[0];
    assert.ok(overflow !== undefined && existing !== undefined);

    assert.throws(() => cache.query(anyDef(overflow)));
    assert.equal(cache.size, SIGNATURE_LIMIT, 'a refused query must not add an entry');
    assert.throws(() => cache.query(anyDef(overflow)), /refusing/);
    assert.equal(cache.size, SIGNATURE_LIMIT);

    assert.deepEqual(
      cache.query(anyDef(existing)),
      [],
      'an already-cached signature must still answer after a refusal',
    );
    assert.equal(cache.size, SIGNATURE_LIMIT);
  });

  it('does not count re-queries, reorderings or repeats towards the limit', () => {
    // The limit counts *distinct signatures*, and the signature is
    // order-independent and de-duplicated. If it accidentally counted calls,
    // a single system querying every tick would exhaust it in two seconds.
    const cache = freshCache();
    const a = DEFS[0];
    const b = DEFS[1];
    assert.ok(a !== undefined && b !== undefined);

    for (let i = 0; i < SIGNATURE_LIMIT * 4; i += 1) {
      cache.query(anyDef(a), anyDef(b));
      cache.query(anyDef(b), anyDef(a));
      cache.query(anyDef(a), anyDef(a), anyDef(b));
    }

    assert.equal(cache.size, 1, 'all three spellings are one signature');
  });

  it('is a per-cache limit, so one world does not consume the budget of another', () => {
    // The lifetime argument this item turned on: one QueryCache per World,
    // dying with it. If the count were module-level state, a long-running
    // client that created and discarded worlds would trip the limit on a
    // perfectly static system list -- and module-level mutable state is
    // separately forbidden under `sim/`.
    const first = freshCache();
    querySignatures(first, SIGNATURE_LIMIT);
    assert.equal(first.size, SIGNATURE_LIMIT);

    const second = freshCache();
    querySignatures(second, SIGNATURE_LIMIT);
    assert.equal(second.size, SIGNATURE_LIMIT, 'a fresh cache starts with a fresh budget');
  });

  it('leaves a static workload nowhere near the limit', () => {
    // The claim behind choosing a limit over eviction: a build whose systems
    // are a fixed list produces a handful of signatures. `05` §1 lists
    // thirteen system files; this stands in for all of them at four queries
    // each and must sit far enough below 64 that the limit is a tripwire for a
    // design error rather than a capacity anyone plans around.
    const cache = freshCache();
    querySignatures(cache, 13 * 4);
    assert.ok(
      cache.size < SIGNATURE_LIMIT,
      `a fully populated static system list used ${String(cache.size)} of ${String(
        SIGNATURE_LIMIT,
      )} signatures`,
    );
  });
});
