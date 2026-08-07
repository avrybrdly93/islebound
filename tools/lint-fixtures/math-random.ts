// Fixture for BL-002: a deliberate violation of the Math.random ban.
// Linted only by `tools/check-lint-rules.ts`; `pnpm lint` ignores this folder.

export function pickTreeVariant(): number {
  return Math.floor(Math.random() * 4);
}
