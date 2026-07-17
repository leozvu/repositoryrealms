/* Bootstrap một doanh nghiệp MỚI (không phá dữ liệu như seed):
   - Upsert Setting (tên công ty + preset phân hệ)
   - Tạo tài khoản Giám đốc nếu chưa có người dùng nào
   - Tạo Kênh chung nếu chưa có
   Chạy: COMPANY="Tên Cty" DIR_EMAIL=a@b.c DIR_PASS=xxx DIR_NAME="Tên GĐ" MODULES=export node prisma/bootstrap.js
   MODULES: 'agency' | 'export' | 'livestream' (tên preset) — bỏ trống = để mặc định (agency). */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

// Giữ đồng bộ với lib/modules.js MODULE_PRESETS (bootstrap chạy CommonJS nên khai lại ở đây).
const PRESETS = {
  agency: ['sales', 'services', 'support', 'delivery', 'commissions', 'procurement', 'freelancers', 'recruitment', 'reviews', 'analytics'],
  export: ['sales', 'procurement', 'recruitment', 'export'],
  livestream: ['commissions', 'freelancers', 'reviews', 'livestream'],
};

async function main() {
  const company = process.env.COMPANY || 'Công ty mới';
  const email = (process.env.DIR_EMAIL || 'giamdoc@congty.vn').toLowerCase();
  const pass = process.env.DIR_PASS || 'doimatkhau';
  const name = process.env.DIR_NAME || 'Giám đốc';
  const modulesPreset = process.env.MODULES; // 'export' | 'livestream' | 'agency' | undefined

  const row = await prisma.setting.findUnique({ where: { id: 1 } });
  const base = row ? JSON.parse(row.json) : {};
  const patch = { company };
  if (modulesPreset && PRESETS[modulesPreset]) patch.modules = PRESETS[modulesPreset];
  const json = JSON.stringify({ ...base, ...patch });
  await prisma.setting.upsert({ where: { id: 1 }, create: { id: 1, json }, update: { json } });
  if (patch.modules) console.log(`✔ Preset phân hệ "${modulesPreset}": ${patch.modules.join(', ')}`);

  const count = await prisma.user.count();
  let director;
  if (count === 0) {
    director = await prisma.user.create({
      data: { email, name, passwordHash: bcrypt.hashSync(pass, 10), role: 'DIRECTOR', roles: JSON.stringify(['DIRECTOR']), title: 'Giám đốc' },
    });
    console.log(`✔ Tạo Giám đốc: ${email}`);
  } else {
    director = await prisma.user.findFirst();
    console.log(`• Đã có ${count} người dùng — bỏ qua tạo tài khoản.`);
  }

  const general = await prisma.conversation.findFirst({ where: { type: 'general' } });
  if (!general && director) {
    const conv = await prisma.conversation.create({ data: { type: 'general', name: 'Kênh chung' } });
    await prisma.convMember.create({ data: { convId: conv.id, userId: director.id } });
    console.log('✔ Tạo Kênh chung');
  }
  console.log(`✔ Bootstrap xong cho "${company}"`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
