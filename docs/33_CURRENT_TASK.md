# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IN_PROGRESS — BL-081

**`tools/*.mjs` is checked by ESLint and by nothing else.** Phase 0, size S,
depends on BL-080 (done). Docs read: `06`, `07`, plus `04`/`05` and the two
files themselves.

Selected as the topmost unblocked Ready item in Phase 0. **BL-056** is Phase 1,
so phase discipline bars it (twenty-second session running). **BL-067** is
skipped on its own instruction, not on judgement — `23_SAVE_SYSTEM.md` mentions
`EntitySave` once and defines it nowhere, so there is still no component-level
format for its first criterion to presume; re-checked 2026-09-20, unchanged.
BL-081 is next.

## Plan

1. **Run the conversion experiment before deciding anything.** The item's notes
   are explicit that this is a question about module-loading order and that a
   session will get it wrong from first principles: `registerAliases.mjs` is
   passed to `node --import` *before* any test file loads, and
   `aliasResolver.mjs` is what it registers. Rename both to `.ts` and run
   `pnpm test`. The answer is whatever the run says.
2. **Decide from the result**, and record the decision in
   `40_DECISION_LOG.md`. If conversion works, it is the option that needs no
   new compiler flag and no JSDoc discipline. If it does not, `allowJs` is the
   only route and the choice narrows to `checkJs` or not.
3. **Implement the decided option**, whichever it is.
4. **Extend `tools/check-typecheck-coverage.test.ts`** so its coverage case
   matches the answer — its current text says `.mjs` is deliberately out of
   scope, and that paragraph stops being true.
5. **Break it once.** Introduce a type error in one of the two files, confirm
   `pnpm typecheck` reports it, remove it. Carried-forward finding 3: a green
   run of a checker does not verify the checker.
6. Verify, document, hand off.

## Baseline, measured before any edit

`pnpm install --frozen-lockfile` first — `node_modules` was absent again, sixth
session running. Then: `pnpm lint` clean, `pnpm typecheck` clean, `pnpm test`
**369 pass / 0 fail across 90 suites**, matching the previous session's
close-out exactly.

## What is red

Nothing.
