'use client';
import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useResource, Icon, Modal, FormModal, ConfirmDialog, AsyncButton, Badge, useToast } from '@/components/ui';
import { fmtDate, todayISO, daysFromNow, initials, parseItems, TASK_COLS, BADGE } from '@/lib/format';
import { hasAny } from '@/lib/perm';

const RECUR_OPTS = [{ value: '', label: 'Không lặp' }, { value: 'weekly', label: 'Hàng tuần' }, { value: 'monthly', label: 'Hàng tháng' }];

/* ---------- v3.7: modal chi tiết việc — form + checklist + bình luận + ghi giờ ---------- */
function TaskDetailModal({ task, projects, users, allTasks, isMgmt, me, onSave, onDelete, onClose }) {
  // v3.13: lọc ngay ở server theo taskId/projectId. Trước đây mỗi lần MỞ MỘT công việc là
  // kéo về NGUYÊN bảng TaskComment + TimeLog + TaskEvent + Phase của cả công ty rồi lọc
  // bằng JS trong trình duyệt — 30 người mở việc cả ngày, mỗi lần vài chục nghìn dòng.
  const comments = useResource('taskcomments', { taskId: task.id });
  const timelogs = useResource('timelogs', { taskId: task.id });
  const events = useResource('taskevents', { taskId: task.id });
  const toast = useToast();
  const [f, setF] = useState({
    title: task.title, projectId: task.projectId || '', assigneeId: task.assigneeId || '',
    priority: task.priority, status: task.status, dueDate: task.dueDate || '',
    recur: task.recur || '', note: task.note || '', estHours: task.estHours || 0,
    phaseId: task.phaseId || '', labels: parseItems(task.labels),
    dependsOn: parseItems(task.dependsOn), checklist: parseItems(task.checklist),
  });
  // Lọc theo f.projectId (không phải task.projectId): người dùng đổi dự án trong form thì
  // danh sách giai đoạn phải nạp lại theo dự án mới.
  const phases = useResource('phases', { projectId: f.projectId || undefined });
  const [cmt, setCmt] = useState('');
  const [newItem, setNewItem] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [logH, setLogH] = useState('');
  const [commentToDelete, setCommentToDelete] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const myComments = comments.rows.filter(c => c.taskId === task.id);
  const myEvents = events.rows.filter(e => e.taskId === task.id);
  const myPhases = phases.rows.filter(p => p.projectId === f.projectId).sort((a, b) => a.order - b.order);
  const uName = id => users.find(u => u.id === id)?.name || '—';
  const doneN = f.checklist.filter(c => c.done).length;

  const sendCmt = async () => {
    if (!cmt.trim()) return;
    const result = await comments.create({ taskId: task.id, content: cmt.trim() });
    if (result) setCmt('');
  };
  const loggedOnTask = timelogs.rows.filter(l => l.taskId === task.id).reduce((s, l) => s + l.hours, 0);
  const quickLog = async () => {
    const h = +logH;
    if (!h || h <= 0) return toast('Nhập số giờ hợp lệ', 'error');
    if (!f.projectId) return toast('Việc chung không gắn dự án — ghi giờ trong trang Chấm công giờ', 'error');
    const r = await timelogs.create({ projectId: f.projectId, taskId: task.id, date: todayISO(), hours: h, billable: true, note: f.title });
    if (r) { toast(`Đã ghi ${h}h cho việc này`); setLogH(''); }
  };
  const saveTask = async () => {
    if (saving || !f.title.trim()) return;
    setSaving(true);
    try {
      const result = await onSave(f);
      if (result !== false && result !== null) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Chi tiết công việc`} onClose={onClose} large
      footer={<>
        {isMgmt && <button className="btn btn-ghost" style={{ marginRight: 'auto', color: 'var(--danger)' }} onClick={onDelete}><Icon name="trash" size={16} /> Xóa</button>}
        <button className="btn btn-outline" onClick={onClose} disabled={saving}>Hủy</button>
        <button className="btn btn-primary" onClick={saveTask} disabled={saving} aria-busy={saving || undefined}>{saving ? 'Đang lưu…' : 'Lưu'}</button>
      </>}>
      <div className="form-grid">
        <div className="field full"><label>Tên công việc *</label><input value={f.title} onChange={e => set('title', e.target.value)} /></div>
        <div className="field"><label>Dự án</label>
          <select value={f.projectId} onChange={e => set('projectId', e.target.value)}>
            <option value="">— Việc chung —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></div>
        <div className="field"><label>Người phụ trách</label>
          <select value={f.assigneeId} onChange={e => set('assigneeId', e.target.value)} disabled={!isMgmt && task.assigneeId !== me?.id}>
            {users.filter(u => u.status === 'active').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select></div>
        <div className="field"><label>Ưu tiên</label>
          <select value={f.priority} onChange={e => set('priority', e.target.value)}>
            {Object.entries(BADGE.priority).map(([v, [l]]) => <option key={v} value={v}>{l}</option>)}
          </select></div>
        <div className="field"><label>Trạng thái</label>
          <select value={f.status} onChange={e => set('status', e.target.value)}>
            {TASK_COLS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select></div>
        <div className="field"><label>Hạn hoàn thành</label><input type="date" value={f.dueDate} onChange={e => set('dueDate', e.target.value)} /></div>
        <div className="field"><label>Giờ ước lượng</label>
          <input type="number" min="0" step="0.5" value={f.estHours} onChange={e => set('estHours', +e.target.value || 0)} placeholder="VD: 8" /></div>
        <div className="field"><label>Lặp lại</label>
          <select value={f.recur} onChange={e => set('recur', e.target.value)}>
            {RECUR_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select></div>
        {f.projectId && myPhases.length > 0 && <div className="field"><label>Giai đoạn</label>
          <select value={f.phaseId} onChange={e => set('phaseId', e.target.value)}>
            <option value="">— Chưa xếp —</option>
            {myPhases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></div>}
        <div className="field full"><label>Nhãn</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
            {f.labels.map((lb, i) => (
              <span key={i} className="badge b-violet" style={{ cursor: 'pointer' }} onClick={() => set('labels', f.labels.filter((_, j) => j !== i))}>{lb} ✕</span>
            ))}
            <input style={{ flex: 1, minWidth: 120 }} placeholder="Thêm nhãn… (Enter)" value={newLabel} onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newLabel.trim()) { e.preventDefault(); if (!f.labels.includes(newLabel.trim())) set('labels', [...f.labels, newLabel.trim()]); setNewLabel(''); } }} />
          </div></div>
        <div className="field full"><label>Phụ thuộc vào (Ctrl+click chọn nhiều)</label>
          <select multiple size={3} value={f.dependsOn} onChange={e => set('dependsOn', [...e.target.selectedOptions].map(o => o.value))}>
            {allTasks.filter(t => t.id !== task.id).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select></div>
        <div className="field full"><label>Mô tả</label><textarea value={f.note} onChange={e => set('note', e.target.value)} /></div>

        {/* Checklist các bước con */}
        <div className="field full">
          <label>Checklist ({doneN}/{f.checklist.length})</label>
          {f.checklist.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={!!c.done}
                onChange={() => set('checklist', f.checklist.map((x, j) => j === i ? { ...x, done: !x.done } : x))} />
              <span style={{ flex: 1, fontSize: '.85rem', ...(c.done ? { textDecoration: 'line-through', color: 'var(--muted)' } : {}) }}>{c.text}</span>
              <button className="icon-btn" onClick={() => set('checklist', f.checklist.filter((_, j) => j !== i))}><Icon name="x" size={13} /></button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <input style={{ flex: 1 }} placeholder="Thêm bước con… (Enter)" value={newItem} onChange={e => setNewItem(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newItem.trim()) { e.preventDefault(); set('checklist', [...f.checklist, { text: newItem.trim(), done: false }]); setNewItem(''); } }} />
            <button className="btn btn-outline btn-sm" onClick={() => { if (newItem.trim()) { set('checklist', [...f.checklist, { text: newItem.trim(), done: false }]); setNewItem(''); } }}><Icon name="plus" size={13} /></button>
          </div>
          <div className="hint">Nhớ bấm Lưu để giữ thay đổi checklist.</div>
        </div>

        {/* Ghi giờ nhanh + ước lượng vs thực tế */}
        <div className="field full" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '.85rem' }}>⏱ Ghi giờ cho việc này:</span>
          <input style={{ width: 90 }} type="number" min="0.5" step="0.5" placeholder="giờ" value={logH} onChange={e => setLogH(e.target.value)} />
          <AsyncButton className="btn btn-outline btn-sm" pendingLabel="Đang ghi…" disabled={timelogs.mutating} onClick={quickLog}>Ghi giờ</AsyncButton>
          {(f.estHours > 0 || loggedOnTask > 0) && (
            <span style={{ fontSize: '.8rem', marginLeft: 'auto' }}>
              Ước lượng <b>{f.estHours || 0}h</b> · đã log <b style={{ color: loggedOnTask > f.estHours && f.estHours > 0 ? 'var(--danger)' : 'var(--accent)' }}>{Math.round(loggedOnTask * 10) / 10}h</b>
              {f.estHours > 0 ? ` (${Math.round(loggedOnTask / f.estHours * 100)}%)` : ''}
            </span>
          )}
        </div>

        {/* Bình luận trao đổi */}
        <div className="field full" style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <label>Trao đổi ({myComments.length})</label>
          <div style={{ maxHeight: 180, overflowY: 'auto', display: 'grid', gap: 6 }}>
            {myComments.map(c => (
              <div key={c.id} className="act-item" style={{ alignItems: 'flex-start' }}>
                <span className="avatar" style={{ flex: 'none' }}>{initials(uName(c.userId))}</span>
                <div style={{ flex: 1 }}>
                  <div className="act-title">{uName(c.userId)} <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: '.72rem' }}>· {new Date(c.createdAt).toLocaleString('vi-VN')}</span></div>
                  <div style={{ fontSize: '.84rem', whiteSpace: 'pre-wrap' }}>{c.content}</div>
                </div>
                {c.userId === me?.id && <button className="icon-btn danger" onClick={() => setCommentToDelete(c)} aria-label="Xóa bình luận"><Icon name="x" size={12} /></button>}
              </div>
            ))}
            {!myComments.length && <p style={{ fontSize: '.8rem', color: 'var(--muted)' }}>Chưa có trao đổi nào — người phụ trách sẽ nhận thông báo khi bạn bình luận.</p>}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <input style={{ flex: 1 }} placeholder="Viết bình luận… gõ @tên để nhắc (Enter gửi)" value={cmt} onChange={e => setCmt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendCmt(); } }} />
            <AsyncButton className="btn btn-primary btn-sm" pendingLabel="Đang gửi…" disabled={comments.mutating} onClick={sendCmt}>Gửi</AsyncButton>
          </div>
        </div>

        {/* v3.10: lịch sử thay đổi */}
        {myEvents.length > 0 && (
          <div className="field full" style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <label>Lịch sử ({myEvents.length})</label>
            <div style={{ maxHeight: 150, overflowY: 'auto', display: 'grid', gap: 3, fontSize: '.78rem', color: 'var(--muted)' }}>
              {myEvents.map(e => (
                <div key={e.id}><b style={{ color: 'var(--fg)' }}>{e.userName}</b> · {e.text} <span style={{ opacity: .7 }}>· {new Date(e.at).toLocaleString('vi-VN')}</span></div>
              ))}
            </div>
          </div>
        )}
      </div>
      {commentToDelete && <ConfirmDialog msg="Xóa bình luận này?" onClose={() => setCommentToDelete(null)}
        onYes={async () => { const r = await comments.remove(commentToDelete.id); if (!r) return false; toast('Đã xóa bình luận'); }} />}
    </Modal>
  );
}

export default function TasksPage() {
  const { data: session } = useSession();
  const user = session?.user;
  const isMgmt = hasAny(user, ['PM', 'LEAD']); // quản lý công việc: PM, Trưởng nhóm + GĐ
  const { rows, loading, create, update, remove } = useResource('tasks');
  const projects = useResource('projects');
  const users = useResource('users');
  const teams = useResource('teams');
  const [proj, setProj] = useState('all');
  const [mine, setMine] = useState(false);
  const [assignee, setAssignee] = useState('all');
  const [label, setLabel] = useState('all');
  const [groupBy, setGroupBy] = useState('status');
  const [selMode, setSelMode] = useState(false);
  const [sel, setSel] = useState(() => new Set());
  const [modal, setModal] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const phases = useResource('phases');
  const toast = useToast();
  const focusedRecordRef = useRef(null);

  // Realm/Global Search mở đúng bản ghi gốc thay vì thả người dùng ở đầu bảng Kanban.
  useEffect(() => {
    if (loading || typeof window === 'undefined') return;
    const focusId = new URLSearchParams(window.location.search).get('focus');
    if (!focusId || focusedRecordRef.current === focusId) return;
    focusedRecordRef.current = focusId;
    const task = rows.find((row) => row.id === focusId);
    if (!task) {
      toast('Không tìm thấy Task hoặc bạn không còn quyền xem bản ghi này.', 'error');
      return;
    }
    setProj('all');
    setMine(false);
    setAssignee('all');
    setLabel('all');
    setModal({ mode: 'edit', row: task });
  }, [loading, rows, toast]);

  const userName = id => users.rows.find(u => u.id === id)?.name || '—';
  const projName = id => projects.rows.find(p => p.id === id)?.name || 'Việc chung';
  const activeStaff = users.rows.filter(u => u.status === 'active' && u.userType !== 'freelancer');

  // Feedback AIm 07/2026: nút "Giao việc" cạnh nút thêm — danh sách người phụ trách chỉ gồm
  // người THUỘC QUYỀN mình: PM/Giám đốc giao cho cả công ty; Trưởng nhóm chỉ giao trong nhóm
  // mình (nhóm mình đang thuộc + nhóm mình đứng tên trưởng nhóm) — khớp phạm vi realmGuildScope ở server.
  const isCompanyMgmt = hasAny(user, ['PM']); // PM + Giám đốc (hasAny luôn cho DIRECTOR qua)
  const myTeamIds = new Set(teams.rows.filter(t => t.leadId === user?.id).map(t => t.id));
  if (user?.teamId) myTeamIds.add(user.teamId);
  const subordinates = (isCompanyMgmt ? activeStaff : activeStaff.filter(u => myTeamIds.has(u.teamId)))
    .filter(u => u.id !== user?.id);

  const BASE_FIELDS = [
    { key: 'title', label: 'Tên công việc', required: true, full: true },
    { key: 'projectId', label: 'Dự án', type: 'select', options: [{ value: '', label: '— Việc chung —' }, ...projects.rows.map(p => ({ value: p.id, label: p.name }))] },
    { key: 'priority', label: 'Ưu tiên', type: 'select', options: Object.entries(BADGE.priority).map(([v, [l]]) => ({ value: v, label: l })) },
    { key: 'dueDate', label: 'Hạn hoàn thành', type: 'date' },
    { key: 'estHours', label: 'Giờ ước lượng', type: 'number' },
    { key: 'recur', label: 'Lặp lại', type: 'select', options: RECUR_OPTS },
    { key: 'note', label: 'Mô tả', type: 'textarea', full: true },
  ];
  // Thêm công việc: quản lý chọn được người phụ trách bất kỳ; nhân viên tự thêm cho MÌNH.
  const ADD_FIELDS = isMgmt
    ? [BASE_FIELDS[0], BASE_FIELDS[1], { key: 'assigneeId', label: 'Người phụ trách', type: 'select', options: activeStaff.map(u => ({ value: u.id, label: u.name })) }, ...BASE_FIELDS.slice(2)]
    : BASE_FIELDS;
  const ASSIGN_FIELDS = [
    BASE_FIELDS[0],
    { key: 'assigneeId', label: 'Giao cho', required: true, type: 'select', options: [{ value: '', label: '— Chọn người thuộc quyền bạn —' }, ...subordinates.map(u => ({ value: u.id, label: u.name }))] },
    ...BASE_FIELDS.slice(1),
  ];
  const allLabels = [...new Set(rows.flatMap(t => parseItems(t.labels)))];
  const visible = rows.filter(t => (proj === 'all' || String(t.projectId || '') === proj)
    && (!mine || t.assigneeId === user?.id)
    && (assignee === 'all' || t.assigneeId === assignee)
    && (label === 'all' || parseItems(t.labels).includes(label)));
  const canDrag = t => isMgmt || t.assigneeId === user?.id;
  const blockers = t => parseItems(t.dependsOn).map(id => rows.find(r => r.id === id)).filter(d => d && d.status !== 'done');

  const drop = async (status, tid) => {
    setOverCol(null);
    const t = rows.find(x => x.id === (tid || dragId));
    if (!t || t.status === status) return;
    if (status === 'done') {
      const bl = blockers(t);
      if (bl.length) { toast(`Chưa thể hoàn thành — còn chờ: ${bl.map(b => b.title).join(', ')}`, 'error'); return; }
    }
    await update(t.id, { status });
  };

  const toggleSel = id => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const bulkUpdate = async data => {
    for (const id of sel) await update(id, data);
    toast(`Đã cập nhật ${sel.size} việc`); setSel(new Set()); setSelMode(false);
  };

  // v3.12: tuổi việc + thẻ dùng chung
  const ageDays = t => { const d = t.statusSince; if (!d) return null; return Math.floor((new Date(todayISO()) - new Date(d)) / 86400000); };
  const Card = t => {
    const late = t.status !== 'done' && t.dueDate && t.dueDate < todayISO();
    const cl = parseItems(t.checklist);
    const age = ageDays(t);
    const stale = t.status !== 'done' && age != null && age >= 5;
    return (
      <div key={t.id} className="kan-card" draggable={!selMode && canDrag(t)}
        onDragStart={() => !selMode && canDrag(t) && setDragId(t.id)}
        onClick={() => selMode ? toggleSel(t.id) : setModal({ mode: 'edit', row: t })}
        style={{ ...(canDrag(t) || selMode ? {} : { opacity: .75, cursor: 'default' }), ...(selMode && sel.has(t.id) ? { outline: '2px solid var(--primary)' } : {}) }}>
        <div className="kan-title">{selMode && <input type="checkbox" readOnly checked={sel.has(t.id)} style={{ width: 'auto', marginRight: 6 }} />}
          {blockers(t).length > 0 && t.status !== 'done' && <span title={`Chờ: ${blockers(t).map(b => b.title).join(', ')}`} aria-label="Bị chặn bởi việc khác" style={{ marginRight: 4, display: 'inline-flex', verticalAlign: '-2px', color: 'var(--muted)' }}><Icon name="link" size={13} /></span>}
          {t.recur && <span title={t.recur === 'weekly' ? 'Lặp hàng tuần' : 'Lặp hàng tháng'} aria-label="Việc lặp lại" style={{ marginRight: 4, display: 'inline-flex', verticalAlign: '-2px', color: 'var(--muted)' }}><Icon name="repeat" size={13} /></span>}
          {t.title}</div>
        <div className="kan-sub">{projName(t.projectId)}{cl.length > 0 && <> · <Icon name="check" size={11} /> {cl.filter(x => x.done).length}/{cl.length}</>}{t.estHours ? ` · ${t.estHours}h` : ''}
          {stale && <span title={`Đã ở cột này ${age} ngày`} style={{ color: 'var(--warn, #D97706)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}> · <Icon name="clock" size={11} />{age}n</span>}</div>
        {parseItems(t.labels).length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, margin: '4px 0' }}>
          {parseItems(t.labels).map(lb => <span key={lb} className="badge b-violet" style={{ fontSize: '.7rem', padding: '1px 6px' }}>{lb}</span>)}</div>}
        <div className="kan-foot">
          <Badge map="priority" k={t.priority} />
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <small style={{ fontSize: '.7rem', color: late ? 'var(--danger)' : 'var(--muted)', fontWeight: late ? 700 : 400 }}>{fmtDate(t.dueDate)}</small>
            <span className="avatar" title={userName(t.assigneeId)}>{initials(userName(t.assigneeId))}</span>
          </span>
        </div>
      </div>
    );
  };
  const Columns = items => (
    <div className="kanban">
      {TASK_COLS.map(c => {
        const list = items.filter(t => (c.states || [c.key]).includes(t.status));
        return (
          <div key={c.key} className={`kan-col ${overCol === c.key ? 'drag-over' : ''}`}
            onDragOver={e => { if (!selMode) { e.preventDefault(); setOverCol(c.key); } }}
            onDragLeave={() => setOverCol(null)} onDrop={() => !selMode && drop(c.key)}>
            <div className="kan-head"><span className="dot" style={{ background: c.color }}></span>{c.label}<span className="count">{list.length}</span></div>
            {list.map(Card)}
          </div>
        );
      })}
    </div>
  );

  // nhóm swimlane
  let groups = null;
  if (groupBy === 'assignee') {
    const ids = [...new Set(visible.map(t => t.assigneeId || 'none'))];
    groups = ids.map(id => ({ key: id, label: id === 'none' ? 'Chưa gán' : userName(id), items: visible.filter(t => (t.assigneeId || 'none') === id) }));
  } else if (groupBy === 'phase') {
    const ids = [...new Set(visible.map(t => t.phaseId || 'none'))];
    groups = ids.map(id => ({ key: id, label: id === 'none' ? 'Chưa xếp giai đoạn' : (phases.rows.find(p => p.id === id)?.name || '—'), items: visible.filter(t => (t.phaseId || 'none') === id) }));
  }

  return (
    <>
      <div className="toolbar">
        <select className="filter" value={proj} onChange={e => setProj(e.target.value)}>
          <option value="all">Tất cả dự án</option>
          {projects.rows.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          <option value="">Việc chung</option>
        </select>
        <select className="filter" value={assignee} onChange={e => setAssignee(e.target.value)}>
          <option value="all">Mọi người phụ trách</option>
          {users.rows.filter(u => u.status === 'active').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        {allLabels.length > 0 && <select className="filter" value={label} onChange={e => setLabel(e.target.value)}>
          <option value="all">Mọi nhãn</option>
          {allLabels.map(l => <option key={l} value={l}>{l}</option>)}
        </select>}
        <select className="filter" value={groupBy} onChange={e => setGroupBy(e.target.value)} title="Cách nhóm bảng">
          <option value="status">Nhóm: Trạng thái</option>
          <option value="assignee">Nhóm: Người phụ trách</option>
          <option value="phase">Nhóm: Giai đoạn</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '.83rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={mine} onChange={e => setMine(e.target.checked)} /> Chỉ việc của tôi
        </label>
        <div className="spacer"></div>
        {isMgmt && <button className={selMode ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'} onClick={() => { setSelMode(!selMode); setSel(new Set()); }}>{selMode ? 'Xong' : <><Icon name="check" size={15} /><span>Chọn nhiều</span></>}</button>}
        {!selMode && <button className="btn btn-primary" onClick={() => setModal({ mode: 'add' })}><Icon name="plus" size={16} /><span>Thêm công việc</span></button>}
        {isMgmt && !selMode && <button className="btn btn-outline" onClick={() => setModal({ mode: 'assign' })} title="Thêm việc và giao thẳng cho người thuộc quyền bạn"><Icon name="staff" size={16} /><span>Giao việc</span></button>}
      </div>

      {selMode && sel.size > 0 && (
        <div className="card" style={{ marginBottom: 12, padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderLeft: '4px solid var(--primary)' }}>
          <b style={{ fontSize: '.85rem' }}>Đã chọn {sel.size} việc:</b>
          <select className="filter" defaultValue="" onChange={e => { if (e.target.value) { bulkUpdate({ assigneeId: e.target.value }); e.target.value = ''; } }}>
            <option value="">Gán cho…</option>
            {users.rows.filter(u => u.status === 'active').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select className="filter" defaultValue="" onChange={e => { if (e.target.value) { bulkUpdate({ status: e.target.value }); e.target.value = ''; } }}>
            <option value="">Đổi trạng thái…</option>
            {TASK_COLS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <input type="date" onChange={e => { if (e.target.value) bulkUpdate({ dueDate: e.target.value }); }} title="Đổi hạn cho tất cả" />
          <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())}>Bỏ chọn</button>
        </div>
      )}

      {groupBy === 'status' ? Columns(visible) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {groups.map(g => (
            <div key={g.key} className="card" style={{ padding: 0 }}>
              <div className="card-head" style={{ padding: '10px 14px' }}><span className="card-title">{g.label} <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '.8rem' }}>({g.items.length})</span></span></div>
              <div style={{ padding: '0 8px 8px' }}>{Columns(g.items)}</div>
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize: '.76rem', color: 'var(--muted)', marginTop: 4 }}>
        {selMode ? 'Nhấp thẻ để chọn/bỏ chọn · dùng thanh trên để đổi hàng loạt.' : isMgmt ? 'Kéo thả để đổi trạng thái · nhấp thẻ để mở chi tiết · thẻ có số ngày kèm đồng hồ = việc ứ đọng lâu.' : 'Bạn chỉ kéo được thẻ việc của mình · nhấp thẻ để mở chi tiết.'}
      </p>

      {modal?.mode === 'add' && <FormModal title={isMgmt ? 'Thêm công việc' : 'Thêm việc cho tôi'} fields={ADD_FIELDS}
        data={{ priority: 'medium', dueDate: daysFromNow(3), projectId: proj !== 'all' ? proj : '', recur: '' }}
        onClose={() => setModal(null)}
        onSave={async d => { await create({ ...d, status: 'todo', assigneeId: isMgmt ? (d.assigneeId || null) : user?.id, projectId: d.projectId || null, recur: d.recur || null, estHours: +d.estHours || 0 }); toast('Đã thêm công việc'); }} />}
      {modal?.mode === 'assign' && <FormModal title="Giao việc" fields={ASSIGN_FIELDS}
        data={{ priority: 'medium', dueDate: daysFromNow(3), projectId: proj !== 'all' ? proj : '', recur: '', assigneeId: '' }}
        onClose={() => setModal(null)}
        onSave={async d => {
          if (!d.assigneeId) { toast('Chọn người nhận việc', 'error'); return false; }
          const r = await create({ ...d, status: 'todo', projectId: d.projectId || null, recur: d.recur || null, estHours: +d.estHours || 0 });
          if (r) toast(`Đã giao việc cho ${userName(d.assigneeId)} — người nhận sẽ có thông báo 🔔`);
        }} />}
      {modal?.mode === 'edit' && <TaskDetailModal task={modal.row} projects={projects.rows} users={users.rows} allTasks={rows}
        isMgmt={isMgmt} me={user} onClose={() => setModal(null)}
        onDelete={() => setModal({ mode: 'del', row: modal.row })}
        onSave={async f => {
          const result = await update(modal.row.id, {
            title: f.title, projectId: f.projectId || null, assigneeId: f.assigneeId || null,
            priority: f.priority, status: f.status, dueDate: f.dueDate || null, recur: f.recur || null,
            estHours: +f.estHours || 0, phaseId: f.phaseId || null, labels: JSON.stringify(f.labels || []),
            note: f.note, dependsOn: JSON.stringify(f.dependsOn || []), checklist: JSON.stringify(f.checklist || []),
          });
          if (!result) return false;
          toast('Đã cập nhật');
          return true;
        }} />}
      {modal?.mode === 'del' && <ConfirmDialog msg={`Xóa công việc "${modal.row.title}"?`}
        onClose={() => setModal(null)} onYes={async () => { await remove(modal.row.id); toast('Đã xóa'); }} />}
    </>
  );
}
