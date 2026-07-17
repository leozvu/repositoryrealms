'use client';
// v3.25: ĐÁNH GIÁ LẠI TỶ GIÁ CUỐI KỲ — công nợ ngoại tệ còn dư (chưa thu) được quy đổi lại
// theo tỷ giá cuối kỳ; chênh lệch là lãi/lỗ tỷ giá CHƯA thực hiện (VAS). Vị thế gồm: lô hàng
// xuất chưa thu + hóa đơn ngoại tệ chưa thu hết.
import { useState } from 'react';
import { useResource, Icon, EmptyState, Forbidden, useToast } from '@/components/ui';
import { money, moneyC, todayISO, remainOf, CURRENCIES } from '@/lib/format';
import { revaluePositions, avgBookRate } from '@/lib/fx';

export default function FxRevalPage() {
  const ships = useResource('shipments');
  const invoices = useResource('invoices');
  const txs = useResource('transactions');
  const [rates, setRates] = useState({});
  const [asOf, setAsOf] = useState(todayISO());
  const [posting, setPosting] = useState(false);
  const toast = useToast();
  if (ships.forbidden) return <Forbidden />;

  // Vị thế ngoại tệ còn dư (AR).
  const positions = [
    ...ships.rows.filter(s => s.status !== 'paid' && s.currency !== 'VND' && s.amount > 0)
      .map(s => ({ kind: 'Lô hàng', ref: s.code, currency: s.currency, amount: s.amount, bookRate: s.fxRate })),
    ...invoices.rows.filter(v => v.currency && v.currency !== 'VND' && v.status !== 'paid' && remainOf(v) > 0)
      .map(v => ({ kind: 'Hóa đơn', ref: v.code, currency: v.currency, amount: remainOf(v), bookRate: v.fxRate })),
  ];
  const currencies = [...new Set(positions.map(p => p.currency))];
  const { byCurrency, total } = revaluePositions(positions, rates);
  const hasAnyRate = currencies.some(c => +rates[c] > 0);

  const post = async () => {
    if (!total) return toast('Chưa có chênh lệch để ghi (nhập tỷ giá cuối kỳ trước).', 'error');
    setPosting(true);
    const curList = Object.entries(byCurrency).map(([c, g]) => `${c}@${g.close}`).join(', ');
    const r = await txs.create({
      type: total > 0 ? 'income' : 'expense',
      category: total > 0 ? 'Lãi đánh giá lại tỷ giá' : 'Lỗ đánh giá lại tỷ giá',
      amount: Math.abs(total), currency: 'VND', fxRate: 1, date: asOf,
      desc: `Đánh giá lại công nợ ngoại tệ ${asOf} (${curList})`,
    });
    setPosting(false);
    if (r) { toast('Đã ghi bút toán đánh giá lại vào sổ tài chính'); setRates({}); }
  };

  return (
    <>
      <div className="toolbar">
        <span style={{ fontSize: '.85rem', color: 'var(--muted)' }}>Đánh giá lại công nợ ngoại tệ còn dư theo tỷ giá cuối kỳ — lãi/lỗ tỷ giá chưa thực hiện</span>
        <div className="spacer"></div>
        <label style={{ fontSize: '.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>Kỳ đến ngày:
          <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} /></label>
      </div>

      {!positions.length ? <EmptyState title="Không có công nợ ngoại tệ còn dư" sub="Khi có lô hàng / hóa đơn ngoại tệ chưa thu, trang này giúp đánh giá lại theo tỷ giá cuối kỳ." /> : (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-head"><span className="card-title">Tỷ giá cuối kỳ</span></div>
            <div className="card-body" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {currencies.map(c => (
                <label key={c} style={{ fontSize: '.85rem' }}>
                  <div style={{ marginBottom: 4 }}>1 {c} = ? VNĐ <span style={{ color: 'var(--muted)' }}>(sổ: {avgBookRate(positions, c).toLocaleString('vi-VN')})</span></div>
                  <input type="number" style={{ width: 150 }} placeholder="tỷ giá cuối kỳ"
                    value={rates[c] || ''} onChange={e => setRates(r => ({ ...r, [c]: e.target.value }))} />
                </label>
              ))}
            </div>
          </div>

          <div className="table-wrap" style={{ marginBottom: 14 }}>
            <table>
              <thead><tr><th>Đồng tiền</th><th className="num">Dư ngoại tệ</th><th className="num">Giá trị ghi sổ</th><th className="num">Theo tỷ giá cuối kỳ</th><th className="num">Chênh lệch</th></tr></thead>
              <tbody>
                {currencies.map(c => {
                  const g = byCurrency[c];
                  return (
                    <tr key={c}>
                      <td><b>{c}</b> · {CURRENCIES[c]?.name || ''}</td>
                      <td className="num">{moneyC(positions.filter(p => p.currency === c).reduce((s, p) => s + p.amount, 0), c)}</td>
                      <td className="num">{g ? money(g.bookVnd) : '—'}</td>
                      <td className="num">{g ? money(g.closeVnd) : <span style={{ color: 'var(--muted)' }}>nhập tỷ giá</span>}</td>
                      <td className="num" style={{ fontWeight: 700, color: g ? (g.diff >= 0 ? 'var(--accent)' : 'var(--danger)') : 'var(--muted)' }}>
                        {g ? (g.diff >= 0 ? '+' : '') + money(g.diff) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr style={{ borderTop: '2px solid var(--border)' }}>
                <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700 }}>Tổng lãi/lỗ tỷ giá chưa thực hiện</td>
                <td className="num" style={{ fontWeight: 800, color: total >= 0 ? 'var(--accent)' : 'var(--danger)' }}>{(total >= 0 ? '+' : '') + money(total)}</td>
              </tr></tfoot>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn btn-primary" disabled={!hasAnyRate || !total || posting} onClick={post}>
              <Icon name="check" size={16} /><span>Ghi bút toán đánh giá lại</span></button>
            <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
              {total ? `Sẽ ghi 1 phiếu ${total > 0 ? 'thu (lãi)' : 'chi (lỗ)'} ${money(Math.abs(total))} vào sổ tài chính ngày ${asOf}.` : 'Nhập tỷ giá cuối kỳ để tính chênh lệch.'}
            </span>
          </div>
          <p style={{ fontSize: '.76rem', color: 'var(--muted)', marginTop: 10 }}>
            Lưu ý: đây là lãi/lỗ CHƯA thực hiện (công nợ chưa thu). Khi thu tiền thật, chênh lệch tỷ giá đã thực hiện được ghi tự động lúc ghi nhận thu lô hàng.
          </p>
        </>
      )}
    </>
  );
}
