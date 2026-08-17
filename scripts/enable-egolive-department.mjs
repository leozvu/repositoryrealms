/*
  Idempotent target-side activation for the Egoric database.

  This script does not delete the legacy Egolive schema and never copies data
  implicitly. Run against EGORIC_DATABASE_URL. Dry-run is the default; pass
  --apply only after backup/restore verification.
*/
import { PrismaClient } from '@prisma/client';
import { MODULE_PRESETS } from '../lib/modules.js';

const apply = process.argv.includes('--apply');
const databaseUrl = String(process.env.EGORIC_DATABASE_URL || '').trim();
if (!databaseUrl) throw new Error('Thiếu EGORIC_DATABASE_URL.');

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

try {
  const [setting, existingTeam] = await Promise.all([
    prisma.setting.findUnique({ where: { id: 1 } }),
    prisma.team.findFirst({ where: { name: 'Phòng Livestream Egolive' } }),
  ]);
  let config = {};
  try { config = setting?.json ? JSON.parse(setting.json) : {}; } catch {}
  const modules = [...new Set([...(Array.isArray(config.modules) ? config.modules : MODULE_PRESETS.agency.mods), ...MODULE_PRESETS.egoric.mods])];
  const nextConfig = {
    ...config,
    modules,
    departments: [
      ...(Array.isArray(config.departments) ? config.departments.filter(item => item?.id !== 'egolive') : []),
      { id: 'egolive', name: 'Phòng Livestream Egolive', module: 'livestream', status: 'active' },
    ],
  };
  const plan = {
    mode: apply ? 'apply' : 'dry-run',
    company: config.company || 'Egoric Agency',
    addModule: !Array.isArray(config.modules) || !config.modules.includes('livestream'),
    createTeam: !existingTeam,
    moduleCount: modules.length,
  };
  console.log(JSON.stringify(plan, null, 2));
  if (!apply) process.exitCode = 0;
  else {
    await prisma.$transaction(async tx => {
      await tx.setting.upsert({
        where: { id: 1 },
        create: { id: 1, json: JSON.stringify(nextConfig) },
        update: { json: JSON.stringify(nextConfig) },
      });
      if (!existingTeam) await tx.team.create({ data: { name: 'Phòng Livestream Egolive' } });
    });
    console.log('✔ Egolive đã được kích hoạt như một phòng ban của Egoric.');
  }
} finally {
  await prisma.$disconnect();
}
