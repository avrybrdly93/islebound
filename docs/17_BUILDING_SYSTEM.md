# 17 — Building System

Purpose: how players place, snap, rotate, colour and remove structures. This is the main expression system and the strongest driver of long-term play, so its rules must be generous and predictable.

---

## 1. Design principles

1. **If it snaps, it stands.** No structural integrity, no collapsing, no support requirements.
2. **Nothing is permanent.** Everything removable, always 100% refund.
3. **Forgiving placement.** When in doubt, allow it. The failure mode of a cozy builder is "the game won't let me", never "my house looks odd".
4. **Snapping is a suggestion.** Grid snapping for structural pieces; free placement for decoration; a modifier key to disable snapping entirely.
5. **The island is the canvas.** Building anywhere on the island is allowed except in a few authored no-build volumes (cave interiors' story rooms, the spawn beach's 8 m arrival circle, the lighthouse base).

## 2. Piece model

```ts
interface PieceDef {
  readonly id: PieceId;
  readonly name: string;
  readonly category: 'foundation'|'wall'|'roof'|'floor'|'door'|'window'|'stair'|'fence'|'path'|'furniture'|'light'|'station'|'decor';
  readonly model: string;
  readonly footprint: { readonly w: number; readonly h: number; readonly d: number };  // metres
  readonly snapMode: 'grid' | 'socket' | 'surface' | 'free';
  readonly sockets: readonly SocketDef[];        // named attachment points
  readonly acceptsSockets: readonly SocketType[];
  readonly collider: 'box' | 'mesh' | 'none';
  readonly variants: number;                     // colour/material variants
  readonly recipeCost: readonly ItemCount[];     // refund = exactly this
  readonly placementRules: PlacementRules;
  readonly interaction?: 'chest'|'bed'|'station'|'sit'|'door'|'light'|'planter';
}

interface SocketDef { type: SocketType; pos: Vec3; rotY: number; }
type SocketType = 'foundationEdge'|'wallTop'|'wallSide'|'floorEdge'|'roofEdge'|'doorway'|'windowSlot'|'surfaceTop';

interface PlacementRules {
  maxSlope: number;              // degrees; foundations 12°, fences 30°, decor 45°
  requiresSupport: boolean;      // walls need a foundation/floor socket
  allowUnderwater: boolean;
  allowIndoorsOnly: boolean;
  minDistanceFromPiece?: number;
}
```

## 3. The grid and snapping

- **Structural grid:** 2 m modules on a global grid aligned to world axes, with a 1 m sub-grid for half-pieces. Rotation in 90° steps for structural pieces.
- **Socket snapping:** when the ghost is within 1.2 m of a compatible socket, it snaps to it, and the socket highlights. Socket snapping takes priority over grid snapping.
- **Surface snapping:** decorations align to the surface normal under the cursor (tables on floors, paintings on walls, lamps on tables), with 15° rotation steps and a free-rotate modifier.
- **Free mode:** hold `Alt` to disable all snapping; position is continuous, rotation is continuous, and the piece may intersect other pieces (but not terrain or the player).

Snapping resolution order per frame: compatible socket → grid → surface → free. The chosen mode is displayed as a small indicator so the player understands what is happening.

## 4. Build mode

```
enter build mode (B) or select a placeable from the hotbar
   │
   ├── piece catalogue opens (categories, owned counts, search)
   ├── ghost mesh follows the aim point (raycast, clamped to 12 m)
   ├── validity evaluated every frame:
   │     • terrain slope within limits
   │     • no overlap with PLAYER / ANIMAL / other pieces (unless free mode)
   │     • support requirement satisfied
   │     • inside island bounds, outside no-build volumes
   │     • materials available
   ├── ghost tint: green (valid) / red (invalid) + a one-line reason on invalid
   ├── R / rotate; scroll to change variant; Q to pick-and-copy an existing piece's settings
   ▼
LMB → intent {buildPlace}
   ▼
BuildingSystem: re-validate → consume materials → create entity
   → collider → terrain flatten if foundation → emit structure:placed
```

Removal mode (`X` toggle): aiming at a piece highlights it; LMB removes it and refunds materials. Removing a piece that supports others does **not** cascade — the supported pieces float, deliberately. Cozy over correct.

Copy tool (`Q`): picks the aimed piece's type, variant and colour into the ghost, which is enormously quality-of-life for large builds.

## 5. Structural catalogue (~40 pieces)

| Category | Pieces |
|---|---|
| Foundation | wood 2×2, stone 2×2, wood ramp, stone stair block |
| Wall | solid, half-height, window, doorway, arch, railing |
| Floor | wood, stone, tile, thatch |
| Roof | gable, hip, flat, corner, apex cap |
| Openings | wooden door, glass window, shutters, hatch |
| Outdoor | fence, gate, trellis, dock plank, dock post, bridge span |
| Path | stone path, gravel, plank walk, stepping stones |
| Furniture | bed, chair, stool, table, bench, shelf, bookcase, wardrobe, rug |
| Light | campfire, torch, lantern, hanging lamp, candle |
| Station | workbench, forge, kitchen, loom, potting bench |
| Decor | planter, vase, painting, crate, barrel, wind chime, hammock, sign |

Each piece has 4–8 colour variants unlocked by dyes.

## 6. Terrain interaction

- Foundations flatten terrain (see `13_TERRAIN_SYSTEM.md` §7). This is the only terrain modification.
- Non-foundation pieces do not modify terrain; they conform to it (fences step down slopes with automatic post-length adjustment, paths project onto the surface as decals-plus-geometry).
- Vegetation inside a placed footprint is removed and recorded; removing the structure does not bring the vegetation back (it regrows naturally if it was a resource node, otherwise it is gone — an acceptable and understandable rule).

## 7. Interiors

Detecting "indoors" matters for: rain not falling inside, warmth, ambient audio, light, and the "cosy home" journal entry.

Implementation: a **flood fill on the 1 m structural grid** at the piece level, run when the structure graph changes (debounced 500 ms, in a worker if it exceeds 2 ms). A cell is interior if it is enclosed on all four sides and above by pieces within a 32×32×8 cell region around the changed piece. Interior cells are stored in a sparse set and used to place a Rapier sensor volume per contiguous interior region.

This is deliberately approximate. A house with one missing wall is "outdoors" and that is fine and legible.

## 8. Persistence and scale

- Each placed piece is an entity with `Structure { pieceId, variant, colour, gridPos, rotY }`.
- Expected scale: 300–1,500 pieces for a heavily built island; upper bound 4,000 (a soft warning at 3,000, and a hard cap at 5,000 with an explanatory message).
- Spatial index: a uniform grid hash (4 m cells) for socket queries and removal targeting. Rebuilt incrementally.
- Rendering: instanced per (piece, variant, colour). 40 pieces × ~6 variants = up to 240 instanced meshes, but typically <40 in use — well within budget.

## 9. Feedback

Placement is the game's most rewarding action. Budget accordingly:

- Ghost: smooth follow with a slight lag, gentle pulse, snap indicator, and a soft "click" tick when the snap target changes.
- On place: a 0.3 s scale-up from 0.9 with an elastic ease, a dust puff at the base, a satisfying material-specific thunk (wood/stone/cloth), a small camera punch, and the material icons flying from the HUD into the piece.
- On remove: a reverse scale-down, dust, and materials arcing back to the HUD.
- First time a piece type is placed: a slightly bigger flourish and a journal entry.

## 10. Implementation steps

1. `PieceDef` table + validation; a handful of pieces (foundation, wall, floor) for bring-up.
2. Build mode state, ghost mesh, aim raycast, materials check.
3. Grid snapping + rotation + validity checks + tint and reason UI.
4. Placement → entity + collider + instanced rendering.
5. Removal + refund + spatial index.
6. Socket definitions authored in the glTF `extras`, socket snapping, socket highlighting.
7. Foundation terrain flattening + remesh integration.
8. Surface snapping for decoration; free mode modifier.
9. Variants and dye colouring.
10. Interior flood fill + sensor volumes + rain/warmth/audio integration.
11. Copy tool, catalogue UI, search, owned counts.
12. Save/load of all structures + a large-build performance pass.

## 11. Testing requirements

- Unit: snapping resolution order produces the expected transform for a fixture set of 40 aim scenarios.
- Unit: placement validity rules — a table-driven test of slope, support, overlap, bounds and no-build volumes.
- Property: place N random valid pieces, remove them all, assert the inventory returns exactly to its initial state (cozy contract C6). 10,000 iterations in CI.
- Integration: build a 60-piece cabin fixture from a script, save, reload, assert an identical entity set and identical interior cell set.
- Integration: foundation flatten → remove → terrain restored to generated heights.
- Integration: overlapping foundations, then removing one, leaves correct terrain.
- Performance: 3,000 placed pieces → ≤ 120 draw calls added, ≤ 0.4 ms/tick in `BuildingSystem`, interior flood fill ≤ 2 ms on change.
- Multiplayer (Phase 7): two clients placing at the same socket in the same tick — one wins, the other is refunded, no orphan entity.

## 12. Future expansion

- Blueprint save/load of a structure region (with a material cost to instantiate).
- Roof auto-completion (pick a footprint, generate a roof).
- Paint mode: recolour placed pieces without removing them (should probably be in 1.0 if time allows — it is cheap and very satisfying).
- Terrain paths that persist as a splat channel rather than geometry.
- Piece scaling for decorations (risky: it makes screenshots great and collision awkward).
