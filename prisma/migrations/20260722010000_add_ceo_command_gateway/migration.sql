-- CEO-5: Portal delivery metadata and target-entity canonical command receipts.
-- Portal delivery rows intentionally contain no business payload.
CREATE TABLE "CeoCommandDelivery" (
  "id" TEXT NOT NULL,
  "identityId" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "idempotencyKeyHash" TEXT NOT NULL,
  "correlationId" TEXT NOT NULL,
  "command" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'dispatching',
  "attemptCount" INTEGER NOT NULL DEFAULT 1,
  "targetReceiptId" TEXT,
  "targetResource" TEXT,
  "targetRecordId" TEXT,
  "targetReceiptAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastAttemptAt" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CeoCommandDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CeoEntityCommandReceipt" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "correlationId" TEXT NOT NULL,
  "actorSubject" TEXT NOT NULL,
  "targetEntityId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "recordId" TEXT,
  "resultCount" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CeoEntityCommandReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CeoCommandDelivery_idempotencyKeyHash_key" ON "CeoCommandDelivery"("idempotencyKeyHash");
CREATE UNIQUE INDEX "CeoCommandDelivery_correlationId_key" ON "CeoCommandDelivery"("correlationId");
CREATE INDEX "CeoCommandDelivery_identityId_createdAt_idx" ON "CeoCommandDelivery"("identityId", "createdAt");
CREATE INDEX "CeoCommandDelivery_entityId_status_createdAt_idx" ON "CeoCommandDelivery"("entityId", "status", "createdAt");
CREATE INDEX "CeoCommandDelivery_status_updatedAt_idx" ON "CeoCommandDelivery"("status", "updatedAt");

CREATE UNIQUE INDEX "CeoEntityCommandReceipt_idempotencyKey_key" ON "CeoEntityCommandReceipt"("idempotencyKey");
CREATE UNIQUE INDEX "CeoEntityCommandReceipt_correlationId_key" ON "CeoEntityCommandReceipt"("correlationId");
CREATE INDEX "CeoEntityCommandReceipt_actorSubject_createdAt_idx" ON "CeoEntityCommandReceipt"("actorSubject", "createdAt");
CREATE INDEX "CeoEntityCommandReceipt_targetEntityId_action_createdAt_idx" ON "CeoEntityCommandReceipt"("targetEntityId", "action", "createdAt");
CREATE INDEX "CeoEntityCommandReceipt_resource_recordId_idx" ON "CeoEntityCommandReceipt"("resource", "recordId");

ALTER TABLE "CeoCommandDelivery"
ADD CONSTRAINT "CeoCommandDelivery_identityId_fkey"
FOREIGN KEY ("identityId") REFERENCES "CeoGlobalIdentity"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CeoCommandDelivery"
ADD CONSTRAINT "CeoCommandDelivery_entityId_fkey"
FOREIGN KEY ("entityId") REFERENCES "CeoEntityRegistry"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing CEO-3 Director memberships receive only the four CEO-5 allowlisted scopes.
-- normalizeCeoScopes de-duplicates values when these rows are read.
UPDATE "CeoEntityMembership"
SET "scopes" = ("scopes"::jsonb || '["command.task.create","command.status.request","command.announcement.send","command.approval.request"]'::jsonb)::text,
    "recordVersion" = "recordVersion" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'active' AND "localRole" = 'DIRECTOR';
