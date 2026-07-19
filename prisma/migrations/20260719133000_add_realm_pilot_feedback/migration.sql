-- Phase 11: keep pilot feedback inside the existing ERP Ticket source of truth.
-- All columns are nullable except updatedAt, which is safely backfilled by its default.
ALTER TABLE "Ticket"
  ADD COLUMN "reporterId" TEXT,
  ADD COLUMN "source" TEXT,
  ADD COLUMN "feedbackType" TEXT,
  ADD COLUMN "feedbackSurface" TEXT,
  ADD COLUMN "feedbackContext" TEXT,
  ADD COLUMN "feedbackResponse" TEXT,
  ADD COLUMN "requestKey" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "Ticket_requestKey_key" ON "Ticket"("requestKey");
CREATE INDEX "Ticket_source_status_idx" ON "Ticket"("source", "status");
CREATE INDEX "Ticket_reporterId_createdAt_idx" ON "Ticket"("reporterId", "createdAt");
