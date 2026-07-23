'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useResource, useServiceLines, Icon, FormModal, ConfirmDialog, EmptyState, ExportCsv, useToast } from '@/components/ui';
import { ActivitiesModal } from '@/components/Activities';
import { initials } from '@/lib/format';
import { hasAny } from '@/lib/perm';

export default function ClientsPage() {
  const { data: session } = useSession();
  const isMgmt = hasAny(session?.user, ['AM']); // CRM write: Account/Sales + Giám đốc
  const { rows, create, update, remove } = useResource('clients');
  const serviceLines = useServiceLines(); // v3.37: mảng dịch vụ theo công ty (thêm/sửa trong Cài đặt)
  const [q, setQ] = useState('');
  const [line, setLine] = useState('all'); // v3.37: lọc theo mảng dịch vụ
  const [modal, setModal] = useState(null); // {mode:'add'|'edit', row} | {mode:'del', row}
  const toast = useToast();

  const FIELDS = [
    { key: 'name', label: 'Tên công ty / khách hàng', required: true, full: true },
    { key: 'contact', label: 'Người liên hệ' },
    { key: 'industry', label: 'Ngành hàng' },
    { key: 'serviceLine', label: 'Mảng dịch vụ', type: 'select', options: [{ value: '', label: '— Chưa xếp —' }, ...serviceLines.map(s => ({ value: s, label: s }))] },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Điện thoại' },
    { key: 'address', label: 'Địa chỉ', full: true },
    { key: 'note', label: 'Ghi chú', type: 'textarea', full: true },
  ];

  const filtered = rows.filter(c => (!q || (c.name + ' ' + (c.contact || '') + ' ' + (c.industry || '')).toLowerCase().includes(q.toLowerCase()))
    && (line === 'all' || (line === '' ? !c.serviceLine : c.serviceLine === line)));

  return (
    <>
      <div className="toolbar">
        <div className="search-box"><Icon name="search" size={15} /><input placeholder="Tìm khách hàng…" value={q} onChange={e => setQ(e.target.value)} /></div>
        <select className="filter" value={line} onChange={e => setLine(e.target.value)} title="Lọc theo mảng dịch vụ">
          <option value="all">Mọi mảng dịch vụ</option>
          {serviceLines.map(s => <option key={s} value={s}>{s}</option>)}
          <option value="">Chưa xếp mảng</option>
        </select>
        <div className="spacer"></div>
        <ExportCsv rows={filtered} name="khach-hang" cols={[
          { key: 'name', label: 'Khách hàng' }, { key: 'contact', label: 'Liên hệ' }, { key: 'phone', label: 'SĐT' },
          { key: 'email', label: 'Email' }, { key: 'industry', label: 'Ngành' }, { key: 'serviceLine', label: 'Mảng dịch vụ' }, { key: 'address', label: 'Địa chỉ' },
        ]} />
        {isMgmt && <button className="btn btn-primary" onClick={() => setModal({ mode: 'add' })}><Icon name="plus" size={16} /><span>Thêm khách hàng</span></button>}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Khách hàng</th><th>Liên hệ</th><th>Ngành</th><th>Mảng dịch vụ</th>{isMgmt && <th></th>}</tr></thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id}>
                <td><Link href={`/clients/${c.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <span className="cell-person"><span className="avatar">{initials(c.name)}</span>
                  <span><span className="cell-main" style={{ color: 'var(--primary)' }}>{c.name}</span><span className="cell-sub">{c.address || ''}</span></span></span></Link></td>
                <td>{c.contact ? <><span className="cell-main" style={{ fontWeight: 500 }}>{c.contact}</span><span className="cell-sub">{[c.phone, c.email].filter(Boolean).join(' · ')}</span></> : '—'}</td>
                <td>{c.industry ? <span className="badge b-blue">{c.industry}</span> : '—'}</td>
                <td>{c.serviceLine ? <span className="badge b-violet">{c.serviceLine}</span> : '—'}</td>
                {isMgmt && (
                  <td><div className="row-actions">
                    <button className="icon-btn" style={{ color: 'var(--primary)' }} title="Nhật ký & lịch hẹn"
                      onClick={() => setModal({ mode: 'acts', row: c })}><Icon name="clock" size={16} /></button>
                    <button className="icon-btn" onClick={() => setModal({ mode: 'edit', row: c })} aria-label="Sửa"><Icon name="edit" size={16} /></button>
                    <button className="icon-btn danger" onClick={() => setModal({ mode: 'del', row: c })} aria-label="Xóa"><Icon name="trash" size={16} /></button>
                  </div></td>
                )}
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={5}><EmptyState title="Chưa có khách hàng" sub="Thêm khách hàng hoặc import dữ liệu từ bản v1 trong Cài đặt" /></td></tr>}
          </tbody>
        </table>
      </div>
      {modal?.mode === 'add' && <FormModal title="Thêm khách hàng" fields={FIELDS} onClose={() => setModal(null)}
        onSave={async d => { await create(d); toast('Đã thêm khách hàng'); }} />}
      {modal?.mode === 'edit' && <FormModal title="Sửa khách hàng" fields={FIELDS} data={modal.row} onClose={() => setModal(null)}
        onSave={async d => { await update(modal.row.id, d); toast('Đã cập nhật'); }} />}
      {modal?.mode === 'del' && <ConfirmDialog msg={`Xóa khách hàng "${modal.row.name}"?`} onClose={() => setModal(null)}
        onYes={async () => { const r = await remove(modal.row.id); if (r) toast('Đã xóa'); }} />}
      {modal?.mode === 'acts' && <ActivitiesModal refType="client" refId={modal.row.id} name={modal.row.name} onClose={() => setModal(null)} />}
    </>
  );
}
