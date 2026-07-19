-- Phase 6: create commands need to replay the created ERP record without
-- storing business payload in the technical receipt.
ALTER TABLE "RealmActionReceipt"
  ADD COLUMN "resultId" TEXT,
  ADD COLUMN "payloadHash" TEXT;
