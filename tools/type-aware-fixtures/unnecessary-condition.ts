// A deliberate violation of a rule that CANNOT be decided without type
// information. Refs BL-083.
//
// Owns: the evidence for BL-083's first acceptance criterion — that the
// type-aware rules really are on over `tools/`. `tools/check-lint-rules.ts`
// lints this file through the ESLint API and asserts the report.
//
// WHY THIS DIRECTORY EXISTS AND IS NOT `tools/lint-fixtures/`. That directory
// is in `eslint.config.js`'s `disableTypeChecked` block and outside
// `tools/tsconfig.json`'s `include`, both on purpose (BL-082, decision 0038).
// A type-aware rule cannot report on a file the project service cannot
// resolve — every fixture there would fail to *parse* under type-aware
// settings — so a fixture proving a type-aware rule fires cannot live there.
// This directory is the opposite of that one on exactly one axis: it is
// **inside** `tools/tsconfig.json`'s `include`, and only in ESLint's
// `ignores`.
//
// SO IT MUST TYPE-CHECK CLEANLY. `pnpm typecheck` compiles this file. The
// violation below is a *lint* violation and not a type error, which is the
// whole point: a type error here would turn `pnpm typecheck` red and say
// nothing about whether ESLint is type-aware.

/**
 * `value` is a `string`, so it can never be `undefined` and the comparison is
 * always true. `@typescript-eslint/no-unnecessary-condition` reports that, and
 * it is decidable only from the type — no amount of looking at this file's
 * syntax can tell you whether the comparison is necessary.
 *
 * If you are here because you want to switch this rule off: the assertion in
 * `tools/check-lint-rules.ts` names it, and turning it off means updating that
 * row to some other type-aware rule. Do not delete the row — deleting it is
 * the regression BL-083 exists to catch.
 */
export function isPresent(value: string): boolean {
  return value !== undefined;
}
