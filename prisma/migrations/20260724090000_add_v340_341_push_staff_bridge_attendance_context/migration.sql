-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "checkInIp" TEXT,
ADD COLUMN     "checkInPlace" TEXT,
ADD COLUMN     "checkOutIp" TEXT,
ADD COLUMN     "checkOutPlace" TEXT,
ADD COLUMN     "contextNote" TEXT;

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "device" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSentAt" TIMESTAMP(3),

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CeoStaffLink" (
    "id" TEXT NOT NULL,
    "personKey" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "localUserEmail" TEXT NOT NULL,
    "localRole" TEXT NOT NULL DEFAULT 'STAFF',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CeoStaffLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CeoStaffSsoCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "personKey" TEXT NOT NULL,
    "sourceEntity" TEXT NOT NULL,
    "targetEntity" TEXT NOT NULL,
    "localUserEmail" TEXT NOT NULL,
    "redirectPath" TEXT NOT NULL DEFAULT '/dashboard',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CeoStaffSsoCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "CeoStaffLink_entityId_status_idx" ON "CeoStaffLink"("entityId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CeoStaffLink_personKey_entityId_key" ON "CeoStaffLink"("personKey", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "CeoStaffSsoCode_codeHash_key" ON "CeoStaffSsoCode"("codeHash");

-- CreateIndex
CREATE INDEX "CeoStaffSsoCode_targetEntity_expiresAt_consumedAt_idx" ON "CeoStaffSsoCode"("targetEntity", "expiresAt", "consumedAt");

