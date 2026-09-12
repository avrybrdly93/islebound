# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IN_PROGRESS — BL-074

`allocation.test.ts` fails about one run in twenty, on whichever operation
catches a stray sample. Taken as the topmost unblocked Phase 0 task, per
`AI_DEVELOPMENT_WORKFLOW.md` §2, and exactly as the previous handoff predicted
it would be: BL-056 is Phase 1, BL-067 skips on its own instruction, BL-074 is
next.

Baseline on the untouched tree, after `pnpm install --frozen-lockfile`:
**353 pass / 0 fail across 90 suites**, `lint` and `typecheck` clean. The
allocation flake did **not** fire in the baseline run, which is consistent with
1 in 20 and is not evidence it is gone.

## The root cause, measured before any code was written

The backlog says "the allowance lands near [the stray-sample floor] whenever
the control reads low". **That is too kind. On this machine it lands below it,
always.**

`allocationAllowanceFromControl` returns `controlBytes / 100`, and the
profiler's `samplingInterval` is **1024 bytes**. A stray sample cannot weigh
less than one interval. So the allowance is a tolerance of **less than one
sample** whenever the control reads under 102 400 — and every control reading
taken this session is under it:

| condition | control | allowance = control/100 | samples tolerated |
|---|---|---|---|
| idle, 10 rounds | 54 912 – 67 584 | 549 – 676 | **0.54 – 0.66** |
| 4 allocating hog threads, 8 rounds | 77 280 – 101 952 | 773 – 1020 | **0.75 – 1.00** |

BL-065's two observed failures were `clamp` at **1344** against an allowance of
**635**, and `stepSpring3` at **1040** against **718** — both are one sample,
and both were always going to fail. The harness's own comment calls the factor
of 100 "slack in the middle of a two-order-of-magnitude gap"; there is no slack
at all, because the allowance sits **under the quantum the instrument can even
report**. That is why it is machine- and load-dependent rather than constant:
the docs' reference machine read ~115 000, which is the only regime where
`control/100` clears one sample, and it clears it by 12%.

## What the same measurements say the boundary should be

Idle, 10 rounds, default options — every allocation-free operation read
**exactly 0**, 50 of 50; under 4 hog threads, **80 of 80**. The separation is
not marginal, and the right unit for a tolerance is the **sample**, not the
byte:

| case | attributed | in samples |
|---|---|---|
| allocation-free (130 readings) | 0 | 0 |
| worst stray ever observed (BL-065, real full-suite load) | 1344 | 1.3 |
| 1 allocation per 10 000 calls | 0 – 3200 | 0 – 3.1 |
| 1 allocation per 1000 calls | 4224 – 11 648 | 4.1 – 11.4 |
| **per call** (the control) | 54 912 – 101 952 | **53.6 – 99.6** |

## Plan

1. Replace `allocationAllowanceFromControl` with an allowance expressed in
   **sampling intervals** and independent of the control's magnitude —
   criterion 3's "removed" branch rather than its "stated" branch.
2. Keep the control, and keep it gating the run. BL-050's first dead end was a
   harness whose signal was always zero, and the control is what rules that
   out. It moves from *deriving* the allowance to *asserting the gap*: the
   instrument must resolve a per-call allocator to many times the allowance,
   checked in the same process.
3. Make "verified able to fail" a **permanent test** rather than a one-off
   manual perturbation, per BL-069's and BL-063's precedent: run the
   deliberate allocator through the same assertion path the operations use and
   assert it is rejected.
4. Write the limit down. A boundary that separates "per call" from "one stray
   sample" does **not** separate "per call" from "once per thousand calls" —
   4224 is too close to a few stray samples to discriminate. That is an honest
   caveat and belongs in the module beside the escape-analysis one, not in a
   commit message.
5. Docs: `32` (close), `33` (this file → IDLE), `34` (entry + Surprises), `40`
   (the decision, since it changes what an acceptance criterion is graded by).

## Still true, carried forward from the previous handoff

- **`pnpm format:check` is red on `main`** on `Query.test.ts` and
  `Query.defTypes.test.ts` — that is **BL-077**, untouched by this task, and it
  goes unnoticed because the verify block does not contain `format:check`.
- **BL-056** is Phase 1; **BL-067** skips on its own instruction
  (`23_SAVE_SYSTEM.md` mentions `EntitySave` once and defines it nowhere).
