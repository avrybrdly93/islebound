# 25 — Asset Pipeline

Purpose: how source art becomes runtime assets, the formats and budgets, and the automation that keeps this from becoming a manual chore. A solo developer cannot afford a manual pipeline.

---

## 1. Principle

**Source files are inputs; runtime assets are build artefacts.** `assets-src/` holds `.blend`, `.psd`/`.kra`, `.wav`, `.svg`. `packages/client/assets/` holds only generated `.glb`, `.ktx2`, `.ogg`, `.json` — all produced by `pnpm assets:build` and all reproducible from source.

Runtime assets **are** committed (so a clone can run without Blender installed), but they are never edited by hand and the build verifies they match their sources by hash.

## 2. Directory layout

```
assets-src/                       (git-lfs)
├── models/       *.blend
├── textures/     *.kra, *.png (source res)
├── audio/        *.wav (48 kHz, 24-bit)
├── icons/        *.svg
├── world/        control-map.png, region-map.png
└── manifest.json                 # source → output mapping + settings

tools/assets/
├── build.ts                      # orchestrator
├── exportModels.ts               # Blender headless export
├── compressTextures.ts           # toktx / basisu
├── encodeAudio.ts                # ffmpeg → ogg
├── buildAtlases.ts               # icons → sprite atlas
├── buildManifest.ts              # runtime asset manifest with hashes
└── validate.ts                   # budget + convention checks
```

## 3. Models

- Authored in Blender. Export via headless Blender script → glTF 2.0 binary (`.glb`).
- **Draco compression** on mesh data (`--draco`), quantisation: position 14 bits, normal 10, uv 12. Typical 60–75% size reduction.
- Export settings enforced by the script, not by the artist remembering: +Y up, apply modifiers, no cameras/lights, materials by name only (textures are assigned at runtime by the material factory).
- **Naming inside the file matters:** objects named `LOD0/LOD1/LOD2`, collision meshes named `UCX_*`, sockets as empties named `SOCKET_<type>_<n>`. The exporter reads these into glTF `extras` so the runtime gets colliders and sockets for free.
- LODs are authored, not auto-generated (auto-decimation on stylised low-poly looks bad). Budget below.

### Polygon budgets

| Asset class | LOD0 | LOD1 | LOD2 |
|---|---|---|---|
| Tree (large) | 1,200 | 400 | 120 (billboard-ish cross) |
| Bush / plant | 300 | 100 | — |
| Rock | 250 | 90 | — |
| Structure piece | 400 | 150 | — |
| Furniture | 600 | 200 | — |
| Character (player) | 4,500 | 1,800 | — |
| Animal | 1,500 | 600 | — |
| Prop (small) | 200 | — | — |

Whole-scene target: ≤ 900k triangles rendered at 1080p on High.

## 4. Textures

- Source at 2048², authored with a shared palette (see `26_ART_DIRECTION.md`).
- **Compressed to KTX2 / Basis Universal (UASTC for normal maps, ETC1S for albedo)** via `toktx`. Transcoded at load to the platform's native format (BC7/ASTC/ETC).
- Sizes: terrain layers 1024², props atlas 2048², characters 1024², UI icons in a 2048² atlas, sky ramp 256×64.
- **Atlasing:** all static props share one 2048² albedo + normal + ORM atlas. This is what keeps draw calls low; it is a hard requirement, not an optimisation.
- ORM packing: occlusion in R, roughness in G, metalness in B. One texture instead of three.
- Mipmaps generated at compression time. sRGB flag set for albedo only.

Texture memory budget: **≤ 160 MB** transcoded on High, ≤ 90 MB on Low (achieved by shipping a half-resolution variant of the largest atlases).

## 5. Audio

- Source `.wav` 48 kHz 24-bit mono (SFX) or stereo (ambience/music).
- Encoded with `ffmpeg` to Ogg Vorbis: SFX `-q:a 3` mono, ambience `-q:a 4` stereo, music `-q:a 5` stereo.
- Loops are checked for click-free seams by an automated test (compare the first and last 128 samples; fail if the discontinuity exceeds a threshold).
- Normalisation: SFX to −16 LUFS integrated, ambience to −23 LUFS, music to −20 LUFS. Applied by the pipeline, so the mix starts sane.

## 6. Icons and UI art

- Authored as SVG, rendered to PNG at 64² and 128², packed into an atlas with a generated TypeScript map (`assets/icons.generated.ts`) giving each icon's UV rect. Type-safe icon references, no missing-icon bugs.

## 7. The manifest

`assets/manifest.json` is generated and contains, for every asset: path, byte size, content hash, category, and the region pack it belongs to.

The runtime uses it for: cache busting (hash in the filename), preload lists per region, load progress calculation, and the budget check in CI.

Region packs: `core`, `shore`, `forest`, `terraces`, `ridge`, `caves`, `reef`, `point`. Loaded on approach (when the player enters a chunk within 2 chunks of a region boundary), with a 25 MB in-memory cap and LRU eviction of unloaded regions.

## 8. Automation

```
pnpm assets:build          # full rebuild
pnpm assets:build --only models
pnpm assets:watch          # rebuild on source change (dev)
pnpm assets:validate       # budgets + conventions, no rebuild
```

- Incremental: skips any asset whose source hash matches the manifest entry.
- CI runs `assets:validate` on every PR and `assets:build` nightly, failing if generated output differs from what is committed (catches "edited the glb by hand").
- Blender and ffmpeg are required only for `assets:build`, not for running the game. Document versions in `tools/assets/README.md` and pin them.

## 9. Validation rules (enforced)

- No texture larger than its class budget; no non-power-of-two textures.
- Every model has LOD0; models over 800 tris must have LOD1.
- Every model's collision is either `UCX_*` meshes, a declared primitive, or explicitly `none`.
- Naming conventions match `05_CODEBASE_STRUCTURE.md` §9.
- Every asset referenced by a content table exists; every asset in the manifest is referenced by something (dead assets are flagged, not failed).
- Total initial-pack size ≤ 15 MB compressed; each region pack ≤ 8 MB.

## 10. Implementation steps

1. `assets-src/` layout, git-lfs configuration, `manifest.json` schema.
2. Blender headless export script + LOD/socket/collision conventions; test on three models.
3. Texture compression via toktx; verify transcoding on all target browsers.
4. Audio encoding + normalisation + loop seam checks.
5. Icon SVG → atlas + generated TS map.
6. Manifest generation with hashes; runtime loader consuming it.
7. Region pack definition and lazy loading with progress UI.
8. Incremental rebuild + watch mode.
9. `assets:validate` + CI wiring.
10. Placeholder asset system: a magenta checker cube and a beep, used automatically when an asset is missing, so development never blocks on art.

## 11. Testing requirements

- Every generated asset loads without error in a headless test that walks the manifest.
- Round-trip: build assets twice from clean; outputs are byte-identical (deterministic pipeline).
- Budget assertions in CI against the manifest.
- Loop seam test for every looping audio file.
- A load test: fetch every region pack sequentially and assert peak memory stays under budget.

## 12. Future expansion

- Automatic impostor/billboard generation for distant trees (a render-to-texture step in the pipeline).
- A texture variant generator for dye colours (currently done in-shader with a tint mask, which is cheaper).
- glTF material extensions for anisotropy/sheen if the art direction ever wants fabric detail.
- A small in-repo asset browser page for reviewing everything at a glance.
