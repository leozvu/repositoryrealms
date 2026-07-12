'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useResource, Icon, ConfirmDialog, EmptyState, Badge, Forbidden, useToast } from '@/components/ui';
import DocEditor, { printDoc, nextCode } from '@/components/DocEditor';
import { money, fmtDate, todayISO, daysFromNow, docGrand } from '@/lib/format';
import { hasAny } from '@/lib/perm';

export default function QuotesPage() {
  const { data: session } = useSession();
  const canW = hasAny(session?.user, ['AM']);
  const { rows, forbidden, create, update, remove } = useResource('quotes');
  const invoices = useResource('invoices');
  const projects = useResource('projects');
  const clients = useResource('clients');
  const services = useResource('services');
  const [f, setF] = useState('all');
  const [modal, setModal] = useState(null);
  const toast = useToast();
  if (forbidden) return <Forbidden />;

  const client = id => clients.rows.find(c => c.id === id);
  const filtered = rows.filter(v => f === 'all' || v.status === f);

  const toInvoice = async q => {
    const r = await invoices.create({
      code: nextCode('INV', invoices.rows), clientId: q.clientId, projectId: null,
      items: q.items, vat: q.vat, status: 'draft', date: todayISO(), dueDate: daysFromNow(15),
      payments: '[]', recurring: false,
    });
    if (r) toast(`Đã tạo hóa đơn từ báo giá ${q.code} — xem ở mục Hóa đơn`);
    setModal(null);
  };
  const toProject = async q => {
    const r = await projects.create({
      name: 'Dự án từ ' + q.code, clientId: q.clientId, service: 'Khác',
      budget: docGrand(q), status: 'planning', startDate: todayISO(), deadline: daysFromNow(30), progress: 0,
    });
    if (r) toast('Đã tạo dự án — hãy sửa tên và deadline cho đúng');
    setModal(null);
  };

  return (
    <>
      <div className="toolbar">
        <select className="filter" value={f} onChange={e => setF(e.target.value)}>
          <option value="all">Tất cả trạng thái</option>
          <option value="draft">Nháp</option><option value="sent">Đã gửi</option>
          <option value="accepted">Chấp nhận</option><option value="rejected">Từ chối</option>
        </select>
        <div className="spacer"></div>
        {canW && <button className="btn btn-primary" onClick={() => {
          if (!clients.rows.length) return toast('Hãy thêm khách hàng trước', 'error');
          setModal({ mode: 'add' });
        }}><Icon name="plus" size={16} /><span>Tạo báo giá</span></button>}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Mã</th><th>Khách hàng</th><th>Ngày lập</th><th className="num">Tổng tiền</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>
            {filtered.map(v => (
              <tr key={v.id}>
                <td><span className="cell-main">{v.code}</span></td>
                <td>{client(v.clientId)?.name || '—'}</td>
                <td>{fmtDate(v.date)}</td>
                <td className="num" style={{ fontWeight: 700 }}>{money(docGrand(v))}</td>
                <td><Badge map="quote" k={v.status} /></td>
                <td><div className="row-actions">
                  {canW && <button className="icon-btn" style={{ color: 'var(--primary)' }} title="Chuyển thành hóa đơn"
                    onClick={() => setModal({ mode: 'toinv', row: v })}><Icon name="invoices" size={16} /></button>}
                  {canW && v.status === 'accepted' && <button className="icon-btn" title="Tạo dự án từ báo giá"
                    onClick={() => setModal({ mode: 'toproj', row: v })}><Icon name="projects" size={16} /></button>}
                  <button className="icon-btn" title="In / xuất PDF" onClick={() => printDoc(v, 'quote', client(v.clientId)?.name || '', client(v.clientId) || {})}><Icon name="print" size={16} /></button>
                  {canW && <button className="icon-btn" onClick={() => setModal({ mode: 'edit', row: v })} aria-label="Sửa"><Icon name="edit" size={16} /></button>}
                  {canW && <button className="icon-btn danger" onClick={() => setModal({ mode: 'del', row: v })} aria-label="Xóa"><Icon name="trash" size={16} /></button>}
                </div></td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={6}><EmptyState title="Chưa có báo giá" sub="Tạo báo giá gửi khách — chấp nhận rồi thì chuyển thành hóa đơn/dự án 1 nút" /></td></tr>}
          </tbody>
        </table>
      </div>
      {modal?.mode === 'add' && <DocEditor kind="quote" doc={null} clients={clients.rows} services={services.rows} allDocs={rows}
        onClose={() => setModal(null)} onSave={async d => { const r = await create(d); if (r) toast(r._notice || 'Đã tạo báo giá', r._notice ? 'error' : 'success'); }} />}
      {modal?.mode === 'edit' && <DocEditor kind="quote" doc={modal.row} clients={clients.rows} services={services.rows} allDocs={rows}
        onClose={() => setModal(null)} onSave={async d => { const r = await update(modal.row.id, d); if (r) toast(r._notice || 'Đã cập nhật', r._notice ? 'error' : 'success'); }} />}
      {modal?.mode === 'toinv' && <ConfirmDialog yesLabel="Tạo hóa đơn" msg={`Tạo hóa đơn từ báo giá ${modal.row.code} (${money(docGrand(modal.row))})?`}
        onClose={() => setModal(null)} onYes={() => toInvoice(modal.row)} />}
      {modal?.mode === 'toproj' && <ConfirmDialog yesLabel="Tạo dự án" msg={`Tạo dự án mới từ báo giá ${modal.row.code}?`}
        onClose={() => setModal(null)} onYes={() => toProject(modal.row)} />}
      {modal?.mode === 'del' && <ConfirmDialog msg={`Xóa báo giá ${modal.row.code}?`}
        onClose={() => setModal(null)} onYes={async () => { await remove(modal.row.id); toast('Đã xóa'); }} />}
    </>
  );
}
