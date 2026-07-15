'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useResource, EmptyState, FormModal, ConfirmDialog, Icon, useToast } from '@/components/ui';
import { fmtDate, todayISO, parseItems } from '@/lib/format';
import { hasAny } from '@/lib/perm';

const STATUS_COLOR = { planning: '#94A3B8', active: '#2563EB', paused: '#D97706', done: '#059669' };
const MILESTONE_COLOR = { pending: '#7C3AED', done: '#059669' };

export default function GanttPage() {
  const { data: session } = useSession();
  const user = session?.user;
  const canEdit = hasAny(user, ['PM']); // PM + Giám đốc
  const projects = useResource('projects');
  const tasks = useResource('tasks');
  const clients = useResource('clients');
  const milestones = useResource('milestones');
  const [modal, setModal] = useState(null);
  const toast = useToast();
  const cName = id => clients.rows.find(c => c.id === id)?.name || '';

  // v3.2: mũi tên phụ thuộc — đo tọa độ thật của các hình thoi task từ DOM
  // (chiều cao hàng phụ thuộc font/wrap nên không dùng hằng số cứng)
  const contRef = useRef(null);
  const [arrows, setArrows] = useState([]);
  useLayoutEffect(() => {
    const measure = () => {
      const cont = contRef.current;
      if (!cont) { setArrows([]); return; }
      const cr = cont.getBoundingClientRect();
      const pos = {};
      cont.querySelectorAll('[data-taskid]').forEach(el => {
        const r = el.getBoundingClientRect();
        pos[el.dataset.taskid] = { x: r.left + r.width / 2 - cr.left, y: r.top + r.height / 2 - cr.top };
      });
      const out = [];
      tasks.rows.forEach(t => parseItems(t.dependsOn).forEach(depId => {
        if (pos[depId] && pos[t.id]) out.push({ k: `${depId}-${t.id}`, from: pos[depId], to: pos[t.id] });
      }));
      setArrows(out);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [tasks.rows, projects.rows, milestones.rows]);

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

  // Sắp xếp cố định (copy, không mutate mảng của useResource)
  const sorted = [...rows].sort((a, b) => a.startDate.localeCompare(b.startDate));

  const blocked = t => t.status !== 'done' && parseItems(t.dependsOn)
    .some(id => { const d = tasks.rows.find(r => r.id === id); return d && d.status !== 'done'; });

  const msFields = [
    { key: 'projectId', label: 'Dự án', type: 'select', required: true, options: rows.map(p => ({ value: p.id, label: p.name })) },
    { key: 'name', label: 'Tên mốc', required: true, placeholder: 'VD: Golive chiến dịch' },
    { key: 'date', label: 'Ngày', type: 'date', required: true },
    { key: 'done', label: 'Trạng thái', type: 'select', options: [{ value: '', label: 'Chưa đạt' }, { value: '1', label: 'Đã đạt' }] },
    { key: 'note', label: 'Ghi chú', type: 'textarea', full: true },
  ];
  const saveMs = async d => {
    const data = { ...d, done: d.done === '1' };
    if (modal.row) await milestones.update(modal.row.id, data); else await milestones.create(data);
    toast(modal.row ? 'Đã cập nhật mốc' : 'Đã thêm mốc dự án');
  };

  return (
    <>
      <div className="card">
        <div className="card-head"><span className="card-title">Gantt — tiến độ toàn bộ dự án</span>
          <span className="legend" style={{ margin: 0 }}>
            {Object.entries({ planning: 'Kế hoạch', active: 'Đang chạy', paused: 'Tạm dừng', done: 'Xong' }).map(([k, l]) =>
              <span key={k}><i style={{ background: STATUS_COLOR[k] }}></i>{l}</span>)}
            <span><i style={{ background: 'var(--danger)', borderRadius: '50%' }}></i>Hạn công việc</span>
            <span><i style={{ background: MILESTONE_COLOR.pending, transform: 'rotate(45deg)' }}></i>Mốc dự án</span>
          </span>
          {canEdit && <button className="btn btn-primary" style={{ marginLeft: 12 }}
            onClick={() => setModal({ data: { projectId: rows[0].id, date: todayISO(), done: '' } })}>
            <Icon name="plus" size={15} /><span>Thêm mốc</span></button>}
        </div>
        <div className="card-body" style={{ overflowX: 'auto' }}>
          <div ref={contRef} style={{ minWidth: 700, position: 'relative' }}>
            {/* Lưới tháng */}
            <div style={{ position: 'relative', height: 22, marginLeft: 220 }}>
              {monthTicks.map((t, i) => (
                <span key={i} style={{ position: 'absolute', left: X(t) + '%', fontSize: '.7rem', color: 'var(--muted)', transform: 'translateX(-50%)' }}>
                  T{t.getMonth() + 1}/{t.getFullYear()}</span>
              ))}
            </div>
            {sorted.map(p => {
              const pt = tasks.rows.filter(t => t.projectId === p.id && t.dueDate);
              const pms = milestones.rows.filter(m => m.projectId === p.id);
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
                    {/* Hạn công việc (viền đỏ đậm = đang bị việc khác chặn) */}
                    {pt.map(t => (
                      <span key={t.id} data-taskid={t.id} title={`${t.title} — hạn ${fmtDate(t.dueDate)}${t.status === 'done' ? ' (xong)' : blocked(t) ? ' (chờ việc phụ thuộc)' : ''}`}
                        style={{ position: 'absolute', left: X(t.dueDate) + '%', top: 9, width: 9, height: 9, transform: 'translateX(-50%) rotate(45deg)', background: t.status === 'done' ? 'var(--accent)' : 'var(--danger)', borderRadius: 2, cursor: 'help', boxShadow: blocked(t) ? '0 0 0 2px var(--danger)' : 'none', zIndex: 2 }}></span>
                    ))}
                    {/* v3.2: mốc dự án — hình thoi lớn, click để sửa (PM/GĐ) */}
                    {pms.map(m => (
                      <span key={m.id} title={`◆ ${m.name} — ${fmtDate(m.date)}${m.done ? ' (đã đạt)' : ''}${m.note ? ' · ' + m.note : ''}`}
                        onClick={() => canEdit && setModal({ row: m, data: { ...m, done: m.done ? '1' : '' } })}
                        style={{ position: 'absolute', left: X(m.date) + '%', top: 6, width: 13, height: 13, transform: 'translateX(-50%) rotate(45deg)', background: m.done ? MILESTONE_COLOR.done : MILESTONE_COLOR.pending, borderRadius: 3, border: '2px solid var(--card, #fff)', cursor: canEdit ? 'pointer' : 'help', zIndex: 3 }}></span>
                    ))}
                    {/* Vạch hôm nay */}
                    <span style={{ position: 'absolute', left: X(todayISO()) + '%', top: 0, bottom: 0, width: 2, background: 'var(--primary)' }}></span>
                  </div>
                </div>
              );
            })}
            {/* v3.2: mũi tên phụ thuộc giữa các task (nét đứt, tọa độ px đo từ DOM) */}
            {arrows.length > 0 && (
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                <svg width="100%" height="100%" style={{ display: 'block' }}>
                  <defs>
                    <marker id="dep-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
                      <path d="M0,0 L6,3 L0,6" fill="none" stroke="var(--muted)" strokeWidth="1.4" />
                    </marker>
                  </defs>
                  {arrows.map(a => (
                    <line key={a.k} x1={a.from.x} y1={a.from.y} x2={a.to.x} y2={a.to.y}
                      stroke="var(--muted)" strokeWidth="1.4" strokeDasharray="4 3" opacity=".6" markerEnd="url(#dep-arrow)" />
                  ))}
                </svg>
              </div>
            )}
            <div style={{ marginLeft: 220, position: 'relative', height: 18 }}>
              <span style={{ position: 'absolute', left: X(todayISO()) + '%', transform: 'translateX(-50%)', fontSize: '.7rem', color: 'var(--primary)', fontWeight: 700 }}>Hôm nay</span>
            </div>
          </div>
        </div>
      </div>
      <p style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: 10 }}>
        Thanh đậm = % tiến độ · hình thoi nhỏ = hạn công việc (đỏ = chưa xong, viền đỏ đậm = chờ việc phụ thuộc) ·
        hình thoi lớn = mốc dự án (tím = chưa đạt, xanh = đã đạt{canEdit ? ', click để sửa' : ''}) ·
        nét đứt = việc sau phụ thuộc việc trước · di chuột để xem chi tiết.
      </p>

      {modal && !modal.del && <FormModal title={modal.row ? 'Sửa mốc dự án' : 'Thêm mốc dự án'} fields={msFields} data={modal.data}
        onClose={() => setModal(null)} onSave={saveMs}
        extraFooter={modal.row && <button className="btn btn-ghost" style={{ marginRight: 'auto', color: 'var(--danger)' }}
          onClick={() => setModal({ del: modal.row })}><Icon name="trash" size={16} /> Xóa</button>} />}
      {modal?.del && <ConfirmDialog msg={`Xóa mốc "${modal.del.name}"?`}
        onClose={() => setModal(null)} onYes={async () => { await milestones.remove(modal.del.id); toast('Đã xóa mốc'); }} />}
    </>
  );
}
