'use client';
import { useState, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useResource, Icon, Modal, ConfirmDialog, EmptyState, Forbidden, useToast } from '@/components/ui';
import { money, docGrand, todayISO } from '@/lib/format';
import { hasAny } from '@/lib/perm';

export default function CommissionsPage() {
  const { data: session } = useSession();
  const commissions = useResource('commissions');
  const invoices = useResource('invoices');
  const users = useResource('users');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const toast = useToast();

  if (commissions.forbidden) return <Forbidden />;

  // Chỉ ACCOUNTANT/DIRECTOR được ghi và xóa hoa hồng; AM chỉ đọc
  const canManage = session && hasAny(session.user, ['ACCOUNTANT']);

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const totalThisMonth = commissions.rows.filter(c => c.month === thisMonth).reduce((s, c) => s + c.amount, 0);
  const pendingRows = commissions.rows.filter(c => c.status === 'pending');
  const paidRows = commissions.rows.filter(c => c.status === 'paid');
  const pendingTotal = pendingRows.reduce((s, c) => s + c.amount, 0);
  const paidTotal = paidRows.reduce((s, c) => s + c.amount, 0);

  const userName = id => users.rows.find(u => u.id === id)?.name || '—';
  const inv = id => invoices.rows.find(v => v.id === id);

  // Chỉ lấy AM có trong users
  const amUsers = users.rows.filter(u => {
    try { return JSON.parse(u.roles || '[]').includes('AM'); } catch { return false; }
  });

  // Hóa đơn hợp lệ (đã phát hành hoặc đã thanh toán)
  const validInvoices = invoices.rows.filter(v => ['issued', 'paid', 'partial'].includes(v.status));

  const selectedInvoice = useMemo(
    () => validInvoices.find(v => v.id === form.invoiceId),
    [form.invoiceId, invoices.rows]
  );
  const calcAmount = () => {
    if (!selectedInvoice || !form.rate) return 0;
    return Math.round(docGrand(selectedInvoice) * +form.rate / 100);
  };

  const openAdd = () => {
    setForm({ rate: 5 });
    setModal('add');
  };

  const saveCommission = async () => {
    if (!form.userId || !form.invoiceId || !form.rate) {
      toast('Vui lòng chọn AM, hóa đơn và tỷ lệ hoa hồng', 'error');
      return;
    }
    const amount = calcAmount();
    const month = selectedInvoice ? selectedInvoice.date.slice(0, 7) : thisMonth;
    const clientId = selectedInvoice?.clientId || null;
    await commissions.create({ ...form, amount, month, clientId, status: 'pending', createdAt: todayISO() });
    toast('Đã ghi hoa hồng');
    setModal(null);
  };

  const markPaid = async row => {
    await commissions.update(row.id, { status: 'paid' });
    toast('Đã đánh dấu thanh toán');
  };

  return (
    <>
      <div className="grid kpi-grid">
        <div className="card kpi">
          <span className="kpi-label">Hoa hồng tháng này</span>
          <div className="kpi-value" style={{ color: 'var(--accent)' }}>{money(totalThisMonth)}</div>
          <div className="kpi-sub">{commissions.rows.filter(c => c.month === thisMonth).length} khoản · {thisMonth}</div>
        </div>
        <div className="card kpi">
          <span className="kpi-label">Chưa thanh toán</span>
          <div className="kpi-value" style={{ color: 'var(--warn)' }}>{money(pendingTotal)}</div>
          <div className="kpi-sub">{pendingRows.length} khoản đang chờ</div>
        </div>
        <div className="card kpi">
          <span className="kpi-label">Đã thanh toán</span>
          <div className="kpi-value">{money(paidTotal)}</div>
          <div className="kpi-sub">{paidRows.length} khoản đã chi</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <span className="card-title">Danh sách hoa hồng</span>
          {canManage && (
            <button className="btn btn-primary btn-sm" onClick={openAdd}>
              <Icon name="plus" size={14} /> Ghi hoa hồng
            </button>
          )}
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {commissions.rows.length === 0 ? (
            <div style={{ padding: 24 }}>
              <EmptyState title="Chưa có hoa hồng nào" sub='Nhấn "Ghi hoa hồng" để ghi nhận khi AM close deal thành công' />
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Sales (AM)</th>
                  <th>Hóa đơn</th>
                  <th>Tháng</th>
                  <th>Tỷ lệ</th>
                  <th>Hoa hồng</th>
                  <th>Trạng thái</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {commissions.rows.map(c => {
                  const invoice = inv(c.invoiceId);
                  return (
                    <tr key={c.id}>
                      <td><strong>{userName(c.userId)}</strong></td>
                      <td style={{ color: 'var(--muted)', fontSize: '.85rem' }}>
                        {invoice?.code || c.invoiceId.slice(0, 8)}
                      </td>
                      <td>{c.month}</td>
                      <td>{c.rate}%</td>
                      <td><strong style={{ color: 'var(--accent)' }}>{money(c.amount)}</strong></td>
                      <td>
                        <span className={`badge ${c.status === 'paid' ? 'b-green' : 'b-warn'}`}>
                          <span className="dot"></span>
                          {c.status === 'paid' ? 'Đã trả' : 'Chờ trả'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {c.status === 'pending' && canManage && (
                            <button className="btn btn-outline btn-sm" onClick={() => markPaid(c)}>
                              <Icon name="check" size={13} /> Đã trả
                            </button>
                          )}
                          {canManage && (
                            <button className="icon-btn danger" onClick={() => setModal({ mode: 'del', row: c })}>
                              <Icon name="trash" size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modal === 'add' && (
        <Modal title="Ghi hoa hồng Sales" onClose={() => setModal(null)}
          footer={<>
            <button className="btn btn-outline" onClick={() => setModal(null)}>Hủy</button>
            <button className="btn btn-primary" onClick={saveCommission}>Lưu</button>
          </>}>
          <div className="form-grid">
            <div className="field">
              <label>Sales (AM) nhận hoa hồng *</label>
              <select value={form.userId || ''} onChange={e => setForm({ ...form, userId: e.target.value })}>
                <option value="">Chọn người…</option>
                {amUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Hóa đơn nguồn gốc *</label>
              <select value={form.invoiceId || ''} onChange={e => setForm({ ...form, invoiceId: e.target.value })}>
                <option value="">Chọn hóa đơn đã phát hành…</option>
                {validInvoices.map(v => (
                  <option key={v.id} value={v.id}>{v.code} — {money(docGrand(v))}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Tỷ lệ hoa hồng (%)</label>
              <input type="number" min="0" max="100" step="0.5"
                value={form.rate ?? 5}
                onChange={e => setForm({ ...form, rate: e.target.value })}
                placeholder="5" />
            </div>
            <div className="field">
              <label>Số tiền (tự tính)</label>
              <input type="text" readOnly
                value={calcAmount() > 0 ? money(calcAmount()) : '—'}
                style={{ background: 'var(--surface)', color: 'var(--muted)', cursor: 'default' }} />
            </div>
            <div className="field full">
              <label>Ghi chú</label>
              <textarea rows={2} value={form.note || ''}
                onChange={e => setForm({ ...form, note: e.target.value })}
                placeholder="Hợp đồng Q3, deal đặc biệt, thưởng KPI…" />
            </div>
          </div>
        </Modal>
      )}

      {modal?.mode === 'del' && (
        <ConfirmDialog msg="Xóa khoản hoa hồng này?" onClose={() => setModal(null)}
          onYes={async () => { await commissions.remove(modal.row.id); toast('Đã xóa'); }} />
      )}
    </>
  );
}
