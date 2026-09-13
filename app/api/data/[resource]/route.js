import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { RESOURCES, canRead, canWrite } from '@/lib/registry';
import { CollectionQueryError, readCollection, collectionHeaders } from '@/lib/collection-query';
import { isFreelancer } from '@/lib/perm';
import { interceptWrite } from '@/lib/approvals';
import { commitRecordMutation } from '@/lib/record-mutation';
import { resourceEnabled } from '@/lib/module-guard';


export async function GET(req, { params }) {
  params = await params;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  if (isFreelancer(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const cfg = RESOURCES[params.resource];
  if (!cfg || !canRead(params.resource, user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!(await resourceEnabled(params.resource))) return NextResponse.json({ error: 'Phân hệ này đang tắt cho công ty' }, { status: 403 });
  try {
    const { rows, page } = await readCollection(prisma, { resource: params.resource, cfg, user, params: new URL(req.url).searchParams });
    return NextResponse.json(rows, { headers: collectionHeaders(page) });
  } catch (error) {
    if (!(error instanceof CollectionQueryError)) throw error;
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: collectionHeaders() });
  }
}

export async function POST(req, { params }) {
  params = await params;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  if (isFreelancer(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const cfg = RESOURCES[params.resource];
  if (!cfg || !canWrite(params.resource, user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!(await resourceEnabled(params.resource))) return NextResponse.json({ error: 'Phân hệ này đang tắt cho công ty' }, { status: 403 });
  let data = await req.json();
  if (cfg.beforeCreate) data = await cfg.beforeCreate(data, user, prisma);
  // v3.21: validate chạy CẢ khi tạo mới (trước đây chỉ chạy ở PUT). Ràng buộc nghiệp vụ/pháp lý
  // phải chặn ở server, không chỉ ở trình duyệt — VD lô hàng XNK đi thị trường cấm.
  if (cfg.validate) {
    const err = await cfg.validate(null, data, prisma);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }
  try {
    const result = await commitRecordMutation(prisma, { resource: params.resource, event: 'create', cfg, data, user, interceptWrite });
    if (result.blocked) return NextResponse.json({ _blocked: true, _notice: result.notice });
    const { row, notice } = result;
    const out = cfg.sanitize ? cfg.sanitize(row, user) : row;
    return NextResponse.json(notice ? { ...out, _notice: notice } : out);
  } catch (e) {
    return NextResponse.json({ error: e.message, ...(e.code ? { code: e.code } : {}) }, { status: e.status || 400 });
  }
}
