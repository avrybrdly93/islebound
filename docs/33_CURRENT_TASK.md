# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IDLE

No task in progress. **BL-072 is complete** (2026-09-07) —
`tools/check-doc-commands.ts` now covers **eleven** documents (the three
agent-facing ones plus **every** `tasks/*.md`) and reads
`pnpm --filter <selector> <script>`, resolving the selector against the
workspace members and checking the script against *that package's* manifest.
Decision **0032** carries the argument. See `34_DEVELOPMENT_LOG.md`
2026-09-07 — its **Surprises** 1 and 4 are the ones worth reading.

Suite unchanged at **353 pass / 0 fail across 90 suites** (no runtime code
changed). `lint`, `lint:rules`, `lint:docs`, `typecheck` all clean.

## Next action for an agent

The topmost unblocked task in Phase 0's Ready list, per
`AI_DEVELOPMENT_WORKFLOW.md` §2.

**Read the file, do not trust this line.** In list order:

- **BL-056** is still **Phase 1** — not a candidate under phase discipline.
  Sixteenth session running.
- **BL-067** is still the one to skip, **on its own instruction** rather than
  on your judgement. Re-checked this session with the grep the previous handoff
  names: `23_SAVE_SYSTEM.md` mentions `EntitySave` exactly once (§2, line 38)
  and defines it nowhere, so there is still no *component-level* format, which
  is what BL-067's first criterion presumes.
- **BL-073** is now the topmost that is actually ready.

Then **BL-074**, **BL-077** (filed this session), then **BL-008**.

## Why BL-073 is a reasonable next task, and the trap in it

BL-073 is two false statements in `README.md`: the status banner still says
**"pre-implementation … code begins at `docs/32_BACKLOG.md` → BL-001"** when
BL-001 through BL-072 have landed, and it points agents at
**`.github/AI_DEVELOPMENT_WORKFLOW.md`**, which does not exist — the file at
that path is `.github/AI_DEVELOPMENT_WORKFLOW`, with no extension, a shorter
copy of `docs/AI_DEVELOPMENT_WORKFLOW.md`.

Three things to know before starting:

1. **The duplicate is the dangerous half, and this session made it slightly
   worse.** `tools/check-doc-commands.ts` covers `docs/AI_DEVELOPMENT_WORKFLOW.md`
   and not the `.github/` copy, so the copy can rot silently while the check
   reports clean — and the check's coverage list just grew by six files without
   the copy among them. Criterion 2 ("exactly one workflow document, and every
   reference to it resolves") is the fix; deleting the copy or making it a
   pointer both satisfy it, and the copy being invisible to `lint:docs` is the
   argument for not leaving it as a copy.
2. **It overlaps BL-021 and BL-055**, both unstarted. BL-021 owns `README.md`,
   `CLAUDE.md` and this exact path reference; BL-055 is the path reference
   alone. Whoever takes any one of the three should absorb the others rather
   than leave two items pointing at a fixed problem.
3. **Five documents point at the missing path**: `README.md`, `CLAUDE.md`,
   `docs/32_BACKLOG.md`, `docs/34_DEVELOPMENT_LOG.md`, `docs/35_AI_AGENT_RULES.md`.
   Fixing one is not the criterion.

## The standing question, unchanged and now larger

**Six** `S` items now sit ahead of **BL-008**, the `M` the phase is actually
for — BL-073, BL-074 and BL-077 among them, and BL-077 was filed this session
against code this session did not write, exactly as BL-074 was filed last
session. That is the backlog working as intended, but a phase that only ever
services its own discoveries does not reach its exit criteria. Worth a human
deciding whether BL-008 should be pinned ahead of the `S` queue.

## Two things to know before you trust a red run

1. **BL-074 makes about one full-suite run in twenty fail on
   `allocation.test.ts`, and it will not be the same operation twice.** It is
   pre-existing and was measured on the untouched tree (1 in 20 baseline, on
   `clamp`; the file passes 8 of 8 in isolation). If your run goes red there and
   your change did not touch `core/math/`, re-run before you go looking — and if
   you do go looking, the filing is where to start, not the harness.
2. **`pnpm format:check` is red on `main` right now, on two files nobody has
   formatted** (`Query.test.ts`, `Query.defTypes.test.ts`). That is **BL-077**,
   measured this session on the untouched tree. The reason it went unnoticed is
   the useful part: **the verify block does not contain `format:check`**, so
   every recent session reported "all clean" truthfully while it was failing.
   If you run it and it is red on exactly those two files, that is the known
   state — and `pnpm format` is safe to run on them (checked: it *shrinks*
   `Query.test.ts` from 494 to 491, so the 500-line hard limit is not in play).
