-- CEO-3: central CEO identity, MFA session, recovery and one-time SSO control plane.
-- No raw browser token, recovery code or authorization code is stored by these tables.
CREATE TABLE "CeoGlobalIdentity" (
  "id" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "recoveryVersion" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CeoGlobalIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CeoEntityMembership" (
  "id" TEXT NOT NULL,
  "identityId" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "localUserEmail" TEXT NOT NULL,
  "localRole" TEXT NOT NULL DEFAULT 'DIRECTOR',
  "scopes" TEXT NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'active',
  "recordVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CeoEntityMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CeoPortalSession" (
  "id" TEXT NOT NULL,
  "identityId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "deviceLabel" TEXT NOT NULL,
  "userAgentHash" TEXT,
  "ipHash" TEXT,
  "assuranceLevel" TEXT NOT NULL DEFAULT 'mfa',
  "stepUpAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idleExpiresAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revokeReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CeoPortalSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CeoRecoveryCode" (
  "id" TEXT NOT NULL,
  "identityId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CeoRecoveryCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CeoSsoAuthorizationCode" (
  "id" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "stateHash" TEXT NOT NULL,
  "nonce" TEXT NOT NULL,
  "identityId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "audience" TEXT NOT NULL,
  "scopes" TEXT NOT NULL DEFAULT '[]',
  "localUserEmail" TEXT NOT NULL,
  "redirectPath" TEXT NOT NULL DEFAULT '/dashboard',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CeoSsoAuthorizationCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CeoGlobalIdentity_subject_key" ON "CeoGlobalIdentity"("subject");
CREATE UNIQUE INDEX "CeoGlobalIdentity_userId_key" ON "CeoGlobalIdentity"("userId");
CREATE INDEX "CeoGlobalIdentity_status_email_idx" ON "CeoGlobalIdentity"("status", "email");
CREATE UNIQUE INDEX "CeoEntityMembership_identityId_entityId_key" ON "CeoEntityMembership"("identityId", "entityId");
CREATE INDEX "CeoEntityMembership_entityId_status_idx" ON "CeoEntityMembership"("entityId", "status");
CREATE INDEX "CeoEntityMembership_localUserEmail_idx" ON "CeoEntityMembership"("localUserEmail");
CREATE UNIQUE INDEX "CeoPortalSession_tokenHash_key" ON "CeoPortalSession"("tokenHash");
CREATE INDEX "CeoPortalSession_identityId_revokedAt_expiresAt_idx" ON "CeoPortalSession"("identityId", "revokedAt", "expiresAt");
CREATE INDEX "CeoPortalSession_idleExpiresAt_idx" ON "CeoPortalSession"("idleExpiresAt");
CREATE UNIQUE INDEX "CeoRecoveryCode_codeHash_key" ON "CeoRecoveryCode"("codeHash");
CREATE INDEX "CeoRecoveryCode_identityId_version_usedAt_idx" ON "CeoRecoveryCode"("identityId", "version", "usedAt");
CREATE UNIQUE INDEX "CeoSsoAuthorizationCode_codeHash_key" ON "CeoSsoAuthorizationCode"("codeHash");
CREATE INDEX "CeoSsoAuthorizationCode_entityId_expiresAt_consumedAt_idx" ON "CeoSsoAuthorizationCode"("entityId", "expiresAt", "consumedAt");
CREATE INDEX "CeoSsoAuthorizationCode_identityId_createdAt_idx" ON "CeoSsoAuthorizationCode"("identityId", "createdAt");
CREATE INDEX "CeoSsoAuthorizationCode_sessionId_createdAt_idx" ON "CeoSsoAuthorizationCode"("sessionId", "createdAt");

ALTER TABLE "CeoEntityMembership" ADD CONSTRAINT "CeoEntityMembership_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "CeoGlobalIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CeoEntityMembership" ADD CONSTRAINT "CeoEntityMembership_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "CeoEntityRegistry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CeoPortalSession" ADD CONSTRAINT "CeoPortalSession_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "CeoGlobalIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CeoRecoveryCode" ADD CONSTRAINT "CeoRecoveryCode_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "CeoGlobalIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CeoSsoAuthorizationCode" ADD CONSTRAINT "CeoSsoAuthorizationCode_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "CeoGlobalIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CeoSsoAuthorizationCode" ADD CONSTRAINT "CeoSsoAuthorizationCode_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CeoPortalSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
