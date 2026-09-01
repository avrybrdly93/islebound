/**
 * Shared fixtures and statistical helpers for the `Rng` suites
 * (`Rng.test.ts` and `Rng.streams.test.ts`).
 *
 * Extracted by BL-069, which split a 509-line `Rng.test.ts` in two to get it
 * under the 500-line hard limit `max-lines` now enforces. The chi-square
 * helpers are the reason a shared module rather than two copies: their
 * critical values are stated rather than eyeballed (BL-005's second
 * criterion), and two drifting copies of a statistical test is exactly the
 * failure that makes such a test worthless.
 *
 * Not a barrel file: it declares these, it does not re-export somebody else's.
 */

import { nextU32, type RngState } from '@sim/rng/Rng';

/** `12` §1: the shipped island's seed, 'HALC'. Used here as the fixture seed. */
export const WORLD_SEED = 0x48414c43;

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
export function digestOf(values: Iterable<number>): string {
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

export function take(rng: RngState, n: number): Uint32Array {
  // A typed array, not `number[]`: every counter and sequence in this file is
  // one, because `noUncheckedIndexedAccess` types a plain array's element as
  // `T | undefined` and the project bans the `!` that would paper over it.
  // Typed-array indexing is `number`, so the reads below need no assertion.
  const out = new Uint32Array(n);
  for (let i = 0; i < n; i++) out[i] = nextU32(rng);
  return out;
}

export const EMPTY = new Uint8Array(0);

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
export function at(array: Int32Array | Uint8Array, i: number): number {
  return array[i] ?? 0;
}

/** Chi-square goodness-of-fit of `values` against a uniform over `bins` categories. */
export function uniformityChiSquare(values: Uint8Array, bins: number): number {
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
export function independenceChiSquare(a: Uint8Array, b: Uint8Array, bins: number): number {
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
