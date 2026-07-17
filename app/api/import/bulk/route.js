import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { RESOURCES, canWrite } from '@/lib/registry';
import { isFreelancer } from '@/lib/perm';
import { resourceEnabled } from '@/lib/module-guard';
import { IMPORTABLE, validateRow } from '@/lib/importable';

// v3.28: Nhập liệu hàng loạt cho MỘT resource trong whitelist IMPORTABLE.
// Dùng lại đúng chốt chặn của CRUD chung: canWrite + phân hệ bật + beforeCreate + validate.
// Kiểm lại từng dòng ở server (không tin client). Một dòng lỗi KHÔNG làm hỏng cả mẻ.
export async function POST(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (isFreelancer(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { resource, rows } = await req.json().catch(() => ({}));
  const spec = IMPORTABLE[resource];
  const cfg = RESOURCES[resource];
  if (!spec || !cfg) return NextResponse.json({ error: 'Tài nguyên không hỗ trợ nhập liệu.' }, { status: 400 });
  if (!canWrite(resource, user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!(await resourceEnabled(resource))) return NextResponse.json({ error: 'Phân hệ này đang tắt cho công ty.' }, { status: 403 });
  if (!Array.isArray(rows) || !rows.length) return NextResponse.json({ error: 'Không có dòng nào để nhập.' }, { status: 400 });
  if (rows.length > 2000) return NextResponse.json({ error: 'Mỗi lần nhập tối đa 2000 dòng.' }, { status: 400 });

  let created = 0;
  const failed = [];
  for (let i = 0; i < rows.length; i++) {
    try {
      const { data: clean, errors } = validateRow(rows[i], spec.fields);
      if (errors.length) { failed.push({ line: i + 1, error: errors.join('; ') }); continue; }
      let data = clean;
      if (cfg.beforeCreate) data = await cfg.beforeCreate(data, user, prisma);
      if (cfg.validate) { const err = await cfg.validate(null, data, prisma); if (err) { failed.push({ line: i + 1, error: err }); continue; } }
      await prisma[cfg.model].create({ data });
      created++;
    } catch (e) {
      failed.push({ line: i + 1, error: e.message });
    }
  }

  await prisma.auditLog.create({
    data: { userId: user.id, userName: user.name, action: 'import', entity: resource, detail: `Nhập ${created} dòng${failed.length ? `, lỗi ${failed.length}` : ''}` },
  });
  return NextResponse.json({ created, failed });
}
