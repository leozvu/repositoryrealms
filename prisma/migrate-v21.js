/* Nâng cấp v2.0 → v2.1: chuyển role đơn sang roles đa vai trò
   + tạo tài khoản demo cho các vai trò mới. Chạy: node prisma/migrate-v21.js */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

const MAP = { DIRECTOR: ['DIRECTOR'], MANAGER: ['PM', 'AM', 'ACCOUNTANT'], STAFF: ['STAFF'] };

async function main() {
  const users = await prisma.user.findMany();
  for (const u of users) {
    let roles;
    try { roles = JSON.parse(u.roles); } catch { roles = null; }
    if (!Array.isArray(roles) || !roles.length || (roles.length === 1 && roles[0] === 'STAFF' && u.role !== 'STAFF')) {
      roles = MAP[u.role] || ['STAFF'];
      await prisma.user.update({ where: { id: u.id }, data: { roles: JSON.stringify(roles) } });
      console.log(`  ${u.email}: ${u.role} → [${roles.join(', ')}]`);
    }
  }
  const demos = [
    ['ketoan@agency.vn', 'Kế toán Demo', 'ketoan123', ['ACCOUNTANT'], 'Kế toán'],
    ['hr@agency.vn', 'HR Demo', 'hr123456', ['HR'], 'HR Manager'],
    ['pm@agency.vn', 'PM Demo', 'pm123456', ['PM'], 'Project Manager'],
    ['am@agency.vn', 'Sale Demo', 'am123456', ['AM'], 'Account Manager'],
    ['truongnhom@agency.vn', 'Trưởng nhóm Demo', 'lead1234', ['LEAD', 'STAFF'], 'Design Lead'],
  ];
  for (const [email, name, pw, roles, title] of demos) {
    const exists = await prisma.user.findUnique({ where: { email } });
    if (!exists) {
      await prisma.user.create({ data: { email, name, passwordHash: bcrypt.hashSync(pw, 10), role: 'STAFF', roles: JSON.stringify(roles), title, salary: 18000000 } });
      console.log(`  + demo: ${email} / ${pw} [${roles.join(',')}]`);
    }
  }
  // Nhóm mẫu: Design do Trưởng nhóm Demo dẫn, Lê Thu Hà là thành viên
  const teamCount = await prisma.team.count();
  if (!teamCount) {
    const lead = await prisma.user.findUnique({ where: { email: 'truongnhom@agency.vn' } });
    const team = await prisma.team.create({ data: { name: 'Nhóm Design', leadId: lead?.id || null } });
    if (lead) await prisma.user.update({ where: { id: lead.id }, data: { teamId: team.id } });
    const ha = await prisma.user.findFirst({ where: { OR: [{ email: 'nhanvien@agency.vn' }, { email: 'ha@agency.vn' }] } });
    if (ha) await prisma.user.update({ where: { id: ha.id }, data: { teamId: team.id } });
    console.log('  + Nhóm Design (lead: Trưởng nhóm Demo)');
  }
  console.log('Migrate v2.1 xong.');
}
main().finally(() => prisma.$disconnect());
