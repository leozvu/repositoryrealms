'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useResource, Icon, ConfirmDialog, EmptyState, useToast } from '@/components/ui';
import { fmtDate, todayISO, thisMonth, monthKey, initials } from '@/lib/format';
import { hasAny } from '@/lib/perm';

const ST = { present: ['Đi làm', 'b-green'], remote: ['Remote', 'b-blue'], off: ['Nghỉ', 'b-gray'] };

export default function AttendancePage() {
  const { data: session } = useSession();
  const user = session?.user;
  const isHR = hasAny(user, ['HR']);
  const { rows, create, update, remove } = useResource('attendance');
  const users = useResource('users');
  const [m, setM] = useState(thisMonth());
  const [del, setDel] = useState(null);
  const toast = useToast();

  const uName = id => users.rows.find(u => u.id === id)?.name || '—';
  const months = [...new Set([thisMonth(), ...rows.map(r => monthKey(r.date))])].sort().reverse();
  const visible = rows.filter(r => monthKey(r.date) === m);
  const myToday = rows.find(r => r.userId === user?.id && r.date === todayISO());

  const checkIn = async status => {
    if (myToday) { await update(myToday.id, { status }); toast('Đã cập nhật điểm danh hôm nay'); }
    else { await create({ date: todayISO(), status }); toast('Đã điểm danh — chúc một ngày làm việc tốt!'); }
  };

  // Tổng hợp theo người trong tháng
  const byUser = {};
  visible.forEach(r => {
    byUser[r.userId] ||= { present: 0, remote: 0, off: 0 };
    byUser[r.userId][r.status] = (byUser[r.userId][r.status] || 0) + 1;
  });

  return (
    <>
      <div className="card" style={{ padding: '15px 18px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <b style={{ fontSize: '.88rem' }}>Hôm nay ({fmtDate(todayISO())}) bạn:</b>
        {Object.entries(ST).map(([k, [label]]) => (
          <button key={k} className={myToday?.status === k ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'} onClick={() => checkIn(k)}>{label}</button>
        ))}
        {myToday && <span style={{ fontSize: '.8rem', color: 'var(--accent)', fontWeight: 600 }}>✓ Đã điểm danh: {ST[myToday.status][0]}</span>}
      </div>

      <div className="toolbar">
        <select className="filter" value={m} onChange={e => setM(e.target.value)}>
          {months.map(mo => <option key={mo} value={mo}>Tháng {mo.slice(5)}/{mo.slice(0, 4)}</option>)}
        </select>
        <div className="spacer"></div>
      </div>

      {Object.keys(byUser).length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head"><span className="card-title">Tổng hợp tháng {m.slice(5)}/{m.slice(0, 4)}</span></div>
          <div className="table-wrap" style={{ border: 'none', boxShadow: 'none' }}>
            <table><thead><tr><th>Nhân sự</th><th className="num">Đi làm</th><th className="num">Remote</th><th className="num">Nghỉ</th><th className="num">Tổng công</th></tr></thead>
              <tbody>{Object.entries(byUser).map(([uid, c]) => (
                <tr key={uid}>
                  <td><span className="cell-person"><span className="avatar">{initials(uName(uid))}</span>{uName(uid)}</span></td>
                  <td className="num">{c.present || 0}</td><td className="num">{c.remote || 0}</td><td className="num">{c.off || 0}</td>
                  <td className="num" style={{ fontWeight: 800 }}>{(c.present || 0) + (c.remote || 0)}</td>
                </tr>))}</tbody></table>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead><tr><th>Ngày</th><th>Nhân sự</th><th>Trạng thái</th><th>Ghi chú</th>{isHR && <th></th>}</tr></thead>
          <tbody>
            {visible.map(r => {
              const [label, cls] = ST[r.status] || [r.status, 'b-gray'];
              return (
                <tr key={r.id}>
                  <td>{fmtDate(r.date)}</td>
                  <td><span className="cell-person"><span className="avatar">{initials(uName(r.userId))}</span>{uName(r.userId)}</span></td>
                  <td><span className={`badge ${cls}`}><span className="dot"></span>{label}</span></td>
                  <td>{r.note || '—'}</td>
                  {isHR && <td><button className="icon-btn danger" onClick={() => setDel(r)} aria-label="Xóa"><Icon name="trash" size={16} /></button></td>}
                </tr>
              );
            })}
            {!visible.length && <tr><td colSpan={5}><EmptyState title="Chưa có dữ liệu chấm công tháng này" sub="Mỗi người tự điểm danh mỗi ngày bằng nút phía trên" /></td></tr>}
          </tbody>
        </table>
      </div>
      {del && <ConfirmDialog msg="Xóa bản ghi chấm công này?" onClose={() => setDel(null)}
        onYes={async () => { await remove(del.id); toast('Đã xóa'); }} />}
    </>
  );
}
