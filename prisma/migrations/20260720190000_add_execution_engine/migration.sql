-- Phase 1: Unified Work Graph on the canonical ERP Task table.
-- Additive only; no Task, Project or Realm data is copied.
ALTER TABLE "Task"
  ADD COLUMN "queuePosition" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "workVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "workType" TEXT,
  ADD COLUMN "complexity" TEXT,
  ADD COLUMN "blockReason" TEXT,
  ADD COLUMN "blockedAt" TIMESTAMP(3),
  ADD COLUMN "waitingReason" TEXT,
  ADD COLUMN "escalationLevel" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "escalatedAt" TIMESTAMP(3),
  ADD COLUMN "parentTaskId" TEXT,
  ADD COLUMN "mergedIntoTaskId" TEXT,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "completedAt" TIMESTAMP(3);

CREATE TABLE "WorkQueueState" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "wipLimit" INTEGER NOT NULL DEFAULT 5,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkQueueState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkItemEvent" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "fromState" TEXT NOT NULL,
  "toState" TEXT NOT NULL,
  "reasonCode" TEXT,
  "relatedTaskId" TEXT,
  "receiptId" TEXT NOT NULL,
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkItemEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkQueueState_ownerId_key" ON "WorkQueueState"("ownerId");
CREATE UNIQUE INDEX "WorkItemEvent_receiptId_key" ON "WorkItemEvent"("receiptId");
CREATE INDEX "Task_assigneeId_status_queuePosition_idx" ON "Task"("assigneeId", "status", "queuePosition");
CREATE INDEX "Task_parentTaskId_idx" ON "Task"("parentTaskId");
CREATE INDEX "Task_mergedIntoTaskId_idx" ON "Task"("mergedIntoTaskId");
CREATE INDEX "WorkItemEvent_taskId_occurredAt_idx" ON "WorkItemEvent"("taskId", "occurredAt");
CREATE INDEX "WorkItemEvent_actorId_occurredAt_idx" ON "WorkItemEvent"("actorId", "occurredAt");
CREATE INDEX "WorkItemEvent_action_occurredAt_idx" ON "WorkItemEvent"("action", "occurredAt");
CREATE INDEX "WorkItemEvent_relatedTaskId_idx" ON "WorkItemEvent"("relatedTaskId");

ALTER TABLE "Task"
  ADD CONSTRAINT "Task_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Task_mergedIntoTaskId_fkey" FOREIGN KEY ("mergedIntoTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkItemEvent"
  ADD CONSTRAINT "WorkItemEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
