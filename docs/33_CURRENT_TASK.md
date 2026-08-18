# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `.github/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IN_PROGRESS

## Current task
**BL-058** — ECS-lite part 2: sparse-set component stores
- **Phase:** 0
- **Started:** 2026-08-18
- **Branch:** pushed direct to `main` (repo convention — see `34`'s recent entries)
- **Docs read:** AI_DEVELOPMENT_WORKFLOW, 32, 33, 34 (last 3), 35, 04, 05, 06, 07
- **Estimated size:** M

Selected as the topmost unblocked task in Phase 0's Ready list. `BL-056` still
sits above it and is still **Phase 1**, so it is still not a candidate under the
workflow's phase discipline — third session running.

### Plan
1. `ComponentDef<T>` + `defineComponent<T>(name)` — a branded, phantom-typed
   descriptor so a def carries its component type without carrying a value.
2. `ComponentStore<T>` — sparse set over **entity index**, holding the full
   handle in the dense array so a recycled index cannot serve the previous
   entity's data.
3. Decide and document the destroyed-handle behaviour per criterion 3 (reject
   or ignore), asymmetrically if that is what is defensible.
4. `ComponentRegistry.store(def)` — the `World.store(def)` accessor of `04`
   §4.3, standing alone because there is still no `World` (BL-007's handoff
   note 6).
5. Tests: the three acceptance criteria, plus perturbations.
6. Docs: `34` entry with surprises, `32` handoff, `33` back to IDLE.

### Progress
- [ ] Step 1
- [ ] Step 2
- [ ] Step 3
- [ ] Step 4
- [ ] Step 5
- [ ] Step 6

### Decisions made during implementation
- (filled in as they are made)

### Discovered work (added to backlog, NOT done in this task)
- (filled in at handoff)

### Blockers
- None

### Notes for the next session
The two things already known to be traps before a line was written, both from
BL-007's handoff:

1. **"Ascending entity order" must mean ascending *index*, not ascending
   handle.** The generation lives in the high 12 bits, so sorting handles
   numerically orders by generation first and index second. A store that sorts
   raw handles passes every test built from freshly created entities and
   reorders itself the moment an index is recycled.
2. **The allocator is the single owner of the liveness judgement** (`isLive`).
   A store must not re-derive it.

---

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
