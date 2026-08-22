# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `.github/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IDLE

No task in progress. **BL-059 is complete** — all three acceptance criteria are
met, with the measured numbers in `32_BACKLOG.md` and the reasoning in
`34_DEVELOPMENT_LOG.md` 2026-08-22 (BL-059).

**ECS-lite is finished.** The allocator (BL-007), the stores (BL-058) and the
queries (BL-059) all exist, which means **BL-061 — assemble the `World` — is
now unblocked, and so are BL-060, BL-008 and BL-014**, all of which have been
waiting on the ECS through three sessions.

## Next action for an agent

The topmost unblocked task in Phase 0's Ready list, per
`AI_DEVELOPMENT_WORKFLOW.md` §2. As of this session that is **BL-061** (assemble
the `World`, S, depends on BL-059 which is now done).

**Read the file, do not trust this line.** `BL-056` still sits above it in
Ready and is still Phase 1, so it is still not a candidate under the workflow's
phase discipline — fourth session running. `BL-060` sits between them and
depends on BL-061, so it cannot go first. The item this session filed (BL-063)
sits below and also depends on BL-061.

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
| BL-059 | 2026-08-22 | — | ECS-lite part 3 — cached queries, version-keyed invalidation (decision 0024), 0.0784 ms cached against a 0.15 ms budget; landed the two `version` counters BL-058 asked for; filed BL-063 |
| BL-058 | 2026-08-18 | — | ECS-lite part 2 — sparse-set component stores and `ComponentRegistry.store(def)`; filed BL-060/061/062 |
| BL-050 | 2026-08-13 | — | Replaced the allocation instrument with a call-site-attributed one (`HeapProfiler.startSampling`); closed BL-004's last criterion; 0 `todo` remaining; filed BL-053 |
| BL-004 | 2026-08-13 | — | Core math module — all three criteria met; see above |
| BL-003 | 2026-08-09 | — | Canvas + dpr-aware drawing buffer, React overlay (`pointer-events: none`), HMR teardown; verified against headless Chromium at dpr 1/2/3; filed BL-048/049 |
| BL-002 | 2026-08-07 | — | ESLint flat config (boundaries default-deny), Prettier per `06` §2, `pnpm lint:rules` fixture harness; filed BL-045/046/047 |
| BL-001 | 2026-08-04 | — | pnpm workspace scaffolding; `_scaffold.ts` markers under core/sim/render/ui/content to be deleted by the tasks that fill those dirs |
