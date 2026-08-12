/**
 * Simplex noise, fbm and ridge (BL-054).
 *
 * `04` §3's technology table pins the algorithm alongside the PRNG:
 * "Hand-rolled seeded PRNG (mulberry32) + simplex — determinism must be ours,
 * not a library's". This is the simplex half; BL-005 built the PRNG and
 * BL-056 has the Poisson-disk sampler that also draws from it.
 *
 * ## No `RngState` is threaded through any of this
 *
 * Noise is a *field*: a pure function of position that returns the same value
 * for the same coordinates no matter how many times, or in what order, it is
 * asked. That is what makes it usable for terrain that streams in chunks —
 * a chunk's heights cannot depend on which chunks were generated before it.
 * A generator consumed per sample would destroy exactly that property.
 *
 * The seed enters once, when the permutation table is built:
 * {@link createNoiseField} shuffles 0..255 with a stream from `rngFor`. From
 * then on the field is deterministic and stateless, and every call below takes
 * the table rather than a generator. This is also why the field is a value the
 * caller holds rather than module state — `sim/` holds no module-level mutable
 * state, and a headless harness runs several seeds in one process.
 *
 * ## The gradients, and why 3D uses 12 of them
 *
 * The classical simplex gradient sets: 8 unit vectors to the corners and edge
 * midpoints in 2D, and in 3D the 12 midpoints of a cube's edges. The 3D set is
 * the one worth explaining, because 12 is a strange number to meet: they are
 * the vectors with one zero component and two ±1s, which is every edge
 * midpoint direction of a cube. Using the 8 corner directions instead — the
 * obvious choice — puts more gradient weight along the diagonals and produces
 * visible axis-aligned structure in the field.
 *
 * ## Range and mean are measured, not assumed
 *
 * The scaling constants below (`SCALE_2D`, `SCALE_3D`) are the values that map
 * raw simplex output onto roughly [-1, 1]. "Roughly" is the honest word:
 * simplex's true extrema are not analytically tidy and the constants in
 * circulation are empirical. `Simplex.test.ts` measures the real range and mean
 * over a large sample and states them, rather than asserting a [-1, 1] bound
 * this code does not actually guarantee. Callers who need a hard bound must
 * clamp; the field does not do it for them, because a silent clamp would hide
 * a scaling mistake rather than reveal one.
 */

import { rngFor, shuffle } from '@sim/rng/Rng';

/**
 * A seeded noise field: the permutation table, and nothing else.
 *
 * `perm` is 512 long — the 256-entry table repeated — so lattice lookups can
 * add two indices in 0..255 without a second mask. `permMod12` is the same
 * table pre-reduced to 0..11 for the 3D gradient lookup, precomputed because
 * that modulo would otherwise sit in the innermost loop of every terrain
 * sample. Both are `Uint8Array`: the values are small, and a typed array keeps
 * the field cheap to hold per seed.
 */
export interface NoiseField {
  readonly perm: Uint8Array;
  readonly permMod12: Uint8Array;
}

/** Skew/unskew factors for the 2D simplex lattice: (√3−1)/2 and (3−√3)/6. */
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
/** And for 3D: 1/3 and 1/6. */
const F3 = 1 / 3;
const G3 = 1 / 6;

/**
 * Empirical scale factors bringing raw output to approximately [-1, 1].
 *
 * Approximately. See the module note — the measured range is in
 * `Simplex.test.ts` and is not exactly ±1.
 */
const SCALE_2D = 70;
const SCALE_3D = 32;

/** 2D gradients: the 8 unit directions, as ±1 pairs. */
const GRAD_2D: readonly (readonly [number, number])[] = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** 3D gradients: the 12 cube-edge midpoints. See the module note. */
const GRAD_3D: readonly (readonly [number, number, number])[] = [
  [1, 1, 0],
  [-1, 1, 0],
  [1, -1, 0],
  [-1, -1, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [1, 0, -1],
  [-1, 0, -1],
  [0, 1, 1],
  [0, -1, 1],
  [0, 1, -1],
  [0, -1, -1],
];

/**
 * Read a `Uint8Array` element as a number.
 *
 * `noUncheckedIndexedAccess` applies to typed arrays as well as plain ones —
 * the lesson `33_CURRENT_TASK.md` recorded from BL-005 — and this project bans
 * `!`. Every call below indexes with a value already masked into range, so the
 * fallback is unreachable by construction; it exists to satisfy the type, and
 * returning 0 rather than throwing keeps this off the hot path's branch
 * predictor.
 */
function at(array: Uint8Array, i: number): number {
  return array[i] ?? 0;
}

/** Same, for the gradient tables, whose index is always masked to their length. */
function grad2(i: number): readonly [number, number] {
  return GRAD_2D[i] ?? [0, 0];
}

function grad3(i: number): readonly [number, number, number] {
  return GRAD_3D[i] ?? [0, 0, 0];
}

/**
 * Build a noise field from a world seed.
 *
 * The table is shuffled from `rngFor(worldSeed, purpose)` rather than being
 * Ken Perlin's hard-coded 256 values, so the field moves with the world seed —
 * two worlds with different seeds get different terrain, which a fixed table
 * would not give. `purpose` is a parameter so that terrain, caves and moisture
 * can each hold an independent field without one's lattice correlating with
 * another's.
 *
 * `shuffle` is Fisher–Yates and is tested for permutation-level uniformity in
 * `Rng.test.ts`, which is the property that matters here: a table that is
 * uniform element-by-element but not as a permutation would still bias the
 * gradient assignment.
 */
export function createNoiseField(worldSeed: number, purpose = 'noise'): NoiseField {
  const rng = rngFor(worldSeed, purpose);
  const base = shuffle(
    rng,
    Array.from({ length: 256 }, (_unused, i) => i),
  );

  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    const value = base[i & 255] ?? 0;
    perm[i] = value;
    permMod12[i] = value % 12;
  }
  return { perm, permMod12 };
}

/**
 * 2D simplex noise at `(x, y)`.
 *
 * The skew maps the square lattice onto a triangular one, which is what buys
 * simplex its lack of axis-aligned artefacts: the input point is skewed into
 * lattice space, the containing simplex is identified by which coordinate
 * offset is larger, and the three corners contribute a radially symmetric
 * falloff times a gradient dot product.
 *
 * The `0.5 − t²` falloff radius is not adjustable. It is chosen so that a
 * corner's contribution reaches exactly zero at the distance where the
 * neighbouring simplex takes over; changing it makes the field discontinuous
 * across simplex boundaries, which reads as visible creases in terrain.
 */
export function noise2D(field: NoiseField, x: number, y: number): number {
  const { perm } = field;

  const skew = (x + y) * F2;
  const i = Math.floor(x + skew);
  const j = Math.floor(y + skew);

  const unskew = (i + j) * G2;
  const x0 = x - (i - unskew);
  const y0 = y - (j - unskew);

  // Which of the two triangles of the skewed square the point fell in.
  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;

  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;

  const ii = i & 255;
  const jj = j & 255;

  let total = 0;

  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 > 0) {
    const g = grad2(at(perm, ii + at(perm, jj)) & 7);
    t0 *= t0;
    total += t0 * t0 * (g[0] * x0 + g[1] * y0);
  }

  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 > 0) {
    const g = grad2(at(perm, ii + i1 + at(perm, jj + j1)) & 7);
    t1 *= t1;
    total += t1 * t1 * (g[0] * x1 + g[1] * y1);
  }

  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 > 0) {
    const g = grad2(at(perm, ii + 1 + at(perm, jj + 1)) & 7);
    t2 *= t2;
    total += t2 * t2 * (g[0] * x2 + g[1] * y2);
  }

  return SCALE_2D * total;
}

/**
 * 3D simplex noise at `(x, y, z)`.
 *
 * The same construction one dimension up: the skewed cube contains six
 * tetrahedra, and the branch below identifies which one by ordering the three
 * offsets. The ordering is written as an explicit six-way comparison rather
 * than a sort, because a sort would allocate and this sits on the terrain path
 * — `06`'s no-allocation-in-per-frame-paths rule.
 *
 * The falloff constant is `0.6` here and `0.5` in 2D. That is not an
 * inconsistency: it is the radius at which a tetrahedron corner's influence
 * reaches the neighbouring cell, which differs with dimension.
 */
export function noise3D(field: NoiseField, x: number, y: number, z: number): number {
  const { perm, permMod12 } = field;

  const skew = (x + y + z) * F3;
  const i = Math.floor(x + skew);
  const j = Math.floor(y + skew);
  const k = Math.floor(z + skew);

  const unskew = (i + j + k) * G3;
  const x0 = x - (i - unskew);
  const y0 = y - (j - unskew);
  const z0 = z - (k - unskew);

  // Which of the six tetrahedra: the ranking of x0, y0, z0.
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
  } else {
    if (y0 < z0) {
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

  let total = 0;

  let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
  if (t0 > 0) {
    const g = grad3(at(permMod12, ii + at(perm, jj + at(perm, kk))));
    t0 *= t0;
    total += t0 * t0 * (g[0] * x0 + g[1] * y0 + g[2] * z0);
  }

  let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
  if (t1 > 0) {
    const g = grad3(at(permMod12, ii + i1 + at(perm, jj + j1 + at(perm, kk + k1))));
    t1 *= t1;
    total += t1 * t1 * (g[0] * x1 + g[1] * y1 + g[2] * z1);
  }

  let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
  if (t2 > 0) {
    const g = grad3(at(permMod12, ii + i2 + at(perm, jj + j2 + at(perm, kk + k2))));
    t2 *= t2;
    total += t2 * t2 * (g[0] * x2 + g[1] * y2 + g[2] * z2);
  }

  let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
  if (t3 > 0) {
    const g = grad3(at(permMod12, ii + 1 + at(perm, jj + 1 + at(perm, kk + 1))));
    t3 *= t3;
    total += t3 * t3 * (g[0] * x3 + g[1] * y3 + g[2] * z3);
  }

  return SCALE_3D * total;
}

/** Octave settings shared by {@link fbm2D}, {@link fbm3D} and the ridge pair. */
export interface FractalOptions {
  /** Number of octaves summed. Default `4`. */
  readonly octaves?: number;
  /** Frequency multiplier per octave. Default `2`. */
  readonly lacunarity?: number;
  /** Amplitude multiplier per octave. Default `0.5`. */
  readonly persistence?: number;
}

const DEFAULT_OCTAVES = 4;
const DEFAULT_LACUNARITY = 2;
const DEFAULT_PERSISTENCE = 0.5;

/**
 * Normalisation: the sum of the amplitudes actually used.
 *
 * Dividing by this rather than by a fixed constant is what keeps fbm's range
 * comparable to a single octave's whatever `octaves` and `persistence` are. A
 * fixed divisor is the common shortcut and it makes the output range depend on
 * settings the caller thought were cosmetic — terrain that gets flatter when
 * you add detail.
 *
 * Note this normalises the *worst case*, not the typical one: octaves rarely
 * peak together, so a normalised fbm's measured range is narrower than a single
 * octave's. `Simplex.test.ts` measures it rather than leaving that implied.
 */
function amplitudeSum(octaves: number, persistence: number): number {
  let sum = 0;
  let amplitude = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amplitude;
    amplitude *= persistence;
  }
  return sum;
}

function resolve(options: FractalOptions): {
  octaves: number;
  lacunarity: number;
  persistence: number;
} {
  const octaves = options.octaves ?? DEFAULT_OCTAVES;
  if (!Number.isInteger(octaves) || octaves < 1) {
    throw new RangeError(
      `fractal noise: octaves must be a positive integer, got ${String(octaves)}`,
    );
  }
  return {
    octaves,
    lacunarity: options.lacunarity ?? DEFAULT_LACUNARITY,
    persistence: options.persistence ?? DEFAULT_PERSISTENCE,
  };
}

/** Fractal Brownian motion over {@link noise2D}. */
export function fbm2D(
  field: NoiseField,
  x: number,
  y: number,
  options: FractalOptions = {},
): number {
  const { octaves, lacunarity, persistence } = resolve(options);
  let total = 0;
  let frequency = 1;
  let amplitude = 1;
  for (let i = 0; i < octaves; i++) {
    total += amplitude * noise2D(field, x * frequency, y * frequency);
    frequency *= lacunarity;
    amplitude *= persistence;
  }
  return total / amplitudeSum(octaves, persistence);
}

/** Fractal Brownian motion over {@link noise3D}. */
export function fbm3D(
  field: NoiseField,
  x: number,
  y: number,
  z: number,
  options: FractalOptions = {},
): number {
  const { octaves, lacunarity, persistence } = resolve(options);
  let total = 0;
  let frequency = 1;
  let amplitude = 1;
  for (let i = 0; i < octaves; i++) {
    total += amplitude * noise3D(field, x * frequency, y * frequency, z * frequency);
    frequency *= lacunarity;
    amplitude *= persistence;
  }
  return total / amplitudeSum(octaves, persistence);
}

/**
 * Ridge noise over {@link noise2D}: `1 − |n|` per octave, squared, summed.
 *
 * The folding is what makes ridges. `|n|` turns the zero crossings — which are
 * smooth, dense and evenly spread — into creases, and `1 − |n|` puts those
 * creases at the *top* of the range so they read as ridgelines rather than
 * valleys. Squaring sharpens them: without it the result is a rounded fold, and
 * with it the fold is a crest with slopes falling away.
 *
 * **The output is in [0, 1], not [-1, 1]**, which is a different range from
 * every other function here and is deliberate rather than an oversight: a
 * ridge field is a height mask, and a mask with negative values has to be
 * remapped by every caller. Measured in `Simplex.test.ts` like the rest.
 */
export function ridge2D(
  field: NoiseField,
  x: number,
  y: number,
  options: FractalOptions = {},
): number {
  const { octaves, lacunarity, persistence } = resolve(options);
  let total = 0;
  let frequency = 1;
  let amplitude = 1;
  for (let i = 0; i < octaves; i++) {
    const folded = 1 - Math.abs(noise2D(field, x * frequency, y * frequency));
    total += amplitude * folded * folded;
    frequency *= lacunarity;
    amplitude *= persistence;
  }
  return total / amplitudeSum(octaves, persistence);
}

/** Ridge noise over {@link noise3D}. See {@link ridge2D} for the folding. */
export function ridge3D(
  field: NoiseField,
  x: number,
  y: number,
  z: number,
  options: FractalOptions = {},
): number {
  const { octaves, lacunarity, persistence } = resolve(options);
  let total = 0;
  let frequency = 1;
  let amplitude = 1;
  for (let i = 0; i < octaves; i++) {
    const folded = 1 - Math.abs(noise3D(field, x * frequency, y * frequency, z * frequency));
    total += amplitude * folded * folded;
    frequency *= lacunarity;
    amplitude *= persistence;
  }
  return total / amplitudeSum(octaves, persistence);
}
