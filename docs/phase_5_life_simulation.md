# Phase 5 — Life Simulation

**Proof:** play a full in-game week: plant and harvest, cook a dish, catch three fish species, catalogue five animals, find two fragments.
**Backlog tasks:** created at phase opening from this file. The largest phase (~52 tasks); groom it into the three tracks below and interleave.

---

## Goal

The island lives, and the daily rhythm the whole design promises finally exists. Three parallel tracks (Farm & Kitchen, Water, Wild & World) converge on the journal.

## Track A — Farm & Kitchen

### A1 — Tiles and tilling
Sparse `FarmTile` store, hoe with splat/slope validation, tilled-soil instanced rendering (dry/wet variants). Exit: till/untill property test never leaks tiles.

### A2 — Growth
Planting from hotbar with mature-crop ghost, the hourly bucketed growth pass, stage-instanced rendering with the 0.4 s pop, first 6 crops. Exit: exact-day maturity tests; 600 tiles ≤ 0.5 ms per in-game hour.

### A3 — Water
Watering can with charges + refill, rain integration (every outdoor tile, hourly), the unwatered-pauses rule including offline (deterministic weather replay makes this honest). Exit: rain waters no interior tile (uses M4.7); offline growth test matrix green.

### A4 — Convenience before it's needed
Drag-to-repeat for till/plant/water (build with A1–A3, not after); sprinklers with 06:00 trigger + range overlay; potting bench seed production. Exit: sprinkler coverage exact at chunk boundaries.

### A5 — Kitchen
Dishes as crafting content (no new code path), the buff system (single active buff, replace-with-confirm), buff HUD ring, first 15 dishes. Exit: buff exclusivity test; Green Thumb resolves at dawn correctly across sleep.

## Track B — Water

### B1 — The cast
Rod, `FISH_*` states, charge/arc/landing, water-body detection via `heightAt`, bobber with wave-bobbing + ripples. Exit: state machine fuzz, no leaked bobbers over 5k loops.

### B2 — The bite and the reel
Weighted wait with tells, the 1.2 s bite window, the reel minigame (bar physics, four marker patterns, per-species difficulty). Exit: winnable-by-perfect-input and losable-by-none tests; Relaxed + Auto comfort modes complete the loop.

### B3 — The fish
`FishDef` table — all 20 + 6 junk/treasure — with waters/hours/weather; rarity weighting; rare-fish environmental tells. Exit: **T8's fishing half (every fish reachable, solver over all configurations) green**; distribution within 2%.

### B4 — The payoff
Catch presentation (pose, name card, size, quieter repeat fanfare), size records, fish crate, trophy mount. Exit: first-catch journal idempotence; the sit-while-fishing combination works.

## Track C — Wild & World

### C1 — Wildlife
`AnimalDef` (12 species on 2 shared rigs), spawn director with population targets and out-of-view rules, behaviour state machines, flee radii. Exit: 10 in-game days, targets held, zero in-view despawns, 40-cap respected.

### C2 — Befriending
Food-left detection across days, the 5-day approach, naming, loose-follow, petting, save persistence. Exit: the befriending scenario test across sleep and reload.

### C3 — Vitals
Energy (drain/regen/soft consequence, sub-50% UI) and Warmth (cold zones, vignette, fire/food/leave recovery), both with comfort toggles, neither referenced anywhere as a failure condition (lint-greppable rule). Exit: fully completable with both toggles on (scenario test).

### C4 — Fragments and places
24 fragments at landmark spawn points, discovery events, Places entries with optional weather/time requirements, the story-scrap assembly view. Exit: all fragment points on walkable ground within 3 m of their landmark (extends BL-043's invariants).

### C5 — The journal, complete
All six tabs, silhouetted unknowns with counts, per-tab completion, records, the entry-linking from crafting/tooltips. Exit: the journal is the demonstrable "what now?" surface — opening it always shows a near-complete category first (view-model test).

## Acceptance criteria for closing the phase

- [ ] The phase proof as a scripted harness scenario **and** a human playthrough video
- [ ] T8 fully green (fish + nodes + recipes); T9 (sleep ≡ play) green — sleep lands with A3/C3 interplay
- [ ] Content ceilings respected; balance report has no red flags
- [ ] Worst-case fixture extended (600 farm tiles, full journal) and re-benchmarked
- [ ] Retro; tag `phase-5-complete`

## Traps to avoid

- Building the three tracks sequentially — interleave, or the last track gets starved and the phase proof slips.
- New buff types invented ad hoc in content PRs (the table in `docs/18` §7 is the set).
- Wildlife polish before the spawn director is stable (animation on top of churn is wasted).
