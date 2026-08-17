-- Egolive becomes a department inside the Egoric tenant. LiveSession remains
-- the single source of truth from planning through reconciliation.
ALTER TABLE "LiveSession"
  ADD COLUMN "department" TEXT NOT NULL DEFAULT 'egolive',
  ADD COLUMN "title" TEXT,
  ADD COLUMN "scheduleStatus" TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  ADD COLUMN "callTime" TEXT,
  ADD COLUMN "studio" TEXT,
  ADD COLUMN "campaign" TEXT,
  ADD COLUMN "operatorId" TEXT,
  ADD COLUMN "moderatorId" TEXT,
  ADD COLUMN "productCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "targetGmv" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "briefUrl" TEXT,
  ADD COLUMN "rehearsalAt" TEXT,
  ADD COLUMN "streamUrl" TEXT;

CREATE INDEX "LiveSession_date_scheduleStatus_idx" ON "LiveSession"("date", "scheduleStatus");
CREATE INDEX "LiveSession_date_studio_idx" ON "LiveSession"("date", "studio");
