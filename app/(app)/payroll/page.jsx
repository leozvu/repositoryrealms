'use client';
import { useCallback, useEffect, useState } from 'react';
import { Icon, ConfirmDialog, EmptyState, useToast } from '@/components/ui';
import { money, thisMonth } from '@/lib/format';

/* ---------- Phiếu lương cá nhân (nhân viên) ---------- */
function Payslips({ payslips }) {
  if (!payslips.length) return <EmptyState title="Chưa có phiếu lương" sub="Phiếu lương xuất hiện sau khi HR/Kế toán chạy bảng lương tháng" />;
  return payslips.map(p => (
    <div key={p.id} className="card" style={{ marginBottom: 14 }}>
      <div className="card-head">
        <span className="card-title">Phiếu lương tháng {p.month.slice(5)}/{p.month.slice(0, 4)}</span>
        <span className={`badge ${p.status === 'final' ? 'b-green' : 'b-amber'}`}><span className="dot"></span>{p.status === 'final' ? 'Đã chốt' : 'Nháp'}</span>
      </div>
      <div className="card-body">
        <div className="detail-stats">
          <div className="detail-stat"><b>{money(p.line.base)}</b><span>Lương cơ bản</span></div>
          <div className="detail-stat"><b>{money(p.line.allowance + p.line.bonus)}</b><span>Phụ cấp + thưởng</span></div>
          <div className="detail-stat"><b style={{ color: 'var(--danger)' }}>−{money(p.line.insurance)}</b><span>BHXH/YT/TN (10.5%)</span></div>
          <div className="detail-stat"><b style={{ color: 'var(--danger)' }}>−{money(p.line.tax)}</b><span>Thuế TNCN</span></div>
          <div className="detail-stat"><b style={{ color: 'var(--accent)', fontSize: '1.15rem' }}>{money(p.line.net)}</b><span>THỰC NHẬN</span></div>
        </div>
      </div>
    </div>
  ));
}

export default function PayrollPage() {
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(null); // payroll đang mở
  const [confirm, setConfirm] = useState(null);
  const toast = useToast();
  const load = useCallback(async () => {
    const d = await (await fetch('/api/payroll')).json();
    setData(d);
    if (d.manage && d.payrolls.length && !sel) setSel(d.payrolls[0].id);
  }, [sel]);
  useEffect(() => { load(); }, [load]);
  if (!data) return null;
  if (!data.manage) return <Payslips payslips={data.payslips} />;

  const cur = data.payrolls.find(p => p.id === sel);
  const lines = cur ? JSON.parse(cur.lines) : [];
  const total = k => lines.reduce((s, l) => s + (l[k] || 0), 0);

  const generate = async () => {
    const month = prompt('Tạo bảng lương cho tháng (YYYY-MM):', thisMonth());
    if (!month) return;
    const res = await fetch('/api/payroll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ month }) });
    const json = await res.json();
    if (!res.ok) return toast(json.error, 'error');
    toast('Đã tạo bảng lương nháp — chỉnh phụ cấp/thưởng rồi chốt');
    setSel(json.id); load();
  };
  const updateLine = async (userId, k, v) => {
    const newLines = lines.map(l => l.userId === userId ? { ...l, [k]: +v || 0 } : l);
    const res = await fetch('/api/payroll', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: cur.id, lines: newLines }) });
    if (res.ok) load(); else toast((await res.json()).error, 'error');
  };
  const finalize = async () => {
    const res = await fetch(`/api/payroll/${cur.id}/finalize`, { method: 'POST' });
    const json = await res.json();
    if (!res.ok) return toast(json.error, 'error');
    toast('Đã chốt bảng lương và ghi chi phí vào sổ quỹ');
    load();
  };

  return (
    <>
      <div className="toolbar">
        <select className="filter" value={sel || ''} onChange={e => setSel(e.target.value)}>
          {data.payrolls.map(p => <option key={p.id} value={p.id}>Tháng {p.month.slice(5)}/{p.month.slice(0, 4)} — {p.status === 'final' ? 'đã chốt' : 'nháp'}</option>)}
          {!data.payrolls.length && <option value="">Chưa có bảng lương</option>}
        </select>
        <div className="spacer"></div>
        {cur && cur.status === 'draft' && <button className="btn btn-outline" onClick={() => setConfirm(true)}><Icon name="check" size={16} /><span>Chốt & ghi sổ quỹ</span></button>}
        <button className="btn btn-primary" onClick={generate}><Icon name="plus" size={16} /><span>Tạo bảng lương tháng</span></button>
      </div>

      {cur ? (
        <>
          <div className="grid kpi-grid" style={{ marginBottom: 16 }}>
            <div className="card kpi"><span className="kpi-label">Tổng thực nhận</span><div className="kpi-value" style={{ color: 'var(--accent)' }}>{money(total('net'))}</div></div>
            <div className="card kpi"><span className="kpi-label">BHXH (NLĐ 10.5%)</span><div className="kpi-value">{money(total('insurance'))}</div></div>
            <div className="card kpi"><span className="kpi-label">Thuế TNCN</span><div className="kpi-value">{money(total('tax'))}</div></div>
            <div className="card kpi"><span className="kpi-label">Tổng chi phí công ty</span><div className="kpi-value" style={{ color: 'var(--danger)' }}>{money(total('employerCost'))}</div>
              <div className="kpi-sub">Gồm 21.5% BH công ty đóng</div></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nhân sự</th><th className="num">Lương cơ bản</th><th className="num">Phụ cấp</th><th className="num">Thưởng</th><th className="num">BHXH (10.5%)</th><th className="num">Thuế TNCN</th><th className="num">Thực nhận</th><th className="num">Chi phí Cty</th></tr></thead>
              <tbody>
                {lines.map(l => (
                  <tr key={l.userId}>
                    <td><span className="cell-main">{l.name}</span></td>
                    <td className="num">{money(l.base)}</td>
                    <td className="num" style={{ width: 130 }}>
                      {cur.status === 'draft'
                        ? <input type="number" min="0" defaultValue={l.allowance} onBlur={e => +e.target.value !== l.allowance && updateLine(l.userId, 'allowance', e.target.value)}
                            style={{ width: 110, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 7, textAlign: 'right', background: 'var(--card)', color: 'var(--fg)' }} />
                        : money(l.allowance)}</td>
                    <td className="num" style={{ width: 130 }}>
                      {cur.status === 'draft'
                        ? <input type="number" min="0" defaultValue={l.bonus} onBlur={e => +e.target.value !== l.bonus && updateLine(l.userId, 'bonus', e.target.value)}
                            style={{ width: 110, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 7, textAlign: 'right', background: 'var(--card)', color: 'var(--fg)' }} />
                        : money(l.bonus)}</td>
                    <td className="num" style={{ color: 'var(--danger)' }}>−{money(l.insurance)}</td>
                    <td className="num" style={{ color: 'var(--danger)' }}>−{money(l.tax)}</td>
                    <td className="num" style={{ fontWeight: 800, color: 'var(--accent)' }}>{money(l.net)}</td>
                    <td className="num">{money(l.employerCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: 10 }}>
            Công thức: BHXH/YT/TN người lao động 10.5% lương cơ bản · giảm trừ bản thân 11 triệu · thuế TNCN lũy tiến 7 bậc ·
            chi phí công ty = tổng thu nhập + 21.5% BH công ty đóng. Mỗi nhân viên chỉ xem được phiếu lương của chính mình.
          </p>
        </>
      ) : <EmptyState title="Chưa có bảng lương" sub='Bấm "Tạo bảng lương tháng" để bắt đầu' />}
      {confirm && <ConfirmDialog yesLabel="Chốt bảng lương"
        msg={`Chốt bảng lương tháng ${cur.month.slice(5)}/${cur.month.slice(0, 4)}? Sau khi chốt không sửa được và ${money(total('employerCost'))} sẽ ghi vào sổ quỹ.`}
        onClose={() => setConfirm(null)} onYes={finalize} />}
    </>
  );
}
