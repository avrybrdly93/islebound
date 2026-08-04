# 14 — Resource System

Purpose: resource nodes, gathering, yields, regrowth, tool gating, and wildlife-as-content. This is the system the player touches most often, so its feel matters more than its complexity.

---

## 1. Model

```ts
// Component
interface ResourceNode {
  defId: NodeId;             // 'node.oak_tree'
  remaining: number;         // harvests left before depletion
  regrowAtTick: number;      // 0 = not regrowing
  variant: number;           // visual variation index
  progressTicks: number;     // partial gather progress (decays)
}

// Content definition
interface NodeDef {
  readonly id: NodeId;
  readonly name: string;
  readonly kind: 'tree' | 'rock' | 'bush' | 'plant' | 'shell' | 'vein' | 'wreck';
  readonly model: string;
  readonly harvests: number;              // e.g. tree = 3 chops
  readonly gatherTicks: number;           // base duration at 30 Hz
  readonly requiredTool: ToolTag | null;  // null = hands
  readonly minToolTier: 0 | 1 | 2;
  readonly yields: readonly YieldEntry[];
  readonly bonusYields: readonly YieldEntry[];   // rolled once on final harvest
  readonly regrowTicks: number | null;    // null = permanent depletion (rare)
  readonly depleteBehaviour: 'stump' | 'remove' | 'shrink';
  readonly journalEntry: string | null;
  readonly sfx: { hit: string; complete: string };
  readonly vfx: { hit: string; complete: string };
}

interface YieldEntry { item: ItemId; min: number; max: number; chance: number; }
```

## 2. Node catalogue (initial ~26)

| Region | Nodes |
|---|---|
| Driftwood Shore | driftwood, beach_stone, shell_cluster, kelp_pile, berry_bush_coastal, message_bottle |
| Palmhollow | palm_tree, oak_tree, clay_deposit, herb_patch, coconut_pile, fibre_plant |
| The Terraces | old_stone_wall, ancient_seed_pod, wild_wheat, terrace_soil |
| Mistpine Ridge | pine_tree, resin_seep, mushroom_ring, feather_nest, wind_flower |
| Sunken Steps | crystal_cluster, iron_vein, copper_vein, cave_moss, stalagmite |
| The Reef | coral_branch, pearl_oyster, wreck_salvage, sea_sponge |
| Kestrel Point | gull_feather, sea_thrift, weathered_timber |

Ceiling is 30 nodes. Adding a node = one entry in `content/nodes.ts` + a model + a scatter rule. **No code change.**

## 3. Gathering flow

```
player targets node ──► InteractionSystem validates:
                          • within 3.5 m
                          • facing within 70°
                          • has required tool tier
                          • node.remaining > 0
                          • inventory has space (or partial-fill allowed)
                        ▼
              intent {gatherStart, target}
                        ▼
   each tick: progressTicks += toolSpeedMultiplier
              emit resource:gatherTick (drives VFX/SFX/camera)
                        ▼
   progressTicks >= def.gatherTicks:
              roll yields (seeded: rngFor('harvest', entityId, tick))
              add to inventory  →  item:added events
              remaining -= 1
              progressTicks = 0
              emit resource:harvested
                        ▼
   remaining == 0:
              apply depleteBehaviour
              roll bonusYields
              schedule regrowAtTick = tick + regrowTicks (± 15% jitter)
              emit resource:depleted
```

Cancellation: releasing the key emits `gatherCancel`. `progressTicks` decays at 2× rate but is **not** zeroed for 90 ticks (3 s), so a mis-release costs nothing.

Inventory full: gathering still works and the overflow drops as a world item at the player's feet with a gentle notification. **Never block the player from harvesting.**

## 4. Tool gating

| Tier | Tool | Unlocks |
|---|---|---|
| — | hands | bushes, shells, plants, driftwood, clay, kelp |
| 1 | stone axe / stone pick | oak, palm, beach stone, stalagmite |
| 2 | iron axe / iron pick | pine, iron/copper veins, crystal, old stone wall |

Tool speed multipliers: correct tool tier = 1.0, one tier above = 1.5, hands on a hands-node = 1.0. Wrong or missing tool = the prompt shows what is needed and the action is unavailable (not slow). Explicit rejection: no "chop a tree with your fists for 40 seconds".

**Tools never break.** No durability. Recorded in `40_DECISION_LOG.md`.

## 5. Regrowth

- Regrowth is a tick comparison, evaluated in `ResourceSystem` over a **bucketed queue** (nodes sorted into 512 buckets by `regrowAtTick % 512`), so we never scan 2,800 nodes per tick. Cost: O(nodes regrowing this tick).
- Typical times (1 in-game day = 24 real min = 43,200 ticks):
  - bushes/plants: 2 days
  - trees: 4 days
  - clay/stone: 3 days
  - ore/crystal: 6 days
  - rare (pearl, ancient seed): 10 days
- Regrowth continues while the game is closed: on load, `elapsedTicks` is added and all due nodes regrow at once (capped at one full cycle so a year away doesn't overflow anything).
- Trees regrow through visible stages (stump → sapling → young → full) driven by fraction of regrow time. This is one of the nicest "the island is alive" signals; implement it early.

## 6. Feedback (the part that matters)

Per gather tick:
- Small camera punch (0.6° over 90 ms, eased), scaled by tool tier.
- 3–6 particles matching the material (wood chips, stone dust, leaves, sparkle).
- Layered SFX: a material-specific impact with ±8% pitch variation, never the same sample twice in a row.
- Node mesh squash-stretch: 4% over 120 ms.

On completion:
- Bigger punch, a burst of particles, a distinct completion sound.
- Item pop: a 3D icon arcs from the node to the player and shrinks into the HUD; the hotbar slot flashes.
- First-time-ever acquisition: the item arcs to the *journal* icon instead, which pulses, and a one-line toast names the item.

On depletion:
- Trees: a fall animation with directional bias away from the player, dust burst, a distinctive settle sound, then the stump remains.
- Rocks: crumble and shrink.
- Bushes: shed leaves, become a bare variant.

## 7. Wildlife (content-side)

Wildlife is not harvestable, but it belongs here because it is discoverable content driven by the same region tables.

```ts
interface AnimalDef {
  readonly id: AnimalId;
  readonly regions: readonly RegionId[];
  readonly activeHours: [number, number];   // e.g. [5, 11] dawn-active
  readonly weather: readonly Weather[] | null;
  readonly maxAlive: number;
  readonly fleeRadius: number;              // m
  readonly moveSpeed: number;
  readonly behaviours: readonly ('wander'|'graze'|'perch'|'flock'|'swim'|'sleep')[];
  readonly befriendable: boolean;
  readonly favouriteFood: ItemId | null;
  readonly journalEntry: string;
}
```

Species (12): gull, kestrel, songbird, butterfly, dragonfly, crab, turtle, deer, fox, rabbit, hedgehog, glowmoth (cave).

Spawn director: maintains per-region population targets based on time of day and weather, spawning outside the player's view at 30–70 m and despawning beyond 120 m. Hard cap **40 animals alive**. Despawn never happens in view.

Befriending: leave `favouriteFood` on the ground within the animal's region on 5 separate in-game days. On the fifth, the animal approaches, a journal entry unlocks, and the player may name it. Befriended animals persist in the save, follow loosely within their region, and can be petted (an animation and a warm sound; no mechanical benefit — deliberately).

## 8. Implementation steps

1. `NodeDef` content table + validation at startup.
2. Node entity spawning from worldgen placement lists.
3. `InteractionSystem` targeting + prompt view model.
4. `ResourceSystem` gather progress, yields, inventory hand-off.
5. Depletion behaviours + stump/shrink variants.
6. Regrowth bucketed queue + offline catch-up.
7. Tool gating + speed multipliers.
8. Feedback layer (VFX/SFX/camera) — treat as a first-class task, not polish.
9. Tree regrowth stages.
10. Overflow drops + world item pickup.
11. Wildlife defs, spawn director, behaviour state machines.
12. Befriending.

## 9. Testing requirements

- Unit: yield rolls are deterministic for a given `(entityId, tick, seed)`; distribution over 100k rolls matches the declared chances within 1%.
- Unit: regrowth bucket queue processes every node exactly once at the correct tick, across 500k simulated ticks.
- Integration: harvest every node type with every tool tier; assert gating and yields against a table fixture.
- Integration: offline catch-up — save, advance the clock 30 days, load, assert all regrowable nodes are full and none exceeded their max.
- Integration: inventory-full harvesting drops overflow and never silently deletes items (this is a C1 cozy-contract test).
- Integration: 40-animal spawn director maintains population targets over 10 in-game days with no leaks and no in-view despawns.
- Performance: `ResourceSystem` ≤ 0.25 ms/tick with 2,800 nodes.

## 10. Future expansion

- Seasonal yield modifiers (if seasons ship).
- Rare "glimmer" nodes that appear after storms and last one day — a strong candidate; it makes weather meaningful.
- Fossils/dig spots requiring a shovel.
- Beehives producing passively once placed near flowers (bridges resource and building systems).
