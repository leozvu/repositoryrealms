'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Avatar, useToast } from '@/components/ui';
import PageHeader from '@/components/system/PageHeader';
import StatePanel from '@/components/system/StatePanel';
import ReceiptBar from '@/components/system/ReceiptBar';
import { createExecutionIdempotencyKey } from '@/lib/execution-client';
import styles from './team-work.module.css';

const OPEN = new Set(['todo', 'doing', 'in_progress', 'review', 'waiting', 'blocked']);
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
  return Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

function IntelligenceBadge({ value }) {
  if (!value) return null;
  return (
    <div className={styles.intelligence} data-level={value.signal.level}>
      <span><strong>{value.signal.label}</strong> · {value.confidence.label}</span>
      <span>Ước lượng {value.estimate.hours ? `${hours(value.estimate.hours)}h` : 'Chưa có'} · Thời gian khai báo {hours(value.actual.hours)}h · Lịch sử {value.historical.medianHours == null ? 'Chưa đủ' : `${hours(value.historical.medianHours)}h/${value.historical.sampleSize} mẫu`}</span>
      <small>{value.signal.explanation}</small>
    </div>
  );
}

function TaskRow({ task, row, index, count, busy, onMove, onSelect, onUnblock, drag, setDrag }) {
  // Feedback AIm 07/2026: cấp trên kéo thả đổi thẳng vị trí việc của nhân viên
  // (bổ sung cho nút Lên/Xuống — cả hai cùng gọi task.reprioritize).
  const draggable = OPEN.has(task.status) && !busy;
  const isDragging = drag?.task?.id === task.id;
  const isOver = drag && drag.memberId === row.member.id && drag.task.id !== task.id && drag.overId === task.id;
  return (
    <article className={styles.task} data-state={task.status} data-dragging={isDragging || undefined} data-over={isOver || undefined}
      onDragOver={e => { if (drag && drag.memberId === row.member.id && drag.task.id !== task.id) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (drag.overId !== task.id) setDrag({ ...drag, overId: task.id }); } }}
      onDrop={e => { e.preventDefault(); if (drag && drag.memberId === row.member.id && drag.task.id !== task.id) onMove(drag.task, row, index); setDrag(null); }}
      onDragEnd={() => setDrag(null)}>
      <div
        className={styles.taskOrder}
        aria-label={`Ưu tiên ${index + 1}. Có thể kéo để đổi vị trí.`}
        draggable={draggable}
        title="Kéo để đổi thứ tự"
        onDragStart={e => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', task.id);
          setDrag({ memberId: row.member.id, task, index, overId: null });
        }}
      ><strong>{index + 1}</strong></div>
      <div className={styles.taskBody}>
        <div className={styles.taskTitle}><h4>{task.title}</h4><span>{STATUS[task.status] || task.status}</span></div>
        <p>{task.project?.name || 'Việc chung'} · {task.estHours || 0}h dự kiến · Version {task.workVersion}</p>
        {task.blockReason && <p className={styles.blockReason}>Blocker: {task.blockReason}</p>}
        <IntelligenceBadge value={task.intelligence} />
      </div>
      <div className={styles.taskActions} draggable={false} onDragStart={(event) => event.stopPropagation()}>
        {OPEN.has(task.status) && <>
          <button type="button" draggable={false} className="btn btn-outline btn-sm" disabled={busy || index === 0} onClick={() => onMove(task, row, index - 1)} aria-label={`Đưa ${task.title} lên một vị trí`}>Lên</button>
          <button type="button" draggable={false} className="btn btn-outline btn-sm" disabled={busy || index === count - 1} onClick={() => onMove(task, row, index + 1)} aria-label={`Đưa ${task.title} xuống một vị trí`}>Xuống</button>
        </>}
        {task.status === 'blocked' && <button type="button" draggable={false} className="btn btn-outline btn-sm" disabled={busy} onClick={() => onUnblock(task)}>Gỡ chặn</button>}
        {OPEN.has(task.status) && <button type="button" draggable={false} className="btn btn-primary btn-sm" disabled={busy} onClick={() => onSelect(task)}>Điều phối</button>}
      </div>
    </article>
  );
}

function ActionPanel({ task, members, allTasks, busy, onClose, onAction }) {
  const panelRef = useRef(null);
  const [assigneeId, setAssigneeId] = useState(task.assigneeId || '');
  const [reasonCode, setReasonCode] = useState('dependency');
  const [reason, setReason] = useState('');
  const [level, setLevel] = useState(Math.min(3, (task.escalationLevel || 0) + 1));
  const [children, setChildren] = useState('Đầu việc 1\nĐầu việc 2');
  const [mergeIds, setMergeIds] = useState([]);
  const [mergeTitle, setMergeTitle] = useState(task.title);
  const [estimateHours, setEstimateHours] = useState(task.estHours || 1);
  const [workType, setWorkType] = useState(task.workType || 'other');
  const [complexity, setComplexity] = useState(task.complexity || 'unknown');
  const [estimateReason, setEstimateReason] = useState('scope_change');
  const [estimateNote, setEstimateNote] = useState('');
  const mergeCandidates = allTasks.filter((candidate) => candidate.id !== task.id
    && OPEN.has(candidate.status)
    && candidate.assigneeId === task.assigneeId
    && candidate.projectId === task.projectId);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    panel.focus({ preventScroll: true });
  }, []);

  const delegate = () => onAction({
    action: 'task.assign', entityId: task.id,
    expectedAssigneeId: task.assigneeId || null, assigneeId,
    expectedDueDate: task.dueDate || null, dueDate: task.dueDate || null,
    expectedPriority: task.priority, priority: task.priority,
  });
  const block = () => onAction({ action: 'task.block', entityId: task.id, expectedVersion: task.workVersion, reasonCode, reason });
  const escalate = () => onAction({ action: 'task.escalate', entityId: task.id, expectedVersion: task.workVersion, level, reasonCode, reason });
  const split = () => onAction({
    action: 'task.split', entityId: task.id, expectedVersion: task.workVersion,
    children: children.split('\n').map((title) => title.trim()).filter(Boolean).map((title) => ({ title, estHours: 0 })),
  });
  const merge = () => {
    const sourceTaskIds = [task.id, ...mergeIds];
    const expectedVersions = Object.fromEntries(allTasks.filter((candidate) => sourceTaskIds.includes(candidate.id)).map((candidate) => [candidate.id, candidate.workVersion]));
    return onAction({ action: 'task.merge', entityId: task.id, expectedVersion: task.workVersion, sourceTaskIds, expectedVersions, title: mergeTitle });
  };
  const adjustEstimate = () => onAction({
    action: 'task.estimate', entityId: task.id, expectedVersion: task.workVersion,
    estimateKind: 'manager_adjustment', estimateHours: Number(estimateHours), workType, complexity,
    reasonCode: estimateReason, note: estimateNote,
  });

  return (
    <section ref={panelRef} className={styles.actionPanel} role="dialog" aria-modal="false" aria-labelledby="execution-action-title" tabIndex={-1}>
      <div className={styles.panelHead}>
        <div><p className={styles.eyebrow}>Thao tác quản lý</p><h2 id="execution-action-title">Điều phối: {task.title}</h2></div>
        <button className="icon-btn" onClick={onClose} aria-label="Đóng bảng điều phối"><Icon name="x" size={18} /></button>
      </div>
      <p className={styles.panelNote}>Mỗi thao tác bên dưới đi qua RepositoryRealms, kiểm tra quyền, business rule, receipt và audit trước khi đổi Task ERP.</p>
      <div className={styles.actionGrid}>
        <fieldset>
          <legend>Ủy quyền</legend>
          <label htmlFor="execution-assignee">Người phụ trách</label>
          <select id="execution-assignee" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
            <option value="">Chọn nhân sự</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
          <button className="btn btn-primary" disabled={busy || !assigneeId || assigneeId === task.assigneeId} onClick={delegate}>Giao việc</button>
        </fieldset>
        <fieldset>
          <legend>Trở ngại và nâng cấp xử lý</legend>
          <label htmlFor="execution-reason-code">Nhóm lý do</label>
          <select id="execution-reason-code" value={reasonCode} onChange={(event) => setReasonCode(event.target.value)}>
            <option value="dependency">Phụ thuộc</option><option value="decision">Cần quyết định</option><option value="capacity">Thiếu năng lực xử lý</option><option value="external">Yếu tố bên ngoài</option>
          </select>
          <label htmlFor="execution-reason">Mô tả</label>
          <textarea id="execution-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={240} placeholder="Nêu rõ điều đang cản trở và hỗ trợ cần thiết" />
          <div className={styles.inlineActions}>
            {task.status !== 'blocked' && <button className="btn btn-outline" disabled={busy || !reason.trim()} onClick={block}>Đánh dấu bị chặn</button>}
            <select aria-label="Mức escalation" value={level} onChange={(event) => setLevel(Number(event.target.value))}>
              {[1, 2, 3].filter((value) => value > (task.escalationLevel || 0)).map((value) => <option key={value} value={value}>Level {value}</option>)}
            </select>
            <button className="btn btn-outline" disabled={busy || !reason.trim() || level <= (task.escalationLevel || 0)} onClick={escalate}>Nâng cấp xử lý</button>
          </div>
        </fieldset>
        <fieldset>
          <legend>Tách công việc</legend>
          <label htmlFor="execution-children">Mỗi dòng là một Task con (2–10)</label>
          <textarea id="execution-children" value={children} onChange={(event) => setChildren(event.target.value)} />
          <button className="btn btn-outline" disabled={busy || children.split('\n').filter((line) => line.trim()).length < 2} onClick={split}>Tách Task</button>
        </fieldset>
        <fieldset>
          <legend>Hợp nhất công việc</legend>
          <label htmlFor="execution-merge-title">Tên Task mới</label>
          <input id="execution-merge-title" value={mergeTitle} onChange={(event) => setMergeTitle(event.target.value)} maxLength={180} />
          <div className={styles.checkList}>
            {mergeCandidates.map((candidate) => <label key={candidate.id}><input type="checkbox" checked={mergeIds.includes(candidate.id)} onChange={(event) => setMergeIds((current) => event.target.checked ? [...current, candidate.id] : current.filter((id) => id !== candidate.id))} /> <span>{candidate.title}</span></label>)}
            {!mergeCandidates.length && <p>Không có Task cùng dự án và người phụ trách để merge.</p>}
          </div>
          <button className="btn btn-outline" disabled={busy || !mergeTitle.trim() || !mergeIds.length} onClick={merge}>Hợp nhất Task</button>
        </fieldset>
        <fieldset>
          <legend>Phân tích nguồn lực</legend>
          <p className={styles.fieldHelp}>Hiệu chỉnh của quản lý được giữ riêng khỏi thời gian khai báo và lịch sử. Đây là cảnh báo vận hành, không phải điểm nhân sự.</p>
          <label htmlFor="execution-estimate-hours">Estimate (giờ)</label>
          <input id="execution-estimate-hours" type="number" min="0.25" max="10000" step="0.25" value={estimateHours} onChange={(event) => setEstimateHours(event.target.value)} />
          <label htmlFor="execution-work-type">Nhóm công việc</label>
          <select id="execution-work-type" value={workType} onChange={(event) => setWorkType(event.target.value)}>{WORK_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
          <label htmlFor="execution-complexity">Độ phức tạp</label>
          <select id="execution-complexity" value={complexity} onChange={(event) => setComplexity(event.target.value)}>{COMPLEXITIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
          <label htmlFor="execution-estimate-reason">Nhóm lý do hiệu chỉnh</label>
          <select id="execution-estimate-reason" value={estimateReason} onChange={(event) => setEstimateReason(event.target.value)}><option value="scope_change">Scope thay đổi</option><option value="historical_variance">Đối chiếu historical</option><option value="dependency_change">Phụ thuộc thay đổi</option><option value="manager_review">Manager review</option></select>
          <label htmlFor="execution-estimate-note">Giải thích bắt buộc</label>
          <textarea id="execution-estimate-note" maxLength={500} value={estimateNote} onChange={(event) => setEstimateNote(event.target.value)} placeholder="Nêu thay đổi về scope hoặc dữ kiện khiến estimate cần hiệu chỉnh" />
          <button className="btn btn-primary" disabled={busy || Number(estimateHours) < 0.25 || !estimateNote.trim()} onClick={adjustEstimate}>Lưu hiệu chỉnh có receipt</button>
        </fieldset>
      </div>
    </section>
  );
}

export default function TeamWorkPage() {
  const toast = useToast();
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [selected, setSelected] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [actionError, setActionError] = useState('');
  const [drag, setDrag] = useState(null); // {memberId, task, index, overId} — kéo thả trong hàng đợi 1 nhân viên

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/execution/team-work', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Không thể tải Team Work.');
      setModel(body);
    } catch (requestError) {
      setError(requestError.message || 'Không thể tải Team Work.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const allTasks = useMemo(() => [
    ...(model?.members || []).flatMap((row) => row.tasks),
    ...(model?.unassigned || []),
  ], [model]);
  const members = (model?.members || []).map((row) => row.member);

  const act = async (command) => {
    setBusyId(command.entityId);
    setActionError('');
    try {
      const key = createExecutionIdempotencyKey('team-work', command.action);
      const response = await fetch('/api/execution/actions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(command),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Không thể điều phối Task.');
      toast('Task ERP đã được cập nhật và có receipt.');
      setReceipt({
        title: 'Đã cập nhật công việc',
        detail: body.action?.id ? `Biên nhận ${body.action.id}` : `Thao tác ${command.action} đã được máy chủ chấp nhận.`,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      });
      setSelected(null);
      await load();
    } catch (requestError) {
      const message = requestError.message || 'Không thể điều phối Task.';
      setActionError(message);
      toast(message, 'error');
    } finally {
      setBusyId('');
    }
  };

  const move = (task, row, targetIndex) => act({ action: 'task.reprioritize', entityId: task.id, ownerId: row.member.id, expectedQueueVersion: row.queue.version, targetIndex });
  const unblock = (task) => act({ action: 'task.unblock', entityId: task.id, expectedVersion: task.workVersion, nextStatus: 'todo' });
  const metrics = model?.metrics || { people: 0, open: 0, wip: 0, blocked: 0, overdue: 0, overCapacity: 0, unassigned: 0 };
  const intelligence = model?.resourceIntelligence || { estimateMissing: 0, baselineReady: 0, attention: 0, estimatedHours: 0, declaredLoggedHours: 0 };

  return (
    <div className={styles.page}>
      <PageHeader
        icon="people"
        meta="Công việc đội nhóm"
        title="Ngoại lệ và phân bổ công việc"
        description="Tập trung vào việc bị chặn, quá hạn, vượt giới hạn và chưa có người phụ trách. Không xếp hạng con người."
        actions={<button className="btn btn-outline" onClick={load} disabled={loading}><Icon name="repeat" size={16} /> Làm mới</button>}
      />
      <section className={styles.metrics} aria-label="Tóm tắt team">
        {[
          ['Nhân sự', metrics.people], ['Việc đang mở', metrics.open], ['WIP', metrics.wip], ['Bị chặn', metrics.blocked],
          ['Quá hạn', metrics.overdue], ['Vượt WIP', metrics.overCapacity], ['Chưa giao', metrics.unassigned],
        ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </section>
      <div className={styles.policy} role="note"><Icon name="shield" size={18} /><span>Sức chứa chỉ là cảnh báo giới hạn việc đang làm để cân bằng luồng việc, không phải điểm hiệu suất cá nhân.</span></div>
      <section className={styles.intelligenceSummary} aria-labelledby="team-resource-intelligence">
        <div><p className={styles.eyebrow}>Nguồn lực có bằng chứng</p><h2 id="team-resource-intelligence">Ước lượng và thời gian được trình bày đúng nguồn</h2><p>Thời gian làm việc vẫn được ghi rõ là tự khai báo. Mức tin cậy không được nâng cao khi chưa có bằng chứng xác thực.</p></div>
        <dl>
          <div><dt>Thiếu estimate</dt><dd>{intelligence.estimateMissing}</dd></div>
          <div><dt>Cần review</dt><dd>{intelligence.attention}</dd></div>
          <div><dt>Baseline đủ mẫu</dt><dd>{intelligence.baselineReady}</dd></div>
          <div><dt>Tổng estimate</dt><dd>{hours(intelligence.estimatedHours)}h</dd></div>
          <div><dt>TimeLog tự khai báo</dt><dd>{hours(intelligence.declaredLoggedHours)}h</dd></div>
        </dl>
      </section>
      {receipt && <ReceiptBar {...receipt} action={<button className="icon-btn" onClick={() => setReceipt(null)} aria-label="Đóng biên nhận"><Icon name="x" size={15} /></button>} />}
      {actionError && <div className={styles.actionError} role="alert"><span>{actionError}</span><button type="button" onClick={() => setActionError('')} aria-label="Đóng thông báo lỗi"><Icon name="x" size={15} /></button></div>}
      <div className={styles.live} aria-live="polite">{loading ? 'Đang đồng bộ Task ERP…' : error || `Đã đồng bộ ${metrics.open} việc đang mở.`}</div>
      {error && <StatePanel compact state="error" title={error} action={<button className="btn btn-outline" onClick={load}>Thử lại</button>} />}
      {selected && <ActionPanel key={selected.id} task={selected} members={members} allTasks={allTasks} busy={busyId === selected.id} onClose={() => setSelected(null)} onAction={act} />}
      {!error && (model?.members || []).map((row) => {
        const openTasks = row.tasks.filter((task) => OPEN.has(task.status));
        return (
          <section key={row.member.id} className={styles.member} aria-labelledby={`member-${row.member.id}`}>
            <header className={styles.memberHead}>
              <div className={styles.identity}><Avatar className={styles.avatar} userId={row.member.id} name={row.member.name} /><div><h2 id={`member-${row.member.id}`}>{row.member.name}</h2><p>{row.member.title || row.member.realmProfile?.realmClass || 'Thành viên'}</p></div></div>
              <div className={styles.memberMetrics}><span>Open <strong>{row.metrics.open}</strong></span><span>WIP <strong>{row.metrics.wip}/{row.queue.wipLimit}</strong></span><span>Blocked <strong>{row.metrics.blocked}</strong></span><span className={styles[row.capacity.key]}>{row.capacity.label}</span></div>
            </header>
            <div className={styles.taskList}>
              {openTasks.map((task, index) => <TaskRow key={task.id} task={task} row={row} index={index} count={openTasks.length} busy={busyId === task.id} onMove={move} onSelect={setSelected} onUnblock={unblock} drag={drag} setDrag={setDrag} />)}
              {!openTasks.length && <p className={styles.empty}>Không có việc đang mở.</p>}
            </div>
          </section>
        );
      })}
      {!error && model?.unassigned?.length > 0 && <section className={styles.unassigned}>
        <h2>Chưa giao người phụ trách</h2>
        <p>{model.unassigned.length} Task đang chờ PM phân công.</p>
        <div className={styles.taskList}>
          {model.unassigned.map((task) => <article key={task.id} className={styles.task}>
            <div className={styles.taskOrder} aria-hidden="true">·</div>
            <div className={styles.taskBody}><div className={styles.taskTitle}><h4>{task.title}</h4>{task.dueDate && <span>hạn {task.dueDate}</span>}</div><p>{task.project?.name || 'Việc chung'}</p></div>
            <div className={styles.taskActions}><button className="btn btn-primary btn-sm" onClick={() => setSelected(task)}>Điều phối</button></div>
          </article>)}
        </div>
      </section>}
    </div>
  );
}
