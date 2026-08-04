# 22 — Audio System

Purpose: the audio architecture, mixing structure, ambience and music design, and the rules for triggering sound from simulation events. In a game whose selling point is atmosphere, audio is roughly half the product.

---

## 1. Architecture

Web Audio API directly, wrapped in `audio/AudioEngine.ts`. No Howler, no `THREE.Audio` — both add constraints we would fight.

```
sources ──► per-sound GainNode ──► [PannerNode if positional] ──► bus
buses:  sfx ─┐
        ui  ─┤
        amb ─┼──► master gain ──► compressor ──► destination
        mus ─┘
        (amb + sfx also route through an "outdoor" filter node used indoors)
```

- Buses expose volume 0–1, persisted in settings: Master, Music, Ambience, SFX, UI.
- A gentle `DynamicsCompressorNode` on master prevents clipping when a storm, a waterfall and a fanfare coincide.
- The **indoor filter**: a `BiquadFilterNode` (lowpass, 800 Hz, Q 0.7) inserted on the ambience and outdoor-SFX path, wet/dry blended over 0.8 s when the player crosses an interior boundary.
- Underwater: lowpass 500 Hz + a slight pitch drop on ambience + a muffled bed.

Autoplay policy: the `AudioContext` starts suspended and resumes on the first user gesture. The title screen's "Play" button is that gesture. If the context is suspended mid-session (tab switch), the engine resumes on the next gesture and fades in over 0.5 s.

## 2. Positional audio

- Positional sounds use `PannerNode` with `HRTF` panning, `inverse` distance model, `refDistance: 3`, `maxDistance: 60`, `rolloffFactor: 1.2`.
- The listener is at the **camera**, oriented by the camera — not the player. This matches what the player sees and avoids the disorienting effect of listening from behind the character.
- Budget: **32 simultaneous positional voices.** A voice pool with priority (distance + category weight) steals the quietest voice when full.
- Distant loops (waterfall, ocean, wind on the ridge) are attached to authored emitter positions from `content/audio-emitters.ts` and faded by distance with a cheaper linear model, not full HRTF.

## 3. Ambience

Layered beds, each a seamless loop, crossfaded by context:

```
bed = f(region, timeOfDay phase, weather, indoor, underwater)
```

Layers (each 0–1 gain, blended additively):

| Layer | Driven by |
|---|---|
| ocean_near / ocean_far | distance to shoreline |
| forest_day / forest_night | region + phase |
| ridge_wind | elevation + wind strength |
| cave_drip | region |
| river_flow / waterfall | distance to emitters |
| insects_evening / insects_night | phase |
| birds_dawn / birds_day | phase + weather |
| rain_ground / rain_leaves / rain_roof | weather + canopy + indoor |
| interior_hum | indoor |

- Crossfades over 20 s for phase changes, 90 s for weather (matching the visual transition), 0.8 s for indoor/outdoor.
- Randomised one-shots on top of beds: a gull cry, a distant woodpecker, a creaking branch, a wave slap. Scheduled with a Poisson process per region, 8–40 s intervals, panned randomly. **These are what make a static bed feel alive.**

## 4. Music

- ~35 minutes of original music, written as **stems** rather than finished tracks: each cue has 3–4 layers (pad, melody, rhythm, texture) that can be enabled independently.
- Cue selection by region and phase; layer intensity by activity (idle → pad only; exploring a new region → melody in; building → rhythm in).
- Music is **sparse by design**: silence is a feature. Target ~45% of playtime with no music playing. A cue plays for 90–180 s, then rests for 2–6 minutes.
- Transitions: cues change on a musical boundary where possible (each stem has a declared bar length and BPM; the engine schedules the switch at the next bar). If a hard cut is needed, a 3 s crossfade.
- Special cues: first sunrise, entering each region for the first time, relighting the Beacon, and a short "day complete" motif when sleeping.
- Ducking: music drops 6 dB for 2.5 s under the catch fanfare, the new-recipe chime, and the region-discovery sting.

## 5. SFX design rules

- Every repeated sound has **at least 3 variations** plus ±8% pitch and ±10% gain randomisation, with a "never the same sample twice in a row" constraint.
- Every interaction has **impact + tail**: the chop is a crack plus a wood ring; the placement is a thunk plus a settle.
- Material-aware: wood, stone, metal, cloth, sand, water, foliage, glass. A footstep resolves material from the terrain splat weights and the structure piece underfoot.
- Footsteps: 6 variations per material, triggered by animation events (not by a timer), with the run set having more attack.
- UI sounds are quiet, short and dry — never intrusive. A single hover tick, a select, a confirm, a back, an error (soft, not a buzz).

### Priority SFX list (the ones that carry the game)

1. Gather completion per material (wood/stone/plant/shell/ore)
2. Item pickup and the inventory-add tick
3. Building piece placement per material
4. Fishing: cast, plop, bite, reel loop, catch fanfare
5. Footsteps ×8 materials ×2 gaits
6. Water entry, swim strokes, surfacing gasp
7. Campfire crackle (looping, positional)
8. Door open/close, chest open/close
9. Journal entry unlocked, recipe unlocked
10. Rain start/stop transitions, thunder ×4

Total budget ~120 unique sounds, ~380 files with variations.

## 6. Event → sound mapping

Mapping lives in `content/audio-map.ts` as data:

```ts
{ event: 'resource:harvested', sound: (e) => `sfx_gather_${NODES[e.node].material}_complete`, positional: true, bus: 'sfx', priority: 3 }
```

`audio/Sfx.ts` subscribes to the simulation event bus and resolves through this table. **No system may call the audio engine directly.** This keeps audio out of gameplay code, makes it fully data-driven, and means the headless simulation runs with no audio stubs at all.

## 7. Asset format and loading

- **Ogg Vorbis** for everything (universal support in target browsers in 2026; ~30% smaller than MP3 at equivalent quality). A single AAC fallback is unnecessary.
- Ambience/music: 48 kHz stereo, ~96 kbps VBR. SFX: 48 kHz mono, ~80 kbps VBR.
- Loading: UI and core SFX in the initial bundle (~1.2 MB); region ambience and music streamed on approach; decoded lazily and cached in an `AudioBuffer` LRU (cap 64 MB, evict by last-used).
- Long music stems use `MediaElementAudioSourceNode` (streamed) rather than full decode, saving memory.

## 8. Implementation steps

1. `AudioEngine`: context, buses, master compressor, settings persistence, autoplay handling.
2. Buffer loader + LRU cache + a decode queue that never blocks a frame.
3. `Sfx`: one-shot playback, variation selection, pitch/gain randomisation, voice pool with priority stealing.
4. Positional playback + listener tied to the camera.
5. Event→sound table + subscription; wire the first 10 priority sounds.
6. `Ambience`: layer definitions, context evaluation, crossfading.
7. Randomised one-shot scheduler.
8. Indoor filter + underwater filter with smooth blending.
9. `Music`: stem loading, cue selection, bar-aligned transitions, intensity layers, rest periods.
10. Ducking.
11. Footstep material resolution from terrain splat + structures, driven by animation events.
12. Full settings UI, including a per-bus test tone.

## 9. Testing requirements

- Unit: voice pool never exceeds 32 voices; stealing picks the lowest-priority/quietest; no voice leaks over 100k play calls.
- Unit: the event→sound table references only existing assets (validated at startup; fatal in dev).
- Unit: variation selection never repeats the same sample consecutively.
- Integration: crossing an interior boundary blends the filter within 0.8 s and does not click (assert gain continuity).
- Integration: 30 minutes of simulated play produces no unbounded memory growth in the buffer cache.
- Integration: the game runs correctly with the audio context blocked (autoplay denied) — no exceptions, no missing gameplay.
- Manual: a mix checklist — no sound clips at master 1.0 with a storm + waterfall + fanfare + music simultaneously.
- Accessibility: all information-carrying sounds have a visual equivalent (bite cue → bobber animation; recipe unlock → toast).

## 10. Future expansion

- Player-placed instruments and a simple ocarina-style play mechanic (very on-brand; low cost; big screenshot/video value).
- Radio/gramophone furniture that plays music cues at a position.
- Procedural wind chimes driven by the wind uniform.
- Reverb impulse responses per space (cave, interior, open) via `ConvolverNode` — cheap and a large perceived-quality jump; strong candidate for 1.0 if time allows.
