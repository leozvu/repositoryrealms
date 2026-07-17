/* Phase 0 — KHÔI PHỤC một schema từ file sao lưu JSON (dùng khi khẩn cấp).
   ⚠ NGUY HIỂM: ghi ĐÈ dữ liệu hiện có của schema đó. Chỉ dùng khi thật sự cần.
   Mặc định chạy THỬ (dry-run) chỉ in ra sẽ ghi gì; thêm --commit mới ghi thật.

   Chạy:  node scripts/restore-db.js <đường_dẫn_file.json> [--commit]
   VD:    node scripts/restore-db.js backups/20260717-0300/fretas.json --commit */
const fs = require('fs');
const path = require('path');
const { PrismaClient, Prisma } = require('@prisma/client');

const file = process.argv[2];
const commit = process.argv.includes('--commit');
if (!file) { console.error('Thiếu đường dẫn file backup. VD: node scripts/restore-db.js backups/.../fretas.json --commit'); process.exit(1); }

function baseUrl() {
  const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  const m = env.match(/^\s*DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
  if (!m) throw new Error('Không thấy DATABASE_URL trong .env');
  return m[1].trim();
}
const withSchema = (url, s) => (url.includes('?') ? `${url}&schema=${s}` : `${url}?schema=${s}`);
const delegate = name => name[0].toLowerCase() + name.slice(1);

// Thứ tự xóa/ghi theo phụ thuộc khóa ngoại: con trước cha. Dựa trên DMMF (model có quan hệ tới model
// khác thì phụ thuộc model đó). Ở đây dùng thứ tự ĐẢO của khai báo model + ghi theo thứ tự khai báo —
// đủ cho hầu hết trường hợp; nếu vướng FK, chạy lại hoặc khôi phục từng bảng.
(async () => {
  const dump = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { schema, data } = dump;
  console.log(`Khôi phục schema [${schema}] từ ${file} — ${commit ? 'GHI THẬT' : 'CHẠY THỬ (dry-run)'}`);
  const models = Prisma.dmmf.datamodel.models.map(m => m.name).filter(n => data[n]);
  for (const n of models) console.log(`  ${n}: ${data[n].length} dòng`);
  if (!commit) { console.log('\nĐây là chạy thử. Thêm --commit để ghi thật (SẼ XÓA + GHI ĐÈ schema này).'); return; }

  const prisma = new PrismaClient({ datasources: { db: { url: withSchema(baseUrl(), schema) } } });
  try {
    // Xóa theo thứ tự đảo, ghi theo thứ tự khai báo (cha trước con) để giảm vướng FK.
    for (const n of [...models].reverse()) { try { await prisma[delegate(n)].deleteMany(); } catch (e) { console.error(`  (bỏ qua xóa ${n}: ${e.message})`); } }
    for (const n of models) {
      if (!data[n].length) continue;
      await prisma[delegate(n)].createMany({ data: data[n], skipDuplicates: true });
      console.log(`  ✔ ghi ${data[n].length} dòng ${n}`);
    }
    console.log('\n✔ Khôi phục xong.');
  } finally { await prisma.$disconnect(); }
})().catch(e => { console.error(e); process.exit(1); });
