# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `.github/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IN PROGRESS — BL-054

**Simplex noise, fbm, ridge and Poisson-disk sampling.** The topmost unblocked
task in Phase 0's Ready list, and the second half of BL-005, whose noise
criterion was split out on claim. Verified against `32_BACKLOG.md` rather than
taken from the previous handoff's convenience line.

### Acceptance criteria (from `32_BACKLOG.md`)

1. Noise output matches golden fixtures
2. Poisson-disk sampling per chunk uses `rngFor('scatter', chunkX, chunkZ)` and
   produces the same set whatever order chunks are generated in
   (`12` §"Runs in a Web Worker")
3. Output range and mean are measured and documented, not assumed

### Files expected to change

- `packages/client/src/sim/noise/Noise.ts` (new) — simplex 2D/3D, fbm, ridge
- `packages/client/src/sim/noise/PoissonDisk.ts` (new)
- their `.test.ts` siblings
- `docs/32_BACKLOG.md`, `docs/33_CURRENT_TASK.md`, `docs/34_DEVELOPMENT_LOG.md`

### The determinism decision this task turns on

`04` §3 pins "hand-rolled ... + simplex — determinism must be ours, not a
library's", and BL-005's module header makes the bit-exactness argument
precisely: every operation it uses is exactly specified by ECMA-262, and it
names reaching for `Math.sin` as a mixer as the mistake that would break it.

**Simplex noise reintroduces exactly that hazard through `Math.sqrt`.** The
skew constants are conventionally written `F2 = (sqrt(3) - 1)/2` and
`G2 = (3 - sqrt(3))/6`, and ECMA-262 specifies `Math.sqrt` as
*implementation-approximated* — the same latitude that makes `Math.sin`
unusable here. So this module computes no square root at run time: the skew
constants are committed as decimal literals, and Poisson-disk compares squared
distances. `Math.floor`, `Math.imul`, `+`, `*` and comparison are all exact.

---

---

## Last completed: BL-004 — Core math module (closed 2026-08-13 via BL-050)

All three acceptance criteria are met:

| Acceptance criterion | State |
|---|---|
| ≥ 95% unit coverage | **met** — 100% of lines and functions on all eight source modules, 96.8–100% of branches |
| Spring framerate-independent, against an analytic solution | **met** — 30/60/144 Hz and a single jump agree to 1e-12, all four agree with the closed form |
| Zero allocation, by a counter-instrumented harness | **met 2026-08-13** — all 30 operations read exactly 0 attributed bytes; see below |

Suite: **142 assertions pass, 0 fail, 0 todo** (was 131 / 0 / 16 — the 16 `todo`
were all this criterion). `pnpm lint`, `lint:rules`, `typecheck`,
`format:check`, `build` and `test:node` all pass.

### How the open criterion was closed, and why it took a second instrument

**The code was never the problem.** The `heapUsed`-rise harness measured a
process-wide quantity — the sum of heap increases across sampled points — and
divided it by *one* operation's iteration count. So any other allocation
happening in the process during that loop was charged to the operation under
measurement. That is why three to five of thirty allocation-free operations
reported exactly one returned object's worth of bytes, reproducibly, and why
**the set changed when unrelated parts of the test file changed**.

`measureAttributedAllocation` runs the operation under V8's **sampling heap
profiler**, which records a stack trace at sampled allocations. Every byte is
attributed to the code that allocated it, so another test's garbage lands under
another test's frames and cannot reach this reading. It is also independent of
when the collector runs, which is what defeated the original before/after delta.

Result: all 30 operations, **including the five the old instrument could not
clear** (`addScaled`, aliased `add`, `rotateVec3`, `union`, `stepSpring`), read
exactly **0** attributed bytes, against a control that allocates one small
object per call and reads **~115 kB** in the same process on the same runs.

### Three decisions the next session should not re-open

1. **The critically damped spring steps by the exact closed-form solution**
   rather than integrating towards it. Framerate independence is then exact
   rather than approximate, the integrator is unconditionally stable at any
   `dt` (an explicit scheme diverges above `dt = 2/ω`, which at ω = 12 is one
   dropped frame), and the acceptance criterion's "verified against an analytic
   solution" is satisfiable because it *is* the analytic solution.
2. **Numbers are hashed by their IEEE bits, not their decimal form**, because
   `String(-0) === '0'` and two world states differing by a sign of zero must
   not hash alike. That in turn surfaced BL-051.
3. **The allocation allowance is derived from the control measured in the same
   process, not from a constant.** A constant threshold cannot distinguish "this
   operation allocates nothing" from "the profiler recorded nothing" — and the
   first dead end here was an instrument whose signal was always zero, which
   passes everything. Both ways of blinding the current instrument
   (`samplingInterval` 65536, a stale `MEASURED_LOOP_NAME`) were exercised: each
   turns 13 passes into 11 failures naming the cause.

### What the new figure is not

**Not bytes per operation.** The sampling profiler under-reports absolute volume
by roughly two orders of magnitude here — 200k iterations of a ~47-byte-per-call
allocator should total ~9.4 MB and it attributes ~90–115 kB — because
young-generation allocation from optimised code mostly takes a bump-pointer fast
path V8 does not sample. That is adequate for an *allocates / does not*
criterion, where the separation measured is total (tens of thousands of bytes
versus exactly zero), and would be useless for a byte budget. If a later task
needs an actual byte figure, this instrument is the wrong one.

### Discovered work (filed, not done)
- **BL-051** — whether `-0` may reach world state, given that it hashes
  differently from `0` and is invisible in a debugger.
- **BL-052** — three hand-synced copies of the path-alias map, now that
  `tools/aliasResolver.mjs` is the third.
- **BL-053** — `--expose-gc` is no longer needed by any test, filed 2026-08-13.

### Gate gap, carried and still true
There is no Vitest and no `pnpm sim`. Tests run on `node:test` +
`node:assert/strict` — standard library, no dependency added — via
`pnpm test:node`, with coverage from Node's own
`--experimental-test-coverage`. **BL-015 should port these suites to Vitest, not
rewrite them**, and should delete `tools/aliasResolver.mjs`,
`tools/registerAliases.mjs`, the two `test:node*` scripts and the test-file
block in `eslint.config.js` together. Note BL-050 did **not** need BL-015 —
its backlog entry listed BL-015 as a dependency on the theory that Vitest might
not have the ordering problem, and the problem turned out to be the instrument
rather than the runner.

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
| BL-050 | 2026-08-13 | — | Replaced the allocation instrument with a call-site-attributed one (`HeapProfiler.startSampling`); closed BL-004's last criterion; 0 `todo` remaining; filed BL-053 |
| BL-004 | 2026-08-13 | — | Core math module — all three criteria met; see above |
| BL-003 | 2026-08-09 | — | Canvas + dpr-aware drawing buffer, React overlay (`pointer-events: none`), HMR teardown; verified against headless Chromium at dpr 1/2/3; filed BL-048/049 |
| BL-002 | 2026-08-07 | — | ESLint flat config (boundaries default-deny), Prettier per `06` §2, `pnpm lint:rules` fixture harness; filed BL-045/046/047 |
| BL-001 | 2026-08-04 | — | pnpm workspace scaffolding; `_scaffold.ts` markers under core/sim/render/ui/content to be deleted by the tasks that fill those dirs |
