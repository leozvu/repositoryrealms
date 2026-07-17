'use client';
// v3.20: Ca live — trang lõi của Egolive.
// Làm rõ GMV ≠ doanh thu: cột GMV sóng tách hẳn khỏi "tiền thực nhận" sau đối soát.
import { useState } from 'react';
import { useResource, Icon, FormModal, ConfirmDialog, EmptyState, Forbidden, useToast } from '@/components/ui';
import { money, fmtDate, todayISO } from '@/lib/format';
import { PLATFORMS, CONTRACT_TYPES, SESSION_STATUS, reconcile, aov, hostPay, hostPit, PIT_DEFAULT_PCT } from '@/lib/livestream';

const st = s => (SESSION_STATUS.find(([k]) => k === s) || [s, s])[1];
const stColor = s => ({ scheduled: 'b-gray', live: 'b-red', done: 'b-amber', reconciled: 'b-green' }[s] || 'b-gray');

export default function LivePage() {
  const sessions = useResource('livesessions');
  const users = useResource('users');
  const clients = useResource('clients');
  const [modal, setModal] = useState(null);
  const [recon, setRecon] = useState(null);
  const toast = useToast();
  if (sessions.forbidden) return <Forbidden />;

  const hosts = users.rows.filter(u => u.status === 'active');
  const uName = id => users.rows.find(u => u.id === id)?.name || '—';
  const thisMonth = todayISO().slice(0, 7);
  const mSessions = sessions.rows.filter(s => (s.date || '').startsWith(thisMonth));
  const sumGmv = mSessions.reduce((a, s) => a + (s.gmv || 0), 0);
  const sumNet = mSessions.filter(s => s.status === 'reconciled').reduce((a, s) => a + reconcile(s).netReceived, 0);
  const pendingRecon = sessions.rows.filter(s => s.status === 'done').length;
  // v3.33: tiền đã đối soát nhưng sàn chưa về ví (Shopee ~ngày 4, hoàn tới ngày 15).
  const pendingSettle = sessions.rows.filter(s => s.status === 'reconciled' && !s.settledDate);
  const sumPendingSettle = pendingSettle.reduce((a, s) => a + reconcile(s).netReceived, 0);

  const settleSession = async s => {
    const r = await fetch(`/api/livesessions/${s.id}/settle`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return toast(j.error || 'Lỗi', 'error');
    await sessions.refresh(); toast('Đã ghi nhận tiền sàn về + phiếu thu vào sổ quỹ');
  };

  const saveSession = async d => {
    const r = modal.row;
    if (r) { await sessions.update(r.id, d); toast('Đã lưu ca live'); }
    else { await sessions.create(d); toast('Đã tạo ca live'); }
    setModal(null);
  };
  const saveRecon = async d => {
    // v3.21: qua route riêng — vừa chốt tiền vừa sinh phiếu công host (Payout) theo GMV ròng.
    const r = await fetch(`/api/livesessions/${recon.id}/reconcile`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast(j.error || 'Lỗi đối soát', 'error'); return; }
    await sessions.refresh();
    toast(j.payoutCreated ? 'Đã đối soát + tạo phiếu công host (chờ Kế toán trả)' : 'Đã đối soát — chốt tiền thực nhận');
    setRecon(null);
  };

  const fields = () => [
    { key: 'platform', label: 'Nền tảng', type: 'select', default: 'tiktok', options: Object.entries(PLATFORMS).map(([k, v]) => ({ value: k, label: v })) },
    { key: 'shop', label: 'Kênh / Shop' },
    { key: 'date', label: 'Ngày', type: 'date', required: true, default: todayISO() },
    { key: 'startAt', label: 'Giờ bắt đầu (HH:MM)' },
    { key: 'durationMin', label: 'Thời lượng (phút)', type: 'number' },
    { key: 'hostId', label: 'Host chính', type: 'select', options: [{ value: '', label: '—' }, ...hosts.map(u => ({ value: u.id, label: u.name }))] },
    { key: 'assistantId', label: 'Trợ live', type: 'select', options: [{ value: '', label: '—' }, ...hosts.map(u => ({ value: u.id, label: u.name }))] },
    { key: 'clientId', label: 'Nhãn hàng (nếu live thuê)', type: 'select', options: [{ value: '', label: '—' }, ...clients.rows.map(c => ({ value: c.id, label: c.name }))] },
    { key: 'contractType', label: 'Loại hợp đồng', type: 'select', default: 'affiliate', options: Object.entries(CONTRACT_TYPES).map(([k, v]) => ({ value: k, label: v })) },
    { key: 'gmv', label: 'GMV chốt trên sóng (đ)', type: 'number' },
    { key: 'orders', label: 'Số đơn', type: 'number' },
    { key: 'uniqueViewers', label: 'Người xem (unique)', type: 'number' },
    { key: 'peakViewers', label: 'Peak viewers', type: 'number' },
    { key: 'ctr', label: 'CTR (% view→click)', type: 'number' },
    { key: 'ctor', label: 'CTOR (% click→đơn)', type: 'number' },
    { key: 'hostPayBase', label: 'Lương cứng ca (đ)', type: 'number' },
    { key: 'hostPayRate', label: 'Hoa hồng host (% GMV)', type: 'number' },
    { key: 'status', label: 'Trạng thái', type: 'select', default: 'scheduled', options: SESSION_STATUS.map(([k, l]) => ({ value: k, label: l })) },
    { key: 'note', label: 'Ghi chú', type: 'textarea', full: true },
  ];

  return (
    <>
      <div className="grid kpi-grid" style={{ marginBottom: 16 }}>
        <div className="card kpi"><span className="kpi-label">GMV tháng này (chốt sóng)</span>
          <div className="kpi-value">{money(sumGmv)}</div>
          <div className="kpi-sub" style={{ color: 'var(--warn, #D97706)' }}>chưa phải tiền thực nhận</div></div>
        <div className="card kpi"><span className="kpi-label">Tiền thực nhận (đã đối soát)</span>
          <div className="kpi-value" style={{ color: 'var(--accent)' }}>{money(sumNet)}</div>
          <div className="kpi-sub">sau hủy/hoàn + phí sàn + thuế</div></div>
        <div className="card kpi"><span className="kpi-label">Ca chờ đối soát</span>
          <div className="kpi-value" style={{ color: pendingRecon ? 'var(--warn, #D97706)' : 'inherit' }}>{pendingRecon}</div>
          <div className="kpi-sub">xong ca nhưng chưa chốt tiền</div></div>
        <div className="card kpi"><span className="kpi-label">Tiền chờ sàn về</span>
          <div className="kpi-value" style={{ color: sumPendingSettle ? 'var(--warn, #D97706)' : 'inherit', fontSize: '1.15rem' }}>{money(sumPendingSettle)}</div>
          <div className="kpi-sub">{pendingSettle.length} ca đã đối soát, chưa về ví</div></div>
        <div className="card kpi"><span className="kpi-label">Số ca tháng này</span>
          <div className="kpi-value">{mSessions.length}</div></div>
      </div>

      <div className="toolbar">
        <span style={{ fontSize: '.85rem', color: 'var(--muted)' }}>GMV chốt trên sóng ≠ tiền về. Sau ca, bấm "Đối soát" để trừ hủy/hoàn/phí/thuế → chốt tiền thực nhận.</span>
        <div className="spacer"></div>
        <button className="btn btn-primary" onClick={() => setModal({ row: null })}><Icon name="plus" size={16} /><span>Ca live mới</span></button>
      </div>

      {!sessions.rows.length ? <EmptyState title="Chưa có ca live" sub="Tạo ca live, ghi chỉ số phiên (GMV, đơn, view, CTR). Sau khi sàn quyết toán, đối soát để biết tiền thực nhận." /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Ngày</th><th>Nền tảng</th><th>Host</th><th className="num">GMV sóng</th><th className="num">Đơn</th><th className="num">Thực nhận</th><th>Công host</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>
              {sessions.rows.map(s => {
                const rec = reconcile(s); const hp = hostPay(s);
                return (
                  <tr key={s.id}>
                    <td><span className="cell-main">{fmtDate(s.date)}</span><div className="cell-sub">{s.startAt || ''}{s.durationMin ? ` · ${s.durationMin}p` : ''}</div></td>
                    <td>{PLATFORMS[s.platform] || s.platform}</td>
                    <td>{uName(s.hostId)}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{money(s.gmv)}</td>
                    <td className="num">{s.orders || 0}</td>
                    <td className="num" style={{ color: s.status === 'reconciled' ? 'var(--accent)' : 'var(--muted)', fontWeight: 700 }}>
                      {s.status === 'reconciled' ? money(rec.netReceived) : '—'}</td>
                    <td style={{ fontSize: '.8rem' }}>{s.status === 'reconciled' ? money(hp.settled) : `TƯ ${money(hp.advance)}`}</td>
                    <td><span className={`badge ${stColor(s.status)}`}><span className="dot"></span>{st(s.status)}</span></td>
                    <td><div className="row-actions">
                      {(s.status === 'done' || s.status === 'reconciled') && <button className="icon-btn" style={{ color: 'var(--primary)' }} title="Đối soát" onClick={() => setRecon(s)}><Icon name="wallet" size={15} /></button>}
                      {s.status === 'reconciled' && !s.settledDate && <button className="icon-btn" style={{ color: 'var(--accent)' }} title="Ghi nhận tiền sàn về → phiếu thu" onClick={() => setModal({ settle: s })}><Icon name="download" size={15} /></button>}
                      {s.settledDate && <span title={`Tiền về ${s.settledDate}`} style={{ color: 'var(--accent)', display: 'inline-flex', alignItems: 'center' }}><Icon name="check" size={15} /></span>}
                      <button className="icon-btn" onClick={() => setModal({ row: s })} aria-label="Sửa"><Icon name="edit" size={15} /></button>
                      <button className="icon-btn danger" onClick={() => setModal({ del: s })} aria-label="Xóa"><Icon name="trash" size={15} /></button>
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(() => {
        const stats = hosts.map(h => {
          const hs = mSessions.filter(s => s.hostId === h.id);
          if (!hs.length) return null;
          const gmv = hs.reduce((a, s) => a + (s.gmv || 0), 0);
          const rec = hs.filter(s => s.status === 'reconciled');
          const net = rec.reduce((a, s) => a + reconcile(s).netReceived, 0);
          const orders = hs.reduce((a, s) => a + (s.orders || 0), 0);
          const ctor = hs.reduce((a, s) => a + (s.ctor || 0), 0) / hs.length;
          const pay = rec.reduce((a, s) => a + hostPit(hostPay(s).settled).net, 0);
          return { h, n: hs.length, gmv, net, orders, ctor, pay };
        }).filter(Boolean).sort((a, b) => b.gmv - a.gmv);
        return stats.length ? (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-head"><span className="card-title">Hiệu suất host — tháng {+thisMonth.slice(5)}/{thisMonth.slice(0, 4)}</span></div>
            <div className="table-wrap" style={{ border: 'none', boxShadow: 'none' }}>
              <table>
                <thead><tr><th>Host</th><th className="num">Số ca</th><th className="num">GMV sóng</th><th className="num">Thực nhận</th><th className="num">Đơn</th><th className="num">CTOR TB</th><th className="num">Công host (thực trả)</th></tr></thead>
                <tbody>
                  {stats.map(s => (
                    <tr key={s.h.id}>
                      <td><span className="cell-main">{s.h.name}</span></td>
                      <td className="num">{s.n}</td>
                      <td className="num" style={{ fontWeight: 600 }}>{money(s.gmv)}</td>
                      <td className="num" style={{ color: 'var(--accent)' }}>{money(s.net)}</td>
                      <td className="num">{s.orders}</td>
                      <td className="num">{s.ctor ? s.ctor.toFixed(1) + '%' : '—'}</td>
                      <td className="num">{money(s.pay)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: '.74rem', color: 'var(--muted)', padding: '0 18px 12px' }}>GMV sóng = chốt trên live (chưa trừ hoàn/phí). Thực nhận + công host chỉ tính ca đã đối soát. Công host = đã trừ TNCN.</p>
          </div>
        ) : null;
      })()}

      {modal && !modal.del && <FormModal title={modal.row ? 'Sửa ca live' : 'Ca live mới'} large
        data={modal.row || {}} onClose={() => setModal(null)} onSave={saveSession} fields={fields()} />}
      {modal?.del && <ConfirmDialog msg={`Xóa ca live ngày ${fmtDate(modal.del.date)}?`}
        onClose={() => setModal(null)} onYes={async () => { await sessions.remove(modal.del.id); toast('Đã xóa'); }} />}
      {modal?.settle && <ConfirmDialog yesLabel="Ghi nhận tiền về"
        msg={`Sàn đã chuyển tiền ca ${fmtDate(modal.settle.date)}? Hệ thống tạo phiếu thu ${money(reconcile(modal.settle).netReceived)} (tiền thực nhận) vào sổ quỹ.`}
        onClose={() => setModal(null)} onYes={() => { settleSession(modal.settle); setModal(null); }} />}

      {recon && <FormModal title={`Đối soát ca ${fmtDate(recon.date)} — GMV sóng ${money(recon.gmv)}`}
        data={{ netGmv: recon.netGmv || recon.gmv, platformFee: recon.platformFee, taxWithheld: recon.taxWithheld, hostPitPct: PIT_DEFAULT_PCT }}
        onClose={() => setRecon(null)} onSave={saveRecon}
        fields={[
          { key: 'netGmv', label: 'GMV ròng (sau hủy/hoàn)', type: 'number', hint: `GMV sóng ${money(recon.gmv)} trừ đơn hủy + đơn hoàn`, full: true },
          { key: 'platformFee', label: 'Phí sàn + thanh toán (đ)', type: 'number' },
          { key: 'taxWithheld', label: 'Thuế sàn khấu trừ (đ)', type: 'number', hint: 'NĐ 117/2025 — sàn khấu trừ GTGT + TNCN' },
          { key: 'hostPitPct', label: 'Khấu trừ TNCN công host (%)', type: 'number', hint: 'Host freelancer, chi ≥2tr/lần khấu trừ 10% tại nguồn. Phiếu công host sẽ tạo ở mức đã trừ thuế.' },
        ]} />}
    </>
  );
}
