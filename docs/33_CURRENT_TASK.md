# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `.github/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IN_PROGRESS

## Current task
**BL-066** — `ComponentRegistry` still exposes no way to enumerate its stores
- **Phase:** 0
- **Started:** 2026-08-29
- **Branch:** claude/sharp-lovelace-nr6dub
- **Docs read:** AI_DEVELOPMENT_WORKFLOW, 32, 33, 34, 35, 04, 05, 06, 07
- **Estimated size:** S

**Why this one and not BL-008.** The previous handoff asked the question
explicitly: four `S` cleanups sit ahead of the `M` the phase is actually for,
and taking BL-008 instead would be "a defensible reading". It is not the
reading `AI_DEVELOPMENT_WORKFLOW.md` §2 gives, which is unusually direct —
*"The topmost unblocked task in the current phase's Ready list. Not the most
interesting one — the topmost one; the ordering is how the human steers."*
BL-056 is Phase 1 and so out under phase discipline; BL-066 is the topmost
Phase-0 item. Taking it.

### Plan
1. Establish the baseline (334/334 before any change).
2. Decide the shape: an enumerator with a stated erased element type, or a
   documented refusal. The deciding question is what the two named callers
   actually need — a save pass (`23`) and a debug overlay (`13`).
3. Implement, with no new `as` in `ComponentStore.ts` (criterion 2).
4. Tests, including one that would fail if the erased surface let a caller
   write through it.
5. Docs: 32, 33, 34, and 40 if the choice is architecturally significant.

### Progress
- [x] Step 1 — baseline 334/334
- [ ] Step 2
- [ ] Step 3
- [ ] Step 4
- [ ] Step 5

### Blockers
- None

---

## Previous status (IDLE) — retained because its handoff notes are still current

No task in progress. **BL-060 is complete** (2026-08-25) — `World.destroyEntity`
now calls `ComponentRegistry.removeEntity` before delegating to the allocator,
so a destroyed entity's slots are gone from every store at the moment of
destruction. Both acceptance criteria met; 334/334 node tests, was 328. See
`34_DEVELOPMENT_LOG.md` 2026-08-25 (BL-060) — its **Surprises** are
load-bearing.

**BL-064 is complete** (2026-08-24) and the query-budget assertion is reliable
again, but the caveat it left still stands: on this container the 0.15 ms
budget is *marginal even idle* (iteration alone ~0.15 ms), and the fix relies on
the single fastest of 5000 samples clearing it. If it flakes again, do not
re-tune the sampling — move to the in-process control (decision 0023).

**There is a tick.** `World.step(dt)` advances it, runs `SYSTEM_ORDER`, and
drains the deferred event queue. `SYSTEM_ORDER` is still empty, so a step is a
no-op with a clock.

## Next action for an agent

The topmost unblocked task in Phase 0's Ready list, per
`AI_DEVELOPMENT_WORKFLOW.md` §2.

**Read the file, do not trust this line.** As of this session `BL-056` still
sits at the top of Ready and is still **Phase 1**, so it is still not a
candidate under the workflow's phase discipline — seventh session running.
After it, the Phase-0 items in list order are **BL-066** (new, filed by this
session), **BL-062**, **BL-063**, **BL-065**, then **BL-008** (the fixed-timestep
game loop, `M`, and the first one that is a feature rather than a cleanup).

Four `S` cleanups in a row ahead of the loop is worth a moment's thought rather
than an automatic descent: **BL-008 is the item the phase is actually for**, and
none of the four blocks it. If a session has the budget for an `M`, taking
BL-008 and leaving the cleanups is a defensible reading of "topmost unblocked" —
but say so in the log, because the workflow's default is list order.

## What BL-060 leaves for the next session

1. **The ordering trap is now documented in three places and is still the thing
   to get wrong.** `ComponentStore.remove` refuses a dead or stale handle, so
   anything that cleans up after a destroy must run *before* the handle dies.
   The reversed order fails 4 test cases today; it failed **none** before this
   session's cases existed, because a destroyed entity's components are
   unreadable either way. Any future "clean up on destroy" work — a save-index
   removal, a spatial-hash eviction — inherits exactly this trap.
2. **`ComponentRegistry`'s store map is now typed `EntityScopedStore`, not
   `unknown`.** That is what let `removeEntity` be written with no type
   assertion. It carries only `remove`, deliberately: it is the erased surface
   the *fan-out* needs, not a general one. A save pass needs more, and widening
   it is **BL-066** rather than a drive-by.
3. **`ComponentStore.prune()` is not dead code and should not be deleted.** It
   is the sweep BL-060 rejected, kept for a store driven directly by an
   `EntityAllocator` with no `World` between them — which is what
   `ComponentStore.test.ts` does. Its doc now carries the comparison, so
   deleting it would take the record of the rejected option with it.
4. **One new test case grades nothing about the fan-out and says so in place.**
   The cached-query case survives all three perturbations, because `QueryCache`
   keys on the allocator's version too. Its load-bearing half is the
   store-`version` assertion beside it. Do not read it as coverage of the
   invalidation path.
5. **The verify block still cannot be run as written.** `pnpm sim --ticks 20000
   --assert-hash` and `pnpm check:bundle` do not exist (BL-014, BL-018), and
   `pnpm test` is `pnpm test:node`. That is **BL-062**, still open, and it is
   the reason every session's verification section has to explain the same
   three absences.

## What BL-061 leaves for the next session

1. **The order is a constructor argument, not an import, and that is decision
   0025 rather than a preference.** `EventBus<M>` is invariant in `M`, so
   `World<M>` is assignable to `World<M2>` for no other `M2` at all — a system
   list and its world must name the *same* event map. Do not "tidy" `World` by
   making it import `SYSTEM_ORDER`; it does not typecheck, and the three
   obvious workarounds were each tried and each produced a real error (see the
   log entry). **When `sim/events/` lands, `SYSTEM_ORDER`'s annotation is the
   single place the event map is named** — change `Record<never, never>` there
   and every `World` built from it follows by inference.

2. **`World.destroyEntity` deliberately stops at the allocator, and a test says
   so by name.** `World.test.ts` → `destroyEntity does NOT reach the stores —
   that is BL-060`. When BL-060 lands, **that case is the one to change**, and
   its failure is the reminder to update `World`'s module comment ("What this
   deliberately does not do") in the same commit. Note `World` holds the
   registry privately and exposes no way to enumerate every store, so BL-060
   has to decide whether it needs one — a `ComponentRegistry.stores()` iterator
   is the obvious shape and does not exist yet.

3. **`World.query` takes `ComponentDef<unknown>`; `QueryCache.query` takes
   `ComponentDef<never>`.** That is not an inconsistency to normalise blindly:
   the cache's parameter is the *bottom* of the family, which nothing but
   itself is assignable to, so every direct caller has to cast — which is why
   `Query.test.ts` carries an `anyDef<T>` helper. `World.query` uses the *top*,
   which is the correct position for something that never reads a def's value
   type, and carries one erasing cast so no system needs one. BL-065 deletes
   even that; do it there, not inline.

4. **`step` does not roll the tick back when a system throws.** The world
   really did partially advance, and a `tick` that disagreed with the state
   would be worse than one that is honest about it. The queue is *not* drained
   in that case, which is the half a caller can rely on.

5. **`emit` is synchronous and `enqueue` waits for the tick boundary**, and a
   test pins the distinction through `World` rather than only through
   `EventBus`. A system that needs another system to see something *this* tick
   emits; one telling the outside world what happened enqueues. Do not make
   `World.step` "helpfully" defer `emit`.

6. **The suite is 328 pass / 0 fail on a good run, and 327/1 on a bad one.**
   The one is always BL-059's query-budget assertion. See BL-064. It is
   pre-existing and it is **frequent**: measured over two 8-run blocks on this
   container, **5 failures in 8 on pre-session `main`** against 2 in 8 with
   this session's changes. Expect to see it; do not spend the time proving it
   is not yours, and do not loosen it.

## What BL-059 left, still current

1. **`QueryCache` holds no tick.** Invalidation is version-keyed, not
   tick-keyed, so `World.tick` is not an input to it. `World.step` does **not**
   clear the cache, and must not — that would fail BL-059's third criterion.
   Decision 0024.

2. **Two `version` counters carry a standing obligation.**
   `ComponentStore.version` bumps on every membership- or order-changing
   mutation; `EntityAllocator.version` bumps on `destroy`. Any *new* mutating
   method on either must bump its counter or the query cache goes silently
   stale. On the store the bump sits on the same lines as the existing
   `sortedCache = undefined`, which is the mitigation — follow that pattern.

3. **`EntityAllocator.create` deliberately does not bump.** A fresh entity is a
   member of no query until some store's `set` says so, and a recycled index
   cannot inherit a component because the dense array holds whole handles. If
   `World` ever gains a path that gives a new entity components *without* going
   through a store's `set` — a save-load that populates dense arrays directly
   is the plausible one — that claim breaks and `create` must start bumping.
   Decision 0024 records this.

4. **The query performance criterion is met on the *cached* path.** 0.0784 ms
   for a cached 10,000 x 6 query against a 0.15 ms budget; computing one cold
   costs 1.00 ms median. So a `step` whose systems destroy and create entities
   freely puts the cold path back in the frame budget — a thing to notice when
   the first real systems land, not something to act on today.

## Read this before writing a class with a constructor

**TypeScript parameter properties do not work in this repository.**

```ts
constructor(private readonly allocator: EntityAllocator) {}   // typechecks, lints, CRASHES
```

`pnpm test:node` runs `node --test` over Node's strip-only type stripping,
which refuses any syntax whose removal changes runtime behaviour:
`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX: TypeScript parameter property is not
supported in strip-only mode`. Declare the field and assign it in the
constructor body instead. Nothing in `06`, `07` or `05` says so.

*(BL-058 said this repository "will now meet it constantly". BL-059 wrote a
two-argument constructor and did not meet it, because this note was here.
Leave it here.)*

## What BL-059 leaves for BL-061

1. **The three pieces and their owners.** `EntityAllocator` owns liveness and
   handles; `ComponentRegistry.store(def)` owns the per-component stores;
   `QueryCache.query(...defs)` owns intersections. `04` §4.3's `World` is the
   assembly — `store` delegates to the registry, `createEntity`/`destroyEntity`
   to the allocator, `query` to the cache. **Do not reimplement any of them**;
   that is BL-061's first acceptance criterion.

2. **`QueryCache` takes `(allocator, registry)` and holds no tick.** It needs
   neither, which is worth knowing before wiring: invalidation is version-keyed
   rather than tick-keyed, so `World.tick` is not an input to it. See decision
   0024 for why, and do not "restore" per-tick clearing — it would fail BL-059's
   third criterion.

3. **Two `version` counters now exist and carry a standing obligation.**
   `ComponentStore.version` bumps on every membership- or order-changing
   mutation; `EntityAllocator.version` bumps on `destroy`. Any *new* mutating
   method on either must bump its counter or the query cache goes silently
   stale. On the store the bump sits on the same lines as the existing
   `sortedCache = undefined`, which is the mitigation — follow that pattern.

4. **`EntityAllocator.create` deliberately does not bump.** The argument is
   that a fresh entity is a member of no query until some store's `set` says
   so, and a recycled index cannot inherit a component because the dense array
   holds whole handles. If `World` ever gains a path that gives a new entity
   components *without* going through a store's `set` — a save-load that
   populates dense arrays directly is the plausible one — that claim breaks and
   `create` must start bumping. Decision 0024 records this.

5. **`World.step(dt)` and the system-order array are the real work in BL-061**,
   not the delegation. `04` §4.3 wants the order to be data in
   `sim/systems/order.ts`, and neither the file nor a system exists yet.

6. **The performance criterion is met on the *cached* path.** 0.0784 ms for a
   cached 10,000 x 6 query against a 0.15 ms budget; computing one cold costs
   1.00 ms median. So a `World.step` that invalidates every query every tick
   (by destroying and creating entities freely, say) puts the cold path back in
   the frame budget. Nothing needs doing about that today — it is a thing to
   notice when the first real systems land.

## What BL-007 and BL-058 left, still current

1. **The handle is one unsigned 32-bit number**: `indexOf(e)` gives the low 20
   bits, `generationOf(e)` the high 12. Store keys are `indexOf(e)`; the dense
   half stores the whole handle so a recycled index cannot inherit.
2. **"Ascending entity order" means ascending *index*, not ascending handle.**
   The generation sits in the high bits, so a numeric handle sort orders by
   generation first, and it agrees with the right answer until the first index
   is recycled. Test with a recycle or the test grades nothing.
3. **`isLive(e)` is the staleness check** and the allocator is its single
   owner. Nothing re-derives it from generation bits.
4. **`retiredCount` climbing under churn is normal**, not a leak.
5. **`NULL_ENTITY` is `0` and is never live.**
6. **Destroying an entity still does not reach the stores.** `ComponentStore.prune()`
   is the interim answer; wiring it into `World.destroyEntity` is BL-060.

## Template — copy this block when starting a task

```markdown
## Status: IN_PROGRESS

## Current task
**BL-###** — Short title
- **Phase:** N
- **Started:** YYYY-MM-DD
- **Branch:** phase-N/short-description
- **Docs read:** 04, 05, 06, 13
- **Estimated size:** M

### Plan
1. …
2. …
3. …

### Progress
- [x] Step 1 — done, commit abc1234
- [ ] Step 2 — in progress
- [ ] Step 3

### Decisions made during implementation
- Chose X over Y because … (add to `40_DECISION_LOG.md` if architecturally significant)

### Discovered work (added to backlog, NOT done in this task)
- BL-046 — …

### Blockers
- None

### Notes for the next session
Anything a fresh agent would need to resume from here without reading the diff.
```

---

## If you are BLOCKED

Set `Status: BLOCKED`, fill in the section below, then **stop working on this task**. Pick a different unblocked task from the backlog and start a new entry — do not leave the project idle, and do not attempt to work around an architectural blocker unilaterally.

```markdown
### Blocked on
- **What:** the specific thing preventing progress
- **Why it can't be worked around:** …
- **Options considered:**
  1. … (cost, risk)
  2. … (cost, risk)
- **Recommendation:** …
- **Needs:** human decision | asset | dependency approval | architecture change approval
```

Blockers requiring human input include: any change to `04_TECHNICAL_ARCHITECTURE.md` §3 or §5, any new runtime dependency, any change to a critical test (`29_TESTING_STRATEGY.md` §4), any change to `00_PROJECT_VISION.md`, and anything that would break save compatibility.

---

## Recently completed

*(last 5 tasks, newest first — full history lives in `34_DEVELOPMENT_LOG.md`)*

| Task | Completed | PR | Notes |
|---|---|---|---|
| BL-064 | 2026-08-24 | — | Query-budget assertion: best-of-N per-sample minimum instead of one block average, so full-suite load stops folding into the number. 40 consecutive clean runs; 0.15 ms budget unchanged. Surprise: this container's iteration alone is ~0.15 ms idle, so the budget is marginal — in-process control (decision 0023) is the next move if it recurs |
| BL-059 | 2026-08-22 | — | ECS-lite part 3 — cached queries, version-keyed invalidation (decision 0024), 0.0784 ms cached against a 0.15 ms budget; landed the two `version` counters BL-058 asked for; filed BL-063 |
| BL-058 | 2026-08-18 | — | ECS-lite part 2 — sparse-set component stores and `ComponentRegistry.store(def)`; filed BL-060/061/062 |
| BL-050 | 2026-08-13 | — | Replaced the allocation instrument with a call-site-attributed one (`HeapProfiler.startSampling`); closed BL-004's last criterion; 0 `todo` remaining; filed BL-053 |
| BL-004 | 2026-08-13 | — | Core math module — all three criteria met; see above |
| BL-003 | 2026-08-09 | — | Canvas + dpr-aware drawing buffer, React overlay (`pointer-events: none`), HMR teardown; verified against headless Chromium at dpr 1/2/3; filed BL-048/049 |
| BL-002 | 2026-08-07 | — | ESLint flat config (boundaries default-deny), Prettier per `06` §2, `pnpm lint:rules` fixture harness; filed BL-045/046/047 |
| BL-001 | 2026-08-04 | — | pnpm workspace scaffolding; `_scaffold.ts` markers under core/sim/render/ui/content to be deleted by the tasks that fill those dirs |
