# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IDLE

No task in progress. **BL-083 is complete** (2026-09-23).

Something now asserts that the type-aware lint rules stay on over `tools/`.
`34_DEVELOPMENT_LOG.md` 2026-09-23 and decision **0039** carry the detail; its
**Surprises 1 and 3** are the ones worth reading.

**What landed:** `tools/type-aware-fixtures/unnecessary-condition.ts`, a fifth
row in `tools/check-lint-rules.ts`'s `EXPECTATIONS`, and the directory added to
`eslint.config.js`'s `ignores` with a comment at the top saying how the two
fixture directories differ. No production code touched. `pnpm lint:rules` went
**4 → 5 fixtures caught**; the suite is unchanged at **372 pass / 0 fail across
90 suites**, which is why BL-084 exists.

**The thing that will bite the next person who touches that block:** there are
now **two** fixture directories and they are exempt in opposite ways.
`tools/lint-fixtures/**` is in `ignores` **and** in the `disableTypeChecked`
block **and** outside `tools/tsconfig.json` — it must stay all three, or its
files fail to parse and the four syntactic rules report nothing (BL-082 measured
that).  `tools/type-aware-fixtures/**` is in `ignores` **only** — put it in
either of the other two and its rule reports nothing instead. The top of
`eslint.config.js` says which is which and how to choose; read it before adding
a fixture.

`lint`, `typecheck`, `test`, `lint:rules` and `lint:docs` all clean.

## Next action for an agent

**Read `32_BACKLOG.md` in its own order, do not trust this list.** But read the
paragraph after it before you choose, because this is the sixth time.

- **BL-056** is still **Phase 1** — not a candidate under phase discipline.
  Twenty-fourth session running.
- **BL-067** is still the one to skip, **on its own instruction** rather than on
  your judgement: `23_SAVE_SYSTEM.md` mentions `EntitySave` exactly once (§2) and
  defines it nowhere, so there is still no component-level format for its first
  criterion to presume. Re-checked 2026-09-23 — unchanged.
- **BL-084** is new this session and is BL-083's own follow-up. **Six
  consecutive sessions of that pattern. See below.**
- **BL-078** is the sparse-allocator blind spot, an M, and the warning about it
  still stands in full (see below).
- **BL-008** (fixed-timestep game loop) is the first substantial feature item.

## Do not take BL-084. Take BL-078 or BL-008.

This is not a suggestion this session invented; it is the previous handoff's
own standing instruction, and its condition has now been met. It said: *if it
generates a sixth follow-up, strongly consider filing that one and taking
BL-078 or BL-008 instead.* BL-083 generated exactly that sixth follow-up
(BL-079 → BL-080 → BL-081 → BL-082 → BL-083 → BL-084), so the instruction
fires.

Every one of those six was a real defect and every one closed properly, so no
individual choice was wrong — which is precisely why the chain is hard to stop
one item at a time. **Phase 0's feature items have not moved in six sessions.**

**BL-084 is also the one follow-up in the chain that is genuinely fine to
leave.** It depends on **BL-019** (CI pipeline) rather than racing it, because
CI can run every gate by name and makes the item moot. Two of its three obvious
answers are already rejected *with measured reasons* in its notes, so whoever
does take it starts from the third rather than from scratch.

If you take BL-084 anyway, do it knowing that is a choice against this
paragraph, and say so in `34`.

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

## Before you trust anything below, install

`pnpm install --frozen-lockfile` first. This container arrived with
`node_modules` absent **again** — eighth session running — and the first
`pnpm lint && pnpm typecheck && pnpm test` without it fails with
`ERR_MODULE_NOT_FOUND`, which reads exactly like a broken tree and is not one.
After installing, the baseline this session measured was 372/90, matching the
previous session's close-out on every count; it closed at 372/90. No lockfile
change this session.

## What is red

Nothing.

The **`allocation.test.ts` 1-in-20 remains fixed rather than mitigated** —
BL-074's allowance of four sampling intervals. Green again this session, eight
consecutive full runs now. **If it does go red, the number in the message is the
thing to read**: under 4096 is a new phenomenon, well over it is a real
allocation.

## Eight things carried forward that a later session should not rediscover

1. **A guard cannot live inside the thing it guards.** BL-079's finding, and it
   decided a real question again this session: chaining `pnpm lint:rules` into
   `pnpm lint` is exactly how 0033 and 0035 made `format:check` unskippable,
   and it is wrong here, because `lint:rules` exists to catch a broken
   `eslint.config.js` and the edit it guards against would delete the guard
   with it. **Before choosing where a check lives, ask what the change you fear
   would do to the check itself.**
2. **This repository keeps producing one defect: a rule it states and does not
   check.** BL-077, BL-079, BL-080, BL-081, BL-082, BL-083, and now **BL-084 (an
   assertion nothing runs)**, plus decision 0029's fourteen unchecked soft-limit
   breaches before them. **Seven sessions running.** When you next write a rule
   down, write down what fails when it is broken — and then ask what runs *that*.
3. **A green run of a checker does not verify the checker.** After wiring any new
   gate, break something once. Applied again this session.
4. **A session's report of a known defect's extent is only as good as the gate
   that measures it** (BL-077). "Unchanged" and "I did not look" are
   indistinguishable, including to the session writing it.
5. **A predicted trap is worth checking even when the answer is "not there"**
   (BL-080).
6. **Rank an option by what it touches, not by how large it sounds — and find
   out by running it.** BL-081's finding, and **this is now the third
   consecutive item whose predicted configuration change turned out to be
   zero**: `tools/tsconfig.json` needed no edit for the new fixture directory,
   because its `include` is already `"**/*.ts"`.
7. **A control has to be checked against the thing it is controlling for, not
   merely observed to fail** (BL-082). **Sharpened this session, and it is the
   most useful thing here:** BL-082 recorded a failed `no-unnecessary-condition`
   probe as a miss, because it reported the stylistic `no-inferrable-types`
   instead. The rule was never the problem — **the shape of the violation was**.
   An annotated initializer attracts a stylistic rule first; a comparison
   against `undefined` on a non-nullable type attracts only the type-aware one.
   **A control that fails for the wrong reason is fixed by changing the probe,
   not by abandoning the rule.**
8. **When one glob covers two populations for one stated reason, check the
   reason against each separately** (BL-082). The corollary that arrived this
   session: once they *are* separate, say at the site which is which. There are
   now two fixture directories with opposite exemptions, and the comment at the
   top of `eslint.config.js` exists so nobody has to derive that from two
   backlog items and a decision entry.
