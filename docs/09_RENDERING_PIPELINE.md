# 09 — Rendering Pipeline

Purpose: the per-frame render order, post-processing chain, quality tiers, and the visual budget. Companion to `08_THREEJS_ARCHITECTURE.md` and `28_PERFORMANCE_OPTIMIZATION.md`.

---

## 1. Frame order

```
1.  input.poll()                          ~0.05 ms
2.  world.step() × N   (0–5 sim ticks)    ~1.5 ms typical
3.  render.sync(world, alpha)             ~0.5 ms
4.  camera.update(dt)                     ~0.05 ms
5.  streaming.update(camera)              ~0.1 ms  (chunk load/unload requests)
6.  lod.update(camera)                    ~0.2 ms  (LOD + instance counts + light pool)
7.  animation.update(dt)                  ~0.4 ms
8.  vfx.update(dt)                        ~0.3 ms
9.  shadowPass                            ~1.2 ms  (GPU)
10. opaquePass                            ~4.0 ms  (GPU)
11. waterPass (incl. reflection RT)        ~1.5 ms  (GPU)
12. transparentPass                       ~0.6 ms  (GPU)
13. postChain                             ~1.8 ms  (GPU)
14. ui (React, only on state change)      ~0.2 ms
```

Budget at 60 fps is 16.6 ms. Target: **CPU ≤ 6 ms, GPU ≤ 11 ms** on the reference machine (M1 / Iris Xe, 1080p). Numbers above are the design allocation; `pnpm bench` records actuals.

## 2. Passes in detail

### 2.1 Shadow pass
- Single directional light, one 2048² cascade covering 0–60 m.
- Only objects with `castShadow` — trees (LOD0/1 only), rocks, structures, characters. Grass, small props and distant foliage never cast.
- Chunk-level early out: a chunk fully outside the shadow frustum is skipped.

### 2.2 Opaque pass
Sorted front-to-back by three.js automatically. Our contribution is minimising state changes:
- Terrain chunks share one material → one state change for the whole ground.
- All props share one atlas material.
- Foliage is its own material (alpha test), drawn after solid props.

### 2.3 Water pass
Water is drawn after opaques with depth read enabled so it can sample the depth buffer for shoreline foam and depth-based colour. Requires a depth texture — allocated once, reused.
- Reflection: a single planar reflection render target at **quarter resolution**, updated at **30 Hz** (every other frame), rendering only sky + terrain silhouettes + large props (layer mask). This is the biggest single-cost decision in the pipeline; on Low quality it is replaced by a cubemap of the sky only.

### 2.4 Transparent pass
Particles, glow sprites, build ghosts, UI-in-world markers. All `depthWrite:false`, explicit `renderOrder`.

## 3. Post-processing chain

Implemented with `EffectComposer`. Order matters:

```
input (HDR-ish linear buffer, half-float)
  → SSAO           [Medium+]      radius 0.6 m, 12 samples, bilateral blur, applied to ambient only
  → Bloom          [Low+]         threshold 1.05, strength 0.35, radius 0.5 — for fires, sun, crystals
  → GodRays        [High only]    radial blur from sun screen position, masked by occlusion buffer
  → DepthOfField   [High only]    very subtle, focus on the interaction target, f-stop tuned wide
  → ColorGrade     [Low+]         3D LUT 32³, per-weather/per-time-of-day blend of two LUTs
  → Vignette+Grain [Low+]         tiny; grain is 2% and off with reduce-motion
  → SMAA           [Low+]         cheaper and better-looking than FXAA for our stylised edges
  → tone map + sRGB output
```

- Everything except colour grading and AA can be disabled without the art breaking. The LUT is doing most of the aesthetic work; guard it.
- Underwater adds a full-screen tint + distortion pass inserted before ColorGrade, enabled by a camera-submerged test.
- Photo mode enables High settings regardless of the player's tier and allows manual DoF.

## 4. Quality tiers

Detected at startup by `platform/capabilities.ts` (renderer string heuristics + a 60-frame calibration burn-in), overridable in settings.

| Setting | Low | Medium | High |
|---|---|---|---|
| Pixel ratio cap | 1.0 | 1.25 | 1.5 |
| Shadow map | 1024², 40 m | 2048², 60 m | 2048², 80 m |
| Grass draw distance | 25 m | 45 m | 70 m |
| Prop draw distance | 90 m | 140 m | 200 m |
| Water reflection | sky cubemap | ¼ res, 30 Hz | ½ res, 30 Hz |
| SSAO | off | on | on |
| God rays / DoF | off | off | on |
| Particle budget | 300 | 800 | 1500 |
| Anisotropy | 1 | 4 | 8 |
| Foliage wind | vertex, cheap | vertex, full | vertex + normal perturb |

**Adaptive quality:** a running average of frame time over 120 frames. If it exceeds 20 ms for 3 seconds, step down one sub-setting at a time in a fixed priority order (grass distance → reflection → SSAO → pixel ratio → shadow res) and show a one-time, dismissible notice. Never step up automatically during play; re-evaluate only on scene load.

## 5. Terrain rendering

- Chunks of 32×32 m, vertex grid at 1 m, so 33×33 verts per chunk at LOD0.
- Three LODs by decimation (1 m, 2 m, 4 m spacing) selected by distance: 0–80 m, 80–200 m, 200 m+.
- **Seam handling:** skirts (a 1.5 m vertical apron around each chunk) rather than stitching. Cheap, invisible with our fog, and simple enough to never break.
- Material: 4-channel splat weights stored in vertex colours (sand, grass, rock, dirt), sampled with triplanar projection where slope > 40° so cliffs don't stretch.
- Chunk meshing happens in a Web Worker; the worker returns transferable `Float32Array`s.

## 6. Water

Two water bodies with the same shader, different parameters: **ocean** (infinite plane clipped to a radius around the player) and **fresh water** (pond/waterfall pools, small meshes).

Shader features, in cost order:
1. Depth-based colour ramp (shallow turquoise → deep blue) using the scene depth buffer.
2. Shoreline foam: a band based on depth difference, animated with a scrolling noise mask.
3. Normal-map scrolling (two layers, opposing directions) for surface detail.
4. Planar reflection sample with Fresnel blend.
5. Refraction offset sampling from the opaque colour buffer.
6. Sun specular highlight with a wide, soft lobe (this is what sells "warm afternoon").

Waves are vertex displacement from a sum of 3 Gerstner waves, matching the simulation's `waterHeightAt(x,z)` function **exactly** (shared constants in `shared/constants.ts`) so that floating objects and the raft sit correctly on visible crests.

## 7. Sky and atmosphere

- Sky dome: gradient driven by a 1D ramp texture indexed by sun elevation, plus a sun disc, plus scrolling cloud noise with two octaves. No physically based scattering — it costs more and looks less controllable than an art-directed ramp.
- Stars: a points cloud, opacity ramped by sun elevation, with a slow rotation.
- Fog: `FogExp2`, density and colour keyframed by time and weather. Fog is a primary art tool here — it hides the LOD transitions and gives depth to the island silhouette.
- Aurora (rare night event): an additive ribbon mesh with a scrolling noise shader; purely cosmetic and journal-logged.

## 8. Render targets inventory

Keep this list short; each RT costs memory and bandwidth.

| RT | Size | Format | Purpose |
|---|---|---|---|
| main | screen × pixelRatio | half-float RGBA | HDR-ish scene |
| depth | screen | depth24 | water, SSAO, DoF |
| reflection | ¼ screen | RGBA8 | water reflection |
| ssao | ½ screen | R8 | ambient occlusion |
| bloom ×3 | ½,¼,⅛ | RGBA8 | bloom mips |
| composer swap | screen | half-float | ping-pong |

All allocated once at startup and on resize (debounced 250 ms), never per frame.

## 9. Debug views (dev build only)

Toggleable from the dev overlay, each a single keystroke: wireframe, normals, overdraw heatmap, LOD colouring, chunk boundaries, shadow frustum, instance counts per mesh, draw call list, physics colliders, and a "what is expensive" mode that renders per-object GPU timer results when `EXT_disjoint_timer_query_webgl2` is available.

## 10. Testing the renderer

- **Smoke:** Playwright loads the game, waits for `game:ready`, asserts no WebGL errors and `frameCount > 120` within 5 s.
- **Visual regression:** deterministic scenes (fixed seed, fixed time-of-day, fixed camera) captured with `toHaveScreenshot({ maxDiffPixelRatio: 0.02 })`. Six canonical shots: beach dawn, forest noon, ridge fog, cave lantern, interior night, reef underwater.
- **Budget:** `pnpm bench` runs each canonical scene for 300 frames headless-GL and asserts draw calls, triangles, and frame time against `bench/baseline.json`. A >15% regression fails CI.
