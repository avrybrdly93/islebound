# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `.github/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IN_PROGRESS

## Current task

**BL-059** — ECS-lite part 3: cached queries by component signature

- **Phase:** 0
- **Started:** 2026-08-22
- **Branch:** working directly on `main` (this repo has no PR flow for agent runs)
- **Docs read:** AI_DEVELOPMENT_WORKFLOW, 32, 33, 34 (last 3), 35, 04, 05, 06, 07
- **Estimated size:** M

Selected per `AI_DEVELOPMENT_WORKFLOW.md` §2: the topmost unblocked task in
Phase 0's Ready list. `BL-056` still sits above it and is still **Phase 1**, so
it is still not a candidate under phase discipline — fourth session running.
BL-059's dependency BL-058 is done.

### Plan

1. Add the invalidation signal BL-058's handoff note 5 says does not exist yet:
   a monotonic `version` on `ComponentStore`, bumped exactly where
   `sortedCache` is already invalidated (which is precisely "membership or
   order may have changed", so the two cannot drift apart).
2. Add the same on `EntityAllocator`, bumped on `destroy` only — a `create`
   cannot change any query result, and the argument for that is testable.
3. `sim/ecs/Query.ts`: `QueryCache` over an allocator + registry, with an
   order-independent identity-based signature and version-keyed invalidation.
4. Compute by driving from the smallest store's `entities()` and `has()` on the
   rest, per handoff note 4.
5. Tests: the three acceptance criteria, the traps, and a measured performance
   case at 10,000 x 6.
6. Docs: `34` entry, `40` if the caching decision is architecturally visible,
   `32` and `33` handoff.

### Progress

- [ ] Step 1
- [ ] Step 2
- [ ] Step 3
- [ ] Step 4
- [ ] Step 5
- [ ] Step 6

### Decisions made during implementation

*(filled in as they are made)*

### Discovered work (added to backlog, NOT done in this task)

*(filled in at handoff)*

### Blockers

- None

## Read this before writing a class with a constructor

**TypeScript parameter properties do not work in this repository.**

```ts
constructor(private readonly allocator: EntityAllocator) {}   // typechecks, lints, CRASHES
```

`pnpm test:node` runs `node --test` over Node's strip-only type stripping,
which refuses any syntax whose removal changes runtime behaviour:
`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX: TypeScript parameter property is not
supported in strip-only mode`. Declare the field and assign it in the
constructor body instead. Nothing in `06`, `07` or `05` says so, and no module
before `ComponentStore.ts` had a constructor with arguments — so this is the
first time the repository has met it, and it will now meet it constantly.

## What BL-058 leaves for BL-059

1. **The store is `ComponentStore<T>` and the accessor is
   `ComponentRegistry.store(def)`.** A query wants `registry.store(def)` per
   def, then the intersection of their entity sets.
2. **Iterate `store.entities()`, and do not re-sort its output.** It is already
   ascending **by index** and already filtered to live entities. Re-sorting by
   handle would undo both — see the log entry; the generation bits sit above
   the index, so a numeric handle sort orders by generation first.
3. **The cheapest intersection starts from the smallest store.** `store.size`
   is O(1) and includes not-yet-pruned dead slots, so it is an upper bound
   rather than an exact live count — fine for choosing which store to drive the
   loop from, wrong as a result count.
4. **BL-059's criterion is where the performance budget lives** — 10,000
   entities × 6 components ≤ 0.15 ms. `entities()` sorts on first use after a
   mutation and caches; a query that calls it once per component per tick is
   already paying six sorts. Consider driving from the smallest store's
   `entities()` and using `has()` (O(1)) on the rest.
5. **Cache invalidation is the third criterion and it is not free.** The store
   invalidates its *own* sorted view on mutation but tells nobody. A query
   cache needs a signal — a per-store mutation counter is the smallest thing
   that works, and it does not exist yet. Adding it is part of BL-059, not a
   separate task.
6. **`prune()` changes `size` but nothing observable.** A query cache keyed on
   `size` would invalidate on a prune that changed no result. Key on a
   mutation counter, not on size.

## What BL-007 leaves for BL-058 and BL-059

*(BL-058 is done; these six notes are kept because points 3–6 still apply to
BL-059.)*

1. **The handle is one unsigned 32-bit number**: `indexOf(e)` gives the low 20
   bits, `generationOf(e)` the high 12. A component store should key on
   **`indexOf(e)`** — which `ComponentStore`'s *sparse* half does; its dense
   half stores the whole handle so a recycled index cannot inherit.
2. **`isLive(e)` is the staleness check**, and BL-058's third criterion was
   exactly a call to it. The allocator remains the single owner of that
   judgement.
3. **Ascending iteration is by index, and `liveEntities()` is O(capacity)**, a
   scan of the index range. That is deliberate and it is *not* where the
   performance criterion lives — BL-059's cached queries carry the 10,000 × 6
   ≤ 0.15 ms budget, and a query must not be built by filtering
   `liveEntities()` per call if that budget is to be met.
4. **`retiredCount` climbs under heavy churn and that is normal**, not a leak:
   an index whose 4,095 generations are spent is withdrawn rather than wrapped.
   Only `create()` throws, and only when the index space itself is gone.
5. **`NULL_ENTITY` is `0` and is never live.** Safe as an "absent" value in a
   component field, which is why generations start at 1.
6. **There is still no `World` class.** BL-007's handoff asked whether the
   assembly deserves its own item; BL-058 decided it does and filed **BL-061**.
   BL-060 (destroy must reach the stores) depends on it.

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
| BL-050 | 2026-08-13 | — | Replaced the allocation instrument with a call-site-attributed one (`HeapProfiler.startSampling`); closed BL-004's last criterion; 0 `todo` remaining; filed BL-053 |
| BL-004 | 2026-08-13 | — | Core math module — all three criteria met; see above |
| BL-003 | 2026-08-09 | — | Canvas + dpr-aware drawing buffer, React overlay (`pointer-events: none`), HMR teardown; verified against headless Chromium at dpr 1/2/3; filed BL-048/049 |
| BL-002 | 2026-08-07 | — | ESLint flat config (boundaries default-deny), Prettier per `06` §2, `pnpm lint:rules` fixture harness; filed BL-045/046/047 |
| BL-001 | 2026-08-04 | — | pnpm workspace scaffolding; `_scaffold.ts` markers under core/sim/render/ui/content to be deleted by the tasks that fill those dirs |
