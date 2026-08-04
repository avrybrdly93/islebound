# Phase 2 — Resources

**Proof:** gather five resource types into an inventory that survives a page reload.
**Backlog tasks:** to be created at phase opening from this file (continue `BL-045+`), per the grooming rule in `docs/32_BACKLOG.md`.

---

## Goal

The island gives you things, and taking them feels good. This phase also lands the save system — early on purpose, so every later phase builds on persistence instead of bolting it on.

## Milestones (in order)

### M2.1 — Interaction substrate
Targeting (camera ray + proximity fallback), the prompt view model, hold-to-act with the forgiving cancel (progress persists 3 s). Exit: prompt appears ≤ 80 ms after targeting; cancel/mis-release costs nothing (test).

### M2.2 — Nodes and gathering
`NodeDef` content table (start with 8 shore/forest nodes), node entities from placement lists, `ResourceSystem` progress/yields/depletion behaviours, seeded yield rolls. Exit: distribution test within 1% over 100k rolls; depletion behaviours (stump/remove/shrink) render correctly.

### M2.3 — Feedback layer (a first-class milestone, not polish)
Per-tick particles + camera punch + material SFX stubs; completion burst; the item-pop arc into the HUD; first-time acquisition flourish. Exit: human review against `docs/02` §2's quality bar; every interaction has ≥ 3 simultaneous feedback channels.

### M2.4 — Inventory
`Container` component, core operations with the staged-transaction helper, grid UI with drag/drop + keyboard equivalents, hotbar with held-item attachment, overflow drops, magnet pickup. Exit: **T1 (item conservation property test, 100k random ops) exists and is green** — this is the phase's most important deliverable.

### M2.5 — Tools and gating
Tool items, tier gating (hands/stone), speed multipliers, the "shows what's needed" refusal. Exit: gating table test across all node × tool combinations.

### M2.6 — Regrowth
Bucketed regrow queue, jittered timers, tree regrowth stages, offline catch-up (capped). Exit: 500k-tick bucket correctness test; save→advance 30 days→load restores all regrowable nodes exactly once.

### M2.7 — Save system v1
Schema v1 (world meta, player, containers, node deltas), IndexedDB wrapper, worker compression, verify-before-promote, rolling backups, autosave scheduler with idle deferral. Exit: **T5 (round-trip hash equality) and the first T4 fixture exist and are green**; kill-the-tab manual checklist passes at 20 random moments.

## Acceptance criteria for closing the phase

- [ ] The phase proof on a preview URL
- [ ] T1, T4 (v1 fixture), T5 green in CI and listed as critical
- [ ] `ResourceSystem` ≤ 0.25 ms/tick at 2,800 nodes (T10 entry added)
- [ ] Cozy contract C1 and C3 demonstrably hold (tests referenced in the retro)
- [ ] Retro; tag `phase-2-complete`

## Traps to avoid

- Deferring the feedback milestone "until there's audio" — stub sounds now; the timing and layering are the work.
- Writing inventory operations without the transaction helper and retrofitting it (the duplication bugs will already be in).
- Letting autosave hitch the frame; the 10 ms snapshot budget is a test, not a hope.
