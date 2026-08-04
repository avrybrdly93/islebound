# 13 — Terrain System

Purpose: the runtime representation of the ground — data layout, chunking, meshing, streaming, materials, and the queries other systems make of it. Depends on `12_WORLD_GENERATION.md`.

---

## 1. Data model

The terrain exists in three forms simultaneously, all derived from the same source:

| Form | Owner | Purpose | Layout |
|---|---|---|---|
| **Heightmap** | `sim/terrain/TerrainData.ts` | authoritative height + derived fields | `Float32Array(1024×1024)` height, `Uint8Array` region, `Uint8Array×4` splat, `Float32Array` slope |
| **Collider** | `sim/physics` | collision | Rapier heightfield per chunk |
| **Mesh** | `render/terrain` | drawing | one `BufferGeometry` per chunk per LOD |

Total memory: ~16 MB for the height field and derived data. Acceptable and stored once; chunk meshes add ~14 MB at full stream.

## 2. Accessor API (used by everything else)

```ts
// sim/terrain/TerrainData.ts — pure, deterministic, no allocation
heightAt(x: number, z: number): number;            // bilinear interpolation
normalAt(x: number, z: number, out: Vec3): Vec3;   // from central differences
slopeAt(x: number, z: number): number;             // radians
regionAt(x: number, z: number): RegionId;
splatAt(x: number, z: number, out: Vec4): Vec4;
isWalkable(x: number, z: number): boolean;         // slope < 50° && height > seaLevel
isUnderwater(x: number, z: number): boolean;
raycastDown(x: number, z: number, fromY: number): number | null;
```

These are called thousands of times per tick (scatter checks, wildlife, placement validity), so they must be allocation-free and branch-light. `heightAt` is the single hottest function in the simulation; it is benchmarked separately.

**Rule:** any system needing ground height calls `heightAt`, never a physics raycast. Raycasts are 50× more expensive and unnecessary for a heightfield.

## 3. Chunking

- Chunk = 32 × 32 m, 33 × 33 vertices at LOD0 (shared edge vertices).
- Chunk grid 32 × 32 for the playable area; the surrounding sea needs no terrain chunks (the ocean plane covers it).
- Chunk index `cx + cz * 32`; stable, used as a key everywhere including saves.
- Per-chunk record:

```ts
interface Chunk {
  index: number;
  bounds: AABB;
  lod: 0 | 1 | 2;
  state: 'unloaded' | 'meshing' | 'ready';
  mesh: THREE.Mesh | null;
  collider: ColliderHandle | null;
  instances: Map<SpeciesId, InstancedGroup>;
  nodeEntities: EntityId[];
  dirty: boolean;                 // needs remesh (foundation flattening)
}
```

## 4. Meshing

Runs in `workers/chunkMesher.worker.ts`.

- Input: chunk index, LOD, a copy of the height/splat slice (transferred, not cloned per call — the worker holds a persistent copy of the whole heightmap, updated by messages when terrain is modified).
- Output: transferable `position`, `normal`, `uv`, `color` (splat weights) `Float32Array`s and an index `Uint16Array`.
- Triangulation: regular grid, alternating diagonal direction per quad to avoid directional artefacts on slopes.
- **Skirts:** each chunk has a 1.5 m downward apron on all four edges, sharing the edge vertices' XZ and colour. This hides LOD cracks with no stitching logic.
- Normals are computed from the *global* heightmap (not per-chunk), so lighting is continuous across chunk borders.
- LOD1 samples every 2 m (17×17), LOD2 every 4 m (9×9).

Throughput target: **≤ 6 ms per chunk** in the worker, up to 4 chunks meshed per frame budget window.

## 5. Streaming

- Load radius: LOD0 within 96 m of the camera, LOD1 to 224 m, LOD2 to 480 m. Unload beyond 560 m (hysteresis prevents thrash).
- Priority queue ordered by distance and by whether the chunk is in the view frustum.
- Colliders are created only for LOD0 chunks plus a one-chunk ring (so a fast-moving player never outruns collision).
- Vegetation instances stream with their chunk. Resource node *entities* do **not** unload — they are cheap (a few hundred bytes) and their state must keep ticking for regrowth. Only their views unload.
- On first load, the 3×3 chunks around spawn are generated and meshed before the loading screen clears; the rest streams in behind the fade.

## 6. Terrain material

One material for all chunks (see `08_THREEJS_ARCHITECTURE.md` §5):

- Four albedo + normal + roughness textures (sand, grass, rock, dirt) packed as KTX2 array textures.
- Blend weights from vertex colours, normalised in the shader.
- **Triplanar** projection blended in where slope > 40°, so cliffs don't show stretched UVs. Blend factor smoothstepped over 40–55° to avoid a visible seam.
- Macro variation: a large-scale noise texture multiplies albedo by ±8% to break up tiling at distance.
- Distance-based detail fade: detail normal maps fade out beyond 40 m, saving texture fetch.
- Wetness: a global uniform raised during rain darkens albedo and lowers roughness on the sand and dirt channels, and a puddle mask uses the flow-accumulation field. This is one of the highest-value-per-cost visual features in the game.

## 7. Terrain modification (foundation flattening)

The only terrain modification in the game.

1. Building system requests `flatten(centerX, centerZ, halfExtent, targetY)`.
2. `TerrainData` writes the new heights into the height array: exact `targetY` within the footprint, smooth blend (smoothstep) over a 1.5 m skirt outside it.
3. The modification is recorded in the save as `{ x, z, w, h, y }` rectangles (typically <200 total, trivially small).
4. Affected chunks are marked dirty → remeshed → colliders rebuilt → vegetation instances inside the footprint removed (and recorded as removed in the save).
5. Removing the foundation restores the original generated heights for that rectangle (recomputed from the generator, not stored), *unless* an overlapping foundation still exists.

Edge cases to test: overlapping foundations, foundations crossing chunk borders, a foundation removed while another overlaps it, flattening under existing resource nodes (nodes on the footprint are removed and refunded).

## 8. Water interaction

- Terrain below `y = 0` is seabed; it is meshed normally and rendered with a wet variant of the material.
- The shoreline foam band in the water shader uses the depth buffer, so terrain needs no special shoreline geometry.
- `isUnderwater` is a simple `heightAt < 0` check; the water *surface* height for buoyancy comes from `waterHeightAt` (`10_PHYSICS_SYSTEM.md` §7), which includes waves.

## 9. Implementation steps

1. `TerrainData` with accessors + unit tests, fed by a synthetic heightmap.
2. Chunk registry and bounds; debug wireframe of the chunk grid.
3. Worker mesher for LOD0 only; render flat-shaded to verify geometry.
4. Terrain material with splat blending; tune with real textures.
5. LOD1/LOD2 + skirts; verify no visible cracks from 12 sampled viewpoints.
6. Streaming with priority queue and hysteresis; verify no hitching while running a fixed 300 m route.
7. Rapier heightfield colliders tied to chunk lifecycle.
8. Triplanar cliffs, macro variation, detail fade.
9. Wetness and puddles wired to the weather system.
10. Foundation flattening + remeshing + save/restore.

## 10. Testing requirements

- Unit: `heightAt` bilinear interpolation matches a reference implementation at 10,000 sampled points, including on chunk boundaries and at the array edges.
- Unit: `heightAt` performs ≥ 20M calls/second (benchmark; it is the hottest function).
- Integration: streaming 200 chunks in and out leaves zero orphaned meshes, geometries, colliders or instance slots (assert registry counts return to baseline).
- Integration: flatten → remesh → save → reload → heights match; then remove → heights match the original generation exactly.
- Visual: no cracks at LOD boundaries (golden screenshots at three LOD transition points).
- Performance: meshing ≤ 6 ms/chunk; streaming update ≤ 0.3 ms/frame; full stream-in of the island ≤ 4 s.

## 11. Future expansion

- Snow accumulation on the ridge as a splat channel driven by weather (cheap, high impact).
- Footprint decals in sand and snow (a decal atlas + a ring buffer).
- Player-planted grass/flower patches as a fifth splat channel.
- Quadtree LOD with geomorphing if the island ever grows beyond 512 m — not needed at current scale, and the added complexity is not justified.
