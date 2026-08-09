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

**Task ID format:** `BL-###`, monotonically increasing, never reused. Next free ID: **BL-053**.

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

### BL-004 — Core math module
- **Phase:** 0 · **Size:** M · **Depends on:** BL-001 · **Docs:** 07
- **Started:** 2026-08-09 · **Code and two of three criteria landed; see `33_CURRENT_TASK.md`**
- **Description:** `Vec2/Vec3/Quat` as plain interfaces with out-parameter functions, `AABB`, easing curves, `moveTowards`, `damp`, critically damped springs, `lerp/clamp/smoothstep`, FNV-1a hash.
- **Acceptance criteria:**
  - [ ] Zero allocation in all operations (asserted by a test using a counter-instrumented harness) — **the harness is built and verified, the criterion is not signed off.** See BL-050; the measurement is unstable at per-operation resolution and the honest reading is "very probably allocation-free", which is not a sign-off
  - [x] ≥ 95% unit coverage on this module — **100% of lines and functions, 96.8–100% of branches** on all eight source modules (`node --experimental-test-coverage`)
  - [x] Spring implementation is framerate-independent at fixed dt (verified against an analytic solution) — 30/60/144 Hz and a single jump agree to 1e-12, and all four agree with the closed form
- **Remaining:** BL-050 only. Everything else is landed, green and pushed.

---

## Ready — Phase 0: Foundation

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
- **Description:** Pages project, custom domain `islebound.avesstudios.com`, `_headers` with the CSP from `30` §4, deploy on merge to main, and automatic preview deployments per PR.
- **Acceptance criteria:**
  - [ ] A PR produces a clickable preview URL
  - [ ] Headers verified on the deployed site by an automated test
  - [ ] `main` deploys to production on every merge, with the smoke test blocking

### BL-021 — Root documentation files
- **Phase:** 0 · **Size:** S · **Depends on:** — · **Docs:** all
- **Description:** `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, and the `.github/AI_DEVELOPMENT_WORKFLOW.md` reference from the repo root.
- **Acceptance criteria:**
  - [ ] A new agent can go from clone to a passing test run using only the README
  - [ ] `CLAUDE.md` is under 100 lines and points to the detailed docs rather than duplicating them

### BL-048 — Reinstate BL-003's app-shell checks as real tests
- **Phase:** 0 · **Size:** S · **Depends on:** BL-015, BL-016 · **Docs:** 29
- **Description:** BL-003's three acceptance criteria were verified against headless Chromium with a throwaway script, because no test runner existed at that point in the Ready list. The measurements are in the `34` entry but nothing re-runs them, so a regression in canvas sizing or overlay pointer-events would land silently.
- **Acceptance criteria:**
  - [ ] Unit tests for `computeDrawingBufferSize`: fractional ratio, ratio above the cap, zero-size box, non-finite ratio (Vitest, no DOM needed)
  - [ ] Playwright assertions that the drawing buffer is `cssSize × min(dpr, 2)` at dpr 1/2/3 and that `elementFromPoint` at the viewport centre is the canvas
  - [ ] The dpr-change path (`matchMedia`) is covered, since `ResizeObserver` alone does not fire for it
- **Notes:** The unit half only needs BL-015; the browser half needs BL-016. Split if BL-015 lands well before BL-016.

### BL-049 — Decide the device-pixel-ratio cap with measured evidence
- **Phase:** 1 · **Size:** S · **Depends on:** BL-012, BL-011 · **Docs:** 08, 28
- **Description:** `render/canvas.ts` caps the drawing buffer at `MAX_PIXEL_RATIO = 2`, a constant chosen to match `08` §9's `Math.min(devicePixelRatio, capabilities.maxPixelRatio)` and its note that integrated GPUs get 1.5. Nothing has been measured; there is no renderer yet. Once BL-012 detects a quality tier and BL-011 draws something, the cap should come from the tier rather than from a module-level constant.
- **Acceptance criteria:**
  - [ ] The cap is a capability-tier value, with the constant as its default
  - [ ] A frame-time measurement at 1080p on at least one integrated GPU justifies the tier values

### BL-050 — Settle whether the math operations allocate, and how to measure it
- **Phase:** 0 · **Size:** M · **Depends on:** BL-004, BL-015 · **Docs:** 06, 29
- **Description:** BL-004's first acceptance criterion is unmet, and this is the whole of what remains of it. `core/math/allocationHarness.ts` is a working instrument — its control detects a deliberate per-call allocation at ~47 bytes/op and reports ~0.2 for one that writes into a caller-owned object — but run against the individual operations it gives a result that moves. Three to five of thirty report exactly one returned-object's worth of bytes (47.04 for a `Vec3`, 92.16 for an `AABB`), reproducible to two decimal places across runs, and **the set changes when unrelated parts of the test file change**. An effect that depends on a test's position in a file is not a property of the code under test; the same calls in an isolated script measure 0.01–0.10 bytes/op, and every operation's source plainly creates no object. So the operations are very probably allocation-free and the instrument is what is wrong at this scale.
- **Acceptance criteria:**
  - [ ] Either the per-operation suites in `allocation.test.ts` pass as written and stop being `todo`, or the harness is replaced by one whose reading does not depend on test ordering
  - [ ] The replacement, if any, keeps a control case that fails when a deliberate allocator is measured
  - [ ] The five originally-flagged operations (`addScaled`, aliased `add`, `rotateVec3`, `union`, `stepSpring`) are covered
- **Notes:** Eliminated by measurement already, so do not retry them: a before/after `heapUsed` delta (measures retention, not garbage — under-reported the control sevenfold), `PerformanceObserver` on `'gc'` (reports zero collections for 200,000 provable allocations on Node v22.22.2), a megamorphic call site in the harness (fixed, figures unchanged), integer-versus-double field representation in the scratch objects (fixed, figures went up), and boxing of a returned double (fixed, removed a real 6.2 bytes/op elsewhere but not this). Worth trying next: `node:inspector`'s `HeapProfiler.startSampling`, which reports allocation by call site and does not depend on the collector's timing; or measuring each operation in its own child process. Vitest (BL-015) may also simply not have the problem.

### BL-051 — Decide whether `-0` may reach world state
- **Phase:** 0 · **Size:** S · **Depends on:** BL-004 · **Docs:** 04, 23
- **Description:** `hash.hashNumberInto` hashes IEEE bits, so `-0` and `0` hash differently — correctly, since they are different bit patterns and a decimal-string hash would conflate them. But they are indistinguishable in a debugger and `-0 === 0`, so a component field that picked up a `-0` (trivially: `perp2` negates a zero component, and so does any negation) would make two worlds that look identical produce different `worldHash()` values, and a determinism failure with no visible cause is the worst kind. Decide: normalise `-0` to `0` at the hash boundary, forbid it in state, or accept it and document that state comparison must use `Object.is`.
- **Acceptance criteria:**
  - [ ] A decision recorded in `40_DECISION_LOG.md`
  - [ ] Whichever way it goes, a test pins it
- **Notes:** Discovered while landing BL-004: `perp2(v2(), v2(1, 0))` returns `{x: -0, y: 1}`, which `assert.deepEqual` separates from `{x: 0, y: 1}`.

### BL-052 — Collapse the three hand-synced path-alias maps into one
- **Phase:** 0 · **Size:** S · **Depends on:** BL-004 · **Docs:** 05
- **Description:** The same five aliases (`@core/*` … `@content/*`) are now written out in three places: `tsconfig.base.json` `paths`, `packages/client/vite.config.ts` `resolve.alias` (whose comment already notes it is hand-synced), and `tools/aliasResolver.mjs` (added by BL-004 so `node:test` can resolve them). Two copies was a documented trade; three is where a drift becomes likely and its symptom — one tool resolving an import that another cannot — is confusing out of proportion to the cause.
- **Acceptance criteria:**
  - [ ] One source of truth, read by the other consumers
  - [ ] A test or lint rule that fails if a consumer's map diverges from it
- **Notes:** BL-015 may delete the third copy for free by replacing `node:test` with Vitest sharing the Vite config. If so, close this as done-by-BL-015 rather than doing the work.

### BL-045 — Add `eslint-plugin-react-hooks` to the flat config
- **Phase:** 0 · **Size:** S · **Depends on:** BL-003 · **Docs:** 06
- **Description:** `06` §2 lists `eslint-plugin-react-hooks` among the flat config's plugins. BL-002 left it out: there is no React in the tree yet, so it would have had nothing to lint and no fixture could prove it works. Add it once BL-003 has mounted a React root, with a fixture in `tools/lint-fixtures/` per the pattern BL-002 established.
- **Acceptance criteria:**
  - [ ] `react-hooks/rules-of-hooks` and `exhaustive-deps` are on for `**/*.tsx`
  - [ ] A fixture violating each is caught by `pnpm lint:rules`
- **Notes:** Discovered while landing BL-002.

### BL-046 — Extend the per-frame allocation ban to named `three` imports
- **Phase:** 0 · **Size:** S · **Depends on:** BL-002, BL-011 · **Docs:** 06, 08, 28
- **Description:** BL-002's `no-restricted-syntax` selector matches `new THREE.Vector3()` — the namespace-import form BL-002 specified. It does not match `import { Vector3 } from 'three'` followed by `new Vector3()`, which is the form tree-shaking actually prefers and therefore the one `render/` is likely to use. Widening it needs either a maintained list of three.js constructor names or a type-aware rule.
- **Acceptance criteria:**
  - [ ] `new Vector3()` inside an `update*`/`sync*`/`step*` function is caught
  - [ ] A fixture per import form in `tools/lint-fixtures/`
  - [ ] No false positive on a `new Vector3()` at module scope
- **Notes:** Discovered while landing BL-002; the gap is named in a comment in `eslint.config.js` so it is not mistaken for an oversight.

### BL-047 — Migrate `boundaries/external` onto `boundaries/dependencies`
- **Phase:** 0 · **Size:** S · **Depends on:** BL-002 · **Docs:** 04
- **Description:** `eslint-plugin-boundaries` v7 deprecates the `boundaries/external` rule in favour of a `boundaries/dependencies` policy with module selectors, and warns about it on every run. BL-002 attempted the migration and the replacement policy did not fire — a deliberate `import * as THREE from 'three'` inside `sim/` passed with `checkAllOrigins: true` and a `disallow: { to: { module: { source } } }` policy. Rather than ship a rule that reads correctly and enforces nothing, `04` §5's "sim MAY NOT import three, react, DOM" stays on the deprecated rule.
- **Acceptance criteria:**
  - [ ] `sim/` importing `three`, `react` or `react-dom` is still an error, via `boundaries/dependencies`
  - [ ] `render/` importing `three` is still allowed
  - [ ] The deprecation warning is gone from `pnpm lint` output
- **Notes:** Verify with the four-direction probe described in the BL-002 development-log entry. Discovered while landing BL-002.

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
- Second Pages project on a `release` branch, restoring a staging tier — revisit at 1.0 (see DECISION_LOG 0022)

---

## Done

### BL-003 — Vite app shell with a canvas and a black screen
- **Completed:** 2026-08-09 · **PR:** — (pushed direct to `main`)
- Full-window canvas whose drawing buffer tracks its CSS box times `min(devicePixelRatio, 2)` (`render/canvas.ts`, watched by a `ResizeObserver` *and* a re-armed `matchMedia` resolution query), a React 18 overlay root mounted into a `pointer-events: none` container (`ui/App.tsx`, `ui/mountOverlay.tsx`, `ui/styles/base.css`), and `main.ts` wiring them with HMR teardown. React was added as a runtime dependency under `04` §3's existing approval; `@vitejs/plugin-react` is pinned to ^4 because ^6 requires Vite 6. All three acceptance criteria verified against headless Chromium at devicePixelRatio 1, 2 and 3 — see the `34_DEVELOPMENT_LOG.md` entry for the numbers. Discovered work: BL-048, BL-049.

### BL-002 — Configure ESLint, Prettier, and the boundary rules
- **Completed:** 2026-08-07 · **PR:** — (pushed direct to `main`)
- Flat ESLint config with type-aware `@typescript-eslint`, the `04` §5 import-direction table under `eslint-plugin-boundaries` (default-deny), and the three custom bans as `no-restricted-syntax` selectors. Prettier config per `06` §2, scoped to code and configuration. `tools/check-lint-rules.ts` (`pnpm lint:rules`) proves each custom rule fires against a deliberate violation. Discovered work: BL-045, BL-046, BL-047.

### BL-001 — Initialise the pnpm workspace and package scaffolding
- **Completed:** 2026-08-04 · **PR:** —
- pnpm workspace (`packages/client`, `packages/shared`, `packages/server` README-only), `tsconfig.base.json` with the `07` §1 compiler options and the five path aliases, hand-configured Vite aliases mirroring them. See `34_DEVELOPMENT_LOG.md` for detail.

*(append here with date and PR link; oldest at the bottom)*
