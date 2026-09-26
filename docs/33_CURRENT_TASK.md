# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IDLE

No task in progress. **BL-078 is complete** (2026-09-26).

The allocation boundary now sees an operation that allocates once per thousand
calls. `34_DEVELOPMENT_LOG.md` 2026-09-26 and decision **0040** carry the detail;
its **Surprises 1 and 2** are the ones that change what a later session does.

**What landed:** `DEFAULT_SAMPLING_INTERVAL` 1024 → 256, `MAX_STRAY_SAMPLES`
untouched at 4, and a new `core/math/allocationControls.ts` +
`allocationControls.test.ts` holding a **second control** — a sparse allocator,
asserted in the same process and the same run as the per-call one. Suite
**372/90 → 381/91**; runtime **3.96 s → 5.34 s**, which is the finer interval and
is the price.

**The one sentence to read before touching any of it:** the fix worked because a
stray is **one sample**, so four intervals is four *samples* at any interval,
while a sparse allocator's reading in **bytes** is nearly interval-independent
(the profiler's attribution saturates). A finer interval therefore multiplies the
sparse allocator's sample count and leaves BL-074's tolerance where it was.
**Coarsening the interval back for speed undoes BL-078 and nothing else about the
suite will look wrong** — except that
`assertInstrumentResolvesSparseAllocator` fails, loudly, with its own diagnosis.
That is the guard; do not route around it.

`lint`, `typecheck`, `test`, `lint:rules` and `lint:docs` all clean. Twenty
consecutive full-suite runs green, which is how criterion 1 was met rather than
asserted.

## Next action for an agent

**Read `32_BACKLOG.md` in its own order, do not trust this list.** But read the
paragraph after it before you choose, because this is the seventh time.

- **BL-056** is still **Phase 1** — not a candidate under phase discipline.
  Twenty-fifth session running.
- **BL-067** is still the one to skip, **on its own instruction** rather than on
  your judgement: `23_SAVE_SYSTEM.md` mentions `EntitySave` exactly once (§2) and
  defines it nowhere, so there is still no component-level format for its first
  criterion to presume. Re-checked 2026-09-26 — unchanged.
- **BL-084** still depends on **BL-019**, unchanged.
- **BL-085** and **BL-086** are new this session and are BL-078's own follow-ups.
  **Seven consecutive sessions of that pattern. See below.**
- **BL-008** (fixed-timestep game loop) is the first substantial feature item and
  is now the topmost item with nothing in front of it.

## Take BL-008. Do not take BL-085 or BL-086.

The previous handoff's standing instruction fired on BL-083's sixth follow-up and
said to take BL-078 or BL-008. **BL-078 is now done, so BL-008 is what is left of
that instruction**, and the chain has produced a seventh and eighth follow-up in
the meantime (BL-079 → … → BL-084 → BL-085, BL-086).

Every one of those was a real defect and every one closed properly, so no
individual choice was wrong — which is exactly why the chain does not stop one
item at a time. **Phase 0's feature items have not moved in seven sessions.**
BL-008 is an M, depends only on BL-059 (done), and its three criteria are
measurable without any instrument being built first.

**Both new follow-ups are genuinely fine to leave, and for stated reasons.**
BL-085 is a cost trade rather than a defect to fix — nothing in this repository
allocates on a per-frame path at all today, so the decade it cannot see is
unoccupied, and the next factor of four costs about 12 s on a 5.3 s suite.
BL-086's target is a **one-in-three** event, which is why BL-078's own control
for it came back green; a flaky guard is worse than none, so it wants thought
rather than speed.

If you take either anyway, do it knowing that is a choice against this paragraph,
and say so in `34`.

## If you take BL-008, three things about this tree

1. **`sim/` purity is enforced by lint only** until BL-017 —
   `tools/check-sim-purity.ts` does not exist. `CLAUDE.md` says so; believe it
   rather than the filename.
2. **`pnpm sim` and `pnpm check:bundle` do not exist** (BL-014, BL-018), so the
   verify block's lines 2 and 3 exit "command not found" and the run is still
   green. `pnpm lint:docs` is what keeps that paragraph true.
3. **A fixed-timestep loop is the first thing in this repository with a
   per-frame path**, which means it is the first real consumer of the allocation
   harness rather than a test of it. `allocation.test.ts` and
   `EventBus.queued.test.ts` are the two patterns to copy; note that scratch
   objects must hold **doubles, not integers** (`{x: 0.5}`, not `{x: 0}`) or the
   measurement is about your scratch object rather than about the loop.

## Before you trust anything below, install

`pnpm install --frozen-lockfile` first. This container arrived with
`node_modules` absent **again** — ninth session running — and the first
`pnpm lint && pnpm typecheck && pnpm test` without it fails with
`ERR_MODULE_NOT_FOUND`, which reads exactly like a broken tree and is not one.
After installing, the baseline this session measured was **372/90**, matching the
previous session's close-out on every count; it closed at **381/91**. No lockfile
change this session.

## What is red

Nothing.

The **`allocation.test.ts` 1-in-20 remains fixed rather than mitigated** —
BL-074's allowance of four sampling **intervals**, unchanged by BL-078. Green
again, and this session ran the full suite **twenty consecutive times** with 381
passes each. **If it does go red, the number in the message is the thing to
read**, and since BL-078 read it in *intervals* rather than in bytes: under 4
intervals (1024 bytes at the current interval) is a new phenomenon, well over it
is a real allocation.

## Nine things carried forward that a later session should not rediscover

1. **A number pinned in one unit is pinned to the calibration that unit came
   from.** BL-078's finding. `allocation.test.ts` pinned two real strays as
   `1344` and `1040` bytes; they were 1.3 and 1.0 *samples*, and a stray is one
   sample whatever the interval. The byte form only ever asserted anything at the
   interval it was measured at, and moving the interval turned it into a claim
   about a stray five times larger than any observed. **Before pinning a measured
   number, ask what it is a multiple of.**
2. **A guard cannot live inside the thing it guards.** BL-079's finding, and it
   decided a real question again: chaining `pnpm lint:rules` into `pnpm lint` is
   exactly how 0033 and 0035 made `format:check` unskippable, and it is wrong
   here, because `lint:rules` exists to catch a broken `eslint.config.js` and the
   edit it guards against would delete the guard with it. **Before choosing where
   a check lives, ask what the change you fear would do to the check itself.**
3. **This repository keeps producing one defect: a rule it states and does not
   check.** BL-077, BL-079, BL-080, BL-081, BL-082, BL-083, BL-084, and now
   **BL-078 in its other form — a limitation the harness's own header described
   in prose while nothing made it visible or reversible.** Eight sessions running.
   When you next write a rule down, write down what fails when it is broken — and
   then ask what runs *that*.
4. **A green run of a checker does not verify the checker.** After wiring any new
   gate, break something once. Applied again this session, eight times.
5. **A control that produces no failure is either a missing test or a
   mis-specified control — and sometimes neither.** BL-078 sharpened this: a
   control whose target is a **one-in-three** event cannot be demonstrated either
   way by one mutant run, so it is neither a gap in the tests nor a passing
   control. It is a statement that the risk needs a different *kind* of check.
   Record it; do not count it.
6. **A session's report of a known defect's extent is only as good as the gate
   that measures it** (BL-077) — and BL-078 adds: only as good as the **container**
   it measured on. The sparse case reads *louder* here than on the reference
   container, so this machine alone would have made the defect look absent.
7. **Rank an option by what it touches, not by how large it sounds — and find out
   by running it.** BL-081's finding. BL-078's version: the two axes the item
   named as obvious were both measurable in twenty minutes, and the one the item
   listed first (a longer window) turned out to *saturate the instrument* rather
   than merely cost more.
8. **A control has to be checked against the thing it is controlling for, not
   merely observed to fail** (BL-082) — and two controls must differ on exactly
   one axis. BL-078's per-call and sparse fixtures come from **one factory
   differing only in `period`** for that reason: two hand-written closures would
   let "the sparse one reads lower" be a fact about the fixtures.
9. **A rule that fires on your own new code is the rule working.** BL-083's
   type-aware fixture landed four days ago; this session's first attempt at
   asserting a bound was rejected as a condition TypeScript can fold, and the
   honest fix — assert it in bytes, the unit it is applied in — made the
   assertion *better* rather than merely legal. The instinct to reach for a
   disable comment is the one to distrust.
