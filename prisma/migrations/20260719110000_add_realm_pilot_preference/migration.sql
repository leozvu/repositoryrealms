-- Phase 10 stores only the employee's preferred workspace surface.
-- Business records remain in the existing ERP tables.
ALTER TABLE "User"
ADD COLUMN "workspacePreference" TEXT NOT NULL DEFAULT 'auto';

CREATE INDEX "User_status_userType_workspacePreference_idx"
ON "User"("status", "userType", "workspacePreference");
