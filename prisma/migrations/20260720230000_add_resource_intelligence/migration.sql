-- Phase 2: additive estimate revision history for Resource Intelligence.
-- Actual hours continue to come from canonical ERP TimeLog rows; no parallel time store is created.
CREATE TABLE "WorkEstimateRevision" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "estimateHours" DOUBLE PRECISION NOT NULL,
  "previousHours" DOUBLE PRECISION NOT NULL,
  "workType" TEXT NOT NULL,
  "complexity" TEXT NOT NULL,
  "reasonCode" TEXT,
  "note" TEXT,
  "receiptId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkEstimateRevision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkEstimateRevision_receiptId_key" ON "WorkEstimateRevision"("receiptId");
CREATE INDEX "WorkEstimateRevision_taskId_createdAt_idx" ON "WorkEstimateRevision"("taskId", "createdAt");
CREATE INDEX "WorkEstimateRevision_actorId_createdAt_idx" ON "WorkEstimateRevision"("actorId", "createdAt");
CREATE INDEX "WorkEstimateRevision_kind_createdAt_idx" ON "WorkEstimateRevision"("kind", "createdAt");
CREATE INDEX "WorkEstimateRevision_workType_complexity_createdAt_idx" ON "WorkEstimateRevision"("workType", "complexity", "createdAt");

ALTER TABLE "WorkEstimateRevision"
  ADD CONSTRAINT "WorkEstimateRevision_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
