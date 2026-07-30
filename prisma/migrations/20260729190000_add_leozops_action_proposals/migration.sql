-- LeozOps Sprint 1C: durable, evidence-bound proposal metadata.
-- This table cannot mutate Lead or any other business record and contains no PII.
CREATE TABLE "LeozOpsActionProposal" (
  "id" TEXT NOT NULL,
  "idempotencyKeyHash" TEXT NOT NULL,
  "correlationId" TEXT NOT NULL,
  "requesterFingerprint" TEXT NOT NULL,
  "briefId" TEXT NOT NULL,
  "sourceSnapshotId" TEXT NOT NULL,
  "signalId" TEXT NOT NULL,
  "signalType" TEXT NOT NULL,
  "actionType" TEXT NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "leadRefs" TEXT NOT NULL DEFAULT '[]',
  "evidenceHash" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'proposed',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeozOpsActionProposal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeozOpsActionProposal_idempotencyKeyHash_key"
ON "LeozOpsActionProposal"("idempotencyKeyHash");

CREATE UNIQUE INDEX "LeozOpsActionProposal_correlationId_key"
ON "LeozOpsActionProposal"("correlationId");

CREATE INDEX "LeozOpsActionProposal_requesterFingerprint_createdAt_idx"
ON "LeozOpsActionProposal"("requesterFingerprint", "createdAt");

CREATE INDEX "LeozOpsActionProposal_status_expiresAt_createdAt_idx"
ON "LeozOpsActionProposal"("status", "expiresAt", "createdAt");

CREATE INDEX "LeozOpsActionProposal_briefId_signalId_idx"
ON "LeozOpsActionProposal"("briefId", "signalId");
