# CEO-9 — Pilot and rollout control plane

Status: code complete on `codex/realms-demo`. The additive migration, evidence capture, production approval variables, entity credentials and deployment remain on **HOLD**. No production entity has been enabled by this phase.

## Outcome

CEO-9 converts the rollout roadmap into an enforceable, fail-closed control plane:

1. `local_staging` — adapters and contracts only; no remote capability.
2. `read_only` — aggregate dashboard and safe deep links.
3. `ceo_sso` — CEO-only SSO plus ephemeral Realm federation.
4. `messaging` — directory sync and cross-entity messaging.
5. `commands` — the four existing allowlisted RepositoryRealms commands.

An entity cannot skip a ring. The server checks the active ring before every outbound dashboard refresh, SSO assertion, federation request, directory/message request and command dispatch. A missing migration, missing state, `hold`, `paused` or insufficient ring blocks the action.

## Safety boundary

- A rollout transition changes only CEO Portal authorization metadata.
- The Portal does not deploy Vercel projects and does not run entity migrations.
- The Portal never writes directly to an entity business database.
- Existing local ERP authentication and business workflows remain available.
- Rollback moves to an earlier ring and leaves it paused. A separate evidence-backed activation is required before outbound access resumes.
- Receipt reconciliation for already-dispatched commands/messages remains available so rollback does not lose uncertain outcomes; new sends are blocked.

## Evidence contract

Every ring requires current, checksummed evidence for:

- backup;
- isolated restore test;
- canary result;
- reconciliation result;
- rollback rehearsal.

Additional gates:

| Ring | Extra evidence |
|---|---|
| CEO SSO | security review |
| Messaging | security review and privacy review |
| Commands | security review, privacy review and maker/checker |
| Egolive commands | independent finance review in addition to maker/checker |

Evidence references must be absolute `https:`, `artifact:` or `vercel:` URLs without credentials, query strings or fragments. Each artifact needs a SHA-256 checksum, observation time and expiry of no more than 30 days. Maker/checker and Egolive finance evidence must be recorded by someone other than the transition actor.

## Production approval envelope

Production promotion is impossible unless all variables below form one current, scoped change window:

```text
CEO_ROLLOUT_CEO0_DECISION=GO
CEO_ROLLOUT_PRODUCTION_APPROVAL_ID=<approved change id>
CEO_ROLLOUT_ALLOWED_ENTITIES=aim,egoric,vnecom,egolive
CEO_ROLLOUT_MAX_RING=<read_only|ceo_sso|messaging|commands>
CEO_ROLLOUT_APPROVAL_EXPIRES_AT=<ISO-8601 timestamp>
CEO_ROLLOUT_COMMAND_CANARY_ENTITY=<one entity id>
```

The current CEO-0 decision is `HOLD`; these values must not be provisioned until its backup, restore and lineage blockers are closed. `CEO_ROLLOUT_COMMAND_CANARY_ENTITY` permits only one command canary at a time.

## Egolive invariant

Egolive may receive read-only dashboard/deep links first. Even at the command ring, payout and settlement actions are rejected by the rollout guard and remain inside local Egolive ERP. The current command contract has no payout or settlement action. An independent finance review is still mandatory before Egolive can enter the command ring.

## Operational sequence

For each entity and ring:

1. Create/verify a backup and restore it outside production.
2. Run the ring-specific canary on staging or the approved production cohort.
3. Reconcile expected receipts/counts against the entity-owned source of truth.
4. Rehearse rollback and checksum all evidence artifacts.
5. Record evidence in `/ceo-rollout` using a recently step-upped CEO Portal session.
6. A different reviewer records maker/checker evidence for command scope.
7. Promote exactly one ring and retain the immutable transition receipt.
8. Observe the entity independently before changing the approval envelope for the next canary.

Rollback:

1. Pause the entity immediately.
2. Reconcile in-flight receipts without resending business actions.
3. Roll back to an earlier ring; the resulting state remains paused.
4. Diagnose and attach replacement evidence.
5. Activate only after the new evidence passes and the production change window is still valid.

## Acceptance evidence

- `npm run audit:ceo:rollout`
- `node --test tests/ceo-rollout.test.mjs`
- `qa/ceo-rollout/ceo-rollout-audit.json`
- `qa/ceo-rollout/ceo-rollout-audit.md`

## Explicit HOLD

This phase does not apply `20260722050000_add_ceo_rollout_control_plane`, populate evidence, change CEO-0 to GO, provision production secrets, enable a company, relink a Vercel project or deploy any target. Those are operational changes requiring verified backups, restore evidence and an amended deployment safety directive naming each approved target.
