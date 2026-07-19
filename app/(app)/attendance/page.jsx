'use client';
// v3.11: Chấm công chuyên nghiệp — giờ vào/ra thật, phát hiện đi muộn, OT, ngày lễ,
// bảng công tháng nối vào bảng lương.
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useResource, Icon, Modal, ConfirmDialog, EmptyState, AsyncButton, useToast } from '@/components/ui';
import { fmtDate, todayISO, thisMonth, monthKey, initials } from '@/lib/format';
import { hasAny } from '@/lib/perm';

const ST = { present: ['Đi làm', 'b-green'], remote: ['Remote', 'b-blue'], off: ['Nghỉ', 'b-gray'] };
const nowHM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const workedHours = (ci, co) => { if (!ci || !co) return 0; const [h1, m1] = ci.split(':').map(Number); const [h2, m2] = co.split(':').map(Number); return Math.max(0, Math.round(((h2 * 60 + m2) - (h1 * 60 + m1)) / 6) / 10); };

export default function AttendancePage() {
  const { data: session } = useSession();
  const user = session?.user;
  const isHR = hasAny(user, ['HR']);
  const { rows, create, update, remove, mutating } = useResource('attendance');
  const holidays = useResource('holidays');
  const users = useResource('users');
  const [m, setM] = useState(thisMonth());
  const [del, setDel] = useState(null);
  const [modal, setModal] = useState(null);
  const [cfg, setCfg] = useState({ workStart: '09:00', workEnd: '18:00' });
  const toast = useToast();
  useEffect(() => { fetch('/api/settings').then(r => r.ok ? r.json() : null).then(d => d && setCfg({ workStart: d.workStart || '09:00', workEnd: d.workEnd || '18:00' })).catch(() => {}); }, []);

  const uName = id => users.rows.find(u => u.id === id)?.name || '—';
  const months = [...new Set([thisMonth(), ...rows.map(r => monthKey(r.date))])].sort().reverse();
  const visible = rows.filter(r => monthKey(r.date) === m).sort((a, b) => b.date.localeCompare(a.date));
  const myToday = rows.find(r => r.userId === user?.id && r.date === todayISO());
  const isLate = r => r.checkIn && r.checkIn > cfg.workStart;
  const holidaysThisMonth = holidays.rows.filter(h => monthKey(h.date) === m);

  const clockIn = async status => {
    const t = nowHM();
    if (myToday) { await update(myToday.id, { status, checkIn: myToday.checkIn || t }); toast('Đã cập nhật'); }
    else { await create({ date: todayISO(), status, checkIn: t }); toast(t > cfg.workStart ? `Vào ca ${t} — hơi muộn so với ${cfg.workStart} nhé!` : `Vào ca ${t} — đúng giờ 👍`); }
  };
  const clockOut = async () => {
    if (!myToday) return toast('Chưa vào ca hôm nay', 'error');
    await update(myToday.id, { checkOut: nowHM() }); toast('Đã tan ca — nghỉ ngơi nhé!');
  };

  // Tổng hợp tháng theo người
  const byUser = {};
  visible.forEach(r => {
    byUser[r.userId] ||= { present: 0, remote: 0, off: 0, late: 0, ot: 0, hours: 0 };
    const b = byUser[r.userId];
    b[r.status] = (b[r.status] || 0) + 1;
    if (isLate(r)) b.late++;
    b.ot += r.otHours || 0;
    b.hours += workedHours(r.checkIn, r.checkOut);
  });

  return (
    <>
      <div className="card" style={{ padding: '15px 18px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <b style={{ fontSize: '.88rem' }}>Hôm nay ({fmtDate(todayISO())}):</b>
          {Object.entries(ST).map(([k, [label]]) => (
            <AsyncButton key={k} className={myToday?.status === k ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'} disabled={mutating} onClick={() => clockIn(k)}>{label}</AsyncButton>
          ))}
          {myToday && !myToday.checkOut && myToday.status !== 'off' && <AsyncButton className="btn btn-outline btn-sm" disabled={mutating} onClick={clockOut}>🚪 Tan ca</AsyncButton>}
          {myToday && <span style={{ fontSize: '.8rem', color: 'var(--accent)', fontWeight: 600 }}>
            ✓ {ST[myToday.status][0]}{myToday.checkIn ? ` · vào ${myToday.checkIn}` : ''}{myToday.checkOut ? ` · ra ${myToday.checkOut} (${workedHours(myToday.checkIn, myToday.checkOut)}h)` : ''}
            {isLate(myToday) ? ' · ⚠ muộn' : ''}</span>}
        </div>
        <div style={{ fontSize: '.74rem', color: 'var(--muted)', marginTop: 6 }}>Ca chuẩn {cfg.workStart}–{cfg.workEnd} · vào sau {cfg.workStart} tính là đi muộn</div>
      </div>

      <div className="toolbar">
        <select className="filter" value={m} onChange={e => setM(e.target.value)}>
          {months.map(mo => <option key={mo} value={mo}>Tháng {mo.slice(5)}/{mo.slice(0, 4)}</option>)}
        </select>
        {holidaysThisMonth.length > 0 && <span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>🎌 Lễ: {holidaysThisMonth.map(h => `${h.date.slice(8)}/${h.date.slice(5, 7)} ${h.name}`).join(', ')}</span>}
        <div className="spacer"></div>
        {isHR && <button className="btn btn-outline btn-sm" onClick={() => setModal({ mode: 'holiday' })}><Icon name="calendar" size={14} /> Ngày lễ</button>}
        {isHR && <button className="btn btn-outline btn-sm" onClick={() => setModal({ mode: 'ot' })}><Icon name="clock" size={14} /> Ghi OT</button>}
      </div>

      {Object.keys(byUser).length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head"><span className="card-title">Bảng công tháng {m.slice(5)}/{m.slice(0, 4)}</span>
            <span style={{ fontSize: '.72rem', color: 'var(--muted)' }}>Nối vào Bảng lương</span></div>
          <div className="table-wrap" style={{ border: 'none', boxShadow: 'none' }}>
            <table><thead><tr><th>Nhân sự</th><th className="num">Đi làm</th><th className="num">Remote</th><th className="num">Nghỉ</th><th className="num">Đi muộn</th><th className="num">Giờ làm</th><th className="num">OT</th><th className="num">Tổng công</th></tr></thead>
              <tbody>{Object.entries(byUser).map(([uid, c]) => (
                <tr key={uid}>
                  <td><span className="cell-person"><span className="avatar">{initials(uName(uid))}</span>{uName(uid)}</span></td>
                  <td className="num">{c.present || 0}</td><td className="num">{c.remote || 0}</td><td className="num">{c.off || 0}</td>
                  <td className="num" style={c.late ? { color: 'var(--danger)', fontWeight: 700 } : {}}>{c.late || 0}</td>
                  <td className="num">{Math.round(c.hours * 10) / 10}h</td>
                  <td className="num" style={c.ot ? { color: 'var(--warn, #D97706)', fontWeight: 700 } : {}}>{c.ot ? c.ot + 'h' : '—'}</td>
                  <td className="num" style={{ fontWeight: 800 }}>{(c.present || 0) + (c.remote || 0)}</td>
                </tr>))}</tbody></table>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr><th>Ngày</th><th>Nhân sự</th><th>Trạng thái</th><th>Vào / Ra</th><th>OT</th><th>Ghi chú</th>{isHR && <th></th>}</tr></thead>
          <tbody>
            {visible.map(r => {
              const [label, cls] = ST[r.status] || [r.status, 'b-gray'];
              return (
                <tr key={r.id}>
                  <td>{fmtDate(r.date)}</td>
                  <td><span className="cell-person"><span className="avatar">{initials(uName(r.userId))}</span>{uName(r.userId)}</span></td>
                  <td><span className={`badge ${cls}`}><span className="dot"></span>{label}</span>{isLate(r) && <span className="badge b-red" style={{ marginLeft: 4 }}><span className="dot"></span>Muộn</span>}</td>
                  <td style={{ fontSize: '.8rem' }}>{r.checkIn || '—'}{r.checkOut ? ` → ${r.checkOut}` : ''}{r.checkIn && r.checkOut ? ` (${workedHours(r.checkIn, r.checkOut)}h)` : ''}</td>
                  <td>{r.otHours ? <b style={{ color: 'var(--warn, #D97706)' }}>{r.otHours}h</b> : '—'}</td>
                  <td>{r.note || '—'}</td>
                  {isHR && <td><button className="icon-btn danger" onClick={() => setDel(r)} aria-label="Xóa"><Icon name="trash" size={16} /></button></td>}
                </tr>
              );
            })}
            {!visible.length && <tr><td colSpan={7}><EmptyState title="Chưa có dữ liệu chấm công tháng này" sub="Mỗi người tự điểm danh + tan ca mỗi ngày" /></td></tr>}
          </tbody>
        </table>
      </div>

      {modal?.mode === 'holiday' && <HolidayModal holidays={holidays} onClose={() => setModal(null)} />}
      {modal?.mode === 'ot' && <OtModal users={users.rows} rows={rows} onClose={() => setModal(null)}
        onSave={async (uid, date, ot) => {
          const ex = rows.find(r => r.userId === uid && r.date === date);
          if (ex) await update(ex.id, { otHours: +ot });
          else await create({ userId: uid, date, status: 'present', otHours: +ot });
          toast('Đã ghi OT');
        }} />}
      {del && <ConfirmDialog msg="Xóa bản ghi chấm công này?" onClose={() => setDel(null)}
        onYes={async () => { await remove(del.id); toast('Đã xóa'); }} />}
    </>
  );
}

function HolidayModal({ holidays, onClose }) {
  const [date, setDate] = useState(todayISO());
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState(null);
  const toast = useToast();
  return (
    <Modal title="Ngày lễ công ty" onClose={onClose} footer={<button className="btn btn-outline" onClick={onClose}>Đóng</button>}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        <input style={{ flex: 1 }} placeholder="Tên ngày lễ (VD: Quốc khánh)" value={name} onChange={e => setName(e.target.value)} />
        <AsyncButton className="btn btn-primary btn-sm" disabled={holidays.mutating} onClick={async () => { if (!name.trim()) return; const r = await holidays.create({ date, name: name.trim() }); if (r) { toast('Đã thêm'); setName(''); } }}>Thêm</AsyncButton>
      </div>
      {holidays.rows.map(h => (
        <div key={h.id} className="act-item" style={{ alignItems: 'center' }}>
          <span style={{ flex: 1 }}>{fmtDate(h.date)} — {h.name}</span>
          <button className="icon-btn danger" onClick={() => setDeleting(h)} aria-label={`Xóa ngày lễ ${h.name}`}><Icon name="trash" size={14} /></button>
        </div>
      ))}
      {!holidays.rows.length && <p style={{ fontSize: '.8rem', color: 'var(--muted)' }}>Chưa có ngày lễ nào. Ngày lễ không tính là vắng.</p>}
      {deleting && <ConfirmDialog msg={`Xóa ngày lễ "${deleting.name}"?`} onClose={() => setDeleting(null)}
        onYes={async () => { const r = await holidays.remove(deleting.id); if (!r) return false; toast('Đã xóa ngày lễ'); }} />}
    </Modal>
  );
}

function OtModal({ users, onSave, onClose }) {
  const [uid, setUid] = useState('');
  const [date, setDate] = useState(todayISO());
  const [ot, setOt] = useState('');
  return (
    <Modal title="Ghi giờ làm thêm (OT)" onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose}>Hủy</button>
        <AsyncButton className="btn btn-primary" pendingLabel="Đang lưu…" onClick={async () => { if (!uid || !(+ot > 0)) return; const r = await onSave(uid, date, ot); if (r !== false && r !== null) onClose(); }}>Lưu OT</AsyncButton></>}>
      <div className="form-grid">
        <div className="field full"><label>Nhân sự</label>
          <select value={uid} onChange={e => setUid(e.target.value)}>
            <option value="">— Chọn —</option>
            {users.filter(u => u.status === 'active' && u.userType !== 'freelancer').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select></div>
        <div className="field"><label>Ngày</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
        <div className="field"><label>Số giờ OT</label><input type="number" min="0" step="0.5" value={ot} onChange={e => setOt(e.target.value)} /></div>
      </div>
    </Modal>
  );
}
