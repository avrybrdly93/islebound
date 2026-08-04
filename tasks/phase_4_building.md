# Phase 4 — Building

**Proof:** build a two-room cabin with a door and roof, save, reload, walk inside, remove a wall, get the materials back.
**Backlog tasks:** created at phase opening from this file.

---

## Goal

The island becomes yours. This is the expression system that carries long-term play; generosity and predictability of placement outrank everything else.

## Milestones (in order)

### M4.1 — Build mode and the ghost
Piece catalogue data (start: foundation, wall, floor, doorway, door, roof gable), build-mode state, ghost mesh with aim raycast, validity evaluation (slope, overlap, support, bounds, materials) with tint + one-line reason. Exit: the 40-scenario snapping/validity fixture test (started here, grown through the phase).

### M4.2 — Grid placement end-to-end
Grid snapping + 90° rotation → intent → revalidate → consume → entity + collider + instanced render → the placement feedback burst (scale-pop, dust, thunk, camera punch, material icons flying). Exit: placement feels like the game's best action (human review); instanced rendering verified ≤ 2 draw calls for 200 pieces of one type.

### M4.3 — Removal and refund
Removal mode, highlight, full refund, no cascade. Exit: **T2 (place-N/remove-N inventory-identity property test, 10k iterations) exists and is green.**

### M4.4 — Sockets
Socket definitions authored in glTF extras, socket snapping with priority over grid, highlighting, the 1 mm coplanar offset. Exit: the cabin fixture (60 pieces) builds from a script with zero invalid placements; asset validator cross-checks socket names table↔glTF.

### M4.5 — Foundations and terrain
Foundation flattening → chunk remesh → collider rebuild → vegetation removal recording; restore-on-removal; overlapping-foundation rules. Exit: the flatten/remove/overlap test matrix from `docs/13` §10 green.

### M4.6 — Decoration and variants
Surface snapping (floor/wall/table), free mode (Alt), 15° decor rotation, dye variants + the copy tool (Q). Exit: decor placement on all three surface classes; copy tool round-trips type+variant+colour.

### M4.7 — Interiors
The structural-grid flood fill (debounced, workered past 2 ms), sensor volumes, and the first consumers: rain exclusion stub + ambient flag. Exit: the cabin fixture yields the expected interior cell set; a missing wall reads as outdoors.

### M4.8 — Scale and persistence
Spatial hash index, the 3,000-piece soft warning / 5,000 cap, structure save/load, and — critically — **the worst-case-island fixture is created here** (4,000 structures, later extended by Phases 5–6) and enters the bench suite. Exit: 3,000 pieces ≤ 120 added draw calls, `BuildingSystem` ≤ 0.4 ms/tick.

## Acceptance criteria for closing the phase

- [ ] The phase proof on a preview URL, as a video in the retro
- [ ] T2 green and critical; save fixtures updated (T4 gains a version)
- [ ] Cozy contract C6 demonstrably holds
- [ ] Worst-case-island fixture committed and benchmarked
- [ ] Retro; tag `phase-4-complete`

## Traps to avoid

- Making placement strict "for realism" — when in doubt, allow it (`docs/17` §1).
- Rebuilding instance buffers on removal instead of swap-and-decrement (the hitch appears at scale, not in testing).
- Treating the placement feedback as polish; it is the reward loop's payoff and belongs to M4.2.
