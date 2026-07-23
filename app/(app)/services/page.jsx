'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useResource, useServiceLines, Icon, FormModal, ConfirmDialog, EmptyState, useToast } from '@/components/ui';
import { money } from '@/lib/format';
import { hasAny } from '@/lib/perm';

// v3.37 (feedback Egoric): bảng giá từng dồn chung một danh sách sort theo alphabet — rối khi
// một công ty bán nhiều mảng (Seeding chia theo platform, AI Video…). Nay:
// - mỗi dịch vụ gắn "mảng dịch vụ" (danh mục chỉnh trong Cài đặt) + bộ lọc theo mảng
// - quản lý sắp thứ tự tùy chỉnh bằng nút ▲▼ (sortOrder), hết cảnh alphabet ép buộc

export default function ServicesPage() {
  const { data: session } = useSession();
  const isMgmt = hasAny(session?.user, ['AM']);
  const { rows, create, update, remove } = useResource('services');
  const serviceLines = useServiceLines();
  const [cat, setCat] = useState('all');
  const [modal, setModal] = useState(null);
  const [ordering, setOrdering] = useState(false);
  const toast = useToast();

  const FIELDS = [
    { key: 'name', label: 'Tên dịch vụ', required: true, full: true },
    { key: 'category', label: 'Mảng dịch vụ', type: 'select', options: [{ value: '', label: '— Chưa xếp —' }, ...serviceLines.map(s => ({ value: s, label: s }))] },
    { key: 'unit', label: 'Đơn vị tính', placeholder: 'tháng / cái / video…' },
    { key: 'price', label: 'Đơn giá (đ)', type: 'number', required: true },
    { key: 'desc', label: 'Mô tả', type: 'textarea', full: true },
  ];

  // sortOrder > 0 xếp trước theo thứ tự tay; 0 (chưa xếp) rơi xuống sau, sort theo tên
  const bySort = (a, b) => ((a.sortOrder || 0) > 0 || (b.sortOrder || 0) > 0)
    ? ((a.sortOrder || Infinity) - (b.sortOrder || Infinity)) || a.name.localeCompare(b.name, 'vi')
    : a.name.localeCompare(b.name, 'vi');
  const filtered = rows.filter(sv => cat === 'all' || (cat === '' ? !sv.category : sv.category === cat)).sort(bySort);

  // Đưa dịch vụ lên/xuống một bậc TRONG danh sách đang lọc. Nếu danh sách còn dịch vụ
  // chưa có sortOrder (toàn 0) thì đánh số lại một lượt theo thứ tự hiện tại rồi mới hoán vị.
  const nudge = async (index, dir) => {
    const target = index + dir;
    if (target < 0 || target >= filtered.length || ordering) return;
    setOrdering(true);
    try {
      let list = filtered;
      if (list.some(sv => !(sv.sortOrder > 0))) {
        for (let i = 0; i < list.length; i++) {
          if (list[i].sortOrder !== i + 1) await update(list[i].id, { sortOrder: i + 1 });
        }
        list = list.map((sv, i) => ({ ...sv, sortOrder: i + 1 }));
      }
      const a = list[index], b = list[target];
      await update(a.id, { sortOrder: b.sortOrder });
      await update(b.id, { sortOrder: a.sortOrder });
    } finally {
      setOrdering(false);
    }
  };

  return (
    <>
      <div className="toolbar">
        <select className="filter" value={cat} onChange={e => setCat(e.target.value)} title="Lọc theo mảng dịch vụ">
          <option value="all">Mọi mảng dịch vụ</option>
          {serviceLines.map(s => <option key={s} value={s}>{s}</option>)}
          <option value="">Chưa xếp mảng</option>
        </select>
        <span style={{ fontSize: '.85rem', color: 'var(--muted)' }}>Danh mục dịch vụ chuẩn — chọn nhanh khi soạn báo giá &amp; hóa đơn{isMgmt ? ' · dùng ▲▼ để tự sắp thứ tự' : ''}</span>
        <div className="spacer"></div>
        {isMgmt && <button className="btn btn-primary" onClick={() => setModal({ mode: 'add' })}><Icon name="plus" size={16} /><span>Thêm dịch vụ</span></button>}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr>{isMgmt && <th style={{ width: 70 }}>Thứ tự</th>}<th>Dịch vụ</th><th>Mảng</th><th>Đơn vị</th><th className="num">Đơn giá</th><th>Mô tả</th>{isMgmt && <th></th>}</tr></thead>
          <tbody>
            {filtered.map((sv, i) => (
              <tr key={sv.id}>
                {isMgmt && <td><div className="row-actions" style={{ justifyContent: 'flex-start' }}>
                  <button className="icon-btn" disabled={ordering || i === 0} onClick={() => nudge(i, -1)} aria-label="Đưa lên"><Icon name="chevron-up" size={14} /></button>
                  <button className="icon-btn" disabled={ordering || i === filtered.length - 1} onClick={() => nudge(i, 1)} aria-label="Đưa xuống"><Icon name="chevron-down" size={14} /></button>
                </div></td>}
                <td><span className="cell-main">{sv.name}</span></td>
                <td>{sv.category ? <span className="badge b-violet">{sv.category}</span> : '—'}</td>
                <td>{sv.unit || '—'}</td>
                <td className="num" style={{ fontWeight: 700 }}>{money(sv.price)}</td>
                <td style={{ color: 'var(--muted)', fontSize: '.8rem' }}>{sv.desc || '—'}</td>
                {isMgmt && <td><div className="row-actions">
                  <button className="icon-btn" onClick={() => setModal({ mode: 'edit', row: sv })} aria-label="Sửa"><Icon name="edit" size={16} /></button>
                  <button className="icon-btn danger" onClick={() => setModal({ mode: 'del', row: sv })} aria-label="Xóa"><Icon name="trash" size={16} /></button>
                </div></td>}
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={7}><EmptyState title="Chưa có dịch vụ" sub="Thêm các gói dịch vụ kèm đơn giá chuẩn — gắn mảng dịch vụ để lọc nhanh" /></td></tr>}
          </tbody>
        </table>
      </div>
      {modal?.mode === 'add' && <FormModal title="Thêm dịch vụ" fields={FIELDS} data={{ category: cat !== 'all' && cat !== '' ? cat : '' }} onClose={() => setModal(null)}
        onSave={async d => { await create({ ...d, category: d.category || null }); toast('Đã thêm dịch vụ'); }} />}
      {modal?.mode === 'edit' && <FormModal title="Sửa dịch vụ" fields={FIELDS} data={modal.row} onClose={() => setModal(null)}
        onSave={async d => { await update(modal.row.id, { ...d, category: d.category || null }); toast('Đã cập nhật'); }} />}
      {modal?.mode === 'del' && <ConfirmDialog msg="Xóa dịch vụ này khỏi bảng giá?" onClose={() => setModal(null)}
        onYes={async () => { await remove(modal.row.id); toast('Đã xóa'); }} />}
    </>
  );
}
