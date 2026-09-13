import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';

// Each Playwright project mutates its own record; retries restore only that row.
export const CI_REALM_TASKS = Object.freeze({
  'desktop-chromium': { id: 'realm_e2e_task_desktop', title: 'Kiểm tra văn phòng thật · desktop' },
  'mobile-chromium': { id: 'realm_e2e_task_mobile', title: 'Kiểm tra văn phòng thật · mobile' },
});

export function assertCiDatabase(value) {
  const url = new URL(value || 'missing:');
  if (!['postgresql:', 'postgres:'].includes(url.protocol)
    || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || !/^\/crmegoric_ci(?:_[a-z0-9_]+)?$/.test(url.pathname)) {
    throw new Error('CI fixtures require an explicit loopback PostgreSQL database named crmegoric_ci (or crmegoric_ci_<suffix>).');
  }
  return value;
}

export async function seedCiFixtures(env = process.env) {
  const url = assertCiDatabase(env.CI_TEST_DATABASE_URL);
  const password = env.REALM_PILOT_E2E_PASSWORD;
  if (!password || password.length < 16) throw new Error('Set a disposable REALM_PILOT_E2E_PASSWORD of at least 16 characters.');
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const identities = [
      { id: 'realm_e2e_director', email: env.REALM_PILOT_E2E_EMAIL || 'director@realm.test', name: 'Realm QA Director', role: 'DIRECTOR' },
      { id: 'realm_e2e_staff', email: 'staff@realm.test', name: 'Realm QA Staff', role: 'STAFF' },
      { id: 'realm_e2e_other', email: 'other@realm.test', name: 'Realm QA Colleague', role: 'STAFF' },
    ];
    for (const person of identities) {
      const data = { ...person, passwordHash, roles: JSON.stringify([person.role]), status: 'active', workspacePreference: 'erp', loginFails: 0, lockedUntil: null };
      await db.user.upsert({ where: { id: person.id }, create: data, update: data });
    }
    await db.setting.upsert({ where: { id: 1 }, create: { id: 1, json: JSON.stringify({ company: 'Realm QA', realmPilot: { mode: 'open', defaultSurface: 'erp' } }) }, update: {} });
    await db.project.upsert({ where: { id: 'realm_e2e_project' }, create: { id: 'realm_e2e_project', name: 'Văn phòng 3D · QA', status: 'active' }, update: {} });
    await db.task.upsert({ where: { id: 'realm_e2e_task' }, create: { id: 'realm_e2e_task', title: 'Kiểm tra văn phòng thật', projectId: 'realm_e2e_project', assigneeId: 'realm_e2e_staff', status: 'todo' }, update: {} });
    for (const fixture of Object.values(CI_REALM_TASKS)) {
      const data = { ...fixture, projectId: 'realm_e2e_project', assigneeId: 'realm_e2e_director', status: 'todo', checklist: '[]' };
      await db.task.upsert({ where: { id: fixture.id }, create: data, update: data });
    }
    await db.leave.upsert({ where: { id: 'realm_e2e_other_leave' }, create: { id: 'realm_e2e_other_leave', userId: 'realm_e2e_other', from: '2026-10-05', to: '2026-10-06', status: 'pending' }, update: { status: 'pending' } });
    console.log('CI fixtures ready: three disposable identities, one project, three tasks and one leave. No global deletion performed.');
  } finally { await db.$disconnect(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await seedCiFixtures();
