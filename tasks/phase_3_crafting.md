# Phase 3 — Crafting

**Proof:** gather → craft a Stone Axe at a workbench → fell a tree that hands could not.
**Backlog tasks:** created at phase opening from this file.

---

## Goal

Materials become capability. The unlock system lands here and quietly becomes the game's quest system.

## Milestones (in order)

### M3.1 — Recipe substrate
`RecipeDef` table (first ~20 recipes: materials + stone tools), startup validation (existence, cycles, station coherence), the unlock reverse index evaluated on events, unlocked-set persistence. Exit: **T7 (full unlock-chain reachability from `start`) exists and is green.**

### M3.2 — Hand crafting end-to-end
Validation → staged consumption → instant output → `craft:completed` event, with a placeholder list UI. Exit: crafting conserves items under the T1 property test (extend its operation set); refusal paths mutate nothing.

### M3.3 — Crafting screen
Three-pane UI per `docs/16` §7: categories, list with craftable/dimmed states, detail with owned/needed, count selector, search, "craftable only" filter; missing-material rows link to journal entries. Exit: Playwright keyboard-only and mouse-only flows; locked recipes are invisible (never teased).

### M3.4 — The workbench (bridge to Phase 4)
The workbench as the first placeable entity — minimal placement (flat ground, no snapping yet), station proximity detection, station-scoped recipe availability. Exit: craft the workbench, place it, craft the Stone Axe at it. (Full building arrives in Phase 4; this deliberately-minimal placement gets replaced, and that is fine.)

### M3.5 — Queued crafting
Station queues with tick progression, walk-away continuation, cancellation refunds, output slots with auto-push, completion chime + toast. Exit: quit-and-reload mid-queue resumes correctly; cancellation refunds exactly.

### M3.6 — Journal v1
Recipes + Materials tabs, discovery events, completion percentages, the new-recipe toast/badge flow. Exit: first-acquisition → unlock → journal entry fires exactly once (idempotence test).

### M3.7 — Balance tooling
`pnpm tools:balance` reading the content tables, estimating gather-cost per recipe, exporting `docs/data/recipe-balance.csv`, flagging outliers. Exit: the first-tool-within-6-minutes scenario test (from `docs/29` §2) green against the shipped seed.

## Acceptance criteria for closing the phase

- [ ] The phase proof on a preview URL, as a GIF in the retro
- [ ] T7 green and registered as critical; T1 extended over crafting ops
- [ ] The 6-minute-axe scenario green
- [ ] Retro; tag `phase-3-complete`

## Traps to avoid

- Building the full placement system early "since the workbench needs it" — Phase 4 owns that; keep M3.4 deliberately crude.
- Recipe costs tuned by vibes; the balance tool exists so tuning is visible and reviewable.
- Teasing locked content in the UI (it violates the design rule and players feel it).
