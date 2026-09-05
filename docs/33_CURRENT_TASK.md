# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IN_PROGRESS — BL-065

**`QueryCache.query` takes the bottom of the def family, so every direct caller
casts.** Phase 0 · Size S · Docs to read: `04`. Claimed 2026-09-05 before any
code.

### Selection, verified rather than inherited

`AI_DEVELOPMENT_WORKFLOW.md` §2 says the topmost unblocked task in the current
phase's Ready list. Walked the list in `32` in order:

| item | verdict |
|---|---|
| BL-056 | **Phase 1**, not a candidate under phase discipline. Fifteenth session running |
| BL-059, BL-066, BL-068, BL-069 | done |
| BL-067 | skipped **on its own instruction** (*"should not be taken before `23` has a shape"*), re-checked with the grep the previous handoff names: `23_SAVE_SYSTEM.md` mentions `EntitySave` exactly once, at §2 line 38, and defines it nowhere — so its first criterion still presumes a component-level format that does not exist |
| **BL-065** | **topmost actually ready** |

### The decision, made before coding

Criterion 3 offers two answers for `AnyComponentDef`: re-point it, or remove
it. **Taking removal.**

The alias exists to name the erased-def parameter type. Once it is re-pointed
it becomes an alias for `ComponentDef<unknown>` — which is the spelling
`World.query` **already uses in its own signature**, written out in full. Two
names for one type in two adjacent modules is the drift this repository keeps
filing items about, and the alias would no longer be earning the hop it costs
a reader. Removing it also makes the two signatures visibly identical, which
is the actual content of this change: `World.query` stops being a widening
wrapper and becomes a plain delegation.

Not a new decision, so no `40` entry: decision **0027** already chose this
widening one level up for `ErasedStore` and recorded why it is sound — every
member a query uses is covariant in `T`, so a `ComponentDef<T>` satisfies the
widened type structurally with no assertion. 0027 also says in as many words
that it does not solve BL-065. This is that principle applied, not a second
choice of direction.

### The third call site the criteria do not name

`Query.limit.test.ts` (added by BL-063) carries **its own copy** of the
`anyDef<T>` helper, at lines 34–35. The criteria name only `World.query`'s cast
and `Query.test.ts`'s helper, so deleting exactly what is listed would leave the
helper alive next door and the task half done. Both copies go.

### Plan

1. `AnyComponentDef` deleted from `Query.ts`; every internal use becomes
   `ComponentDef<unknown>`, and the internal `ComponentStore<never>`
   annotations become `ComponentStore<unknown>` to match what
   `ComponentRegistry.store` now returns.
2. `QueryCache.query` takes `readonly ComponentDef<unknown>[]`.
3. `World.query`'s erasing cast and its explanatory comment deleted; the
   comment is replaced by a much shorter one, since the thing it explained no
   longer exists.
4. Both `anyDef<T>` helpers deleted, and their call sites pass defs directly.
5. A test that would have failed before the change: a `ComponentDef<T>` for a
   non-`never` `T` reaching `QueryCache.query` with no cast. Type-level, since
   nothing about the *runtime* behaviour changes.
6. Verify, document, hand off.

### What this must not become

Nothing about runtime behaviour changes — this is a parameter type and three
deleted casts. **The suite count is the check that matters**: it should move by
exactly the cases added in step 5 and by nothing else (BL-068's Surprise 3).
`Query.test.ts` is at 499 of 500 lines, so step 5's cases go in
`Query.limit.test.ts` or a new file, never into `Query.test.ts` — decision 0029
is explicit that the limit biting is the rule working. Deleting `anyDef` frees
lines in both, which is headroom, not an invitation.
