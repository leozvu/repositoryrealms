'use client';
import { useState } from 'react';
import { useResource, Modal, useToast } from '@/components/ui';
import { money, todayISO, remainOf, localISO } from '@/lib/format';

// Feedback AIm 07/2026: lịch mặc định xem THEO TUẦN như Google Calendar (nút ← → chuyển
// tuần), vẫn giữ được xem tháng; và kéo thả thẻ CÔNG VIỆC sang ngày khác để đổi deadline
// ngay trên lịch (chỉ công việc — hóa đơn/hợp đồng/nghỉ phép không kéo được).

const DOW = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export default function CalendarPage() {
  const tasks = useResource('tasks');
  const projects = useResource('projects');
  const invoices = useResource('invoices');   // staff bị 403 → tự vắng
  const leaves = useResource('leaves');
  const activities = useResource('activities');
  const contracts = useResource('contracts');
  const users = useResource('users');
  const now = new Date();
  const [mode, setMode] = useState('week');   // mặc định TUẦN theo feedback
  const [y, setY] = useState(now.getFullYear());
  const [m, setM] = useState(now.getMonth());
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(); const off = (d.getDay() + 6) % 7; d.setDate(d.getDate() - off);
    return localISO(d);
  });
  const [dayModal, setDayModal] = useState(null);
  const [dragTaskId, setDragTaskId] = useState(null);
  const [overDay, setOverDay] = useState(null);
  const toast = useToast();

  // v3.3: link ICS cá nhân — subscribe vào Google/Apple Calendar
  const copyIcs = async () => {
    const r = await fetch('/api/ics');
    const j = await r.json();
    if (!r.ok) return toast('Không lấy được link', 'error');
    try { await navigator.clipboard.writeText(j.url); } catch { prompt('Copy link ICS:', j.url); return; }
    toast('Đã copy link ICS — vào Google Calendar → Thêm lịch khác → Từ URL rồi dán vào');
  };

  const uName = id => users.rows.find(u => u.id === id)?.name || '—';

  // ==== Gom sự kiện theo ngày (không lọc trước theo tháng — tuần có thể vắt qua 2 tháng) ====
  const events = {};
  const push = (date, ev) => { if (date) (events[date] ||= []).push(ev); };
  tasks.rows.filter(t => t.status !== 'done' && t.dueDate).forEach(t =>
    push(t.dueDate, { color: '#3B82F6', label: t.title, sub: 'Hạn công việc · ' + uName(t.assigneeId), taskId: t.id }));
  projects.rows.filter(p => p.status !== 'done' && p.deadline).forEach(p =>
    push(p.deadline, { color: '#7C3AED', label: 'DL: ' + p.name, sub: 'Deadline dự án' }));
  invoices.rows.filter(v => !['paid', 'draft'].includes(v.status) && v.dueDate).forEach(v =>
    push(v.dueDate, { color: '#DC2626', label: v.code, sub: 'Hạn thu ' + money(remainOf(v)) }));
  activities.rows.filter(a => !a.done && a.date).forEach(a =>
    push(a.date, { color: '#D97706', label: a.title, sub: 'Lịch hẹn CRM' }));
  contracts.rows.filter(c => c.status === 'active' && c.endDate).forEach(c =>
    push(c.endDate, { color: '#DB2777', label: 'HĐ ' + c.code + ' hết hạn', sub: c.partner }));
  leaves.rows.filter(l => l.status === 'approved').forEach(l => {
    for (let d = new Date(l.from + 'T00:00:00'); d <= new Date(l.to + 'T00:00:00'); d.setDate(d.getDate() + 1))
      push(localISO(d), { color: '#059669', label: uName(l.userId) + ' nghỉ', sub: 'Nghỉ phép' });
  });

  // ==== Kéo thẻ công việc sang ngày khác = đổi deadline ====
  const dropOnDay = async (iso) => {
    setOverDay(null);
    if (!dragTaskId) return;
    const t = tasks.rows.find(x => x.id === dragTaskId);
    setDragTaskId(null);
    if (!t || t.dueDate === iso) return;
    const r = await tasks.update(t.id, { dueDate: iso });
    if (r) toast(`Đã dời hạn "${t.title}" sang ${iso.split('-').reverse().slice(0, 2).join('/')}`);
  };
  const dayDropProps = iso => ({
    onDragOver: e => { if (dragTaskId) { e.preventDefault(); setOverDay(iso); } },
    onDragLeave: () => setOverDay(o => (o === iso ? null : o)),
    onDrop: e => { e.preventDefault(); dropOnDay(iso); },
  });
  const EventChip = (e, j) => (
    <div key={j} className="cal-ev" draggable={!!e.taskId} title={e.taskId ? `${e.label} — kéo sang ngày khác để đổi deadline` : e.label}
      style={e.taskId ? { cursor: 'grab' } : undefined}
      onDragStart={e.taskId ? () => setDragTaskId(e.taskId) : undefined}
      onDragEnd={e.taskId ? () => { setDragTaskId(null); setOverDay(null); } : undefined}>
      <i style={{ background: e.color }}></i>{e.label}
    </div>
  );

  // ==== Điều hướng ====
  const goMonth = delta => { let nm = m + delta, ny = y; if (nm < 0) { nm = 11; ny--; } if (nm > 11) { nm = 0; ny++; } setM(nm); setY(ny); };
  const goWeek = delta => { const d = new Date(weekStart + 'T00:00:00'); d.setDate(d.getDate() + delta * 7); setWeekStart(localISO(d)); };
  const goToday = () => {
    setY(now.getFullYear()); setM(now.getMonth());
    const d = new Date(); const off = (d.getDay() + 6) % 7; d.setDate(d.getDate() - off); setWeekStart(localISO(d));
  };

  // ==== Tuần hiện tại ====
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + 'T00:00:00'); d.setDate(d.getDate() + i); return localISO(d);
  });
  const weekEnd = weekDays[6];
  const fmtDM = iso => `${+iso.slice(8, 10)}/${+iso.slice(5, 7)}`;

  // ==== Tháng ====
  const first = new Date(y, m, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const iso = d => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  return (
    <>
      <div className="cal-toolbar">
        <div className="seg" role="tablist" aria-label="Kiểu xem lịch" style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 9, overflow: 'hidden' }}>
          <button role="tab" aria-selected={mode === 'week'} className={mode === 'week' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'} style={{ borderRadius: 0 }} onClick={() => setMode('week')}>Tuần</button>
          <button role="tab" aria-selected={mode === 'month'} className={mode === 'month' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'} style={{ borderRadius: 0 }} onClick={() => setMode('month')}>Tháng</button>
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => mode === 'week' ? goWeek(-1) : goMonth(-1)} aria-label={mode === 'week' ? 'Tuần trước' : 'Tháng trước'}>←</button>
        <span className="cal-title">{mode === 'week' ? `Tuần ${fmtDM(weekDays[0])} – ${fmtDM(weekEnd)}/${weekEnd.slice(0, 4)}` : `Tháng ${m + 1}/${y}`}</span>
        <button className="btn btn-outline btn-sm" onClick={() => mode === 'week' ? goWeek(1) : goMonth(1)} aria-label={mode === 'week' ? 'Tuần sau' : 'Tháng sau'}>→</button>
        <button className="btn btn-outline btn-sm" onClick={goToday}>Hôm nay</button>
        <button className="btn btn-outline btn-sm" onClick={copyIcs} title="Subscribe lịch này trong Google/Apple Calendar">📅 Link ICS</button>
        <div className="spacer"></div>
        <span className="legend" style={{ margin: 0 }}>
          <span><i style={{ background: '#3B82F6' }}></i>Công việc</span>
          <span><i style={{ background: '#7C3AED' }}></i>Dự án</span>
          <span><i style={{ background: '#DC2626' }}></i>Hóa đơn</span>
          <span><i style={{ background: '#D97706' }}></i>Lịch hẹn</span>
          <span><i style={{ background: '#DB2777' }}></i>Hợp đồng</span>
          <span><i style={{ background: '#059669' }}></i>Nghỉ phép</span>
        </span>
      </div>

      {mode === 'week' ? (
        <>
          <div className="cal-week">
            {weekDays.map((d, i) => {
              const evs = events[d] || [];
              const isToday = d === todayISO();
              return (
                <div key={d} className="cal-week-col">
                  <div className="cal-dow">{DOW[i]} {fmtDM(d)}</div>
                  <div className={`cal-cell cal-week-cell ${isToday ? 'today' : ''}`}
                    style={overDay === d ? { outline: '2px solid var(--primary)', outlineOffset: -2 } : undefined}
                    {...dayDropProps(d)} onClick={() => setDayModal({ label: `${DOW[i]} ${fmtDM(d)}`, evs })}>
                    {evs.map(EventChip)}
                    {!evs.length && <div style={{ fontSize: '.72rem', color: 'var(--muted)', padding: '4px 2px' }}>—</div>}
                  </div>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: '.76rem', color: 'var(--muted)', marginTop: 6 }}>
            Kéo thẻ <b>công việc</b> (chấm xanh dương) thả sang ngày khác để đổi deadline ngay trên lịch.
          </p>
        </>
      ) : (
        <div className="cal-grid">
          {DOW.map(d => <div key={d} className="cal-dow">{d}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={i} className="cal-cell other"></div>;
            const evs = events[iso(d)] || [];
            const isToday = iso(d) === todayISO();
            return (
              <div key={i} className={`cal-cell ${isToday ? 'today' : ''}`}
                style={overDay === iso(d) ? { outline: '2px solid var(--primary)', outlineOffset: -2 } : undefined}
                {...dayDropProps(iso(d))} onClick={() => setDayModal({ label: `Ngày ${d}/${m + 1}/${y}`, evs })}>
                <div className="cal-date">{d}</div>
                {evs.slice(0, 3).map(EventChip)}
                {evs.length > 3 && <div className="cal-more">+{evs.length - 3} khác</div>}
                <div className="cal-dots">{evs.slice(0, 6).map((e, j) => <i key={j} style={{ background: e.color }}></i>)}</div>
              </div>
            );
          })}
        </div>
      )}

      {dayModal && (
        <Modal title={dayModal.label} onClose={() => setDayModal(null)}>
          {dayModal.evs.length ? dayModal.evs.map((e, i) => (
            <div key={i} className="act-item">
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: e.color, flex: 'none', marginTop: 5 }}></span>
              <div><div className="act-title">{e.label}</div><div className="act-sub">{e.sub}</div></div>
            </div>
          )) : <p style={{ fontSize: '.87rem', color: 'var(--muted)' }}>Không có sự kiện nào trong ngày này.</p>}
        </Modal>
      )}
    </>
  );
}
