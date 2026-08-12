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

**Task ID format:** `BL-###`, monotonically increasing, never reused. Next free ID: **BL-057**.

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

*(nothing — pick the topmost unblocked task from Ready)*

---

## Ready — Phase 0: Foundation

### BL-056 — Poisson-disk sampling per chunk
- **Phase:** 0 · **Size:** S · **Depends on:** BL-005 · **Docs:** 04, 12
- **Description:** Poisson-disk (Bridson) sampling over a chunk, drawing from `rngFor(worldSeed, 'scatter', chunkX, chunkZ)`. Split out of BL-054 on claim 2026-08-12 — see BL-054's note for why.
- **Acceptance criteria:**
  - [ ] Poisson-disk sampling per chunk uses `rngFor('scatter', chunkX, chunkZ)` and produces the same set whatever order chunks are generated in (`12` §"Runs in a Web Worker", the streaming requirement)
  - [ ] No two samples closer than the radius, measured over many chunks rather than asserted from the algorithm
  - [ ] Samples near a chunk edge do not violate the radius against the neighbouring chunk's samples, **or** that limitation is documented as accepted with the reason
- **Notes:** the chunk-order criterion is already half-established: `Rng.test.ts` proves the streams are independent and order-free, so what remains is proving the *sampler* preserves it — same seed, same set, regardless of when the chunk is generated. The edge criterion is the one with a real design decision in it; `12` should be read before choosing.

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

### BL-055 — Fix the `AI_DEVELOPMENT_WORKFLOW.md` path that three files point at
- **Phase:** 0 · **Size:** S · **Depends on:** — · **Docs:** —
- **Description:** Filed 2026-08-11 while doing BL-005. `CLAUDE.md` ("Before you write code, every session", item 1) and this file ("For agents", step 1) both say `.github/AI_DEVELOPMENT_WORKFLOW.md`. That file does not exist: the workflow is at `docs/AI_DEVELOPMENT_WORKFLOW.md`, and `.github/AI_DEVELOPMENT_WORKFLOW` is an empty **directory**, which is probably how the mistake happened. Every session is told to read that file first and every session has to go and find it.
- **Acceptance criteria:**
  - [ ] The path in `CLAUDE.md` and in this file resolves to the real document
  - [ ] The empty `.github/AI_DEVELOPMENT_WORKFLOW` directory is gone, or holds the file
- **Notes:** Decide which location is canonical rather than adding a second copy — two copies of the session loop is worse than a wrong path, because a wrong path fails loudly.

### BL-053 — Drop `--expose-gc` from the test scripts
- **Phase:** 0 · **Size:** S · **Depends on:** BL-050 · **Docs:** 29
- **Description:** Filed 2026-08-13 while closing BL-050. `--expose-gc` was there for the `heapUsed`-rise harness, which collected before each measured pass so the first sample did not attribute its predecessor's garbage to the operation. That harness is deleted; the sampling profiler does not need a forced collection, and nothing else in the tree calls `global.gc`. The flag appears in both `test:node` and `test:node:coverage` in the root `package.json`.
- **Acceptance criteria:**
  - [ ] Neither test script passes `--expose-gc`, and `pnpm test:node` is still 142/142
  - [ ] Nothing references `globalThis.gc`
- **Notes:** Small, and deliberately not done inline with BL-050 — the flag is harmless and removing it is a change to how every test in the project is invoked, which deserves its own green run rather than riding along in a commit about a measurement technique. **Do it with or after BL-015**, which rewrites those scripts anyway; doing it before means editing them twice.

### BL-050 — Settle whether the math operations allocate, and how to measure it — **DONE 2026-08-13**
- **Phase:** 0 · **Size:** M · **Depends on:** BL-004 · **Docs:** 06, 29
- **Outcome:** the instrument was replaced, not the code. `measureAttributedAllocation` runs the operation under V8's sampling heap profiler (`HeapProfiler.startSampling`) and sums the bytes attributed to the measuring loop and its callees, so allocation is attributed **by call site**. All 30 operations — including the five the old instrument could not clear — read **exactly 0** attributed bytes against a control of **~115 kB** measured in the same process. `allocation.test.ts` is 13 passing cases with **no `todo`**, and the suite is 142 pass / 0 fail / 0 todo (was 131 / 0 / 16). It did **not** depend on BL-015: no Vitest was needed.
- **Original description (kept, because the diagnosis is the useful part):** BL-004's first acceptance criterion was unmet, and this was the whole of what remained of it. `core/math/allocationHarness.ts` is a working instrument — its control detects a deliberate per-call allocation at ~47 bytes/op and reports ~0.2 for one that writes into a caller-owned object — but run against the individual operations it gives a result that moves. Three to five of thirty report exactly one returned-object's worth of bytes (47.04 for a `Vec3`, 92.16 for an `AABB`), reproducible to two decimal places across runs, and **the set changes when unrelated parts of the test file change**. An effect that depends on a test's position in a file is not a property of the code under test; the same calls in an isolated script measure 0.01–0.10 bytes/op, and every operation's source plainly creates no object. So the operations are very probably allocation-free and the instrument is what is wrong at this scale.
- **Acceptance criteria:**
  - [x] Either the per-operation suites pass and stop being `todo`, or the harness is replaced by one whose reading does not depend on test ordering — **both.** The harness is replaced, and ordering independence was verified by moving the whole `vec3` suite to the end of the file: 13/13 unchanged
  - [x] The replacement keeps a control case that fails when a deliberate allocator is measured — and the allowance is **derived from that control in the same process** rather than being a constant, because a constant cannot tell "allocates nothing" from "the profiler saw nothing". Verified by blinding the instrument two ways (`samplingInterval` 65536; a stale `MEASURED_LOOP_NAME`): each turns 13 passes into 11 failures naming the cause
  - [x] The five originally-flagged operations (`addScaled`, aliased `add`, `rotateVec3`, `union`, `stepSpring`) are covered — all five at 0 attributed bytes
- **What the fix cost, for the next person who has to measure something like this:** the sampling profiler's absolute figures are **not** bytes allocated — it under-reports volume by ~100x here, because young-generation allocation from optimised code mostly takes a bump-pointer fast path V8 does not sample. That is fine for an "allocates / does not" criterion and would be useless for a byte budget. Two settings matter and both were measured in both directions: `samplingInterval` (65536 makes the **control** read 0 — a false pass) and `warmup` (at 5000 the operation tiers up inside the measured window and the compile allocation is attributed to it; at 200000 the control read 0 in one pass of three). The reported figure is the **minimum over three passes**, since every error source here is additive.
- **Notes (pre-fix, kept):** Eliminated by measurement already, so do not retry them: a before/after `heapUsed` delta (measures retention, not garbage — under-reported the control sevenfold), `PerformanceObserver` on `'gc'` (reports zero collections for 200,000 provable allocations on Node v22.22.2), a megamorphic call site in the harness (fixed, figures unchanged), integer-versus-double field representation in the scratch objects (fixed, figures went up), and boxing of a returned double (fixed, removed a real 6.2 bytes/op elsewhere but not this). Worth trying next: `node:inspector`'s `HeapProfiler.startSampling`, which reports allocation by call site and does not depend on the collector's timing; or measuring each operation in its own child process. Vitest (BL-015) may also simply not have the problem.

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

### BL-054 — Simplex noise, fbm and ridge
- **Completed:** 2026-08-12 · **PR:** — (pushed direct to a `claude/*` branch)
- `sim/noise/Simplex.ts`: 2D/3D simplex over a permutation table shuffled once from `rngFor(worldSeed, purpose)`, plus `fbm2D`/`fbm3D` and `ridge2D`/`ridge3D`. **No `RngState` is threaded through any of it** — noise is a field, and a generator consumed per sample would destroy exactly the property terrain streaming needs. 15 tests; suite 189 pass / 0 fail / 0 todo, was 174. **Split on claim** — the Poisson-disk half became BL-056, taking its chunk-order criterion with it, exactly as BL-005 split this task out. Both remaining criteria met: the four digests plus six spot values reproduce, and range and mean are measured over 160,000 samples and tabulated in `34_DEVELOPMENT_LOG.md` rather than assumed — including the two findings that measurement is for, that the base range is near but not exactly ±1 and that fbm is ~15% narrower than its base noise because the normaliser divides by a worst case the octaves rarely reach. **The continuity test's first version did not work and the log says so**: a bound on the raw jump passes a field with the falloff perturbed to 0.6; what catches it is the worst *slope* growing as the step shrinks (6.4455→6.4463 correct, 22.02→110.03 perturbed). Discovered work: BL-056.

### BL-005 — Seeded RNG
- **Completed:** 2026-08-11 · **PR:** — (pushed direct to `main`)
- `sim/rng/Rng.ts`: mulberry32 with the `Math.imul`/`>>> 0` discipline, `rngFor(worldSeed, purpose, ...coords)` deriving stream seeds through the existing FNV-1a helpers, and the draws (`nextInt` with rejection sampling rather than a modulo, `nextRange`, `chance`, `pick`, Fisher–Yates `shuffle`). 32 tests; suite 174 pass / 0 fail / 0 todo, was 142. **Split on claim** — the noise half became BL-054, taking the golden-fixture criterion with it. Both remaining criteria met: the 10,000-value fixture (digest `9b901c2e`) reproduces in Node v22.22.2 and in Chromium 141 — **both V8, which the log entry states plainly rather than claiming two engines** — and six streams × 60,000 draws pass uniformity (7 df) and all 15 pairwise independence tests (49 df) against their 0.1% critical values, with a negative control proving the independence test rejects two identical streams. Also deleted `sim/_scaffold.ts`. Discovered work: BL-055.

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
