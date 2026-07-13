'use client';
// v3.7: Hồ sơ nhân sự 360° — việc đang làm, giờ công, phép còn lại, chấm công,
// tài sản đang giữ, OKR cá nhân. Dữ liệu nhạy cảm (lương, giờ người khác) do RBAC API tự che.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useResource, Icon, Badge, EmptyState, useRoleLabels } from '@/components/ui';
import { money, fmtDate, todayISO, thisMonth, monthKey, initials, parseItems } from '@/lib/format';
import { rolesOf } from '@/lib/perm';

export default function StaffDetailPage() {
  const { id } = useParams();
  const { data: session } = useSession();
  const me = session?.user;
  const RL = useRoleLabels();
  const users = useResource('users');
  const teams = useResource('teams');
  const tasks = useResource('tasks');
  const timelogs = useResource('timelogs');
  const leaves = useResource('leaves');
  const attendance = useResource('attendance');
  const assets = useResource('assets');
  const okrs = useResource('okr');
  const [leaveQuota, setLeaveQuota] = useState(12);
  useEffect(() => { fetch('/api/settings').then(r => r.ok ? r.json() : null).then(d => d && setLeaveQuota(+d.leaveQuota || 12)).catch(() => {}); }, []);

  const u = users.rows.find(x => x.id === id);
  if (users.loading) return null;
  if (!u) return <EmptyState title="Không tìm thấy nhân sự" />;

  const team = teams.rows.find(t => t.id === u.teamId);
  const myTasks = tasks.rows.filter(t => t.assigneeId === id && t.status !== 'done');
  const lateTasks = myTasks.filter(t => t.dueDate && t.dueDate < todayISO());
  const monthHours = timelogs.rows.filter(l => l.userId === id && monthKey(l.date) === thisMonth()).reduce((s, l) => s + l.hours, 0);
  const leaveDays = l => Math.round((new Date(l.to) - new Date(l.from)) / 86400000) + 1;
  const myLeaves = leaves.rows.filter(l => l.userId === id && String(l.from).startsWith(String(new Date().getFullYear())));
  const usedLeave = myLeaves.filter(l => l.status === 'approved' && l.type === 'annual').reduce((s, l) => s + leaveDays(l), 0);
  const myAssets = assets.rows.filter(a => a.holderId === id && a.status === 'in_use');
  const q = `${new Date().getFullYear()}-Q${Math.ceil((new Date().getMonth() + 1) / 3)}`;
  const myOkrs = okrs.rows.filter(o => o.userId === id && o.quarter === q);
  const att10 = attendance.rows.filter(a => a.userId === id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  const ATT = { present: ['Đi làm', 'var(--accent)'], remote: ['Remote', '#7C3AED'], off: ['Nghỉ', 'var(--muted)'] };

  return (
    <>
      <div className="toolbar">
        <Link href="/staff" className="btn btn-outline btn-sm">← Hồ sơ &amp; nhóm</Link>
        <span className="avatar" style={{ width: 34, height: 34 }}>{initials(u.name)}</span>
        <span style={{ fontSize: '1.05rem', fontWeight: 800 }}>{u.name}{u.id === me?.id ? ' (tôi)' : ''}</span>
        {rolesOf(u).map(r => <span key={r} className={`role-chip role-${r}`}>{RL[r] || r}</span>)}
        <div className="spacer"></div>
        <span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>{[u.title, team?.name, u.email, u.phone].filter(Boolean).join(' · ')}</span>
      </div>

      <div className="grid kpi-grid">
        <div className="card kpi"><span className="kpi-label">Việc đang mở</span>
          <div className="kpi-value">{myTasks.length}</div>
          <div className="kpi-sub" style={lateTasks.length ? { color: 'var(--danger)', fontWeight: 700 } : {}}>{lateTasks.length ? `⚠ ${lateTasks.length} trễ hạn` : 'không trễ hạn'}</div></div>
        <div className="card kpi"><span className="kpi-label">Giờ công tháng này</span>
          <div className="kpi-value">{Math.round(monthHours * 10) / 10}h</div></div>
        <div className="card kpi"><span className="kpi-label">Phép năm còn lại</span>
          <div className="kpi-value" style={{ color: leaveQuota - usedLeave <= 2 ? 'var(--warn, #D97706)' : 'var(--accent)' }}>{Math.max(0, leaveQuota - usedLeave)}<span style={{ fontSize: '.85rem', color: 'var(--muted)' }}> / {leaveQuota}</span></div>
          <div className="kpi-sub">đã dùng {usedLeave} ngày</div></div>
        <div className="card kpi"><span className="kpi-label">Tài sản đang giữ</span>
          <div className="kpi-value">{myAssets.length}</div>
          {u.salary !== undefined && u.salary > 0 && <div className="kpi-sub">Lương: {money(u.salary)}</div>}</div>
      </div>

      <div className="grid two-col" style={{ marginTop: 16, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card">
            <div className="card-head"><span className="card-title">Việc đang mở ({myTasks.length})</span></div>
            <div className="card-body" style={{ paddingTop: 6, maxHeight: 320, overflowY: 'auto' }}>
              {myTasks.map(t => {
                const cl = parseItems(t.checklist);
                const late = t.dueDate && t.dueDate < todayISO();
                return (
                  <div key={t.id} className="act-item" style={{ alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <div className="act-title">{t.recur && '🔁 '}{t.title}</div>
                      <div className="act-sub">{cl.length > 0 && <>☑ {cl.filter(x => x.done).length}/{cl.length} · </>}
                        <span style={late ? { color: 'var(--danger)', fontWeight: 700 } : {}}>{t.dueDate ? 'hạn ' + fmtDate(t.dueDate) : 'không hạn'}</span></div>
                    </div>
                    <Badge map="task" k={t.status} />
                  </div>
                );
              })}
              {!myTasks.length && <p style={{ fontSize: '.8rem', color: 'var(--muted)' }}>Không có việc mở nào.</p>}
            </div>
          </div>
          <div className="card">
            <div className="card-head"><span className="card-title">Nghỉ phép năm nay ({myLeaves.length})</span></div>
            <div className="card-body" style={{ paddingTop: 6 }}>
              {myLeaves.map(l => (
                <div key={l.id} className="act-item" style={{ alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div className="act-title">{fmtDate(l.from)} → {fmtDate(l.to)} ({leaveDays(l)} ngày)</div>
                    <div className="act-sub">{l.type === 'annual' ? 'Phép năm' : l.type === 'sick' ? 'Nghỉ ốm' : 'Không lương'}{l.note ? ' · ' + l.note : ''}</div>
                  </div>
                  <Badge map="leave" k={l.status} />
                </div>
              ))}
              {!myLeaves.length && <p style={{ fontSize: '.8rem', color: 'var(--muted)' }}>Chưa nghỉ ngày nào trong năm.</p>}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card">
            <div className="card-head"><span className="card-title">Chấm công 10 ngày gần nhất</span></div>
            <div className="card-body" style={{ paddingTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {att10.map(a => {
                const [lb, color] = ATT[a.status] || [a.status, 'var(--muted)'];
                return <span key={a.id} className="badge" title={lb} style={{ borderColor: color, color }}>{fmtDate(a.date).slice(0, 5)} · {lb}</span>;
              })}
              {!att10.length && <p style={{ fontSize: '.8rem', color: 'var(--muted)' }}>Chưa có dữ liệu chấm công.</p>}
            </div>
          </div>
          <div className="card">
            <div className="card-head"><span className="card-title">Tài sản đang giữ ({myAssets.length})</span></div>
            <div className="card-body" style={{ paddingTop: 6 }}>
              {myAssets.map(a => (
                <div key={a.id} className="act-item">
                  <span style={{ flex: 'none' }}>💼</span>
                  <div style={{ flex: 1 }}>
                    <div className="act-title">{a.name}</div>
                    <div className="act-sub">{[a.category, a.serial].filter(Boolean).join(' · ')}</div>
                  </div>
                </div>
              ))}
              {!myAssets.length && <p style={{ fontSize: '.8rem', color: 'var(--muted)' }}>Không giữ tài sản nào.</p>}
            </div>
          </div>
          <div className="card">
            <div className="card-head"><span className="card-title">OKR quý này ({myOkrs.length})</span></div>
            <div className="card-body" style={{ paddingTop: 6 }}>
              {myOkrs.map(o => {
                const pct = o.target ? Math.min(100, Math.round(o.current / o.target * 100)) : 0;
                return (
                  <div key={o.id} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.84rem' }}>
                      <span>{o.title}</span><b>{o.current}/{o.target} {o.unit || ''}</b>
                    </div>
                    <div className="progress" style={{ marginTop: 4 }}><i style={{ width: pct + '%' }}></i></div>
                  </div>
                );
              })}
              {!myOkrs.length && <p style={{ fontSize: '.8rem', color: 'var(--muted)' }}>Chưa có OKR cá nhân quý này — tạo trong mục KPI/OKR.</p>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
