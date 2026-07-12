'use client';
import { useState } from 'react';
import { useResource, Icon, FormModal, ConfirmDialog, EmptyState, Forbidden, useToast } from '@/components/ui';
import { money, fmtDate, todayISO, daysFromNow, initials } from '@/lib/format';

const VENDOR_TYPES = ['KOL / Influencer', 'Freelancer', 'Nhà in', 'Studio', 'Media / Báo chí', 'Phần mềm', 'Khác'];

export default function VendorsPage() {
  const vendors = useResource('vendors');
  const bills = useResource('vendorbills');
  const projects = useResource('projects');
  const [modal, setModal] = useState(null);
  const toast = useToast();
  if (vendors.forbidden) return <Forbidden />;

  const vName = id => vendors.rows.find(v => v.id === id)?.name || '—';
  const pName = id => projects.rows.find(p => p.id === id)?.name || '—';

  const VENDOR_FIELDS = [
    { key: 'name', label: 'Tên nhà cung cấp', required: true, full: true },
    { key: 'type', label: 'Loại', type: 'select', options: VENDOR_TYPES.map(t => ({ value: t, label: t })) },
    { key: 'rating', label: 'Đánh giá (0-5 sao)', type: 'number' },
    { key: 'contact', label: 'Người liên hệ' },
    { key: 'phone', label: 'Điện thoại' },
    { key: 'email', label: 'Email', type: 'email', full: true },
    { key: 'note', label: 'Ghi chú chất lượng / giá', type: 'textarea', full: true },
  ];
  const BILL_FIELDS = [
    { key: 'code', label: 'Số hóa đơn / mã chi', required: true },
    { key: 'vendorId', label: 'Nhà cung cấp', type: 'select', options: vendors.rows.map(v => ({ value: v.id, label: v.name })), required: true },
    { key: 'amount', label: 'Số tiền (đ)', type: 'number', required: true },
    { key: 'projectId', label: 'Tính vào dự án', type: 'select', options: [{ value: '', label: '— Chi phí chung —' }, ...projects.rows.map(p => ({ value: p.id, label: p.name }))] },
    { key: 'date', label: 'Ngày hóa đơn', type: 'date', required: true },
    { key: 'dueDate', label: 'Hạn thanh toán', type: 'date' },
    { key: 'desc', label: 'Nội dung', type: 'textarea', full: true },
  ];

  const payBill = async b => {
    const res = await fetch(`/api/vendorbills/${b.id}/pay`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: todayISO() }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return toast(json.error || 'Có lỗi', 'error');
    await bills.refresh();
    toast(json._notice || `Đã thanh toán ${money(b.amount)}`, json._blocked ? 'error' : 'success');
  };

  const pendingTotal = bills.rows.filter(b => b.status !== 'paid').reduce((s, b) => s + b.amount, 0);
  const stars = n => '★'.repeat(Math.min(5, n || 0)) + '☆'.repeat(5 - Math.min(5, n || 0));

  return (
    <>
      <div className="grid kpi-grid" style={{ marginBottom: 16 }}>
        <div className="card kpi"><span className="kpi-label">Nhà cung cấp</span><div className="kpi-value">{vendors.rows.length}</div></div>
        <div className="card kpi"><span className="kpi-label">Công nợ phải trả</span><div className="kpi-value" style={{ color: pendingTotal ? 'var(--warn)' : 'inherit' }}>{money(pendingTotal)}</div>
          <div className="kpi-sub">{bills.rows.filter(b => b.status !== 'paid').length} hóa đơn chưa trả</div></div>
        <div className="card kpi"><span className="kpi-label">Đã trả (tổng)</span><div className="kpi-value">{money(bills.rows.filter(b => b.status === 'paid').reduce((s, b) => s + b.amount, 0))}</div></div>
      </div>

      <div className="toolbar">
        <span className="card-title">Danh bạ nhà cung cấp</span>
        <div className="spacer"></div>
        <button className="btn btn-primary" onClick={() => setModal({ mode: 'addVendor' })}><Icon name="plus" size={16} /><span>Thêm NCC</span></button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nhà cung cấp</th><th>Loại</th><th>Liên hệ</th><th>Đánh giá</th><th className="num">Tổng đã chi</th><th></th></tr></thead>
          <tbody>
            {vendors.rows.map(v => (
              <tr key={v.id}>
                <td><span className="cell-person"><span className="avatar">{initials(v.name)}</span>
                  <span><span className="cell-main">{v.name}</span><span className="cell-sub">{v.note || ''}</span></span></span></td>
                <td>{v.type ? <span className="badge b-violet">{v.type}</span> : '—'}</td>
                <td><span className="cell-sub" style={{ fontSize: '.8rem' }}>{v.contact || ''}{v.phone ? ' · ' + v.phone : ''}</span></td>
                <td style={{ color: 'var(--warn)', letterSpacing: 2 }}>{stars(v.rating)}</td>
                <td className="num" style={{ fontWeight: 700 }}>{money(bills.rows.filter(b => b.vendorId === v.id && b.status === 'paid').reduce((s, b) => s + b.amount, 0))}</td>
                <td><div className="row-actions">
                  <button className="icon-btn" onClick={() => setModal({ mode: 'editVendor', row: v })} aria-label="Sửa"><Icon name="edit" size={16} /></button>
                  <button className="icon-btn danger" onClick={() => setModal({ mode: 'delVendor', row: v })} aria-label="Xóa"><Icon name="trash" size={16} /></button>
                </div></td>
              </tr>
            ))}
            {!vendors.rows.length && <tr><td colSpan={6}><EmptyState title="Chưa có nhà cung cấp" sub="KOL, freelancer, nhà in, studio… — quản lý chi phí đầu vào tại đây" /></td></tr>}
          </tbody>
        </table>
      </div>

      <div className="section-title">Hóa đơn đầu vào (công nợ phải trả)</div>
      <div className="toolbar">
        <div className="spacer"></div>
        <button className="btn btn-outline" onClick={() => {
          if (!vendors.rows.length) return toast('Hãy thêm nhà cung cấp trước', 'error');
          setModal({ mode: 'addBill' });
        }}><Icon name="plus" size={16} /><span>Ghi hóa đơn đầu vào</span></button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Mã</th><th>Nhà cung cấp</th><th>Nội dung</th><th>Dự án</th><th>Hạn trả</th><th className="num">Số tiền</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>
            {bills.rows.map(b => {
              const late = b.status !== 'paid' && b.dueDate && b.dueDate < todayISO();
              return (
                <tr key={b.id}>
                  <td><span className="cell-main">{b.code}</span></td>
                  <td>{vName(b.vendorId)}</td>
                  <td style={{ maxWidth: 220 }}>{b.desc || '—'}</td>
                  <td>{b.projectId ? pName(b.projectId) : '—'}</td>
                  <td style={late ? { color: 'var(--danger)', fontWeight: 600 } : {}}>{fmtDate(b.dueDate)}{late ? ' ⚠' : ''}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{money(b.amount)}</td>
                  <td>{b.status === 'paid' ? <span className="badge b-green"><span className="dot"></span>Đã trả {fmtDate(b.paidDate)}</span>
                    : late ? <span className="badge b-red"><span className="dot"></span>Quá hạn</span>
                    : <span className="badge b-amber"><span className="dot"></span>Chờ trả</span>}</td>
                  <td><div className="row-actions">
                    {b.status !== 'paid' && <button className="icon-btn" style={{ color: 'var(--accent)' }} title="Thanh toán (ghi vào sổ quỹ)"
                      onClick={() => setModal({ mode: 'payBill', row: b })}><Icon name="wallet" size={16} /></button>}
                    <button className="icon-btn" onClick={() => setModal({ mode: 'editBill', row: b })} aria-label="Sửa"><Icon name="edit" size={16} /></button>
                    <button className="icon-btn danger" onClick={() => setModal({ mode: 'delBill', row: b })} aria-label="Xóa"><Icon name="trash" size={16} /></button>
                  </div></td>
                </tr>
              );
            })}
            {!bills.rows.length && <tr><td colSpan={8}><EmptyState title="Chưa có hóa đơn đầu vào" /></td></tr>}
          </tbody>
        </table>
      </div>

      {modal?.mode === 'addVendor' && <FormModal title="Thêm nhà cung cấp" fields={VENDOR_FIELDS} data={{ type: 'Freelancer', rating: 5 }}
        onClose={() => setModal(null)} onSave={async d => { await vendors.create({ ...d, rating: +d.rating || 0 }); toast('Đã thêm NCC'); }} />}
      {modal?.mode === 'editVendor' && <FormModal title="Sửa nhà cung cấp" fields={VENDOR_FIELDS} data={modal.row}
        onClose={() => setModal(null)} onSave={async d => { await vendors.update(modal.row.id, { ...d, rating: +d.rating || 0 }); toast('Đã cập nhật'); }} />}
      {modal?.mode === 'delVendor' && <ConfirmDialog msg={`Xóa NCC "${modal.row.name}"? Hóa đơn đầu vào của NCC này cần xóa trước.`}
        onClose={() => setModal(null)} onYes={async () => { const r = await vendors.remove(modal.row.id); if (r) toast('Đã xóa'); }} />}
      {modal?.mode === 'addBill' && <FormModal title="Ghi hóa đơn đầu vào" fields={BILL_FIELDS} data={{ date: todayISO(), dueDate: daysFromNow(7) }}
        onClose={() => setModal(null)} onSave={async d => { await bills.create({ ...d, amount: +d.amount || 0, projectId: d.projectId || null }); toast('Đã ghi công nợ phải trả'); }} />}
      {modal?.mode === 'editBill' && <FormModal title="Sửa hóa đơn đầu vào" fields={BILL_FIELDS} data={{ ...modal.row, projectId: modal.row.projectId || '' }}
        onClose={() => setModal(null)} onSave={async d => { await bills.update(modal.row.id, { ...d, amount: +d.amount || 0, projectId: d.projectId || null }); toast('Đã cập nhật'); }} />}
      {modal?.mode === 'payBill' && <ConfirmDialog yesLabel="Thanh toán" msg={`Thanh toán ${money(modal.row.amount)} cho ${vName(modal.row.vendorId)}? Khoản chi sẽ tự ghi vào sổ quỹ.`}
        onClose={() => setModal(null)} onYes={() => payBill(modal.row)} />}
      {modal?.mode === 'delBill' && <ConfirmDialog msg={`Xóa hóa đơn ${modal.row.code}?`}
        onClose={() => setModal(null)} onYes={async () => { await bills.remove(modal.row.id); toast('Đã xóa'); }} />}
    </>
  );
}
