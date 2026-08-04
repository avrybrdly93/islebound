# Phase 6 — Polish & Ship

**Proof:** a stranger plays for 45 minutes without asking a question, on integrated graphics, at 60 fps.
**Backlog tasks:** created at phase opening from this file.

---

## Goal

It becomes a product. This phase is where restraint pays: the budgets, the comfort options, and the first ten minutes get their final form. Nothing new mechanically; everything finished.

## Milestones (in order)

### M6.1 — Weather, complete
The full system per `docs/21`: Markov transitions with 90 s blends, rain particles with interior/canopy exclusion, wetness + puddles, wind, storms with photosensitivity-safe lightning, fog, aurora, all gameplay hooks live. Exit: determinism test over 1,000 days; transition-continuity assertion; goldens per state.

### M6.2 — Audio, complete
Engine + buses + the indoor low-pass; layered ambience with the Poisson one-shots; music stems with bar-aligned transitions and the ~45% silence target; the priority-10 SFX list with variations; footstep material resolution; ducking; the full mix checklist. Exit: voice-pool and no-repeat tests; the muted-autoplay path is playable; a human signs the mix checklist.

### M6.3 — Art pass
Final materials + the foliage translucency shader; post chain (SSAO/bloom/LUT/SMAA, tier-gated); day/night LUTs + per-region biases; the vertical-slice bar applied island-wide; the nightly style-sheet render live. Exit: the six canonical goldens re-baselined deliberately; colour-blind audits pass; palette audit warns on nothing.

### M6.4 — Animation pass
Locomotion blend spaces final, upper/lower split, head look-at, foot IK, held-tool attachments, animal LOD tiers, vegetation gusts. Exit: the no-foot-slide / no-pop manual checklist; event-once-per-loop test.

### M6.5 — UI/UX and accessibility
Settings complete (every comfort option from `docs/02` §7 + `24` §6.5), gamepad navigation + glyph swap, rebinding, UI scale, reduced motion honoured everywhere, axe-core zero-serious on every screen, screen-reader pass on the big three. Exit: the keyboard-only and gamepad-only full-loop Playwright tests.

### M6.6 — Onboarding and the map
The 10-minute table from `docs/02` §7 tuned against real strangers (≥3 sessions, notes in the retro); the six hints — and no seventh; the map screen with fog-of-war and pins. Exit: a fresh-profile stranger reaches a lit campfire ≤ 10 min without prompting, twice.

### M6.7 — Performance closeout
Adaptive quality stepping; texture/bundle budgets enforced at final content; LOD tuning on the worst-case fixture; the frame-budget CI gate flips from warn to block (`docs/06` §5). Exit: the contract holds on all three real-device passes; nightly soak clean for a week.

### M6.8 — Ship
Title screen, save-slot UI, photo mode, error boundary + Sentry with scrubbing, update toast, release notes, the full phase-closing checklist from `docs/30` §9, tag `v1.0.0`. Exit: the checklist, honestly. Note that "ship" here means the last merge to `main` before the tag — the game has been continuously deployed since Phase 0.

## Acceptance criteria for closing the phase

- [ ] The phase proof: two independent strangers, recorded (with consent), both clean runs
- [ ] All ten critical tests green; frame gate blocking; budgets locked
- [ ] Save compatibility from the oldest supported version verified
- [ ] Retro; tags `phase-6-complete` and `v1.0.0`

## Traps to avoid

- New features wearing polish costumes. The Icebox exists; use it.
- Re-baselining goldens casually during the art pass — each rebaseline is a reviewed decision.
- Tuning onboarding from your own playthroughs; you cannot see it anymore. Strangers only.
