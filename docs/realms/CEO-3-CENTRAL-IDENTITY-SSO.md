# CEO-3 — Central CEO Identity and SSO

Status: implemented on `codex/realms-demo`; migration and deployment remain on HOLD behind the CEO-0 gate.

## Outcome

CEO-3 adds a control-plane identity for Vũ Lương Sơn and an OIDC-style handoff from the CEO Portal to the four registered entities. It does not share cookies between domains and never gives the Portal direct access to an entity database.

The selected strong-login policy is **password + TOTP**. Passkeys are not placed in the trust path until an audited WebAuthn verifier and an enrollment/recovery ceremony are approved. This satisfies the roadmap rule “passkey or password + TOTP” without shipping an unaudited custom passkey implementation.

## Stored control-plane records

- `CeoGlobalIdentity`: stable global subject mapped to the local Portal Director account.
- `CeoEntityMembership`: explicit entity, local Director email and allowlisted read scopes.
- `CeoPortalSession`: keyed token hash, device metadata hashes, idle/absolute expiry, step-up and revocation.
- `CeoRecoveryCode`: keyed hash, generation version and single-use timestamp.
- `CeoSsoAuthorizationCode`: keyed code/state hashes, audience, nonce, membership projection, 45-second expiry and consumption receipt.

No raw session token, recovery code, authorization code, password, TOTP secret or entity API key is persisted by these models.

## Identity activation

1. The user first authenticates through the existing local credentials provider.
2. The CEO Registry asks for a current TOTP code and a device label.
3. The server re-reads the local user and verifies active Director role plus TOTP.
4. A global identity is created once and missing memberships are provisioned for the four registered entities.
5. A separate opaque CEO session cookie is issued. Only its keyed hash is stored.

The CEO session has an eight-hour absolute lifetime, a 30-minute idle lifetime and a ten-minute step-up window. A recovered session has `recovery` assurance and cannot issue SSO codes until TOTP step-up succeeds.

## Entity handoff

```text
CEO browser
  -> Portal POST /api/ceo/v1/sso/authorize
  <- target callback URL + opaque code + state (45 seconds)
  -> Entity GET /api/ceo/v1/sso/callback
Entity server
  -> Portal POST /api/ceo/v1/sso/exchange (entity Bearer credential)
  <- audience-bound HMAC assertion (30 seconds)
Entity server
  -> verify assertion + local active Director mapping
  -> create its own NextAuth session
  -> redirect only to the stored internal path
```

The opaque browser code contains no identity or business payload. Exchange uses compare-and-swap on `consumedAt`; a second exchange fails as replay. The assertion is signed with that entity's dedicated credential, preventing one entity from minting an assertion for another audience.

## Recovery and revocation

- A step-up session can generate ten recovery codes.
- Codes are displayed once; only keyed hashes are stored.
- Generating a new set advances `recoveryVersion`, invalidating every old code without deleting audit evidence.
- Recovery requires email, password and one unused code, and creates a lower-assurance session.
- Five failed recovery attempts lock the local account for 30 minutes.
- The security panel lists device sessions and supports self or remote revocation.
- Revoking a CEO session immediately stops authorization-code issuance and exchange, even if the ordinary local ERP session remains active.

## Security controls

- Director authorization is rechecked on every Portal management operation.
- Browser mutations enforce same-origin/Fetch Metadata checks.
- Entity exchange authenticates a dedicated server-side credential.
- Codes and state are 192–256 bits, stored as HMAC-SHA256 hashes and never logged.
- `aud`, issuer, expiry, role, nonce and internal redirect are validated at the target.
- Redirects reject absolute URLs, protocol-relative paths, backslashes, control characters and the SSO callback namespace.
- Entity session creation fails unless the mapped local account is active and still has `DIRECTOR`.
- Responses are private/no-store and errors never return secrets.
- Portal and entity writes create local `AuditLog` evidence.

## Required server configuration

Central Portal:

- `CEO_SSO_HASH_SECRET`: a distinct random secret of at least 32 characters; `NEXTAUTH_SECRET` is a compatibility fallback only.
- The four credential references configured in CEO-2, for example `CEO_ENTITY_AIM_API_KEY`.

Each entity deployment:

- `CEO_PORTAL_ORIGIN`: approved HTTPS origin of the central Portal.
- `CEO_ENTITY_ID`: one of `aim`, `egoric`, `vnecom`, `egolive`.
- `CEO_SSO_ENTITY_API_KEY`: the same dedicated value referenced for that entity by the Portal registry.
- A local active Director user whose email matches `CeoEntityMembership.localUserEmail`.

These values must be provisioned independently per Vercel project. They are not committed to Git and are never delivered to the browser.

## Rollout gate

Do not apply the CEO-3 migration or enable SSO until:

1. CEO-0 backup/restore and entity schema blockers are cleared;
2. the Portal database owner is approved;
3. CEO-2 migration is applied on an isolated preview clone first;
4. four dedicated entity credentials are rotated and verified;
5. local Director mappings are reconciled in all four entity databases;
6. preview tests cover expiry, replay, wrong audience, revoked membership, wrong local role, recovery lockout and rollback;
7. the exact Vercel project/database pair is confirmed immediately before each migration and deployment.

## Exit-gate interpretation

The code path now supports one Portal login opening every **enabled, registered and explicitly mapped** entity without credential re-entry. An unregistered, disabled, wrong-audience or locally unmapped entity fails closed. The operational exit gate remains pending until the migration and four-entity configuration are exercised on approved isolated previews.
