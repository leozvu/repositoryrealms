# CEO-15 — Universal Company Navigator

## Outcome

CEO Terminal has one keyboard-first entry point for finding a Portal workspace or entering an approved workflow in AIm, Egoric, Vnecom, or Egolive. The Navigator is a workflow index, not a business-record search engine and not a fifth ERP.

## Product contract

- `Ctrl+K` on the CEO Portal opens `/ceo-navigator`; entity deployments keep the original ERP global search.
- Portal destinations open locally and remain usable even when Entity Registry is unavailable.
- Entity destinations are capability-aware and show only workflows supported by that entity profile.
- Entity launch always calls `/api/ceo/v1/sso/authorize` with an allowlisted relative path.
- Existing CEO session, recent TOTP step-up, active Director membership, rollout ring and one-time authorization-code checks remain mandatory.
- The catalog never includes leads, clients, tasks, invoices, payroll, messages, Gold, Realm presence or any other business record.
- The catalog never exposes entity base URLs, secret references or service credentials.

## UX contract

- Vietnamese and English copy are native, not machine-translated business data.
- Search is accent-insensitive and supports company, workflow and common vocabulary.
- `Arrow Up`, `Arrow Down`, `Enter` and `Escape` work from the search field.
- Controls are at least 44px, focus is visible, status uses text plus color and reduced motion is respected.
- Layout is usable at 375, 768, 1024 and 1440px without horizontal page scrolling.
- Registry failure keeps Portal results and exposes an explicit retry path.

## Security and data invariants

- No direct entity database read or write.
- No generic `/api/data/*` search runs from CEO Terminal.
- No business action is executed by the Navigator.
- Authorization and RepositoryRealms receipts remain owned by the destination workflow.
- Disabled entities and sessions without TOTP step-up cannot launch SSO.

## Exit gate

1. Each of the four registered companies exposes only its supported workflow set.
2. A query such as `Egoric CRM` resolves only to Egoric's CRM workflow.
3. A query such as `Egolive ca live` resolves to the livestream workflow only.
4. Portal workspaces remain available during a forced Registry failure.
5. Entity launch without recent TOTP is visibly disabled.
6. Signed SSO opens the requested relative path and preserves local Director authorization.
7. Entity-profile builds return 404 for `/ceo-navigator`.

## Deployment boundary

The page is CEO-Portal-only. Shipping the Portal page requires no entity deployment. Live entry into a company still depends on that entity's existing CEO SSO rollout ring and credential configuration.
