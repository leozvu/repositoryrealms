-- Phase 12: additive Realm reward governance schema.
-- This migration intentionally creates new tables only. It does not rewrite
-- User, Task, or any existing ERP/CRM data.

DO $$
BEGIN
  IF to_regclass('"User"') IS NULL OR to_regclass('"Task"') IS NULL THEN
    RAISE EXCEPTION 'Realm migration requires existing "User" and "Task" tables in the selected schema';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "RealmProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "realmClass" TEXT NOT NULL DEFAULT 'Realm Builder',
    "color" TEXT NOT NULL DEFAULT '#3b8061',
    "streakDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RealmProfile_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RealmProfile_streakDays_check" CHECK ("streakDays" >= 0)
);

CREATE TABLE IF NOT EXISTS "RealmQuestConfig" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "gold" INTEGER NOT NULL DEFAULT 0,
    "renown" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "configuredById" TEXT,
    "configuredAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RealmQuestConfig_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RealmQuestConfig_gold_check" CHECK ("gold" >= 0),
    CONSTRAINT "RealmQuestConfig_renown_check" CHECK ("renown" >= 0),
    CONSTRAINT "RealmQuestConfig_version_check" CHECK ("version" >= 1),
    CONSTRAINT "RealmQuestConfig_status_check" CHECK ("status" IN ('draft', 'pending', 'approved', 'rejected'))
);

CREATE TABLE IF NOT EXISTS "RealmRewardBudget" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "goldCap" INTEGER NOT NULL DEFAULT 140,
    "perUserGoldCap" INTEGER NOT NULL DEFAULT 45,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "configuredById" TEXT,
    "configuredAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RealmRewardBudget_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RealmRewardBudget_period_check" CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    CONSTRAINT "RealmRewardBudget_caps_check" CHECK ("goldCap" > 0 AND "perUserGoldCap" > 0 AND "perUserGoldCap" <= "goldCap"),
    CONSTRAINT "RealmRewardBudget_version_check" CHECK ("version" >= 1),
    CONSTRAINT "RealmRewardBudget_status_check" CHECK ("status" IN ('draft', 'pending', 'approved', 'rejected'))
);

CREATE TABLE IF NOT EXISTS "RealmGoldEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "renown" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RealmGoldEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RealmGoldEntry_amount_check" CHECK ("amount" <> 0),
    CONSTRAINT "RealmGoldEntry_renown_check" CHECK ("renown" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "RealmProfile_userId_key" ON "RealmProfile"("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "RealmQuestConfig_taskId_key" ON "RealmQuestConfig"("taskId");
CREATE INDEX IF NOT EXISTS "RealmQuestConfig_status_idx" ON "RealmQuestConfig"("status");
CREATE INDEX IF NOT EXISTS "RealmQuestConfig_configuredById_idx" ON "RealmQuestConfig"("configuredById");
CREATE INDEX IF NOT EXISTS "RealmQuestConfig_approvedById_idx" ON "RealmQuestConfig"("approvedById");

CREATE UNIQUE INDEX IF NOT EXISTS "RealmRewardBudget_period_key" ON "RealmRewardBudget"("period");
CREATE INDEX IF NOT EXISTS "RealmRewardBudget_status_idx" ON "RealmRewardBudget"("status");
CREATE INDEX IF NOT EXISTS "RealmRewardBudget_configuredById_idx" ON "RealmRewardBudget"("configuredById");
CREATE INDEX IF NOT EXISTS "RealmRewardBudget_approvedById_idx" ON "RealmRewardBudget"("approvedById");

CREATE UNIQUE INDEX IF NOT EXISTS "RealmGoldEntry_idempotencyKey_key" ON "RealmGoldEntry"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "RealmGoldEntry_userId_createdAt_idx" ON "RealmGoldEntry"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "RealmGoldEntry_sourceType_sourceId_idx" ON "RealmGoldEntry"("sourceType", "sourceId");
CREATE UNIQUE INDEX IF NOT EXISTS "RealmGoldEntry_userId_type_sourceType_sourceId_key"
  ON "RealmGoldEntry"("userId", "type", "sourceType", "sourceId");

-- The full staging baseline already contains Prisma indexes and foreign keys.
-- Conditional hardening keeps this migration valid for both a fresh baseline
-- and an older ERP database receiving Realm additively.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RealmProfile_streakDays_check' AND conrelid = '"RealmProfile"'::regclass) THEN
    ALTER TABLE "RealmProfile" ADD CONSTRAINT "RealmProfile_streakDays_check" CHECK ("streakDays" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RealmQuestConfig_gold_check' AND conrelid = '"RealmQuestConfig"'::regclass) THEN
    ALTER TABLE "RealmQuestConfig" ADD CONSTRAINT "RealmQuestConfig_gold_check" CHECK ("gold" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RealmQuestConfig_renown_check' AND conrelid = '"RealmQuestConfig"'::regclass) THEN
    ALTER TABLE "RealmQuestConfig" ADD CONSTRAINT "RealmQuestConfig_renown_check" CHECK ("renown" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RealmQuestConfig_version_check' AND conrelid = '"RealmQuestConfig"'::regclass) THEN
    ALTER TABLE "RealmQuestConfig" ADD CONSTRAINT "RealmQuestConfig_version_check" CHECK ("version" >= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RealmQuestConfig_status_check' AND conrelid = '"RealmQuestConfig"'::regclass) THEN
    ALTER TABLE "RealmQuestConfig" ADD CONSTRAINT "RealmQuestConfig_status_check" CHECK ("status" IN ('draft', 'pending', 'approved', 'rejected'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RealmRewardBudget_period_check' AND conrelid = '"RealmRewardBudget"'::regclass) THEN
    ALTER TABLE "RealmRewardBudget" ADD CONSTRAINT "RealmRewardBudget_period_check" CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RealmRewardBudget_caps_check' AND conrelid = '"RealmRewardBudget"'::regclass) THEN
    ALTER TABLE "RealmRewardBudget" ADD CONSTRAINT "RealmRewardBudget_caps_check" CHECK ("goldCap" > 0 AND "perUserGoldCap" > 0 AND "perUserGoldCap" <= "goldCap");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RealmRewardBudget_version_check' AND conrelid = '"RealmRewardBudget"'::regclass) THEN
    ALTER TABLE "RealmRewardBudget" ADD CONSTRAINT "RealmRewardBudget_version_check" CHECK ("version" >= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RealmRewardBudget_status_check' AND conrelid = '"RealmRewardBudget"'::regclass) THEN
    ALTER TABLE "RealmRewardBudget" ADD CONSTRAINT "RealmRewardBudget_status_check" CHECK ("status" IN ('draft', 'pending', 'approved', 'rejected'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RealmGoldEntry_amount_check' AND conrelid = '"RealmGoldEntry"'::regclass) THEN
    ALTER TABLE "RealmGoldEntry" ADD CONSTRAINT "RealmGoldEntry_amount_check" CHECK ("amount" <> 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RealmGoldEntry_renown_check' AND conrelid = '"RealmGoldEntry"'::regclass) THEN
    ALTER TABLE "RealmGoldEntry" ADD CONSTRAINT "RealmGoldEntry_renown_check" CHECK ("renown" >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RealmProfile_userId_fkey' AND conrelid = '"RealmProfile"'::regclass) THEN
    ALTER TABLE "RealmProfile" ADD CONSTRAINT "RealmProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RealmQuestConfig_taskId_fkey' AND conrelid = '"RealmQuestConfig"'::regclass) THEN
    ALTER TABLE "RealmQuestConfig" ADD CONSTRAINT "RealmQuestConfig_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RealmQuestConfig_configuredById_fkey' AND conrelid = '"RealmQuestConfig"'::regclass) THEN
    ALTER TABLE "RealmQuestConfig" ADD CONSTRAINT "RealmQuestConfig_configuredById_fkey" FOREIGN KEY ("configuredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RealmQuestConfig_approvedById_fkey' AND conrelid = '"RealmQuestConfig"'::regclass) THEN
    ALTER TABLE "RealmQuestConfig" ADD CONSTRAINT "RealmQuestConfig_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RealmRewardBudget_configuredById_fkey' AND conrelid = '"RealmRewardBudget"'::regclass) THEN
    ALTER TABLE "RealmRewardBudget" ADD CONSTRAINT "RealmRewardBudget_configuredById_fkey" FOREIGN KEY ("configuredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RealmRewardBudget_approvedById_fkey' AND conrelid = '"RealmRewardBudget"'::regclass) THEN
    ALTER TABLE "RealmRewardBudget" ADD CONSTRAINT "RealmRewardBudget_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RealmGoldEntry_userId_fkey' AND conrelid = '"RealmGoldEntry"'::regclass) THEN
    ALTER TABLE "RealmGoldEntry" ADD CONSTRAINT "RealmGoldEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
