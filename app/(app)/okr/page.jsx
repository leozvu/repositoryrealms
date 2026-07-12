'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useResource, Icon, FormModal, ConfirmDialog, EmptyState, useToast } from '@/components/ui';
import { initials } from '@/lib/format';
import { hasAny } from '@/lib/perm';

const curQuarter = () => { const d = new Date(); return `${d.getFullYear()}-Q${Math.ceil((d.getMonth() + 1) / 3)}`; };
const quarters = () => { const out = []; const d = new Date(); for (let i = -1; i <= 1; i++) { const q = Math.ceil((d.getMonth() + 1) / 3) + i; const y = d.getFullYear() + Math.floor((q - 1) / 4); const qq = ((q - 1 + 4) % 4) + 1; out.push(`${y}-Q${qq}`); } return [...new Set(out)]; };

export default function OkrPage() {
  const { data: session } = useSession();
  const me = session?.user;
  const canManage = hasAny(me, ['PM', 'HR']);
  const { rows, create, update, remove } = useResource('okrs');
  const users = useResource('users');
  const [q, setQ] = useState(curQuarter());
  const [modal, setModal] = useState(null);
  const toast = useToast();

  const uName = id => users.rows.find(u => u.id === id)?.name;
  const allQ = [...new Set([...quarters(), ...rows.map(r => r.quarter)])].sort().reverse();
  const visible = rows.filter(r => r.quarter === q);
  const company = visible.filter(r => !r.userId);
  const personal = visible.filter(r => r.userId);

  const FIELDS = [
    { key: 'title', label: 'Mục tiêu (Objective / KPI)', required: true, full: true, placeholder: 'VD: Đạt 500 triệu doanh thu mới từ khách hàng F&B' },
    { key: 'userId', label: 'Của ai', type: 'select', options: [{ value: '', label: '🏢 OKR công ty' }, ...users.rows.filter(u => u.status === 'active').map(u => ({ value: u.id, label: u.name }))] },
    { key: 'target', label: 'Chỉ tiêu', type: 'number', required: true },
    { key: 'unit', label: 'Đơn vị', placeholder: 'triệu đ / khách / bài / %' },
    { key: 'current', label: 'Đã đạt', type: 'number' },
    { key: 'note', label: 'Ghi chú / key results', type: 'textarea', full: true },
  ];

  const OkrRow = ({ r }) => {
    const pct = r.target ? Math.min(100, Math.round(r.current / r.target * 100)) : 0;
    const canEdit = canManage || r.userId === me?.id || !r.userId;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
        {r.userId ? <span className="avatar" title={uName(r.userId)}>{initials(uName(r.userId) || '?')}</span>
          : <span className="avatar" style={{ background: 'var(--violet-soft)', color: 'var(--violet)' }}>🏢</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '.86rem', fontWeight: 600 }}>{r.title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 5 }}>
            <div className={`progress ${pct >= 100 ? 'p-done' : ''}`} style={{ flex: 1, height: 8 }}><i style={{ width: pct + '%' }}></i></div>
            <span style={{ fontSize: '.76rem', fontVariantNumeric: 'tabular-nums', color: pct >= 100 ? 'var(--accent)' : 'var(--muted)', fontWeight: 700, whiteSpace: 'nowrap' }}>
              {r.current.toLocaleString('vi-VN')} / {r.target.toLocaleString('vi-VN')} {r.unit || ''} ({pct}%)</span>
          </div>
        </div>
        {canEdit && <button className="icon-btn" onClick={() => setModal({ mode: 'edit', row: r })} aria-label="Cập nhật"><Icon name="edit" size={15} /></button>}
        {canManage && <button className="icon-btn danger" onClick={() => setModal({ mode: 'del', row: r })} aria-label="Xóa"><Icon name="trash" size={15} /></button>}
      </div>
    );
  };

  return (
    <>
      <div className="toolbar">
        <select className="filter" value={q} onChange={e => setQ(e.target.value)}>
          {allQ.map(x => <option key={x} value={x}>Quý {x.slice(6)}/{x.slice(0, 4)}</option>)}
        </select>
        <div className="spacer"></div>
        {canManage && <button className="btn btn-primary" onClick={() => setModal({ mode: 'add' })}><Icon name="plus" size={16} /><span>Thêm OKR / KPI</span></button>}
      </div>
      <div className="card">
        <div className="card-head"><span className="card-title">🏢 OKR công ty — {q.replace('-', ' ')}</span></div>
        <div className="card-body" style={{ paddingTop: 4 }}>
          {company.map(r => <OkrRow key={r.id} r={r} />)}
          {!company.length && <EmptyState title="Chưa có OKR công ty quý này" />}
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><span className="card-title">KPI cá nhân</span></div>
        <div className="card-body" style={{ paddingTop: 4 }}>
          {personal.map(r => <OkrRow key={r.id} r={r} />)}
          {!personal.length && <EmptyState title="Chưa có KPI cá nhân quý này" sub="PM/HR giao chỉ tiêu — mỗi người tự cập nhật tiến độ" />}
        </div>
      </div>
      {modal?.mode === 'add' && <FormModal title={`Thêm OKR — ${q}`} fields={FIELDS} data={{ target: 100, current: 0 }}
        onClose={() => setModal(null)} onSave={async d => { await create({ ...d, quarter: q, userId: d.userId || null, target: +d.target || 0, current: +d.current || 0 }); toast('Đã thêm OKR'); }} />}
      {modal?.mode === 'edit' && <FormModal title="Cập nhật OKR" fields={canManage ? FIELDS : FIELDS.filter(f => f.key === 'current' || f.key === 'note')} data={{ ...modal.row, userId: modal.row.userId || '' }}
        onClose={() => setModal(null)} onSave={async d => { const body = canManage ? { ...d, userId: d.userId || null, target: +d.target || 0, current: +d.current || 0 } : { current: +d.current || 0, note: d.note }; await update(modal.row.id, body); toast('Đã cập nhật tiến độ'); }} />}
      {modal?.mode === 'del' && <ConfirmDialog msg={`Xóa OKR "${modal.row.title}"?`}
        onClose={() => setModal(null)} onYes={async () => { await remove(modal.row.id); toast('Đã xóa'); }} />}
    </>
  );
}
