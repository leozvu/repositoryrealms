'use client';
// v3.10: Sở chỉ huy dự án — mọi dự án + sức khỏe + đốt ngân sách + rủi ro deadline
// + tải nhân sự, một màn hình cho PM/CEO. Chỉ PM/LEAD/CEO/Kế toán.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useResource, Icon, Badge, Forbidden, EmptyState } from '@/components/ui';
import { moneyShort, fmtDate, todayISO, initials, parseItems } from '@/lib/format';

const HEALTH = { green: ['#059669', 'Ổn'], amber: ['#D97706', 'Cần chú ý'], red: ['#DC2626', 'Rủi ro'] };
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
  const totalMargin = canMoney ? active.reduce((s, p) => s + (stats[p.id]?.margin || 0), 0) : null;
  const totalOverdue = active.reduce((s, p) => s + (stats[p.id]?.taskOverdue || 0), 0);

  // Tải nhân sự tuần này: giờ cam kết = Σ giờ ước lượng việc đang mở được gán (proxy nhìn trước)
  const load = users.rows.filter(u => u.status === 'active').map(u => {
    const open = tasks.rows.filter(t => t.assigneeId === u.id && t.status !== 'done');
    const committed = open.reduce((s, t) => s + (t.estHours || 0), 0);
    const overdue = open.filter(t => t.dueDate && t.dueDate < todayISO()).length;
    return { u, open: open.length, committed, overdue };
  }).filter(x => x.open > 0).sort((a, b) => b.committed - a.committed);

  return (
    <>
      <div className="toolbar">
        <span style={{ fontSize: '1.05rem', fontWeight: 800 }}>📊 Sở chỉ huy dự án</span>
        <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>{active.length} dự án đang chạy</span>
        <div className="spacer"></div>
        <Link href="/projects" className="btn btn-outline btn-sm">Danh sách dự án</Link>
        <Link href="/resource" className="btn btn-outline btn-sm">Nguồn lực</Link>
      </div>

      <div className="grid kpi-grid">
        <div className="card kpi"><span className="kpi-label">Sức khỏe dự án</span>
          <div className="kpi-value" style={{ display: 'flex', gap: 12, fontSize: '1.15rem' }}>
            <span style={{ color: HEALTH.red[0] }}>🔴 {count('red')}</span>
            <span style={{ color: HEALTH.amber[0] }}>🟡 {count('amber')}</span>
            <span style={{ color: HEALTH.green[0] }}>🟢 {count('green')}</span>
          </div></div>
        <div className="card kpi"><span className="kpi-label">Việc trễ hạn (toàn bộ)</span>
          <div className="kpi-value" style={{ color: totalOverdue ? 'var(--danger)' : 'inherit' }}>{totalOverdue}</div></div>
        {canMoney && <div className="card kpi"><span className="kpi-label">Biên lợi nhuận gộp (đang chạy)</span>
          <div className="kpi-value" style={{ color: totalMargin >= 0 ? 'var(--accent)' : 'var(--danger)' }}>{moneyShort(totalMargin)}</div></div>}
        <div className="card kpi"><span className="kpi-label">Nhân sự quá tải tuần này</span>
          <div className="kpi-value" style={{ color: load.filter(l => l.committed > 40).length ? 'var(--warn, #D97706)' : 'inherit' }}>{load.filter(l => l.committed > 40).length}</div>
          <div className="kpi-sub">ngưỡng 40h việc đang mở</div></div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><span className="card-title">Dự án theo mức rủi ro</span></div>
        <div className="card-body" style={{ paddingTop: 0, overflowX: 'auto' }}>
          <table>
            <thead><tr><th></th><th>Dự án</th><th>Khách</th><th style={{ minWidth: 120 }}>Tiến độ</th><th>Giờ đốt</th>{canMoney && <th className="num">Biên LN</th>}<th>Deadline</th><th>Việc trễ</th></tr></thead>
            <tbody>
              {sorted.map(p => {
                const s = stats[p.id] || {};
                const [hc, hl] = HEALTH[s.health] || ['var(--muted)', ''];
                const late = p.deadline && p.deadline < todayISO();
                return (
                  <tr key={p.id}>
                    <td title={s.healthReasons?.join(', ') || hl} style={{ width: 8 }}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: hc }}></span></td>
                    <td><Link href={`/projects/${p.id}`} style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>{p.name}</Link>
                      {s.healthReasons?.length > 0 && <div className="cell-sub" style={{ color: hc }}>{s.healthReasons[0]}</div>}</td>
                    <td>{cName(p.clientId)}</td>
                    <td><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div className="progress" style={{ minWidth: 60 }}><i style={{ width: `${s.progress ?? p.progress}%` }}></i></div>
                      <small>{s.progress ?? p.progress}%</small></div></td>
                    <td style={{ fontSize: '.78rem', ...(s.burnHours > 100 ? { color: 'var(--danger)', fontWeight: 700 } : s.burnHours > 80 ? { color: 'var(--warn, #D97706)' } : {}) }}>
                      {s.loggedHours ?? 0}h{p.budgetHours ? `/${p.budgetHours}h` : ''}{s.burnHours != null ? ` (${s.burnHours}%)` : ''}</td>
                    {canMoney && <td className="num" style={{ color: (s.margin ?? 0) >= 0 ? 'var(--accent)' : 'var(--danger)', fontWeight: 700 }}>{moneyShort(s.margin ?? 0)}</td>}
                    <td style={late ? { color: 'var(--danger)', fontWeight: 600 } : {}}>{fmtDate(p.deadline)}</td>
                    <td style={{ textAlign: 'center', color: s.taskOverdue ? 'var(--danger)' : 'var(--muted)', fontWeight: s.taskOverdue ? 700 : 400 }}>{s.taskOverdue || '—'}</td>
                  </tr>
                );
              })}
              {!sorted.length && <tr><td colSpan={canMoney ? 8 : 7}><EmptyState title="Chưa có dự án đang chạy" /></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><span className="card-title">Tải nhân sự — giờ cam kết (việc đang mở)</span>
          <span style={{ fontSize: '.74rem', color: 'var(--muted)' }}>Nhìn trước theo giờ ước lượng · đỏ = &gt;40h</span></div>
        <div className="card-body" style={{ paddingTop: 8 }}>
          {load.map(l => (
            <div key={l.u.id} className="act-item" style={{ alignItems: 'center' }}>
              <span className="avatar">{initials(l.u.name)}</span>
              <div style={{ flex: 1 }}>
                <div className="act-title">{l.u.name} <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: '.75rem' }}>· {l.open} việc mở{l.overdue ? ` · ${l.overdue} trễ` : ''}</span></div>
                <div className="progress" style={{ marginTop: 3 }}><i style={{ width: Math.min(100, l.committed / 40 * 100) + '%', background: l.committed > 40 ? 'var(--danger)' : l.committed > 30 ? 'var(--warn, #D97706)' : 'var(--accent)' }}></i></div>
              </div>
              <b style={{ fontSize: '.85rem', color: l.committed > 40 ? 'var(--danger)' : 'inherit', minWidth: 44, textAlign: 'right' }}>{l.committed}h</b>
            </div>
          ))}
          {!load.length && <p style={{ fontSize: '.8rem', color: 'var(--muted)' }}>Chưa ai có việc mở với giờ ước lượng — nhập "giờ ước lượng" cho việc để dòng này có số.</p>}
        </div>
      </div>
    </>
  );
}
