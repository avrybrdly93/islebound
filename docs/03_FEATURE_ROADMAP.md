# 03 — Feature Roadmap

Purpose: the phase ordering for the whole project, the exit criteria for each phase, and the rules for moving between them. Detailed ordered task lists live in `/tasks/phase_N_*.md`. This document is the map; those are the routes.

---

## 1. Phasing principle

Each phase ends with a **playable build**. Never a build that "compiles but isn't playable yet". If a phase cannot end playable, it is split.

Each phase has a one-line *proof*: the single thing a human can do in the browser at the end of it. If the proof does not work, the phase is not done, regardless of how many tasks are checked off.

## 2. Phase table

| Phase | Name | Proof | Est. tasks |
|-------|------|-------|-----------|
| 0 | Foundation | A grey box scene renders at 60 fps with a stats overlay and a passing test suite | ~28 |
| 1 | Player & World | Walk around a real island with day/night and collide with terrain | ~42 |
| 2 | Resources | Gather from nodes into an inventory that persists across reload | ~34 |
| 3 | Crafting | Craft a tool from gathered materials at a workbench | ~30 |
| 4 | Building | Place, rotate, snap, paint and remove structures that persist | ~38 |
| 5 | Life Simulation | Farm, fish, cook, watch wildlife, fill a journal | ~52 |
| 6 | Polish & Ship | Audio, weather, art pass, settings, performance, deploy | ~46 |
| 7 | Multiplayer | A friend joins your island and helps you build | ~40 |

Total ≈ 310 tasks. At a sustainable 4–6 completed tasks per day of autonomous agent work plus human review, this is a 12–18 month project. **Do not compress this by skipping Phase 0 or Phase 6.**

## 3. Phase 0 — Foundation

**Goal:** a boring, correct, fast skeleton that everything else can be bolted onto without renegotiation.

Delivers:
- Vite + TypeScript strict + pnpm workspace, ESLint + Prettier, Vitest, Playwright.
- The fixed-timestep game loop (`core/Loop.ts`) with accumulator and interpolation.
- Renderer bootstrap, resize handling, device capability probe, colour management.
- The ECS-lite entity/component/system layer.
- Event bus, service locator, typed config registry.
- Dev overlay: FPS, frame time graph, draw calls, triangles, memory, entity count.
- Headless simulation harness (`pnpm sim`) that runs N ticks with no renderer — this is what makes AI-driven testing possible.
- CI: typecheck, lint, unit tests, build, bundle-size budget check.

**Exit criteria:** grey box scene, 60 fps, `pnpm test` green, `pnpm sim --ticks 10000` completes deterministically with a stable state hash, CI green on a clean clone.

## 4. Phase 1 — Player & World

**Goal:** the island exists and moving around it is pleasurable.

Delivers:
- Deterministic heightmap island generation, chunked terrain meshing, terrain material with splat blending.
- Rapier physics world, terrain colliders, kinematic character controller.
- Third-person camera with collision, spring arm, and smoothed follow.
- Player state machine: idle, walk, run, jump, fall, land, swim.
- Water plane and shoreline, basic sky and sun, day/night cycle driving light.
- Vegetation scattering with instanced meshes and LOD.
- Region definitions and a debug region readout.

**Exit criteria:** a human can walk the full island in under 6 minutes, never fall through terrain, and see the sun set. 60 fps maintained. Movement feels good in a blind playtest.

## 5. Phase 2 — Resources

**Goal:** the island gives you things.

Delivers:
- Resource node definitions (data), deterministic node placement, regrowth timers.
- Interaction system: raycast/proximity targeting, prompt UI, hold-to-act.
- Harvest feedback: particles, shake, sound stubs, item arc.
- Inventory model, grid UI, stacking, drag/drop, hotbar.
- Tools as items, tool tiers gating node tiers.
- Save system v1: IndexedDB, versioned schema, autosave.

**Exit criteria:** gather 5 resource types, fill the inventory, reload the page and everything is where you left it.

## 6. Phase 3 — Crafting

**Goal:** materials become capability.

Delivers:
- Recipe registry (JSON), validation at load, recipe unlock rules.
- Hand crafting UI and station crafting UI with queues.
- Workbench as the first placeable station (bridges into Phase 4).
- Item metadata system (durability-free tools, stack rules, tags).
- Journal v1: Recipes and Materials categories.

**Exit criteria:** gather → craft a Stone Axe → use it to fell a tree that hands could not.

## 7. Phase 4 — Building

**Goal:** the island becomes yours.

Delivers:
- Build mode, ghost preview, validity checks, grid snapping, socket snapping.
- Piece catalogue (data-driven): foundations, walls, roofs, doors, windows, stairs, fences, paths.
- Free placement for decoration with surface alignment and collision checks.
- Removal with full refund, rotation, colour/dye variants.
- Structure persistence in the save file, spatial index for large builds.
- Interior detection for lighting/warmth.

**Exit criteria:** build a two-room cabin with a door and a roof, save, reload, walk inside, remove a wall and get the materials back.

## 8. Phase 5 — Life Simulation

**Goal:** the island lives, and so do you in it.

Delivers:
- Farming: tilling, planting, growth ticks, watering, rain integration, sprinklers.
- Cooking: kitchen station, dish recipes, buffs.
- Fishing: casting, bite logic, the catch minigame, fish tables by water body/time/weather.
- Wildlife: spawn director, behaviour state machines, flee radii, befriending.
- Journal complete: all six categories, discovery events, completion tracking.
- Fragments and island history placement.
- Energy and Warmth meters.

**Exit criteria:** play a full in-game week: plant, harvest, cook a dish, catch three fish species, catalogue five animals, find two fragments.

## 9. Phase 6 — Polish & Ship

**Goal:** it feels like a product.

Delivers:
- Weather system with transitions and effects on other systems.
- Full audio: ambient beds, one-shots, music with adaptive layering, mixing, ducking.
- Art pass: final materials, post-processing chain, colour grading LUT, foliage wind.
- Animation pass: blend trees, IK foot planting, prop attachments.
- UI/UX pass, settings, accessibility, comfort options, gamepad, key rebinding.
- Photo mode. Main menu. Onboarding beat tuning.
- Performance: budgets enforced, LOD tuning, texture atlasing, code splitting.
- Deployment, error reporting, versioning, release notes.

**Exit criteria:** a stranger plays for 45 minutes without asking a question, on integrated graphics, at 60 fps.

## 10. Phase 7 — Multiplayer

**Goal:** someone can join you.

Delivers:
- Authoritative Node server, room lifecycle, join codes.
- Snapshot/delta protocol, client prediction and reconciliation for movement.
- Shared world state: nodes, structures, crops, time, weather.
- Per-player inventories, shared containers with concurrency handling.
- Server-side persistence and migration from single-player saves.
- Presence UI: nameplates, player list, pings/emotes.
- Hosting, rate limiting, abuse mitigation.

**Exit criteria:** two browsers on different networks, one island, both building, 100 ms simulated latency, no desync over a 30-minute session.

## 11. Rules for phase transitions

1. **No forward reaching.** Do not implement Phase N+1 features during Phase N, even if convenient. Add them to `32_BACKLOG.md`.
2. **Backward fixes are always allowed.** Fixing a Phase 1 bug during Phase 4 is correct and expected.
3. **A phase is closed by a human**, not an agent. Agents may mark all tasks complete and propose closure in `33_CURRENT_TASK.md`.
4. **Every phase ends with a tag** `phase-N-complete` and a written retro entry in `34_DEVELOPMENT_LOG.md`.
5. **Multiplayer-affecting decisions** made in Phases 1–6 must be checked against `36_MULTIPLAYER_ARCHITECTURE.md` §4 (the "network-safe checklist") before merge.

## 12. Explicitly deferred (post-1.0)

Recorded so they stop being reconsidered: seasons, character customisation beyond outfit colour, a second island, mounts/vehicles beyond the raft, mod support, Steam/native wrapper, mobile touch controls, procedural quests, NPC villagers, achievements/Steam integration, WebGPU-only visual features.
