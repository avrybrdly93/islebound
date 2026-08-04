# 02 — Core Gameplay Loop

Purpose: define the moment-to-moment, session, and long-arc loops precisely enough that any system can be evaluated against them. If a proposed feature does not strengthen one of these loops, it does not ship.

---

## 1. The three nested loops

```
MICRO   (5–30 s)   notice → approach → interact → reward → notice
MESO    (10–45 m)  goal → gather → return → craft/build → new goal
MACRO   (2–20 h)   capability gate → new region → new resources → new capabilities
```

## 2. Micro loop — the 15-second heartbeat

This is the loop that decides whether the game feels good. Everything else is scaffolding.

```
   ┌─ AMBIENT WORLD ─────────────────────────────┐
   │ something catches the eye (colour, motion,  │
   │ sound, light, a silhouette on the horizon)  │
   └───────────────┬─────────────────────────────┘
                   ▼
         player moves toward it        ← movement must be pleasurable on its own
                   ▼
         proximity → affordance highlight + prompt
                   ▼
         hold-to-interact (0.4 s–1.6 s) with:
            • progress arc that eases out
            • incremental particle + sound feedback
            • camera micro-punch on completion
                   ▼
         reward: item pop → arcs into inventory
                 + first-time journal flash
                   ▼
         eye is drawn to the next thing (composition)
```

### Micro-loop quality bar (enforced in review)

- Time from "I want that" to "I have that" ≤ 6 seconds for common resources.
- Every interaction has: an anticipation frame, a contact moment, and a settle. Never a single instantaneous state change.
- Every interaction produces at least three simultaneous feedback channels (visual, audio, haptic-equivalent i.e. camera/controller).
- First-time acquisition of anything always produces a distinct, better feedback burst than the hundredth time.

## 3. Meso loop — the session

```
ARRIVE ──► SURVEY ──► CHOOSE INTENT ──► GATHER ──► RETURN ──► TRANSFORM ──► ADMIRE
   ▲                                                                          │
   └──────────────────────── new intent forms while admiring ◄────────────────┘
```

- **Arrive:** player loads in at their bed. First 20 seconds must present a visible, actionable prompt: a grown crop, a full chest, a bird they haven't catalogued, weather they haven't seen.
- **Survey:** the journal and the build menu are the two "what now?" surfaces. Both must open in <150 ms and show incomplete things prominently.
- **Choose intent:** intents are self-set. The game never assigns quests. It *suggests* through recipe requirements: "Cabin Wall needs 4 Plank, 2 Rope" is a quest the player gave themselves.
- **Gather:** the route between home and resources should be 45–120 seconds of travel at Stage 2+, shrinking as the player builds paths and, later, unlocks fast travel via lit lanterns.
- **Return → Transform:** the payoff. Placement of a built object is the single most rewarding action in the game and should be tuned accordingly (see `17_BUILDING_SYSTEM.md` §9 Feedback).
- **Admire:** the game must give the player a reason to stand still and look. Camera framing, evening light, and the "sit" interaction serve this.

### Meso-loop guarantees

- A player who plays 10 minutes must complete at least one meaningful thing.
- No task in the meso loop may require more than **two** trips across the island.
- Crafting queues continue while the player does something else. Nothing forces standing and waiting.

## 4. Macro loop — the arc

```
 Region entered ──► novel resources ──► new recipes learned
        ▲                                       │
        │                                       ▼
   gate unlocked ◄── gate item crafted ◄── capability recognised
```

Every region unlock follows the same authored beat structure:

1. **Sight** — the player can see the region long before entering it (composition, landmarks).
2. **Rebuff** — the first attempt fails legibly (vines too thick, too dark, too far, too cold), and the failure *names the solution*.
3. **Preparation** — 15–40 minutes of gathering toward the gate item.
4. **Threshold** — crossing is a designed moment: a distinct musical cue, a view, a new ambient bed.
5. **Yield** — within 60 seconds of entering, the player finds something only this region has.

## 5. The "cozy contract"

Formal constraints that every system must satisfy. Treat these as testable requirements.

| # | Contract | Test |
|---|----------|------|
| C1 | No player action can result in net loss of items | Automated: simulate 10k random actions, assert inventory value is monotonic except for explicit crafting/consumption |
| C2 | No timer can expire with a negative consequence | Manual review of every timer added |
| C3 | The player can stop at any moment without penalty | No mid-action commitment longer than 6 s |
| C4 | Nothing in the world can damage the player | No damage system exists in code |
| C5 | The player is never blocked for more than 10 minutes by a missing resource | Resource density audit per region |
| C6 | Any placed object can be removed for full refund | Automated test on building system |

## 6. Soft-pressure mechanics (the permitted exceptions)

Energy and Warmth exist to shape pacing, not to threaten. Their design rules:

**Energy**
- Range 0–100. Chopping −2, mining −3, running −0.5/s, swimming −1/s. Regenerates +1/s when idle, faster when sitting.
- At 0: player walks at 70% speed and effortful interactions are unavailable. That is the entire consequence.
- The UI shows Energy only when below 50%, fading in gently. No always-on bar.
- Comfort setting: "Endless Energy" disables drain entirely. The game must remain fully completable with it on.

**Warmth**
- Only ticks in cold zones (Ridge above y=48 m at night; all of Sunken Steps).
- Effect at low warmth: colour desaturation vignette, energy regen ×0.25, breath particles.
- Any fire within 8 m, any hot food, or leaving the zone restores it within 20 s.
- Comfort setting: "No Cold" disables it.

Neither meter may ever be referenced by another system as a failure condition.

## 7. Onboarding without a tutorial

The first 10 minutes are authored, not scripted:

| Time | Player is doing | Because |
|------|-----------------|---------|
| 0:00 | Waking on the beach; camera pans the shore | Establishes scale and tone |
| 0:30 | Walking; driftwood glints on the sand within 15 m | Only interactable in view |
| 1:00 | Picks up wood, sees it arc into inventory, journal flashes | Teaches interact + reward |
| 2:00 | Sees three more resource types within a 40 m arc | Teaches variety |
| 4:00 | Inventory full-ish; craft prompt appears for Campfire (needs 5 Wood, 3 Stone) | Teaches crafting, self-set goal |
| 6:00 | Places campfire — first placement, big feedback | Teaches building |
| 8:00 | Light falls; fire becomes visibly valuable | Teaches day cycle |
| 10:00 | Bedroll craftable; sleeping shows a time-lapse | Teaches the day loop |

Rules: no modal tutorial windows, no forced camera control removal beyond the opening 8-second pan, maximum 6 one-line contextual hints in the entire game, each shown at most twice.

## 8. Failure modes to watch for

Signs the loop has broken; check these in every playtest and log in `34_DEVELOPMENT_LOG.md`:

- Player walks past resources without gathering → gathering feedback is too weak or inventory is full too often.
- Player builds nothing for 30 minutes → gather-to-build ratio is wrong; reduce costs.
- Player opens the journal and closes it immediately → journal is not surfacing near-complete categories.
- Player uses fast travel for everything → the world between places is not interesting enough.
- Player stops playing at hour 6 → the Stage 3 gate is too expensive.
