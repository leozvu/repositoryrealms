'use client';
// v3.26: BÁO CÁO TÀI CHÍNH (MISA #4) — KQKD + LCTT + Tình hình tài chính rút gọn, theo kỳ, in được.
// Tích hợp: giá vốn/tồn kho (#1), lãi/lỗ tỷ giá (#2), công nợ AR/AP đa tiền tệ (#3).
// Trung thực: sổ ghi ĐƠN (cơ sở tiền) → đây là báo cáo QUẢN TRỊ, không thay báo cáo nộp thuế.
import { useState } from 'react';
import { useResource, Icon, Forbidden } from '@/components/ui';
import { money, todayISO, remainOf } from '@/lib/format';
import { periodMatch, incomeStatement, cashFlow, cashBalanceAsOf } from '@/lib/financials';
import { lotRemaining, lotValue } from '@/lib/inventory';

export default function FinancialsPage() {
  const txs = useResource('transactions');
  const invoices = useResource('invoices');
  const ships = useResource('shipments');
  const bills = useResource('vendorbills');
  const payouts = useResource('payouts');
  const lots = useResource('stocklots');
  const year = +todayISO().slice(0, 4);
  const [q, setQ] = useState(0); // 0 = cả năm, 1-4 = quý
  if (txs.forbidden) return <Forbidden />;

  const period = q ? { year, quarter: q } : { year };
  const match = periodMatch(period);
  const pnl = incomeStatement(txs.rows, match);
  const cf = cashFlow(txs.rows, match);

  // Tình hình tài chính HIỆN TẠI (ảnh chụp).
  const today = todayISO();
  const cash = cashBalanceAsOf(txs.rows, today);
  const toVnd = (a, cur, fx) => (cur && cur !== 'VND') ? Math.round(a * (fx || 1)) : a;
  const arInv = invoices.rows.filter(v => !['paid', 'draft'].includes(v.status) && remainOf(v) > 0).reduce((s, v) => s + toVnd(remainOf(v), v.currency, v.fxRate), 0);
  const arShip = ships.rows.filter(s => !['paid', 'draft'].includes(s.status) && s.amount > 0).reduce((s, x) => s + toVnd(x.amount, x.currency, x.fxRate), 0);
  const ar = arInv + arShip;
  const inventory = lots.rows.reduce((s, l) => s + lotValue(l), 0);
  const ap = bills.rows.filter(b => b.status !== 'paid').reduce((s, b) => s + b.amount, 0)
    + payouts.rows.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount, 0);
  const totalAssets = cash + ar + inventory;
  const netEquity = totalAssets - ap;

  const periodLabel = q ? `Quý ${q}/${year}` : `Năm ${year}`;

  const printReport = () => {
    const esc = s => String(s ?? '');
    const row = (label, val, opts = {}) => `<tr style="${opts.bold ? 'font-weight:700' : ''}${opts.top ? ';border-top:2px solid #333' : ''}"><td style="${opts.indent ? 'padding-left:24px;color:#555' : ''}">${esc(label)}</td><td style="text-align:right">${money(val)}</td></tr>`;
    let area = document.getElementById('print-area');
    if (!area) { area = document.createElement('div'); area.id = 'print-area'; document.body.appendChild(area); }
    area.innerHTML = `<div class="doc">
      <h1 style="text-align:center">BÁO CÁO TÀI CHÍNH QUẢN TRỊ — ${esc(periodLabel)}</h1>
      <h3>I. Kết quả kinh doanh (KQKD)</h3>
      <table><tbody>
        ${row('Doanh thu hoạt động', pnl.opRevenue, { bold: true })}
        ${row('Doanh thu tài chính (lãi tỷ giá)', pnl.finIncome, { indent: true })}
        ${pnl.opex.map(o => row(o.cat, o.amount, { indent: true })).join('')}
        ${row('Tổng chi phí hoạt động', pnl.totalOpex)}
        ${row('Chi phí tài chính (lỗ tỷ giá)', pnl.finExpense, { indent: true })}
        ${row('LỢI NHUẬN', pnl.netProfit, { bold: true, top: true })}
      </tbody></table>
      <h3>II. Lưu chuyển tiền tệ (trực tiếp)</h3>
      <table><tbody>
        ${cf.inflows.map(x => row('Thu: ' + x.cat, x.amount, { indent: true })).join('')}
        ${row('Tổng tiền thu', cf.totalIn, { bold: true })}
        ${cf.outflows.map(x => row('Chi: ' + x.cat, x.amount, { indent: true })).join('')}
        ${row('Tổng tiền chi', cf.totalOut, { bold: true })}
        ${row('LƯU CHUYỂN TIỀN THUẦN', cf.net, { bold: true, top: true })}
      </tbody></table>
      <h3>III. Tình hình tài chính (rút gọn, ${esc(today)})</h3>
      <table><tbody>
        ${row('Tiền mặt & ngân hàng', cash, { indent: true })}
        ${row('Phải thu khách hàng', ar, { indent: true })}
        ${row('Hàng tồn kho (giá vốn)', inventory, { indent: true })}
        ${row('TỔNG TÀI SẢN', totalAssets, { bold: true })}
        ${row('Phải trả nhà cung cấp', ap, { indent: true })}
        ${row('VỐN CHỦ SỞ HỮU (ước tính)', netEquity, { bold: true, top: true })}
      </tbody></table>
      <p style="margin-top:16px;font-size:.85em;color:#666">Báo cáo quản trị theo cơ sở tiền, sinh tự động từ ERP. KHÔNG thay báo cáo tài chính nộp thuế (cần hạch toán kép).</p>
    </div>`;
    window.print();
  };

  const Line = ({ label, val, bold, indent, top, color }) => (
    <tr style={{ ...(bold ? { fontWeight: 700 } : {}), ...(top ? { borderTop: '2px solid var(--border)' } : {}) }}>
      <td style={indent ? { paddingLeft: 24, color: 'var(--muted)' } : {}}>{label}</td>
      <td className="num" style={color ? { color, fontWeight: bold ? 800 : 400 } : {}}>{money(val)}</td>
    </tr>
  );

  return (
    <>
      <div className="toolbar">
        <select className="filter" value={q} onChange={e => setQ(+e.target.value)}>
          <option value={0}>Cả năm {year}</option>
          {[1, 2, 3, 4].map(i => <option key={i} value={i}>Quý {i}/{year}</option>)}
        </select>
        <div className="spacer"></div>
        <button className="btn btn-outline" onClick={printReport}><Icon name="print" size={16} /><span>In báo cáo</span></button>
      </div>

      <div className="grid two-col">
        <div className="card">
          <div className="card-head"><span className="card-title">I. Kết quả kinh doanh — {periodLabel}</span></div>
          <div className="table-wrap" style={{ border: 'none', boxShadow: 'none' }}>
            <table><tbody>
              <Line label="Doanh thu hoạt động" val={pnl.opRevenue} bold color="var(--accent)" />
              {pnl.finIncome > 0 && <Line label="Doanh thu tài chính (lãi tỷ giá)" val={pnl.finIncome} indent />}
              {pnl.opex.map(o => <Line key={o.cat} label={o.cat} val={o.amount} indent />)}
              <Line label="Tổng chi phí hoạt động" val={pnl.totalOpex} bold color="var(--danger)" />
              {pnl.finExpense > 0 && <Line label="Chi phí tài chính (lỗ tỷ giá)" val={pnl.finExpense} indent />}
              <Line label="LỢI NHUẬN" val={pnl.netProfit} bold top color={pnl.netProfit >= 0 ? 'var(--accent)' : 'var(--danger)'} />
              <tr><td style={{ color: 'var(--muted)' }}>Biên lợi nhuận</td><td className="num" style={{ color: 'var(--muted)' }}>{pnl.margin}%</td></tr>
            </tbody></table>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><span className="card-title">II. Lưu chuyển tiền tệ — {periodLabel}</span></div>
          <div className="table-wrap" style={{ border: 'none', boxShadow: 'none' }}>
            <table><tbody>
              {cf.inflows.map(x => <Line key={'i' + x.cat} label={'Thu: ' + x.cat} val={x.amount} indent />)}
              <Line label="Tổng tiền thu" val={cf.totalIn} bold color="var(--accent)" />
              {cf.outflows.map(x => <Line key={'o' + x.cat} label={'Chi: ' + x.cat} val={x.amount} indent />)}
              <Line label="Tổng tiền chi" val={cf.totalOut} bold color="var(--danger)" />
              <Line label="LƯU CHUYỂN TIỀN THUẦN" val={cf.net} bold top color={cf.net >= 0 ? 'var(--accent)' : 'var(--danger)'} />
            </tbody></table>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><span className="card-title">III. Tình hình tài chính (rút gọn) — hiện tại {today}</span></div>
        <div className="table-wrap" style={{ border: 'none', boxShadow: 'none' }}>
          <table><tbody>
            <tr style={{ fontWeight: 700 }}><td>TÀI SẢN</td><td></td></tr>
            <Line label="Tiền mặt & ngân hàng (số dư lũy kế)" val={cash} indent />
            <Line label="Phải thu khách hàng (gồm lô hàng xuất)" val={ar} indent />
            <Line label="Hàng tồn kho (giá vốn)" val={inventory} indent />
            <Line label="TỔNG TÀI SẢN" val={totalAssets} bold color="var(--accent)" />
            <tr style={{ fontWeight: 700 }}><td>NGUỒN VỐN</td><td></td></tr>
            <Line label="Phải trả nhà cung cấp / freelancer" val={ap} indent />
            <Line label="VỐN CHỦ SỞ HỮU (ước tính)" val={netEquity} bold top color={netEquity >= 0 ? 'var(--accent)' : 'var(--danger)'} />
          </tbody></table>
        </div>
        <p style={{ fontSize: '.76rem', color: 'var(--muted)', padding: '0 18px 14px' }}>
          Báo cáo quản trị theo <b>cơ sở tiền</b> (sổ Thu/Chi). "Vốn chủ sở hữu ước tính" = Tài sản − Nợ phải trả, chỉ mang tính tham khảo điều hành.
          Bảng cân đối kế toán đầy đủ để <b>nộp thuế</b> cần hạch toán kép — dùng phần mềm kế toán chuyên (MISA/…) hoặc thuê dịch vụ kế toán.
        </p>
      </div>
    </>
  );
}
