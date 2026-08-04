# 11 — Player Controller

Purpose: the player's movement, states, camera relationship and input mapping. This system carries more of the game's feel than any other; treat its tuning constants as art assets.

---

## 1. Design goals

- Walking around must be enjoyable with nothing else happening. That is the bar.
- Momentum-light: responsive, slightly floaty, forgiving. Closer to *A Short Hike* than to a shooter.
- Never fight the player: no unintentional slides, no getting stuck on 20 cm rocks, no camera pushing into geometry.
- Traversal is the reward for exploration — climbing, swimming and rafting all feel like small unlocks.

## 2. State machine

```
        ┌──────────────────────────────────────────┐
        ▼                                          │
     IDLE ⇄ WALK ⇄ RUN ──jump──► JUMP ──► FALL ──► LAND
        │                                  ▲   │
        │                                  │   └──► deepWater ─► SWIM ⇄ SWIM_FAST
        │                                  │                        │
        ├── interact ─► GATHER ─────────────┘                        │
        ├── sit ──────► SIT                                          │
        ├── sleep ────► SLEEP                                        │
        ├── build ────► BUILD_MODE (movement allowed, slower)        │
        ├── fish ─────► FISH_CAST ⇄ FISH_WAIT ⇄ FISH_REEL           │
        ├── raft ─────► RAFT_RIDE ◄──────────────────────────────────┘
        └── climb ────► CLIMB (rope points only)
```

Rules:
- States live in a `PlayerState` component as a discriminated union with per-state data.
- Only `MovementSystem` may change the state; other systems request transitions via intents.
- Every state declares: allowed transitions, whether movement input is consumed, whether the camera is constrained, and its animation set.
- Interruption is always allowed. Any state can be exited by moving, except SLEEP (which has a 1.5 s fade) and the 0.6 s commit window of GATHER.

## 3. Ground movement

Tunables (`content/config.ts` → `player`):

```ts
walkSpeed: 3.2,          // m/s
runSpeed: 6.0,
crouchSpeed: 1.6,        // used only for cave crawl segments
accelGround: 28,         // m/s² — reaches walk speed in ~0.12 s
decelGround: 34,
accelAir: 6,
turnRateGround: 12,      // rad/s of model yaw toward move direction
gravity: -18,            // deliberately heavier than real; real gravity feels floaty
jumpHeight: 1.15,        // m — derived initial velocity = sqrt(2*g*h)
coyoteTime: 0.12,        // s of grace after leaving ground
jumpBuffer: 0.12,        // s of early-press forgiveness
maxFallSpeed: -24,
slopeSlideAngle: 52,     // deg, matches physics config
```

- Input is camera-relative: the stick/WASD direction is rotated into camera yaw space, then normalised.
- Acceleration uses `moveTowards`, not exponential smoothing, so the response is predictable and framerate-independent at a fixed tick.
- The character model yaw lerps toward the movement direction; the *collider* has no rotation. This decoupling avoids a family of camera/collider bugs.
- **No sprint meter.** Running costs Energy at 0.5/s, and Energy exhaustion only reduces speed to 70%.
- Head bob is subtle (2 cm vertical, 1.2 Hz at walk) and disabled by reduce-motion.

## 4. Vertical movement

- Jump is a single fixed-height hop. No double jump, no variable-height hold — this game does not need platforming precision, and a consistent hop is more readable.
- Coyote time and jump buffering are implemented because their absence is felt even by players who cannot name them.
- Landing: fall distance drives a landing animation tier (soft <2 m, medium <5 m, roll ≥5 m) and a camera dip. **No fall damage, ever.**
- Falling into deep water from height triggers a splash and a swim entry, never a death.

## 5. Swimming

- Entering water over 1.4 m deep transitions to SWIM after a short splash.
- `swimSpeed: 2.0`, `swimFastSpeed: 3.2` (costs Energy 1/s), vertical control by look pitch, dive by holding crouch.
- Breath: there is **no drowning**. Diving deeper than 4 m applies a gentle upward drift and a muffled audio filter; at 45 s underwater the player automatically surfaces with a gasp animation. The journal logs deep dives; nothing is lost.
- Underwater rendering: tint, distortion, reduced fog distance, muffled audio bus.
- Exiting to shore uses a shallow-water ramp detection so the player never gets stuck bobbing at the shoreline — this is a classic bug; write a specific test for it.

## 6. Climbing

Only at authored **rope points** (after the Climbing Rope is crafted and attached). Climbing is a constrained vertical movement along a spline with its own animation set. No free climbing — it removes the meaning of region gating and creates infinite level-design surface.

## 7. Interaction

- **Targeting:** a 4 m ray from the camera through the crosshair, filtered to `Interactable`, plus a fallback proximity sphere (2.5 m) picking the entity with the smallest angle to view direction. The fallback exists so that looking *near* a berry bush is enough.
- **Prompt:** shows the verb, the item name, the tool requirement, and the expected yield. Appears within 80 ms of targeting; fades over 120 ms.
- **Hold-to-act:** duration comes from the node definition and the tool tier (0.4–1.6 s). Progress is an eased arc around the crosshair. Releasing early cancels with no penalty and no partial progress lost (progress persists on that node for 3 s so a mis-release is forgiving).
- **Repeat:** holding through completion immediately starts the next action on the same target if it still has yield.

## 8. Camera

See `08_THREEJS_ARCHITECTURE.md` §7 for the render side. Controller side:

- Right stick / mouse controls yaw and pitch. Pitch clamped to [−60°, +75°].
- Sensitivity setting, separate X/Y, plus invert options for both axes.
- Distance 4.5 m default, adjustable 2.5–7 m by scroll, remembered per player.
- **Collision:** sphere-cast from the pivot (player head + 0.4 m) to the desired camera position; on hit, pull in to the hit distance minus 0.2 m, then ease back out at 3 m/s when clear. Never snap outward.
- **Auto-follow:** after 1.5 s of forward movement with no camera input, the camera slowly aligns behind the player (0.8 rad/s). Disabled by a setting because some players hate it.
- Shake: tiny, event-driven, additive, disabled by reduce-motion. Sources: heavy landing, tree felling, thunder, cave rumble.
- **Framing assists:** when entering a new region or standing at an authored viewpoint, a 1.2 s soft pull-back and slight FOV widening. Purely cosmetic; interruptible by any input.

## 9. Input mapping

| Action | KB/M | Gamepad |
|---|---|---|
| Move | WASD | Left stick |
| Look | Mouse | Right stick |
| Run | Shift (hold or toggle setting) | L3 |
| Jump | Space | A / Cross |
| Interact / Gather | E (hold) | X / Square (hold) |
| Primary tool | LMB | RT |
| Inventory | Tab / I | Y / Triangle |
| Journal | J | D-pad up |
| Build mode | B | D-pad right |
| Hotbar 1–8 | 1–8 | LB/RB cycle |
| Sit | Z | D-pad down |
| Photo mode | P | — |
| Pause | Esc | Start |

All rebindable. Gamepad is detected on first input and swaps all prompt glyphs. Deadzone 0.15 radial with a squared response curve.

## 10. Implementation steps

1. `PlayerState` component + state machine skeleton with IDLE/WALK/RUN only.
2. Camera-relative input → desired velocity; integrate with gravity; feed the Rapier character controller.
3. Ground detection, coyote time, jump buffer, jump.
4. Third-person camera with spring arm; then camera collision.
5. Model yaw smoothing and the walk/run animation blend.
6. Interaction targeting and prompt; hold-to-act with cancel.
7. Swim state, water entry/exit, underwater camera and audio.
8. Sit, sleep, build-mode movement modifiers.
9. Fishing and raft states (Phase 5 / Phase 4 respectively).
10. Gamepad support and rebinding UI (Phase 6).

## 11. Testing requirements

- **Feel harness:** a dev scene with slopes at 10/20/30/40/50/55°, stairs at 0.15/0.3/0.45/0.6 m, gaps at 1/2/3 m, and a water ramp. A checklist of 14 assertions a human runs after any movement change. Documented in `dev/harness/movement-checklist.md`.
- Automated: 20,000-tick random-input fuzz produces no NaN, no position outside island bounds, no permanent stuck state (position variance over any 300-tick window with non-zero input must exceed 0.1 m).
- Automated: the shoreline exit test — spawn at 200 sampled shoreline points, walk inland for 3 s, assert the state is not SWIM.
- Automated: coyote time and jump buffer behave to within one tick of spec.
- Performance: movement + camera ≤ 0.35 ms per tick.

## 12. Future expansion

- Gliding with a crafted leaf-glider from Kestrel Point (strong candidate for post-1.0; it would make traversal joyful late-game).
- Mounts (befriended deer) — high animation cost, low necessity.
- Fast travel between lit lanterns, with a short travel animation rather than a loading screen.
- Emotes and sitting on placed furniture with correct IK.
