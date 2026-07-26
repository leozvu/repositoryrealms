// v3.42 (cụm Lead) — CỔNG NHẬN LEAD TỰ ĐỘNG.
//
// Facebook Lead Ads / TikTok Lead / form landing page / website gọi thẳng vào đây, lead
// rơi vào pipeline và được chia sale ngay — thay cho việc mở từng nền tảng nhặt số về Excel.
//
// AN TOÀN — endpoint này CÔNG KHAI nên phòng thủ nhiều lớp:
//  1. Bắt buộc token riêng của công ty (Cài đặt → Cổng nhận lead). Không có token = 404,
//     không tiết lộ endpoint có tồn tại hay không.
//  2. Giới hạn kích thước body, chuẩn hóa mọi trường qua allowlist (lib/lead-intake).
//  3. Chống trùng bằng intakeKey — bắn lại 10 lần cũng chỉ một lead.
//  4. Chỉ TẠO lead mới; không đọc, không sửa, không xóa gì khác.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rolesOf } from '@/lib/perm';
import { emitEvent, notify } from '@/lib/events';
import {
  LeadIntakeError, leadDedupeKey, normalizeAssignStrategy, normalizeLeadPayload, pickOwner,
} from '@/lib/lead-intake';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BODY = 16 * 1024;
const headers = { 'Cache-Control': 'no-store' };
const notFound = () => NextResponse.json({ error: 'not found' }, { status: 404, headers });

async function settings() {
  const row = await prisma.setting.findUnique({ where: { id: 1 } });
  try { return row ? JSON.parse(row.json) : {}; } catch { return {}; }
}

export async function POST(request) {
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY) {
    return NextResponse.json({ error: 'payload quá lớn' }, { status: 413, headers });
  }
  const config = await settings();
  const expected = String(config.leadIntakeToken || '');
  // Token nằm ở header (ưu tiên) hoặc query — Facebook/TikTok webhook mỗi bên hỗ trợ một kiểu
  const provided = String(
    request.headers.get('x-intake-token') || new URL(request.url).searchParams.get('token') || '',
  );
  if (expected.length < 20 || provided !== expected) return notFound();

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'JSON không hợp lệ' }, { status: 400, headers }); }

  try {
    const lead = normalizeLeadPayload(body);
    const intakeKey = leadDedupeKey(lead);

    const existing = await prisma.lead.findUnique({ where: { intakeKey } });
    if (existing) {
      // Trả 200 để nền tảng gửi không retry vô hạn; nói rõ là trùng.
      return NextResponse.json({ ok: true, duplicate: true, leadId: existing.id }, { headers });
    }

    // Chọn người phụ trách theo chiến lược công ty cấu hình
    const strategy = normalizeAssignStrategy(config.leadAssignStrategy);
    const users = await prisma.user.findMany({
      where: { status: 'active', userType: { not: 'freelancer' } },
      select: { id: true, name: true, roles: true, role: true },
    });
    const sales = users.filter(u => rolesOf(u).includes('AM'));
    const routing = config.leadRouting || {}; // { userId: { regions:[], serviceLines:[], campaigns:[] } }
    const candidates = await Promise.all(sales.map(async (user) => {
      const [openLeads, latest] = await Promise.all([
        prisma.lead.count({ where: { ownerId: user.id, stage: { notIn: ['won', 'lost'] } } }),
        prisma.lead.findFirst({ where: { ownerId: user.id }, orderBy: { intakeAt: 'desc' }, select: { intakeAt: true } }),
      ]);
      return { id: user.id, openLeads, lastAssignedAt: latest?.intakeAt?.toISOString() || null, ...(routing[user.id] || {}) };
    }));
    const ownerId = pickOwner(lead, candidates, { strategy });

    const created = await prisma.lead.create({
      data: {
        name: lead.name, company: lead.company, email: lead.email, phone: lead.phone,
        source: lead.source, value: lead.value, note: lead.note,
        campaign: lead.campaign, region: lead.region, serviceLine: lead.serviceLine,
        stage: 'new', ownerId, intakeKey, intakeAt: new Date(),
        createdAt: new Date().toISOString().slice(0, 10),
      },
    });

    if (ownerId) {
      await notify(ownerId, `🔥 Lead mới từ ${lead.source}${lead.campaign ? ` · ${lead.campaign}` : ''}: ${lead.name}${lead.phone ? ` — ${lead.phone}` : ''}`, `/leads?focus=${created.id}`);
    }
    await prisma.auditLog.create({ data: {
      userId: 'lead-intake', userName: `Cổng nhận lead (${lead.source})`, action: 'create',
      entity: 'leads', refId: created.id,
      detail: `${lead.name}${lead.campaign ? ` · ${lead.campaign}` : ''}${ownerId ? ' · đã chia sale' : ' · CHƯA có người phụ trách'}`,
    } }).catch(() => {});
    // để automation IF/THEN + webhook của công ty bắt được lead mới
    await emitEvent('leads', 'create', created, null, { id: 'lead-intake', name: 'Cổng nhận lead' }).catch(() => {});

    return NextResponse.json({ ok: true, leadId: created.id, assigned: Boolean(ownerId) }, { status: 201, headers });
  } catch (error) {
    if (error instanceof LeadIntakeError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers });
    }
    console.error('lead_intake_failed', error?.code || error?.message);
    return NextResponse.json({ error: 'Không nhận được lead' }, { status: 500, headers });
  }
}

// Facebook/Meta xác minh webhook bằng GET hub.challenge — trả lại đúng chuỗi họ gửi.
export async function GET(request) {
  const url = new URL(request.url);
  const config = await settings();
  const expected = String(config.leadIntakeToken || '');
  const provided = String(url.searchParams.get('hub.verify_token') || url.searchParams.get('token') || '');
  if (expected.length < 20 || provided !== expected) return notFound();
  const challenge = url.searchParams.get('hub.challenge');
  return challenge
    ? new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain', ...headers } })
    : NextResponse.json({ ok: true, ready: true }, { headers });
}
