# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `.github/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IN_PROGRESS

## Current task
**BL-003** — Vite app shell with a canvas and a black screen
- **Phase:** 0
- **Started:** 2026-08-09
- **Branch:** worked directly on `main` (Phase 0 has no PR flow yet; BL-019 adds CI)
- **Docs read:** 04, 05, 06, 07, 08, 29, 35, AI_DEVELOPMENT_WORKFLOW
- **Estimated size:** S

### Plan
1. Add React 18 to `@halcyon/client` — a *runtime* dependency, but one `04` §3 already
   names as binding ("UI | React 18 + a thin custom store, DOM overlay only"), so this
   implements an approved decision rather than making a new one. `@vitejs/plugin-react` and
   the `@types/react*` packages come with it as dev dependencies; the plugin is what makes
   Fast Refresh work, which is an acceptance criterion.
2. `index.html`: a full-window `<canvas>` and an overlay `<div>` for the React root, plus the
   base stylesheet.
3. `src/render/canvas.ts`: attach to the canvas, and resize its **drawing buffer** to
   `cssSize × devicePixelRatio`. The pixel-ratio arithmetic goes in a pure exported function
   so it is testable the moment BL-015 lands a runner.
4. `src/ui/App.tsx` + `src/ui/mountOverlay.tsx`: the React overlay root. Nothing visible yet —
   BL-013's dev overlay and the HUD are later tasks.
5. `src/main.ts`: replace BL-001's scaffold entry with the real bootstrap. Delete
   `render/_scaffold.ts` and `ui/_scaffold.ts` (BL-001 said the task that fills a directory
   deletes its marker); `core/`, `sim/` and `content/` keep theirs for BL-004/005.
6. Verify: `pnpm lint`, `pnpm lint:rules`, `pnpm typecheck`, `pnpm build`, plus a real
   headless-Chromium check of the three acceptance criteria.

### Progress
- [ ] Step 1 — React dependency
- [ ] Step 2 — index.html + base stylesheet
- [ ] Step 3 — canvas sizing
- [ ] Step 4 — React overlay root
- [ ] Step 5 — main.ts bootstrap
- [ ] Step 6 — verification

### Decisions made during implementation
*(filled in as they happen)*

### Discovered work (added to backlog, NOT done in this task)
*(filled in as it is found)*

### Blockers
- None. **But note what cannot be run yet:** `35` §4.9 requires the full test suite plus
  `pnpm sim --assert-hash` before a task is marked done, and neither exists at this point in
  Phase 0 — the test runner is BL-015, the sim harness BL-014, both below this task in the
  Ready list. The gates that do exist (`lint`, `lint:rules`, `typecheck`, `build`) are all
  that can be run, and the log entry says so rather than implying a suite passed.

### Notes for the next session
*(filled in at handoff)*

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
| BL-002 | 2026-08-07 | — | ESLint flat config (boundaries default-deny), Prettier per `06` §2, `pnpm lint:rules` fixture harness; filed BL-045/046/047 |
| BL-001 | 2026-08-04 | — | pnpm workspace scaffolding; `_scaffold.ts` markers under core/sim/render/ui/content to be deleted by the tasks that fill those dirs |
