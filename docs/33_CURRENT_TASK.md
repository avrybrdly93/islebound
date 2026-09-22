# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IN_PROGRESS — BL-083

**Nothing asserts that the type-aware lint rules stay on over `tools/`.**
Phase 0 · S · depends on BL-082 (done) · docs to read: 06, 07.

Selected 2026-09-22 as the topmost unblocked task in Phase 0's Ready list,
per `AI_DEVELOPMENT_WORKFLOW.md` §2. Above it: BL-056 is **Phase 1** and out
under phase discipline; BL-067 is skipped **on its own instruction** —
`23_SAVE_SYSTEM.md` still mentions `EntitySave` once and defines it nowhere,
re-checked 2026-09-22, unchanged. Everything else above is `DONE`.

This is the **fifth consecutive session on the previous session's follow-up**
(BL-079 → BL-080 → BL-081 → BL-082 → BL-083), which the previous handoff
flagged and did not forbid. That flag is inherited rather than re-argued.
**If this session generates a sixth, it will be filed and not taken**, per
that handoff's own instruction.

## Baseline, measured before any edit

`pnpm install --frozen-lockfile` first — `node_modules` was absent **again**,
eighth session running.

`lint` clean (one pre-existing `boundaries/external` deprecation warning,
untouched), `lint:rules` all 4 fixtures caught, `lint:docs` 11 documents clean
/ 53 markdown files resolving, `typecheck` clean across all three projects,
`test` **372 pass / 0 fail across 90 suites**. Matches the previous
session's close-out on every count.

## Plan

1. **Pick the rule and prove it is the right one before building anything.**
   The guard needs a rule that is off under `disableTypeChecked` and cannot be
   reported by any syntactic rule. `@typescript-eslint/no-floating-promises`
   is the candidate. Per the previous session's finding 7, **run the control
   against the old state too** — a rule that reports identically with and
   without type-awareness proves nothing.
2. **New fixture directory `tools/lint-typed-fixtures/`**, holding one file
   with a deliberate violation of that rule and *nothing else wrong*. It is
   automatically inside `tools/tsconfig.json`'s `include` (`**/*.ts`, whose
   `exclude` names only `node_modules` and `lint-fixtures`), which is the
   condition BL-083 says the fixture must meet and which `tools/lint-fixtures/`
   cannot. It must type-check cleanly — a floating promise is a lint finding,
   not a type error — so `pnpm typecheck` stays green.
3. **Add it to ESLint's `ignores`** so `pnpm lint` does not fail on a
   deliberate violation, matching how `tools/lint-fixtures/**` is handled.
4. **Host the assertion in `pnpm test`, not in `check-lint-rules.ts`** — see
   the next section, which is a departure from what BL-083's own notes suggest.
5. **Verify criterion 2 by doing it**: return `tools/**/*.ts` to the
   `disableTypeChecked` block, watch the new assertion fail, revert, watch it
   pass. Record both readings.
6. **Verify criterion 3**: assert the syntactic rules report *nothing* on this
   fixture, so a regression cannot be masked by a rule that was never off.
7. Full verify block, then docs 32/33/34 and a decision entry if the departure
   in step 4 proves architecturally significant.

## The one departure from BL-083's notes, decided before coding

BL-083 says `tools/check-lint-rules.ts`'s `EXPECTATIONS` table "is the natural
home for the assertion and is already shaped like one". **It is shaped like
one, and it is the wrong home, and this repository has already written down
why.**

`check-lint-rules.ts` is run by `pnpm lint:rules`, which is **not in the verify
block** — `AI_DEVELOPMENT_WORKFLOW.md` §6 is `pnpm lint && pnpm typecheck &&
pnpm test`, and `lint:rules` is named in the prose *beneath* it, exactly where
`lint:docs` sits. `tools/check-lint-script.test.ts`'s header already rejected
that position for BL-079's guard in as many words: hosting a guard there
"would reproduce BL-077's exact shape one level up: a check that exists and
that nothing is obliged to run."

BL-083's first criterion allows either home — "by something `pnpm test` **or**
`pnpm lint:rules` runs" — so this is a choice within the criteria, not a
deviation from them. It goes in `pnpm test`, where the two sibling guards
already are.

## What is red

Nothing. The `allocation.test.ts` 1-in-20 remains fixed rather than mitigated
(BL-074's four-sampling-interval allowance) and was green again in this
session's baseline — **eight** consecutive full runs now. If it does go red,
read the number in the message: under 4096 is a new phenomenon, well over it
is a real allocation.
