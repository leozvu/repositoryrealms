'use client';
// v3.5: Resource planning — ma trận giờ công người × tuần + tải việc hiện tại.
// PM/HR/GĐ nhìn 1 màn hình biết ai quá tải, ai đang trống để phân việc.
// v3.8: gán việc chưa phân ngay tại chỗ (PM).
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useResource, Icon, Modal, EmptyState, Forbidden, AsyncButton, useToast } from '@/components/ui';
import { localISO, todayISO, fmtDate, initials } from '@/lib/format';
import { hasAny, rolesOf } from '@/lib/perm';

const CAP = 40; // giờ/tuần chuẩn
const cellColor = h => h > CAP ? 'var(--danger)' : h >= 30 ? '#059669' : h >= 15 ? '#D97706' : 'var(--muted)';
const cellBg = h => h > CAP ? 'rgba(220,38,38,.14)' : h >= 30 ? 'rgba(5,150,105,.12)' : h >= 15 ? 'rgba(217,119,6,.10)' : 'transparent';

export default function ResourcesPage() {
  const { data: session } = useSession();
  const canSee = hasAny(session?.user, ['PM', 'HR', 'LEAD']);
  const canAssign = hasAny(session?.user, ['PM']); // gán việc: PM + GĐ
  const users = useResource('users');
  const timelogs = useResource('timelogs');
  const tasks = useResource('tasks');
  const projects = useResource('projects');
  const leaves = useResource('leaves');
  const [assignTo, setAssignTo] = useState(null); // user được gán
  const toast = useToast();
  if (session && !canSee) return <Forbidden />;

  const unassigned = tasks.rows.filter(t => !t.assigneeId && t.status !== 'done');
  const pName = id => projects.rows.find(p => p.id === id)?.name || 'Việc chung';

  // Nhân sự nội bộ active trừ Giám đốc (freelancer tính riêng ở "Hôm nay")
  const staff = users.rows.filter(u => u.status === 'active' && u.userType !== 'freelancer' && !rolesOf(u).includes('DIRECTOR'));
  if (!staff.length) return <EmptyState title="Chưa có nhân sự" />;

  // 4 tuần gần nhất, mốc thứ Hai
  const monday = d => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return localISO(x); };
  const weeks = [-3, -2, -1, 0].map(o => { const d = new Date(); d.setDate(d.getDate() + o * 7); return monday(localISO(d)); });
  const wkLabel = wk => { const d = new Date(wk + 'T00:00:00'); return `${d.getDate()}/${d.getMonth() + 1}`; };

  const hoursOf = (uid, wk) => timelogs.rows
    .filter(l => l.userId === uid && monday(l.date) === wk)
    .reduce((s, l) => s + l.hours, 0);

  const today = todayISO();
  const in7 = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return localISO(d); })();
  const loadOf = uid => {
    const mine = tasks.rows.filter(t => t.assigneeId === uid && t.status !== 'done');
    return {
      open: mine.length,
      late: mine.filter(t => t.dueDate && t.dueDate < today).length,
      week: mine.filter(t => t.dueDate && t.dueDate >= today && t.dueDate <= in7).length,
    };
  };

  const thisWeekTotal = staff.map(u => hoursOf(u.id, weeks[3]));
  const overloaded = staff.filter((u, i) => thisWeekTotal[i] > CAP);
  const idle = staff.filter((u, i) => thisWeekTotal[i] < 15);

  /* ---------- v3.12: Ai đang làm gì HÔM NAY ---------- */
  const DAY_CAP = 8;
  const onLeaveToday = uid => leaves.rows.some(l => l.status === 'approved' && l.userId === uid && l.from <= today && l.to >= today);
  const teamToday = [...staff, ...users.rows.filter(u => u.status === 'active' && u.userType === 'freelancer')].map(u => {
    const open = tasks.rows.filter(t => t.assigneeId === u.id && t.status !== 'done');
    const doing = open.filter(t => t.status === 'doing');
    const dueToday = open.filter(t => t.dueDate === today);
    const overdue = open.filter(t => t.dueDate && t.dueDate < today);
    const committed = [...new Set([...doing, ...dueToday])].reduce((s, t) => s + (t.estHours || 0), 0);
    const leave = onLeaveToday(u.id);
    const state = leave ? 'leave' : committed > DAY_CAP ? 'over' : (doing.length || dueToday.length) ? 'busy' : 'free';
    return { u, doing, dueToday, overdue, committed, state, isFL: u.userType === 'freelancer' };
  }).sort((a, b) => ({ over: 0, busy: 1, leave: 2, free: 3 }[a.state] - { over: 0, busy: 1, leave: 2, free: 3 }[b.state]));
  // v3.14: bỏ emoji 🟢🟡🔴🌴 — thay bằng badge + chấm màu SVG có sẵn của app.
  // Emoji vẽ khác nhau trên từng hệ điều hành và không đổi màu theo dark mode.
  // Chấm màu LUÔN đi kèm chữ ("Rảnh"/"Quá tải"…) nên người mù màu vẫn đọc được —
  // không bao giờ truyền tin chỉ bằng màu.
  const STATE = {
    free: ['Rảnh', 'b-green'], busy: ['Đang làm', 'b-amber'],
    over: ['Quá tải', 'b-red'], leave: ['Nghỉ phép', 'b-gray'],
  };

  return (
    <>
      <div className="grid kpi-grid" style={{ marginBottom: 16 }}>
        <div className="card kpi"><span className="kpi-label">Nhân sự tính tải</span><div className="kpi-value">{staff.length}</div></div>
        <div className="card kpi"><span className="kpi-label">Quá tải tuần này (&gt;{CAP}h)</span>
          <div className="kpi-value" style={{ color: overloaded.length ? 'var(--danger)' : 'var(--accent)' }}>{overloaded.length}</div>
          <div className="kpi-sub">{overloaded.map(u => u.name).join(', ') || 'Không ai'}</div></div>
        <div className="card kpi"><span className="kpi-label">Đang trống (&lt;15h log)</span>
          <div className="kpi-value">{idle.length}</div>
          <div className="kpi-sub">{idle.slice(0, 3).map(u => u.name).join(', ') || '—'}</div></div>
      </div>

      {/* v3.12: Ai đang làm gì hôm nay */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><span className="card-title">Hôm nay ({fmtDate(today)}) — ai đang làm gì, ai rảnh</span>
          <span style={{ fontSize: '.74rem', color: 'var(--muted)' }}>{teamToday.filter(x => x.state === 'free').length} rảnh · {teamToday.filter(x => x.state === 'over').length} quá tải · chuẩn {DAY_CAP}h/ngày</span>
        </div>
        <div className="card-body" style={{ paddingTop: 6 }}>
          {teamToday.map(({ u, doing, dueToday, overdue, committed, state, isFL }) => {
            const [lb, cls] = STATE[state];
            return (
              <div key={u.id} className="act-item" style={{ alignItems: 'flex-start', gap: 10 }}>
                <span className="avatar" style={{ flex: 'none', marginTop: 2 }}>{initials(u.name)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="act-title">{u.name}{isFL && <span className="badge b-violet" style={{ marginLeft: 6, fontSize: '.7rem' }}>FL</span>}
                    <span className={`badge ${cls}`} style={{ marginLeft: 8 }}><span className="dot"></span>{lb}</span>
                    {committed > 0 && <span style={{ marginLeft: 6, fontSize: '.72rem', color: 'var(--muted)' }}>· cam kết {committed}h/{DAY_CAP}h</span>}
                    {overdue.length > 0 && <span style={{ marginLeft: 6, fontSize: '.72rem', color: 'var(--danger)', fontWeight: 700 }}>· {overdue.length} trễ</span>}</div>
                  <div className="act-sub">
                    {state === 'leave' ? 'Đang nghỉ phép hôm nay.'
                      : doing.length || dueToday.length
                        ? [...new Set([...doing, ...dueToday])].map(t => t.title).slice(0, 3).join(' · ')
                        : 'Không có việc đang làm / đến hạn hôm nay — có thể nhận thêm việc.'}
                  </div>
                </div>
                {canAssign && state === 'free' && <button className="btn btn-outline btn-sm" onClick={() => setAssignTo(u)} disabled={!unassigned.length}>+ Giao việc</button>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><span className="card-title">Giờ công theo tuần (mốc thứ Hai) — chuẩn {CAP}h/tuần</span>
          <span className="legend" style={{ margin: 0 }}>
            <span><i style={{ background: 'rgba(220,38,38,.7)' }}></i>Quá tải</span>
            <span><i style={{ background: 'rgba(5,150,105,.7)' }}></i>Tốt (30–40h)</span>
            <span><i style={{ background: 'rgba(217,119,6,.7)' }}></i>Vừa (15–30h)</span>
            <span><i style={{ background: 'var(--border)' }}></i>Trống (&lt;15h)</span>
          </span>
        </div>
        <div className="card-body" style={{ overflowX: 'auto' }}>
          <table style={{ fontSize: '.82rem' }}>
            <thead><tr><th>Nhân sự</th>{weeks.map((wk, i) => <th key={wk} style={{ textAlign: 'center' }}>Tuần {wkLabel(wk)}{i === 3 ? ' (này)' : ''}</th>)}<th style={{ textAlign: 'center' }}>Việc mở</th><th style={{ textAlign: 'center' }}>Trễ hạn</th><th style={{ textAlign: 'center' }}>Hạn 7 ngày</th>{canAssign && <th></th>}</tr></thead>
            <tbody>
              {staff.map(u => {
                const load = loadOf(u.id);
                return (
                  <tr key={u.id}>
                    <td><span className="cell-person"><span className="avatar">{initials(u.name)}</span>
                      <span><span className="cell-main">{u.name}</span><span className="cell-sub">{u.title || ''}</span></span></span></td>
                    {weeks.map(wk => {
                      const h = Math.round(hoursOf(u.id, wk) * 10) / 10;
                      return <td key={wk} style={{ textAlign: 'center', fontWeight: 700, color: cellColor(h), background: cellBg(h), borderRadius: 6 }}>
                        {h}h{h > CAP && ' ⚠'}</td>;
                    })}
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{load.open}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: load.late ? 'var(--danger)' : 'var(--muted)' }}>{load.late || '—'}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{load.week || '—'}</td>
                    {canAssign && <td><button className="btn btn-outline btn-sm" title={`Gán việc chưa phân cho ${u.name}`}
                      onClick={() => setAssignTo(u)} disabled={!unassigned.length}>+ Gán việc</button></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p style={{ fontSize: '.74rem', color: 'var(--muted)', marginTop: 10 }}>
            Giờ = tổng giờ công đã log trong tuần · Việc mở = task chưa hoàn thành được gán · Muốn phân việc mới, ưu tiên người ô tuần này nhạt màu + ít việc mở.
            {canAssign && <> · Đang có <b>{unassigned.length}</b> việc chưa phân.</>}
          </p>
        </div>
      </div>

      {assignTo && (
        <Modal title={`Gán việc cho ${assignTo.name} (${unassigned.length} việc chưa phân)`} onClose={() => setAssignTo(null)}
          footer={<button className="btn btn-primary" onClick={() => setAssignTo(null)}>Đóng</button>}>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {unassigned.map(t => (
              <div key={t.id} className="act-item" style={{ alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div className="act-title">{t.title}</div>
                  <div className="act-sub">{pName(t.projectId)}{t.dueDate ? ` · hạn ${fmtDate(t.dueDate)}` : ''}</div>
                </div>
                <AsyncButton className="btn btn-outline btn-sm" disabled={tasks.mutating} pendingLabel="Đang gán…" onClick={async () => {
                  const r = await tasks.update(t.id, { assigneeId: assignTo.id });
                  if (r) toast(`Đã gán "${t.title}" cho ${assignTo.name} — họ sẽ nhận chuông thông báo`);
                }}>Gán</AsyncButton>
              </div>
            ))}
            {!unassigned.length && <p style={{ fontSize: '.83rem', color: 'var(--muted)' }}>Hết việc chưa phân 🎉</p>}
          </div>
        </Modal>
      )}
    </>
  );
}
