-- Phase 12 rollback rehearsal only.
-- DATA LOSS: this removes every Realm profile, reward config, budget, and Gold entry.
-- The staging gate requires two explicit confirmation tokens before executing it.

BEGIN;

DROP TABLE "RealmGoldEntry";
DROP TABLE "RealmRewardBudget";
DROP TABLE "RealmQuestConfig";
DROP TABLE "RealmProfile";

DO $$
BEGIN
  IF to_regclass('"_prisma_migrations"') IS NOT NULL THEN
    DELETE FROM "_prisma_migrations"
    WHERE migration_name = '20260717190000_add_realm_reward_governance';
  END IF;
END $$;

COMMIT;
