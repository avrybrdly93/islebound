# Phase 1 — Player & World

**Proof:** walk the full island in under 6 minutes, never fall through terrain, watch the sun set — at 60 fps.
**Backlog tasks:** BL-022 – BL-044 (seeded; groom against this file before starting the phase).

---

## Goal

The island exists and moving around it is pleasurable on its own. This phase carries the game's feel; the human-in-the-loop movement checklist matters as much as any automated test.

## Milestones (in order)

### M1.1 — The island's shape (BL-022 → BL-025, BL-039)
Control map + loader + channel viewer; base elevation with the island mask; hydraulic erosion; feature carving (river, waterfall notch, terraces, harbour, cave pads); region assignment with a debug readout. Exit: silhouette approved from 8 viewpoints; generation deterministic and chunk-order-independent; `pnpm sim --check worldgen` invariants green (BL-043).

### M1.2 — Terrain runtime (BL-026 → BL-030)
`TerrainData` accessors (`heightAt` ≥ 20M calls/s); worker mesher LOD0; splat terrain material; LOD1/2 with skirts; streaming with hysteresis. Exit: run a fixed 300 m route with zero hitches > 4 ms from streaming; no visible cracks at 12 sampled viewpoints.

### M1.3 — A body in the world (BL-031 → BL-035, BL-042)
Rapier init + heightfield colliders tied to chunk lifecycle; kinematic character controller; movement system with IDLE/WALK/RUN/JUMP/FALL/LAND; third-person camera with spring-arm collision; input manager → intents; the movement feel harness scene and its 14-point human checklist. Exit: the fuzz test (20k random-input ticks, no NaN/stuck/out-of-bounds) green; a human signs off the checklist.

### M1.4 — Sky, water, life (BL-036 → BL-038, BL-040)
Day/night cycle driving light/fog/LUT with the dev time-scrubber; ocean shader first pass with depth colour + shoreline foam; instanced vegetation scatter; swim state with the shoreline-exit guarantee. Exit: sunset looks intentional (human review against `docs/26`); the shoreline exit test passes at 200 sampled points.

### M1.5 — Persistence of the world's identity (BL-041, BL-044)
Worldgen caching in IndexedDB keyed by (seed, map hash, generator version); the Phase 1 visual regression goldens (beach dawn, forest noon, ridge silhouette). Exit: warm load ≤ 120 ms for generation; goldens committed.

## Acceptance criteria for closing the phase

- [ ] The phase proof, on the reference hardware, recorded as a video in the retro
- [ ] Movement checklist signed by a human; tunables frozen into `config.ts`
- [ ] T6 (worldgen determinism + chunk independence) green in CI
- [ ] Frame budget: CPU ≤ 4 ms at this content level (headroom for later phases)
- [ ] Retro written; tag `phase-1-complete`

## Traps to avoid

- Tuning movement by committee of one agent — the checklist exists because feel needs a human.
- Letting the terrain material eat the GPU budget that Phase 6's post chain will need.
- Scattering vegetation before streaming is stable (you will re-do it).
