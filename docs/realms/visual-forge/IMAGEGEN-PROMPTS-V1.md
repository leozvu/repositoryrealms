# Realm Visual Forge — Imagegen prompt set v1

All images in this pack were generated with the built-in `image_gen` workflow. They are preproduction references and extraction candidates, not approved runtime atlases. Production integration requires the layer-registration, alpha-edge, mobile-readability and motion-regression gates in `REALM-VISUAL-FORGE-V1.md`.

## `character-lineup`

Path: `public/realms/assets/visual-forge/v1/concepts/realm-character-lineup-v1.png`

```text
Use case: stylized-concept
Asset type: production character art-direction sheet for a top-down 2D spatial coworking RPG
Primary request: a coherent lineup of five medieval-fantasy workplace characters designed for animation: Elf Guild Steward, Dwarf Forge Engineer, Human Goldkeeper, Half-Orc Project Warden, Tiefling Archivist
Style/medium: premium hand-painted concept art with restrained stylized realism, tactile fabric, worn leather and aged brass
Composition: exactly five full-body characters, consistent top-down three-quarter gameplay camera, equal ground plane and scale
Constraints: strong distinct silhouettes readable at 64 px; practical work tools; modular 2D rig compatibility; no combat pose, text, UI or watermark
Avoid: chibi, plastic 3D, glossy mobile-game rendering, random glow, identical faces
```

## `guildhall-keyframe`

Path: `public/realms/assets/visual-forge/v1/concepts/realm-guildhall-keyframe-v1.png`

```text
Use case: stylized-concept
Asset type: production environment keyframe for a top-down 2D spatial coworking RPG
Primary request: a flagship medieval-fantasy Guildhall as a believable premium coworking workplace with command, roster, project, Gold treasury, messaging, voice, entry and forge zones
Style/medium: AAA-quality hand-painted environment concept, top-down three-quarter orthographic perspective, authored stylized realism
Composition: clear navigation lanes; foreground arches and columns; floor, furniture, actor, foreground and lighting depth
Lighting: warm candle and forge pools against cool moonlit stone
Constraints: eight business objects with unique silhouettes; modular layer extraction; no text, UI or watermark
Avoid: flat board-game map, procedural rectangles, empty floors, random glow, glossy mobile-game look
```

## `guildhall-architecture-shell`

Path: `public/realms/assets/visual-forge/v1/layers/guildhall-architecture-shell-v1.png`

```text
Use case: production asset exploration
Asset type: isolated 2.5D Guildhall background architecture layer
Primary request: architecture shell only: limestone perimeter walls, walnut beams, alcoves, doors, windows, command apse, treasury recess, council niche, forge chimney and entry gate
Composition: wide top-down three-quarter orthographic camera; transparent empty center; clean compositing edges
Lighting: neutral material shading, warm upper-left key and cool upper-right rim
Constraints: transparent background; no floor, furniture, interactive props, people, particles, text, UI or watermark
Avoid: flat facade, single wallpaper, baked characters, fake glow, glossy 3D
```

## `guildhall-walkable-floor`

Path: `public/realms/assets/visual-forge/v1/layers/guildhall-walkable-floor-v1.png`

```text
Use case: production asset exploration
Asset type: isolated 2.5D Guildhall walkable-floor layer
Primary request: a coherent floor footprint with worn limestone, aged walnut inlay, restrained rugs, route bands and eight zone foundations
Composition: wide top-down three-quarter orthographic floor plane, transparent outside, clear navigation lanes
Lighting: neutral base ambient occlusion without actor shadows or local light pools
Constraints: floor only; no walls, columns, furniture, people, particles, labels, UI or watermark
Avoid: board-game grid, random runes, neon routes, glossy material, baked props
```

## `guildhall-clean-base-plate`

Path: `public/realms/assets/visual-forge/v1/layers/guildhall-clean-base-plate-v1.png`

```text
Use case: precise-object-edit
Asset type: 2.5D Guildhall registration-master candidate
Primary request: a clean architectural shell plus walkable floor with people, movable furniture, interactive props, foreground hangings, particles and local emissive effects removed
Composition: preserve one orthographic top-down three-quarter camera and shared room footprint
Lighting: permanent ambient occlusion only; no candle pools, forge glow, dust, smoke or bloom
Constraints: no new objects, text, UI or watermark; clean surfaces for later layer registration
Avoid: reframing, perspective changes, new architecture or glossy 3D rendering
```

## `guildhall-business-landmarks`

Path: `public/realms/assets/visual-forge/v1/atlases/guildhall-business-landmarks-v1.png`

```text
Use case: production asset exploration
Asset type: isolated 2.5D prop atlas
Primary request: exactly eight hero props: command map dais, roster cabinet, project war table, mechanical Gold vault, lantern commons, acoustic council ring, entry waystone and working forge
Composition: 4 by 2 atlas, transparent separation, shared top-down three-quarter camera, scale and light direction
Materials: limestone, walnut, forged iron, brass, vellum, wax, soot and scarce Gold
Constraints: distinct reduced-size silhouettes; no people, room shell, labels, UI or watermark
Avoid: duplicated shapes, random glow, combat weapons, cartoon tavern or glossy mobile-game 3D
```

## `guildhall-foreground-occluders`

Path: `public/realms/assets/visual-forge/v1/atlases/guildhall-foreground-occluders-v1.png`

```text
Use case: production asset exploration
Asset type: isolated 2.5D foreground-occlusion atlas
Primary request: exactly twelve depth pieces: stone arches, timber columns, oxblood and forest banners, balustrade, bookcase end-cap, forge chimney, treasury gate, lantern chain and planter
Composition: 4 by 3 atlas; same top-down three-quarter camera, scale and upper-left key; pieces shaped for foreground overlap
Constraints: transparent background, alpha-ready edges, no floor, people, text, UI or watermark
Avoid: front-view icons, flat cutouts, opaque backdrop, magic glow or mismatched perspective
```

## `guildhall-lighting-atmosphere`

Path: `public/realms/assets/visual-forge/v1/atlases/guildhall-lighting-atmosphere-v1.png`

```text
Use case: production asset exploration
Asset type: isolated 2.5D lighting and atmosphere overlay atlas
Primary request: exactly twelve overlays: candle pools, forge spill, moon shaft, treasury glint, lantern radius, council pulse, threshold strip, two actor contact shadows, dust and smoke
Style: restrained physically plausible hand-painted game VFX for screen/add/multiply compositing
Composition: 4 by 3 atlas with transparent separation and shared camera/light direction
Constraints: alpha-ready soft edges; no architecture, floor texture, furniture, people, text, UI or watermark
Avoid: opaque backdrop, lens flare, neon magic circle, hard gradients, excessive particles or giant bloom
```

## `realm-character-turnaround`

Path: `public/realms/assets/visual-forge/v1/characters/realm-character-turnaround-v1.png`

```text
Use case: stylized-concept
Asset type: production character turnaround and grounding sheet
Reference: preserve the approved five-character identity, proportions, palette, tools and material style
Primary request: five rows—Elf Steward, Dwarf Engineer, Human Goldkeeper, Half-Orc Warden, Tiefling Archivist—with four views per row: down, left, up, right
Composition: strict 5 by 4 matrix, identical frame boxes, scale, camera, ground registration and contact shadows
Constraints: exactly twenty neutral-idle figures; no labels, UI or watermark
Avoid: redesign, proportion drift, combat poses, floating feet, chibi or inconsistent camera
```

## `realm-character-interaction-poses`

Path: `public/realms/assets/visual-forge/v1/characters/realm-character-interaction-poses-v1.png`

```text
Use case: stylized-concept
Asset type: production character interaction-pose sheet
Reference: preserve the approved five-character identity, costume, palette and materials
Primary request: five class rows with four poses each: walk contact, profession-object interaction, talk/listen and restrained Gold acknowledgement
Composition: strict 5 by 4 matrix, shared top-down three-quarter camera, frame boxes, scale, ground plane and contact shadows
Motion requirements: clear weight transfer, planted feet and hand anchors; compatible with the existing locomotion and interaction states
Constraints: exactly twenty figures; no combat, text, UI or watermark
Avoid: jumping, victory dances, floating feet, redesign or glossy mobile-game rendering
```

## `guildhall-material-trim-atlas`

Path: `public/realms/assets/visual-forge/v1/materials/guildhall-material-trim-atlas-v1.png`

```text
Use case: stylized-concept
Asset type: 2D game environment material and trim atlas
Primary request: exactly sixteen swatches covering limestone, walnut, iron, grate, brass, Gold inlay, forest/oxblood/ink wool, vellum and wax, soot brick, forge stone, moonlit glass and worn leather
Style: premium hand-painted 2D texture reference with restrained stylized realism and consistent age
Composition: clean 4 by 4 orthographic swatches with neutral upper-left grazing light
Constraints: no obvious focal marks, people, props, text, UI or watermark
Avoid: plastic PBR spheres, bright runes, gemstones, pristine surfaces or duplicated swatches
```
