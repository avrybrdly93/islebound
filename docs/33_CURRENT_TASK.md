# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IN_PROGRESS — BL-072

**The other `tasks/*.md` name `pnpm` commands and are still uncovered.**
Phase 0 · Size S · Depends on: — · Docs to read: — (plus `04`, `05`, `06` per
`AI_DEVELOPMENT_WORKFLOW.md` §3).

Claimed 2026-09-07. It is the topmost unblocked Phase-0 Ready item, checked
against the file rather than taken from the previous handoff: **BL-056** is
still `Phase: 1` and so is not a candidate under phase discipline;
**BL-067**'s own notes still say it "should not be taken before `23` has a
shape", and `23_SAVE_SYSTEM.md` still mentions `EntitySave` exactly once
(§2 line 38) and defines it nowhere; BL-059, BL-066, BL-068 and BL-069 are
done. BL-072 is next.

### Acceptance criteria

1. `COVERED_DOCS` includes every `tasks/*.md`, and `pnpm lint:docs` is green
   with them in.
2. Either `pnpm --filter <pkg> <script>` is read and checked against that
   package's `package.json`, or the pattern's blindness to it is stated in the
   module header as a deliberate limit.

### The decision on criterion 2, taken before the code and on a measurement

**Implement it, do not declare it out of scope.** The backlog's own wording is
that the blindness "is a gap in the pattern rather than in the list", and the
one command it hides is the only `--filter` reference in any covered document —
so declaring it out of scope would leave the check reporting clean over exactly
the case that motivated the task.

The one thing that had to be established first was **how `--filter` resolves a
selector**, because the check has to reproduce it. `tasks/phase_7_multiplayer.md`
writes `pnpm --filter server sim-smoke` while `packages/server/README.md` says
the package will be named `@halcyon/server`, and the root `package.json`'s own
`dev` script writes the **scoped** form (`pnpm --filter @halcyon/client dev`) —
which reads like the doc naming a selector that will not match. **It was probed
rather than assumed, and the assumption was wrong:** `pnpm --filter client
typecheck` matches `@halcyon/client`, `pnpm --filter shared typecheck` matches
`@halcyon/shared`, and `pnpm --filter nonexistentpkg typecheck` reports "No
projects matched the filters". A bare selector matches the unscoped tail. So the
doc is **correct as written** and there is no doc bug here to fix — but the
check must match both forms or it would invent one.

### Plan

1. File the two Icebox items that will own `pnpm tools:balance` and
   `pnpm --filter server sim-smoke`, so `UNBUILT_COMMANDS` has real ids to
   point at rather than prose. This is BL-071's precedent, filed by BL-070 for
   exactly this reason. (`Next free ID` in `32` is stale at BL-071 — BL-071
   through BL-074 all exist — and is corrected while allocating.)
2. Extend `tools/check-doc-commands.ts` to read `pnpm --filter <selector>
   <script>`: resolve the selector against the workspace members' manifests by
   full name and by unscoped tail, and check the script against **that
   package's** `scripts`, not the root's. Route forward references through a
   filtered table, keyed on selector-and-script, with the same
   "name the item beside the command" requirement the unfiltered rule has.
3. Add every `tasks/*.md` to `COVERED_DOCS`.
4. Annotate `tasks/phase_3_crafting.md` and `tasks/phase_7_multiplayer.md` with
   the owning backlog ids beside the commands, which is what turns criterion 1
   green.
5. Verify each new rule is **able to fail**, per BL-069's and BL-062's
   precedent — a check nobody has seen go red is not evidence. Perturb: an
   unknown selector, a real selector with an unknown script, a filtered forward
   reference with its id removed, and a `tasks/*.md` file dropped from the list.
6. Run the verify block, then `32` → Done + discovered work, `33` → IDLE,
   `34` entry with **Surprises**.

### Known before starting

`packages/server` exists as a directory with a README and **no `package.json`**,
deliberately — it "is not yet a pnpm workspace member" until Phase 7 opens. So
the filtered reference is a forward reference in two ways at once (no member, no
script), which is precisely the case the annotation rule exists for.

**BL-074 makes about one full-suite run in twenty fail on
`allocation.test.ts`**, on a different operation each time. It is pre-existing
and was measured on the untouched tree. This task touches no runtime code at
all, so a red run there is not this task's.

