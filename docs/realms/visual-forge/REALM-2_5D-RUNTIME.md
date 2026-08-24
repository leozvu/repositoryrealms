# Realm 2.5D runtime graduation

The Visual Forge sheets are preproduction sources. Realm World v3 now consumes a compressed runtime pack and assembles the Guildhall as a depth-sorted scene instead of showing a single environment plate.

## Runtime layers

1. Projected floor and room material fields.
2. Structural wall faces and room seams.
3. Ambient props and canonical business landmarks.
4. Local and remote actors.
5. Door arches, balustrades, furniture and foreground occluders.
6. Light pools, object responses and action feedback.

The five class turnaround and interaction sheets are runtime skins over the existing simulation. Their white preproduction matte is removed once after load; world position, acceleration, gait timing, collision and camera movement still come from the fixed-step system.

World coordinates and collision remain in the existing 58 × 36 simulation. Rendering compresses the Y axis with a reversible `0.72` projection, so navigation semantics and fixed-step locomotion are unchanged while rooms gain visual depth.

## Object interaction contract

Each canonical business object owns one visual and one reaction:

| Object | Environmental response |
| --- | --- |
| Command dais | Wax-seal pulse |
| Guild roster | Archive drawer reveal |
| War table | Tactical map unfold |
| Treasury chest | Vault light and coin response |
| Tavern board | Lantern warmth bloom |
| Council board | Council sigil response |
| Realm gate | Portal aperture |
| Arcane forge | Forge heat and sparks |

On approach, the locomotion state settles, the actor faces the target, gait pauses, torso and arm pose lean into the action, the prop responds, and only then does the business surface open. The panel remains a secondary work surface; it does not replace the spatial acknowledgement.

## Runtime budget

The four environmental WebP atlases stay below 1.5 MB combined, while the two character sheets stay below 3.2 MB combined. High-detail occluders are omitted on low quality, patterns are cached on canvas resize, matte removal runs once, and the existing fixed-step motion/camera systems are not replaced.
