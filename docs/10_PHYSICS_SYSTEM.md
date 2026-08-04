# 10 — Physics System

Purpose: what physics we use, what we deliberately do not simulate, and how Rapier is integrated without compromising simulation determinism.

---

## 1. Decision: Rapier3D, used narrowly

We use `@dimforge/rapier3d-compat` (WASM) for exactly three things:

1. **Terrain and structure collision** (static colliders).
2. **The kinematic character controller** (player and animals) — Rapier's `KinematicCharacterController` handles slopes, steps, and snap-to-ground properly, which is fiddly to hand-write.
3. **A small number of dynamic bodies**: dropped items, the raft, and physics-y decorations (a ball, a swing). Cap: **40 dynamic bodies**.

Everything else is not physics. Trees do not fall with rigid body dynamics — they play an animation. Buildings have no structural integrity. Water buoyancy is an analytic formula, not a fluid sim.

**Why not hand-roll?** A capsule-vs-heightfield character controller with step handling, slope limits and moving-platform support is roughly two weeks of work and a long tail of bugs. Rapier gives it in a day, costs ~500 kB of WASM (lazy-loaded, cached), and runs the whole scene in <1 ms.

**Why not cannon-es / ammo?** cannon-es is unmaintained and slow on heightfields; ammo.js is 1.5 MB+ and awkward to type.

## 2. Integration shape

```
sim/physics/
├── PhysicsWorld.ts      # owns RAPIER.World, step, body registry
├── colliders.ts         # builders: heightfield, trimesh, cuboid, capsule
├── CharacterController.ts
├── buoyancy.ts          # analytic, no Rapier involvement
└── queries.ts           # ray, shapecast, overlap helpers
```

`PhysicsWorld` is initialised asynchronously (`await RAPIER.init()`), before the first tick. The loading screen waits on it.

Physics steps **once per simulation tick** (30 Hz) with Rapier's internal `dt` set to exactly `1/30` and `world.integrationParameters.numSolverIterations = 4`. No substeps; no variable dt ever.

## 3. Determinism stance (important)

Rapier is deterministic *for the same binary on the same architecture*, but not guaranteed bit-identical across platforms (x86 vs ARM, different WASM engines). Therefore:

- **Physics results are excluded from the authoritative world hash.** `worldHash()` hashes gameplay state (inventories, crops, structures, node states, time) but not exact float positions of dynamic bodies.
- **Positions are quantised for save and network**: positions to 1 cm, rotations to 1/4096 of a turn. This means small float divergences cannot accumulate into visible desync.
- In multiplayer, **the server's physics is the truth**. Clients predict locally and reconcile (see `36_MULTIPLAYER_ARCHITECTURE.md` §6).
- Gameplay outcomes never depend on precise physics. "Did the axe hit the tree?" is a distance + facing check in `InteractionSystem`, not a collision event.

This is the pragmatic middle path: determinism where it matters (game rules), authority where it doesn't (motion).

## 4. Collision layers

Rapier collision groups (16-bit membership / 16-bit filter):

| Bit | Group | Members |
|---|---|---|
| 0 | TERRAIN | heightfield chunks |
| 1 | STATIC_PROP | rocks, trees (trunk capsules), cliffs |
| 2 | STRUCTURE | player-built pieces |
| 3 | PLAYER | player capsules |
| 4 | ANIMAL | wildlife capsules |
| 5 | ITEM | dropped items, raft |
| 6 | WATER_VOLUME | sensor volumes for swim state |
| 7 | INTERIOR | sensor volumes for indoor detection |
| 8 | CAMERA_BLOCKER | subset of static that pushes the camera |

Interaction matrix, notable entries: PLAYER collides with TERRAIN, STATIC_PROP, STRUCTURE, ITEM; PLAYER senses WATER_VOLUME and INTERIOR. ANIMAL collides with TERRAIN and STRUCTURE only (animals pass through each other — cheaper and avoids herding jams). ITEM collides with TERRAIN and STRUCTURE.

## 5. Terrain colliders

- One Rapier **heightfield collider per terrain chunk** (32×32 m, 33×33 samples), created when the chunk streams in and removed when it streams out.
- Heightfields are cheap and exact for our smooth terrain. Overhangs and caves cannot be represented — caves are therefore **separate trimesh colliders** authored as meshes, placed at cave entrances.
- Cliff faces steeper than the character's slope limit are additionally tagged so the movement system can show a "too steep" affordance rather than the player sliding silently.

## 6. Character controller

Configuration (tuned values live in `content/config.ts`):

```ts
{
  shape: capsule(radius 0.35 m, halfHeight 0.55 m),   // total height 1.8 m
  offset: 0.02,                 // skin width
  maxSlopeClimbAngle: 50°,
  minSlopeSlideAngle: 52°,
  autostepMaxHeight: 0.45 m,    // walk up stairs and rocks without jumping
  autostepMinWidth: 0.2 m,
  snapToGroundDistance: 0.35 m, // keeps the player glued on descents
  applyImpulsesToDynamicBodies: true,
}
```

Movement is computed in `MovementSystem` as a desired displacement, handed to the controller, and the **corrected** displacement is written back to `Transform`. Gravity is applied as vertical velocity integrated manually so we can control jump feel precisely (see `11_PLAYER_CONTROLLER.md`).

Animals use the same controller with a smaller capsule and a cheaper config (no autostep, larger snap distance).

## 7. Buoyancy and the raft

No fluid simulation. Analytic model:

- `waterHeightAt(x, z, tick)` — shared function, sum of 3 Gerstner waves + base sea level. Used identically by shader and simulation.
- For a floating body, sample the water height at 4 points under its hull. For each submerged sample, apply an upward force proportional to submersion depth, plus linear and angular damping. This gives convincing bobbing at negligible cost.
- The raft is a dynamic body with buoyancy plus a forward thrust applied when the player paddles. The player is parented (kinematically attached) to the raft while riding — no physics joint, just a transform follow, which avoids a whole class of jitter bugs.

## 8. Queries used by gameplay

| Query | Used by | Notes |
|---|---|---|
| Ray from camera through crosshair, 4 m | interaction targeting | filtered to `Interactable` entities |
| Sphere overlap, 2.5 m around player | proximity prompts | cheap, runs at 10 Hz not 30 |
| Shapecast (sphere 0.3 m) camera→player | camera collision | pulls the camera in |
| Downward ray from build ghost | placement validity | plus slope and overlap checks |
| Overlap box at build ghost | placement blocking | must not intersect PLAYER/ANIMAL/STRUCTURE |
| Ray down from spawn point | wildlife spawning | finds ground height |

All queries go through `sim/physics/queries.ts` so they can be logged, budgeted (max 64 queries per tick) and stubbed in headless tests.

## 9. Headless mode

`pnpm sim` runs the full simulation including Rapier (the WASM module works in Node). If Rapier fails to load in a constrained CI environment, the harness falls back to a **stub physics implementation** that:
- resolves character movement against the analytic heightmap (`terrainHeightAt`),
- treats all shapes as points,
- disables dynamic bodies.

Tests that depend on physics precision are marked `@physics` and skipped in stub mode. Tests of game rules must pass in both modes — if a rules test fails in stub mode, the rule is wrongly depending on physics.

## 10. Implementation steps

1. Lazy-load and init Rapier; gate the loading screen on it. Expose `PhysicsWorld`.
2. Heightfield collider creation/destruction wired to chunk streaming; verify no gaps at chunk seams.
3. Character controller for the player; tune the config values with a human in the loop.
4. Camera shapecast collision.
5. Static prop colliders (capsules for trunks, convex hulls for rocks, generated offline in the asset pipeline and stored in the glTF `extras`).
6. Structure colliders created/destroyed with building placement/removal.
7. Dropped items as dynamic bodies with a 90 s despawn-to-static optimisation (after settling, convert to a static marker and remove the body).
8. Water sensor volumes and swim-state detection.
9. Buoyancy + raft.
10. Query budget instrumentation in the dev overlay.

## 11. Testing requirements

- Unit: `waterHeightAt` matches the shader's GLSL implementation to within 1e-4 across a sampled grid (the GLSL is transpiled to JS in a test fixture, or the constants are compared and the formula duplicated with a shared test vector table).
- Integration: the player can traverse a fixed 300 m route across the island without falling through terrain, in both physics and stub mode. Run in CI on every commit.
- Integration: 10,000 ticks of a player walking into a wall produces no position drift and no NaNs.
- Regression: colliders count equals chunk count × 1 after 200 stream-in/out cycles (no leaks).
- Performance: physics step ≤ 1.2 ms with 40 dynamic bodies and 25 loaded chunks.

## 12. Future expansion

- Moving platforms (a raft ferry, an elevator in the caves) — Rapier supports kinematic platform bodies; the character controller already handles them.
- Rope/bridge simulation for a rickety bridge — likely a fake (animated) implementation rather than real constraints.
- Destructible props (breakable crates) — animation + particle, not physics.
- If dynamic body count ever needs to exceed 40, revisit with a spatial sleep policy first.
