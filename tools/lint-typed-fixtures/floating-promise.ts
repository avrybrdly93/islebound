// A deliberate violation of a *type-aware* lint rule, for BL-083.
//
// Owns: the fixture half of BL-083. Asserted by
// `tools/check-type-aware-lint.test.ts`, which lints this file through the
// ESLint API and fails if `@typescript-eslint/no-floating-promises` stops
// reporting on it.
//
// WHY THIS DIRECTORY EXISTS RATHER THAN `tools/lint-fixtures/`. That one is
// in `eslint.config.js`'s `disableTypeChecked` block on purpose and is
// `exclude`d from `tools/tsconfig.json` — decision 0038 — so with
// type-awareness on, its files do not even *parse*. A fixture proving a
// type-aware rule fires therefore cannot live there. This directory is inside
// `tools/tsconfig.json`'s `include` (`**/*.ts`, and its `exclude` names only
// `node_modules` and `lint-fixtures`) and inside ESLint's `ignores`, which is
// the combination BL-083 needed and the repository did not have.
//
// WHY A FLOATING PROMISE AND NOT SOMETHING SHORTER. The rule has to be one
// that *cannot* be reported without type information: knowing that `work()`
// returns a `Promise` is the whole finding. A rule that reports syntactically
// would fire identically with type-awareness off and prove nothing — the
// previous session's finding 7, where a control failed for the wrong reason
// and looked exactly like a control that worked.
//
// THIS FILE TYPE-CHECKS CLEANLY, WHICH IT MUST. It is inside the `tools`
// project, so `pnpm typecheck` compiles it; a floating promise is a lint
// finding and not a type error, so nothing here is red.
//
// It contains no violation of the four custom syntactic rules, deliberately:
// the assertion checks they report *nothing* here, so a regression in the
// type-aware rules cannot be masked by a rule that was never switched off.

async function work(): Promise<void> {
  await Promise.resolve();
}

export function leaksAPromise(): void {
  // The next line is the fixture. It must carry no disable comment of any
  // kind: a suppression here would silence the rule and the assertion would
  // fail for a reason that has nothing to do with the config it guards.
  work();
}
