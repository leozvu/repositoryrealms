/* Đồng bộ capabilities từ từng entity vào registry của CEO Terminal.
   Gọi GET {baseUrl}/api/ceo/v1/capabilities bằng service key, lấy domains=true → registry.capabilities.
   ENV: DATABASE_URL (ceoportal) · SECRETS_FILE (file "SERVICE_KEY <id> <raw>" mỗi dòng) */
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const secrets = Object.fromEntries(fs.readFileSync(process.env.SECRETS_FILE, 'utf8').split('\n')
  .filter(l => l.startsWith('SERVICE_KEY')).map(l => { const [, id, raw] = l.trim().split(/\s+/); return [id, raw]; }));

const entities = await prisma.ceoEntityRegistry.findMany({ where: { enabled: true } });
for (const e of entities) {
  const key = secrets[e.id];
  if (!key) { console.log(`- ${e.id}: không có service key trong file → bỏ qua`); continue; }
  try {
    const r = await fetch(`${e.baseUrl}/api/ceo/v1/capabilities`, {
      headers: { Authorization: `Bearer ${key}`, 'x-ceo-entity-id': e.id },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) { console.log(`- ${e.id}: HTTP ${r.status}`); continue; }
    const j = await r.json();
    const domains = Object.entries(j?.capabilities?.domains || {}).filter(([, on]) => on).map(([d]) => d);
    await prisma.ceoEntityRegistry.update({ where: { id: e.id }, data: { capabilities: JSON.stringify(domains), status: 'ready', lastSuccessfulSyncAt: new Date(), consecutiveErrors: 0 } });
    console.log(`✓ ${e.id}: [${domains.join(', ')}]`);
  } catch (err) {
    console.log(`- ${e.id}: lỗi ${String(err).slice(0, 80)}`);
  }
}
await prisma.$disconnect();
