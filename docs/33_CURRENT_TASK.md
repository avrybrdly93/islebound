# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `.github/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IDLE

## Current task

**None.** BL-002 is complete (see the `34_DEVELOPMENT_LOG.md` entry for 2026-08-05 and `Recently completed` below).

**Next action for an agent:** read `.github/AI_DEVELOPMENT_WORKFLOW.md`, then `docs/32_BACKLOG.md`, and pick **BL-003** (Vite app shell with a canvas and a black screen) — the topmost unblocked task in Phase 0's Ready list.

Two things BL-003 inherits from BL-002 and should not rediscover:
- `pnpm lint` and `pnpm lint:rules` both run now, and `lint:rules` is the one that fails if a rule stops matching. Run both.
- The React overlay BL-003 mounts makes **BL-046** (`eslint-plugin-react-hooks`) actionable, and the `dangerouslySetInnerHTML` fixture already exercises `.tsx` parsing.

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
| BL-002 | 2026-08-05 | — | ESLint flat config + `04` §5 boundary table + three custom bans; `pnpm lint:rules` proves each rule fires. The boundary rule was silently enforcing nothing until the import resolver was configured — see the log's Surprises |
| BL-001 | 2026-08-04 | — | pnpm workspace scaffolding; `_scaffold.ts` markers under core/sim/render/ui/content to be deleted by the tasks that fill those dirs |
