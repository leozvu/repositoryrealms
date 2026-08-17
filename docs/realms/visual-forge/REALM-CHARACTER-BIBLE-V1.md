# Realm Character Bible v1

## Character promise

Characters must read as co-workers who inhabit the same Guildhall, not stickers from unrelated fantasy packs. Race, profession and current activity must remain legible at gameplay scale. Diversity comes from proportion, posture, tool language and movement shape—not palette swaps.

## Five production families

| Family | Proportion and silhouette | Profession signal | Material story | Motion-compatible pose bias |
| --- | --- | --- | --- | --- |
| Elf · Guild Steward | Tall, narrow shoulders, long ear line, vertical staff rhythm | Seal staff, keys, folded charter | Fine wool, pale leather, aged brass | Economical stride, upright idle, precise hand cue |
| Dwarf · Forge Engineer | Short, broad torso, large forearms, low center of mass | Hammer, measure, belt tools | Sooted canvas, thick leather, hammered iron | Weighted gait, planted interaction, shoulder-led turn |
| Human · Goldkeeper | Balanced adult proportion, ledger held off-center | Ledger, scale weights, coin pouch | Ink-blue wool, vellum, tarnished brass | Deliberate step, counting idle, protected ledger hand |
| Half-Orc · Project Warden | Tall, broad shoulder wedge, strong forearm line | Rolled plan, task tokens, utility blade | Oxblood wool, scarred leather, dark steel | Grounded gait, clear point gesture, restrained authority |
| Tiefling · Archivist | Slim curved silhouette, readable horn and tail arcs | Book cradle, ink tools, wax seals | Violet cloth, blackened wood, silvered nibs | Quiet stride, page-check idle, curved conversational pose |

## Gameplay silhouette gate

Each family must be identifiable in all four facing directions at **64 px** actor height in grayscale, without nameplate, race label, color accent or tool glow. A five-person blind test must achieve at least 80% correct race and 80% correct profession-family recognition before color rendering begins.

No two families may share the same shoulder-to-height ratio, head contour, tool profile and idle posture. Accessories must remain attached to the body rig and cannot float beside the actor.

## Shared construction rules

- Adult stylized realism; no chibi proportions, plastic 3D finish or oversized combat armor.
- Hands and feet remain large enough to communicate contact, direction and interaction.
- Clothing is constructed: visible hems, closures, weight and wear appropriate to the profession.
- One restrained accent per family; local contrast is reserved for face, hands and active tool.
- Every actor shares the same camera, ground plane, light direction and material vocabulary.
- Class identity must survive color blindness and reduced-resolution rendering.

## Runtime rig contract

The art rig consumes existing runtime truth and does not redefine it. Required inputs are facing, locomotion, speed, interaction state, emote state, speaking state and availability. Existing acceleration, deceleration, position and camera values remain untouched.

Every family must supply compatible sequences for:

- idle breathing and profession-specific secondary idle;
- walk start, walk cycle and walk stop for four facings;
- turn bridge without a positional jump;
- approach-ready-interact-recover;
- talk/listen and proximity voice speaking emphasis;
- body-attached greeting and acknowledgement emotes;
- receipt-bound Gold reward reaction;
- reduced-motion still poses that retain state readability.

Foot contact markers, hand anchors, prop anchors, shadow ellipse and head/nameplate anchor are required metadata. Atlas exports must use consistent frame boxes so switching race or class cannot shift the actor's world position.

## Review sheets

Each production family requires: neutral lineup, grayscale 64 px proof, four facings, material close-up, full state atlas, contact-marker overlay, mobile capture and two-character proximity test. Beauty art without these sheets is not an approved gameplay asset.
