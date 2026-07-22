-- Phase 5: durable idempotency receipts for the constrained Realm -> ERP command bridge.
-- The table stores technical metadata only, never Task/Lead payloads.
CREATE TABLE "RealmActionReceipt" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "fromState" TEXT NOT NULL,
  "toState" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RealmActionReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RealmActionReceipt_idempotencyKey_key"
ON "RealmActionReceipt"("idempotencyKey");

CREATE INDEX "RealmActionReceipt_userId_createdAt_idx"
ON "RealmActionReceipt"("userId", "createdAt");

CREATE INDEX "RealmActionReceipt_resource_entityId_createdAt_idx"
ON "RealmActionReceipt"("resource", "entityId", "createdAt");
