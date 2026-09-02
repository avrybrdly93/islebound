# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IN_PROGRESS — BL-062

**The verify block names three commands that do not exist.** Claimed
2026-09-02 as the topmost unblocked Ready item in Phase 0, per
`AI_DEVELOPMENT_WORKFLOW.md` §2.

### Why this one, checked rather than inherited

The previous handoff nominates BL-062 and says *"read the file, do not trust
this line"*. Read:

- **BL-056** is still **Phase 1** — not a candidate under phase discipline.
  Eleventh session running.
- **BL-067** is skipped **on its own instruction**, not on judgement: its
  notes say it should not be taken before `23_SAVE_SYSTEM.md` has a shape.
  Re-checked in one grep — `23` §2 defines a `SaveFile` envelope and names
  `EntitySave` exactly once, defining it nowhere. So there is still no
  component-level format, which is what BL-067's first criterion presumes.
- **BL-059**, **BL-066**, **BL-068**, **BL-069** are done.
- **BL-062** is therefore the topmost that is actually ready. Confirmed.

### Acceptance criteria

1. Either the script names match the docs, or both docs mark the
   not-yet-built commands with the BL that will build them.
2. `pnpm test` exists as an alias, or the docs stop naming it.

### Plan

1. Add `"test": "pnpm test:node"` to the root `package.json`. Criterion 2 by
   alias rather than by deletion: `pnpm test` is what both docs say, what a
   newcomer types, and what BL-015 will eventually own outright — so the
   alias is the forward-compatible half of the choice, and renaming
   `test:node` would touch every doc and script that names it for no gain.
2. Annotate the three genuinely-unbuilt commands in **both** docs with the
   backlog item that will build each: `pnpm sim` → BL-014, `pnpm
   check:bundle` → BL-018, `tools/check-sim-purity.ts` → BL-017.
3. Add `tools/check-doc-commands.ts` and a `pnpm lint:docs` script that
   fails when a doc names a `pnpm` script that neither exists nor carries a
   `BL-###` beside it. This is the regression test `29` §9's *Bug fix* row
   requires — the bug is "a doc names a command that does not exist", and
   this is the check that fails before the fix and passes after.
4. Verify it fails on the pre-fix documents before trusting it green (the
   BL-069 lesson: a green check does not verify a check).
5. Run the real verify block, log, hand off.

### Scope boundary, stated because it is deliberate

`README.md` (lines 36-37) and `tasks/phase_0_foundation.md` /
`tasks/phase_1_player_and_world.md` also name `pnpm test` and `pnpm sim`.
**They are out of scope**: BL-062's description names exactly two documents
and its criteria say "both docs". `35` §3 forbids the ride-along. The
checker therefore takes an explicit list of the two files BL-062 covers, and
extending that list to the other four is filed as its own item.
