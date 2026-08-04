# 16 — Crafting System

Purpose: recipes, stations, unlocking, queues, and the crafting UI's relationship to progression. Crafting is how gathering becomes capability, so its legibility matters more than its depth.

---

## 1. Model

```ts
interface RecipeDef {
  readonly id: RecipeId;
  readonly output: { readonly item: ItemId; readonly count: number };
  readonly inputs: readonly { readonly item: ItemId; readonly count: number }[];  // max 4
  readonly station: StationTag | null;        // null = craft anywhere ("hand")
  readonly craftTicks: number;                // 0 for instant hand recipes
  readonly unlock: UnlockRule;
  readonly category: 'tools'|'materials'|'building'|'furniture'|'food'|'equipment';
  readonly journalNote?: string;
}

type UnlockRule =
  | { kind: 'start' }
  | { kind: 'obtainItem'; item: ItemId }             // gathering teaches
  | { kind: 'craftRecipe'; recipe: RecipeId }        // recipe chains
  | { kind: 'buildStation'; station: StationTag }
  | { kind: 'fragment'; fragment: FragmentId }       // story unlocks
  | { kind: 'discoverPlace'; region: RegionId }
  | { kind: 'catchFish'; fish: ItemId };
```

Constraints that keep it legible:
- **Max 4 input types** per recipe. If a recipe needs more, split it into an intermediate item (which is better design anyway — intermediates create satisfying sub-goals).
- **Max 2 levels of intermediates** between a raw resource and a finished item.
- No recipe requires an item from a region the recipe's unlock does not imply access to. Validated at startup.

## 2. Stations

| Station | Tag | Unlocks category | Placed in Phase |
|---|---|---|---|
| Hand (implicit) | `hand` | basic tools, basic materials | 3 |
| Workbench | `workbench` | tools, building pieces, furniture | 3 |
| Forge | `forge` | metal bars, iron tools, lanterns | 4 |
| Kitchen | `kitchen` | all cooked food | 5 |
| Loom | `loom` | cloth, rope, sails, dyes, decor fabric | 4 |
| Potting bench | `potting` | seeds, fertiliser, planters | 5 |

Stations are placeable structures (see `17_BUILDING_SYSTEM.md`) with `Container` input/output slots. A station in range (6 m) makes its recipes available in the crafting screen; the player does not need to interact with the station directly.

## 3. Crafting flow

```
open crafting UI (Tab → Craft, or approach a station)
      │
      ├─ list shows: unlocked recipes, grouped by category
      │   • craftable now (bright)
      │   • missing materials (dimmed, shows what's missing and where to find it)
      │   • locked (hidden entirely — never tease unattainable things)
      ▼
select recipe → choose count (1 / 5 / max) → confirm
      ▼
intent {craft, recipe, station, count}
      ▼
CraftingSystem validates: unlocked? station in range? inputs present? output space?
      ▼
consume inputs immediately (staged transaction)
      ▼
craftTicks == 0  ─► produce output instantly, emit craft:completed
craftTicks  > 0  ─► push to the station's queue
                     • queue progresses every tick, independent of player position
                     • output lands in the station's output slots
                     • auto-pushed to the player if within 6 m and space exists
                     • a subtle chime and a HUD toast when done
```

Cancelling a queued craft refunds 100% of inputs. Queue depth per station: 8 entries.

**Instant vs queued:** hand recipes and small items are instant (0 ticks) because waiting for a wooden plank is not interesting. Queued crafts are reserved for things that *should* feel like a small commitment: metal bars (20 s), rope (10 s), cooked dishes (15–40 s), dyes (25 s).

## 4. Unlocking and discovery

The unlock system is the game's quest system in disguise.

- On any `item:obtained`, `structure:placed`, `fragment:found`, `region:discovered`, `fish:caught` event, `CraftingSystem` re-evaluates pending unlocks (a reverse index keyed by trigger, so this is O(matching rules), not O(recipes)).
- A newly unlocked recipe produces: a soft chime, a "New recipe: Stone Axe" toast, a badge on the crafting button, and a journal entry.
- **Gathering teaches crafting.** Picking up your first Fibre unlocks Rope. Picking up your first Clay unlocks the Kiln. This makes exploration directly productive without any quest text.
- Recipes learned from fragments feel like a discovery: the fragment text hints at the item, and the recipe appears with a distinct "recovered technique" styling.

## 5. Recipe catalogue shape (~85 recipes)

| Category | Count | Examples |
|---|---|---|
| Materials | 18 | plank, rope, cloth, brick, iron bar, glass, dye, fertiliser, charcoal |
| Tools | 12 | stone/iron axe, pick, hoe, watering can, fishing rod ×3, shovel, lantern, climbing rope |
| Equipment | 6 | satchel I/II, warm coat, swim fins, raft, sail, glider (post-1.0) |
| Building | 24 | foundation, wall variants, roof, door, window, stairs, fence, path, dock |
| Furniture | 18 | bed, chair, table, chest, rug, lamp, planter, shelf, painting, bookcase |
| Food | 30 (in `18`) | soups, baked goods, teas, fruit dishes |

The building/furniture recipes produce *placeable items*, which are then placed via the building system. Keeping placement separate from crafting means the build UI can present a catalogue without duplicating the recipe list.

## 6. Cost tuning principles

- A player should be able to craft their first tool within **6 minutes** of starting.
- Costs scale roughly with gather time: a recipe should cost no more than ~90 seconds of directed gathering at the tier where it unlocks.
- Never require a rare material for a *functional* item. Rare materials gate *beautiful* items and *convenience* items. This preserves the "no grinding" value: you can always play; you gather rare things because you want the pretty lamp.
- Balance is data, so tuning is a content PR, not a code PR. Keep a spreadsheet export at `docs/data/recipe-balance.csv` and regenerate it with `pnpm tools:balance` (which reads the content tables and reports gather-time estimates per recipe).

## 7. UI

- Left: category tabs and a search box. Middle: recipe list with icons, name, and a compact input preview. Right: detail panel with a large preview, full inputs (green/red with owned/needed counts), station requirement, craft count selector, and the journal description.
- The detail panel's missing-material lines are clickable: clicking "Clay 4/10" opens the journal entry for Clay, which says where it is found. This closes the loop between crafting and exploration.
- A "craftable only" toggle, remembered.
- Keyboard navigable; gamepad navigable with bumpers for categories.

## 8. Implementation steps

1. `RecipeDef` table + startup validation (input/output existence, unlock reachability, no cycles).
2. Unlock reverse index + evaluation on events; persistence of unlocked set.
3. `CraftingSystem` validation + staged transaction consumption.
4. Instant crafting path end-to-end with a placeholder UI.
5. Crafting screen UI (list, detail, counts, search, filters).
6. Station proximity detection + available-station set in the view model.
7. Queues with tick progression, cancellation refunds, output slots, auto-push.
8. Toasts, chimes, badges, journal integration for new recipes.
9. Balance pass tooling (`pnpm tools:balance`) and the CSV export.
10. Placeable items handing off to the building system.

## 9. Testing requirements

- Unit: every recipe's inputs and outputs reference existing items; no recipe is unreachable (a graph walk from `start` unlocks must reach 100% of recipes).
- Unit: no circular unlock dependencies; no recipe requires its own output.
- Unit: crafting conserves items — inputs consumed exactly once, output produced exactly once, failure paths mutate nothing (part of the inventory property test).
- Integration: craft with insufficient materials → refused, nothing consumed.
- Integration: craft queued → walk 100 m away → queue completes → return → collect. Also: quit and reload mid-queue → queue resumes correctly.
- Integration: cancel a queued craft → exactly the original inputs are refunded.
- Integration: the full unlock chain from a fresh save to every recipe, simulated headlessly (this doubles as a progression regression test — it will catch "you can no longer reach the forge" bugs).
- Balance: automated report, not a pass/fail — flags any recipe whose estimated gather cost exceeds 3× its tier median.

## 10. Future expansion

- Recipe variants (craft a chair in 6 wood types) — currently handled by the dye/colour system instead, which is cheaper.
- Bulk crafting from nearby chests without moving items into the inventory (very quality-of-life; needs a clear range indicator).
- A "blueprint" item that saves a multi-piece structure as a single craftable — powerful, but risks trivialising building; defer.
- Experimentation: combining unknown items to discover recipes. Charming, but it conflicts with legibility. Rejected for 1.0.
