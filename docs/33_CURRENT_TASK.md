# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IDLE

No task in progress. **BL-082 is complete** (2026-09-21).

The type-aware lint rules run over `tools/` now. `34_DEVELOPMENT_LOG.md`
2026-09-21 and decision **0038** carry the detail; its **Surprises** 1 and 4
are the ones worth reading.

**Six errors on the first run**, in two files — one `prefer-optional-chain`,
five `restrict-template-expressions` — all fixed in source rather than
configured away. Fourth consecutive item where the first check of an unchecked
file found something real.

**The thing that will bite the next person who touches that block:**
`tools/lint-fixtures/**` is still in `disableTypeChecked` and **must stay**.
Those files are in `ignores`, so `pnpm lint` never reaches them, but
`tools/check-lint-rules.ts` lints them through the ESLint API to prove the four
custom rules fire, and they are outside `tools/tsconfig.json` on purpose. Take
the exemption away and every fixture fails to **parse**, all four rules report
nothing, and `pnpm lint` stays green while `pnpm lint:rules` goes red.

Suite **372 pass / 0 fail across 90 suites**, unchanged from the baseline —
this task adds no case, which is why BL-083 exists. `lint`, `lint:rules`,
`lint:docs`, `typecheck` and `format:check` all clean.

## Next action for an agent

The topmost unblocked task in Phase 0's Ready list, per
`AI_DEVELOPMENT_WORKFLOW.md` §2.

**Read the file, do not trust this line.** In list order:

- **BL-056** is still **Phase 1** — not a candidate under phase discipline.
  Twenty-third session running.
- **BL-067** is still the one to skip, **on its own instruction** rather than on
  your judgement: `23_SAVE_SYSTEM.md` mentions `EntitySave` exactly once (§2) and
  defines it nowhere, so there is still no component-level format for its first
  criterion to presume. Re-checked 2026-09-21 — unchanged.
- **BL-083** is new this session and is BL-082's own follow-up — **fifth
  consecutive session of that pattern, and the warning below now matters more
  than the item does.**
- **BL-078** is the sparse-allocator blind spot, an M, and the warning about it
  still stands in full (see below).
- **BL-008** (fixed-timestep game loop) is the first substantial feature item.

Take them in the file's order, not this list's.

## Read this before taking BL-083, and consider not taking it

BL-083 is the topmost of the three above, and taking it makes **five
consecutive sessions** spent on the follow-up of the session before
(BL-079 → BL-080 → BL-081 → BL-082 → BL-083). Each one was a real defect and
each closed properly, so no individual choice was wrong. The pattern is still
worth naming out loud: **a chain of self-generated follow-ups can run
indefinitely, and Phase 0's feature items have not moved in five sessions.**

Nothing here says skip it. BL-083 closes a real silent hole — a later edit
could return `tools/**/*.ts` to the `disableTypeChecked` block with `lint`,
`lint:rules`, `typecheck` and `test` all still green. But **if it generates a
sixth follow-up, strongly consider filing that one and taking BL-078 or BL-008
instead.** A human reordering Ready is how this gets steered; this paragraph is
a flag for them, not a decision taken on their behalf.

**If you do take it, the complication is measured, not predicted.** A fixture
proving a *type-aware* rule fires cannot live in `tools/lint-fixtures/` —
decision 0038 keeps that directory exempt and outside `tools/tsconfig.json`, so
with type-aware settings its files do not even parse. It needs a second fixture
directory that is **inside** `tools/tsconfig.json`'s `include` and **inside**
ESLint's `ignores`. `tools/check-lint-rules.ts`'s `EXPECTATIONS` table is the
natural home for the assertion and is already shaped like one.

## Before you trust anything below, install

`pnpm install --frozen-lockfile` first. This container arrived with
`node_modules` absent **again** — seventh session running — and the first
`pnpm lint && pnpm typecheck && pnpm test` without it fails with
`ERR_MODULE_NOT_FOUND`, which reads exactly like a broken tree and is not one.
After installing, the baseline this session measured was 372/90, matching the
previous session's close-out on every count; it closed at 372/90. No lockfile
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
BL-074's allowance of four sampling intervals. Green again this session, seven
consecutive full runs now. **If it does go red, the number in the message is the
thing to read**: under 4096 is a new phenomenon, well over it is a real
allocation.

## Seven things carried forward that a later session should not rediscover

1. **A guard cannot live inside the thing it guards.** The natural reading of
   BL-079 was "add a check to `pnpm lint`", and it is self-defeating: the edit
   the guard exists to catch is a rewrite of `lint`, and that rewrite deletes
   the guard along with the thing it was guarding. **Before choosing where a
   check lives, ask what the change you fear would do to the check itself.**
2. **This repository keeps producing one defect: a rule it states and does not
   check.** BL-077 (a script nothing ran), BL-079 (a fix nothing asserted),
   BL-080 (a language nothing checked), BL-081 (that language still unchecked in
   two files), BL-082 (a rule turned off for a reason that expired), **BL-083
   (that rule now on, and nothing asserting it stays)**, and decision 0029's
   fourteen unchecked soft-limit breaches before them. **Six sessions running,
   and BL-082 closing produced the seventh instance immediately.** When you next
   write a rule down, write down what fails when it is broken.
3. **A green run of a checker does not verify the checker.** After wiring any new
   gate, break something once. Applied again this session — and see 7 below for
   the sharper version.
4. **A session's report of a known defect's extent is only as good as the gate
   that measures it.** BL-077's central finding. Before reporting a known defect
   as unchanged, run the thing that measures it — "unchanged" and "I did not
   look" are indistinguishable, including to the session writing it.
5. **A predicted trap is worth checking even when the answer is "not there".**
   BL-080's notes warned that `tsc` over `tools/` might surface code that
   type-checks and will not run under `--experimental-strip-types`. Checked;
   none of the four files used a refused construct. The warning cost five
   minutes and its answer is a fact rather than an open worry.
6. **Rank an option by what it touches, not by how large it sounds — and find
   out by running it.** BL-081's finding, and **this session is the second
   consecutive item whose predicted configuration change turned out to be
   zero**: `projectService: true` already resolved `tools/tsconfig.json`, so
   BL-082's second acceptance criterion was met by the config as written. Both
   times the reasoning could have gone either way with equal confidence and the
   experiment settled it in minutes.
7. **New this session, and it sharpens 3: a control has to be checked against
   the thing it is controlling for, not merely observed to fail.** One of four
   controls here was a `no-unnecessary-condition` probe that reported
   `no-inferrable-types` instead — a *stylistic* rule that was never switched
   off, so it would have failed identically under the old config and proved
   nothing about type-awareness. A control that fails for the wrong reason
   looks exactly like a control that works. **Run the control against the
   *old* state too**; the two genuine ones here were silent before the change
   and reported after, which is what makes them evidence.
8. **And a corollary worth keeping: when one glob covers two populations for
   one stated reason, check the reason against each separately.**
   `tools/**/*.ts` in the `disableTypeChecked` block covered the scripts (where
   the reason had expired) and the lint fixtures (where it is still exactly
   true). Removing it wholesale broke the fixtures' *parse*, silently to
   `pnpm lint` and fatally to `pnpm lint:rules`.
