# ADR-REALM-003: Normalized Realm presence identity

Status: `ACCEPTED`

Date: 2026-08-16

## Decision

The Realm projection uses `entityId + userId` when both are available, then stable `userId`, and only uses normalized display name as a demo fallback. Transport session IDs are never counted as people.

Multiple sessions collapse into the most recent eligible projection. Self is excluded before rendering remote actors. World actors, online count, roster and voice all consume the same normalized identity set.

Demo actors are not created to fill the world. Mechanical ambient workers may animate as environment props, but never appear in roster, voice or online counts.

## Invariants

- One identity produces at most one remote actor.
- Voice participants are a subset of online identities plus self.
- Expired transport sessions disappear after the heartbeat window.
- Presence is voluntary context and never a productivity signal.

