# 05 — Codebase Structure

Purpose: the canonical file and folder layout, naming conventions, and where new code goes. An agent adding a feature should be able to answer "which file?" from this document alone.

---

## 1. Repository root

```
halcyon/
├── .github/
│   ├── AI_DEVELOPMENT_WORKFLOW.md
│   └── workflows/ci.yml, deploy-client.yml, deploy-server.yml
├── docs/                       # everything in this documentation set
├── tasks/                      # phase task lists
├── packages/
│   ├── client/                 # the game (Vite app)
│   ├── server/                 # Phase 7 authoritative server (Node)
│   └── shared/                 # protocol types + content shared by both
├── assets-src/                 # Blender files, raw textures, audio sources (git-lfs)
├── tools/                      # asset pipeline scripts, codegen, analysis
├── CLAUDE.md                   # standing context for AI agents (short)
├── README.md
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```

`packages/shared` exists from Phase 0 even though the server does not. Content and item types live there so Phase 7 does not require a mass move.

## 2. Client package

```
packages/client/
├── index.html
├── vite.config.ts
├── public/                     # served as-is: favicon, og image
├── assets/                     # processed, versioned game assets (glb, ktx2, ogg)
│   ├── models/  textures/  audio/  fonts/  data/
└── src/
    ├── main.ts                 # entry: bootstraps Game, mounts React root
    ├── Game.ts                 # composition root — wires every subsystem
    │
    ├── core/
    │   ├── Loop.ts             # fixed timestep accumulator
    │   ├── EventBus.ts         # typed pub/sub
    │   ├── Services.ts         # explicit service registry (no magic DI)
    │   ├── Config.ts           # tunables, loaded from content/config.ts
    │   ├── Logger.ts           # levelled logging, ring buffer for crash reports
    │   ├── Result.ts           # Ok/Err helper used for fallible operations
    │   └── math/               # Vec2, Vec3, Quat, AABB, easing, curves, hash
    │
    ├── sim/
    │   ├── World.ts            # entity/component/query/step
    │   ├── ecs/                # EntityAllocator, ComponentStore, Query
    │   ├── components/         # one file per component, all plain data
    │   ├── systems/
    │   │   ├── order.ts        # THE authoritative system execution order
    │   │   ├── MovementSystem.ts
    │   │   ├── InteractionSystem.ts
    │   │   ├── ResourceSystem.ts
    │   │   ├── InventorySystem.ts
    │   │   ├── CraftingSystem.ts
    │   │   ├── BuildingSystem.ts
    │   │   ├── FarmingSystem.ts
    │   │   ├── FishingSystem.ts
    │   │   ├── WildlifeSystem.ts
    │   │   ├── TimeSystem.ts
    │   │   ├── WeatherSystem.ts
    │   │   ├── JournalSystem.ts
    │   │   └── VitalsSystem.ts   # energy + warmth
    │   ├── intents/            # Intent union type + validators
    │   ├── events/             # SimEvent union type
    │   ├── rng/                # mulberry32, simplex, poisson disk, named streams
    │   ├── worldgen/           # heightmap, biomes, scatter, node placement
    │   └── serialize/          # save schema, (de)serialisers, migrations, hash
    │
    ├── render/
    │   ├── Renderer.ts         # WebGLRenderer setup, resize, colour space
    │   ├── SceneRoot.ts        # scene graph roots and layer organisation
    │   ├── Sync.ts             # world → three.js reconciliation
    │   ├── camera/             # ThirdPersonCamera, spring arm, collision, shake
    │   ├── terrain/            # ChunkMesher (worker), TerrainMaterial, LOD
    │   ├── water/              # ocean shader, shoreline foam, underwater
    │   ├── sky/                # sky dome, sun/moon, stars, fog control
    │   ├── vegetation/         # instancing, wind, LOD, impostors
    │   ├── entities/           # per-archetype view builders (tree, rock, animal…)
    │   ├── vfx/                # particle pools, decals, item pop arcs
    │   ├── post/               # EffectComposer chain, LUT, bloom, AA
    │   └── materials/          # shared material factory + toon ramps
    │
    ├── ui/
    │   ├── App.tsx             # overlay root, routes between screens
    │   ├── store/              # view models: subscribes to sim events, no logic
    │   ├── hud/                # crosshair, prompt, hotbar, vitals, clock
    │   ├── screens/            # Inventory, Crafting, Journal, Build, Settings, Pause
    │   ├── components/         # Button, Slot, Panel, Tooltip, Slider…
    │   └── styles/             # CSS modules + design tokens
    │
    ├── input/
    │   ├── InputManager.ts     # device polling → normalised actions
    │   ├── bindings.ts         # default keymaps, rebinding storage
    │   └── IntentMapper.ts     # actions + context → sim intents
    │
    ├── audio/
    │   ├── AudioEngine.ts      # graph, buses, master volume
    │   ├── Ambience.ts         # layered environmental beds
    │   ├── Music.ts            # adaptive layers, transitions
    │   └── Sfx.ts              # one-shots, pooling, positional
    │
    ├── platform/
    │   ├── storage/            # IndexedDB wrapper, autosave scheduler
    │   ├── assets/             # loaders, caches, region packs, progress
    │   ├── net/                # Phase 7 client transport (stub until then)
    │   └── capabilities.ts     # GPU tier detection, feature flags
    │
    └── dev/
        ├── Overlay.tsx         # FPS, frame graph, draw calls, entity counts
        ├── Inspector.tsx       # entity/component browser
        ├── cheats.ts           # give item, teleport, set time, unlock all
        └── harness/            # headless sim runner used by `pnpm sim`
```

## 3. Shared package

```
packages/shared/src/
├── content/            # items, recipes, nodes, crops, fish, structures, regions
├── types/              # Item, Recipe, StructurePiece… + type guards
├── protocol/           # Phase 7 message schemas, opcode table, version
└── constants.ts        # TICK_RATE, ISLAND_SIZE, CHUNK_SIZE…
```

Content lives here (not in the client) because the server must validate crafting and building using exactly the same definitions. This is the single most important structural decision for Phase 7.

## 4. Server package (Phase 7)

```
packages/server/src/
├── index.ts            # http + ws bootstrap
├── Room.ts             # one island: world, tick loop, clients
├── net/                # codec, connection, rate limiting
├── auth/               # join codes, session tokens
├── persistence/        # SQLite adapter, snapshots, migrations
└── admin/              # health, metrics, room list
```

The server imports `sim/` from the client package via a workspace path alias (`@halcyon/sim`). This is only possible because `sim/` has zero browser dependencies. **Protect that property.**

## 5. Naming conventions

| Thing | Convention | Example |
|---|---|---|
| Files exporting a class | PascalCase | `ChunkMesher.ts` |
| Files exporting functions/consts | camelCase | `easing.ts`, `bindings.ts` |
| React components | PascalCase `.tsx` | `InventoryScreen.tsx` |
| Types/interfaces | PascalCase, no `I` prefix | `ResourceNode` |
| Component definitions | PascalCase noun | `Transform`, `Growth` |
| Systems | PascalCase + `System` | `FarmingSystem` |
| Content IDs | `namespace.snake_case` | `item.pine_plank`, `node.berry_bush` |
| Events | `domain:pastTense` | `resource:harvested` |
| Intents | `domain:imperative` | `build:place` |
| Constants | SCREAMING_SNAKE | `CHUNK_SIZE` |
| Test files | co-located `.test.ts` | `Inventory.test.ts` |
| Booleans | `is/has/can/should` prefix | `canHarvest` |

## 6. Where does new code go? (decision table)

| I am adding… | It goes in | And also touch |
|---|---|---|
| A new gatherable resource | `shared/content/nodes.ts` + `items.ts` | worldgen scatter table, journal entry |
| A new craftable item | `shared/content/recipes.ts` + `items.ts` | unlock rule, icon asset |
| A new building piece | `shared/content/structures.ts` | model asset, socket definition |
| A new gameplay rule | a system in `sim/systems/` | `systems/order.ts`, a unit test |
| A new visual effect | `render/vfx/` | the sim event that triggers it |
| A new screen | `ui/screens/` | `ui/App.tsx` route, an input action |
| A new sound | `audio/` registry + asset | event mapping table |
| A new save field | `sim/serialize/schema.ts` | bump version, write migration, add test |
| A tunable number | `shared/content/config.ts` | never hardcode it in a system |
| A debug tool | `dev/` | nothing else — dev is tree-shaken |

## 7. File size and shape rules

- Soft limit **300 lines** per file, hard limit 500. Beyond that, split by responsibility.
- One primary export per file. Helper functions used by only that file stay in it, unexported.
- Systems must not exceed 200 lines; extract pure helpers into a sibling `*.rules.ts` that is directly unit-testable.
- No barrel `index.ts` files that re-export everything — they break tree-shaking and create import cycles. Import from the concrete path.

## 8. Import rules

1. Absolute imports via aliases: `@core/…`, `@sim/…`, `@render/…`, `@ui/…`, `@content/…`. No `../../../`.
2. No import cycles. CI runs `madge --circular`.
3. `import type { … }` for type-only imports (enforced by lint) so bundling stays clean.
4. Cross-layer imports must obey the direction table in `04_TECHNICAL_ARCHITECTURE.md` §5.

## 9. Asset naming

```
assets/models/props/prop_barrel_a.glb
assets/models/structures/wall_wood_window.glb
assets/models/flora/tree_pine_lod0.glb
assets/textures/terrain/terrain_sand_albedo.ktx2
assets/audio/sfx/sfx_chop_wood_01.ogg
assets/audio/ambience/amb_forest_day_loop.ogg
assets/audio/music/mus_shore_layer_strings.ogg
```

Lowercase, snake_case, category prefix, numbered variants with two digits. LOD suffix `_lod0/1/2`. See `25_ASSET_PIPELINE.md`.

## 10. What must never appear in the repo

- Compiled output (`dist/`, `.vite/`), `node_modules`, `.env` files with secrets.
- Raw uncompressed textures over 2 MB outside `assets-src/` (git-lfs).
- Commented-out code blocks. Delete it; git remembers.
- `TODO` without an owner and a backlog ID: `// TODO(BL-142): handle rain during interior build`.
- Files named `utils.ts`, `helpers.ts`, `misc.ts`, `temp.ts`, `new*.ts`, `*2.ts`.
