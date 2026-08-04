# 15 — Inventory System

Purpose: item representation, containers, stacking rules, transfer operations, and the hotbar. Deliberately simple: a grid of stacks with no weight, no durability, and no encumbrance.

---

## 1. Model

```ts
type SlotIndex = number;

interface ItemStack { item: ItemId; count: number; meta?: ItemMeta; }
interface ItemMeta  { colour?: number; name?: string; caughtSize?: number; }  // rare, small

// Component on any entity that holds items (player, chest, station queue)
interface Container {
  slots: (ItemStack | null)[];
  capacity: number;
  filter: ContainerFilter | null;   // e.g. seed box accepts only 'seed' tag
  owner: EntityId | null;
}
```

Rules:
- `ItemStack.count` is always ≥ 1; empty slots are `null`, never `{count: 0}`.
- `meta` is undefined for the overwhelming majority of stacks. Stacks with different `meta` do not merge.
- Containers are entities, so chests, the player, and station input/output queues all share one implementation and one UI.

## 2. Item definitions

```ts
interface ItemDef {
  readonly id: ItemId;
  readonly name: string;
  readonly description: string;      // journal flavour, one or two sentences
  readonly icon: string;
  readonly stackSize: number;        // 99 common, 20 rare, 1 unique/tool
  readonly tags: readonly ItemTag[]; // 'material'|'tool'|'food'|'seed'|'fish'|'artifact'|'decor'|'buildable'
  readonly tool?: { readonly tag: ToolTag; readonly tier: 0|1|2; readonly speed: number };
  readonly food?: { readonly energy: number; readonly buff?: BuffId; readonly buffTicks?: number };
  readonly placeable?: { readonly piece: PieceId };
  readonly sellValue?: number;        // reserved; no shops at 1.0
}
```

~110 items at 1.0 (60 craftable + materials + fish + food + artifacts). Table in `shared/content/items.ts`.

## 3. Capacity

| Container | Slots | Notes |
|---|---|---|
| Player backpack | 24 → 32 → 40 | upgraded by crafting Satchel I/II |
| Hotbar | 8 | a *view* onto backpack slots 0–7, not separate storage |
| Small chest | 24 | |
| Large chest | 48 | |
| Seed box | 16 | filtered to `seed` |
| Fish crate | 24 | filtered to `fish` |
| Station input | 6 | |
| Station output | 6 | auto-pushes to the player when in range |

No weight system. No "over-encumbered". The only pressure is slot count, which is a gentle nudge toward building storage — which is a nudge toward building, which is the point.

## 4. Operations (all in `sim/systems/InventorySystem.ts`)

```ts
addItem(c: Container, stack: ItemStack): { added: number; overflow: ItemStack | null };
removeItem(c: Container, item: ItemId, count: number): boolean;   // all-or-nothing
countItem(c: Container, item: ItemId): number;
moveStack(from: SlotRef, to: SlotRef, count: number): Result<void, MoveError>;
splitStack(ref: SlotRef, count: number): Result<SlotIndex, MoveError>;
sortContainer(c: Container): void;
quickTransfer(from: Container, to: Container, ref: SlotRef): Result<void, MoveError>;
depositAllMatching(from: Container, to: Container): number;   // "stash" button
```

`addItem` order: fill existing partial stacks of the same item (lowest index first), then the first empty slot. This is what makes gathering feel tidy without the player thinking about it.

Transactions: `moveStack` and crafting operate through a **staged transaction** helper that validates the whole operation before mutating, so a failure never leaves items duplicated or destroyed. This is the single highest-risk area for item duplication bugs, especially in multiplayer — see §8.

## 5. Hotbar

- Slots 0–7 of the backpack. Number keys select; scroll cycles; the selected item is held in the player's hand (a socketed attachment on the character rig).
- Selecting a tool sets the active tool for gathering. Selecting a placeable enters build ghost mode for that piece. Selecting food shows an "eat" prompt.
- The hotbar is always visible but fades to 40% opacity after 4 s of no change.

## 6. World items (drops)

- Dropped items are entities with `ItemStack` + `Transform` + a small dynamic body.
- Pickup: automatic within 1.6 m if there is space, with a magnet arc over 0.25 s. Manual prompt if the inventory is full.
- Lifetime: **items never despawn.** A cozy game does not delete your things. To prevent unbounded accumulation, items that have been on the ground for >2 in-game days are merged into nearby stacks of the same item and converted to a static "pile" entity with no physics body (cap: 200 world items; beyond that the oldest are merged into the nearest chest if one is within 20 m, otherwise merged into a single pile).

## 7. UI behaviour (see `24_UI_UX_SYSTEM.md` for visuals)

- Drag and drop, with click-to-pick / click-to-place as an accessibility-friendly alternative.
- Shift-click quick-transfers between the open container and the backpack.
- Right-click splits half; right-click-drag distributes one per slot.
- Sort button: by tag, then by ID, then merges partials.
- Tooltips show name, description, count, tool stats, food effects, and "used in N recipes" with a link to the crafting screen.
- Search field filters slots by name/tag when a container is open (matters once the player has six chests).

## 8. Multiplayer considerations (design now, implement Phase 7)

- Containers are entities with an `Owner`; the server is authoritative for all container mutations.
- The client predicts inventory changes optimistically and reconciles from the server snapshot; a mismatch triggers a full container resync, not a partial patch.
- **Concurrency:** two players opening the same chest is the classic duplication vector. The rule: every container mutation is a server-side transaction against a per-container sequence number. Client requests carry the sequence number they observed; mismatches are rejected and trigger a resync. No locking, no "chest in use" — that is not cozy.
- Per-player inventories are never shared. Visitors keep what they gather.

## 9. Implementation steps

1. `ItemDef` table + validation; `Container` component.
2. Core operations with the transaction helper + exhaustive unit tests.
3. Player container, hotbar mapping, selection, held-item attachment.
4. Gathering → `addItem` integration + overflow drops.
5. Inventory UI: grid, drag/drop, tooltips, stack splitting.
6. Chests: placement (Phase 4 dependency), open/close, dual-panel UI, shift-transfer, stash button.
7. Filters (seed box, fish crate), sort, search.
8. World item entities, magnet pickup, merge/pile policy.
9. Satchel upgrades expanding capacity (must handle shrinking gracefully — it never shrinks, but the code should not assume).
10. Save/load of all containers.

## 10. Testing requirements

- **Property test (critical):** for 100,000 random operation sequences (add/remove/move/split/craft), total item counts are conserved except where a recipe explicitly consumes or produces. This is the anti-duplication test and it must run in CI on every commit.
- Unit: `addItem` fills partial stacks before empty slots; respects `stackSize`; returns correct overflow.
- Unit: `moveStack` between filtered containers rejects invalid items without mutating.
- Unit: splitting an odd stack rounds correctly and conserves count.
- Integration: gather with a full inventory → overflow drops → pick them up → counts match.
- Integration: save/load round-trip of 8 containers with 300 stacks preserves everything including `meta`.
- UI: Playwright test for drag/drop, shift-click and keyboard-only operation.

## 11. Future expansion

- Chest linking / remote crafting access from a "storage network" upgrade (very popular in this genre; needs a range and a visual cable/beacon to stay legible).
- Item favouriting to exclude from "stash all".
- A wardrobe container for outfits.
- Fish measurements and a trophy display case (ties fishing to building).
