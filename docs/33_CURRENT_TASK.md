# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `.github/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IN PROGRESS — BL-069

**The 500-line limit is still unenforced, and three test files are over it.**
Phase 0 · Size S · Depends on: — · Docs to read: 06, 29.

Claimed 2026-09-01, before any code. Moved to In Progress in `32_BACKLOG.md`
in the same commit.

## Why this task

`AI_DEVELOPMENT_WORKFLOW.md` §2: the topmost unblocked task in the current
phase's Ready list. Walking the list rather than trusting the previous
handoff, as that handoff itself instructed:

1. **BL-056** — still **Phase 1**, so still not a candidate under phase
   discipline. Tenth session running.
2. **BL-059**, **BL-066**, **BL-068** — done.
3. **BL-067** — skipped, **on its own instruction rather than on my
   judgement**: its notes say "it should not be taken before `23` has a
   shape". Verified rather than inherited, and the previous handoff's wording
   for this needs correcting: it said `23_SAVE_SYSTEM.md` "describes no save
   format", which is **not quite right** — §2 does define a `SaveFile`
   envelope (version, seed, checksum, `entities: EntitySave[]`). What it does
   not define is `EntitySave`. That type is named once, in that interface, and
   appears nowhere else in the document. So there is no component-level
   format at all: nothing says an entity's components are keyed by `def.name`,
   which is precisely the thing BL-067's first acceptance criterion presumes
   ("a save file's `"Transform"` resolves to the `ComponentDef<Transform>`").
   The precondition is genuinely unmet — but for a narrower and more checkable
   reason than "there is no format".
4. **BL-069** — Phase 0, no dependencies, ready. **This one.**

## Objective

Answer BL-069's three acceptance criteria with a decision that is recorded,
not a config edit that reads like one.

## The decision, and the reasoning behind it

**Enable `max-lines` as an `error` at 500 across every TypeScript file,
tests included, counting raw lines; leave the 300-line soft limit advisory and
say so in `CLAUDE.md`.**

Three things drove it:

1. **No source file is over 500 today.** Measured this session, matching
   BL-069's filing exactly: the largest is `allocationHarness.ts` at 422. So
   the sources-only version of this rule would turn on with zero code changes
   — and would enforce the limit *precisely where nobody is breaking it*,
   which is BL-069's own closing observation. A rule that cannot fail is not a
   rule.
2. **Tests are where the limit actually gets broken, and BL-068 already
   showed splitting one is worthwhile.** `ComponentStore.test.ts` was 701
   lines — 70 more than the source everyone was worried about — and split
   cleanly along the same seams. Exempting tests would be exempting the only
   files with a track record of needing this.
3. **Raw lines, no `skipComments`/`skipBlankLines`.** Those options would drop
   all three offenders under the limit and close this item without moving a
   line of code. That is dodging the task, not deciding it: a reader opening a
   700-line file does not feel better on learning 200 of them are comments,
   and this repository's comments are load-bearing enough that discounting
   them would be perverse.

On the **soft limit** (criterion 2): a `warn` at 300 is not enabled. BL-069's
own criterion says a warning nobody reads is noise, and lint here runs in CI
where nobody reads warnings. Fourteen files are over 300 and every one of them
is deliberate. So `CLAUDE.md`'s 300 is restated as what it is — a convention —
rather than left as a number that reads like a rule and is not one.

## Acceptance criteria

- [ ] `max-lines` enabled at the hard limit, and **every** file under it
- [ ] The soft limit is decided explicitly, not left ambiguous
- [ ] Whether test files are in scope is stated explicitly
- [ ] The three over-limit test files are split, not exempted:
      `World.test.ts` (547), `EventBus.test.ts` (533), `Rng.test.ts` (509)
- [ ] `Query.test.ts` (499, one line under) is looked at — it crosses on the
      next case anyone adds
- [ ] Decision recorded in `40_DECISION_LOG.md`
- [ ] **Suite count unchanged at 342 pass / 0 fail, 88 suites.** This is the
      check that matters for a move, per BL-068's Surprise 3: a split that
      drops a `describe` still runs green.

## Baseline measured this session, before any edit

`pnpm lint` clean · `pnpm typecheck` clean · `pnpm test:node` **342 pass /
0 fail across 88 suites**.

Over the hard limit: `World.test.ts` 547, `EventBus.test.ts` 533,
`Rng.test.ts` 509. One under: `Query.test.ts` 499. Over the soft limit and
under the hard: `allocationHarness.ts` 422, `ComponentStore.test.ts` 421,
`Noise.ts` 409, `ComponentStore.ts` 360, `allocation.test.ts` 357,
`PoissonDisk.test.ts` 318, `World.ts` 314, `EventBus.ts` 314,
`ComponentRegistry.test.ts` 304, `Noise.test.ts` 303. Identical to BL-069's
filing — nothing drifted in the intervening session.
