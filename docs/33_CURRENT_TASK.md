# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `.github/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IN_PROGRESS

## Current task
**BL-004** — Core math module
- **Phase:** 0
- **Started:** 2026-08-09
- **Branch:** `claude/ecstatic-bohr-8728fv`
- **Docs read:** 07 (§1, §3, §7, §8, §10), 05 (§8 layout, file/naming table), 06, 29 (§4, §6, §7), 35, 08 §9 (spring arm), 04 §5 (boundaries)
- **Estimated size:** M

### Plan
1. `core/math/scalar.ts` — `lerp`, `inverseLerp`, `clamp`, `clamp01`, `smoothstep`, `smootherstep`, `moveTowards`, `damp`, `approximately`, angle helpers.
2. `core/math/vec2.ts`, `vec3.ts`, `quat.ts`, `aabb.ts` — plain interfaces plus out-parameter functions per `07` §7.
3. `core/math/easing.ts` — the standard curve set, every one `f(0) = 0`, `f(1) = 1`.
4. `core/math/spring.ts` — critically damped spring, stepped by its **exact** solution so it is framerate-independent rather than approximately so.
5. `core/math/hash.ts` — FNV-1a over strings and u32 words, the primitive `worldHash()` (`04` §4) and the save checksum (`23`) will both build on.
6. Co-located `*.test.ts` per `05`'s file table, including the allocation harness.

### The two acceptance criteria that shape the work

- **"Zero allocation in all operations, asserted by a test using a counter-instrumented harness."** Every operation is out-parameter style, and the harness measures `heapUsed` across many iterations with forced GC. **The harness carries a control case that must be detected as allocating** — a measurement that cannot fail is not a measurement.
- **"Spring is framerate-independent at fixed dt, verified against an analytic solution."** Taking the exact solution of the critically damped ODE as the integrator makes this exact rather than approximate: `n` small steps and one big step of the same total duration agree to machine precision, and both agree with `x(t) = x₀(1 + ωt)e^{-ωt}`.

### Known gate gap, carried from BL-003's handoff
There is still no test runner — BL-015 is the runner and it *depends on* BL-004, so it cannot come first. Tests are therefore written against `node:test` + `node:assert/strict` (standard library; no dependency added, and `35` §4 forbids adding one) and run with `node --experimental-strip-types --test`, the same mechanism `tools/check-lint-rules.ts` already uses. Coverage is measured with Node's own `--experimental-test-coverage`. **BL-015 should port these suites to Vitest**, not rewrite them.

### Progress
- [x] Task claimed in this file
- [ ] Modules
- [ ] Tests
- [ ] Gates

### Blockers
- None

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
