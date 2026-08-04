# 36 — Multiplayer Architecture

Purpose: how drop-in co-op works — the authority model, connection lifecycle, state synchronisation, prediction, and the design rules that keep Phases 1–6 from accidentally making Phase 7 impossible. Read alongside `37_NETWORK_PROTOCOL.md`.

---

## 1. The shape of multiplayer here

- **2–4 friends, cap 8**, on one island owned by one player. Join by code. No matchmaking, no strangers, no public browser.
- The experience is *your island plus visitors*, not a shared server world. Design consequences: visitors keep their own inventory/journal/unlocks; the island (terrain deltas, structures, crops, node states, time, weather) is shared.
- **Single player never touches the network stack.** The offline game runs the same `sim/` with a local intent queue. Multiplayer swaps the queue's transport, nothing else.

## 2. Authority model

**Client–server, server-authoritative.** The server runs the same deterministic simulation (`@halcyon/sim`, imported from the shared workspace — the entire reason `sim/` is browser-free).

```
┌──────────┐  intents   ┌────────────────────┐
│ client A │───────────►│                    │
│ (predicts│◄───────────│   SERVER (Node)    │
│  locally)│ snapshots+ │   authoritative    │
└──────────┘  events    │   sim @ 30 Hz      │
┌──────────┐            │   SQLite persist   │
│ client B │◄──────────►│                    │
└──────────┘            └────────────────────┘
```

Rejected alternatives, recorded:
- **Lockstep determinism** (all clients simulate, exchange only inputs): rejected because Rapier is not bit-deterministic across architectures (`10` §3), late-join requires full state transfer anyway, and a single slow client stalls everyone.
- **Host-as-server (P2P):** rejected because the host closing their laptop ends everyone's session, NAT traversal is misery, and cheating protection is impossible. The owner *not* needing to be online for a hosted island is also a feature we may want later.
- **CRDT/eventual consistency:** wrong tool; game state has strict invariants (item conservation) that CRDTs make hard.

## 3. Server anatomy

One Node process hosts many **Rooms**; one Room = one island.

```
Room
├── world: World            // the same sim the client runs
├── clients: Map<ClientId, Connection>
├── tick loop @ 30 Hz       // setImmediate-based drift-corrected timer
├── intentInbox             // validated intents from all clients
├── snapshotScheduler       // full + delta snapshots per client
├── persistence             // debounced SQLite writes (23_SAVE_SYSTEM §7)
└── idlePolicy              // room hibernates 60 s after last client leaves
```

- Rooms are created on demand when the first client connects with a valid island id + join code, loading the island from SQLite.
- Hibernation: save, drop the world, keep a stub. Rejoin re-hydrates. This keeps a small VM able to hold hundreds of registered islands with a handful active.
- Tick budget: a Room must simulate a tick in ≤ 2 ms so one VM comfortably runs 8–10 active rooms.

## 4. The network-safe checklist (applies to every feature in Phases 1–6)

This is the section other documents reference. Before merging any gameplay feature, verify:

- [ ] **All mutations enter through intents** — no direct state writes from presentation.
- [ ] **All state lives in serialisable components** — no closures, no three.js objects, no module-level gameplay state.
- [ ] **Randomness uses named seeded streams** — and streams that must agree across machines derive from world state, not from per-client counters.
- [ ] **No assumption of exactly one player** — iterate `world.query(PlayerTag)`; interactions carry the acting player's `EntityId`.
- [ ] **The system tolerates wholesale state replacement** — a server snapshot may overwrite anything between two ticks; systems must not cache derived state across ticks without a dirty-invalidation path.
- [ ] **Intent validation is pure** — validators take `(world, intent, actor)` and return `Result`; they will run on the server verbatim.
- [ ] **Durations are in ticks**, never wall-clock.
- [ ] **UI reads view models, not world internals** — so the view layer cannot tell whether state came from local sim or a snapshot.

If a feature cannot satisfy one of these, it needs a design conversation *now*, not in Phase 7.

## 5. Connection lifecycle

```
connect (wss) ─► HELLO {protocolVersion, playerKey, islandId, joinCode}
   │  server: version check → auth (31 §3.3) → room load/create → capacity check
   ▼
WELCOME {playerEntityId, tick, fullSnapshot, contentHash}
   │  contentHash mismatch → client told to reload (stale deploy)
   ▼
JOINED broadcast to others ─► spawn at the arrival beach with a gentle effect
   │
   ├── steady state: client sends intents (≤30 Hz), server sends
   │   delta snapshots (10 Hz) + events (as they happen) + pings (1 Hz)
   │
   ├── disconnect (network): entity persists 30 s ("lost connection" nameplate),
   │   then despawns; inventory is saved with the island; rejoin restores it
   └── leave (deliberate): immediate despawn, farewell toast to others
```

Reconnect uses the cached last snapshot + a delta from the server for a sub-second rejoin.

## 6. State synchronisation

### 6.1 Snapshots
- **Full snapshot** on join: the gzipped serialised world (same code path as saves), typically 30–90 kB.
- **Delta snapshots** at 10 Hz per client: entities changed since that client's last ack, with per-component change masks. Position/rotation quantised as in `10` §3.
- **Interest management** at island scale is mild: everything gameplay-relevant syncs to everyone (the island is small and shared), but *transform* updates for entities beyond 80 m of a client are throttled to 2 Hz. Animals beyond 120 m don't sync motion at all — clients run their idle animations locally.
- Bandwidth target: **≤ 12 kB/s down per client** in steady state, ≤ 4 kB/s up. Verified by a CI test against a scripted 4-player session.

### 6.2 Events
Sim events (`resource:harvested`, `structure:placed`, …) broadcast to all clients drive VFX/SFX/UI exactly as local events do. Clients therefore render other players' actions with full feedback for free — this is the payoff of the event-driven presentation layer.

### 6.3 Time and weather
`tick` is server-authoritative; clients slew their local tick toward it (never jump backwards; max slew 2%). Weather needs no sync at all beyond `tick` — it is deterministic from `(seed, day, hour)` (`21` §2). This is why that decision was made.

## 7. Client prediction and reconciliation

Only **the local player's movement** is predicted. Everything else waits for the server (at 60–100 ms RTT, a 100 ms delay on a chest opening is imperceptible in this genre; predicted movement is the one thing that is not).

```
each client tick:
  apply local input to the local player immediately (feels instant)
  send {seq, intents} to server
  store {seq, predictedState} in a ring buffer (last 90 ticks)

on server snapshot containing our player at server-seq S:
  compare server state to our buffered prediction at S
  if |posError| < 2 cm and state matches → discard buffer ≤ S, done
  else → rewind to server state at S, re-apply buffered inputs S+1..now
         (re-simulating movement only — cheap), blend the visual
         correction over 100 ms so it never snaps
```

Remote players render **150 ms in the past**, interpolating between the two most recent snapshot states — smooth and simple, and in a co-op building game, entirely sufficient. No extrapolation: a remote player briefly pausing beats one rubber-banding.

Gathering/crafting/building by the local player use **optimistic UI**: the progress arc starts immediately, but the yield/placement lands only on the server event. A rejection (rare — usually a race with another player) plays a soft "fizzle" and the reason as a toast.

## 8. Shared-world interactions worth spelling out

| Situation | Rule |
|---|---|
| Two players gather the same node | both can, node `remaining` decrements per harvest server-side; when depleted mid-gather the later player gets the fizzle |
| Two players, same chest | both open it live; per-container sequence numbers resolve races (`15` §8); UI updates in place |
| Two players place at the same socket | first intent to reach the server wins; the loser is refunded with a toast |
| Sleeping | all present players get a consent prompt; any decline cancels (`20` §5) |
| Region discovery, fragments, journal | per-player, always |
| Befriended animals | belong to the island; any player can pet, only the befriender can rename |
| Visitor permission tiers, undo log | see `31` §3.5 |
| Pings and emotes | a radial wheel; pings place a temporary world marker all clients see |

## 9. Latency and quality targets

- Playable to 250 ms RTT; good to 120 ms. Region routing (`30` §7) keeps most sessions under 80 ms.
- Packet loss to 5% handled by the transport (WebSocket/TCP) — head-of-line blocking at our snapshot rate and size is acceptable; WebTransport/QUIC is a future upgrade, isolated behind the transport interface.
- A connection-quality indicator (three dots) appears only when RTT > 180 ms or a snapshot gap > 500 ms occurs — never a scary "LAG" banner.

## 10. Implementation steps (Phase 7 ordering)

1. Extract-verify: `pnpm --filter server sim-smoke` — the server package imports `@halcyon/sim` and runs 20k headless ticks. (This should already pass on day one of Phase 7; if it doesn't, Phases 1–6 broke the checklist.)
2. Transport interface on the client: `LocalTransport` (existing behaviour) and `WsTransport` behind one interface.
3. Server bootstrap: ws endpoint, HELLO/WELCOME, one hardcoded room, full snapshot on join.
4. Two browsers, one island, no prediction: watch each other move at 10 Hz (ugly but true).
5. Delta snapshots + change masks + quantisation.
6. Client prediction + reconciliation for local movement; the 100 ms corrective blend.
7. Remote-player interpolation at 150 ms; nameplates.
8. Intent revalidation server-side + the optimistic-UI fizzle path.
9. Shared containers with sequence numbers; the chest race test.
10. Join codes, sessions, permissions, undo log (`31`).
11. Persistence: debounced SQLite saves, hibernation, rejoin.
12. Pings, emotes, presence UI, sleep consent.
13. Bandwidth/latency CI harness with simulated RTT and loss.
14. Region routing + protocol version negotiation (`30` §7).

## 11. Testing requirements

- **The desync test (critical, T3-adjacent):** a scripted 4-client session (server + 4 headless clients in one Node process with simulated 100 ms RTT, 2% loss) runs 30 in-game minutes of mixed play; assert the gameplay-state hash (excluding physics transforms) matches across server and all clients at every 1,000-tick checkpoint.
- Prediction: scripted input against a simulated 150 ms server; assert corrections stay under 2 cm p95 and the corrective blend never exceeds the visual threshold.
- The chest race, the socket race, the depleted-node race — each an explicit integration test.
- Join/leave/rejoin/hibernate-rehydrate cycles ×200 with no entity leaks and no item loss (T1 extended to multiplayer).
- Bandwidth assertion: steady-state ≤ 12 kB/s down per client on the scripted session.
- Chaos: kill the server mid-session; assert clients show the reconnect UI and rejoin cleanly against the persisted state, losing ≤ 5 s of progress.

## 12. Future expansion

- WebTransport/QUIC datagrams for transform updates (transport interface already isolates this).
- Owner-offline persistent islands ("visit while I'm away") — the architecture supports it; it is a *social* decision, deferred.
- Spectator/photo-visitor mode.
- Cross-island postcards/gifts (asynchronous, no live connection needed — very cozy, very cheap).
