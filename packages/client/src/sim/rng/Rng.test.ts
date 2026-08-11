/**
 * BL-005. Two acceptance criteria drive most of this file: bit-exact output
 * against a committed fixture, and independence of named streams under a
 * chi-square test with its critical values stated rather than eyeballed.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  chance,
  nextFloat,
  nextInt,
  nextRange,
  nextU32,
  pick,
  rngFor,
  rngFromSeed,
  shuffle,
  streamSeed,
  type RngState,
} from '@sim/rng/Rng';

/** `12` §1: the shipped island's seed, 'HALC'. Used here as the fixture seed. */
const WORLD_SEED = 0x48414c43;

/**
 * FNV-1a over the comma-separated decimal serialisation of a sequence.
 *
 * The fixture is 10,000 values and this file is not the place for 10,000
 * literals. A digest keeps the assertion exact — one changed bit anywhere in
 * the sequence changes it — while staying one line, and the four spot values
 * below give a failure somewhere to start reading. Written out here rather
 * than imported from `core/math/hash` on purpose: the fixture must be
 * independent of the code under test's own dependencies, or a change to the
 * hash helpers would silently redefine the fixture instead of failing.
 */
function digestOf(values: Iterable<number>): string {
  let h = 0x811c9dc5 >>> 0;
  for (const value of values) {
    for (const ch of String(value)) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= 44; // ','
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function take(rng: RngState, n: number): Uint32Array {
  // A typed array, not `number[]`: every counter and sequence in this file is
  // one, because `noUncheckedIndexedAccess` types a plain array's element as
  // `T | undefined` and the project bans the `!` that would paper over it.
  // Typed-array indexing is `number`, so the reads below need no assertion.
  const out = new Uint32Array(n);
  for (let i = 0; i < n; i++) out[i] = nextU32(rng);
  return out;
}

const EMPTY = new Uint8Array(0);

/**
 * Reads element `i` of a typed array as a number.
 *
 * `noUncheckedIndexedAccess` types a typed array's element as
 * `number | undefined` just as it does a plain array's, and the project bans
 * the `!` that would dismiss it. Every index below is in bounds by
 * construction (a bucket index is a draw from `[0, bins)`), so `?? 0` is
 * unreachable rather than a fallback that hides a bug — and if it ever were
 * reached, contributing 0 to a count is the answer that makes the statistic
 * fail loudly rather than throw.
 */
function at(array: Int32Array | Uint8Array, i: number): number {
  return array[i] ?? 0;
}

/** Chi-square goodness-of-fit of `values` against a uniform over `bins` categories. */
function uniformityChiSquare(values: Uint8Array, bins: number): number {
  const counts = new Int32Array(bins);
  for (const v of values) counts[v] = at(counts, v) + 1;
  const expected = values.length / bins;
  let chi2 = 0;
  for (const count of counts) chi2 += (count - expected) ** 2 / expected;
  return chi2;
}

/**
 * Chi-square test of independence over the `bins` x `bins` contingency table
 * of two equal-length sample vectors. The table is a flat `Int32Array` indexed
 * `row * bins + col` rather than an array of arrays, which keeps the nesting
 * inside the project's max-depth of 3 and needs no index assertions.
 */
function independenceChiSquare(a: Uint8Array, b: Uint8Array, bins: number): number {
  const n = a.length;
  const table = new Int32Array(bins * bins);
  for (let i = 0; i < n; i++) {
    const cell = at(a, i) * bins + at(b, i);
    table[cell] = at(table, cell) + 1;
  }

  const rowSums = new Int32Array(bins);
  const colSums = new Int32Array(bins);
  for (let i = 0; i < bins; i++) {
    for (let j = 0; j < bins; j++) {
      const count = at(table, i * bins + j);
      rowSums[i] = at(rowSums, i) + count;
      colSums[j] = at(colSums, j) + count;
    }
  }

  let chi2 = 0;
  for (let i = 0; i < bins; i++) {
    for (let j = 0; j < bins; j++) {
      const expected = (at(rowSums, i) * at(colSums, j)) / n;
      if (expected > 0) chi2 += (at(table, i * bins + j) - expected) ** 2 / expected;
    }
  }
  return chi2;
}

describe('mulberry32: the committed fixture', () => {
  /**
   * The 10,000-value fixture of BL-005's first acceptance criterion.
   *
   * Produced by a standalone transcription of mulberry32 that imports nothing
   * from this repository, then confirmed byte-identical in Chromium 141 — see
   * `34_DEVELOPMENT_LOG.md` for the run. Both are V8 builds, which is what the
   * criterion literally asks for ("Node and browser") and is *not* evidence
   * about a non-V8 engine; the argument covering those is that every operation
   * in the recurrence is exactly specified by ECMA-262, which is written out
   * in `Rng.ts`'s header.
   */
  const FIXTURE_DIGEST = '9b901c2e';

  it('reproduces the fixture digest for 10,000 draws from the world seed', () => {
    const values = take(rngFromSeed(WORLD_SEED), 10_000);
    assert.equal(values.length, 10_000);
    assert.equal(digestOf(values), FIXTURE_DIGEST);
  });

  it('matches the fixture at its ends, so a digest failure has somewhere to start', () => {
    const values = take(rngFromSeed(WORLD_SEED), 10_000);
    assert.equal(values[0], 2357172937);
    assert.equal(values[1], 552596478);
    assert.equal(values[9998], 2212080586);
    assert.equal(values[9999], 3939453027);
  });

  it('the digest is sensitive to a single changed value, or it proves nothing', () => {
    const values = take(rngFromSeed(WORLD_SEED), 10_000);
    const tampered = Uint32Array.from(values);
    tampered[5000] = (tampered[5000] ?? 0) ^ 1;
    assert.notEqual(digestOf(tampered), FIXTURE_DIGEST);
  });

  it('a different seed gives a different sequence', () => {
    assert.notEqual(
      digestOf(take(rngFromSeed(WORLD_SEED + 1), 1000)),
      digestOf(take(rngFromSeed(WORLD_SEED), 1000)),
    );
  });
});

describe('mulberry32: the 32-bit discipline', () => {
  it('every output is a uint32', () => {
    const rng = rngFromSeed(1);
    for (let i = 0; i < 5000; i++) {
      const v = nextU32(rng);
      assert.ok(Number.isInteger(v), `not an integer: ${v}`);
      assert.ok(v >= 0 && v < 4294967296, `out of range: ${v}`);
    }
  });

  it('the state stays a uint32 across the wrap', () => {
    // Seeded just below 2^32 so the very first `s + increment` overflows: the
    // case a missing `>>> 0` would carry into the double range and never
    // recover.
    const rng = rngFromSeed(0xffffffff);
    for (let i = 0; i < 100; i++) {
      nextU32(rng);
      assert.ok(
        Number.isInteger(rng.s) && rng.s >= 0 && rng.s < 4294967296,
        `state escaped: ${rng.s}`,
      );
    }
  });

  it('a negative or oversized seed is normalised to a uint32 rather than rejected', () => {
    assert.equal(rngFromSeed(-1).s, 0xffffffff);
    assert.equal(rngFromSeed(0x1_0000_0000).s, 0);
    assert.equal(digestOf(take(rngFromSeed(-1), 32)), digestOf(take(rngFromSeed(0xffffffff), 32)));
  });

  it('state is caller-owned, so a snapshot replays exactly', () => {
    const rng = rngFromSeed(WORLD_SEED);
    take(rng, 17);
    const snapshot: RngState = { ...rng };
    const after = take(rng, 50);
    assert.deepEqual(take(snapshot, 50), after);
  });
});

describe('nextFloat', () => {
  it('stays inside [0, 1) over a long run', () => {
    const rng = rngFromSeed(7);
    for (let i = 0; i < 20_000; i++) {
      const v = nextFloat(rng);
      assert.ok(v >= 0 && v < 1, `out of [0,1): ${v}`);
    }
  });

  it('is exactly the uint32 over 2^32, with no rounding', () => {
    const a = rngFromSeed(99);
    const b = rngFromSeed(99);
    for (let i = 0; i < 100; i++) {
      assert.equal(nextFloat(a), nextU32(b) / 4294967296);
    }
  });

  it('has a mean near 1/2 over 100,000 draws', () => {
    const rng = rngFromSeed(3);
    let sum = 0;
    const n = 100_000;
    for (let i = 0; i < n; i++) sum += nextFloat(rng);
    // 4 standard errors of the mean of a uniform: 4 * sqrt(1/12/n) = 0.00365.
    assert.ok(Math.abs(sum / n - 0.5) < 0.00365, `mean ${sum / n}`);
  });
});

describe('nextInt', () => {
  it('stays within [min, max)', () => {
    const rng = rngFromSeed(11);
    for (let i = 0; i < 10_000; i++) {
      const v = nextInt(rng, -3, 7);
      assert.ok(Number.isInteger(v) && v >= -3 && v < 7, `out of range: ${v}`);
    }
  });

  it('covers both endpoints of a small range', () => {
    const rng = rngFromSeed(12);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(nextInt(rng, 0, 3));
    assert.deepEqual([...seen].sort(), [0, 1, 2]);
  });

  it('a single-value range consumes exactly one draw and returns it', () => {
    const rng = rngFromSeed(13);
    const before = rng.s;
    assert.equal(nextInt(rng, 5, 6), 5);
    assert.notEqual(rng.s, before);
  });

  it('rejects an empty range and non-integer bounds', () => {
    const rng = rngFromSeed(14);
    assert.throws(() => nextInt(rng, 3, 3), RangeError);
    assert.throws(() => nextInt(rng, 5, 2), RangeError);
    assert.throws(() => nextInt(rng, 0, 2.5), RangeError);
  });

  /**
   * The reason `nextInt` rejects rather than takes a modulo, measured on a
   * span chosen to make the difference impossible to miss.
   *
   * At the sizes this project actually draws — a loot table of 7, a variant
   * index of 3 — modulo bias is around one part in 6e8 and no test would ever
   * catch it. At `span = 0x60000000` it is enormous: 2^32 holds two whole
   * spans plus a remainder of 1073741824, so under a plain modulo the residues
   * below that remainder come up three times per period and the rest twice.
   * The fraction of results below the remainder is then 0.75 instead of the
   * correct 1073741824 / 1610612736 = 0.6667. Those are 8 percentage points
   * apart, which 200,000 draws separate decisively.
   */
  it('does not fold the ragged tail back in, which a modulo would', () => {
    const span = 0x60000000;
    const remainder = 4294967296 % span;
    const rng = rngFromSeed(31);
    const n = 200_000;
    let below = 0;
    for (let i = 0; i < n; i++) {
      const v = nextInt(rng, 0, span);
      assert.ok(v >= 0 && v < span, `out of range: ${v}`);
      if (v < remainder) below += 1;
    }
    const fraction = below / n;
    const unbiased = remainder / span;
    // 4 standard errors of a proportion at n = 200,000 is 0.0042; the modulo
    // answer sits 0.083 away, twenty times further.
    assert.ok(
      Math.abs(fraction - unbiased) < 0.0042,
      `fraction below the remainder was ${fraction}; unbiased is ${unbiased}, a modulo would give 0.75`,
    );
  });

  it('is uniform over 10 buckets by chi-square', () => {
    const rng = rngFromSeed(15);
    const buckets = new Int32Array(10);
    const n = 100_000;
    for (let i = 0; i < n; i++) {
      const bucket = nextInt(rng, 0, 10);
      buckets[bucket] = at(buckets, bucket) + 1;
    }
    const expected = n / 10;
    let chi2 = 0;
    for (const count of buckets) chi2 += (count - expected) ** 2 / expected;
    // 9 degrees of freedom, upper 0.1% critical value 27.877.
    assert.ok(chi2 < 27.877, `chi-square ${chi2} on 9 df exceeds the 0.1% critical value`);
  });
});

describe('nextRange, chance, pick, shuffle', () => {
  it('nextRange stays within [min, max) including a negative span', () => {
    const rng = rngFromSeed(21);
    for (let i = 0; i < 5000; i++) {
      const v = nextRange(rng, -2.5, 4.5);
      assert.ok(v >= -2.5 && v < 4.5, `out of range: ${v}`);
    }
  });

  it('chance short-circuits at 0 and 1 without consuming a draw', () => {
    // Determinism matters here: a probability a balance pass later sets to 0
    // must not shift every subsequent value in the stream.
    const rng = rngFromSeed(22);
    const before = rng.s;
    assert.equal(chance(rng, 0), false);
    assert.equal(chance(rng, -1), false);
    assert.equal(chance(rng, 1), true);
    assert.equal(chance(rng, 2), true);
    assert.equal(rng.s, before);
  });

  it('chance(p) fires at about rate p', () => {
    const rng = rngFromSeed(23);
    let hits = 0;
    const n = 50_000;
    for (let i = 0; i < n; i++) if (chance(rng, 0.25)) hits += 1;
    // 4 standard errors: 4 * sqrt(0.25*0.75/n) = 0.00775.
    assert.ok(Math.abs(hits / n - 0.25) < 0.00775, `rate ${hits / n}`);
  });

  it('pick returns members and rejects an empty array', () => {
    const rng = rngFromSeed(24);
    const items = ['a', 'b', 'c'] as const;
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(pick(rng, items));
    assert.deepEqual([...seen].sort(), ['a', 'b', 'c']);
    assert.throws(() => pick(rng, []), RangeError);
  });

  it('shuffle is a permutation and mutates in place', () => {
    const rng = rngFromSeed(25);
    const items = [0, 1, 2, 3, 4, 5, 6, 7];
    const returned = shuffle(rng, items);
    assert.equal(returned, items);
    assert.deepEqual(
      [...items].sort((a, b) => a - b),
      [0, 1, 2, 3, 4, 5, 6, 7],
    );
  });

  it('shuffle handles the degenerate lengths', () => {
    const rng = rngFromSeed(26);
    assert.deepEqual(shuffle(rng, []), []);
    assert.deepEqual(shuffle(rng, ['only']), ['only']);
  });

  /**
   * Uniformity of the permutation, not just of the elements. The upward-loop
   * variant of Fisher–Yates passes every test above and fails this one: it has
   * n^n equally likely paths onto n! outcomes, which do not divide.
   */
  it('shuffle produces all 24 permutations of 4 items at about equal rates', () => {
    const rng = rngFromSeed(27);
    const counts = new Map<string, number>();
    const trials = 48_000;
    for (let i = 0; i < trials; i++) {
      const key = shuffle(rng, [0, 1, 2, 3]).join('');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    assert.equal(counts.size, 24, 'every permutation should occur');
    const expected = trials / 24;
    let chi2 = 0;
    for (const count of counts.values()) chi2 += (count - expected) ** 2 / expected;
    // 23 degrees of freedom, upper 0.1% critical value 49.728.
    assert.ok(chi2 < 49.728, `chi-square ${chi2} on 23 df exceeds the 0.1% critical value`);
  });
});

describe('rngFor: named streams', () => {
  it('is deterministic in its name and coordinates', () => {
    assert.deepEqual(
      take(rngFor(WORLD_SEED, 'scatter', 3, 4), 20),
      take(rngFor(WORLD_SEED, 'scatter', 3, 4), 20),
    );
  });

  it('separates purposes, coordinates, coordinate order and world seed', () => {
    const base = digestOf(take(rngFor(WORLD_SEED, 'scatter', 1, 2), 200));
    assert.notEqual(digestOf(take(rngFor(WORLD_SEED, 'wildlife', 1, 2), 200)), base);
    assert.notEqual(digestOf(take(rngFor(WORLD_SEED, 'scatter', 1, 3), 200)), base);
    // Order matters, which is what makes (x, z) usable as a chunk key.
    assert.notEqual(digestOf(take(rngFor(WORLD_SEED, 'scatter', 2, 1), 200)), base);
    assert.notEqual(digestOf(take(rngFor(WORLD_SEED + 1, 'scatter', 1, 2), 200)), base);
  });

  it('a stream with no coordinates differs from the same name at (0)', () => {
    // Otherwise `rngFor(seed, 'worldgen')` and `rngFor(seed, 'worldgen', 0)`
    // would silently be the same stream.
    assert.notEqual(streamSeed(WORLD_SEED, 'worldgen'), streamSeed(WORLD_SEED, 'worldgen', 0));
  });

  it('rejects a non-integer coordinate rather than flooring it', () => {
    assert.throws(() => rngFor(WORLD_SEED, 'scatter', 1.5, 2), RangeError);
  });

  it('accepts negative chunk coordinates, which every island west of origin needs', () => {
    const a = take(rngFor(WORLD_SEED, 'scatter', -1, -1), 20);
    const b = take(rngFor(WORLD_SEED, 'scatter', 1, 1), 20);
    assert.notDeepEqual(a, b);
    assert.deepEqual(a, take(rngFor(WORLD_SEED, 'scatter', -1, -1), 20));
  });

  /**
   * `12` §"Runs in a Web Worker": chunks must be generatable "independently and
   * in any order". This is that property directly — draw a grid of chunks in
   * two different orders and require the per-chunk results to be identical.
   */
  it('chunk streams do not depend on the order chunks are generated in', () => {
    const coords: [number, number][] = [];
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) coords.push([x, z]);

    const forward = new Map<string, string>();
    for (const [x, z] of coords)
      forward.set(`${x},${z}`, digestOf(take(rngFor(WORLD_SEED, 'scatter', x, z), 64)));

    const reversed = new Map<string, string>();
    for (const [x, z] of [...coords].reverse()) {
      reversed.set(`${x},${z}`, digestOf(take(rngFor(WORLD_SEED, 'scatter', x, z), 64)));
    }

    assert.equal(forward.size, 25);
    for (const [key, value] of forward)
      assert.equal(reversed.get(key), value, `chunk ${key} differed`);
  });

  /**
   * BL-005's second acceptance criterion. Two things are tested, and only the
   * second is about independence: that each stream is itself uniform, and that
   * pairs of streams do not agree more often than chance.
   */
  it('named streams are uniform and mutually independent under chi-square', () => {
    const purposes = ['worldgen', 'wildlife', 'scatter', 'weather', 'fishing', 'loot'] as const;
    const draws = 60_000;
    const bins = 8;

    const samples = purposes.map((purpose) => {
      const rng = rngFor(WORLD_SEED, purpose);
      const values = new Uint8Array(draws);
      for (let i = 0; i < draws; i++) values[i] = nextInt(rng, 0, bins);
      return values;
    });

    // (a) Each stream uniform on its own: 7 df, upper 0.1% critical value 24.322.
    for (const [index, values] of samples.entries()) {
      const chi2 = uniformityChiSquare(values, bins);
      const name = purposes[index] ?? '?';
      assert.ok(
        chi2 < 24.322,
        `${name} chi-square ${String(chi2)} on 7 df exceeds the 0.1% critical value`,
      );
    }

    // (b) Each pair independent, by a chi-square test of independence on the
    // 8x8 contingency table: 49 df, upper 0.1% critical value 85.351.
    for (let a = 0; a < samples.length; a++) {
      for (let b = a + 1; b < samples.length; b++) {
        const chi2 = independenceChiSquare(samples[a] ?? EMPTY, samples[b] ?? EMPTY, bins);
        const pair = `${purposes[a] ?? '?'} vs ${purposes[b] ?? '?'}`;
        assert.ok(
          chi2 < 85.351,
          `${pair}: chi-square ${String(chi2)} on 49 df exceeds the 0.1% critical value`,
        );
      }
    }
  });

  /**
   * The negative control for the test above: two streams that are in fact the
   * same must fail the independence test it applies. Without this, a broken
   * derivation that returned one stream for every purpose would sail through.
   */
  it('the independence test rejects two identical streams', () => {
    const draws = 60_000;
    const bins = 8;
    const a = new Uint8Array(draws);
    const b = new Uint8Array(draws);
    const rngA = rngFor(WORLD_SEED, 'worldgen');
    const rngB = rngFor(WORLD_SEED, 'worldgen');
    for (let i = 0; i < draws; i++) {
      a[i] = nextInt(rngA, 0, bins);
      b[i] = nextInt(rngB, 0, bins);
    }
    const chi2 = independenceChiSquare(a, b, bins);
    assert.ok(
      chi2 > 85.351,
      `identical streams should fail independence, got chi-square ${String(chi2)}`,
    );
  });
});
