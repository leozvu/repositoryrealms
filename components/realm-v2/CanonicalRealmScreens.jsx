'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/ui';
import Icon from './Icon';
import { Badge, Banner, Button, Panel, Segmented, SourcePill, StateView, Status } from './Primitives';
import { MetricCard } from './WorkObjects';
import styles from './realm-v2.module.css';

const QUEUE_COPY = {
  inbox: ['Mới nhận', 'Việc cần đọc và xếp thứ tự.'],
  planned: ['Tiếp theo', 'Đã sẵn sàng để bắt đầu.'],
  doing: ['Đang làm', 'Công việc đang trong WIP.'],
  waiting: ['Đang chờ', 'Chờ phản hồi, review hoặc đầu vào.'],
  blocked: ['Bị chặn', 'Cần hỗ trợ hoặc quyết định.'],
  completed: ['Đã xong', 'Hoàn tất hoặc đã gộp gần đây.'],
};

const OPEN_QUEUES = ['inbox', 'planned', 'doing', 'waiting', 'blocked'];

function dateLabel(value) {
  if (!value) return 'Chưa đặt hạn';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function timeLabel(value) {
  if (!value) return 'Chưa xác định';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function isOverdue(task) {
  return Boolean(task?.dueDate && String(task.dueDate).slice(0, 10) < new Date().toISOString().slice(0, 10) && !['done', 'merged'].includes(task.status));
}

function priorityTone(priority) {
  const value = String(priority || '').toLowerCase();
  if (['high', 'urgent', 'cao'].includes(value)) return 'danger';
  if (['medium', 'normal', 'vừa'].includes(value)) return 'warning';
  return 'neutral';
}

function useCanonicalWorkspace() {
  const [state, setState] = useState({ loading: true, myWork: null, approvals: null, notifications: null, errors: {} });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, errors: {} }));
    const endpoints = {
      myWork: '/api/execution/my-work',
      approvals: '/api/approvals',
      notifications: '/api/notifications',
    };
    const entries = await Promise.all(Object.entries(endpoints).map(async ([key, url]) => {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `Không thể tải ${key}.`);
        return [key, payload, null];
      } catch (error) {
        return [key, null, error?.message || 'Không thể kết nối máy chủ.'];
      }
    }));
    const next = { loading: false, myWork: null, approvals: null, notifications: null, errors: {} };
    for (const [key, payload, error] of entries) {
      next[key] = payload;
      if (error) next.errors[key] = error;
    }
    setState(next);
  }, []);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

function CanonicalTaskCard({ task, queue, busy, onTransition, compact = false }) {
  const overdue = isOverdue(task);
  const nextState = ['todo'].includes(task.status) ? 'in_progress' : ['doing', 'in_progress', 'review'].includes(task.status) ? 'done' : null;
  return (
    <article className={styles.canonicalTask} data-task-id={task.id} data-overdue={overdue || undefined}>
      <div className={styles.taskTop}>
        <div className={styles.canonicalTaskTitle}>
          <span className={styles.eyebrow}>{task.project?.name || 'Task ERP'}</span>
          <h3>{task.title}</h3>
        </div>
        <Badge tone={overdue ? 'danger' : priorityTone(task.priority)}>{overdue ? 'Quá hạn' : task.priority || 'Bình thường'}</Badge>
      </div>
      {!compact && task.note && <p className={styles.canonicalTaskNote}>{task.note}</p>}
      <div className={styles.objectMeta}>
        <span><Icon name="clock" size={14}/> {dateLabel(task.dueDate)}</span>
        <span><Icon name="checklist" size={14}/> {QUEUE_COPY[queue]?.[0] || task.status}</span>
        {Number(task.estHours) > 0 && <span><Icon name="chart" size={14}/> {task.estHours}h dự kiến</span>}
        <SourcePill source="ERP Task" freshness="Live"/>
      </div>
      <div className={styles.canonicalTaskActions}>
        <Link className={styles.button} data-variant="secondary" href={`/tasks?focus=${encodeURIComponent(task.id)}&from=realm-v2`}><Icon name="arrow" size={16}/><span>Mở Task ERP</span></Link>
        {nextState && <Button loading={busy} icon={nextState === 'done' ? 'check' : 'bolt'} onClick={() => onTransition(task, nextState)}>{nextState === 'done' ? 'Hoàn tất' : 'Bắt đầu'}</Button>}
      </div>
    </article>
  );
}

function PartialError({ errors, onRetry }) {
  const entries = Object.entries(errors || {});
  if (!entries.length) return null;
  return <Banner tone="warning" action={<Button variant="secondary" icon="refresh" onClick={onRetry}>Thử lại</Button>}><strong>Một số nguồn đang gián đoạn.</strong> Dữ liệu tải được vẫn hiển thị; không có lệnh nào được tự động gửi.</Banner>;
}

function useTaskTransition(reload) {
  const toast = useToast();
  const [busyId, setBusyId] = useState('');
  const transition = useCallback(async (task, nextState) => {
    setBusyId(task.id);
    try {
      const idempotencyKey = `realm-v2:task-transition:${task.id}:${crypto.randomUUID()}`;
      const response = await fetch('/api/execution/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ action: 'task.transition', entityId: task.id, expectedState: task.status, nextState }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Không thể cập nhật Task ERP.');
      toast('Task ERP đã cập nhật và RepositoryRealms đã ghi receipt.');
      await reload();
    } catch (error) {
      toast(error?.message || 'Không thể cập nhật Task ERP.', 'error');
    } finally {
      setBusyId('');
    }
  }, [reload, toast]);
  return { busyId, transition };
}

function HomeScreen() {
  const data = useCanonicalWorkspace();
  const { busyId, transition } = useTaskTransition(data.reload);
  const openTasks = useMemo(() => OPEN_QUEUES.flatMap((key) => (data.myWork?.queues?.[key] || []).map((task) => ({ ...task, queue: key }))), [data.myWork]);
  const nextTask = openTasks[0] || null;
  const attention = useMemo(() => openTasks.filter((task) => task.queue === 'blocked' || isOverdue(task)).slice(0, 5), [openTasks]);
  const projectCount = useMemo(() => new Set(openTasks.map((task) => task.project?.id).filter(Boolean)).size, [openTasks]);
  const approvals = data.approvals?.toApprove || [];
  const notifications = data.notifications?.rows || [];

  if (data.loading && !data.myWork) return <Panel><StateView state="loading"/></Panel>;
  if (!data.myWork) return <Panel title="Không thể tải Realm Home"><div className={styles.canonicalState}><StateView state="error"/><Button variant="secondary" icon="refresh" onClick={data.reload}>Tải lại an toàn</Button></div></Panel>;

  return (
    <div className={styles.grid}>
      <PartialError errors={data.errors} onRetry={data.reload}/>
      <section className={`${styles.grid} ${styles.grid4}`} aria-label="Tóm tắt vận hành cá nhân">
        <MetricCard label="Việc đang mở" value={data.myWork.metrics.open} meta="ERP Task" icon="checklist" tone="success"/>
        <MetricCard label="Cần chú ý" value={attention.length} meta="Chặn hoặc quá hạn" icon="warning" tone={attention.length ? 'warning' : 'success'}/>
        <MetricCard label="Chờ bạn duyệt" value={approvals.length} meta="Approval ERP" icon="approval" tone={approvals.length ? 'warning' : 'success'}/>
        <MetricCard label="Dự án đang góp sức" value={projectCount} meta="Theo Task được giao" icon="folder" tone="info"/>
      </section>

      <div className={styles.split}>
        <div className={styles.grid}>
          <Panel title="Bước tiếp theo" description="Ưu tiên theo hàng đợi cá nhân và deadline trong Task ERP." actions={<Link className={styles.button} data-variant="secondary" href="/realm-v2/my-work"><span>Xem toàn bộ</span><Icon name="chevron" size={14}/></Link>}>
            {nextTask ? <CanonicalTaskCard task={nextTask} queue={nextTask.queue} busy={busyId === nextTask.id} onTransition={transition}/> : <div className={styles.canonicalEmpty}><Icon name="check"/><strong>Không còn việc đang mở</strong><span>Realm không tự tạo nhiệm vụ thay cho ERP.</span></div>}
          </Panel>
          <Panel title="Cần bạn chú ý" description="Chỉ gồm việc bị chặn hoặc đã quá hạn; không phải điểm số nhân sự.">
            {attention.length ? <div className={styles.list}>{attention.map((task) => <Link href={`/tasks?focus=${encodeURIComponent(task.id)}&from=realm-v2`} className={styles.listItem} key={task.id}><span className={styles.listIcon}><Icon name={task.queue === 'blocked' ? 'lock' : 'clock'}/></span><span className={styles.listCopy}><strong>{task.title}</strong><span>{task.project?.name || 'Task ERP'} · {dateLabel(task.dueDate)}</span></span><Badge tone="danger">{task.queue === 'blocked' ? 'Bị chặn' : 'Quá hạn'}</Badge></Link>)}</div> : <div className={styles.canonicalEmpty}><Icon name="check"/><strong>Không có cảnh báo cá nhân</strong><span>Dữ liệu được kiểm tra tại {timeLabel(data.myWork.generatedAt)}.</span></div>}
          </Panel>
        </div>

        <aside className={styles.asideStack}>
          <Panel title="Quyết định đang chờ" description="Giữ nguyên authorization và maker-checker của ERP.">
            {approvals.length ? <div className={styles.list}>{approvals.slice(0, 4).map((approval) => <Link className={styles.listItem} href="/approvals" key={approval.id}><span className={styles.listIcon}><Icon name="approval"/></span><span className={styles.listCopy}><strong>{approval.title || approval.type || 'Yêu cầu phê duyệt'}</strong><span>{approval.requesterName || 'ERP Approval'} · {timeLabel(approval.createdAt)}</span></span><Icon name="chevron" size={14}/></Link>)}</div> : <div className={styles.canonicalEmpty}><Icon name="check"/><strong>Không có yêu cầu chờ duyệt</strong></div>}
          </Panel>
          <Panel title="Thay đổi gần đây" description="Thông báo theo đúng phạm vi tài khoản hiện tại.">
            {notifications.length ? <div className={styles.list}>{notifications.slice(0, 5).map((item) => <Link href={item.route || '/dashboard'} className={styles.listItem} key={item.id}><span className={styles.listIcon}><Icon name="bell"/></span><span className={styles.listCopy}><strong>{item.title}</strong><span>{timeLabel(item.createdAt)}</span></span>{!item.readAt && <Badge tone="info">Mới</Badge>}</Link>)}</div> : <div className={styles.canonicalEmpty}><Icon name="inbox"/><strong>Chưa có thông báo mới</strong></div>}
          </Panel>
          <SourcePill source={data.myWork.source === 'erp-task' ? 'ERP Task' : 'RepositoryRealms'} freshness={timeLabel(data.myWork.generatedAt)}/>
        </aside>
      </div>
    </div>
  );
}

function MyWorkScreen() {
  const data = useCanonicalWorkspace();
  const { busyId, transition } = useTaskTransition(data.reload);
  const [view, setView] = useState('all');
  const options = [
    { value: 'all', label: 'Tất cả' },
    { value: 'planned', label: 'Tiếp theo' },
    { value: 'doing', label: 'Đang làm' },
    { value: 'blocked', label: 'Bị chặn' },
    { value: 'waiting', label: 'Đang chờ' },
    { value: 'overdue', label: 'Quá hạn' },
    { value: 'completed', label: 'Đã xong' },
  ];
  const all = useMemo(() => Object.entries(data.myWork?.queues || {}).flatMap(([queue, tasks]) => tasks.map((task) => ({ ...task, queue }))), [data.myWork]);
  const visible = useMemo(() => {
    if (view === 'all') return all.filter((task) => task.queue !== 'completed');
    if (view === 'overdue') return all.filter(isOverdue);
    return all.filter((task) => task.queue === view || view === 'planned' && task.queue === 'inbox');
  }, [all, view]);

  if (data.loading && !data.myWork) return <Panel><StateView state="loading"/></Panel>;
  if (!data.myWork) return <Panel title="Không thể tải Việc của tôi"><div className={styles.canonicalState}><StateView state="error"/><Button variant="secondary" icon="refresh" onClick={data.reload}>Tải lại an toàn</Button></div></Panel>;

  return (
    <div className={styles.grid}>
      <PartialError errors={data.errors} onRetry={data.reload}/>
      <section className={`${styles.grid} ${styles.grid4}`} aria-label="Chỉ số công việc cá nhân">
        <MetricCard label="Đang mở" value={data.myWork.metrics.open} meta="Trong Task ERP" icon="checklist"/>
        <MetricCard label="Đang làm" value={data.myWork.metrics.doing} meta={`WIP ${data.myWork.metrics.doing}/${data.myWork.queue?.wipLimit || 5}`} icon="bolt" tone={data.myWork.metrics.doing > (data.myWork.queue?.wipLimit || 5) ? 'warning' : 'success'}/>
        <MetricCard label="Bị chặn" value={data.myWork.metrics.blocked} meta="Cần hỗ trợ" icon="lock" tone={data.myWork.metrics.blocked ? 'warning' : 'success'}/>
        <MetricCard label="Quá hạn" value={data.myWork.metrics.overdue} meta="Theo deadline ERP" icon="clock" tone={data.myWork.metrics.overdue ? 'danger' : 'success'}/>
      </section>
      <Panel title="Hàng đợi của bạn" description="Thứ tự và trạng thái được đọc trực tiếp từ Task ERP; hành động có receipt RepositoryRealms." actions={<Button variant="secondary" icon="refresh" loading={data.loading} onClick={data.reload}>Đồng bộ</Button>}>
        <div className={styles.canonicalFilters}><Segmented label="Lọc hàng đợi công việc" options={options} value={view} onChange={setView}/></div>
        <div className={styles.canonicalTaskList} aria-live="polite">
          {visible.map((task) => <CanonicalTaskCard key={task.id} task={task} queue={task.queue} busy={busyId === task.id} onTransition={transition}/>) }
          {!visible.length && <div className={styles.canonicalEmpty}><Icon name="inbox"/><strong>Không có Task trong chế độ xem này</strong><span>Đổi bộ lọc hoặc mở Bảng công việc ERP để tạo/giao việc.</span><Link className={styles.button} data-variant="secondary" href="/tasks"><Icon name="arrow" size={16}/><span>Mở Bảng công việc ERP</span></Link></div>}
        </div>
      </Panel>
      <div className={styles.sourceRow}><SourcePill source="ERP Task" freshness={timeLabel(data.myWork.generatedAt)}/><span>Queue version {data.myWork.queue?.version || 0}</span><span>Không có store công việc song song.</span></div>
    </div>
  );
}

export default function CanonicalRealmScreen({ slug }) {
  return slug === 'my-work' ? <MyWorkScreen/> : <HomeScreen/>;
}
