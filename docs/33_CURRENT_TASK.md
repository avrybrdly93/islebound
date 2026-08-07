# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `.github/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IN_PROGRESS

## Current task

**BL-002** — Configure ESLint, Prettier, and the boundary rules

- **Phase:** 0
- **Started:** 2026-08-07
- **Branch:** committed directly to `main` (this repo's automated sessions push to `main`)
- **Docs read:** workflow, 33, 32, 35, 34 (tail), 04 §5, 05 §6–8, 06 §1–6, 07
- **Estimated size:** M

### Plan

1. Add the root dev dependencies ESLint flat config needs (`eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-boundaries`, `eslint-plugin-import`, `prettier`, `eslint-config-prettier`) and the `lint` / `format` scripts.
2. `.prettierrc.json` matching `06` §2 exactly (`printWidth: 100`, `singleQuote: true`, `semi: true`, `trailingComma: 'all'`), plus `.prettierignore`.
3. `eslint.config.js`: `@typescript-eslint` strict-type-checked (type-aware), `eslint-plugin-import`, and `eslint-plugin-boundaries` encoding the import-direction table from `04` §5 verbatim.
4. The three custom bans from the task description — `Math.random`, `dangerouslySetInnerHTML`, and `new THREE.*` inside `update*`/`sync*`/`step*` functions — via `no-restricted-syntax` selectors rather than a bespoke plugin.
5. A fixture per custom rule under `tools/lint-fixtures/`, plus `tools/check-lint-rules.ts` that lints each fixture through ESLint's Node API and fails unless the expected rule fires. Wired as `pnpm lint:rules`.
6. Verify: `pnpm lint`, `pnpm lint:rules`, `pnpm format:check`, `pnpm typecheck` all green on the scaffold.

### Progress

- [ ] Step 1 — dependencies + scripts
- [ ] Step 2 — Prettier config
- [ ] Step 3 — ESLint flat config + boundaries
- [ ] Step 4 — custom rules
- [ ] Step 5 — fixture harness
- [ ] Step 6 — verification + docs

### Decisions made during implementation

*(filled in as they happen)*

### Discovered work (added to backlog, NOT done in this task)

*(filled in as it is found)*

### Blockers

- None

### Notes for the next session

The task's acceptance criteria mention "a fixture test per rule", but `pnpm test` does not exist yet — the test harness is BL-015. The fixtures are therefore run by a standalone script rather than a test framework, so that BL-002 does not silently pull BL-015 forward.

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
