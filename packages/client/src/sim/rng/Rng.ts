/**
 * Seeded pseudo-random number generation (BL-005).
 *
 * `04` §4.2 line 88: "All randomness comes from `sim/rng/Rng.ts` seeded
 * per-purpose (`rngFor('worldgen')`, `rngFor('wildlife')`, ...). `Math.random`
 * is banned by lint." `04` §3's technology table pins the algorithm:
 * "Hand-rolled seeded PRNG (mulberry32) + simplex — determinism must be ours,
 * not a library's".
 *
 * ## Why a named stream per purpose, rather than one generator
 *
 * A single shared generator makes every consumer's output depend on the *call
 * order* of every other consumer. Add one wildlife spawn check before the
 * scatter pass and the whole island changes — and the same save, replayed
 * against a build with one extra draw in it, diverges. `12` §"Runs in a Web
 * Worker" needs the stronger property still: scatter is generated per chunk,
 * "so chunks can be generated independently and in any order — essential for
 * streaming and for regeneration after a save migration". A stream keyed by
 * `('scatter', chunkX, chunkZ)` gives each chunk its own sequence, which is
 * what makes chunk order stop mattering.
 *
 * ## The 32-bit discipline, and why bit-exactness is the whole risk here
 *
 * mulberry32 is a 32-bit integer recurrence. JavaScript numbers are doubles,
 * so a plain `state * 0x6D2B79F5` silently stops being mulberry32 as soon as
 * the product passes 2⁵³. Every multiply goes through `Math.imul` and every
 * intermediate through `>>> 0` or `>>>`, exactly as `core/math/hash.ts` does
 * for FNV-1a and for the same reason.
 *
 * That discipline is also what makes the cross-engine claim checkable rather
 * than hopeful. `Math.imul`, `>>>`, `^`, `|` and `+` on int32 operands are all
 * exactly specified by ECMA-262 — no engine has latitude — and the final
 * division by 2³² is an IEEE-754 double division of two exactly-representable
 * values, which is likewise exact. Nothing here touches `Math.sin`,
 * `Math.pow` or any other operation whose last bit is implementation-defined.
 * A generator that reached for `Math.sin` as a mixer, as several one-line
 * PRNGs on the internet do, would be non-deterministic across engines in
 * precisely the way this project cannot afford.
 *
 * ## Purity
 *
 * This module lives under `sim/`, so it reads no clock, no DOM, no global —
 * `tools/check-sim-purity.ts` enforces that. A generator is a mutable
 * `RngState`, which is state the *caller* owns and threads; nothing here is
 * module-level mutable.
 */

import { hashStringInto, hashU32Into, FNV_OFFSET_BASIS } from '@core/math/hash';

/**
 * One generator's state: a single 32-bit word, advanced by every draw.
 *
 * An object rather than a closure over a `let`, so a caller can snapshot it
 * (`{ ...rng }`), store it in a component, or serialise it into a save — all
 * of which `23`'s save format will need and none of which a closure allows.
 */
export interface RngState {
  /** The current 32-bit state word. Advanced by every draw. */
  s: number;
}

/** mulberry32's increment, the odd constant that makes the state a full-period Weyl sequence. */
const MULBERRY32_INCREMENT = 0x6d2b79f5;

/** 2³², the divisor that maps a uint32 to `[0, 1)`. */
const TWO_POW_32 = 4294967296;

/**
 * Creates a generator from an explicit 32-bit seed.
 *
 * Prefer {@link rngFor} — a raw seed is the escape hatch for tests and for
 * restoring a serialised stream, not the way gameplay code should obtain a
 * generator.
 */
export function rngFromSeed(seed: number): RngState {
  return { s: seed >>> 0 };
}

/**
 * Advances `rng` and returns the raw 32-bit output.
 *
 * This is mulberry32 itself; every other draw in this file is a shaping of
 * this one, so the recurrence exists once.
 */
export function nextU32(rng: RngState): number {
  rng.s = (rng.s + MULBERRY32_INCREMENT) >>> 0;
  let z = rng.s;
  z = Math.imul(z ^ (z >>> 15), z | 1);
  z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
  return (z ^ (z >>> 14)) >>> 0;
}

/**
 * A uniform draw in `[0, 1)`.
 *
 * Exactly `nextU32 / 2³²`, so the value is one of 2³² equally spaced points
 * and 1 is unreachable — the half-open interval every caller below assumes.
 * The division is exact: both operands are exactly representable doubles and
 * the quotient is a dyadic rational, so no rounding occurs and no engine can
 * differ.
 */
export function nextFloat(rng: RngState): number {
  return nextU32(rng) / TWO_POW_32;
}

/**
 * A uniform integer in `[min, max)`.
 *
 * **Rejection sampling, not a modulo.** `nextU32() % n` is biased whenever `n`
 * does not divide 2³²: the first `2³² mod n` residues come up one time more
 * often than the rest. At the sizes this project draws — a loot table of 7, a
 * variant index of 3 — that bias is around one part in 6e8 and would never be
 * noticed, which is exactly why it would never be fixed either. Rejecting the
 * ragged tail costs an expected `< 2` draws for any `n` and removes the
 * question.
 *
 * @throws RangeError if the range is empty or the bounds are not integers.
 */
export function nextInt(rng: RngState, min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    throw new RangeError(`nextInt: bounds must be integers, got [${String(min)}, ${String(max)})`);
  }
  const span = max - min;
  if (span <= 0) {
    throw new RangeError(`nextInt: empty range [${String(min)}, ${String(max)})`);
  }
  if (span > TWO_POW_32) {
    throw new RangeError(`nextInt: range ${String(span)} exceeds the generator's 2^32 period`);
  }
  // The largest multiple of `span` that fits in 2^32; anything at or above it
  // is in the ragged tail and is redrawn.
  const limit = TWO_POW_32 - (TWO_POW_32 % span);
  let draw = nextU32(rng);
  while (draw >= limit) draw = nextU32(rng);
  return min + (draw % span);
}

/** A uniform float in `[min, max)`. */
export function nextRange(rng: RngState, min: number, max: number): number {
  return min + nextFloat(rng) * (max - min);
}

/**
 * True with probability `p`.
 *
 * `p <= 0` is never and `p >= 1` is always, both without consuming a draw —
 * which matters for determinism: a probability that a balance pass later sets
 * to 0 should not shift every subsequent value in the stream.
 */
export function chance(rng: RngState, p: number): boolean {
  if (p <= 0) return false;
  if (p >= 1) return true;
  return nextFloat(rng) < p;
}

/**
 * A uniformly chosen element of `items`.
 *
 * @throws RangeError if `items` is empty — an empty pick has no sensible
 * answer, and returning `undefined` would push the same throw into every
 * caller's type.
 */
export function pick<T>(rng: RngState, items: readonly T[]): T {
  if (items.length === 0) {
    throw new RangeError('pick: cannot choose from an empty array');
  }
  const index = nextInt(rng, 0, items.length);
  // In bounds by construction: `nextInt` returns a value in [0, length).
  // `noUncheckedIndexedAccess` cannot see that and the project bans `!`.
  return items[index] as T;
}

/**
 * Fisher–Yates, in place, returning `items` for convenience.
 *
 * The downward loop is not interchangeable with the upward one: iterating `i`
 * from 0 and drawing `j` in `[0, n)` — the version that looks equally
 * plausible — produces a non-uniform permutation, because it has nⁿ equally
 * likely execution paths mapping onto n! outcomes, which do not divide.
 */
export function shuffle<T>(rng: RngState, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = nextInt(rng, 0, i + 1);
    // Both indices are in bounds by construction; see `pick` on the cast.
    const high = items[i] as T;
    const low = items[j] as T;
    items[i] = low;
    items[j] = high;
  }
  return items;
}

/**
 * The seed of the stream {@link rngFor} would return — exposed so a test, a
 * debug overlay or a save migration can name a stream without instantiating
 * it, and so the derivation has exactly one definition.
 *
 * Derived through the existing FNV-1a helpers (`core/math/hash.ts`) rather
 * than a second hash written here: a project with two hash functions
 * eventually has two that disagree about what they hash. The world seed goes
 * in first, then the purpose string, then each coordinate — order matters, so
 * `('scatter', 1, 2)` and `('scatter', 2, 1)` are different streams, which is
 * the whole point for chunk coordinates.
 */
export function streamSeed(worldSeed: number, purpose: string, ...coords: number[]): number {
  let h = hashU32Into(FNV_OFFSET_BASIS, worldSeed >>> 0);
  h = hashStringInto(h, purpose);
  for (const coord of coords) h = hashU32Into(h, coord >>> 0);
  return h >>> 0;
}

/**
 * A generator for one named purpose, per `04` §4.2: `rngFor(seed, 'worldgen')`,
 * `rngFor(seed, 'scatter', chunkX, chunkZ)`.
 *
 * The world seed is a parameter rather than module state because `sim/` holds
 * no module-level mutable state and because a headless harness (BL-014) runs
 * several seeds in one process. `09`'s service registry (BL-009) is where a
 * convenience binding of the seed belongs, not here.
 *
 * Coordinates are truncated to 32 bits by the derivation, so callers should
 * pass integers; a fractional coordinate is a bug the type system cannot see,
 * and is rejected rather than silently floored.
 *
 * @throws RangeError if any coordinate is not an integer.
 */
export function rngFor(worldSeed: number, purpose: string, ...coords: number[]): RngState {
  for (const coord of coords) {
    if (!Number.isInteger(coord)) {
      throw new RangeError(
        `rngFor: coordinates must be integers, got ${String(coord)} for '${purpose}'`,
      );
    }
  }
  return rngFromSeed(streamSeed(worldSeed, purpose, ...coords));
}
