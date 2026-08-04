# 12 — World Generation

Purpose: how the island is produced. It is generated, not hand-modelled, but it is **authored** — the generator is steered by hand-placed control data so the result is a designed place, not noise.

---

## 1. Philosophy

Pure procedural generation makes forgettable islands. Pure hand-authoring makes a 3D-modelling project. We use **guided generation**:

- A hand-drawn 256×256 **control map** (four channels: elevation bias, region ID, moisture, feature mask) authored as a PNG in `assets-src/world/`.
- Procedural noise adds detail, variation and density at scales the control map does not describe.
- **Everything is deterministic from `(seed, controlMap)`.** The same inputs give the same island on every machine, forever.

The shipped island uses `seed = 0x48414C43` ("HALC") and the checked-in control map. Alternative seeds exist for testing only.

## 2. Island specification

| Property | Value |
|---|---|
| Playable extent | 512 × 512 m |
| World extent (incl. sea) | 1024 × 1024 m |
| Sample resolution | 1 m |
| Chunk size | 32 m (32×32 chunks playable) |
| Sea level | y = 0 |
| Max elevation | y = 96 m (Mistpine Ridge summit) |
| Beach band | y ∈ [0, 2.5] |
| Cave volume | authored meshes, not generated |
| Walk time corner to corner | ~5.5 min at run speed |

## 3. Generation pipeline

Runs in a Web Worker on first load, ~600 ms, cached in IndexedDB keyed by `(seed, controlMapHash, generatorVersion)`.

```
1.  loadControlMap()             → 256² RGBA
2.  buildBaseElevation()         → 1024² Float32
3.  applyErosion()               → hydraulic erosion, 40k droplets
4.  carveFeatures()              → river channel, waterfall notch, terrace steps, harbour
5.  computeDerived()             → slope, normal, curvature, flow accumulation
6.  assignRegions()              → region ID per sample (control map + elevation rules)
7.  computeMoisture()            → distance-to-water + control map + altitude
8.  buildSplatWeights()          → sand/grass/rock/dirt per vertex
9.  scatterVegetation()          → poisson-disk per species per region
10. placeResourceNodes()         → density tables per region
11. placeLandmarks()             → ruins, fragments, rope points, viewpoints (from feature mask)
12. buildNavHints()              → walkability grid for wildlife (4 m resolution)
13. emit WorldData               → transferable arrays + placement lists
```

### 3.1 Base elevation

```
h(x,z) =  islandMask(x,z) * (
            controlElevation(x,z) * 0.62          // authored shape dominates
          + fbm(x,z, oct=5, lac=2.0, gain=0.5) * 0.28
          + ridgeNoise(x,z, oct=3) * ridgeMask(x,z) * 0.10
          ) * MAX_ELEVATION
```

- `islandMask` = smoothstep of distance from the island centre with a noise-perturbed radius, guaranteeing water at the world edge and a coherent silhouette.
- `controlElevation` is bilinearly sampled and smoothed; it is what makes the island *this* island.
- `ridgeMask` limits ridge noise to the northern third.

### 3.2 Hydraulic erosion

40,000 droplets, standard particle erosion (capacity, deposition, evaporation). Parameters tuned once and frozen in `content/worldgen.ts`. Purpose: natural valleys, a plausible river route, and softened noise artefacts. It runs in ~180 ms and is the largest single cost — it is worth it, and it is cached.

### 3.3 Feature carving

Authored features are stamped after erosion so erosion cannot destroy them:

- **River** — a spline authored in the control map's feature channel, carved with a smooth V profile, flowing from the ridge waterfall to the harbour.
- **Waterfall notch** — a hard 14 m drop with a plunge pool; the cave entrance is behind it.
- **Terraces** — six flat steps on the south-east hillside with retaining-wall footprints.
- **Harbour** — a flat sandy bay, the starting beach, guaranteed clear of props in a 20 m radius around the spawn point.
- **Cave mouths** — three flat, clear pads where cave meshes attach.

### 3.4 Regions

Region assignment is a priority list evaluated per sample: explicit control-map region ID wins; otherwise rules by elevation, slope, moisture and distance to water. Every sample gets exactly one region ID; region IDs drive vegetation tables, resource tables, ambience, music, fish tables and journal "Places".

Region boundaries are dilated and smoothed so scatter transitions are gradual, and a 6 m blend band mixes the two neighbouring vegetation tables.

## 4. Scatter (vegetation and props)

For each region × species:

```ts
interface ScatterRule {
  species: SpeciesId;
  density: number;            // instances per 100 m²
  minSpacing: number;         // poisson radius, m
  slopeRange: [number, number];
  elevationRange: [number, number];
  moistureRange: [number, number];
  clumping: number;           // 0 = even, 1 = strongly clustered
  scaleRange: [number, number];
  yRandomRotation: true;
  alignToNormal: number;      // 0 = up, 1 = fully aligned to slope
}
```

- Poisson-disk sampling per chunk with a deterministic per-chunk RNG stream (`rngFor('scatter', chunkX, chunkZ)`), so chunks can be generated independently and in any order — essential for streaming and for regeneration after a save migration.
- Clumping is implemented by modulating acceptance probability with a low-frequency noise field.
- **Clearance rules:** nothing scatters within 3 m of the spawn beach, within 2 m of an authored landmark, within 1.5 m of the river spline, or on slopes above the species' limit.
- Grass is not scattered as entities — it is generated procedurally per chunk in the renderer from the same noise field, never simulated.

## 5. Resource node placement

Nodes **are** entities (unlike grass) because they have state (harvested, regrowth timer, remaining yield).

- Placement uses the same scatter machinery with per-region density tables from `content/nodes.ts`.
- Total node budget: **~2,800 nodes island-wide.** Enforced by a validation pass that warns if a region exceeds its share by >20%.
- Density is tuned so a player at the beach always has ≥6 wood nodes and ≥6 stone nodes within 60 m, and no region has a resource desert larger than 40 m across.
- Rare nodes (crystal, ore, rare plants) are placed with a minimum spacing of 25 m and a guaranteed count per region rather than by probability, so the player's experience is not seed-luck dependent even in test seeds.

## 6. Landmarks and authored content

From the control map's feature channel plus an explicit list in `content/landmarks.ts`:

- 7 ruins (with fragment spawn points), 3 cave mouths, 5 rope points, 12 viewpoints (used by camera framing assists and journal "Places"), 1 lighthouse, 1 shipwreck (reef), 6 message bottles (shoreline, respawning).
- Landmarks have exact hand-specified coordinates. They are the anchors that make the island memorable; do not randomise them.

## 7. Player modifications vs generated world

Critical distinction for saving:

- **Generated content is not saved.** It is regenerated from `(seed, version)`.
- **Deltas are saved:** node states (harvested/regrowth), removed vegetation (felled trees), placed structures, tilled/planted tiles, terrain flattening under foundations, opened containers, collected fragments.
- The save therefore stays small (typically <400 kB) and world generation improvements can ship without invalidating saves — as long as the **generator version** is handled by a migration (see `23_SAVE_SYSTEM.md` §7).

## 8. Terrain modification

The player can flatten terrain only implicitly, by placing foundations, which raise/lower a 1 m-grid patch to the foundation's height with a 1.5 m blend skirt. Free digging and raising are **out of scope** (they break the authored silhouette, complicate collision, and multiply save size). Recorded as a deliberate rejection in `40_DECISION_LOG.md`.

## 9. Implementation steps

1. Control-map loader + a debug viewer that renders each channel.
2. Base elevation with island mask and fbm; verify silhouette from 8 viewpoints.
3. Erosion pass; snapshot before/after heightmaps in tests.
4. Feature carving (river, waterfall, terraces, harbour, cave pads).
5. Derived fields (slope, normal, moisture, flow) + debug overlays.
6. Region assignment + region debug colouring.
7. Splat weight generation; hand-tune the thresholds with the terrain material.
8. Poisson scatter with per-chunk determinism; verify chunk-independence by generating in random order and hashing.
9. Node placement + density validation pass + a density heatmap debug view.
10. Landmarks and rope points.
11. Wildlife nav hint grid.
12. IndexedDB caching + cache invalidation on version bump.

## 10. Testing requirements

- **Determinism:** generating with the same seed twice yields identical hashes for heightmap, scatter list and node list. Run in CI.
- **Chunk independence:** generating chunks in shuffled order yields the same result as sequential order.
- **Playability invariants** (automated, run on every worldgen change):
  - The spawn beach is walkable and clear for 20 m.
  - Every region is reachable from spawn given its gate items (pathfind on the nav grid with gate assumptions).
  - No enclosed pockets of walkable terrain unreachable from spawn.
  - No terrain slope discontinuity greater than 45° between adjacent samples.
  - Every region contains ≥ its minimum guaranteed node counts.
  - The 24 fragment spawn points are all on walkable ground and within 3 m of their landmark.
- **Visual regression:** a top-down 1024² render of the heightmap and region map compared against golden images.
- **Performance:** full generation ≤ 900 ms in the worker on the reference machine; cached load ≤ 120 ms.

## 11. Future expansion

- A second smaller island reachable by boat, using the same pipeline with its own control map (post-1.0).
- Seasonal recolouring of the splat and vegetation tables (would not require regeneration).
- An in-game "island seed viewer" for players who want a different island — deliberately not shipped at 1.0, because a shared island is a shared conversation.
