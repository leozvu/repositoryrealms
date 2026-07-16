'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useResource, Icon, ConfirmDialog, EmptyState, Badge, Forbidden, useToast } from '@/components/ui';
import DocEditor, { printDoc } from '@/components/DocEditor';
import { SendEmailModal } from '@/components/SendEmail';
import { money, fmtDate, docGrand } from '@/lib/format';
import { hasAny } from '@/lib/perm';

export default function QuotesPage() {
  const { data: session } = useSession();
  const canW = hasAny(session?.user, ['AM']);
  const { rows, forbidden, create, update, remove, refresh } = useResource('quotes');
  const invoices = useResource('invoices');
  const projects = useResource('projects');
  const clients = useResource('clients');
  const services = useResource('services');
  const [f, setF] = useState('all');
  const [modal, setModal] = useState(null);
  const toast = useToast();
  if (forbidden) return <Forbidden />;

  const client = id => clients.rows.find(c => c.id === id);
  const projName = id => projects.rows.find(p => p.id === id)?.name || '—';
  const filtered = rows.filter(v => f === 'all' || v.status === f);

  // v3.15: đi qua /api/quotes/[id]/convert thay vì CRUD chung.
  // Bản cũ gọi invoices.create()/projects.create() → /api/data/*, mà invoices.write=['ACCOUNTANT']
  // và projects.write=['PM'] → AM bấm là 403. Hai nút này sinh ra CHO AM (người chốt deal)
  // nhưng chỉ Giám đốc dùng được, và lỗi im lặng nên không ai báo.
  // Không mở quyền ghi hóa đơn/dự án cho AM (sẽ thành tự xuất hóa đơn không qua Kế toán,
  // tự mở dự án không qua PM) — chỉ mở đúng hành động "chuyển từ báo giá".
  const convert = async (q, to) => {
    const res = await fetch(`/api/quotes/${q.id}/convert`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to }),
    });
    const j = await res.json().catch(() => ({}));
    setModal(null);
    if (!res.ok) return toast(j.error || 'Có lỗi', 'error');
    await Promise.all([invoices.refresh(), projects.refresh(), refresh()]);
    return j;
  };
  const toInvoice = async q => {
    const j = await convert(q, 'invoice');
    if (j?.code) toast(j.projectId
      ? `Đã tạo hóa đơn ${j.code} từ ${q.code}, gắn vào dự án "${projName(j.projectId)}"`
      : `Đã tạo hóa đơn ${j.code} từ báo giá ${q.code} — chưa gắn dự án nào (tạo dự án từ báo giá này trước nếu muốn theo dõi lãi/lỗ theo dự án)`);
  };
  const toProject = async q => {
    const j = await convert(q, 'project');
    if (j?.id) toast('Đã tạo dự án — hãy sửa tên và deadline cho đúng. Hóa đơn xuất từ báo giá này sẽ tự gắn vào dự án đó.');
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
                  {canW && <button className="icon-btn" title="Gửi email cho khách" aria-label={`Gửi email báo giá ${v.code}`}
                    onClick={() => setModal({ mode: 'email', row: v })}><Icon name="mail" size={16} /></button>}
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
      {modal?.mode === 'email' && <SendEmailModal type="quote" doc={modal.row} defaultTo={client(modal.row.clientId)?.email || ''} onClose={() => setModal(null)} />}
    </>
  );
}
