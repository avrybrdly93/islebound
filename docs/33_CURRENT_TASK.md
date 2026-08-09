# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `.github/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IN_PROGRESS

## Current task
**BL-004** — Core math module
- **Phase:** 0
- **Started:** 2026-08-09
- **Branch:** `claude/ecstatic-bohr-8728fv` (merged to `main`)
- **Docs read:** 07, 05, 06, 29, 35, 08 §9, 04 §5
- **Estimated size:** M

### Where it stands: code complete, two of three criteria met, one open

Everything is landed, green and pushed. `pnpm lint`, `lint:rules`, `typecheck`,
`format:check`, `build` and `test:node` all pass; 131 assertions pass, 0 fail,
16 are `todo` and every one of those is BL-050.

| Acceptance criterion | State |
|---|---|
| ≥ 95% unit coverage | **met** — 100% of lines and functions, 96.8–100% of branches on all eight modules |
| Spring framerate-independent, against an analytic solution | **met** — 30/60/144 Hz and a single jump agree to 1e-12, all four agree with the closed form |
| Zero allocation, by a counter-instrumented harness | **not signed off** — BL-050 |

### What landed

`packages/client/src/core/math/`: `scalar.ts`, `vec2.ts`, `vec3.ts`,
`quat.ts`, `aabb.ts`, `easing.ts`, `spring.ts`, `hash.ts`, plus
`allocationHarness.ts` and seven co-located `*.test.ts`. `core/_scaffold.ts` is
deleted — its comment asked for exactly this module.

Two decisions the next session should not re-open:

1. **The critically damped spring steps by the exact closed-form solution**
   rather than integrating towards it. Framerate independence is then exact
   rather than approximate, the integrator is unconditionally stable at any
   `dt` (an explicit scheme diverges above `dt = 2/ω`, which at ω = 12 is one
   dropped frame), and the acceptance criterion's "verified against an analytic
   solution" is satisfiable because it *is* the analytic solution.
2. **Numbers are hashed by their IEEE bits, not their decimal form**, because
   `String(-0) === '0'` and two world states differing by a sign of zero must
   not hash alike. That in turn surfaced BL-051.

### The open criterion, stated precisely

`allocationHarness.ts` is a **working instrument**: its control detects a
deliberate per-call allocation at ~47 bytes/op and reports ~0.2 for an
operation that writes into a caller-owned object. Getting there took discarding
three harness designs, each caught by that control and each written up in the
module so they are not retried.

What it cannot do is give a stable per-operation reading. Three to five of
thirty operations report exactly one returned-object's worth of bytes,
reproducible to two decimal places — **and the set changes when unrelated parts
of the test file change**. `normalize` measured clean and `addScaled` dirty;
after moving five cases into a `todo` block, touching neither, they swapped. An
effect that depends on a test's position in a file is not a property of the code
under test. The same calls in an isolated script measure 0.01–0.10 bytes/op,
and every operation's source plainly creates no object.

So the operations are very probably allocation-free — and "very probably" is
not the standard an acceptance criterion is signed off against, which is why
the per-operation suites are `todo` with their measurements recorded rather
than passing, deleted, or measured against a loosened bound.

### Next action for an agent

**Finish BL-004 by doing BL-050**, which is all that is left of it. Read
`allocationHarness.ts` first — it lists what has already been eliminated by
measurement, so the obvious approaches are all dead ends. The two untried ones
are `node:inspector`'s `HeapProfiler.startSampling` (reports allocation by call
site, independent of collector timing) and one child process per measurement.
Note also that BL-015 replaces the runner entirely, and Vitest may simply not
have the problem — if BL-050 resists, doing BL-015 first is defensible, and it
is the very next task anyway.

### Discovered work (filed, not done)
- **BL-050** — the above.
- **BL-051** — whether `-0` may reach world state, given that it hashes
  differently from `0` and is invisible in a debugger.
- **BL-052** — three hand-synced copies of the path-alias map, now that
  `tools/aliasResolver.mjs` is the third.

### Gate gap, carried and still true
There is no Vitest and no `pnpm sim`; BL-015 depends on BL-004, so it could not
come first. Tests run on `node:test` + `node:assert/strict` — standard library,
no dependency added — via `pnpm test:node`, with coverage from Node's own
`--experimental-test-coverage`. **BL-015 should port these suites to Vitest,
not rewrite them**, and should delete `tools/aliasResolver.mjs`,
`tools/registerAliases.mjs`, the two `test:node*` scripts and the test-file
block in `eslint.config.js` together.

### Blockers
- None. BL-050 is open work, not a blocker: it needs a different measurement
  technique, not a decision or an approval.

---

## Template — copy this block when starting a task

```markdown
## Status: IN_PROGRESS

## Current task
**BL-###** — Short title
- **Phase:** N
- **Started:** YYYY-MM-DD
- **Branch:** phase-N/short-description
- **Docs read:** 04, 05, 06, 13
- **Estimated size:** M

### Plan
1. …
2. …
3. …

### Progress
- [x] Step 1 — done, commit abc1234
- [ ] Step 2 — in progress
- [ ] Step 3

### Decisions made during implementation
- Chose X over Y because … (add to `40_DECISION_LOG.md` if architecturally significant)

### Discovered work (added to backlog, NOT done in this task)
- BL-046 — …

### Blockers
- None

### Notes for the next session
Anything a fresh agent would need to resume from here without reading the diff.
```

---

## If you are BLOCKED

Set `Status: BLOCKED`, fill in the section below, then **stop working on this task**. Pick a different unblocked task from the backlog and start a new entry — do not leave the project idle, and do not attempt to work around an architectural blocker unilaterally.

```markdown
### Blocked on
- **What:** the specific thing preventing progress
- **Why it can't be worked around:** …
- **Options considered:**
  1. … (cost, risk)
  2. … (cost, risk)
- **Recommendation:** …
- **Needs:** human decision | asset | dependency approval | architecture change approval
```

Blockers requiring human input include: any change to `04_TECHNICAL_ARCHITECTURE.md` §3 or §5, any new runtime dependency, any change to a critical test (`29_TESTING_STRATEGY.md` §4), any change to `00_PROJECT_VISION.md`, and anything that would break save compatibility.

---

## Recently completed

*(last 5 tasks, newest first — full history lives in `34_DEVELOPMENT_LOG.md`)*

| Task | Completed | PR | Notes |
|---|---|---|---|
| BL-003 | 2026-08-09 | — | Canvas + dpr-aware drawing buffer, React overlay (`pointer-events: none`), HMR teardown; verified against headless Chromium at dpr 1/2/3; filed BL-048/049 |
| BL-002 | 2026-08-07 | — | ESLint flat config (boundaries default-deny), Prettier per `06` §2, `pnpm lint:rules` fixture harness; filed BL-045/046/047 |
| BL-001 | 2026-08-04 | — | pnpm workspace scaffolding; `_scaffold.ts` markers under core/sim/render/ui/content to be deleted by the tasks that fill those dirs |
