# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `.github/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IDLE

No task in progress. **BL-069 is complete** (2026-08-31) — the 500-line hard
limit is now an ESLint error rather than a number in `CLAUDE.md` that nothing
checked. See `34_DEVELOPMENT_LOG.md` 2026-08-31 (BL-069) and decision **0029**;
the log's **Surprises** are load-bearing, especially item 1.

Suite unchanged at **342 pass / 0 fail / 88 suites**, before and after — which
is the check that matters when a change touches three test files.
`pnpm lint`, `pnpm typecheck`, `pnpm format:check` clean; `pnpm lint:rules`
5/5.

## Next action for an agent

The topmost unblocked task in Phase 0's Ready list, per
`AI_DEVELOPMENT_WORKFLOW.md` §2.

**Read the file, do not trust this line.** `BL-056` still sits at the top of
Ready and is still **Phase 1**, so it is still not a candidate under phase
discipline — tenth session running. After it, the Phase-0 items in list order
are **BL-067**, **BL-070** (new, filed by this session), **BL-062**,
**BL-063**, **BL-065**, then **BL-008**.

**BL-067 is still the one to skip, and skip it on its own instruction rather
than on your judgement.** Its notes say "**Not urgent, and it should not be
taken before `23` has a shape**", and `23_SAVE_SYSTEM.md` still describes no
save format that a name-to-def table would serve. Building a registration
mechanism with no format to serve is a guess. That makes **BL-070** the
topmost-that-is-actually-ready — say so in the log, as this session did for
BL-069 and the last one did for BL-068.

The standing question the previous handoffs raised is unchanged and is now in
its tenth session: **six** `S` items sit ahead of **BL-008**, the `M` the phase
is actually for, and none of them blocks it. Sessions keep taking the topmost
because §2 is unusually direct — *"Not the most interesting one — the topmost
one; the ordering is how the human steers."* **If a human wants BL-008 pulled
forward, the way to do it is to reorder the Ready list.** A session should not
do it by reinterpretation, and ten sessions of `S` items is the signal that
the list may want reordering rather than that the rule wants bending.

## What BL-069 leaves for the next session

1. **BL-070 is the direct follow-on, and its first question is not "how do I
   split these".** Three suites now carry `eslint-disable max-lines`:
   `World.test.ts` (547), `EventBus.test.ts` (533), `Rng.test.ts` (509).
   `Query.test.ts` is at **499** — one line under, crossing on the next case
   anybody adds. Before splitting anything, decide whether they *should* be
   split: `29_TESTING_STRATEGY.md` has no opinion on test-file length, and a
   suite that is long because it covers a lot may be better long than
   fragmented across files a reader has to reassemble. A documented exemption
   in `29` is an honest outcome; three mechanical splits may not be.

2. **If you do split, the failure mode is silent and BL-068 already paid for
   it.** A split that drops or duplicates a `describe` block still runs green
   — the remaining cases pass and nothing reports the missing ones. Record the
   count first (**342 pass / 88 suites** as of today) and assert it after.
   Follow BL-068's precedent for *where* to cut: the subject seams of the code
   under test, not a line count.

3. **The rule is on for everything and new files get no grace.** If a file you
   create crosses 500, the answer is to split it, not to add a fourth
   suppression. The three that exist are a tracked debt with a BL against them,
   not a pattern to follow.

4. **`skipComments: false` is deliberate and the fixture defends it.**
   `tools/lint-fixtures/over-max-lines.ts` is 501 lines of blanks and comments
   and its expectation asserts on the count in the message, so a well-meaning
   "let's not count comments" tidy-up takes `pnpm lint:rules` from 5/5 to a
   named failure rather than passing quietly. Decision 0029 says why: a rule
   that skipped comments would make deleting a file's explanation the cheapest
   way back under the limit.

5. **Generalised from this session's first surprise, and worth applying to any
   future lint work.** A rule can be switched on, look right in the config, and
   enforce nothing — and neither a green `pnpm lint` nor the config itself
   gives any signal. `eslint.config.js` already records the same trap for
   `boundaries` (its first version had no resolver, so a deliberate
   `core → sim` import passed). **Before choosing a rule's scope, measure what
   it catches on today's tree. If the answer is "nothing", find out whether
   that is because the code is clean or because the scope is wrong.**

## Still current from BL-066 and BL-068, untouched by this task

1. **A save pass can write itself out and cannot read itself back in.** That
   asymmetry is deliberate: `ErasedStore` has no `set`, because `set` is the
   one member contravariant in the component's `T`. Loading goes through
   `ComponentRegistry.store(def)` with a real def, so the load side needs a
   name-to-def table — **BL-067**, and nothing owns one today. **The trap is
   that the write side works**, so a session could build an entire serialiser
   before meeting the missing half.

2. **`@ts-expect-error` suppresses the compile error and still runs the code.**
   Read the property, do not call the method, when what you mean to assert is
   that the method is absent. Those two cases live in
   `ComponentRegistry.test.ts`.

3. **`ComponentRegistry.ts`'s doc comments reference `ComponentStore.prune`
   and `.remove` across a file boundary.** Kept rather than inlined
   deliberately — the argument belongs with the method that embodies it. If a
   later change moves either method, those references need following.

4. **An item names the file somebody noticed, not the worst one.** BL-068 was
   filed about a 631-line source whose test file was 701 and went unmentioned.
   When a task is "this file is over a limit", measure the neighbourhood
   before deciding what the task is.
