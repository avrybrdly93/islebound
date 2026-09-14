# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IDLE

No task in progress. **BL-079 is complete** (2026-09-14). `pnpm test` now
carries a guard that fails if the root `lint` script stops running a format
check. Decision **0036** carries the argument;
`34_DEVELOPMENT_LOG.md` 2026-09-14 has the detail, and its **Surprises** 1 is
the one worth reading before you add any file to `packages/shared/`.

Suite **359 pass / 0 fail across 91 suites**, was 356/90 — three new
assertions in one new suite, and no existing count moved. `lint`,
`lint:rules`, `lint:docs`, `typecheck`, `format:check` and `build` all clean.

## Next action for an agent

The topmost unblocked task in Phase 0's Ready list, per
`AI_DEVELOPMENT_WORKFLOW.md` §2.

**Read the file, do not trust this line.** In list order:

- **BL-056** is still **Phase 1** — not a candidate under phase discipline.
  Twentieth session running.
- **BL-067** is still the one to skip, **on its own instruction** rather than
  on your judgement: `23_SAVE_SYSTEM.md` mentions `EntitySave` exactly once
  (§2) and defines it nowhere, so there is still no component-level format for
  its first criterion to presume. Re-checked 2026-09-14 — unchanged.
- **BL-080** is new this session and is BL-079's own follow-up. **Read its
  notes before claiming it**, because the honest first move may be to close it
  by folding it into BL-019 rather than to build anything: it is the third
  retelling of BL-077's shape, and it is the first one with no fix available
  inside the repository. See below.
- **BL-078** is the sparse-allocator blind spot, an M, and the previous
  handoff's warning about it still stands in full (see below).
- **BL-008** (fixed-timestep game loop) is the first substantial feature item,
  and is the first *feature* on this list rather than another piece of
  scaffolding. Three consecutive sessions have now closed S-sized hygiene
  items. That is not a reason to skip the list order, but it is worth a
  session noticing.

Take them in the file's order, not this list's.

## On BL-080 specifically, because it is easy to take wrongly

BL-079 moved the format-check guard under `pnpm test`, which closes the `lint`
hole and opens a smaller one exactly one level up: nothing guards the `test`
script. **That regress is real, and it is also the last one**, because every
runner in this repository is described by a string that somebody can edit in
the repository it runs on. It terminates at CI — **BL-019** — which is the
only runner that is not.

So BL-080 may well not be independent work. **Check BL-019's own acceptance
criteria first** and, if they already cover it, say so and close BL-080 against
BL-019 rather than building a fourth guard. And note that criterion 2 forbids
the move that closed BL-079: hosting a `test`-script guard under `pnpm lint`
works, and then needs its own guard the moment somebody edits `lint`. That is
circular, not terminating.

## Before you trust anything below, install

`pnpm install --frozen-lockfile` first. This container arrived with
`node_modules` absent **again** — fourth session running — and the first
`pnpm lint && pnpm typecheck && pnpm test` without it fails with
`ERR_MODULE_NOT_FOUND`, which reads exactly like a broken tree and is not one.
After installing, the baseline was 356/356 across 90 suites, matching the
previous session's close-out on every count.

## Run the whole verify block, not the part about the thing you wrote

New this session, and it cost a rewrite. **A green `pnpm test` says nothing
about whether a new file's imports resolve.** `node --test` strips types and
never resolves them, so a file importing `node:fs` from `packages/shared/` runs
green and then fails `pnpm typecheck` and `pnpm lint` with four unresolvable
`node:` imports — `@types/node` is a devDependency of `client` only. If you add
a file to a package you have not added files to before, run all three.

## What is no longer red, and what still is

1. **`pnpm format:check` is green on the whole tree**, it is reached by
   `pnpm lint`, and as of this session **something fails if that wiring is
   removed**. The verify block's first line now covers formatting and covers
   its own coverage.
2. **The `allocation.test.ts` 1-in-20 remains fixed rather than mitigated** —
   BL-074's allowance of four sampling intervals. Four consecutive green full
   runs then, one more this session. **If it does go red, the number in the
   message is the thing to read**: under 4096 is a new phenomenon, well over it
   is a real allocation.
3. **`tools/check-sim-purity.ts` still does not exist** — BL-017 — and
   `CLAUDE.md`, `06` and `Rng.ts` still refer to it in the present tense. The
   lint half of that sentence is what enforces `sim/` purity for now.
