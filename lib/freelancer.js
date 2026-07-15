// v3.11: Bảo vệ cổng freelancer — mọi endpoint /api/freelancer/* đi qua đây.
// Kiểm: đúng là freelancer + tài khoản chưa hết hạn (tái kiểm từ DB, không tin session cũ).
import { prisma } from './prisma.js';
import { currentUser } from './auth.js';

// Trả { user, projectIds } nếu hợp lệ; ném lỗi có .status nếu không.
export async function freelancerGuard() {
  const sess = await currentUser();
  if (!sess) { const e = new Error('unauthorized'); e.status = 401; throw e; }
  const u = await prisma.user.findUnique({ where: { id: sess.id } });
  if (!u || u.status !== 'active' || u.userType !== 'freelancer') { const e = new Error('forbidden'); e.status = 403; throw e; }
  if (u.accessUntil && u.accessUntil < new Date().toISOString().slice(0, 10)) {
    const e = new Error('Tài khoản đã hết hạn theo dự án — liên hệ quản lý để gia hạn'); e.status = 403; throw e;
  }
  const mem = await prisma.projectMember.findMany({ where: { userId: u.id } });
  return { user: u, projectIds: mem.map(m => m.projectId) };
}
