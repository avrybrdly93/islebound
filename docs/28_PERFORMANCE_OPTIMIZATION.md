# 28 — Performance Optimization

Purpose: the performance contract, the budgets that enforce it, the techniques used, and the measurement discipline that keeps regressions from creeping in over a year of development.

---

## 1. The contract

> **60 fps at 1920×1080 on an Apple M1 or Intel Iris Xe, at Medium quality, with a fully built island.**

Also: **≥ 30 fps on Low quality on a 2019 integrated GPU**, and **initial playable load ≤ 8 s on 20 Mbps**.

This is a hard constraint from `00_PROJECT_VISION.md` §6. A feature that cannot fit the budget is cut or simplified, not shipped with a note.

## 2. Frame budget (16.6 ms)

| Stage | Budget | Owner |
|---|---|---|
| Simulation (up to 2 ticks/frame typical) | 3.0 ms | `sim/` |
| Physics (within sim) | 1.2 ms | `sim/physics` |
| Render sync + LOD + streaming | 1.0 ms | `render/` |
| Animation + IK | 0.6 ms | `render/` |
| VFX update | 0.4 ms | `render/vfx` |
| Audio | 0.2 ms | `audio/` |
| UI (React commits, amortised) | 0.3 ms | `ui/` |
| **CPU total** | **≤ 6.0 ms** | |
| GPU: shadows | 1.5 ms | |
| GPU: opaque | 4.5 ms | |
| GPU: water | 1.5 ms | |
| GPU: transparent + particles | 0.8 ms | |
| GPU: post | 2.0 ms | |
| **GPU total** | **≤ 10.5 ms** | |

Headroom of ~0.1 ms is intentional: the budget should be *achievable*, not merely aspirational.

## 3. Scene budgets

| Metric | Budget | Notes |
|---|---|---|
| Draw calls | ≤ 150 | typical 90–120 |
| Triangles rendered | ≤ 900k | |
| Materials in use | ≤ 20 | shader programs ≤ 14 |
| Texture memory | ≤ 160 MB | transcoded |
| Skinned characters | ≤ 4 full-rate | |
| Active entities | ≤ 3,000 | nodes + structures + animals + items |
| Rapier dynamic bodies | ≤ 40 | |
| Particles alive | ≤ 1,500 (High) | |
| Active audio voices | ≤ 32 | |
| JS heap after 1 h | ≤ 500 MB | no growth trend |

## 4. Techniques, by impact

### 4.1 Instancing (biggest win)
Everything repeated is instanced: vegetation, rocks, structure pieces, crops, tilled soil, dropped items. One `InstancedMesh` per (geometry, material, LOD). See `08_THREEJS_ARCHITECTURE.md` §4.

### 4.2 Atlasing
All static props share one albedo/normal/ORM atlas → one material → one draw call per LOD tier for the entire prop set.

### 4.3 LOD and draw distance
Three LODs for large assets, two for small, distance-based with hysteresis (±10% to prevent flicker). Grass count scales continuously with distance rather than popping.

### 4.4 Culling
Frustum culling per object (three.js) plus chunk-level early rejection for terrain, vegetation groups and shadow casting. No occlusion culling — the island's openness makes it low-value.

### 4.5 Workers
World generation, chunk meshing, and save serialisation run off the main thread. The main thread never blocks on them; results arrive as transferables.

### 4.6 Allocation discipline
Zero allocation in per-frame paths. Scratch vectors at module scope, object pools for particles, item pops, audio voices, and event objects. GC pauses are the most common cause of a 1-in-200-frames hitch, and they are entirely avoidable.

### 4.7 Event-driven UI
React commits only on state change. Per-frame HUD elements are on a 2D canvas. See `24_UI_UX_SYSTEM.md` §1.

### 4.8 Bucketed simulation
Systems that would otherwise scan everything (regrowth, crop growth, wildlife spawn checks) use bucketed queues or run at reduced rates (proximity checks at 10 Hz, spawn director at 1 Hz). No system may be O(all entities) per tick without justification.

### 4.9 Sim at 30 Hz
Halves simulation cost versus 60 Hz, with interpolation making it invisible.

## 5. Loading performance

- Initial bundle: ≤ 600 kB JS gzipped (three.js is ~170 kB of that; Rapier's WASM is lazy). Route-split: the title screen loads without the game code.
- Assets: core pack only (~12 MB), region packs streamed.
- The 3×3 chunks around spawn are generated and meshed before the fade clears; the rest streams.
- World generation is cached in IndexedDB after the first run, cutting subsequent loads to ~120 ms.
- Loading screen shows real progress from the manifest byte counts, never a fake bar.

## 6. Measurement

### 6.1 Dev overlay (always available in dev builds)
FPS, frame time graph (last 240 frames with a p99 marker), CPU/GPU split via timer queries where available, draw calls, triangles, programs, texture memory, entity count by archetype, active voices, heap size, and per-system tick timings.

### 6.2 `pnpm bench`
Headless-GL benchmark running six canonical scenes for 300 frames each, reporting frame time percentiles, draw calls and triangles. Results compared against `bench/baseline.json`.

- Regression >15% on any metric → CI fails.
- Baselines are rebaselined only deliberately, with a note in `34_DEVELOPMENT_LOG.md` explaining why.

### 6.3 Real-device checks
A manual pass each phase on: an M1 MacBook Air, a 2019 Intel integrated laptop, and a mid-range Windows discrete GPU. Recorded in the phase retro.

### 6.4 Long-session soak
An automated 60-minute Playwright session with scripted movement, gathering and building, asserting no heap growth trend, no frame-time drift, and no leaked entities/geometries/voices. Run nightly.

## 7. Optimisation process (the discipline)

1. **Never optimise without a measurement.** A PR that claims a performance improvement must include before/after numbers from `pnpm bench` or the overlay.
2. Find the actual bottleneck: CPU-bound and GPU-bound have completely different fixes, and guessing wrong wastes days. Use the timer-query split.
3. Prefer removing work over doing work faster. The best fix is usually fewer draw calls or fewer entities, not tighter loops.
4. Re-measure after. Keep the number in the PR description.
5. Add a guard test so the regression cannot return silently.

## 8. Known hot spots (watch list)

| Hot spot | Mitigation | Watch for |
|---|---|---|
| `terrainHeightAt` | branch-light bilinear, hottest function | callers doing it per-particle |
| Chunk meshing hitches | worker + max 4 chunks/frame | large LOD transitions while sprinting |
| Water reflection RT | ¼ res, 30 Hz, culled layers | someone adding objects to the reflection layer |
| Instance buffer rebuilds | swap-and-decrement, never rebuild | mass structure removal |
| React re-renders | event-driven stores, memoised slots | a store update on every inventory tick |
| Interior flood fill | debounced, worker if >2 ms | very large builds |
| Save snapshot | worker for serialise; snapshot ≤ 10 ms | growth as content is added |
| Audio decode | queued, never per-frame | a burst of first-time sounds in a new region |
| Particle allocation | pooled | a new VFX added without pooling |

## 9. Implementation steps

1. Dev overlay with frame graph and counters (Phase 0 — this must exist before anything else).
2. Timer-query GPU split where supported.
3. `pnpm bench` harness + baselines + CI gate (Phase 0 for the harness, baselines fill in per phase).
4. Allocation lint rule + a heap-growth assertion in the soak test.
5. Instancing infrastructure (Phase 1).
6. LOD system with hysteresis (Phase 1).
7. Worker chunk meshing (Phase 1).
8. Adaptive quality stepping (Phase 6).
9. Bundle-size budget check in CI (Phase 0).
10. Nightly soak test (Phase 2 onward).

## 10. Testing requirements

- `pnpm bench` in CI against baselines, per-scene.
- Bundle size assertion on every build.
- Soak test nightly with heap and frame-time trend assertions.
- Per-system tick timing assertions in the sim harness (each system's budget from §2 is a test, not a hope).
- A "worst case island" fixture save — 4,000 structures, 600 farm tiles, 200 world items, 40 animals — benchmarked each phase. Build this fixture in Phase 4 and never delete it.

## 11. Future expansion

- WebGPU renderer path for a compute-based grass and cheaper instancing.
- Impostor billboards for distant trees, generated in the asset pipeline.
- Occlusion culling if interiors ever become dense enough to justify it.
- Moving the simulation to a worker with SharedArrayBuffer — only if the sim ever exceeds its 3 ms budget, and expect the transfer cost to eat most of the gain.
