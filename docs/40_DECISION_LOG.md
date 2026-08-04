# 40 — Decision Log

Append-only record of architecturally or design-significant decisions: what was decided, the alternatives, and why. Referenced from other docs as `DECISION_LOG NNNN`. When an agent or human is tempted to relitigate a choice, the answer starts here.

**Format:**

```markdown
## NNNN — Title (YYYY-MM-DD)
**Status:** accepted | superseded by NNNN | rejected-idea
**Context:** the situation and forces at play
**Decision:** what we chose
**Alternatives:** what we did not choose, and the honest cost of our choice
**Consequences:** what this commits us to
```

---

## 0001 — Simulation separated from presentation, deterministic and headless (pre-dev)
**Status:** accepted
**Context:** AI-agent-driven development needs machine-verifiable gameplay; multiplayer needs server-side rules; saves need serialisable truth.
**Decision:** `sim/` is pure (no three.js/DOM/`Math.random`/wall-clock), fixed 30 Hz, intent-in/event-out, hashable. Enforced by lint + CI.
**Alternatives:** game state on three.js objects (fast to start, unhashable, untestable, unnetworkable); 60 Hz sim (2× CPU for no perceptible gain with interpolation).
**Consequences:** one indirection per entity per frame; every feature designed as intents/events; the single most protected invariant in the repo.

## 0002 — Multiplayer designed from day 1, implemented in Phase 7
**Status:** accepted
**Context:** retrofitting networking onto a single-player architecture is the standard death of projects this shape; but building netcode first starves the game of content for a year.
**Decision:** the `36` §4 network-safe checklist applies to every Phase 1–6 feature; the server reuses `sim/` verbatim; transport is swapped, not the game.
**Alternatives:** MP-first (momentum death); SP-only then rewrite (architecture death); lockstep (Rapier non-determinism, late-join cost).
**Consequences:** mild ongoing tax on every feature review; Phase 7 becomes an integration project instead of a rewrite.

## 0003 — Client–server authoritative; no P2P, no lockstep
**Status:** accepted — see `36` §2 for the full argument.
**Consequences:** we operate a server (`38`); the cost envelope must stay hobby-scale.

## 0004 — Content is data (`as const satisfies` TS tables), no runtime schema library
**Status:** accepted
**Context:** content must scale without code changes; zod et al. add a dependency to validate data we author in TS and already type-check.
**Decision:** typed const tables + hand-written guards only at untrusted boundaries (saves, network).
**Alternatives:** JSON + zod (runtime cost, dependency, worse editor support); a CMS (absurd at this scale).
**Consequences:** content edits are code PRs (fine — they get CI); guards must be maintained by hand at the two boundaries.

## 0005 — Rapier3D, used narrowly; physics excluded from the authoritative hash
**Status:** accepted
**Context:** hand-rolling a character controller is weeks of bug-tail; but Rapier is not bit-deterministic across architectures.
**Decision:** Rapier for collision + character controller + ≤40 dynamic bodies; gameplay outcomes never depend on precise physics; positions quantised (1 cm) for save/wire; server physics is truth in MP.
**Alternatives:** cannon-es (unmaintained), ammo (huge), custom (expensive), full determinism via fixed-point (enormous cost for a co-op builder).
**Consequences:** `worldHash()` covers game rules, not float transforms; the desync test asserts gameplay-state equality only.

## 0006 — One authored island, guided generation, pinned seed
**Status:** accepted
**Context:** procedural-infinite conflicts with "a place you know"; pure hand-modelling is a different (larger) project.
**Decision:** 512 m island from control map + seed `0x48414C43`; landmarks hand-placed; everyone plays the same island.
**Alternatives:** per-player seeds (kills shared conversation, multiplies QA surface); multiple islands (post-1.0 at most).
**Consequences:** worldgen changes need the generator-version migration path (`23` §5); the island can be *learned*, which the whole design leans on.

## 0007 — Gravity −18 m/s², not −9.81
**Status:** accepted
**Context:** real gravity at our character scale and jump height reads as floaty and slow.
**Decision:** −18 with a 1.15 m fixed jump, coyote 0.12 s, buffer 0.12 s.
**Consequences:** all airborne tuning derives from this; changing it invalidates the movement checklist results.

## 0008 — No tool durability
**Status:** accepted
**Context:** durability creates maintenance chores and inventory anxiety; its pacing function is already served by tool *tiers*.
**Alternatives:** slow durability with cheap repair (still a chore, just a small one).
**Consequences:** tools are one-time crafts; progression pressure lives entirely in gates and recipes.

## 0009 — No crop quality tiers; crops never die
**Status:** accepted
**Context:** quality tiers add min-max pressure without feeling; withering punishes absence, violating C2.
**Consequences:** farming's ceiling is expression and cooking variety, not optimisation — accepted deliberately.

## 0010 — No free terrain digging; foundations flatten only
**Status:** accepted
**Context:** free terraforming breaks the authored silhouette, complicates colliders/streaming, and bloats saves.
**Decision:** the only terrain edit is foundation flattening with restore-on-removal (`13` §7).
**Alternatives:** voxel or heightmap brush editing (a different, much larger game).
**Consequences:** building expression is additive (structures) rather than subtractive; save stays tiny.

## 0011 — No structural integrity; "if it snaps, it stands"; no cascade on removal
**Status:** accepted
**Context:** integrity simulation punishes experimentation and produces the least-cozy moment possible (your house collapsing).
**Consequences:** floating pieces are legal; the art direction absorbs it (chunky style reads as intentional).

## 0012 — 100% refund on removal, always
**Status:** accepted — cozy contract C6; property-tested (T2).
**Consequences:** no material sink from building; economy pressure must never be balanced against refunds.

## 0013 — Recipe discovery is legible (unlock rules), not experimental
**Status:** accepted
**Context:** combine-to-discover is charming but opaque; it violates the Legibility value when a player misses core recipes.
**Consequences:** the unlock graph is the de-facto quest system and is reachability-tested (T7).

## 0014 — Weather is deterministic from (seed, day, hour)
**Status:** accepted
**Context:** determinism gives free multiplayer agreement, free offline catch-up honesty, and testability.
**Alternatives:** random weather synced over the wire (state to sync, histories to reconcile).
**Consequences:** weather cannot react to player actions (acceptable — no design wanted it to).

## 0015 — Sleep fast-forwards time (200×), never jumps
**Status:** accepted
**Context:** a jump requires bespoke catch-up logic per system, which drifts from real behaviour.
**Decision:** sleeping runs the actual simulation quickly; T9 asserts hash-equality with playing through.
**Consequences:** systems must be efficient at large tick throughput (bucketing everywhere) — a constraint that also bought us fast offline catch-up.

## 0016 — JSON+gzip saves in IndexedDB; verify-before-promote; rolling backups
**Status:** accepted — see `23` §2–4 for the argument (debuggability over bytes at these sizes).
**Consequences:** revisit binary only if saves exceed 5 MB.

## 0017 — React DOM overlay for UI; per-frame HUD on a 2D canvas; no state library
**Status:** accepted
**Context:** DOM UI is accessible and agent-writable; React must never run per frame.
**Alternatives:** in-engine UI (accessibility cost, huge effort), zustand/redux (unneeded for ~10 tiny stores).
**Consequences:** the store pattern (`24` §1) is the only sanctioned UI state mechanism.

## 0018 — Cloudflare Pages + Fly.io; not Vercel Hobby
**Status:** accepted
**Context:** Vercel's Hobby tier prohibits commercial use; Pages permits it with unlimited bandwidth; Fly gives cheap regional VMs with volumes for SQLite.
**Consequences:** deployment tooling targets these two; the cost envelope in `38` §8 depends on them.

## 0019 — Hand-rolled binary protocol; content indices on the wire
**Status:** accepted
**Context:** the message set is small; codecs double as DoS bounds-checking; protobuf/msgpack add dependency and schema tooling for no gain here.
**Consequences:** every wire change bumps `PROTOCOL_VERSION` and maintains the N−1 codec for 7 days.

## 0020 — No accounts, no analytics, no global social surface at 1.0
**Status:** accepted
**Context:** accounts are the largest security/scope cliff available; behavioural analytics conflicts with the project's stance; public social spaces require moderation staffing.
**Consequences:** cross-device saves are manual export/import at 1.0; the harassment surface is structurally near zero.

## 0021 — Subdomain hosting, not a subpath under avesstudios.com
**Status:** accepted
**Context:** the intended URL was `avesstudios.com/islebound`, but avesstudios.com is hosted on Vercel/Netlify. Cloudflare Pages attaches custom domains at a hostname, never a path, so a subpath requires proxying the game through the main site's host.
**Decision:** the game is served from `islebound.avesstudios.com` (a CNAME to Cloudflare Pages). `avesstudios.com/islebound` becomes a landing page on the existing site with a Play link.
**Alternatives:** proxying via Vercel/Netlify rewrites (throws away Cloudflare's unlimited bandwidth — the reason it was chosen in `30` §1 — and re-inherits Vercel Hobby's commercial-use prohibition; ~6,500 first-loads/month before the 100 GB free cap); moving DNS to Cloudflare plus a Worker on `avesstudios.com/islebound*` (works, but adds a moving part to a one-person operator's incident surface for a cosmetic URL).
**Consequences:** the game gets its own origin, so IndexedDB saves cannot be squeezed out of quota by anything else deployed under avesstudios.com — which matters given how much of `23` exists to protect saves. Marketing URL and artefact URL differ.

## 0022 — Trunk-based development, single environment
**Status:** accepted
**Context:** `30` was originally written with staging and production tiers, which suits a launched game with players. There are no players until 1.0, and the operator is one person.
**Decision:** `main` is production, deployed on every merge. No staging tier, no tag-triggered deploys. Tags mark phase completions as records only. PRs on `phase-N/*` branches retain the CI gate and per-PR preview URLs.
**Alternatives:** keeping two Pages projects (a second environment to maintain and reason about, for a benefit that does not exist pre-launch).
**Consequences:** nothing catches a change that passes CI and the smoke test but is subtly wrong until it is live — acceptable with no players, not acceptable after 1.0. Mitigations are the blocking Playwright smoke test and Cloudflare's instant rollback. **Revisit at 1.0**: adding a `release` branch and a second Pages project is cheap then and is in the Icebox.

---

*(new decisions append below; next number: 0023)*
