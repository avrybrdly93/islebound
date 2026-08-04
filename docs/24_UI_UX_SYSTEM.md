# 24 — UI / UX System

Purpose: the interface architecture, screen inventory, HUD rules, and the interaction conventions that keep a systems-heavy game feeling calm. The UI's job here is to disappear.

---

## 1. Architecture

- **React 18 DOM overlay** on top of the canvas. The canvas is never React-managed.
- One-way data flow: simulation events → view-model stores → React. React dispatches **intents**, never mutations.
- View models live in `ui/store/`. Each is a small subscribable object with a `useSyncExternalStore` hook. No Redux, no zustand — the stores are ~30 lines each and this keeps the dependency list clean.

```ts
// ui/store/inventoryStore.ts
const store = createStore<InventoryView>({ slots: [], capacity: 24 });
bus.on('inventory:changed', (e) => store.set(projectInventory(e)));
export const useInventory = () => useStore(store);
```

Rule: **React never runs per frame.** Stores update on events only. The HUD elements that genuinely need per-frame updates (the gather progress arc, the fishing bar, the compass) are drawn on a small dedicated 2D canvas layer, not in React.

## 2. Screen inventory

| Screen | Opened by | Pauses sim? |
|---|---|---|
| Title / Load | app start | n/a |
| HUD | always | no |
| Inventory | Tab / I | no (SP: optional pause setting; MP: never) |
| Crafting | Tab→Craft, or station | no |
| Building catalogue | B | no |
| Journal | J | no |
| Container view (chest) | interact | no |
| Settings | Esc→Settings | no |
| Pause menu | Esc | SP yes, MP no |
| Photo mode | P | yes (SP) |
| Map | M (Phase 6) | no |

**Nothing pauses by default in multiplayer.** In single player, the pause menu pauses; inventory and crafting do not (this keeps the world alive and avoids the "menu the game" habit).

## 3. HUD

Minimal by default. Elements, in order of how often they are visible:

| Element | Visibility rule |
|---|---|
| Interaction prompt | when a target is in range; fades in 80 ms |
| Gather progress arc | during a hold action, around the crosshair |
| Hotbar | always, fades to 40% after 4 s idle |
| Item toast (top-left stack) | 2.5 s per pickup, stacks and merges counts |
| Clock + day | top-right, small; a setting expands it |
| Energy | only below 50%, fades in |
| Warmth | only in cold zones below 60% |
| Buff icon | when a buff is active, with a depleting ring |
| Compass strip | optional setting, off by default |
| Crosshair | a 3 px dot, brightens on a valid target |

A **HUD opacity slider** and a "hide all HUD" toggle (`H`) exist for screenshots. Photo mode hides everything automatically.

## 4. Interaction conventions

- **Hold to commit, tap to inspect.** Holding gathers; tapping shows the journal entry if known.
- Every destructive action (removing a structure with contents, untilling a grown crop, deleting a save) requires a confirmation. Every other action does not.
- Drag and drop always has a click-to-pick/click-to-place equivalent.
- Escape closes the topmost layer, one at a time.
- Every screen is fully keyboard navigable and fully gamepad navigable. The tab order is authored, not incidental.
- Tooltips appear after 350 ms of hover, instantly if a tooltip is already showing.

## 5. Visual language

See `26_ART_DIRECTION.md` for the palette. UI-specific:

- **Type:** one humanist sans for UI (Nunito or similar — round, warm, highly legible), one hand-lettered display face for the journal and titles only. Two families, no more.
- Sizes: 13 / 15 / 18 / 24 / 32 px on a 1080p baseline, scaled by a UI scale setting (80–150%).
- **Panels:** warm off-white paper (`#F6EFE3`) with a soft drop shadow, 12 px radius, a 2 px hand-drawn-feeling border. The UI should look like a naturalist's field notebook, not a sci-fi HUD.
- Accents: leaf green for confirm, terracotta for destructive, sand for neutral, ink for text.
- Motion: 120–180 ms ease-out for appearance, 100 ms ease-in for dismissal. Nothing bounces except the item pop. Everything respects `prefers-reduced-motion`.
- Icons: hand-drawn, single-weight line with a flat fill, consistent 64×64 source, rendered from a sprite atlas.

## 6. Key screens in detail

### 6.1 Inventory
Two-column when a container is open (backpack left, container right), single centred grid otherwise. 6 columns. Slot: icon, count bottom-right, a tag stripe on the left edge for category. Sort and stash buttons. Search field appears with a container open.

### 6.2 Crafting
Three panes: categories, recipe list, detail. Detail shows a large preview, the input list with owned/needed, station requirement, a count selector (1/5/max), and a Craft button. Clickable missing-material rows jump to the journal entry. A "craftable only" filter, remembered.

### 6.3 Building catalogue
A grid of pieces with owned counts, categories down the left, search, and a "recently used" row at the top. Selecting a piece closes the catalogue and arms the ghost. `Q` copies an existing piece's settings, which is faster than the catalogue for most placements.

### 6.4 Journal
The heart of the UI and the place to spend disproportionate polish. Six tabs: Flora, Fauna, Fish, Places, Recipes, Fragments.

- Entries are cards: a hand-drawn illustration, a name, a short naturalist description in the display face, where and when it was found, and any records (fish size, first-seen date, count harvested).
- Undiscovered entries show as an empty silhouette with a `?` — the count of unknowns is visible, which is the entire progression driver.
- Completion percentage per tab and overall, on the tab strip.
- Fragments are presented as scraps of paper, arranged chronologically once enough are found, so the story assembles visibly.
- Opening the journal to an entry from elsewhere in the UI (crafting, tooltips) is supported and heavily used.

### 6.5 Settings
Grouped: Display, Graphics, Audio, Controls, Gameplay/Comfort, Accessibility. Every setting has a one-line explanation. Changes apply immediately; a "reset section" per group. Graphics shows the detected tier and current FPS live.

Comfort settings (from `02_CORE_GAMEPLAY_LOOP.md` §6): day length, endless energy, no cold, relaxed fishing, auto fishing, always clear weather, reduced flashes, reduced motion, camera auto-follow.

## 7. Notifications and toasts

- Three severities: quiet (item pickup — a small stacked line), notable (new recipe, new journal entry — a card with an icon, 4 s), and major (region discovered, beacon lit — a centred title card, 3 s, with music).
- Toasts merge: picking up 12 wood over 8 seconds shows one line updating its count, not 12 lines.
- Never more than 4 toasts on screen; the oldest collapses.

## 8. Onboarding hints

Maximum 6 in the entire game, each shown at most twice, each a single line near the relevant element, dismissed by performing the action. They are: move, interact/gather, open crafting, place a piece, open the journal, sleep. That is all. See `02_CORE_GAMEPLAY_LOOP.md` §7.

## 9. Implementation steps

1. React root, overlay layering, pointer-events discipline (the overlay must not eat canvas input except over panels).
2. Store pattern + the first store (inventory) + the event projection.
3. Design tokens (CSS custom properties) + base components: Panel, Button, Slot, Tooltip, Tabs, Slider, Toggle.
4. HUD: crosshair, prompt, hotbar, toasts. The 2D canvas layer for per-frame elements.
5. Inventory screen with drag/drop and keyboard equivalents.
6. Container view (dual panel), shift-transfer, stash, sort, search.
7. Crafting screen.
8. Building catalogue.
9. Journal (the largest single UI task — budget accordingly).
10. Settings with full persistence.
11. Gamepad navigation layer and glyph swapping.
12. Accessibility pass: focus rings, roles, labels, contrast audit, UI scale, reduced motion.
13. Photo mode and HUD hiding.

## 10. Testing requirements

- Playwright: open and close every screen; assert no console errors and that focus returns correctly.
- Playwright: complete a full gather → craft → place flow using **keyboard only**, and again using **mouse only**.
- Playwright: drag a stack between containers; split a stack; shift-transfer; assert counts.
- Unit: view-model projections are pure and produce stable output for a fixture world.
- Performance: React commits per second during normal play ≤ 8; zero commits while simply walking around. Assert with a render counter in dev builds.
- Accessibility: automated axe-core scan on every screen with zero serious violations; manual screen-reader pass on Inventory, Crafting and Journal.
- Visual regression: golden screenshots of each screen at 100% and 150% UI scale.

## 11. Future expansion

- Map screen with fog-of-war revealed by exploration and player-placed pins (Phase 6; the compass covers the gap until then).
- In-world diegetic UI: a physical journal object the player opens, rather than a screen. Beautiful, expensive, post-1.0.
- Sharable screenshots with an island name and day count watermark.
- Multiplayer additions: player list, nameplates, ping markers, emote wheel (see `36_MULTIPLAYER_ARCHITECTURE.md`).
