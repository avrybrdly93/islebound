# 00 — Project Vision

**Working title:** Halcyon Isle
**Codename / repo:** `halcyon`
**Type:** Cozy 3D survival-exploration game, browser-native, single-player first with drop-in co-op multiplayer.

---

## 1. Purpose of this document

This is the constitution of the project. Every other document defers to it. When a design or engineering decision is ambiguous, resolve it in favour of whichever option better serves the core fantasy described below.

This document changes rarely. If you are an AI agent and you believe this document is wrong, **do not edit it** — open a note in `docs/34_DEVELOPMENT_LOG.md` under "Vision Questions" and continue with the existing vision.

---

## 2. Core fantasy

> **"The feeling of arriving somewhere unknown and slowly turning it into a place that feels like home."**

The player washes up on a small forgotten island. Nobody is hunting them. Nothing is on a timer. Over dozens of hours they learn the island's shape, its plants, its tides and its history, and they turn it into somewhere they want to be.

The emotional target is the fifteen minutes after you arrive somewhere beautiful and realise you have nowhere to be.

## 3. Design values (ranked)

These are ranked. When two conflict, the higher one wins.

1. **Calm.** No mechanic may create anxiety the player did not opt into. No fail states that lose progress. No enemies that hunt the player.
2. **Legibility.** The player should always understand why something happened. Systems are shallow individually and interesting in combination.
3. **Reward for curiosity.** Every distinctive-looking place on the island contains something: a recipe, a resource, a journal entry, a view.
4. **Expression.** The island at hour 40 should look like *this* player's island, not the designer's.
5. **Presence.** Ambient life, weather, light and sound do more work than any single mechanic. Standing still should be pleasant.
6. **Respect for time.** No mechanic exists solely to consume minutes. Grinding is a bug.

## 4. Anti-goals

Explicitly out of scope. Do not implement these, even partially, without a written vision amendment:

- Combat of any kind against intelligent enemies.
- Hunger/thirst/temperature meters that can kill the player.
- Permadeath, item loss on death, or durability decay that punishes.
- Timed events that the player can miss permanently.
- Base defence, raids, or hostile NPCs.
- Procedurally infinite worlds. The island is finite, authored and knowable.
- Monetisation systems, ads, telemetry beyond anonymous crash reporting.
- Photorealism. See `26_ART_DIRECTION.md`.

Soft-banned (allowed only in a deliberately gentle form): stamina, weight limits, tool durability. If used, they exist to pace exploration, never to block it — see `02_CORE_GAMEPLAY_LOOP.md` §6.

## 5. Multiplayer stance

The game is designed as a **single-player experience that a friend can join**.

- Target session shape: 1 player alone, or 2–4 friends on one island. Hard cap 8.
- The island belongs to the host/owner. Visitors help; they do not own.
- There is no PvP, no griefing surface that cannot be undone, no competitive scoring.
- **Single-player must remain fully playable offline with no server.** Networking is an additive layer, never a dependency of core simulation.

The architecture is built multiplayer-aware from day one (authoritative simulation separated from presentation, deterministic world generation, serialisable world state) but multiplayer is *implemented* in Phase 7. See `36_MULTIPLAYER_ARCHITECTURE.md` for why this ordering is non-negotiable.

## 6. Platform and reach

- **Primary:** Desktop browsers — Chrome, Edge, Firefox, Safari 17+. Mouse + keyboard.
- **Secondary:** Gamepad support on desktop.
- **Tertiary (best effort):** High-end tablets. Touch controls are a Phase 6+ concern.
- **Not targeted:** Phones, VR, native builds. Do not add code paths for these.

Performance contract: **60 fps at 1920×1080 on an Apple M1 / Intel Iris Xe integrated GPU.** This is a hard constraint, not an aspiration. See `28_PERFORMANCE_OPTIMIZATION.md`.

Load contract: **playable within 8 seconds on a 20 Mbps connection**, initial download under 15 MB compressed.

## 7. Scope discipline

This is a solo-developer project assisted by AI agents. The scope control rules:

- One island. Roughly 512 m × 512 m of playable terrain plus surrounding sea.
- Roughly 60 craftable items, 40 buildable pieces, 20 fish, 25 plants, 12 animals. These are ceilings, not targets.
- Content is data, not code. Adding a fish must never require a code change.
- If a feature cannot be described in one paragraph, it is too big — split it in `32_BACKLOG.md`.

## 8. Definition of "done" for the project

Version 1.0 ships when a new player can:

1. Arrive on the island with no tutorial text and reach a lit campfire within 10 minutes by following affordances alone.
2. Reach a furnished cabin with a working garden within roughly 4 hours of play.
3. Fill 80% of the journal within roughly 25 hours.
4. Invite a friend, who joins in under 30 seconds and can meaningfully help.
5. Return after a month away and immediately remember what they were doing, because the island tells them.

## 9. Reference touchstones

For tone, not for feature copying: *A Short Hike* (movement joy, scale), *Animal Crossing* (routine, ownership), *Stardew Valley* (progression cadence), *Dorfromantik* (calm as a mechanic), *Firewatch* (colour and light), *The Witness* (an island that teaches by geography).

Explicitly **not** touchstones: *Rust*, *ARK*, *Valheim*, *Minecraft* survival mode.
