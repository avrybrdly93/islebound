// FIXTURE — deliberately violates the sim/ purity rule (no-restricted-globals).
// Checked with an overridden filename so it is treated as living under
// packages/client/src/sim/. Linted only by tools/check-lint-rules.mjs.
export function readWidth(): number {
  return window.innerWidth;
}
