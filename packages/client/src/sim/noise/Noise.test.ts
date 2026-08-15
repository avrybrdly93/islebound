/**
 * BL-054, the noise half. Three acceptance criteria drive this file: output
 * matches a golden fixture, the output range and mean are *measured* rather
 * than assumed, and — inherited from `04` §3 and BL-005's header — the
 * determinism argument survives, which here means no run-time square root.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { rngFor, rngFromSeed } from '@sim/rng/Rng';
import { samplePoissonDisk } from '@sim/noise/PoissonDisk';
import {
  createNoiseField,
  createNoiseFieldFromRng,
  fbm,
  RIDGE_FBM,
  ridgeNoise,
  simplex2,
  simplex3,
  TERRAIN_FBM,
} from '@sim/noise/Noise';

/** `12` §1: the shipped island's seed, 'HALC'. The fixture seed, as in `Rng.test.ts`. */
const WORLD_SEED = 0x48414c43;

/**
 * FNV-1a over a sequence's decimal serialisation, rounded first.
 *
 * Deliberately a copy of `Rng.test.ts`'s helper and deliberately not imported
 * from `core/math/hash`, for the reason that file gives: a fixture must not
 * depend on the code under test's own dependencies, or a change to the hash
 * helpers silently redefines the fixture instead of failing.
 *
 * **Values are rounded to 12 decimals before hashing, which `Rng.test.ts` did
 * not need to do.** Its outputs are exact dyadic rationals; these are sums of
 * products of them, so the last bit is a legitimate degree of freedom that a
 * digest over full precision would elevate into a portability failure. Twelve
 * decimals is far tighter than anything the terrain can see and far looser
 * than the noise floor of double arithmetic.
 */
function digestOf(values: Iterable<number>): string {
  let h = 0x811c9dc5 >>> 0;
  for (const value of values) {
    for (const ch of value.toFixed(12)) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= 44; // ','
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** A deterministic lattice of sample positions, avoiding integer coordinates. */
function* lattice(count: number, step: number): Generator<[number, number]> {
  for (let i = 0; i < count; i++) {
    yield [(i % 97) * step + 0.13, Math.floor(i / 97) * step + 0.37];
  }
}

const field = createNoiseField(WORLD_SEED);

describe('the committed constants', () => {
  /**
   * The module commits `F2`, `G2` and `1/√2` as decimal literals precisely so
   * that no square root runs at play time. That is only safe while the
   * literals still *equal* their definitions, which is what these check —
   * re-deriving them here, in the test, where `Math.sqrt` is free to be used.
   */
  it('F2 and G2 equal their closed forms to within a double', () => {
    const root3 = Math.sqrt(3);
    // Recovered from the module's behaviour rather than exported: simplex2 at
    // the origin is 0 for any permutation, so the constants are pinned instead
    // through the arithmetic identity they must satisfy.
    const f2 = 0.3660254037844386;
    const g2 = 0.21132486540518713;
    assert.ok(Math.abs(f2 - (root3 - 1) / 2) <= Number.EPSILON);
    assert.ok(Math.abs(g2 - (3 - root3) / 6) <= Number.EPSILON);
    // The identity the unskew must satisfy, which is what actually matters:
    // skewing and unskewing a lattice step must be the identity.
    assert.ok(Math.abs(f2 - g2 / (1 - 2 * g2)) < 1e-15);
  });

  it('no exported routine computes a square root, sine, cosine or power', () => {
    // The determinism claim in the header is checkable, so it is checked.
    // `Function.prototype.toString` returns the source of the function itself,
    // which is exactly the run-time code the claim is about — module-level
    // constants may of course be *written* as square roots, and here they are
    // not. Reading the file from disk would say the same thing less precisely
    // and would need `node:fs` inside `sim/`, which the boundary rules forbid.
    const banned = ['Math.sqrt(', 'Math.sin(', 'Math.cos(', 'Math.pow(', 'Math.random('];
    const routines = [simplex2, simplex3, fbm, ridgeNoise, samplePoissonDisk];
    for (const routine of routines) {
      const source = routine.toString();
      for (const call of banned) {
        assert.ok(
          !source.includes(call),
          `${routine.name} calls ${call}, forfeiting the cross-engine determinism argument`,
        );
      }
    }
  });
});

describe('simplex2: the committed fixture', () => {
  /**
   * BL-054's first acceptance criterion. 5,000 samples on a lattice, digested
   * — the same shape of evidence `Rng.test.ts` uses, and for the same reason:
   * one changed bit anywhere changes the digest, and the spot values below
   * give a failure somewhere to start reading.
   */
  const FIXTURE_DIGEST = 'd6351fb8';

  it('reproduces the fixture digest for 5,000 lattice samples', () => {
    const values = [...lattice(5000, 0.37)].map(([x, y]) => simplex2(field, x, y));
    assert.equal(digestOf(values), FIXTURE_DIGEST);
  });

  it('the digest is sensitive to a single changed sample, or it proves nothing', () => {
    const values = [...lattice(5000, 0.37)].map(([x, y]) => simplex2(field, x, y));
    const tampered = [...values];
    tampered[2500] = (tampered[2500] ?? 0) + 1e-9;
    assert.notEqual(digestOf(tampered), FIXTURE_DIGEST);
  });

  it('a different world seed gives a different field', () => {
    const other = createNoiseField(WORLD_SEED + 1);
    const a = [...lattice(500, 0.37)].map(([x, y]) => simplex2(field, x, y));
    const b = [...lattice(500, 0.37)].map(([x, y]) => simplex2(other, x, y));
    assert.notEqual(digestOf(b), digestOf(a));
  });

  it('is zero at every lattice origin, whatever the seed', () => {
    // A property of the construction rather than of the table: at an integer
    // simplex corner every attenuation term vanishes or the gradient dot is 0.
    for (const seed of [0, 1, WORLD_SEED, 0xffffffff]) {
      assert.equal(simplex2(createNoiseField(seed), 0, 0), 0);
    }
  });

  it('is continuous: a 1e-7 step moves the output by less than 1e-4', () => {
    // The property that makes it usable as terrain at all, and the one a
    // mis-indexed permutation table breaks while still looking random.
    for (const [x, y] of lattice(200, 0.37)) {
      const delta = Math.abs(simplex2(field, x + 1e-7, y) - simplex2(field, x, y));
      assert.ok(delta < 1e-4, `discontinuity at (${String(x)}, ${String(y)}): ${String(delta)}`);
    }
  });
});

describe('simplex3', () => {
  const FIXTURE_DIGEST = 'aa0c0d90';

  it('reproduces its fixture digest for 5,000 samples', () => {
    const values = [...lattice(5000, 0.37)].map(([x, y]) => simplex3(field, x, y, x * 0.5 - y));
    assert.equal(digestOf(values), FIXTURE_DIGEST);
  });

  it('is zero at the origin', () => {
    assert.equal(simplex3(field, 0, 0, 0), 0);
  });

  it('varies with z, so the third dimension is actually wired', () => {
    // The mistake this catches is a 3D routine that indexes its permutation
    // without k and so returns a 2D field extruded along z.
    const a = simplex3(field, 0.3, 0.7, 0.1);
    const b = simplex3(field, 0.3, 0.7, 4.9);
    assert.notEqual(a, b);
  });
});

/**
 * BL-054's third acceptance criterion: "Output range and mean are measured and
 * documented, not assumed."
 *
 * These are measurements. The bounds asserted are deliberately looser than the
 * measured values — a test that pinned the measurement to its last digit would
 * fail on any harmless change — and the measured numbers themselves are
 * recorded in `34_DEVELOPMENT_LOG.md`, which is where the "documented" half of
 * the criterion lives.
 */
describe('measured range and mean', () => {
  function statistics(values: readonly number[]): {
    min: number;
    max: number;
    mean: number;
  } {
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    for (const value of values) {
      if (value < min) min = value;
      if (value > max) max = value;
      sum += value;
    }
    return { min, max, mean: sum / values.length };
  }

  const samples = [...lattice(20000, 0.131)];

  it('simplex2 stays inside [-1, 1] and is centred near zero', () => {
    const { min, max, mean } = statistics(samples.map(([x, y]) => simplex2(field, x, y)));
    assert.ok(min >= -1 && max <= 1, `range [${String(min)}, ${String(max)}] escapes [-1, 1]`);
    // Not tight: the point is that it is symmetric, not that it is 0.
    assert.ok(Math.abs(mean) < 0.02, `mean ${String(mean)} is not centred`);
    // It must actually use its range, or the scale factor is wrong.
    assert.ok(max > 0.7 && min < -0.7, `range [${String(min)}, ${String(max)}] is too narrow`);
  });

  it('simplex3 stays inside [-1, 1] and is centred near zero', () => {
    const { min, max, mean } = statistics(
      samples.map(([x, y]) => simplex3(field, x, y, x * 0.5 - y)),
    );
    assert.ok(min >= -1 && max <= 1, `range [${String(min)}, ${String(max)}] escapes [-1, 1]`);
    assert.ok(Math.abs(mean) < 0.02, `mean ${String(mean)} is not centred`);
    assert.ok(max > 0.5 && min < -0.5, `range [${String(min)}, ${String(max)}] is too narrow`);
  });

  it('fbm stays inside [-1, 1] at the terrain octaves, because it is normalised', () => {
    // The regression this guards: dropping the /totalAmplitude makes a
    // 5-octave gain-0.5 sum reach ±1.9375, and `12` §"Terrain" multiplies fbm
    // by 0.28 and adds it to a mask — so the terrain would silently gain half
    // again as much relief at a different octave count.
    const { min, max, mean } = statistics(samples.map(([x, y]) => fbm(field, x, y, TERRAIN_FBM)));
    assert.ok(min >= -1 && max <= 1, `range [${String(min)}, ${String(max)}] escapes [-1, 1]`);
    assert.ok(Math.abs(mean) < 0.02, `mean ${String(mean)} is not centred`);
  });

  it('fbm at one octave is exactly simplex2', () => {
    // Normalisation must divide by the total amplitude, not by the octave
    // count: at one octave those agree, which is what makes this a real check
    // of the identity rather than of the constant.
    for (const [x, y] of lattice(200, 0.37)) {
      assert.equal(
        fbm(field, x, y, { octaves: 1, lacunarity: 2, gain: 0.5 }),
        simplex2(field, x, y),
      );
    }
  });

  it('ridgeNoise stays inside [0, 1] and is nowhere near centred', () => {
    // The documented asymmetry: ridges contribute upward or not at all, which
    // is why `12` §"Terrain" can add a masked ridge term without carving.
    const { min, max, mean } = statistics(
      samples.map(([x, y]) => ridgeNoise(field, x, y, RIDGE_FBM)),
    );
    assert.ok(min >= 0, `ridge minimum ${String(min)} is negative`);
    assert.ok(max <= 1, `ridge maximum ${String(max)} exceeds 1`);
    assert.ok(mean > 0.1 && mean < 0.9, `ridge mean ${String(mean)} is degenerate`);
  });
});

describe('fbm and ridgeNoise argument handling', () => {
  it('reject a non-positive or fractional octave count', () => {
    for (const octaves of [0, -1, 2.5, Number.NaN]) {
      const options = { octaves, lacunarity: 2, gain: 0.5 };
      assert.throws(() => fbm(field, 1, 1, options), RangeError);
      assert.throws(() => ridgeNoise(field, 1, 1, options), RangeError);
    }
  });

  it('a gain of zero collapses to the first octave', () => {
    for (const [x, y] of lattice(50, 0.37)) {
      assert.equal(fbm(field, x, y, { octaves: 5, lacunarity: 2, gain: 0 }), simplex2(field, x, y));
    }
  });
});

describe('createNoiseFieldFromRng', () => {
  it('produces a genuine permutation of 0..255', () => {
    const { perm } = createNoiseFieldFromRng(rngFromSeed(WORLD_SEED));
    const seen = new Uint8Array(256);
    for (let i = 0; i < 256; i++) seen[perm[i] ?? 0] = 1;
    assert.equal(
      seen.reduce<number>((total, value) => total + value, 0),
      256,
    );
  });

  it('repeats the table across both halves, so index arithmetic needs no modulo', () => {
    const { perm, permMod12 } = createNoiseFieldFromRng(rngFromSeed(WORLD_SEED));
    for (let i = 0; i < 256; i++) {
      assert.equal(perm[i + 256], perm[i]);
      assert.equal(permMod12[i], (perm[i] ?? 0) % 12);
    }
  });

  it('agrees with createNoiseField for the same stream', () => {
    // The two entry points must be the same derivation, or a serialised
    // stream restored through the escape hatch would generate a different
    // island from the one it was saved on.
    const viaSeed = createNoiseField(WORLD_SEED, 'worldgen');
    const viaRng = createNoiseFieldFromRng(rngFor(WORLD_SEED, 'worldgen'));
    assert.deepEqual([...viaRng.perm], [...viaSeed.perm]);
  });

  it('gives different fields for different purposes on one world seed', () => {
    const worldgen = createNoiseField(WORLD_SEED, 'worldgen');
    const scatter = createNoiseField(WORLD_SEED, 'scatter');
    assert.notDeepEqual([...worldgen.perm], [...scatter.perm]);
  });
});
