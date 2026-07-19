'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { Icon } from '@/components/ui';
import { realmStateLabel, realmTaskTransitions } from '@/lib/realm-action-contract';
import RealmActionDialog from './RealmActionDialog';
import RealmCreateActionDialog from './RealmCreateActionDialog';
import styles from './war-room.module.css';

const HEALTH = {
  stable: { label: 'Ổn định', icon: 'check', tone: 'stable' },
  attention: { label: 'Cần gỡ blocker', icon: 'clock', tone: 'attention' },
  critical: { label: 'Có việc quá hạn', icon: 'alert', tone: 'critical' },
  completed: { label: 'Đã hoàn tất', icon: 'check', tone: 'completed' },
};

const STATUS = {
  todo: 'Chờ thực hiện',
  in_progress: 'Đang thực hiện',
  review: 'Đang review',
  blocked: 'Bị chặn',
  done: 'Hoàn tất',
};

const PRIORITY = { low: 'Thấp', medium: 'Vừa', high: 'Cao', urgent: 'Khẩn' };
const REWARD = {
  ready: 'Đủ tiêu chí · chờ ghi nhận',
  approved: 'Đã duyệt · chưa hoàn tất',
  claimed: 'Đã ghi nhận',
};

function dateLabel(value) {
  if (!value) return 'Chưa đặt hạn';
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function dateTimeLabel(value) {
  const parsed = new Date(value || '');
  return Number.isNaN(parsed.getTime()) ? 'Không rõ thời điểm' : parsed.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function EmptyState({ loading = false, error = '', selection = false, onRetry, onBack }) {
  return (
    <section className={styles.stateCard} role={error ? 'alert' : 'status'} aria-live="polite">
      <span><Icon name={loading ? 'clock' : error ? 'alert' : 'projects'} size={24} /></span>
      <div>
        <strong>{loading ? 'Đang triệu tập War Room…' : error ? 'Chưa mở được War Room' : 'Chọn chiến dịch từ Guild Hall'}</strong>
        <p>{loading ? 'Đang ghép Project, Phase, Milestone và Task trong phạm vi Guild.' : error || (selection ? 'War Room chỉ mở sau khi bạn chọn một chiến dịch được phép xem.' : 'Chiến dịch này chưa có dữ liệu vận hành.')}</p>
      </div>
      <div className={styles.stateActions}>
        {onBack && <button type="button" onClick={onBack}>Về Guild Hall</button>}
        {error && <button type="button" onClick={onRetry}><Icon name="repeat" size={15} />Thử lại</button>}
      </div>
    </section>
  );
}

function Metric({ icon, label, value, detail, tone = '' }) {
  return (
    <article className={`${styles.metric} ${tone ? styles[`metric_${tone}`] : ''}`}>
      <span><Icon name={icon} size={18} /></span>
      <small>{label}</small><strong>{value}</strong><p>{detail}</p>
    </article>
  );
}

function TaskCard({ task, onOpen, onTransition, onComment }) {
  const transitions = task.canTransition ? realmTaskTransitions(task.status) : [];
  return (
    <article className={`${styles.task} ${task.overdue ? styles.taskOverdue : ''}`}>
      <header>
        <span className={`${styles.status} ${styles[`status_${task.lane}`]}`}>{STATUS[task.status] || STATUS.todo}</span>
        <span className={`${styles.priority} ${styles[`priority_${task.priority}`]}`}>{PRIORITY[task.priority] || PRIORITY.medium}</span>
      </header>
      <h4>{task.title}</h4>
      <p><Icon name="staff" size={14} />{task.assignee.name}</p>
      <div className={styles.taskMeta}>
        <span className={task.overdue ? styles.overdue : ''}><Icon name="calendar" size={14} />{task.dueLabel || dateLabel(task.dueDate)}</span>
        {task.checklistTotal > 0 && <span><Icon name="tasks" size={14} />{task.checklistDone}/{task.checklistTotal} tiêu chí</span>}
      </div>
      {task.blockers.length > 0 && <div className={styles.taskBlocker}><Icon name="alert" size={14} /><span>Chờ: {task.blockers.join(', ')}</span></div>}
      {REWARD[task.rewardGate] && <div className={`${styles.rewardGate} ${styles[`reward_${task.rewardGate}`]}`}><Icon name={task.rewardGate === 'claimed' ? 'check' : 'shield'} size={14} />{REWARD[task.rewardGate]}</div>}
      {task.comments?.length > 0 && <details className={styles.timeline}>
        <summary><Icon name="messages" size={14} /><span>War Council gần đây</span><b>{task.comments.length}</b></summary>
        <ol>
          {task.comments.map((comment) => <li key={comment.id}>
            <div><strong>{comment.author}</strong><time dateTime={comment.createdAt || undefined}>{dateTimeLabel(comment.createdAt)}</time></div>
            <p>{comment.content}</p>
          </li>)}
        </ol>
      </details>}
      {transitions.length > 0 && <div className={styles.taskActions} aria-label={`Cập nhật ${task.title}`}>
        {transitions.map((nextState) => <button type="button" key={nextState} onClick={() => onTransition(task, nextState)}>{realmStateLabel(nextState)}</button>)}
      </div>}
      {task.canComment && onComment && <button type="button" className={styles.commentTask} onClick={() => onComment(task)}><Icon name="messages" size={14} />Ghi chú War Council</button>}
      {onOpen && <button type="button" className={styles.openTask} onClick={() => onOpen(task)}><Icon name="tasks" size={14} />Mở Task ERP</button>}
    </article>
  );
}

export default function WarRoom({
  operationsSource = 'local',
  projectId,
  localDashboard,
  compact = false,
  onBack,
  onOpenProject,
  onOpenTask,
  dataRevision = 0,
}) {
  const titleId = useId();
  const [dashboard, setDashboard] = useState(localDashboard || null);
  const [loading, setLoading] = useState(operationsSource === 'erp' && Boolean(projectId));
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [pendingAction, setPendingAction] = useState(null);
  const [pendingCreate, setPendingCreate] = useState(null);
  const retry = useCallback(() => setRevision((value) => value + 1), []);
  const transitionTask = useCallback((task, nextState) => setPendingAction({
    action: 'task.transition', entityId: task.id, expectedState: task.status, nextState,
    recordType: 'Quest', recordLabel: task.title,
  }), []);
  const commentTask = useCallback((task) => setPendingCreate({
    action: 'task.comment.create', entityId: task.id, recordLabel: task.title,
  }), []);

  useEffect(() => {
    if (operationsSource !== 'erp') {
      setDashboard(localDashboard || null);
      setLoading(false);
      setError('');
      return undefined;
    }
    if (!projectId) {
      setDashboard(null);
      setLoading(false);
      setError('');
      return undefined;
    }
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 6500);
    setLoading(true);
    setError('');
    fetch(`/api/realm-demo/war-room?projectId=${encodeURIComponent(projectId)}`, {
      cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Không thể tải War Room.');
        if (payload?.source !== 'erp' || !payload?.campaign || !Array.isArray(payload?.phases)) throw new Error('ERP trả về War Room không hợp lệ.');
        if (active) setDashboard(payload);
      })
      .catch((requestError) => {
        if (active) setError(requestError.name === 'AbortError' ? 'ERP phản hồi quá lâu. Hãy thử lại.' : requestError.message);
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [dataRevision, localDashboard, operationsSource, projectId, revision]);

  if (operationsSource === 'erp' && !projectId) return <EmptyState selection onBack={onBack} />;
  if (loading) return <EmptyState loading onBack={onBack} />;
  if (error) return <EmptyState error={error} onRetry={retry} onBack={onBack} />;
  if (!dashboard) return <EmptyState onBack={onBack} />;

  const { campaign, metrics, phases, milestones, blockers, focus, source, permissions } = dashboard;
  const health = HEALTH[campaign.health] || HEALTH.attention;
  return (
    <section className={`${styles.warRoom} ${compact ? styles.compact : ''}`} aria-labelledby={titleId}>
      <header className={styles.hero}>
        <div className={styles.heroActions}>
          {onBack && <button type="button" onClick={onBack} aria-label="Về Guild Hall"><Icon name="repeat" size={16} />Guild Hall</button>}
          <span className={styles.crest}><Icon name="projects" size={26} /></span>
        </div>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>War Room · Campaign Operations</span>
          <h2 id={titleId}>{campaign.name}</h2>
          <p>Điều phối: {campaign.owner} · Hạn chiến dịch: {dateLabel(campaign.deadline)}</p>
        </div>
        <div className={styles.heroBadges}>
          <span className={`${styles.health} ${styles[`health_${health.tone}`]}`}><Icon name={health.icon} size={14} />{health.label}</span>
          <span className={`${styles.source} ${source === 'erp' ? styles.sourceLive : ''}`}>{source === 'erp' ? permissions?.readOnly ? 'ERP live · chỉ đọc' : 'ERP live · command bridge' : 'Demo cục bộ'}</span>
        </div>
      </header>

      <section className={styles.progressPanel} aria-label="Tiến độ chiến dịch">
        <div><span>Campaign progress</span><strong>{metrics.completionPercent}%</strong></div>
        <div className={styles.progress} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={metrics.completionPercent} aria-label={`Tiến độ ${campaign.name}`}><i style={{ width: `${metrics.completionPercent}%` }} /></div>
        <p><Icon name="shield" size={16} />{focus}</p>
      </section>

      <div className={styles.metrics} aria-label="Chỉ số vận hành chiến dịch">
        <Metric icon="tasks" label="Quest hoàn tất" value={`${metrics.doneTasks}/${metrics.totalTasks}`} detail={`${metrics.activeTasks} đang vận hành`} />
        <Metric icon="alert" label="Blocker" value={metrics.blockedTasks} detail={metrics.blockedTasks ? 'Cần Guild phối hợp' : 'Luồng đang thông'} tone={metrics.blockedTasks ? 'warning' : ''} />
        <Metric icon="clock" label="Quá hạn" value={metrics.overdueTasks} detail={metrics.overdueTasks ? 'Ưu tiên xử lý' : 'Trong kế hoạch'} tone={metrics.overdueTasks ? 'danger' : ''} />
        <Metric icon="calendar" label="Milestone" value={`${metrics.milestonesComplete}/${metrics.milestonesTotal}`} detail="Mốc chiến dịch" />
      </div>

      <div className={styles.workspace}>
        <section className={styles.board} aria-labelledby={`${titleId}-board`}>
          <header className={styles.panelHead}><div><span>Operational lanes</span><h3 id={`${titleId}-board`}>Bản đồ chiến dịch</h3></div><small>Phase và Task từ cùng nguồn ERP</small></header>
          <div className={styles.phases}>
            {phases.map((phase) => (
              <section className={styles.phase} key={phase.id} style={{ '--phase-color': phase.color }}>
                <header><i /><strong>{phase.name}</strong><span>{phase.tasks.length}</span></header>
                <div>{phase.tasks.length ? phase.tasks.map((task) => <TaskCard task={task} key={task.id} onOpen={source === 'erp' ? onOpenTask : undefined} onTransition={source === 'erp' ? transitionTask : undefined} onComment={source === 'erp' ? commentTask : undefined} />) : <p className={styles.empty}>Chưa có Quest trong phase này.</p>}</div>
              </section>
            ))}
          </div>
        </section>

        <aside className={styles.sideColumn}>
          <section className={styles.sidePanel} aria-labelledby={`${titleId}-milestones`}>
            <header className={styles.panelHead}><div><span>Campaign path</span><h3 id={`${titleId}-milestones`}>Milestone</h3></div></header>
            <ol className={styles.timeline}>
              {milestones.length ? milestones.map((milestone) => <li key={milestone.id} className={milestone.done ? styles.milestoneDone : milestone.overdue ? styles.milestoneOverdue : ''}><i><Icon name={milestone.done ? 'check' : milestone.overdue ? 'alert' : 'clock'} size={13} /></i><div><strong>{milestone.name}</strong><span>{dateLabel(milestone.date)}</span></div></li>) : <li className={styles.empty}>Chưa đặt milestone.</li>}
            </ol>
          </section>
          <section className={styles.sidePanel} aria-labelledby={`${titleId}-blockers`}>
            <header className={styles.panelHead}><div><span>Attention queue</span><h3 id={`${titleId}-blockers`}>Blocker cần gỡ</h3></div></header>
            <div className={styles.blockerList}>
              {blockers.length ? blockers.map((blocker) => <article key={blocker.taskId}><Icon name="alert" size={16} /><div><strong>{blocker.task}</strong><p>{blocker.reasons.join(' · ')}</p><small>Phụ trách: {blocker.assignee}</small></div></article>) : <p className={styles.empty}>Không có blocker đang mở.</p>}
            </div>
          </section>
          {source === 'erp' && onOpenProject && <button type="button" className={styles.openProject} onClick={onOpenProject}><Icon name="projects" size={16} />Mở Project trong ERP</button>}
        </aside>
      </div>

      {!compact && <aside className={styles.governance}><Icon name="shield" size={18} /><div><strong>War Room điều phối công việc, không chấm điểm con người</strong><p>Chuyển trạng thái và War Council note đều ghi vào đúng Task ERP; quyền theo dòng, dependency, chống ghi đè, notification và audit vẫn do ERP quyết định. Không hiển thị Gold theo cá nhân hoặc xếp hạng hiệu suất.</p></div></aside>}
      <RealmActionDialog command={pendingAction} onClose={() => setPendingAction(null)} onComplete={() => { setPendingAction(null); retry(); }} />
      <RealmCreateActionDialog command={pendingCreate} onClose={() => setPendingCreate(null)} onComplete={() => { setPendingCreate(null); retry(); }} />
    </section>
  );
}
