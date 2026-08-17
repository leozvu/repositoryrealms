# ADR-REALM-001: Canvas 2D world runtime

Status: `ACCEPTED`

Date: 2026-08-16

## Context

The existing flagship Realm scene projects world coordinates onto one static image and moves DOM actors with React state. It cannot provide continuous locomotion, grounded camera motion, scene-layer ownership or a deterministic performance harness.

## Decision

Realm World v3 uses a native Canvas 2D renderer behind `NEXT_PUBLIC_REALM_WORLD_V3`. The renderer owns the fixed-timestep world loop, layered scene drawing, camera, actor animation, ambient effects and world-space feedback. React owns accessible controls, contextual actions and business workspaces.

PixiJS was rejected for this release because the required 2D scene fits Canvas 2D, the repository has no Pixi dependency, and adding an engine would increase bundle and migration risk without unlocking a required capability. The runtime contracts remain renderer-agnostic so a later WebGL renderer can replace Canvas without changing business adapters.

## Consequences

- No React state update occurs per rendered frame.
- No actor or camera movement uses CSS `top` or `left` transitions.
- The legacy Guildhall remains available through `?world=v2` and the feature flag.
- Canvas never owns canonical tasks, rewards, approvals, identity or media state.
- Deterministic rendering and simulation functions must remain separately testable.

