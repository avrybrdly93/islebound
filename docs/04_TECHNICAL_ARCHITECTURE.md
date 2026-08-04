# 04 — Technical Architecture

Purpose: the binding technical decisions for the project. An agent must read this document and `05_CODEBASE_STRUCTURE.md` before writing any code. Changing anything in §3 or §5 requires human approval recorded in `40_DECISION_LOG.md`.

---

## 1. Architectural thesis

> **Simulation is separate from presentation, and simulation is authoritative, deterministic, and headless-runnable.**

Everything follows from this. It is what makes the game testable by AI agents, what makes save/load trivially correct, and what makes multiplayer possible in Phase 7 without a rewrite.

```
┌──────────────────────────────────────────────────────────┐
│  PRESENTATION  (three.js, DOM UI, audio, input reading)  │
│  reads world state, writes intents. Never mutates state. │
└───────────────────────▲──────────────┬───────────────────┘
                        │ read         │ intents (commands)
┌───────────────────────┴──────────────▼───────────────────┐
│  SIMULATION  (fixed 30 Hz, deterministic, no three.js)   │
│  world state, systems, rules. No DOM. No WebGL. No RNG   │
│  except the seeded PRNG.                                 │
└───────────────────────▲──────────────┬───────────────────┘
                        │              │ events
┌───────────────────────┴──────────────▼───────────────────┐
│  PLATFORM  (storage, network, assets, time, logging)     │
└──────────────────────────────────────────────────────────┘
```

Hard rule: **no file under `src/sim/` may import `three`, `document`, `window`, or `Math.random`.** This is enforced by an ESLint rule and a CI check (`06_ENGINEERING_STANDARDS.md` §5).

## 2. Why not "just use three.js objects as the game state"

Because it makes saving, testing, rewinding and networking all hard at once, and because `THREE.Object3D` graphs are slow to iterate and impossible to hash. The cost of this separation is roughly one extra indirection per entity per frame (a `Map` lookup). Measured budget: <0.4 ms/frame at 3,000 entities. Accepted.

## 3. Technology decisions (binding)

| Concern | Choice | Rationale | Rejected |
|---|---|---|---|
| Language | **TypeScript 5.x, `strict: true`, `noUncheckedIndexedAccess`** | Type safety is what lets agents refactor safely | JS, ReScript |
| Build | **Vite 5+** | Fast HMR, first-class TS, simple config, good code splitting | Webpack, Parcel, esbuild alone |
| Package manager | **pnpm** with a workspace | Fast, strict node_modules, workspace ready for the server package | npm, yarn |
| 3D | **three.js (pinned minor, WebGLRenderer)** | Mature, huge ecosystem, ships in <200 kB gz for what we use | Babylon (heavier), raw WebGL (too slow to build), PlayCanvas (editor-centric) |
| WebGPU | **`WebGPURenderer` behind a feature flag from Phase 6** | Not stable enough to be the default in 2026 for Safari; we keep the door open by avoiding raw GLSL where possible | WebGPU-only |
| Physics | **Rapier3D (`@dimforge/rapier3d-compat`, WASM)** | Deterministic-capable, fast, good kinematic character controller, small | cannon-es (slow, unmaintained), ammo.js (huge), custom (too much work) |
| UI | **React 18 + a thin custom store**, DOM overlay only | Agents write React reliably; DOM UI is accessible for free; canvas untouched | three.js-drawn UI, Vue, Svelte, zustand/redux (unnecessary) |
| ECS | **Hand-rolled minimal ECS (~250 LOC)** in `sim/ecs` | Zero dependency, exactly the features we need, fully understandable | bitECS (over-engineered for us), miniplex (fine, but a dep we can avoid) |
| Noise/RNG | **Hand-rolled seeded PRNG (mulberry32) + simplex** | Determinism must be ours, not a library's | any Math.random-based lib |
| Storage (SP) | **IndexedDB via a tiny wrapper** | Handles multi-MB saves; localStorage does not | localStorage (5 MB cap), OPFS (Safari flakiness) |
| Server (MP) | **Node 22 + `ws` + custom binary protocol** | Full control of tick and state authority; small | Colyseus (opinionated schema, harder to fit our ECS), Socket.io (overhead), WebRTC mesh (NAT pain, no authority) |
| Persistence (MP) | **SQLite (`better-sqlite3`)**, one file per island | Trivial ops for a solo dev; migratable to Postgres later | Postgres from day 1, Firebase |
| Testing | **Vitest** (unit/integration), **Playwright** (e2e/smoke), custom **sim harness** | Vitest shares Vite config; Playwright can drive WebGL headless | Jest, Cypress |
| Assets | **glTF 2.0 (`.glb`) + KTX2/Basis textures + Draco** | Best size/quality tradeoff in browser | FBX, OBJ, PNG-only |
| Audio | **Web Audio API directly**, thin wrapper | three.js Audio is limiting; Howler adds weight for little gain | Howler.js, three.PositionalAudio |
| Lint/format | **ESLint (flat config) + Prettier** | Standard | Biome (fine, but fewer plugins we need) |
| CI/CD | **GitHub Actions → Cloudflare Pages (client), Fly.io (server)** | Free tier, commercial-use permitted, global edge | Vercel Hobby (no commercial use), Netlify |

**Dependency policy:** the runtime dependency list above is the complete allowed set for the client. Adding any other runtime dependency requires human approval. Dev dependencies are freer but still justified in the PR description.

## 4. The simulation

### 4.1 Fixed timestep

- Simulation tick: **30 Hz (33.333 ms)**. Chosen because character control feels fine at 30 Hz with interpolation, and it halves CPU vs 60 Hz.
- Render: uncapped (vsync), interpolating between the last two sim states with `alpha = accumulator / dt`.
- Accumulator loop with a **max of 5 catch-up steps per frame** (spiral-of-death guard). Beyond that, time is dropped and a `sim:timeDropped` event is emitted.
- `dt` is a compile-time constant. No system may read wall-clock time.

```ts
// core/Loop.ts (shape, not final code)
const DT = 1 / 30;
let acc = 0, last = performance.now() / 1000;
function frame(now: number) {
  const t = now / 1000;
  acc += Math.min(t - last, 0.25); // clamp huge tab-switch gaps
  last = t;
  let steps = 0;
  while (acc >= DT && steps++ < 5) { world.step(DT); acc -= DT; }
  renderer.render(world, acc / DT);
  requestAnimationFrame(frame);
}
```

### 4.2 Determinism rules

The simulation must produce an identical state hash given identical seed + input sequence, on every machine. This is what makes `pnpm sim` a real test and what makes multiplayer reconciliation possible.

1. All randomness comes from `sim/rng/Rng.ts` seeded per-purpose (`rngFor('worldgen')`, `rngFor('wildlife')`, ...). `Math.random` is banned by lint.
2. No `Date.now()`, `performance.now()` inside `sim/`. Time is `world.tick` (an integer).
3. Iterate collections in a defined order. `Map` insertion order is stable in JS and acceptable; `Set` of entity IDs must be sorted before iteration in any system whose output depends on order.
4. No floating-point accumulation across ticks where an integer would do (e.g. growth stages are integer tick counters, not float sums).
5. Physics is run by Rapier with a fixed timestep and a fixed substep count. **Rapier is not bit-deterministic across architectures**; therefore physics results are never part of the authoritative state hash. Player position is authoritative from the *server* in MP, not reproduced by clients. See `10_PHYSICS_SYSTEM.md` §8.
6. A `worldHash()` function (FNV-1a over a canonical serialisation) is exposed for tests.

### 4.3 ECS-lite

```ts
type EntityId = number;                    // dense, recycled with generation bits
interface Store<T> { has(e): boolean; get(e): T | undefined; set(e, v): void; remove(e): void; entities(): Iterable<EntityId>; }
class World {
  tick: number;
  createEntity(): EntityId;
  destroyEntity(e: EntityId): void;
  store<T>(def: ComponentDef<T>): Store<T>;
  query(...defs: ComponentDef<any>[]): Iterable<EntityId>;   // sorted ascending
  events: EventBus;
  step(dt: number): void;                   // runs systems in registered order
}
```

- Components are **plain serialisable data**. No methods, no class instances, no references to other objects — only `EntityId`s.
- Systems are **pure functions of `(world, dt)`** registered in an explicit order array. Order is data in `sim/systems/order.ts` so it is reviewable.
- Queries are computed lazily and cached per-tick by component-set signature.

Component list (initial): `Transform`, `Velocity`, `PlayerTag`, `Renderable`, `Collider`, `Interactable`, `ResourceNode`, `Inventory`, `ItemStack`, `Structure`, `Crop`, `Animal`, `AiState`, `Growth`, `Lifetime`, `NetSynced`, `Owner`.

### 4.4 Intents and events

- Presentation never mutates simulation state. It enqueues **intents**: `{ type: 'gather', target: EntityId }`, `{ type: 'move', dir: Vec2, sprint: boolean }`.
- The simulation drains the intent queue at the start of each tick, validates each intent, and applies it.
- The simulation emits **events** (`resource:harvested`, `item:added`, `structure:placed`) consumed by presentation for VFX/SFX/UI, and by the journal.
- This single choke point is what Phase 7 replaces with "send intent to server, receive events back". **Design every feature as intent-in / event-out.**

## 5. Module boundaries (binding)

```
src/
  core/        loop, time, event bus, service locator, config, logging, math
  sim/         the deterministic world. MAY NOT import: three, react, DOM
  render/      three.js scene graph, materials, meshes, cameras, post
  ui/          React overlay. MAY NOT import sim internals — only view models
  audio/       Web Audio wrapper, buses, ambience, music
  input/       keyboard/mouse/gamepad → intents
  platform/    storage, assets, network, feature detection
  content/     JSON/TS data: items, recipes, nodes, fish, crops, structures
  dev/         debug overlay, cheats, inspector — tree-shaken from prod
```

Allowed import directions (enforced by `eslint-plugin-boundaries`):

```
core   → (nothing)
sim    → core, content
render → core, sim (read-only view types), platform
ui     → core, platform, and view-model types only
audio  → core, platform
input  → core
platform → core
dev    → everything
```

`sim` exposing types to `render`/`ui` is allowed; `render`/`ui` calling mutating `sim` functions is not. Mutation happens only through `world.intents.push(...)`.

## 6. Data flow, one frame

```
input.poll() ─► intents[] ─┐
                           ▼
                  world.step(DT) × N   ──► events[]
                           │                  │
                           ▼                  ▼
              render.sync(world, alpha)   audio.handle(events)
                           │                  ui.handle(events)
                           ▼
                  renderer.render(scene, camera)
```

`render.sync` walks changed entities (dirty set maintained by `Renderable` writes) and updates three.js objects. Full-scene traversal happens only on world load.

## 7. Asset and content strategy

- **Content is data.** Items, recipes, nodes, crops, fish, structures and dialogue-free journal text live in `src/content/*.ts` as typed const objects, validated at startup by hand-written guards (no zod dependency; guards are generated once and checked in).
- **Assets are lazy.** The initial bundle contains only what the beach needs. Region asset packs are fetched on approach.
- IDs are stable strings (`item.wood_plank`, `node.oak_tree`). **Never renumber or reuse an ID** — saves depend on them. Deprecated IDs go in a migration table.

## 8. Error philosophy

- The game must never white-screen. A top-level error boundary catches, logs, shows a friendly panel, and offers "reload from last autosave".
- Simulation errors are contained per-system: a throwing system is disabled for the rest of the session, logged loudly in dev, and reported.
- Content validation failures are **fatal in dev, skipped-with-warning in prod** (a broken recipe should not brick a player's island).

## 9. Performance architecture (summary; details in 28)

- One `InstancedMesh` per (mesh, material) pair for vegetation, rocks, and repeated structure pieces. Target <150 draw calls.
- Terrain in 32 m chunks; each chunk one mesh, three LODs, frustum-culled.
- No per-frame allocation in the hot path. Scratch vectors are module-level singletons; object pools for particles, projectile-free but pooled item pops.
- Web Workers: world generation, chunk meshing, and save serialisation run off the main thread. The simulation itself stays on the main thread (moving it costs more in transfer than it saves).

## 10. Multiplayer readiness checklist (apply to every feature)

Before merging any gameplay system, confirm:
- [ ] All mutations go through intents.
- [ ] All state is in serialisable components, no hidden state in closures or three.js objects.
- [ ] Any randomness uses a named seeded stream.
- [ ] The system tolerates state being replaced wholesale (server snapshot).
- [ ] The system does not assume exactly one player entity exists.

The last point is the most commonly violated. **Write `for (const p of world.query(PlayerTag))` from day one, never `world.player`.**
