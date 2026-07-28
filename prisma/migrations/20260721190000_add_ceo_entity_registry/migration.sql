-- CEO-2: additive central entity registry.
-- credentialRef stores only the name of a server-side environment variable. Raw credentials
-- must never be persisted in this table or returned by the registry API.
CREATE TABLE "CeoEntityRegistry" (
  "id" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "baseUrl" TEXT NOT NULL,
  "businessProfile" TEXT NOT NULL,
  "capabilities" TEXT NOT NULL DEFAULT '[]',
  "environment" TEXT NOT NULL DEFAULT 'production',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'unverified',
  "credentialRef" TEXT NOT NULL,
  "credentialVersion" INTEGER NOT NULL DEFAULT 1,
  "contractVersion" TEXT NOT NULL DEFAULT '1.0.0',
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "recordVersion" INTEGER NOT NULL DEFAULT 1,
  "lastSyncAttemptAt" TIMESTAMP(3),
  "lastSuccessfulSyncAt" TIMESTAMP(3),
  "consecutiveErrors" INTEGER NOT NULL DEFAULT 0,
  "lastErrorCode" TEXT,
  "circuitState" TEXT NOT NULL DEFAULT 'closed',
  "circuitOpenedAt" TIMESTAMP(3),
  "circuitRetryAt" TIMESTAMP(3),
  "rotatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CeoEntityRegistry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CeoEntityRegistry_baseUrl_key" ON "CeoEntityRegistry"("baseUrl");
CREATE INDEX "CeoEntityRegistry_enabled_status_idx" ON "CeoEntityRegistry"("enabled", "status");
CREATE INDEX "CeoEntityRegistry_circuitState_circuitRetryAt_idx" ON "CeoEntityRegistry"("circuitState", "circuitRetryAt");
CREATE INDEX "CeoEntityRegistry_environment_idx" ON "CeoEntityRegistry"("environment");

-- CEO-0 remains HOLD, therefore every production entity starts disabled and unverified.
-- Capabilities are intended contract profiles; live discovery will verify them before enablement.
INSERT INTO "CeoEntityRegistry" (
  "id", "displayName", "baseUrl", "businessProfile", "capabilities", "environment",
  "enabled", "status", "credentialRef", "contractVersion", "schemaVersion"
) VALUES
  ('aim', 'AIm Agency', 'https://agency-erp-mu.vercel.app', 'agency', '["finance","crm","delivery","support","people"]', 'production', false, 'unverified', 'CEO_ENTITY_AIM_API_KEY', '1.0.0', 1),
  ('egoric', 'Egoric Agency', 'https://erp-egoric.vercel.app', 'agency', '["finance","crm","delivery","support","people"]', 'production', false, 'unverified', 'CEO_ENTITY_EGORIC_API_KEY', '1.0.0', 1),
  ('vnecom', 'Vnecom LLC', 'https://erp-vnecom.vercel.app', 'entity-specific', '["finance","crm","delivery","support","people"]', 'production', false, 'unverified', 'CEO_ENTITY_VNECOM_API_KEY', '1.0.0', 1),
  ('egolive', 'Egolive', 'https://erp-egolive.vercel.app', 'livestream', '["finance","delivery","people","livestream"]', 'production', false, 'unverified', 'CEO_ENTITY_EGOLIVE_API_KEY', '1.0.0', 1);
