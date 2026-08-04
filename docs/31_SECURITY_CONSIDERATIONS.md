# 31 — Security Considerations

Purpose: the threat model and the concrete defences. A cozy single-player game has a small attack surface; adding multiplayer, user-generated content (island names, signs, player names) and a server enlarges it considerably.

---

## 1. Threat model

| # | Threat | Impact | Phase |
|---|---|---|---|
| T1 | XSS via player-authored text (names, sign text, island names) | account/session compromise, defacement | 5 (signs) / 7 |
| T2 | Malicious save file import | arbitrary state, potential prototype pollution or DoS | 2 |
| T3 | Cheating in multiplayer (item duplication, teleport, infinite resources) | ruins others' islands, spoils trust | 7 |
| T4 | Griefing (destroying a host's builds, stealing chests) | emotional harm, the opposite of cozy | 7 |
| T5 | Server DoS (connection floods, oversized messages, expensive operations) | outage | 7 |
| T6 | Data loss / island theft (accessing another player's island) | catastrophic for trust | 7 |
| T7 | Supply-chain compromise (a malicious npm dependency) | full client compromise | all |
| T8 | Dependency/WASM exploitation | client compromise | 1 |
| T9 | Abusive content in shared spaces (names, signs, chat) | harm to players | 7 |

Explicitly **not** in the threat model: protecting the client binary from reverse engineering, preventing single-player cheating (it is the player's island; let them), DRM.

## 2. Client-side defences

### 2.1 Content Security Policy
Strict CSP as specified in `30_DEPLOYMENT.md` §4. No inline scripts, no `eval` (except `wasm-unsafe-eval` for Rapier), `object-src 'none'`, explicit `connect-src` allow-list.

### 2.2 No `innerHTML` with dynamic content
React escapes by default. `dangerouslySetInnerHTML` is banned by lint with no exceptions. All player-authored text renders as text nodes.

### 2.3 Player-authored text handling
Everywhere a player can type text that another player might see (player name, island name, sign text, pet names, chat):

- Length caps: name 20, island name 32, sign 120, pet name 16, chat message 200.
- Character allow-list: Unicode letters, marks, numbers, spaces, and a small punctuation set. Reject control characters, bidi overrides (`U+202A`–`U+202E`, `U+2066`–`U+2069`), zero-width characters, and combining-mark stacks over 3 deep (Zalgo).
- Normalise to NFC before storage and comparison.
- Rendered as plain text with `white-space: pre-wrap`; never parsed as markup.
- Validated **server-side** in multiplayer, not just client-side.

### 2.4 Save file import (T2)
Imported files are untrusted input:
- Size cap 20 MB before decompression, 100 MB after (a zip-bomb guard on the decompression stream).
- Parsed with `JSON.parse` into a plain object, then **validated field by field** against the schema. Unknown fields are dropped, not merged.
- Guard against prototype pollution: reject any object containing `__proto__`, `constructor` or `prototype` keys during traversal; build the loaded world by explicit field assignment, never `Object.assign(target, untrusted)`.
- Numeric fields clamped to sane ranges (positions within world bounds, counts within stack sizes, ticks non-negative and below a maximum). A save claiming 2^53 wood is rejected rather than accepted.
- Import replaces into a *new* slot with a confirmation, never overwriting an existing save silently.

### 2.5 Storage
- `localStorage` holds only settings. IndexedDB holds saves. Neither holds credentials.
- No cookies at 1.0 in single player. Multiplayer session tokens are stored in memory plus a `Secure; HttpOnly; SameSite=Lax` cookie set by the server, never readable from JS.

## 3. Server-side defences (Phase 7)

### 3.1 The fundamental rule
> **The server never trusts the client. Ever.**

The client sends *intents*, not state. It says "I want to craft recipe X", never "my inventory is now Y". Every intent is re-validated against the server's authoritative world using the exact same `sim/` code the client runs — which is why `sim/` must remain browser-free (see `04_TECHNICAL_ARCHITECTURE.md` §5).

### 3.2 Anti-cheat by construction (T3)

| Cheat | Defence |
|---|---|
| Item duplication | server-authoritative containers, per-container sequence numbers, staged transactions (`15_INVENTORY_SYSTEM.md` §8) |
| Infinite resources | node state is server-side; harvest intents validated against `remaining` and cooldowns |
| Teleport / speed hack | movement intents validated: max displacement per tick (with a tolerance for latency), terrain height check, collision check server-side. Excess → snap-back correction, logged |
| Crafting without materials | server re-runs the same validation |
| Placing outside limits | server re-runs placement rules |
| Fishing rigging | fish selection rolled server-side from a server-held seed; the client only renders the outcome |
| Speeding up time | time is server-authoritative |
| Packet flooding | rate limits (§3.4) |

Detection philosophy: **snap back and log, do not ban.** This is a cooperative game among friends; the realistic threat is a curious player with dev tools, not an economy exploiter. Repeated violations disconnect the client with a clear message.

### 3.3 Authorisation (T6)
- Islands have an owner (a stable player key derived at first play, stored client-side, backed by a server-issued token).
- Joining requires a **6-character join code** (from an unambiguous 32-character alphabet, ~1 billion combinations), rotatable by the owner at any time, and optionally single-use.
- Every message handler checks that the connection is authorised for the room it addresses. Room membership is checked on every intent, not just at join. There is no global broadcast channel.
- Session tokens: signed, 24-hour expiry, bound to the island and player key.

### 3.4 Rate limiting and DoS (T5)
- Per-connection: 60 intents/second (well above normal play, which peaks near 35), 4 KB max message size, 200 messages/second hard kill.
- Per-IP: 10 connection attempts/minute, 5 concurrent connections.
- Per-room: 8 players max; join attempts with a wrong code rate-limited to 5/minute per IP with exponential backoff.
- Expensive operations (world save, interior flood fill, large builds) are debounced and queued server-side with a per-room budget.
- Message parsing: fixed-size binary decoding with explicit bounds checks; length-prefixed fields validated before allocation. A malformed message closes the connection rather than throwing into a handler.
- Fly.io provides basic network-level DDoS protection; application-level limits above are ours.

### 3.5 Griefing (T4)
Design-level, not just technical:
- **Permission tiers per visitor:** Guest (gather and fish only), Builder (place and remove their own pieces), Trusted (full build rights). Default is Builder. Set by the owner per player, changeable at any time.
- Removal of the owner's pieces requires Trusted.
- **An undo log:** every structure change in a session is recorded with actor and time; the owner can roll back a visitor's changes for the last 7 days from a simple UI. This is the real defence — social problems are solved by reversibility, not prevention.
- Chests can be marked private by the owner.
- Kick and ban per island, immediate, no appeal process needed at this scale.

### 3.6 Abusive content (T9)
- Chat is opt-in per island and off by default; the primary communication channel is emotes and pings.
- Names and sign text validated as in §2.3; a report button that captures the offending text, actor and island, sent to a moderation inbox.
- No global chat, no matchmaking with strangers, no public island browser at 1.0. **The best defence against harassment is not building the systems that enable it.**

## 4. Supply chain (T7)

- Minimal dependency list (`04_TECHNICAL_ARCHITECTURE.md` §3), each justified. New runtime dependencies require human approval — this is a security control, not only a bundle-size one.
- `pnpm` with a committed lockfile; `--frozen-lockfile` in CI.
- Dependabot/Renovate for security updates only, reviewed by a human, never auto-merged.
- `pnpm audit` in CI; high-severity findings block.
- Post-install scripts disabled by default (`enable-pre-post-scripts=false`) with an explicit allow-list.
- Pin exact versions for `three` and `@dimforge/rapier3d-compat`; upgrades are deliberate, tested changes with bench and visual regression runs.

## 5. Privacy

- No tracking, no advertising, no third-party analytics, no fingerprinting.
- Error reports contain no player-authored content, no save data, no positions — stack trace, version, browser, GPU string only.
- Optional anonymous performance metrics, off by default, with a plain-language explanation of exactly what is sent.
- Multiplayer stores: island data, player keys, island names, and connection logs (IP + timestamp, retained 14 days for abuse handling). Documented in a short, readable privacy page.
- No accounts, no email addresses, no passwords at 1.0. Nothing to breach.

## 6. Implementation steps

1. CSP headers + the `dangerouslySetInnerHTML` lint ban (Phase 0).
2. Text validation utilities with the allow-list, length caps and bidi/zero-width stripping (Phase 2; used by signs in Phase 4).
3. Save import validation: size caps, prototype-pollution guards, field-by-field validation, range clamping (Phase 2).
4. Dependency policy in CI: audit, lockfile check, post-install script blocking (Phase 0).
5. (Phase 7) Server-side intent revalidation using shared `sim/` code.
6. (Phase 7) Join codes, session tokens, per-message authorisation.
7. (Phase 7) Rate limits and binary decode bounds checking.
8. (Phase 7) Movement validation and snap-back.
9. (Phase 7) Permission tiers, undo log, kick/ban, private chests.
10. (Phase 7) Report flow and moderation inbox.

## 7. Testing requirements

- Unit: text validation rejects a fixture set of 60 malicious strings (XSS payloads, bidi overrides, zero-width, Zalgo, control characters, oversized) and accepts a fixture set of 40 legitimate international names.
- Unit: save import rejects prototype-pollution payloads, zip bombs, out-of-range numbers and malformed structures — with a fixture file per attack.
- Unit: no code path passes untrusted strings into `innerHTML` (a lint rule plus a grep test).
- (Phase 7) Integration: a scripted cheating client attempting duplication, teleport, crafting without materials, and harvesting a depleted node is correctly rejected in every case, with no server state change.
- (Phase 7) Integration: rate limits trigger at the specified thresholds and recover correctly.
- (Phase 7) Integration: a Guest cannot remove the owner's structures; a Builder cannot remove another player's; the undo log restores exactly.
- (Phase 7) Fuzz: random bytes and truncated messages into the protocol decoder for 1M iterations — no crash, no unbounded allocation, connection closed cleanly.
- CI: `pnpm audit` gate; header verification against the deployed site.

## 8. Future expansion

- Optional accounts for cross-device saves — this is the single largest security scope increase available, and should not be undertaken casually.
- Signed content packs if mod support ever ships.
- A public island directory would require real moderation tooling; treat it as a product decision with a staffing implication, not a feature.
