/**
 * Simplex noise, fbm and ridge noise (BL-054).
 *
 * The second half of BL-005. `04` §3's technology table pins the algorithm —
 * "Hand-rolled seeded PRNG (mulberry32) + simplex — determinism must be ours,
 * not a library's" — and `12` §"Terrain" names the exact consumers:
 * `fbm(x, z, oct=5, lac=2.0, gain=0.5)` for base elevation and
 * `ridgeNoise(x, z, oct=3)` masked to the northern third.
 *
 * ## No square root runs here, and that is the point
 *
 * `Rng.ts`'s header argues bit-exactness from ECMA-262: `Math.imul`, `>>>`,
 * `^` and `+` on int32 operands have no implementation latitude, and it names
 * reaching for `Math.sin` as a mixer as the mistake that would forfeit it.
 *
 * Simplex reintroduces that hazard by convention. Its skew constants are
 * normally written `F2 = (√3 − 1)/2` and `G2 = (3 − √3)/6`, and ECMA-262
 * specifies `Math.sqrt` as *implementation-approximated* — the same latitude
 * that rules out `Math.sin`. In practice every engine ships a correctly
 * rounded `sqrt` because IEEE-754 requires one, but "every engine currently
 * does" is a different claim from "the specification forbids otherwise", and
 * this project's determinism rests on the second.
 *
 * So the constants are committed as decimal literals, computed once offline
 * and pinned by a test that re-derives them and checks the agreement is within
 * a double's last bit. Everything else is `+`, `*`, `-`, comparison and
 * `Math.floor`, all of which are exact.
 *
 * ## Gradients are a table, not trigonometry
 *
 * The usual "pick an angle, take its sin and cos" gradient construction is
 * both slower and non-exact. These are the standard 12 edge-midpoint vectors
 * of a cube (Perlin's "Improving Noise", 2002), whose components are all 0 or
 * ±1 — so a gradient dot product is three multiplies by ±1 with no rounding at
 * all, and the 2D case reuses the same table by ignoring `z`.
 *
 * ## Purity
 *
 * `sim/` — no clock, no DOM, no `Math.random`. The permutation table is
 * derived from a named RNG stream and is owned by the caller as a
 * {@link NoiseField}, not held in module state.
 *
 * `CLAUDE.md`, `06` §"Purity of sim/" and `Rng.ts`'s own header all say this
 * is enforced by `tools/check-sim-purity.ts`. **That file does not exist
 * yet** — it is BL-017, still open in `32_BACKLOG.md`, and until it lands the
 * enforcement is the ESLint bans alone. Written down here because three
 * places state the guarantee in the present tense and none of them says it is
 * pending.
 */

import { rngFor, shuffle, type RngState } from '@sim/rng/Rng';

/**
 * `(√3 − 1) / 2`, the 2D skew factor.
 *
 * Committed rather than computed; see the module header. `Noise.test.ts`
 * re-derives it from `Math.sqrt(3)` and asserts they agree to within one ulp,
 * so the literal cannot drift from its definition unnoticed.
 */
const F2 = 0.3660254037844386;

/** `(3 − √3) / 6`, the 2D unskew factor. */
const G2 = 0.21132486540518713;

/** `1 / 3`, the 3D skew factor. */
const F3 = 0.3333333333333333;

/** `1 / 6`, the 3D unskew factor. */
const G3 = 0.16666666666666666;

/**
 * The 12 edge-midpoint gradients of a cube, flattened to `[x, y, z, ...]`.
 *
 * Every component is 0 or ±1, so `g·d` is exact.
 */
const GRAD3 = new Int8Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1,
  0, 1, -1, 0, -1, -1,
]);

/** Number of gradients in {@link GRAD3}. */
const GRAD_COUNT = 12;

/**
 * Scale factor mapping raw 2D simplex output to approximately `[-1, 1]`.
 *
 * The conventional value, and `Noise.test.ts` measures what it actually
 * achieves over a large sample rather than restating it — BL-054's third
 * acceptance criterion is that the range is measured and documented, not
 * assumed, and the measured extreme is recorded in `34_DEVELOPMENT_LOG.md`.
 */
const SIMPLEX_2D_SCALE = 70;

/** Scale factor mapping raw 3D simplex output to approximately `[-1, 1]`. */
const SIMPLEX_3D_SCALE = 32;

/**
 * A seeded noise field: the permutation table, and nothing else.
 *
 * A value the caller owns, for the same reason `RngState` is
 * (`Rng.ts` §"Purity"): `sim/` holds no module-level mutable state, and a
 * headless harness runs several seeds in one process.
 */
export interface NoiseField {
  /**
   * 512 entries — the 256-entry permutation repeated, so index arithmetic can
   * add without a second modulo.
   */
  readonly perm: Uint8Array;
  /** `perm[i] % 12`, precomputed; the gradient index for each cell corner. */
  readonly permMod12: Uint8Array;
}

/**
 * Reads a typed array at an index that is in bounds by construction.
 *
 * `noUncheckedIndexedAccess` applies to typed arrays too, and `07` bans the
 * `!` that would paper over it. Every call site below masks its index with
 * `& 255` or `& 511` first, so the fallback is unreachable — it exists to
 * satisfy the type, and returning 0 rather than throwing keeps this off the
 * hot path's branch predictor.
 */
function at(array: Uint8Array | Int8Array, index: number): number {
  return array[index] ?? 0;
}

/**
 * Builds a noise field from a world seed.
 *
 * The permutation is a Fisher–Yates shuffle of `0..255` drawn from
 * `rngFor(worldSeed, purpose)`, **not** Ken Perlin's published 256 constants.
 * Two reasons: the field then moves with the world seed, which is what makes
 * two worlds actually different rather than differently sampled; and
 * `Rng.ts`'s `shuffle` is already tested for permutation-level uniformity, so
 * the table inherits that evidence instead of needing its own.
 *
 * `purpose` names the stream, so terrain and scatter clumping can draw
 * independent fields from one world seed — the same separation `04` §4.2 asks
 * for everywhere else.
 */
export function createNoiseField(worldSeed: number, purpose = 'worldgen'): NoiseField {
  return createNoiseFieldFromRng(rngFor(worldSeed, purpose));
}

/**
 * Builds a noise field from an explicit generator.
 *
 * The escape hatch for tests and for restoring a serialised stream, matching
 * `rngFromSeed`'s relationship to `rngFor`. Consumes exactly the draws
 * `shuffle` makes over 256 elements and no others.
 */
export function createNoiseFieldFromRng(rng: RngState): NoiseField {
  const source: number[] = [];
  for (let i = 0; i < 256; i++) source.push(i);
  shuffle(rng, source);

  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    const value = source[i & 255] ?? 0;
    perm[i] = value;
    permMod12[i] = value % GRAD_COUNT;
  }
  return { perm, permMod12 };
}

/** `g · (dx, dy)` for gradient `gi`, ignoring the gradient's `z`. */
function dot2(gi: number, dx: number, dy: number): number {
  const base = gi * 3;
  return at(GRAD3, base) * dx + at(GRAD3, base + 1) * dy;
}

/** `g · (dx, dy, dz)` for gradient `gi`. */
function dot3(gi: number, dx: number, dy: number, dz: number): number {
  const base = gi * 3;
  return at(GRAD3, base) * dx + at(GRAD3, base + 1) * dy + at(GRAD3, base + 2) * dz;
}

/**
 * 2D simplex noise, approximately in `[-1, 1]`.
 *
 * Standard construction: skew the input into a simplex lattice, find which of
 * the two triangles in the containing cell the point falls in, and sum a
 * radially-attenuated gradient contribution from each of the three corners.
 * The attenuation `(0.5 − |d|²)⁴` is written as repeated multiplication rather
 * than `Math.pow`, which is implementation-approximated for the same reason
 * `Math.sqrt` is.
 */
export function simplex2(field: NoiseField, x: number, y: number): number {
  const { perm, permMod12 } = field;

  const skew = (x + y) * F2;
  const i = Math.floor(x + skew);
  const j = Math.floor(y + skew);
  const unskew = (i + j) * G2;
  const x0 = x - (i - unskew);
  const y0 = y - (j - unskew);

  // Which triangle of the cell: lower (i1,j1 = 1,0) or upper (0,1).
  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;

  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;

  const ii = i & 255;
  const jj = j & 255;
  const gi0 = at(permMod12, ii + at(perm, jj));
  const gi1 = at(permMod12, ii + i1 + at(perm, jj + j1));
  const gi2 = at(permMod12, ii + 1 + at(perm, jj + 1));

  let total = 0;
  let t = 0.5 - x0 * x0 - y0 * y0;
  if (t > 0) {
    t *= t;
    total += t * t * dot2(gi0, x0, y0);
  }
  t = 0.5 - x1 * x1 - y1 * y1;
  if (t > 0) {
    t *= t;
    total += t * t * dot2(gi1, x1, y1);
  }
  t = 0.5 - x2 * x2 - y2 * y2;
  if (t > 0) {
    t *= t;
    total += t * t * dot2(gi2, x2, y2);
  }
  return SIMPLEX_2D_SCALE * total;
}

/** 3D simplex noise, approximately in `[-1, 1]`. Same construction, four corners. */
export function simplex3(field: NoiseField, x: number, y: number, z: number): number {
  const { perm, permMod12 } = field;

  const skew = (x + y + z) * F3;
  const i = Math.floor(x + skew);
  const j = Math.floor(y + skew);
  const k = Math.floor(z + skew);
  const unskew = (i + j + k) * G3;
  const x0 = x - (i - unskew);
  const y0 = y - (j - unskew);
  const z0 = z - (k - unskew);

  // The simplex containing the point is determined by the ordering of the
  // three offsets; these are the two intermediate corner steps.
  let i1 = 0;
  let j1 = 0;
  let k1 = 0;
  let i2 = 0;
  let j2 = 0;
  let k2 = 0;
  if (x0 >= y0) {
    if (y0 >= z0) {
      i1 = 1;
      i2 = 1;
      j2 = 1;
    } else if (x0 >= z0) {
      i1 = 1;
      i2 = 1;
      k2 = 1;
    } else {
      k1 = 1;
      i2 = 1;
      k2 = 1;
    }
  } else if (y0 < z0) {
    k1 = 1;
    j2 = 1;
    k2 = 1;
  } else if (x0 < z0) {
    j1 = 1;
    j2 = 1;
    k2 = 1;
  } else {
    j1 = 1;
    i2 = 1;
    j2 = 1;
  }

  const x1 = x0 - i1 + G3;
  const y1 = y0 - j1 + G3;
  const z1 = z0 - k1 + G3;
  const x2 = x0 - i2 + 2 * G3;
  const y2 = y0 - j2 + 2 * G3;
  const z2 = z0 - k2 + 2 * G3;
  const x3 = x0 - 1 + 3 * G3;
  const y3 = y0 - 1 + 3 * G3;
  const z3 = z0 - 1 + 3 * G3;

  const ii = i & 255;
  const jj = j & 255;
  const kk = k & 255;
  const gi0 = at(permMod12, ii + at(perm, jj + at(perm, kk)));
  const gi1 = at(permMod12, ii + i1 + at(perm, jj + j1 + at(perm, kk + k1)));
  const gi2 = at(permMod12, ii + i2 + at(perm, jj + j2 + at(perm, kk + k2)));
  const gi3 = at(permMod12, ii + 1 + at(perm, jj + 1 + at(perm, kk + 1)));

  let total = 0;
  let t = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
  if (t > 0) {
    t *= t;
    total += t * t * dot3(gi0, x0, y0, z0);
  }
  t = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
  if (t > 0) {
    t *= t;
    total += t * t * dot3(gi1, x1, y1, z1);
  }
  t = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
  if (t > 0) {
    t *= t;
    total += t * t * dot3(gi2, x2, y2, z2);
  }
  t = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
  if (t > 0) {
    t *= t;
    total += t * t * dot3(gi3, x3, y3, z3);
  }
  return SIMPLEX_3D_SCALE * total;
}

/** Octave parameters for {@link fbm} and {@link ridgeNoise}. */
export interface FbmOptions {
  /** Number of octaves summed. `12` §"Terrain" uses 5 for elevation, 3 for ridges. */
  readonly octaves: number;
  /** Frequency multiplier per octave. `12` uses 2.0. */
  readonly lacunarity: number;
  /** Amplitude multiplier per octave. `12` uses 0.5. */
  readonly gain: number;
}

/** `12` §"Terrain"'s elevation octaves: `oct=5, lac=2.0, gain=0.5`. */
export const TERRAIN_FBM: FbmOptions = { octaves: 5, lacunarity: 2, gain: 0.5 };

/** `12` §"Terrain"'s ridge octaves: `oct=3`, with the same lacunarity and gain. */
export const RIDGE_FBM: FbmOptions = { octaves: 3, lacunarity: 2, gain: 0.5 };

/**
 * Fractional Brownian motion: `octaves` simplex samples at geometrically
 * increasing frequency and decreasing amplitude, **normalised by the total
 * amplitude** so the result stays in simplex's own range instead of growing
 * with the octave count.
 *
 * Without that division a 5-octave sum with `gain = 0.5` reaches ±1.9375 and
 * every downstream constant in `12` §"Terrain" — which multiplies fbm by 0.28
 * and adds it to a mask — would silently mean something different at a
 * different octave count. Normalising makes `octaves` a detail-level knob
 * rather than a gain knob.
 *
 * Amplitude and frequency advance by repeated multiplication, not `Math.pow`.
 *
 * @throws RangeError if `octaves` is not a positive integer.
 */
export function fbm(field: NoiseField, x: number, y: number, options: FbmOptions): number {
  const { octaves, lacunarity, gain } = options;
  if (!Number.isInteger(octaves) || octaves < 1) {
    throw new RangeError(`fbm: octaves must be a positive integer, got ${String(octaves)}`);
  }
  let total = 0;
  let amplitude = 1;
  let frequency = 1;
  let totalAmplitude = 0;
  for (let o = 0; o < octaves; o++) {
    total += amplitude * simplex2(field, x * frequency, y * frequency);
    totalAmplitude += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return total / totalAmplitude;
}

/**
 * Ridge noise: fbm over `1 − |simplex|`, squared, giving sharp crests where
 * the underlying field crosses zero.
 *
 * **Output is `[0, 1]`, not `[-1, 1]`**, which is deliberate and is why `12`
 * §"Terrain" can multiply it by a mask and add it: a ridge contributes upward
 * or not at all, and never carves. The mean is nowhere near 0.5 — it is
 * measured in `Noise.test.ts` and recorded in the log rather than assumed,
 * per BL-054's third acceptance criterion.
 *
 * `|simplex|` slightly exceeding 1 at an extreme would make `1 − |s|` negative
 * and the square positive again, putting a spurious crest at a trough, so the
 * term is clamped at zero before squaring.
 *
 * @throws RangeError if `octaves` is not a positive integer.
 */
export function ridgeNoise(field: NoiseField, x: number, y: number, options: FbmOptions): number {
  const { octaves, lacunarity, gain } = options;
  if (!Number.isInteger(octaves) || octaves < 1) {
    throw new RangeError(`ridgeNoise: octaves must be a positive integer, got ${String(octaves)}`);
  }
  let total = 0;
  let amplitude = 1;
  let frequency = 1;
  let totalAmplitude = 0;
  for (let o = 0; o < octaves; o++) {
    const sample = simplex2(field, x * frequency, y * frequency);
    const crest = 1 - (sample < 0 ? -sample : sample);
    const positive = crest > 0 ? crest : 0;
    total += amplitude * positive * positive;
    totalAmplitude += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return total / totalAmplitude;
}
