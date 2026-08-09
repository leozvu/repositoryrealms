-- Phase 14: dedicated, allowlisted LeozOps unassigned-task command boundary.
-- Preview performs no insert here. Only explicit approval metadata and the
-- execution/rollback receipt ledger are persisted.

CREATE TABLE "LeozOpsTaskCommandApproval" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetEntityId" TEXT NOT NULL,
    "approvedBySubject" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "previewFingerprint" TEXT NOT NULL,
    "subjectCommandId" TEXT,
    "approvalCredentialId" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "consumedByCommandId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeozOpsTaskCommandApproval_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeozOpsTaskCommand" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "targetEntityId" TEXT NOT NULL,
    "actorSubject" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "previewFingerprint" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "taskStateFingerprint" TEXT NOT NULL,
    "executionResultFingerprint" TEXT NOT NULL,
    "executionCredentialId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "rollbackReceiptId" TEXT,
    "rollbackIdempotencyKey" TEXT,
    "rollbackCorrelationId" TEXT,
    "rollbackActorSubject" TEXT,
    "rollbackRequestFingerprint" TEXT,
    "rollbackPreviewFingerprint" TEXT,
    "rollbackApprovalId" TEXT,
    "rollbackResultFingerprint" TEXT,
    "rollbackCredentialId" TEXT,
    "rolledBackAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeozOpsTaskCommand_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeozOpsTaskCommandApproval_idempotencyKey_key" ON "LeozOpsTaskCommandApproval"("idempotencyKey");
CREATE UNIQUE INDEX "LeozOpsTaskCommandApproval_correlationId_key" ON "LeozOpsTaskCommandApproval"("correlationId");
CREATE INDEX "LeozOpsTaskCommandApproval_kind_targetEntityId_expiresAt_idx" ON "LeozOpsTaskCommandApproval"("kind", "targetEntityId", "expiresAt");
CREATE INDEX "LeozOpsTaskCommandApproval_subjectCommandId_kind_expiresAt_idx" ON "LeozOpsTaskCommandApproval"("subjectCommandId", "kind", "expiresAt");
CREATE INDEX "LeozOpsTaskCommandApproval_approvalCredentialId_approvedAt_idx" ON "LeozOpsTaskCommandApproval"("approvalCredentialId", "approvedAt");

CREATE UNIQUE INDEX "LeozOpsTaskCommand_idempotencyKey_key" ON "LeozOpsTaskCommand"("idempotencyKey");
CREATE UNIQUE INDEX "LeozOpsTaskCommand_correlationId_key" ON "LeozOpsTaskCommand"("correlationId");
CREATE UNIQUE INDEX "LeozOpsTaskCommand_approvalId_key" ON "LeozOpsTaskCommand"("approvalId");
CREATE UNIQUE INDEX "LeozOpsTaskCommand_taskId_key" ON "LeozOpsTaskCommand"("taskId");
CREATE UNIQUE INDEX "LeozOpsTaskCommand_rollbackReceiptId_key" ON "LeozOpsTaskCommand"("rollbackReceiptId");
CREATE UNIQUE INDEX "LeozOpsTaskCommand_rollbackIdempotencyKey_key" ON "LeozOpsTaskCommand"("rollbackIdempotencyKey");
CREATE UNIQUE INDEX "LeozOpsTaskCommand_rollbackCorrelationId_key" ON "LeozOpsTaskCommand"("rollbackCorrelationId");
CREATE UNIQUE INDEX "LeozOpsTaskCommand_rollbackApprovalId_key" ON "LeozOpsTaskCommand"("rollbackApprovalId");
CREATE INDEX "LeozOpsTaskCommand_targetEntityId_status_createdAt_idx" ON "LeozOpsTaskCommand"("targetEntityId", "status", "createdAt");
CREATE INDEX "LeozOpsTaskCommand_actorSubject_createdAt_idx" ON "LeozOpsTaskCommand"("actorSubject", "createdAt");
CREATE INDEX "LeozOpsTaskCommand_executionCredentialId_createdAt_idx" ON "LeozOpsTaskCommand"("executionCredentialId", "createdAt");
CREATE INDEX "LeozOpsTaskCommand_rollbackCredentialId_rolledBackAt_idx" ON "LeozOpsTaskCommand"("rollbackCredentialId", "rolledBackAt");
