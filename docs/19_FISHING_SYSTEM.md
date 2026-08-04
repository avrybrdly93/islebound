# 19 — Fishing System

Purpose: the fishing loop, fish tables, the catch interaction, and how fishing ties into the journal and cooking. Fishing is the game's "sit down and breathe" activity and its most repeated deliberate action.

---

## 1. Design stance

- Fishing should be enjoyable at minute 3 and at hour 30. That means a **short, low-stakes skill moment** rather than either a slot machine or a rhythm game.
- **Failure costs nothing** but ~8 seconds. No lost bait, no lost tackle, no broken rod.
- Variety comes from *where and when* you fish, not from mechanical complexity.
- The rod is craftable within the first hour; the reef rod (for the deepest water) is a Stage-4 unlock.

## 2. Loop

```
equip rod → aim (an arc preview shows the landing point)
   │ hold LMB to charge cast power (0.4–1.6 s → 4–18 m)
   ▼
CAST  → bobber flies, splash, ripples
   ▼
WAIT  → 3–18 s (weighted by location, weather, time, buffs)
        • subtle tells: the bobber dips, a shadow passes, a ripple ring
   ▼
BITE  → the bobber plunges, a distinct sound, a 1.2 s window to react
        • miss → line goes slack, reel in, no penalty
   ▼
REEL  → the "hold in the band" minigame (§3), 3–7 s
   ▼
CATCH → fish lifts from the water, a hold-up pose, name card,
        size in cm, "New!" if first time, journal entry
        → added to inventory (or a fish crate if one is in range)
```

## 3. The reel minigame

A single moving band on a vertical track (the classic Stardew shape, softened):

- A **catch bar** the player raises by holding LMB and lowers by releasing (gravity). Physics: `accel = hold ? +9 : -7`, velocity clamped, position clamped to the track.
- The **fish marker** moves with a per-species pattern: `smooth` (sine drift), `darting` (random impulses), `sinker` (biased low), `jumper` (biased high). Patterns come from a seeded stream so a given fish's behaviour is fair and reproducible.
- A **progress meter** fills while the marker is inside the bar and drains at 60% of the fill rate while outside. Fill to 100% = caught. Drain to 0% = escaped (line slack, no penalty, the fish may bite again).
- Difficulty per species sets: bar height (28%–14% of track), marker speed, and pattern. The easiest fish is nearly automatic; the hardest requires attention for ~7 seconds.
- **Accessibility:** a comfort setting "Relaxed Fishing" enlarges the bar by 60% and halves the drain rate. A second setting, "Auto Fishing", skips the minigame entirely after the bite. Both are fully supported and the journal does not distinguish.

## 4. Fish tables

```ts
interface FishDef {
  readonly id: ItemId;
  readonly name: string;
  readonly waters: readonly WaterBodyId[];        // 'shore'|'reef'|'deep'|'river'|'pond'|'cave'
  readonly hours: readonly [number, number][];    // active windows
  readonly weather: readonly Weather[] | null;    // null = any
  readonly rarity: 1|2|3|4;                       // 1 common … 4 legendary
  readonly difficulty: number;                    // 0..1 → bar height + speed
  readonly pattern: 'smooth'|'darting'|'sinker'|'jumper';
  readonly sizeRange: [number, number];           // cm, for records
  readonly minRodTier: 0|1|2;
  readonly journalEntry: string;
}
```

Selection at bite time: filter the table by water body, hour and weather; weight by `1 / rarity²` modified by rod tier and the Angler's Luck buff; roll from `rngFor('fishing', playerId, tick)`.

### 20 fish across 6 water bodies

| Water | Fish |
|---|---|
| Shore | Sand Dab, Silverfin, Spotted Bream, Driftfish, Green Crab |
| Reef | Parrot Wrasse, Sunspot Ray, Coral Perch, Glass Eel |
| Deep (raft) | Blue Marlin*, Moonfish*, Lantern Shark* |
| River | Ridge Trout, Stone Loach, Pale Salmon |
| Pond | Bittercarp, Reed Minnow |
| Cave | Blind Char, Crystal Newt* |

`*` = rarity 4, each with a distinctive environmental tell before the bite (a surface boil, a circling bird flock, a glow) so rare catches feel earned rather than lucky.

Plus 6 **junk/treasure** entries (seaweed, old boot, message bottle, sunken crate, coral fragment, lost key) at ~12% combined — junk is never *just* junk here: the crate contains materials and the bottle contains a fragment.

## 5. Environmental integration

| Factor | Effect |
|---|---|
| Rain | bite rate ×1.35; river fish more likely |
| Storm | Blue Marlin and Lantern Shark only appear during/after storms |
| Fog | Moonfish window extends into morning |
| Night (20:00–05:00) | nocturnal species; the bobber gets a subtle glow |
| Dawn/dusk | overall bite rate ×1.2 |
| Water depth at the bobber | selects the water body (uses `heightAt`) |

## 6. Presentation

- Line rendering: a `Line2` (fat line) with 8 segments doing a simple verlet sag between the rod tip and the bobber. Cheap and it sells the whole activity.
- Bobber: bobs with `waterHeightAt`, ripple decals, and a plunge animation on bite.
- Camera: on bite, a gentle 0.4 s pull-in and slight FOV narrowing; on catch, a short framing on the held fish.
- Audio: a distinct cast whoosh, water plop, a soft ambient bed while waiting, a sharp bite cue (the most important sound in the game — it must be recognisable with the volume low), a reel tension loop, and a warm catch fanfare (short, and *quieter* for repeat catches of the same species).
- The "sit" state can be entered while fishing, which is the single most-photographed thing players will do. Support it.

## 7. Rewards

- Fish → cooking ingredients and journal entries.
- Fish size records per species stored in the journal ("Your best: 62 cm").
- A **Trophy Mount** buildable that displays a specific caught fish at its caught size (bridges fishing and building; high value, low cost).
- Fish crate storage that auto-collects catches when within 8 m.

## 8. Implementation steps

1. Rod item, equip state, `FISH_*` player states.
2. Cast: charge, arc preview, projectile, landing, water body detection.
3. Bobber entity, water-height bobbing, ripples.
4. Wait timer with weighted bite rate; tells.
5. Bite window and miss handling.
6. Reel minigame: bar physics, marker patterns, progress, win/lose.
7. Fish selection tables + rarity weighting + seeded rolls.
8. Catch presentation: pose, name card, size, journal hand-off.
9. Junk/treasure entries.
10. Weather/time integration; rare-fish tells.
11. Fish crate, trophy mount, size records.
12. Comfort settings (Relaxed / Auto).

## 9. Testing requirements

- Unit: fish selection distribution over 200k rolls matches the intended rarity curve within 2% for each water/time/weather combination.
- Unit: every fish is catchable — a solver walks all (water, hour, weather, rod tier) combinations and asserts each fish has at least one reachable configuration. This catches "the Moonfish can never spawn" content bugs, which are otherwise invisible for months.
- Unit: the reel minigame is winnable at maximum difficulty by a scripted "perfect" input, and losable by no input. Both within expected durations.
- Integration: full loop headlessly 5,000 times — no state machine deadlocks, no leaked bobber entities.
- Integration: catching a first-of-species emits exactly one journal unlock; catching it again emits none.
- Accessibility: with Auto Fishing enabled, the loop completes without any input after the bite.
- Performance: fishing adds ≤ 0.1 ms/tick and ≤ 4 draw calls.

## 10. Future expansion

- Crab pots and fish traps (passive, checked daily — good routine content).
- A fish pond building piece that displays and slowly breeds caught fish.
- Diving to collect underwater plants and pearls (partially covered by the reef nodes).
- A seasonal fish rotation if seasons ever ship.
- Multiplayer: shared fishing spots with a "someone caught something!" ping — cheap and delightful.
