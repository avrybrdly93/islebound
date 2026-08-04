# Phase 7 — Multiplayer

**Proof:** two browsers on different networks, one island, both building, at 100 ms simulated latency, no desync over a 30-minute session.
**Backlog tasks:** created at phase opening from this file. Read `docs/36`, `37`, `38`, and `31` §3 before grooming.

---

## Goal

Someone can join you. If Phases 1–6 honoured the network-safe checklist, this is an integration project. Day one establishes whether they did.

## Milestones (in order)

### M7.1 — The moment of truth
`packages/server` activates; it imports `@halcyon/sim` and runs 20k headless ticks (`pnpm --filter server sim-smoke`). Exit: green — or a prioritised repair list of every checklist violation, fixed before anything else in this phase.

### M7.2 — Transport seam
The client's intent queue goes behind a `Transport` interface: `LocalTransport` (existing, unchanged behaviour — verified by the full test suite) and a stub `WsTransport`. Exit: single-player bit-identical through the seam (T3 + T9 green through `LocalTransport`).

### M7.3 — First contact
Server ws endpoint, HELLO/WELCOME with version + contentHash checks, one room, full snapshot on join, two browsers seeing each other move at raw 10 Hz. Exit: it works and it is ugly; screenshot for the log.

### M7.4 — Real sync
Delta snapshots with change masks + quantisation; events broadcast driving remote VFX/SFX for free; remote interpolation at 150 ms; nameplates; time slewing. Exit: bandwidth ≤ 12 kB/s down per client on the scripted session, per-opcode breakdown printed.

### M7.5 — Prediction
Local-player prediction + ring buffer + reconciliation with the 100 ms corrective blend; optimistic gather/craft/build with the fizzle path. Exit: corrections < 2 cm p95 at 150 ms simulated RTT; the fizzle is soft, not jarring (human check).

### M7.6 — Shared-world correctness
Server-side intent revalidation (shared validators); container sequence numbers; the three race tests (chest, socket, depleted node); sleep consent; per-player journal/unlocks. Exit: **the desync test (4 scripted clients, 30 in-game minutes, 100 ms RTT, 2% loss, hash checkpoints) exists and is green** — this is the phase's T3-extension and its most important deliverable.

### M7.7 — Trust and safety
Join codes + sessions, permission tiers, private chests, the 7-day undo log with its owner UI, kick/ban, rate limits, the protocol fuzz (1M buffers), the cheating-client test suite. Exit: every `docs/31` §7 Phase-7 test green.

### M7.8 — Persistence and operations
SQLite per `docs/38`, 60 s save cadence, hibernation/rehydration, the crash-loss chaos test (SIGKILL ×50, ≤ 60 s lost, T1 holds), SP↔hosted island migration both directions. Exit: chaos green; a friend's save becomes a hosted island and back, losslessly.

### M7.9 — Presence and warmth
Pings, the emote wheel, join/leave moments (arrival at the beach, farewell toast), the connection-quality dots, "caught something!" pings. Exit: a real two-friend session feels *cozy*, not merely synchronised — human judgement, noted in the retro.

### M7.10 — Fleet
Fly deploy per `docs/30` §7, region routing, hourly R2 backups + the restore drill script, `/metrics` + alerts, the load test (10 rooms × 4 clients per machine). Exit: the runbook rehearsed once end-to-end; cost within the `docs/38` §8 envelope.

## Acceptance criteria for closing the phase

- [ ] The phase proof, on production infrastructure, across a real ocean if possible
- [ ] Desync, chaos, races, cheat-suite, fuzz — all green and registered as critical
- [ ] Join-to-playing under 30 seconds for a fresh visitor (the `docs/00` §8 promise)
- [ ] Retro; tags `phase-7-complete` and the release
