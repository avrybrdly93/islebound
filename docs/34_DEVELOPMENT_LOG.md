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

## 2026-08-05 — BL-002 Configure ESLint, Prettier, and the boundary rules

**Type:** chore
**Phase:** 0
**PR:** —
**Time:** ~2h

### What changed
Root `eslint.config.js` (flat), `.prettierrc.json` + `.prettierignore`, `tools/check-lint-rules.mjs` with three fixtures under `tools/lint-fixtures/`, and `lint`/`lint:rules`/`format`/`format:check` scripts. Six dev dependencies, no runtime dependencies: `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-boundaries`, `eslint-plugin-import`, `eslint-import-resolver-typescript`, `eslint-config-prettier`, `prettier`.

The config does three things. `eslint-plugin-boundaries` encodes the `04` §5 import-direction table for all nine element types — including `audio`, `input`, `platform` and `dev`, whose directories do not exist yet, so the first file dropped into one is governed on arrival rather than whenever someone remembers to come back. `core` and `content` are expressed by their *absence* from the policy list, since the default is `disallow`. `sim`'s documented prohibition on `three` and React is an explicit disallow rather than left entirely to the CI grep. Then the three project-specific bans, then the general `@typescript-eslint` strict-type-checked + `eslint-plugin-import` layer.

The three bans use `no-restricted-syntax` rather than a hand-written plugin package: three selectors do not justify a plugin, its build, and its own tests (`35` §5). `dangerouslySetInnerHTML` is banned both as a JSX attribute and as an object property, since props are often built before the JSX. The `new THREE.*` ban covers all four ways a per-frame function gets its name — function declaration, arrow assigned to a `const`, class method, object-literal method.

### Why it was done this way
`pnpm lint` passing proves the codebase is clean. It cannot prove the *rules* work: a selector that quietly stops matching produces exactly the same silence as compliant code. So each rule has a fixture pairing violations with compliant near-misses, and `tools/check-lint-rules.mjs` asserts an **exact** violation count — an over-broad selector fails as loudly as a dead one. The compliant cases are chosen to be the ones a careless selector would swallow: the seeded-RNG equivalent of `Math.random`, a module-scope scratch object reused per frame, and a `new Map()` inside an `update*` function, which is a different concern this rule has no business claiming. The script imports `RESTRICTED_SYNTAX` from `eslint.config.js` rather than restating it, so the test cannot drift from the shipping definitions.

`pnpm test` (vitest) does not exist until BL-015, which is why the fixture check is a script. When vitest lands it should become a test file and the script should go away.

### Surprises
- **The boundary rule was decorative and passed silently.** A deliberate `sim → render` import produced *no* error. `eslint-plugin-boundaries` resolves module specifiers through `eslint-plugin-import`'s resolver, and with no resolver configured the `@render/*` alias resolved to nothing — and an unclassified dependency is not a violation, so everything passed. Adding `settings['import/resolver'].typescript` pointing at `tsconfig.base.json` fixed it. This is the reason the fixture harness now also writes a real `sim → render` file into `src/sim/` (and removes it in a `finally`) and asserts the violation is reported: the failure mode here is silence, and silence is what a clean codebase looks like too.
- **`04` §5's table does not cover the composition root.** `main.ts` (and later `Game.ts`) sits directly in `src/`, belongs to no layer, and by design imports every layer — `05` §2 calls `Game.ts` "composition root — wires every subsystem". Classified as a `boundaries/files` category allowed to import everything, rather than inventing a tenth architectural layer. The docs are not wrong so much as silent; recorded here and in `40_DECISION_LOG.md` rather than edited, since `04` §5 needs human approval to change.
- **Another ignored build script**, in the same family as BL-001's `esbuild` surprise: `unrs-resolver` (a native dependency of `eslint-import-resolver-typescript` v4) is reported as an ignored build script by pnpm. Resolution works anyway — verified by the boundary violation above being caught — so it was left unapproved rather than added to `onlyBuiltDependencies` for no reason. BL-019 (CI) should confirm the warning stays a warning on a clean CI install.
- **Prettier over the docs was deliberately declined.** Running `prettier --write .` reflows all 40+ documentation files. `.prettierignore` excludes `docs/`, `tasks/` and root markdown with that reasoning written in, so the formatting scope is code only. Revisit deliberately if it is ever worth the churn.

### Tests
`pnpm lint:rules`: 3 rule checks + the boundary-table check, all passing. The harness was verified to fail when it should — breaking the `Math.random` selector on purpose turns that one check red and leaves the others green.

Also run clean: `pnpm lint` (whole repo), `prettier --check .`, `pnpm typecheck`, `pnpm build`. `pnpm test`, `pnpm sim --ticks 20000 --assert-hash` and `pnpm check:bundle` do not exist yet (BL-015, BL-014, BL-019) — expected this early in Phase 0.

### Follow-ups
- **BL-045** — the per-frame allocation ban matches `new THREE.Vector3()` but not `import { Vector3 } from 'three'; new Vector3()`; `no-restricted-syntax` cannot see where an identifier came from.
- **BL-046** — `eslint-plugin-react-hooks` is named by `06` §2 but was left out: there is no React until BL-003, and a plugin configured against nothing is one nobody notices is misconfigured.

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
