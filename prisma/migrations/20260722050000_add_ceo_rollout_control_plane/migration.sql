-- CEO-9: fail-closed rollout rings, evidence and immutable transition receipts.
-- This migration affects only the CEO Portal control-plane database.
CREATE TABLE "CeoRolloutState" (
  "entityId" TEXT NOT NULL,
  "currentRing" TEXT NOT NULL DEFAULT 'local_staging',
  "status" TEXT NOT NULL DEFAULT 'hold',
  "recordVersion" INTEGER NOT NULL DEFAULT 1,
  "lastTransitionAt" TIMESTAMP(3),
  "lastReconciledAt" TIMESTAMP(3),
  "lastRollbackAt" TIMESTAMP(3),
  "lastReceiptId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CeoRolloutState_pkey" PRIMARY KEY ("entityId"),
  CONSTRAINT "CeoRolloutState_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "CeoEntityRegistry"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "CeoRolloutEvidence" (
  "id" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "ring" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "recordedById" TEXT NOT NULL,
  "recordedByName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CeoRolloutEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CeoRolloutEvidence_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "CeoRolloutState"("entityId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "CeoRolloutReceipt" (
  "id" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "fromRing" TEXT NOT NULL,
  "toRing" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "evidenceDigest" TEXT NOT NULL,
  "approvalId" TEXT,
  "correlationId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdByName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CeoRolloutReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CeoRolloutReceipt_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "CeoRolloutState"("entityId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "CeoRolloutState_status_currentRing_idx" ON "CeoRolloutState"("status", "currentRing");
CREATE UNIQUE INDEX "CeoRolloutEvidence_entityId_ring_kind_checksum_key" ON "CeoRolloutEvidence"("entityId", "ring", "kind", "checksum");
CREATE INDEX "CeoRolloutEvidence_entityId_ring_expiresAt_idx" ON "CeoRolloutEvidence"("entityId", "ring", "expiresAt");
CREATE INDEX "CeoRolloutEvidence_expiresAt_idx" ON "CeoRolloutEvidence"("expiresAt");
CREATE UNIQUE INDEX "CeoRolloutReceipt_correlationId_key" ON "CeoRolloutReceipt"("correlationId");
CREATE INDEX "CeoRolloutReceipt_entityId_createdAt_idx" ON "CeoRolloutReceipt"("entityId", "createdAt");
CREATE INDEX "CeoRolloutReceipt_decision_createdAt_idx" ON "CeoRolloutReceipt"("decision", "createdAt");

INSERT INTO "CeoRolloutState" ("entityId", "currentRing", "status", "recordVersion", "createdAt", "updatedAt")
SELECT "id", 'local_staging', 'hold', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "CeoEntityRegistry"
ON CONFLICT ("entityId") DO NOTHING;
