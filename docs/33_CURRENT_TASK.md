# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IDLE

No task in progress. **BL-081 is complete** (2026-09-20).

`tools/aliasResolver.mjs` and `tools/registerAliases.mjs` are `.ts` now, which
needed **no configuration change** — `tools/tsconfig.json` already said
`include: ["**/*.ts"]`. `34_DEVELOPMENT_LOG.md` 2026-09-20 and decision **0037**
carry the detail; its **Surprises** 1 and 3 are the ones worth reading.

**The first typecheck of the two found four real errors** — every parameter of
the `resolve` hook was an implicit `any`. Third consecutive item where the first
check of an unchecked file found something.

The decision is broader than the two files, and it is **asserted rather than
recorded**: this repository has exactly one hand-written JavaScript file,
`eslint.config.js`, and `tools/check-typecheck-coverage.test.ts` fails on any
other, with the exemption list checked in both directions.

Suite **372 pass / 0 fail across 90 suites**, up from 369. `lint`, `lint:rules`,
`lint:docs`, `typecheck`, `format:check` and `build` all clean.

## Next action for an agent

The topmost unblocked task in Phase 0's Ready list, per
`AI_DEVELOPMENT_WORKFLOW.md` §2.

**Read the file, do not trust this line.** In list order:

- **BL-056** is still **Phase 1** — not a candidate under phase discipline.
  Twenty-second session running.
- **BL-067** is still the one to skip, **on its own instruction** rather than on
  your judgement: `23_SAVE_SYSTEM.md` mentions `EntitySave` exactly once (§2) and
  defines it nowhere, so there is still no component-level format for its first
  criterion to presume. Re-checked 2026-09-20 — unchanged.
- **BL-082** is new this session and is the smallest of the three below. It is
  BL-081's own follow-up, exactly as BL-081 was BL-080's and BL-080 was
  BL-079's — **fourth consecutive session, and see the warning about that
  pattern below.**
- **BL-078** is the sparse-allocator blind spot, an M, and the warning about it
  still stands in full (see below).
- **BL-008** (fixed-timestep game loop) is the first substantial feature item.

Take them in the file's order, not this list's.

## Before you trust anything below, install

`pnpm install --frozen-lockfile` first. This container arrived with
`node_modules` absent **again** — sixth session running — and the first
`pnpm lint && pnpm typecheck && pnpm test` without it fails with
`ERR_MODULE_NOT_FOUND`, which reads exactly like a broken tree and is not one.
After installing, the baseline this session measured was 369/90, matching the
previous session's close-out on every count; it closed at 372/90. No lockfile
change this session.

## If you take BL-082, the block is not the only thing in that file that is stale

`eslint.config.js`'s `disableTypeChecked` block lists `tools/**/*.ts` and says
those files "are not members of any TypeScript project". That stopped being true
at decision **0036** (2026-09-19) and is one item further out of date now.

Two things worth knowing before you start:

- **Expect findings.** BL-079, BL-080 and BL-081 each ran a check over files
  nothing was checking and each found real errors on the first pass. Turning the
  type-aware lint rules on over `tools/` is the same move a fourth time. Budget
  for fixing what it reports, not for a comment edit.
- **The test-file block below it is a different concern** with its own expiry
  (BL-015 replaces `node:test` with Vitest). Do not fold them together.

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
BL-074's allowance of four sampling intervals. Green again this session, six
consecutive full runs now. **If it does go red, the number in the message is the
thing to read**: under 4096 is a new phenomenon, well over it is a real
allocation.

## Six things carried forward that a later session should not rediscover

1. **A guard cannot live inside the thing it guards.** The natural reading of
   BL-079 was "add a check to `pnpm lint`", and it is self-defeating: the edit
   the guard exists to catch is a rewrite of `lint`, and that rewrite deletes
   the guard along with the thing it was guarding. **Before choosing where a
   check lives, ask what the change you fear would do to the check itself.**
2. **This repository keeps producing one defect: a rule it states and does not
   check.** BL-077 (a script nothing ran), BL-079 (a fix nothing asserted),
   BL-080 (a language nothing checked), BL-081 (that language still unchecked in
   two files), **BL-082 (a rule turned off for a reason that expired)**, and
   decision 0029's fourteen unchecked soft-limit breaches before them. **Five
   sessions running, and BL-081 closing produced the sixth instance
   immediately.** When you next write a rule down, write down what fails when it
   is broken. BL-081 is the first of the five to answer the *general* form of its
   question rather than its instance — a one-element allowlist over
   `git ls-files` — and that is the shape to reach for.
3. **A green run of a checker does not verify the checker.** After wiring any new
   gate, break something once. Applied again this session: two deliberate type
   errors and four controls, each breaking exactly one assertion.
4. **A session's report of a known defect's extent is only as good as the gate
   that measures it.** BL-077's central finding. Before reporting a known defect
   as unchanged, run the thing that measures it — "unchanged" and "I did not
   look" are indistinguishable, including to the session writing it.
5. **A predicted trap is worth checking even when the answer is "not there".**
   BL-080's notes warned that `tsc` over `tools/` might surface code that
   type-checks and will not run under `--experimental-strip-types`. Checked by
   running all four files; none of them used any of the refused constructs. The
   warning cost five minutes and its answer is a fact rather than an open worry.
6. **Rank an option by what it touches, not by how large it sounds.** New this
   session. `allowJs` reads as the small change and converting two files as the
   large one. In fact the conversion touched **no configuration at all** — the
   existing `include` already covered the new filenames — while `allowJs` would
   have added a flag, a second language's rules, and a weaker guarantee. The
   same paragraph of BL-081's notes that predicted this also said to settle the
   loader question **by running it rather than reasoning about it**, and that
   was right too: the reasoning could have gone either way with equal confidence.
