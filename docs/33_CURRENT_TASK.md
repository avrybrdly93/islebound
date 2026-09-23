# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IN_PROGRESS — BL-083

**Nothing asserts that the type-aware lint rules stay on over `tools/`.**
Claimed 2026-09-23. Phase 0 · Size S · Depends on BL-082 · Docs read: 06, 07,
04, 05, plus `35_AI_AGENT_RULES.md` and the workflow.

It is the topmost unblocked Ready item. BL-056 is Phase 1; BL-067 is skipped on
its own instruction (`23_SAVE_SYSTEM.md` still defines no `EntitySave`,
re-checked 2026-09-23 and unchanged). The previous handoff flagged that taking
this makes **five consecutive sessions on the follow-up of the session before**
and asked the next agent to consider not taking it — it also said, in the same
paragraph, that the decision belongs to a human reordering Ready and that the
paragraph is a flag rather than a decision taken on their behalf. Ready was not
reordered, so the process wins and the item is taken. **The flag is repeated at
the bottom of this file, sharpened, because it is now about the sixth.**

## Baseline, measured this session before any edit

`pnpm install --frozen-lockfile` first — `node_modules` arrived absent **again**,
eighth session running. Then all five gates green:

| gate | result |
|---|---|
| `pnpm lint` (`eslint .` then `prettier --check .`) | clean |
| `pnpm typecheck` | clean |
| `pnpm test` | **372 pass / 0 fail across 90 suites** |
| `pnpm lint:rules` | 4/4 fixtures caught |
| `pnpm lint:docs` | clean |

`pnpm sim` and `pnpm check:bundle` still do not exist (BL-014, BL-018), which is
expected in Phase 0.

## The plan (written before the first line of code)

1. **New fixture directory `tools/type-aware-fixtures/`**, holding one file with
   a deliberate violation of a rule that *needs type information*. It must be
   **inside** `tools/tsconfig.json`'s `include` — which `"**/*.ts"` already
   does, since only `lint-fixtures` is excluded — so the project service can
   resolve it, and it must **type-check cleanly**: the fixture is a lint
   violation, not a type error, or `pnpm typecheck` goes red for the wrong
   reason.
2. **Add that directory to `eslint.config.js`'s `ignores`**, so `pnpm lint`
   stays green, with a comment saying why it is *not* in the
   `disableTypeChecked` block that `tools/lint-fixtures/**` is in. Those two
   directories differ in exactly the way this task is about, and a reader who
   confuses them will undo it.
3. **One new row in `tools/check-lint-rules.ts`'s `EXPECTATIONS`.** The table is
   already shaped for it and the script already filters by `ruleId`, which is
   what satisfies the third acceptance criterion: a syntactic rule reporting on
   the same file cannot satisfy a row keyed to a type-aware `ruleId`.
4. **Control, by doing it rather than by reading the config** (criterion 2):
   put `tools/**/*.ts` back into the `disableTypeChecked` block, run
   `pnpm lint:rules`, and confirm it goes red **on the new row specifically**
   while the four existing rows stay green. Then revert and confirm green.
5. **Second control, from BL-082's Surprise 7**: check that the new row's rule
   was genuinely off under the old state rather than merely absent — a control
   that fails for the wrong reason looks exactly like one that works.
6. Full gate run, then `32` / `33` / `34`, and `40` only if the choice turns out
   to be architecturally visible.

## Read this before taking whatever comes next

Closing BL-083 makes **five consecutive sessions** spent on the follow-up of
the session before (BL-079 → BL-080 → BL-081 → BL-082 → BL-083). Each was a
real defect and each closed properly, so no individual choice was wrong, and
the previous handoff already said so. **If this session files a sixth
follow-up, the previous handoff's advice was to strongly consider filing it and
taking BL-078 or BL-008 instead — that advice now applies to you.** Phase 0's
feature items have not moved in five sessions.

## What is red

Nothing, as of the baseline above.
