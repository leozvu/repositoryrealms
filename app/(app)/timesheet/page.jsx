'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useResource, Icon, FormModal, ConfirmDialog, EmptyState, ExportCsv, useToast } from '@/components/ui';
import { money, fmtDate, todayISO, thisMonth, monthKey, hourRate, initials } from '@/lib/format';
import { hasAny } from '@/lib/perm';

export default function TimesheetPage() {
  const { data: session } = useSession();
  const user = session?.user;
  const isMgmt = hasAny(user, ['PM', 'LEAD', 'HR']); // ghi hộ giờ công
  const seeCost = hasAny(user, ['ACCOUNTANT']);       // chi phí giờ công: Kế toán + GĐ
  const { rows, create, update, remove } = useResource('timelogs');
  const projects = useResource('projects');
  const users = useResource('users');
  const [m, setM] = useState(thisMonth());
  const [modal, setModal] = useState(null);
  const toast = useToast();

  const uName = id => users.rows.find(u => u.id === id)?.name || '—';
  const uSalary = id => users.rows.find(u => u.id === id)?.salary || 0;
  const pName = id => projects.rows.find(p => p.id === id)?.name || '—';
  const months = [...new Set([thisMonth(), ...rows.map(l => monthKey(l.date))])].sort().reverse();
  const visible = rows.filter(l => m === 'all' || monthKey(l.date) === m).sort((a, b) => b.date.localeCompare(a.date));
  const totalH = visible.reduce((s, l) => s + l.hours, 0);
  const billH = visible.filter(l => l.billable).reduce((s, l) => s + l.hours, 0);
  const cost = visible.reduce((s, l) => s + l.hours * hourRate(uSalary(l.userId)), 0);

  const FIELDS = [
    ...(isMgmt ? [{ key: 'userId', label: 'Nhân sự', type: 'select', options: users.rows.filter(u => u.status === 'active').map(u => ({ value: u.id, label: u.name })), required: true }] : []),
    { key: 'projectId', label: 'Dự án', type: 'select', options: projects.rows.map(p => ({ value: p.id, label: p.name })), required: true },
    { key: 'date', label: 'Ngày', type: 'date', required: true },
    { key: 'hours', label: 'Số giờ', type: 'number', required: true, hint: 'VD: 1.5 = 1 giờ 30 phút' },
    { key: 'billable', label: 'Tính phí khách hàng?', type: 'select', options: [{ value: 'yes', label: 'Billable (tính phí)' }, { value: 'no', label: 'Nội bộ' }] },
    { key: 'note', label: 'Ghi chú công việc', type: 'textarea', full: true },
  ];
  const toPayload = d => ({ ...(isMgmt ? { userId: d.userId } : {}), projectId: d.projectId, date: d.date, hours: +d.hours || 0, billable: d.billable === 'yes', note: d.note });

  return (
    <>
      <div className="grid kpi-grid" style={{ marginBottom: 16 }}>
        <div className="card kpi"><span className="kpi-label">{isMgmt ? 'Tổng giờ (cả công ty)' : 'Giờ của tôi'}</span><div className="kpi-value">{totalH}h</div></div>
        <div className="card kpi"><span className="kpi-label">Giờ billable</span><div className="kpi-value" style={{ color: 'var(--accent)' }}>{billH}h</div>
          <div className="kpi-sub">{totalH ? Math.round(billH / totalH * 100) : 0}% billable</div></div>
        {seeCost && <div className="card kpi"><span className="kpi-label">Chi phí giờ công</span><div className="kpi-value">{money(cost)}</div>
          <div className="kpi-sub">Lương ÷ 176h × giờ log</div></div>}
      </div>
      <div className="toolbar">
        <select className="filter" value={m} onChange={e => setM(e.target.value)}>
          {months.map(mo => <option key={mo} value={mo}>Tháng {mo.slice(5)}/{mo.slice(0, 4)}</option>)}
          <option value="all">Tất cả</option>
        </select>
        <div className="spacer"></div>
        <ExportCsv rows={visible} name="gio-cong" cols={[
          { key: 'date', label: 'Ngày' }, { label: 'Nhân sự', value: l => uName(l.userId) },
          { label: 'Dự án', value: l => pName(l.projectId) }, { key: 'hours', label: 'Giờ' },
          { label: 'Tính phí', value: l => l.billable ? 'Billable' : 'Nội bộ' }, { key: 'note', label: 'Ghi chú' },
        ]} />
        <button className="btn btn-primary" onClick={() => {
          if (!projects.rows.length) return toast('Chưa có dự án nào', 'error');
          setModal({ mode: 'add' });
        }}><Icon name="plus" size={16} /><span>Ghi giờ công</span></button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Ngày</th><th>Nhân sự</th><th>Dự án</th><th className="num">Giờ</th><th>Tính phí</th><th>Ghi chú</th><th></th></tr></thead>
          <tbody>
            {visible.map(l => (
              <tr key={l.id}>
                <td>{fmtDate(l.date)}</td>
                <td><span className="cell-person"><span className="avatar">{initials(uName(l.userId))}</span>{uName(l.userId)}</span></td>
                <td>{pName(l.projectId)}</td>
                <td className="num" style={{ fontWeight: 700 }}>{l.hours}h</td>
                <td>{l.billable ? <span className="badge b-green"><span className="dot"></span>Billable</span> : <span className="badge b-gray"><span className="dot"></span>Nội bộ</span>}</td>
                <td>{l.note || '—'}</td>
                <td><div className="row-actions">
                  {(isMgmt || l.userId === user?.id) && <>
                    <button className="icon-btn" onClick={() => setModal({ mode: 'edit', row: l })} aria-label="Sửa"><Icon name="edit" size={16} /></button>
                    <button className="icon-btn danger" onClick={() => setModal({ mode: 'del', row: l })} aria-label="Xóa"><Icon name="trash" size={16} /></button>
                  </>}
                </div></td>
              </tr>
            ))}
            {!visible.length && <tr><td colSpan={7}><EmptyState title="Chưa có giờ công trong kỳ này" sub="Ghi giờ làm việc theo dự án" /></td></tr>}
          </tbody>
        </table>
      </div>
      {modal?.mode === 'add' && <FormModal title="Ghi giờ công" fields={FIELDS} data={{ date: todayISO(), billable: 'yes', hours: 8 }}
        onClose={() => setModal(null)} onSave={async d => { await create(toPayload(d)); toast('Đã ghi giờ công'); }} />}
      {modal?.mode === 'edit' && <FormModal title="Sửa giờ công" fields={FIELDS} data={{ ...modal.row, billable: modal.row.billable ? 'yes' : 'no' }}
        onClose={() => setModal(null)} onSave={async d => { await update(modal.row.id, toPayload(d)); toast('Đã cập nhật'); }} />}
      {modal?.mode === 'del' && <ConfirmDialog msg="Xóa dòng giờ công này?" onClose={() => setModal(null)}
        onYes={async () => { await remove(modal.row.id); toast('Đã xóa'); }} />}
    </>
  );
}
