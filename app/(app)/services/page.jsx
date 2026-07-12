'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useResource, Icon, FormModal, ConfirmDialog, EmptyState, useToast } from '@/components/ui';
import { money } from '@/lib/format';
import { hasAny } from '@/lib/perm';

const FIELDS = [
  { key: 'name', label: 'Tên dịch vụ', required: true, full: true },
  { key: 'unit', label: 'Đơn vị tính', placeholder: 'tháng / cái / video…' },
  { key: 'price', label: 'Đơn giá (đ)', type: 'number', required: true },
  { key: 'desc', label: 'Mô tả', type: 'textarea', full: true },
];

export default function ServicesPage() {
  const { data: session } = useSession();
  const isMgmt = hasAny(session?.user, ['AM']);
  const { rows, create, update, remove } = useResource('services');
  const [modal, setModal] = useState(null);
  const toast = useToast();

  return (
    <>
      <div className="toolbar">
        <span style={{ fontSize: '.85rem', color: 'var(--muted)' }}>Danh mục dịch vụ chuẩn — chọn nhanh khi soạn báo giá &amp; hóa đơn</span>
        <div className="spacer"></div>
        {isMgmt && <button className="btn btn-primary" onClick={() => setModal({ mode: 'add' })}><Icon name="plus" size={16} /><span>Thêm dịch vụ</span></button>}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Dịch vụ</th><th>Đơn vị</th><th className="num">Đơn giá</th><th>Mô tả</th>{isMgmt && <th></th>}</tr></thead>
          <tbody>
            {rows.map(sv => (
              <tr key={sv.id}>
                <td><span className="cell-main">{sv.name}</span></td>
                <td>{sv.unit || '—'}</td>
                <td className="num" style={{ fontWeight: 700 }}>{money(sv.price)}</td>
                <td style={{ color: 'var(--muted)', fontSize: '.8rem' }}>{sv.desc || '—'}</td>
                {isMgmt && <td><div className="row-actions">
                  <button className="icon-btn" onClick={() => setModal({ mode: 'edit', row: sv })} aria-label="Sửa"><Icon name="edit" size={16} /></button>
                  <button className="icon-btn danger" onClick={() => setModal({ mode: 'del', row: sv })} aria-label="Xóa"><Icon name="trash" size={16} /></button>
                </div></td>}
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5}><EmptyState title="Chưa có dịch vụ" sub="Thêm các gói dịch vụ agency kèm đơn giá chuẩn" /></td></tr>}
          </tbody>
        </table>
      </div>
      {modal?.mode === 'add' && <FormModal title="Thêm dịch vụ" fields={FIELDS} onClose={() => setModal(null)}
        onSave={async d => { await create(d); toast('Đã thêm dịch vụ'); }} />}
      {modal?.mode === 'edit' && <FormModal title="Sửa dịch vụ" fields={FIELDS} data={modal.row} onClose={() => setModal(null)}
        onSave={async d => { await update(modal.row.id, d); toast('Đã cập nhật'); }} />}
      {modal?.mode === 'del' && <ConfirmDialog msg="Xóa dịch vụ này khỏi bảng giá?" onClose={() => setModal(null)}
        onYes={async () => { await remove(modal.row.id); toast('Đã xóa'); }} />}
    </>
  );
}
