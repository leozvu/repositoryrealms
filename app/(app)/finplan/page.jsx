'use client';
import { useState } from 'react';
import { useResource, Icon, FormModal, ConfirmDialog, EmptyState, Forbidden, useToast } from '@/components/ui';
import { money, moneyShort, fmtDate, todayISO, thisMonth, monthKey, remainOf, localISO } from '@/lib/format';

const CATEGORIES = ['Lương nhân sự', 'Ngân sách quảng cáo', 'Văn phòng', 'Công cụ / phần mềm', 'Marketing nội bộ', 'Thanh toán nhà cung cấp', 'Thuế / phí', 'Khác'];

// Số ngày quá hạn → nhóm aging
const bucketOf = due => {
  if (!due) return null;
  const days = Math.floor((new Date(todayISO()) - new Date(due)) / 86400000);
  if (days <= 0) return 'current';
  if (days <= 30) return 'd30';
  if (days <= 60) return 'd60';
  if (days <= 90) return 'd90';
  return 'd90plus';
};
const BUCKETS = [['current', 'Trong hạn'], ['d30', 'Quá 1–30 ngày'], ['d60', '31–60 ngày'], ['d90', '61–90 ngày'], ['d90plus', 'Trên 90 ngày']];

export default function FinPlanPage() {
  const invoices = useResource('invoices');
  const bills = useResource('vendorbills');
  const vendors = useResource('vendors');
  const clients = useResource('clients');
  const budgets = useResource('budgets');
  const transactions = useResource('transactions');
  const users = useResource('users');
  const [m, setM] = useState(thisMonth());
  const [modal, setModal] = useState(null);
  const toast = useToast();
  if (invoices.forbidden || budgets.forbidden) return <Forbidden />;

  const cName = id => clients.rows.find(c => c.id === id)?.name || '—';
  const vName = id => vendors.rows.find(v => v.id === id)?.name || '—';

  /* ---------- AR / AP aging ---------- */
  const ar = invoices.rows.filter(v => !['paid', 'draft'].includes(v.status) && remainOf(v) > 0)
    .map(v => ({ code: v.code, who: cName(v.clientId), due: v.dueDate, amount: remainOf(v), bucket: bucketOf(v.dueDate) }));
  const ap = bills.rows.filter(b => b.status !== 'paid')
    .map(b => ({ code: b.code, who: vName(b.vendorId), due: b.dueDate, amount: b.amount, bucket: bucketOf(b.dueDate) }));
  const sumBucket = (list, b) => list.filter(x => x.bucket === b).reduce((s, x) => s + x.amount, 0);

  /* ---------- Ngân sách vs thực tế ---------- */
  const monthBudgets = budgets.rows.filter(b => b.month === m);
  const actualOf = cat => transactions.rows.filter(t => t.type === 'expense' && monthKey(t.date) === m && t.category === cat).reduce((s, t) => s + t.amount, 0);

  /* ---------- Dự báo dòng tiền 3 tháng ---------- */
  const payrollMonthly = users.rows.filter(u => u.status === 'active').reduce((s, u) => s + Math.round((u.salary || 0) * 1.215), 0);
  const fixedAvg = (() => { // chi phí cố định trung bình 3 tháng gần nhất (trừ lương + NCC đã tính riêng)
    const keys = [];
    for (let i = -2; i <= 0; i++) { const d = new Date(); d.setMonth(d.getMonth() + i); keys.push(localISO(d).slice(0, 7)); }
    const total = transactions.rows.filter(t => t.type === 'expense' && keys.includes(monthKey(t.date)) && !['Lương nhân sự', 'Thanh toán nhà cung cấp'].includes(t.category)).reduce((s, t) => s + t.amount, 0);
    return Math.round(total / 3);
  })();
  const forecast = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(); d.setMonth(d.getMonth() + i);
    const k = localISO(d).slice(0, 7);
    const inflow = invoices.rows.filter(v => !['paid', 'draft'].includes(v.status) && monthKey(v.dueDate) === k).reduce((s, v) => s + remainOf(v), 0)
      + invoices.rows.filter(v => v.recurring && v.status === 'paid' && i > 0).reduce((s, v) => 0 + s, 0);
    const outVendor = bills.rows.filter(b => b.status !== 'paid' && monthKey(b.dueDate) === k).reduce((s, b) => s + b.amount, 0);
    const outflow = outVendor + payrollMonthly + fixedAvg;
    forecast.push({ k, label: `Tháng ${+k.slice(5)}/${k.slice(0, 4)}`, inflow, outflow, net: inflow - outflow });
  }

  const BUDGET_FIELDS = [
    { key: 'category', label: 'Danh mục chi', type: 'select', options: CATEGORIES.map(c => ({ value: c, label: c })), required: true },
    { key: 'amount', label: 'Ngân sách tháng (đ)', type: 'number', required: true },
  ];

  return (
    <>
      {/* ============ CÔNG NỢ ============ */}
      <div className="grid two-col">
        {[['PHẢI THU (khách nợ mình)', ar, 'var(--accent)'], ['PHẢI TRẢ (mình nợ NCC)', ap, 'var(--danger)']].map(([title, list, color]) => (
          <div className="card" key={title}>
            <div className="card-head"><span className="card-title">{title}</span>
              <b style={{ color }}>{money(list.reduce((s, x) => s + x.amount, 0))}</b></div>
            <div className="card-body" style={{ paddingTop: 10 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                {BUCKETS.map(([b, label]) => {
                  const val = sumBucket(list, b);
                  return <div key={b} className="detail-stat" style={{ flex: 1, minWidth: 90, ...(b !== 'current' && val > 0 ? { outline: '1px solid var(--danger-soft)' } : {}) }}>
                    <b style={{ fontSize: '.85rem', color: b === 'current' ? 'inherit' : val > 0 ? 'var(--danger)' : 'inherit' }}>{moneyShort(val)}</b><span>{label}</span></div>;
                })}
              </div>
              {list.length ? (
                <table style={{ minWidth: 0, fontSize: '.82rem' }}>
                  <tbody>{list.sort((a, b) => (a.due || '').localeCompare(b.due || '')).map((x, i) => (
                    <tr key={i}><td><b>{x.code}</b> · {x.who}</td>
                      <td style={x.bucket !== 'current' ? { color: 'var(--danger)', fontWeight: 600 } : {}}>{fmtDate(x.due)}</td>
                      <td className="num" style={{ fontWeight: 700 }}>{money(x.amount)}</td></tr>))}</tbody>
                </table>
              ) : <EmptyState title="Không có khoản nào" />}
            </div>
          </div>
        ))}
      </div>

      {/* ============ NGÂN SÁCH ============ */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><span className="card-title">Ngân sách chi tiêu vs thực tế</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <select className="filter" value={m} onChange={e => setM(e.target.value)} style={{ padding: '5px 28px 5px 10px' }}>
              {[-1, 0, 1].map(i => { const d = new Date(); d.setMonth(d.getMonth() + i); const k = localISO(d).slice(0, 7); return <option key={k} value={k}>Tháng {+k.slice(5)}/{k.slice(0, 4)}</option>; })}
            </select>
            <button className="btn btn-outline btn-sm" onClick={() => setModal({ mode: 'addBudget' })}><Icon name="plus" size={14} /> Đặt ngân sách</button>
          </div>
        </div>
        <div className="card-body">
          {monthBudgets.length ? monthBudgets.map(b => {
            const actual = actualOf(b.category);
            const pct = b.amount ? Math.round(actual / b.amount * 100) : 0;
            return (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 0', fontSize: '.84rem' }}>
                <span style={{ width: 190, fontWeight: 600 }}>{b.category}</span>
                <div style={{ flex: 1, background: 'var(--muted-bg)', height: 20, borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
                  <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: pct > 100 ? 'var(--danger)' : pct > 80 ? '#D97706' : 'var(--accent)', borderRadius: 6 }}></div>
                </div>
                <span style={{ width: 200, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  <b style={{ color: pct > 100 ? 'var(--danger)' : 'inherit' }}>{money(actual)}</b>
                  <span style={{ color: 'var(--muted)' }}> / {money(b.amount)} ({pct}%)</span></span>
                <button className="icon-btn danger" onClick={() => setModal({ mode: 'delBudget', row: b })} aria-label="Xóa"><Icon name="trash" size={14} /></button>
              </div>
            );
          }) : <EmptyState title="Chưa đặt ngân sách tháng này" sub="Đặt hạn mức cho từng danh mục chi — vượt 80% chuyển cam, vượt 100% chuyển đỏ" />}
        </div>
      </div>

      {/* ============ DỰ BÁO DÒNG TIỀN ============ */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><span className="card-title">Dự báo dòng tiền 3 tháng tới</span></div>
        <div className="table-wrap" style={{ border: 'none', boxShadow: 'none' }}>
          <table>
            <thead><tr><th>Tháng</th><th className="num">Dự thu (hóa đơn đến hạn)</th><th className="num">Dự chi (NCC + lương + cố định)</th><th className="num">Chênh lệch</th></tr></thead>
            <tbody>{forecast.map(f => (
              <tr key={f.k}>
                <td><b>{f.label}</b></td>
                <td className="num" style={{ color: 'var(--accent)' }}>{money(f.inflow)}</td>
                <td className="num" style={{ color: 'var(--danger)' }}>{money(f.outflow)}</td>
                <td className="num" style={{ fontWeight: 800, color: f.net >= 0 ? 'var(--accent)' : 'var(--danger)' }}>{f.net >= 0 ? '+' : ''}{money(f.net)}</td>
              </tr>))}</tbody>
          </table>
        </div>
        <p style={{ fontSize: '.74rem', color: 'var(--muted)', padding: '0 18px 14px' }}>
          Dự thu = hóa đơn chưa thu theo hạn thanh toán. Dự chi = hóa đơn NCC đến hạn + quỹ lương (kèm 21.5% BH) + trung bình chi phí cố định 3 tháng.
          Con số âm = tháng đó cần chuẩn bị tiền mặt hoặc đẩy nhanh thu hồi nợ.
        </p>
      </div>

      {modal?.mode === 'addBudget' && <FormModal title={`Đặt ngân sách tháng ${+m.slice(5)}/${m.slice(0, 4)}`} fields={BUDGET_FIELDS}
        onClose={() => setModal(null)} onSave={async d => {
          const r = await budgets.create({ month: m, category: d.category, amount: +d.amount || 0 });
          if (r) toast('Đã đặt ngân sách');
        }} />}
      {modal?.mode === 'delBudget' && <ConfirmDialog msg={`Xóa ngân sách "${modal.row.category}"?`}
        onClose={() => setModal(null)} onYes={async () => { await budgets.remove(modal.row.id); toast('Đã xóa'); }} />}
    </>
  );
}
