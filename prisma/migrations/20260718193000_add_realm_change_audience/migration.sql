-- Phase 4: audience-scoped wake-up events for ERP/Realm cross-surface inboxes.
-- Nullable preserves every existing company-wide invalidation event.
ALTER TABLE "RealmChangeEvent" ADD COLUMN "audienceUserId" TEXT;

CREATE INDEX "RealmChangeEvent_audienceUserId_createdAt_id_idx"
ON "RealmChangeEvent"("audienceUserId", "createdAt", "id");
