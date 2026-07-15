'use client';
// v3.10: Trang vận hành một dự án — sức khỏe, chi phí/biên lợi nhuận, giai đoạn (phase),
// việc theo phase, mốc, tài liệu. Số tiền chỉ hiện với CEO/Kế toán/PM/Lead.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useResource, Icon, FormModal, ConfirmDialog, EmptyState, Badge, useToast } from '@/components/ui';
import { DocLinks } from '@/components/DocLinks';
import { money, moneyShort, fmtDate, todayISO, initials, BADGE } from '@/lib/format';
import { hasAny } from '@/lib/perm';

// v3.14: bỏ emoji — màu đã có trong biến, chữ đứng riêng (không truyền tin bằng màu đơn thuần)
const HEALTH = { green: ['#059669', 'Ổn'], amber: ['#D97706', 'Cần chú ý'], red: ['#DC2626', 'Rủi ro'] };
const PHASE_COLORS = ['#2563EB', '#7C3AED', '#059669', '#D97706', '#DB2777', '#0891B2'];

export default function ProjectDetailPage() {
  const { id } = useParams();
  const { data: session } = useSession();
  const isMgmt = hasAny(session?.user, ['PM', 'LEAD']);
  const projects = useResource('projects');
  const tasks = useResource('tasks');
  const phases = useResource('phases');
  const users = useResource('users');
  const clients = useResource('clients');
  const [st, setSt] = useState(null);
  const [canMoney, setCanMoney] = useState(false);
  const [modal, setModal] = useState(null);
  const toast = useToast();

  useEffect(() => { fetch('/api/projects/stats').then(r => r.ok ? r.json() : null).then(d => { if (d) { setSt(d.stats[id]); setCanMoney(d.canSeeMoney); } }).catch(() => {}); }, [id, tasks.rows.length, phases.rows.length]);

  const p = projects.rows.find(x => x.id === id);
  if (projects.loading) return null;
  if (!p) return <EmptyState title="Không tìm thấy dự án" />;

  const uName = uid => users.rows.find(u => u.id === uid)?.name || '—';
  const myPhases = phases.rows.filter(ph => ph.projectId === id).sort((a, b) => a.order - b.order);
  const myTasks = tasks.rows.filter(t => t.projectId === id);
  const noPhase = myTasks.filter(t => !t.phaseId || !myPhases.some(ph => ph.id === t.phaseId));
  const [hc, hl] = HEALTH[st?.health] || ['var(--muted)', ''];
  const clientName = clients.rows.find(c => c.id === p.clientId)?.name || '—';

  const phaseProgress = phId => {
    const ts = myTasks.filter(t => t.phaseId === phId);
    if (!ts.length) return 0;
    const est = ts.reduce((s, t) => s + (t.estHours || 0), 0);
    if (est > 0) return Math.round(ts.filter(t => t.status === 'done').reduce((s, t) => s + (t.estHours || 0), 0) / est * 100);
    return Math.round(ts.filter(t => t.status === 'done').length / ts.length * 100);
  };

  const addPhase = async name => {
    if (!name?.trim()) return;
    await phases.create({ projectId: id, name: name.trim(), order: myPhases.length, color: PHASE_COLORS[myPhases.length % PHASE_COLORS.length] });
    toast('Đã thêm giai đoạn');
  };
  const moveTask = async (task, phaseId) => { await tasks.update(task.id, { phaseId: phaseId || null }); };

  const TaskRow = ({ t }) => {
    const late = t.status !== 'done' && t.dueDate && t.dueDate < todayISO();
    return (
      <div className="act-item" style={{ alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', background: BADGE.task[t.status]?.[1] === 'b-green' ? 'var(--accent)' : t.status === 'doing' ? 'var(--primary)' : 'var(--muted)' }}></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="act-title" style={{ textDecoration: t.status === 'done' ? 'line-through' : 'none', opacity: t.status === 'done' ? .6 : 1 }}>{t.title}</div>
          <div className="act-sub">{uName(t.assigneeId)}{t.estHours ? ` · ${t.estHours}h ước lượng` : ''}{t.dueDate ? ` · hạn ${fmtDate(t.dueDate)}` : ''}{late ? ' ⚠' : ''}</div>
        </div>
        <Badge map="task" k={t.status} />
        {isMgmt && (
          <select value={t.phaseId && myPhases.some(ph => ph.id === t.phaseId) ? t.phaseId : ''} onChange={e => moveTask(t, e.target.value)}
            title="Chuyển giai đoạn" style={{ fontSize: '.72rem', padding: '2px 4px', maxWidth: 110 }}>
            <option value="">— Chưa xếp —</option>
            {myPhases.map(ph => <option key={ph.id} value={ph.id}>{ph.name}</option>)}
          </select>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="toolbar">
        <Link href="/projects" className="btn btn-outline btn-sm">← Dự án</Link>
        <span style={{ fontSize: '1.05rem', fontWeight: 800 }}>{p.name}</span>
        <span className="badge" style={{ borderColor: hc, color: hc }}>{hl}</span>
        <Badge map="project" k={p.status} />
        <div className="spacer"></div>
        <span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>{clientName} · {p.service || '—'} · {fmtDate(p.startDate)} → {fmtDate(p.deadline)}</span>
        <Link href="/tasks" className="btn btn-outline btn-sm">Mở bảng công việc →</Link>
      </div>

      {st?.healthReasons?.length > 0 && (
        <div className="card" style={{ marginBottom: 14, borderLeft: `4px solid ${hc}` }}>
          <div className="card-body" style={{ fontSize: '.84rem' }}>⚠ {st.healthReasons.join(' · ')}</div>
        </div>
      )}

      <div className="grid kpi-grid">
        <div className="card kpi"><span className="kpi-label">Tiến độ {p.autoProgress ? '(tự động)' : '(nhập tay)'}</span>
          <div className="kpi-value">{st?.progress ?? p.progress}%</div>
          <div className="kpi-sub">{st?.taskDone ?? 0}/{st?.taskTotal ?? 0} việc xong{st?.taskOverdue ? ` · ${st.taskOverdue} trễ` : ''}</div></div>
        <div className="card kpi"><span className="kpi-label">Giờ công</span>
          <div className="kpi-value" style={st?.burnHours > 100 ? { color: 'var(--danger)' } : {}}>{st?.loggedHours ?? 0}h{p.budgetHours ? <span style={{ fontSize: '.85rem', color: 'var(--muted)' }}> / {p.budgetHours}h</span> : ''}</div>
          <div className="kpi-sub">{st?.estHours ? `Ước lượng ${st.estHours}h` : ''}{st?.burnHours != null ? ` · đốt ${st.burnHours}%` : ''}</div></div>
        {canMoney && <div className="card kpi"><span className="kpi-label">Chi phí thực tế</span>
          <div className="kpi-value">{moneyShort(st?.cost ?? 0)}</div>
          <div className="kpi-sub">Nhân công {moneyShort(st?.labor ?? 0)} + NCC {moneyShort(st?.vendor ?? 0)}</div></div>}
        {canMoney && <div className="card kpi"><span className="kpi-label">Biên lợi nhuận</span>
          <div className="kpi-value" style={{ color: (st?.margin ?? 0) >= 0 ? 'var(--accent)' : 'var(--danger)' }}>{moneyShort(st?.margin ?? 0)}</div>
          <div className="kpi-sub">Ngân sách {moneyShort(p.budget)}{p.budget > 0 && st ? ` · biên ${Math.round(st.margin / p.budget * 100)}%` : ''}</div></div>}
      </div>

      <div className="grid two-col" style={{ marginTop: 16, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="toolbar" style={{ margin: 0 }}>
            <span className="card-title">Giai đoạn &amp; công việc</span>
            <div className="spacer"></div>
            {isMgmt && <button className="btn btn-outline btn-sm" onClick={() => setModal({ mode: 'addphase' })}><Icon name="plus" size={13} /> Thêm giai đoạn</button>}
          </div>
          {myPhases.map(ph => {
            const ts = myTasks.filter(t => t.phaseId === ph.id);
            const pct = phaseProgress(ph.id);
            return (
              <div className="card" key={ph.id}>
                <div className="card-head">
                  <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: ph.color || 'var(--primary)' }}></span>{ph.name}
                    <span style={{ fontSize: '.74rem', color: 'var(--muted)', fontWeight: 400 }}>{ts.filter(t => t.status === 'done').length}/{ts.length} · {pct}%</span>
                  </span>
                  {isMgmt && <button className="icon-btn danger" title="Xóa giai đoạn (việc chuyển về Chưa xếp)" onClick={() => setModal({ mode: 'delphase', row: ph })}><Icon name="trash" size={14} /></button>}
                </div>
                <div className="card-body" style={{ paddingTop: 4 }}>
                  <div className="progress" style={{ marginBottom: 8 }}><i style={{ width: pct + '%', background: ph.color }}></i></div>
                  {ts.map(t => <TaskRow key={t.id} t={t} />)}
                  {!ts.length && <p style={{ fontSize: '.78rem', color: 'var(--muted)' }}>Chưa có việc trong giai đoạn này — dùng ô "chuyển giai đoạn" ở mỗi việc.</p>}
                </div>
              </div>
            );
          })}
          <div className="card">
            <div className="card-head"><span className="card-title">{myPhases.length ? 'Chưa xếp giai đoạn' : 'Công việc'} ({noPhase.length})</span></div>
            <div className="card-body" style={{ paddingTop: 4 }}>
              {noPhase.map(t => <TaskRow key={t.id} t={t} />)}
              {!noPhase.length && <p style={{ fontSize: '.78rem', color: 'var(--muted)' }}>{myTasks.length ? 'Mọi việc đã xếp vào giai đoạn.' : 'Chưa có công việc — thêm ở bảng Công việc.'}</p>}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <div className="card">
            <div className="card-head"><span className="card-title">Mốc dự án</span></div>
            <div className="card-body" style={{ paddingTop: 4 }}>
              <Milestones projectId={id} />
            </div>
          </div>
          <div className="card">
            <div className="card-head"><span className="card-title">Tài liệu</span></div>
            <div className="card-body" style={{ paddingTop: 8 }}><DocLinks refType="project" refId={id} canEdit={isMgmt} /></div>
          </div>
        </div>
      </div>

      {modal?.mode === 'addphase' && <FormModal title="Thêm giai đoạn" fields={[{ key: 'name', label: 'Tên giai đoạn', required: true, full: true, placeholder: 'VD: Thiết kế' }]}
        onClose={() => setModal(null)} onSave={async d => addPhase(d.name)} />}
      {modal?.mode === 'delphase' && <ConfirmDialog msg={`Xóa giai đoạn "${modal.row.name}"? Việc trong đó chuyển về "Chưa xếp".`}
        onClose={() => setModal(null)} onYes={async () => {
          for (const t of myTasks.filter(t => t.phaseId === modal.row.id)) await tasks.update(t.id, { phaseId: null });
          await phases.remove(modal.row.id); toast('Đã xóa giai đoạn');
        }} />}
    </>
  );
}

function Milestones({ projectId }) {
  const ms = useResource('milestones');
  const list = ms.rows.filter(m => m.projectId === projectId).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (!list.length) return <p style={{ fontSize: '.78rem', color: 'var(--muted)' }}>Chưa có mốc — thêm trên trang Gantt.</p>;
  return list.map(m => (
    <div key={m.id} className="act-item">
      <span style={{ flex: 'none' }}>{m.done ? '✅' : '◆'}</span>
      <div style={{ flex: 1 }}><div className="act-title">{m.name}</div><div className="act-sub">{fmtDate(m.date)}{m.note ? ' · ' + m.note : ''}</div></div>
    </div>
  ));
}
