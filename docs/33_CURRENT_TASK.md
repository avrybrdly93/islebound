# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `.github/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IN_PROGRESS

## Current task
**BL-002** — Configure ESLint, Prettier, and the boundary rules
- **Phase:** 0
- **Started:** 2026-08-05
- **Branch:** claude/ecstatic-bohr-z81g8p
- **Docs read:** AI_DEVELOPMENT_WORKFLOW, 32, 33, 34 (tail), 35, 04 §5, 05, 06, 07
- **Estimated size:** M

### Plan
1. Add the dev dependencies at the root: `eslint`, `typescript-eslint`, `eslint-plugin-boundaries`, `eslint-plugin-import`, `eslint-config-prettier`, `prettier`. No runtime dependencies.
2. `.prettierrc.json` matching `06` §2 exactly (`printWidth: 100`, `singleQuote: true`, `semi: true`, `trailingComma: 'all'`), plus `.prettierignore`.
3. `eslint.config.js` (flat): `@typescript-eslint` strict-type-checked with type information, `eslint-plugin-import`, and `eslint-plugin-boundaries` encoding the `04` §5 import-direction table for all nine element types (`core, sim, render, ui, audio, input, platform, content, dev`) — including the ones whose directories do not exist yet, so the rule is right the day they appear.
4. The three custom bans via `no-restricted-syntax` rather than a hand-written plugin: `Math.random`, `dangerouslySetInnerHTML`, and `new THREE.*` inside `update*`/`sync*`/`step*` functions. One built-in rule beats a bespoke plugin package for three selectors (`35` §5, fewer moving parts).
5. Fixture per custom rule under `tools/lint-fixtures/`, plus `tools/check-lint-rules.mjs`, which lints each fixture through ESLint's Node API and asserts the expected rule fired. `pnpm test` (vitest) does not exist until BL-015, so the fixture check is a script, not a test-framework test.
6. Wire `lint`, `lint:rules`, `format`, `format:check` scripts; verify `pnpm lint` is clean on the existing scaffold.

### Progress
- [ ] Step 1 — dev dependencies
- [ ] Step 2 — Prettier config
- [ ] Step 3 — ESLint flat config + boundaries
- [ ] Step 4 — the three custom bans
- [ ] Step 5 — fixtures + checker script
- [ ] Step 6 — scripts wired, `pnpm lint` green

### Decisions made during implementation
- (recorded as they happen)

### Notes
- `eslint-plugin-react-hooks` is named by `06` §2 but there is no React in the repo until BL-003; deferred rather than configured against nothing. Filed as its own backlog item rather than folded in here.
- The scaffold has no test runner yet (BL-015), which is why acceptance criterion 2 is satisfied by a script rather than by vitest.

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
