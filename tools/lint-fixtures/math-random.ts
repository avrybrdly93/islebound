// FIXTURE — deliberately violates the Math.random ban (no-restricted-syntax).
// Linted only by tools/check-lint-rules.mjs. Do not "fix" this file.
export function pickIndex(count: number): number {
  return Math.floor(Math.random() * count);
}
