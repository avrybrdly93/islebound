# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IDLE

No task in progress. **BL-062 is complete** (2026-09-02) — `pnpm test` exists
as an alias for `pnpm test:node`, both agent-facing documents name the
backlog item that builds each command they mention and the repository lacks,
and `pnpm lint:docs` (`tools/check-doc-commands.ts`) fails if that stops
being true. See `34_DEVELOPMENT_LOG.md` 2026-09-02 (BL-062); its
**Surprises** 1 and 2 are load-bearing.

Suite unchanged at **342 pass / 0 fail across 88 suites** — and it now runs
through the new alias, which is what proves the alias resolves.

**The verify block in `CLAUDE.md` and `AI_DEVELOPMENT_WORKFLOW.md` §6 now
works as written**, with two lines that still say "command not found" and now
say why. What runs today, in full:

```bash
pnpm install                                  # a clean clone needs this first
pnpm lint && pnpm typecheck && pnpm test
pnpm lint:rules && pnpm lint:docs
pnpm format:check && pnpm build
```

## Next action for an agent

The topmost unblocked task in Phase 0's Ready list, per
`AI_DEVELOPMENT_WORKFLOW.md` §2.

**Read the file, do not trust this line.** In list order the situation is:

- **BL-056** is still **Phase 1**, so still not a candidate under phase
  discipline — eleventh session running.
- **BL-067** is still the one to skip, and skip it **on its own instruction**
  rather than on your judgement: its notes say it should not be taken before
  `23` has a shape. Re-checked this session and the previous handoff's
  narrowing still holds — `23_SAVE_SYSTEM.md` §2 defines a `SaveFile`
  envelope and names `EntitySave` exactly once, defining it nowhere. There is
  still no *component-level* format, which is what BL-067's first criterion
  presumes. One grep to confirm.
- **BL-062** — done, this session.
- **BL-070** is new, filed by BL-062 this session, and sits directly above
  BL-063 in the Ready list — so **it is the topmost that is actually ready**.
  Say so in the log, as this session did for BL-062.

Then **BL-063**, **BL-065**, then **BL-008**.

## Why BL-070 is a reasonable next task, and the one thing that makes it not mechanical

BL-070 extends `tools/check-doc-commands.ts`'s `COVERED_DOCS` to `README.md`
and the two `tasks/*.md`. The code change is one line — the paths.

**Everything else is a judgement about register, and that is the actual
task.** `README.md` is read by a human arriving at the repository, not by an
agent working through a verify block, so "this arrives with BL-014" may be
exactly the wrong thing to say there; a plain "not built yet" may be right,
and the check would then need to accept it. The `tasks/*.md` files describe
phase *exits* — naming a command that does not exist yet is the whole point
of a phase-exit line, and those two may already be clear enough to need
nothing but the id. Decide per file, and if a file needs no change, say so in
the log rather than adding noise to it.

## The standing question, unchanged

**Six** `S` items sit ahead of **BL-008**, the `M` the phase is actually for,
and none of them blocks it. BL-062 closed one and filed one, so the count did
not move. Sessions keep taking the topmost because §2 is unusually direct —
*"Not the most interesting one — the topmost one; the ordering is how the
human steers."* If a human wants BL-008 pulled forward, the way to do it is
to **reorder the Ready list**, which is the mechanism §2 describes. A session
should not do it by reinterpretation. This is the fifth handoff to say so.

## What BL-062 leaves for the next session

1. **A check can run, parse, report, and still be asking a weaker question
   than it appears to.** This session's first version of
   `check-doc-commands.ts` required "a `BL-###` somewhere in the paragraph".
   Deleting `BL-014` from `CLAUDE.md`'s note left `BL-017` and `BL-062` in
   the same paragraph, so it stayed **green** while the document had stopped
   saying which item builds `pnpm sim`. It now names the expected id per
   script in an `UNBUILT_COMMANDS` table. This is BL-069's "a green lint does
   not verify a lint rule" one turn on, and the sharper form is: **when a
   rule is "some marker is nearby", ask what else in the neighbourhood
   satisfies it.**

2. **`UNBUILT_COMMANDS` is a promise, and it should shrink.** Two rows today,
   `sim` → BL-014 and `check:bundle` → BL-018. When either lands, its row
   goes and the check keeps working with no other edit — the script will
   simply exist. A row that outlives its backlog item is a forward reference
   to something that already arrived, so **whoever closes BL-014 or BL-018
   deletes the row in the same commit.**

3. **The annotation may sit in the command's paragraph or the one after it**,
   because a fenced block is explained by the prose beneath it. If you move
   one of those notes further from its block, the check will tell you.

4. **A clean clone needs `pnpm install` before anything, and the verify block
   still does not say so.** Ordinary, but it is the same class of problem
   BL-062 was about — a documented command that does not do what a literal
   reading suggests. Deliberately not fixed and deliberately **not filed**:
   it belongs to **BL-021** (root documentation files), which owns a
   quick-start.

## Still current from BL-069

1. **`Query.test.ts` is at 499, one line under the limit, left there on
   purpose.** The next case anybody adds fails `pnpm lint`. That is the rule
   working — do not "fix" it in advance; split it when a case actually needs
   adding, and cut at a `describe` seam.

2. **Splitting a file leaves each half importing the union of what both
   halves needed, and `tsc` will not tell you.** After any split, run
   typecheck first (it finds *missing* imports) then lint (it finds *surplus*
   ones).

## Still current from BL-066

1. **A save pass can write itself out and cannot read itself back in.** That
   asymmetry is deliberate: `ErasedStore` has no `set`, because `set` is the
   one member contravariant in the component's `T` and an erased one would
   accept any component's value into any store. Loading goes through
   `ComponentRegistry.store(def)` with a real def, so the load side needs a
   name-to-def table — **BL-067**, and nothing owns one today. **The trap is
   that the write side works**, so a session could build an entire serialiser
   before meeting the missing half.

2. **`@ts-expect-error` suppresses the compile error and still runs the
   code.** Read the property, do not call the method, when what you mean to
   assert is that the method is absent. Those two cases now live in
   `ComponentRegistry.test.ts`.

3. **`ComponentRegistry.ts`'s doc comments reference `ComponentStore.prune`
   and `.remove` across a file boundary.** Kept rather than inlined,
   deliberately. If a later change moves either method, those references need
   following.
