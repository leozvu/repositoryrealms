'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useResource, Icon, FormModal, ConfirmDialog, Badge, Forbidden, useToast } from '@/components/ui';
import { money, moneyC, CURRENCIES, fmtDate, todayISO, monthKey } from '@/lib/format';
import { transactionAmountVnd } from '@/lib/money';
import { financialConversionIssues, invoiceReceivableVnd, transactionTotalsVnd } from '@/lib/financial-reporting';
import FinancialIntelligencePanel from '@/components/finance/FinancialIntelligencePanel';
import PageHeader from '@/components/system/PageHeader';
import DataTable from '@/components/system/DataTable';
import StatePanel from '@/components/system/StatePanel';

const CATEGORIES = ['Doanh thu dịch vụ', 'Doanh thu khác', 'Lương nhân sự', 'Ngân sách quảng cáo', 'Văn phòng', 'Công cụ / phần mềm', 'Marketing nội bộ', 'Thuế / phí', 'Khác'];
const ledgerAmountVnd = transaction => {
  try { return transactionAmountVnd(transaction); }
  catch (error) { if (error instanceof RangeError) return null; throw error; }
};
const displayVnd = value => value === null ? 'Chưa thể quy đổi' : money(value);

export default function FinancePage() {
  const { rows, forbidden, create, update, remove } = useResource('transactions');
  const projects = useResource('projects');
  const invoices = useResource('invoices');
  const bills = useResource('vendorbills');
  const [typeFilter, setTypeFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState('all');
  const [modal, setModal] = useState(null);
  const [intelligence, setIntelligence] = useState(null);
  const [intelligenceLoading, setIntelligenceLoading] = useState(true);
  const [intelligenceError, setIntelligenceError] = useState('');
  const [intelligenceRefresh, setIntelligenceRefresh] = useState(0);
  const toast = useToast();

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    setIntelligenceLoading(true);
    setIntelligenceError('');
    fetch('/api/finance/intelligence', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Không thể tải phân tích tài chính.');
        if (active) setIntelligence(payload.financialIntelligence);
      })
      .catch((error) => {
        if (!active) return;
        setIntelligenceError(error?.name === 'AbortError' ? 'Hệ thống phản hồi quá lâu. Hãy thử tải lại.' : error.message);
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (active) setIntelligenceLoading(false);
      });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [intelligenceRefresh]);

  const projectName = (id) => projects.rows.find((project) => project.id === id)?.name || 'Không thuộc dự án';
  const months = [...new Set(rows.map((transaction) => monthKey(transaction.date)))].sort().reverse();
  const visible = rows
    .filter((transaction) => (typeFilter === 'all' || transaction.type === typeFilter)
      && (monthFilter === 'all' || monthKey(transaction.date) === monthFilter))
    .sort((a, b) => b.date.localeCompare(a.date));
  const conversionIssues = financialConversionIssues({ transactions: visible, invoices: invoices.rows });
  const ledgerValid = !conversionIssues.some(issue => issue.resource === 'transactions');
  const { income, expense, balance } = ledgerValid ? transactionTotalsVnd(visible) : { income: null, expense: null, balance: null };
  const overdueInvoices = invoices.rows.filter((invoice) => !['paid', 'draft', 'void'].includes(invoice.status)
    && invoice.dueDate && invoice.dueDate < todayISO());
  const payable = bills.rows.filter((bill) => bill.status !== 'paid').reduce((sum, bill) => sum + (bill.amount || 0), 0);
  const receivable = conversionIssues.some(issue => issue.resource === 'invoices') ? null : invoices.rows.filter((invoice) => !['paid', 'draft', 'void'].includes(invoice.status))
    .reduce((sum, invoice) => sum + invoiceReceivableVnd(invoice), 0);

  const fields = [
    { key: 'type', label: 'Loại', type: 'select', options: [{ value: 'income', label: 'Khoản thu' }, { value: 'expense', label: 'Khoản chi' }], required: true },
    { key: 'amount', label: 'Số tiền nguyên tệ', type: 'number', required: true },
    { key: 'currency', label: 'Đồng tiền', type: 'select', required: true, options: Object.keys(CURRENCIES).map(value => ({ value, label: value })) },
    { key: 'fxRate', label: 'Tỷ giá ghi sổ (VND / 1 đơn vị tiền)', type: 'number', required: true, hint: 'Giao dịch VND luôn được tính theo tỷ giá 1.' },
    { key: 'category', label: 'Danh mục', type: 'select', options: CATEGORIES.map((category) => ({ value: category, label: category })) },
    { key: 'date', label: 'Ngày', type: 'date', required: true },
    { key: 'projectId', label: 'Thuộc dự án', type: 'select', options: [{ value: '', label: 'Không thuộc dự án' }, ...projects.rows.map((project) => ({ value: project.id, label: project.name }))] },
    { key: 'desc', label: 'Diễn giải', type: 'textarea', full: true },
  ];

  const columns = useMemo(() => [
    { accessorKey: 'date', header: 'Ngày', size: 110, cell: ({ row }) => fmtDate(row.original.date) },
    { accessorKey: 'type', header: 'Loại', size: 100, cell: ({ row }) => <Badge map="tx" k={row.original.type} />, meta: { exportValue: (row) => row.type === 'income' ? 'Thu' : 'Chi' } },
    { accessorKey: 'category', header: 'Danh mục', size: 180 },
    { accessorKey: 'desc', header: 'Diễn giải', size: 280, cell: ({ row }) => row.original.desc || 'Chưa có diễn giải' },
    { id: 'project', header: 'Dự án', size: 180, cell: ({ row }) => projectName(row.original.projectId), meta: { exportValue: (row) => projectName(row.projectId) } },
    {
      id: 'amount', accessorFn: ledgerAmountVnd, header: 'Số tiền (VND)', size: 180,
      cell: ({ row }) => <div><strong className={row.original.type === 'income' ? 'amount-income' : 'amount-expense'}>{row.original.type === 'income' ? '+' : '−'}{displayVnd(ledgerAmountVnd(row.original))}</strong>{row.original.currency && row.original.currency !== 'VND' && <div className="cell-sub">{moneyC(row.original.amount, row.original.currency)} · tỷ giá {row.original.fxRate ?? 'chưa có'}</div>}</div>,
      meta: { exportValue: (row) => ledgerAmountVnd(row) === null ? '' : (row.type === 'income' ? 1 : -1) * ledgerAmountVnd(row) },
    },
    {
      id: 'actions', header: '', size: 80, enableSorting: false, enableHiding: false, meta: { export: false },
      cell: ({ row }) => (
        <div className="row-actions">
          <button className="icon-btn" onClick={() => setModal({ mode: 'edit', row: row.original })} aria-label={`Sửa giao dịch ${row.original.desc || row.original.category}`}><Icon name="edit" size={16} /></button>
          <button className="icon-btn danger" onClick={() => setModal({ mode: 'del', row: row.original })} aria-label={`Xóa giao dịch ${row.original.desc || row.original.category}`}><Icon name="trash" size={16} /></button>
        </div>
      ),
    },
  ], [projects.rows]);

  if (forbidden) return <Forbidden />;

  return (
    <div className="finance-home">
      <PageHeader
        icon="finance"
        meta="Tài chính"
        title="Dòng tiền và việc cần xử lý"
        description="Ưu tiên thu tiền, ngoại lệ và kiểm soát. Sổ giao dịch nằm ngay bên dưới để tra cứu và chỉnh sửa."
        actions={<button className="btn btn-primary" onClick={() => setModal({ mode: 'add' })}><Icon name="plus" size={16} />Ghi thu hoặc chi</button>}
      />

      {conversionIssues.length > 0 && <StatePanel compact state="error" title="Chưa thể tổng hợp tiền VND" description={`${conversionIssues.length} bản ghi có số tiền hoặc tỷ giá không hợp lệ. Sửa bản ghi gốc để cập nhật tổng; không thay tỷ giá thiếu bằng 1.`} />}

      {overdueInvoices.length > 0 && (
        <StatePanel
          compact
          state="error"
          title={`${overdueInvoices.length} hóa đơn đã quá hạn`}
          description={`Tổng phải thu hiện tại: ${displayVnd(receivable)}. Mở danh sách để xử lý thu tiền.`}
          action={<Link className="btn btn-outline btn-sm" href="/invoices">Mở phải thu</Link>}
        />
      )}

      <section className="finance-pulse" aria-label="Tóm tắt tài chính theo bộ lọc">
        <div><span>Thu theo bộ lọc (VND)</span><strong className="amount-income">{displayVnd(income)}</strong></div>
        <div><span>Chi theo bộ lọc (VND)</span><strong className="amount-expense">{displayVnd(expense)}</strong></div>
        <div><span>Chênh lệch</span><strong>{displayVnd(balance)}</strong></div>
        <div><span>Phải trả nhà cung cấp</span><strong>{money(payable)}</strong></div>
      </section>

      <FinancialIntelligencePanel
        intelligence={intelligence}
        loading={intelligenceLoading}
        error={intelligenceError}
        onRetry={() => setIntelligenceRefresh((value) => value + 1)}
      />

      <section className="finance-ledger-section" aria-labelledby="finance-ledger-title">
        <div className="section-heading-row">
          <div><h2 id="finance-ledger-title">Sổ giao dịch</h2><p>Mọi thay đổi vẫn ghi vào nguồn dữ liệu ERP hiện tại.</p></div>
          <div className="ledger-filters">
            <select aria-label="Lọc loại giao dịch" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="all">Thu và chi</option><option value="income">Chỉ thu</option><option value="expense">Chỉ chi</option>
            </select>
            <select aria-label="Lọc tháng giao dịch" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)}>
              <option value="all">Tất cả các tháng</option>
              {months.map((month) => <option key={month} value={month}>Tháng {month.slice(5)}/{month.slice(0, 4)}</option>)}
            </select>
          </div>
        </div>
        <DataTable
          data={visible}
          columns={columns}
          storageKey="finance-transactions"
          searchPlaceholder="Tìm giao dịch"
          emptyTitle="Chưa có giao dịch"
          emptyDescription="Ghi khoản thu hoặc chi đầu tiên để bắt đầu sổ."
          fileName={`so-giao-dich-${monthFilter}.csv`}
          actions={<button className="btn btn-primary btn-sm" onClick={() => setModal({ mode: 'add' })}><Icon name="plus" size={15} />Ghi giao dịch</button>}
          renderMobile={(transaction) => (
            <article className="mobile-record" key={transaction.id}>
              <div><Badge map="tx" k={transaction.type} /><time>{fmtDate(transaction.date)}</time></div>
              <strong>{transaction.desc || transaction.category}</strong>
              <span className={transaction.type === 'income' ? 'amount-income' : 'amount-expense'}>{transaction.type === 'income' ? '+' : '−'}{displayVnd(ledgerAmountVnd(transaction))}</span>
              {transaction.currency && transaction.currency !== 'VND' && <span>{moneyC(transaction.amount, transaction.currency)} · tỷ giá {transaction.fxRate ?? 'chưa có'}</span>}
              <button className="btn btn-outline btn-sm" onClick={() => setModal({ mode: 'edit', row: transaction })}>Mở</button>
            </article>
          )}
        />
      </section>

      {modal?.mode === 'add' && (
        <FormModal
          title="Ghi thu hoặc chi"
          fields={fields}
          data={{ type: 'expense', date: todayISO(), category: 'Khác', currency: 'VND', fxRate: 1 }}
          onClose={() => setModal(null)}
          onSave={async (data) => {
            if (ledgerAmountVnd(data) === null) { toast('Số tiền hoặc tỷ giá không hợp lệ.', 'error'); return false; }
            if (data.currency === 'VND') data.fxRate = 1;
            const result = await create({ ...data, projectId: data.projectId || null });
            if (result) toast(result._notice || 'Đã ghi sổ', result._blocked ? 'error' : 'success');
          }}
        />
      )}
      {modal?.mode === 'edit' && (
        <FormModal
          title="Sửa giao dịch"
          fields={fields}
          data={{ ...modal.row, currency: modal.row.currency || 'VND', fxRate: modal.row.fxRate ?? (!modal.row.currency || modal.row.currency === 'VND' ? 1 : ''), projectId: modal.row.projectId || '' }}
          onClose={() => setModal(null)}
          onSave={async (data) => {
            if (ledgerAmountVnd(data) === null) { toast('Số tiền hoặc tỷ giá không hợp lệ.', 'error'); return false; }
            if (data.currency === 'VND') data.fxRate = 1;
            await update(modal.row.id, { ...data, projectId: data.projectId || null });
            toast('Đã cập nhật giao dịch');
          }}
        />
      )}
      {modal?.mode === 'del' && (
        <ConfirmDialog
          msg="Xóa giao dịch này khỏi sổ quỹ? Hành động sẽ được ghi lại trong nhật ký."
          onClose={() => setModal(null)}
          onYes={async () => { await remove(modal.row.id); toast('Đã xóa giao dịch'); }}
        />
      )}
    </div>
  );
}
