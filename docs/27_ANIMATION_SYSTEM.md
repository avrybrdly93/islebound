# 27 — Animation System

Purpose: character and world animation — skeletal animation, blending, procedural motion, and the vertex animation used for vegetation and distant creatures.

---

## 1. Layers of animation in this game

| Layer | Technique | Examples |
|---|---|---|
| Skeletal | glTF skinned mesh + `AnimationMixer` | player, animals |
| Procedural | code-driven bone/transform offsets | head look-at, foot IK, body lean, breathing |
| Vertex (shader) | vertex displacement in the material | grass, foliage wind, water, flags, distant birds |
| Transform tweens | eased property animation | item pops, piece placement, UI, doors, chests |
| Sprite/particle | particle systems | dust, splashes, sparkles, leaves |

Only the first two need a real system; the rest are handled where they live.

## 2. Skeletal setup

- One humanoid rig for the player (~28 bones: spine ×3, neck, head, arms ×2 with hands as single bones, legs ×2, plus two prop sockets).
- **Hands are single bones.** No finger rigging. At our camera distance and art style it is invisible and it halves the rig cost.
- Sockets: `socket_hand_r`, `socket_hand_l`, `socket_back`, `socket_hip` — used for held tools, the fishing rod, and the backpack.
- Animals share a simplified quadruped rig (18 bones) and a bird rig (12 bones), so animation work is shared across species with per-species timing and scale variation.

## 3. Clip inventory

### Player (~34 clips)

| Group | Clips |
|---|---|
| Locomotion | idle, idle_look, idle_shift, walk_f/b/l/r, run_f, run_turn_l/r |
| Air | jump_start, jump_loop, fall_loop, land_soft, land_hard, land_roll |
| Swim | swim_idle, swim_f, dive, surface |
| Actions | chop, mine, pick, dig, water, plant, place, hammer |
| Fishing | cast_charge, cast_release, wait_idle, bite_react, reel_loop, catch_hold |
| Social/rest | sit_enter, sit_idle, sit_exit, sleep_enter, sleep_idle, pet, wave |
| Carry | carry_idle, carry_walk (for large items) |

### Animals (~8 clips per rig, retimed per species)
idle, idle_alert, graze/peck, walk, run/flee, turn, sleep, special (a deer's ear flick, a gull's call, a turtle's retreat).

## 4. Blending architecture

A small hand-rolled state graph over `THREE.AnimationMixer`:

```ts
interface AnimState {
  name: string;
  clips: BlendSource;                    // single clip or a blend space
  loop: boolean;
  transitions: { to: string; condition: (ctx) => boolean; duration: number }[];
  events: { time: number; event: string }[];   // e.g. footstep at 0.22
}

type BlendSource =
  | { kind: 'clip'; clip: string }
  | { kind: 'blend1d'; param: 'speed'; points: { value: number; clip: string }[] }
  | { kind: 'blend2d'; params: ['moveX','moveZ']; points: { pos: Vec2; clip: string }[] };
```

- Locomotion is a **2D blend space** over local move direction, with speed selecting between walk and run sets via a 1D blend. This gives correct strafing without 16 hand-authored transitions.
- Cross-fades: 0.15 s default, 0.08 s for reactive transitions (land, bite react), 0.35 s for entering rest states.
- **Upper/lower body split** via `AnimationMixer` weight masking on the spine: the player can walk while holding a tool, or wave while running. Two mixers driving disjoint bone sets, blended at the spine with a 0.5 weight ramp over three bones.
- Additive layer for breathing and subtle sway, always on at low weight.

## 5. Animation events

Clips carry named events at normalised times. The mixer polls them per frame and emits to the event bus:

| Event | Used for |
|---|---|
| `anim:footstep` | footstep SFX with material resolution, dust particle |
| `anim:toolImpact` | the actual gather progress tick, impact VFX, camera punch |
| `anim:itemRelease` | detaching a placed piece from the hand |
| `anim:catchPeak` | the fish "held up" moment for the camera framing |

**Important:** gameplay outcomes are *not* gated on animation events — the simulation decides when a gather completes, and the animation is timed to match. If an animation is missing, the gather still works. The event drives *presentation* only. This keeps `sim/` free of animation dependencies.

## 6. Procedural motion

Cheap, high-impact, applied after the mixer each frame:

- **Head look-at**: the head and upper spine turn toward the interaction target or the nearest animal within 8 m, clamped to ±55° yaw / ±25° pitch, smoothed. This single feature makes the character feel alive.
- **Foot IK**: two-bone IK with a downward ray per foot, adjusting foot height and ankle rotation to the terrain, plus a pelvis drop when the height difference exceeds 12 cm. Enabled only for the local player and only within 15 m of the camera.
- **Body lean**: on turns and slopes, a small roll/pitch offset on the root, proportional to angular velocity and slope.
- **Hand IK for tools**: the off-hand snaps to a socket on the held tool so two-handed items look correct across body types and animations.
- **Breathing/idle sway**: additive noise on the spine, amplitude scaled by energy (a tired character breathes more visibly — a lovely, nearly free storytelling detail).

Reduce-motion setting disables lean and reduces sway.

## 7. Vegetation and world animation (shader-side)

- **Grass and foliage wind**: vertex displacement from a scrolling 2D noise sampled by world position, amplitude modulated by vertex colour (red channel = flexibility, painted per vertex in Blender: 0 at the trunk base, 1 at leaf tips), and by the global `windStrength` uniform. Two frequencies: a slow sway and a fast flutter.
- **Gusts**: a large-scale noise band that travels across the island, visibly rolling through the trees. This is the highest-value visual detail per unit of cost in the entire renderer.
- **Distant birds**: a single instanced mesh of ~24 birds on authored flight splines with vertex-animated wings; no entities, no simulation, pure decoration.
- **Water**: Gerstner waves in the vertex shader, matched to the simulation's `waterHeightAt` (see `10_PHYSICS_SYSTEM.md` §7).
- **Doors, chests, hatches**: transform tweens, not skeletal animation — a 0.35 s eased rotation with a sound. Simple and reliable.

## 8. Performance

- Skinned mesh budget: **4 skinned characters** updating at full rate within 20 m; animals beyond that switch to LOD1 with the mixer updating at 15 Hz; beyond 45 m, animals use a vertex-animated (baked-to-texture) LOD with no skinning at all.
- Mixer update cost: ~0.06 ms per character. IK ~0.04 ms per character (local player only).
- Vertex animation is free on the CPU by definition; its GPU cost is folded into the vegetation draw.

## 9. Implementation steps

1. glTF import of a rigged character; verify bone naming and socket empties survive export.
2. `AnimationMixer` wrapper + clip registry + the state graph.
3. Locomotion 2D blend space; tune against the movement tunables from `11_PLAYER_CONTROLLER.md`.
4. Transitions for jump/fall/land; verify no foot sliding at the boundaries.
5. Animation events + footstep and tool impact wiring.
6. Upper/lower split for tool use while moving.
7. Held-item socket attachment and swapping from the hotbar.
8. Head look-at.
9. Foot IK + pelvis adjustment.
10. Animal rigs, clip retiming per species, LOD tiers.
11. Vegetation wind + gust system.
12. Additive idle/breathing, energy modulation, reduce-motion handling.

## 10. Testing requirements

- Unit: the state graph reaches every state from every other reachable state; no unreachable states; no transition loops with zero duration.
- Unit: blend-space weights sum to 1 across a swept sample of the input space.
- Integration: 5,000 ticks of randomised movement produce no NaN bone transforms and no mixer leaks (assert the mixer's action count is stable).
- Integration: animation events fire exactly once per loop iteration (a classic bug: events firing twice near the loop boundary).
- Visual: golden screenshots of the character at 8 poses; a video-diff check is not worth building — human review each phase is enough.
- Performance: 4 skinned characters + 30 animals ≤ 0.5 ms/frame total.
- Manual checklist: no foot sliding at walk/run speeds, no popping on transitions, IK does not fight the terrain on 30°+ slopes.

## 11. Future expansion

- Emote system with a wheel (waves, sits, dances) — pairs with multiplayer and is cheap once the graph exists.
- Tool-specific gather animations per material (chop vs mine vs dig already planned; add sub-variants for flavour).
- Petting animations per animal species with correct height alignment.
- Facial expression via a blendshape or two (a smile, a surprise) — small cost, disproportionate charm.
- Baked vertex-animation textures for crowds of animals if the count ever rises.
