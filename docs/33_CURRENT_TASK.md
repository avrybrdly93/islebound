# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `.github/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IN_PROGRESS

**BL-068 — `ComponentStore.ts` is 631 lines against a 500-line hard limit.**
Phase 0 · Size S · Depends on: — · Docs to read: 05, 06.

## Why this task

`AI_DEVELOPMENT_WORKFLOW.md` §2 says the topmost unblocked task in the current
phase's Ready list. Working down it:

- **BL-056** is still **Phase 1** and so still not a candidate under phase
  discipline — ninth session running. Unchanged.
- **BL-067** is skipped **on its own instruction**, not on this session's
  judgement: its notes say "**Not urgent, and it should not be taken before
  `23` has a shape.**" `23_SAVE_SYSTEM.md` still describes no format that a
  name-to-def table would serve, so the item's stated precondition is unmet
  and taking it would be inventing a registration mechanism to fit a save
  format nobody has written. The previous handoff reached the same reading.
- **BL-068** is therefore the topmost item that is actually ready.

## Plan

1. Split `sim/ecs/ComponentStore.ts` at its two natural seams into three
   files, moving each module-comment section with the code it describes.
2. Split `ComponentStore.test.ts` (701 lines — over the same limit, and more
   over it than the source) along the same seams.
3. Update the `@sim/*` imports in all four consumers. No barrel file.
4. Verify: `pnpm lint`, `pnpm typecheck`, `pnpm test:node`. Test count must be
   **unchanged at 342** — this is a move, so a changed count means content was
   lost or duplicated.
5. Decide the `max-lines` question the item raises, and record the decision
   with the measurement behind it.

## The seams, and why these two

`ComponentStore.ts` holds four things (the item names them). The two seams:

- **`ComponentDef.ts`** — the *vocabulary*: the `componentValue` brand,
  `ComponentDef<T>`, `defineComponent`, and the three interfaces (`Store<T>`,
  `EntityScopedStore`, `ErasedStore`). These are what a component *is* and
  what a store *offers*, and they are what every consumer imports as types.
  They mention no storage layout.
- **`ComponentRegistry.ts`** — *which stores exist*, as against what one
  holds. The item already identifies this as the obvious seam.
- **`ComponentStore.ts`** keeps the sparse set itself, which is where the
  layout, the recycled-index trap, the ascending-order trap and the
  destroyed-handle rule all live.

The dependency direction is clean and acyclic: `ComponentRegistry` → both,
`ComponentStore` → `ComponentDef`, `ComponentDef` → `EntityAllocator` only.

## Baseline at session start

`pnpm lint` clean, `pnpm typecheck` clean, `pnpm test:node` **342 pass / 0
fail / 0 todo**.

## Everything below is prior handoff state, still current

The standing question the previous handoffs raised is unchanged: several `S`
items sit ahead of **BL-008**, the `M` the phase is actually for, and none of
them blocks it. If a human wants BL-008 pulled forward, the way to do it is to
reorder the Ready list, which is the mechanism §2 describes. A session should
not do it by reinterpretation.

BL-066's two standing notes for a later session remain true and untouched by
this task:

1. **A save pass can write itself out and cannot read itself back in.** That
   asymmetry is deliberate: `ErasedStore` has no `set`, because `set` is the
   one member contravariant in the component's `T` and an erased one would
   accept any component's value into any store. Loading goes through
   `ComponentRegistry.store(def)` with a real def, so the load side needs a
   name-to-def table — **BL-067**, and nothing owns one today. **The trap is
   that the write side works**, so a session could build an entire serialiser
   before meeting the missing half.

2. **`@ts-expect-error` suppresses the compile error and still runs the code.**
   BL-066's first draft wrote `erased.set(entity, at(1))` under one; it
   typechecked *and wrote a component*, making the next assertion in the same
   test claim the opposite of the truth. Read the property, do not call the
   method, when what you mean to assert is that the method is absent.
