'use client';
import { useState } from 'react';
import { useResource, Modal, useToast } from '@/components/ui';
import { money, todayISO, remainOf, localISO } from '@/lib/format';

export default function CalendarPage() {
  const tasks = useResource('tasks');
  const projects = useResource('projects');
  const invoices = useResource('invoices');   // staff bị 403 → tự vắng
  const leaves = useResource('leaves');
  const activities = useResource('activities');
  const contracts = useResource('contracts');
  const users = useResource('users');
  const now = new Date();
  const [y, setY] = useState(now.getFullYear());
  const [m, setM] = useState(now.getMonth());
  const [dayModal, setDayModal] = useState(null);
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
  const events = {};
  const push = (date, ev) => {
    if (!date || +date.slice(0, 4) !== y || +date.slice(5, 7) !== m + 1) return;
    (events[date] ||= []).push(ev);
  };
  tasks.rows.filter(t => t.status !== 'done' && t.dueDate).forEach(t =>
    push(t.dueDate, { color: '#3B82F6', label: t.title, sub: 'Hạn công việc · ' + uName(t.assigneeId) }));
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

  const first = new Date(y, m, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const iso = d => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const go = delta => { let nm = m + delta, ny = y; if (nm < 0) { nm = 11; ny--; } if (nm > 11) { nm = 0; ny++; } setM(nm); setY(ny); };

  return (
    <>
      <div className="cal-toolbar">
        <button className="btn btn-outline btn-sm" onClick={() => go(-1)}>←</button>
        <span className="cal-title">Tháng {m + 1}/{y}</span>
        <button className="btn btn-outline btn-sm" onClick={() => go(1)}>→</button>
        <button className="btn btn-outline btn-sm" onClick={() => { setY(now.getFullYear()); setM(now.getMonth()); }}>Hôm nay</button>
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
      <div className="cal-grid">
        {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(d => <div key={d} className="cal-dow">{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="cal-cell other"></div>;
          const evs = events[iso(d)] || [];
          const isToday = iso(d) === todayISO();
          return (
            <div key={i} className={`cal-cell ${isToday ? 'today' : ''}`} onClick={() => setDayModal({ d, evs })}>
              <div className="cal-date">{d}</div>
              {evs.slice(0, 3).map((e, j) => <div key={j} className="cal-ev"><i style={{ background: e.color }}></i>{e.label}</div>)}
              {evs.length > 3 && <div className="cal-more">+{evs.length - 3} khác</div>}
              <div className="cal-dots">{evs.slice(0, 6).map((e, j) => <i key={j} style={{ background: e.color }}></i>)}</div>
            </div>
          );
        })}
      </div>
      {dayModal && (
        <Modal title={`Ngày ${dayModal.d}/${m + 1}/${y}`} onClose={() => setDayModal(null)}>
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
