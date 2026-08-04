# 29 — Testing Strategy

Purpose: what we test, how, and why. In an AI-driven development workflow, the test suite is the primary mechanism by which an agent knows whether it has broken something. It is not optional infrastructure; it is the substrate.

---

## 1. The testing pyramid, adapted for a game

```
      ┌───────────────────────────────┐
      │  Manual playtest checklists   │  ~1 per phase, human
      ├───────────────────────────────┤
      │  Visual regression (goldens)  │  ~20 screenshots
      ├───────────────────────────────┤
      │  E2E (Playwright)             │  ~25 tests
      ├───────────────────────────────┤
      │  Simulation harness tests     │  ~80 tests   ◄── the load-bearing layer
      ├───────────────────────────────┤
      │  Unit tests (Vitest)          │  ~400 tests
      └───────────────────────────────┘
```

The unusual layer is the **simulation harness**. Because `sim/` is pure and headless, we can run thousands of ticks of real gameplay in milliseconds with no browser and no renderer. This is where most gameplay correctness is proven.

## 2. The simulation harness

`pnpm sim` and `dev/harness/`:

```bash
pnpm sim --ticks 20000 --seed 1234 --assert-hash        # determinism check
pnpm sim --script test/scripts/craft-first-axe.ts       # scripted scenario
pnpm sim --fixture worst-case-island --ticks 5000 --profile
pnpm sim --fuzz --ticks 100000 --intents random         # fuzzing
```

The harness provides:
- A `Scenario` API: `given(worldState).when(intents).then(assertions)`.
- Deterministic input scripting with tick-accurate intent injection.
- `worldHash()` snapshots for state comparison.
- Per-system timing output.
- A stub physics mode (`10_PHYSICS_SYSTEM.md` §9) for environments without WASM.

Example scripted test:

```ts
scenario('a new player can craft a stone axe within 6 minutes', async (s) => {
  s.newWorld({ seed: SHIPPED_SEED });
  s.walkTo(nearest('node.driftwood'));
  s.gatherUntil('item.wood', 5);
  s.walkTo(nearest('node.beach_stone'));
  s.gatherUntil('item.stone', 3);
  s.craft('recipe.stone_axe');
  s.expect(s.inventoryCount('item.stone_axe')).toBe(1);
  s.expect(s.elapsedGameSeconds()).toBeLessThan(360);
});
```

These scenario tests double as **progression regression tests**: they will catch "the axe recipe now needs iron" or "driftwood no longer spawns near the beach" the day it happens.

## 3. What each layer covers

### 3.1 Unit (Vitest, ~400 tests)
Pure functions and small modules: math, RNG, noise, inventory operations, recipe validation, save migrations, blend-space weights, terrain accessors, weather chains, growth math, fish selection, snapping resolution.

Rule: any function that can be tested without a `World` should be, and should live in a `*.rules.ts` file to make that possible.

### 3.2 Simulation harness (~80 tests)
Multi-system behaviour over time: gather→craft→build chains, offline catch-up, sleep equivalence, regrowth cycles, farming across in-game weeks, save/load round-trips of live worlds, the full unlock chain, fuzzing.

### 3.3 E2E (Playwright, ~25 tests)
The things that only break in a browser: the game boots, WebGL initialises, assets load, input reaches the simulation, the UI renders and responds, IndexedDB persists across reload, the loading screen completes, no console errors.

```ts
test('gather, craft and place, then reload', async ({ page }) => {
  await page.goto('/?seed=1234&skipIntro=1&fastAssets=1');
  await page.waitForFunction(() => (window as any).__game?.ready);
  await useCheat(page, 'give item.wood 20');
  await openScreen(page, 'crafting');
  await page.getByRole('button', { name: 'Workbench' }).click();
  await page.getByRole('button', { name: 'Craft' }).click();
  await expect(page.getByText('Workbench')).toBeVisible();
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.ready);
  await expect(inventoryCount(page, 'item.workbench')).resolves.toBe(1);
});
```

A `__game` test hook is exposed in dev and test builds only, stripped from production.

### 3.4 Visual regression (~20 goldens)
Six canonical scenes at fixed seed/time/camera, plus every UI screen at two scales. `maxDiffPixelRatio: 0.02` to tolerate driver noise. Goldens are regenerated deliberately, with the diff attached to the PR.

### 3.5 Manual playtest checklists
Per phase, a written checklist covering feel — the things no automated test can judge. Stored in `test/checklists/phase-N.md`. Filled in by a human, results recorded in the phase retro. The movement checklist (`11_PLAYER_CONTROLLER.md` §11) is the most important one.

## 4. The critical tests (never allowed to be skipped or deleted)

These protect the properties that define the game. An agent must never modify them to make a change pass.

| # | Test | Protects |
|---|---|---|
| T1 | Item conservation property test | no duplication, no loss (cozy contract C1) |
| T2 | Build/remove refund property test | contract C6 |
| T3 | Determinism hash over 20k ticks | multiplayer and save correctness |
| T4 | Save migration from every historical fixture | never lose an island |
| T5 | Save round-trip world-hash equality | never lose an island |
| T6 | Worldgen determinism and chunk independence | the island is the island |
| T7 | Full unlock-chain reachability | never soft-lock progression |
| T8 | Every fish/node/recipe is reachable | no dead content |
| T9 | Sleep ≡ playing through the night (hash equality) | time consistency |
| T10 | No system exceeds its tick budget | the 60 fps contract |

If one of these fails, the correct response is to fix the code. If an agent believes the *test* is wrong, it must stop and escalate in `33_CURRENT_TASK.md`.

## 5. Coverage policy

- Line coverage target: **85% in `sim/` and `core/`**, 60% in `render/`, no target in `ui/` (E2E covers it).
- Coverage is a smoke detector, not a goal. A PR that raises coverage by testing getters is worse than one that adds a single good scenario test.
- Uncovered branches in `sim/` are reported in CI as a warning list, reviewed at each phase boundary.

## 6. Test data and fixtures

```
test/
├── fixtures/
│   ├── saves/           v1.json … vN.json  (permanent, never deleted)
│   ├── worlds/          small-island.json, worst-case-island.json
│   └── content/         minimal content tables for isolated tests
├── scripts/             scenario scripts
├── checklists/          manual playtest checklists per phase
└── goldens/             visual regression baselines
```

The `worst-case-island` fixture (4,000 structures, 600 farm tiles, full journal) is created in Phase 4 and used by performance and save tests thereafter.

## 7. Flakiness policy

- A flaky test is a broken test. It is fixed or deleted within one working session — never retried in CI, never `.skip`ped and forgotten.
- Sources of flake to avoid by construction: real time (use ticks), real randomness (use seeded RNG), animation timing in E2E (wait on state, not on timeouts), network (mock it), and screenshot noise (fixed seed, fixed time, disabled particles in goldens).
- Playwright: no `waitForTimeout`. Ever. Wait on `__game` state or on a role-based locator.

## 8. CI pipeline

```
on: pull_request, push to main
jobs:
  quick   (≤ 3 min):  typecheck, lint, format, sim-purity, madge, unit tests
  sim     (≤ 5 min):  harness tests, determinism, fuzz (20k ticks)
  build   (≤ 4 min):  vite build, bundle budget, asset validate
  e2e     (≤ 8 min):  playwright chromium + firefox, visual regression
  bench   (≤ 6 min):  headless-gl benchmark vs baselines
nightly:
  soak    (60 min):   long-session memory and frame-time trends
  e2e-all:            webkit added, mobile viewport smoke
```

`quick` runs on every push and must stay under 3 minutes — it is the loop an agent iterates against.

## 9. Testing requirements for new work

Every PR adds tests appropriate to its layer:

| Change type | Required tests |
|---|---|
| Pure logic / rules | unit tests, including edge cases |
| A new system | at least one harness scenario + per-tick budget assertion |
| Content addition | validation passes automatically; add a reachability case if it introduces a new gate |
| UI | a Playwright interaction test + an axe-core pass |
| Visual | a golden screenshot if it changes a canonical scene |
| Performance work | before/after bench numbers in the PR |
| Bug fix | a regression test that fails before the fix |

## 10. Implementation steps

1. Vitest configuration sharing the Vite config; first unit tests on `core/math`.
2. The sim harness: world construction, tick loop, `worldHash`, timing output.
3. The `Scenario` API and the first three scripted scenarios.
4. Determinism and fuzz commands.
5. Playwright setup, the `__game` hook, the boot smoke test.
6. Visual regression with fixed-seed canonical scenes.
7. Fixture saves and the migration test framework.
8. CI wiring with the four jobs and the time budgets.
9. Nightly soak.
10. Per-phase manual checklists as each phase opens.

## 11. Future expansion

- Record-and-replay of real play sessions as regression scripts (record intents + seed; replay and compare hashes). Very high value once the game is playable; consider it in Phase 5.
- Automated "can a naive agent complete the first 10 minutes" test using a scripted heuristic player, as a proxy for onboarding quality.
- Mutation testing on `sim/` rules to check that the tests actually constrain behaviour.
