# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IDLE

No task in progress. **BL-070 is complete** (2026-09-03) — `tools/check-doc-commands.ts`
covers five documents instead of two, `README.md` and the two `tasks/*.md` say
which backlog item builds each command they name that does not exist, and the
scan no longer reads prose as a command. See `34_DEVELOPMENT_LOG.md`
2026-09-03 (BL-070); its **Surprises** 1 and 3 are load-bearing.

Suite unchanged at **342 pass / 0 fail across 88 suites**. That is the correct
outcome and not a gap: this task added no behaviour to test. The check *is* the
test, and it was graded by five perturbations instead.

## Next action for an agent

The topmost unblocked task in Phase 0's Ready list, per
`AI_DEVELOPMENT_WORKFLOW.md` §2.

**Read the file, do not trust this line.** In list order:

- **BL-056** is still **Phase 1** — not a candidate under phase discipline.
  Twelfth session running.
- **BL-067** is still the one to skip, **on its own instruction** rather than
  on your judgement. Re-checked this session with the one grep the previous
  handoff names: `23_SAVE_SYSTEM.md` mentions `EntitySave` exactly once (§2,
  line 38) and defines it nowhere, so there is still no *component-level*
  format, which is what BL-067's first criterion presumes.
- **BL-070** — done, this session, and moved to Done rather than marked in
  place (BL-062's precedent; the Ready list still carries four older items
  marked `**DONE**` in place, which is an inconsistency in the file, not a
  second convention to copy).
- **BL-063** is now the topmost that is actually ready.

Then **BL-065**, then the two items this session filed — **BL-072**, **BL-073**
— then **BL-008**.

## Why BL-063 is a reasonable next task, and the trap in it

BL-063 is `QueryCache` having no eviction. Its own notes contain the answer it
is most likely to be over-engineered against: **`World` owns the cache's
lifetime** — one `QueryCache` per `World`, constructed with it, unreachable
from outside — so *"the world owns it and it dies with the world"* is an
available answer rather than a hypothesis, and has been since BL-061 landed.

The criteria allow that answer explicitly: *either* an eviction policy exists
*or* `World.query` is documented as accepting only statically-known signatures
and something checks it. **Criterion 2 is the one that bites** — whichever is
chosen, the other must be named in a comment with why it was not. An LRU
invented without a caller that needs one is the scope expansion `35` §3
forbids; so is a checker nobody asked for. Decide, then write down what you
rejected.

## The standing question, unchanged

**Five** `S` items now sit ahead of **BL-008**, the `M` the phase is actually
for, and none of them blocks it. BL-070 closed one and filed two, so the count
went *up* by one. Sessions keep taking the topmost because §2 is unusually
direct — *"Not the most interesting one — the topmost one; the ordering is how
the human steers."* If a human wants BL-008 pulled forward, the way to do it is
to **reorder the Ready list**, which is the mechanism §2 describes. A session
should not do it by reinterpretation. This is the sixth handoff to say so, and
the first where the count moved the wrong way.

## What BL-070 leaves for the next session

1. **A check written against one kind of document acquires assumptions from
   it.** `check-doc-commands.ts` matched `pnpm <word>` anywhere on a line, and
   that was correct for two years' worth of agent-facing documents where every
   command sits in a fence or backticks. `README.md` says "pnpm workspace" as
   a plain noun phrase in its tech summary, and the check called it a missing
   script. The fix was to narrow the scan to code contexts. **The general
   form: when you widen what a check reads, the check's unstated assumptions
   about its inputs are the thing that breaks, not its logic.** This is BL-062's
   "a green lint does not verify a lint rule" and BL-069's before it, one turn
   further on.

2. **`UNBUILT_COMMANDS` now has three rows and still should shrink.** `sim` →
   BL-014, `check:bundle` → BL-018, `assets:build` → BL-071. When any of those
   lands, its row goes and the check keeps working with no other edit — the
   script will simply exist. **Whoever closes BL-014, BL-018 or BL-071 deletes
   the row in the same commit.** The third row is a different kind of promise
   from the first two: BL-071 is in the **Icebox**, so `assets:build` is not
   scheduled at all, and the row says so rather than implying a date.

3. **Perturb after committing, not before.** This session ran its perturbation
   sweep with the doc edits still unstaged, and `git checkout --` to undo each
   perturbation reverted the real work along with it. Nothing was lost — the
   edits were reapplied and the sweep re-run against the committed tree, and
   both runs agreed — but the second sweep is the one that means anything. If
   you are about to prove a check fails, commit the thing it is supposed to
   pass on first.

4. **Two things in `README.md` are false and were deliberately not fixed:**
   the "pre-implementation" status banner, and the `.github/AI_DEVELOPMENT_WORKFLOW.md`
   path that five documents cite and that does not exist. Both are **BL-073**.
   Not a ride-along (`35` §3), and the duplicate is the more dangerous half —
   the `.github/` copy is 81 lines against the real document's 89, is not
   covered by any check, and can rot silently.

## Still current from BL-062

1. **A clean clone needs `pnpm install` before anything, and the verify block
   still does not say so.** It belongs to **BL-021** (root documentation
   files), which owns a quick-start. BL-073 now overlaps BL-021 too; whoever
   takes BL-021 should absorb both.

2. **The annotation may sit in the command's paragraph or the one after it**,
   because a fenced block is explained by the prose beneath it. If you move one
   of those notes further from its block, the check will tell you.

## Still current from BL-069

1. **`Query.test.ts` is at 499, one line under the limit, left there on
   purpose.** The next case anybody adds fails `pnpm lint`. That is the rule
   working — do not "fix" it in advance; split it when a case actually needs
   adding, and cut at a `describe` seam.

2. **Splitting a file leaves each half importing the union of what both halves
   needed, and `tsc` will not tell you.** After any split, run typecheck first
   (it finds *missing* imports) then lint (it finds *surplus* ones).

## Still current from BL-066

1. **A save pass can write itself out and cannot read itself back in.** That
   asymmetry is deliberate: `ErasedStore` has no `set`, because `set` is the
   one member contravariant in the component's `T` and an erased one would
   accept any component's value into any store. Loading goes through
   `ComponentRegistry.store(def)` with a real def, so the load side needs a
   name-to-def table — **BL-067**, and nothing owns one today. **The trap is
   that the write side works**, so a session could build an entire serialiser
   before meeting the missing half.

2. **`@ts-expect-error` suppresses the compile error and still runs the code.**
   Read the property, do not call the method, when what you mean to assert is
   that the method is absent. Those two cases now live in
   `ComponentRegistry.test.ts`.

3. **`ComponentRegistry.ts`'s doc comments reference `ComponentStore.prune`
   and `.remove` across a file boundary.** Kept rather than inlined,
   deliberately. If a later change moves either method, those references need
   following.
