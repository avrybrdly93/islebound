# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `.github/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IDLE

No task in progress. **BL-068 is complete** (2026-08-30) —
`sim/ecs/ComponentStore.ts` was 631 lines against the 500-line hard limit and
is now three files: `ComponentDef.ts` (159), `ComponentStore.ts` (360),
`ComponentRegistry.ts` (161). Its test file was **701** lines and is now three:
43 / 421 / 304. All three acceptance criteria met. Suite unchanged at
**342 pass / 0 fail** — which is the check that matters for a move. See
`34_DEVELOPMENT_LOG.md` 2026-08-30 (BL-068) and decision **0028**; its
**Surprises** are load-bearing, especially items 2 and 3.

## Next action for an agent

The topmost unblocked task in Phase 0's Ready list, per
`AI_DEVELOPMENT_WORKFLOW.md` §2.

**Read the file, do not trust this line.** `BL-056` still sits at the top of
Ready and is still **Phase 1**, so it is still not a candidate under phase
discipline — ninth session running. After it, the Phase-0 items in list order
are **BL-067**, **BL-069** (new, filed by this session), **BL-062**,
**BL-063**, **BL-065**, then **BL-008**.

**BL-067 is still the one to skip, and skip it on its own instruction rather
than on your judgement.** Its notes say "**Not urgent, and it should not be
taken before `23` has a shape**", and `23_SAVE_SYSTEM.md` still describes no
save format that a name-to-def table would serve. Building a registration
mechanism with no format to serve is a guess. That makes **BL-069** the
topmost-that-is-actually-ready — say so in the log, as this session did for
BL-068.

The standing question the previous handoffs raised is unchanged: **six** `S`
items sit ahead of **BL-008**, the `M` the phase is actually for, and none of
them blocks it. This session took the topmost anyway, because §2 is unusually
direct — *"Not the most interesting one — the topmost one; the ordering is how
the human steers."* If a human wants BL-008 pulled forward, the way to do it is
to reorder the Ready list, which is the mechanism §2 describes. A session
should not do it by reinterpretation.

## What BL-068 leaves for the next session

1. **BL-069 is the direct follow-on and it has a decision in it, not just
   work.** The 500-line limit is still unenforced. `max-lines` would have
   caught this drift, and it could not be switched on in BL-068 because three
   test files outside the split are over the hard limit — `World.test.ts`
   (547), `EventBus.test.ts` (533), `Rng.test.ts` (509) — and `Query.test.ts`
   (499) is **one line** under and will cross on the next case anyone adds.
   The measurement is in BL-069's notes.

   **The part worth thinking about before touching the config:** nine of the
   fourteen files over the *soft* limit are tests. A rule scoped to sources
   only would enforce the limit precisely where it is not being broken, and a
   rule that includes tests means splitting three suites that nobody has
   complained about. `29_TESTING_STRATEGY.md` has no opinion on test-file
   length. That is a question for a human as much as an agent — if you take it
   and reach a view, record it in `40` rather than in a config comment.

2. **An item names the file somebody noticed, not the worst one.** BL-068 was
   filed about a 631-line source file; its test file was 701 and went
   unmentioned. Fixing only what the item names would have left the larger
   violation in the same directory and closed the item honestly. Worth
   carrying: when a task is "this file is over a limit", measure the
   neighbourhood before deciding what the task is.

3. **A green suite does not verify a move.** A split that drops or duplicates
   a `describe` block still runs green — the remaining cases pass and nothing
   reports the missing ones. Record the count before and assert it after. It
   came out unchanged at 342 here, but the failure mode is silent.

4. **`ComponentRegistry.ts`'s doc comments reference `ComponentStore.prune`
   and `.remove` across a file boundary now.** They were kept rather than
   inlined, deliberately: the argument belongs with the method that embodies
   it, and duplicating it is how two copies drift. If a later change moves
   either method, those references need following.

## Still current from BL-066, untouched by this task

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
   method, when what you mean to assert is that the method is absent. Those two
   cases now live in `ComponentRegistry.test.ts`.
