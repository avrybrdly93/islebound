# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `.github/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IDLE

## Current task

**None.** BL-003 is complete (see `Recently completed` below and the `34_DEVELOPMENT_LOG.md` entry for the full record).

**Next action for an agent:** read `.github/AI_DEVELOPMENT_WORKFLOW.md`, then `docs/32_BACKLOG.md`, and pick **BL-004** (Core math module — now the topmost unblocked task in Phase 0's Ready list).

**Two things worth knowing before you write code:**

1. **`pnpm typecheck` and `pnpm lint` passing does not mean the app builds.** BL-003 found this the hard way: a Vite plugin whose major version did not match the pinned Vite 5 broke `pnpm build` while both other gates stayed green, because neither resolves a plugin's runtime imports. Run `pnpm build` before you call anything done. It is not in CI yet — that is BL-019.
2. **`35` §4.9 asks for the full test suite and `pnpm sim --assert-hash` before marking a task done, and neither exists yet.** The runner is BL-015, the sim harness BL-014, Playwright BL-016 — all below BL-004 in the Ready list. Until they land, the honest gate is `pnpm lint && pnpm lint:rules && pnpm typecheck && pnpm format:check && pnpm build`, plus whatever direct measurement your task's criteria admit. BL-003 measured its browser criteria against a headless Chromium driven by a throwaway script outside the repo and wrote the numbers into `34`; **do that rather than asserting a criterion by inspection**, and file the follow-up (BL-048 is BL-003's) so it becomes a real test later. Say plainly in the log which gates you could not run.

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
| BL-003 | 2026-08-09 | — | Canvas + dpr-aware drawing buffer, React overlay (`pointer-events: none`), HMR teardown; verified against headless Chromium at dpr 1/2/3; filed BL-048/049 |
| BL-002 | 2026-08-07 | — | ESLint flat config (boundaries default-deny), Prettier per `06` §2, `pnpm lint:rules` fixture harness; filed BL-045/046/047 |
| BL-001 | 2026-08-04 | — | pnpm workspace scaffolding; `_scaffold.ts` markers under core/sim/render/ui/content to be deleted by the tasks that fill those dirs |
