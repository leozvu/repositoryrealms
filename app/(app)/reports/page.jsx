'use client';
import { useResource, Forbidden, EmptyState } from '@/components/ui';
import { BarChart, DonutChart, Funnel } from '@/components/charts';
import { money, monthKey, hourRate, paidOf, itemsTotal, LEAD_STAGES } from '@/lib/format';

export default function ReportsPage() {
  const transactions = useResource('transactions');
  const leads = useResource('leads');
  const invoices = useResource('invoices');
  const projects = useResource('projects');
  const timelogs = useResource('timelogs');
  const users = useResource('users');
  const clients = useResource('clients');
  if (transactions.forbidden) return <Forbidden />;

  const clientName = id => clients.rows.find(c => c.id === id)?.name || '—';
  const salaryOf = id => users.rows.find(u => u.id === id)?.salary || 0;

  // 12 tháng doanh thu / chi phí
  const labels = [], inc = [], exp = [];
  for (let m = -11; m <= 0; m++) {
    const d = new Date(); d.setMonth(d.getMonth() + m);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    labels.push('T' + (d.getMonth() + 1));
    inc.push(transactions.rows.filter(t => t.type === 'income' && monthKey(t.date) === k).reduce((s, t) => s + t.amount, 0));
    exp.push(transactions.rows.filter(t => t.type === 'expense' && monthKey(t.date) === k).reduce((s, t) => s + t.amount, 0));
  }
  const totalInc = inc.reduce((a, b) => a + b, 0), totalExp = exp.reduce((a, b) => a + b, 0);

  // Cơ cấu chi phí
  const catColors = ['#2563EB', '#7C3AED', '#DB2777', '#D97706', '#059669', '#0891B2', '#64748B'];
  const byCat = {};
  transactions.rows.filter(t => t.type === 'expense').forEach(t => byCat[t.category || 'Khác'] = (byCat[t.category || 'Khác'] || 0) + t.amount);
  const catData = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([label, value], i) => ({ label, value, color: catColors[i % catColors.length] }));

  // Phễu bán hàng
  const funnel = LEAD_STAGES.filter(s => s.key !== 'lost').map(s => ({
    label: s.label, color: s.color,
    count: leads.rows.filter(l => l.stage === s.key).length,
    value: leads.rows.filter(l => l.stage === s.key).reduce((sum, l) => sum + l.value, 0),
  }));
  const winRate = (() => {
    const w = leads.rows.filter(l => l.stage === 'won').length;
    const t = leads.rows.filter(l => ['won', 'lost'].includes(l.stage)).length;
    return t ? Math.round(w / t * 100) : 0;
  })();

  // Lợi nhuận theo dự án
  const projectFinance = p => {
    const income = transactions.rows.filter(t => t.type === 'income' && t.projectId === p.id).reduce((s, t) => s + t.amount, 0);
    const expense = transactions.rows.filter(t => t.type === 'expense' && t.projectId === p.id).reduce((s, t) => s + t.amount, 0);
    const logs = timelogs.rows.filter(l => l.projectId === p.id);
    const hours = logs.reduce((s, l) => s + l.hours, 0);
    const labor = logs.reduce((s, l) => s + l.hours * hourRate(salaryOf(l.userId)), 0);
    return { income, expense, hours, labor, profit: income - expense - labor };
  };

  // Top khách theo doanh thu đã thu
  const revByClient = {};
  invoices.rows.forEach(v => { const p = paidOf(v); if (p) revByClient[v.clientId] = (revByClient[v.clientId] || 0) + p; });
  const top = Object.entries(revByClient).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxTop = Math.max(...top.map(t => t[1]), 1);

  return (
    <>
      <div className="grid kpi-grid" style={{ marginBottom: 16 }}>
        <div className="card kpi"><span className="kpi-label">Doanh thu 12 tháng</span><div className="kpi-value">{money(totalInc)}</div></div>
        <div className="card kpi"><span className="kpi-label">Chi phí 12 tháng</span><div className="kpi-value">{money(totalExp)}</div></div>
        <div className="card kpi"><span className="kpi-label">Lợi nhuận</span>
          <div className="kpi-value" style={{ color: totalInc - totalExp >= 0 ? 'var(--accent)' : 'var(--danger)' }}>{money(totalInc - totalExp)}</div>
          <div className="kpi-sub">Biên: {totalInc ? Math.round((totalInc - totalExp) / totalInc * 100) : 0}%</div></div>
        <div className="card kpi"><span className="kpi-label">Tỷ lệ thắng deal</span><div className="kpi-value">{winRate}%</div></div>
      </div>

      <div className="card">
        <div className="card-head"><span className="card-title">Dòng tiền 12 tháng gần nhất</span></div>
        <div className="card-body">
          <BarChart labels={labels} series={[
            { name: 'Doanh thu', color: '#2563EB', values: inc },
            { name: 'Chi phí', color: '#F87171', values: exp },
          ]} height={230} />
        </div>
      </div>

      <div className="grid two-col" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-head"><span className="card-title">Cơ cấu chi phí</span></div>
          <div className="card-body"><DonutChart data={catData} centerLabel="Tổng chi" /></div>
        </div>
        <div className="card">
          <div className="card-head"><span className="card-title">Phễu bán hàng (pipeline)</span></div>
          <div className="card-body"><Funnel stages={funnel} /></div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><span className="card-title">Lợi nhuận theo dự án</span></div>
        <div className="table-wrap" style={{ border: 'none', boxShadow: 'none' }}>
          <table>
            <thead><tr><th>Dự án</th><th>Khách hàng</th><th className="num">Đã thu</th><th className="num">Chi trực tiếp</th><th className="num">Giờ công</th><th className="num">Lợi nhuận</th><th className="num">Biên</th></tr></thead>
            <tbody>
              {projects.rows.map(p => {
                const f = projectFinance(p);
                return (
                  <tr key={p.id}>
                    <td><span className="cell-main">{p.name}</span></td>
                    <td>{clientName(p.clientId)}</td>
                    <td className="num" style={{ color: 'var(--accent)', fontWeight: 600 }}>{money(f.income)}</td>
                    <td className="num">{money(f.expense)}</td>
                    <td className="num">{f.hours}h · {money(f.labor)}</td>
                    <td className="num" style={{ fontWeight: 800, color: f.profit >= 0 ? 'var(--accent)' : 'var(--danger)' }}>{money(f.profit)}</td>
                    <td className="num">{f.income ? Math.round(f.profit / f.income * 100) + '%' : '—'}</td>
                  </tr>
                );
              })}
              {!projects.rows.length && <tr><td colSpan={7}><EmptyState title="Chưa có dự án" /></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><span className="card-title">Báo cáo lãi lỗ (P&amp;L) — 3 tháng gần nhất</span></div>
        <div className="table-wrap" style={{ border: 'none', boxShadow: 'none' }}>
          <table>
            {(() => {
              const months = [-2, -1, 0].map(off => { const d = new Date(); d.setMonth(d.getMonth() + off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
              const sum = (type, k, cat) => transactions.rows.filter(t => t.type === type && monthKey(t.date) === k && (!cat || t.category === cat)).reduce((s, t) => s + t.amount, 0);
              const expCats = [...new Set(transactions.rows.filter(t => t.type === 'expense').map(t => t.category || 'Khác'))];
              return (
                <>
                  <thead><tr><th>Khoản mục</th>{months.map(k => <th key={k} className="num">T{+k.slice(5)}/{k.slice(0, 4)}</th>)}</tr></thead>
                  <tbody>
                    <tr style={{ fontWeight: 700 }}><td>DOANH THU</td>{months.map(k => <td key={k} className="num" style={{ color: 'var(--accent)' }}>{money(sum('income', k))}</td>)}</tr>
                    {expCats.map(cat => (
                      <tr key={cat}><td style={{ paddingLeft: 26, color: 'var(--muted)' }}>{cat}</td>
                        {months.map(k => <td key={k} className="num">{money(sum('expense', k, cat))}</td>)}</tr>
                    ))}
                    <tr style={{ fontWeight: 700 }}><td>TỔNG CHI PHÍ</td>{months.map(k => <td key={k} className="num" style={{ color: 'var(--danger)' }}>{money(sum('expense', k))}</td>)}</tr>
                    <tr style={{ fontWeight: 800, borderTop: '2px solid var(--border)' }}><td>LỢI NHUẬN</td>
                      {months.map(k => { const p = sum('income', k) - sum('expense', k); return <td key={k} className="num" style={{ color: p >= 0 ? 'var(--accent)' : 'var(--danger)' }}>{money(p)}</td>; })}</tr>
                    <tr><td style={{ color: 'var(--muted)' }}>Biên lợi nhuận</td>
                      {months.map(k => { const i = sum('income', k); return <td key={k} className="num" style={{ color: 'var(--muted)' }}>{i ? Math.round((i - sum('expense', k)) / i * 100) + '%' : '—'}</td>; })}</tr>
                  </tbody>
                </>
              );
            })()}
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><span className="card-title">VAT đầu ra theo quý — năm {new Date().getFullYear()}</span></div>
        <div className="table-wrap" style={{ border: 'none', boxShadow: 'none' }}>
          <table>
            <thead><tr><th>Quý</th><th className="num">Doanh thu trước thuế</th><th className="num">VAT đầu ra</th><th className="num">Số hóa đơn</th></tr></thead>
            <tbody>{[1, 2, 3, 4].map(q => {
              const year = new Date().getFullYear();
              const inQ = invoices.rows.filter(v => v.status !== 'draft' && +v.date.slice(0, 4) === year && Math.ceil(+v.date.slice(5, 7) / 3) === q);
              const sub = inQ.reduce((s, v) => s + itemsTotal(v), 0);
              const vat = inQ.reduce((s, v) => s + Math.round(itemsTotal(v) * (v.vat || 0) / 100), 0);
              return (
                <tr key={q}><td><b>Quý {q}</b></td>
                  <td className="num">{money(sub)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{money(vat)}</td>
                  <td className="num">{inQ.length}</td></tr>
              );
            })}</tbody>
          </table>
        </div>
        <p style={{ fontSize: '.74rem', color: 'var(--muted)', padding: '0 18px 14px' }}>Tính trên hóa đơn đã phát hành (trừ nháp). VAT đầu vào bổ sung khi có hóa đơn NCC kèm thuế suất — dự kiến v2.4.</p>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><span className="card-title">Top khách hàng theo doanh thu đã thu</span></div>
        <div className="card-body">
          {top.map(([cid, val]) => (
            <div key={cid} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', fontSize: '.84rem' }}>
              <span style={{ width: 210, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clientName(cid)}</span>
              <div style={{ flex: 1, background: 'var(--muted-bg)', height: 20, borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ width: `${val / maxTop * 100}%`, height: '100%', background: 'linear-gradient(90deg,#2563EB,#7C3AED)', borderRadius: 6 }}></div>
              </div>
              <b style={{ width: 110, textAlign: 'right' }}>{money(val)}</b>
            </div>
          ))}
          {!top.length && <EmptyState title="Chưa có doanh thu" sub="Ghi nhận thanh toán hóa đơn để thống kê" />}
        </div>
      </div>
    </>
  );
}
