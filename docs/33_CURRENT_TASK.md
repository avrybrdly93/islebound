# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IN_PROGRESS — **BL-079**

**Nothing asserts that `pnpm lint` still runs the format check.** Phase 0, size
S, depends on BL-077 (done). Topmost unblocked item in the Ready list: BL-056 is
Phase 1, and BL-067 is skipped on its own instruction (`23_SAVE_SYSTEM.md` still
defines no component-level format for its first criterion to presume — re-checked
this session, unchanged).

## Baseline, measured before any code

`pnpm install --frozen-lockfile` first — `node_modules` was absent **again**,
fourth session running. After it: **356 pass / 0 fail across 90 suites**,
matching the previous session's close-out exactly.

## The plan

1. Decide the host, and record why the two obvious ones are wrong (below).
2. Extend the test glob to cover `tools/`, and prove the guard's predicate
   against sample script strings as well as against the real `package.json`.
3. Break it on purpose before trusting it — carried-forward finding 2.
4. Verify block, docs, handoff.

## The host: why it is a test, and not the two obvious candidates

The item's own trap is that `tools/check-doc-commands.ts` already reads the root
`package.json`'s `scripts` and is run by `pnpm lint:docs` — which is **not** in
the verify block, only in the prose beneath it. Hosting the guard there
reproduces BL-077's shape one level up.

**The second candidate is worse and it is worth writing down, because it is the
one that looks obviously right.** Folding the guard into `pnpm lint` itself —
`eslint . && prettier --check . && node ... check-lint-script.ts` — **cannot
work**, and not for a reason of taste. The edit this guard exists to catch is
somebody tidying `lint` back to `eslint .`. That edit deletes the guard in the
same stroke as the format check. **A guard living inside the string it guards is
removed by the change it is meant to report.**

So the guard has to be run by a *different* member of the verify block.
`pnpm typecheck` is `pnpm -r --if-present run typecheck` and hosts no runtime
assertion, which leaves `pnpm test` — line 1 of the verify block, alongside the
other two.

`pnpm test:node` globs `packages/*/src/**/*.test.ts` only, and this is
repository-meta rather than game code, so it does not belong inside
`packages/client` or `packages/shared`. The glob gains `tools/**/*.test.ts`.
Probed before committing to the design: `node --test` accepts both patterns and
the suite reads 357 with a one-line probe file present, 356 without it.

That is also the door `tools/check-lint-rules.ts` already predicted in its own
header — "when BL-015 lands, this file is a candidate to become a `.test.ts`".
This does not move it; it only makes the location runnable.

## The residual, stated rather than left to be discovered

The guard is run by `pnpm test`, so it now depends on `test:node`'s glob the way
the format check depended on `lint`'s string. **That is a smaller hole and not a
closed one**, and it cannot be closed from inside: a guard in `tools/` cannot
notice that the glob stopped selecting `tools/`. The honest closure is BL-019's
CI running the verify block on every push, where a check that silently stops
running is visible as a job that stops reporting. Recorded here and in the log
rather than filed as a new item, because it is BL-019's content and not a new
defect.

## What is red

Nothing.

## Three things carried forward that a later session should not rediscover

1. **A session's report of a known defect's extent is only as good as the gate
   that measures it.** BL-077's central finding. Before reporting a known defect
   as unchanged, run the thing that measures it.
2. **A green run of a checker does not verify the checker.** After wiring any new
   gate, break something once. Applied in this task's step 3.
3. **Before starting a fix, grep for the thing you are about to change.**
