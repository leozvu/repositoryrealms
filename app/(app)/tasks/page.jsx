'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useResource, Icon, FormModal, ConfirmDialog, Badge, useToast } from '@/components/ui';
import { fmtDate, todayISO, daysFromNow, initials, parseItems, TASK_COLS, BADGE } from '@/lib/format';
import { hasAny } from '@/lib/perm';

export default function TasksPage() {
  const { data: session } = useSession();
  const user = session?.user;
  const isMgmt = hasAny(user, ['PM', 'LEAD']); // quản lý công việc: PM, Trưởng nhóm + GĐ
  const { rows, create, update, remove } = useResource('tasks');
  const projects = useResource('projects');
  const users = useResource('users');
  const [proj, setProj] = useState('all');
  const [mine, setMine] = useState(false);
  const [modal, setModal] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const toast = useToast();

  const userName = id => users.rows.find(u => u.id === id)?.name || '—';
  const projName = id => projects.rows.find(p => p.id === id)?.name || 'Việc chung';
  const FIELDS = [
    { key: 'title', label: 'Tên công việc', required: true, full: true },
    { key: 'projectId', label: 'Dự án', type: 'select', options: [{ value: '', label: '— Việc chung —' }, ...projects.rows.map(p => ({ value: p.id, label: p.name }))] },
    { key: 'assigneeId', label: 'Người phụ trách', type: 'select', options: users.rows.filter(u => u.status === 'active').map(u => ({ value: u.id, label: u.name })) },
    { key: 'priority', label: 'Ưu tiên', type: 'select', options: Object.entries(BADGE.priority).map(([v, [l]]) => ({ value: v, label: l })) },
    { key: 'status', label: 'Trạng thái', type: 'select', options: TASK_COLS.map(c => ({ value: c.key, label: c.label })) },
    { key: 'dueDate', label: 'Hạn hoàn thành', type: 'date' },
    { key: 'dependsOn', label: 'Phụ thuộc vào (Ctrl+click chọn nhiều)', type: 'multiselect', full: true,
      options: rows.filter(t => t.id !== modal?.row?.id).map(t => ({ value: t.id, label: `${t.title} · ${projName(t.projectId)}` })),
      hint: 'Việc này chỉ hoàn thành được sau khi các việc đã chọn xong' },
    { key: 'note', label: 'Mô tả', type: 'textarea', full: true },
  ];
  const visible = rows.filter(t => (proj === 'all' || String(t.projectId || '') === proj) && (!mine || t.assigneeId === user?.id));
  const canDrag = t => isMgmt || t.assigneeId === user?.id;
  // v3.2: việc bị chặn = còn việc phụ thuộc chưa xong
  const blockers = t => parseItems(t.dependsOn).map(id => rows.find(r => r.id === id)).filter(d => d && d.status !== 'done');

  const drop = async status => {
    setOverCol(null);
    const t = rows.find(x => x.id === dragId);
    if (!t || t.status === status) return;
    if (status === 'done') {
      const bl = blockers(t);
      if (bl.length) { toast(`Chưa thể hoàn thành — còn chờ: ${bl.map(b => b.title).join(', ')}`, 'error'); return; }
    }
    await update(t.id, { status });
  };

  return (
    <>
      <div className="toolbar">
        <select className="filter" value={proj} onChange={e => setProj(e.target.value)}>
          <option value="all">Tất cả dự án</option>
          {projects.rows.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          <option value="">Việc chung</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '.83rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={mine} onChange={e => setMine(e.target.checked)} /> Chỉ việc của tôi
        </label>
        <div className="spacer"></div>
        {isMgmt && <button className="btn btn-primary" onClick={() => setModal({ mode: 'add' })}><Icon name="plus" size={16} /><span>Thêm công việc</span></button>}
      </div>
      <div className="kanban">
        {TASK_COLS.map(c => {
          const items = visible.filter(t => t.status === c.key);
          return (
            <div key={c.key} className={`kan-col ${overCol === c.key ? 'drag-over' : ''}`}
              onDragOver={e => { e.preventDefault(); setOverCol(c.key); }}
              onDragLeave={() => setOverCol(null)} onDrop={() => drop(c.key)}>
              <div className="kan-head"><span className="dot" style={{ background: c.color }}></span>{c.label}<span className="count">{items.length}</span></div>
              {items.map(t => {
                const late = t.status !== 'done' && t.dueDate && t.dueDate < todayISO();
                return (
                  <div key={t.id} className="kan-card" draggable={canDrag(t)}
                    onDragStart={() => canDrag(t) && setDragId(t.id)}
                    onClick={() => setModal({ mode: 'edit', row: t })}
                    style={canDrag(t) ? {} : { opacity: .75, cursor: 'default' }}>
                    <div className="kan-title">{blockers(t).length > 0 && t.status !== 'done' &&
                      <span title={`Chờ: ${blockers(t).map(b => b.title).join(', ')}`} style={{ marginRight: 4 }}>⛓</span>}{t.title}</div>
                    <div className="kan-sub">{projName(t.projectId)}</div>
                    <div className="kan-foot">
                      <Badge map="priority" k={t.priority} />
                      <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <small style={{ fontSize: '.7rem', color: late ? 'var(--danger)' : 'var(--muted)', fontWeight: late ? 700 : 400 }}>{fmtDate(t.dueDate)}</small>
                        <span className="avatar" title={userName(t.assigneeId)}>{initials(userName(t.assigneeId))}</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: '.76rem', color: 'var(--muted)', marginTop: 4 }}>
        {isMgmt ? 'Kéo thả để đổi trạng thái.' : 'Bạn chỉ kéo được thẻ việc được gán cho mình.'}
      </p>

      {modal?.mode === 'add' && <FormModal title="Thêm công việc" fields={FIELDS}
        data={{ status: 'todo', priority: 'medium', dueDate: daysFromNow(3), projectId: proj !== 'all' ? proj : '' }}
        onClose={() => setModal(null)}
        onSave={async d => { await create({ ...d, projectId: d.projectId || null, dependsOn: JSON.stringify(d.dependsOn || []) }); toast('Đã thêm công việc'); }} />}
      {modal?.mode === 'edit' && <FormModal title="Chi tiết công việc" fields={FIELDS}
        data={{ ...modal.row, projectId: modal.row.projectId || '', dependsOn: parseItems(modal.row.dependsOn) }}
        onClose={() => setModal(null)}
        onSave={async d => { await update(modal.row.id, { ...d, projectId: d.projectId || null, dependsOn: JSON.stringify(d.dependsOn || []) }); toast('Đã cập nhật'); }}
        extraFooter={isMgmt && <button className="btn btn-ghost" style={{ marginRight: 'auto', color: 'var(--danger)' }}
          onClick={() => setModal({ mode: 'del', row: modal.row })}><Icon name="trash" size={16} /> Xóa</button>} />}
      {modal?.mode === 'del' && <ConfirmDialog msg={`Xóa công việc "${modal.row.title}"?`}
        onClose={() => setModal(null)} onYes={async () => { await remove(modal.row.id); toast('Đã xóa'); }} />}
    </>
  );
}
