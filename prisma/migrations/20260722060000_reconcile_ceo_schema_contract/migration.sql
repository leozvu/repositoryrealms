-- Reconcile the CEO control-plane schema with Prisma's @updatedAt contract.
-- The application, rather than PostgreSQL, owns updatedAt writes for these models.
ALTER TABLE "CeoApiRateLimitBucket" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "CeoCommandDelivery" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "CeoEntityMembership" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "CeoEntityRegistry" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "CeoGlobalIdentity" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "CeoRolloutState" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "CeoUnifiedConversation" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- PostgreSQL truncates identifiers to 63 bytes. Use Prisma's deterministic
-- shortened names so migrate diff remains stable on a clean database.
ALTER INDEX "CeoEntityConversationLink_targetEntityId_localConversationId_id"
  RENAME TO "CeoEntityConversationLink_targetEntityId_localConversationI_idx";
ALTER INDEX "CeoUnifiedConversation_identityId_entityId_type_remoteUserId_ke"
  RENAME TO "CeoUnifiedConversation_identityId_entityId_type_remoteUserI_key";
