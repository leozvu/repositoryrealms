# ADR-REALM-002: World and React ownership

Status: `ACCEPTED`

Date: 2026-08-16

## Decision

`RealmWorldRuntime` owns ephemeral spatial presentation: local pose, velocity, navigation, remote interpolation, interaction phase, camera, ambient actors and transient effects.

React owns product state and operable UI: business data, authorization, contextual action ribbon, direct-travel fallback, voice controls, language, Chronicle and deep workspaces.

The bridge is event based. Runtime emits bounded position, proximity, selection and performance snapshots. React sends object state, presence projections, input commands and canonical receipt events. Canvas-drawn objects are always paired with contextual or nearby DOM controls; the canvas alone never carries the only path to a business action.

Remotion is limited to authored arrival, receipt, ritual and Chronicle sequences. It is prohibited from the continuous world loop.

