-- Additive only: existing manually copied clients cannot be linked reliably.
ALTER TABLE "Client" ADD COLUMN "originSource" TEXT;
ALTER TABLE "Client" ADD COLUMN "originCampaign" TEXT;
ALTER TABLE "Lead" ADD COLUMN "clientId" TEXT;
ALTER TABLE "Lead" ADD COLUMN "convertedAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN "convertedById" TEXT;
CREATE UNIQUE INDEX "Lead_clientId_key" ON "Lead"("clientId");
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
