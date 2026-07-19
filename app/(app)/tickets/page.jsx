'use client';
import { useState } from 'react';
import { useResource, Icon, FormModal, ConfirmDialog, EmptyState, Modal, AsyncButton, useToast } from '@/components/ui';
import { initials, todayISO } from '@/lib/format';

/* v3.3: modal chấm CSAT 1-5 sao sau khi xử lý xong ticket */
function CsatModal({ ticket, onSave, onClose }) {
  const [score, setScore] = useState(5);
  const [comment, setComment] = useState('');
  return (
    <Modal title={`Khách đánh giá — ${ticket.code}`} onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose}>Hủy</button>
        <AsyncButton className="btn btn-primary" pendingLabel="Đang lưu…" onClick={async () => { const r = await onSave(score, comment); if (r !== false && r !== null) onClose(); }}>Lưu đánh giá</AsyncButton></>}>
      <p style={{ fontSize: '.85rem', marginBottom: 10 }}>Hỏi khách: "Anh/chị hài lòng thế nào với lần hỗ trợ này?" (1 = tệ, 5 = tuyệt vời)</p>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 12 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} onClick={() => setScore(n)}
            style={{ fontSize: '1.6rem', background: 'none', border: 'none', cursor: 'pointer', opacity: n <= score ? 1 : .25 }}>⭐</button>
        ))}
      </div>
      <textarea placeholder="Góp ý của khách (tùy chọn)" value={comment} onChange={e => setComment(e.target.value)} style={{ width: '100%' }} />
    </Modal>
  );
}

const PRIORITY = { urgent: ['Khẩn cấp', 'b-red', 4], high: ['Cao', 'b-amber', 8], normal: ['Thường', 'b-blue', 24], low: ['Thấp', 'b-gray', 72] };
const STATUS = { open: ['Mới', 'b-red'], in_progress: ['Đang xử lý', 'b-blue'], waiting: ['Chờ khách', 'b-amber'], resolved: ['Đã xử lý', 'b-green'], closed: ['Đóng', 'b-gray'] };
const CHANNELS = ['Email', 'Điện thoại', 'Zalo', 'Messenger', 'Họp trực tiếp'];

const slaLeft = t => {
  if (!t.dueAt || ['resolved', 'closed'].includes(t.status)) return null;
  const mins = Math.round((new Date(t.dueAt) - new Date()) / 60000);
  if (mins < 0) return { late: true, label: `vỡ SLA ${Math.abs(Math.round(mins / 60))}h` };
  return { late: false, label: mins > 90 ? `còn ${Math.round(mins / 60)}h` : `còn ${mins}p` };
};

export default function TicketsPage() {
  const { rows, create, update, remove, mutating } = useResource('tickets');
  const clients = useResource('clients');
  const users = useResource('users');
  const csat = useResource('csat');
  const csatOf = tid => csat.rows.find(c => c.ticketId === tid);
  const csatMonth = csat.rows.filter(c => c.date && c.date.slice(0, 7) === todayISO().slice(0, 7));
  const avgCsat = csat.rows.length ? (csat.rows.reduce((s, c) => s + c.score, 0) / csat.rows.length).toFixed(1) : null;
  const [f, setF] = useState('openish');
  const [modal, setModal] = useState(null);
  const toast = useToast();

  const cName = id => clients.rows.find(c => c.id === id)?.name || '—';
  const uName = id => users.rows.find(u => u.id === id)?.name || '—';
  const open = rows.filter(t => !['resolved', 'closed'].includes(t.status));
  const breach = open.filter(t => slaLeft(t)?.late);
  const resolvedThisMonth = rows.filter(t => t.resolvedAt && new Date(t.resolvedAt).getMonth() === new Date().getMonth());
  const avgHours = resolvedThisMonth.length
    ? Math.round(resolvedThisMonth.reduce((s, t) => s + (new Date(t.resolvedAt) - new Date(t.createdAt)) / 3600000, 0) / resolvedThisMonth.length)
    : null;
  const visible = rows.filter(t => f === 'all' ? true : f === 'openish' ? !['resolved', 'closed'].includes(t.status) : t.status === f);

  const FIELDS = [
    { key: 'title', label: 'Vấn đề', required: true, full: true },
    { key: 'clientId', label: 'Khách hàng', type: 'select', options: [{ value: '', label: '— Nội bộ / khác —' }, ...clients.rows.map(c => ({ value: c.id, label: c.name }))] },
    { key: 'channel', label: 'Kênh tiếp nhận', type: 'select', options: CHANNELS.map(c => ({ value: c, label: c })) },
    { key: 'priority', label: 'Ưu tiên (quyết định SLA)', type: 'select', options: Object.entries(PRIORITY).map(([v, [l, , h]]) => ({ value: v, label: `${l} — SLA ${h}h` })) },
    { key: 'assigneeId', label: 'Người xử lý', type: 'select', options: users.rows.filter(u => u.status === 'active').map(u => ({ value: u.id, label: u.name })) },
    { key: 'status', label: 'Trạng thái', type: 'select', options: Object.entries(STATUS).map(([v, [l]]) => ({ value: v, label: l })) },
    { key: 'desc', label: 'Chi tiết', type: 'textarea', full: true },
  ];
  const nextCode = () => 'TK-' + String(rows.length + 1).padStart(4, '0');
  const payload = (d, isNew, row) => {
    const out = { ...d, clientId: d.clientId || null };
    if (isNew) {
      out.code = nextCode();
      out.dueAt = new Date(Date.now() + (PRIORITY[d.priority]?.[2] || 24) * 3600000).toISOString();
    } else if (d.priority !== row.priority) {
      out.dueAt = new Date(new Date(row.createdAt).getTime() + (PRIORITY[d.priority]?.[2] || 24) * 3600000).toISOString();
    }
    if (['resolved', 'closed'].includes(d.status) && !row?.resolvedAt) out.resolvedAt = new Date().toISOString();
    if (!['resolved', 'closed'].includes(d.status)) out.resolvedAt = null;
    return out;
  };

  return (
    <>
      <div className="grid kpi-grid" style={{ marginBottom: 16 }}>
        <div className="card kpi"><span className="kpi-label">Đang mở</span><div className="kpi-value">{open.length}</div></div>
        <div className="card kpi"><span className="kpi-label">Vỡ SLA</span><div className="kpi-value" style={{ color: breach.length ? 'var(--danger)' : 'var(--accent)' }}>{breach.length}</div></div>
        <div className="card kpi"><span className="kpi-label">Thời gian xử lý TB (tháng)</span><div className="kpi-value">{avgHours !== null ? avgHours + 'h' : '—'}</div>
          <div className="kpi-sub">{resolvedThisMonth.length} ticket đã xử lý</div></div>
        <div className="card kpi"><span className="kpi-label">CSAT (hài lòng hỗ trợ)</span>
          <div className="kpi-value" style={{ color: avgCsat === null ? 'inherit' : avgCsat >= 4 ? 'var(--accent)' : avgCsat >= 3 ? 'var(--warn, #D97706)' : 'var(--danger)' }}>{avgCsat !== null ? avgCsat + ' ★' : '—'}</div>
          <div className="kpi-sub">{csat.rows.length} đánh giá · {csatMonth.length} trong tháng</div></div>
      </div>
      <div className="toolbar">
        <select className="filter" value={f} onChange={e => setF(e.target.value)}>
          <option value="openish">Đang mở (mặc định)</option>
          {Object.entries(STATUS).map(([v, [l]]) => <option key={v} value={v}>{l}</option>)}
          <option value="all">Tất cả</option>
        </select>
        <div className="spacer"></div>
        <button className="btn btn-primary" onClick={() => setModal({ mode: 'add' })}><Icon name="plus" size={16} /><span>Tạo ticket</span></button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Mã</th><th>Vấn đề</th><th>Khách hàng</th><th>Ưu tiên</th><th>SLA</th><th>Người xử lý</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>
            {visible.map(t => {
              const [pl, pc] = PRIORITY[t.priority] || ['—', 'b-gray'];
              const [sl, sc] = STATUS[t.status] || ['—', 'b-gray'];
              const sla = slaLeft(t);
              return (
                <tr key={t.id}>
                  <td><span className="cell-main">{t.code}</span></td>
                  <td style={{ maxWidth: 260 }}><span className="cell-main" style={{ fontWeight: 500 }}>{t.title}</span>
                    <span className="cell-sub">{t.channel || ''}</span></td>
                  <td>{cName(t.clientId)}</td>
                  <td><span className={`badge ${pc}`}><span className="dot"></span>{pl}</span></td>
                  <td>{sla ? <b style={{ color: sla.late ? 'var(--danger)' : 'var(--accent)', fontSize: '.78rem' }}>{sla.label}</b> : '—'}</td>
                  <td><span className="cell-person"><span className="avatar">{initials(uName(t.assigneeId))}</span>{uName(t.assigneeId)}</span></td>
                  <td><span className={`badge ${sc}`}><span className="dot"></span>{sl}</span></td>
                  <td><div className="row-actions">
                    {!['resolved', 'closed'].includes(t.status) &&
                      <AsyncButton className="icon-btn" pendingLabel="…" disabled={mutating} style={{ color: 'var(--accent)' }} title="Đánh dấu đã xử lý"
                        onClick={async () => { const r = await update(t.id, { status: 'resolved', resolvedAt: new Date().toISOString() }); if (r) toast('Đã xử lý ' + t.code); }}><Icon name="check" size={16} /></AsyncButton>}
                    {['resolved', 'closed'].includes(t.status) && (csatOf(t.id)
                      ? <span title={csatOf(t.id).comment || 'Đánh giá của khách'} style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--warn, #D97706)', alignSelf: 'center' }}>★{csatOf(t.id).score}</span>
                      : <button className="icon-btn" title="Ghi đánh giá CSAT của khách" style={{ color: 'var(--warn, #D97706)' }}
                          onClick={() => setModal({ mode: 'csat', row: t })}>⭐</button>)}
                    <button className="icon-btn" onClick={() => setModal({ mode: 'edit', row: t })} aria-label="Sửa"><Icon name="edit" size={16} /></button>
                    <button className="icon-btn danger" onClick={() => setModal({ mode: 'del', row: t })} aria-label="Xóa"><Icon name="trash" size={16} /></button>
                  </div></td>
                </tr>
              );
            })}
            {!visible.length && <tr><td colSpan={8}><EmptyState title="Không có ticket" sub="Ghi nhận yêu cầu hỗ trợ của khách — SLA tự tính theo mức ưu tiên" /></td></tr>}
          </tbody>
        </table>
      </div>
      {modal?.mode === 'add' && <FormModal title="Tạo ticket hỗ trợ" fields={FIELDS} data={{ priority: 'normal', status: 'open', channel: 'Email' }}
        onClose={() => setModal(null)} onSave={async d => { await create(payload(d, true)); toast('Đã tạo ticket — SLA bắt đầu tính'); }} />}
      {modal?.mode === 'edit' && <FormModal title={`Ticket ${modal.row.code}`} fields={FIELDS} data={{ ...modal.row, clientId: modal.row.clientId || '' }}
        onClose={() => setModal(null)} onSave={async d => { await update(modal.row.id, payload(d, false, modal.row)); toast('Đã cập nhật'); }} />}
      {modal?.mode === 'del' && <ConfirmDialog msg={`Xóa ticket ${modal.row.code}?`}
        onClose={() => setModal(null)} onYes={async () => { await remove(modal.row.id); toast('Đã xóa'); }} />}
      {modal?.mode === 'csat' && <CsatModal ticket={modal.row} onClose={() => setModal(null)}
        onSave={async (score, comment) => {
          const r = await csat.create({ ticketId: modal.row.id, clientId: modal.row.clientId || null, score, date: todayISO(), comment: comment || null });
          if (!r) return false;
          toast('Đã ghi đánh giá ★' + score); return true;
        }} />}
    </>
  );
}
