# 34 — Development Log

Append-only. Newest entries at the top. Every completed task gets an entry; every phase gets a retro; every significant discovery gets a note even if no task was completed.

This log exists so that a fresh agent — or the same human six months later — can reconstruct *why* the codebase looks the way it does without reading a year of diffs.

---

## Entry format

```markdown
## YYYY-MM-DD — BL-### Short title

**Type:** feature | fix | refactor | docs | perf | chore | retro | note
**Phase:** N
**PR:** #123
**Time:** ~Xh

### What changed
Two to five sentences, in plain language.

### Why it was done this way
The reasoning behind non-obvious choices. This is the most valuable part of the entry.

### Surprises
Anything that did not go as the docs predicted. **Always fill this in when it applies** — it is how the documentation improves.

### Tests
What was added, and what it protects.

### Follow-ups
- BL-### — created for discovered work
```

---

## 2026-XX-XX — Project documentation system created

**Type:** docs
**Phase:** pre-0
**PR:** —

### What changed
The complete documentation set (`docs/00`–`docs/40`), the AI development workflow, the seven phase task files, and the repository README were authored before any code. The project is a browser-based cozy 3D survival-exploration game — single-player first, with drop-in co-op in Phase 7.

### Why it was done this way
The premise of this repository is months of largely autonomous, agent-driven development. That only works if the decisions an agent would otherwise have to invent are already made and written down. Three choices in particular are load-bearing and were made deliberately up front:

1. **Simulation is separated from presentation and is headless-runnable.** This makes gameplay testable without a browser, makes saves trivially correct, and makes Phase 7 multiplayer possible without a rewrite. Every other decision defers to it.
2. **Multiplayer is designed in from day one but implemented last.** The alternative — building single-player and retrofitting networking — is the most common way projects of this shape die. The `04` §10 checklist is the mechanism that keeps this honest.
3. **Content is data, not code.** Adding a fish, a recipe, a crop or a building piece must never require a code change. This is what allows content to scale while the codebase stays small.

### Surprises
None yet — this is the first entry.

### Tests
None yet. `29_TESTING_STRATEGY.md` §4 defines ten critical tests that must exist by the end of their respective phases and must never be weakened to make a change pass.

### Follow-ups
- BL-001 through BL-021 seeded for Phase 0
- BL-022 through BL-044 seeded for Phase 1, to be groomed before Phase 1 opens

---

## Phase retro format

At the end of each phase, before tagging `phase-N-complete`:

```markdown
## YYYY-MM-DD — Phase N retro

**Tasks completed:** X of Y planned
**Duration:** N weeks
**Proof achieved:** (the one-line proof from `03_FEATURE_ROADMAP.md` — yes/no, with evidence)

### What went well

### What was harder than expected

### Documentation that turned out to be wrong
(and the PR that fixed it — docs that are wrong and left wrong are worse than no docs)

### Performance at the end of the phase
| Metric | Budget | Actual |
|---|---|---|
| Frame time p50 / p99 | | |
| Draw calls | | |
| Bundle size | | |
| Test count / coverage | | |

### Manual playtest checklist results

### Scope changes
What moved to the Icebox, what was promoted out of it, and why.

### Carried into the next phase
```

---

## 2026-08-07 — BL-002 Configure ESLint, Prettier, and the boundary rules

**Type:** chore
**Phase:** 0
**PR:** — (pushed direct to `main`)
**Time:** ~1h

### What changed

`eslint.config.js` (flat), `.prettierrc.json`, `.prettierignore`, `tools/check-lint-rules.ts`, `tools/lint-fixtures/` (4 files), and four new root scripts: `lint`, `lint:rules`, `format`, `format:check`. Dev dependencies only — `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-boundaries`, `eslint-plugin-import`, `eslint-import-resolver-typescript`, `prettier`, `eslint-config-prettier`. No runtime dependency.

The config is type-aware (`strictTypeChecked` + `stylisticTypeChecked`), carries the `04` §5 import-direction table under `eslint-plugin-boundaries` with `default: 'disallow'`, and adds the three custom bans BL-002 names as `no-restricted-syntax` selectors rather than a bespoke plugin: each is one AST shape, and a plugin would be a package, a build step and a test harness of its own (`35` §5 — fewer moving parts).

`pnpm lint`, `pnpm lint:rules`, `pnpm format:check`, `pnpm typecheck` and `pnpm build` are all green on the scaffold.

### Why it was done this way

**Default-deny on boundaries.** A pair missing from `04` §5's table is an error, not an unregulated case. That makes the table the source of truth rather than a description of what happened to get written, and it means widening it is visibly a `04` §5 change — which needs human approval (`35` §4.4).

**Prettier's scope stops at code and configuration.** `prettier --write .` was run once and reformatted all 42 files in `docs/` plus `tasks/` and `README.md` — including `00_PROJECT_VISION.md`, which `35` §4.3 forbids an agent to modify at all. Whitespace-only or not, that is a prohibited edit, so the reformat was reverted and `docs`/`tasks` were added to `.prettierignore` with the reason written in the file. `README.md` is formatted; the prose corpus is not.

**The fixture harness is a script, not a test.** `pnpm test` does not exist yet (BL-015), and pulling Vitest forward would have expanded this task past its acceptance criteria. `tools/check-lint-rules.ts` runs on Node's `--experimental-strip-types`, so it needs no runner dependency; its expectation table is shaped so it can become a `.test.ts` when BL-015 lands.

**One fixture carries four shapes.** The per-frame allocation ban needs a selector per way of naming a function (declaration, arrow assigned to a const, class method, object method), so the fixture contains all four and the harness asserts **four** reports rather than "at least one". A selector list that quietly loses an entry fails.

### Surprises

Three, all of which cost a probe to find and all of which would otherwise have shipped as rules that read correctly and enforced nothing:

1. **An unresolvable dependency is silently not checked.** The first working version of the config had no import resolver. A deliberate `core → sim` import — the most basic violation `04` §5 exists to stop — passed `pnpm lint` clean. `eslint-plugin-boundaries` classified the *file* correctly as `core` and the *dependency* as `origin: "external"`, because `@sim/_scaffold.js` resolved to nothing, and external modules fall outside the layer rules. Fixed by adding `eslint-import-resolver-typescript` pointed at `packages/*/tsconfig.json` — there is no root `tsconfig.json` for it to find on its own, only `tsconfig.base.json`, which the package configs extend.

   **The lesson generalises: a green boundary lint is not evidence the boundary is enforced.** Anything that touches `eslint.config.js` should re-run the four-direction probe below.

2. **`boundaries/dependencies` does not look at npm packages.** `04` §5's `sim` line is "MAY NOT import: three, react, DOM", but the layer rule only governs first-party imports. Getting `import * as THREE from 'three'` inside `sim/` reported needed the separate `boundaries/external` rule — which v7 deprecates and warns about on every run. The documented migration onto `boundaries/dependencies` (with `checkAllOrigins: true` and a `disallow: { to: { module: { source } } }` policy) was tried first and **did not fire**. Shipping the deprecated-but-working rule beat shipping the modern-and-inert one. Filed as BL-047 with the exact reproduction.

3. **Type-aware linting needs every file to be in a TypeScript project.** `eslint.config.js` itself, `tools/**`, and the fixtures are not members of any `tsconfig.json`, and the parser errors on them rather than skipping them. They get `tseslint.configs.disableTypeChecked`. The custom rules are all syntactic, so the fixtures still prove what they are there to prove.

### The probe that verifies the boundary rule

Not automated — that needs real files in the layer directories, which BL-004 onward will provide (see BL-047's notes). Run by hand after any change to `eslint.config.js`; each is a two-line file with one import, linted and then deleted:

| From | Imports | Expected |
|---|---|---|
| `core/` | `@sim/_scaffold.js` | error — no policy allows core → sim |
| `render/` | `@sim/_scaffold.js` | clean |
| `sim/` | `@content/_scaffold.js` | clean |
| `ui/` | `@render/_scaffold.js` | error — no policy allows ui → render |
| `sim/` | `three` / `react` | error — `boundaries/external` |
| `render/` | `three` | clean |

All six behaved as expected at this commit.

### Documentation notes (type: `note`)

- `06` §2 lists `eslint-plugin-react-hooks` in the flat config. It is **not** in this one: there is no React in the tree yet (BL-003 adds it), so it would have had nothing to lint and no fixture could have proved it works. Filed as BL-045 rather than added blind.
- `05` §8.2 requires no import cycles and `06` §5 names `madge --circular` as the gate for it. `import/no-cycle` is deliberately **not** enabled — it would be a second gate for the same property, and the one the docs name is the CI one. Neither doc is wrong; noting it so the absence is not read as a miss.

### Tests

`tools/check-lint-rules.ts`, run as `pnpm lint:rules`: 4 fixtures, 4 expectations, all caught (`Math.random` ×1, `dangerouslySetInnerHTML` JSX form ×1, `dangerouslySetInnerHTML` props-object form ×1, per-frame `new THREE.*` ×4). The boundary rules are covered by the manual probe table above, not by the harness.

`pnpm sim --ticks 20000 --assert-hash` (the `35` §8 session-end command) **does not exist yet** — the headless sim runner is BL-014 and there is no simulation to hash. Same for `pnpm test` (BL-015) and `pnpm check:bundle`. Stated rather than skipped silently.

### Follow-ups

BL-045 (react-hooks, once React exists), BL-046 (widen the per-frame ban to named `three` imports — the current selector matches `new THREE.Vector3()` but not `new Vector3()`, and the gap is named in a comment in the config), BL-047 (migrate off the deprecated `boundaries/external`).

---

## 2026-08-04 — BL-001 Initialise the pnpm workspace and package scaffolding

**Type:** chore
**Phase:** 0
**PR:** —
**Time:** ~1h

### What changed
Created the monorepo skeleton described in `05_CODEBASE_STRUCTURE.md` §1–2: root `pnpm-workspace.yaml`, root `package.json` with `dev`/`build`/`typecheck` scripts, `tsconfig.base.json` with the exact compiler options from `07_TYPESCRIPT_GUIDELINES.md` §1 plus `baseUrl`/`paths` for the five aliases, and a root `.gitignore`. `packages/shared` and `packages/client` each got a `package.json`, a `tsconfig.json` extending the base config, and a `typecheck` script. `packages/client` also got a minimal `vite.config.ts`, bare `index.html`, and `src/main.ts`. `packages/server` got only a `README.md` — no `package.json`, so it is not yet a workspace member, matching the acceptance criteria.

To prove the five aliases (`@core`, `@sim`, `@render`, `@ui`, `@content`) actually resolve rather than just being configured, each aliased directory got one `_scaffold.ts` marker file exporting a single string constant, and `main.ts` imports all five. Verified: clean-clone `pnpm install` (no interactive prompts — see Surprises), `pnpm -r typecheck`, `pnpm build` (Vite bundles all 8 modules including the cross-package `@content` import into `packages/shared/src/content`), and `pnpm dev` (served HTTP 200).

### Why it was done this way
Vite does not read `tsconfig.json` `paths` natively. Rather than add `vite-tsconfig-paths` as a new dev dependency for five aliases that change rarely, `vite.config.ts` hand-declares `resolve.alias` mirroring `tsconfig.base.json`. Two files to keep in sync by hand, but zero new dependencies — fewer moving parts per `35_AI_AGENT_RULES.md` §5.

`@content/*` points across the package boundary directly into `packages/shared/src/content`, not through the `@halcyon/shared` package name — this is what `05_CODEBASE_STRUCTURE.md`'s alias list (`@core/*, @sim/*, @render/*, @ui/*, @content/*`, no `@halcyon/` prefix on any of them) implies, and it works because both Vite and `tsc` operate at the source level within one repo. Vite's dev server needed `server.fs.allow: ['..']` added to permit serving files from outside `packages/client`.

The `_scaffold.ts` marker files are intentionally throwaway: each one carries a comment naming the backlog task(s) expected to replace it (BL-003 for `ui/`, BL-004/BL-006/BL-008/BL-009/BL-010 for `core/`, BL-005/BL-007 for `sim/`, BL-011 for `render/`). Deleting a marker when its directory gets real content is part of that later task's normal scope, not separate cleanup work — noted so the next agent doesn't treat five stray one-line files as unexplained cruft.

### Surprises
- A fresh `pnpm install` triggers an interactive "approve which dependencies may run install scripts" prompt for `esbuild` (Vite's transitive dependency), which would hang non-interactive/CI sessions. Fixed by adding `"pnpm": { "onlyBuiltDependencies": ["esbuild"] }` to the root `package.json`, which pnpm reads instead of prompting. Worth calling out since BL-019 (CI pipeline) will otherwise hit this on its first run.
- The environment's pnpm is 10.33.0, not 9.x as `04_TECHNICAL_ARCHITECTURE.md` implies ("pnpm 9+" language in the README). Pinned `packageManager` to the installed version rather than downgrading; no compatibility issue observed.

### Tests
None added — this task has no logic to unit test yet. Verification was the acceptance criteria themselves: clean-clone install, `pnpm -r typecheck`, and a Vite build/dev-server run proving all five aliases resolve. `pnpm sim`/`pnpm lint`/`pnpm test` do not exist yet (BL-014/BL-002/BL-015), consistent with "most checks will not exist early in Phase 0."

### Follow-ups
None — BL-002 through BL-021 were already seeded and are unaffected.

---

## Vision questions

Raised by agents who believe `00_PROJECT_VISION.md` may be wrong. Recorded here rather than acted on. Reviewed by a human at each phase boundary.

*(none yet)*
