-- Reconcile the collaboration bridge for legacy ERP schemas that were
-- baselined in place. Fresh RepositoryRealms databases already contain these
-- tables, so every statement must remain safe to run more than once.

CREATE TABLE IF NOT EXISTS "CollaborationPresenceSession" (
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "surface" TEXT NOT NULL DEFAULT 'erp',
    "availability" TEXT NOT NULL DEFAULT 'available',
    "capabilities" TEXT NOT NULL DEFAULT '["chat"]',
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollaborationPresenceSession_pkey" PRIMARY KEY ("sessionId")
);

CREATE TABLE IF NOT EXISTS "CollaborationContactRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "conversationId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'chat',
    "sourceSurface" TEXT NOT NULL DEFAULT 'realm',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "message" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3),
    "actionAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollaborationContactRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CollaborationPresenceSession_userId_lastSeen_idx"
    ON "CollaborationPresenceSession"("userId", "lastSeen");
CREATE INDEX IF NOT EXISTS "CollaborationPresenceSession_lastSeen_idx"
    ON "CollaborationPresenceSession"("lastSeen");
CREATE UNIQUE INDEX IF NOT EXISTS "CollaborationContactRequest_idempotencyKey_key"
    ON "CollaborationContactRequest"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "CollaborationContactRequest_targetId_status_createdAt_idx"
    ON "CollaborationContactRequest"("targetId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "CollaborationContactRequest_requesterId_createdAt_idx"
    ON "CollaborationContactRequest"("requesterId", "createdAt");
CREATE INDEX IF NOT EXISTS "CollaborationContactRequest_expiresAt_idx"
    ON "CollaborationContactRequest"("expiresAt");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'CollaborationPresenceSession_userId_fkey'
          AND conrelid = '"CollaborationPresenceSession"'::regclass
    ) THEN
        ALTER TABLE "CollaborationPresenceSession"
            ADD CONSTRAINT "CollaborationPresenceSession_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'CollaborationContactRequest_requesterId_fkey'
          AND conrelid = '"CollaborationContactRequest"'::regclass
    ) THEN
        ALTER TABLE "CollaborationContactRequest"
            ADD CONSTRAINT "CollaborationContactRequest_requesterId_fkey"
            FOREIGN KEY ("requesterId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'CollaborationContactRequest_targetId_fkey'
          AND conrelid = '"CollaborationContactRequest"'::regclass
    ) THEN
        ALTER TABLE "CollaborationContactRequest"
            ADD CONSTRAINT "CollaborationContactRequest_targetId_fkey"
            FOREIGN KEY ("targetId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
