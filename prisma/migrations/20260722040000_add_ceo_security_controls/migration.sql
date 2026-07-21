-- CEO-8: least-privilege service credentials and durable per-entity rate limits.
-- Existing API keys remain legacy ERP keys because scopes defaults to an empty array.
ALTER TABLE "ApiKey"
  ADD COLUMN "scopes" TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN "audience" TEXT,
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "rotatedAt" TIMESTAMP(3);

ALTER TABLE "CeoEntityRegistry"
  ADD COLUMN "serviceCredentialRef" TEXT,
  ADD COLUMN "serviceCredentialVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "serviceRotatedAt" TIMESTAMP(3);

-- SSO and HTTP service credentials must be provisioned as different secrets.
UPDATE "CeoEntityRegistry"
SET "serviceCredentialRef" = CASE "id"
  WHEN 'aim' THEN 'CEO_ENTITY_AIM_SERVICE_KEY'
  WHEN 'egoric' THEN 'CEO_ENTITY_EGORIC_SERVICE_KEY'
  WHEN 'vnecom' THEN 'CEO_ENTITY_VNECOM_SERVICE_KEY'
  WHEN 'egolive' THEN 'CEO_ENTITY_EGOLIVE_SERVICE_KEY'
  ELSE NULL
END;

CREATE INDEX "ApiKey_audience_active_idx" ON "ApiKey"("audience", "active");
CREATE INDEX "ApiKey_expiresAt_idx" ON "ApiKey"("expiresAt");

CREATE TABLE "CeoApiRateLimitBucket" (
  "bucketKey" TEXT NOT NULL,
  "apiKeyId" TEXT NOT NULL,
  "audience" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "requestCount" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CeoApiRateLimitBucket_pkey" PRIMARY KEY ("bucketKey"),
  CONSTRAINT "CeoApiRateLimitBucket_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CeoApiRateLimitBucket_apiKeyId_expiresAt_idx" ON "CeoApiRateLimitBucket"("apiKeyId", "expiresAt");
CREATE INDEX "CeoApiRateLimitBucket_audience_scope_windowStartedAt_idx" ON "CeoApiRateLimitBucket"("audience", "scope", "windowStartedAt");
CREATE INDEX "CeoApiRateLimitBucket_expiresAt_idx" ON "CeoApiRateLimitBucket"("expiresAt");
