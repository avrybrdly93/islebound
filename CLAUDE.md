# CLAUDE.md — standing context

Halcyon Isle: a browser-based cozy 3D survival-exploration game. Single-player first, drop-in co-op in Phase 7. No combat, no death, no punishing timers.

This file is deliberately short. It points; it does not duplicate. **Read the linked docs.**

## Before you write code, every session

1. `.github/AI_DEVELOPMENT_WORKFLOW.md` — the session loop
2. `docs/33_CURRENT_TASK.md` — resume state, or `IDLE`
3. `docs/32_BACKLOG.md` — take the **topmost unblocked task** in the current phase
4. `docs/35_AI_AGENT_RULES.md` — the constraints
5. The system docs your task names in "Docs to read"

## The rule everything depends on

`src/sim/` is pure: **no three.js, no DOM, no React, no `Math.random`, no `Date.now`/`performance.now`.**
Simulation is deterministic, fixed 30 Hz, intent-in/event-out, headless-runnable, hashable. Presentation reads state and pushes intents; it never mutates. Enforced by lint + `tools/check-sim-purity.ts` in CI.

## Never (without human approval)

- Weaken, skip or delete a critical test (`docs/29` §4, T1–T10)
- Add a runtime dependency
- Change `docs/00_PROJECT_VISION.md`, or `docs/04` §3 (tech) / §5 (boundaries)
- Break `sim/` purity
- Change the save schema without a version bump + migration + fixture test
- Rename or reuse a content ID
- Rewrite architecture — mark `BLOCKED` in `docs/33`, pick another task

## Always

- One backlog task per session; smallest complete version; no scope creep
- Discovered work → new `BL-###` in the backlog, not done inline
- Tests with every change; a bug fix includes a failing-first regression test
- Content is data (`packages/shared/src/content/`) — new fish/recipes/crops/pieces need no code change
- Gameplay features pass the network-safe checklist (`docs/36` §4)
- Durations in ticks, never wall-clock. Randomness via `rngFor(purpose, ...)`
- Iterate `world.query(PlayerTag)` — never assume one player exists

## Verify before every PR

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm sim --ticks 20000 --assert-hash
pnpm build && pnpm check:bundle
```

## End of session (all four, in order)

1. Commit — conventional message, `Refs BL-###`
2. `docs/32_BACKLOG.md` — move the task, add discovered work
3. `docs/33_CURRENT_TASK.md` — `IDLE` or a complete handoff
4. `docs/34_DEVELOPMENT_LOG.md` — entry, including **Surprises** when the docs were wrong

Architecturally significant choices also go in `docs/40_DECISION_LOG.md`.

## Conventions cheat sheet

- Content IDs: `item.pine_plank`, `node.oak_tree` · Events: `resource:harvested` · Intents: `build:place`
- Files ≤ 300 lines soft / 500 hard; systems ≤ 200 lines
- Imports via `@core/*`, `@sim/*`, `@render/*`, `@ui/*`, `@content/*` — direction rules in `docs/04` §5
- No `any`, no `enum`, no default exports (except React components), no barrel files
- No allocation in per-frame paths; scratch objects at module scope

## Performance contract

60 fps at 1080p on M1 / Iris Xe. CPU ≤ 6 ms, GPU ≤ 10.5 ms, ≤ 150 draw calls, initial JS ≤ 600 kB gz.
