# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IN PROGRESS — BL-079

**BL-079 — Nothing asserts that `pnpm lint` still runs the format check.**
Phase 0, size S, depends on BL-077 (done). Taken as the topmost unblocked task
in the Ready list, per `AI_DEVELOPMENT_WORKFLOW.md` §2: BL-056 is Phase 1 and
so out under phase discipline (twentieth session running), and BL-067 is
skipped on its own instruction because `23_SAVE_SYSTEM.md` still defines no
component-level format for its first criterion to presume.

### Acceptance criteria

- [ ] Something fails if the root `lint` script stops running a format check
- [ ] That something is itself run by the verify block, or the guard has the
      defect it guards against

### The decision this task turns on, settled before writing the guard

The filing note offers three candidate hosts — "a check under `pnpm lint`
itself, or BL-019's CI, or both". **The first of those is self-defeating and
should not be taken**, and saying so is most of this task's content:

> **A guard must not be reachable only through the thing it guards.**

If the guard runs as part of `pnpm lint` — whether as an ESLint rule, an extra
`&&` clause, or by folding `lint:rules`/`lint:docs` into `lint` — then the
single edit BL-079 exists to catch (tidying `lint` back to `eslint .`) removes
the format check **and the guard that would have noticed** in the same stroke.
The tree goes quiet exactly as it did before BL-077, which is the failure this
item is about.

That leaves the verify block's other two entries. `pnpm typecheck` cannot see a
`package.json` script string — there is no type to assert against. So the guard
belongs under **`pnpm test`**, which is in the verify block's first line and
which no edit to `lint` can reach.

BL-019's CI is the other honest host and is not yet built. It is not an
alternative to this one so much as a second layer, and the residual exposure
below says why one is still worth having.

### Residual exposure, stated rather than left implicit

Nothing guards the `test` script itself. An edit that narrowed
`test:node`'s glob would drop this guard the same way an edit to `lint` drops
the format check. That regress terminates only at CI, which is BL-019 — so it
is recorded here and in the backlog rather than chased, per `35` §3.

### Files expected to change

- A new guard test under `packages/*/src/` (the only tree `pnpm test` globs)
- `docs/32_BACKLOG.md`, `docs/33_CURRENT_TASK.md`,
  `docs/34_DEVELOPMENT_LOG.md`, and `docs/40_DECISION_LOG.md` if the host
  choice is architecturally significant

### Baseline, measured this session before any edit

`pnpm install --frozen-lockfile` first — this container arrived with
`node_modules` absent **again**, fourth session running. After installing:
**356 pass / 0 fail across 90 suites**, matching the previous session's
close-out on every count.
