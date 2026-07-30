# LeozOps → Egoric integration

Status: Sprint 1A merged; Sprint 1B and Sprint 1C implemented on isolated feature branches.

LeozOps has two read-only CRM surfaces and one proposal-recording surface. All are disabled by default and each uses a separate credential.

| Surface | Route | Purpose |
| --- | --- | --- |
| Lead Snapshot | `GET /api/integrations/leozops/v1/lead-snapshot` | Stable allowlisted funnel facts |
| Lead Operations Brief | `GET /api/integrations/leozops/v1/lead-brief` | Aggregate attention signals and proposal-only next steps |
| Action Proposals | `GET, POST /api/integrations/leozops/v1/action-proposals` | Persist evidence-bound review metadata; never execute work |

## Default-off configuration

This code ships with every business deployment. A route exists only where its operator explicitly deploys both its feature flag and its own SHA-256 key hash.

| Environment variable | Purpose |
| --- | --- |
| `LEOZOPS_SNAPSHOT_ENABLED` | `true` enables the snapshot route; anything else returns 404 |
| `LEOZOPS_READ_KEY_HASH` | Snapshot-only bearer-key hash |
| `LEOZOPS_BRIEF_ENABLED` | `true` enables the brief route; anything else returns 404 |
| `LEOZOPS_BRIEF_READ_KEY_HASH` | Brief-only bearer-key hash |
| `LEOZOPS_PROPOSAL_ENABLED` | `true` enables action proposals; anything else returns 404 |
| `LEOZOPS_PROPOSAL_WRITE_KEY_HASH` | Proposal-only write/list bearer-key hash |

All three raw keys must be different. None creates a session, maps to an `ApiKey` database row or grants access to normal application APIs.

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

## Sprint 1C — Action Proposals

Sprint 1C records a candidate action for later internal review. It does not add an approval engine, command bus, Lead mutation, notification, outbound integration or execution receipt.

Before accepting every POST, the server rebuilds the current Lead Operations Brief directly from the same de-identified Lead allowlist. It then verifies all of the following:

- `brief_id` is the current daily brief;
- `signal_id` exists in that brief and remains `proposal_only`/non-executable;
- `action_type` and `reason_code` match the server policy for that signal;
- every `lead_ref` is a pseudonymous external ID present in the signal evidence;
- the body has the exact allowlisted shape and is at most 16 KB;
- `Idempotency-Key` is present and valid, and its SHA-256 has not been reused for different facts;
- the correlation ID is a UUID and is not reused for different facts.

Only hashes and proposal metadata are stored. Raw credentials and raw idempotency keys are never stored. A proposal and its `AuditLog` row are written in one serializable transaction. Repeating the exact request with the same idempotency key and correlation ID returns the original proposal without another write.

Accepted actions are deliberately narrow:

| Brief signal | Proposal action | Required reason |
| --- | --- | --- |
| `unassigned_active_leads` | `review_lead_assignment` | `assignment_review` |
| `overdue_expected_close` | `review_expected_close` | `sla_review` |
| `late_stage_missing_close` | `complete_expected_close` | `data_quality_review` |
| `aging_active_leads` | `review_aging_leads` | `follow_up_review` |
| `missing_lead_source` | `complete_lead_source` | `data_quality_review` |
| `unknown_funnel_stage` | `review_funnel_stage` | `data_quality_review` |
| `no_active_leads` | `review_funnel_sync` | `sync_review` |

Example body, using IDs returned by the current brief:

```json
{
  "contract": "leozops.lead-action-proposal",
  "version": 1,
  "brief_id": "sha256:<current-brief-hash>",
  "signal_id": "sha256:<current-signal-hash>",
  "action_type": "review_lead_assignment",
  "reason_code": "assignment_review",
  "lead_refs": ["<external-id-from-signal-evidence>"]
}
```

The response always states:

```json
{
  "approval": { "required": true, "status": "not_started" },
  "execution": { "allowed": false, "status": "not_started", "receipt_id": null }
}
```

The stored state is only `proposed`. Its effective response state becomes `expired` at the next UTC day boundary, forcing the caller to refresh the brief. `GET` lists only proposals associated with the authenticated proposal-key fingerprint; it never broadens that credential into another LeozOps or application surface.

Deploy migration `20260729190000_add_leozops_action_proposals` before enabling the flag. Leave the flag off if the migration or write key is not deployed.

### Honest limitations

The current Lead schema has no transition or last-activity history. The brief therefore returns `null` for conversion rate and stage velocity, and states that last-activity data and client attribution are unavailable. The aging signal is based on creation age and always requires human review.

`brief_id` includes the source snapshot, `as_of_date`, policy, metrics, attention, signals, quality and limitations. It excludes `generated_at`, so identical facts on the same brief date produce the same ETag.

## HTTP and security contract

The two read routes provide:

- GET only; all explicitly exported non-GET methods return 405 when enabled;
- 404 when disabled and 401 for missing/wrong/malformed route credentials;
- best-effort in-memory rate limiting at 60 requests/hour/key/serverless instance;
- RFC 9110 quoted ETag with quoted, weak, list and wildcard `If-None-Match` support;
- `Cache-Control: private, no-cache` for successful representations;
- strict-UUID correlation IDs; unsafe caller input is discarded, never echoed or logged;
- one structured, PII-free audit event per enabled request;
- generic 500 failure responses with `private, no-store`; underlying errors are never returned or logged.

The proposal route provides 404/401 failure behavior on the same principles, allows only GET/POST, requires no-store responses, limits requests to 30/hour/key/serverless instance by default, enforces a 16 KB POST body, and emits a PII-free audit event. Validation conflicts return stable 4xx codes; unexpected source/storage errors return a generic 500 without internal error details.

The in-memory limiter is not a global quota. A shared store is required before treating it as an enforceable cross-instance limit.

## Local testing

```bash
# .env.local — never commit
LEOZOPS_SNAPSHOT_ENABLED=true
LEOZOPS_READ_KEY_HASH=<snapshot-key-sha256>
LEOZOPS_BRIEF_ENABLED=true
LEOZOPS_BRIEF_READ_KEY_HASH=<different-brief-key-sha256>
LEOZOPS_PROPOSAL_ENABLED=true
LEOZOPS_PROPOSAL_WRITE_KEY_HASH=<third-proposal-key-sha256>

npm run dev

curl -s http://localhost:3300/api/integrations/leozops/v1/lead-snapshot \
  -H "Authorization: Bearer <snapshot-raw-key>" | jq .

curl -s http://localhost:3300/api/integrations/leozops/v1/lead-brief \
  -H "Authorization: Bearer <brief-raw-key>" | jq .

curl -s -X POST http://localhost:3300/api/integrations/leozops/v1/action-proposals \
  -H "Authorization: Bearer <proposal-raw-key>" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: proposal_20260729_0001" \
  -H "X-Correlation-ID: 11111111-2222-4333-8444-555555555555" \
  --data @proposal.json | jq .

curl -s http://localhost:3300/api/integrations/leozops/v1/action-proposals \
  -H "Authorization: Bearer <proposal-raw-key>" | jq .
```

Run focused regression tests:

```bash
npm run test:leozops
```

## Next authority boundary

Sprint 1C ends at durable, evidence-bound proposal metadata. A later sprint may introduce an approval inbox, but approval and execution must remain separate capabilities with new credentials, maker-checker policy, explicit confirmation and a canonical receipt. The current proposal credential must never gain approval, command or business-record mutation authority.
