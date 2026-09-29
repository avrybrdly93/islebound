# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IDLE

No task in progress. **BL-010 is complete** (2026-09-29).

`34_DEVELOPMENT_LOG.md` 2026-09-29 and decision **0044** carry the detail; its
**Surprises 1, 2 and 5** are the ones that change what a later session does.

**What landed:** `core/Logger.ts`, `core/Logger.test.ts` and
`tools/check-debug-stripping.test.ts` — and, for the first time since BL-007,
a **modified existing file**: `main.ts`. Suite **430/102 → 451/107**; runtime
5.08 s → **8.29 s**. Both criteria met, with criterion 2's cost stated below
rather than glossed.

**The one sentence to read before touching any of it:**
`tools/check-debug-stripping.test.ts` **parses the dev-only log messages out
of `main.ts`** and fails if it finds none, so deleting the
`if (import.meta.env.DEV)` block from `main.ts` does not make the suite pass —
it fails by name. That is deliberate: the one-assertion version of that test
is green on a repository that never implemented the feature.

**And the one thing not to re-derive:** `vite build --mode development` on its
own emits a bundle with the **same content hash** as the production build.
`vite build` defaults `NODE_ENV` to `production` and Vite reads
`import.meta.env.DEV` from that as well as from `--mode`. The test sets
`NODE_ENV` per arm and says why in a comment; removing that line leaves the
control asserting nothing while staying green.

`lint`, `typecheck`, `test`, `lint:rules`, `lint:docs` and `build` all clean.
`pnpm sim` and `pnpm check:bundle` still do not exist (BL-014, BL-018) and the
run is still green, exactly as `AI_DEVELOPMENT_WORKFLOW.md` §6 says to expect.

## This session pushed to a branch, and `main` does not have the work

**Read this before assuming the tree you cloned is current.** The harness that
runs these sessions assigned `claude/sharp-lovelace-9tnq46` and instructed
that nothing be pushed anywhere else without explicit permission. That is an
instruction to the agent and it is stronger than this repository's own
`CLAUDE.md`, which says to push to `main` and not to leave `claude/*` branches
lying around — so the branch exists, `main` is behind it by six commits, and
**merging and deleting it is a human's one command.** Every previous session
here pushed to `main`; this is a departure and it is recorded rather than left
to be discovered.

## Next action for an agent

**Read `32_BACKLOG.md` in its own order, do not trust this list.** But read the
paragraph after it before you choose.

- **BL-056** is still **Phase 1** — not a candidate under phase discipline.
  Twenty-eighth session running.
- **BL-067** is still the one to skip, **on its own instruction**:
  `23_SAVE_SYSTEM.md` mentions `EntitySave` exactly once (§2) and defines it
  nowhere. Not re-checked this session.
- **BL-084** still depends on **BL-019**, unchanged.
- **BL-085**, **BL-086** and **BL-087** were left again. BL-087 should be
  folded into **BL-017**'s `sim/` purity gate rather than built separately,
  per its own note.
- **BL-088**, **BL-089** and now **BL-090** are the composition-root family —
  three items, one root. **See below.**
- **BL-091** is this session's own cost, filed rather than absorbed, and it is
  **blocked on a destination that does not exist** (BL-018 under BL-019).
  Do not "fix" it by moving the check somewhere nothing runs it; that is
  BL-077's hole, not a fix.
- **BL-011** (Three.js renderer bootstrap) is the topmost item with nothing in
  front of it.

## Take BL-011. The standing instruction has one item left to run.

That instruction was: **BL-009, BL-010 and BL-011 are three small feature
items in a row, and taking them in order is what moves Phase 0.** Two are
done. BL-011 is the third and it is the one the rest of Phase 0 is waiting on
— **BL-012, BL-013 and BL-088 all depend on it**, and BL-088 is what BL-089
and BL-090 are queued behind. It is sized **M** rather than S, which is the
first time this run of three changes shape.

Its three criteria are "grey-box scene renders at 60 fps", "a known sRGB value
round-trips correctly", and "resize does not leak render targets". **The first
and third are the BL-010 shape again** — statements about a browser, from a
suite that runs under `node --test`. Read `08` §9 and `29` before deciding
how, not after. Two of the three answers this repository has already used are
available: inject the environment and file the gap (BL-008, BL-009), or run
the real thing when the real thing is cheap enough (BL-010's two 0.9 s
builds). A **third** may be needed here, because a frame rate is not something
a build produces — and `29` names a Playwright smoke test for visual work,
which nothing in this repository has set up yet. **If that turns out to be a
prerequisite, it is a new `BL-###` and a `BLOCKED` note, not a quiet
expansion of BL-011.**

## BL-088, BL-089 and BL-090 are one wiring pass, probably

All three are "a thing in `core/` that only a composition root can exercise":
`browserFrameHost.ts` since BL-008, `viteConfigHost.ts` since BL-009, and now
`Logger.ts` since this session. They are filed separately because their third
criteria are different observations — a **slow frame**, a **visible tunable**,
and **something outside `main.ts` that logs** — but the root is the same root.
**Check that before building any of them.**

The trap is written into all three items and is the same trap each time: **do
not wire something in just to tick a criterion.** A root that accepts a hot
module and does nothing with it, starts a loop and ignores `alpha`, or
registers a logger nothing reads, has met the letter and left the point
undone.

## The first thing a composition root should do

Register the loop, the config and the logger into a `Services`. That is what
BL-009's two halves and BL-010's logger are for, and today **none of them is
registered anywhere**: `@content/config.ts`'s `tickHz`, `maxCatchUpSteps` and
`maxFrameDeltaMs` are still live data with no consumer, `Loop.ts` still takes
its bounds as arguments, and the logger is a module-scope `const` in `main.ts`
that nothing else can reach.

## Before you trust anything below, install

`pnpm install --frozen-lockfile` first. This container arrived with
`node_modules` absent **again** — twelfth session running — and the first
`pnpm lint && pnpm typecheck && pnpm test` without it fails with
`ERR_MODULE_NOT_FOUND`, which reads exactly like a broken tree and is not one.
After installing, the baseline this session measured was **430/102**, matching
the previous session's close-out on every count; it closed at **451/107**. No
lockfile change this session.

## What is red

Nothing.

The **`allocation.test.ts` 1-in-20 remains fixed rather than mitigated** —
BL-074's allowance of four sampling **intervals**, unchanged by BL-078 and
untouched here. **If it does go red, the number in the message is the thing to
read**: under 4 intervals (1024 bytes at the current interval of 256) is a new
phenomenon, well over it is a real allocation.

**And the suite now costs 8.29 s rather than 5.08 s**, which is not red and is
not noise: `tools/check-debug-stripping.test.ts` runs two Vite builds. BL-091
owns it. A session that sees the number and goes looking for a slow unit test
is looking in the wrong place.

## Twelve things carried forward that a later session should not rediscover

1. **`core/` is the layer that knows *how*, not *what*, and that is what an
   empty allow-list means.** BL-009's finding, and the second time the same
   collision has been resolved the same way (0041, 0043). When a doc sentence
   seems to require a `core → X` import, the answer is an argument, not an
   exception.
2. **A doc that says where data comes from is not describing a module graph.**
   `05` §2 survived BL-009 unedited for this reason.
3. **A criterion about the environment becomes checkable by injecting the
   environment.** BL-008's clock and scheduler, BL-009's reload source. The
   adapter then lands unexercised, and **that gets filed, not claimed** —
   BL-088 and BL-089 are the two standing records of it.
4. **A fixture simpler than the thing it stands in for can make a real
   property unobservable, and every test still reads correct.** BL-008's
   finding: `ManualHost` held one pending frame callback where a real
   `requestAnimationFrame` queues them, so `Loop.start()`'s idempotence was
   untestable.
5. **`04` §4.1's `acc += delta` sketch loses a step every ten seconds and
   loses it faster the higher the frame rate.** Decision 0041. Rewriting the
   loop back to the accumulator "to match the doc" is the change that looks
   like tidying and is not; the three-rate case fails immediately.
6. **`sim:timeDropped` is the loop's event and does not move into
   `sim/events/` when that lands.** Decision 0042 — it is a fact about the
   host machine, and an event that is not reproducible must not sit in a
   stream whose whole value is that it is reproducible.
7. **`EventBus<M>` is invariant in `M`**, so `World<Record<never, never>>` is
   assignable to no other `World<M2>`. Decision 0025, rediscovered by BL-008.
8. **A reading pinned in bytes is pinned to an interval.** BL-078's cost:
   `allocation.test.ts` pinned strays in bytes and they became meaningless
   when the sampling interval moved.
9. **This repository's lint config has opinions about generic *signatures*.**
   `no-unnecessary-type-parameters` rejects a type parameter used once, so
   `register`/`get`/`has` cannot be written symmetrically. Restoring the
   symmetry fails `pnpm lint`.
10. **No surviving mutant is a weaker result than a surviving one, not a
    stronger one.** BL-008 ran eleven and three survived, each a real gap.
    BL-009 ran five and none did, which says those five were covered — not
    that the suite is complete.

11. **An assertion that something is ABSENT needs a companion assertion that
    the instrument can see it when it is PRESENT.** BL-010's finding, and the
    most portable thing this repository has learned in three sessions:
    "the production bundle does not contain X" is green on a repository that
    never implemented X. Decision 0044.
12. **A build flag can be read from two places, and setting one of them is
    not setting it.** `vite build --mode development` emitted a bundle
    byte-identical to the production one because `NODE_ENV` also feeds
    `import.meta.env.DEV`. Compare the two outputs; do not trust the flag.
