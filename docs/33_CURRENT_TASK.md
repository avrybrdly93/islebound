# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IDLE

No task in progress. **BL-009 is complete** (2026-09-28).

`34_DEVELOPMENT_LOG.md` 2026-09-28 and decision **0043** carry the detail; its
**Surprises 1, 2 and 5** are the ones that change what a later session does.

**What landed:** `core/Services.ts`, `core/Config.ts`,
`core/viteConfigHost.ts` and `shared/content/config.ts`, plus
`Services.test.ts` and `Config.test.ts`. Six new files, **no existing file
touched**. Suite **408/97 → 430/102**; runtime 4.87 s → 5.08 s. Both criteria
met, with criterion 2's limit stated below rather than glossed.

**The one sentence to read before touching any of it:** `core/Config.ts`
**loads nothing**, because `04` §5's `core → (nothing)` and `05` §2's
"tunables, loaded from `content/config.ts`" cannot both be obeyed by an
import. Adding `import { CONFIG } from '@content/config'` to `Config.ts` is
the change that looks like finishing the job and is not — `pnpm lint` fails on
it, and decision 0043 says why the boundaries exception is the wrong fix.

**And the one thing not to re-derive:** `05` §2's sentence is **correct** and
was deliberately not edited. It describes where the data comes from, not a
module graph. Rewriting it to say "injected by the composition root" narrows a
true sentence into an implementation detail 0043 already owns.

`lint`, `typecheck`, `test`, `lint:rules`, `lint:docs` and `build` all clean.
`pnpm sim` and `pnpm check:bundle` still do not exist (BL-014, BL-018) and the
run is still green, exactly as `AI_DEVELOPMENT_WORKFLOW.md` §6 says to expect.

## Next action for an agent

**Read `32_BACKLOG.md` in its own order, do not trust this list.** But read the
paragraph after it before you choose.

- **BL-056** is still **Phase 1** — not a candidate under phase discipline.
  Twenty-seventh session running.
- **BL-067** is still the one to skip, **on its own instruction** rather than
  on your judgement: `23_SAVE_SYSTEM.md` mentions `EntitySave` exactly once
  (§2) and defines it nowhere. Re-checked 2026-09-28 — unchanged.
- **BL-084** still depends on **BL-019**, unchanged.
- **BL-085**, **BL-086** and **BL-087** were left again, deliberately. BL-087
  should be folded into **BL-017**'s `sim/` purity gate rather than built
  separately, per its own note.
- **BL-088** and **BL-089** are the composition-root pair. **See below.**
- **BL-010** (logger with a ring buffer) is the topmost item with nothing in
  front of it.

## Take BL-010. The previous handoff's instruction is still running.

That instruction was: **BL-009, BL-010 and BL-011 are three small feature
items in a row, and taking them in order is what moves Phase 0.** BL-009 is
done and nothing about it changed the shape of the other two. If a session
finds itself about to take a `BL-08x` follow-up instead, that is the choice
against this paragraph and it should say so in `34`.

BL-010's two criteria are "ring buffer never exceeds its cap" and "debug calls
are removed from the production bundle (verified by a bundle grep test)".
**The second is the interesting half and it is the same shape as BL-009's
criterion 2** — a statement about a bundler, from a suite that runs under
`node --test`. BL-009 answered that by injecting the port and testing the
adapter for shape only, then filing the gap. **BL-010 cannot do that**: "a
bundle grep test" names the instrument, so it needs a real build output. Read
`29_TESTING_STRATEGY.md` and decide how before writing the logger, not after —
`pnpm build` works today, so the material exists.

## BL-088 and BL-089 are one wiring pass, probably

Both are "an adapter in `core/` that only a composition root can exercise":
`browserFrameHost.ts` since BL-008, `viteConfigHost.ts` since this session.
They are filed separately because BL-088's third criterion needs a **slow
frame** and BL-089's needs a **visible tunable**, which are different
observations — but the root is the same root, and doing them together is one
pass rather than two. **Check that before building either.**

Two traps, both written into the items themselves and repeated here because
they are the same trap: **do not wire an adapter in just to tick a criterion.**
A root that accepts a hot module and does nothing with it, or starts a loop
and ignores `alpha`, has met the letter and left the point undone. Something
visible has to read the thing, or the observation is of nothing.

## The first thing a composition root should do

Register the loop and the config into a `Services`. That is what BL-009's two
halves are for, and today **neither is registered anywhere and nothing reads a
tunable**: `@content/config.ts`'s `tickHz`, `maxCatchUpSteps` and
`maxFrameDeltaMs` are live data with no consumer, and `Loop.ts` still takes
its bounds as arguments. Wiring them is BL-088's, not a tidy-up.

## Before you trust anything below, install

`pnpm install --frozen-lockfile` first. This container arrived with
`node_modules` absent **again** — eleventh session running — and the first
`pnpm lint && pnpm typecheck && pnpm test` without it fails with
`ERR_MODULE_NOT_FOUND`, which reads exactly like a broken tree and is not one.
After installing, the baseline this session measured was **408/97**, matching
the previous session's close-out on every count; it closed at **430/102**. No
lockfile change this session.

## What is red

Nothing.

The **`allocation.test.ts` 1-in-20 remains fixed rather than mitigated** —
BL-074's allowance of four sampling **intervals**, unchanged by BL-078 and
untouched here. **If it does go red, the number in the message is the thing to
read**: under 4 intervals (1024 bytes at the current interval of 256) is a new
phenomenon, well over it is a real allocation.

## Ten things carried forward that a later session should not rediscover

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
