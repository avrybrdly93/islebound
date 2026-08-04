# Phase 0 — Foundation

**Proof:** a grey-box scene renders at 60 fps with a stats overlay, and `pnpm test` + `pnpm sim --ticks 10000 --assert-hash` pass on a clean clone.
**Backlog tasks:** BL-001 – BL-021 (fully specified in `docs/32_BACKLOG.md`; this file is the narrative map over them).

---

## Goal

A boring, correct, fast skeleton. Nothing in this phase is visible to a player, and everything in it determines whether the next seven phases are possible. Do not rush it and do not gold-plate it.

## Milestones (in order)

### M0.1 — Repository (BL-001, BL-002, BL-021)
Workspace, strict TS config, lint/format with the boundary and purity rules, root docs. Exit: `pnpm install && pnpm lint && pnpm typecheck` green on a clean clone; the custom lint rules each catch a fixture violation.

### M0.2 — Core kernel (BL-004, BL-005, BL-006, BL-009, BL-010)
Math (allocation-free, out-params), seeded RNG + noise (cross-environment identical), typed event bus, service registry, config with dev hot-reload, logger with ring buffer. Exit: ≥95% coverage on math; RNG fixture identical in Node and browser.

### M0.3 — Simulation substrate (BL-007, BL-008)
ECS-lite with generation-safe IDs and deterministic query order; the fixed 30 Hz accumulator loop with interpolation alpha and catch-up cap. Exit: 10k entities × 6 components query ≤0.15 ms; sim rate independent of render rate at 30/60/144 fps.

### M0.4 — Rendering bring-up (BL-003, BL-011, BL-012, BL-013)
Canvas shell, `WebGLRenderer` per `docs/08` §9, grey-box scene, capability detection and quality tiers, the dev overlay with per-system timings. Exit: 60 fps grey-box; overlay ≤0.1 ms; overlay absent from prod bundle.

### M0.5 — Test and verification substrate (BL-014, BL-015, BL-016, BL-017, BL-018)
The headless sim harness (`pnpm sim`) with `worldHash()`, Vitest, Playwright with the `__game` hook, the sim-purity checker, bundle budget check. Exit: `pnpm sim --ticks 20000 --assert-hash` deterministic across runs; boot smoke test green headless.

### M0.6 — CI and deployment (BL-019, BL-020)
The four CI jobs within their time budgets; Cloudflare Pages with per-PR preview URLs, staging on merge, CSP headers verified. Exit: a PR shows a clickable preview; `quick` job < 3 min.

## Acceptance criteria for closing the phase

- [ ] The phase proof, demonstrated in a PR preview URL
- [ ] All 21 tasks Done in the backlog with PR links
- [ ] Critical tests T3 (determinism) exists and is green; the harness for T10 (per-system budgets) exists
- [ ] CI green on a clean clone by a fresh agent following only the README
- [ ] Phase retro written in `docs/34_DEVELOPMENT_LOG.md`; tag `phase-0-complete`

## Traps to avoid

- Building any gameplay "while we're here". There is none in this phase.
- Skipping the harness (BL-014) because "there's nothing to simulate yet" — it is the foundation the next 250 tasks stand on.
- Letting the `quick` CI job creep past 3 minutes; it is the loop every future session iterates against.
