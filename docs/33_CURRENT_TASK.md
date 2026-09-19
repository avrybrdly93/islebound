# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IDLE

No task in progress. **BL-080 is complete** (2026-09-19).

`tools/` is a workspace package now, with its own `tsconfig.json` and the same
one-line `typecheck` script `packages/client` and `packages/shared` have, so
`pnpm typecheck` reaches it **by construction** rather than through a string in
the root script. `34_DEVELOPMENT_LOG.md` 2026-09-19 and decision **0036** carry
the detail; its **Surprises** 1 and 3 are the ones worth reading.

**The first run of that typecheck found two real errors** — in
`check-lint-script.test.ts`, the previous session's own new file, four days old.
That is the item's whole thesis arriving on schedule: an annotation nothing
checks is a comment.

Suite **369 pass / 0 fail across 90 suites**, up from 363 — six new cases, no
new suite. `lint`, `lint:rules`, `lint:docs`, `typecheck`, `format:check` and
`build` all clean.

## Next action for an agent

The topmost unblocked task in Phase 0's Ready list, per
`AI_DEVELOPMENT_WORKFLOW.md` §2.

**Read the file, do not trust this line.** In list order:

- **BL-056** is still **Phase 1** — not a candidate under phase discipline.
  Twenty-first session running.
- **BL-067** is still the one to skip, **on its own instruction** rather than on
  your judgement: `23_SAVE_SYSTEM.md` mentions `EntitySave` exactly once (§2) and
  defines it nowhere, so there is still no component-level format for its first
  criterion to presume. Re-checked 2026-09-19 — unchanged.
- **BL-081** is new this session and is the smallest of the three below. It is
  BL-080's own follow-up, exactly as BL-080 was BL-079's: the two `tools/*.mjs`
  files are checked by ESLint and by nothing else.
- **BL-078** is the sparse-allocator blind spot, an M, and the warning about it
  still stands in full (see below).
- **BL-008** (fixed-timestep game loop) is the first substantial feature item.

Take them in the file's order, not this list's.

## Before you trust anything below, install

`pnpm install --frozen-lockfile` first. This container arrived with
`node_modules` absent **again** — fifth session running — and the first
`pnpm lint && pnpm typecheck && pnpm test` without it fails with
`ERR_MODULE_NOT_FOUND`, which reads exactly like a broken tree and is not one.
After installing, the baseline this session measured was 363/90, matching the
previous session's close-out on every count; it closed at 369/90.

**One thing changed about install this session and it matters here.**
`pnpm-workspace.yaml` now lists `tools`, so `pnpm install` resolves **four**
workspace projects rather than three and `pnpm-lock.yaml` gained nine lines. If
you see a lockfile diff after a plain `pnpm install --frozen-lockfile`, that is
not it — the lockfile committed here is the post-change one.

## If you take BL-081, the thing that decides it is a run, not a reading

`registerAliases.mjs` is passed to `node --import` **before any test file
loads**, and `aliasResolver.mjs` is what it registers. So the conversion option
(`.mjs` → `.ts`) turns on a question about module-loading order: can a loader
hook register itself while `--experimental-strip-types` is erasing it? **Answer
that by running it, not by reasoning about it.** If it cannot, `allowJs` is the
only route and the decision narrows to `checkJs` or not.

Note also what BL-080 learned about writing anything new in `tools/`: the
directory has always been linted, so its files satisfy the lint rules, but they
have never had to satisfy the *type* rules, and the two interact.
`noUncheckedIndexedAccess` makes an indexed read `T | undefined` and
`@typescript-eslint/no-non-null-assertion` forbids the obvious `!`, so a bound
has to be re-stated rather than asserted away.

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
BL-074's allowance of four sampling intervals. Green again this session, five
consecutive full runs now. **If it does go red, the number in the message is the
thing to read**: under 4096 is a new phenomenon, well over it is a real
allocation.

## Five things carried forward that a later session should not rediscover

1. **A guard cannot live inside the thing it guards.** New this session and the
   most transferable thing in it. The natural reading of BL-079 was "add a check
   to `pnpm lint`", and it is self-defeating: the edit the guard exists to catch
   is a rewrite of `lint`, and that rewrite deletes the guard along with the
   thing it was guarding. **Before choosing where a check lives, ask what the
   change you fear would do to the check itself.**
2. **This repository keeps producing one defect: a rule it states and does not
   check.** BL-077 (a script nothing ran), BL-079 (a fix nothing asserted),
   BL-080 (a language nothing checked), **BL-081 (a language still unchecked in
   two files)**, and decision 0029's fourteen unchecked soft-limit breaches
   before them. **Four sessions running, and BL-080 closing produced the fifth
   instance immediately.** When you next write a rule down, write down what
   fails when it is broken.
3. **A green run of a checker does not verify the checker.** After wiring any new
   gate, break something once. Applied again this session, by hand and in six of
   the seven new cases.
4. **A session's report of a known defect's extent is only as good as the gate
   that measures it.** BL-077's central finding. Before reporting a known defect
   as unchanged, run the thing that measures it — "unchanged" and "I did not
   look" are indistinguishable, including to the session writing it.
5. **A predicted trap is worth checking even when the answer is "not there".**
   New this session. BL-080's notes warned at length that turning `tsc` on over
   `tools/` might surface the *opposite* defect — code that type-checks and will
   not run, because `--experimental-strip-types` refuses enums, namespaces and
   parameter properties. It was checked by running all four files, and **none of
   them use any of those constructs**. The warning cost five minutes and its
   answer is now a fact rather than an open worry; a session that had skipped it
   would have shipped the same change with a hole in its evidence.
