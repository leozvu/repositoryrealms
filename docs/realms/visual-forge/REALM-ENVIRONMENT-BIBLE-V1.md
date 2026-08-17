# Realm Environment Bible v1

## Environment promise

The Guildhall is architecture for work. A player should understand where decisions, people, projects, Gold, conversation, voice, travel and making happen from form, prop language and light—not from eight floating labels.

## Scene graph

Every production room is delivered as a composable runtime scene, in this order:

1. **Background architecture** — exterior void, upper walls, roof openings and distant depth.
2. **Walkable floor** — navigable stone, timber, rugs and route inlays aligned to collision truth.
3. **Interactive props** — business landmarks and their immediate response pieces.
4. **Actors** — self, remote presence and ambient workers on the existing motion runtime.
5. **Foreground occlusion** — arches, columns, beams, hanging banners and masks that correctly pass in front of actors.
6. **Lighting and atmosphere** — local light pools, shadows, restrained particles and environmental response.

No single painted plate may replace these layers. Decorative detail cannot alter the navmesh or imply a path that collision rejects.

## Eight landmark identities

| Runtime object | Business meaning | Architectural identity | Response language |
| --- | --- | --- | --- |
| `command-dais` | Priorities and decisions | Raised map dais, shield-backed canopy | Map edge light, seal press, banner settle |
| `guild-roster` | People and access | Roster wall, keyed drawers, guild seals | Drawer notch, seal highlight, paper reveal |
| `project-war-table` | Project execution | Inlaid war table with movable task tokens | Map unfold, tokens align, candle lift |
| `treasury-chest` | Gold economy | Mechanical vault, scales and ledger rail | Gear catch, scale settle, contained gold bounce |
| `lantern-commons` | Messaging and social | Hearth-like lantern cluster and communal benches | Lantern answer, seat cue, warm social radius |
| `council-circle` | Proximity voice | Acoustic stone ring, suspended listening discs | Speaking pulse in material, not generic neon ring |
| `realm-gate` | Entry and direct travel | Moonlit portcullis and waystone threshold | Route inlay wake, gate breath, destination mark |
| `arcane-forge` | Gold spend and making | Working forge, tool wall and quench trough | Bellows, ember lift, hammer-ready posture |

Landmarks must remain distinguishable as silhouettes with all labels, particles and accent colors removed.

## Material system

- Stone carries weight, edge wear, mortar logic and temperature variation.
- Timber has construction direction, joinery and age; it is not a flat brown rectangle.
- Iron is forged and dark; brass is restrained to authority, value and interaction points.
- Textiles soften social and focus zones while preserving walkable boundaries.
- Vellum, wax and ink carry information; magical light never replaces readable work objects.
- Gold is scarce and consequential. It appears in the treasury, verified rewards and intentional accents—not as ambient glitter everywhere.

## Lighting hierarchy

The project table is the primary shared-work focal point. Command and treasury are secondary authority/value anchors. Routes use low-contrast practical guidance. Social and voice zones use broader, softer pools. Forge light is active and directional. Moonlight separates stone depth without washing the workplace blue.

Random glow, uniform vignette and equal-brightness hotspots fail review. Actor faces, feet and interaction hands must remain readable against every zone at desktop and mobile camera scales.

## Depth, scale and occlusion

All props use one orthographic camera and shared human scale. Doors, chairs, tables and ledges must support the same actor proportions. Foreground masks cross actors only where architecture physically warrants it; names and critical interaction prompts remain readable.

Every zone needs an occlusion proof, collision overlay and grayscale focal test. Mobile captures at 360×800 and 393×851 must keep the active actor, nearest landmark and route direction readable at the same time.

## Runtime delivery budget

Concept PNGs are exempt from runtime payload budgets because they are not shipped by the renderer. Production exports must be modular, compressed and quality-tiered. Low tier reduces particles and light samples before it reduces actor silhouette or business-object identity. Texture atlases must avoid invisible padding and duplicate source material.

The existing fixed-step motion, camera spring, input feedback and receipt-bound Remotion sequence are acceptance dependencies. An environment batch that makes those systems look worse—even without changing their code—does not pass motion compatibility.
