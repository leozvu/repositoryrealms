# Production domain cutover — 2026-07-22

Owner: Vũ Lương Sơn
Status: prepared; waiting for the five approved hostnames and DNS-provider access.

## Domain matrix

| Surface | Vercel project | Current fallback | Approved hostname |
| --- | --- | --- | --- |
| AIm Agency | `agency-erp` | `https://agency-erp-mu.vercel.app` | TBD |
| Egoric Agency | `erp-egoric` | `https://erp-egoric.vercel.app` | TBD |
| Vnecom | `erp-vnecom` | `https://erp-vnecom.vercel.app` | TBD |
| Egolive | `erp-egolive` | `https://erp-egolive.vercel.app` | TBD |
| CEO Master Board | `erp-master-leoz` | `https://erp-master-leoz.vercel.app` | TBD |

The five Vercel fallback URLs remain available during and after cutover. Never move a hostname from another project with `--force` without a separate ownership check.

## Inputs required before mutation

1. Exact hostname for every row above.
2. DNS provider and confirmation that its administrator is available during the window.
3. Whether the root/apex domain must redirect to one of the five surfaces.
4. Approved maintenance window and rollback owner.

## Pre-cutover gate

1. Confirm the production commit and all GitHub checks are green.
2. Confirm all five Vercel deployments are `Ready` and pass `/login`, `/api/ceo/v1/health`, and role-based smoke tests.
3. Export the current Vercel domain assignments and production environment-variable names without printing values.
4. Record current DNS values and lower TTL where the DNS provider supports it.
5. Add each hostname to its intended project, then use `vercel domains inspect` and `vercel domains verify --project <project>` to obtain and verify the exact DNS record.
6. Do not remove any working `vercel.app` alias.

## Application configuration to rotate

After DNS verification, update the production environment and redeploy because Vercel environment changes are not retroactive:

- Every project: `NEXTAUTH_URL=https://<its-approved-hostname>`.
- Entity projects: `CEO_PORTAL_ORIGIN=https://<master-hostname>`.
- Master Board registry: each entity `baseUrl` becomes its approved HTTPS hostname.
- Master Board: update the SSO/HTTP allowed-origin configuration to the four approved entity origins.
- Keep API keys, service keys, database URLs, schema names, and encryption secrets unchanged during the domain-only cutover.

## Cutover order

1. Master Board hostname and certificate.
2. Egoric Agency canary, followed by SSO round-trip from Master Board.
3. Egolive and Vnecom, including one Group Workforce receipt reconciliation.
4. AIm Agency last because it is operationally independent.
5. Re-run login, logout, callback, CSRF/same-origin, messaging, command receipt, Realm, and ERP/CRM smoke tests on every hostname.

## Rollback

If authentication, SSO, receipt reconciliation, or TLS fails:

1. Stop the rollout before the next entity.
2. Keep users on the known-good `vercel.app` URL.
3. Restore the previous `NEXTAUTH_URL`, `CEO_PORTAL_ORIGIN`, registry URLs, and allowed origins.
4. Redeploy the previous known-good production deployment.
5. Preserve audit/receipt rows; never delete them to hide a failed cutover.

## Completion evidence

- Vercel domain verification and certificate status for all five hostnames.
- DNS lookup from at least two networks.
- Successful credential login for each required role per entity.
- Successful Master Board TOTP login and SSO round-trip to all four entities.
- One cross-company request with target-owned approval and a reconciled RepositoryRealms receipt.
- Recorded rollback decision and final production deployment IDs.
