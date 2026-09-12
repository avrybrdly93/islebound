# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IDLE

No task in progress. **BL-074 is complete** (2026-09-12), and **BL-057 closed
with it** — they are the same defect, filed four weeks apart by two sessions
that each measured it independently. The allocation allowance is now four
sampling intervals rather than `controlBytes / 100`, the control asserts the
*gap* around it instead of setting it, and `EventBus.queued.test.ts` has lost
the `repeats: 6` mitigation it carried for the same problem. Decision **0034**
carries the argument. See `34_DEVELOPMENT_LOG.md` 2026-09-12 — its
**Surprises** 1 and 4 are the ones worth reading.

Suite **353 → 356 pass / 0 fail across 90 suites**, green on **three
consecutive full runs**. `lint`, `lint:rules`, `lint:docs` and `typecheck` all
clean.

## Next action for an agent

The topmost unblocked task in Phase 0's Ready list, per
`AI_DEVELOPMENT_WORKFLOW.md` §2.

**Read the file, do not trust this line.** In list order:

- **BL-056** is still **Phase 1** — not a candidate under phase discipline.
  Eighteenth session running.
- **BL-067** is still the one to skip, **on its own instruction** rather than
  on your judgement: `23_SAVE_SYSTEM.md` mentions `EntitySave` exactly once
  (§2) and defines it nowhere, so there is still no component-level format for
  its first criterion to presume. Re-checked 2026-09-12.
- **BL-077** is now the topmost that is actually ready, BL-074 having closed.

Then **BL-078** (new this session), then **BL-008**.

## Before you trust anything below, install

`pnpm install --frozen-lockfile` first. This container arrived with
`node_modules` absent again, and the first `pnpm lint && pnpm typecheck &&
pnpm test` without it fails with `ERR_MODULE_NOT_FOUND` — which reads exactly
like a broken tree and is not one. After installing, the baseline was 353/353
across 90 suites, matching the previous session's close-out on every count.

## The red run you no longer need to worry about, and the one you still do

1. **The `allocation.test.ts` 1-in-20 is fixed, not mitigated.** It failed
   because `controlBytes / 100` was **less than one sampling interval** — 549
   to 1020 bytes against a 1024-byte quantum — so a single stray sample always
   cleared it. The allowance is now 4096. Three consecutive full runs are
   green, which is not proof at a 1-in-20 base rate, but the arithmetic is:
   a stray of one sample is 1024 and the bound is four of them. **If it does go
   red again, the number in the message is the thing to read** — under 4096 is
   a new phenomenon, well over it is a real allocation.
2. **`pnpm format:check` is still red on `main`**, on two files nobody has
   formatted (`Query.test.ts`, `Query.defTypes.test.ts`). That is **BL-077**,
   untouched by this task and now the topmost ready item. The reason it goes
   unnoticed is still the useful part: **the verify block does not contain
   `format:check`**, so a session can report "all clean" truthfully while it
   fails. `pnpm format` is safe on both (re-checked: it *shrinks*
   `Query.test.ts`, so the 500-line limit is not in play).

## If you take BL-077, two things this session learned that bear on it

- Its second criterion — "something runs it that a session cannot forget" — is
  the half that matters, and **`pnpm lint:docs` is the precedent to copy**:
  decision 0033 wired a new check as a second command under an existing script
  precisely because a new `pnpm lint:*` would need adding to the verify blocks
  to be run at all, which is how BL-077 happened in the first place.
- Say whether BL-019 (CI) absorbs it, as its own notes ask.

## If you take BL-078, read the harness's options table before choosing an axis

BL-078 is the blind spot BL-074 deliberately left: the boundary separates
"allocates once per call" from "one stray sample" but **not** from "allocates
once per thousand calls", which reads 4224–11 648 against a 4096 bound.

The trap is that it looks like a constant to retune and is not. **Raising
`MAX_STRAY_SAMPLES` moves the boundary the wrong way, and lowering it
re-creates BL-074.** It needs a different instrument, and the two obvious axes
— a longer window and a finer `samplingInterval` — both have measured failure
modes already recorded in `allocationHarness.ts`: at interval 16 an
allocation-free operation read 904 bytes where 64–8192 all read exactly 0, and
a warm-up of 200 000 made the **control** read 0 in one pass of three. There is
also no room above: the gap assertion caps the allowance at **6** intervals on
this container, measured, so the boundary cannot simply be moved up.

## Two things carried forward that a later session should not rediscover

1. **A filing that names a symptom and a filing that names a cause do not look
   alike in a backlog index.** BL-074 (the symptom: a 1-in-20 flake) and
   BL-057 (the cause: the allowance is below one sample) sat open together for
   a month, and `EventBus.queued.test.ts` carried a twenty-line comment
   diagnosing it and a local workaround the whole time. What found it was
   `grep` for the function name, not reading the backlog. **Before starting a
   fix, grep for the thing you are about to change** — the tree may already
   know.
2. **Worker threads do not reproduce profiler contention.** Four hog threads
   allocating continuously produced 80 of 80 readings of exactly 0 for
   allocation-free operations, because the sampling heap profiler attributes by
   stack *within an isolate* and a worker is a different isolate. If you need
   to reproduce a stray sample, same-isolate pressure (tier-up, deopt) is the
   mechanism; CPU competition from another process is not. The probe is still
   worth running for the other half of the picture: the **control** does rise
   under contention, 77 280–101 952 against 54 912–67 584 idle.
