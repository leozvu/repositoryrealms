-- Phase 3: durable, payload-free invalidation feed between ERP and Realm.
CREATE TABLE "RealmChangeEvent" (
    "id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityId" TEXT,
    "actorId" TEXT,
    "domains" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RealmChangeEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RealmChangeEvent_createdAt_id_idx" ON "RealmChangeEvent"("createdAt", "id");
CREATE INDEX "RealmChangeEvent_resource_createdAt_idx" ON "RealmChangeEvent"("resource", "createdAt");
