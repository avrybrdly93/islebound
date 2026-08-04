# AI Development Workflow

This repository is developed largely by AI agents under human direction. This document is the **process**; `docs/35_AI_AGENT_RULES.md` is the **constraints**. Read both before your first session; re-read this one at the start of every session.

---

## The session loop

```
1. ORIENT   → 2. SELECT   → 3. UNDERSTAND → 4. IMPLEMENT
                                                 │
8. HANDOFF ← 7. DOCUMENT ← 6. VERIFY  ← 5. TEST ┘
```

### 1. Orient
Read, in order: this file → `docs/33_CURRENT_TASK.md` → `docs/32_BACKLOG.md` → the tail of `docs/34_DEVELOPMENT_LOG.md` (last 3 entries). If `33` shows `IN_PROGRESS` from a previous session, resume that task from its handoff notes instead of selecting a new one.

### 2. Select exactly one task
The topmost unblocked task in the current phase's Ready list. Not the most interesting one — the topmost one; the ordering is how the human steers. Move it to In Progress in `32`, and write the starting block in `33` (template is in that file).

### 3. Understand before coding
- Read every doc listed in the task's "Docs to read" field, plus `04`, `05`, `06` if not read this session.
- Read the existing code you will touch. Match its patterns.
- Write the plan (3–7 steps) into `33` before the first line of code. If the plan reveals the task is mis-sized or blocked, handle that now (split it in `32`, or mark `BLOCKED` in `33` and pick another task).

### 4. Implement the smallest complete feature
- Smallest: nothing beyond the acceptance criteria. Complete: works, integrated, no TODOs without backlog IDs.
- All gameplay mutations flow through intents; all state in serialisable components; check `docs/36_MULTIPLAYER_ARCHITECTURE.md` §4 for any gameplay feature.
- **Do not rewrite existing architecture.** If the task seems to require it, stop — that is a `BLOCKED` state needing human approval, per `35` §4.
- **Avoid adding dependencies.** Runtime dependencies require human approval; dev dependencies require justification in the PR.
- Commit as you complete plan steps: focused, conventional messages (`feat(terrain): chunk skirts. Refs BL-029`). One task per PR.

### 5. Write tests
Per the table in `docs/29_TESTING_STRATEGY.md` §9. A bug fix includes a regression test that fails before the fix. Never modify the critical tests (T1–T10) to make anything pass.

### 6. Verify
```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm sim --ticks 20000 --assert-hash
pnpm build && pnpm check:bundle        # if you touched anything bundled
```
All green locally before the PR. If the determinism hash changed intentionally, rebaseline with the reason in the commit body.

### 7. Document
- Update any doc your change invalidated (a behaviour change without a doc change is an incomplete PR).
- Append the entry to `docs/34_DEVELOPMENT_LOG.md` — fill in **Surprises** whenever reality diverged from the docs; that section is how the documentation gets better.
- Architecturally significant choices go to `docs/40_DECISION_LOG.md`.

### 8. Handoff
- `32_BACKLOG.md`: task → Done (date + PR); discovered work added as new `BL-###` items.
- `33_CURRENT_TASK.md`: back to `IDLE`, or a complete resume-state if the task continues next session.
- Open the PR with the checklist from `docs/06_ENGINEERING_STANDARDS.md` §7, screenshots/GIF for anything visual, and judgement calls listed.

---

## Rules distilled (the ones people actually break)

1. **Read all relevant docs before writing code.** The "Docs to read" field is not decorative.
2. **Pick exactly one task from the backlog.** The topmost one.
3. **Implement the smallest complete feature.**
4. **Write tests for new functionality.** Always.
5. **Update `DEVELOPMENT_LOG.md`** with what you did — including surprises.
6. **Update `CURRENT_TASK.md`** so the next session can continue.
7. **Do not rewrite existing architecture without explicit approval.**
8. **Avoid adding dependencies unless absolutely necessary** (runtime deps need approval).
9. **Keep commits focused and descriptive.**

## When things go wrong

| Situation | Action |
|---|---|
| A critical test fails after your change | Your change is wrong. Fix or revert. Never touch the test |
| The docs and code disagree | Trust the docs; log the discrepancy (`34`, type: note) |
| You believe a doc is wrong | Propose the doc change in the PR; do not silently deviate |
| The task needs an architecture change | `BLOCKED` in `33` with options + recommendation; pick another task |
| CI is red on main | Fixing it *is* the top task, regardless of the backlog |
| You are uncertain between two designs | Fewer moving parts wins; record the alternative |

## Phase discipline

The current phase is stated at the top of `32_BACKLOG.md`. No forward-reaching into future phases (`docs/03_FEATURE_ROADMAP.md` §11). Phases are closed by a human after the phase proof demonstrably works and the retro is written.
