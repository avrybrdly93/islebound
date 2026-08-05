// Fixture for BL-002: the Math.random ban (06 §1).
// Linted by tools/check-lint-rules.mjs, ESLint-ignored everywhere else.

// VIOLATION: non-deterministic, breaks replay from a seed.
export function pickWanderTarget(): number {
  return Math.random() * 10;
}

// COMPLIANT: the same shape, sourced from the seeded RNG. Must not report.
declare function rngFor(purpose: string): { next(): number };
export function pickWanderTargetSeeded(): number {
  return rngFor('ai.wander').next() * 10;
}

// COMPLIANT: an unrelated Math call. Must not report.
export function roundedHalf(value: number): number {
  return Math.round(value / 2);
}
