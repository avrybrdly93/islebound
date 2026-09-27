# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IN_PROGRESS — BL-008, Fixed-timestep game loop

Claimed 2026-09-27. Phase 0, size M, depends on BL-059 (done). Docs read: `04`
§4.1/§4.2/§5/§6, `05`, `06`, `09`, `29`, `35`, `36` §4.

**Taken on the previous handoff's standing instruction**, which said BL-008 is
what is left of it once BL-078 landed, and which asked the next session not to
take BL-085 or BL-086 and so continue an eight-item follow-up chain. Both were
left; neither is a defect that blocks anything, and both say so in `32`.
BL-056 is Phase 1 and is skipped for the twenty-sixth session under phase
discipline; BL-067 is skipped on its own instruction, re-checked and unchanged.

Baseline on this container, measured before any edit: **381 passes / 91 suites**,
4.7 s, matching the previous session's close-out exactly. `node_modules` was
absent again — **tenth session running** — and `pnpm install --frozen-lockfile`
fixed it. No lockfile change.

## Acceptance criteria (from `32`)

- [ ] Simulation runs at exactly 30 Hz regardless of render rate (verified at
      simulated 30/60/144 fps)
- [ ] A 10-second tab switch does not produce a burst of catch-up ticks
- [ ] `sim:timeDropped` is emitted when the cap is hit

## Five decisions taken before the first line of code

These are written here first so they cannot be reverse-engineered from whatever
landed. The two marked **architecturally significant** go to `40` as well.

1. **The loop takes `step(dt)` and `render(alpha)` as callbacks and imports
   nothing from `sim/`.** `04` §5 is binding: `core → (nothing)`. `04` §4.1's
   sketch writes `world.step(DT)` and `renderer.render(world, acc/DT)` inline,
   which a literal transcription would turn into a `core → sim` import and a
   `core → render` one. The sketch is a shape, and says so in its own comment.

2. **The clock and the frame scheduler are injected, not reached for.**
   *Architecturally significant.* Criterion 1 says "verified at simulated
   30/60/144 fps" and criterion 2 says "a 10-second tab switch": neither is
   reachable from a test that cannot control time, and `pnpm test` is
   `node --test` with no DOM, so `performance.now` and `requestAnimationFrame`
   are not merely inconvenient here, they are absent. Injection is what makes
   the criteria checkable rather than asserted. The browser wiring becomes a
   default the composition root passes.

3. **`sim:timeDropped` is the loop's own event, on an `EventBus` the loop owns,
   and its map lives in `core/Loop.ts`.** *Architecturally significant.*
   `05` §`sim/events/` is where a `SimEvent` map will live and it is a later
   item — `World.ts`'s own comment says so. Three routes were available and two
   are closed: emitting on `world.events` cannot typecheck, because
   `EventBus<M>` is invariant in `M` and today's `World` carries the empty map
   (decision 0025, rediscovered here rather than inherited); and inventing
   `sim/events/` now is a later item's decision. The third is right on its own
   terms anyway: **this event is about the loop, not about simulation state.**
   It reports that the machine could not keep up, which is a fact about the
   host and not something a replay would reproduce — so it must not be in the
   map that Phase 7 sends over the wire.

4. **The cap is a count of steps per frame, and dropped time is discarded from
   the accumulator rather than carried.** `04` §4.1: "Beyond that, time is
   dropped." Carrying it forward is the spiral-of-death the cap exists to
   prevent — the next frame would start already over budget and drop more.

5. **Per-stage timing is read from the same injected clock as the frame
   timestamps.** A second clock would let the stage timings disagree with the
   frame delta they are a decomposition of, and would need a second injection
   point for tests. `04` §4.1's "per-stage timing instrumentation" is the
   phrase; the stages this loop has are `step` and `render`.

## Plan (7 steps)

1. `core/Loop.ts`: the `LoopClock` / `FrameScheduler` interfaces, the
   `LoopEvents` map, `DT`/`MAX_CATCH_UP_STEPS`/`MAX_FRAME_DELTA` constants, and
   `createLoop`. No browser globals in the module.
2. `core/Loop.test.ts`: criterion 1 at 30/60/144 fps against a scripted clock.
3. Criterion 2: the 10-second gap, asserting the *burst* is bounded and that
   the clamp and the cap are two separate guards with different failure modes.
4. Criterion 3: `sim:timeDropped`, its payload, and that it is **not** emitted
   on a frame that did not hit the cap.
5. The timing instrumentation and its stats, plus the lifecycle (`start`,
   `stop`, idempotence, no tick after `stop`).
6. `docs/09` and `docs/05` touch-ups if the implementation invalidates
   anything; `40` gets decisions 2 and 3 above.
7. `32` → Done, `33` → IDLE, `34` entry with Surprises.

## What is red

Nothing. Baseline 381/91 green.
