# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `.github/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IN_PROGRESS

## Current task
**BL-002** — Configure ESLint, Prettier, and the boundary rules
- **Phase:** 0
- **Started:** 2026-08-06
- **Branch:** claude/ecstatic-bohr-ahk3v2
- **Docs read:** 04 (§3 dependency policy, §5 module boundaries), 05, 06 (§2 style), 07, 29, 35
- **Estimated size:** M

### Plan
1. Dev dependencies only (`04` §3 allows this; no runtime dependency is added): eslint, @eslint/js, typescript-eslint, eslint-plugin-boundaries, eslint-plugin-import, eslint-plugin-react-hooks, prettier, eslint-config-prettier.
2. `.prettierrc.json` matching `06` §2 exactly: printWidth 100, singleQuote, semi, trailingComma all.
3. Root flat `eslint.config.js`: typescript-eslint strict-type-checked (type-aware), `eslint-plugin-boundaries` encoding `04` §5's import-direction table verbatim, import plugin, react-hooks, and the three custom bans (`Math.random`, `dangerouslySetInnerHTML`, `new THREE.*` inside `update*`/`sync*`/`step*`), plus the `sim/` purity overrides from `04` §5's hard rule.
4. Fixture-per-rule check: one deliberately-violating file per custom rule under `tools/lint-fixtures/`, and `tools/check-lint-rules.mjs` running ESLint's Node API over them and asserting the expected rule fires (and only fires where expected).
5. `pnpm lint`, `pnpm lint:rules`, `pnpm format`, `pnpm format:check` scripts.

### Progress
- [ ] Step 1 — deps
- [ ] Step 2 — prettier config
- [ ] Step 3 — eslint flat config
- [ ] Step 4 — fixture checks
- [ ] Step 5 — scripts + verification

### Decisions made during implementation
- (recorded as they are made)

### Discovered work (added to backlog, NOT done in this task)
- (none yet)

### Blockers
- None

### Notes for the next session
`pnpm test` does not exist yet (that is BL-015, which depends on BL-004), so BL-002's "a fixture test per rule" is implemented as a standalone Node script rather than a Vitest suite. It should be folded into the Vitest suite when BL-015 lands.

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
| BL-001 | 2026-08-04 | — | pnpm workspace scaffolding; `_scaffold.ts` markers under core/sim/render/ui/content to be deleted by the tasks that fill those dirs |
