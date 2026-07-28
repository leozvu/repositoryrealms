'use client';
// Project Execution Health portfolio — delivery, dependency, capacity and planning proxies.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useResource, Icon, Forbidden, EmptyState } from '@/components/ui';
import { moneyShort, fmtDate, todayISO, initials } from '@/lib/format';
import styles from './portfolio-execution-health.module.css';

const HEALTH = { green: ['Ổn định', 'green'], amber: ['Cần chú ý', 'amber'], red: ['Rủi ro', 'red'] };
const ORDER = { red: 0, amber: 1, green: 2 };

export default function PortfolioPage() {
  const projects = useResource('projects');
  const clients = useResource('clients');
  const tasks = useResource('tasks');
  const users = useResource('users');
  const [data, setData] = useState(null);

  useEffect(() => { fetch('/api/projects/stats').then(r => r.status === 403 ? 'forbid' : r.json()).then(setData).catch(() => {}); }, []);
  if (data === 'forbid') return <Forbidden />;

  const stats = data?.stats || {};
  const canMoney = data?.canSeeMoney;
  const cName = id => clients.rows.find(c => c.id === id)?.name || '—';
  const active = projects.rows.filter(p => p.status !== 'done' && p.status !== 'paused');
  const sorted = [...active].sort((a, b) => (ORDER[stats[a.id]?.health] ?? 3) - (ORDER[stats[b.id]?.health] ?? 3));

  const count = lv => active.filter(p => stats[p.id]?.health === lv).length;
  const totalMarginProxy = canMoney ? active.reduce((s, p) => s + (stats[p.id]?.margin || 0), 0) : null;
  const totalOverdue = active.reduce((s, p) => s + (stats[p.id]?.taskOverdue || 0), 0);
  const totalBlocked = active.reduce((s, p) => s + (stats[p.id]?.blockedTasks || 0), 0);
  const totalDependencies = active.reduce((s, p) => s + (stats[p.id]?.dependencyBlocked || 0), 0);
  const constrainedProjectAssignments = active.reduce((s, p) => s + (stats[p.id]?.constrainedMembers || 0), 0);

  // Context only. Alphabetical, never a productivity score or employee ranking.
  const resourceContext = users.rows.filter(u => u.status === 'active').map(u => {
    const open = tasks.rows.filter(t => t.assigneeId === u.id && t.status !== 'done');
    const openEstimate = open.reduce((s, t) => s + (t.estHours || 0), 0);
    const overdue = open.filter(t => t.dueDate && t.dueDate < todayISO()).length;
    return { u, open: open.length, openEstimate, overdue };
  }).filter(x => x.open > 0).sort((a, b) => a.u.name.localeCompare(b.u.name, 'vi'));

  return (
    <>
      <div className="toolbar">
        <span style={{ fontSize: '1.05rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Icon name="reports" size={18} />Project Execution Health</span>
        <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>{active.length} dự án đang chạy</span>
        <div className="spacer"></div>
        <Link href="/projects" className="btn btn-outline btn-sm">Danh sách dự án</Link>
        <Link href="/resources" className="btn btn-outline btn-sm">Nguồn lực</Link>
      </div>

      <div className="grid kpi-grid">
        <div className="card kpi"><span className="kpi-label">Sức khỏe dự án</span>
          <div className="kpi-value" style={{ display: 'flex', gap: 12, fontSize: '1.15rem' }}>
            {/* v3.14: bỏ emoji 🔴🟡🟢 — badge + chấm màu, luôn kèm số nên không truyền tin bằng màu đơn thuần */}
            <span className="badge b-red"><span className="dot"></span>{count('red')} rủi ro</span>
            <span className="badge b-amber"><span className="dot"></span>{count('amber')} chú ý</span>
            <span className="badge b-green"><span className="dot"></span>{count('green')} ổn</span>
          </div></div>
        <div className="card kpi"><span className="kpi-label">Delivery constraints</span>
          <div className="kpi-value" style={{ color: totalBlocked ? 'var(--danger)' : 'inherit' }}>{totalBlocked} blocked</div>
          <div className="kpi-sub">{totalDependencies} dependency chưa xong · {totalOverdue} task trễ</div></div>
        {canMoney && <div className="card kpi"><span className="kpi-label">Planning margin proxy</span>
          <div className="kpi-value" style={{ color: totalMarginProxy >= 0 ? 'var(--accent)' : 'var(--danger)' }}>{moneyShort(totalMarginProxy)}</div>
          <div className="kpi-sub">Budget − labor proxy − vendor commitment; không phải accounting profit</div></div>}
        <div className="card kpi"><span className="kpi-label">Capacity constraints</span>
          <div className="kpi-value" style={{ color: constrainedProjectAssignments ? 'var(--warn, #D97706)' : 'inherit' }}>{constrainedProjectAssignments}</div>
          <div className="kpi-sub">lượt phân bổ dự án vượt WIP; một người có thể xuất hiện ở nhiều dự án</div></div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><span className="card-title">Dự án theo mức rủi ro</span></div>
        <div className="card-body" style={{ paddingTop: 0, overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Sức khỏe</th><th>Dự án</th><th>Khách</th><th style={{ minWidth: 120 }}>Tiến độ</th><th>Giờ khai báo / NS</th><th>Constraints</th>{canMoney && <th className="num">Margin proxy</th>}<th>Deadline</th></tr></thead>
            <tbody>
              {sorted.map(p => {
                const s = stats[p.id] || {};
                const [healthLabel, healthTone] = HEALTH[s.health] || ['Chưa đủ dữ liệu', 'neutral'];
                const late = p.deadline && p.deadline < todayISO();
                return (
                  <tr key={p.id}>
                    <td><span className={`${styles.healthBadge} ${styles[healthTone]}`} title={s.healthReasons?.join(', ') || healthLabel}>
                      <span className={styles.healthDot} aria-hidden="true"></span>{healthLabel}
                    </span></td>
                    <td><Link href={`/projects/${p.id}`} style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>{p.name}</Link>
                      {s.healthReasons?.length > 0 && <div className={styles.primarySignal}>{s.healthReasons[0]}</div>}</td>
                    <td>{cName(p.clientId)}</td>
                    <td><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div className="progress" style={{ minWidth: 60 }}><i style={{ width: `${s.progress ?? p.progress}%` }}></i></div>
                      <small>{s.progress ?? p.progress}%</small></div></td>
                    <td style={{ fontSize: '.78rem', ...(s.burnHours > 100 ? { color: 'var(--danger)', fontWeight: 700 } : s.burnHours > 80 ? { color: 'var(--warn, #D97706)' } : {}) }}>
                      {s.loggedHours ?? 0}h{p.budgetHours ? `/${p.budgetHours}h` : ''}{s.burnHours != null ? ` (${s.burnHours}%)` : ''}</td>
                    <td className={styles.constraintCell}>
                      <span>{s.blockedTasks || 0} blocked</span>
                      <span>{s.dependencyBlocked || 0} dependency</span>
                      <span>{s.constrainedMembers || 0} vượt WIP</span>
                    </td>
                    {canMoney && <td className="num" style={{ color: (s.margin ?? 0) >= 0 ? 'var(--accent)' : 'var(--danger)', fontWeight: 700 }}>{moneyShort(s.margin ?? 0)}</td>}
                    <td style={late ? { color: 'var(--danger)', fontWeight: 600 } : {}}>{fmtDate(p.deadline)}{late && <span className={styles.overdueLabel}>Trễ</span>}</td>
                  </tr>
                );
              })}
              {!sorted.length && <tr><td colSpan={canMoney ? 8 : 7}><EmptyState title="Chưa có dự án đang chạy" /></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><span className="card-title">Resource context — theo thứ tự tên</span>
          <span style={{ fontSize: '.74rem', color: 'var(--muted)' }}>Context điều phối; không phải điểm hiệu suất hay bảng xếp hạng</span></div>
        <div className="card-body" style={{ paddingTop: 8 }}>
          {resourceContext.map(l => (
            <div key={l.u.id} className="act-item" style={{ alignItems: 'center' }}>
              <span className="avatar">{initials(l.u.name)}</span>
              <div style={{ flex: 1 }}>
                <div className="act-title">{l.u.name} <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: '.75rem' }}>· {l.open} việc mở{l.overdue ? ` · ${l.overdue} trễ` : ''}</span></div>
                <div className={styles.resourceProvenance}>Ước lượng còn mở chỉ để lập kế hoạch; capacity chính thức dùng WIP trong từng project.</div>
              </div>
              <b style={{ fontSize: '.85rem', minWidth: 82, textAlign: 'right' }}>{l.openEstimate}h estimate</b>
            </div>
          ))}
          {!resourceContext.length && <p style={{ fontSize: '.8rem', color: 'var(--muted)' }}>Chưa có nguồn lực nào được gán vào task đang mở.</p>}
        </div>
      </div>
    </>
  );
}
