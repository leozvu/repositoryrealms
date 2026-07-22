-- Phase 0: additive evidence/governance foundation.
-- No ERP record is copied and no collection is activated by this migration.
CREATE TABLE "WorkEvidenceEvent" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "subjectType" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "sourceClass" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "actorId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confidence" TEXT NOT NULL DEFAULT 'unrated',
  "provenance" TEXT NOT NULL,
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "parentEventId" TEXT,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "policyVersion" TEXT NOT NULL DEFAULT '1.0.0',
  "retentionUntil" TIMESTAMP(3),
  CONSTRAINT "WorkEvidenceEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EvidenceReviewRequest" (
  "id" TEXT NOT NULL,
  "evidenceEventId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "decidedById" TEXT,
  "decisionCode" TEXT,
  "decisionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  CONSTRAINT "EvidenceReviewRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EvidencePolicySnapshot" (
  "id" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "shadowMode" BOOLEAN NOT NULL DEFAULT true,
  "contractHash" TEXT NOT NULL,
  "policy" TEXT NOT NULL,
  "createdById" TEXT,
  "approvedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  CONSTRAINT "EvidencePolicySnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkEvidenceEvent_idempotencyKey_key" ON "WorkEvidenceEvent"("idempotencyKey");
CREATE INDEX "WorkEvidenceEvent_subjectType_subjectId_occurredAt_idx" ON "WorkEvidenceEvent"("subjectType", "subjectId", "occurredAt");
CREATE INDEX "WorkEvidenceEvent_actorId_occurredAt_idx" ON "WorkEvidenceEvent"("actorId", "occurredAt");
CREATE INDEX "WorkEvidenceEvent_sourceClass_eventType_occurredAt_idx" ON "WorkEvidenceEvent"("sourceClass", "eventType", "occurredAt");
CREATE INDEX "WorkEvidenceEvent_retentionUntil_idx" ON "WorkEvidenceEvent"("retentionUntil");
CREATE INDEX "EvidenceReviewRequest_evidenceEventId_createdAt_idx" ON "EvidenceReviewRequest"("evidenceEventId", "createdAt");
CREATE INDEX "EvidenceReviewRequest_requestedById_status_createdAt_idx" ON "EvidenceReviewRequest"("requestedById", "status", "createdAt");
CREATE INDEX "EvidenceReviewRequest_status_createdAt_idx" ON "EvidenceReviewRequest"("status", "createdAt");
CREATE UNIQUE INDEX "EvidencePolicySnapshot_version_key" ON "EvidencePolicySnapshot"("version");
CREATE INDEX "EvidencePolicySnapshot_status_createdAt_idx" ON "EvidencePolicySnapshot"("status", "createdAt");

ALTER TABLE "EvidenceReviewRequest"
  ADD CONSTRAINT "EvidenceReviewRequest_evidenceEventId_fkey"
  FOREIGN KEY ("evidenceEventId") REFERENCES "WorkEvidenceEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
