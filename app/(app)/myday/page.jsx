'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Icon, useToast } from '@/components/ui';
import styles from './my-work.module.css';

const QUEUES = [
  ['doing', 'Đang làm', 'Giữ ít việc đang làm để hoàn tất nhanh hơn.'],
  ['blocked', 'Bị chặn', 'Cần hỗ trợ hoặc quyết định từ người điều phối.'],
  ['waiting', 'Đang chờ', 'Đang chờ review, phản hồi hoặc đầu vào.'],
  ['planned', 'Tiếp theo', 'Các việc đã được sắp theo ưu tiên.'],
  ['inbox', 'Inbox', 'Việc mới cần đọc và sắp xếp.'],
  ['completed', 'Đã xong', 'Những việc hoàn tất hoặc đã hợp nhất.'],
];

const STATUS = {
  todo: 'Chờ thực hiện', doing: 'Đang làm', in_progress: 'Đang làm', review: 'Chờ review',
  waiting: 'Đang chờ', blocked: 'Bị chặn', done: 'Hoàn tất', merged: 'Đã hợp nhất',
};

const WORK_TYPES = [
  ['design', 'Thiết kế'], ['content', 'Nội dung'], ['campaign', 'Chiến dịch'], ['development', 'Phát triển'],
  ['operations', 'Vận hành'], ['sales', 'Kinh doanh'], ['finance', 'Tài chính'], ['other', 'Khác'],
];
const COMPLEXITIES = [['small', 'Nhỏ'], ['medium', 'Vừa'], ['large', 'Lớn'], ['unknown', 'Chưa rõ']];

function hours(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}h` : '—';
}

function ResourceIntelligence({ value }) {
  if (!value) return null;
  return (
    <div className={styles.intelligence} data-level={value.signal.level}>
      <div className={styles.intelligenceHead}>
        <strong>{value.signal.label}</strong>
        <span>Confidence: {value.confidence.label}</span>
      </div>
      <dl>
        <div><dt>Estimate</dt><dd>{value.estimate.hours ? hours(value.estimate.hours) : 'Chưa có'}</dd></div>
        <div><dt>TimeLog</dt><dd>{hours(value.actual.hours)}</dd></div>
        <div><dt>Historical</dt><dd>{value.historical.medianHours == null ? 'Chưa đủ mẫu' : `${hours(value.historical.medianHours)} · ${value.historical.sampleSize} mẫu`}</dd></div>
        <div><dt>Đã dùng</dt><dd>{value.variance.consumedPercent == null ? '—' : `${value.variance.consumedPercent}%`}</dd></div>
      </dl>
      <p>{value.signal.explanation} TimeLog hiện là dữ liệu tự khai báo, không phải quan sát tuyệt đối.</p>
    </div>
  );
}

function nextTransition(task) {
  if (task.status === 'todo') return { nextState: 'doing', label: 'Bắt đầu' };
  if (['doing', 'in_progress'].includes(task.status)) return { nextState: 'review', label: 'Gửi review' };
  if (task.status === 'review') return { nextState: 'done', label: 'Hoàn tất' };
  if (task.status === 'waiting') return { nextState: 'doing', label: 'Tiếp tục làm' };
  return null;
}

function dueLabel(dueDate) {
  if (!dueDate) return 'Không có hạn';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${dueDate}T00:00:00`));
}

function WorkCard({ task, busy, onTransition, onEstimate }) {
  const transition = nextTransition(task);
  const overdue = task.dueDate && task.dueDate < new Date().toISOString().slice(0, 10) && !['done', 'merged'].includes(task.status);
  return (
    <article className={styles.workCard} data-state={task.status}>
      <div className={styles.workMain}>
        <div className={styles.workHeading}>
          <h3>{task.title}</h3>
          <span className={styles.status}>{STATUS[task.status] || task.status}</span>
        </div>
        <p className={styles.meta}>
          <span>{task.project?.name || 'Việc chung'}</span>
          <span className={overdue ? styles.overdue : ''}>{overdue ? 'Quá hạn: ' : 'Hạn: '}{dueLabel(task.dueDate)}</span>
          <span>Ưu tiên: {task.priority}</span>
          {task.escalationLevel > 0 && <span>Escalation L{task.escalationLevel}</span>}
        </p>
        {task.blockReason && <p className={styles.reason}><strong>Lý do bị chặn:</strong> {task.blockReason}</p>}
        <ResourceIntelligence value={task.intelligence} />
      </div>
      <div className={styles.workActions}>
        <Link className="btn btn-outline" href="/tasks">Mở chi tiết</Link>
        {!['done', 'merged'].includes(task.status) && <button className="btn btn-outline" disabled={busy} onClick={() => onEstimate(task)}>Cập nhật estimate</button>}
        {transition && (
          <button className="btn btn-primary" disabled={busy} onClick={() => onTransition(task, transition.nextState)}>
            <Icon name={transition.nextState === 'done' ? 'check' : 'tasks'} size={16} />
            {busy ? 'Đang cập nhật…' : transition.label}
          </button>
        )}
      </div>
    </article>
  );
}

function EstimatePanel({ task, busy, onClose, onSave }) {
  const [estimateHours, setEstimateHours] = useState(task.estHours || 1);
  const [workType, setWorkType] = useState(task.workType || 'other');
  const [complexity, setComplexity] = useState(task.complexity || 'unknown');
  const [note, setNote] = useState('');
  const validHours = Number(estimateHours) >= 0.25 && Number(estimateHours) <= 10000;
  return (
    <section className={styles.estimatePanel} aria-labelledby="my-estimate-title">
      <div className={styles.panelHead}>
        <div><p className={styles.eyebrow}>Declared estimate</p><h2 id="my-estimate-title">Ước lượng: {task.title}</h2></div>
        <button className="icon-btn" onClick={onClose} aria-label="Đóng form estimate"><Icon name="x" size={18} /></button>
      </div>
      <p>Estimate là khai báo phạm vi, không phải cam kết hiệu suất. Hệ thống giữ riêng estimate, TimeLog và historical để manager xem đúng ngữ cảnh.</p>
      <form onSubmit={(event) => { event.preventDefault(); if (validHours) onSave({
        action: 'task.estimate', entityId: task.id, expectedVersion: task.workVersion, estimateKind: 'declared',
        estimateHours: Number(estimateHours), workType, complexity, note,
      }); }}>
        <div><label htmlFor="my-estimate-hours">Số giờ ước lượng</label><input id="my-estimate-hours" type="number" min="0.25" max="10000" step="0.25" value={estimateHours} onChange={(event) => setEstimateHours(event.target.value)} required /></div>
        <div><label htmlFor="my-estimate-type">Nhóm công việc</label><select id="my-estimate-type" value={workType} onChange={(event) => setWorkType(event.target.value)}>{WORK_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
        <div><label htmlFor="my-estimate-complexity">Độ phức tạp</label><select id="my-estimate-complexity" value={complexity} onChange={(event) => setComplexity(event.target.value)}>{COMPLEXITIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
        <div className={styles.estimateNote}><label htmlFor="my-estimate-note">Ghi chú phạm vi (không bắt buộc)</label><input id="my-estimate-note" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} /></div>
        <div className={styles.formActions}><button type="button" className="btn btn-outline" onClick={onClose}>Hủy</button><button className="btn btn-primary" disabled={busy || !validHours}>{busy ? 'Đang lưu…' : 'Lưu estimate có receipt'}</button></div>
      </form>
    </section>
  );
}

export default function MyDayPage() {
  const { data: session } = useSession();
  const toast = useToast();
  const [model, setModel] = useState(null);
  const [approvals, setApprovals] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [estimateTask, setEstimateTask] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/execution/my-work', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Không thể tải công việc.');
      setModel(body);
    } catch (requestError) {
      setError(requestError.message || 'Không thể tải công việc.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    fetch('/api/approvals', { cache: 'no-store' }).then((response) => response.ok ? response.json() : null).then(setApprovals).catch(() => {});
  }, [load]);

  const transition = async (task, nextState) => {
    setBusyId(task.id);
    try {
      const key = `my-work:${task.id}:${task.status}:${nextState}:${crypto.randomUUID()}`;
      const response = await fetch('/api/execution/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ action: 'task.transition', entityId: task.id, expectedState: task.status, nextState }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Không thể cập nhật Task.');
      toast('Task ERP đã được cập nhật.');
      await load();
    } catch (requestError) {
      toast(requestError.message || 'Không thể cập nhật Task.', 'error');
    } finally {
      setBusyId('');
    }
  };

  const saveEstimate = async (command) => {
    setBusyId(command.entityId);
    try {
      const response = await fetch('/api/execution/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `my-estimate:${command.entityId}:${crypto.randomUUID()}` },
        body: JSON.stringify(command),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Không thể lưu estimate.');
      toast('Estimate đã cập nhật trên Task ERP và có receipt.');
      setEstimateTask(null);
      await load();
    } catch (requestError) {
      toast(requestError.message || 'Không thể lưu estimate.', 'error');
    } finally {
      setBusyId('');
    }
  };

  const toApprove = approvals?.toApprove || [];
  const metrics = model?.metrics || { open: 0, doing: 0, blocked: 0, overdue: 0 };
  const intelligence = model?.resourceIntelligence || { estimateMissing: 0, baselineReady: 0, attention: 0, declaredLoggedHours: 0 };
  const visibleQueues = useMemo(() => QUEUES.map(([key, label, description]) => ({ key, label, description, tasks: model?.queues?.[key] || [] })), [model]);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Personal execution cockpit</p>
          <h1>{session?.user?.name ? `${session.user.name}, đây là nhịp làm việc của bạn` : 'Việc của tôi'}</h1>
          <p>Task bên dưới là dữ liệu ERP gốc. Realm và giao diện ERP cùng nhìn vào một nguồn duy nhất.</p>
        </div>
        <div className={styles.heroActions}>
          <button className="btn btn-outline" onClick={load} disabled={loading}><Icon name="repeat" size={16} /> Làm mới</button>
          <Link className="btn btn-primary" href="/tasks"><Icon name="tasks" size={16} /> Mở bảng công việc</Link>
        </div>
      </header>

      <section className={styles.metrics} aria-label="Tóm tắt công việc">
        {[
          ['Việc đang mở', metrics.open],
          ['Đang làm', metrics.doing],
          ['Bị chặn', metrics.blocked],
          ['Quá hạn', metrics.overdue],
          ['Chờ tôi duyệt', toApprove.length],
        ].map(([label, value]) => <div key={label} className={styles.metric}><span>{label}</span><strong>{value}</strong></div>)}
      </section>

      <div className={styles.notice} role="note">
        <Icon name="shield" size={18} />
        <span>Không dùng thời gian online để chấm năng suất. Tiến độ được phản ánh bằng trạng thái và kết quả công việc.</span>
      </div>

      <section className={styles.intelligenceSummary} aria-labelledby="resource-intelligence-summary">
        <div><p className={styles.eyebrow}>Resource Intelligence · shadow mode</p><h2 id="resource-intelligence-summary">Estimate ≠ TimeLog ≠ Historical</h2><p>Chỉ đưa cảnh báo có giải thích; không dùng làm Gold, payroll hay điểm hiệu suất.</p></div>
        <dl>
          <div><dt>Thiếu estimate</dt><dd>{intelligence.estimateMissing}</dd></div>
          <div><dt>Cần xem lại</dt><dd>{intelligence.attention}</dd></div>
          <div><dt>Baseline đủ mẫu</dt><dd>{intelligence.baselineReady}</dd></div>
          <div><dt>TimeLog tự khai báo</dt><dd>{hours(intelligence.declaredLoggedHours)}</dd></div>
        </dl>
      </section>

      {estimateTask && <EstimatePanel key={`${estimateTask.id}:${estimateTask.workVersion}`} task={estimateTask} busy={busyId === estimateTask.id} onClose={() => setEstimateTask(null)} onSave={saveEstimate} />}

      <div className={styles.live} aria-live="polite">{loading ? 'Đang đồng bộ từ ERP…' : error || `Đã đồng bộ ${metrics.open} việc đang mở.`}</div>
      {error && <div className={styles.error} role="alert"><span>{error}</span><button className="btn btn-outline" onClick={load}>Thử lại</button></div>}

      {!error && visibleQueues.map((queue) => (
        <section key={queue.key} className={styles.queue} aria-labelledby={`queue-${queue.key}`}>
          <div className={styles.queueHead}>
            <div><h2 id={`queue-${queue.key}`}>{queue.label} <span>{queue.tasks.length}</span></h2><p>{queue.description}</p></div>
          </div>
          <div className={styles.queueList}>
            {queue.tasks.slice(0, queue.key === 'completed' ? 8 : 100).map((task) => <WorkCard key={task.id} task={task} busy={busyId === task.id} onTransition={transition} onEstimate={setEstimateTask} />)}
            {!loading && !queue.tasks.length && <p className={styles.empty}>Không có công việc trong nhóm này.</p>}
          </div>
        </section>
      ))}

      <section className={styles.approvals} aria-labelledby="my-approvals-title">
        <div><h2 id="my-approvals-title">Phê duyệt cần xử lý</h2><p>Luồng phê duyệt vẫn dùng nguyên module ERP hiện có.</p></div>
        <strong>{toApprove.length}</strong>
        <Link className="btn btn-outline" href="/approvals">Mở phê duyệt</Link>
      </section>
    </div>
  );
}
