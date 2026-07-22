'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useResource, Icon, FormModal, ConfirmDialog, EmptyState, Badge, useToast } from '@/components/ui';
import { DocLinks } from '@/components/DocLinks';
import { moneyShort, fmtDate, todayISO, BADGE } from '@/lib/format';
import { hasAny } from '@/lib/perm';
import styles from './project-execution-health.module.css';

const PHASE_COLORS = ['#2563EB', '#7C3AED', '#059669', '#D97706', '#DB2777', '#0891B2'];
const HEALTH_LABEL = { red: 'Rủi ro', amber: 'Cần chú ý', green: 'Ổn định' };

function hours(value) {
  return Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
}

function Metric({ label, value, detail, tone = 'neutral' }) {
  return (
    <article className={styles.metric} data-tone={tone}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </article>
  );
}

function Progress({ value, label }) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className={styles.progress} role="progressbar" aria-label={label} aria-valuemin="0" aria-valuemax="100" aria-valuenow={safe}>
      <span style={{ width: `${safe}%` }} />
    </div>
  );
}

function HealthBadge({ level }) {
  return <span className={styles.healthBadge} data-level={level}><span aria-hidden="true" />{HEALTH_LABEL[level] || 'Chưa rõ'}</span>;
}

export default function ProjectDetailPage() {
  const { id } = useParams();
  const { data: session } = useSession();
  const isMgmt = hasAny(session?.user, ['PM', 'LEAD']);
  const projects = useResource('projects');
  const tasks = useResource('tasks');
  const phases = useResource('phases');
  const users = useResource('users');
  const [data, setData] = useState(null);
  const [loadingHealth, setLoadingHealth] = useState(true);
  const [healthError, setHealthError] = useState('');
  const [modal, setModal] = useState(null);
  const toast = useToast();

  const loadHealth = useCallback(async () => {
    setLoadingHealth(true);
    setHealthError('');
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(id)}/execution-health`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || 'Không thể tải Execution Health.');
      setData(body);
    } catch (error) {
      setHealthError(error.message || 'Không thể tải Execution Health.');
    } finally {
      setLoadingHealth(false);
    }
  }, [id]);

  useEffect(() => { loadHealth(); }, [loadHealth, tasks.rows.length, phases.rows.length]);

  const project = projects.rows.find((row) => row.id === id);
  const myPhases = useMemo(() => phases.rows.filter((phase) => phase.projectId === id).sort((a, b) => a.order - b.order), [phases.rows, id]);
  const myTasks = useMemo(() => tasks.rows.filter((task) => task.projectId === id), [tasks.rows, id]);
  const noPhase = myTasks.filter((task) => !task.phaseId || !myPhases.some((phase) => phase.id === task.phaseId));
  const health = data?.executionHealth;

  if (projects.loading) return null;
  if (!project) return <EmptyState title="Không tìm thấy dự án" />;

  const userName = (userId) => users.rows.find((user) => user.id === userId)?.name || '—';
  const addPhase = async (name) => {
    if (!name?.trim()) return;
    await phases.create({ projectId: id, name: name.trim(), order: myPhases.length, color: PHASE_COLORS[myPhases.length % PHASE_COLORS.length] });
    toast('Đã thêm giai đoạn');
    await loadHealth();
  };
  const moveTask = async (task, phaseId) => {
    await tasks.update(task.id, { phaseId: phaseId || null });
    await loadHealth();
  };

  const TaskRow = ({ task }) => {
    const late = task.status !== 'done' && task.dueDate && task.dueDate < todayISO();
    return (
      <div className={styles.taskRow}>
        <span className={styles.taskState} data-status={task.status} aria-hidden="true" />
        <div>
          <strong data-complete={task.status === 'done'}>{task.title}</strong>
          <small>{userName(task.assigneeId)}{task.estHours ? ` · ${task.estHours}h estimate` : ''}{task.dueDate ? ` · hạn ${fmtDate(task.dueDate)}` : ''}{late ? ' · Trễ' : ''}</small>
        </div>
        <Badge map="task" k={task.status} />
        {isMgmt && (
          <select value={task.phaseId && myPhases.some((phase) => phase.id === task.phaseId) ? task.phaseId : ''}
            onChange={(event) => moveTask(task, event.target.value)} aria-label={`Chuyển giai đoạn cho ${task.title}`}>
            <option value="">Chưa xếp</option>
            {myPhases.map((phase) => <option key={phase.id} value={phase.id}>{phase.name}</option>)}
          </select>
        )}
      </div>
    );
  };

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <Link href="/projects" className={styles.backLink}>Dự án /</Link>
          <p>Project Execution Health</p>
          <h1>{project.name}</h1>
          <div className={styles.heroMeta}>
            <HealthBadge level={health?.health?.level} />
            <Badge map="project" k={project.status} />
            <span>{data?.project?.clientName || 'Chưa có khách hàng'} · {project.service || 'Chưa phân loại dịch vụ'}</span>
          </div>
        </div>
        <div className={styles.heroActions}>
          <Link href="/tasks" className="btn btn-outline">Mở bảng công việc</Link>
          <button className="btn btn-outline" onClick={loadHealth} disabled={loadingHealth}>Làm mới health</button>
        </div>
      </header>

      <div className={styles.live} aria-live="polite">
        {loadingHealth ? 'Đang tổng hợp Task, TimeLog, dependency và WIP…'
          : healthError || `Snapshot ${new Date(data.generatedAt).toLocaleString('vi-VN')} · ${data.source}`}
      </div>
      {healthError && <div className={styles.error} role="alert"><span>{healthError}</span><button className="btn btn-outline" onClick={loadHealth}>Thử lại</button></div>}

      {health && <>
        <section className={styles.metrics} aria-label="Chỉ số Project Execution Health">
          <Metric label="Delivery risk" value={health.health.label} tone={health.health.level}
            detail={`${health.health.confidence.label} · ceiling ${health.health.confidence.ceiling}`} />
          <Metric label="Tiến độ có trọng số" value={`${health.progress.percent}%`}
            detail={`${health.progress.completed}/${health.progress.total} Task · ${health.progress.basis === 'task_estimate' ? 'theo estimate' : 'theo số Task'}`} />
          <Metric label="Blocker / dependency" value={`${health.delivery.blocked} / ${health.delivery.unresolvedDependencies}`}
            detail={`${health.delivery.overdue} Task trễ · ${health.delivery.overdueMilestones} milestone trễ`}
            tone={health.delivery.blocked ? 'red' : health.delivery.unresolvedDependencies ? 'amber' : 'green'} />
          <Metric label="Capacity" value={`${health.capacity.constrainedMembers} vượt WIP`}
            detail={`${health.capacity.assignedMembers} nguồn lực · đơn vị WIP, không phải performance`} tone={health.capacity.constrainedMembers ? 'amber' : 'green'} />
          <Metric label="Resource burn" value={`${hours(health.resource.declaredLoggedHours)}h`}
            detail={`${hours(health.resource.estimateHours)}h estimate · ${health.resource.burnVsBudgetPercent ?? '—'}% budget giờ`} />
          <Metric label="Estimate coverage" value={`${health.resource.estimateCoveragePercent ?? 0}%`}
            detail={`${health.resource.managerValidatedEstimates} manager-validated · ${health.resource.classifiedTasks} đã phân loại`} />
        </section>

        <section className={styles.dashboardGrid}>
          <article className={styles.panel} aria-labelledby="project-risk-signals">
            <div className={styles.panelHead}><div><p>Delivery risk</p><h2 id="project-risk-signals">Tín hiệu cần quyết định</h2></div><HealthBadge level={health.health.level} /></div>
            <div className={styles.signalList}>
              {health.health.signals.map((signal) => (
                <div key={signal.id} className={styles.signal} data-level={signal.level}>
                  <span aria-hidden="true" />
                  <div><strong>{signal.label}</strong><p>{signal.explanation}</p><small>Nguồn: {signal.source}</small></div>
                </div>
              ))}
            </div>
          </article>

          <article className={styles.panel} aria-labelledby="project-resource-burn">
            <div className={styles.panelHead}><div><p>Resource</p><h2 id="project-resource-burn">Estimate ≠ TimeLog</h2></div></div>
            <dl className={styles.definitionGrid}>
              <div><dt>Estimate đang mở</dt><dd>{hours(health.resource.openEstimateHours)}h</dd></div>
              <div><dt>Còn lại theo estimate</dt><dd>{hours(health.resource.remainingEstimateHours)}h</dd></div>
              <div><dt>TimeLog tự khai báo</dt><dd>{hours(health.resource.declaredLoggedHours)}h</dd></div>
              <div><dt>Burn / estimate</dt><dd>{health.resource.burnVsEstimatePercent ?? '—'}%</dd></div>
            </dl>
            <div className={styles.provenance} role="note"><Icon name="shield" size={17} /><span>Actual source: <b>{health.resource.actualSource}</b>. Đây không phải observed truth và không dùng cho Gold, payroll hay xếp hạng.</span></div>
          </article>
        </section>

        <section className={styles.dashboardGrid}>
          <article className={styles.panel} aria-labelledby="project-capacity">
            <div className={styles.panelHead}><div><p>Capacity</p><h2 id="project-capacity">Nguồn lực theo WIP</h2></div><small>Thứ tự alphabet, không ranking</small></div>
            {health.capacity.members.length ? <div className={styles.capacityList}>
              {health.capacity.members.map((member) => (
                <div key={member.userId} className={styles.capacityRow}>
                  <div><strong>{member.name}</strong><small>{member.title || 'Thành viên dự án'} · {member.projectOpenTasks} Task dự án</small></div>
                  <div><span className={styles.capacityBand} data-band={member.band}>{member.label}</span><small>WIP {member.globalWip}/{member.wipLimit} · còn {hours(member.projectRemainingEstimateHours)}h estimate</small></div>
                </div>
              ))}
            </div> : <p className={styles.empty}>Chưa có Task đang mở được gán cho nhân sự.</p>}
          </article>

          <article className={styles.panel} aria-labelledby="project-flow-blockers">
            <div className={styles.panelHead}><div><p>Flow</p><h2 id="project-flow-blockers">Blocker &amp; dependency</h2></div></div>
            {!health.blockers.length && !health.dependencies.length && <p className={styles.empty}>Không có blocker hoặc dependency chưa hoàn tất trong snapshot này.</p>}
            {health.blockers.map((blocker) => <div key={blocker.id} className={styles.flowRow}><strong>{blocker.title}</strong><span>Blocked · {blocker.assigneeName}</span><small>{blocker.reason}</small></div>)}
            {health.dependencies.map((dependency) => <div key={`${dependency.taskId}:${dependency.dependsOnId}`} className={styles.flowRow}><strong>{dependency.taskTitle}</strong><span>đang chờ {dependency.dependsOnTitle}</span><small>Dependency status: {dependency.dependsOnStatus}</small></div>)}
          </article>
        </section>

        <section className={styles.panel} aria-labelledby="project-phase-health">
          <div className={styles.panelHead}><div><p>Execution map</p><h2 id="project-phase-health">Health theo giai đoạn</h2></div></div>
          {health.phases.length ? <div className={styles.phaseGrid}>{health.phases.map((phase) => (
            <article key={phase.id} className={styles.phaseHealth} data-level={phase.level}>
              <div><strong>{phase.name}</strong><span>{phase.progress.percent}%</span></div>
              <Progress value={phase.progress.percent} label={`Tiến độ ${phase.name}`} />
              <small>{phase.progress.completed}/{phase.progress.total} Task · {hours(phase.declaredLoggedHours)}h TimeLog / {hours(phase.estimateHours)}h estimate</small>
              <small>{phase.blocked} blocked · {phase.unresolvedDependencies} dependency</small>
            </article>
          ))}</div> : <p className={styles.empty}>Chưa có phase. Project vẫn hiển thị health tổng hợp từ Task hiện hữu.</p>}
        </section>

        {data.canSeeMoney && health.financial && <section className={styles.financePanel} aria-labelledby="project-finance-proxy">
          <div className={styles.panelHead}><div><p>Finance bridge · provisional</p><h2 id="project-finance-proxy">Planning margin proxy</h2></div><span>Không phải accounting profit</span></div>
          <div className={styles.financeGrid}>
            <Metric label="Revenue target" value={moneyShort(health.financial.revenueTarget)} detail="Nguồn: Project.budget" />
            <Metric label="Đã xuất invoice" value={moneyShort(health.financial.invoiced)} detail={`Đã thu ${moneyShort(health.financial.collected)}`} />
            <Metric label="Planning cost proxy" value={moneyShort(health.financial.planningCostProxy)} detail={`Labor ${moneyShort(health.financial.laborAccrued)} + vendor ${moneyShort(health.financial.vendorCommitted)}`} />
            <Metric label="Planning margin proxy" value={moneyShort(health.financial.planningMarginProxy)} tone={health.financial.planningMarginProxy < 0 ? 'red' : 'green'} detail="Phase 5 mới nối accounting cost thật" />
          </div>
          <p>Nguồn chi phí: {health.financial.costBasis}. Confidence: {health.financial.confidence}. Không dùng con số này để chốt báo cáo tài chính.</p>
        </section>}
      </>}

      <details className={styles.operations}>
        <summary><span>Execution drill-down</span><strong>Giai đoạn &amp; Task ({myTasks.length})</strong><small>Mở để quản lý cấu trúc hiện hữu; dashboard phía trên vẫn là lớp quyết định chính.</small></summary>
        <div className={styles.operationsBody}>
          <div className={styles.operationsToolbar}>
            <h2>Giai đoạn &amp; công việc</h2>
            {isMgmt && <button className="btn btn-outline" onClick={() => setModal({ mode: 'addphase' })}><Icon name="plus" size={15} />Thêm giai đoạn</button>}
          </div>
          {myPhases.map((phase) => {
            const rows = myTasks.filter((task) => task.phaseId === phase.id);
            return (
              <section className={styles.taskPhase} key={phase.id}>
                <div><h3><span style={{ background: phase.color || 'var(--primary)' }} aria-hidden="true" />{phase.name}</h3>
                  {isMgmt && <button className="icon-btn danger" aria-label={`Xóa giai đoạn ${phase.name}`} onClick={() => setModal({ mode: 'delphase', row: phase })}><Icon name="trash" size={15} /></button>}
                </div>
                {rows.map((task) => <TaskRow key={task.id} task={task} />)}
                {!rows.length && <p className={styles.empty}>Chưa có Task trong giai đoạn này.</p>}
              </section>
            );
          })}
          <section className={styles.taskPhase}>
            <div><h3>Chưa xếp giai đoạn ({noPhase.length})</h3></div>
            {noPhase.map((task) => <TaskRow key={task.id} task={task} />)}
            {!noPhase.length && <p className={styles.empty}>{myTasks.length ? 'Mọi Task đã được xếp phase.' : 'Chưa có Task trong dự án.'}</p>}
          </section>
        </div>
      </details>

      <section className={styles.supportGrid}>
        <article className={styles.panel}><div className={styles.panelHead}><div><p>Commitment</p><h2>Mốc dự án</h2></div></div><Milestones projectId={id} /></article>
        <article className={styles.panel}><div className={styles.panelHead}><div><p>Context</p><h2>Tài liệu</h2></div></div><div className={styles.documents}><DocLinks refType="project" refId={id} canEdit={isMgmt} /></div></article>
      </section>

      {modal?.mode === 'addphase' && <FormModal title="Thêm giai đoạn" fields={[{ key: 'name', label: 'Tên giai đoạn', required: true, full: true, placeholder: 'VD: Thiết kế' }]}
        onClose={() => setModal(null)} onSave={async (form) => addPhase(form.name)} />}
      {modal?.mode === 'delphase' && <ConfirmDialog msg={`Xóa giai đoạn "${modal.row.name}"? Task trong đó chuyển về "Chưa xếp".`}
        onClose={() => setModal(null)} onYes={async () => {
          for (const task of myTasks.filter((item) => item.phaseId === modal.row.id)) await tasks.update(task.id, { phaseId: null });
          await phases.remove(modal.row.id);
          toast('Đã xóa giai đoạn');
          await loadHealth();
        }} />}
    </main>
  );
}

function Milestones({ projectId }) {
  const milestones = useResource('milestones');
  const list = milestones.rows.filter((milestone) => milestone.projectId === projectId).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (!list.length) return <p className={styles.empty}>Chưa có milestone — thêm trên trang Gantt.</p>;
  return <div className={styles.milestones}>{list.map((milestone) => (
    <div key={milestone.id} data-complete={milestone.done}>
      <span aria-hidden="true"><Icon name={milestone.done ? 'check' : 'calendar'} size={17} /></span>
      <div><strong>{milestone.name}</strong><small>{fmtDate(milestone.date)}{milestone.note ? ` · ${milestone.note}` : ''}</small></div>
    </div>
  ))}</div>;
}
