import CredentialsProvider from 'next-auth/providers/credentials';
import { getServerSession } from 'next-auth';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma.js';
import { rolesOf } from './perm.js';
import { verifyTotp } from './totp.js';

// v3.13: chống dò mật khẩu. Trước đây authorize() so bcrypt thẳng, không đếm số lần
// sai → có thể thử mật khẩu không giới hạn trên cả 3 URL production.
// Khóa theo TÀI KHOẢN (không theo IP) vì serverless không giữ được state giữa các instance.
const MAX_FAILS = 8;
const LOCK_MINUTES = 15;

async function noteFail(user) {
  const fails = (user.loginFails || 0) + 1;
  const lock = fails >= MAX_FAILS;
  await prisma.user.update({
    where: { id: user.id },
    data: {
      loginFails: lock ? 0 : fails,
      lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60000) : user.lockedUntil,
    },
  }).catch(() => {});
  if (lock) {
    await prisma.auditLog.create({
      data: {
        userId: user.id, userName: user.name, action: 'login_locked', entity: 'users', refId: user.id,
        detail: `Nhập sai ${MAX_FAILS} lần liên tiếp — khóa đăng nhập ${LOCK_MINUTES} phút`,
      },
    }).catch(() => {});
  }
}

async function noteSuccess(user) {
  if (!user.loginFails && !user.lockedUntil) return;
  await prisma.user.update({ where: { id: user.id }, data: { loginFails: 0, lockedUntil: null } }).catch(() => {});
}

export const authOptions = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: { email: {}, password: {}, otp: {} },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await prisma.user.findUnique({ where: { email: credentials.email.toLowerCase().trim() } });
        if (!user || user.status !== 'active') return null;
        // v3.13: đang bị khóa tạm vì nhập sai quá nhiều → chặn, không thèm so mật khẩu
        if (user.lockedUntil && user.lockedUntil > new Date()) return null;
        const ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok) { await noteFail(user); return null; }
        // v3.11: freelancer hết hạn (accessUntil đã qua) → chặn đăng nhập
        if (user.accessUntil && user.accessUntil < new Date().toISOString().slice(0, 10)) return null;
        // v3.2: 2FA — user đã bật thì bắt buộc mã TOTP đúng
        // Mã sai cũng tính là lần thử hỏng, nếu không 2FA thành chỗ dò không giới hạn.
        if (user.totpSecret && !verifyTotp(user.totpSecret, credentials.otp)) { await noteFail(user); return null; }
        await noteSuccess(user);
        return { id: user.id, email: user.email, name: user.name, role: user.role, roles: rolesOf(user), teamId: user.teamId, userType: user.userType };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) { token.role = user.role; token.roles = user.roles; token.teamId = user.teamId; token.uid = user.id; token.userType = user.userType; }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.uid;
      session.user.role = token.role;
      session.user.roles = rolesOf({ roles: token.roles, role: token.role });
      session.user.teamId = token.teamId || null;
      session.user.userType = token.userType || 'employee';
      return session;
    },
  },
};

// Dùng trong API route: trả về {id, name, email, role} hoặc null
export async function currentUser() {
  const session = await getServerSession(authOptions);
  return session?.user || null;
}
