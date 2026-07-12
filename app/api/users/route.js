import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { ROLES, isDirector, hasAny } from '@/lib/perm';

const cleanRoles = roles => {
  if (!Array.isArray(roles)) return null;
  const r = roles.filter(x => ROLES.includes(x));
  return r.length ? r : ['STAFF'];
};

// Tạo tài khoản — chỉ DIRECTOR (HR tạo hồ sơ qua Giám đốc cấp quyền sau)
export async function POST(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isDirector(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { email, name, password, roles, title, phone, salary, teamId } = await req.json();
  if (!email || !name || !password) return NextResponse.json({ error: 'Thiếu email / tên / mật khẩu' }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: 'Mật khẩu tối thiểu 6 ký tự' }, { status: 400 });
  const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (exists) return NextResponse.json({ error: 'Email đã tồn tại' }, { status: 400 });
  const finalRoles = cleanRoles(roles) || ['STAFF'];
  const row = await prisma.user.create({
    data: {
      email: email.toLowerCase().trim(), name,
      passwordHash: await bcrypt.hash(password, 10),
      role: finalRoles[0], roles: JSON.stringify(finalRoles),
      title: title || null, phone: phone || null, salary: +salary || 0, teamId: teamId || null,
    },
  });
  await prisma.auditLog.create({ data: { userId: user.id, userName: user.name, action: 'create', entity: 'users', refId: row.id, detail: `${row.name} [${finalRoles.join(',')}]` } });
  const { passwordHash, ...safe } = row;
  return NextResponse.json(safe);
}

// Cập nhật: DIRECTOR sửa tất cả (kể cả vai trò/lương/nhóm);
// HR sửa hồ sơ (tên, chức danh, sđt, lương, nhóm, trạng thái) — KHÔNG sửa vai trò;
// mỗi người tự sửa tên/sđt/mật khẩu của mình.
export async function PUT(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id, password, ...fields } = await req.json();
  const isSelf = id === user.id;
  const isHR = hasAny(user, ['HR']);
  if (!isDirector(user) && !isHR && !isSelf) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const data = {};
  const profileKeys = isDirector(user) || isHR ? ['name', 'title', 'phone', 'status'] : ['name', 'phone'];
  profileKeys.forEach(k => { if (fields[k] !== undefined) data[k] = fields[k]; });
  if ((isDirector(user) || isHR) && fields.salary !== undefined) data.salary = +fields.salary || 0;
  if ((isDirector(user) || isHR) && fields.teamId !== undefined) data.teamId = fields.teamId || null;
  if (isDirector(user) && fields.roles !== undefined) {
    const r = cleanRoles(fields.roles);
    if (r) { data.roles = JSON.stringify(r); data.role = r[0]; }
  }
  // v3.2: Giám đốc reset 2FA khi nhân sự mất điện thoại
  if (isDirector(user) && fields.reset2fa) data.totpSecret = null;
  if (password) {
    if (!isDirector(user) && !isSelf) return NextResponse.json({ error: 'Chỉ Giám đốc hoặc chính chủ đổi được mật khẩu' }, { status: 403 });
    if (password.length < 6) return NextResponse.json({ error: 'Mật khẩu tối thiểu 6 ký tự' }, { status: 400 });
    data.passwordHash = await bcrypt.hash(password, 10);
  }
  const row = await prisma.user.update({ where: { id }, data });
  await prisma.auditLog.create({ data: { userId: user.id, userName: user.name, action: 'update', entity: 'users', refId: id, detail: row.name } });
  const { passwordHash, ...safe } = row;
  return NextResponse.json(safe);
}
