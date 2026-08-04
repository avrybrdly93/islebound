# 08 — Three.js Architecture

Purpose: how the renderer layer is organised, how it mirrors simulation state, and the conventions for scene graph, materials, and resource lifetime. Depends on `04_TECHNICAL_ARCHITECTURE.md`.

---

## 1. Responsibilities

`render/` does exactly four things:

1. Owns the `WebGLRenderer`, `Scene`, and cameras.
2. Reconciles simulation state into three.js objects (`Sync.ts`).
3. Runs presentation-only simulation: wind sway, particles, camera smoothing, LOD selection, animation blending.
4. Draws.

It never decides gameplay outcomes. If the renderer disappeared, the game would still be fully playable headlessly (that is what `pnpm sim` proves).

## 2. Scene graph organisation

Keep the graph shallow. Deep hierarchies cost matrix updates.

```
scene
├── sky            (SkyDome, Sun, Moon, Stars)   — matrixAutoUpdate off
├── terrain        (chunk meshes, flat list)     — matrixAutoUpdate off after placement
├── water          (ocean plane, shoreline foam)
├── instanced      (InstancedMesh per (geo,mat): trees, rocks, grass, flowers, walls…)
├── entities       (dynamic: player, animals, dropped items, placed unique props)
├── vfx            (particle systems, decals, item pops)
└── debug          (dev only; removed from prod build)
```

Rules:
- `object.matrixAutoUpdate = false` for anything static; call `updateMatrix()` once on placement.
- Never reparent objects during play; move them between pools instead.
- `frustumCulled = true` everywhere except the sky dome and full-screen effects.
- Use `Layers` for: 0 default, 1 water reflection excludes, 2 UI-in-world (nameplates), 3 debug.

## 3. Sync: world → three.js

`render/Sync.ts` is the only place that reads the world and writes three.js.

```ts
interface View { obj: THREE.Object3D; kind: ViewKind; lastTick: number; }
const views = new Map<EntityId, View>();

export function sync(world: World, alpha: number) {
  for (const e of world.dirtyRenderables()) upsertView(world, e);
  for (const e of world.destroyedThisTick()) releaseView(e);
  for (const [e, view] of views) applyInterpolatedTransform(world, e, view, alpha);
}
```

- **Dirty tracking:** `Renderable` writes mark the entity dirty. A full rebuild happens only on world load or region stream-in.
- **Interpolation:** each entity keeps `prevTransform` and `transform` in the sim; the renderer lerps position and slerps rotation by `alpha`. This is why the sim can run at 30 Hz and still look smooth at 144 Hz.
- **View factories** live in `render/entities/*.ts`, one per `ViewKind` (`tree`, `rock`, `animal`, `player`, `structure`, `crop`, `itemDrop`). Each factory returns an `Object3D` and registers its own dispose logic.

Entities that are part of an `InstancedMesh` do not get an `Object3D`; the view is `{ instancedMeshId, instanceIndex }`. Handled by `render/vegetation/InstanceRegistry.ts`, which maintains free lists per mesh.

## 4. Instancing strategy

Instancing is the single most important performance decision. Targets: 40,000 grass tufts, 6,000 trees/rocks/plants, 2,000 structure pieces, all under 150 draw calls total.

- One `InstancedMesh` per (geometry, material, LOD level). Capacity allocated up front from a table in `content/instancing.ts`, grown by doubling if exceeded (log a warning; the table should be fixed instead).
- Per-instance data beyond the matrix (colour variation, wind phase, growth scale) goes in `InstancedBufferAttribute`s consumed by a patched material (`onBeforeCompile`).
- **Instance culling:** three.js does not cull instances individually. We do coarse culling by keeping instances grouped per terrain chunk — one `InstancedMesh` per chunk per type for large props, and a single global mesh with a distance-based count for grass (sorted so that near instances occupy the low indices, and `mesh.count` is set per frame).
- Adding/removing instances (a felled tree, a placed wall) swaps the last instance into the freed slot and decrements `count`. Never rebuild the whole buffer at runtime.

## 5. Materials

Central factory: `render/materials/MaterialFactory.ts`. **No file outside it may call `new THREE.Material`.** This guarantees deduplication, consistent colour management, and one place to swap shading models.

Base palette of materials:

| Name | Base class | Used for | Notes |
|---|---|---|---|
| `terrain` | `MeshStandardMaterial` + patch | terrain chunks | 4-way splat via vertex colours + triplanar on cliffs |
| `foliage` | `MeshStandardMaterial` + patch | trees, bushes, grass | alpha-test, wind vertex animation, two-sided, subsurface-ish rim |
| `prop` | `MeshStandardMaterial` | rocks, structures, furniture | shared atlas texture |
| `character` | `MeshStandardMaterial` + skinning | player, animals | |
| `water` | custom `ShaderMaterial` | ocean, ponds | see `09_RENDERING_PIPELINE.md` §6 |
| `ghost` | `MeshBasicMaterial` transparent | build preview | tinted green/red |
| `sky` | custom `ShaderMaterial` | sky dome | gradient + sun disc + clouds |

Shading direction is **stylised-realistic**: physically based lighting but with a limited palette, strong ambient/hemisphere term and saturated bounce, rather than a hard toon ramp. See `26_ART_DIRECTION.md`.

Material patching uses `onBeforeCompile` with a stable `material.customProgramCacheKey()` so shader variants are not recompiled per instance.

## 6. Geometry and asset lifetime

- Every geometry, texture and material has exactly one owner, registered in `render/AssetRegistry.ts` with a refcount.
- `dispose()` is called when a region pack is unloaded, never per-entity.
- `render/entities/*` factories **clone materials only via the factory** (`factory.variant('prop', { color })`), which caches by key.
- Loaded glTF scenes are treated as templates: geometry and materials are extracted into the registry, then the scene is discarded. We never `clone()` a whole glTF at runtime.

## 7. Cameras

- `PerspectiveCamera`, fov 55 (a comfortable third-person value), near 0.15, far 900 with logarithmic depth **off** (we use a tuned near/far and fog instead; logDepth costs fill rate).
- Third-person spring arm: target = player head + offset, desired distance 4.5 m, collision via a Rapier shapecast that pulls the camera in, smoothed with critically damped springs (`core/math/spring.ts`).
- A second orthographic camera for shadow casting (see §8).
- Photo mode camera is a separate free-fly camera swapped in at the renderer level.

## 8. Lighting

Total real-time lights budget: **1 directional + 1 hemisphere + up to 8 point lights** (fires, lanterns) with distance-based culling.

- **Sun/moon:** one `DirectionalLight` whose colour, intensity and direction are driven by `20_DAY_NIGHT_SYSTEM.md`. Shadow map 2048², orthographic frustum **fitted to the camera's near region only** (0–60 m) and snapped to texel grid to stop shimmer. Beyond 60 m, no shadows — the art direction hides this with fog and haze.
- **Hemisphere light** provides sky/ground bounce; its two colours are keyframed across the day cycle.
- **Point lights** are pooled: the 8 nearest active light sources to the camera get a real light; the rest render only their emissive material and glow sprite.
- Baked lighting is not used (the world is player-built and dynamic). Ambient occlusion comes from SSAO in the post chain at Medium+ quality, and from painted AO in the models.

## 9. Renderer configuration

```ts
const renderer = new THREE.WebGLRenderer({
  antialias: false,                 // we use post-process SMAA; MSAA + post is wasteful
  powerPreference: 'high-performance',
  stencil: false,
  depth: true,
  alpha: false,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, capabilities.maxPixelRatio)); // 1.5 cap on integrated
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
```

Colour management is on (three.js default since r152). All authored textures are tagged `SRGBColorSpace` for albedo, `NoColorSpace` for data maps (normal, roughness, splat).

## 10. WebGPU path (Phase 6+, feature-flagged)

- We do not write raw GLSL where a three.js node/material feature suffices, so that a future `WebGPURenderer` swap is mostly mechanical.
- The two places with real GLSL — water and sky — are isolated behind `render/water/` and `render/sky/` with an interface, so a TSL/WGSL implementation can be added alongside.
- Feature flag `?renderer=webgpu` plus capability detection. Default remains WebGL2 until Safari support is dependable and we have measured a win.
- Never let a WebGPU-only visual feature become load-bearing for the art direction.

## 11. Common three.js pitfalls, pre-answered

| Pitfall | Our rule |
|---|---|
| Creating `Vector3`s in the render loop | module-scope scratch objects `_v0.._v3` |
| Shadow acne / peter-panning | fitted ortho frustum, normal bias 0.02, bias -0.0005, tuned per material |
| Shadow shimmer when moving | snap the light camera to shadow-map texel increments |
| Z-fighting on placed structures | 1 mm offset on coplanar pieces via the socket system, not depth bias |
| `alphaTest` foliage sorting | alpha-test (not alpha-blend) foliage; blend only for particles, sorted back-to-front |
| Transparent objects and depth | render transparents last with `depthWrite:false`, use `renderOrder` explicitly |
| Skinned mesh cost | max 4 animated characters on screen; animals beyond 30 m use vertex-animated LODs |
| Texture memory | KTX2/Basis everywhere, mipmaps on, anisotropy 4 |
| Frequent `scene.add/remove` | pools, `visible=false`, never structural changes per frame |
| `getObjectByName` in a loop | never; hold direct references in the view map |
