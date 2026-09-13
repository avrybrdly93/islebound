# 33 — Current Task

**This file always reflects exactly one task in progress, or none.** It is the handoff point between work sessions. An agent starting work reads this file first, after `docs/AI_DEVELOPMENT_WORKFLOW.md`.

---

## Status: IN_PROGRESS

**BL-077 — Two test files have never been formatted, and no gate would notice.**
Phase 0 · Size S · Started 2026-09-13.

It is the topmost ready item, and it is also what
`AI_DEVELOPMENT_WORKFLOW.md`'s "When things go wrong" table calls the top task
regardless of the backlog: `format:check` is red on `main`.

## Baseline, measured before any change

`pnpm install --frozen-lockfile` first — this container arrived with
`node_modules` absent again, exactly as the previous handoff warned.

| command | result |
|---|---|
| `pnpm lint` | clean |
| `pnpm typecheck` | clean |
| `pnpm lint:rules` | clean |
| `pnpm lint:docs` | clean |
| `pnpm test` | **356 pass / 0 fail across 90 suites** |
| `pnpm format:check` | **RED — 4 files** |

## The item says two files. There are four, and the two extra ones are the
## strongest argument the item has

`git`-bisected by re-running prettier over each revision's blob with the repo's
own config:

| revision | `Query.test.ts` | `Query.defTypes.test.ts` | `EventBus.queued.test.ts` | `allocation.test.ts` |
|---|---|---|---|---|
| `e28a1c5` (BL-069) | clean | absent | clean | clean |
| `b2958a0` (BL-074 claims) | **unformatted** | **unformatted** | clean | clean |
| `312deb2` (BL-074 code) | unformatted | unformatted | **unformatted** | **unformatted** |
| `4c2652d` (`main` today) | unformatted | unformatted | unformatted | unformatted |

So `EventBus.queued.test.ts` and `allocation.test.ts` were made unformatted by
**BL-074's own code commit** — in the session whose log entry and backlog entry
both say "`format:check` is still red on BL-077's two files, unchanged and not
this task's".

That statement was written in good faith and was false when written, and it
was false for precisely the reason BL-077 exists: `format:check` is not in the
verify block, so the session could not see that its own edits had doubled the
count it was reporting as unchanged. The population grew from two to four while
a session accurately reported it as two.

**This is criterion 2's evidence, and it is a measurement rather than an
argument.** It goes in the log; the earlier entries are not corrected, per
decision 0033's rule that a development log records what was true when written.

## Plan

1. Claim: BL-077 to In Progress in `32`, this block in `33`. *(this commit)*
2. `pnpm format` over the tree. Check the 500-line limit on `Query.test.ts`
   (494 → the filing says 491) and that the suite is unchanged.
3. Criterion 2: fold `prettier --check .` into `pnpm lint`, following decision
   **0033**'s precedent verbatim — it wired a new check as a second command
   under an existing script *because* a new `pnpm lint:*` would need adding to
   the verify blocks to be run at all, and named BL-077 as the reason. Update
   every doc that describes what `pnpm lint` runs.
4. Verify: `lint`, `lint:rules`, `lint:docs`, `typecheck`, `test`,
   `format:check`. Confirm the new wiring is red on an unformatted tree before
   trusting it green.
5. Document: decision **0035**, `34` entry with the four-file table above, `32`
   → Done, `33` → IDLE.

## The choice in step 3, and the alternative rejected

`pnpm lint` is the **first command of the verify block** in both `CLAUDE.md`
and `AI_DEVELOPMENT_WORKFLOW.md` §6, so folding the check into it cannot be
forgotten without forgetting the block.

The obvious alternative — add `pnpm format:check` to the verify block as a
fourth command — is rejected because **a line in a document is exactly what was
forgotten**. `pnpm format:check` has existed as a script this whole time and
the block simply did not name it. Adding a fourth line asks the next session to
do the thing this session's evidence shows sessions do not do.

Note also that `pnpm lint:rules` and `pnpm lint:docs` are **not** in the verify
block either — they are named in the prose beneath it. So they are not a
carrier for this check.

## `pnpm sim --assert-hash`

Not runnable: it arrives with **BL-014**. `35` §4.9 requires it for "done", and
`AI_DEVELOPMENT_WORKFLOW.md` §6 records that a Phase-0 session should expect
it to be absent. Nothing in this task touches `sim/` behaviour — the only
change under `sim/` is whitespace inside two test files — so there is no hash
to change.
