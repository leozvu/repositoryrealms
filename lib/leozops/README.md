# LeozOps → Egoric lead-snapshot integration (Sprint 1A)

Read-only, de-identified sales-funnel snapshot for the LeozOps integration.

**Route:** `GET /api/integrations/leozops/v1/lead-snapshot`

## Disabled by default — load-bearing

This code ships to all 5 businesses on every deploy. With no env flag set the
route returns **404** and **no key validates**. The feature only exists where
both env vars below are deployed. Never set these in a Vercel project as part of
tooling — they are per-deployment secrets configured by an operator.

| Env var | Purpose |
| --- | --- |
| `LEOZOPS_SNAPSHOT_ENABLED` | `true` turns the route on. Absent/anything else = 404. |
| `LEOZOPS_READ_KEY_HASH` | sha256-hex of the bearer key. Absent = nothing validates. |

Generate the pair (keep the raw key secret; deploy only the hash):

```bash
KEY="lozk_$(openssl rand -hex 20)"
echo "raw key (give to LeozOps): $KEY"
echo "LEOZOPS_READ_KEY_HASH=$(printf %s "$KEY" | openssl dgst -sha256 | awk '{print $NF}')"
```

## Enable locally for manual testing

```bash
# .env.local (never commit)
LEOZOPS_SNAPSHOT_ENABLED=true
LEOZOPS_READ_KEY_HASH=<hash from the snippet above>

npm run dev
curl -s http://localhost:3300/api/integrations/leozops/v1/lead-snapshot \
  -H "Authorization: Bearer <the raw key>" | jq .
# 404 with flag off · 401 with wrong/missing key · 200 with the snapshot
```

## Guarantees

- **GET only** (405 on other methods). **No PII** ever — output is projected onto
  a fixed 7-field allowlist; PII columns are not even SELECTed from the DB.
- **Deterministic `snapshot_id`** (sha256 of the facts, excluding `generated_at`),
  also used as the `ETag` for `If-None-Match` → 304.
- **60 req/hour per key** rate limit (429 + `Retry-After`). In-memory, so the
  limit is **per serverless instance**, not globally shared — best-effort.
- One structured JSON audit line per request (correlation id, key fingerprint,
  path, status, latency, record count, snapshot id) — zero PII.

## Scope of the bearer key

The `LEOZOPS_READ_KEY_HASH` credential works ONLY on this route. It does not
create a session and is not accepted by `apiUser()` / next-auth, so it grants
nothing on any other API route.
