/* Phase 0 — SAO LƯU TOÀN BỘ dữ liệu 5 doanh nghiệp ra file JSON (không cần pg_dump).
   Supabase free tier KHÔNG có backup tự động → mất DB = 5 công ty mất sổ sách. Script này
   dump mọi bảng của cả 5 schema ra backups/<timestamp>/<schema>.json, giữ 14 bản gần nhất.

   Chạy:  node scripts/backup-db.js   (hoặc  npm run backup)
   Lịch:  Windows Task Scheduler gọi backup-db.ps1 hằng ngày (xem HUONG-DAN-BACKUP.md).
   ⚠ backups/ nằm trong .gitignore — chứa dữ liệu thật, KHÔNG commit. Nên copy thêm ra ổ cloud. */
const fs = require('fs');
const path = require('path');
const { PrismaClient, Prisma } = require('@prisma/client');

const SCHEMAS = [
  { schema: 'public', company: 'AIm Agency' },
  { schema: 'egoric', company: 'Egoric Agency' },
  { schema: 'vnecom', company: 'Vnecom LLC' },
  { schema: 'fretas', company: 'Fretas (XNK)' },
  { schema: 'egolive', company: 'Egolive (livestream)' },
];
const KEEP = 14; // số bản sao lưu giữ lại

function baseUrl() {
  const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  const m = env.match(/^\s*DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
  if (!m) throw new Error('Không thấy DATABASE_URL trong .env');
  return m[1].trim();
}
const withSchema = (url, s) => (url.includes('?') ? `${url}&schema=${s}` : `${url}?schema=${s}`);
// 'StockLot' -> 'stockLot' (tên delegate của Prisma client)
const delegate = name => name[0].toLowerCase() + name.slice(1);

function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function dumpSchema(base, schema) {
  const prisma = new PrismaClient({ datasources: { db: { url: withSchema(base, schema) } } });
  const out = {};
  let rows = 0;
  try {
    for (const model of Prisma.dmmf.datamodel.models) {
      const d = delegate(model.name);
      if (!prisma[d]) continue;
      try {
        const data = await prisma[d].findMany();
        out[model.name] = data;
        rows += data.length;
      } catch {
        // Bảng chưa tồn tại ở schema này (phân hệ chưa bật / schema chưa đồng bộ) → bỏ qua, không hỏng cả bản sao lưu.
        out[model.name] = [];
      }
    }
  } finally {
    await prisma.$disconnect();
  }
  return { out, rows };
}

function rotate(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir).filter(f => /^\d{8}-\d{6}$/.test(f)).sort();
  const drop = entries.slice(0, Math.max(0, entries.length - KEEP));
  for (const f of drop) fs.rmSync(path.join(dir, f), { recursive: true, force: true });
  if (drop.length) console.log(`  ↻ dọn ${drop.length} bản sao lưu cũ (giữ ${KEEP} bản gần nhất)`);
}

(async () => {
  const base = baseUrl();
  const root = path.join(__dirname, '..', 'backups');
  const dir = path.join(root, stamp());
  fs.mkdirSync(dir, { recursive: true });
  let grand = 0, ok = 0;
  for (const { schema, company } of SCHEMAS) {
    try {
      const { out, rows } = await dumpSchema(base, schema);
      fs.writeFileSync(path.join(dir, `${schema}.json`), JSON.stringify({ schema, company, at: new Date().toISOString(), data: out }));
      console.log(`✔ ${company} [${schema}]: ${rows} dòng`);
      grand += rows; ok++;
    } catch (e) {
      console.error(`✖ ${company} [${schema}]: ${e.message}`);
    }
  }
  rotate(root);
  console.log(`\n✔ Sao lưu ${ok}/${SCHEMAS.length} schema · ${grand} dòng → ${dir}`);
  if (ok < SCHEMAS.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
