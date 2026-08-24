'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/ui';
import Icon from './Icon';
import { Badge, Banner, Button, Field, Panel, Segmented, SourcePill, StateView, Status } from './Primitives';
import { Modal } from './Overlays';
import { MetricCard, Receipt } from './WorkObjects';
import styles from './realm-v2.module.css';

const LANES = [
  { key: 'planned', label: 'Sắp thực hiện', description: 'Task đã sẵn sàng hoặc chưa bắt đầu.' },
  { key: 'doing', label: 'Đang thực hiện', description: 'Task nằm trong giới hạn WIP.' },
  { key: 'waiting', label: 'Đang chờ', description: 'Chờ review, quyết định hoặc đầu vào.' },
  { key: 'blocked', label: 'Bị chặn', description: 'Cần can thiệp hoặc gỡ blocker.' },
];

const WORK_VIEWS = [
  { value: 'board', label: 'Board' },
  { value: 'queue', label: 'Hàng đợi' },
  { value: 'timeline', label: 'Cập nhật' },
  { value: 'workload', label: 'Workload' },
];

const ACTION_FILTERS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'approval', label: 'Phê duyệt' },
  { value: 'blocker', label: 'Blocker' },
  { value: 'risk', label: 'Rủi ro' },
  { value: 'notification', label: 'Thông báo' },
];

function dateLabel(value, withTime = false) {
  if (!value) return 'Chưa xác định';
  const date = new Date(withTime ? value : `${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('vi-VN', withTime
    ? { dateStyle: 'short', timeStyle: 'short' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function moneyLabel(value) {
  const amount = Number(value || 0);
  return amount ? `${new Intl.NumberFormat('vi-VN').format(amount)} ₫` : 'Tác động vận hành';
}

function isOverdue(task) {
  return Boolean(task?.dueDate && String(task.dueDate).slice(0, 10) < new Date().toISOString().slice(0, 10) && !['done', 'merged'].includes(task.status));
}

function laneFor(task) {
  if (task?.status === 'blocked') return 'blocked';
  if (['waiting', 'review'].includes(task?.status)) return 'waiting';
  if (['doing', 'in_progress'].includes(task?.status)) return 'doing';
  return 'planned';
}

function stateLabel(task) {
  const labels = {
    todo: 'Chưa bắt đầu', doing: 'Đang làm', in_progress: 'Đang làm', review: 'Chờ review',
    waiting: 'Đang chờ', blocked: 'Bị chặn', done: 'Đã xong', merged: 'Đã gộp',
  };
  return labels[task?.status] || task?.status || 'Chưa xác định';
}

function stateTone(task) {
  if (task?.status === 'blocked' || isOverdue(task)) return 'danger';
  if (['waiting', 'review'].includes(task?.status)) return 'warning';
  if (['doing', 'in_progress'].includes(task?.status)) return 'success';
  return 'neutral';
}

function safeSteps(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function flattenTeamWork(model) {
  if (!model) return [];
  const assigned = (model.members || []).flatMap((row) => (row.tasks || []).map((task) => ({
    ...task,
    member: row.member,
    queue: row.queue,
    capacity: row.capacity,
  })));
  const unassigned = (model.unassigned || []).map((task) => ({ ...task, member: null, queue: null, capacity: null }));
  return [...assigned, ...unassigned];
}

function useOperationsSources(slug) {
  const [state, setState] = useState({ loading: true, teamWork: null, approvals: null, notifications: null, errors: {} });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, errors: {} }));
    const endpoints = slug === 'work-management'
      ? { teamWork: '/api/execution/team-work' }
      : { teamWork: '/api/execution/team-work', approvals: '/api/approvals', notifications: '/api/notifications' };
    const entries = await Promise.all(Object.entries(endpoints).map(async ([key, url]) => {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const error = new Error(payload.error || `Không thể tải ${key}.`);
          error.status = response.status;
          error.code = payload.code;
          throw error;
        }
        return [key, payload, null];
      } catch (error) {
        return [key, null, { message: error?.message || 'Không thể kết nối máy chủ.', status: error?.status || 0, code: error?.code || 'network_error' }];
      }
    }));
    const next = { loading: false, teamWork: null, approvals: null, notifications: null, errors: {} };
    for (const [key, payload, error] of entries) {
      next[key] = payload;
      if (error) next.errors[key] = error;
    }
    setState(next);
  }, [slug]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

function SourceWarnings({ errors, onRetry }) {
  const entries = Object.entries(errors || {});
  if (!entries.length) return null;
  const onlyManagerScope = entries.every(([, error]) => error.status === 403 && error.code === 'execution_manager_forbidden');
  return (
    <Banner tone={onlyManagerScope ? 'info' : 'warning'} action={<Button variant="secondary" icon="refresh" onClick={onRetry}>Thử lại</Button>}>
      <strong>{onlyManagerScope ? 'Một nguồn bị giới hạn theo vai trò.' : 'Một số nguồn đang gián đoạn.'}</strong>{' '}
      {onlyManagerScope ? 'Action Center vẫn hiển thị các quyết định bạn được phép xem.' : 'Dữ liệu tải được vẫn hiển thị; không action nào được tự động gửi.'}
    </Banner>
  );
}

function useRepositoryCommand(reload) {
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const [receipt, setReceipt] = useState(null);
  const execute = useCallback(async (task, input, successCopy) => {
    const marker = `${task.id}:${input.action}`;
    setBusy(marker);
    try {
      const idempotencyKey = `realm-v2:${input.action}:${task.id}:${crypto.randomUUID()}`;
      const response = await fetch('/api/execution/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ entityId: task.id, ...input }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'RepositoryRealms từ chối action này.');
      const receiptId = payload.repository?.receiptId;
      if (!receiptId) throw new Error('Chưa nhận được canonical receipt; action chưa được coi là hoàn tất.');
      setReceipt({ id: receiptId, action: successCopy, actor: 'Tài khoản ERP hiện tại' });
      toast(`${successCopy} Canonical receipt đã được xác minh.`);
      await reload();
      return true;
    } catch (error) {
      toast(error?.message || 'Không thể hoàn tất action.', 'error');
      return false;
    } finally {
      setBusy('');
    }
  }, [reload, toast]);
  return { busy, execute, receipt, clearReceipt: () => setReceipt(null) };
}

function TaskTile({ task, onOpen, compact = false }) {
  const overdue = isOverdue(task);
  return (
    <article className={styles.operationsTask} data-task-id={task.id} data-overdue={overdue || undefined}>
      <div className={styles.taskTop}>
        <div className={styles.canonicalTaskTitle}>
          <span className={styles.eyebrow}>{task.project?.name || 'Task ERP'}</span>
          <h3>{task.title}</h3>
        </div>
        <Badge tone={stateTone(task)}>{overdue ? 'Quá hạn' : stateLabel(task)}</Badge>
      </div>
      {!compact && task.blockReason && <p className={styles.operationsReason}><Icon name="warning" size={14}/> {task.blockReason}</p>}
      <div className={styles.objectMeta}>
        <span><Icon name="person" size={14}/> {task.member?.name || 'Chưa phân công'}</span>
        <span><Icon name="clock" size={14}/> {dateLabel(task.dueDate)}</span>
        {Number(task.estHours) > 0 && <span><Icon name="chart" size={14}/> {task.estHours}h</span>}
      </div>
      <button type="button" className={styles.operationsOpen} onClick={() => onOpen(task)} aria-label={`Xem và điều phối ${task.title}`}>
        <span>Xem & điều phối</span><Icon name="chevron" size={15}/>
      </button>
    </article>
  );
}

function TaskActionDialog({ task, busy, onClose, onExecute }) {
  const [reason, setReason] = useState('');
  const [reasonCode, setReasonCode] = useState('dependency');
  const nextTransition = task.status === 'todo' ? 'in_progress' : ['doing', 'in_progress', 'review'].includes(task.status) ? 'done' : null;
  const nextEscalation = Math.min(3, Number(task.escalationLevel || 0) + 1);
  const pending = Boolean(busy);
  const finish = async (input, copy) => {
    if (await onExecute(task, input, copy)) onClose();
  };
  return (
    <Modal title="Điều phối Task ERP" onClose={onClose} footer={<><Link className={styles.button} data-variant="secondary" href={`/tasks?focus=${encodeURIComponent(task.id)}&from=realm-v2`}>Mở Task ERP</Link><Button variant="quiet" onClick={onClose}>Đóng</Button></>}>
      <div className={styles.grid}>
        <div>
          <span className={styles.eyebrow}>{task.project?.name || 'Task ERP'}</span>
          <h3>{task.title}</h3>
        </div>
        <div className={styles.proposalGrid}>
          <dl className={styles.definition}><dt>Người phụ trách</dt><dd>{task.member?.name || 'Chưa phân công'}</dd></dl>
          <dl className={styles.definition}><dt>Trạng thái canonical</dt><dd>{stateLabel(task)} · version {task.workVersion || 0}</dd></dl>
          <dl className={styles.definition}><dt>Deadline</dt><dd>{dateLabel(task.dueDate)}</dd></dl>
          <dl className={styles.definition}><dt>Nguồn</dt><dd>ERP Task · Live</dd></dl>
        </div>
        {nextTransition && (
          <section className={styles.suggestedAction}>
            <div><span className={styles.eyebrow}>Suggested action</span><strong>{nextTransition === 'done' ? 'Xác nhận Task đã hoàn tất' : 'Bắt đầu Task theo workflow ERP'}</strong><p>Authorization và transition graph được kiểm tra lại ở server.</p></div>
            <Button loading={busy.endsWith('task.transition')} icon={nextTransition === 'done' ? 'check' : 'bolt'} onClick={() => finish({ action: 'task.transition', expectedState: task.status, nextState: nextTransition }, nextTransition === 'done' ? 'Task ERP đã hoàn tất.' : 'Task ERP đã bắt đầu.')}>{nextTransition === 'done' ? 'Hoàn tất' : 'Bắt đầu'}</Button>
          </section>
        )}
        <Field label="Lý do can thiệp" hint="Bắt buộc khi báo blocker hoặc escalation; nội dung được giới hạn bởi business rule.">
          <textarea className={styles.textarea} maxLength={240} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Mô tả nguyên nhân và bước tiếp theo…"/>
        </Field>
        {task.status !== 'blocked' && (
          <Field label="Nhóm nguyên nhân">
            <select className={styles.select} value={reasonCode} onChange={(event) => setReasonCode(event.target.value)}>
              <option value="dependency">Phụ thuộc</option>
              <option value="decision">Cần quyết định</option>
              <option value="capacity">Thiếu khả năng xử lý</option>
              <option value="external">Yếu tố bên ngoài</option>
            </select>
          </Field>
        )}
        <div className={styles.interventionActions}>
          {task.status === 'blocked'
            ? <Button variant="secondary" icon="refresh" loading={busy.endsWith('task.unblock')} disabled={pending} onClick={() => finish({ action: 'task.unblock', expectedVersion: task.workVersion, nextStatus: 'todo' }, 'Blocker đã được gỡ khỏi Task ERP.')}>Gỡ blocker</Button>
            : <Button variant="secondary" icon="lock" loading={busy.endsWith('task.block')} disabled={pending || !reason.trim()} onClick={() => finish({ action: 'task.block', expectedVersion: task.workVersion, reasonCode, reason: reason.trim() }, 'Blocker đã được ghi vào Task ERP.')}>Báo blocker</Button>}
          {nextEscalation > Number(task.escalationLevel || 0) && <Button variant="secondary" icon="warning" loading={busy.endsWith('task.escalate')} disabled={pending || !reason.trim()} onClick={() => finish({ action: 'task.escalate', expectedVersion: task.workVersion, level: nextEscalation, reasonCode: 'manager_attention', reason: reason.trim() }, `Task ERP đã escalation lên cấp ${nextEscalation}.`)}>Escalate cấp {nextEscalation}</Button>}
        </div>
        <SourcePill source="RepositoryRealms" freshness="Authorization · Rules · Receipt · Audit"/>
      </div>
    </Modal>
  );
}

function WorkBoard({ tasks, onOpen }) {
  const byLane = Object.fromEntries(LANES.map((lane) => [lane.key, tasks.filter((task) => laneFor(task) === lane.key)]));
  return (
    <div className={styles.operationsBoard} aria-label="Board công việc theo trạng thái">
      {LANES.map((lane) => (
        <section className={styles.workLane} key={lane.key} aria-labelledby={`lane-${lane.key}`}>
          <header className={styles.operationsLaneHead}>
            <div><h3 id={`lane-${lane.key}`}>{lane.label}</h3><span>{lane.description}</span></div>
            <Badge tone={lane.key === 'blocked' && byLane[lane.key].length ? 'danger' : 'neutral'}>{byLane[lane.key].length}</Badge>
          </header>
          <div className={styles.operationsLaneBody}>
            {byLane[lane.key].map((task) => <TaskTile key={task.id} task={task} onOpen={onOpen} compact/>)}
            {!byLane[lane.key].length && <div className={styles.operationsLaneEmpty}>Không có Task</div>}
          </div>
        </section>
      ))}
    </div>
  );
}

function WorkQueue({ tasks, onOpen }) {
  const sorted = [...tasks].sort((left, right) => String(left.dueDate || '9999-12-31').localeCompare(String(right.dueDate || '9999-12-31')) || String(left.title).localeCompare(String(right.title)));
  return <div className={styles.operationsQueue}>{sorted.map((task, index) => <div className={styles.queueRow} key={task.id}><span className={styles.queueIndex}>{index + 1}</span><TaskTile task={task} onOpen={onOpen} compact/></div>)}</div>;
}

function WorkTimeline({ tasks, onOpen }) {
  const recent = [...tasks].sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''))).slice(0, 30);
  return <ol className={styles.timeline}>{recent.map((task) => <li className={styles.timelineItem} key={task.id}><time>{dateLabel(task.updatedAt, true)}</time><strong>{task.title}</strong><p>{task.member?.name || 'Chưa phân công'} · {stateLabel(task)} · {task.project?.name || 'Task ERP'}</p><button type="button" className={styles.inlineLink} onClick={() => onOpen(task)}>Xem bản ghi</button></li>)}</ol>;
}

function WorkloadView({ members }) {
  return (
    <div className={styles.workloadGrid}>
      {(members || []).map((row) => {
        const limit = Math.max(1, Number(row.queue?.wipLimit || 5));
        const percent = Math.min(100, Math.round(Number(row.metrics?.wip || 0) / limit * 100));
        return <article className={styles.workloadCard} key={row.member.id}>
          <header><span className={styles.avatar}>{String(row.member.name || 'U').split(/\s+/).map((part) => part[0]).slice(-2).join('').toUpperCase()}</span><div><h3>{row.member.name}</h3><p>{row.member.title || 'Nhân sự ERP'}</p></div><Status tone={row.capacity?.key === 'over' ? 'danger' : row.capacity?.key === 'near' ? 'warning' : 'success'}>{row.capacity?.label || 'Có khả năng nhận việc'}</Status></header>
          <div className={styles.progressTrack} aria-label={`WIP ${row.metrics?.wip || 0} trên ${limit}`}><div className={styles.progressBar} style={{ width: `${percent}%`, background: row.capacity?.key === 'over' ? 'var(--r2-red)' : undefined }}/></div>
          <div className={styles.workloadMetrics}><span><strong>{row.metrics?.open || 0}</strong> đang mở</span><span><strong>{row.metrics?.wip || 0}/{limit}</strong> WIP</span><span><strong>{row.metrics?.blocked || 0}</strong> blocker</span><span><strong>{row.metrics?.estimatedOpenHours || 0}h</strong> ước lượng</span></div>
          <p className={styles.workloadPolicy}>Chỉ báo planning; không phải điểm năng suất hay xếp hạng nhân sự.</p>
        </article>;
      })}
    </div>
  );
}

function WorkManagementScreen() {
  const data = useOperationsSources('work-management');
  const [view, setView] = useState('board');
  const [selectedTask, setSelectedTask] = useState(null);
  const tasks = useMemo(() => flattenTeamWork(data.teamWork), [data.teamWork]);
  const commands = useRepositoryCommand(data.reload);

  if (data.loading && !data.teamWork) return <Panel><StateView state="loading"/></Panel>;
  if (!data.teamWork) {
    const denied = data.errors.teamWork?.status === 403;
    return <Panel title={denied ? 'Quản lý công việc được giới hạn theo vai trò' : 'Không thể tải Work Management'}><div className={styles.canonicalState}><StateView state={denied ? 'permission-denied' : 'error'}/>{!denied && <Button variant="secondary" icon="refresh" onClick={data.reload}>Tải lại an toàn</Button>}<Link className={styles.button} data-variant="secondary" href="/tasks">Mở Bảng công việc ERP</Link></div></Panel>;
  }

  return (
    <div className={styles.grid}>
      <SourceWarnings errors={data.errors} onRetry={data.reload}/>
      <section className={`${styles.grid} ${styles.grid4}`} aria-label="Tóm tắt luồng công việc">
        <MetricCard label="Task đang mở" value={data.teamWork.metrics.open} meta="ERP Task" icon="checklist"/>
        <MetricCard label="Đang trong WIP" value={data.teamWork.metrics.wip} meta={`${data.teamWork.members?.length || 0} người trong phạm vi`} icon="bolt" tone={data.teamWork.metrics.overCapacity ? 'warning' : 'success'}/>
        <MetricCard label="Cần can thiệp" value={data.teamWork.metrics.blocked + data.teamWork.metrics.overdue} meta={`${data.teamWork.metrics.blocked} blocker · ${data.teamWork.metrics.overdue} quá hạn`} icon="warning" tone={data.teamWork.metrics.blocked + data.teamWork.metrics.overdue ? 'danger' : 'success'}/>
        <MetricCard label="Chưa phân công" value={data.teamWork.metrics.unassigned} meta="Trong phạm vi Guild" icon="people" tone={data.teamWork.metrics.unassigned ? 'warning' : 'success'}/>
      </section>
      {commands.receipt && <Receipt id={commands.receipt.id} action={commands.receipt.action} actor={commands.receipt.actor} time={dateLabel(new Date().toISOString(), true)}/>} 
      <Panel title="Luồng công việc của Guild" description="Board, queue, cập nhật và workload cùng đọc Task ERP; không tạo store song song." actions={<><Button variant="secondary" icon="refresh" loading={data.loading} onClick={data.reload}>Đồng bộ</Button><Link className={styles.button} data-variant="secondary" href="/tasks">Mở ERP</Link></>}>
        <div className={styles.operationsToolbar}><div className={styles.canonicalFilters}><Segmented label="Chọn góc nhìn Work Management" options={WORK_VIEWS} value={view} onChange={setView}/></div><SourcePill source="ERP Task" freshness={dateLabel(data.teamWork.generatedAt, true)}/></div>
        <div className={styles.operationsView} aria-live="polite">
          {view === 'board' && <WorkBoard tasks={tasks} onOpen={setSelectedTask}/>} 
          {view === 'queue' && <WorkQueue tasks={tasks} onOpen={setSelectedTask}/>} 
          {view === 'timeline' && <WorkTimeline tasks={tasks} onOpen={setSelectedTask}/>} 
          {view === 'workload' && <WorkloadView members={data.teamWork.members}/>} 
          {!tasks.length && view !== 'workload' && <div className={styles.canonicalEmpty}><Icon name="check"/><strong>Không có Task đang mở trong phạm vi này</strong><span>Realm không tự tạo dữ liệu thay cho ERP.</span></div>}
        </div>
      </Panel>
      <div className={styles.sourceRow}><SourcePill source="RepositoryRealms" freshness="Business invariants enforced"/><span>Scope: {data.teamWork.scope}</span><span>Employee ranking: tắt theo policy.</span></div>
      {selectedTask && <TaskActionDialog task={selectedTask} busy={commands.busy} onClose={() => setSelectedTask(null)} onExecute={commands.execute}/>} 
    </div>
  );
}

function buildActionItems(data) {
  const tasks = flattenTeamWork(data.teamWork);
  const approvalItems = (data.approvals?.toApprove || []).map((approval) => ({
    id: `approval:${approval.id}`, category: 'approval', icon: 'approval', title: approval.title || 'Yêu cầu phê duyệt ERP',
    source: 'ERP Approval', entity: approval.type || 'approval', impact: moneyLabel(approval.amount), urgency: 'Cần quyết định',
    evidence: `${safeSteps(approval.steps).length || 1} bước maker-checker`, decision: 'Review theo policy ERP', expires: dateLabel(approval.createdAt, true), record: approval,
  }));
  const blockerItems = tasks.filter((task) => task.status === 'blocked').map((task) => ({
    id: `blocker:${task.id}`, category: 'blocker', icon: 'lock', title: task.title, source: 'ERP Task', entity: task.project?.name || 'Task',
    impact: task.blockReason || 'Luồng công việc đang bị chặn', urgency: 'Cao', evidence: `Work version ${task.workVersion || 0}`,
    decision: 'Gỡ blocker hoặc escalation', expires: dateLabel(task.dueDate), record: task,
  }));
  const riskItems = tasks.filter((task) => task.status !== 'blocked' && isOverdue(task)).map((task) => ({
    id: `risk:${task.id}`, category: 'risk', icon: 'warning', title: task.title, source: 'ERP Task', entity: task.project?.name || 'Task',
    impact: 'Task đã vượt deadline ERP', urgency: 'Quá hạn', evidence: `Cập nhật ${dateLabel(task.updatedAt, true)}`,
    decision: 'Review và can thiệp theo scope', expires: dateLabel(task.dueDate), record: task,
  }));
  const notificationItems = (data.notifications?.rows || []).filter((item) => !item.readAt).map((item) => ({
    id: `notification:${item.id}`, category: 'notification', icon: 'bell', title: item.title || 'Thông báo ERP', source: 'ERP Notification', entity: 'Notification',
    impact: 'Thông tin mới trong phạm vi tài khoản', urgency: 'Mới', evidence: 'Authorization đã kiểm tra trước khi render',
    decision: 'Mở ngữ cảnh liên quan', expires: dateLabel(item.createdAt, true), record: item,
  }));
  return [...approvalItems, ...blockerItems, ...riskItems, ...notificationItems];
}

function ActionItem({ item, selected, onSelect }) {
  const tone = item.category === 'blocker' || item.category === 'risk' ? 'danger' : item.category === 'approval' ? 'warning' : 'info';
  return (
    <button type="button" className={styles.actionItem} data-selected={selected || undefined} aria-pressed={selected} onClick={() => onSelect(item)}>
      <span className={styles.actionItemIcon}><Icon name={item.icon}/></span>
      <span className={styles.actionItemCopy}><span className={styles.eyebrow}>{item.source}</span><strong>{item.title}</strong><small>{item.entity} · {item.impact}</small></span>
      <span className={styles.actionItemMeta}><Badge tone={tone}>{item.urgency}</Badge><small>{item.expires}</small></span>
      <Icon name="chevron" size={15}/>
    </button>
  );
}

function ActionDetail({ item, onTaskOpen }) {
  if (!item) return <div className={styles.canonicalEmpty}><Icon name="bolt"/><strong>Chọn một action cần xử lý</strong><span>Chi tiết, policy và đường xử lý canonical sẽ xuất hiện tại đây.</span></div>;
  const approval = item.category === 'approval' ? item.record : null;
  const steps = approval ? safeSteps(approval.steps) : [];
  return (
    <div className={styles.actionDetail} data-action-detail={item.category}>
      <div><span className={styles.eyebrow}>{item.source}</span><h2>{item.title}</h2></div>
      <div className={styles.proposalGrid}>
        <dl className={styles.definition}><dt>Entity / context</dt><dd>{item.entity}</dd></dl>
        <dl className={styles.definition}><dt>Tác động</dt><dd>{item.impact}</dd></dl>
        <dl className={styles.definition}><dt>Urgency / SLA</dt><dd>{item.urgency} · {item.expires}</dd></dl>
        <dl className={styles.definition}><dt>Evidence</dt><dd>{item.evidence}</dd></dl>
      </div>
      {approval && <div className={styles.approvalChain} aria-label="Chuỗi maker-checker">{steps.length ? steps.map((step, index) => <span key={`${step.role || step.label}-${index}`}><Icon name={step.status === 'approved' ? 'check' : 'approval'} size={14}/>{step.label || step.role || `Bước ${index + 1}`} · {step.status || 'pending'}</span>) : <span><Icon name="approval" size={14}/>Policy được giữ tại Approval ERP</span>}</div>}
      <Banner tone={approval ? 'warning' : 'info'}><strong>{approval ? 'Fail-closed theo RepositoryRealms.' : 'Action dùng canonical Task/Notification.'}</strong>{' '}{approval ? '`approval.decide` chưa nằm trong allowlist, nên quyết định phải thực hiện tại ERP thay vì sao chép handler vào Realm.' : 'Không có trạng thái thành công nào được hiển thị trước canonical receipt.'}</Banner>
      <div className={styles.actionDetailActions}>
        {approval && <Link className={styles.button} href={`/approvals?focus=${encodeURIComponent(approval.id)}&from=realm-v2`}><Icon name="approval" size={16}/><span>Mở phê duyệt ERP</span></Link>}
        {['blocker', 'risk'].includes(item.category) && <Button icon="bolt" onClick={() => onTaskOpen(item.record)}>Điều phối Task</Button>}
        {item.category === 'notification' && <Link className={styles.button} href={item.record.route || '/dashboard'}><Icon name="arrow" size={16}/><span>Mở ngữ cảnh</span></Link>}
      </div>
      <SourcePill source={item.source} freshness="Canonical · Authorized"/>
    </div>
  );
}

function ActionCenterScreen() {
  const data = useOperationsSources('action-center');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [taskDialog, setTaskDialog] = useState(null);
  const commands = useRepositoryCommand(data.reload);
  const items = useMemo(() => buildActionItems(data), [data]);
  const visible = filter === 'all' ? items : items.filter((item) => item.category === filter);
  const active = selected && visible.some((item) => item.id === selected.id) ? selected : visible[0] || null;
  const counts = useMemo(() => Object.fromEntries(ACTION_FILTERS.map((option) => [option.value, option.value === 'all' ? items.length : items.filter((item) => item.category === option.value).length])), [items]);

  if (data.loading && !data.approvals && !data.teamWork && !data.notifications) return <Panel><StateView state="loading"/></Panel>;
  if (!data.approvals && !data.teamWork && !data.notifications) return <Panel title="Không thể tải Action Center"><div className={styles.canonicalState}><StateView state="error"/><Button variant="secondary" icon="refresh" onClick={data.reload}>Tải lại an toàn</Button></div></Panel>;

  return (
    <div className={styles.grid}>
      <SourceWarnings errors={data.errors} onRetry={data.reload}/>
      <section className={`${styles.grid} ${styles.grid4}`} aria-label="Tóm tắt Action Center">
        <MetricCard label="Cần xử lý" value={items.length} meta="Theo quyền hiện tại" icon="bolt" tone={items.length ? 'warning' : 'success'}/>
        <MetricCard label="Phê duyệt" value={counts.approval} meta="Maker-checker ERP" icon="approval" tone={counts.approval ? 'warning' : 'success'}/>
        <MetricCard label="Blocker & rủi ro" value={counts.blocker + counts.risk} meta="Từ Task ERP" icon="warning" tone={counts.blocker + counts.risk ? 'danger' : 'success'}/>
        <MetricCard label="Thông báo chưa đọc" value={counts.notification} meta="Notification ERP" icon="bell" tone={counts.notification ? 'info' : 'success'}/>
      </section>
      {commands.receipt && <Receipt id={commands.receipt.id} action={commands.receipt.action} actor={commands.receipt.actor} time={dateLabel(new Date().toISOString(), true)}/>} 
      <Panel title="Ngoại lệ và quyết định" description="Sắp theo loại nguồn; không dùng điểm nhân sự hoặc opaque scoring." actions={<Button variant="secondary" icon="refresh" loading={data.loading} onClick={data.reload}>Đồng bộ</Button>}>
        <div className={styles.operationsToolbar}><div className={styles.canonicalFilters}><Segmented label="Lọc Action Center" options={ACTION_FILTERS.map((option) => ({ ...option, label: `${option.label} ${counts[option.value] || 0}` }))} value={filter} onChange={(value) => { setFilter(value); setSelected(null); }}/></div><SourcePill source="ERP/RepositoryRealms" freshness="Live"/></div>
        <div className={styles.actionCenterLayout}>
          <div className={styles.actionList} aria-live="polite">
            {visible.map((item) => <ActionItem key={item.id} item={item} selected={active?.id === item.id} onSelect={setSelected}/>) }
            {!visible.length && <div className={styles.canonicalEmpty}><Icon name="check"/><strong>Không có action trong bộ lọc này</strong><span>Realm không tạo ngoại lệ giả để lấp đầy giao diện.</span></div>}
          </div>
          <aside className={styles.actionDetailPanel} aria-label="Chi tiết action đã chọn"><ActionDetail item={active} onTaskOpen={setTaskDialog}/></aside>
        </div>
      </Panel>
      <div className={styles.sourceRow}><SourcePill source="RepositoryRealms" freshness="Unregistered intents fail closed"/><span>Approval decision vẫn thuộc workflow ERP cho tới khi có contract riêng.</span></div>
      {taskDialog && <TaskActionDialog task={taskDialog} busy={commands.busy} onClose={() => setTaskDialog(null)} onExecute={commands.execute}/>} 
    </div>
  );
}

export default function CanonicalRealmOperationsScreen({ slug }) {
  return slug === 'action-center' ? <ActionCenterScreen/> : <WorkManagementScreen/>;
}
