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

## 2026-08-06 — BL-002 Configure ESLint, Prettier, and the boundary rules

**Type:** chore
**Phase:** 0
**PR:** —
**Time:** ~1h

### What changed
Root flat `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, and a per-rule fixture harness (`tools/check-lint-rules.mjs` + six fixtures under `tools/lint-fixtures/`). New scripts: `lint`, `lint:rules`, `format`, `format:check`. Dev dependencies only — no runtime dependency was added (`04` §3).

The ESLint config carries `@typescript-eslint` strict-type-checked (type-aware via `projectService`), `eslint-plugin-boundaries` encoding `04` §5's import-direction table, `eslint-plugin-import`, `eslint-plugin-react-hooks` on `.tsx`, and `eslint-config-prettier` last so the two never disagree about formatting. `04` §5's hard `sim/` rule gets its own override block: no `three`/`react`/rapier imports, no `document`/`window`/`performance` globals. Prettier is `06` §2 verbatim — `printWidth: 100`, `singleQuote`, `semi`, `trailingComma: 'all'`.

The three custom bans are AST selectors under `no-restricted-syntax` rather than a bespoke ESLint plugin: `Math.random` anywhere, `dangerouslySetInnerHTML` as either a JSX attribute or an object property, and `new THREE.*` inside an `update*`/`sync*`/`step*` function across all four ancestor forms (declaration, variable, method, property).

Verified: `pnpm lint` clean on the scaffold, `pnpm lint:rules` 7/7, `pnpm format:check` clean, `pnpm typecheck` clean.

### Why it was done this way
**Selectors, not a custom plugin.** Three bans of this shape are three selector strings; a plugin would be a package, a rule module, a test harness and a build step for the same result. Fewer moving parts (`35` §5).

**ESLint pinned to ^9.** ESLint 10 installs by default, but `eslint-plugin-import` declares a peer range ending at 9 — and the plugin the boundary rules lean on being unsupported is not a warning worth carrying. Revisit when the plugin ships eslint 10 support.

**boundaries v7 API.** The widely-copied config uses `boundaries/element-types` with a `rules` array; v7 deprecates both in favour of `boundaries/dependencies` with `policies` and object selectors. Written the new way from the start rather than landing deprecation warnings on day one. `default: 'disallow'` means a module added without a policy row fails closed, so the next module cannot quietly get blanket permission.

**Fixtures are linted under synthetic filenames.** The fixture directory is in `ignores` so `pnpm lint` stays green, but an ignored path produces no reports no matter what it contains — so the harness reads each fixture's text and lints it *as* e.g. `packages/client/src/sim/__fixture__.ts`, which is what makes the path-scoped rules match. That instance runs with type-aware rules off: the synthetic paths are in no tsconfig, and every rule under test is purely syntactic, so nothing under test is weakened. `pnpm lint` still enforces the type-aware rules over the real tree.

### Surprises
**The fixture harness paid for itself before it was even finished: `boundaries/dependencies` was never firing.** `pnpm lint` was green, the config looked right, and the entire `04` §5 import-direction table was decorative. The cause is that neither `eslint-plugin-boundaries` nor `eslint-plugin-import` can resolve an extensionless TypeScript import without a resolver, so every dependency classified as *unknown* and no policy ever applied. `boundaries/no-unknown` was what finally said so. Fixed by adding `eslint-import-resolver-typescript` (dev dependency), which also resolves the `@core`/`@sim`/`@render`/`@ui`/`@content` aliases — the form `CLAUDE.md` says all real imports will take, so without it the table would have stayed decorative through every future task too.

This is the entire argument for BL-002's second acceptance criterion, and it is worth restating for the next agent: **a lint rule that silently stops matching is worse than no rule, because the green check actively tells you that you are protected.** Every rule added from here should arrive with a fixture.

**`prettier --write .` reformats all 51 prose documents.** A 1149-line diff across `docs/`, `tasks/` and `README.md` — emphasis markers `*x*` → `_x_`, table padding, list rewrapping — including `00_PROJECT_VISION.md` and `04` §3/§5, which `35` §4 forbids changing without human approval. Reverted in full and the paths added to `.prettierignore` with the reasoning inline. Filed as **BL-045** for a human to decide; making that call as a side effect of configuring the formatter is exactly the scope creep `35` §3 rules out.

**One adjacent file was changed**, as `35` §3 permits when the task's own acceptance criteria require it: `packages/client/src/main.ts`'s import order, autofixed by `import/order`. It only became a violation once the resolver made the aliases resolvable, and `pnpm lint` passing on the scaffold is BL-002's first acceptance criterion.

### Tests
`tools/check-lint-rules.mjs`, run via `pnpm lint:rules` — six fixtures plus a control, all passing:

| Check | Rule asserted |
|---|---|
| `Math.random` anywhere | `no-restricted-syntax` ×1 |
| `dangerouslySetInnerHTML` | `no-restricted-syntax` ×1 |
| `new THREE.*` in `update*`/`sync*` | `no-restricted-syntax` ×2 |
| `sim/` imports `three` | `no-restricted-imports` ×1 |
| `sim/` touches `window` | `no-restricted-globals` ×1 |
| `core/` imports `sim/` | `boundaries/dependencies` ×1 |
| clean control file | *no rule may fire* |

Two deliberate design points: the `new THREE.*` fixture asserts **two** reports so deleting one selector branch is caught, and the control file fails if *any* rule fires, so a rule that has become over-broad is caught alongside one that has gone silent.

Not a Vitest suite because `pnpm test` does not exist yet (BL-015, blocked on BL-004). Fold it in when that lands.

### Follow-ups
- **BL-045** (new) — human decision on whether Prettier formats the prose docs.
- BL-015 should absorb `tools/check-lint-rules.mjs` into the Vitest suite; BL-019 should run `lint` and `lint:rules` in CI.
- `eslint-plugin-import` gates ESLint at ^9. Revisit the pin when it supports 10.
- `CLAUDE.md` mentions `tools/check-sim-purity.ts` as a CI check. It does not exist yet; the `sim/` purity half is enforced by lint as of this task, and the standalone script is still owed by a later task.

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
