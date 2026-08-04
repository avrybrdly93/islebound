# 01 — Game Design Document

Companion to `00_PROJECT_VISION.md`. This document describes *what the game is*, mechanically and structurally. It does not describe implementation — see the numbered system documents for that.

---

## 1. Elevator pitch

You wash up on Halcyon Isle, an island someone lived on a long time ago and left. There is nothing to fight. You gather what the island gives you, build a home, plant a garden, fish the reef, and slowly piece together who was here before you. Play alone or with friends.

## 2. The island

One island, authored once, generated deterministically from a fixed seed so every player's island is the same island. (Seed is configurable for testing; the shipped seed is pinned. See `12_WORLD_GENERATION.md`.)

### Regions

| # | Region | Character | Gates | Signature resources |
|---|--------|-----------|-------|---------------------|
| 1 | **Driftwood Shore** | Starting beach, gentle, open, safe | none | Wood, Stone, Fibre, Shells, Berries |
| 2 | **Palmhollow** | Warm inland forest, first building site | none | Palm Wood, Clay, Herbs, Coconut |
| 3 | **The Terraces** | Old farmed hillside, ruined stone walls | needs Axe (clear vines) | Soil, Ancient Seeds, Cut Stone |
| 4 | **Mistpine Ridge** | Cool high forest, fog, waterfall | needs Climbing Rope | Pine, Resin, Mushroom, Feather |
| 5 | **The Sunken Steps** | Cave system entered behind the waterfall | needs Lantern | Crystal, Ore, Cave Moss, Artifacts |
| 6 | **The Reef** | Shallow water ring, coral, wreck | needs Raft or Swimming Gear | Rare fish, Coral, Salvage |
| 7 | **Kestrel Point** | Windy cliff headland, lighthouse ruin | needs Repaired Stair | Rare birds, Wind-flowers, the Beacon |

Regions are gated by **capability, not by level**. Every gate is a craftable item, and every gate is visible from outside so the player can see what they cannot yet reach. There are no invisible walls inside the island; the sea is the boundary.

### Island history (the slow story)

There is no dialogue and no NPCs. The history is told through 24 **Journal Fragments** found in ruins, caves, bottles and under floorboards. They describe a small family who farmed the Terraces, kept the lighthouse at Kestrel Point, and eventually left when the harbour silted up. Finding all 24 unlocks the ability to relight the Beacon, which is the game's closing gesture — it changes the night skybox permanently and is purely cosmetic.

Tone rule: the history is wistful, not tragic. Nobody died. They just left.

## 3. The player

- No name, no face customisation at 1.0 beyond outfit colour. (Character customisation is Phase 6+.)
- No health bar. No hunger bar. No combat stats.
- Two soft meters only:
  - **Energy** — drains slowly while performing effortful actions (chopping, mining, running). At zero the player moves slower and cannot chop/mine. Restored by eating, sitting, or sleeping. Never causes death or item loss.
  - **Warmth** — only in the Mistpine Ridge and Sunken Steps at night. Low warmth causes a screen vignette and reduced energy regeneration. Restored by fire, warm food, or leaving. Never causes death.
- Death does not exist. Falling into deep water or off a cliff triggers a **fade to black and wake up at your last bed/campfire**, losing nothing.

## 4. Systems overview

Each has its own document; this is the design-level summary and how they interlock.

### 4.1 Gathering (`14_RESOURCE_SYSTEM.md`)
Resource nodes are placed deterministically and regrow on a timer. Interaction is hold-to-gather with a satisfying progress arc, particles, sound, and a small pop of the harvested item. Tools multiply yield and unlock node tiers (bare hands → Stone Axe → Iron Axe). No tool breaks.

### 4.2 Inventory (`15_INVENTORY_SYSTEM.md`)
Grid inventory, 24 slots at start, expandable to 40 via Satchel upgrades. Stacks of 99 for common, 20 for rare, 1 for tools/artifacts. Storage chests are shared containers with the same grid model. No weight system.

### 4.3 Crafting (`16_CRAFTING_SYSTEM.md`)
Recipes are data. Three tiers of station: **hand** (anywhere), **workbench**, **forge/kitchen/loom** (specialised). Recipes are learned by: finding a Fragment, gathering a new material for the first time, or reaching a station tier. Crafting is instant for small items, and a short timed queue for stations (max 60 s, continues while the player walks away).

### 4.4 Building (`17_BUILDING_SYSTEM.md`)
Grid-snapped modular building on a 1 m grid with 0.25 m free-placement for decoration. Pieces: foundations, walls, doors, windows, roofs, stairs, fences, paths, and ~25 decoration items. Building is free-form on any terrain flat enough. Pieces can be recoloured with dyes. Deleting returns 100% of materials. There is no structural integrity simulation — if it snaps, it stands.

### 4.5 Farming (`18_FARMING_SYSTEM.md`)
Till → plant → water → wait → harvest. Crops grow on in-game-day ticks (3–8 days). Rain waters automatically. Crops never die from neglect; unwatered crops simply pause. Sprinklers automate watering from Stage 3. ~14 crops, each with a cooking use.

### 4.6 Cooking (`18_FARMING_SYSTEM.md` §7)
Kitchen station. ~30 recipes. Meals restore Energy, grant timed minor buffs (faster gathering, warmth, swim speed, fish bite rate). Buffs are always positive; there are no debuffs.

### 4.7 Fishing (`19_FISHING_SYSTEM.md`)
Cast → wait → a bite → a short, gentle skill moment (hold within a band for ~4 s) → catch. 20 fish across 5 water bodies, varying by time of day, weather and season-equivalent. Failure costs nothing but time. Rare fish have visible tells (surface ripples, bird flocks).

### 4.8 Journal (`24_UI_UX_SYSTEM.md` §7)
Auto-populating compendium: Flora, Fauna, Fish, Places, Recipes, Fragments. Each entry has art, a short in-world description and the location found. The journal is the game's progress bar and the primary motivator. Completion percentages per category; no rewards for completion except three cosmetic items and the Beacon.

### 4.9 Day/night and weather (`20_`, `21_`)
1 in-game day = 24 real minutes by default (configurable). Sunrise 06:00, sunset 20:00. Weather states: Clear, Cloudy, Rain, Storm, Fog, and rare Aurora night. Weather affects fishing, farming (auto-watering), ambient audio, and light. Storms are visually dramatic and mechanically harmless.

### 4.10 Wildlife (`27_ANIMATION_SYSTEM.md` §6, `14_`)
12 species. Behaviour is a small state machine: wander, idle, feed, flee, sleep. Animals react to player proximity with a species-specific flee radius. Some can be befriended by leaving food out repeatedly; befriended animals follow the player loosely and can be named. No animal can be killed.

## 5. Progression

Progression is **capability and knowledge**, never numbers.

| Stage | Roughly | Player has | Unlocks |
|-------|---------|------------|---------|
| 0 | 0–20 min | Hands, a bedroll, a campfire | Basic gathering, first night |
| 1 | 20 min–2 h | Stone tools, tent, first chest | Palmhollow, first recipes |
| 2 | 2–6 h | Workbench, wooden cabin, garden plot | Terraces, farming, cooking |
| 3 | 6–14 h | Forge, lantern, rope, better tools | Ridge, Caves, ore, crystal |
| 4 | 14–25 h | Raft, dock, kitchen, loom, sprinklers | Reef, rare fish, decoration breadth |
| 5 | 25 h+ | Everything; the Beacon | Endless expression |

There is no level. There is no XP. The only number that goes up is journal completion.

## 6. Session shapes

Design for these three explicitly:

- **The 10-minute check-in.** Water crops, collect from chests, catch one fish. Must feel complete.
- **The 45-minute build.** Gather a specific material set, extend the house, decorate. Must not require travel across the whole island.
- **The 2-hour expedition.** Cave dive or reef trip. Needs preparation, returns with rare mats and 2–3 journal entries.

## 7. Difficulty

There is no difficulty setting because there is no difficulty. There are **comfort settings**: day length, whether Energy drains at all, whether Warmth exists, motion/camera-shake reduction, and a "Photo Mode" that pauses simulation.

## 8. Content ceilings (do not exceed without vision amendment)

- 25 plants, 12 animals, 20 fish, 24 fragments, 7 regions
- ~60 craftable items, ~40 building pieces, ~30 cooked dishes
- ~35 minutes of ambient music, ~120 sound effects

## 9. Named open design questions

Tracked here rather than decided prematurely. Resolve during the phase that needs them, and record in `40_DECISION_LOG.md`.

- **Seasons?** Currently no. A four-season cycle would multiply art cost by ~2.5×. Leaning: a single perpetual late-summer, with weather providing variety.
- **Swimming vs raft?** Currently both — shallow swimming from the start, raft required for the outer reef.
- **Sleep skipping to morning?** Yes, but only from a bed and only if all present players agree (multiplayer).
- **Should visitors keep items taken from the host's island?** Leaning yes, because trust is the cozy default and inventories are per-player.
