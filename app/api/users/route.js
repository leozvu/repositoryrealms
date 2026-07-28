import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { ROLES, isDirector, hasAny } from '@/lib/perm';

// v3.16: trả null = không gửi roles (không đổi) · [] = có gửi nhưng rỗng (nơi gọi phải báo lỗi).
// Bản cũ trả ['STAFF'] khi rỗng → bỏ tick hết vai trò là tài khoản ÂM THẦM tụt xuống Nhân viên,
// không báo gì. Đã xảy ra thật trên Egoric: 6 tài khoản (CEO, Marketing Lead, Account…) mất
// hết vai trò về STAFF sau vài lượt sửa, không ai biết cho tới khi Leoz thấy lạ.
const cleanRoles = roles => {
  if (!Array.isArray(roles)) return null;
  return roles.filter(x => ROLES.includes(x));
};

// Tạo tài khoản — DIRECTOR + HR tạo nhân viên; HR/PM/LEAD tạo được FREELANCER (v3.11)
//
// v3.15: HR TẠO ĐƯỢC NHÂN VIÊN. Trước đây chỉ Giám đốc tạo được, HR chỉ tạo được freelancer
// — mà tuyển người xong mở tài khoản chính là việc lõi của HR, nên HR đứng hình phải đi nhờ
// Giám đốc từng người một. Giao diện cũng chỉ hiện nút "Tạo tài khoản" cho Giám đốc, nên lỗi
// này im lặng: HR không thấy nút, không biết là mình đáng lẽ phải làm được.
export async function POST(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  const body = await req.json();
  const { email, name, password, roles, title, phone, birthday, salary, teamId } = body;
  const isFL = body.userType === 'freelancer';
  const canCreate = isFL ? hasAny(user, ['HR', 'PM', 'LEAD']) : hasAny(user, ['HR']); // hasAny luôn cho Giám đốc qua
  if (!canCreate) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!email || !name || !password) return NextResponse.json({ error: 'Thiếu email / tên / mật khẩu' }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: 'Mật khẩu tối thiểu 6 ký tự' }, { status: 400 });
  const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (exists) return NextResponse.json({ error: 'Email đã tồn tại' }, { status: 400 });
  // Freelancer luôn là vai trò FREELANCER (không được cấp quyền nhân viên)
  const asked = cleanRoles(roles); // null = không gửi → mặc định Nhân viên · [] = gửi rỗng → lỗi
  if (asked && !asked.length && !isFL) {
    return NextResponse.json({ error: 'Phải chọn ít nhất một vai trò' }, { status: 400 });
  }
  const finalRoles = isFL ? ['FREELANCER'] : (asked || ['STAFF']);
  // v3.15: CHẶN LEO THANG — chỉ Giám đốc mới cấp được vai trò Giám đốc.
  // Người tạo tài khoản là người đặt mật khẩu đầu tiên, nên tạo được tài khoản vai trò gì
  // là tự đăng nhập vào đó và có quyền đó. Không có chốt này thì HR tự phong mình làm Giám đốc.
  if (!isDirector(user) && finalRoles.includes('DIRECTOR')) {
    return NextResponse.json({ error: 'Chỉ Giám đốc mới cấp được vai trò Giám đốc' }, { status: 403 });
  }
  const row = await prisma.user.create({
    data: {
      email: email.toLowerCase().trim(), name,
      passwordHash: await bcrypt.hash(password, 10),
      role: finalRoles[0], roles: JSON.stringify(finalRoles),
      title: title || (isFL ? 'Freelancer' : null), phone: phone || null, birthday: birthday || null,
      salary: isFL ? 0 : (+salary || 0), teamId: isFL ? null : (teamId || null),
      userType: isFL ? 'freelancer' : 'employee',
      hourlyRate: isFL ? (+body.hourlyRate || 0) : 0,
      skills: isFL ? (body.skills || null) : null,
      portfolio: isFL ? (body.portfolio || null) : null,
      accessUntil: isFL ? (body.accessUntil || null) : null,
    },
  });
  await prisma.auditLog.create({ data: { userId: user.id, userName: user.name, action: 'create', entity: 'users', refId: row.id, detail: `${row.name} [${finalRoles.join(',')}]` } });
  const { passwordHash, totpSecret, ...safe } = row; // v3.13: không trả bí mật 2FA ra ngoài
  return NextResponse.json(safe);
}

// Cập nhật: DIRECTOR sửa tất cả (kể cả vai trò/lương/nhóm);
// HR sửa hồ sơ (tên, chức danh, sđt, lương, nhóm, trạng thái) — KHÔNG sửa vai trò;
// mỗi người tự sửa tên/sđt/mật khẩu của mình.
export async function PUT(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  const { id, password, ...fields } = await req.json();
  const isSelf = id === user.id;
  const isHR = hasAny(user, ['HR']);
  const canFL = hasAny(user, ['HR', 'PM', 'LEAD']); // v3.11: quản lý freelancer
  if (!isDirector(user) && !isHR && !isSelf && !canFL) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const data = {};
  // v3.11: HR/PM/Lead sửa thông tin freelancer (hạn truy cập, đơn giá, kỹ năng)
  if (canFL) {
    ['skills', 'portfolio'].forEach(k => { if (fields[k] !== undefined) data[k] = fields[k] || null; });
    if (fields.accessUntil !== undefined) data.accessUntil = fields.accessUntil || null;
    if (fields.hourlyRate !== undefined) data.hourlyRate = +fields.hourlyRate || 0;
  }
  // v3.16: tên rỗng là hỏng bản ghi — POST đã chặn từ đầu nhưng PUT thì không, nên xóa trắng
  // ô tên rồi lưu là tài khoản mất tên vĩnh viễn (đã xảy ra thật trên Egoric).
  if (fields.name !== undefined && !String(fields.name).trim()) {
    return NextResponse.json({ error: 'Tên không được để trống' }, { status: 400 });
  }
  const profileKeys = isDirector(user) || isHR ? ['name', 'title', 'phone', 'birthday', 'status'] : ['name', 'phone', 'birthday'];
  profileKeys.forEach(k => { if (fields[k] !== undefined) data[k] = fields[k]; });
  if ((isDirector(user) || isHR) && fields.salary !== undefined) data.salary = +fields.salary || 0;
  if ((isDirector(user) || isHR) && fields.teamId !== undefined) data.teamId = fields.teamId || null;
  if (isDirector(user) && fields.roles !== undefined) {
    const r = cleanRoles(fields.roles);
    // v3.16: bỏ tick hết vai trò → BÁO LỖI, không âm thầm hạ xuống Nhân viên như trước
    if (!r || !r.length) {
      return NextResponse.json({ error: 'Phải chọn ít nhất một vai trò' }, { status: 400 });
    }
    data.roles = JSON.stringify(r); data.role = r[0];
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
  const { passwordHash, totpSecret, ...safe } = row; // v3.13: không trả bí mật 2FA ra ngoài
  return NextResponse.json(safe);
}
