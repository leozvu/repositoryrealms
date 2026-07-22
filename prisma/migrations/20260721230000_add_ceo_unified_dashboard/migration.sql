-- CEO-4: sanitized, read-only aggregate snapshot cache.
-- Entity business records stay in the owning databases; only the validated CEO v1
-- snapshot envelope is stored in the Portal control plane.
CREATE TABLE "CeoEntitySnapshotCache" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "contractVersion" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "sourceAsOf" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "freshUntil" TIMESTAMP(3) NOT NULL,
    "staleUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CeoEntitySnapshotCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CeoEntitySnapshotCache_entityId_key"
ON "CeoEntitySnapshotCache"("entityId");

CREATE INDEX "CeoEntitySnapshotCache_freshUntil_idx"
ON "CeoEntitySnapshotCache"("freshUntil");

CREATE INDEX "CeoEntitySnapshotCache_staleUntil_idx"
ON "CeoEntitySnapshotCache"("staleUntil");

ALTER TABLE "CeoEntitySnapshotCache"
ADD CONSTRAINT "CeoEntitySnapshotCache_entityId_fkey"
FOREIGN KEY ("entityId") REFERENCES "CeoEntityRegistry"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
