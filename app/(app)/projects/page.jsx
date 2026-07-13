'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useResource, Icon, FormModal, ConfirmDialog, EmptyState, Badge, useToast } from '@/components/ui';
import { DocLinksModal } from '@/components/DocLinks';
import { money, fmtDate, todayISO, BADGE } from '@/lib/format';
import { hasAny } from '@/lib/perm';

export default function ProjectsPage() {
  const { data: session } = useSession();
  const isMgmt = hasAny(session?.user, ['PM']); // Dự án: PM + Giám đốc
  const { rows, create, update, remove } = useResource('projects');
  const clients = useResource('clients');
  const tasks = useResource('tasks');
  const [q, setQ] = useState('');
  const [f, setF] = useState('all');
  const [modal, setModal] = useState(null);
  const toast = useToast();

  const clientName = id => clients.rows.find(c => c.id === id)?.name || '—';
  const FIELDS = [
    { key: 'name', label: 'Tên dự án', required: true, full: true },
    { key: 'clientId', label: 'Khách hàng', type: 'select', options: clients.rows.map(c => ({ value: c.id, label: c.name })), required: true },
    { key: 'service', label: 'Dịch vụ', type: 'select', options: ['Digital Ads', 'Social Media', 'Branding', 'Web & SEO', 'Production', 'PR / Event', 'Khác'].map(s => ({ value: s, label: s })) },
    { key: 'budget', label: 'Ngân sách / giá trị HĐ (đ)', type: 'number' },
    { key: 'status', label: 'Trạng thái', type: 'select', options: Object.entries(BADGE.project).map(([v, [l]]) => ({ value: v, label: l })) },
    { key: 'startDate', label: 'Ngày bắt đầu', type: 'date' },
    { key: 'deadline', label: 'Deadline', type: 'date' },
    { key: 'progress', label: 'Tiến độ (%)', type: 'number', hint: '0 – 100' },
  ];
  const filtered = rows.filter(p => (f === 'all' || p.status === f) && (!q || (p.name + clientName(p.clientId)).toLowerCase().includes(q.toLowerCase())));

  return (
    <>
      <div className="toolbar">
        <div className="search-box"><Icon name="search" size={15} /><input placeholder="Tìm dự án…" value={q} onChange={e => setQ(e.target.value)} /></div>
        <select className="filter" value={f} onChange={e => setF(e.target.value)}>
          <option value="all">Tất cả trạng thái</option>
          {Object.entries(BADGE.project).map(([v, [l]]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <div className="spacer"></div>
        {isMgmt && <button className="btn btn-primary" onClick={() => {
          if (!clients.rows.length) return toast('Hãy thêm khách hàng trước', 'error');
          setModal({ mode: 'add' });
        }}><Icon name="plus" size={16} /><span>Thêm dự án</span></button>}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Dự án</th><th>Khách hàng</th><th>Dịch vụ</th>{isMgmt && <th className="num">Ngân sách</th>}<th>Deadline</th><th style={{ minWidth: 130 }}>Tiến độ</th><th>Trạng thái</th>{isMgmt && <th></th>}</tr></thead>
          <tbody>
            {filtered.map(p => {
              const late = p.status !== 'done' && p.deadline && p.deadline < todayISO();
              return (
                <tr key={p.id}>
                  <td><span className="cell-main">{p.name}</span>
                    <span className="cell-sub">{tasks.rows.filter(t => t.projectId === p.id && t.status !== 'done').length} việc đang mở</span></td>
                  <td>{clientName(p.clientId)}</td>
                  <td><span className="badge b-violet">{p.service || '—'}</span></td>
                  {isMgmt && <td className="num" style={{ fontWeight: 700 }}>{money(p.budget)}</td>}
                  <td style={late ? { color: 'var(--danger)', fontWeight: 600 } : {}}>{fmtDate(p.deadline)}{late ? ' ⚠' : ''}</td>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className={`progress ${p.progress >= 100 ? 'p-done' : ''}`}><i style={{ width: `${Math.min(100, p.progress)}%` }}></i></div>
                    <span style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{p.progress}%</span></div></td>
                  <td><Badge map="project" k={p.status} /></td>
                  {isMgmt && (
                    <td><div className="row-actions">
                      <button className="icon-btn" title="Tài liệu (Drive/Notion…)" onClick={() => setModal({ mode: 'docs', row: p })}>📎</button>
                      <button className="icon-btn" onClick={() => setModal({ mode: 'edit', row: p })} aria-label="Sửa"><Icon name="edit" size={16} /></button>
                      <button className="icon-btn danger" onClick={() => setModal({ mode: 'del', row: p })} aria-label="Xóa"><Icon name="trash" size={16} /></button>
                    </div></td>
                  )}
                </tr>
              );
            })}
            {!filtered.length && <tr><td colSpan={8}><EmptyState title="Chưa có dự án" /></td></tr>}
          </tbody>
        </table>
      </div>
      {modal?.mode === 'add' && <FormModal title="Thêm dự án" fields={FIELDS} data={{ status: 'planning', progress: 0, startDate: todayISO() }}
        onClose={() => setModal(null)} onSave={async d => { await create(d); toast('Đã thêm dự án'); }} />}
      {modal?.mode === 'edit' && <FormModal title="Sửa dự án" fields={FIELDS} data={modal.row}
        onClose={() => setModal(null)} onSave={async d => { await update(modal.row.id, d); toast('Đã cập nhật'); }} />}
      {modal?.mode === 'docs' && <DocLinksModal refType="project" refId={modal.row.id} name={modal.row.name} onClose={() => setModal(null)} />}
      {modal?.mode === 'del' && <ConfirmDialog msg={`Xóa dự án "${modal.row.name}"? Công việc thuộc dự án cần được xóa/chuyển trước.`}
        onClose={() => setModal(null)} onYes={async () => { const r = await remove(modal.row.id); if (r) toast('Đã xóa'); }} />}
    </>
  );
}
