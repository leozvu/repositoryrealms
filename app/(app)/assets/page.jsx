'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useResource, Icon, FormModal, ConfirmDialog, EmptyState, useToast } from '@/components/ui';
import { money, fmtDate, todayISO, daysFromNow, initials } from '@/lib/format';
import { hasAny } from '@/lib/perm';

const CATEGORIES = ['Thiết bị quay chụp', 'Laptop / máy tính', 'License phần mềm', 'Nội thất văn phòng', 'Khác'];
const STATUS_LABEL = { in_use: ['Đang dùng', 'b-green'], storage: ['Trong kho', 'b-gray'], broken: ['Hỏng / sửa chữa', 'b-red'], sold: ['Đã thanh lý', 'b-gray'] };

export default function AssetsPage() {
  const { data: session } = useSession();
  const isMgmt = hasAny(session?.user, ['HR', 'ACCOUNTANT']); // quản trị tài sản + xem giá trị
  const { rows, create, update, remove } = useResource('assets');
  const users = useResource('users');
  const [modal, setModal] = useState(null);
  const toast = useToast();

  const holder = id => users.rows.find(u => u.id === id)?.name;
  const FIELDS = [
    { key: 'name', label: 'Tên tài sản', required: true, full: true },
    { key: 'category', label: 'Nhóm', type: 'select', options: CATEGORIES.map(c => ({ value: c, label: c })) },
    { key: 'serial', label: 'Số serial / mã' },
    { key: 'holderId', label: 'Người đang giữ', type: 'select', options: [{ value: '', label: '— Trong kho —' }, ...users.rows.filter(u => u.status === 'active').map(u => ({ value: u.id, label: u.name }))] },
    { key: 'price', label: 'Giá trị (đ)', type: 'number' },
    { key: 'buyDate', label: 'Ngày mua', type: 'date' },
    { key: 'renewAt', label: 'Ngày gia hạn (license)', type: 'date' },
    { key: 'status', label: 'Tình trạng', type: 'select', options: Object.entries(STATUS_LABEL).map(([v, [l]]) => ({ value: v, label: l })) },
    { key: 'note', label: 'Ghi chú', type: 'textarea', full: true },
  ];

  const renewSoon = rows.filter(a => a.renewAt && a.renewAt >= todayISO() && a.renewAt <= daysFromNow(30));
  const totalValue = rows.filter(a => a.status !== 'sold').reduce((s, a) => s + (a.price || 0), 0);

  return (
    <>
      {renewSoon.length > 0 && (
        <div className="card" style={{ padding: '13px 17px', marginBottom: 16, borderLeft: '4px solid var(--warn)' }}>
          <b style={{ fontSize: '.86rem' }}>⚠ Sắp đến hạn gia hạn:</b>
          <span style={{ fontSize: '.83rem', color: 'var(--muted)', marginLeft: 8 }}>
            {renewSoon.map(a => `${a.name} (${fmtDate(a.renewAt)})`).join(' · ')}</span>
        </div>
      )}
      <div className="toolbar">
        <span style={{ fontSize: '.85rem', color: 'var(--muted)' }}>
          {rows.length} tài sản{isMgmt ? <> · Tổng giá trị: <b style={{ color: 'var(--fg)' }}>{money(totalValue)}</b></> : ''}
        </span>
        <div className="spacer"></div>
        {isMgmt && <button className="btn btn-primary" onClick={() => setModal({ mode: 'add' })}><Icon name="plus" size={16} /><span>Thêm tài sản</span></button>}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Tài sản</th><th>Nhóm</th><th>Người giữ</th>{isMgmt && <th className="num">Giá trị</th>}<th>Gia hạn</th><th>Tình trạng</th>{isMgmt && <th></th>}</tr></thead>
          <tbody>
            {rows.map(a => {
              const [sl, sc] = STATUS_LABEL[a.status] || [a.status, 'b-gray'];
              return (
                <tr key={a.id}>
                  <td><span className="cell-main">{a.name}</span><span className="cell-sub">{a.serial || ''}</span></td>
                  <td>{a.category ? <span className="badge b-blue">{a.category}</span> : '—'}</td>
                  <td>{holder(a.holderId) ? <span className="cell-person"><span className="avatar">{initials(holder(a.holderId))}</span>{holder(a.holderId)}</span> : <span style={{ color: 'var(--muted)' }}>Trong kho</span>}</td>
                  {isMgmt && <td className="num" style={{ fontWeight: 700 }}>{money(a.price)}</td>}
                  <td>{a.renewAt ? fmtDate(a.renewAt) : '—'}</td>
                  <td><span className={`badge ${sc}`}><span className="dot"></span>{sl}</span></td>
                  {isMgmt && <td><div className="row-actions">
                    <button className="icon-btn" onClick={() => setModal({ mode: 'edit', row: a })} aria-label="Sửa"><Icon name="edit" size={16} /></button>
                    <button className="icon-btn danger" onClick={() => setModal({ mode: 'del', row: a })} aria-label="Xóa"><Icon name="trash" size={16} /></button>
                  </div></td>}
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={7}><EmptyState title="Chưa có tài sản" sub="Máy quay, laptop, license phần mềm… — ai giữ gì, gia hạn khi nào" /></td></tr>}
          </tbody>
        </table>
      </div>
      {modal?.mode === 'add' && <FormModal title="Thêm tài sản" fields={FIELDS} data={{ status: 'in_use', category: CATEGORIES[0], buyDate: todayISO() }}
        onClose={() => setModal(null)} onSave={async d => { await create({ ...d, price: +d.price || 0, holderId: d.holderId || null }); toast('Đã thêm tài sản'); }} />}
      {modal?.mode === 'edit' && <FormModal title="Sửa tài sản" fields={FIELDS} data={{ ...modal.row, holderId: modal.row.holderId || '' }}
        onClose={() => setModal(null)} onSave={async d => { await update(modal.row.id, { ...d, price: +d.price || 0, holderId: d.holderId || null }); toast('Đã cập nhật'); }} />}
      {modal?.mode === 'del' && <ConfirmDialog msg={`Xóa tài sản "${modal.row.name}"?`}
        onClose={() => setModal(null)} onYes={async () => { await remove(modal.row.id); toast('Đã xóa'); }} />}
    </>
  );
}
