-- CEO-6: opt-in federated directory and encrypted unified inbox.
CREATE TABLE "CeoEntityDirectoryProfile" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "sharedWithCeoPortal" BOOLEAN NOT NULL DEFAULT false,
  "sharePresence" BOOLEAN NOT NULL DEFAULT false, "displayName" TEXT, "title" TEXT,
  "policyVersion" TEXT NOT NULL DEFAULT '1.0.0', "consentedAt" TIMESTAMP(3), "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CeoEntityDirectoryProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CeoEntityDirectoryProfile_userId_key" ON "CeoEntityDirectoryProfile"("userId");
CREATE INDEX "CeoEntityDirectoryProfile_sharedWithCeoPortal_updatedAt_idx" ON "CeoEntityDirectoryProfile"("sharedWithCeoPortal", "updatedAt");
ALTER TABLE "CeoEntityDirectoryProfile" ADD CONSTRAINT "CeoEntityDirectoryProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CeoDirectoryProfileCache" (
  "id" TEXT NOT NULL, "identityId" TEXT NOT NULL, "entityId" TEXT NOT NULL, "remoteUserId" TEXT NOT NULL,
  "email" TEXT NOT NULL, "displayName" TEXT NOT NULL, "title" TEXT, "sharePresence" BOOLEAN NOT NULL DEFAULT false,
  "sourceUpdatedAt" TIMESTAMP(3) NOT NULL, "fetchedAt" TIMESTAMP(3) NOT NULL, "retentionUntil" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CeoDirectoryProfileCache_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CeoDirectoryProfileCache_identityId_entityId_remoteUserId_key" ON "CeoDirectoryProfileCache"("identityId", "entityId", "remoteUserId");
CREATE INDEX "CeoDirectoryProfileCache_identityId_displayName_idx" ON "CeoDirectoryProfileCache"("identityId", "displayName");
CREATE INDEX "CeoDirectoryProfileCache_retentionUntil_idx" ON "CeoDirectoryProfileCache"("retentionUntil");
ALTER TABLE "CeoDirectoryProfileCache" ADD CONSTRAINT "CeoDirectoryProfileCache_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "CeoGlobalIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CeoDirectoryProfileCache" ADD CONSTRAINT "CeoDirectoryProfileCache_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "CeoEntityRegistry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CeoUnifiedConversation" (
  "id" TEXT NOT NULL, "identityId" TEXT NOT NULL, "entityId" TEXT NOT NULL, "type" TEXT NOT NULL DEFAULT 'dm',
  "remoteUserId" TEXT, "name" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'active', "lastMessageAt" TIMESTAMP(3),
  "retentionUntil" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CeoUnifiedConversation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CeoUnifiedConversation_identityId_entityId_type_remoteUserId_key" ON "CeoUnifiedConversation"("identityId", "entityId", "type", "remoteUserId");
CREATE INDEX "CeoUnifiedConversation_identityId_status_lastMessageAt_idx" ON "CeoUnifiedConversation"("identityId", "status", "lastMessageAt");
CREATE INDEX "CeoUnifiedConversation_retentionUntil_idx" ON "CeoUnifiedConversation"("retentionUntil");
ALTER TABLE "CeoUnifiedConversation" ADD CONSTRAINT "CeoUnifiedConversation_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "CeoGlobalIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CeoUnifiedConversation" ADD CONSTRAINT "CeoUnifiedConversation_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "CeoEntityRegistry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CeoUnifiedMessage" (
  "id" TEXT NOT NULL, "conversationId" TEXT NOT NULL, "direction" TEXT NOT NULL, "senderRef" TEXT NOT NULL,
  "senderName" TEXT NOT NULL, "bodyCiphertext" TEXT NOT NULL, "bodyIv" TEXT NOT NULL, "bodyTag" TEXT NOT NULL,
  "keyVersion" INTEGER NOT NULL DEFAULT 1, "contentHash" TEXT NOT NULL, "mentionRefs" TEXT NOT NULL DEFAULT '[]',
  "idempotencyKeyHash" TEXT NOT NULL, "correlationId" TEXT NOT NULL, "sourceMessageId" TEXT,
  "targetReceiptId" TEXT, "targetConversationId" TEXT, "targetMessageId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'dispatching', "attemptCount" INTEGER NOT NULL DEFAULT 1, "lastErrorCode" TEXT,
  "sentAt" TIMESTAMP(3) NOT NULL, "deliveredAt" TIMESTAMP(3), "readAt" TIMESTAMP(3), "retentionUntil" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CeoUnifiedMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CeoUnifiedMessage_idempotencyKeyHash_key" ON "CeoUnifiedMessage"("idempotencyKeyHash");
CREATE UNIQUE INDEX "CeoUnifiedMessage_correlationId_key" ON "CeoUnifiedMessage"("correlationId");
CREATE UNIQUE INDEX "CeoUnifiedMessage_conversationId_sourceMessageId_key" ON "CeoUnifiedMessage"("conversationId", "sourceMessageId");
CREATE INDEX "CeoUnifiedMessage_conversationId_sentAt_idx" ON "CeoUnifiedMessage"("conversationId", "sentAt");
CREATE INDEX "CeoUnifiedMessage_status_updatedAt_idx" ON "CeoUnifiedMessage"("status", "updatedAt");
CREATE INDEX "CeoUnifiedMessage_retentionUntil_deletedAt_idx" ON "CeoUnifiedMessage"("retentionUntil", "deletedAt");
ALTER TABLE "CeoUnifiedMessage" ADD CONSTRAINT "CeoUnifiedMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CeoUnifiedConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CeoEntityConversationLink" (
  "id" TEXT NOT NULL, "portalConversationId" TEXT NOT NULL, "targetEntityId" TEXT NOT NULL,
  "localConversationId" TEXT NOT NULL, "participantUserId" TEXT, "type" TEXT NOT NULL, "lastExportedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CeoEntityConversationLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CeoEntityConversationLink_portalConversationId_key" ON "CeoEntityConversationLink"("portalConversationId");
CREATE INDEX "CeoEntityConversationLink_targetEntityId_localConversationId_idx" ON "CeoEntityConversationLink"("targetEntityId", "localConversationId");

CREATE TABLE "CeoEntityMessageReceipt" (
  "id" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL, "correlationId" TEXT NOT NULL, "actorSubject" TEXT NOT NULL,
  "targetEntityId" TEXT NOT NULL, "portalConversationId" TEXT NOT NULL, "localConversationId" TEXT NOT NULL,
  "localMessageId" TEXT NOT NULL, "payloadHash" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CeoEntityMessageReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CeoEntityMessageReceipt_idempotencyKey_key" ON "CeoEntityMessageReceipt"("idempotencyKey");
CREATE UNIQUE INDEX "CeoEntityMessageReceipt_correlationId_key" ON "CeoEntityMessageReceipt"("correlationId");
CREATE INDEX "CeoEntityMessageReceipt_actorSubject_createdAt_idx" ON "CeoEntityMessageReceipt"("actorSubject", "createdAt");
CREATE INDEX "CeoEntityMessageReceipt_targetEntityId_portalConversationId_idx" ON "CeoEntityMessageReceipt"("targetEntityId", "portalConversationId");

-- Existing CEO memberships gain messaging scopes; target capability checks still fail closed.
UPDATE "CeoEntityMembership"
SET "scopes" = ((COALESCE(NULLIF("scopes", ''), '[]')::jsonb || '["directory.read","message.read","message.send","message.export"]'::jsonb)::text),
    "recordVersion" = "recordVersion" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'active' AND "localRole" = 'DIRECTOR';
