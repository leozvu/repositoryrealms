'use client';
import { useState } from 'react';
import { useResource, Icon, FormModal, ConfirmDialog, EmptyState, Badge, Forbidden, useToast } from '@/components/ui';
import { money, fmtDate, todayISO, monthKey } from '@/lib/format';

const CATEGORIES = ['Doanh thu dịch vụ', 'Doanh thu khác', 'Lương nhân sự', 'Ngân sách quảng cáo', 'Văn phòng', 'Công cụ / phần mềm', 'Marketing nội bộ', 'Thuế / phí', 'Khác'];

export default function FinancePage() {
  const { rows, forbidden, create, update, remove } = useResource('transactions');
  const projects = useResource('projects');
  const [f, setF] = useState('all');
  const [m, setM] = useState('all');
  const [modal, setModal] = useState(null);
  const toast = useToast();
  if (forbidden) return <Forbidden />;

  const pName = id => projects.rows.find(p => p.id === id)?.name || '—';
  const months = [...new Set(rows.map(t => monthKey(t.date)))].sort().reverse();
  const visible = rows.filter(t => (f === 'all' || t.type === f) && (m === 'all' || monthKey(t.date) === m))
    .sort((a, b) => b.date.localeCompare(a.date));
  const inc = visible.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const exp = visible.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  const FIELDS = [
    { key: 'type', label: 'Loại', type: 'select', options: [{ value: 'income', label: 'Khoản thu' }, { value: 'expense', label: 'Khoản chi' }], required: true },
    { key: 'amount', label: 'Số tiền (đ)', type: 'number', required: true },
    { key: 'category', label: 'Danh mục', type: 'select', options: CATEGORIES.map(c => ({ value: c, label: c })) },
    { key: 'date', label: 'Ngày', type: 'date', required: true },
    { key: 'projectId', label: 'Thuộc dự án', type: 'select', options: [{ value: '', label: '— Không thuộc dự án —' }, ...projects.rows.map(p => ({ value: p.id, label: p.name }))] },
    { key: 'desc', label: 'Diễn giải', type: 'textarea', full: true },
  ];

  const exportCsv = () => {
    const csvEsc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Ngày', 'Loại', 'Danh mục', 'Diễn giải', 'Dự án', 'Số tiền'].join(',')];
    visible.forEach(t => lines.push([t.date, t.type === 'income' ? 'Thu' : 'Chi', csvEsc(t.category), csvEsc(t.desc), csvEsc(pName(t.projectId)), t.type === 'income' ? t.amount : -t.amount].join(',')));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `so-quy-${m}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
    toast('Đã xuất CSV');
  };

  return (
    <>
      <div className="grid kpi-grid" style={{ marginBottom: 16 }}>
        <div className="card kpi"><span className="kpi-label">Tổng thu (bộ lọc)</span><div className="kpi-value" style={{ color: 'var(--accent)' }}>{money(inc)}</div></div>
        <div className="card kpi"><span className="kpi-label">Tổng chi (bộ lọc)</span><div className="kpi-value" style={{ color: 'var(--danger)' }}>{money(exp)}</div></div>
        <div className="card kpi"><span className="kpi-label">Chênh lệch</span><div className="kpi-value">{money(inc - exp)}</div></div>
      </div>
      <div className="toolbar">
        <select className="filter" value={f} onChange={e => setF(e.target.value)}>
          <option value="all">Thu &amp; chi</option><option value="income">Chỉ thu</option><option value="expense">Chỉ chi</option>
        </select>
        <select className="filter" value={m} onChange={e => setM(e.target.value)}>
          <option value="all">Tất cả các tháng</option>
          {months.map(mo => <option key={mo} value={mo}>Tháng {mo.slice(5)}/{mo.slice(0, 4)}</option>)}
        </select>
        <div className="spacer"></div>
        <button className="btn btn-outline" onClick={exportCsv}><Icon name="download" size={16} /><span>Xuất CSV</span></button>
        <button className="btn btn-primary" onClick={() => setModal({ mode: 'add' })}><Icon name="plus" size={16} /><span>Ghi thu / chi</span></button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Ngày</th><th>Loại</th><th>Danh mục</th><th>Diễn giải</th><th>Dự án</th><th className="num">Số tiền</th><th></th></tr></thead>
          <tbody>
            {visible.map(t => (
              <tr key={t.id}>
                <td>{fmtDate(t.date)}</td>
                <td><Badge map="tx" k={t.type} /></td>
                <td>{t.category || '—'}</td>
                <td style={{ maxWidth: 280 }}>{t.desc || '—'}</td>
                <td>{pName(t.projectId)}</td>
                <td className="num" style={{ fontWeight: 700, color: t.type === 'income' ? 'var(--accent)' : 'var(--danger)' }}>
                  {t.type === 'income' ? '+' : '−'}{money(t.amount)}</td>
                <td><div className="row-actions">
                  <button className="icon-btn" onClick={() => setModal({ mode: 'edit', row: t })} aria-label="Sửa"><Icon name="edit" size={16} /></button>
                  <button className="icon-btn danger" onClick={() => setModal({ mode: 'del', row: t })} aria-label="Xóa"><Icon name="trash" size={16} /></button>
                </div></td>
              </tr>
            ))}
            {!visible.length && <tr><td colSpan={7}><EmptyState title="Chưa có giao dịch" /></td></tr>}
          </tbody>
        </table>
      </div>
      {modal?.mode === 'add' && <FormModal title="Ghi thu / chi" fields={FIELDS} data={{ type: 'expense', date: todayISO(), category: 'Khác' }}
        onClose={() => setModal(null)} onSave={async d => {
          const r = await create({ ...d, projectId: d.projectId || null });
          if (r) toast(r._notice || 'Đã ghi sổ', r._blocked ? 'error' : 'success');
        }} />}
      {modal?.mode === 'edit' && <FormModal title="Sửa giao dịch" fields={FIELDS} data={{ ...modal.row, projectId: modal.row.projectId || '' }}
        onClose={() => setModal(null)} onSave={async d => { await update(modal.row.id, { ...d, projectId: d.projectId || null }); toast('Đã cập nhật'); }} />}
      {modal?.mode === 'del' && <ConfirmDialog msg="Xóa giao dịch này khỏi sổ quỹ?" onClose={() => setModal(null)}
        onYes={async () => { await remove(modal.row.id); toast('Đã xóa'); }} />}
    </>
  );
}
