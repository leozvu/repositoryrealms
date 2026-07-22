-- CEO-7: grant the least-privilege Realm federation read scope to existing Director memberships.
-- No Realm, presence, task, message or business record is centralized by this migration.
UPDATE "CeoEntityMembership"
SET "scopes" = ((COALESCE(NULLIF("scopes", ''), '[]')::jsonb || '["realm.federation.read"]'::jsonb)::text),
    "recordVersion" = "recordVersion" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'active'
  AND "localRole" = 'DIRECTOR'
  AND NOT (COALESCE(NULLIF("scopes", ''), '[]')::jsonb ? 'realm.federation.read');
