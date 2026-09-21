# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IN_PROGRESS — BL-082

**`eslint.config.js` still says `tools/` is not in a TypeScript project, and
turns the type-aware rules off there.** Phase 0 · S · depends on BL-081 (done).

Selected as the topmost unblocked task in Phase 0's Ready list, per
`AI_DEVELOPMENT_WORKFLOW.md` §2. BL-056 is Phase 1 (twenty-third session
running) and BL-067 is skipped on its own instruction — `23_SAVE_SYSTEM.md`
still mentions `EntitySave` exactly once and defines it nowhere, re-checked
2026-09-21 and unchanged.

Docs read: `06`, `07`, plus `04` and `05` (not read this session before now).

## Baseline, measured before any change

`pnpm install --frozen-lockfile` first — `node_modules` was absent again,
**seventh session running**. After it: `pnpm lint` exit 0, `pnpm typecheck`
exit 0, `pnpm test` **372 pass / 0 fail across 90 suites**. That matches the
previous session's close-out on every count.

## The findings, measured before the plan was written

Removing `'tools/**/*.ts'` and `'tools/**/*.tsx'` from the `disableTypeChecked`
block and running `npx eslint tools` reports **6 errors in 2 files**, and they
are the fourth consecutive item where the first run of a check over unchecked
files finds real things:

| file | rule | count |
|---|---|---|
| `tools/check-doc-commands.ts` | `@typescript-eslint/prefer-optional-chain` | 1 |
| `tools/check-doc-commands.ts` | `@typescript-eslint/restrict-template-expressions` | 3 |
| `tools/check-workflow-doc.ts` | `@typescript-eslint/restrict-template-expressions` | 2 |

**All five `restrict-template-expressions` sites are the same shape**: a
`number` interpolated into a `console.error`/`console.log` summary line
(`finding.line`, `findings.length`, `COVERED_DOCS.length`,
`markdownFiles(...).length`). None is a defect — a `number` always stringifies
meaningfully, which is not what that rule exists to catch.

**They are fixed rather than relaxed, and that is a choice worth stating.** The
config already exempts this exact pattern for test files ("an assertion message
that interpolates a measured number is the whole point of the message"), so
`allowNumber: true` over `tools/` would have been defensible. It is not taken:
the criterion says *fixed rather than suppressed*, `String(n)` at five sites is
smaller than a new rule option, and this repository's recurring defect is rules
that get turned off, not rules that are too strict.

## Plan

1. Remove `'tools/**/*.ts'` and `'tools/**/*.tsx'` from the `disableTypeChecked`
   block and rewrite the block's comment, which is what BL-082 is named for.
2. Fix the one `prefer-optional-chain` site.
3. Fix the five `restrict-template-expressions` sites with an explicit
   `String(...)`.
4. **Break it once**, per carried-forward finding 3: a green run of a checker
   does not verify the checker. Controls below.
5. Full gate; update `32`, `33`, `34`, and `40` if the choice in step 3 is
   architecturally significant.

## Criterion 2 needs no edit, and that is the finding worth carrying

BL-082's second criterion asks that `tools/tsconfig.json` be "wired into the
flat config's `languageOptions.parserOptions` so the rules have a program to
read". **It already is, by `projectService: true`**, which discovers the
nearest `tsconfig.json` per file rather than taking a fixed project list. The
proof is not that lint passes — it is that the probe above reported
`restrict-template-expressions`, which is a *type-aware* rule and cannot report
anything without a program.

This is the second consecutive session where the configuration change the item
predicted turned out to be zero (BL-081's was the same, decision 0037), and for
the same underlying reason: the config was already written generally enough.

## What is red

Nothing yet. Baseline above is green.
