# 32 — Backlog

**This is a living document.** It is the single source of truth for what to work on next. Agents select exactly one task from here per work session.

Last groomed: *(update this line when grooming)*
Current phase: **Phase 0 — Foundation**

---

## How to use this file

**For agents:**
1. Read `docs/AI_DEVELOPMENT_WORKFLOW.md` first.
2. Select the **topmost unblocked task in the Ready column of the current phase**. Do not skip ahead to a more interesting task.
3. Move it to In Progress, put its ID in `33_CURRENT_TASK.md`, and begin.
4. On completion, move it to Done with the date and PR link, and log in `34_DEVELOPMENT_LOG.md`.
5. If you discover new work, add it to Ready (or Icebox) with a new ID. **Never** silently expand the scope of the task you are on.

**For humans:** reorder Ready freely; that ordering is how you steer the project. Add tasks anywhere. Move things to Icebox rather than deleting them.

**Task ID format:** `BL-###`, monotonically increasing, never reused. Next free ID: **BL-083**.

**Task format:**

```
### BL-042 — Short imperative title
- **Phase:** 1
- **Size:** S | M | L   (S ≤ 2 h, M ≤ 6 h, L ≤ 2 days of agent work)
- **Depends on:** BL-031, BL-038
- **Docs to read:** 04, 08, 13
- **Description:** what and why, 2–5 sentences.
- **Acceptance criteria:**
  - [ ] concrete, checkable
  - [ ] tests specified
- **Notes:** anything an implementer would otherwise have to guess.
```

---

## In Progress

### BL-083 — Nothing asserts that the type-aware lint rules stay on over `tools/`
- **Phase:** 0 · **Size:** S · **Depends on:** BL-082 · **Docs to read:** 06, 07
- **Description:** BL-082 removed `tools/**/*.ts` from `eslint.config.js`'s `disableTypeChecked` block, and **nothing stops a later edit putting it back**. The failure would be silent in the worst way: `pnpm lint` would still exit 0, `pnpm lint:rules` would still pass, `pnpm typecheck` would still pass, and the only difference would be that a whole class of rule had stopped reporting over four scripts and two test files. This is the same standing hole decision 0035 left and BL-079 closed, in a new place — and the sixth instance of this repository's one recurring defect.
- **Acceptance criteria:**
  - [ ] A deliberate type-aware violation in a `tools/` file that is inside `tools/tsconfig.json` is asserted to report, by something `pnpm test` or `pnpm lint:rules` runs
  - [ ] The assertion fails if `tools/**/*.ts` is returned to the `disableTypeChecked` block — verified by doing it, not by reading the config
  - [ ] It does not fire on the syntactic rules, which were never off there and would mask the regression
- **Notes:** Filed 2026-09-21 by BL-082, which verified the wiring by control and deliberately did not build a permanent fixture (`35` §3, and its own criteria do not name one). **The complication is measured rather than predicted, and it is why this is not a ten-minute job:** a fixture proving a *type-aware* rule fires cannot live in `tools/lint-fixtures/`, because BL-082 kept that directory in the `disableTypeChecked` block on purpose and it is outside `tools/tsconfig.json`'s `include` — with the exemption gone the fixtures do not even **parse**. So this needs a second fixture directory that is *inside* `tools/tsconfig.json`'s `include` and *inside* ESLint's `ignores`, which is a shape the repository does not have yet. `tools/check-lint-rules.ts`'s `EXPECTATIONS` table is the natural home for the assertion and is already shaped like one; note its `guards` field wants the product consequence, which here is "a class of rule silently stops reporting over the directory every test run loads through".

## Ready — Phase 0: Foundation

### BL-056 — Decide the Poisson-disk chunk-seam policy
- **Phase:** 1 · **Size:** S · **Depends on:** BL-054 · **Docs to read:** 12
- **Description:** BL-054's sampler enforces the minimum distance *within* a chunk only, so a point near an edge can land within `radius` of a point in the neighbour. That is the deliberate price of `12` §"Runs in a Web Worker"'s order-independence requirement — a chunk that consulted its neighbours would no longer be generatable in any order — but nobody has looked at whether it is visible.
- **Acceptance criteria:**
  - [ ] The seam is rendered and judged at the scatter densities `12` actually uses, not in the abstract
  - [ ] If it needs fixing, the fix preserves order-independence (the standard technique is to sample a chunk's own points *and* its 8 neighbours' from their own streams, keeping only the centre chunk's — deterministic, at 9x the sampling cost)
  - [ ] Whatever is decided is recorded in `40_DECISION_LOG.md`
- **Notes:** Filed 2026-08-15 by BL-054 rather than fixed inline: it is a judgement about how the island looks, it needs the renderer to answer, and guessing now would either cost 9x for nothing or bake in an artefact. `12` §"Scatter" already softens the visual consequence with clumping, so it may well be invisible.

### BL-059 — ECS-lite part 3: cached queries by component signature — **DONE 2026-08-22**
- **Phase:** 0 · **Size:** M · **Depends on:** BL-058 · **Docs:** 04, 07
- **Description:** `sim/ecs/Query.ts`: `World.query(...defs)` returning entities sorted ascending, computed lazily and cached per-tick by component-set signature (`04` §4.3), with cache invalidation on store mutation.
- **Acceptance criteria:**
  - [x] 10,000 entities × 6 components: query iteration ≤ 0.15 ms — measured **0.0784 ms** cached, 1.9x headroom. Note the criterion is about *iteration*: computing the intersection cold costs **1.00 ms median**, 14x the budget, which is why this task is "cached queries" and not "queries"
  - [x] Query results are in ascending entity order, always — ascending **index**, inherited from the driving store's `entities()` with no re-sort; the ordering cases recycle an index first, so a raw-handle sort fails them
  - [x] A component added or removed mid-tick is reflected, not served from a stale cache — invalidation is **version-keyed, not tick-keyed**; a per-tick cache satisfies `04` §4.3's wording and fails this criterion outright. See decision 0024
- **Notes:** Split out of BL-007 on 2026-08-18; **done 2026-08-22**, see `34_DEVELOPMENT_LOG.md`. This slice carries the performance criterion, because it is the only one of the three whose cost the criterion is actually about. **BL-008 and BL-014 named `BL-007` as a dependency when BL-007 meant all three slices; both now name BL-059** — which is now done, so **both are unblocked**, as are BL-060 and BL-061. Landed alongside it: a `version` counter on `ComponentStore` and on `EntityAllocator`, which BL-058's handoff note 5 named as part of this task.

### BL-066 — `ComponentRegistry` still exposes no way to enumerate its stores — **DONE 2026-08-29**
- **Phase:** 0 · **Size:** S · **Depends on:** — · **Docs:** 04
- **Description:** BL-060 asked whether the destroy fan-out needed a `ComponentRegistry.stores()` iterator and the answer turned out to be no: `removeEntity` iterates the map from *inside* the class, so nothing had to be exported and the heterogeneous map stayed sealed behind its one existing cast. That is the right answer for that task and it leaves the original question open for the next caller. A save/load pass (`23`) has to walk every store to serialise it, and a debug overlay (`13`) has to walk every store to count entries — neither can be written from inside `ComponentRegistry`.
- **Acceptance criteria:**
  - [x] Enumerator exists — `ComponentRegistry.stores(): IterableIterator<ErasedStore>`, with `ErasedStore` carrying `def`, `size`, `version`, `get` and `remove`. It is more than `remove`, as the criterion asks, and the element type is stated rather than `unknown`
  - [x] `as` count in `ComponentStore.ts` unchanged at **one** — the same downcast in `store()` that was there before. Nothing in the new code needs an assertion, and neither does either caller
- **Notes:** Filed 2026-08-25 by BL-060, which deliberately did not need it. **Done 2026-08-29**, see `34_DEVELOPMENT_LOG.md` and decision 0027. The constraint this item recorded — no existential types, so every widening loses the value type or adds an assertion — turned out to be **true but not binding here**, because neither named caller needs `T`: a debug overlay counts, and a serialiser copies an opaque value rather than branching on its type. Widening to `unknown` therefore loses nothing either one uses, and every member of the erased interface is covariant in `T`, so `ComponentStore<T>` satisfies it structurally with no assertion. **`set` is deliberately absent** — it is the one contravariant member, and an erased `set` would accept any component's value into any store. Two `@ts-expect-error` reads pin its absence. **BL-065 is the same family of problem one level down and this does not solve it**: `QueryCache.query` takes `ComponentDef<never>`, the bottom, where the fix is the *top* — the same direction of widening as here, and still its own task.

### BL-067 — A save *load* pass needs a name-to-def table, and nothing owns one
- **Phase:** 0 · **Size:** S · **Depends on:** BL-066 · **Docs:** 04, 23
- **Description:** BL-066's `ComponentRegistry.stores()` lets a save pass write every store out, keyed on `def.name`. It cannot read one back in: `ErasedStore` has no `set`, deliberately, because `set` is contravariant in the component's `T` and an erased one would accept any component's value into any store. So loading has to go through `ComponentRegistry.store(def)` with the real `ComponentDef<T>` in hand — which means something has to map the `name` in the save file back to the def object, and nothing does. `defineComponent` returns a fresh object each call and registers nothing globally; the registry's own `names` map is private and only ever holds defs somebody already had.
- **Acceptance criteria:**
  - [ ] A save file's `"Transform"` resolves to the `ComponentDef<Transform>` the running code uses, by a stated mechanism
  - [ ] An unknown name in a save file is a diagnosable error, not a silently dropped component — a save written by a newer build is the ordinary case, not the exotic one
  - [ ] Whatever owns the table is somewhere content code can register into without `sim/` importing `content/` (`04` §5)
- **Notes:** Filed 2026-08-29 by BL-066, which hit the asymmetry and deliberately did not fix it — nothing loads anything yet, and inventing a registration mechanism without a save format to serve is a guess. **Not urgent, and it should not be taken before `23` has a shape.** Note the shape of the trap: the write side works today, so a session could build a whole serialiser and only discover the load side is missing at the end.

### BL-068 — `ComponentStore.ts` is 631 lines against a 500-line hard limit — **DONE 2026-08-30**
- **Phase:** 0 · **Size:** S · **Depends on:** — · **Docs:** 05, 06
- **Description:** `CLAUDE.md` sets files at 300 lines soft, 500 hard. `ComponentStore.ts` was already over at 547 before BL-066 and is 631 after it. It holds four things: `ComponentDef`/`defineComponent`, the `Store`/`EntityScopedStore`/`ErasedStore` interfaces, `ComponentStore`, and `ComponentRegistry`. The registry is the obvious seam — it is a different concern (which stores exist) from the store (what one holds), and it is what `World.store` delegates to.
- **Acceptance criteria:**
  - [x] `ComponentStore.ts` is under the hard limit, and so is anything split out of it — three source files at **159 / 360 / 161**, and the three test files at **43 / 421 / 304**. All six under 500; two still over the 300 soft limit, which the limit permits
  - [x] No barrel file is introduced (`CLAUDE.md`), and the `@sim/*` import paths in every consumer are updated — all four (`World.ts`, `Query.ts`, `Query.test.ts`, `World.test.ts`) import from the specific modules
  - [x] The module comments move with the code they describe rather than being cut — each of the original header's sections went to the file whose code it explains; nothing was deleted
- **Notes:** Filed 2026-08-29 by BL-066 rather than done inline: `35` §3 forbids expanding scope, and a file split touches every importer, which is exactly the kind of change that should not ride along with a feature. **Done 2026-08-30**, see `34_DEVELOPMENT_LOG.md` and decision **0028**. The two seams are `ComponentDef.ts` (what a component *is* and what a store *offers* — mentions no storage layout) and `ComponentRegistry.ts` (which stores exist), leaving the sparse set itself in `ComponentStore.ts`; dependency direction is acyclic, registry → store → defs → allocator. **The test file was the bigger offender and is the part a reader would not expect**: `ComponentStore.test.ts` was **701** lines, 70 more than the source, and was split along the same seams. **The suite count is the check that matters for a move** — unchanged at 342 pass / 0 fail, because a changed count means content was lost or duplicated, and neither is visible in a green run otherwise. The `max-lines` question this item raised is answered and **the answer is "not in this task"**: three test files outside the split are still over the hard limit (`World.test.ts` 547, `EventBus.test.ts` 533, `Rng.test.ts` 509), so turning the rule on today fails lint on files this task does not touch. Filed as **BL-069** with the measurement.

### BL-069 — The 500-line limit is still unenforced, and three test files are over it — **DONE 2026-09-01**
- **Phase:** 0 · **Size:** S · **Depends on:** — · **Docs to read:** 06, 29
- **Description:** `CLAUDE.md` sets files at 300 lines soft, 500 hard, and nothing checks either. That is how `ComponentStore.ts` reached 631 and its test file 701 before BL-068 split them, with no signal at any point. ESLint's built-in `max-lines` would have caught both. It cannot simply be switched on: three test files are over the hard limit today and would fail `pnpm lint` immediately.
- **Acceptance criteria:**
  - [x] `max-lines` enabled at the hard limit and every file under it — `['error', { max: 500, skipComments: false, skipBlankLines: false }]`. **Raw lines**: either skip option would have dropped all three offenders under the limit and closed this item without moving a line of code
  - [x] The soft limit is decided — **not** enforced, and `CLAUDE.md` now says so rather than rendering 300 and 500 identically as numbers with no indication that neither was checked. A `warn` in a CI-only lint is noise; fourteen files sit over 300 and every one is deliberate
  - [x] Test-file scope stated explicitly — **tests are in scope**, and they are the whole reason the rule bites. No source file is over 500 (largest: `allocationHarness.ts` at 422), so a sources-only rule would have enforced the limit precisely where nobody was breaking it
- **Notes:** Filed 2026-08-30 by BL-068. **Done 2026-09-01**, see `34_DEVELOPMENT_LOG.md` and decision **0029**. Three test files split at existing `describe` seams, each into a pair plus a small fixture module: `World.test.ts` 547 → 262 + 278 + 42, `EventBus.test.ts` 533 → 332 + 212 + 41, `Rng.test.ts` 509 → 204 + 235 + 113. **Suite count unchanged at 342 pass / 0 fail across 88 suites**, which is the check that matters for a move (BL-068's Surprise 3). **The rule was verified to fire rather than assumed to** — a 511-line probe reports the violation and was then removed; a rule that cannot fail is not a rule. The fixture modules reverse decision 0028's alternative (c) deliberately: 0028 preferred visible duplication for fixtures that were "three lines and stable", and `Rng`'s shared block is 113 lines of chi-square machinery whose critical values are stated rather than eyeballed. `Query.test.ts` is left at **499**, one under — the next case anybody adds now fails lint, which is the rule working, and the failure says what to do.

### BL-080 — Nothing type-checks `tools/`, and four TypeScript files live there — **DONE 2026-09-19**
- **Phase:** 0 · **Size:** S · **Depends on:** — · **Docs to read:** 06, 07
- **Description:** `pnpm typecheck` is `pnpm -r --if-present run typecheck`, and the only two packages that answer it include `src` alone (`packages/client` also takes `vite.config.ts`). There is no root `tsconfig.json`. So **no `tools/*.ts` file is type-checked by anything**: `check-lint-rules.ts`, `check-doc-commands.ts`, `check-workflow-doc.ts` and now `check-lint-script.test.ts`. They run under `node --experimental-strip-types`, which *erases* types without checking them, so an annotation there is documentation that nothing verifies. ESLint does lint the directory, which is why this has stayed invisible: the files are covered by one gate and not the other.
- **Acceptance criteria:**
  - [x] Every `.ts` under `tools/` is type-checked by something the verify block reaches — `tools/` is a **workspace package** with `"typecheck": "tsc --noEmit -p tsconfig.json"`, so `pnpm typecheck` (`pnpm -r --if-present run typecheck`) reaches it **by construction**. Coverage is asserted against the directory listing rather than a list of names, so a fifth file is covered without editing anything
  - [x] The mechanism is stated — decision **0036**, with all three rejections. The root-project option was rejected on arithmetic rather than taste: **the root has no `typescript` at all**, only `packages/client` does, so it needs the same dependency addition *and* a root script edit, for a reach that then hangs on one string
  - [x] Verified able to fail: `const bl080Probe: number = 'not a number'` in `check-workflow-doc.ts` is reported as `check-workflow-doc.ts(225,7): error TS2322` by `pnpm typecheck`, then removed
- **Notes:** Found 2026-09-15 by BL-079, whose own new file is the fourth instance, and deliberately not fixed inline (`35` §3 — BL-079 was an S about one `package.json` string, and adding a TypeScript project is a different change touching how the whole repository is compiled). **This is the same class as BL-077 and BL-079 rather than a new one**: a rule the repository states and does not check. **Done 2026-09-19**, see `34_DEVELOPMENT_LOG.md` and decision **0036**. **The first run found two real errors**, in `check-lint-script.test.ts` — BL-079's own file, four days old — which read `scripts.lint` where `noPropertyAccessFromIndexSignature` requires `scripts['lint']`. **The trap this item warned about was checked and was not there**: all four files use no enum, namespace or parameter property, and all four still run under `--experimental-strip-types` after the change, the test file through the test runner. What was there was the plain version of the defect the item describes. Guarded by `tools/check-typecheck-coverage.test.ts` (6 cases, four controls each breaking exactly one assertion), which lives under `pnpm test` for BL-079's reason rather than inside the typecheck it guards. `tools/*.mjs` is deliberately outside the `include` and is filed as **BL-081**. Note the likely shape of the trap before starting: `--experimental-strip-types` refuses some constructs that `tsc` accepts (enums, namespaces, parameter properties), so turning `tsc` on over `tools/` may surface the *opposite* problem — code that type-checks but will not run. Check both directions.

### BL-081 — `tools/*.mjs` is checked by ESLint and by nothing else — **DONE 2026-09-20**
- **Phase:** 0 · **Size:** S · **Depends on:** BL-080 · **Docs to read:** 06, 07
- **Description:** BL-080 put every `tools/*.ts` file under `tsc`. It deliberately left the two `.mjs` files out — `aliasResolver.mjs` and `registerAliases.mjs` — because its criterion said every `.ts` and pulling JavaScript in needs `allowJs`, which is a decision rather than a side effect. Those two are not incidental: `registerAliases.mjs` is loaded by `--import` in `test:node`, so **every test in the repository runs through them**, and a mistake there fails the third command of the verify block in a way that points at the wrong file.
- **Acceptance criteria:**
  - [x] Decided, and recorded — **decision 0037**: this repository is TypeScript and the two files are converted, with `eslint.config.js` the single named exception. `allowJs` alone was rejected for reporting nothing (the four errors below would still be invisible), `allowJs` + `checkJs` for making JSDoc load-bearing in a tree whose every other file states types in the language, "neither" for being the status quo that produced BL-077/079/080/081 in a row, and converting `eslint.config.js` too for costing a `jiti` dependency on the lint step
  - [x] If checked: `tools/tsconfig.json` selects them **with no config change at all** — `include: ["**/*.ts"]` already covered the names they now have. Broken once each and confirmed: `TS2322` in `aliasResolver.ts`, `TS2769` in `registerAliases.ts`, both failing `pnpm typecheck`
  - [x] If converted: both still load under `node --import` — **established by running it, not by reading**, which is what the notes asked for. Node v22.22.2, 369/369 with the loader as `.ts`. The first typecheck of them found **four** real `TS7006` implicit-`any` parameters on the `resolve` hook, now typed through `node:module`'s own `ResolveHook`
  - [x] `tools/check-typecheck-coverage.test.ts` updated — and it asserts the **decision** rather than today's file list: `git ls-files` is walked for `.js`/`.mjs`/`.cjs`/`.jsx` and anything outside a one-element exemption list fails, the list checked in both directions so a stale entry cannot leave a standing hole. Four controls each break exactly one assertion
- **Notes:** Filed 2026-09-19 by BL-080; **done 2026-09-20**, see `34_DEVELOPMENT_LOG.md` and decision 0037. Suite **372 pass / 90 suites**, up from 369. The notes below were right about the thing that mattered: the conversion worked, and a session reasoning from first principles about loader-thread ordering would not have known. **Check the conversion option first and check it by running, not by reading**: `registerAliases.mjs` is passed to `node --import` before the test files load, and whether a `.ts` loader hook can register itself under `--experimental-strip-types` is a question about module-loading order that a session will get wrong from first principles. If it cannot, `allowJs` is the only route and the decision narrows to `checkJs` or not. This is the same class as BL-077, BL-079 and BL-080 — a rule the repository states and does not check — and that is now **four** instances, which is the argument for answering the general question here rather than meeting it a fifth time.

### BL-082 — `eslint.config.js` still says `tools/` is not in a TypeScript project, and turns the type-aware rules off there — **DONE 2026-09-21**
- **Phase:** 0 · **Size:** S · **Depends on:** BL-081 · **Docs to read:** 06, 07
- **Description:** The `disableTypeChecked` block lists `tools/**/*.ts` and `tools/**/*.tsx` alongside `**/*.js` and the lint fixtures, on the stated ground that "the `tools/` scripts ... are not members of any TypeScript project, so the type-aware rules have nothing to work from". **That stopped being true at decision 0036**, which gave `tools/` a `package.json` and a `tsconfig.json`, and BL-081 has now moved two more files into it. So the type-aware lint rules are off over a directory that has a project, for a reason that no longer holds — and `tools/` currently holds a test file every test run loads through.
- **Acceptance criteria:**
  - [x] The `tools/**/*.ts` entries are either removed from the `disableTypeChecked` block with the type-aware rules passing, or kept with a reason that is true in 2026 — **removed**; the block is now `['**/*.js', '**/*.mjs', '**/*.cjs', 'tools/lint-fixtures/**']`
  - [x] If removed, `tools/tsconfig.json` is wired into the flat config's `languageOptions.parserOptions` so the rules have a program to read — **already was**, by `projectService: true`, which resolves the nearest `tsconfig.json` per file rather than reading a fixed project list. No edit. The proof is not that lint passes, it is that the probe reported `restrict-template-expressions`, a type-aware rule that cannot report anything without a program
  - [x] Whatever the findings are, they are fixed rather than suppressed, or filed with the rule named — **six errors in two files, all fixed in source**: one `prefer-optional-chain`, five `restrict-template-expressions`. `allowNumber: true` was the defensible alternative and is rejected in decision 0038
- **Outcome:** decision **0038**. The half of the old entry that was load-bearing turned out to be `tools/lint-fixtures/**`, and it was found by a red gate rather than by reading: those files are in `ignores` so `pnpm lint` never reaches them, but `check-lint-rules.ts` lints them through the ESLint API to prove the four custom rules fire, and they are outside `tools/tsconfig.json` on purpose. Removing the whole entry made **every fixture fail to parse and all four custom rules report nothing** — `pnpm lint` green, `pnpm lint:rules` red with "The config is broken". Verified by control in both directions: `no-floating-promises` and `restrict-template-expressions` are silent on a `tools/` source file under the old config and both fire under the new, while the syntactic `Math.random` ban fires under both. Suite unchanged at **372 pass / 0 fail across 90 suites**; `lint`, `typecheck`, `lint:rules`, `lint:docs` and `format:check` all clean. Filed **BL-083**
- **Notes:** Filed 2026-09-20 by BL-081, which found the stale comment while fixing its own reference in the same file and deliberately did not act on it (`35` §3 — switching type-aware rules on over a directory is a change with its own findings and its own size, not a comment edit). Expect the same shape BL-080 and BL-081 both hit: the first run of a check over files nothing was checking finds real things. Note the block's test-file sibling below it is a separate concern with its own expiry (BL-015).

### BL-078 — The allocation boundary cannot see an operation that allocates rarely
- **Phase:** 0 · **Size:** M · **Depends on:** BL-074 · **Docs to read:** 29
- **Description:** BL-074 set the allowance at four sampling intervals, which separates "allocates once per call" from "one stray sample landed in these frames" — the discrimination its first criterion asked for. It does **not** separate "once per call" from "once per thousand calls". Measured 2026-09-12 with the same harness and default options: one allocation per 1000 calls attributes **4224–11 648 bytes**, whose bottom is a hair above the 4096 allowance, so such an operation is caught on most runs and not all; one per 10 000 calls attributes **0–3200** and is not caught at all. An operation allocating that rarely still violates `CLAUDE.md`'s no-allocation-in-per-frame-paths rule.
- **Acceptance criteria:**
  - [ ] A sparse allocator — one object per 1000 calls — is caught on every run of 20, not most
  - [ ] Whatever achieves that does **not** reintroduce BL-074: a single stray sample must still not fail an operation whose true reading is zero
  - [ ] The per-call control still passes its gap assertion, so the instrument is still known to resolve a real allocator
- **Notes:** Filed 2026-09-12 by BL-074, which measured it and deliberately did not chase it (`35` §3 — the item was a boundary, not an instrument redesign). **Raising `MAX_STRAY_SAMPLES` moves the boundary the wrong way and lowering it re-creates BL-074**, so this is not a constant to retune; it needs a different instrument. The two obvious axes are a longer measured window and a finer `samplingInterval`, and **both have measured failure modes already recorded in `allocationHarness.ts`**: at interval 16 an allocation-free operation read 904 bytes where 64–8192 all read exactly 0, and a warm-up of 200000 made the *control* read 0 in one pass of three. Read that options table before picking either. Note also that the gap assertion caps the allowance from above: on the reference container the control backs at most **6** intervals, measured, so there is no room to widen the boundary toward the sparse case even if that seemed attractive.

### BL-008 — Fixed-timestep game loop
- **Phase:** 0 · **Size:** M · **Depends on:** BL-059 · **Docs:** 04, 09
- **Description:** The accumulator loop from `04` §4.1 with a 5-step catch-up cap, tab-switch clamping, interpolation alpha, and per-stage timing instrumentation.
- **Acceptance criteria:**
  - [ ] Simulation runs at exactly 30 Hz regardless of render rate (verified at simulated 30/60/144 fps)
  - [ ] A 10-second tab switch does not produce a burst of catch-up ticks
  - [ ] `sim:timeDropped` is emitted when the cap is hit

### BL-009 — Service registry and config
- **Phase:** 0 · **Size:** S · **Depends on:** BL-001 · **Docs:** 05
- **Description:** An explicit service registry (no decorators, no magic) and a typed config object loaded from `shared/content/config.ts` with a dev-only hot-reload hook.
- **Acceptance criteria:**
  - [ ] Accessing an unregistered service throws a clear error naming the service
  - [ ] Config changes hot-reload in dev without a page refresh

### BL-010 — Logger with a ring buffer
- **Phase:** 0 · **Size:** S · **Depends on:** BL-001 · **Docs:** 06, 30
- **Description:** Levelled logging, per-module tags, a 200-entry ring buffer for crash reports, and production stripping of debug/trace levels.
- **Acceptance criteria:**
  - [ ] Ring buffer never exceeds its cap
  - [ ] Debug calls are removed from the production bundle (verified by a bundle grep test)

### BL-011 — Three.js renderer bootstrap
- **Phase:** 0 · **Size:** M · **Depends on:** BL-003, BL-008 · **Docs:** 08, 09
- **Description:** `WebGLRenderer` with the configuration from `08` §9, scene roots per `08` §2, a perspective camera, resize handling with debounce, and a grey-box scene (ground plane, a few boxes, a directional light).
- **Acceptance criteria:**
  - [ ] Grey-box scene renders at 60 fps
  - [ ] Colour management verified: a known sRGB value round-trips correctly
  - [ ] Resize does not leak render targets

### BL-012 — Capability detection and quality tiers
- **Phase:** 0 · **Size:** M · **Depends on:** BL-011 · **Docs:** 09, 28
- **Description:** GPU tier heuristics from the renderer string plus a 60-frame calibration burn-in; the quality-tier table from `09` §4 applied to a settings object.
- **Acceptance criteria:**
  - [ ] Tier is detected within 2 seconds of load
  - [ ] Manual override in settings persists and applies without reload
  - [ ] Unknown GPUs default to Medium, not High

### BL-013 — Dev overlay
- **Phase:** 0 · **Size:** M · **Depends on:** BL-011, BL-008 · **Docs:** 28
- **Description:** FPS, a 240-frame frame-time graph with a p99 marker, draw calls, triangles, programs, texture memory, entity count, heap size, and per-system tick timings. Toggled with a key, stripped from production.
- **Acceptance criteria:**
  - [ ] Overlay itself costs ≤ 0.1 ms/frame
  - [ ] Fully absent from the production bundle
  - [ ] Per-system timings are accurate within 5% of a manual measurement

### BL-014 — Headless simulation harness (`pnpm sim`)
- **Phase:** 0 · **Size:** L · **Depends on:** BL-059, BL-008, BL-005 · **Docs:** 29
- **Description:** A Node entry point that constructs a world without any renderer, runs N ticks, supports `--seed`, `--ticks`, `--assert-hash`, `--profile` and `--script`, and implements `worldHash()`.
- **Acceptance criteria:**
  - [ ] `pnpm sim --ticks 20000` runs in under 3 seconds
  - [ ] Repeated runs produce identical hashes
  - [ ] Importing anything from `render/` or the DOM fails the run loudly
  - [ ] Per-system timing output

### BL-015 — Vitest setup and first test suites
- **Phase:** 0 · **Size:** S · **Depends on:** BL-004 · **Docs:** 29
- **Description:** Vitest sharing the Vite config, coverage reporting, and the test directory structure from `29` §6.
- **Acceptance criteria:**
  - [ ] `pnpm test` runs unit tests with coverage
  - [ ] `pnpm test:watch` works
  - [ ] Coverage thresholds configured (85% for `sim/` and `core/`)

### BL-016 — Playwright setup and boot smoke test
- **Phase:** 0 · **Size:** M · **Depends on:** BL-011 · **Docs:** 29
- **Description:** Playwright configuration for Chromium and Firefox, the `__game` test hook (dev/test builds only), and a smoke test asserting boot, no console errors, and 120 rendered frames.
- **Acceptance criteria:**
  - [ ] Smoke test passes headless in CI
  - [ ] `__game` is absent from the production bundle
  - [ ] No `waitForTimeout` anywhere in the test code

### BL-017 — `sim/` purity checker
- **Phase:** 0 · **Size:** S · **Depends on:** BL-001 · **Docs:** 04, 06
- **Description:** `tools/check-sim-purity.ts` — an AST walk over `src/sim/**` failing on imports of `three`, `react`, DOM globals, `Math.random`, `Date.now`, and `performance.now`.
- **Acceptance criteria:**
  - [ ] Catches each banned pattern in a fixture file
  - [ ] Runs in under 2 seconds
  - [ ] Wired into CI as a blocking gate

### BL-018 — Bundle size budget check
- **Phase:** 0 · **Size:** S · **Depends on:** BL-003 · **Docs:** 06, 28
- **Description:** `tools/check-bundle-size.ts` asserting initial JS ≤ 600 kB gzipped and reporting the top 15 modules by size.
- **Acceptance criteria:**
  - [ ] Fails the build when the budget is exceeded
  - [ ] Prints a readable size report on every build

### BL-019 — CI pipeline
- **Phase:** 0 · **Size:** M · **Depends on:** BL-015, BL-016, BL-017, BL-018 · **Docs:** 29, 30
- **Description:** `.github/workflows/ci.yml` implementing the four jobs from `29` §8 with the stated time budgets and pnpm caching.
- **Acceptance criteria:**
  - [ ] All jobs green on a clean clone
  - [ ] `quick` job completes in under 3 minutes
  - [ ] Jobs run in parallel where independent

### BL-020 — Cloudflare Pages deployment with PR previews
- **Phase:** 0 · **Size:** M · **Depends on:** BL-019 · **Docs:** 30
- **Description:** Pages project, custom domain `islebound.avesstudios.com`, `_headers` with the CSP from `30` §4, deploy on merge to main, and automatic preview deployments per PR.
- **Acceptance criteria:**
  - [ ] A PR produces a clickable preview URL
  - [ ] Headers verified on the deployed site by an automated test
  - [ ] `main` deploys to production on every merge, with the smoke test blocking

### BL-021 — Root documentation files
- **Phase:** 0 · **Size:** S · **Depends on:** — · **Docs:** all
- **Description:** `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, and the workflow-document reference from the repo root. **The last of those four is done** — BL-073 (2026-09-08) deleted the duplicate, made `docs/AI_DEVELOPMENT_WORKFLOW.md` canonical, repointed all five references and put `tools/check-workflow-doc.ts` behind `pnpm lint:docs` so it cannot recur; decision **0033**. BL-073 also replaced `README.md`'s status banner, which was the most visibly wrong thing in this item's surface. What is left here is `CONTRIBUTING.md` (does not exist), the two criteria below, and any remaining `README.md` work beyond the banner.
- **Acceptance criteria:**
  - [ ] A new agent can go from clone to a passing test run using only the README
  - [ ] `CLAUDE.md` is under 100 lines and points to the detailed docs rather than duplicating them

### BL-048 — Reinstate BL-003's app-shell checks as real tests
- **Phase:** 0 · **Size:** S · **Depends on:** BL-015, BL-016 · **Docs:** 29
- **Description:** BL-003's three acceptance criteria were verified against headless Chromium with a throwaway script, because no test runner existed at that point in the Ready list. The measurements are in the `34` entry but nothing re-runs them, so a regression in canvas sizing or overlay pointer-events would land silently.
- **Acceptance criteria:**
  - [ ] Unit tests for `computeDrawingBufferSize`: fractional ratio, ratio above the cap, zero-size box, non-finite ratio (Vitest, no DOM needed)
  - [ ] Playwright assertions that the drawing buffer is `cssSize × min(dpr, 2)` at dpr 1/2/3 and that `elementFromPoint` at the viewport centre is the canvas
  - [ ] The dpr-change path (`matchMedia`) is covered, since `ResizeObserver` alone does not fire for it
- **Notes:** The unit half only needs BL-015; the browser half needs BL-016. Split if BL-015 lands well before BL-016.

### BL-049 — Decide the device-pixel-ratio cap with measured evidence
- **Phase:** 1 · **Size:** S · **Depends on:** BL-012, BL-011 · **Docs:** 08, 28
- **Description:** `render/canvas.ts` caps the drawing buffer at `MAX_PIXEL_RATIO = 2`, a constant chosen to match `08` §9's `Math.min(devicePixelRatio, capabilities.maxPixelRatio)` and its note that integrated GPUs get 1.5. Nothing has been measured; there is no renderer yet. Once BL-012 detects a quality tier and BL-011 draws something, the cap should come from the tier rather than from a module-level constant.
- **Acceptance criteria:**
  - [ ] The cap is a capability-tier value, with the constant as its default
  - [ ] A frame-time measurement at 1080p on at least one integrated GPU justifies the tier values

### BL-053 — Drop `--expose-gc` from the test scripts
- **Phase:** 0 · **Size:** S · **Depends on:** BL-050 · **Docs:** 29
- **Description:** Filed 2026-08-13 while closing BL-050. `--expose-gc` was there for the `heapUsed`-rise harness, which collected before each measured pass so the first sample did not attribute its predecessor's garbage to the operation. That harness is deleted; the sampling profiler does not need a forced collection, and nothing else in the tree calls `global.gc`. The flag appears in both `test:node` and `test:node:coverage` in the root `package.json`.
- **Acceptance criteria:**
  - [ ] Neither test script passes `--expose-gc`, and `pnpm test:node` is still 142/142
  - [ ] Nothing references `globalThis.gc`
- **Notes:** Small, and deliberately not done inline with BL-050 — the flag is harmless and removing it is a change to how every test in the project is invoked, which deserves its own green run rather than riding along in a commit about a measurement technique. **Do it with or after BL-015**, which rewrites those scripts anyway; doing it before means editing them twice.

### BL-050 — Settle whether the math operations allocate, and how to measure it — **DONE 2026-08-13**
- **Phase:** 0 · **Size:** M · **Depends on:** BL-004 · **Docs:** 06, 29
- **Outcome:** the instrument was replaced, not the code. `measureAttributedAllocation` runs the operation under V8's sampling heap profiler (`HeapProfiler.startSampling`) and sums the bytes attributed to the measuring loop and its callees, so allocation is attributed **by call site**. All 30 operations — including the five the old instrument could not clear — read **exactly 0** attributed bytes against a control of **~115 kB** measured in the same process. `allocation.test.ts` is 13 passing cases with **no `todo`**, and the suite is 142 pass / 0 fail / 0 todo (was 131 / 0 / 16). It did **not** depend on BL-015: no Vitest was needed.
- **Original description (kept, because the diagnosis is the useful part):** BL-004's first acceptance criterion was unmet, and this was the whole of what remained of it. `core/math/allocationHarness.ts` is a working instrument — its control detects a deliberate per-call allocation at ~47 bytes/op and reports ~0.2 for one that writes into a caller-owned object — but run against the individual operations it gives a result that moves. Three to five of thirty report exactly one returned-object's worth of bytes (47.04 for a `Vec3`, 92.16 for an `AABB`), reproducible to two decimal places across runs, and **the set changes when unrelated parts of the test file change**. An effect that depends on a test's position in a file is not a property of the code under test; the same calls in an isolated script measure 0.01–0.10 bytes/op, and every operation's source plainly creates no object. So the operations are very probably allocation-free and the instrument is what is wrong at this scale.
- **Acceptance criteria:**
  - [x] Either the per-operation suites pass and stop being `todo`, or the harness is replaced by one whose reading does not depend on test ordering — **both.** The harness is replaced, and ordering independence was verified by moving the whole `vec3` suite to the end of the file: 13/13 unchanged
  - [x] The replacement keeps a control case that fails when a deliberate allocator is measured — and the allowance is **derived from that control in the same process** rather than being a constant, because a constant cannot tell "allocates nothing" from "the profiler saw nothing". Verified by blinding the instrument two ways (`samplingInterval` 65536; a stale `MEASURED_LOOP_NAME`): each turns 13 passes into 11 failures naming the cause
  - [x] The five originally-flagged operations (`addScaled`, aliased `add`, `rotateVec3`, `union`, `stepSpring`) are covered — all five at 0 attributed bytes
- **What the fix cost, for the next person who has to measure something like this:** the sampling profiler's absolute figures are **not** bytes allocated — it under-reports volume by ~100x here, because young-generation allocation from optimised code mostly takes a bump-pointer fast path V8 does not sample. That is fine for an "allocates / does not" criterion and would be useless for a byte budget. Two settings matter and both were measured in both directions: `samplingInterval` (65536 makes the **control** read 0 — a false pass) and `warmup` (at 5000 the operation tiers up inside the measured window and the compile allocation is attributed to it; at 200000 the control read 0 in one pass of three). The reported figure is the **minimum over three passes**, since every error source here is additive.
- **Notes (pre-fix, kept):** Eliminated by measurement already, so do not retry them: a before/after `heapUsed` delta (measures retention, not garbage — under-reported the control sevenfold), `PerformanceObserver` on `'gc'` (reports zero collections for 200,000 provable allocations on Node v22.22.2), a megamorphic call site in the harness (fixed, figures unchanged), integer-versus-double field representation in the scratch objects (fixed, figures went up), and boxing of a returned double (fixed, removed a real 6.2 bytes/op elsewhere but not this). Worth trying next: `node:inspector`'s `HeapProfiler.startSampling`, which reports allocation by call site and does not depend on the collector's timing; or measuring each operation in its own child process. Vitest (BL-015) may also simply not have the problem.

### BL-051 — Decide whether `-0` may reach world state
- **Phase:** 0 · **Size:** S · **Depends on:** BL-004 · **Docs:** 04, 23
- **Description:** `hash.hashNumberInto` hashes IEEE bits, so `-0` and `0` hash differently — correctly, since they are different bit patterns and a decimal-string hash would conflate them. But they are indistinguishable in a debugger and `-0 === 0`, so a component field that picked up a `-0` (trivially: `perp2` negates a zero component, and so does any negation) would make two worlds that look identical produce different `worldHash()` values, and a determinism failure with no visible cause is the worst kind. Decide: normalise `-0` to `0` at the hash boundary, forbid it in state, or accept it and document that state comparison must use `Object.is`.
- **Acceptance criteria:**
  - [ ] A decision recorded in `40_DECISION_LOG.md`
  - [ ] Whichever way it goes, a test pins it
- **Notes:** Discovered while landing BL-004: `perp2(v2(), v2(1, 0))` returns `{x: -0, y: 1}`, which `assert.deepEqual` separates from `{x: 0, y: 1}`.

### BL-052 — Collapse the three hand-synced path-alias maps into one
- **Phase:** 0 · **Size:** S · **Depends on:** BL-004 · **Docs:** 05
- **Description:** The same five aliases (`@core/*` … `@content/*`) are now written out in three places: `tsconfig.base.json` `paths`, `packages/client/vite.config.ts` `resolve.alias` (whose comment already notes it is hand-synced), and `tools/aliasResolver.mjs` (added by BL-004 so `node:test` can resolve them). Two copies was a documented trade; three is where a drift becomes likely and its symptom — one tool resolving an import that another cannot — is confusing out of proportion to the cause.
- **Acceptance criteria:**
  - [ ] One source of truth, read by the other consumers
  - [ ] A test or lint rule that fails if a consumer's map diverges from it
- **Notes:** BL-015 may delete the third copy for free by replacing `node:test` with Vitest sharing the Vite config. If so, close this as done-by-BL-015 rather than doing the work.

### BL-045 — Add `eslint-plugin-react-hooks` to the flat config
- **Phase:** 0 · **Size:** S · **Depends on:** BL-003 · **Docs:** 06
- **Description:** `06` §2 lists `eslint-plugin-react-hooks` among the flat config's plugins. BL-002 left it out: there is no React in the tree yet, so it would have had nothing to lint and no fixture could prove it works. Add it once BL-003 has mounted a React root, with a fixture in `tools/lint-fixtures/` per the pattern BL-002 established.
- **Acceptance criteria:**
  - [ ] `react-hooks/rules-of-hooks` and `exhaustive-deps` are on for `**/*.tsx`
  - [ ] A fixture violating each is caught by `pnpm lint:rules`
- **Notes:** Discovered while landing BL-002.

### BL-046 — Extend the per-frame allocation ban to named `three` imports
- **Phase:** 0 · **Size:** S · **Depends on:** BL-002, BL-011 · **Docs:** 06, 08, 28
- **Description:** BL-002's `no-restricted-syntax` selector matches `new THREE.Vector3()` — the namespace-import form BL-002 specified. It does not match `import { Vector3 } from 'three'` followed by `new Vector3()`, which is the form tree-shaking actually prefers and therefore the one `render/` is likely to use. Widening it needs either a maintained list of three.js constructor names or a type-aware rule.
- **Acceptance criteria:**
  - [ ] `new Vector3()` inside an `update*`/`sync*`/`step*` function is caught
  - [ ] A fixture per import form in `tools/lint-fixtures/`
  - [ ] No false positive on a `new Vector3()` at module scope
- **Notes:** Discovered while landing BL-002; the gap is named in a comment in `eslint.config.js` so it is not mistaken for an oversight.

### BL-047 — Migrate `boundaries/external` onto `boundaries/dependencies`
- **Phase:** 0 · **Size:** S · **Depends on:** BL-002 · **Docs:** 04
- **Description:** `eslint-plugin-boundaries` v7 deprecates the `boundaries/external` rule in favour of a `boundaries/dependencies` policy with module selectors, and warns about it on every run. BL-002 attempted the migration and the replacement policy did not fire — a deliberate `import * as THREE from 'three'` inside `sim/` passed with `checkAllOrigins: true` and a `disallow: { to: { module: { source } } }` policy. Rather than ship a rule that reads correctly and enforces nothing, `04` §5's "sim MAY NOT import three, react, DOM" stays on the deprecated rule.
- **Acceptance criteria:**
  - [ ] `sim/` importing `three`, `react` or `react-dom` is still an error, via `boundaries/dependencies`
  - [ ] `render/` importing `three` is still allowed
  - [ ] The deprecation warning is gone from `pnpm lint` output
- **Notes:** Verify with the four-direction probe described in the BL-002 development-log entry. Discovered while landing BL-002.

---

## Ready — Phase 1: Player & World (seeded; groom before starting)

### BL-022 — Control map authoring and loader
- **Phase:** 1 · **Size:** M · **Depends on:** BL-005 · **Docs:** 12
- **Description:** Author the 256² four-channel control map and build the loader plus a debug viewer for each channel.
- **Acceptance criteria:** loader is deterministic; the debug viewer renders all four channels; the map is committed under `assets-src/world/`.

### BL-023 — Base elevation generation
- **Phase:** 1 · **Size:** L · **Depends on:** BL-022 · **Docs:** 12
- **Acceptance criteria:** island silhouette matches the design intent from 8 viewpoints; generation is deterministic; water surrounds the playable area on all sides.

### BL-024 — Hydraulic erosion pass
- **Phase:** 1 · **Size:** M · **Depends on:** BL-023 · **Docs:** 12
- **Acceptance criteria:** ≤ 200 ms for 40k droplets; before/after golden heightmaps; deterministic.

### BL-025 — Feature carving (river, waterfall, terraces, harbour, cave pads)
- **Phase:** 1 · **Size:** L · **Depends on:** BL-024 · **Docs:** 12

### BL-026 — `TerrainData` accessors
- **Phase:** 1 · **Size:** M · **Depends on:** BL-023 · **Docs:** 13
- **Acceptance criteria:** `heightAt` ≥ 20M calls/sec; bilinear correctness at 10k sample points including edges.

### BL-027 — Chunk registry and worker mesher (LOD0)
- **Phase:** 1 · **Size:** L · **Depends on:** BL-026 · **Docs:** 13

### BL-028 — Terrain material with splat blending
- **Phase:** 1 · **Size:** L · **Depends on:** BL-027 · **Docs:** 13, 26

### BL-029 — LOD1/LOD2 and skirts
- **Phase:** 1 · **Size:** M · **Depends on:** BL-027 · **Docs:** 13

### BL-030 — Chunk streaming with priority and hysteresis
- **Phase:** 1 · **Size:** M · **Depends on:** BL-029 · **Docs:** 13

### BL-031 — Rapier integration and heightfield colliders
- **Phase:** 1 · **Size:** M · **Depends on:** BL-030 · **Docs:** 10

### BL-032 — Kinematic character controller
- **Phase:** 1 · **Size:** L · **Depends on:** BL-031 · **Docs:** 10, 11

### BL-033 — Movement system and player state machine (ground states)
- **Phase:** 1 · **Size:** L · **Depends on:** BL-032 · **Docs:** 11

### BL-034 — Third-person camera with spring arm and collision
- **Phase:** 1 · **Size:** L · **Depends on:** BL-033 · **Docs:** 08, 11

### BL-035 — Input manager and intent mapping
- **Phase:** 1 · **Size:** M · **Depends on:** BL-008 · **Docs:** 11

### BL-036 — Sky, sun, and the day/night cycle
- **Phase:** 1 · **Size:** L · **Depends on:** BL-011 · **Docs:** 20, 09

### BL-037 — Water plane and ocean shader (first pass)
- **Phase:** 1 · **Size:** L · **Depends on:** BL-028 · **Docs:** 09

### BL-038 — Vegetation scatter and instanced rendering
- **Phase:** 1 · **Size:** L · **Depends on:** BL-030 · **Docs:** 12, 08

### BL-039 — Region assignment and a debug readout
- **Phase:** 1 · **Size:** M · **Depends on:** BL-025 · **Docs:** 12

### BL-040 — Swim state and water entry/exit
- **Phase:** 1 · **Size:** M · **Depends on:** BL-037, BL-033 · **Docs:** 11

### BL-041 — Worldgen caching in IndexedDB
- **Phase:** 1 · **Size:** M · **Depends on:** BL-025 · **Docs:** 12, 23

### BL-042 — Movement feel harness scene and checklist
- **Phase:** 1 · **Size:** M · **Depends on:** BL-033 · **Docs:** 11, 29

### BL-043 — Playability invariant tests for worldgen
- **Phase:** 1 · **Size:** M · **Depends on:** BL-039 · **Docs:** 12, 29

### BL-044 — Phase 1 visual regression goldens
- **Phase:** 1 · **Size:** S · **Depends on:** BL-036, BL-037 · **Docs:** 29

---

## Icebox (good ideas, not now)

Reviewed at each phase boundary. Moving something out of the Icebox requires a human.

- Glider unlocked at Kestrel Point (traversal joy; strong post-1.0 candidate)
- Seasons with palette and crop rotation
- Fish pond building piece that displays caught fish
- Crab pots and passive traps
- Beehives near flowers
- Player-placed instruments and a play mechanic
- Reverb impulse responses per space (`ConvolverNode`) — may promote into Phase 6
- Paint mode for recolouring placed pieces without removal — may promote into Phase 4
- Rainbows after rain — cheap, promote into Phase 6 if time allows
- **BL-075** — the recipe-balance tool (`pnpm tools:balance`). Specified by `docs/16_CRAFTING_SYSTEM.md` (§"Balance is data" and its build-order step 9) and named by `tasks/phase_3_crafting.md` and `docs/39_CONTENT_AUTHORING_GUIDE.md`, but **no phase task owns it as an item** — filed 2026-09-07 by BL-072, which needed a real id for `tools/check-doc-commands.ts`'s `UNBUILT_COMMANDS` row to point at. Exactly BL-071's shape and filed for exactly BL-071's reason. It reads the content tables, estimates gather-cost per recipe, exports `docs/data/recipe-balance.csv` and flags outliers, so it cannot land before there are recipes to read: Phase 3 at the earliest, and scheduling it is a human's call.
- **BL-076** — the server package's headless smoke script (`pnpm --filter server sim-smoke`). Named by `docs/36_MULTIPLAYER_ARCHITECTURE.md` §"Build order" step 1 and by `tasks/phase_7_multiplayer.md`, and it is the **extract-verify** gate for the whole of Phase 7: the server imports `@halcyon/sim` and runs 20k headless ticks, which passes on day one only if Phases 1–6 kept `sim/` pure. Filed 2026-09-07 by BL-072 for the same reason as BL-071 and BL-075. **It is a forward reference in two ways at once**, which is why it is worth an id rather than prose: `packages/server` today is a README and no `package.json`, so it is not a pnpm workspace member and the selector resolves to nothing — and even once it is, the `sim-smoke` script has to be written. Phase 7; a human's call.
- **BL-071** — the asset pipeline's build script (`pnpm assets:build`). Specified in full in `docs/25_ASSET_PIPELINE.md` and named by `README.md` and `docs/39_CONTENT_AUTHORING_GUIDE.md`, but **no phase task owns it** — filed 2026-09-03 by BL-070, which needed a real item for `tools/check-doc-commands.ts`'s `UNBUILT_COMMANDS` row to point at. It carries an id, unlike the prose entries above it, for exactly that reason. It needs Blender and ffmpeg and real source art, so it cannot be Phase 0; scheduling it is a human's call, which is what the Icebox is for.
- Sketch-mode photo filter in the journal's ink style
- Map screen with fog-of-war and player pins
- Blueprint save/load for structures
- Storage network / remote crafting from nearby chests
- Time-capsule read-only save snapshots
- PWA offline install
- Record-and-replay regression testing from real sessions
- WebGPU renderer path
- Second island reachable by boat
- Character customisation beyond outfit colour
- Mod support
- Second Pages project on a `release` branch, restoring a staging tier — revisit at 1.0 (see DECISION_LOG 0022)

---

## Done

### BL-079 — Nothing asserts that `pnpm lint` still runs the format check
- **Completed:** 2026-09-15 · **PR:** — (pushed direct to `main`)
- `tools/check-lint-script.test.ts` (new), `package.json`. Suite **356 → 363 pass / 0 fail across 90 suites** — seven new cases, no new suite, no runtime code touched. `lint`, `lint:rules`, `lint:docs`, `typecheck`, `format:check` and `build` all clean.
- **Both criteria met.** Criterion 1: the guard reads the real root `package.json` and fails if `lint` stops reaching a format check. Criterion 2: it is run by `pnpm test`, which is the third command of the verify block.
- **THE HOST THAT LOOKS OBVIOUSLY RIGHT CANNOT WORK, AND THAT IS THIS ITEM'S ONE REAL FINDING.** Folding the guard into `pnpm lint` itself — `eslint . && prettier --check . && node ... check-lint-script.ts` — is the natural reading of "a check under `pnpm lint`", and it is self-defeating: **the edit this guard exists to catch is somebody rewriting `lint`, and that edit deletes the guard in the same stroke as the format check.** A guard living inside the string it guards is removed by the change it is meant to report. So it must be run by a *different* member of the verify block; `pnpm typecheck` is a recursive `tsc` and hosts no runtime assertion, which leaves `pnpm test`.
- **`tools/check-doc-commands.ts` was rejected for the reason the item named**: it is run by `pnpm lint:docs`, which is not in the verify block but in the prose beneath it. Hosting there reproduces BL-077's shape one level up.
- **`test:node`'s glob gained `tools/**/*.test.ts`.** This is repository-meta rather than game code, so it does not belong in `packages/client` or `packages/shared`. Probed before the design was committed to: `node --test` takes both patterns, 357 with a one-line probe present against a 356 baseline. It also opens the door `check-lint-rules.ts` predicted in its own header; nothing was moved there in this task.
- **The guard follows script calls rather than string-matching**, because both spellings are real here — `lint` runs `prettier --check .` directly today, and `format:check` is that same command under a name. It is deliberately not a string equality against today's value: `lint` gaining a third step is not the regression, and a test that fails on that gets weakened by the next person who hits it. **`--write` is rejected however it is reached**, which is the one place being liberal would be actively wrong: a `lint` that formats rather than checking reports nothing and leaves a dirty tree — the exact silent pass this guards.
- **Confirmed able to fail before it was trusted**, following BL-069's Surprise 1. Six of the seven cases drive the predicate over manifests the repository does not have; and by hand, with `lint` set to `eslint .`, the suite read 6 pass / 1 fail with a message naming the current value, decision 0035, and both ways to put it right. Tree restored.
- **The residual is declared rather than left to be found.** The guard now leans on `test:node`'s glob the way the format check leaned on `lint`'s string. Smaller, not closed, and **not closable from inside** — a test in `tools/` cannot notice the glob stopped selecting `tools/`. The closure is BL-019's CI, where a check that silently stops running shows as a job that stops reporting. Recorded as BL-019's content rather than filed again.
- **Discovered work: BL-080**, that nothing type-checks `tools/` at all.

### BL-077 — Two test files have never been formatted, and no gate would notice
- **Completed:** 2026-09-13 · **PR:** — (pushed direct to `main`)
- `package.json`, the four test files, `CLAUDE.md`, `docs/AI_DEVELOPMENT_WORKFLOW.md`, `README.md`. Decision **0035**. Suite unchanged at **356 pass / 0 fail across 90 suites** — no runtime code was touched, only whitespace inside four test files. `lint`, `lint:rules`, `lint:docs`, `typecheck`, `format:check` and `build` all clean.
- **Both criteria met, and the item's own question is answered: BL-019 does NOT absorb criterion 2.** A CI gate and a local gate answer different questions, and BL-019 will run `pnpm lint` anyway and inherit this for free.
- **The item says two files. There were four.** Bisected by re-running prettier over each revision's blob: `Query.test.ts` and `Query.defTypes.test.ts` were BL-065's, and **`EventBus.queued.test.ts` and `allocation.test.ts` were added by BL-074's own code commit** — in the session whose entries here and in `34` both say "`format:check` is still red on BL-077's two files, unchanged and not this task's". Written in good faith, false when written, and false for exactly the reason this item exists: the check is not in the verify block, so the session could not see that its own edits had doubled the count it was accurately reporting. **The earlier entries were not corrected** — decision 0033's rule, that a log records what was true when written.
- **Criterion 2 is `"lint": "eslint . && prettier --check ."`,** decision 0033's move applied a second time (and 0033 named this item as its reason for making it the first time). `pnpm lint` is the first command of the verify block, so the check cannot be skipped without skipping the block. **Rejected: adding `pnpm format:check` as a fourth line** — a line in a document is exactly what was forgotten, since the script existed the whole time and the block simply did not name it. `lint:rules` and `lint:docs` are not carriers either; they sit in the prose beneath the block.
- **The wiring was confirmed able to fail before it was trusted green**, following BL-069's Surprise 1: an unformatted line appended to `Query.defTypes.test.ts` made `pnpm lint` exit 1 naming that file; tree restored, back to 0.
- **The filing's line-count check paid off as intended.** `Query.test.ts` 494 → **491** against a hard 500 with `max-lines` at `error`; the two BL-074 added were re-checked here at 213 → 212 and 436 → 442. `allocationHarness.ts` (496 of 500, decision 0034) was already formatted and untouched.
- **Discovered work: BL-079**, that nothing asserts the wiring stays.

### BL-074 — `allocation.test.ts` fails about one run in twenty, on whichever operation catches a stray sample
- **Completed:** 2026-09-12 · **PR:** — (pushed direct to `main`)
- `core/math/allocationHarness.ts`, `core/math/allocation.test.ts`, `core/EventBus.queued.test.ts`. Decision **0034**. Suite **353 → 356 pass / 0 fail across 90 suites**, green on **3 consecutive full runs**. `lint`, `lint:rules`, `lint:docs`, `typecheck` all clean. **`format:check` is still red on BL-077's two files**, unchanged and not this task's.
- **All three criteria met, and BL-057 is closed by the same change** — it is the same defect, filed 2026-08-16 with this exact arithmetic, and its third criterion ("`core/math/allocation.test.ts` gets the same treatment as `core/EventBus.test.ts`") is why both consumers changed. Moved here beside this entry, following BL-073/BL-055's precedent.
- **The root cause is sharper than the filing.** The backlog said the allowance "lands near" the stray-sample floor when the control reads low; measured, **it lands below it, always**. `controlBytes / 100` clears the 1024-byte sampling interval only above a control of 102 400, and the control reads **54 912–67 584 idle** / **77 280–101 952 under four allocating hog threads** — allowances of 549–1020, i.e. **0.54–1.00 samples**. BL-065's two failures were one sample each and were always going to fail.
- **Criterion 1** is answered by changing the *unit*: `strayAllocationAllowance()` is four sampling intervals, 3× above the worst stray ever observed and 13× below the weakest control, with every allocation-free operation reading **exactly 0** across 130 measurements in both conditions.
- **Criterion 3** is answered on its *removed* branch. The control did not go away — BL-050's dead end forbids that — it moved from **setting** the boundary to **asserting the gap** around it, at 8×. That is what makes "do not raise the allowance blindly" enforceable: measured, `MAX_STRAY_SAMPLES` of 6 is green and 8 is red, so the boundary cannot be widened toward the control without the run going red. The old derived allowance could never fail that way by construction.
- **Criterion 2 is a permanent test, not a perturbation**, per BL-069's and BL-063's precedent: a deliberate per-call allocator runs through `assertNoAllocation` itself and is asserted to be rejected, and the two readings that actually failed (1344, 1040) are pinned as numbers.
- **`EventBus.queued.test.ts` lost its `repeats: 6`.** It was a mitigation for this defect — its own comment said so and BL-057's notes called it "a local patch, not the fix" — and leaving it would have meant that file kept passing for the old reason and never exercised the change.
- **Six controls, tree restored and green after each:** allowance ×50 → the gap guard fires (raising it blindly does *not* go green); allowance 0 → 4 failures, the defect recreated; `samplingInterval` 65536 → guard fires; stale `MEASURED_LOOP_NAME` → guard fires; the assertion made unconditionally true → the able-to-fail case fails and nothing else; 6 green / 8 red as above.
- **Discovered work: BL-078**, the sparse-allocator blind spot, measured (4224–11 648 for one allocation per 1000 calls) and deliberately not chased.

### BL-057 — The allocation allowance can fall below one profiler sample
- **Completed:** 2026-09-12 · **PR:** — (pushed direct to `main`), closed by BL-074
- The same defect as BL-074, filed four weeks earlier from a real `EventBus.test.ts` failure and re-measured independently on 2026-09-12. All three criteria met by BL-074's change; see that entry and decision **0034**. **Worth recording that it was filed twice**: BL-006 measured the arithmetic in August and mitigated its own three cases with `repeats: 6`, and BL-065 measured the failures in September without connecting them to the open item — so the tree carried a correct diagnosis and a local workaround for four weeks while a second filing described the symptom.

### BL-073 — Two statements in `README.md` are now false
- **Completed:** 2026-09-08 · **PR:** — (pushed direct to `main`)
- `README.md`, `CLAUDE.md`, `docs/32_BACKLOG.md`, `docs/35_AI_AGENT_RULES.md`, `package.json`, the new `tools/check-workflow-doc.ts`, and the deletion of `.github/AI_DEVELOPMENT_WORKFLOW`. Decision **0033**. Suite unchanged at **353 pass / 0 fail across 90 suites** — no runtime code was touched. `lint`, `lint:rules`, `lint:docs`, `typecheck` and `build` all clean. **`format:check` is still red on BL-077's two files**, unchanged and not this task's.
- **Both criteria met.** **BL-055 is closed by the same change** and moved here beside this entry — it is criterion 2 stated separately, and the handoff's instruction was to absorb rather than leave two items pointing at a fixed problem.
- **The copy was deleted rather than made a pointer, and that was decided on a diff rather than a preference.** Normalised for line endings, `.github/AI_DEVELOPMENT_WORKFLOW` differed from the canonical document in exactly **one hunk**: the eight-line paragraph BL-062 added saying which `pnpm` commands do not exist yet and which item builds each. It was a strict subset — **a document that had already silently stopped saying something a previous session put there**, which is the rot BL-073's note predicted, found in the state it predicted. Nothing was lost by deleting it.
- **BL-055's description is stale and was corrected by measurement**: it says `.github/AI_DEVELOPMENT_WORKFLOW` is an "empty **directory**". It was a file — 81 lines, CRLF, no extension. Its second criterion ("the empty directory is gone, or holds the file") is met either way, the directory being gone entirely.
- **The check is the deliverable, not the edit**, per BL-062's precedent and `29` §9's bug-fix row. `tools/check-workflow-doc.ts` was written **first** and confirmed failing on the unfixed tree, on exactly the six things BL-073 describes: the stray document and all five live references. It enforces two rules — one document (by filename, in any extension, anywhere outside `node_modules`), and every reference resolves — and runs from `pnpm lint:docs`, which every session already runs.
- **Its escape hatch is the repository's own contract, not an exclusion list.** `32` and `34` name the broken path on purpose: an item describes the bug it is about, a log records what was true. Forcing those to be rewritten would destroy the record to satisfy a checker. So a mention is legal when a `BL-###` sits beside it — the same "name the item beside it" rule `check-doc-commands.ts` applies to an unbuilt command, sharing even the forward-only annotation scope. An exclusion list would say *this file may rot*; this says *any file may describe a broken path if it says which item the description belongs to*. **A live instruction carries no id and is caught**, which is why all five references failed and neither BL-073's own description nor the log entries did.
- **The banner was written from a count taken here, not from the item that filed it.** BL-073's description says "BL-001 through BL-070 have landed". They have not: **21 of the 77 filed items are done**, and BL-008 through BL-021 are still in Ready. The banner now says Phase 0 in progress, 21 of 77, 353 tests across 90 suites, and — the part a visitor most needs — that what exists is the substrate and not the game, naming BL-008, BL-011, BL-014 and BL-019 as why there is nothing to look at yet. It also says it lags `32` and `33`, which is how it went stale.
- **Left for BL-021 on purpose** (`35` §3): `CONTRIBUTING.md`, "clone to a passing test run using only the README", and `CLAUDE.md` under 100 lines. BL-021's third clause — "the `.github/AI_DEVELOPMENT_WORKFLOW.md` reference from the repo root" — is done and its notes now say so.

### BL-055 — Fix the `AI_DEVELOPMENT_WORKFLOW.md` path that three files point at
- **Completed:** 2026-09-08 · **PR:** — (pushed direct to `main`), as part of **BL-073**
- Closed by BL-073's criterion 2, which is this item restated with a check attached. Both criteria met: the path in `CLAUDE.md` and `AI_DEVELOPMENT_WORKFLOW.md` resolves (and in three further documents this item did not know about), and `.github/` is gone entirely rather than holding the file.
- **Its note was right and was followed**: "Decide which location is canonical rather than adding a second copy — two copies of the session loop is worse than a wrong path, because a wrong path fails loudly." That is the argument against leaving a stub behind, and it is why the copy was deleted. `docs/AI_DEVELOPMENT_WORKFLOW.md` is canonical because it is the copy `lint:docs` covers and the one that was current.
- **Its description was stale on the one fact it turned on** — see BL-073's entry: the `.github/` entry was a file, not an empty directory.

### BL-072 — The other `tasks/*.md` name `pnpm` commands and are still uncovered
- **Completed:** 2026-09-07 · **PR:** — (pushed direct to `main`)
- `tools/check-doc-commands.ts`, `tasks/phase_3_crafting.md`, `tasks/phase_7_multiplayer.md`, decision **0032**, new items **BL-075**, **BL-076**, **BL-077**. Suite unchanged at **353 pass / 0 fail across 90 suites** — this task touches no runtime code. `lint`, `lint:rules`, `lint:docs`, `typecheck` all clean.
- **Both criteria met.** `COVERED_DOCS` is now eleven documents: the three agent-facing ones and **every** `tasks/*.md`. The `--filter` form is read and checked rather than declared out of scope.
- **Criterion 2 was decided before the code and on a probe, and the probe changed the answer.** `tasks/phase_7_multiplayer.md` writes `pnpm --filter server sim-smoke` while `packages/server/README.md` says the package will be `@halcyon/server`, and the root `dev` script writes the scoped form — which reads like a document naming a selector that cannot match. It is not: `pnpm --filter client typecheck` resolves to `@halcyon/client` and `--filter nonexistentpkg` reports "No projects matched the filters". **A bare selector matches the unscoped tail.** Reasoned about instead of run, the check would have enforced an invented convention across five documents.
- **The blindness was in the pattern, not the list**, which is why implementing beat declaring. `PNPM_COMMAND`'s `(?!--)` skipped the flag, so the one `--filter` reference in any covered document was never read as a command — the check reported clean over it *by construction*. A declared limit would have left that true.
- **What the selector support does not do is written into the module header**, per the item's own note that a silent blind spot is worse than a stated one: globs, path selectors, `...` traversal and `[<since>]` are unsupported, none appears in any covered document, and an unresolvable selector is **reported** rather than skipped. Skipping is the failure mode being removed; rebuilding it one level down would have been the easy mistake.
- **Six perturbations, each run, sources restored from backups.** A filtered forward reference losing its id, an unresolvable selector with no table row, a real package with a missing script, an unfiltered id removed in a newly covered file, and a **stale** row on a command that now exists — all caught. The sixth is the one that justifies the list half: the same broken reference in a file dropped from `COVERED_DOCS` reports **"10 document(s) clean"**.
- **The stale-row perturbation found a real defect in the first draft.** The filtered rule was split between the scanner and its caller, and a stale row was then suppressed whenever the document still carried the annotation — precisely when a stale row is most likely to be there. The whole rule now lives in one function.
- **Discovered work: BL-077**, two test files that have never been formatted, measured on the untouched tree. The interesting half is *why nobody noticed*: `pnpm format:check` exists and no verify block or gate runs it.

### BL-065 — `QueryCache.query` takes the bottom of the def family, so every direct caller casts
- **Completed:** 2026-09-06 · **PR:** — (pushed direct to `main`)
- `sim/ecs/Query.ts`, `sim/World.ts`, `sim/ecs/Query.test.ts`, `sim/ecs/Query.limit.test.ts`, new `sim/ecs/Query.defTypes.test.ts`, decision **0031**. Suite **349 → 353 pass / 0 fail**, **89 → 90 suites**. `lint`, `lint:rules`, `lint:docs`, `typecheck` all clean.
- **All three criteria met.** `AnyComponentDef` is re-pointed from `ComponentDef<never>` to `ComponentDef<unknown>` and its doc says which position it is for; `QueryCache.query` accepts any `ComponentDef<T>` with no cast; `World.query`'s erasing `as` is deleted.
- **Both copies of `anyDef<T>` are gone, not only the one the criteria name.** `Query.limit.test.ts` carried its own, added by BL-063 four days after this item was filed, and deleting only the named one would have left the helper alive next door — which the previous handoff flagged and is the reason it is worth stating here.
- **This is decision 0027's widening one level down, not a new decision.** 0027 chose exactly this direction for `ErasedStore` and recorded that every member a caller uses is covariant in `T`; the same holds here because a query reads a def for identity only. 0027 and 0030 both say in as many words that they do not solve this item.
- **A consequence worth knowing about is in decision 0031**: `registry.store(someAnyComponentDef)` now yields `ComponentStore<unknown>`, whose `set` accepts any value, where it used to yield `ComponentStore<never>`, whose `set` accepted none. No new capability — `store<unknown>(def)` was always spellable — but a shorter accidental path, and the reason `AnyComponentDef`'s doc says it is a parameter type and not a storage type.
- **The private surface moved with the parameter.** `CachedQuery.stores`, `storesFor` and `intersect` all said `ComponentStore<never>`; typecheck found each in turn rather than any of them being noticed by reading.
- **Deleting the casts exposed three more.** Three `store.set(e, 1 as never)` writes in `Query.test.ts` became unnecessary assertions the moment the stores stopped being `ComponentStore<never>`, and lint — not review — caught them.
- **Verified able to fail, following BL-063's and BL-069's precedent, sources restored from byte-checked backups after each.** Re-pointing the type back to the bottom fails the build with **52 errors**; deleting either `@ts-expect-error` in the new file reports the assignment it suppresses.
- **New file rather than cases in `Query.test.ts`**, which sits at 494 of 500 against `max-lines` at `error` — the seam decision 0029 predicted and BL-063 already used once.
- **Discovered work: BL-074**, a pre-existing ~1-in-20 flake in `allocation.test.ts`, measured on the untouched tree as well as the changed one and deliberately not fixed here.

### BL-063 — `QueryCache` has no eviction
- **Completed:** 2026-09-04 · **PR:** — (pushed direct to `main`)
- `sim/ecs/Query.ts`, new `sim/ecs/Query.limit.test.ts`, `sim/World.ts`, `docs/04` §4.3, decision **0030**. Suite **342 → 349 pass / 0 fail**, **88 → 89 suites**. `lint`, `lint:rules`, `lint:docs`, `typecheck` all clean.
- **Criterion 1 answered by its second branch, not by eviction.** `query` accepts only statically-known signatures, and `SIGNATURE_LIMIT = 64` checks it — a *new* signature past the limit throws, naming the rule, the likely cause, the constant to raise and this item. **Criterion 2 is answered in `Query.ts`'s module comment**, at length: LRU-on-a-cap and drop-if-unqueried-for-N-ticks are both named, with why neither was taken.
- **The reason eviction lost is measured, not aesthetic.** Decision 0024 makes a cached entry survive across ticks, and BL-059 measured the cold intersection at **1.00 ms** against **0.0784 ms** cached. Evicting a signature that is still in the system list converts a hit into that ~13x cold path on a 6 ms CPU budget — so an LRU sized slightly small thrashes, and one sized generously never evicts, which is this limit with more moving parts. Drop-if-unqueried-for-N-ticks additionally needs a tick number that `QueryCache` deliberately does not observe.
- **The lifetime question the item was waiting on is settled and turned out not to need a policy at all.** One `QueryCache` per `World`, constructed with it and unreachable from outside, so the map dies with the world; there is no process-lifetime leak, only unbounded growth *within* a session, which is what the limit bounds.
- **64 is reasoned, not picked.** `05` §1 lists thirteen system files; a handful of distinct queries each is order-50, while a content-derived signature (a query per crop species) passes 64 inside one save file. It is a tripwire for a design error, not a capacity to tune, and the message says so.
- **Verified able to fail, following BL-069's precedent.** Three perturbations, tree restored and re-run green after each: deleting the check fails 3 cases; weakening `>=` to `>` so a 65th is admitted fails 3; changing the constant fails the case pinning its value in the message. The boundary is also pinned **from below** — 64 must be *accepted* — because an off-by-one there would crash a build inside its stated budget, which is worse than the unbounded map this started from.
- **The tests are in a new file and that is `max-lines` working as designed.** Decision 0029 left `Query.test.ts` at 499 of 500 and predicted "the next case anybody adds now fails lint". This was that case; split at the seam BL-063 creates rather than by cutting the existing file.
- **BL-065 was deliberately not ridden along** (`35` §3) though it touches the same signature and is now the topmost ready item.

### BL-070 — `README.md` and `tasks/*.md` name the same unbuilt commands, and the checker does not cover them
- **Completed:** 2026-09-03 · **PR:** — (pushed direct to `main`)
- `tools/check-doc-commands.ts`, `README.md`, `tasks/phase_0_foundation.md`, `tasks/phase_1_player_and_world.md`. `COVERED_DOCS` is five files; `pnpm lint:docs` green. Both acceptance criteria met. Suite unchanged at **342 pass / 0 fail across 88 suites** — this task adds no test because it adds no behaviour to test; the check *is* the test, and it was graded by perturbation instead.
- **The register was decided per file, which is what the item said the task was.** `README.md` is read by a human arriving at the repository: the note under the quick-start leads with what will fail today and carries the backlog id as supporting detail. The architecture section's "(`pnpm sim`)" became "a headless simulation harness" — that section is about the idea, and the command belongs in the quick-start where a reader can act on it. The Blender/ffmpeg sentence **keeps** naming `pnpm assets:build`, because deleting the name would have hidden the gap rather than recorded it.
- **The two `tasks/*.md` needed almost nothing, exactly as the item predicted.** A phase-exit line naming an unbuilt command is doing its job. `phase_0`'s M0.5 heading already names BL-014 and was left alone; only the Proof line at the top needed a clause. `phase_1`'s exit line already named BL-043 — the item owning the worldgen *invariants* — and gained four words naming BL-014 as the item owning the *harness*, which is a different thing and was the actual ambiguity.
- **The finding was not in the list.** `README.md` is the first covered document written for a human rather than for an agent following a verify block, and it broke an assumption the check had been making for free: that every `pnpm <word>` in a covered document is a command. Its "Tech at a glance" line reads "Vite · pnpm workspace · three.js", and the check reported a missing `workspace` script. The scan is now restricted to fenced blocks and inline code spans — where a command a reader is meant to type always lives. Strictly safe: a document cannot escape the check by putting a command in backticks, because that is the only way anyone writes one.
- **Verified by perturbation, five of them.** Removing the `BL-014` marker from each of the three newly covered files turns `lint:docs` red at exactly that file and line (three cases). `pnpm not-a-script` added inside README's fence is caught; the identical string added to the prose beside it is correctly ignored — the two together are what make the narrowing a fix rather than a hole.
- Discovered work: **BL-071** (nothing owns `pnpm assets:build`; Icebox, with an id so `UNBUILT_COMMANDS` has something real to point at), **BL-072** (the other two `tasks/*.md`, plus the pattern's blindness to `pnpm --filter <pkg> <script>`), **BL-073** (`README.md`'s status banner says "pre-implementation", and five documents point at a `.github/AI_DEVELOPMENT_WORKFLOW.md` that does not exist).

### BL-062 — The verify block names three commands that do not exist
- **Completed:** 2026-09-02 · **PR:** — (pushed direct to `main`)
- `package.json`, `CLAUDE.md`, `docs/AI_DEVELOPMENT_WORKFLOW.md`, and the new `tools/check-doc-commands.ts` (`pnpm lint:docs`). Both criteria met. Suite unchanged at **342 pass / 0 fail across 88 suites**, now run through the new alias; lint, typecheck, `lint:rules`, `format:check` and `build` all clean.
- **Criterion 2 by alias, not by rename.** `pnpm test` runs `pnpm test:node`. `pnpm test` is what both documents say and what a newcomer types; renaming `test:node` would touch every doc and script naming it for no gain, and BL-015 owns the harness outright later anyway.
- **Criterion 1 by annotation.** Both documents now name the item that builds each command they mention and the repository lacks: `pnpm sim` → BL-014, `pnpm check:bundle` → BL-018, `tools/check-sim-purity.ts` → BL-017. The useful thing to tell a Phase-0 session is not "do not run this" but "this arrives with BL-014".
- **The check is the deliverable, not the edit.** `29` §9's *Bug fix* row asks for a regression test, and the bug here is "a document names a command that does not exist" — so the wording fix alone would have been today's answer to a recurring question. `tools/check-doc-commands.ts` was written first and **confirmed failing on the pre-fix documents**, on exactly the six references BL-062 describes.
- **The first version of the check was wrong and a perturbation caught it**, which is BL-069's lesson applied. It asked only for "some `BL-###` in the paragraph"; deleting `BL-014` from the note left `BL-017` and `BL-062` still in the same paragraph and the check stayed **green** while the document had stopped saying which item builds `pnpm sim`. It now carries an `UNBUILT_COMMANDS` table naming the expected item per script — the same shape `check-lint-rules.ts`'s expectation table uses. **Both perturbations now fail**: deleting `BL-014` names the two lines, and an invented `pnpm nonexistent` is rejected for having no row at all.
- **Scope held.** `README.md` and `tasks/*.md` name the same commands and were left alone — BL-062's criteria say "both docs" and `35` §3 forbids the ride-along — so `COVERED_DOCS` is an explicit two-file list and the rest is **BL-070**.

### BL-060 — `World.destroyEntity` must reach the component stores
- **Completed:** 2026-08-25 · **PR:** — (pushed direct to `main`)
- `sim/World.ts` and `sim/ecs/ComponentStore.ts`. `World.destroyEntity` now calls the new `ComponentRegistry.removeEntity(entity)` before delegating to the allocator, so after a destroy no store holds a slot for that entity (criterion 1). **Cost is stated on both sides and the rejected option is named** (criterion 2): per-store `remove` is `O(stores)` per destroy, each an O(1) swap; the sweep is `ComponentStore.prune()`, `O(total entries)` per pass, and its doc now says it is the alternative not taken and why.
- **The deciding argument was not cost.** `QueryCache` invalidates on store `version`, so a sweep on a cadence would bump the version of every store it touched on whichever tick it happened to run — every cached query missing for a reason no system could point at. The eager fan-out moves the version exactly when the entity was destroyed. `prune()` stays for a store driven directly by an `EntityAllocator` with no `World` between them, which is what `ComponentStore.test.ts` does.
- **The ordering trap, and it is the whole risk of this task.** `ComponentStore.remove` refuses a dead or stale handle, so the fan-out must run *before* the allocator destroys it. The obvious order — destroy, then fan out — makes every `remove` a silent no-op and leaves exactly this leak, **with a green suite**, because a destroyed entity's components are unreadable either way. A case asserts the mechanism rather than only the outcome: it destroys through the allocator directly and watches `removeEntity` return `0`.
- The case that asserted the opposite (`destroyEntity does NOT reach the stores — that is BL-060`) is rewritten, as its own comment said it would be, and five more join it. **Three perturbations applied, run and reverted**: the reversed order fails 4 cases, no fan-out at all fails 5, and a fan-out that breaks at the first hit fails 1. One assertion is deliberately *not* presented as grading the fan-out and says so in place — `query()` drops a destroyed entity with or without it, since `QueryCache` keys on the allocator's version too.
- **Verification:** 334/334 node tests (was 328), `lint`, `lint:rules`, `typecheck`, `format:check`, `build` all clean.
- Discovered work: **BL-066** (`ComponentRegistry` still exposes no way to enumerate its stores). Acceptance criteria all met.

### BL-064 — BL-059's query-budget assertion is flaky under full-suite load
- **Completed:** 2026-08-24 · **PR:** — (pushed direct to `main`)
- `Query.test.ts`, the cached 6-component-query budget case only. Confirmed pre-existing first: a fresh `pnpm test:node` on `origin/main` (`fbbd919`) failed the assertion at **0.2148 ms**. The old form averaged a single 200-query block (~16 ms wall), so any scheduler preemption during that window folded into the number under `node --test`'s 87-suite worker load. Replaced with a **best-of-N per-sample minimum**: each cache hit (query + full 10,000-handle iteration, exactly what the budget bounds) is timed on its own and the minimum over 5000 samples is asserted. A single hit is far shorter than a scheduler quantum, so some sample runs uninterrupted even under sustained load. **The 0.15 ms budget is unchanged and the assertion is neither skipped nor deleted** (criterion 2); the two rejected options — an in-process control (decision 0023's pattern) and isolating the timed suite — are named in the comment (criterion 3).
- **Surprise, and it reframes the task.** On this container the query's cost is genuinely near the budget even *idle*: measured **iteration-only ~0.15 ms** and best-case query+iteration **~0.12 ms** isolated, against BL-059's original ~0.078 ms on its box. So this is not purely a contention artefact — the 0.15 ms budget is marginal on slower hardware, and only the single fastest JIT-warmed hit (~0.12 ms) has headroom. A block *average*, however short the block, reads ~0.14 ms here with none. Per-sample minimum was the one form that both keeps the budget and clears it reliably. **If this flakes again, the in-process control is the correct next step** — on a machine where iteration alone approaches 0.15 ms, an absolute wall-clock constant is the wrong contract, and decision 0023 already has the pattern.
- **Verification:** 40 consecutive full-suite runs clean on this loaded container after the fix (criterion 1 asked for ≥ 6). One earlier run failed during tuning of a rejected block-average variant and could **not** be reproduced in the 40 runs of the final form; it is recorded rather than hidden, and if a rare non-budget flake exists it is not this task's and was not identified.
- Discovered work: none. Acceptance criteria all met.

### BL-061 — Assemble the `World` class
- **Completed:** 2026-08-23 · **PR:** — (pushed direct to `main`)
- `sim/World.ts` and `sim/systems/order.ts`. 23 tests; suite **328 pass / 0 fail / 0 todo**, was 305. Both acceptance criteria met. **Criterion 1 cannot be tested by behaviour** — a `World` that reimplemented the allocator would behave identically, because the reimplementation would be a copy of the same algorithm — so the cases assert **identity**: the store returned is the registry's own object, the query result is the cache's own frozen array, and `queryStats.hits` moves on the second call. **Criterion 2's cases run the same three systems in two different orders inside one test**, so a `step` that sorted, reversed or ignored the array fails. `SYSTEM_ORDER` is frozen and **empty**, which is the honest content while no system exists; thirteen no-op stubs is the scope expansion `35` §3 forbids, and the deliverable is the shape.
- **Two decisions in `step`.** The tick increments **first**, so a system reading `world.tick` sees the tick it is executing. The deferred queue drains **after every system** — `04` §4.4 leaves that point to "the loop's owner" and `World.step` is now that owner; events are for presentation, which draws the end-of-tick state, and Phase 7 replaces this choke point with a per-tick network batch. A throwing system aborts the tick **without draining**, naming itself and keeping the original as `cause`, because a half-run tick has produced a state no system order would produce. The tick is not rolled back: the world really did partially advance.
- **Surprise, and it is decision 0025.** `EventBus<M>` is **invariant in `M`** — it holds a `Map<keyof M, Slot[]>` and an `on` whose handler takes `M[K]` — so `World<M>` is assignable to `World<M2>` for **no other `M2` at all**, not the empty map and not the widest one. A `System<M>` names `World<M>` in parameter position, so a system list and its world must name the *same* event map: there is no one `SYSTEM_ORDER` that serves every `World<M>`. The order is therefore a **constructor argument rather than an import**, which is the better shape independently — no module-level global reached for from inside a class, and a test can run recording systems without touching the authoritative array. Three alternatives were tried against the typechecker rather than reasoned about, and all three produced real errors: a cast at the default parameter (sound only while the array is empty), dropping the type parameter (`keyof object` is `never`, so `emit` accepts nothing), and inventing the event map here.
- **Second surprise:** `QueryCache.query` takes `ComponentDef<never>`, the *bottom* of the def family, so every direct caller has to cast — `Query.test.ts` carries an `anyDef<T>` helper for it. `World.query` takes `ComponentDef<unknown>` instead, so a system writes `world.query(Transform, PlayerTag)` with no cast. Filed as BL-065 rather than fixed in `QueryCache`.
- **Third surprise, and it is not this task's:** BL-059's 0.15 ms query-budget assertion is flaky under full-suite load — 2 failures in 6 runs, **confirmed at the same rate on a clean tree before continuing**. Filed as BL-064. Not worked around, not loosened.
- Discovered work: BL-064, BL-065. Unblocked by this: BL-060, BL-063 (both were waiting on a `World` to exist).

### BL-058 — ECS-lite part 2: sparse-set component stores
- **Completed:** 2026-08-18 · **PR:** — (pushed direct to `main`)
- `sim/ecs/ComponentStore.ts`: `ComponentDef<T>`/`defineComponent`, the `Store<T>` interface of `04` §4.3, the sparse-set `ComponentStore<T>` (`has`/`get`/`set`/`remove`/`entities`/`size`/`prune`), and `ComponentRegistry.store(def)` — which is `World.store(def)` standing alone, because there is still no `World` (BL-007 handoff note 6, now filed as BL-061). 32 tests; suite **285 pass / 0 fail / 0 todo**, was 253. All three acceptance criteria met. **The dense array holds the whole 32-bit handle, not the index**, so `dense[pos] === e` is an exact identity test and a recycled index misses instead of inheriting its predecessor's component. **`entities()` sorts by INDEX, not by handle** — the generation is in the high 12 bits, so a numeric handle sort orders by generation first and agrees with an index sort in every fresh fixture, diverging only once an index is recycled; one test constructs the disagreement, where `(index 0, gen 2)` is the larger number and the smaller index. Criterion 3's reject-or-ignore choice is resolved **asymmetrically and documented**: `set` throws, `get`/`has`/`remove`/`entities` are tolerant, because a second destroy is a normal two-systems-one-event race with nothing to do while a second `set` is a computed value that would be silently lost. Liveness is always `allocator.isLive` — never re-derived. Five perturbations all caught (sort by handle, drop the identity test, skip the liveness check in `set`, clear the sparse slot after the swap, drop the liveness filter from `entities`). Discovered work: BL-060, BL-061, BL-062. **Surprise:** TypeScript parameter properties fail at *runtime* under this repo's `node --test` type stripping (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`) while typechecking and linting cleanly — this repository had no constructor with arguments before now, so nothing had met it. **Second surprise:** a swap-remove bug found by re-reading rather than by a test, clearing the moved entry's sparse slot instead of the removed one's; invisible to any test that removes only the last element.

### BL-007 — ECS-lite part 1: the entity allocator
- **Completed:** 2026-08-18 · **PR:** — (pushed direct to `main`)
- `sim/ecs/EntityAllocator.ts`: `create`/`destroy`/`isLive`/`liveEntities`, plus `indexOf`/`generationOf`/`NULL_ENTITY` and the `liveCount`/`retiredCount`/`capacity` counters. 13 tests; suite **253 pass / 0 fail / 0 todo**, was 240. All four acceptance criteria met. **The handle is one unsigned 32-bit number** — 20 index bits (1,048,576 live) against 12 generation bits (4,095 reuses per index) — so it clones and hashes as a primitive, per `04` §4.3's `type EntityId = number`. **Generations start at 1**, which is what makes handle `0` unreachable and `NULL_ENTITY` representable; the alternative makes index 0's first entity the number `0` and every `if (entity)` in the codebase quietly mean "every entity except the first". **A spent index is retired, not wrapped** — wrapping generation 4095 back to 1 re-issues a handle that was already live, which is the aliasing the generation bits exist to prevent. Only index-space exhaustion throws. The 1M-cycle criterion is checked against **every** handle issued so far, not the predecessor, because a wrapping counter passes the pairwise version 4,094 times in 4,095. Five perturbations all caught (wrap-instead-of-retire, drop the `>>> 0`, generations from 0, `isLive` ignoring the generation, descending iteration). **Split note:** this is one of three slices of the original size-L BL-007 — see BL-058 and BL-059, and the 2026-08-18 log entry. **Surprise:** `06`'s ban on non-null assertions collides with `noUncheckedIndexedAccess` on every parallel-array read; resolved with one guarded accessor rather than 5 `?? 0` fallbacks, since generation `0` already means "no such entity" here.

### BL-006 — Typed event bus
- **Completed:** 2026-08-16 · **PR:** — (pushed direct to `main`)
- `core/EventBus.ts`: generic over an event map, `on`/`once` returning their own `Unsubscribe`, `emit` for immediate dispatch, `enqueue`/`drain` for the queued mode `04` §4.4 wants, plus `handlerCount`/`queuedCount`/`clear`. 28 tests; suite **240 pass / 0 fail / 0 todo**, was 212. All three criteria met. **Type safety is checked at compile time in both directions** — narrowing assignments for the positive half, `@ts-expect-error` for the negative, so a loosened generic turns the directives themselves into errors; measured by loosening the payloads to `unknown`, which produces **17 typecheck errors**. **Zero-subscriber emit measured at exactly 0 attributed bytes** against a control in the same process, via BL-050's profiler. **Unsubscribe during emit tombstones rather than splices**, with compaction deferred until the outermost dispatch returns. Discovered work: BL-057. **Surprise, and the one worth reading:** the first two criterion-3 tests written *passed against a deliberately spliced implementation*. Splicing a *later* handler happens to behave, because the survivor slides into an index the loop has not reached; only cancelling an *already-called* handler (or the running one) slides the rest down past the cursor and drops the last. Two cases were added for exactly that, and they are the two that fail under the perturbation. **Second surprise:** `EventMap` cannot be `Record<string, unknown>` — TypeScript gives implicit index signatures to type aliases but not to interfaces, so the natural `interface GameEvents { ... }` is rejected; the constraint is `object` and the payload types still come from `M[K]`.

### BL-054 — Simplex noise, fbm, ridge and Poisson-disk sampling
- **Completed:** 2026-08-15 · **PR:** — (pushed direct to `main`)
- `sim/noise/Noise.ts` (simplex2, simplex3, fbm, ridgeNoise, `NoiseField`) and `sim/noise/PoissonDisk.ts` (Bridson, per chunk). 38 tests; suite **212 pass / 0 fail / 0 todo**, was 174. All three criteria met: golden digests `d6351fb8` (simplex2) and `aa0c0d90` (simplex3) over 5,000 samples each, both with a tamper case; order-independence proved element-for-element across reversed and interleaved generation, with the negative control that different chunks must differ; and range/mean **measured** over 20,000 samples — simplex2 `[-0.99626, 0.99030]` mean `-0.00086`, simplex3 `[-0.96545, 0.96750]` mean `0.00564`, fbm at the terrain octaves `[-0.75777, 0.85539]` mean `-0.00019`, ridge `[0.02001, 0.99579]` mean `0.43331`. **No square root, sine, cosine or power runs at play time** — the skew constants are committed literals and Bridson's candidates are drawn by rejection from a square annulus, because ECMA-262 specifies all of those as implementation-approximated and `Rng.ts`'s determinism argument does not survive them. Discovered work: BL-056. Surprise: `tools/check-sim-purity.ts` is referenced in the present tense by `CLAUDE.md`, `06` and `Rng.ts` and does not exist — it is BL-017, still open.


### BL-005 — Seeded RNG
- **Completed:** 2026-08-11 · **PR:** — (pushed direct to `main`)
- `sim/rng/Rng.ts`: mulberry32 with the `Math.imul`/`>>> 0` discipline, `rngFor(worldSeed, purpose, ...coords)` deriving stream seeds through the existing FNV-1a helpers, and the draws (`nextInt` with rejection sampling rather than a modulo, `nextRange`, `chance`, `pick`, Fisher–Yates `shuffle`). 32 tests; suite 174 pass / 0 fail / 0 todo, was 142. **Split on claim** — the noise half became BL-054, taking the golden-fixture criterion with it. Both remaining criteria met: the 10,000-value fixture (digest `9b901c2e`) reproduces in Node v22.22.2 and in Chromium 141 — **both V8, which the log entry states plainly rather than claiming two engines** — and six streams × 60,000 draws pass uniformity (7 df) and all 15 pairwise independence tests (49 df) against their 0.1% critical values, with a negative control proving the independence test rejects two identical streams. Also deleted `sim/_scaffold.ts`. Discovered work: BL-055.

### BL-003 — Vite app shell with a canvas and a black screen
- **Completed:** 2026-08-09 · **PR:** — (pushed direct to `main`)
- Full-window canvas whose drawing buffer tracks its CSS box times `min(devicePixelRatio, 2)` (`render/canvas.ts`, watched by a `ResizeObserver` *and* a re-armed `matchMedia` resolution query), a React 18 overlay root mounted into a `pointer-events: none` container (`ui/App.tsx`, `ui/mountOverlay.tsx`, `ui/styles/base.css`), and `main.ts` wiring them with HMR teardown. React was added as a runtime dependency under `04` §3's existing approval; `@vitejs/plugin-react` is pinned to ^4 because ^6 requires Vite 6. All three acceptance criteria verified against headless Chromium at devicePixelRatio 1, 2 and 3 — see the `34_DEVELOPMENT_LOG.md` entry for the numbers. Discovered work: BL-048, BL-049.

### BL-002 — Configure ESLint, Prettier, and the boundary rules
- **Completed:** 2026-08-07 · **PR:** — (pushed direct to `main`)
- Flat ESLint config with type-aware `@typescript-eslint`, the `04` §5 import-direction table under `eslint-plugin-boundaries` (default-deny), and the three custom bans as `no-restricted-syntax` selectors. Prettier config per `06` §2, scoped to code and configuration. `tools/check-lint-rules.ts` (`pnpm lint:rules`) proves each custom rule fires against a deliberate violation. Discovered work: BL-045, BL-046, BL-047.

### BL-001 — Initialise the pnpm workspace and package scaffolding
- **Completed:** 2026-08-04 · **PR:** —
- pnpm workspace (`packages/client`, `packages/shared`, `packages/server` README-only), `tsconfig.base.json` with the `07` §1 compiler options and the five path aliases, hand-configured Vite aliases mirroring them. See `34_DEVELOPMENT_LOG.md` for detail.

*(append here with date and PR link; oldest at the bottom)*
