# 18 — Farming & Cooking System

Purpose: crop cultivation, growth, watering, harvesting, and the cooking that consumes the output. Farming provides the game's daily rhythm; cooking gives that rhythm a payoff.

---

## 1. Design stance

- **Crops never die.** Neglected crops pause; they do not wither. This is a direct consequence of cozy contract C2.
- Farming is opt-in. A player who never plants anything can still complete the journal, minus the crop entries.
- The reward for farming is cooking, decoration (flowers), and rare seeds — not raw resource throughput.
- Automation (sprinklers) arrives early enough that farming never becomes a chore, at roughly hour 12.

## 2. Model

```ts
// Tile-based, on the 1 m terrain grid
interface FarmTile {          // stored in a sparse Map<tileKey, FarmTile>
  x: number; z: number;
  state: 'tilled' | 'planted' | 'grown';
  crop: CropId | null;
  stage: number;              // 0..def.stages-1
  ticksInStage: number;
  watered: boolean;
  wateredTicksLeft: number;
  plantedAtTick: number;
  regrowsLeft: number;        // for multi-harvest crops
}

interface CropDef {
  readonly id: CropId;
  readonly seed: ItemId;
  readonly produce: ItemId;
  readonly stages: number;                 // 3–5 visual stages
  readonly ticksPerStage: number;          // in-game-day multiples
  readonly needsWaterPerStage: boolean;
  readonly regrows: number;                // 0 = single harvest
  readonly yieldRange: [number, number];
  readonly regions: readonly RegionId[];   // where its seed is found
  readonly season: null;                   // reserved; no seasons at 1.0
  readonly model: string;                  // one model with N stage meshes
}
```

Tiles are stored sparsely (a `Map` keyed by `x * 1024 + z`) because a heavily farmed island has at most ~600 tilled tiles.

## 3. Crop catalogue (14)

| Crop | Days | Regrows | Used in |
|---|---|---|---|
| Sun Tomato | 4 | 3× | soups, sauces |
| Sea Carrot | 3 | 0 | stews, rabbit befriending |
| Cloudberry | 5 | 4× | jams, pies, tea |
| Wheatgrass | 4 | 0 | flour → bread |
| Blue Potato | 5 | 0 | roasts, chowder |
| Reed Pepper | 6 | 2× | spiced dishes |
| Terrace Bean | 4 | 3× | stews |
| Moon Melon | 8 | 0 | rare dessert, journal |
| Herb: Mint | 3 | 5× | teas |
| Herb: Thyme | 3 | 5× | cooking buffs |
| Flower: Marigold | 3 | 0 | yellow dye, decor |
| Flower: Cornflower | 3 | 0 | blue dye, decor |
| Flower: Kestrel Lily | 7 | 0 | rare decor, journal |
| Ancient Grain | 10 | 0 | fragment-unlocked, best dish |

Seeds come from: gathering wild plants, the potting bench (2 produce → 1 seed), and ruins.

## 4. Growth mechanics

Growth is evaluated once per **in-game hour** (1,800 ticks), not per tick — a bucketed pass over planted tiles.

```
for each planted tile:
   if (!def.needsWaterPerStage || tile.watered) tile.ticksInStage += HOUR
   if (tile.ticksInStage >= def.ticksPerStage) { stage++; ticksInStage = 0; watered = false }
   if (stage == def.stages - 1) state = 'grown'
```

- **Watering** lasts one in-game day. Rain waters every outdoor tile instantly and fully.
- **Sprinklers** (Stage-3 craftable) water a 3×3 or 5×5 area every morning at 06:00. Placement shows a range overlay.
- Harvesting a `grown` tile yields `yieldRange` produce (seeded roll), and either resets to stage 0 with `regrowsLeft--` (if it regrows) or returns the tile to `tilled`.
- Quality: **no quality tiers.** Rejected — it adds numbers without adding feeling, and it pressures the player to min-max. Recorded in `40_DECISION_LOG.md`.

## 5. Tools and interaction

| Tool | Action | Notes |
|---|---|---|
| Hoe | till a 1 m tile (or 3×1 with the Wide Hoe) | only on `dirt`/`grass` splat, slope < 15°, not under structures |
| Seed (from hotbar) | plant on a tilled tile | shows a ghost preview of the mature crop |
| Watering can | water a 1 m tile (3×3 with the Large Can) | 40 charges, refill at any water body |
| Hands | harvest a grown tile | |
| Shovel | untill a tile (refunds nothing, destroys any crop with a confirmation) | |

Tilling and planting support **drag-to-repeat**: hold and walk to till a row. This single feature removes most of farming's tedium; implement it with the first pass, not as polish.

## 6. Rendering

- Crops are instanced per (crop, stage). Up to 14 crops × 5 stages = 70 instanced meshes, but only stages currently present are allocated.
- Tilled soil is a decal-like quad slightly above the terrain with a darker albedo, plus a wet variant when watered. Grouped into one instanced mesh.
- Growth transitions use a 0.4 s scale pop, so returning after a night shows visible change.

## 7. Cooking

```ts
interface DishDef {
  readonly id: ItemId;
  readonly inputs: readonly ItemCount[];   // max 3
  readonly cookTicks: number;              // 15–40 s
  readonly energy: number;                 // 15–60
  readonly buff: BuffId | null;
  readonly buffTicks: number;
  readonly unlock: UnlockRule;
}
```

Cooking uses the crafting system's station queue (station tag `kitchen`), so there is no separate cooking code path — only content.

### Buffs (~8, all positive)

| Buff | Effect | Duration |
|---|---|---|
| Well-Fed | Energy regen ×1.5 | 8 min |
| Warm | Immune to cold zones | 6 min |
| Steady Hands | Gather speed ×1.25 | 5 min |
| Keen Eye | Rare-yield chance ×1.5 | 5 min |
| Swift | Move speed ×1.15 | 4 min |
| Angler's Luck | Bite rate ×1.4, rare fish chance ×1.3 | 6 min |
| Green Thumb | Crops advance one extra stage tonight | until dawn |
| Beachcomber | Shore nodes yield +1 | 10 min |

Only **one buff active at a time**; eating a new dish replaces the current one, with a confirmation if the current buff has >60 s left. Buffs never stack — this keeps the UI to a single icon and avoids optimisation pressure.

Dishes (~30) span: soups (3), stews (3), roasts (3), baked goods (6), teas (5), preserves (4), desserts (4), and 2 fragment-unlocked specials.

## 8. Implementation steps

1. `FarmTile` sparse store + `CropDef` content + validation.
2. Hoe tilling with splat/slope validation; tilled soil rendering.
3. Planting from the hotbar, ghost preview, stage-0 rendering.
4. Hourly growth pass, stage transitions, instanced stage swapping.
5. Watering can with charges, refill, watered visual state.
6. Harvesting, regrowth, yields.
7. Rain integration (weather system emits `weather:rainTick` → water all outdoor tiles).
8. Drag-to-repeat for till/plant/water.
9. Sprinklers with morning trigger and range overlay.
10. Potting bench seed production.
11. Cooking content + buff system + buff HUD indicator.
12. Save/load of tiles, growth state and active buffs.

## 9. Testing requirements

- Unit: growth advances only when watered (for water-dependent crops) and reaches maturity in exactly the specified number of in-game days.
- Unit: offline growth — save at planting, advance 10 in-game days, load, assert correct stage including the "unwatered pauses growth" rule (offline days count as unwatered unless it rained; rain history is simulated forward deterministically by the weather system).
- Unit: regrowing crops decrement `regrowsLeft` correctly and revert to `tilled` at zero.
- Integration: rain waters every outdoor tile and no indoor tile (uses interior detection from `17`).
- Integration: sprinkler coverage matches its declared range exactly, including at chunk boundaries.
- Integration: 600 tilled tiles → growth pass ≤ 0.5 ms per in-game hour, rendering ≤ 12 draw calls.
- Property: tilling and untilling repeatedly never leaks tiles or crops.

## 10. Future expansion

- Greenhouses (interior farming immune to weather) — a natural Stage-4 goal.
- Beehives near flowers producing honey passively.
- Crop cross-breeding for new varieties — charming but a large content and UI cost; defer past 1.0.
- Animal husbandry (chickens) — carefully: it edges toward chores and toward "animals as resources", which conflicts with the wildlife stance. If added, make it purely optional and affectionate.
