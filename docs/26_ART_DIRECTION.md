# 26 — Art Direction

Purpose: the visual target, and the constraints that make it achievable by a solo developer with AI assistance. Art direction here is a cost-control document as much as an aesthetic one.

---

## 1. The target in one sentence

> **Stylised low-poly with warm, saturated, art-directed light — like a well-lit diorama you could pick up.**

Not realistic. Not flat-shaded minimalism. Not cel-shaded anime. The reference register is *A Short Hike* meets a Studio Ghibli background painting, rendered with modern lighting.

## 2. Why this style

1. **Cheap to author.** Low-poly models with painted-in detail and no unique UV texturing per asset means one person can produce hundreds of props.
2. **Cheap to render.** Low triangle counts, shared atlases, few materials, no expensive shading model.
3. **Ages well.** Stylised art does not look dated in three years the way mid-tier realism does.
4. **Forgiving.** Small modelling errors read as charm rather than as bugs.

## 3. Form language

- **Chunky, rounded, slightly exaggerated.** Trees have thick trunks and simplified canopy masses. Rocks are faceted, not scanned.
- Silhouette first: every asset must be recognisable as a black shape. This is the acceptance test for any model.
- Scale exaggeration: props are ~10% larger than realistic relative to the player, doors slightly wider, furniture slightly rounder. This reads as friendly.
- **No small detail below ~5 cm.** It disappears at gameplay distance and costs triangles and texture space.
- Flat-ish surfaces with beveled edges (a 2–3 cm bevel catches light and is the single highest-value modelling habit here).

## 4. Colour

A **constrained palette**, defined once in `content/palette.ts` and used by every material, every UI element, and every particle.

| Role | Hex | Use |
|---|---|---|
| Sand | `#E8D5A9` | beaches, paths, UI neutral |
| Warm Sand Shadow | `#C4A97B` | |
| Grass | `#7FB069` | primary ground |
| Deep Foliage | `#3E7350` | forest canopy |
| Pine | `#2F5D50` | ridge vegetation |
| Rock | `#9A9086` | cliffs, stone |
| Rock Shadow | `#6B635C` | |
| Water Shallow | `#5FC9C1` | reef, shore |
| Water Deep | `#1F6B8C` | ocean |
| Wood | `#B07D4A`→`#A9733F` | structures |
| Terracotta | `#C4603D` | accents, destructive UI |
| Sky Day | `#8FD3E8` | |
| Sky Dusk | `#F2A65A` → `#8B5A8C` | |
| Ink | `#2E2A26` | text, outlines |
| Paper | `#F6EFE3` | UI panels, journal |

Rules:
- **Saturation is high but not neon.** Chroma sits in the middle range; nothing is fully saturated except tiny accents (a berry, a crystal, a lantern flame).
- **Value contrast carries readability**, not hue contrast. Squint at any screenshot: the important things should be the lightest and darkest elements.
- Each region has a **palette bias**: Shore warm/light, Palmhollow warm/mid, Terraces golden, Ridge cool/desaturated, Caves dark/cyan-accented, Reef bright cyan, Point pale/windswept. Achieved with per-region LUT blending, not by making separate assets.
- Interactable objects get a subtle warm rim or a slightly raised value so they read as touchable without a glowing outline.

## 5. Light

Light is where the money goes. The models are simple so the light must be beautiful.

- **Strong key** from the sun with warm colour at low elevations, near-white at noon.
- **Generous fill** from the hemisphere light, tinted by sky above and ground-bounce below. This is what makes low-poly look soft rather than harsh.
- **Long shadows** in morning and afternoon; the 15:00–19:00 window is deliberately the most beautiful time of day and should be where marketing screenshots come from.
- **Fog as depth**: always some atmospheric perspective, tinted toward the sky colour. Distant terrain should be noticeably lighter and cooler.
- **Bloom, restrained**: only genuinely bright things bloom — sun on water, fire, crystals, lantern flames.
- Night is blue-violet, not black, with warm pools of light around fires and lanterns. The contrast between cold ambient and warm point light is the game's most striking image.

## 6. Materials

Physically based, but with the roughness range compressed to 0.35–0.85 (avoiding both mirror and chalk) and metalness used almost nowhere (only tools and the beacon).

- **Painted detail over textured detail.** Vertex colours and gradient ramps do more work than texture maps. Most props use the shared atlas at low texel density.
- A subtle **triplanar noise overlay** at large scale on all outdoor surfaces breaks up flatness for free.
- **Foliage:** two-sided alpha-tested cards with a strong translucency approximation (a wrapped-diffuse term plus a view-dependent rim) so leaves glow when backlit. This one shader effect does more for the atmosphere than any other.
- **Water:** see `09_RENDERING_PIPELINE.md` §6. It should be the prettiest thing in the game — the player will look at it for hours.

## 7. What we explicitly do not do

- No normal-mapped micro-detail on props (costs texture memory, reads as noise at our scale).
- No hard black outlines (they fight the soft light and are expensive to do well).
- No screen-space reflections, no ray tracing, no volumetric fog volumes.
- No photoscanned or realistic-proportioned assets, ever, even as placeholders that might survive.
- No visual clutter: the ground is not carpeted in debris. Empty space is part of the composition.

## 8. Composition and world dressing

- Every region has 2–3 **landmark silhouettes** visible from a distance (the lighthouse, the great pine, the waterfall, the wreck's mast). Navigation is by landmark, not by minimap.
- Sightlines are authored: from the spawn beach the player can see the forest edge, the ridge and the lighthouse. Every gate is visible before it is reachable.
- **Framing devices**: arches of vegetation, gaps between rocks, and the 12 authored viewpoints where the camera assist gently pulls back.
- Density gradient: sparse at the shore, dense in the forest interior, sparse again on the ridge. Density change is what makes a place feel like a place.

## 9. Character design

- Player: simple, rounded, no face detail beyond a suggestion; readable from behind at 4.5 m, which is the only view that matters. One body type at 1.0; outfit colour customisable.
- Animals: expressive through motion, not through modelling. A deer is 1,500 triangles and sells itself entirely through its idle head-lift and its flee bound.

## 10. UI art

Covered in `24_UI_UX_SYSTEM.md` §5. Summary: warm paper, ink line work, hand-drawn icons, a naturalist's notebook rather than an interface.

## 11. Consistency mechanisms (how a solo dev keeps this coherent)

1. **The palette file is law.** No colour enters the game that is not in it or derived from it by the tint system.
2. **A style sheet render**: a single scene containing one of every asset class, rendered nightly, reviewed weekly. Divergence is visible immediately.
3. **The silhouette test** on every new model.
4. **A "does this belong" question** in every art PR: would this asset look at home in a screenshot of the spawn beach?
5. Reference board maintained at `docs/data/art-reference.md` with links and thumbnails, updated as the style firms up.

## 12. Implementation steps

1. Palette file + a swatch page in dev.
2. Material factory with the base material set and the tint system.
3. Foliage translucency shader — do this early; it defines the look.
4. Day/night keyframes tuned against a grey-box scene with a few real assets.
5. LUT authoring workflow (render a neutral scene, grade in an image editor, export a 32³ LUT strip).
6. Per-region LUT blending.
7. Style sheet scene + nightly render.
8. First art vertical slice: the spawn beach fully dressed, 60 fps, at final quality. **Do this before producing bulk assets** — it is the go/no-go on the whole direction.

## 13. Testing requirements

- Visual regression on the six canonical scenes (see `09_RENDERING_PIPELINE.md` §10).
- Palette audit: a script scans materials and content for colours not derived from the palette; warns.
- Contrast audit for UI text against every panel background (WCAG AA).
- Colour-blind simulation renders (protanopia, deuteranopia, tritanopia) of the six canonical scenes plus every UI screen, reviewed each phase — the interactable rim and the crafting availability states must survive all three.

## 14. Future expansion

- Seasonal palettes (a LUT + vegetation tint swap; genuinely cheap if built on this foundation).
- Weather-specific vegetation states (drooping in rain).
- A "sketch mode" photo filter that renders the world in the journal's ink style. Extremely on-brand, moderate cost, huge shareability.
