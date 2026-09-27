# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IDLE

No task in progress. **BL-008 is complete** (2026-09-27).

This repository has a fixed-timestep loop. `34_DEVELOPMENT_LOG.md` 2026-09-27
and decisions **0041** and **0042** carry the detail; its **Surprises 1, 2 and
4** are the ones that change what a later session does.

**What landed:** `core/Loop.ts` and `core/browserFrameHost.ts`, plus
`Loop.test.ts`, `Loop.guards.test.ts` and `Loop.testFixtures.ts`. Six new
files, **no existing file touched**. Suite **381/91 → 408/97**; runtime
unchanged at ~4.6 s. All three criteria measured rather than asserted.

**The one sentence to read before touching any of it:** `04` §4.1's `acc +=
delta` sketch **loses a step every ten seconds and loses it faster the higher
the frame rate**, so the loop derives its budget from an absolute base
(`epochMs`, `lostMs`, `stepsThisEpoch`) instead. Rewriting it back to the
accumulator "to match the doc" is the one change that looks like tidying and is
not — the doc's code block says *"shape, not final code"*, and the three-rate
case in `Loop.test.ts` fails immediately, which is the guard. Do not route
around it.

`lint`, `typecheck`, `test`, `lint:rules`, `lint:docs` and `build` all clean.
`pnpm sim` and `pnpm check:bundle` still do not exist (BL-014, BL-018) and the
run is still green, exactly as `AI_DEVELOPMENT_WORKFLOW.md` §6 says to expect.

## Next action for an agent

**Read `32_BACKLOG.md` in its own order, do not trust this list.** But read the
paragraph after it before you choose.

- **BL-056** is still **Phase 1** — not a candidate under phase discipline.
  Twenty-sixth session running.
- **BL-067** is still the one to skip, **on its own instruction** rather than
  on your judgement: `23_SAVE_SYSTEM.md` mentions `EntitySave` exactly once
  (§2) and defines it nowhere, so there is still no component-level format for
  its first criterion to presume. Re-checked 2026-09-27 — unchanged.
- **BL-084** still depends on **BL-019**, unchanged.
- **BL-085** and **BL-086** were left again, deliberately, for the reasons the
  previous handoff gave and `32` still carries. They are a cost trade and a
  one-in-three event, not defects blocking anything.
- **BL-087** and **BL-088** are new this session and are BL-008's own
  follow-ups. **See below — the chain did not break, it changed shape.**
- **BL-009** (service registry and config) is the topmost item with nothing in
  front of it.

## Take BL-009. The follow-up chain is now nine, and it is not the same chain.

The previous handoff's standing instruction fired and was obeyed: BL-008 was
taken over BL-085 and BL-086, and it was **a feature item, the first in seven
sessions**. That instruction is now discharged.

But BL-008 filed two follow-ups of its own, so the count of consecutive
sessions ending with new `BL-###`s is nine. **That is not the same phenomenon
and should not be read as one.** BL-079 through BL-086 were all *the same
defect* — a rule this repository states and does not check — found in eight
places. BL-087 is a ninth instance of exactly that and should be folded into
**BL-017**'s `sim/` purity gate rather than built separately. **BL-088 is a
different kind entirely**: it is not a defect at all, it is the honest record
that BL-008's criteria have been verified against a scripted clock and never
against a real browser, and it is blocked on BL-011 by construction.

So the standing instruction does not need re-issuing in its old form. What
replaces it: **BL-009, BL-010 and BL-011 are three small feature items in a
row**, and taking them in order is what moves Phase 0. If a session finds
itself about to take a `[BL-0]8x` follow-up instead, that is the choice against
this paragraph, and it should say so in `34`.

## If you take BL-009, four things about this tree

1. **`sim/` purity is enforced by lint only** until BL-017 —
   `tools/check-sim-purity.ts` does not exist. `CLAUDE.md` says so; believe it
   rather than the filename.
2. **`pnpm sim` and `pnpm check:bundle` do not exist** (BL-014, BL-018), so the
   verify block's lines 2 and 3 exit "command not found" and the run is still
   green. `pnpm lint:docs` is what keeps that paragraph true.
3. **`04` §5's `core → (nothing)` is binding and it bites.** BL-008 hit it on
   its first line: §4.1's own sketch, transcribed literally, imports `sim/` and
   `render/`. A config loader in `core/` reading `shared/content/config.ts` is
   the next place it will come up — `04` §5 allows `sim → content` and says
   nothing about `core → content`, so settle that before writing the import,
   not after.
4. **An injected dependency is how a criterion about the environment becomes
   checkable.** BL-008's clock and scheduler are the pattern; BL-009's
   "hot-reload in dev without a page refresh" is the same shape of criterion
   and will want the same treatment.

## Before you trust anything below, install

`pnpm install --frozen-lockfile` first. This container arrived with
`node_modules` absent **again** — tenth session running — and the first
`pnpm lint && pnpm typecheck && pnpm test` without it fails with
`ERR_MODULE_NOT_FOUND`, which reads exactly like a broken tree and is not one.
After installing, the baseline this session measured was **381/91**, matching
the previous session's close-out on every count; it closed at **408/97**. No
lockfile change this session.

## What is red

Nothing.

The **`allocation.test.ts` 1-in-20 remains fixed rather than mitigated** —
BL-074's allowance of four sampling **intervals**, unchanged by BL-078 and
untouched here. **If it does go red, the number in the message is the thing to
read**: under 4 intervals (1024 bytes at the current interval of 256) is a new
phenomenon, well over it is a real allocation.

## Ten things carried forward that a later session should not rediscover

1. **A fixture simpler than the thing it stands in for can make a real property
   unobservable, and every test still reads correct.** BL-008's finding.
   `ManualHost` held one pending frame callback; a real `requestAnimationFrame`
   queues them. `Loop.start()`'s idempotence was therefore untestable — the two
   chains of frames a non-idempotent `start` creates merged back into one
   inside the fixture — and the mutant that removed the guard passed all 27
   cases. **When a mutant survives, suspect the fixture before the assertion.**
2. **A guard that floors a value at zero will hide an error of exactly the kind
   it was written to tolerate.** BL-008's second finding. `Math.max(budget, 0)`
   exists to absorb float noise; it also absorbed a permanently negative budget
   caused by two step counters disagreeing about where zero is, and turned a
   loop that had stopped stepping forever into silence.
3. **A number pinned in one unit is pinned to the calibration that unit came
   from.** BL-078's finding. **Before pinning a measured number, ask what it is
   a multiple of.** BL-008 is the same lesson in a new place: `DT` is 1/30,
   binary64 cannot hold it, and a sum of 300 of them is not 10.
4. **A guard cannot live inside the thing it guards.** BL-079's finding.
   **Before choosing where a check lives, ask what the change you fear would do
   to the check itself.**
5. **This repository keeps producing one defect: a rule it states and does not
   check.** BL-077, BL-079–BL-084, BL-078's other form, and now **BL-087**.
   Nine sessions. When you next write a rule down, write down what fails when it
   is broken — and then ask what runs *that*.
6. **A green run of a checker does not verify the checker.** After wiring any
   new gate, break something once. Applied again this session, eleven times.
7. **A control that produces no failure is either a missing test or a
   mis-specified control — and sometimes neither.** BL-078. BL-008 adds the
   fourth possibility and it was the common one: **a probe too small to
   discriminate.** A ten-millisecond backwards clock jump and a one-second one
   differ by whether the naive and the correct loop can behave differently at
   all.
8. **A session's report of a known defect's extent is only as good as the gate
   that measures it** (BL-077) — and as good as the **container** it measured
   on (BL-078).
9. **Rank an option by what it touches, not by how large it sounds — and find
   out by running it** (BL-081). BL-008's version: the accumulator drift was
   found by writing the criterion's test literally, not by reasoning about
   floats.
10. **A rule that fires on your own new code is the rule working** (BL-083).
    BL-008 met `@typescript-eslint/unbound-method` on a per-frame callback and
    `no-non-null-assertion` five times in its own tests; every fix made the
    code better rather than merely legal. **The instinct to reach for a disable
    comment is the one to distrust.**
