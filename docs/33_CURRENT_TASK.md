# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IDLE

No task in progress. **BL-065 is complete** (2026-09-06) — `AnyComponentDef` is
`ComponentDef<unknown>`, the *top* of the def family, so `QueryCache.query`
takes any def with no cast; `World.query`'s erasing `as` and **both** copies of
the `anyDef<T>` helper are deleted; decision **0031** carries the argument. See
`34_DEVELOPMENT_LOG.md` 2026-09-06 — its **Surprises** 1 and 4 are the ones
worth reading.

Suite **349 → 353 pass / 0 fail across 90 suites**. `lint`, `lint:rules`,
`lint:docs`, `typecheck` all clean.

## Next action for an agent

The topmost unblocked task in Phase 0's Ready list, per
`AI_DEVELOPMENT_WORKFLOW.md` §2.

**Read the file, do not trust this line.** In list order:

- **BL-056** is still **Phase 1** — not a candidate under phase discipline.
  Fifteenth session running.
- **BL-067** is still the one to skip, **on its own instruction** rather than on
  your judgement. Re-checked this session with the grep the previous handoff
  names: `23_SAVE_SYSTEM.md` mentions `EntitySave` exactly once (§2, line 38)
  and defines it nowhere, so there is still no *component-level* format, which
  is what BL-067's first criterion presumes.
- **BL-065** — done, this session, and moved to Done rather than marked in
  place (BL-062's precedent; the Ready list still carries four older items
  marked `**DONE**` in place, which is an inconsistency in the file, not a
  second convention to copy).
- **BL-072** is now the topmost that is actually ready.

Then **BL-073**, **BL-074** (filed this session), then **BL-008**.

## Why BL-072 is a reasonable next task, and where its real work is

BL-072 adds the remaining `tasks/*.md` to `COVERED_DOCS` in
`tools/check-doc-commands.ts`. The list half is mechanical. **The interesting
half is the second criterion**, and it is what stops this being a one-line
repeat of BL-070: `PNPM_COMMAND`'s `(?!--)` means `pnpm --filter <pkg> <script>`
is never read as a command at all, so `tasks/phase_7_multiplayer.md`'s
`pnpm --filter server sim-smoke` is invisible to the check *by construction*.

Two things to know before starting:

1. **Deciding the `--filter` form is out of scope is a legitimate answer**, and
   the criterion says so — but it must then be **written into the module
   header** as a stated limit. A silent blind spot in a check is worse than a
   declared one, because the check reports clean either way.
2. **`tasks/phase_3_crafting.md` names `pnpm tools:balance`, which has no script
   and no owning backlog item.** So adding that file to `COVERED_DOCS` turns
   `pnpm lint:docs` red until something is done about it, and the check's own
   contract says what the options are: the script exists, or the doc names the
   item that will build it. Expect to file or find that item as part of this
   task rather than after it.

Nothing was left half-done this session. `Query.test.ts` is now at **494 of
500** lines, six under the hard limit — anything that adds to that file still
does not fit, and decision 0029 is explicit that this is the rule working
rather than a problem to route around.

## The standing question, unchanged

**Five** `S` items now sit ahead of **BL-008**, the `M` the phase is actually
for — BL-072, BL-073 and BL-074 among them, and BL-074 was filed this session
against code this session did not write. That is the backlog working as
intended, but a phase that only ever services its own discoveries does not
reach its exit criteria. Worth a human deciding whether BL-008 should be pinned
ahead of the `S` queue.

## One thing to know before you trust a red suite

**BL-074 makes about one full-suite run in twenty fail on
`allocation.test.ts`, and it will not be the same operation twice.** It is
pre-existing and was measured this session on the untouched tree as well as the
changed one (1 in 20 baseline, on `clamp`; 1 in 6 on the changed tree, on
`stepSpring3`; the file passes 8 of 8 in isolation). If your run goes red there
and your change did not touch `core/math/`, re-run before you go looking — and
if you do go looking, the filing is where to start, not the harness.
