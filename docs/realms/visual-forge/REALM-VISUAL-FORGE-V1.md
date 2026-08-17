# Realm Visual Forge v1

## Mandate

Visual Forge is the art-production harness for Realm World v3. Its job is to replace the procedural prototype look with a believable medieval workplace while preserving business capability, data semantics, operational behavior and the motion system that already passed runtime QA.

The target is not decorative fantasy. The target is a premium spatial co-working world whose architecture, characters and props explain work before the interface adds labels.

## Locked direction

- **World:** believable medieval workplace, not a tavern skin over ERP and not a game-board wallpaper.
- **Camera:** top-down three-quarter orthographic gameplay view.
- **Tone:** serious, warm and lived-in; restrained magic; no theme-park excess.
- **Materials:** worn limestone, aged walnut, woven wool, vellum, forged iron, tarnished brass, wax and soot.
- **Palette:** forest green, oxblood, ink blue, soot charcoal, parchment and restrained antique gold.
- **Readability:** authored silhouettes and lighting hierarchy beat added labels, glow and cards.

## Motion lock

Art production must not rewrite the working locomotion, camera, interaction, presence, Gold receipt or reward-motion behavior.

The preserved contracts are:

1. `REALM_WORLD_FIXED_STEP` and `stepRealmMotion` remain the locomotion authority.
2. `stepRealmCamera` remains the grounded camera authority.
3. Canvas 2D remains the continuous world runtime.
4. Remotion remains receipt-bound reward choreography, not the continuous world loop.
5. Existing interaction state and business callbacks remain authoritative.

New art may provide richer poses, layers, masks, anchors and material response. It may not change travel timing, input semantics, collision truth, canonical receipts or business object behavior as a visual shortcut.

## Production boundary

The two v1 anchors and nine layer/rig/material candidates under `public/realms/assets/visual-forge/v1` are reference art. They are not yet shippable sprites or background plates.

No runtime integration by concept shortcut is allowed. The six-layer stack is background architecture, walkable floor, interactive props, actors, foreground occlusion, then lighting and atmosphere. Every accepted runtime export must share registration, camera, scale and light direction. Character concepts must become consistent gameplay rigs and state atlases. This avoids returning to a static-image world with unrelated actors sliding across it.

## AAA review gate

Every production batch is reviewed against nine dimensions: character silhouette, character materials, environment architecture, world cohesion, lighting hierarchy, spatial depth, object identity, mobile readability and motion compatibility.

- Any dimension below its floor fails the batch.
- A batch cannot ship while any dimension is merely in review.
- Final approval requires every dimension to meet its target and all seven production gates to be recorded.
- Business semantics and motion regression are hard gates, not averageable art scores.

Run `npm run audit:realm:visual-forge` after changing an art bible, visual asset manifest or Realm renderer contract.

## Production sequence

1. Approve character and environment anchors.
2. Prove all five classes in grayscale at 64 px.
3. Build material callouts and shared scale rules.
4. Extract the Guildhall scene graph and eight landmark props.
5. Produce actor state atlases compatible with existing runtime states.
6. Integrate one vertical slice: project table, two actors, foreground occlusion and local lights.
7. Validate desktop and mobile readability without changing motion.
8. Expand the approved system across the remaining zones.
9. Run visual scorecard, motion tests and business-semantic regression together.

## References

- Character anchor: `public/realms/assets/visual-forge/v1/concepts/realm-character-lineup-v1.png`
- Environment anchor: `public/realms/assets/visual-forge/v1/concepts/realm-guildhall-keyframe-v1.png`
- Generated asset and prompt manifest: `docs/realms/visual-forge/IMAGEGEN-PROMPTS-V1.md`
- Machine-readable contract: `lib/realm-visual-forge.js`
