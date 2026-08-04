# 37 — Network Protocol

Purpose: the wire format between client and server. Companion to `36_MULTIPLAYER_ARCHITECTURE.md`. The protocol lives in `packages/shared/src/protocol/` so both sides compile against the same definitions.

---

## 1. Transport and framing

- **WebSocket over TLS (`wss`)**, binary frames (`ArrayBuffer`). One connection per client per room.
- Every message: `[u8 opcode][payload…]`. Payloads are hand-written binary codecs — no protobuf/msgpack dependency; our message set is small and stable, and hand-rolled codecs with explicit bounds checks are also our DoS defence (`31` §3.4).
- Byte order: little-endian throughout. All multi-byte reads go through a `Reader` class that bounds-checks every access and throws a single `DecodeError` (which closes the connection).
- Max message size: 4 KB client→server, 64 KB server→client (full snapshots are chunked above that).

## 2. Version negotiation

`PROTOCOL_VERSION` is an integer in `shared/protocol/version.ts`, bumped on **any** wire-format change. HELLO carries it; mismatch → `ERROR {code: 'protocol', serverVersion}` and the client shows "update available — reload". Servers additionally accept version N−1 for 7 days after a deploy (`30` §7) by keeping the previous codec module alongside.

## 3. Opcode table

### Client → Server

| Op | Name | Payload | Rate |
|---|---|---|---|
| 0x01 | HELLO | protocolVersion u16, playerKey 16B, islandId 8B, joinCode 6B, contentHash 8B | once |
| 0x02 | INTENTS | seq u32, count u8, then packed intents | ≤ 30 Hz |
| 0x03 | ACK | lastSnapshotId u32 | 10 Hz |
| 0x04 | PING | clientTimeMs f64 | 1 Hz |
| 0x05 | LEAVE | — | once |
| 0x06 | CHAT | length-prefixed UTF-8 ≤ 200 chars (post-validation) | limited |

### Server → Client

| Op | Name | Payload |
|---|---|---|
| 0x81 | WELCOME | protocolVersion u16, playerEntityId u32, tick u32, snapshot chunk count u8 |
| 0x82 | SNAPSHOT_FULL | chunkIndex u8, gzipped world slice |
| 0x83 | SNAPSHOT_DELTA | snapshotId u32, baseTick u32, entity count u16, then per-entity change-mask blocks |
| 0x84 | EVENTS | count u8, then packed sim events |
| 0x85 | PONG | clientTimeMs f64 (echo), serverTick u32 |
| 0x86 | PLAYER_JOINED / 0x87 LEFT | entityId u32, name (validated) |
| 0x88 | CORRECTION | seq u32, authoritative player state block |
| 0x89 | ERROR | code u8, optional detail string |
| 0x8A | KICKED | reason u8 |

## 4. Intent encoding

Intents are the discriminated union from `sim/intents/` with a per-variant codec:

```
[u8 intentType][variant-specific fields]
move:        dirX i8 (-127..127 normalised), dirZ i8, flags u8 (sprint|jump|crouch bits)
interact:    target u32
gatherStart: target u32
craft:       recipeIdx u16, station u32 (0 = none), count u8
buildPlace:  pieceIdx u16, posX u16, posY u16, posZ u16 (quantised cm within island bounds), rotY u8 (1/256 turn), variant u8
inventoryMove: fromContainer u32, fromSlot u8, toContainer u32, toSlot u8, count u8, containerSeq u32
…
```

- **Content indices, not strings, on the wire.** `recipeIdx`/`pieceIdx`/`itemIdx` index into the content tables, whose order is part of `contentHash` (checked at HELLO), so both sides agree. Strings never cross the wire except validated player text.
- Movement is *input*, not position — the server integrates. The client never sends "I am at X".

## 5. Delta snapshot encoding

Per entity block:

```
[u32 entityId][u16 changeMask][component data for each set bit…]
bit 0 Transform     posX/Y/Z u16 quantised, rotY u8, state u8
bit 1 Velocity      vx/vy/vz i8 (0.1 m/s units)   — only for dynamic bodies
bit 2 ResourceNode  remaining u8, regrowFrac u8
bit 3 Growth        stage u8, wateredFlags u8
bit 4 Container     containerSeq u32 + changed slots [u8 slot][u16 itemIdx][u8 count]
bit 5 Structure     (placement/removal travel as EVENTS; this bit covers door/light state u8)
bit 6 Vitals        energy u8, warmth u8            — own player only
bit 7 AnimalState   behaviour u8, targetX/Z u16
…
[u32 0xFFFFFFFF] terminator; destroyed entities as [u32 id][mask 0x8000]
```

Quantisation matches `10` §3 (1 cm, 1/256 turn) so prediction comparison and wire format agree by construction.

## 6. Validation (server-side, every message)

1. `Reader` bounds checks (structural).
2. Semantic ranges: indices < table lengths, counts ≤ stack sizes, positions inside island bounds, container seq present.
3. Authorisation: actor owns the intent's player entity; room membership; permission tier for build/remove (`31` §3.5).
4. Game-rule validation: the same `validateIntent(world, intent, actor)` the client ran — this is the shared-`sim/` payoff.
5. Rate limits per `31` §3.4.

A failure at layers 1–2 closes the connection; at 3–5 it drops the intent and, where user-visible, sends the rejection event.

## 7. Testing requirements

- Round-trip property test: every intent and event variant encodes → decodes to a deep-equal value, 10k randomised instances each.
- Fuzz: 1M random/truncated/oversized buffers into every decoder — no crash, no hang, no allocation beyond bounds, connection-close semantics only (`31` §7).
- Cross-version: the N−1 codec still decodes fixture captures from the previous release.
- Bandwidth: encoded sizes of a scripted session match the budget in `36` §6.1; the test prints a per-opcode byte breakdown so regressions are attributable.
- `contentHash` mismatch fixture: client with a stale table is refused cleanly at HELLO.

## 8. Future expansion

- WebTransport datagrams for the Transform bit only (unreliable, latest-wins), keeping WebSocket for everything else.
- Snapshot compression with a shared dictionary if bandwidth ever matters (it should not at these sizes).
- A capture/replay tool that records server↔client traffic for bug reports.
