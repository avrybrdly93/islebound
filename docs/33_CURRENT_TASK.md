# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IN_PROGRESS — **BL-009 — Service registry and config**

Phase 0 · Size S · Depends on BL-001 (done) · Docs to read: 05 (plus 04, 06, 07
re-read this session).

Taken as the topmost unblocked item, which is what the previous handoff said it
would be and what `32_BACKLOG.md`'s own order says independently. BL-085,
BL-086, BL-087 and BL-088 were left: the handoff's replacement instruction is
that **BL-009, BL-010 and BL-011 are three small feature items in a row and
taking them in order is what moves Phase 0**, and nothing here is a choice
against that paragraph.

**Baseline measured before the first line of code:** `pnpm install
--frozen-lockfile` (this container arrived with `node_modules` absent for the
**eleventh** session running), then `lint` 0, `typecheck` 0, `test`
**408/97** in 4.87 s — matching the previous session's close-out exactly.

## Acceptance criteria (from `32`)

1. Accessing an unregistered service throws a clear error naming the service
2. Config changes hot-reload in dev without a page refresh

## The one decision this task has to make before its first import

`04` §5's table is binding and says **`core → (nothing)`**. `05` §2 says
`core/Config.ts` holds "tunables, **loaded from content/config.ts**". Those two
sentences cannot both be obeyed by an import, and the previous handoff named
this as the next place the boundary would bite.

**It is settled the way BL-008 settled the same collision**: `core/` declares
the *shape* and the *port*, and the composition root supplies the *values*.
`Config.ts` never names `@content/*`; it takes a config object and a
hot-reload source as arguments. `shared/content/config.ts` is a data module
that imports nothing. This keeps `core → (nothing)` literally true and is why
criterion 2 is testable without a browser at all — the same reason BL-008's
clock is injected.

Recorded in `40_DECISION_LOG.md` as decision **0043**.

## Plan (written before the first line of code)

1. `core/Services.ts` — the explicit registry. `register`/`get`/`has`, typed
   over a caller-supplied service map, **no decorators and no magic**, per the
   backlog wording and `05` §2's "explicit service registry (no magic DI)".
   Criterion 1 lives here.
2. `core/Config.ts` — the typed config store. Holds a snapshot, hands it out
   frozen, and accepts a replacement from an injected `ConfigReloadSource`.
   Criterion 2's mechanism lives here.
3. `shared/content/config.ts` — the first real content table: the tunables
   themselves, and nothing else. Imports nothing, so the `content → (nothing)`
   rule holds too.
4. `core/viteConfigHost.ts` — the Vite adapter, mirroring
   `core/browserFrameHost.ts`: the only place in this task that names
   `import.meta.hot`, so `Config.ts` contains no bundler identifier and a
   reader can grep rather than trust.
5. Tests: `Services.test.ts` and `Config.test.ts`, each criterion demonstrated
   able to fail before it is trusted green (`35` §7).
6. Docs: `32`, `33`, `34`, `40`.

## Known in advance, so it is not discovered as a surprise

**The Vite adapter will land unexercised**, exactly as `browserFrameHost.ts`
did, because there is no composition root to call it and nothing that consumes
a tunable yet. That is BL-088's territory. Whatever this session cannot
observe gets written down rather than claimed — if criterion 2 ends up
demonstrated only against a scripted source, `34` says so in those words and a
follow-up is filed.

## What is red

Nothing.

The **`allocation.test.ts` 1-in-20 remains fixed rather than mitigated** —
BL-074's allowance of four sampling **intervals**, unchanged. **If it does go
red, the number in the message is the thing to read**: under 4 intervals is a
new phenomenon, well over it is a real allocation.
