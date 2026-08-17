'use client';

import { useState } from 'react';
import { useResource, Icon, FormModal, ConfirmDialog, EmptyState, Forbidden, useToast } from '@/components/ui';
import { money, fmtDate, todayISO } from '@/lib/format';
import {
  PLATFORMS,
  CONTRACT_TYPES,
  SESSION_STATUS,
  LIVE_SCHEDULE_STATUSES,
  liveScheduleReadiness,
  reconcile,
  hostPay,
  hostPit,
  PIT_DEFAULT_PCT,
} from '@/lib/livestream';
import styles from './live.module.css';

const st = value => (SESSION_STATUS.find(([key]) => key === value) || [value, value])[1];
const stColor = value => ({ scheduled: 'b-gray', live: 'b-red', done: 'b-amber', reconciled: 'b-green', cancelled: 'b-gray' }[value] || 'b-gray');
const pad = value => String(value).padStart(2, '0');
const isoLocal = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseLocalDate = value => {
  const [year, month, day] = String(value || todayISO()).split('-').map(Number);
  return new Date(year, month - 1, day);
};
const addDays = (value, amount) => {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + amount);
  return isoLocal(date);
};
const startOfWeek = value => {
  const date = parseLocalDate(value);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return isoLocal(date);
};
const dayLabel = (value, index) => `${index === 6 ? 'CN' : `T${index + 2}`} · ${value.slice(8, 10)}/${value.slice(5, 7)}`;

export default function LivePage() {
  const sessions = useResource('livesessions');
  const users = useResource('users');
  const clients = useResource('clients');
  const [modal, setModal] = useState(null);
  const [reconModal, setReconModal] = useState(null);
  const [view, setView] = useState('schedule');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(todayISO()));
  const toast = useToast();
  if (sessions.forbidden) return <Forbidden />;

  const hosts = users.rows.filter(user => user.status === 'active');
  const uName = id => users.rows.find(user => user.id === id)?.name || '—';
  const thisMonth = todayISO().slice(0, 7);
  const monthSessions = sessions.rows.filter(session => (session.date || '').startsWith(thisMonth));
  const sumGmv = monthSessions.reduce((total, session) => total + (session.gmv || 0), 0);
  const sumNet = monthSessions.filter(session => session.status === 'reconciled').reduce((total, session) => total + reconcile(session).netReceived, 0);
  const pendingRecon = sessions.rows.filter(session => session.status === 'done').length;
  const pendingSettle = sessions.rows.filter(session => session.status === 'reconciled' && !session.settledDate);
  const sumPendingSettle = pendingSettle.reduce((total, session) => total + reconcile(session).netReceived, 0);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const scheduledThisWeek = sessions.rows.filter(session => weekDays.includes(session.date) && session.status !== 'cancelled');
  const confirmedThisWeek = scheduledThisWeek.filter(session => session.scheduleStatus === 'confirmed').length;

  const settleSession = async session => {
    const response = await fetch(`/api/livesessions/${session.id}/settle`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return toast(body.error || 'Lỗi', 'error');
    await sessions.refresh();
    toast('Đã ghi nhận tiền sàn về + phiếu thu vào sổ quỹ');
  };

  const saveSession = async data => {
    const result = modal.row ? await sessions.update(modal.row.id, data) : await sessions.create(data);
    if (!result) return false;
    toast(modal.row ? 'Đã lưu ca live' : 'Đã tạo lịch live');
    setModal(null);
    return true;
  };

  const saveRecon = async data => {
    const response = await fetch(`/api/livesessions/${reconModal.id}/reconcile`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { toast(body.error || 'Lỗi đối soát', 'error'); return false; }
    await sessions.refresh();
    toast(body.payoutCreated ? 'Đã đối soát + tạo phiếu công host (chờ Kế toán trả)' : 'Đã đối soát — chốt tiền thực nhận');
    setReconModal(null);
    return true;
  };

  const personOptions = [{ value: '', label: '— Chưa phân công —' }, ...hosts.map(user => ({ value: user.id, label: user.name }))];
  const fields = () => [
    { key: 'title', label: 'Tên chương trình / ca live', required: true, full: true, placeholder: 'VD: Mega Live 9.9 · Mỹ phẩm buổi tối' },
    { key: 'scheduleStatus', label: 'Trạng thái lịch', type: 'select', default: 'draft', options: LIVE_SCHEDULE_STATUSES.map(([value, label]) => ({ value, label })) },
    { key: 'platform', label: 'Nền tảng', type: 'select', default: 'tiktok', options: Object.entries(PLATFORMS).map(([value, label]) => ({ value, label })) },
    { key: 'shop', label: 'Kênh / Shop' },
    { key: 'campaign', label: 'Campaign' },
    { key: 'clientId', label: 'Nhãn hàng / khách hàng', type: 'select', options: [{ value: '', label: '— Nội bộ —' }, ...clients.rows.map(client => ({ value: client.id, label: client.name }))] },
    { key: 'date', label: 'Ngày live', type: 'date', required: true, default: todayISO() },
    { key: 'callTime', label: 'Giờ ekip có mặt', type: 'time' },
    { key: 'startAt', label: 'Giờ bắt đầu', type: 'time' },
    { key: 'durationMin', label: 'Thời lượng (phút)', type: 'number', default: 120, hint: 'Khi xác nhận: từ 30 phút đến 13 giờ.' },
    { key: 'studio', label: 'Studio', placeholder: 'VD: Studio A' },
    { key: 'hostId', label: 'Host / mẫu live chính', type: 'select', options: personOptions },
    { key: 'assistantId', label: 'Co-host / trợ live', type: 'select', options: personOptions },
    { key: 'operatorId', label: 'Operator', type: 'select', options: personOptions },
    { key: 'moderatorId', label: 'Moderator', type: 'select', options: personOptions },
    { key: 'productCount', label: 'Số sản phẩm', type: 'number', hint: 'TikTok LIVE đã xác nhận cần ít nhất 1 sản phẩm.' },
    { key: 'targetGmv', label: 'Mục tiêu GMV (đ)', type: 'number' },
    { key: 'rehearsalAt', label: 'Rehearsal / test kỹ thuật', type: 'datetime-local' },
    { key: 'briefUrl', label: 'Link brief / script / rundown', type: 'url', full: true },
    { key: 'streamUrl', label: 'Link event trên nền tảng', type: 'url', full: true },
    { key: 'contractType', label: 'Loại hợp đồng', type: 'select', default: 'affiliate', options: Object.entries(CONTRACT_TYPES).map(([value, label]) => ({ value, label })) },
    { key: 'status', label: 'Vòng đời ca', type: 'select', default: 'scheduled', options: SESSION_STATUS.map(([value, label]) => ({ value, label })) },
    { key: 'gmv', label: 'GMV chốt trên sóng (đ)', type: 'number' },
    { key: 'orders', label: 'Số đơn', type: 'number' },
    { key: 'uniqueViewers', label: 'Người xem unique', type: 'number' },
    { key: 'peakViewers', label: 'Peak viewers', type: 'number' },
    { key: 'ctr', label: 'CTR (% view → click)', type: 'number' },
    { key: 'ctor', label: 'CTOR (% click → đơn)', type: 'number' },
    { key: 'hostPayBase', label: 'Lương cứng ca (đ)', type: 'number' },
    { key: 'hostPayRate', label: 'Hoa hồng host (% GMV)', type: 'number' },
    { key: 'note', label: 'Ghi chú vận hành', type: 'textarea', full: true },
  ];

  const openNewForDate = date => setModal({ row: null, defaults: { date, title: '', scheduleStatus: 'draft', status: 'scheduled' } });

  return (
    <>
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>EGORIC AGENCY · PHÒNG BAN EGOLIVE</span>
          <h1>Phòng Livestream Egolive</h1>
          <p>Một lịch vận hành xuyên suốt từ phân host, rehearsal và sản phẩm đến đối soát GMV, công host và tiền thực nhận.</p>
        </div>
        <div className={styles.heroMeta}>
          <span><Icon name="calendar" size={16} />{scheduledThisWeek.length} ca tuần này</span>
          <span><Icon name="check" size={16} />{confirmedThisWeek} đã xác nhận</span>
        </div>
      </section>

      <div className="grid kpi-grid" style={{ marginBottom: 16 }}>
        <div className="card kpi"><span className="kpi-label">GMV tháng này (chốt sóng)</span><div className="kpi-value">{money(sumGmv)}</div><div className="kpi-sub" style={{ color: 'var(--warn, #D97706)' }}>chưa phải tiền thực nhận</div></div>
        <div className="card kpi"><span className="kpi-label">Tiền thực nhận</span><div className="kpi-value" style={{ color: 'var(--accent)' }}>{money(sumNet)}</div><div className="kpi-sub">đã đối soát sau hoàn/phí/thuế</div></div>
        <div className="card kpi"><span className="kpi-label">Ca chờ đối soát</span><div className="kpi-value" style={{ color: pendingRecon ? 'var(--warn, #D97706)' : 'inherit' }}>{pendingRecon}</div><div className="kpi-sub">đã xong nhưng chưa chốt tiền</div></div>
        <div className="card kpi"><span className="kpi-label">Tiền chờ sàn về</span><div className="kpi-value" style={{ color: sumPendingSettle ? 'var(--warn, #D97706)' : 'inherit', fontSize: '1.15rem' }}>{money(sumPendingSettle)}</div><div className="kpi-sub">{pendingSettle.length} ca đã đối soát</div></div>
      </div>

      <div className={styles.commandBar}>
        <div className={styles.viewTabs} role="tablist" aria-label="Chế độ xem livestream">
          <button className={view === 'schedule' ? styles.activeTab : ''} onClick={() => setView('schedule')}><Icon name="calendar" size={16} />Lịch tuần</button>
          <button className={view === 'operations' ? styles.activeTab : ''} onClick={() => setView('operations')}><Icon name="dashboard" size={16} />Vận hành & đối soát</button>
        </div>
        <button className="btn btn-primary" onClick={() => openNewForDate(todayISO())}><Icon name="plus" size={16} /><span>Lên lịch live</span></button>
      </div>

      {view === 'schedule' ? (
        <section className={`card ${styles.schedulePanel}`}>
          <div className={styles.scheduleHead}>
            <div><span className={styles.eyebrow}>LỊCH MẪU LIVE & EKIP</span><h2>{fmtDate(weekStart)} – {fmtDate(weekDays[6])}</h2></div>
            <div className={styles.weekNav}>
              <button className="btn btn-outline btn-sm" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Tuần trước">←</button>
              <button className="btn btn-outline btn-sm" onClick={() => setWeekStart(startOfWeek(todayISO()))}>Tuần này</button>
              <button className="btn btn-outline btn-sm" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Tuần sau">→</button>
            </div>
          </div>
          <div className={styles.weekGrid}>
            {weekDays.map((date, index) => {
              const daySessions = sessions.rows.filter(session => session.date === date && session.status !== 'cancelled').sort((a, b) => String(a.startAt || '').localeCompare(String(b.startAt || '')));
              return (
                <div className={`${styles.dayColumn} ${date === todayISO() ? styles.today : ''}`} key={date}>
                  <div className={styles.dayHead}><span>{dayLabel(date, index)}</span><button onClick={() => openNewForDate(date)} aria-label={`Thêm ca ${date}`}>+</button></div>
                  <div className={styles.dayBody}>
                    {!daySessions.length && <button className={styles.emptySlot} onClick={() => openNewForDate(date)}>Trống · thêm lịch</button>}
                    {daySessions.map(session => {
                      const readiness = liveScheduleReadiness(session);
                      return (
                        <button className={styles.sessionCard} key={session.id} onClick={() => setModal({ row: session })}>
                          <span className={styles.sessionTime}>{session.startAt || 'Chưa chốt giờ'}{session.durationMin ? ` · ${session.durationMin}p` : ''}</span>
                          <strong>{session.title || session.shop || 'Ca live chưa đặt tên'}</strong>
                          <span>{uName(session.hostId)} · {session.studio || 'Chưa có studio'}</span>
                          <span className={styles.sessionPlatform}>{PLATFORMS[session.platform] || session.platform} · {session.productCount || 0} SP</span>
                          <span className={`${styles.readiness} ${readiness.ready ? styles.ready : ''}`}><i style={{ width: `${readiness.score}%` }} />Độ sẵn sàng {readiness.score}%</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div className={styles.scheduleLegend}><span><i className={styles.confirmedDot} />Ca đã xác nhận được server kiểm tra trùng host/ekip/studio.</span><span>Giờ chuẩn: Asia/Ho_Chi_Minh</span></div>
        </section>
      ) : (
        <>
          {!sessions.rows.length ? <EmptyState title="Chưa có ca live" sub="Lên lịch ca đầu tiên, phân host và ekip; sau live nhập chỉ số rồi đối soát tiền thực nhận." /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Ca live</th><th>Host & studio</th><th>Nền tảng</th><th className="num">GMV sóng</th><th className="num">Thực nhận</th><th>Trạng thái</th><th></th></tr></thead>
                <tbody>{sessions.rows.map(session => {
                  const rec = reconcile(session);
                  const pay = hostPay(session);
                  const readiness = liveScheduleReadiness(session);
                  return (
                    <tr key={session.id}>
                      <td><span className="cell-main">{session.title || fmtDate(session.date)}</span><div className="cell-sub">{fmtDate(session.date)} · {session.startAt || 'chưa chốt giờ'} · sẵn sàng {readiness.score}%</div></td>
                      <td><span className="cell-main">{uName(session.hostId)}</span><div className="cell-sub">{session.studio || 'Chưa có studio'}</div></td>
                      <td>{PLATFORMS[session.platform] || session.platform}</td>
                      <td className="num" style={{ fontWeight: 700 }}>{money(session.gmv)}</td>
                      <td className="num" style={{ color: session.status === 'reconciled' ? 'var(--accent)' : 'var(--muted)', fontWeight: 700 }}>{session.status === 'reconciled' ? money(rec.netReceived) : '—'}<div className="cell-sub">Công host {session.status === 'reconciled' ? money(pay.settled) : `TƯ ${money(pay.advance)}`}</div></td>
                      <td><span className={`badge ${stColor(session.status)}`}><span className="dot" />{st(session.status)}</span></td>
                      <td><div className="row-actions">
                        {(session.status === 'done' || session.status === 'reconciled') && <button className="icon-btn" style={{ color: 'var(--primary)' }} title="Đối soát" onClick={() => setReconModal(session)}><Icon name="wallet" size={15} /></button>}
                        {session.status === 'reconciled' && !session.settledDate && <button className="icon-btn" style={{ color: 'var(--accent)' }} title="Ghi nhận tiền sàn về" onClick={() => setModal({ settle: session })}><Icon name="download" size={15} /></button>}
                        <button className="icon-btn" onClick={() => setModal({ row: session })} aria-label="Sửa"><Icon name="edit" size={15} /></button>
                        <button className="icon-btn danger" onClick={() => setModal({ del: session })} aria-label="Xóa"><Icon name="trash" size={15} /></button>
                      </div></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          )}

          {(() => {
            const stats = hosts.map(host => {
              const own = monthSessions.filter(session => session.hostId === host.id);
              if (!own.length) return null;
              const reconciled = own.filter(session => session.status === 'reconciled');
              return {
                host,
                count: own.length,
                gmv: own.reduce((total, session) => total + (session.gmv || 0), 0),
                net: reconciled.reduce((total, session) => total + reconcile(session).netReceived, 0),
                orders: own.reduce((total, session) => total + (session.orders || 0), 0),
                pay: reconciled.reduce((total, session) => total + hostPit(hostPay(session).settled).net, 0),
              };
            }).filter(Boolean).sort((a, b) => b.gmv - a.gmv);
            return stats.length ? (
              <div className="card" style={{ marginTop: 16 }}>
                <div className="card-head"><span className="card-title">Hiệu suất host — tháng {+thisMonth.slice(5)}/{thisMonth.slice(0, 4)}</span></div>
                <div className="table-wrap" style={{ border: 'none', boxShadow: 'none' }}><table><thead><tr><th>Host / mẫu live</th><th className="num">Số ca</th><th className="num">GMV sóng</th><th className="num">Thực nhận</th><th className="num">Đơn</th><th className="num">Công thực trả</th></tr></thead><tbody>{stats.map(stat => <tr key={stat.host.id}><td><span className="cell-main">{stat.host.name}</span></td><td className="num">{stat.count}</td><td className="num">{money(stat.gmv)}</td><td className="num" style={{ color: 'var(--accent)' }}>{money(stat.net)}</td><td className="num">{stat.orders}</td><td className="num">{money(stat.pay)}</td></tr>)}</tbody></table></div>
              </div>
            ) : null;
          })()}
        </>
      )}

      {modal && !modal.del && !modal.settle && <FormModal title={modal.row ? 'Sửa lịch / ca live' : 'Lên lịch live mới'} large data={modal.row || modal.defaults || {}} onClose={() => setModal(null)} onSave={saveSession} fields={fields()} />}
      {modal?.del && <ConfirmDialog msg={`Xóa ca live ${modal.del.title || fmtDate(modal.del.date)}?`} onClose={() => setModal(null)} onYes={async () => { const result = await sessions.remove(modal.del.id); if (result) toast('Đã xóa'); }} />}
      {modal?.settle && <ConfirmDialog yesLabel="Ghi nhận tiền về" msg={`Sàn đã chuyển tiền ca ${fmtDate(modal.settle.date)}? Hệ thống tạo phiếu thu ${money(reconcile(modal.settle).netReceived)} vào sổ quỹ.`} onClose={() => setModal(null)} onYes={() => { settleSession(modal.settle); setModal(null); }} />}
      {reconModal && <FormModal title={`Đối soát ca ${fmtDate(reconModal.date)} — GMV sóng ${money(reconModal.gmv)}`} data={{ netGmv: reconModal.netGmv || reconModal.gmv, platformFee: reconModal.platformFee, taxWithheld: reconModal.taxWithheld, hostPitPct: PIT_DEFAULT_PCT }} onClose={() => setReconModal(null)} onSave={saveRecon} fields={[
        { key: 'netGmv', label: 'GMV ròng (sau hủy/hoàn)', type: 'number', hint: `GMV sóng ${money(reconModal.gmv)} trừ đơn hủy + đơn hoàn`, full: true },
        { key: 'platformFee', label: 'Phí sàn + thanh toán (đ)', type: 'number' },
        { key: 'taxWithheld', label: 'Thuế sàn khấu trừ (đ)', type: 'number' },
        { key: 'hostPitPct', label: 'Khấu trừ TNCN công host (%)', type: 'number', hint: 'Host freelancer, chi ≥2tr/lần khấu trừ tại nguồn.' },
      ]} />}
    </>
  );
}
