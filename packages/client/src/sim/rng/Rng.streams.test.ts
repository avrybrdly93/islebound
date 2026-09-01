/**
 * BL-005's second acceptance criterion: independence of named streams under a
 * chi-square test with its critical values stated rather than eyeballed. Plus
 * the helpers derived from the raw generator — `nextRange`, `chance`, `pick`
 * and `shuffle` — whose bias is the thing worth testing about them.
 *
 * The bit-exact fixture and the 32-bit discipline are in `Rng.test.ts`; the
 * fixture seed and the chi-square helpers both files use are in
 * `Rng.testFixtures.ts`. Split by BL-069 to get under the 500-line hard limit.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  chance,
  nextInt,
  nextRange,
  pick,
  rngFor,
  rngFromSeed,
  shuffle,
  streamSeed,
} from '@sim/rng/Rng';
import {
  EMPTY,
  WORLD_SEED,
  digestOf,
  independenceChiSquare,
  take,
  uniformityChiSquare,
} from '@sim/rng/Rng.testFixtures';

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
