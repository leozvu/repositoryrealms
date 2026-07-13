// v3.9: Gửi báo giá / hóa đơn qua email cho khách — server dựng HTML từ chứng từ
// (không nhận HTML từ client), AM/Kế toán/GĐ mới gửi được, mọi lần gửi vào audit log.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { hasAny } from '@/lib/perm';
import { sendMail } from '@/lib/mailer';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0)) + ' ₫';
const parseItems = s => { try { return JSON.parse(s || '[]'); } catch { return []; } };
const fmtD = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('vi-VN') : '';

function docHtml(kind, doc, clientName, s, message) {
  const items = parseItems(doc.items);
  const sub = items.reduce((t, it) => t + (+it.qty || 0) * (+it.price || 0), 0);
  const vat = sub * (+doc.vat || 0) / 100;
  const label = kind === 'invoice' ? 'HÓA ĐƠN' : 'BÁO GIÁ';
  return `
  <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111">
    ${message ? `<p style="white-space:pre-wrap">${esc(message)}</p><hr style="border:none;border-top:1px solid #ddd">` : ''}
    <table width="100%" style="margin:8px 0"><tr>
      <td><h2 style="margin:0">${esc(s.company || '')}</h2>
        <div style="font-size:13px;color:#555">${esc(s.address || '')}<br>${s.taxCode ? 'MST: ' + esc(s.taxCode) + ' · ' : ''}${esc(s.phone || '')}</div></td>
      <td align="right"><h2 style="margin:0;color:#2563EB">${label}</h2>
        <div style="font-size:13px"><b>Số: ${esc(doc.code)}</b><br>Ngày: ${fmtD(doc.date)}${kind === 'invoice' && doc.dueDate ? '<br>Hạn thanh toán: ' + fmtD(doc.dueDate) : ''}</div></td>
    </tr></table>
    <p style="font-size:14px"><b>Kính gửi:</b> ${esc(clientName)}</p>
    <table width="100%" cellpadding="7" style="border-collapse:collapse;font-size:14px">
      <tr style="background:#f1f5f9"><th align="left" style="border:1px solid #e2e8f0">Nội dung</th><th style="border:1px solid #e2e8f0">SL</th><th align="right" style="border:1px solid #e2e8f0">Đơn giá</th><th align="right" style="border:1px solid #e2e8f0">Thành tiền</th></tr>
      ${items.map(it => `<tr><td style="border:1px solid #e2e8f0">${esc(it.desc)}</td><td align="center" style="border:1px solid #e2e8f0">${it.qty}</td><td align="right" style="border:1px solid #e2e8f0">${money(it.price)}</td><td align="right" style="border:1px solid #e2e8f0">${money(it.qty * it.price)}</td></tr>`).join('')}
      <tr><td colspan="3" align="right">Tạm tính</td><td align="right"><b>${money(sub)}</b></td></tr>
      <tr><td colspan="3" align="right">VAT (${doc.vat || 0}%)</td><td align="right"><b>${money(vat)}</b></td></tr>
      <tr style="background:#f1f5f9"><td colspan="3" align="right"><b>TỔNG CỘNG</b></td><td align="right"><b style="color:#2563EB">${money(sub + vat)}</b></td></tr>
    </table>
    ${s.bank ? `<p style="font-size:13px"><b>Thông tin thanh toán:</b><br>${esc(s.bank)}</p>` : ''}
    <p style="font-size:12px;color:#888">Email gửi tự động từ hệ thống ${esc(s.company || 'Agency ERP')} — vui lòng phản hồi email này nếu cần hỗ trợ.</p>
  </div>`;
}

export async function POST(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasAny(user, ['AM', 'ACCOUNTANT'])) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { type, id, to, message } = await req.json();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return NextResponse.json({ error: 'Email người nhận không hợp lệ' }, { status: 400 });

  const row = await prisma.setting.findUnique({ where: { id: 1 } });
  const s = row ? JSON.parse(row.json) : {};
  let subject, html;

  if (type === 'test') { // gửi thử khi cấu hình SMTP
    subject = `[${s.company || 'Agency ERP'}] Email thử — cấu hình SMTP thành công`;
    html = `<p>Xin chào,</p><p>Đây là email thử từ hệ thống <b>${esc(s.company || 'Agency ERP')}</b>. SMTP đã hoạt động ✅</p>`;
  } else if (type === 'invoice' || type === 'quote') {
    const doc = type === 'invoice'
      ? await prisma.invoice.findUnique({ where: { id }, include: { client: true } })
      : await prisma.quote.findUnique({ where: { id }, include: { client: true } });
    if (!doc) return NextResponse.json({ error: 'Không tìm thấy chứng từ' }, { status: 404 });
    subject = `[${s.company || ''}] ${type === 'invoice' ? 'Hóa đơn' : 'Báo giá'} ${doc.code}`;
    html = docHtml(type, doc, doc.client?.name || '', s, message);
  } else {
    return NextResponse.json({ error: 'type không hợp lệ' }, { status: 400 });
  }

  try {
    await sendMail({ to, subject, html });
    await prisma.auditLog.create({
      data: { userId: user.id, userName: user.name, action: 'email', entity: type, refId: id || null, detail: `Gửi tới ${to}: ${subject}` },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'Gửi thất bại: ' + String(e.message || e).slice(0, 160) }, { status: 502 });
  }
}
