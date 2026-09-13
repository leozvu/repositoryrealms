CREATE TABLE "EventOutbox" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "deliveryKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payloadVersion" INTEGER NOT NULL DEFAULT 1,
    "payload" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 8,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventOutbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EventOutbox_occurrenceId_deliveryKey_key" ON "EventOutbox"("occurrenceId", "deliveryKey");
CREATE INDEX "EventOutbox_status_availableAt_idx" ON "EventOutbox"("status", "availableAt");
CREATE INDEX "EventOutbox_status_leaseUntil_idx" ON "EventOutbox"("status", "leaseUntil");
