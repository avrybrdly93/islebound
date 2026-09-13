# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IDLE

No task in progress. **BL-077 is complete** (2026-09-13). `pnpm format:check`
is clean on the whole tree, and `pnpm lint` now runs `eslint .` followed by
`prettier --check .` so it cannot go unrun again. Decision **0035** carries the
argument; `34_DEVELOPMENT_LOG.md` 2026-09-13 has the detail, and its
**Surprises** 1 is the one worth reading.

Suite **356 pass / 0 fail across 90 suites**, unchanged — the change touched no
runtime code, only whitespace inside four test files and one `package.json`
string. `lint`, `lint:rules`, `lint:docs`, `typecheck`, `format:check` and
`build` all clean.

## Next action for an agent

The topmost unblocked task in Phase 0's Ready list, per
`AI_DEVELOPMENT_WORKFLOW.md` §2.

**Read the file, do not trust this line.** In list order:

- **BL-056** is still **Phase 1** — not a candidate under phase discipline.
  Nineteenth session running.
- **BL-067** is still the one to skip, **on its own instruction** rather than
  on your judgement: `23_SAVE_SYSTEM.md` mentions `EntitySave` exactly once
  (§2) and defines it nowhere, so there is still no component-level format for
  its first criterion to presume. Re-checked 2026-09-13 — unchanged.
- **BL-079** is new this session and is the smallest of the three below. It is
  BL-077's own follow-up: nothing asserts that `pnpm lint` keeps running the
  format check.
- **BL-078** is the sparse-allocator blind spot, an M, and the previous
  handoff's warning about it still stands in full (see below).
- **BL-008** (fixed-timestep game loop) is the first substantial feature item.

Take them in the file's order, not this list's.

## Before you trust anything below, install

`pnpm install --frozen-lockfile` first. This container arrived with
`node_modules` absent **again** — third session running — and the first
`pnpm lint && pnpm typecheck && pnpm test` without it fails with
`ERR_MODULE_NOT_FOUND`, which reads exactly like a broken tree and is not one.
After installing, the baseline was 356/356 across 90 suites, matching the
previous session's close-out on every count.

## What is no longer red, and what still is

1. **`pnpm format:check` is green on the whole tree**, and it is now reached by
   `pnpm lint`. This is the first session in a while that can say the verify
   block covers formatting.
2. **The `allocation.test.ts` 1-in-20 remains fixed rather than mitigated** —
   BL-074's allowance of four sampling intervals. Three consecutive green full
   runs then, one more this session. **If it does go red, the number in the
   message is the thing to read**: under 4096 is a new phenomenon, well over it
   is a real allocation.
3. **Nothing is currently red.**

## If you take BL-079, the trap is named in the item and is worth repeating

The obvious host is `tools/check-doc-commands.ts`, which already reads the root
`package.json`'s `scripts`. It is run by `pnpm lint:docs` — and **`lint:docs`
is not in the verify block either**; it is named in the prose beneath it. So
hosting the guard there reproduces BL-077's exact shape one level up: a check
that exists and that nothing is obliged to run.

The honest options are a guard under `pnpm lint` itself, or BL-019's CI, or
both. Say which and why, as decision 0035 says its own choice.

## If you take BL-078, read the harness's options table before choosing an axis

Unchanged from the previous handoff and still accurate. BL-078 is the blind
spot BL-074 deliberately left: the boundary separates "allocates once per call"
from "one stray sample" but **not** from "allocates once per thousand calls",
which reads 4224–11 648 against a 4096 bound.

The trap is that it looks like a constant to retune and is not. **Raising
`MAX_STRAY_SAMPLES` moves the boundary the wrong way, and lowering it
re-creates BL-074.** It needs a different instrument, and the two obvious axes
— a longer window and a finer `samplingInterval` — both have measured failure
modes already recorded in `allocationHarness.ts`: at interval 16 an
allocation-free operation read 904 bytes where 64–8192 all read exactly 0, and
a warm-up of 200 000 made the **control** read 0 in one pass of three. There is
also no room above: the gap assertion caps the allowance at **6** intervals on
this container, measured, so the boundary cannot simply be moved up.

Note `allocationHarness.ts` sits at **496 of its 500 allowed lines** (decision
0034), so whatever BL-078 adds needs a seam rather than a paragraph.

## Three things carried forward that a later session should not rediscover

1. **A session's report of a known defect's extent is only as good as the gate
   that measures it.** This is BL-077's central finding and it generalises past
   formatting. BL-074's session wrote "still red on BL-077's two files,
   unchanged and not this task's" while its own commit was making it four. The
   statement was made in good faith; without a gate, "unchanged" means "I did
   not look", and **it is indistinguishable from "I looked and it was
   unchanged" — including to the session writing it.** Before reporting a known
   defect as unchanged, run the thing that measures it.
2. **A green run of a checker does not verify the checker.** BL-069's Surprise
   1 said "a green lint does not verify a lint rule"; this session needed it
   one level up — a green `pnpm lint` does not verify that `pnpm lint` checks
   formatting. The wiring was made to fail on demand before it was trusted.
   After wiring any new gate, break something once.
3. **Before starting a fix, grep for the thing you are about to change** —
   carried from the previous handoff, and it earned its place again: `git log`
   on the two unexpected files is what turned "the item says two, I see four"
   from a discrepancy into the item's best argument.
