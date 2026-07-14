import CredentialsProvider from 'next-auth/providers/credentials';
import { getServerSession } from 'next-auth';
import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import { rolesOf } from './perm';
import { verifyTotp } from './totp';

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
        const ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok) return null;
        // v3.11: freelancer hết hạn (accessUntil đã qua) → chặn đăng nhập
        if (user.accessUntil && user.accessUntil < new Date().toISOString().slice(0, 10)) return null;
        // v3.2: 2FA — user đã bật thì bắt buộc mã TOTP đúng
        if (user.totpSecret && !verifyTotp(user.totpSecret, credentials.otp)) return null;
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
