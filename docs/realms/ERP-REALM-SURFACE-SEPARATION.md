# ERP/CRM ↔ Realm surface separation

Status: product contract

## Principle

ERP/CRM and Realm are two clients of the same RepositoryRealms business system. They share identity, authorization, business rules, records, receipts, audit and synchronization. They do not share information architecture or user-facing vocabulary.

## ERP/CRM surface

- `/dashboard` and the existing ERP routes remain the default operational workspace.
- Existing ERP navigation, module names, tables, forms, permissions and deep links remain intact.
- ERP terminology stays business-first: Task, Lead, Project, Client, Invoice, Timesheet, Approval and Staff.
- Medieval art may be a decorative theme, but it must not rename, hide or replace ERP capabilities.
- The ERP top bar may offer **Mở Realm** as an optional handoff. It must never redirect users to Realm without an explicit action or stored preference during login.

## Realm surface

- `/realm` and `/realm-demo` contain the optional gamified experience.
- Hall, Quest Board, Guild, Tavern, Gold and Sổ Realm belong only to this surface.
- **ERP · CRM** is always a gateway to `/dashboard`; it is never an alias for a Realm ledger mode.
- **Sổ Realm** is the explicit name of the gamified ledger and may use medieval vocabulary.
- `/realm-demo` remains a local fixture sandbox even though its ERP gateway points to `/dashboard`.
- On the isolated Vercel Preview only, `/realm-demo` may exchange its public sandbox identity for a short-lived, least-privilege STAFF session before opening `/dashboard`. The handoff is disabled unless `REALMS_DEMO_SSO_ENABLED=1`, rejects cross-origin requests, rejects privileged or 2FA identities and never runs in `VERCEL_ENV=production`.

## Synchronization boundary

Both surfaces converge only below the presentation layer:

1. RepositoryRealms authorization checks the actor and scope.
2. Canonical ERP business rules validate the action.
3. The canonical record is written once.
4. A receipt and audit entry are produced.
5. The change feed invalidates both read models.
6. ERP renders business terminology; Realm renders the corresponding game metaphor.

No Realm-only store may become the source of truth for Task, Lead, Project, finance, HR or approval data. Presentation state such as map position, selected room, cosmetic loadout and local demo fixtures remains outside ERP records.

## Navigation invariant

- Realm → ERP: explicit link to `/dashboard`, persisting workspace preference as `erp`.
- ERP → Realm: explicit optional link to `/realm`, subject to pilot authorization.
- Cross-surface contact: presence and invitations remain visible to both clients through the collaboration APIs.
- Reload and back navigation preserve the current surface; they do not silently translate one surface into the other.
