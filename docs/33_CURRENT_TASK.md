# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `.github/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IN PROGRESS — BL-069

**The 500-line limit is still unenforced, and three test files are over it.**
Phase 0 · Size S · Docs to read: 06, 29.

Claimed 2026-08-31 as the topmost task that is actually ready, per
`AI_DEVELOPMENT_WORKFLOW.md` §2 and the previous handoff:

- **BL-056** is still at the top of Ready and is still **Phase 1**, so it is
  still not a candidate under phase discipline — tenth session running.
- **BL-067** is the next by list order and is skipped **on its own
  instruction**, not on this session's judgement: its notes say "not urgent,
  and it should not be taken before `23` has a shape", and
  `23_SAVE_SYSTEM.md` still describes no save format that a name-to-def table
  would serve.
- **BL-069** is therefore the topmost-that-is-actually-ready.

## The decision this task contains

The acceptance criteria ask for three things to be *decided*, not just coded.
The choices this session is making, so a reader can disagree with the reasoning
rather than guess at it:

1. **`max-lines` is enabled at the hard limit of 500, as an error, counting
   every line** — blank lines and comments included. `CLAUDE.md` says "≤ 300
   lines soft / 500 hard" with no qualification, and a rule that silently
   discounted comments would be enforcing a different number than the one
   written down.

2. **Test files are in scope.** This is the criterion the item calls out, and
   the tempting answer is the wrong one: a rule scoped to sources only would
   bite nothing at all — the largest source in the tree is 422 lines — while
   nine of the fourteen files over the soft limit are tests. A limit that
   cannot fail is not a limit.

3. **The three files over the hard limit today carry an explicit file-level
   suppression naming a filed follow-on, rather than being split in this
   task.** `35` §3 forbids expanding scope, and splitting three test suites is
   a different task with the silent-content-loss failure mode BL-068 recorded.
   A suppression with a reason is greppable, is visible in the file, and makes
   every *new* file subject to the rule from today. Filed as **BL-070**.

4. **The 300-line soft limit does not become a lint rule.** The item's own
   second criterion makes the argument: a `warn` nothing fails on is noise
   unless somebody reads warnings, and this repository's lint runs in CI, which
   reads exit codes. 300 stays a review-time convention and `CLAUDE.md`
   continues to say so.

## Acceptance criteria — progress

- [ ] `max-lines` enabled at the hard limit and every file either under it or
      explicitly suppressed with a reason and a filed follow-on
- [ ] The soft limit decided, with the reason written down
- [ ] Test-file scope stated explicitly
- [ ] The rule proved to fire, via the repository's own `pnpm lint:rules`
      fixture mechanism
- [ ] Decision recorded in `40_DECISION_LOG.md`

## Baseline measured at session start

`pnpm lint` clean · `pnpm typecheck` clean · `pnpm lint:rules` 4/4 fixtures
caught · `pnpm test:node` **342 pass / 0 fail / 88 suites**. Line counts match
BL-069's filing exactly: `World.test.ts` 547, `EventBus.test.ts` 533,
`Rng.test.ts` 509, `Query.test.ts` 499, largest source 422.

## Still current from BL-066 and BL-068, untouched by this task

1. **A save pass can write itself out and cannot read itself back in.**
   `ErasedStore` has no `set`, because `set` is the one member contravariant in
   the component's `T`. Loading needs a name-to-def table — **BL-067**, which
   nothing owns. **The trap is that the write side works**, so a session could
   build an entire serialiser before meeting the missing half.

2. **`@ts-expect-error` suppresses the compile error and still runs the code.**
   Read the property, do not call the method, when what you mean to assert is
   that the method is absent.

3. **A green suite does not verify a move.** A split that drops a `describe`
   block still runs green. Record the count before and assert it after — this
   matters for BL-070 in particular.

4. **An item names the file somebody noticed, not the worst one.** Measure the
   neighbourhood before deciding what a "this file is over a limit" task is.
