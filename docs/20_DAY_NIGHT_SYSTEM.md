# 20 — Day / Night System

Purpose: the world clock, its effect on lighting, colour, audio and gameplay, and the sleep mechanic. The day cycle is the game's metronome; almost every other system reads from it.

---

## 1. Time model

```ts
interface WorldTime {
  tick: number;          // authoritative integer, 30 Hz
  day: number;           // whole in-game days since start
  timeOfDay: number;     // 0..1, derived: (tick % TICKS_PER_DAY) / TICKS_PER_DAY
  hour: number;          // 0..24, derived
  paused: boolean;       // photo mode, menus in single player
}
```

- `TICKS_PER_DAY = 43_200` (24 real minutes at 30 Hz). Default; adjustable in comfort settings to 16, 24, 36 or 48 minutes. The setting scales `TICKS_PER_DAY` and every duration expressed in in-game time scales with it automatically because **durations are stored in in-game time units, never in real seconds.**
- Time never runs backwards. Sleeping advances it.
- In multiplayer, time is server-authoritative and never paused by a single player's menu.

## 2. Schedule

| Hour | Phase | Notes |
|---|---|---|
| 04:30–06:00 | Dawn | sky ramps from indigo to gold, birds start, mist on the water |
| 06:00–11:00 | Morning | crisp light, long-ish shadows, sprinklers fire at 06:00 |
| 11:00–15:00 | Midday | high sun, short shadows, warmest palette, haze |
| 15:00–19:00 | Afternoon | golden, the most photogenic window |
| 19:00–20:30 | Dusk | orange→violet, fireflies appear, crickets |
| 20:30–04:30 | Night | moonlight, stars, cool blues, lanterns matter |

Sun elevation is computed from `timeOfDay` with a simple analytic path (a tilted circle), not real astronomy. Moon opposes the sun with a phase cycle of 8 in-game days that affects moonlight intensity and the sky.

## 3. Lighting drive

`render/sky/DayCycle.ts` samples keyframed curves at `timeOfDay` and writes:

| Target | Source |
|---|---|
| Directional light direction | analytic sun/moon path |
| Directional light colour + intensity | 8-keyframe gradient, Catmull-Rom interpolated |
| Hemisphere sky/ground colours | 8-keyframe gradients |
| Fog colour + density | 8-keyframe, modulated by weather |
| Sky ramp texture V coordinate | continuous |
| Star opacity | smoothstep on sun elevation |
| Colour-grade LUT blend | two LUTs (day/night) blended by sun elevation, then weather LUT blended on top |
| Ambient audio bed crossfade | phase-driven, 20 s crossfades |
| Exposure | small ±0.15 adjustment to keep night readable without being bright |

**Keyframes live in `content/daycycle.ts`** as plain data, so tuning is a content change and can be hot-reloaded in dev. Build a small dev slider that scrubs `timeOfDay` — it will save hours.

Night readability rule: night must be *blue and moody*, never *dark and unplayable*. Target: the player can navigate open terrain by moonlight without a lantern, but caves and dense forest genuinely need one.

## 4. Gameplay effects

| System | Effect of time |
|---|---|
| Wildlife | per-species activity windows; nocturnal species appear |
| Fishing | fish tables filtered by hour; bite rate bonus at dawn/dusk |
| Farming | growth ticks hourly; sprinklers at 06:00; Green Thumb resolves at dawn |
| Resources | glowmoths and cave crystals visible only at night; some flowers close |
| Warmth | cold zones only tick between 20:00 and 06:00 |
| Audio | ambience beds, insect layers, music intensity |
| Journal | "first sunrise", "first storm at night" style entries |
| Lights | placed lanterns/fires auto-emit from dusk to dawn (no fuel) |

Nothing bad happens at night. Night is atmosphere, not threat.

## 5. Sleep

- Requires a placed bed. Interacting between 19:00 and 04:00 offers "Sleep until morning".
- Effect: a 2 s fade with a time-lapse sky, then wake at 06:00 with Energy restored to full and a "Day N" card.
- **While sleeping, time advances at 200× rather than jumping.** This means crops, regrowth, weather and animal schedules all process normally through their existing code paths — no separate "catch-up" logic, no divergence between slept and unslept days. Systems must therefore tolerate large tick deltas efficiently (they do: growth is hourly-bucketed, regrowth is bucketed, weather is a state machine).
- In multiplayer, sleeping requires all awake players to agree (a prompt with a 20 s timer); the majority does not rule — one player can decline and nothing happens, which is the cozy default.
- Sleeping is optional. A player can stay up all night with no penalty.

## 6. Offline time

On loading a save, `elapsedRealMs` is converted to in-game ticks and applied with a cap of **7 in-game days**, then simulated in fast-forward (headless, no rendering, ~200k ticks/second) so all systems process it consistently. Beyond the cap, remaining time is applied as a single "catch-up" event that completes all regrowth and advances crops by the capped amount — generous, not punishing.

A "Welcome back" summary card lists what happened: crops grown, resources regrown, weather seen.

## 7. Implementation steps

1. `TimeSystem`: tick, day, derived accessors, tests for wraparound.
2. Analytic sun/moon path; a debug gizmo showing the arc.
3. Keyframe curve evaluation + `content/daycycle.ts` + a dev time-scrubber.
4. Light, hemisphere, fog and exposure drive.
5. Sky ramp, stars, moon phases.
6. LUT blending for day/night.
7. Ambience crossfade hook-up.
8. Auto-lighting of placed light sources at dusk.
9. Sleep: bed interaction, fade, 200× fast-forward, wake card.
10. Offline catch-up + welcome-back summary.
11. Comfort setting for day length; verify all in-game durations scale.

## 8. Testing requirements

- Unit: `timeOfDay` and `hour` are correct across day boundaries and for very large tick values (no float precision loss — `tick` is an integer and derived values use integer modulo).
- Unit: changing `TICKS_PER_DAY` rescales every in-game duration consistently (a table test across crops, regrowth, weather and buffs).
- Integration: sleeping through 5 nights produces the same world state as playing through them at normal speed (a determinism test comparing `worldHash()` — this is the single most valuable test in this system).
- Integration: offline for 3 days, 8 days, and 400 days all load without error and produce sensible results.
- Visual: golden screenshots at 06:00, 12:00, 19:00, 23:00 from a fixed camera.
- Performance: fast-forward of one in-game day completes in ≤ 400 ms.

## 9. Future expansion

- Seasons (rejected for 1.0; would slot in as a modifier on the same keyframe system).
- Special dates: a meteor shower every 12 days, a "long night" aurora event. Cheap, memorable, journal-worthy.
- A sundial/clock buildable that shows the time in-world instead of on the HUD (nice for players who turn the HUD off).
