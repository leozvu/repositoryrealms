'use client';

// Personal execution cockpit — "Việc của tôi".
// Feedback AIm 07/2026 (video 18/7): mỗi việc là một "cục việc" trong lưới, kéo thả để
// tự sắp thứ tự ưu tiên; nền card đổi màu nhạt dần theo độ gấp deadline (3 ngày = vàng,
// 2 ngày = cam, ≤1 ngày = hồng); có 2 cách xem — mặc định theo Ưu tiên (thứ tự tự sắp),
// bấm nút để xem theo Deadline. Phân loại đúng 2 trục quan trọng × gấp (Eisenhower).
// Dữ liệu vẫn là Task ERP gốc qua /api/execution/my-work; kéo thả ghi bằng
// task.reprioritize (hàng đợi của chính mình) nên có receipt + audit như mọi thao tác khác.

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Icon, useToast } from '@/components/ui';
import { compareWorkItems } from '@/lib/execution-engine';
import styles from './my-work.module.css';

const STATUS = {
  todo: 'Cần làm', doing: 'Đang làm', in_progress: 'Đang làm', review: 'Chờ review',
  waiting: 'Đang chờ', blocked: 'Bị chặn', done: 'Hoàn tất', merged: 'Đã hợp nhất',
};
const OPEN_QUEUES = ['doing', 'blocked', 'waiting', 'planned', 'inbox'];
const WORK_TYPES = [
  ['design', 'Thiết kế'], ['content', 'Nội dung'], ['campaign', 'Chiến dịch'], ['development', 'Phát triển'],
  ['operations', 'Vận hành'], ['sales', 'Kinh doanh'], ['finance', 'Tài chính'], ['other', 'Khác'],
];
const COMPLEXITIES = [['small', 'Nhỏ'], ['medium', 'Vừa'], ['large', 'Lớn'], ['unknown', 'Chưa rõ']];

function hours(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}h` : '—';
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Số ngày còn lại đến hạn (0 = hôm nay, âm = quá hạn, null = không có hạn)
function daysLeft(dueDate, today) {
  if (!dueDate) return null;
  return Math.round((new Date(`${dueDate}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000);
}

// Màu "cục việc" theo độ gấp: 3 ngày vàng nhạt · 2 ngày cam nhạt · ≤1 ngày hồng nhạt.
function dueTone(task, today) {
  if (['done', 'merged'].includes(task.status)) return '';
  const left = daysLeft(task.dueDate, today);
  if (left == null || left > 3) return '';
  if (left <= 0) return left < 0 ? 'overdue' : 'due1';
  return `due${left}`; // due1 | due2 | due3
}

function nextTransition(task) {
  if (task.status === 'todo') return { nextState: 'doing', label: 'Bắt đầu' };
  if (['doing', 'in_progress'].includes(task.status)) return { nextState: 'review', label: 'Gửi review' };
  if (task.status === 'review') return { nextState: 'done', label: 'Hoàn tất' };
  if (task.status === 'waiting') return { nextState: 'doing', label: 'Tiếp tục' };
  return null;
}

function dueLabel(dueDate, today) {
  if (!dueDate) return 'Không có hạn';
  const left = daysLeft(dueDate, today);
  const date = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(new Date(`${dueDate}T00:00:00`));
  if (left < 0) return `Quá hạn ${-left} ngày (${date})`;
  if (left === 0) return `Hạn hôm nay (${date})`;
  if (left <= 3) return `Còn ${left} ngày (${date})`;
  return `Hạn ${date}`;
}

function TaskBlock({ task, index, today, busy, dragState, onDragStart, onDragOver, onDrop, onDragEnd, onTransition, onEstimate, onNudge, count }) {
  const transition = nextTransition(task);
  const tone = dueTone(task, today);
  const draggable = !busy;
  const isDragging = dragState.dragId === task.id;
  const isOver = dragState.overId === task.id && dragState.dragId !== task.id;
  return (
    <article
      className={styles.block}
      data-tone={tone}
      data-state={task.status}
      data-dragging={isDragging || undefined}
      data-over={isOver || undefined}
      draggable={draggable}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', task.id); onDragStart(task, index); }}
      onDragOver={e => { if (draggable && dragState.dragId) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver(task, index); } }}
      onDrop={e => { e.preventDefault(); onDrop(task, index); }}
      onDragEnd={onDragEnd}
      aria-label={`${task.title} — ưu tiên vị trí ${index + 1}`}
    >
      <div className={styles.blockHead}>
        <span className={styles.blockOrder} title="Thứ tự của bạn">{index + 1}</span>
        <span className={styles.blockStatus}>{STATUS[task.status] || task.status}</span>
        <span className={styles.nudge}>
          <button className="icon-btn" disabled={busy || index === 0} onClick={() => onNudge(task, index, index - 1)} aria-label="Đưa việc lên một bậc"><Icon name="chevron-up" size={14} /></button>
          <button className="icon-btn" disabled={busy || index === count - 1} onClick={() => onNudge(task, index, index + 1)} aria-label="Đưa việc xuống một bậc"><Icon name="chevron-down" size={14} /></button>
        </span>
      </div>
      <Link href={`/tasks?focus=${task.id}`} className={styles.blockTitle} title="Mở chi tiết việc" draggable={false}>{task.title}</Link>
      <p className={styles.blockMeta}>{task.project?.name || 'Việc chung'}{task.estHours ? ` · ${task.estHours}h` : ''}</p>
      {task.blockReason && <p className={styles.blockReason} title={task.blockReason}>⛔ {task.blockReason}</p>}
      <div className={styles.blockFoot}>
        <span className={styles.due} data-tone={tone}>{dueLabel(task.dueDate, today)}</span>
      </div>
      <div className={styles.blockActions}>
        <button className="icon-btn" disabled={busy} onClick={() => onEstimate(task)} title="Cập nhật estimate" aria-label="Cập nhật estimate"><Icon name="clock" size={14} /></button>
        {transition && (
          <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => onTransition(task, transition.nextState)}>
            <Icon name={transition.nextState === 'done' ? 'check' : 'tasks'} size={14} />{busy ? '…' : transition.label}
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
  const [sortingByDeadline, setSortingByDeadline] = useState(false); // hành động "Xếp theo deadline"
  const [localOrder, setLocalOrder] = useState(null); // optimistic order khi vừa kéo thả
  const [dragState, setDragState] = useState({ dragId: null, dragIndex: -1, overId: null });
  const today = todayISO();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/execution/my-work', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Không thể tải công việc.');
      setModel(body);
      setLocalOrder(null);
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

  // Gộp mọi hàng đợi mở thành MỘT lưới "cục việc" — thứ tự = queuePosition tự sắp.
  const openTasks = useMemo(() => {
    const queues = model?.queues || {};
    const flat = OPEN_QUEUES.flatMap((key) => queues[key] || []);
    flat.sort(compareWorkItems);
    if (!localOrder) return flat;
    const byId = new Map(flat.map((task) => [task.id, task]));
    const ordered = localOrder.map((id) => byId.get(id)).filter(Boolean);
    for (const task of flat) if (!localOrder.includes(task.id)) ordered.push(task);
    return ordered;
  }, [model, localOrder]);

  const displayed = openTasks;

  const completed = model?.queues?.completed || [];
  const ownerId = model?.queue?.ownerId;

  const act = async (command, okMessage) => {
    setBusyId(command.entityId);
    try {
      // key chỉ được chứa [a-zA-Z0-9:_-] — dấu chấm trong tên action từng làm server trả 400
      // "Idempotency key không hợp lệ" khiến toàn bộ kéo thả không lưu được (feedback AIm đợt 3)
      const key = `my-work:${command.action.replace(/\./g, '-')}:${command.entityId}:${crypto.randomUUID()}`;
      const response = await fetch('/api/execution/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify(command),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Không thể cập nhật Task.');
      if (okMessage) toast(okMessage);
      await load();
      return true;
    } catch (requestError) {
      toast(requestError.message || 'Không thể cập nhật Task.', 'error');
      setLocalOrder(null);
      return false;
    } finally {
      setBusyId('');
    }
  };

  const transition = (task, nextState) => act(
    { action: 'task.transition', entityId: task.id, expectedState: task.status, nextState },
    'Task ERP đã được cập nhật.',
  );

  const saveEstimate = async (command) => {
    const ok = await act(command, 'Estimate đã cập nhật trên Task ERP và có receipt.');
    if (ok) setEstimateTask(null);
  };

  // Kéo cục việc tới vị trí mới → task.reprioritize trên hàng đợi của chính mình.
  const reorder = async (task, fromIndex, toIndex) => {
    if (!ownerId || toIndex < 0 || toIndex >= openTasks.length || fromIndex === toIndex) return;
    const ids = openTasks.map((t) => t.id);
    ids.splice(fromIndex, 1);
    ids.splice(toIndex, 0, task.id);
    setLocalOrder(ids); // hiển thị ngay, server xác nhận sau
    await act({
      action: 'task.reprioritize', entityId: task.id, ownerId,
      expectedQueueVersion: model?.queue?.version || 0, targetIndex: toIndex,
    }, 'Đã lưu thứ tự ưu tiên mới.');
  };

  const onDrop = (targetTask, targetIndex) => {
    const { dragId, dragIndex } = dragState;
    setDragState({ dragId: null, dragIndex: -1, overId: null });
    if (!dragId || dragId === targetTask.id) return;
    const dragged = openTasks[dragIndex];
    if (dragged) reorder(dragged, dragIndex, targetIndex);
  };

  // "Xếp theo deadline" giờ là HÀNH ĐỘNG một phát (không phải chế độ xem): xếp cả bảng
  // theo hạn rồi LƯU thành thứ tự tay — sau đó kéo thả chỉnh tiếp tùy ý.
  const sortByDeadline = async () => {
    if (!ownerId || sortingByDeadline || openTasks.length < 2) return;
    setSortingByDeadline(true);
    try {
      const desired = [...openTasks].sort((a, b) =>
        String(a.dueDate || '9999-12-31').localeCompare(String(b.dueDate || '9999-12-31')) || String(a.id).localeCompare(String(b.id)));
      setLocalOrder(desired.map(t => t.id));
      let version = model?.queue?.version || 0;
      for (let i = 0; i < desired.length; i++) {
        const key = `my-work:sort-deadline:${desired[i].id}:${crypto.randomUUID()}`;
        const response = await fetch('/api/execution/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
          body: JSON.stringify({ action: 'task.reprioritize', entityId: desired[i].id, ownerId, expectedQueueVersion: version, targetIndex: i }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Không thể xếp theo deadline.');
        version += 1;
      }
      toast('Đã xếp cả bảng theo deadline — kéo thả để chỉnh tiếp theo ý bạn.');
      await load();
    } catch (requestError) {
      toast(requestError.message || 'Không thể xếp theo deadline.', 'error');
      setLocalOrder(null);
      await load();
    } finally {
      setSortingByDeadline(false);
    }
  };

  const toApprove = approvals?.toApprove || [];
  const metrics = model?.metrics || { open: 0, doing: 0, blocked: 0, overdue: 0 };
  const intelligence = model?.resourceIntelligence || { estimateMissing: 0, baselineReady: 0, attention: 0, declaredLoggedHours: 0 };

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Personal execution cockpit</p>
          <h1>{session?.user?.name ? `Việc của ${session.user.name.split(/\s+/).slice(-1)[0]}` : 'Việc của tôi'}</h1>
          <p>Bảng này sắp xếp hoàn toàn theo ý bạn — kéo cục việc đến đâu nằm đó, thay đổi ghi thẳng vào Task ERP. Màu nền báo độ gấp: vàng còn 3 ngày, cam còn 2 ngày, hồng còn 1 ngày/quá hạn.</p>
        </div>
        <div className={styles.heroActions}>
          <button className="btn btn-outline" onClick={load} disabled={loading}><Icon name="repeat" size={16} /> Làm mới</button>
          <Link className="btn btn-primary" href="/tasks"><Icon name="tasks" size={16} /> Bảng công việc</Link>
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

      <div className={styles.viewBar}>
        <button className="btn btn-outline" disabled={sortingByDeadline || displayed.length < 2} onClick={sortByDeadline}>
          <Icon name="clock" size={14} /> {sortingByDeadline ? 'Đang xếp…' : 'Xếp cả bảng theo deadline'}
        </button>
        <span className={styles.viewHint}>Thứ tự là CỦA BẠN — kéo thả (hoặc ▲▼) tùy ý, việc mới tự xếp theo deadline.</span>
      </div>

      <div className={styles.live} aria-live="polite">{loading ? 'Đang đồng bộ từ ERP…' : error || `Đã đồng bộ ${metrics.open} việc đang mở.`}</div>
      {error && <div className={styles.error} role="alert"><span>{error}</span><button className="btn btn-outline" onClick={load}>Thử lại</button></div>}

      {estimateTask && <EstimatePanel key={`${estimateTask.id}:${estimateTask.workVersion}`} task={estimateTask} busy={busyId === estimateTask.id} onClose={() => setEstimateTask(null)} onSave={saveEstimate} />}

      {!error && (
        <section className={styles.board} aria-label="Các cục việc đang mở">
          {displayed.map((task, index) => (
            <TaskBlock key={task.id} task={task} index={index} count={displayed.length} today={today}
              busy={busyId === task.id || sortingByDeadline} dragState={dragState}
              onDragStart={(t, i) => setDragState({ dragId: t.id, dragIndex: i, overId: null })}
              onDragOver={(t) => setDragState((s) => s.overId === t.id ? s : { ...s, overId: t.id })}
              onDrop={onDrop}
              onDragEnd={() => setDragState({ dragId: null, dragIndex: -1, overId: null })}
              onNudge={(t, from, to) => reorder(t, from, to)}
              onTransition={transition} onEstimate={setEstimateTask} />
          ))}
          {!loading && !displayed.length && <p className={styles.empty}>Hôm nay bạn rảnh 🎉 — không có việc nào đang mở.</p>}
        </section>
      )}

      {!error && completed.length > 0 && (
        <section className={styles.doneStrip} aria-label="Đã xong gần đây">
          <h2><Icon name="check" size={15} /> Đã xong gần đây</h2>
          <div>
            {completed.slice(0, 8).map((task) => <span key={task.id} className={styles.doneItem}>{task.title}</span>)}
          </div>
        </section>
      )}

      <section className={styles.intelligenceSummary} aria-labelledby="resource-intelligence-summary">
        <div>
          <p className={styles.eyebrow}>Resource Intelligence · shadow mode</p>
          <h2 id="resource-intelligence-summary">Estimate ≠ TimeLog ≠ Historical</h2>
          <p>TimeLog hiện là dữ liệu tự khai báo, không phải quan sát tuyệt đối. Chỉ đưa cảnh báo có giải thích; không dùng làm điểm hiệu suất. Bấm ⏱ trên cục việc để Cập nhật estimate.</p>
        </div>
        <dl>
          <div><dt>Thiếu estimate</dt><dd>{intelligence.estimateMissing}</dd></div>
          <div><dt>Cần xem lại</dt><dd>{intelligence.attention}</dd></div>
          <div><dt>Baseline đủ mẫu</dt><dd>{intelligence.baselineReady}</dd></div>
          <div><dt>TimeLog tự khai báo</dt><dd>{hours(intelligence.declaredLoggedHours)}</dd></div>
        </dl>
      </section>

      <section className={styles.approvals} aria-labelledby="my-approvals-title">
        <div><h2 id="my-approvals-title">Phê duyệt cần xử lý</h2><p>Luồng phê duyệt vẫn dùng nguyên module ERP hiện có.</p></div>
        <strong>{toApprove.length}</strong>
        <Link className="btn btn-outline" href="/approvals">Mở phê duyệt</Link>
      </section>
    </div>
  );
}
