'use client';
import { useResource, EmptyState } from '@/components/ui';
import { fmtDate, todayISO } from '@/lib/format';

const STATUS_COLOR = { planning: '#94A3B8', active: '#2563EB', paused: '#D97706', done: '#059669' };

export default function GanttPage() {
  const projects = useResource('projects');
  const tasks = useResource('tasks');
  const clients = useResource('clients');
  const cName = id => clients.rows.find(c => c.id === id)?.name || '';

  const rows = projects.rows.filter(p => p.startDate && p.deadline);
  if (!rows.length) return <EmptyState title="Chưa có dự án nào đủ ngày bắt đầu + deadline" sub="Điền ngày bắt đầu và deadline cho dự án để hiện Gantt" />;

  // Trục thời gian: từ min(start) − 3 ngày đến max(deadline) + 10 ngày
  const min = new Date(rows.reduce((m, p) => p.startDate < m ? p.startDate : m, rows[0].startDate));
  const max = new Date(rows.reduce((m, p) => p.deadline > m ? p.deadline : m, rows[0].deadline));
  min.setDate(min.getDate() - 3); max.setDate(max.getDate() + 10);
  const span = (max - min) / 86400000;
  const X = d => ((new Date(d) - min) / 86400000) / span * 100; // %

  // Vạch đầu tháng
  const monthTicks = [];
  const cur = new Date(min.getFullYear(), min.getMonth() + 1, 1);
  while (cur <= max) { monthTicks.push(new Date(cur)); cur.setMonth(cur.getMonth() + 1); }

  return (
    <>
      <div className="card">
        <div className="card-head"><span className="card-title">Gantt — tiến độ toàn bộ dự án</span>
          <span className="legend" style={{ margin: 0 }}>
            {Object.entries({ planning: 'Kế hoạch', active: 'Đang chạy', paused: 'Tạm dừng', done: 'Xong' }).map(([k, l]) =>
              <span key={k}><i style={{ background: STATUS_COLOR[k] }}></i>{l}</span>)}
            <span><i style={{ background: 'var(--danger)', borderRadius: '50%' }}></i>Hạn công việc</span>
          </span>
        </div>
        <div className="card-body" style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 700, position: 'relative' }}>
            {/* Lưới tháng */}
            <div style={{ position: 'relative', height: 22, marginLeft: 220 }}>
              {monthTicks.map((t, i) => (
                <span key={i} style={{ position: 'absolute', left: X(t) + '%', fontSize: '.68rem', color: 'var(--muted)', transform: 'translateX(-50%)' }}>
                  T{t.getMonth() + 1}/{t.getFullYear()}</span>
              ))}
            </div>
            {rows.sort((a, b) => a.startDate.localeCompare(b.startDate)).map(p => {
              const pt = tasks.rows.filter(t => t.projectId === p.id && t.dueDate);
              const late = p.status !== 'done' && p.deadline < todayISO();
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', padding: '7px 0', borderTop: '1px solid var(--border)' }}>
                  <div style={{ width: 220, flex: 'none', paddingRight: 12 }}>
                    <div style={{ fontSize: '.82rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                    <div style={{ fontSize: '.7rem', color: late ? 'var(--danger)' : 'var(--muted)' }}>{cName(p.clientId)} · {fmtDate(p.startDate)} → {fmtDate(p.deadline)}{late ? ' ⚠ trễ' : ''}</div>
                  </div>
                  <div style={{ flex: 1, position: 'relative', height: 30 }}>
                    {monthTicks.map((t, i) => (
                      <span key={i} style={{ position: 'absolute', left: X(t) + '%', top: 0, bottom: 0, width: 1, background: 'var(--border)' }}></span>
                    ))}
                    {/* Thanh dự án + lớp tiến độ */}
                    <div style={{ position: 'absolute', left: X(p.startDate) + '%', width: Math.max(1, X(p.deadline) - X(p.startDate)) + '%', top: 5, height: 18, background: STATUS_COLOR[p.status] + '44', borderRadius: 6, border: `1px solid ${STATUS_COLOR[p.status]}` }}>
                      <div style={{ width: `${Math.min(100, p.progress || 0)}%`, height: '100%', background: STATUS_COLOR[p.status], borderRadius: 5 }}
                        title={`${p.name}: ${p.progress || 0}%`}></div>
                    </div>
                    {/* Mốc hạn công việc */}
                    {pt.map(t => (
                      <span key={t.id} title={`${t.title} — hạn ${fmtDate(t.dueDate)}${t.status === 'done' ? ' (xong)' : ''}`}
                        style={{ position: 'absolute', left: X(t.dueDate) + '%', top: 9, width: 9, height: 9, transform: 'translateX(-50%) rotate(45deg)', background: t.status === 'done' ? 'var(--accent)' : 'var(--danger)', borderRadius: 2, cursor: 'help' }}></span>
                    ))}
                    {/* Vạch hôm nay */}
                    <span style={{ position: 'absolute', left: X(todayISO()) + '%', top: 0, bottom: 0, width: 2, background: 'var(--primary)' }}></span>
                  </div>
                </div>
              );
            })}
            <div style={{ marginLeft: 220, position: 'relative', height: 18 }}>
              <span style={{ position: 'absolute', left: X(todayISO()) + '%', transform: 'translateX(-50%)', fontSize: '.66rem', color: 'var(--primary)', fontWeight: 700 }}>Hôm nay</span>
            </div>
          </div>
        </div>
      </div>
      <p style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: 10 }}>Thanh đậm = % tiến độ đã hoàn thành · hình thoi = hạn công việc (đỏ = chưa xong, xanh = đã xong) · di chuột để xem chi tiết.</p>
    </>
  );
}
