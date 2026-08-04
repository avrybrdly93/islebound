# 35 — AI Agent Rules

Purpose: the binding operating rules for any AI agent working in this repository. `.github/AI_DEVELOPMENT_WORKFLOW.md` describes the *process*; this document describes the *constraints*. When they appear to conflict, this document wins.

---

## 1. The prime directive

> **Leave the repository in a state where a different agent, with no memory of your session, can pick up and continue.**

Every rule below serves this. A brilliant change that only you understand is a net negative.

## 2. Before writing any code

1. Read `.github/AI_DEVELOPMENT_WORKFLOW.md`, `33_CURRENT_TASK.md`, and `32_BACKLOG.md` — in that order.
2. Read `04_TECHNICAL_ARCHITECTURE.md`, `05_CODEBASE_STRUCTURE.md`, `06_ENGINEERING_STANDARDS.md` if you have not this session.
3. Read the system document(s) for the area your task touches. The task's "Docs to read" field lists them.
4. If the documentation contradicts the code, **trust the documentation** and flag the discrepancy in `34_DEVELOPMENT_LOG.md` (type: `note`). If you believe the documentation is wrong, propose the change — do not silently code around it.

## 3. Task discipline

- **Exactly one backlog task per session.** The topmost unblocked Ready task in the current phase, unless a human has pinned a different one in `33_CURRENT_TASK.md`.
- Implement the **smallest complete version** of the task. Complete means: works, tested, documented, integrated. Small means: nothing beyond the acceptance criteria.
- Discovered work goes into the backlog as new `BL-###` items. Never expand scope mid-task, even for a one-line fix in an adjacent file — unless that fix is required for your task's tests to pass, in which case note it in the PR.
- If the task turns out to be mis-sized (an S that is really an L), stop, split it into subtasks in the backlog, complete the first subtask, and note the split.

## 4. Hard prohibitions

These are never permitted, regardless of how reasonable they seem in the moment:

1. **Never weaken, skip, delete or rewrite a critical test** (`29_TESTING_STRATEGY.md` §4, T1–T10) to make a change pass. If a critical test fails, the code is wrong or the situation needs a human.
2. **Never add a runtime dependency** without human approval recorded in `40_DECISION_LOG.md`.
3. **Never modify `00_PROJECT_VISION.md`.** Raise questions in `34_DEVELOPMENT_LOG.md` → "Vision questions".
4. **Never change `04_TECHNICAL_ARCHITECTURE.md` §3 (tech choices) or §5 (module boundaries)** without human approval.
5. **Never break `sim/` purity** — no `three`, DOM, `Math.random`, `Date.now` inside `src/sim/`.
6. **Never change the save schema without a version bump and a migration** with a fixture test.
7. **Never rename or reuse a content ID.** Deprecations go through the alias table.
8. **Never force-push, never rewrite history on `main`, never commit secrets.**
9. **Never mark a task done without the full test suite passing locally**, including `pnpm sim --assert-hash`.
10. **Never delete a player-facing safety property** — the cozy contract (`02` §5) is load-bearing, not decorative.

## 5. When uncertain

- Two reasonable implementations → choose the one with **fewer moving parts**, and record the alternative in `40_DECISION_LOG.md` if the choice is architecturally visible.
- A judgement call the docs do not cover → make the call, mark it clearly in the PR description under "Judgement calls", and add a one-line note to the relevant doc so the next agent inherits the answer.
- Genuine ambiguity about *intent* (what the game should do, not how) → stop, set `BLOCKED` in `33_CURRENT_TASK.md` with the options and your recommendation, pick a different task.

## 6. Code you write

- Follow `06_ENGINEERING_STANDARDS.md` and `07_TYPESCRIPT_GUIDELINES.md` exactly. They are not suggestions.
- Prefer boring code. Cleverness is a cost paid by every future reader, including future you with no memory of today.
- New gameplay logic goes through intents and events (`04` §4.4). If you find yourself mutating world state from `render/` or `ui/`, you have taken a wrong turn.
- Match the style of surrounding code even where the docs are silent.
- Every file you create must land in the location `05_CODEBASE_STRUCTURE.md` §6 prescribes. If no row fits, that is a documentation gap — add the row in the same PR.

## 7. Tests you write

- Write the test that would have caught the bug you are most likely to have just written.
- Test behaviour, not implementation: a test that breaks on a harmless refactor is a liability.
- Scenario tests (`29` §2) for anything spanning systems; unit tests for anything pure.
- Never assert on timing with real clocks; assert on ticks.
- A bug fix without a regression test is not a fix — it is a postponement.

## 8. Session end protocol (mandatory, in order)

1. Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm sim --ticks 20000 --assert-hash`.
2. Commit with a conventional message referencing the task ID.
3. Update `32_BACKLOG.md`: move the task, add discovered work.
4. Update `33_CURRENT_TASK.md`: either `IDLE` or a complete handoff state.
5. Append the entry to `34_DEVELOPMENT_LOG.md` — including the **Surprises** section when anything did not match the docs.
6. Update any documentation your change invalidated.
7. Open/update the PR with the checklist from `06` §7 filled in honestly.

A session that ends without steps 3–5 has damaged the project's continuity even if the code is perfect.

## 9. Interacting with humans

- PR descriptions are written for a human reviewer with limited time: what, why, how to verify, screenshots/GIFs for anything visual, and the preview URL.
- Flag risk explicitly: "this touches the save schema", "this changes a tuning value players will feel", "I was uncertain about X".
- When a human leaves review feedback, address every point or explain why not — never silently ignore a comment.
- Do not flatter, pad, or over-apologise in logs and PRs. Plain, direct, technical.

## 10. Self-check before opening a PR

```
- [ ] One task, smallest complete version
- [ ] All prohibitions in §4 respected
- [ ] Tests written and passing; critical tests untouched
- [ ] sim purity, determinism hash, bundle budget all green
- [ ] Docs updated; DEVELOPMENT_LOG entry written; CURRENT_TASK updated
- [ ] Backlog reflects reality, including discovered work
- [ ] PR description complete, judgement calls listed
- [ ] I would be able to continue this project from only what is committed
```
