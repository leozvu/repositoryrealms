'use client';
import { useState } from 'react';
import { useResource, Icon, Modal, ConfirmDialog, EmptyState, Badge, Forbidden, useToast } from '@/components/ui';
import DocEditor, { printDoc } from '@/components/DocEditor';
import { money, fmtDate, todayISO, docGrand, paidOf, remainOf } from '@/lib/format';

function PayModal({ inv, onDone, onClose }) {
  const remain = remainOf(inv);
  const [amount, setAmount] = useState(remain);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const toast = useToast();
  const submit = async () => {
    const res = await fetch(`/api/invoices/${inv.id}/pay`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: +amount, date, note }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return toast(json.error || 'Có lỗi', 'error');
    toast('Đã ghi nhận thanh toán và ghi vào sổ quỹ');
    onDone(); onClose();
  };
  return (
    <Modal title={`Ghi nhận thanh toán — ${inv.code}`} onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose}>Hủy</button>
        <button className="btn btn-primary" onClick={submit}>Ghi nhận</button></>}>
      <div className="detail-stats">
        <div className="detail-stat"><b>{money(docGrand(inv))}</b><span>Tổng hóa đơn</span></div>
        <div className="detail-stat"><b style={{ color: 'var(--accent)' }}>{money(paidOf(inv))}</b><span>Đã thu</span></div>
        <div className="detail-stat"><b style={{ color: 'var(--warn)' }}>{money(remain)}</b><span>Còn lại</span></div>
      </div>
      <div className="form-grid">
        <div className="field"><label>Số tiền thu <span className="req">*</span></label>
          <input type="number" min="1" max={remain} value={amount} onChange={e => setAmount(e.target.value)} />
          <div className="hint">Thu đủ sẽ tự chuyển trạng thái &quot;Đã thu&quot;</div></div>
        <div className="field"><label>Ngày thu</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
        <div className="field full"><label>Ghi chú</label><input value={note} onChange={e => setNote(e.target.value)} placeholder="VD: chuyển khoản đợt 1" /></div>
      </div>
    </Modal>
  );
}

export default function InvoicesPage() {
  const { rows, forbidden, create, update, remove, refresh } = useResource('invoices');
  const clients = useResource('clients');
  const projects = useResource('projects');
  const services = useResource('services');
  const [f, setF] = useState('all');
  const [modal, setModal] = useState(null);
  const toast = useToast();
  if (forbidden) return <Forbidden />;

  const client = id => clients.rows.find(c => c.id === id);
  const totalOf = s => rows.filter(v => v.status === s).reduce((sum, v) => sum + docGrand(v), 0);
  const filtered = rows.filter(v => f === 'all' || v.status === f);

  return (
    <>
      <div className="grid kpi-grid" style={{ marginBottom: 16 }}>
        <div className="card kpi"><span className="kpi-label">Đã thu</span><div className="kpi-value" style={{ color: 'var(--accent)' }}>{money(totalOf('paid'))}</div></div>
        <div className="card kpi"><span className="kpi-label">Chờ thanh toán</span><div className="kpi-value">{money(totalOf('sent'))}</div></div>
        <div className="card kpi"><span className="kpi-label">Quá hạn</span><div className="kpi-value" style={{ color: 'var(--danger)' }}>{money(totalOf('overdue'))}</div></div>
      </div>
      <div className="toolbar">
        <select className="filter" value={f} onChange={e => setF(e.target.value)}>
          <option value="all">Tất cả trạng thái</option>
          <option value="draft">Nháp</option><option value="sent">Đã gửi</option>
          <option value="overdue">Quá hạn</option><option value="paid">Đã thu</option>
        </select>
        <div className="spacer"></div>
        <button className="btn btn-primary" onClick={() => {
          if (!clients.rows.length) return toast('Hãy thêm khách hàng trước', 'error');
          setModal({ mode: 'add' });
        }}><Icon name="plus" size={16} /><span>Tạo hóa đơn</span></button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Mã</th><th>Khách hàng</th><th>Ngày lập</th><th>Hạn thu</th><th className="num">Tổng tiền</th><th className="num">Còn lại</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>
            {filtered.map(v => (
              <tr key={v.id}>
                <td><span className="cell-main" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {v.code}{v.recurring && <span title="Hóa đơn định kỳ" style={{ color: 'var(--primary)', display: 'inline-flex' }}><Icon name="repeat" size={14} /></span>}</span></td>
                <td>{client(v.clientId)?.name || '—'}</td>
                <td>{fmtDate(v.date)}</td>
                <td style={v.status === 'overdue' ? { color: 'var(--danger)', fontWeight: 600 } : {}}>{fmtDate(v.dueDate)}</td>
                <td className="num" style={{ fontWeight: 700 }}>{money(docGrand(v))}</td>
                <td className="num" style={{ fontWeight: 600, color: remainOf(v) > 0 ? 'var(--warn)' : 'var(--accent)' }}>{remainOf(v) > 0 ? money(remainOf(v)) : '✓ đủ'}</td>
                <td><Badge map="invoice" k={v.status} /></td>
                <td><div className="row-actions">
                  {v.status !== 'paid' && <button className="icon-btn" style={{ color: 'var(--accent)' }} title="Ghi nhận thanh toán"
                    onClick={() => setModal({ mode: 'pay', row: v })}><Icon name="wallet" size={16} /></button>}
                  <button className="icon-btn" title="In / xuất PDF" onClick={() => printDoc(v, 'invoice', client(v.clientId)?.name || '', client(v.clientId) || {})}><Icon name="print" size={16} /></button>
                  <button className="icon-btn" onClick={() => setModal({ mode: 'edit', row: v })} aria-label="Sửa"><Icon name="edit" size={16} /></button>
                  <button className="icon-btn danger" onClick={() => setModal({ mode: 'del', row: v })} aria-label="Xóa"><Icon name="trash" size={16} /></button>
                </div></td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={8}><EmptyState title="Chưa có hóa đơn" /></td></tr>}
          </tbody>
        </table>
      </div>
      {modal?.mode === 'add' && <DocEditor kind="invoice" doc={null} clients={clients.rows} projects={projects.rows} services={services.rows} allDocs={rows}
        onClose={() => setModal(null)} onSave={async d => { await create({ ...d, payments: '[]' }); toast('Đã tạo hóa đơn'); }} />}
      {modal?.mode === 'edit' && <DocEditor kind="invoice" doc={modal.row} clients={clients.rows} projects={projects.rows} services={services.rows} allDocs={rows}
        onClose={() => setModal(null)} onSave={async d => { await update(modal.row.id, d); toast('Đã cập nhật'); }} />}
      {modal?.mode === 'pay' && <PayModal inv={modal.row} onDone={refresh} onClose={() => setModal(null)} />}
      {modal?.mode === 'del' && <ConfirmDialog msg={`Xóa hóa đơn ${modal.row.code}?`}
        onClose={() => setModal(null)} onYes={async () => { await remove(modal.row.id); toast('Đã xóa'); }} />}
    </>
  );
}
