# 32 — Backlog

**This is a living document.** It is the single source of truth for what to work on next. Agents select exactly one task from here per work session.

Last groomed: *(update this line when grooming)*
Current phase: **Phase 0 — Foundation**

---

## How to use this file

**For agents:**
1. Read `.github/AI_DEVELOPMENT_WORKFLOW.md` first.
2. Select the **topmost unblocked task in the Ready column of the current phase**. Do not skip ahead to a more interesting task.
3. Move it to In Progress, put its ID in `33_CURRENT_TASK.md`, and begin.
4. On completion, move it to Done with the date and PR link, and log in `34_DEVELOPMENT_LOG.md`.
5. If you discover new work, add it to Ready (or Icebox) with a new ID. **Never** silently expand the scope of the task you are on.

**For humans:** reorder Ready freely; that ordering is how you steer the project. Add tasks anywhere. Move things to Icebox rather than deleting them.

**Task ID format:** `BL-###`, monotonically increasing, never reused. Next free ID: **BL-045**.

**Task format:**

```
### BL-042 — Short imperative title
- **Phase:** 1
- **Size:** S | M | L   (S ≤ 2 h, M ≤ 6 h, L ≤ 2 days of agent work)
- **Depends on:** BL-031, BL-038
- **Docs to read:** 04, 08, 13
- **Description:** what and why, 2–5 sentences.
- **Acceptance criteria:**
  - [ ] concrete, checkable
  - [ ] tests specified
- **Notes:** anything an implementer would otherwise have to guess.
```

---

## In Progress

*(empty — one task at a time)*

---

## Ready — Phase 0: Foundation

### BL-001 — Initialise the pnpm workspace and package scaffolding
- **Phase:** 0 · **Size:** S · **Depends on:** — · **Docs:** 05, 06
- **Description:** Create the monorepo skeleton: `packages/client`, `packages/shared`, root `pnpm-workspace.yaml`, `tsconfig.base.json` with the compiler options from `07_TYPESCRIPT_GUIDELINES.md` §1, and path aliases.
- **Acceptance criteria:**
  - [ ] `pnpm install` succeeds from a clean clone
  - [ ] `pnpm -r typecheck` passes on empty packages
  - [ ] Aliases `@core/*`, `@sim/*`, `@render/*`, `@ui/*`, `@content/*` resolve in both Vite and `tsc`
  - [ ] `packages/server` is present with only a README stating it activates in Phase 7

### BL-002 — Configure ESLint, Prettier, and the boundary rules
- **Phase:** 0 · **Size:** M · **Depends on:** BL-001 · **Docs:** 05, 06
- **Description:** Flat ESLint config with `@typescript-eslint` strict-type-checked, `eslint-plugin-boundaries` encoding the import-direction table from `04` §5, `eslint-plugin-import`, and the custom rules banning `Math.random`, `dangerouslySetInnerHTML`, and `new THREE.*` inside `update*/sync*/step*` functions.
- **Acceptance criteria:**
  - [ ] `pnpm lint` passes on the scaffold
  - [ ] A deliberate violation of each custom rule is caught (a fixture test per rule)
  - [ ] Prettier config matches `06` §2

### BL-003 — Vite app shell with a canvas and a black screen
- **Phase:** 0 · **Size:** S · **Depends on:** BL-001 · **Docs:** 05, 08
- **Description:** `index.html`, `main.ts`, a full-window canvas, correct resize handling with devicePixelRatio, and a React root mounted as an overlay with `pointer-events: none` by default.
- **Acceptance criteria:**
  - [ ] `pnpm dev` serves a black canvas that resizes correctly
  - [ ] HMR works
  - [ ] The overlay does not intercept canvas input

### BL-004 — Core math module
- **Phase:** 0 · **Size:** M · **Depends on:** BL-001 · **Docs:** 07
- **Description:** `Vec2/Vec3/Quat` as plain interfaces with out-parameter functions, `AABB`, easing curves, `moveTowards`, `damp`, critically damped springs, `lerp/clamp/smoothstep`, FNV-1a hash.
- **Acceptance criteria:**
  - [ ] Zero allocation in all operations (asserted by a test using a counter-instrumented harness)
  - [ ] ≥ 95% unit coverage on this module
  - [ ] Spring implementation is framerate-independent at fixed dt (verified against an analytic solution)

### BL-005 — Seeded RNG and noise
- **Phase:** 0 · **Size:** M · **Depends on:** BL-004 · **Docs:** 04, 12
- **Description:** mulberry32 PRNG, named stream factory `rngFor(purpose, ...ints)`, 2D/3D simplex noise, fbm, ridge noise, Poisson-disk sampling. All deterministic and dependency-free.
- **Acceptance criteria:**
  - [ ] Identical output across Node and browser for a fixture of 10,000 values
  - [ ] Named streams are independent (no correlation in a chi-square test)
  - [ ] Noise output matches golden fixtures

### BL-006 — Typed event bus
- **Phase:** 0 · **Size:** S · **Depends on:** BL-001 · **Docs:** 04
- **Description:** A typed pub/sub with a discriminated-union event type, subscribe/unsubscribe, and a queued mode that drains at a defined point in the tick (so handlers cannot reorder simulation).
- **Acceptance criteria:**
  - [ ] Type-safe: subscribing to `'item:added'` narrows the payload
  - [ ] No allocation per emit for zero-subscriber events
  - [ ] Unsubscribe during emit does not skip handlers

### BL-007 — ECS-lite: entities, component stores, queries
- **Phase:** 0 · **Size:** L · **Depends on:** BL-004, BL-006 · **Docs:** 04, 07
- **Description:** Entity allocator with generation bits, sparse-set component stores, cached queries by component signature, deterministic ascending iteration order, entity destruction with deferred cleanup.
- **Acceptance criteria:**
  - [ ] 10,000 entities × 6 components: query iteration ≤ 0.15 ms
  - [ ] Recycled entity IDs never alias (generation test over 1M create/destroy cycles)
  - [ ] Query results are in ascending entity order, always
  - [ ] `structuredClone` of any component round-trips losslessly

### BL-008 — Fixed-timestep game loop
- **Phase:** 0 · **Size:** M · **Depends on:** BL-007 · **Docs:** 04, 09
- **Description:** The accumulator loop from `04` §4.1 with a 5-step catch-up cap, tab-switch clamping, interpolation alpha, and per-stage timing instrumentation.
- **Acceptance criteria:**
  - [ ] Simulation runs at exactly 30 Hz regardless of render rate (verified at simulated 30/60/144 fps)
  - [ ] A 10-second tab switch does not produce a burst of catch-up ticks
  - [ ] `sim:timeDropped` is emitted when the cap is hit

### BL-009 — Service registry and config
- **Phase:** 0 · **Size:** S · **Depends on:** BL-001 · **Docs:** 05
- **Description:** An explicit service registry (no decorators, no magic) and a typed config object loaded from `shared/content/config.ts` with a dev-only hot-reload hook.
- **Acceptance criteria:**
  - [ ] Accessing an unregistered service throws a clear error naming the service
  - [ ] Config changes hot-reload in dev without a page refresh

### BL-010 — Logger with a ring buffer
- **Phase:** 0 · **Size:** S · **Depends on:** BL-001 · **Docs:** 06, 30
- **Description:** Levelled logging, per-module tags, a 200-entry ring buffer for crash reports, and production stripping of debug/trace levels.
- **Acceptance criteria:**
  - [ ] Ring buffer never exceeds its cap
  - [ ] Debug calls are removed from the production bundle (verified by a bundle grep test)

### BL-011 — Three.js renderer bootstrap
- **Phase:** 0 · **Size:** M · **Depends on:** BL-003, BL-008 · **Docs:** 08, 09
- **Description:** `WebGLRenderer` with the configuration from `08` §9, scene roots per `08` §2, a perspective camera, resize handling with debounce, and a grey-box scene (ground plane, a few boxes, a directional light).
- **Acceptance criteria:**
  - [ ] Grey-box scene renders at 60 fps
  - [ ] Colour management verified: a known sRGB value round-trips correctly
  - [ ] Resize does not leak render targets

### BL-012 — Capability detection and quality tiers
- **Phase:** 0 · **Size:** M · **Depends on:** BL-011 · **Docs:** 09, 28
- **Description:** GPU tier heuristics from the renderer string plus a 60-frame calibration burn-in; the quality-tier table from `09` §4 applied to a settings object.
- **Acceptance criteria:**
  - [ ] Tier is detected within 2 seconds of load
  - [ ] Manual override in settings persists and applies without reload
  - [ ] Unknown GPUs default to Medium, not High

### BL-013 — Dev overlay
- **Phase:** 0 · **Size:** M · **Depends on:** BL-011, BL-008 · **Docs:** 28
- **Description:** FPS, a 240-frame frame-time graph with a p99 marker, draw calls, triangles, programs, texture memory, entity count, heap size, and per-system tick timings. Toggled with a key, stripped from production.
- **Acceptance criteria:**
  - [ ] Overlay itself costs ≤ 0.1 ms/frame
  - [ ] Fully absent from the production bundle
  - [ ] Per-system timings are accurate within 5% of a manual measurement

### BL-014 — Headless simulation harness (`pnpm sim`)
- **Phase:** 0 · **Size:** L · **Depends on:** BL-007, BL-008, BL-005 · **Docs:** 29
- **Description:** A Node entry point that constructs a world without any renderer, runs N ticks, supports `--seed`, `--ticks`, `--assert-hash`, `--profile` and `--script`, and implements `worldHash()`.
- **Acceptance criteria:**
  - [ ] `pnpm sim --ticks 20000` runs in under 3 seconds
  - [ ] Repeated runs produce identical hashes
  - [ ] Importing anything from `render/` or the DOM fails the run loudly
  - [ ] Per-system timing output

### BL-015 — Vitest setup and first test suites
- **Phase:** 0 · **Size:** S · **Depends on:** BL-004 · **Docs:** 29
- **Description:** Vitest sharing the Vite config, coverage reporting, and the test directory structure from `29` §6.
- **Acceptance criteria:**
  - [ ] `pnpm test` runs unit tests with coverage
  - [ ] `pnpm test:watch` works
  - [ ] Coverage thresholds configured (85% for `sim/` and `core/`)

### BL-016 — Playwright setup and boot smoke test
- **Phase:** 0 · **Size:** M · **Depends on:** BL-011 · **Docs:** 29
- **Description:** Playwright configuration for Chromium and Firefox, the `__game` test hook (dev/test builds only), and a smoke test asserting boot, no console errors, and 120 rendered frames.
- **Acceptance criteria:**
  - [ ] Smoke test passes headless in CI
  - [ ] `__game` is absent from the production bundle
  - [ ] No `waitForTimeout` anywhere in the test code

### BL-017 — `sim/` purity checker
- **Phase:** 0 · **Size:** S · **Depends on:** BL-001 · **Docs:** 04, 06
- **Description:** `tools/check-sim-purity.ts` — an AST walk over `src/sim/**` failing on imports of `three`, `react`, DOM globals, `Math.random`, `Date.now`, and `performance.now`.
- **Acceptance criteria:**
  - [ ] Catches each banned pattern in a fixture file
  - [ ] Runs in under 2 seconds
  - [ ] Wired into CI as a blocking gate

### BL-018 — Bundle size budget check
- **Phase:** 0 · **Size:** S · **Depends on:** BL-003 · **Docs:** 06, 28
- **Description:** `tools/check-bundle-size.ts` asserting initial JS ≤ 600 kB gzipped and reporting the top 15 modules by size.
- **Acceptance criteria:**
  - [ ] Fails the build when the budget is exceeded
  - [ ] Prints a readable size report on every build

### BL-019 — CI pipeline
- **Phase:** 0 · **Size:** M · **Depends on:** BL-015, BL-016, BL-017, BL-018 · **Docs:** 29, 30
- **Description:** `.github/workflows/ci.yml` implementing the four jobs from `29` §8 with the stated time budgets and pnpm caching.
- **Acceptance criteria:**
  - [ ] All jobs green on a clean clone
  - [ ] `quick` job completes in under 3 minutes
  - [ ] Jobs run in parallel where independent

### BL-020 — Cloudflare Pages deployment with PR previews
- **Phase:** 0 · **Size:** M · **Depends on:** BL-019 · **Docs:** 30
- **Description:** Pages project, `_headers` with the CSP from `30` §4, staging deploy on merge to main, and automatic preview deployments per PR.
- **Acceptance criteria:**
  - [ ] A PR produces a clickable preview URL
  - [ ] Headers verified on the deployed site by an automated test
  - [ ] Staging updates on every merge

### BL-021 — Root documentation files
- **Phase:** 0 · **Size:** S · **Depends on:** — · **Docs:** all
- **Description:** `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, and the `.github/AI_DEVELOPMENT_WORKFLOW.md` reference from the repo root.
- **Acceptance criteria:**
  - [ ] A new agent can go from clone to a passing test run using only the README
  - [ ] `CLAUDE.md` is under 100 lines and points to the detailed docs rather than duplicating them

---

## Ready — Phase 1: Player & World (seeded; groom before starting)

### BL-022 — Control map authoring and loader
- **Phase:** 1 · **Size:** M · **Depends on:** BL-005 · **Docs:** 12
- **Description:** Author the 256² four-channel control map and build the loader plus a debug viewer for each channel.
- **Acceptance criteria:** loader is deterministic; the debug viewer renders all four channels; the map is committed under `assets-src/world/`.

### BL-023 — Base elevation generation
- **Phase:** 1 · **Size:** L · **Depends on:** BL-022 · **Docs:** 12
- **Acceptance criteria:** island silhouette matches the design intent from 8 viewpoints; generation is deterministic; water surrounds the playable area on all sides.

### BL-024 — Hydraulic erosion pass
- **Phase:** 1 · **Size:** M · **Depends on:** BL-023 · **Docs:** 12
- **Acceptance criteria:** ≤ 200 ms for 40k droplets; before/after golden heightmaps; deterministic.

### BL-025 — Feature carving (river, waterfall, terraces, harbour, cave pads)
- **Phase:** 1 · **Size:** L · **Depends on:** BL-024 · **Docs:** 12

### BL-026 — `TerrainData` accessors
- **Phase:** 1 · **Size:** M · **Depends on:** BL-023 · **Docs:** 13
- **Acceptance criteria:** `heightAt` ≥ 20M calls/sec; bilinear correctness at 10k sample points including edges.

### BL-027 — Chunk registry and worker mesher (LOD0)
- **Phase:** 1 · **Size:** L · **Depends on:** BL-026 · **Docs:** 13

### BL-028 — Terrain material with splat blending
- **Phase:** 1 · **Size:** L · **Depends on:** BL-027 · **Docs:** 13, 26

### BL-029 — LOD1/LOD2 and skirts
- **Phase:** 1 · **Size:** M · **Depends on:** BL-027 · **Docs:** 13

### BL-030 — Chunk streaming with priority and hysteresis
- **Phase:** 1 · **Size:** M · **Depends on:** BL-029 · **Docs:** 13

### BL-031 — Rapier integration and heightfield colliders
- **Phase:** 1 · **Size:** M · **Depends on:** BL-030 · **Docs:** 10

### BL-032 — Kinematic character controller
- **Phase:** 1 · **Size:** L · **Depends on:** BL-031 · **Docs:** 10, 11

### BL-033 — Movement system and player state machine (ground states)
- **Phase:** 1 · **Size:** L · **Depends on:** BL-032 · **Docs:** 11

### BL-034 — Third-person camera with spring arm and collision
- **Phase:** 1 · **Size:** L · **Depends on:** BL-033 · **Docs:** 08, 11

### BL-035 — Input manager and intent mapping
- **Phase:** 1 · **Size:** M · **Depends on:** BL-008 · **Docs:** 11

### BL-036 — Sky, sun, and the day/night cycle
- **Phase:** 1 · **Size:** L · **Depends on:** BL-011 · **Docs:** 20, 09

### BL-037 — Water plane and ocean shader (first pass)
- **Phase:** 1 · **Size:** L · **Depends on:** BL-028 · **Docs:** 09

### BL-038 — Vegetation scatter and instanced rendering
- **Phase:** 1 · **Size:** L · **Depends on:** BL-030 · **Docs:** 12, 08

### BL-039 — Region assignment and a debug readout
- **Phase:** 1 · **Size:** M · **Depends on:** BL-025 · **Docs:** 12

### BL-040 — Swim state and water entry/exit
- **Phase:** 1 · **Size:** M · **Depends on:** BL-037, BL-033 · **Docs:** 11

### BL-041 — Worldgen caching in IndexedDB
- **Phase:** 1 · **Size:** M · **Depends on:** BL-025 · **Docs:** 12, 23

### BL-042 — Movement feel harness scene and checklist
- **Phase:** 1 · **Size:** M · **Depends on:** BL-033 · **Docs:** 11, 29

### BL-043 — Playability invariant tests for worldgen
- **Phase:** 1 · **Size:** M · **Depends on:** BL-039 · **Docs:** 12, 29

### BL-044 — Phase 1 visual regression goldens
- **Phase:** 1 · **Size:** S · **Depends on:** BL-036, BL-037 · **Docs:** 29

---

## Icebox (good ideas, not now)

Reviewed at each phase boundary. Moving something out of the Icebox requires a human.

- Glider unlocked at Kestrel Point (traversal joy; strong post-1.0 candidate)
- Seasons with palette and crop rotation
- Fish pond building piece that displays caught fish
- Crab pots and passive traps
- Beehives near flowers
- Player-placed instruments and a play mechanic
- Reverb impulse responses per space (`ConvolverNode`) — may promote into Phase 6
- Paint mode for recolouring placed pieces without removal — may promote into Phase 4
- Rainbows after rain — cheap, promote into Phase 6 if time allows
- Sketch-mode photo filter in the journal's ink style
- Map screen with fog-of-war and player pins
- Blueprint save/load for structures
- Storage network / remote crafting from nearby chests
- Time-capsule read-only save snapshots
- PWA offline install
- Record-and-replay regression testing from real sessions
- WebGPU renderer path
- Second island reachable by boat
- Character customisation beyond outfit colour
- Mod support

---

## Done

*(append here with date and PR link; oldest at the bottom)*
