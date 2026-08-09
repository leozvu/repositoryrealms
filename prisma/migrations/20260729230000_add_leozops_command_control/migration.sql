-- LeozOps Sprints 1E-1J: separate command intent, append-only events,
-- durable execution/reconciliation jobs, runtime control and shared quotas.

CREATE TABLE "LeozOpsCommandIntent" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "idempotencyKeyHash" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "targetRef" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "expectedStateHash" TEXT NOT NULL,
    "preview" TEXT NOT NULL,
    "confirmationTokenHash" TEXT NOT NULL,
    "repositoryIdempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'prepared',
    "workVersion" INTEGER NOT NULL DEFAULT 1,
    "preparedById" TEXT NOT NULL,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "repositoryReceiptId" TEXT,
    "lastErrorCode" TEXT,
    "budgetConsumedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LeozOpsCommandIntent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeozOpsCommandEvent" (
    "id" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "actorId" TEXT,
    "reasonCode" TEXT,
    "receiptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeozOpsCommandEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeozOpsCommandJob" (
    "id" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'execute_reconcile',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lockToken" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LeozOpsCommandJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeozOpsRuntimeControl" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "executionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "killSwitchActive" BOOLEAN NOT NULL DEFAULT true,
    "dailyActionLimit" INTEGER NOT NULL DEFAULT 5,
    "circuitState" TEXT NOT NULL DEFAULT 'closed',
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "circuitOpenedAt" TIMESTAMP(3),
    "circuitRetryAt" TIMESTAMP(3),
    "recordVersion" INTEGER NOT NULL DEFAULT 1,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LeozOpsRuntimeControl_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeozOpsQuotaBucket" (
    "bucketKey" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "subjectHash" TEXT NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LeozOpsQuotaBucket_pkey" PRIMARY KEY ("bucketKey")
);

CREATE UNIQUE INDEX "LeozOpsCommandIntent_idempotencyKeyHash_key" ON "LeozOpsCommandIntent"("idempotencyKeyHash");
CREATE UNIQUE INDEX "LeozOpsCommandIntent_correlationId_key" ON "LeozOpsCommandIntent"("correlationId");
CREATE UNIQUE INDEX "LeozOpsCommandIntent_repositoryIdempotencyKey_key" ON "LeozOpsCommandIntent"("repositoryIdempotencyKey");
CREATE INDEX "LeozOpsCommandIntent_proposalId_createdAt_idx" ON "LeozOpsCommandIntent"("proposalId", "createdAt");
CREATE INDEX "LeozOpsCommandIntent_status_expiresAt_createdAt_idx" ON "LeozOpsCommandIntent"("status", "expiresAt", "createdAt");
CREATE INDEX "LeozOpsCommandIntent_preparedById_createdAt_idx" ON "LeozOpsCommandIntent"("preparedById", "createdAt");
CREATE INDEX "LeozOpsCommandIntent_repositoryReceiptId_idx" ON "LeozOpsCommandIntent"("repositoryReceiptId");

CREATE UNIQUE INDEX "LeozOpsCommandEvent_intentId_sequence_key" ON "LeozOpsCommandEvent"("intentId", "sequence");
CREATE INDEX "LeozOpsCommandEvent_status_createdAt_idx" ON "LeozOpsCommandEvent"("status", "createdAt");
CREATE INDEX "LeozOpsCommandEvent_receiptId_idx" ON "LeozOpsCommandEvent"("receiptId");

CREATE UNIQUE INDEX "LeozOpsCommandJob_lockToken_key" ON "LeozOpsCommandJob"("lockToken");
CREATE UNIQUE INDEX "LeozOpsCommandJob_intentId_kind_key" ON "LeozOpsCommandJob"("intentId", "kind");
CREATE INDEX "LeozOpsCommandJob_status_runAt_createdAt_idx" ON "LeozOpsCommandJob"("status", "runAt", "createdAt");
CREATE INDEX "LeozOpsCommandJob_lockedAt_idx" ON "LeozOpsCommandJob"("lockedAt");

CREATE INDEX "LeozOpsQuotaBucket_scope_windowStartedAt_idx" ON "LeozOpsQuotaBucket"("scope", "windowStartedAt");
CREATE INDEX "LeozOpsQuotaBucket_subjectHash_expiresAt_idx" ON "LeozOpsQuotaBucket"("subjectHash", "expiresAt");
CREATE INDEX "LeozOpsQuotaBucket_expiresAt_idx" ON "LeozOpsQuotaBucket"("expiresAt");

ALTER TABLE "LeozOpsCommandEvent" ADD CONSTRAINT "LeozOpsCommandEvent_intentId_fkey"
  FOREIGN KEY ("intentId") REFERENCES "LeozOpsCommandIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeozOpsCommandJob" ADD CONSTRAINT "LeozOpsCommandJob_intentId_fkey"
  FOREIGN KEY ("intentId") REFERENCES "LeozOpsCommandIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
