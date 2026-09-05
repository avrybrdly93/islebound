# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IDLE

No task in progress. **BL-065 is complete** (2026-09-05) — `QueryCache.query`
takes `ComponentDef<unknown>`, the top of the def family; the `AnyComponentDef`
alias is gone; five casts went, not the two the criteria named. See
`34_DEVELOPMENT_LOG.md` 2026-09-05; its **Surprises** 2 and 3 are the ones
worth reading, and **Surprise 4** is a process note someone with merge rights
needs to act on.

Suite **349 → 354 pass / 0 fail across 90 suites**. `lint`, `lint:rules`,
`lint:docs`, `typecheck` all clean.

## Read this before anything else: `main` does not have this work

This session was launched with an explicit branch assignment and pushed to
**`claude/sharp-lovelace-qozzup`**, not to `main`, which is what `CLAUDE.md`
otherwise calls for. The branch is a fast-forward of `main` — nothing on it
conflicts. **Someone with merge rights should fast-forward `main` and delete
the branch.** A session picking up from `main` alone will find `AnyComponentDef`
still present and this handoff describing a tree it cannot see.

## Next action for an agent

The topmost unblocked task in Phase 0's Ready list, per
`AI_DEVELOPMENT_WORKFLOW.md` §2.

**Read the file, do not trust this line.** In list order:

- **BL-056** is still **Phase 1** — not a candidate under phase discipline.
  Fifteenth session running.
- **BL-067** is still the one to skip, **on its own instruction** rather than
  on your judgement. Re-checked this session with the one grep the previous
  handoff names: `23_SAVE_SYSTEM.md` mentions `EntitySave` exactly once (§2,
  line 38) and defines it nowhere, so there is still no *component-level*
  format, which is what BL-067's first criterion presumes.
- **BL-065** — done, this session, and moved to Done rather than marked in
  place.
- **BL-072** is now the topmost that is actually ready.

Then **BL-073**, **BL-074** (filed this session), then **BL-008**.

## Why BL-072 is a reasonable next task, and the trap inside it

BL-072 is: two more `tasks/*.md` name `pnpm` commands that `lint:docs` does not
cover — `tasks/phase_3_crafting.md` names `pnpm tools:balance` and
`tasks/phase_7_multiplayer.md` names `pnpm --filter server sim-smoke`.

**The second one is invisible to the checker by construction, and that is the
task.** BL-072's own filing says it: `PNPM_COMMAND`'s `(?!--)` skips a flag, so
`pnpm --filter <pkg> <script>` is never read as a command at all. So this is not
"add two files to a list" — it is a gap in the *pattern*, and a session that
only extends the file list will close the item while leaving the second command
as uncovered as it was. Fix the pattern first, confirm it now sees the
`--filter` form, and only then decide what the two newly-visible commands
should resolve to.

Note also that `pnpm tools:balance` has **no script and no owning backlog
item**, so making it visible to `lint:docs` will make `lint:docs` fail. That is
the check working, and the fix is either a `BL-###` that will build it or a
correction to the doc — decide which, do not silence it.

## What this session leaves for someone else

- **BL-074**, filed today from a measurement: `queries.query('Transform')`
  returns `[]` rather than throwing. `QueryCache` reads a def only for identity,
  so a non-def becomes a `Map` key like any other and the intersection is
  legitimately empty. TypeScript is the only guard. **The failure is silent and
  plausible** — a system that queried the wrong thing sees "no entities
  matched", which is indistinguishable from a world where nothing matched. The
  cheap middle option nobody has costed is validating only on the **cold** path,
  since `signatureIds` already distinguishes a new signature from a cached one.

## Two findings worth carrying, both about how the work got checked

1. **After a type widening, `typecheck` green is not the finish line — `lint`
   is.** Three `store.set(e, 1 as never)` casts became unnecessary the moment
   the parameter widened, and unnecessary assertions typecheck perfectly.
   `no-unnecessary-type-assertion` found them; the item's description did not
   know they existed.
2. **When a task names its call sites, grep for the pattern anyway.**
   `Query.limit.test.ts` carried a second copy of the `anyDef` helper, added by
   BL-063 three days *after* BL-065 was filed, so it could not possibly have
   been in the criteria. Deleting exactly what was listed would have left it
   alive next door.

## The standing question, unchanged and now one item worse

**Six** `S` items now sit ahead of **BL-008**, the `M` the phase is actually
for — BL-074 joined the queue today. Every one of them was filed by a previous
session against code it had just written, which is the backlog working as
intended, but a phase that only ever services its own discoveries does not reach
its exit criteria. **This is the third session to raise it.** Worth a human
deciding whether BL-008 should be pinned ahead of the `S` queue.
