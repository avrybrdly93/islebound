# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IN PROGRESS — BL-080

**Nothing type-checks `tools/`, and four TypeScript files live there.**
Claimed 2026-09-19, before any code, per `AI_DEVELOPMENT_WORKFLOW.md` §2.

Taken as the **topmost unblocked Phase 0 item in `32_BACKLOG.md`'s Ready
order**, checked in the file rather than inherited from the last handoff:
BL-056 is Phase 1 (phase discipline bars it, twenty-first session running),
BL-067 still says on its own face not to take it until `23_SAVE_SYSTEM.md` has
a component-level format and it still has none, and BL-080 is next.

### The mechanism decided before writing it, so the run is measured against something

Four ways to reach `tools/*.ts` with a type-checker, and the item asks for the
choice **and** the rejections:

1. **Make `tools/` a workspace package with its own `tsconfig.json` and
   `typecheck` script.** Chosen. `pnpm typecheck` is
   `pnpm -r --if-present run typecheck`, so a package answering that script is
   reached **by construction** rather than by a string somebody has to remember
   to keep. It is also the shape every other type-checked thing here already
   has: `packages/client` and `packages/shared` each own a `tsconfig.json` and
   the same one-line script.
2. **A root `tsconfig.json` plus `tsc --noEmit -p . && pnpm -r ...` in the root
   script.** Rejected, and *not* on taste: the root has no `typescript` at all
   (only `packages/client` does, 5.9.3), so this needs the same dependency
   addition as option 1 **and** a root script edit on top — strictly more
   change for a weaker guarantee, since the reach then depends on one string.
3. **Add `tools/` to an existing package's `include`.** Rejected: `04` §5's
   direction rules put `tools/` outside both packages, and it would make
   `packages/client`'s typecheck fail on a repository script.
4. **`typeRoots` pointing into `packages/client/node_modules/@types`.**
   Rejected: it reaches across a package boundary into another package's
   installed tree, which is exactly the kind of edge nothing else here has.

### What this run must check that the criteria do not say outright

`node --experimental-strip-types` runs every `tools/*.ts` file today and it
**erases** types rather than checking them — and it refuses some constructs
`tsc` accepts (enums, namespaces, parameter properties). So turning `tsc` on can
surface the *opposite* failure. **All four files get run after the change, not
just compiled.**

### Acceptance, restated as what will be shown

- [ ] every `.ts` under `tools/` type-checked by something `pnpm typecheck` reaches
- [ ] the mechanism stated, with the three rejected options and why
- [ ] verified able to fail: a real type error reported, then removed
- [ ] the reverse direction checked: all four files still **run** under `--experimental-strip-types`
- [ ] a guard, as BL-079 left one, so the next edit that silently unhooks `tools/` fails

`tools/*.mjs` (`aliasResolver.mjs`, `registerAliases.mjs`) is **out of scope and
stated rather than overlooked**: the criterion says every `.ts`, and pulling
JavaScript in needs `allowJs` and a checking decision of its own.

---

## Next action for an agent

The topmost unblocked task in Phase 0's Ready list, per
`AI_DEVELOPMENT_WORKFLOW.md` §2.

**Read the file, do not trust this line.** In list order:

- **BL-056** is still **Phase 1** — not a candidate under phase discipline.
  Twentieth session running.
- **BL-067** is still the one to skip, **on its own instruction** rather than on
  your judgement: `23_SAVE_SYSTEM.md` mentions `EntitySave` exactly once (§2) and
  defines it nowhere, so there is still no component-level format for its first
  criterion to presume. Re-checked 2026-09-15 — unchanged.
- **BL-080** is new this session and is the smallest of the three below. It is
  BL-079's own follow-up: nothing type-checks `tools/`.
- **BL-078** is the sparse-allocator blind spot, an M, and the warning about it
  still stands in full (see below).
- **BL-008** (fixed-timestep game loop) is the first substantial feature item.

Take them in the file's order, not this list's.

## Before you trust anything below, install

`pnpm install --frozen-lockfile` first. This container arrived with
`node_modules` absent **again** — fourth session running — and the first
`pnpm lint && pnpm typecheck && pnpm test` without it fails with
`ERR_MODULE_NOT_FOUND`, which reads exactly like a broken tree and is not one.
After installing, the baseline this session measured was 356/90, matching the
previous session's close-out on every count; it closed at 363/90.

## If you take BL-080, two things before you start

1. **Check both directions, not one.** `node --experimental-strip-types` (which
   is how every `tools/*.ts` file runs today) refuses some constructs `tsc`
   accepts — enums, namespaces, parameter properties. So switching `tsc` on over
   `tools/` can surface the *opposite* failure from the one the item is about:
   code that type-checks cleanly and will not run. Run the four files after
   changing anything, not just the compiler.
2. **The four files are `check-lint-rules.ts`, `check-doc-commands.ts`,
   `check-workflow-doc.ts` and `check-lint-script.test.ts`.** The last is
   BL-079's and is the one that made the gap visible.

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

## Four things carried forward that a later session should not rediscover

1. **A guard cannot live inside the thing it guards.** New this session and the
   most transferable thing in it. The natural reading of BL-079 was "add a check
   to `pnpm lint`", and it is self-defeating: the edit the guard exists to catch
   is a rewrite of `lint`, and that rewrite deletes the guard along with the
   thing it was guarding. **Before choosing where a check lives, ask what the
   change you fear would do to the check itself.**
2. **This repository keeps producing one defect: a rule it states and does not
   check.** BL-077 (a script nothing ran), BL-079 (a fix nothing asserted),
   BL-080 (a language nothing checks), and decision 0029's fourteen unchecked
   soft-limit breaches before them. Three sessions running. When you next write
   a rule down, write down what fails when it is broken — or expect to meet it a
   fifth time.
3. **A green run of a checker does not verify the checker.** After wiring any new
   gate, break something once. Applied again this session, by hand and in six of
   the seven new cases.
4. **A session's report of a known defect's extent is only as good as the gate
   that measures it.** BL-077's central finding. Before reporting a known defect
   as unchanged, run the thing that measures it — "unchanged" and "I did not
   look" are indistinguishable, including to the session writing it.
