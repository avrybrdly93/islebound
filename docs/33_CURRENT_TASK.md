# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `.github/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IDLE

No task in progress. **BL-069 is complete** (2026-09-01) — `max-lines` is on
at `['error', { max: 500 }]` across every TypeScript file including tests,
counting raw lines, and the three test files that were over it were split.
`CLAUDE.md` now distinguishes the enforced hard limit from the 300-line soft
target that nothing checks. See `34_DEVELOPMENT_LOG.md` 2026-09-01 (BL-069)
and decision **0029**; its **Surprises** are load-bearing, especially item 1.

Suite unchanged at **342 pass / 0 fail across 88 suites** — the check that
matters for a move.

## Next action for an agent

The topmost unblocked task in Phase 0's Ready list, per
`AI_DEVELOPMENT_WORKFLOW.md` §2.

**Read the file, do not trust this line.** In list order the situation is:

- **BL-056** is still **Phase 1**, so still not a candidate under phase
  discipline — tenth session running.
- **BL-067** is still the one to skip, and skip it **on its own instruction**
  rather than on your judgement: its notes say it "should not be taken before
  `23` has a shape". Checked again this session, and the previous handoff's
  reason needed narrowing — `23_SAVE_SYSTEM.md` **does** define a save format
  in §2 (a `SaveFile` envelope: version, seed, checksum,
  `entities: EntitySave[]`). What it never defines is **`EntitySave`**, which
  is named once in that interface and appears nowhere else in the document. So
  there is no *component-level* format, and that is the precise thing BL-067's
  first criterion presumes. Same conclusion as the last two handoffs, on a
  reason you can check in one grep.
- **BL-069** — done, this session.
- **BL-062** is therefore the topmost that is actually ready. Say so in the
  log, as this session did for BL-069 and BL-068 did before it.

Then **BL-063**, **BL-065**, then **BL-008**.

## Why BL-062 is a good next task, and one thing to watch

`CLAUDE.md`'s verify block names `pnpm test`, `pnpm sim --ticks 20000
--assert-hash` and `pnpm build && pnpm check:bundle`. Of those, **`pnpm test`,
`pnpm sim` and `pnpm check:bundle` do not exist** — `package.json` has
`test:node`, and no `sim` or `check:bundle` at all. `pnpm build` does exist and
passes.

This session touched the same paragraph of `CLAUDE.md` that BL-062 is about,
for the file-length line, and deliberately did **not** fix the verify block
while it was there — that is BL-062's, and `35` §3 forbids the ride-along. But
note the overlap: whoever takes BL-062 is editing the same document, and should
read decision 0029 first so the two edits do not disagree about what "enforced"
means in that file.

## The standing question, unchanged

**Six** `S` items sit ahead of **BL-008**, the `M` the phase is actually for,
and none of them blocks it. Sessions keep taking the topmost because §2 is
unusually direct — *"Not the most interesting one — the topmost one; the
ordering is how the human steers."* If a human wants BL-008 pulled forward, the
way to do it is to **reorder the Ready list**, which is the mechanism §2
describes. A session should not do it by reinterpretation. This is the fourth
handoff to say so.

## What BL-069 leaves for the next session

1. **A green lint does not verify a lint rule.** After the splits `pnpm lint`
   was clean — which is exactly what a correctly configured rule and a silently
   misconfigured one both look like once nothing violates them. This session
   wrote a 511-line probe file, confirmed the error, and removed it. It is the
   same shape as BL-068's "a green suite does not verify a move", one level up.
   **After enabling any rule that nothing currently violates, make something
   violate it once.**

2. **`Query.test.ts` is at 499, one line under the limit, left there on
   purpose.** The next case anybody adds fails `pnpm lint`. That is the rule
   working, not a problem to pre-empt — and unlike before, the failure names
   the file and says what the limit is. Do not "fix" it in advance; split it
   when a case actually needs adding, and cut at a `describe` seam.

3. **Decision 0029 reverses decision 0028's alternative (c), deliberately.**
   0028 rejected a shared test-fixture module in favour of visible duplication,
   for fixtures that were "three lines and stable". BL-069 created three of
   them. The principle is the same — duplicate what is trivial, share what is
   substantial — and only the size changed: `Rng.testFixtures.ts` is 113 lines
   of chi-square machinery whose critical values are stated rather than
   eyeballed. A reader comparing the two decisions will see opposite calls;
   0029's Consequences say why.

4. **Splitting a file leaves each half importing the union of what both
   halves needed, and `tsc` will not tell you.** Four unused imports survived a
   clean typecheck here and were caught only by
   `@typescript-eslint/no-unused-vars`. After any split, run typecheck first
   (it finds *missing* imports) then lint (it finds *surplus* ones).

## Still current from BL-066, untouched by BL-068 or BL-069

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

3. **`ComponentRegistry.ts`'s doc comments reference `ComponentStore.prune`
   and `.remove` across a file boundary.** Kept rather than inlined,
   deliberately: the argument belongs with the method that embodies it, and
   duplicating it is how two copies drift. If a later change moves either
   method, those references need following.
