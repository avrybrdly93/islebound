# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IN_PROGRESS — BL-065

**`QueryCache.query` takes the bottom of the def family, so every direct caller
casts.** Phase 0 · Size S · Docs to read: 04. Claimed 2026-09-06.

Selected as the topmost unblocked Phase-0 Ready item, per
`AI_DEVELOPMENT_WORKFLOW.md` §2. The two items above it in list order are both
skipped on their own recorded instruction rather than on judgement: **BL-056**
is a Phase-1 item and phase discipline excludes it (fifteenth session running),
and **BL-067** presumes a component-level save format that `23_SAVE_SYSTEM.md`
still does not define — re-checked with the grep the previous handoff names,
`EntitySave` appears once (§2, line 38) and is defined nowhere.

## Acceptance criteria (from `32_BACKLOG.md`)

- [ ] `QueryCache.query` accepts any `ComponentDef<T>` with no cast at the call site
- [ ] `World.query`'s cast and `Query.test.ts`'s `anyDef<T>` helper are both deleted
- [ ] `AnyComponentDef` is either re-pointed or removed; if it stays, its doc says
      which position it is for

## Plan

1. Re-point `AnyComponentDef` from `ComponentDef<never>` to `ComponentDef<unknown>`
   and state in its doc which position it is for — the widening decision 0027
   already settled one level up, applied here.
2. Follow the type through `QueryCache`'s private surface: `defIds`,
   `signatureIds`, `storesFor` and `CachedQuery.stores` all mention `never`
   today and must move with it.
3. Delete `World.query`'s erasing cast.
4. Delete `anyDef<T>` from **`Query.test.ts` and `Query.limit.test.ts`** — the
   criteria name only the first, and the second carries its own copy, so
   deleting only the named one leaves the helper alive next door.
5. Add coverage that the widening is real rather than incidental: a def of a
   concrete type reaching `query` with no assertion, and a `@ts-expect-error`
   pinning that the *wrong* direction (`unknown` into a typed slot) still fails.
6. Verify: `pnpm lint && pnpm lint:rules && pnpm lint:docs && pnpm typecheck && pnpm test`.
   Suite count is the check that matters — a changed count on a type-only change
   means a case was lost.

## What this task is not

Not a change to `ComponentDef` itself, to `ComponentRegistry.store`, or to
`ErasedStore` — decision 0027 already settled the level above and says in as
many words that it does not solve this one. Applying a decided principle, not
making a new decision.

`Query.test.ts` is at **499 of 500 lines** and `max-lines` is an `error`
(decision 0029). Deleting `anyDef` shortens it, so there is room; anything that
*adds* to that file does not.
