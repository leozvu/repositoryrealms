'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Icon, Modal, useToast } from '@/components/ui';
import { realmRecordHref } from '@/lib/realm-business-bridge';
import styles from './royal-command-center.module.css';

const STATUS = {
  todo: 'Chờ thực hiện',
  doing: 'Đang thực hiện',
  in_progress: 'Đang thực hiện',
  review: 'Đang review',
  blocked: 'Bị chặn',
  done: 'Hoàn tất',
};
const PRIORITY = { low: 'Thấp', medium: 'Vừa', high: 'Cao', urgent: 'Khẩn' };
const LOAD = {
  steady: { label: 'Còn khả năng nhận việc', icon: 'check' },
  busy: { label: 'Đang gần đầy tải', icon: 'clock' },
  overloaded: { label: 'Có nguy cơ quá tải', icon: 'alert' },
};

function actionKey() {
  if (globalThis.crypto?.randomUUID) return `realm-command:${globalThis.crypto.randomUUID()}`;
  return `realm-command:${Date.now()}:${Math.random().toString(36).slice(2, 14)}`;
}

function dateLabel(value) {
  if (!value) return 'Chưa đặt hạn';
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function StateCard({ loading = false, error = '', onRetry }) {
  return <section className={styles.stateCard} role={error ? 'alert' : 'status'} aria-live="polite">
    <span><Icon name={loading ? 'clock' : 'alert'} size={22} /></span>
    <div><strong>{loading ? 'Đang mở Royal Command Center…' : 'Chưa tải được trung tâm điều phối'}</strong><p>{loading ? 'Đang tổng hợp Task, nhân sự, giờ ước lượng và yêu cầu bàn giao từ ERP.' : error}</p></div>
    {error && <button type="button" onClick={onRetry}><Icon name="repeat" size={15} />Thử lại</button>}
  </section>;
}

function AssignmentModal({ task, members, onClose, onComplete }) {
  const toast = useToast();
  const [assigneeId, setAssigneeId] = useState(task.assignee?.id || '');
  const [dueDate, setDueDate] = useState(task.dueDate || '');
  const [priority, setPriority] = useState(task.priority || 'medium');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!assigneeId) return toast('Hãy chọn người nhận Quest.', 'error');
    setSaving(true);
    try {
      const response = await fetch('/api/realm-demo/actions', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': actionKey() },
        body: JSON.stringify({
          action: 'task.assign',
          entityId: task.id,
          expectedAssigneeId: task.assignee?.id || null,
          assigneeId,
          expectedDueDate: task.dueDate || null,
          dueDate: dueDate || null,
          expectedPriority: task.priority,
          priority,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return toast(payload.error || 'ERP từ chối phân công. Hãy tải lại.', 'error');
      toast(payload.idempotent ? 'Lệnh phân công đã được ERP ghi nhận trước đó.' : 'Đã cập nhật Task ERP và gửi Raven cho người nhận.');
      onComplete?.();
    } finally { setSaving(false); }
  };
  return <Modal title={`Phân công Quest · ${task.title}`} onClose={onClose} footer={<>
    <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>Hủy</button>
    <button type="button" className="btn btn-primary" onClick={submit} disabled={saving} aria-busy={saving || undefined}>{saving ? 'Đang ghi ERP…' : 'Xác nhận phân công'}</button>
  </>}>
    <div className={styles.formGrid}>
      <label className={styles.field}><span>Người nhận Quest *</span><select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} disabled={saving}>
        <option value="">— Chọn thành viên —</option>
        {members.map((member) => <option value={member.id} key={member.id}>{member.name} · {member.title}</option>)}
      </select></label>
      <label className={styles.field}><span>Hạn hoàn thành</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} disabled={saving} /></label>
      <label className={styles.field}><span>Ưu tiên</span><select value={priority} onChange={(event) => setPriority(event.target.value)} disabled={saving}>
        {Object.entries(PRIORITY).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
      </select></label>
      <p className={styles.formNote}><Icon name="shield" size={15} />Thao tác cập nhật trực tiếp Task ERP, ghi AuditLog và TaskEvent; Realm không tạo bản sao nhiệm vụ.</p>
    </div>
  </Modal>;
}

function HandoffModal({ task, members, onClose, onComplete }) {
  const toast = useToast();
  const candidates = members.filter((member) => member.id !== task.assignee?.id);
  const [targetAssigneeId, setTargetAssigneeId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!targetAssigneeId) return toast('Hãy chọn người đề xuất nhận bàn giao.', 'error');
    if (!note.trim()) return toast('Hãy ghi rõ lý do hoặc nội dung bàn giao.', 'error');
    setSaving(true);
    try {
      const response = await fetch('/api/realm-demo/command-center', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'task.handoff.request', taskId: task.id, targetAssigneeId, note }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return toast(payload.error || 'Không thể gửi yêu cầu bàn giao.', 'error');
      toast('Yêu cầu bàn giao đã gửi tới người duyệt và xuất hiện trong Raven Inbox.');
      onComplete?.();
    } finally { setSaving(false); }
  };
  return <Modal title={`Xin bàn giao · ${task.title}`} onClose={onClose} footer={<>
    <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>Hủy</button>
    <button type="button" className="btn btn-primary" onClick={submit} disabled={saving} aria-busy={saving || undefined}>{saving ? 'Đang gửi…' : 'Gửi yêu cầu duyệt'}</button>
  </>}>
    <div className={styles.formGrid}>
      <label className={styles.field}><span>Đề xuất người nhận *</span><select value={targetAssigneeId} onChange={(event) => setTargetAssigneeId(event.target.value)} disabled={saving}>
        <option value="">— Chọn thành viên —</option>
        {candidates.map((member) => <option value={member.id} key={member.id}>{member.name} · {member.title}</option>)}
      </select></label>
      <label className={styles.field}><span>Lý do / nội dung bàn giao *</span><textarea maxLength={400} rows={4} value={note} onChange={(event) => setNote(event.target.value)} disabled={saving} /></label>
      <small className={styles.counter}>{note.length}/400</small>
      <p className={styles.formNote}><Icon name="shield" size={15} />Task chỉ đổi người phụ trách sau khi Trưởng Guild hoặc PM duyệt. Người yêu cầu không thể tự duyệt.</p>
    </div>
  </Modal>;
}

function WorkloadCard({ member }) {
  const state = LOAD[member.loadLevel] || LOAD.steady;
  const displayPercent = Math.min(100, member.loadPercent);
  return <article className={`${styles.workloadCard} ${styles[`load_${member.loadLevel}`] || ''}`}>
    <header><span className={styles.avatar} style={{ '--member-color': member.color }}>{member.name.split(' ').slice(-2).map((part) => part[0]).join('').toUpperCase()}</span><div><strong>{member.name}</strong><small>{member.title} · {member.realmClass}</small></div></header>
    <div className={styles.loadHeading}><span><Icon name={state.icon} size={14} />{state.label}</span><strong>{member.plannedHours}/{member.capacityHours}h</strong></div>
    <div className={styles.loadBar} role="progressbar" aria-label={`Tải kế hoạch 7 ngày của ${member.name}`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.min(100, member.loadPercent)}><i style={{ width: `${displayPercent}%` }} /></div>
    <dl><div><dt>Quest mở</dt><dd>{member.openTasks}</dd></div><div><dt>Quá hạn</dt><dd>{member.overdueTasks}</dd></div><div><dt>Giờ đã log tuần</dt><dd>{member.loggedHours}h</dd></div></dl>
    {member.unknownEstimate > 0 && <p><Icon name="alert" size={13} />{member.unknownEstimate} Quest gần hạn chưa có giờ ước lượng</p>}
  </article>;
}

function TaskRow({ task, onAssign, onHandoff }) {
  return <article className={`${styles.taskRow} ${task.overdue ? styles.taskOverdue : ''}`}>
    <div className={styles.taskMain}>
      <span className={`${styles.priority} ${styles[`priority_${task.priority}`]}`}>{PRIORITY[task.priority]}</span>
      <div><strong>{task.title}</strong><small>{task.project?.name || 'Việc chung'} · {STATUS[task.status] || task.status}</small></div>
    </div>
    <div className={styles.taskMeta}>
      <span><Icon name="staff" size={14} />{task.assignee?.name || 'Chưa phân công'}</span>
      <span className={task.overdue ? styles.danger : ''}><Icon name={task.overdue ? 'alert' : 'calendar'} size={14} />{dateLabel(task.dueDate)}</span>
      <span><Icon name="clock" size={14} />{task.estHours > 0 ? `${task.estHours}h ước lượng` : 'Chưa ước lượng'}</span>
    </div>
    {task.handoff && <p className={styles.handoffState}><Icon name="repeat" size={14} />Đang chờ duyệt bàn giao{task.handoff.targetAssignee ? ` → ${task.handoff.targetAssignee.name}` : ''}</p>}
    <div className={styles.taskActions}>
      {task.canAssign && <button type="button" onClick={() => onAssign(task)}><Icon name="staff" size={14} />Phân công</button>}
      {task.canRequestHandoff && <button type="button" onClick={() => onHandoff(task)}><Icon name="repeat" size={14} />Xin bàn giao</button>}
      <a href={realmRecordHref('task', task.id)}><Icon name="tasks" size={14} />Mở Task ERP</a>
    </div>
  </article>;
}

export default function RoyalCommandCenter({ operationsSource = 'local', localDashboard = null, compact = false, dataRevision = 0 }) {
  const titleId = useId();
  const [dashboard, setDashboard] = useState(localDashboard);
  const [loading, setLoading] = useState(operationsSource === 'erp');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [assignmentTask, setAssignmentTask] = useState(null);
  const [handoffTask, setHandoffTask] = useState(null);
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (operationsSource !== 'erp') {
      setDashboard(localDashboard);
      setLoading(false);
      setError('');
      return undefined;
    }
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 7000);
    setLoading(true);
    setError('');
    fetch('/api/realm-demo/command-center', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Không thể tải Royal Command Center.');
        if (payload?.source !== 'erp' || !Array.isArray(payload?.tasks) || !Array.isArray(payload?.workload)) throw new Error('ERP trả về bảng điều phối không hợp lệ.');
        if (active) setDashboard(payload);
      })
      .catch((requestError) => {
        if (active) setError(requestError.name === 'AbortError' ? 'ERP phản hồi quá lâu. Hãy thử lại.' : requestError.message);
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (active) setLoading(false);
      });
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [dataRevision, localDashboard, operationsSource, revision]);

  const visibleTasks = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('vi');
    return (dashboard?.tasks || []).filter((task) => {
      if (task.status === 'done') return false;
      if (attentionOnly && !task.overdue && task.assignee && !task.handoff) return false;
      if (!needle) return true;
      return [task.title, task.project?.name, task.assignee?.name].filter(Boolean).join(' ').toLocaleLowerCase('vi').includes(needle);
    });
  }, [attentionOnly, dashboard, query]);

  if (loading && !dashboard) return <StateCard loading />;
  if (error && !dashboard) return <StateCard error={error} onRetry={reload} />;
  if (!dashboard) return <StateCard error="Chưa có dữ liệu điều phối." onRetry={reload} />;
  const { metrics, workload, members, source, horizon, permissions } = dashboard;
  return <section className={`${styles.commandCenter} ${compact ? styles.compact : ''}`} aria-labelledby={titleId}>
    <header className={styles.hero}>
      <span className={styles.crest}><Icon name="shield" size={compact ? 23 : 28} /></span>
      <div><span className={styles.eyebrow}>Royal Command Center · Workforce orchestration</span><h2 id={titleId}>Điều phối Quest xuyên ERP và Realm</h2><p>Phân công, cảnh báo xung đột và bàn giao đều vận hành trên Task ERP hiện hữu.</p></div>
      <span className={`${styles.sourceBadge} ${source === 'erp' ? styles.sourceLive : ''}`}><Icon name={source === 'erp' ? 'check' : 'shield'} size={14} />{source === 'erp' ? 'ERP live · command bridge' : 'Demo cục bộ'}</span>
    </header>

    {error && <div className={styles.staleNotice} role="alert"><Icon name="alert" size={16} /><span>{error} Snapshot gần nhất vẫn được giữ.</span><button type="button" onClick={reload}>Thử lại</button></div>}

    <div className={styles.metrics} aria-label="Tổng quan điều phối">
      <article><Icon name="tasks" size={18} /><span><small>Quest mở</small><strong>{metrics.openTasks}</strong></span></article>
      <article><Icon name="staff" size={18} /><span><small>Chưa phân công</small><strong>{metrics.unassignedTasks}</strong></span></article>
      <article className={metrics.overdueTasks ? styles.metricDanger : ''}><Icon name="alert" size={18} /><span><small>Quá hạn</small><strong>{metrics.overdueTasks}</strong></span></article>
      <article className={metrics.overloadedMembers ? styles.metricWarning : ''}><Icon name="clock" size={18} /><span><small>Nguy cơ quá tải</small><strong>{metrics.overloadedMembers}</strong></span></article>
      <article><Icon name="repeat" size={18} /><span><small>Chờ bàn giao</small><strong>{metrics.pendingHandoffs}</strong></span></article>
    </div>

    <section className={styles.workloadSection} aria-labelledby={`${titleId}-workload`}>
      <header className={styles.sectionHead}><div><span>Guild workload · {horizon.label}</span><h3 id={`${titleId}-workload`}>Khả năng nhận Quest</h3></div><p>{horizon.capacityBasis}</p></header>
      <div className={styles.workloadGrid}>{workload.map((member) => <WorkloadCard member={member} key={member.id} />)}</div>
    </section>

    <section className={styles.queueSection} aria-labelledby={`${titleId}-queue`}>
      <header className={styles.sectionHead}><div><span>Assignment queue</span><h3 id={`${titleId}-queue`}>Danh sách điều phối</h3></div><p>{permissions.canAssign ? 'Bạn có quyền phân công trong phạm vi hiện tại.' : 'Bạn có thể theo dõi và xin bàn giao Quest đang phụ trách.'}</p></header>
      <div className={styles.filters}>
        <label><span>Tìm Quest, dự án hoặc người phụ trách</span><div><Icon name="search" size={15} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nhập từ khóa…" /></div></label>
        <label className={styles.checkFilter}><input type="checkbox" checked={attentionOnly} onChange={(event) => setAttentionOnly(event.target.checked)} /><span>Chỉ việc cần chú ý</span></label>
      </div>
      <div className={styles.taskList}>{visibleTasks.length ? visibleTasks.map((task) => <TaskRow task={task} key={task.id} onAssign={setAssignmentTask} onHandoff={setHandoffTask} />) : <p className={styles.empty}>Không có Quest phù hợp bộ lọc hiện tại.</p>}</div>
    </section>

    <aside className={styles.governance}><Icon name="shield" size={18} /><div><strong>Điều phối nguồn lực, không xếp hạng con người</strong><p>Tải kế hoạch chỉ cộng giờ ước lượng của Quest quá hạn hoặc đến hạn trong 7 ngày. Presence, Gold và tốc độ cá nhân không được dùng để suy diễn hiệu suất.</p></div></aside>
    {assignmentTask && <AssignmentModal task={assignmentTask} members={members} onClose={() => setAssignmentTask(null)} onComplete={() => { setAssignmentTask(null); reload(); }} />}
    {handoffTask && <HandoffModal task={handoffTask} members={members} onClose={() => setHandoffTask(null)} onComplete={() => { setHandoffTask(null); reload(); }} />}
  </section>;
}
