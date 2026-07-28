import crypto from 'node:crypto';
import fs from 'node:fs';

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

function requiredArgument(name) {
  const value = argument(name);
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

function parseEnvironment(file) {
  const values = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (value.startsWith('"')) {
      try {
        value = JSON.parse(value);
      } catch {
        value = value.slice(1, -1);
      }
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function databaseMetadata(raw) {
  const url = new URL(raw);
  const schema = url.searchParams.get('schema') || 'public';
  const fingerprintMaterial = `${url.hostname}|${url.port || '5432'}|${url.pathname}|${schema}`;
  return {
    schema,
    provider: url.hostname.includes('supabase')
      ? 'supabase-postgres'
      : url.hostname.includes('neon')
        ? 'neon-postgres'
        : 'postgres',
    fingerprint: crypto.createHash('sha256').update(fingerprintMaterial).digest('hex').slice(0, 24),
    pooled: url.port === '6543' || url.searchParams.get('pgbouncer') === 'true',
  };
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
}

function roleCounts(users) {
  const counts = {};
  for (const user of users) {
    const configured = parseJson(user.roles, []);
    const roles = configured.length ? configured : user.role ? [user.role] : [];
    for (const role of new Set(roles)) counts[role] = (counts[role] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

const envFile = requiredArgument('env-file');
const entityId = requiredArgument('entity');
const project = requiredArgument('project');
const expectedSchema = requiredArgument('expected-schema');
const environment = parseEnvironment(envFile);

if (!environment.DATABASE_URL) throw new Error('DATABASE_URL is missing from the Vercel production environment.');

const runtimeDatabase = databaseMetadata(environment.DATABASE_URL);
const directDatabase = environment.DIRECT_URL ? databaseMetadata(environment.DIRECT_URL) : null;
if (runtimeDatabase.schema !== expectedSchema) {
  throw new Error(`Schema mismatch for ${entityId}: expected ${expectedSchema}, received ${runtimeDatabase.schema}.`);
}

process.env.DATABASE_URL = environment.DATABASE_URL;
if (environment.DIRECT_URL) process.env.DIRECT_URL = environment.DIRECT_URL;

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

try {
  const snapshot = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');

    const [identity, tables, settingRow, users, keys, migrationTable] = await Promise.all([
      tx.$queryRawUnsafe('SELECT current_database() AS database, current_schema() AS schema'),
      tx.$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' ORDER BY table_name"),
      tx.setting.findUnique({ where: { id: 1 } }),
      tx.user.findMany({ select: { status: true, role: true, roles: true, userType: true } }),
      tx.apiKey.findMany({ select: { name: true, roles: true, active: true, lastUsed: true } }),
      tx.$queryRawUnsafe("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = '_prisma_migrations') AS present"),
    ]);

    let migrations = { tablePresent: false, applied: 0, latest: null, lastFinishedAt: null };
    if (migrationTable[0]?.present) {
      const rows = await tx.$queryRawUnsafe(
        'SELECT migration_name, finished_at FROM "_prisma_migrations" WHERE rolled_back_at IS NULL AND finished_at IS NOT NULL ORDER BY finished_at DESC',
      );
      migrations = {
        tablePresent: true,
        applied: rows.length,
        latest: rows[0]?.migration_name || null,
        lastFinishedAt: rows[0]?.finished_at ? new Date(rows[0].finished_at).toISOString() : null,
      };
    }

    const settings = parseJson(settingRow?.json, {});
    const masterKeys = keys.filter((key) => key.name === 'master-dashboard');
    const lastUsed = masterKeys
      .filter((key) => key.lastUsed)
      .sort((left, right) => right.lastUsed.getTime() - left.lastUsed.getTime())[0]?.lastUsed;

    return {
      database: {
        provider: runtimeDatabase.provider,
        schema: runtimeDatabase.schema,
        directSchema: directDatabase?.schema || null,
        runtimeDirectSchemaMatch: !directDatabase || runtimeDatabase.schema === directDatabase.schema,
        fingerprint: runtimeDatabase.fingerprint,
        pooledRuntime: runtimeDatabase.pooled,
        identitySchema: identity[0]?.schema || null,
        tableCount: tables.length,
      },
      migration: migrations,
      company: settings.company || null,
      modules: Array.isArray(settings.modules) ? settings.modules : null,
      roleLabelsConfigured: Boolean(settings.roleLabels && Object.keys(settings.roleLabels).length),
      accounts: {
        total: users.length,
        active: users.filter((user) => user.status === 'active').length,
        inactive: users.filter((user) => user.status !== 'active').length,
        employee: users.filter((user) => user.userType !== 'freelancer').length,
        freelancer: users.filter((user) => user.userType === 'freelancer').length,
        roleCounts: roleCounts(users),
      },
      portalAccess: {
        apiKeysTotal: keys.length,
        apiKeysActive: keys.filter((key) => key.active).length,
        masterDashboardKeyPresent: masterKeys.length > 0,
        masterDashboardKeyActive: masterKeys.some((key) => key.active),
        masterDashboardKeyLastUsedAt: lastUsed?.toISOString() || null,
      },
    };
  }, { isolationLevel: 'RepeatableRead', timeout: 30_000 });

  process.stdout.write(`${JSON.stringify({
    entityId,
    project,
    ...snapshot,
    envChecks: {
      nextAuthUrlPresent: Boolean(environment.NEXTAUTH_URL),
      nextAuthSecretPresent: Boolean(environment.NEXTAUTH_SECRET),
      databaseUrlPresent: true,
      directUrlPresent: Boolean(environment.DIRECT_URL),
    },
  })}\n`);
} finally {
  await prisma.$disconnect();
}
