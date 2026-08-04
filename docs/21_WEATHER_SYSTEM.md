# 21 — Weather System

Purpose: weather states, transitions, their visual/audio expression, and their gameplay effects. Weather is the main source of day-to-day variety and the reason players say "the island feels alive".

---

## 1. States

```ts
type Weather = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog' | 'aurora';
```

| State | Frequency | Duration | Character |
|---|---|---|---|
| Clear | 40% | 4–10 h | bright, saturated, long views |
| Cloudy | 25% | 3–8 h | soft, diffuse, muted |
| Rain | 20% | 2–5 h | wet surfaces, ripples, grey-green palette |
| Storm | 6% | 1–3 h | dark, wind, lightning, heavy rain, dramatic |
| Fog | 8% | 2–4 h | short view distance, intimate, mysterious |
| Aurora | 1% (night only) | 2–3 h | rare, cosmetic, journal-worthy |

## 2. Transition model

A weighted Markov chain evaluated every in-game hour, from `rngFor('weather', day, hour)` — so weather is **deterministic given the seed and time**, which means: multiplayer clients agree without syncing, offline catch-up reproduces the same weather history, and "it rained while you were away" is a real fact the game can report.

```
current → candidates (weights):
clear  → clear .55, cloudy .35, fog .07, rain .03
cloudy → cloudy .40, clear .28, rain .28, fog .04
rain   → rain .45, cloudy .38, storm .12, clear .05
storm  → storm .35, rain .50, cloudy .15
fog    → fog .45, clear .35, cloudy .20
```

Constraints layered on top:
- Aurora is rolled separately: 1% per night at 22:00, only if the current state is clear.
- Storms cannot occur in the first 2 in-game days (a gentle onboarding).
- Fog is 3× more likely between 04:00 and 08:00.
- A minimum-duration guard prevents flicker: no state change within 45 in-game minutes of the last.

**Transitions are gradual.** Each state has a 90-second blend during which fog density, cloud cover, particle rate, wind, audio and the LUT all interpolate. Never snap.

## 3. Visual expression

| Feature | Clear | Cloudy | Rain | Storm | Fog | Aurora |
|---|---|---|---|---|---|---|
| Cloud cover uniform | 0.1 | 0.6 | 0.8 | 1.0 | 0.5 | 0.05 |
| Fog density × | 1.0 | 1.3 | 2.0 | 2.6 | 6.0 | 0.9 |
| Sun intensity × | 1.0 | 0.55 | 0.3 | 0.15 | 0.35 | — |
| Rain particles | — | — | 900 | 1800 | — | — |
| Wind strength | 0.2 | 0.4 | 0.6 | 1.0 | 0.1 | 0.15 |
| Surface wetness | 0 | 0 | →1 | 1 | 0.3 | 0 |
| Water choppiness | 0.3 | 0.5 | 0.8 | 1.0 | 0.2 | 0.3 |
| LUT | day | overcast | rain | storm | fog | aurora |

Implementation notes:
- **Rain** is a GPU particle system: a single instanced quad mesh of ~1,800 streaks in a 24 m box that follows the camera, with the box wrapping (modulo) so particles never need respawning. Streaks are stretched along the velocity direction. Cost: one draw call.
- **Rain does not fall indoors:** the rain box samples the interior grid (from `17_BUILDING_SYSTEM.md` §7) via a small 3D texture updated when interiors change, and kills particles inside. Under trees, a cheaper approach: a downward ray from the particle spawn is too expensive per-particle, so instead dense-canopy chunks get a coverage mask baked at chunk generation. Approximate is fine.
- **Splashes** — a ring buffer of 60 splash decals placed where rain meets terrain near the camera, plus ripple rings on water.
- **Wetness** is a global uniform consumed by the terrain, prop and structure materials: albedo × 0.85, roughness × 0.45, plus a puddle mask driven by the flow-accumulation field from worldgen. Rises over 40 s of rain, dries over 3 in-game hours.
- **Wind** drives foliage vertex animation amplitude, grass bending, cloth/flag animation, particle drift and the audio bed. One global `windStrength` + `windDirection` uniform pair.
- **Lightning:** a full-screen flash (2 frames of raised exposure + a bright directional light), a distant-to-near thunder delay based on a randomised distance, and a screen-space flash on the clouds. Frequency 1 per 20–60 s during storms. Respect reduce-motion/photosensitivity: a setting reduces flash intensity by 80%.
- **Aurora:** an additive ribbon mesh above the horizon with scrolling noise and a slow colour drift.

## 4. Audio expression

| State | Layers |
|---|---|
| Clear | ambient birds, waves, light wind, insects (time-dependent) |
| Cloudy | as clear, wind up, birds down |
| Rain | rain-on-ground bed, rain-on-leaves layer (in forest), rain-on-roof layer (indoors), drips, waves up |
| Storm | rain heavy, wind howl, distant thunder one-shots, waves loud |
| Fog | muffled everything, a low pad, occasional distant gull |
| Aurora | a soft shimmering pad, insects, otherwise quiet |

All beds crossfade over the same 90 s as the visual transition. Indoors, a low-pass filter (800 Hz) is applied to the outdoor bus and the rain-on-roof layer is raised — this is the single most "cozy" audio moment in the game and worth doing properly.

## 5. Gameplay effects

| System | Effect |
|---|---|
| Farming | rain waters all outdoor tiles each hour it rains |
| Fishing | bite rate and species tables vary (see `19`) |
| Wildlife | most animals shelter during rain/storm; fewer spawns; some (frogs, snails) appear only in rain |
| Resources | glimmer nodes may appear after storms (future); mushrooms more common after rain |
| Player | no damage, no slipping, no penalties. Wetness is cosmetic |
| Building | no effect. Structures never take weather damage |
| Journal | first-time weather entries; "Places" entries can require specific weather (e.g. "Kestrel Point in fog") |

## 6. Implementation steps

1. `WeatherSystem` state machine + deterministic hourly rolls + minimum-duration guard.
2. Blend parameters (a `WeatherParams` struct interpolated over 90 s) exposed to render/audio.
3. Fog, cloud cover, sun intensity drive; verify against the day-cycle keyframes (weather multiplies the day-cycle base, never replaces it).
4. Rain particle system with a camera-following wrapped box.
5. Wetness uniform + puddle mask + drying curve.
6. Wind uniform + foliage/grass/cloth response.
7. Interior and canopy rain exclusion.
8. Storm: lightning, thunder, choppier water, stronger wind.
9. Fog state tuning; verify LOD pop is hidden, not revealed, by fog.
10. Aurora.
11. Audio beds and the indoor low-pass.
12. Gameplay hooks: farming watering, fishing tables, wildlife sheltering.
13. Comfort settings: reduced flashes, reduced particles, "always clear" (yes, allow it — some players just want sun).

## 7. Testing requirements

- Unit: the Markov chain reproduces the same weather sequence for the same seed across 1,000 in-game days, on repeated runs and after save/load.
- Unit: state durations respect minimums; no state persists beyond 2× its max duration.
- Unit: aggregate frequencies over 1,000 in-game days are within 15% of the design table.
- Integration: rain waters exactly the outdoor farm tiles (interior exclusion correct at doorways and under partial roofs).
- Integration: transitions never produce a visual snap — assert all interpolated parameters are continuous (no per-frame delta above a threshold) across 20 simulated transitions.
- Visual: golden screenshots for each state at 14:00 from a fixed camera.
- Performance: rain at 1,800 particles ≤ 0.6 ms GPU, ≤ 1 draw call; the whole weather system ≤ 0.15 ms CPU per tick.
- Accessibility: with reduced-flash enabled, measured screen luminance delta during lightning stays under the configured threshold.

## 8. Future expansion

- Seasons as a modifier on transition weights and palettes.
- Snow on the ridge (a splat channel + a particle variant) — high impact, moderate cost.
- Rainbows after rain when the sun is low. Cheap, delightful, exactly this game's register.
- Wind direction affecting the raft's sailing speed.
- Weather forecasting via a crafted barometer, which is a lovely little late-game convenience.
