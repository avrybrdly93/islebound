# Islebound

A cozy 3D survival-exploration game that runs in the browser. Wash up on a forgotten island, gather what it gives you, build a home, plant a garden, fish the reef, and slowly piece together who lived there before you. Play alone, or give a friend a join code.

No combat. No hunger. No death. Nothing on a timer that can punish you.

> **Status: pre-implementation.** The complete design and engineering documentation exists; code begins at `docs/32_BACKLOG.md` → **BL-001**.

---

## What this repository is

An experiment in **documentation-first, AI-agent-driven development**. Every architectural decision, system design, content rule and process constraint is written down _before_ the code, so that autonomous agents can make hundreds of small, correct, consistent changes over many months without a human re-explaining the project each session.

The documentation is not commentary on the code. It is the specification the code is written from, and it is maintained as a first-class deliverable.

## Tech at a glance

TypeScript (strict) · Vite · pnpm workspace · three.js (WebGL2) · Rapier3D (WASM) · React DOM overlay · custom ECS-lite · Vitest + Playwright + a headless simulation harness · Cloudflare Pages · Node + `ws` + SQLite on Fly.io for multiplayer.

**Performance contract:** 60 fps at 1080p on an M1 / Iris Xe integrated GPU, playable within 8 seconds on 20 Mbps.

## The one architectural idea

> **Simulation is separated from presentation, and the simulation is deterministic, pure, and runnable headlessly.**

No file under `src/sim/` may import three.js, touch the DOM, call `Math.random`, or read a wall clock. Everything else follows: gameplay is testable without a browser (`pnpm sim`), saves are trivially correct, and the Phase 7 multiplayer server reuses the exact same simulation code the client runs.

This is enforced by lint rules and a CI gate, not by good intentions.

## Getting started

```bash
pnpm install
pnpm dev            # http://localhost:5173
pnpm test           # unit + integration
pnpm sim --ticks 20000 --assert-hash   # headless determinism check
pnpm lint && pnpm typecheck
pnpm build
```

Requires Node 22+ and pnpm 9+. Blender and ffmpeg are needed only for rebuilding art assets (`pnpm assets:build`), not for running the game.

## Development philosophy

1. **Calm is a design constraint, not a mood.** The cozy contract in `docs/02_CORE_GAMEPLAY_LOOP.md` §5 is a list of testable properties — no item loss, no punishing timers, full refunds, stop anytime — and there are automated tests protecting each one.
2. **Content is data, not code.** Adding a fish, a recipe, a crop or a building piece requires no code change. See `docs/39_CONTENT_AUTHORING_GUIDE.md`.
3. **Multiplayer is designed in from day one and implemented last.** Every gameplay feature passes the network-safe checklist (`docs/36` §4) at review time, so Phase 7 is an integration project rather than a rewrite.
4. **The smallest complete change wins.** One backlog task per session, no opportunistic refactors, no forward-reaching into future phases.
5. **Decisions get written down once.** `docs/40_DECISION_LOG.md` records what was chosen, what was rejected, and the honest cost — so nothing gets relitigated by the next agent.

## How AI agents work on this repository

Agents follow a fixed loop, defined in **`.github/AI_DEVELOPMENT_WORKFLOW.md`**:

```
orient → select one task → understand → implement → test → verify → document → hand off
```

Concretely, every session:

- Reads `docs/33_CURRENT_TASK.md` and `docs/32_BACKLOG.md` first, plus the system docs the task names.
- Takes **exactly one** task — the topmost unblocked one in the current phase.
- Implements the smallest complete version, with tests.
- Runs lint, typecheck, tests, and the determinism hash before opening a PR.
- Updates the backlog, the current-task handoff, and the development log — including a **Surprises** note whenever reality diverged from the docs, which is how the documentation improves.

The binding constraints live in **`docs/35_AI_AGENT_RULES.md`**. The important ones: never weaken a critical test to make a change pass, never add a runtime dependency without approval, never break `sim/` purity, never change the save schema without a migration, and never rewrite architecture unilaterally — mark the task `BLOCKED` and pick another.

Ten **critical tests** (`docs/29_TESTING_STRATEGY.md` §4) protect the properties that define the game: item conservation, build refunds, determinism, save migration, worldgen stability, progression reachability, and the per-system frame budgets. They are not negotiable.

## How humans steer

- **Reorder `docs/32_BACKLOG.md`.** The ordering _is_ the direction; agents take the top task.
- **Close phases.** Agents can complete every task in a phase but cannot declare it done. A phase closes when its one-line proof demonstrably works and the retro is written.
- **Review PR previews.** Every pull request gets a deployed URL you can actually play before approving.
- **Approve the things agents cannot decide alone:** vision changes, architecture changes, new dependencies, critical-test changes, anything breaking save compatibility.
- **Judge feel.** Movement, onboarding, mix balance and art direction have human checklists, because no automated test can tell you whether walking around is enjoyable.

## Roadmap

| Phase | Name            | Proof                                                             |
| ----- | --------------- | ----------------------------------------------------------------- |
| 0     | Foundation      | Grey-box scene at 60 fps, green tests, deterministic headless sim |
| 1     | Player & World  | Walk the whole island, watch the sun set                          |
| 2     | Resources       | Gather into an inventory that survives a reload                   |
| 3     | Crafting        | Craft a stone axe and fell a tree hands could not                 |
| 4     | Building        | Build a cabin, reload, remove a wall, get materials back          |
| 5     | Life Simulation | Farm, cook, fish, catalogue, discover                             |
| 6     | Polish & Ship   | A stranger plays 45 minutes without asking a question             |
| 7     | Multiplayer     | A friend joins your island and helps you build                    |

Full detail in `docs/03_FEATURE_ROADMAP.md` and `tasks/phase_*.md`.

## Documentation map

| Range     | Contents                                                                          |
| --------- | --------------------------------------------------------------------------------- |
| `00`–`03` | Vision, game design, core loop, roadmap                                           |
| `04`–`07` | Architecture, codebase structure, engineering standards, TypeScript               |
| `08`–`13` | Rendering, three.js, physics, player controller, worldgen, terrain                |
| `14`–`19` | Resources, inventory, crafting, building, farming, fishing                        |
| `20`–`23` | Day/night, weather, audio, saves                                                  |
| `24`–`28` | UI/UX, asset pipeline, art direction, animation, performance                      |
| `29`–`31` | Testing, deployment, security                                                     |
| `32`–`35` | Backlog, current task, development log, agent rules _(living documents)_          |
| `36`–`40` | Multiplayer, network protocol, server operations, content authoring, decision log |

Start with `00`, `04`, and `35`. Everything else is reference.

## Licence

To be determined before the first public release.
