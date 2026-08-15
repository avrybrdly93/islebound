/**
 * Per-chunk Poisson-disk sampling (BL-054).
 *
 * `12` §"Runs in a Web Worker": "Poisson-disk sampling per chunk with a
 * deterministic per-chunk RNG stream (`rngFor('scatter', chunkX, chunkZ)`), so
 * chunks can be generated independently and in any order — essential for
 * streaming and for regeneration after a save migration."
 *
 * ## Order-independence is a property of the *keying*, not of the algorithm
 *
 * `Rng.ts` already proves that `rngFor(seed, 'scatter', x, z)` gives each chunk
 * its own stream and that the streams are independent. What this module must
 * not do is undo that — and there is exactly one way to undo it, which is to
 * let a chunk's output depend on anything outside the chunk. So
 * {@link samplePoissonDisk} takes the chunk coordinates and the world seed,
 * derives its own generator, and reads no other state at all. Two calls with
 * the same arguments return the same points, in the same order, whatever ran
 * in between.
 *
 * The consequence worth stating plainly: **this sampler does not enforce the
 * minimum distance across a chunk boundary.** A point near an edge can land
 * within `radius` of a point in the neighbouring chunk. That is the price of
 * the streaming requirement, which `12` states as the harder constraint, and
 * pretending otherwise would mean a chunk consulting its neighbours — the one
 * thing that breaks order-independence. `12` §"Scatter" softens the visual
 * consequence with clumping, and BL-056 records the seam question rather than
 * leaving it to be rediscovered.
 *
 * ## Bridson, not dart-throwing
 *
 * Bridson's algorithm (2007) grows the set from an active front, so it
 * terminates when the space is genuinely full rather than when a retry budget
 * runs out. The background grid makes each candidate's rejection test a scan
 * of at most 25 cells instead of a scan of every accepted point, so the cost
 * is linear in the output rather than quadratic.
 *
 * ## No square root
 *
 * Every distance test compares squared distances, so `Math.sqrt` never runs —
 * the determinism argument in `Noise.ts`'s header applies here unchanged.
 * Candidate placement needs a direction and a radius, which would conventionally
 * come from `Math.cos`/`Math.sin` of a random angle; those are
 * implementation-approximated too, so candidates are drawn by rejection from
 * the square annulus instead. See {@link samplePoissonDisk}.
 *
 * ## Purity
 *
 * `sim/` — no clock, no DOM, no `Math.random`. All state is local to a call.
 */

import { nextFloat, nextInt, rngFor, type RngState } from '@sim/rng/Rng';

/** A sampled point, in chunk-local coordinates. */
export interface SamplePoint {
  readonly x: number;
  readonly z: number;
}

/** Inputs to {@link samplePoissonDisk}. */
export interface PoissonDiskOptions {
  /** World seed, per `04` §4.2. */
  readonly worldSeed: number;
  /** Chunk coordinates; keyed into the `'scatter'` stream. Must be integers. */
  readonly chunkX: number;
  readonly chunkZ: number;
  /** Chunk extent in world units. Samples land in `[0, size) × [0, size)`. */
  readonly size: number;
  /** Minimum distance between two accepted points within this chunk. */
  readonly radius: number;
  /**
   * Candidates tried per active point before it is retired. Bridson's `k`;
   * 30 is his recommendation and raising it tightens packing at linear cost.
   */
  readonly attempts?: number;
  /**
   * Acceptance probability for a candidate, evaluated at its position —
   * `12` §"Scatter"'s clumping hook ("modulating acceptance probability with a
   * low-frequency noise field"). Omitted, every candidate is accepted.
   *
   * **It is consulted once per candidate, before the distance test**, so the
   * number of draws taken depends only on the candidate sequence and not on
   * how full the grid happens to be. A predicate that consumed draws itself
   * would still be deterministic, because it is called in a fixed order.
   */
  readonly accept?: (x: number, z: number) => number;
}

/**
 * `1 / √2`, the background grid's cell side as a fraction of `radius`.
 *
 * Committed as a literal for the reason in this module's header: `Math.sqrt`
 * is implementation-approximated by ECMA-262, and a cell size that differed in
 * its last bit between engines could put a point in a different cell and so
 * change which candidates a chunk accepts. `PoissonDisk.test.ts` re-derives it
 * and pins the agreement to within one ulp.
 */
const INV_SQRT2 = 0.7071067811865476;

/** Bridson's recommended candidate count per active point. */
const DEFAULT_ATTEMPTS = 30;

/**
 * Poisson-disk samples for one chunk, in chunk-local coordinates.
 *
 * Deterministic in `(worldSeed, chunkX, chunkZ)` alone: identical arguments
 * give an identical array, in identical order, regardless of what else has
 * been generated. That is BL-054's second acceptance criterion and `12`'s
 * streaming requirement.
 *
 * @throws RangeError if `size` or `radius` is not positive, or if the chunk
 * coordinates are not integers (`rngFor` rejects those, and doing it here as
 * well would only duplicate the message).
 */
export function samplePoissonDisk(options: PoissonDiskOptions): SamplePoint[] {
  const { worldSeed, chunkX, chunkZ, size, radius } = options;
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  if (!(size > 0)) {
    throw new RangeError(`samplePoissonDisk: size must be positive, got ${String(size)}`);
  }
  if (!(radius > 0)) {
    throw new RangeError(`samplePoissonDisk: radius must be positive, got ${String(radius)}`);
  }
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new RangeError(
      `samplePoissonDisk: attempts must be a positive integer, got ${String(attempts)}`,
    );
  }

  const rng = rngFor(worldSeed, 'scatter', chunkX, chunkZ);

  // Background grid: at most one point per cell, so a cell holds an index or
  // -1. `radius / √2` is the largest cell side with that property; the
  // comparison is done squared, hence the constant.
  const radiusSquared = radius * radius;
  const cellSize = radius * INV_SQRT2;
  const gridWidth = Math.max(1, Math.ceil(size / cellSize));
  const grid = new Int32Array(gridWidth * gridWidth).fill(-1);

  const points: SamplePoint[] = [];
  const active: number[] = [];

  const cellIndexOf = (x: number, z: number): number => {
    const cx = Math.min(gridWidth - 1, Math.floor(x / cellSize));
    const cz = Math.min(gridWidth - 1, Math.floor(z / cellSize));
    return cz * gridWidth + cx;
  };

  const farEnough = (x: number, z: number): boolean => {
    const cx = Math.min(gridWidth - 1, Math.floor(x / cellSize));
    const cz = Math.min(gridWidth - 1, Math.floor(z / cellSize));
    const loX = Math.max(0, cx - 2);
    const hiX = Math.min(gridWidth - 1, cx + 2);
    const loZ = Math.max(0, cz - 2);
    const hiZ = Math.min(gridWidth - 1, cz + 2);
    for (let gz = loZ; gz <= hiZ; gz++) {
      for (let gx = loX; gx <= hiX; gx++) {
        const index = grid[gz * gridWidth + gx] ?? -1;
        if (index < 0) continue;
        const other = points[index];
        if (other === undefined) continue;
        const dx = other.x - x;
        const dz = other.z - z;
        if (dx * dx + dz * dz < radiusSquared) return false;
      }
    }
    return true;
  };

  const insert = (x: number, z: number): void => {
    grid[cellIndexOf(x, z)] = points.length;
    active.push(points.length);
    points.push({ x, z });
  };

  const accepted = (x: number, z: number): boolean => {
    const probability = options.accept?.(x, z);
    if (probability === undefined) return true;
    if (probability >= 1) return true;
    if (probability <= 0) return false;
    return nextFloat(rng) < probability;
  };

  const first = { x: nextFloat(rng) * size, z: nextFloat(rng) * size };
  insert(first.x, first.z);

  while (active.length > 0) {
    // Bridson picks a *random* active point, not the newest: taking the newest
    // makes the front a depth-first walk that fills one corridor at a time and
    // leaves a visibly directional pattern.
    const activeIndex = nextInt(rng, 0, active.length);
    const pointIndex = active[activeIndex] ?? 0;
    const origin = points[pointIndex];
    if (origin === undefined) break;

    let placed = false;
    for (let a = 0; a < attempts; a++) {
      const candidate = candidateAround(rng, origin, radius, radiusSquared);
      if (candidate === undefined) continue;
      const { x, z } = candidate;
      if (x < 0 || z < 0 || x >= size || z >= size) continue;
      if (!accepted(x, z)) continue;
      if (!farEnough(x, z)) continue;
      insert(x, z);
      placed = true;
      break;
    }

    if (!placed) {
      // Retire by swapping with the last, which is O(1) and — because the
      // replacement index is then re-drawn from the same uniform range — does
      // not bias which point is picked next.
      const last = active[active.length - 1] ?? 0;
      active[activeIndex] = last;
      active.pop();
    }
  }

  return points;
}

/**
 * A candidate in the annulus `[radius, 2·radius)` around `origin`, or
 * `undefined` when the draw fell outside it.
 *
 * **Rejection from the bounding square, not an angle.** The textbook form is
 * `angle = 2π·u; r = radius·(1 + v)`, then `cos`/`sin` — but `Math.cos` and
 * `Math.sin` are implementation-approximated in ECMA-262, which is exactly the
 * latitude `Rng.ts`'s header refuses. Drawing a point in `[-2r, 2r]²` and
 * keeping it only if its squared distance falls in `[r², 4r²)` uses nothing
 * but multiplication and comparison.
 *
 * The annulus occupies `3π/16 ≈ 59%` of that square, so a returned candidate
 * costs about 1.7 draws on average. Returning `undefined` rather than looping
 * internally is what keeps the draw count a function of the caller's loop
 * alone: the rejected attempt is one of the caller's `attempts`, so two runs
 * with the same seed consume the same draws in the same order by construction
 * rather than by argument.
 */
function candidateAround(
  rng: RngState,
  origin: SamplePoint,
  radius: number,
  radiusSquared: number,
): SamplePoint | undefined {
  const dx = (nextFloat(rng) * 4 - 2) * radius;
  const dz = (nextFloat(rng) * 4 - 2) * radius;
  const distanceSquared = dx * dx + dz * dz;
  if (distanceSquared < radiusSquared || distanceSquared >= 4 * radiusSquared) return undefined;
  return { x: origin.x + dx, z: origin.z + dz };
}
