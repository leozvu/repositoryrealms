'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useResource, Icon, ConfirmDialog, Badge, Forbidden, useToast } from '@/components/ui';
import { printDoc } from '@/components/DocEditor';
import { SendEmailModal } from '@/components/SendEmail';
import { money, fmtDate, docGrand } from '@/lib/format';
import { hasAny } from '@/lib/perm';
import PageHeader from '@/components/system/PageHeader';
import DataTable from '@/components/system/DataTable';

export default function QuotesPage() {
  const { data: session } = useSession();
  const canWrite = hasAny(session?.user, ['AM']);
  const { rows, forbidden, remove, refresh } = useResource('quotes');
  const invoices = useResource('invoices');
  const projects = useResource('projects');
  const clients = useResource('clients');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modal, setModal] = useState(null);
  const toast = useToast();
  const router = useRouter();

  const client = (id) => clients.rows.find((row) => row.id === id);
  const projectName = (id) => projects.rows.find((project) => project.id === id)?.name || 'Chưa gắn dự án';
  const filtered = rows.filter((quote) => statusFilter === 'all' || quote.status === statusFilter);

  const convert = async (quote, target) => {
    const response = await fetch(`/api/quotes/${quote.id}/convert`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: target }),
    });
    const body = await response.json().catch(() => ({}));
    setModal(null);
    if (!response.ok) {
      toast(body.error || 'Không thể chuyển báo giá', 'error');
      return null;
    }
    await Promise.all([invoices.refresh(), projects.refresh(), refresh()]);
    return body;
  };

  const toInvoice = async (quote) => {
    const result = await convert(quote, 'invoice');
    if (result?.code) toast(result.projectId
      ? `Đã tạo hóa đơn ${result.code} và gắn vào ${projectName(result.projectId)}`
      : `Đã tạo hóa đơn ${result.code}. Hóa đơn chưa gắn dự án.`);
  };

  const toProject = async (quote) => {
    const result = await convert(quote, 'project');
    if (result?.id) toast('Đã tạo dự án từ báo giá. Hãy kiểm tra tên và hạn cam kết.');
  };

  const columns = useMemo(() => [
    { accessorKey: 'code', header: 'Mã', size: 120, cell: ({ row }) => <button className="record-link-button" onClick={() => router.push(`/quotes/${row.original.id}`)}>{row.original.code}</button> },
    { id: 'client', header: 'Khách hàng', size: 220, cell: ({ row }) => client(row.original.clientId)?.name || 'Không xác định', meta: { exportValue: (row) => client(row.clientId)?.name || '' } },
    { accessorKey: 'date', header: 'Ngày lập', size: 120, cell: ({ row }) => fmtDate(row.original.date) },
    { id: 'total', header: 'Tổng tiền', size: 150, cell: ({ row }) => <strong>{money(docGrand(row.original))}</strong>, meta: { exportValue: (row) => docGrand(row) } },
    { accessorKey: 'status', header: 'Trạng thái', size: 130, cell: ({ row }) => <Badge map="quote" k={row.original.status} /> },
    {
      id: 'actions', header: '', size: 220, enableSorting: false, enableHiding: false, meta: { export: false },
      cell: ({ row }) => {
        const quote = row.original;
        return (
          <div className="row-actions">
            {canWrite && <button className="icon-btn" title="Chuyển thành hóa đơn" onClick={() => setModal({ mode: 'toinv', row: quote })}><Icon name="invoices" size={16} /></button>}
            {canWrite && quote.status === 'accepted' && <button className="icon-btn" title="Tạo dự án" onClick={() => setModal({ mode: 'toproj', row: quote })}><Icon name="projects" size={16} /></button>}
            {canWrite && <button className="icon-btn" title="Gửi email" onClick={() => setModal({ mode: 'email', row: quote })}><Icon name="mail" size={16} /></button>}
            <button className="icon-btn" title="In hoặc xuất PDF" onClick={() => printDoc(quote, 'quote', client(quote.clientId)?.name || '', client(quote.clientId) || {})}><Icon name="print" size={16} /></button>
            {canWrite && <button className="icon-btn" title="Mở trình soạn" onClick={() => router.push(`/quotes/${quote.id}`)}><Icon name="edit" size={16} /></button>}
            {canWrite && <button className="icon-btn danger" title="Xóa" onClick={() => setModal({ mode: 'del', row: quote })}><Icon name="trash" size={16} /></button>}
          </div>
        );
      },
    },
  ], [canWrite, clients.rows, projects.rows, router]);

  if (forbidden) return <Forbidden />;

  return (
    <div className="record-index-page">
      <PageHeader
        icon="quotes"
        meta="Bán hàng"
        title="Báo giá và cam kết thương mại"
        description="Soạn, gửi, theo dõi chấp nhận và chuyển thành dự án hoặc hóa đơn từ một nơi."
        actions={canWrite && <button className="btn btn-primary" onClick={() => {
          if (!clients.rows.length) return toast('Hãy thêm khách hàng trước', 'error');
          router.push('/quotes/new');
        }}><Icon name="plus" size={16} />Tạo báo giá</button>}
      />
      <div className="index-filter-row">
        <label>Trạng thái
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">Tất cả</option><option value="draft">Nháp</option><option value="sent">Đã gửi</option><option value="accepted">Chấp nhận</option><option value="rejected">Từ chối</option>
          </select>
        </label>
      </div>
      <DataTable
        data={filtered}
        columns={columns}
        storageKey="quotes"
        searchPlaceholder="Tìm mã hoặc khách hàng"
        emptyTitle="Chưa có báo giá"
        emptyDescription="Tạo báo giá đầu tiên để bắt đầu quy trình thương mại."
        fileName="bao-gia.csv"
        actions={canWrite && <button className="btn btn-primary btn-sm" onClick={() => router.push('/quotes/new')}><Icon name="plus" size={15} />Tạo báo giá</button>}
        renderMobile={(quote) => (
          <article className="mobile-record" key={quote.id}>
            <div><Badge map="quote" k={quote.status} /><time>{fmtDate(quote.date)}</time></div>
            <strong>{quote.code} · {client(quote.clientId)?.name || 'Không xác định'}</strong>
            <span>{money(docGrand(quote))}</span>
            <button className="btn btn-outline btn-sm" onClick={() => router.push(`/quotes/${quote.id}`)}>Mở</button>
          </article>
        )}
      />

      {modal?.mode === 'toinv' && <ConfirmDialog yesLabel="Tạo hóa đơn" msg={`Tạo hóa đơn từ báo giá ${modal.row.code} (${money(docGrand(modal.row))})?`} onClose={() => setModal(null)} onYes={() => toInvoice(modal.row)} />}
      {modal?.mode === 'toproj' && <ConfirmDialog yesLabel="Tạo dự án" msg={`Tạo dự án mới từ báo giá ${modal.row.code}?`} onClose={() => setModal(null)} onYes={() => toProject(modal.row)} />}
      {modal?.mode === 'del' && <ConfirmDialog msg={`Xóa báo giá ${modal.row.code}?`} onClose={() => setModal(null)} onYes={async () => { await remove(modal.row.id); toast('Đã xóa báo giá'); }} />}
      {modal?.mode === 'email' && <SendEmailModal type="quote" doc={modal.row} defaultTo={client(modal.row.clientId)?.email || ''} onClose={() => setModal(null)} />}
    </div>
  );
}
