# 39 — Content Authoring Guide

Purpose: the practical how-to for adding content — items, recipes, nodes, crops, fish, pieces, animals, journal text — without touching engine code. This is the document an agent (or the developer at 11 p.m.) follows step by step. The design rules live in the system docs; this is the checklist layer.

---

## 1. Ground rules

1. Content lives in `packages/shared/src/content/` as `as const satisfies` tables (`07` §2.3). Startup validation is fatal in dev — a broken table will tell you immediately.
2. **IDs are forever.** `item.pine_plank` can be deprecated (alias table) but never renamed or reused (`04` §7).
3. Every content addition ships with: the table entry, its assets, its journal text, and a reachability check (usually automatic via T7/T8).
4. Respect the ceilings in `01` §8. If a ceiling blocks you, that is a human conversation, not a bigger table.
5. Tone of journal text: warm, curious, naturalist, lightly wry. One or two sentences. Never jokey, never lore-dumpy. Read five existing entries before writing one.

## 2. Recipes: adding an item + recipe (most common task)

1. `items.ts`: add the `ItemDef` — id, name, description (this doubles as journal text), icon name, stackSize (99 material / 20 rare / 1 tool), tags.
2. `icons/`: add the SVG at 64×64 on the shared line weight; run `pnpm assets:build --only icons`. The generated map makes a missing icon a compile error.
3. `recipes.ts`: add the `RecipeDef` — max 4 inputs, correct station, an `UnlockRule` that a player at that stage can actually trigger.
4. Run `pnpm test` — validation + T7 reachability + T8 will catch dangling references, unreachable unlocks, and cost outliers (`pnpm tools:balance` warns if gather-cost > 3× tier median).
5. If the item is a tool/food/placeable, fill the corresponding optional block; a placeable also needs a `PieceDef` (§5).

## 3. Resource nodes

1. `nodes.ts`: `NodeDef` per `14` §1 — yields reference existing items; pick `depleteBehaviour` and regrow time from the standard table (`14` §5).
2. Model: budgets in `25` §3; name LODs/`UCX_`/variants correctly; run `pnpm assets:build --only models`.
3. Scatter rule in `worldgen.ts` for its regions; then run `pnpm sim --check worldgen` — the density validator and playability invariants (`12` §10) must stay green.
4. SFX/VFX keys: reuse a material set (`wood|stone|plant|shell|ore`) unless the node genuinely sounds new.
5. Regenerate the density heatmap (`pnpm tools:worldmap`) and eyeball it.

## 4. Fish

1. `fish.ts`: `FishDef` per `19` §4. Choose waters/hours/weather so the fish is *findable* — T8's solver will fail the build if no configuration can spawn it, but "technically reachable at 03:00 in a storm" is a design smell; check intent.
2. Rarity 4 fish require an environmental tell — coordinate with a VFX entry.
3. Journal illustration + entry text.
4. If it feeds a dish, add the dish (§6) in the same PR so the fish has a use.

## 5. Building pieces

1. `structures.ts`: `PieceDef` per `17` §2 — footprint on the 1 m/2 m module, snapMode, sockets named to match the model's `SOCKET_*` empties, recipeCost (= refund, exactly).
2. Model with sockets and `UCX_` collision; validate: `pnpm assets:validate` cross-checks socket names between table and glTF extras.
3. Add the crafting recipe producing the placeable item.
4. Run the snapping fixture test with a new scenario if the piece introduces a new socket pairing.
5. Verify variants/dye channels render (the tint mask is vertex-colour alpha).

## 6. Crops and dishes

- Crop: `crops.ts` per `18` §2, stage meshes `_s0.._sN` in one glb, seed item + seed source (wild plant, potting bench ratio, or ruin), journal text. Growth days should sit in the 3–8 band unless deliberately special.
- Dish: `dishes.ts` per `18` §7 — max 3 inputs, one buff or none, cook time 15–40 s. Check the buff table; do not invent new buff types in a content PR.

## 7. Animals

`animals.ts` per `14` §7. New species reuse an existing rig (quadruped/bird) with retimed clips — a genuinely new rig is an engine-adjacent task, not a content task; file it as such. Befriendable species need a favourite food that exists and is obtainable in their region.

## 8. Journal fragments and places

- Fragments: `fragments.ts` — 24 at 1.0, each tied to a landmark spawn point in `landmarks.ts`. The story order and voice live in `docs/data/fragments-draft.md`; changes there need a human read for tone before the table updates.
- Places: a region/viewpoint entry with discovery radius and (optionally) a weather/time requirement — use sparingly (`21` §5).

## 9. Tuning values

Any number a designer might turn lives in `config.ts`, grouped by system, with a comment giving units and the doc section that owns it. Never tune by editing a system file. Hot-reload in dev makes iteration immediate.

## 10. Definition of done for a content PR

```
- [ ] Table entries added; startup validation green
- [ ] Assets built, validated, committed; no placeholder magenta in the PR screenshots
- [ ] Journal text written in-voice
- [ ] T7/T8 reachability green; balance report has no new red flags
- [ ] Screenshot or GIF of the content in-world
- [ ] Ceilings respected (01 §8)
- [ ] No engine code touched (if it was, this was not a content task — split it)
```
