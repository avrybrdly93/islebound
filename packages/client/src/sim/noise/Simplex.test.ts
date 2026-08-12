/**
 * BL-054. Two acceptance criteria: output matches golden fixtures, and range
 * and mean are measured and documented rather than assumed.
 *
 * **What a golden fixture can and cannot prove**, stated here because it is the
 * same limit `Rng.test.ts` records and the same one it is tempting to overstate.
 * A digest committed from this implementation's own output is a *regression*
 * fixture: it proves the field has not moved since the day it was recorded, on
 * any engine that runs this file. It is not an independent oracle, and no
 * amount of it would catch simplex having been implemented wrongly on day one.
 *
 * So the fixture is paired with checks that do not consult the implementation:
 * identities fbm and ridge must satisfy by construction (`§ Identities`),
 * continuity across simplex boundaries — the failure that a wrong falloff
 * constant produces and that a digest happily blesses — and the measured
 * distribution, whose expected shape comes from what simplex is rather than
 * from what this file computed.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createNoiseField,
  fbm2D,
  fbm3D,
  noise2D,
  noise3D,
  ridge2D,
  ridge3D,
  type NoiseField,
} from '@sim/noise/Simplex';

/** `12` §1: the shipped island's seed, 'HALC'. The fixture seed, as in `Rng.test.ts`. */
const WORLD_SEED = 0x48414c43;

/**
 * FNV-1a over the comma-separated decimal serialisation of a sequence.
 *
 * Written out here rather than imported from `core/math/hash`, for the reason
 * `Rng.test.ts` gives: a fixture that depends on the code under test's own
 * dependencies is one a change to those dependencies can silently redefine
 * instead of failing.
 */
function digestOf(values: Iterable<number>): string {
  let h = 0x811c9dc5 >>> 0;
  const encoder = new TextEncoder();
  let first = true;
  for (const value of values) {
    const text = (first ? '' : ',') + String(value);
    first = false;
    for (const byte of encoder.encode(text)) {
      h ^= byte;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h.toString(16).padStart(8, '0');
}

/** A deterministic irrational-ish walk, so samples never land on lattice points. */
function* grid2D(field: NoiseField, n: number): Generator<number> {
  for (let i = 0; i < n; i++) {
    yield noise2D(field, (i % 97) * 0.137, Math.floor(i / 97) * 0.211);
  }
}

function* grid3D(field: NoiseField, n: number): Generator<number> {
  for (let i = 0; i < n; i++) {
    yield noise3D(field, (i % 97) * 0.137, Math.floor(i / 97) * 0.211, (i % 31) * 0.317);
  }
}

interface Stats {
  readonly min: number;
  readonly max: number;
  readonly mean: number;
}

function statsOf(sample: (i: number) => number, n: number): Stats {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const value = sample(i);
    if (value < min) min = value;
    if (value > max) max = value;
    sum += value;
  }
  return { min, max, mean: sum / n };
}

/** The 400×400 lattice the measurements below are taken over. */
const SIDE = 400;
const SAMPLES = SIDE * SIDE;
const sampleX = (i: number): number => (i % SIDE) * 0.137;
const sampleY = (i: number): number => Math.floor(i / SIDE) * 0.137;
const sampleZ = (i: number): number => (i % 97) * 0.211;

describe('createNoiseField', () => {
  it('is deterministic for a seed, and different across seeds', () => {
    const a = createNoiseField(WORLD_SEED);
    const b = createNoiseField(WORLD_SEED);
    const other = createNoiseField(WORLD_SEED + 1);

    assert.deepEqual([...a.perm], [...b.perm]);
    assert.notDeepEqual([...a.perm], [...other.perm]);
  });

  it('gives independent fields to different purposes', () => {
    // Terrain, caves and moisture each want a field; sharing one lattice would
    // correlate them, which is the artefact `createNoiseField`'s `purpose`
    // parameter exists to avoid.
    const terrain = createNoiseField(WORLD_SEED, 'terrain');
    const caves = createNoiseField(WORLD_SEED, 'caves');
    assert.notDeepEqual([...terrain.perm], [...caves.perm]);
  });

  it('builds a genuine permutation, repeated to 512', () => {
    // A table with a duplicate would still produce plausible-looking noise
    // while biasing which gradients appear -- the failure mode a visual check
    // cannot see.
    const { perm, permMod12 } = createNoiseField(WORLD_SEED);
    assert.equal(perm.length, 512);
    assert.equal(new Set(perm.slice(0, 256)).size, 256);
    for (let i = 0; i < 256; i++) {
      assert.equal(perm[i], perm[i + 256]);
      assert.equal(permMod12[i], (perm[i] ?? 0) % 12);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Golden fixtures                                                      */
/* ------------------------------------------------------------------ */

describe('golden fixtures', () => {
  const field = createNoiseField(WORLD_SEED);

  it('reproduces the 10,000-sample 2D digest', () => {
    assert.equal(digestOf(grid2D(field, 10_000)), 'deec0205');
  });

  it('reproduces the 10,000-sample 3D digest', () => {
    assert.equal(digestOf(grid3D(field, 10_000)), '455c3fc4');
  });

  it('reproduces spot values, so a digest failure has somewhere to start', () => {
    // A digest tells you something moved and nothing about where. These give a
    // failing run actual numbers to compare against.
    //
    // None of them is at a half-integer along every axis. `noise2D(0.5, 0.5)`
    // and `noise3D(0.5, 0.5, 0.5)` are both exactly 0 -- a real value, and a
    // useless spot check, since an implementation that returned 0 for
    // everything would pass it.
    assert.equal(noise2D(field, 0.137, 0.211), -0.5326345964107445);
    assert.equal(noise2D(field, 12.25, -7.75), 0.24551569364037543);
    assert.equal(noise2D(field, -100.5, 55.25), 0.03176508179410246);
    assert.equal(noise3D(field, 0.137, 0.211, 0.317), 0.7534337991558251);
    assert.equal(noise3D(field, 12.25, -7.75, 3.125), -0.019350171560907972);
    assert.equal(noise3D(field, -40.5, 8.25, -3.75), 0.4277562499999972);
  });

  it('reproduces the fractal digests', () => {
    assert.equal(
      digestOf(
        (function* () {
          for (let i = 0; i < 4000; i++) {
            yield fbm2D(field, (i % 61) * 0.137, Math.floor(i / 61) * 0.211);
          }
        })(),
      ),
      'a7a0d9cf',
    );
    assert.equal(
      digestOf(
        (function* () {
          for (let i = 0; i < 4000; i++) {
            yield ridge2D(field, (i % 61) * 0.137, Math.floor(i / 61) * 0.211);
          }
        })(),
      ),
      'd340126b',
    );
  });
});

/* ------------------------------------------------------------------ */
/* Identities — checks that do not consult the implementation           */
/* ------------------------------------------------------------------ */

describe('identities fbm and ridge must satisfy by construction', () => {
  const field = createNoiseField(WORLD_SEED);

  it('one octave of fbm is exactly one sample of the base noise', () => {
    // With octaves = 1 the amplitude sum is 1, so the normalisation must be a
    // no-op. This is the check that catches a fixed divisor: the common
    // shortcut divides by a constant and makes fbm quietly not equal its own
    // base case.
    for (const [x, y] of [
      [0.3, 0.7],
      [12.25, -7.75],
      [-100.5, 55.25],
    ] as const) {
      assert.equal(fbm2D(field, x, y, { octaves: 1 }), noise2D(field, x, y));
      assert.equal(fbm3D(field, x, y, 0.5, { octaves: 1 }), noise3D(field, x, y, 0.5));
    }
  });

  it('zero persistence collapses fbm to its first octave, whatever the octave count', () => {
    // Independent of the one above: it exercises the amplitude sum with several
    // terms, all but one of which are zero. A normalisation that divided by the
    // octave count rather than by the amplitude sum passes the previous test
    // and fails this one.
    assert.equal(fbm2D(field, 0.3, 0.7, { octaves: 6, persistence: 0 }), noise2D(field, 0.3, 0.7));
  });

  it('one octave of ridge is exactly (1 - |n|)^2', () => {
    for (const [x, y] of [
      [0.3, 0.7],
      [12.25, -7.75],
    ] as const) {
      const folded = 1 - Math.abs(noise2D(field, x, y));
      assert.equal(ridge2D(field, x, y, { octaves: 1 }), folded * folded);
    }
  });

  it('rejects an octave count that is not a positive integer', () => {
    assert.throws(() => fbm2D(field, 0, 0, { octaves: 0 }), RangeError);
    assert.throws(() => fbm2D(field, 0, 0, { octaves: 2.5 }), RangeError);
    assert.throws(() => ridge3D(field, 0, 0, 0, { octaves: -1 }), RangeError);
  });
});

describe('continuity across simplex boundaries', () => {
  const field = createNoiseField(WORLD_SEED);

  /** Worst |Δn| per unit of x, over a fixed sample set, at one step size. */
  function worstSlope(step: number): number {
    let worst = 0;
    for (let i = 0; i < 100_000; i++) {
      const x = (i % 449) * 0.0233;
      const y = Math.floor(i / 449) * 0.0311;
      const jump = Math.abs(noise2D(field, x + step, y) - noise2D(field, x, y));
      if (jump > worst) worst = jump;
    }
    return worst / step;
  }

  it('has a worst slope that does not grow as the step shrinks', () => {
    // The failure this exists for: a wrong falloff constant leaves a corner's
    // contribution non-zero where the neighbouring simplex takes over, and the
    // field steps discontinuously across the boundary. Terrain shows it as
    // creases. A golden digest blesses it happily, because the discontinuous
    // field is perfectly reproducible.
    //
    // A bound on the raw jump would not catch it -- and the first version of
    // this test, which asserted one, did not: with the 2D falloff perturbed
    // from 0.5 to 0.6 the worst jump over a 0.01 step is 0.147, comfortably
    // inside any bound loose enough to pass the correct field.
    //
    // What separates them is how the worst *slope* behaves as the step shrinks.
    // A continuous field is locally Lipschitz, so |Δn|/Δx converges to its
    // largest gradient and stops moving. A discontinuity is a fixed jump
    // divided by a shrinking step, so it grows about tenfold per decade.
    // Measured, seed 'HALC', 100k samples:
    //
    //   step      correct    falloff perturbed to 0.6
    //   1e-3      6.4455     22.02
    //   1e-4      6.4463     110.03
    //   ratio     1.0001     5.00
    //
    // 1.5 sits an order of magnitude away from both.
    const coarse = worstSlope(1e-3);
    const fine = worstSlope(1e-4);
    assert.ok(
      fine / coarse < 1.5,
      `worst slope grew from ${coarse} to ${fine} as the step shrank tenfold, ` +
        'which is what a discontinuity across a simplex boundary looks like',
    );
  });
});

/* ------------------------------------------------------------------ */
/* Measured range and mean — the second acceptance criterion            */
/* ------------------------------------------------------------------ */

describe('measured output range and mean', () => {
  const field = createNoiseField(WORLD_SEED);

  /**
   * Measured over 160,000 samples on a 400×400 lattice at 0.137 spacing, seed
   * 'HALC', Node v22 (see `34_DEVELOPMENT_LOG.md` for the run):
   *
   * | field   | min    | max    | mean      |
   * |---------|--------|--------|-----------|
   * | noise2D | -0.998 |  0.998 | -0.00049  |
   * | noise3D | -0.973 |  0.974 | -0.0016   |
   * | fbm2D   | -0.861 |  0.854 | -0.00041  |
   * | fbm3D   | -0.823 |  0.841 | -0.0011   |
   * | ridge2D |  0.0085|  1.000 |  0.421    |
   * | ridge3D |  0.022 |  1.000 |  0.476    |
   *
   * Two things in that table are worth a caller's attention and are the reason
   * it is documented rather than assumed:
   *
   * **The base range is close to ±1 but is not ±1, and is not guaranteed to
   * be.** The scale constants are empirical. Code that needs a hard bound must
   * clamp.
   *
   * **fbm is materially narrower than its base noise** — about ±0.86 against
   * ±1.0 — because octaves rarely peak together while the normaliser divides by
   * the worst case. Terrain scaled as though fbm reached ±1 comes out about 15%
   * flatter than intended.
   *
   * The assertions below bracket the measured values loosely enough to survive
   * a different engine's floating point and tightly enough that a scaling or
   * normalisation change fails them.
   */
  it('measures the base noise range and a mean near zero', () => {
    const two = statsOf((i) => noise2D(field, sampleX(i), sampleY(i)), SAMPLES);
    assert.ok(two.min > -1.02 && two.min < -0.9, `noise2D min ${two.min}`);
    assert.ok(two.max < 1.02 && two.max > 0.9, `noise2D max ${two.max}`);
    assert.ok(Math.abs(two.mean) < 0.01, `noise2D mean ${two.mean}`);

    const three = statsOf((i) => noise3D(field, sampleX(i), sampleY(i), sampleZ(i)), SAMPLES);
    assert.ok(three.min > -1.02 && three.min < -0.9, `noise3D min ${three.min}`);
    assert.ok(three.max < 1.02 && three.max > 0.9, `noise3D max ${three.max}`);
    assert.ok(Math.abs(three.mean) < 0.01, `noise3D mean ${three.mean}`);
  });

  it('measures fbm as narrower than its base noise, which is the documented surprise', () => {
    const two = statsOf((i) => fbm2D(field, sampleX(i), sampleY(i)), SAMPLES);
    assert.ok(two.max < 0.95, `fbm2D max ${two.max} — expected well inside ±1`);
    assert.ok(two.max > 0.7, `fbm2D max ${two.max}`);
    assert.ok(two.min > -0.95 && two.min < -0.7, `fbm2D min ${two.min}`);
    assert.ok(Math.abs(two.mean) < 0.01, `fbm2D mean ${two.mean}`);

    const three = statsOf((i) => fbm3D(field, sampleX(i), sampleY(i), sampleZ(i)), SAMPLES);
    assert.ok(three.max < 0.95 && three.max > 0.7, `fbm3D max ${three.max}`);
    assert.ok(three.min > -0.95 && three.min < -0.7, `fbm3D min ${three.min}`);
    assert.ok(Math.abs(three.mean) < 0.01, `fbm3D mean ${three.mean}`);
  });

  it('measures ridge inside [0, 1] with a mean around 0.42-0.48', () => {
    // The different range from everything else here is deliberate: a ridge
    // field is a height mask. See `ridge2D`'s doc comment.
    const two = statsOf((i) => ridge2D(field, sampleX(i), sampleY(i)), SAMPLES);
    assert.ok(two.min >= 0, `ridge2D min ${two.min}`);
    assert.ok(two.max <= 1, `ridge2D max ${two.max}`);
    assert.ok(two.mean > 0.35 && two.mean < 0.5, `ridge2D mean ${two.mean}`);

    const three = statsOf((i) => ridge3D(field, sampleX(i), sampleY(i), sampleZ(i)), SAMPLES);
    assert.ok(three.min >= 0, `ridge3D min ${three.min}`);
    assert.ok(three.max <= 1, `ridge3D max ${three.max}`);
    assert.ok(three.mean > 0.35 && three.mean < 0.55, `ridge3D mean ${three.mean}`);
  });
});
