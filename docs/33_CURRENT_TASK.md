# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IDLE

No task in progress. **BL-063 is complete** (2026-09-04) — `QueryCache` refuses
a new signature past `SIGNATURE_LIMIT` (64), the rule it enforces is stated on
`Query.ts` and `World.query`, and decision **0030** carries the argument. See
`34_DEVELOPMENT_LOG.md` 2026-09-04; its **Surprises** 1 and 3 are the ones
worth reading.

Suite **342 → 349 pass / 0 fail across 89 suites**. `lint`, `lint:rules`,
`lint:docs`, `typecheck` all clean.

## Next action for an agent

The topmost unblocked task in Phase 0's Ready list, per
`AI_DEVELOPMENT_WORKFLOW.md` §2.

**Read the file, do not trust this line.** In list order:

- **BL-056** is still **Phase 1** — not a candidate under phase discipline.
  Fourteenth session running.
- **BL-067** is still the one to skip, **on its own instruction** rather than
  on your judgement. Re-checked this session with the one grep the previous
  handoff names: `23_SAVE_SYSTEM.md` mentions `EntitySave` exactly once (§2,
  line 38) and defines it nowhere, so there is still no *component-level*
  format, which is what BL-067's first criterion presumes.
- **BL-063** — done, this session, and moved to Done rather than marked in
  place (BL-062's precedent; the Ready list still carries four older items
  marked `**DONE**` in place, which is an inconsistency in the file, not a
  second convention to copy).
- **BL-065** is now the topmost that is actually ready.

Then **BL-072**, **BL-073**, then **BL-008**.

## Why BL-065 is a reasonable next task, and what makes it larger than it looks

BL-065 is `QueryCache.query` taking `ComponentDef<never>` — the *bottom* of the
def family, which nothing but itself is assignable to under
`exactOptionalPropertyTypes` — where the correct parameter is the *top*,
`ComponentDef<unknown>`, because a query never reads a def's value type.

Two things to know before starting, both learned adjacent to it:

1. **The direction is already settled and written down.** Decision 0027 chose
   exactly this widening one level up for `ErasedStore`, and recorded the
   reasoning: every member a query uses is covariant in `T`, so a
   `ComponentDef<T>` satisfies the widened type structurally with no assertion.
   0027 also says in as many words that it *does not* solve BL-065. Read it
   first; you are applying a decided principle, not making a new decision.
2. **Its criteria reach into two other files.** `World.query`'s erasing cast
   and `Query.test.ts`'s `anyDef<T>` helper are both named for deletion. Note
   that `Query.limit.test.ts`, added this session, carries **its own copy of
   `anyDef<T>`** — so that is a third call site the criteria do not name, and
   deleting only the two named ones leaves the helper alive next door.

`Query.test.ts` is at **499 of 500 lines** and `Query.limit.test.ts` at 169.
Deleting `anyDef` shortens the first, so BL-065 has room; anything that *adds*
to `Query.test.ts` does not, and decision 0029 is explicit that this is the
rule working rather than a problem to route around.

## The standing question, unchanged

**Five** `S` items now sit ahead of **BL-008**, the `M` the phase is actually
for. Every one of them was filed by a previous session against code it had just
written, which is the backlog working as intended — but a phase that only ever
services its own discoveries does not reach its exit criteria. Worth a human
deciding whether BL-008 should be pinned ahead of the `S` queue.

