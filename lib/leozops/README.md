# LeozOps → Egoric integration

Status: Sprint 1A merged; Sprint 1B implemented on an isolated feature branch.

LeozOps currently has two read-only, de-identified CRM surfaces. Both are disabled by default and use separate credentials.

| Surface | Route | Purpose |
| --- | --- | --- |
| Lead Snapshot | `GET /api/integrations/leozops/v1/lead-snapshot` | Stable allowlisted funnel facts |
| Lead Operations Brief | `GET /api/integrations/leozops/v1/lead-brief` | Aggregate attention signals and proposal-only next steps |

## Default-off configuration

This code ships with every business deployment. A route exists only where its operator explicitly deploys both its feature flag and its own SHA-256 key hash.

| Environment variable | Purpose |
| --- | --- |
| `LEOZOPS_SNAPSHOT_ENABLED` | `true` enables the snapshot route; anything else returns 404 |
| `LEOZOPS_READ_KEY_HASH` | Snapshot-only bearer-key hash |
| `LEOZOPS_BRIEF_ENABLED` | `true` enables the brief route; anything else returns 404 |
| `LEOZOPS_BRIEF_READ_KEY_HASH` | Brief-only bearer-key hash |

The two raw keys must be different. Neither key creates a session, maps to an `ApiKey` database row or grants access to the normal application APIs.

Generate one key at a time and keep the raw value in a secret manager:

```bash
KEY="lozk_$(openssl rand -hex 20)"
echo "raw key: $KEY"
printf 'sha256: '
printf %s "$KEY" | openssl dgst -sha256 | awk '{print $NF}'
```

Deploy only the hash. Tooling must never write these values into Vercel or another deployment automatically.

## Sprint 1A — Lead Snapshot

The snapshot projects every Lead onto exactly seven fields:

- `external_id`
- `stage`
- `source`
- `estimated_value`
- `created_at`
- `expected_close_at`
- `owner_assigned` — boolean only, never owner identity

PII columns such as name, company, email, phone and note are not selected from Prisma and cannot appear in the projector output. `snapshot_id` is a deterministic SHA-256 over canonical facts and excludes `generated_at`.

## Sprint 1B — Lead Operations Brief

The brief derives aggregate operating attention from the same strict snapshot facts. It does not select more database columns and does not contain a mutation path.

### Metrics

- total, active, terminal and unknown-stage counts;
- per-stage count and estimated-value total;
- active, won and lost estimated-value totals;
- assigned/unassigned active coverage;
- explicit `source_native_unlabeled` value unit.

The API does not call estimated value “revenue” or “cash”.

### Policy signals

| Signal | Meaning | Default severity |
| --- | --- | --- |
| `unassigned_active_leads` | Open records have no assigned owner | High |
| `overdue_expected_close` | Open records have a close date before `as_of_date` | High |
| `late_stage_missing_close` | Proposal/negotiation records lack a valid close date | Medium |
| `aging_active_leads` | Creation age exceeds the stage policy | Medium |
| `missing_lead_source` | Attribution is incomplete | Low |
| `unknown_funnel_stage` | A stage is outside `egoric_sales_v1` | High |
| `no_active_leads` | The current snapshot has no open records | Info |

Every signal includes aggregate evidence and up to 25 sorted pseudonymous external IDs. Additional records are represented by `remaining_count`.

Every recommendation is explicitly:

```json
{
  "mode": "proposal_only",
  "requires_human_review": true,
  "executable": false
}
```

No command, approval, CRM write or receipt is fabricated by this endpoint.

### Honest limitations

The current Lead schema has no transition or last-activity history. The brief therefore returns `null` for conversion rate and stage velocity, and states that last-activity data and client attribution are unavailable. The aging signal is based on creation age and always requires human review.

`brief_id` includes the source snapshot, `as_of_date`, policy, metrics, attention, signals, quality and limitations. It excludes `generated_at`, so identical facts on the same brief date produce the same ETag.

## HTTP and security contract

Both routes provide:

- GET only; all explicitly exported non-GET methods return 405 when enabled;
- 404 when disabled and 401 for missing/wrong/malformed route credentials;
- best-effort in-memory rate limiting at 60 requests/hour/key/serverless instance;
- RFC 9110 quoted ETag with quoted, weak, list and wildcard `If-None-Match` support;
- `Cache-Control: private, no-cache` for successful representations;
- strict-UUID correlation IDs; unsafe caller input is discarded, never echoed or logged;
- one structured, PII-free audit event per enabled request;
- generic 500 failure responses with `private, no-store`; underlying errors are never returned or logged.

The in-memory limiter is not a global quota. A shared store is required before treating it as an enforceable cross-instance limit.

## Local testing

```bash
# .env.local — never commit
LEOZOPS_SNAPSHOT_ENABLED=true
LEOZOPS_READ_KEY_HASH=<snapshot-key-sha256>
LEOZOPS_BRIEF_ENABLED=true
LEOZOPS_BRIEF_READ_KEY_HASH=<different-brief-key-sha256>

npm run dev

curl -s http://localhost:3300/api/integrations/leozops/v1/lead-snapshot \
  -H "Authorization: Bearer <snapshot-raw-key>" | jq .

curl -s http://localhost:3300/api/integrations/leozops/v1/lead-brief \
  -H "Authorization: Bearer <brief-raw-key>" | jq .
```

Run focused regression tests:

```bash
npm run test:leozops
```

## Next authority boundary

Sprint 1B ends at evidence-backed proposals. A later sprint may introduce an approval inbox or command submission contract, but must use a new write credential, idempotency, maker-checker policy, explicit confirmation and a canonical receipt. Read credentials must never gain write authority.
