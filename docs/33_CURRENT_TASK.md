# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IN_PROGRESS

**BL-070** — `README.md` and `tasks/*.md` name the same unbuilt commands, and
`tools/check-doc-commands.ts` does not cover them. Claimed 2026-09-03.

Topmost unblocked Phase-0 Ready item, verified in list order rather than taken
on the previous handoff's word:

- **BL-056** is **Phase 1** — not a candidate under phase discipline
  (`AI_DEVELOPMENT_WORKFLOW.md` → *Phase discipline*). Twelfth session.
- **BL-067** is skipped **on its own instruction** ("should not be taken before
  `23` has a shape"), re-checked this session with the one grep the previous
  handoff names: `23_SAVE_SYSTEM.md` mentions `EntitySave` exactly once, at
  §2 line 38, and defines it nowhere. Still no component-level format, which
  is what BL-067's first criterion presumes.
- **BL-070** — this task.

## Plan

1. Add the three files to `COVERED_DOCS` — the one-line diff the backlog item
   names.
2. Run `pnpm lint:docs` and read the findings rather than predicting them.
3. Decide the annotation **per file, in that file's voice**. This is the task;
   the code change is not.
4. Resolve any command with no owning backlog item at all — a row in
   `UNBUILT_COMMANDS` is a promise, and a promise needs an item to point at.
5. Perturb the new coverage to prove it grades: remove an annotation, watch
   `pnpm lint:docs` go red, restore.
6. Verify, then `32`/`33`/`34`.

## Register, decided per file

Recorded here before the edits, so the reasoning survives even if the wording
is later changed.

- **`README.md`** — read by a human arriving at the repository, not by an agent
  working a verify block. It already carries a status banner, so the reader has
  been told the repository is early before reaching the quick-start. What it
  owes them is which of the six lines will fail *today* — the backlog ids are
  the supporting detail, not the point, and belong after the sentence rather
  than inside the block.
- **`tasks/phase_0_foundation.md`, `tasks/phase_1_player_and_world.md`** —
  these are phase *exit criteria*. Naming a command that does not exist yet is
  the entire function of the line: an exit criterion is a promise about the
  future, and it is written to be unmet. The judgement is whether each line
  already says which item builds the command it names.

## Verification for this task

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm lint:rules && pnpm lint:docs
pnpm format:check && pnpm build
```

`pnpm sim` and `pnpm check:bundle` still do not exist (BL-014, BL-018), which
is the fact this task is about.
