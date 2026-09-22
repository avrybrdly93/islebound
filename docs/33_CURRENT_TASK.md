# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IDLE

No task in progress. **BL-083 is complete** (2026-09-22).

The type-aware lint rules now have something asserting they stay on over
`tools/`. `34_DEVELOPMENT_LOG.md` 2026-09-22 and decision **0039** carry the
detail; **Surprises 1 and 3** are the ones worth reading.

Suite **375 pass / 0 fail across 90 suites**, up from 372/90 — three new
cases, no new suite, no runtime code touched. `lint`, `lint:rules`,
`lint:docs`, `typecheck` and `format:check` all clean.

**The thing that will bite the next person who touches that config:**
there are now **two** fixture directories and their exemptions are exact
opposites. `tools/lint-fixtures/` is **outside** `tools/tsconfig.json` and
**inside** the `disableTypeChecked` block; `tools/lint-typed-fixtures/` is
**inside** the project and **outside** that block. Neither can move: with
type-awareness on, `lint-fixtures/` does not **parse**; with it off,
`lint-typed-fixtures/` reports nothing at all. Both are measured, both are
commented in `eslint.config.js`, and tidying the two into one list breaks
whichever you move.

## Next action for an agent

The topmost unblocked task in Phase 0's Ready list, per
`AI_DEVELOPMENT_WORKFLOW.md` §2.

**Read the file, do not trust this line.** In list order:

- **BL-056** is still **Phase 1** — not a candidate under phase discipline.
  Twenty-fourth session running.
- **BL-067** is still the one to skip, **on its own instruction** rather than
  on your judgement: `23_SAVE_SYSTEM.md` mentions `EntitySave` exactly once
  (§2) and defines it nowhere, so there is still no component-level format for
  its first criterion to presume. Re-checked 2026-09-22 — unchanged.
- **BL-078** is the sparse-allocator blind spot, an M, and the warning about it
  still stands in full (see below). **It is now the topmost workable item.**
- **BL-008** (fixed-timestep game loop) is the first substantial feature item.

Take them in the file's order, not this list's.

## The five-session follow-up chain ended, and it ended on its own

BL-079 → BL-080 → BL-081 → BL-082 → BL-083 were five consecutive sessions each
spent on the previous one's follow-up. The 2026-09-21 handoff flagged that and
asked that a sixth be **filed and not taken**.

**No sixth exists.** BL-083 filed nothing: the only residual it leaves is
`test:node`'s glob, which is already **BL-019**'s and is already declared by
two older guards. So the next session takes BL-078 or BL-008 because they are
next in the file, not because anything was cut short — and **Phase 0's feature
items move again for the first time in five sessions.**

One thing that count is worth noticing about, rather than filing: **three
guards now wait on BL-019.** `check-lint-script.test.ts`,
`check-typecheck-coverage.test.ts` and `check-type-aware-lint.test.ts` each
declare the same residual — reached through `test:node`'s `tools/**/*.test.ts`
glob, unable to notice that glob changing. That was a small hole when one
guard leaned on it. It is BL-019's content, not a new item.

## Before you trust anything below, install

`pnpm install --frozen-lockfile` first. This container arrived with
`node_modules` absent **again** — eighth session running — and the first
`pnpm lint && pnpm typecheck && pnpm test` without it fails with
`ERR_MODULE_NOT_FOUND`, which reads exactly like a broken tree and is not one.
After installing, the baseline this session measured was 372/90, matching the
previous session's close-out on every count; it closed at 375/90. No lockfile
change this session.

## If you take BL-078, read the harness's options table before choosing an axis

Unchanged from the previous handoff and still accurate. BL-078 is the blind spot
BL-074 deliberately left: the boundary separates "allocates once per call" from
"one stray sample" but **not** from "allocates once per thousand calls", which
reads 4224–11 648 against a 4096 bound.

The trap is that it looks like a constant to retune and is not. **Raising
`MAX_STRAY_SAMPLES` moves the boundary the wrong way, and lowering it re-creates
BL-074.** It needs a different instrument, and the two obvious axes — a longer
window and a finer `samplingInterval` — both have measured failure modes already
recorded in `allocationHarness.ts`: at interval 16 an allocation-free operation
read 904 bytes where 64–8192 all read exactly 0, and a warm-up of 200 000 made
the **control** read 0 in one pass of three. There is also no room above: the gap
assertion caps the allowance at **6** intervals on this container, measured, so
the boundary cannot simply be moved up.

Note `allocationHarness.ts` sits at **496 of its 500 allowed lines** (decision
0034), so whatever BL-078 adds needs a seam rather than a paragraph.

## What is red

Nothing.

The **`allocation.test.ts` 1-in-20 remains fixed rather than mitigated** —
BL-074's allowance of four sampling intervals. Green again this session,
**eight** consecutive full runs now. **If it does go red, the number in the
message is the thing to read**: under 4096 is a new phenomenon, well over it is
a real allocation.

## Nine things carried forward that a later session should not rediscover

1. **A guard cannot live inside the thing it guards.** BL-079's finding. Before
   choosing where a check lives, ask what the change you fear would do to the
   check itself.
2. **And the corollary BL-083 turned into a rule: a guard has to live somewhere
   the verify block actually runs.** `pnpm lint:rules` and `pnpm lint:docs` are
   named in the prose *beneath* §6's block, not in it. A check hosted there
   "exists and nothing is obliged to run" it — BL-077's shape one level up.
   Three guards now live in `pnpm test` for this reason and no new one should
   go anywhere else without a stated argument.
3. **This repository keeps producing one defect: a rule it states and does not
   check.** BL-077, BL-079, BL-080, BL-081, BL-082, BL-083, decision 0029's
   fourteen unchecked soft-limit breaches — and this session found an eighth
   in passing, `32_BACKLOG.md`'s "Next free ID" still reading BL-083 while
   BL-083 existed. **When you next write a rule down, write down what fails
   when it is broken.**
4. **A green run of a checker does not verify the checker.** After wiring any
   new gate, break something once. BL-083 broke three different things and each
   failed differently, which is what separated "the rule stopped reporting"
   from "the file stopped parsing".
5. **A control has to be checked against the thing it is controlling for.**
   BL-082's finding, applied by BL-083 rather than admired: the rule it guards
   with was chosen by running it against the **old** config, where it reports
   nothing at all. A control that fails for the wrong reason looks exactly like
   a control that works.
6. **And one level down: a fixture's shape is an assertion too.** BL-083's third
   case pins its fixture to exactly one finding, because otherwise the first
   case keeps passing on a file whose deliberate violation has been replaced by
   an unrelated one.
7. **A filed item's suggested approach is a hypothesis — and what refutes it is
   sometimes already in the repository rather than in a measurement.** BL-083's
   notes named `check-lint-rules.ts`'s `EXPECTATIONS` table as "the natural
   home"; `check-lint-script.test.ts`'s header had already settled the question
   against it, one directory away, for the sibling guard.
8. **Rank an option by what it touches, not by how large it sounds — and find
   out by running it.** BL-081's finding. Two consecutive items' predicted
   configuration changes turned out to be zero.
9. **When one glob covers two populations for one stated reason, check the
   reason against each separately.** BL-082's finding, and BL-083 is what it
   looks like resolved: the two populations now have two directories with
   opposite exemptions, and merging them breaks whichever moves.
