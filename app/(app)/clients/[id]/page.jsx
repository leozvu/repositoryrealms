'use client';
// v3.4: Hồ sơ khách 360° — KPI, danh bạ nhiều người liên hệ, timeline gộp mọi tương tác
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useResource, Icon, FormModal, ConfirmDialog, EmptyState, useToast } from '@/components/ui';
import { DocLinks } from '@/components/DocLinks';
import { money, moneyShort, fmtDate, initials, docGrand, paidOf, remainOf, BADGE } from '@/lib/format';
import { hasAny } from '@/lib/perm';

const KIND_ICON = { call: 'phone', meeting: 'meeting', email: 'mail', note: 'note' };

export default function ClientDetailPage() {
  const { id } = useParams();
  const { data: session } = useSession();
  const isMgmt = hasAny(session?.user, ['AM']);
  const clients = useResource('clients');
  const contacts = useResource('contacts');
  const activities = useResource('activities');
  const quotes = useResource('quotes');
  const invoices = useResource('invoices');
  const projects = useResource('projects');
  const tickets = useResource('tickets');
  const nps = useResource('nps');
  const csat = useResource('csat');
  const [modal, setModal] = useState(null);
  const toast = useToast();

  const client = clients.rows.find(c => c.id === id);
  if (clients.loading) return null;
  if (!client) return <EmptyState title="Không tìm thấy khách hàng" sub="Có thể đã bị xóa hoặc bạn không có quyền xem" />;

  const myContacts = contacts.rows.filter(c => c.clientId === id);
  const myInv = invoices.rows.filter(v => v.clientId === id);
  const revenue = myInv.reduce((s, v) => s + paidOf(v), 0);
  const debt = myInv.filter(v => v.status !== 'draft').reduce((s, v) => s + remainOf(v), 0);
  const myProjects = projects.rows.filter(p => p.clientId === id);
  const myNps = nps.rows.filter(r => r.clientId === id);
  const avgNps = myNps.length ? Math.round(myNps.reduce((s, r) => s + r.score, 0) / myNps.length * 10) / 10 : null;
  const myCsat = csat.rows.filter(r => r.clientId === id);
  const avgCsat = myCsat.length ? Math.round(myCsat.reduce((s, r) => s + r.score, 0) / myCsat.length * 10) / 10 : null;

  /* ---------- Timeline gộp mọi tương tác, mới nhất trước ---------- */
  const tl = [];
  activities.rows.filter(a => a.refType === 'client' && a.refId === id && a.date).forEach(a =>
    tl.push({ date: a.date, icon: KIND_ICON[a.kind] || 'note', color: '#D97706', title: a.title, sub: (a.done ? 'Đã xong · ' : 'Sắp tới · ') + 'Hoạt động CRM' }));
  quotes.rows.filter(q => q.clientId === id).forEach(q =>
    tl.push({ date: q.date, icon: 'quotes', color: '#7C3AED', title: `Báo giá ${q.code} — ${money(docGrand(q))}`, sub: (BADGE.quote[q.status]?.[0] || q.status) }));
  myInv.forEach(v =>
    tl.push({ date: v.date, icon: 'invoices', color: '#2563EB', title: `Hóa đơn ${v.code} — ${money(docGrand(v))}`, sub: `${BADGE.invoice[v.status]?.[0] || v.status} · đã thu ${moneyShort(paidOf(v))}` }));
  myProjects.filter(p => p.startDate).forEach(p =>
    tl.push({ date: p.startDate, icon: 'projects', color: '#059669', title: `Bắt đầu dự án: ${p.name}`, sub: `${BADGE.project[p.status]?.[0] || p.status} · tiến độ ${p.progress || 0}%` }));
  tickets.rows.filter(t => t.clientId === id).forEach(t =>
    tl.push({ date: String(t.createdAt).slice(0, 10), icon: 'check', color: '#DC2626', title: `Ticket ${t.code}: ${t.title}`, sub: t.status === 'resolved' || t.status === 'closed' ? 'Đã xử lý' : 'Đang mở' }));
  myNps.forEach(r =>
    tl.push({ date: r.date, icon: 'trendUp', color: r.score >= 9 ? '#059669' : r.score <= 6 ? '#DC2626' : '#D97706', title: `Khảo sát NPS: ${r.score}/10`, sub: r.comment || '' }));
  myCsat.forEach(r =>
    tl.push({ date: r.date, icon: 'check', color: '#D97706', title: `CSAT ${r.score}★ sau ticket hỗ trợ`, sub: r.comment || '' }));
  tl.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const CONTACT_FIELDS = [
    { key: 'name', label: 'Họ tên', required: true },
    { key: 'role', label: 'Chức vụ' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Điện thoại' },
    { key: 'primary', label: 'Người liên hệ chính?', type: 'select', options: [{ value: '', label: 'Không' }, { value: '1', label: 'Chính' }] },
    { key: 'note', label: 'Ghi chú', type: 'textarea', full: true },
  ];
  const saveContact = async d => {
    const data = { ...d, clientId: id, primary: d.primary === '1' };
    if (modal.row) await contacts.update(modal.row.id, data); else await contacts.create(data);
    toast('Đã lưu người liên hệ');
  };

  return (
    <>
      <div className="toolbar">
        <Link href="/clients" className="btn btn-outline btn-sm">← Khách hàng</Link>
        <span style={{ fontSize: '1.05rem', fontWeight: 800 }}>{client.name}</span>
        {client.industry && <span className="badge b-blue">{client.industry}</span>}
        <div className="spacer"></div>
        <span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>{[client.phone, client.email, client.address].filter(Boolean).join(' · ')}</span>
      </div>

      <div className="grid kpi-grid">
        <div className="card kpi"><span className="kpi-label">Doanh thu lũy kế</span>
          <div className="kpi-value" style={{ color: 'var(--accent)' }}>{money(revenue)}</div>
          <div className="kpi-sub">{myInv.length} hóa đơn</div></div>
        <div className="card kpi"><span className="kpi-label">Công nợ hiện tại</span>
          <div className="kpi-value" style={{ color: debt ? 'var(--danger)' : 'inherit' }}>{money(debt)}</div></div>
        <div className="card kpi"><span className="kpi-label">Dự án</span>
          <div className="kpi-value">{myProjects.filter(p => p.status === 'active').length}<span style={{ fontSize: '.85rem', color: 'var(--muted)' }}> / {myProjects.length}</span></div>
          <div className="kpi-sub">đang chạy / tổng</div></div>
        <div className="card kpi"><span className="kpi-label">Hài lòng</span>
          <div className="kpi-value">{avgNps !== null ? `NPS ${avgNps}` : '—'}</div>
          <div className="kpi-sub">{avgCsat !== null ? `CSAT ${avgCsat}★ · ` : ''}{myNps.length + myCsat.length} phản hồi</div></div>
      </div>

      <div className="grid two-col" style={{ marginTop: 16, alignItems: 'start' }}>
        <div className="card">
          <div className="card-head"><span className="card-title">Người liên hệ ({myContacts.length})</span>
            {isMgmt && !contacts.forbidden && <button className="btn btn-outline btn-sm" onClick={() => setModal({ mode: 'add' })}><Icon name="plus" size={14} /> Thêm</button>}
          </div>
          <div className="card-body" style={{ paddingTop: 8 }}>
            {myContacts.map(ct => (
              <div key={ct.id} className="act-item" style={{ alignItems: 'center' }}>
                <span className="avatar">{initials(ct.name)}</span>
                <div style={{ flex: 1 }}>
                  <div className="act-title">{ct.name}{ct.primary && <span className="badge b-green" style={{ marginLeft: 6 }}><span className="dot"></span>Chính</span>}</div>
                  <div className="act-sub">{[ct.role, ct.phone, ct.email].filter(Boolean).join(' · ') || '—'}</div>
                </div>
                {isMgmt && <>
                  <button className="icon-btn" onClick={() => setModal({ mode: 'edit', row: ct })}><Icon name="edit" size={14} /></button>
                  <button className="icon-btn danger" onClick={() => setModal({ mode: 'del', row: ct })}><Icon name="trash" size={14} /></button>
                </>}
              </div>
            ))}
            {!myContacts.length && (contacts.forbidden
              ? <p style={{ fontSize: '.8rem', color: 'var(--muted)' }}>Bạn không có quyền xem danh bạ thương mại.</p>
              : <p style={{ fontSize: '.8rem', color: 'var(--muted)' }}>Chưa có ai — người liên hệ cũ: {client.contact || '—'}</p>)}
            {client.note && <p style={{ fontSize: '.78rem', color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 8 }}>📝 {client.note}</p>}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><span className="card-title">📎 Tài liệu</span></div>
          <div className="card-body" style={{ paddingTop: 8 }}>
            <DocLinks refType="client" refId={id} />
          </div>
        </div>

        <div className="card">
          <div className="card-head"><span className="card-title">Dòng thời gian ({tl.length})</span></div>
          <div className="card-body" style={{ paddingTop: 8, maxHeight: 520, overflowY: 'auto' }}>
            {tl.map((e, i) => (
              <div key={i} className="act-item">
                <span style={{ width: 30, height: 30, borderRadius: 8, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: e.color + '22', color: e.color }}><Icon name={e.icon} size={15} /></span>
                <div style={{ flex: 1 }}>
                  <div className="act-title">{e.title}</div>
                  <div className="act-sub">{e.sub}</div>
                </div>
                <span style={{ fontSize: '.72rem', color: 'var(--muted)', flex: 'none' }}>{fmtDate(e.date)}</span>
              </div>
            ))}
            {!tl.length && <EmptyState title="Chưa có tương tác nào" sub="Hoạt động CRM, báo giá, hóa đơn, dự án, ticket của khách sẽ hiện ở đây" />}
          </div>
        </div>
      </div>

      {(modal?.mode === 'add' || modal?.mode === 'edit') && <FormModal title={modal.row ? 'Sửa người liên hệ' : 'Thêm người liên hệ'}
        fields={CONTACT_FIELDS} data={modal.row ? { ...modal.row, primary: modal.row.primary ? '1' : '' } : {}}
        onClose={() => setModal(null)} onSave={saveContact} />}
      {modal?.mode === 'del' && <ConfirmDialog msg={`Xóa "${modal.row.name}" khỏi danh bạ?`} onClose={() => setModal(null)}
        onYes={async () => { await contacts.remove(modal.row.id); toast('Đã xóa'); }} />}
    </>
  );
}
