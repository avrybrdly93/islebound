# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IN_PROGRESS — **BL-073**

**Two statements in `README.md` are now false.** Taken 2026-09-08 as the
topmost unblocked task in Phase 0's Ready list, per
`AI_DEVELOPMENT_WORKFLOW.md` §2. The list was read rather than taken from the
handoff, and it agrees: **BL-056** is Phase 1, **BL-067** says on its own face
not to take it before a component-level save format exists (re-checked —
`23_SAVE_SYSTEM.md` mentions `EntitySave` once, in §2, and defines it
nowhere), so **BL-073** is topmost.

### Acceptance criteria, from `32`

1. The status banner says something true about where the repository actually is.
2. There is exactly one workflow document, and every reference to it resolves —
   the duplicate is deleted or made a pointer, not left to drift further.

### What was measured before any edit

- `.github/AI_DEVELOPMENT_WORKFLOW` is a **file**, not the empty directory
  BL-055 describes: 81 lines, CRLF, no extension. BL-055's description is
  stale on that point and its second criterion has to be read as "the
  duplicate is resolved" rather than literally.
- **It has already rotted, and by exactly the paragraph a check was built to
  protect.** Normalised for line endings, the two documents differ in one
  hunk: the `docs/` copy carries BL-062's eight-line note (which commands do
  not exist yet and which backlog item builds each), and the `.github/` copy
  does not. It holds **nothing** the `docs/` copy lacks.
- **Five live references** name the non-existent `.github/AI_DEVELOPMENT_WORKFLOW.md`:
  `README.md`:60, `CLAUDE.md`:9, `docs/32_BACKLOG.md`:13,
  `docs/35_AI_AGENT_RULES.md`:3 and :15. `docs/34_DEVELOPMENT_LOG.md`'s
  mentions are **log history describing the bug** and are deliberately out of
  scope — a development log is a record of what was true when it was written.

### Plan

1. Delete `.github/AI_DEVELOPMENT_WORKFLOW`. It is a strict subset of the
   canonical document, so nothing is lost; `docs/AI_DEVELOPMENT_WORKFLOW.md`
   is canonical because it is the copy `lint:docs` covers and the one that is
   current.
2. Point the five live references at `docs/AI_DEVELOPMENT_WORKFLOW.md`.
3. Rewrite `README.md`'s status banner to something measured on this tree.
4. Give criterion 2 teeth: extend `tools/check-doc-commands.ts` so a second
   workflow document, or a reference to a workflow path that does not exist,
   fails `pnpm lint:docs`. Confirm it **fails on the pre-fix tree** before
   the fix lands, per `29` §9's bug-fix row and BL-062's precedent.
5. Close **BL-055** in the same change — it is this task's criterion 2 exactly
   — and note in **BL-021** what is left of it.
6. Verify, document, hand off.

### Deliberately not in scope

`BL-021`'s remaining surface (`CONTRIBUTING.md`, "clone to a passing test run
using only the README", `CLAUDE.md` under 100 lines) and `BL-077`'s formatter
run. `35` §3 forbids the ride-along, and BL-077 is its own item with its own
second criterion about what runs `format:check`.

---

## Previous session (2026-09-07) — kept for its warnings

### Status at that point: IDLE

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
