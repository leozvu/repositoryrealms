/* Seed v2.0: tạo tài khoản Giám đốc đầu tiên + 2 tài khoản demo.
   Chạy: npm run db:seed */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.user.count();
  if (count > 0) { console.log('Đã có người dùng — bỏ qua seed.'); return; }
  const mk = (pw) => bcrypt.hashSync(pw, 10);
  await prisma.user.createMany({
    data: [
      { email: 'giamdoc@agency.vn', name: 'Giám đốc', passwordHash: mk('admin123'), role: 'DIRECTOR', title: 'Founder / CEO', salary: 40000000 },
      { email: 'quanly@agency.vn', name: 'Trần Quốc Bảo', passwordHash: mk('quanly123'), role: 'MANAGER', title: 'Account Manager', salary: 20000000 },
      { email: 'nhanvien@agency.vn', name: 'Lê Thu Hà', passwordHash: mk('nhanvien123'), role: 'STAFF', title: 'Designer', salary: 16000000 },
    ],
  });
  console.log('Đã tạo 3 tài khoản:');
  console.log('  DIRECTOR: giamdoc@agency.vn / admin123');
  console.log('  MANAGER : quanly@agency.vn / quanly123');
  console.log('  STAFF   : nhanvien@agency.vn / nhanvien123');
  console.log('→ Đăng nhập Giám đốc rồi vào Cài đặt để import dữ liệu từ bản v1.');
}

main().finally(() => prisma.$disconnect());
