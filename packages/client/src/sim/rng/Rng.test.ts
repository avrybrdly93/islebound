/**
 * BL-005's first acceptance criterion: bit-exact `mulberry32` output against a
 * committed fixture, and the 32-bit discipline that keeps it exact.
 *
 * The named-stream independence criterion, and the derived helpers built on
 * top of the generator, are in `Rng.streams.test.ts`; the fixture seed and the
 * chi-square helpers both files use are in `Rng.testFixtures.ts`. Split by
 * BL-069 to get under the 500-line hard limit.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { nextFloat, nextInt, nextU32, rngFromSeed, type RngState } from '@sim/rng/Rng';
import { WORLD_SEED, at, digestOf, take } from '@sim/rng/Rng.testFixtures';

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
