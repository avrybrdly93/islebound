# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IN_PROGRESS — **BL-010, logger with a ring buffer**

Claimed 2026-09-29, before any code. Phase 0, size S, depends on BL-001
(done), docs 06 and 30.

**Taken because it is the topmost unblocked item**, and because the previous
handoff's standing instruction — BL-009, BL-010, BL-011 are three small
feature items in a row and taking them in order is what moves Phase 0 — is
still running. Not a `BL-08x` follow-up, so no departure to declare.

### Acceptance criteria, and which half is the work

1. Ring buffer never exceeds its cap.
2. Debug calls are removed from the production bundle, **verified by a bundle
   grep test**.

The previous handoff flagged (2) as BL-009 criterion 2's shape — a statement
about a bundler from a suite that runs under `node --test` — and warned that
BL-010 cannot answer it the way BL-009 did, because "a bundle grep test" names
the instrument. That is right, and the material exists: `pnpm build` takes
**1.8 s** on this container and writes `packages/client/dist`.

### Plan, written before the first line of code

1. `core/Logger.ts`, pure and with **no `import.meta` in it at all** — the
   same property `Config.ts` has and a reader can grep for. Levels, per-module
   tags, a capped ring, an injected sink and an injected clock.
2. `core/Logger.test.ts`, with criterion 1 asserted at and past the cap.
3. Real debug logging in `main.ts`, inside `if (import.meta.env.DEV)`. This is
   the part that makes (2) mean something: **a grep over a bundle that never
   contained a debug call proves nothing.** `main.ts` already uses exactly
   this shape for `import.meta.hot`, whose comment says "the whole block is
   dropped" — so the precedent is the file's own.
4. `tools/check-debug-stripping.test.ts`: build twice, production and
   `--mode development`, and assert the sentinel is **present in the dev
   bundle and absent from the production one**. One-sided absence is the
   result that passes when the feature was never there.
5. Docs: `34`, `32`, `33`, and `40` if the stripping shape is a decision.

### What is deliberately NOT in scope

- **Registering the logger in a composition root.** That is BL-088, which the
  backlog already holds. `main.ts` constructs one directly; a root that owns
  it is that item's work.
- **Production stripping of the logger itself.** `30` §8 attaches "the last
  200 log lines from the ring buffer" to a crash report, so the ring must
  survive into production. Only the *call sites* go.

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
