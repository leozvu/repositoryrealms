'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Icon from './Icon';
import { Badge, Banner, Button, Panel, Segmented, SourcePill, StateView, Status } from './Primitives';
import { MetricCard } from './WorkObjects';
import styles from './realm-v2.module.css';

const PROJECT_TABS = [
  { value: 'overview', label: 'Tổng quan' },
  { value: 'work', label: 'Công việc' },
  { value: 'timeline', label: 'Tiến trình' },
  { value: 'budget', label: 'Nguồn lực' },
  { value: 'chronicle', label: 'Chronicle' },
];

const HEALTH_LABELS = { red: 'Rủi ro', amber: 'Cần chú ý', green: 'Ổn định' };
const PROJECT_STATUS = { planning: 'Lập kế hoạch', active: 'Đang chạy', paused: 'Tạm dừng', done: 'Hoàn tất', cancelled: 'Đã hủy' };

async function jsonResponse(response, fallback) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || fallback);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function formatDate(value, includeTime = false) {
  if (!value) return 'Chưa có';
  const date = new Date(!includeTime && /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('vi-VN', includeTime
    ? { dateStyle: 'short', timeStyle: 'short' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function formatNumber(value, suffix = '') {
  if (value === null || value === undefined) return '—';
  return `${Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}${suffix}`;
}

function formatMoney(value) {
  if (value === null || value === undefined) return '—';
  return `${Math.round(Number(value || 0)).toLocaleString('vi-VN')} đ`;
}

function healthTone(level) {
  return level === 'red' || level === 'critical' ? 'danger' : level === 'amber' || level === 'attention' ? 'warning' : 'success';
}

function useProjectSources() {
  const [state, setState] = useState({ loading: true, projects: [], stats: {}, canSeeMoney: false, projectError: null, statsError: null });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true }));
    const [projectResult, statsResult] = await Promise.allSettled([
      fetch('/api/data/projects', { cache: 'no-store' }).then((response) => jsonResponse(response, 'Không thể tải danh sách Project ERP.')),
      fetch('/api/projects/stats', { cache: 'no-store' }).then((response) => jsonResponse(response, 'Không thể tải Project Health.')),
    ]);
    setState((current) => ({
      loading: false,
      projects: projectResult.status === 'fulfilled' ? projectResult.value : current.projects,
      stats: statsResult.status === 'fulfilled' ? statsResult.value.stats || {} : current.stats,
      canSeeMoney: statsResult.status === 'fulfilled' ? Boolean(statsResult.value.canSeeMoney) : current.canSeeMoney,
      projectError: projectResult.status === 'rejected' ? projectResult.reason : null,
      statsError: statsResult.status === 'rejected' ? statsResult.reason : null,
    }));
  }, []);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

function ProjectSelector({ projects, stats, value, onChange }) {
  return <div className={styles.projectSelector} role="list" aria-label="Danh sách Project ERP">
    {projects.map((project) => {
      const summary = stats[project.id] || {};
      const tone = healthTone(summary.health);
      return <button key={project.id} type="button" role="listitem" className={styles.projectChoice} data-selected={value === project.id || undefined} onClick={() => onChange(project.id)}>
        <span className={styles.projectChoiceIcon}><Icon name="folder" size={17}/></span>
        <span className={styles.projectChoiceCopy}><strong>{project.name}</strong><small>{PROJECT_STATUS[project.status] || project.status || 'Chưa có trạng thái'} · {summary.progress ?? project.progress ?? 0}%</small></span>
        <Status tone={tone}>{HEALTH_LABELS[summary.health] || 'Chưa đủ dữ liệu'}</Status>
      </button>;
    })}
  </div>;
}

function ProjectOverview({ health }) {
  const signals = health.health?.signals || [];
  const phases = health.phases || [];
  const blockers = health.blockers || [];
  const members = health.capacity?.members || [];
  return <div className={styles.projectOverviewGrid}>
    <Panel title="Tín hiệu cần quyết định" description="Advisory từ Task, dependency, WIP và TimeLog; không phải chấm điểm nhân sự.">
      <div className={styles.projectSignalList}>{signals.length ? signals.map((signal) => <article className={styles.projectSignal} data-tone={healthTone(signal.level)} key={signal.id}>
        <span className={styles.projectSignalIcon}><Icon name={signal.level === 'critical' ? 'warning' : 'chart'} size={17}/></span>
        <div><strong>{signal.label}</strong><p>{signal.explanation}</p><small>Nguồn: {signal.source}</small></div>
      </article>) : <div className={styles.canonicalEmpty}><Icon name="check"/><strong>Chưa có tín hiệu rủi ro</strong><span>Snapshot hiện tại không phát hiện ngoại lệ trong các nguồn đã tổng hợp.</span></div>}</div>
    </Panel>
    <Panel title="Giai đoạn thực thi" description="Tiến độ có trọng số theo estimate khi dữ liệu đủ.">
      <div className={styles.phaseList}>{phases.length ? phases.map((phase) => <article className={styles.phaseRow} key={phase.id}>
        <header><span className={styles.phaseDot} style={{ background: phase.color || undefined }}/><strong>{phase.name}</strong><Status tone={healthTone(phase.level)}>{phase.progress}%</Status></header>
        <div className={styles.progressTrack} role="progressbar" aria-label={`Tiến độ ${phase.name}`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={phase.progress}><span className={styles.progressBar} style={{ width: `${Math.max(0, Math.min(100, phase.progress || 0))}%` }}/></div>
        <small>{formatNumber(phase.estimateHours, 'h')} estimate · {formatNumber(phase.declaredLoggedHours, 'h')} TimeLog · {phase.blocked || 0} blocker</small>
      </article>) : <div className={styles.canonicalEmpty}><Icon name="timeline"/><strong>Chưa có giai đoạn</strong><span>Tạo Phase trong Project ERP để hình thành execution plan.</span></div>}</div>
    </Panel>
    <Panel title="Blocked work" description="Chỉ Task có blocker canonical; Realm không suy đoán blocker.">
      <div className={styles.projectObjectList}>{blockers.length ? blockers.slice(0, 6).map((blocker) => <article className={styles.projectObject} key={blocker.id}>
        <span className={styles.projectObjectIcon}><Icon name="warning" size={16}/></span><div><strong>{blocker.title}</strong><p>{blocker.reason || 'Task đang bị chặn nhưng chưa ghi lý do.'}</p><small>{blocker.assigneeName || 'Chưa phân công'} · hạn {formatDate(blocker.dueDate)}</small></div>
      </article>) : <div className={styles.canonicalEmpty}><Icon name="check"/><strong>Không có Task bị chặn</strong><span>Dữ liệu được đọc từ Project Execution Health.</span></div>}</div>
    </Panel>
    <Panel title="Workload và capacity" description="Sắp theo tên; WIP chỉ dùng điều phối, không xếp hạng hiệu suất.">
      <div className={styles.capacityList}>{members.length ? [...members].sort((a, b) => a.name.localeCompare(b.name, 'vi')).map((member) => <article className={styles.capacityRow} key={member.userId}>
        <span className={styles.inboxAvatar}>{String(member.name || 'U').split(/\s+/).map((part) => part[0]).slice(-2).join('').toUpperCase()}</span>
        <div><strong>{member.name}</strong><small>{member.title || 'Nhân sự ERP'} · {formatNumber(member.projectRemainingEstimateHours, 'h')} còn lại</small></div>
        <Status tone={member.band === 'over' ? 'danger' : member.band === 'near' ? 'warning' : 'success'}>{member.globalWip}/{member.wipLimit} WIP</Status>
      </article>) : <div className={styles.canonicalEmpty}><Icon name="people"/><strong>Chưa có nguồn lực được gán</strong><span>Realm không tạo thành viên giả để lấp khoảng trống.</span></div>}</div>
    </Panel>
  </div>;
}

function ProjectWork({ health, projectId }) {
  return <div className={styles.grid}>
    <div className={`${styles.grid} ${styles.grid3}`}>
      <MetricCard label="Đang mở" value={health.delivery.open} meta="Task chưa hoàn tất" icon="checklist"/>
      <MetricCard label="Quá hạn" value={health.delivery.overdue} meta="Theo dueDate canonical" icon="clock" tone={health.delivery.overdue ? 'danger' : 'success'}/>
      <MetricCard label="Dependency chưa giải quyết" value={health.delivery.unresolvedDependencies} meta={`${health.delivery.dependencyCycles || 0} chu kỳ`} icon="link" tone={health.delivery.unresolvedDependencies ? 'warning' : 'success'}/>
    </div>
    <Panel title="Dependency map" description="Quan hệ Task được giữ nguyên từ ERP.">
      <div className={styles.projectObjectList}>{health.dependencies?.length ? health.dependencies.map((item) => <article className={styles.dependencyRow} key={`${item.taskId}:${item.dependsOnId}`}>
        <div><strong>{item.taskTitle}</strong><small>phụ thuộc</small></div><Icon name="arrow" size={16}/><div><strong>{item.dependsOnTitle}</strong><Status tone={item.dependsOnStatus === 'done' ? 'success' : 'warning'}>{item.dependsOnStatus}</Status></div>
      </article>) : <div className={styles.canonicalEmpty}><Icon name="link"/><strong>Không có dependency chưa giải quyết</strong><span>Chỉ dependency canonical được hiển thị.</span></div>}</div>
    </Panel>
    <div className={styles.threadActions}><Link className={styles.button} href={`/projects/${encodeURIComponent(projectId)}`}><Icon name="arrow" size={16}/><span>Mở Project ERP đầy đủ</span></Link><Link className={styles.button} data-variant="secondary" href="/tasks"><Icon name="board" size={16}/><span>Mở bảng Task ERP</span></Link></div>
  </div>;
}

function ProjectTimeline({ health, project }) {
  const phases = health.phases || [];
  return <div className={styles.projectTimelineLayout}>
    <Panel title="Project timeline" description="Thứ tự Phase và mốc thời gian do ERP cung cấp.">
      <ol className={styles.projectTimeline}>
        <li><time>{formatDate(project.startDate)}</time><strong>Khởi động Project</strong><p>{project.clientName || 'Chưa có khách hàng'} · {project.service || 'Chưa phân loại dịch vụ'}</p></li>
        {phases.map((phase) => <li key={phase.id}><time>Phase {Number(phase.order || 0) + 1}</time><strong>{phase.name}</strong><p>{phase.progress}% · {phase.blocked || 0} blocker · {phase.unresolvedDependencies || 0} dependency</p></li>)}
        <li><time>{formatDate(project.deadline)}</time><strong>Deadline Project</strong><p>{health.schedule.daysRemaining ?? '—'} ngày còn lại · gap {health.schedule.progressGapPercent ?? '—'}%</p></li>
      </ol>
    </Panel>
    <Panel title="Ranh giới dữ liệu" description="Không biến dữ liệu thiếu thành milestone giả.">
      <div className={styles.policyTests}><span><Icon name="calendar" size={14}/><strong>Milestone chi tiết</strong> chưa được Execution Health API expose</span><span><Icon name="person" size={14}/><strong>Project owner</strong> chưa có trong contract này</span><span><Icon name="receipt" size={14}/><strong>Decision receipts</strong> mở qua Chronicle khi backend cung cấp liên kết</span></div>
    </Panel>
  </div>;
}

function ProjectBudget({ health, canSeeMoney }) {
  const financial = health.financial;
  return <div className={styles.grid}>
    <Banner tone="warning"><strong>Planning proxy, không phải accounting profit.</strong> TimeLog là giờ tự khai báo; không được dùng làm observed truth, payroll, Gold hoặc xếp hạng.</Banner>
    <div className={`${styles.grid} ${styles.grid4}`}>
      <MetricCard label="Estimate" value={formatNumber(health.resource.estimateHours, 'h')} meta={`${health.resource.estimateCoveragePercent || 0}% coverage`} icon="clock"/>
      <MetricCard label="TimeLog khai báo" value={formatNumber(health.resource.declaredLoggedHours, 'h')} meta="Không phải thời gian quan sát" icon="timeline"/>
      <MetricCard label="Burn / estimate" value={formatNumber(health.resource.burnVsEstimatePercent, '%')} meta="Advisory only" icon="chart" tone={(health.resource.burnVsEstimatePercent || 0) > 100 ? 'danger' : 'warning'}/>
      <MetricCard label="Burn / budget giờ" value={formatNumber(health.resource.burnVsBudgetPercent, '%')} meta="Theo Project.budgetHours" icon="brief"/>
    </div>
    {!canSeeMoney || !financial ? <Panel title="Dữ liệu tài chính bị giới hạn"><StateView state="permission-denied" compact/></Panel> : <Panel title="Financial planning proxy" description="Chỉ hiển thị cho vai trò được ERP cấp quyền.">
      <div className={styles.financialGrid}><span><small>Revenue target</small><strong>{formatMoney(financial.revenueTarget)}</strong></span><span><small>Đã lập hóa đơn</small><strong>{formatMoney(financial.invoiced)}</strong></span><span><small>Đã thu</small><strong>{formatMoney(financial.collected)}</strong></span><span><small>Labor accrued</small><strong>{formatMoney(financial.laborAccrued)}</strong></span><span><small>Vendor committed</small><strong>{formatMoney(financial.vendorCommitted)}</strong></span><span><small>Planning margin proxy</small><strong>{formatMoney(financial.planningMarginProxy)}</strong></span></div>
      <div className={styles.sourceRow}><SourcePill source="Project + TimeLog + VendorBill + Invoice" freshness="Provisional"/><span>{financial.costBasis}</span></div>
    </Panel>}
  </div>;
}

function ProjectRealmScreen() {
  const sources = useProjectSources();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState('');
  const [tab, setTab] = useState('overview');
  const [healthState, setHealthState] = useState({ loading: false, data: null, error: null });

  useEffect(() => {
    if (!sources.projects.length) return;
    const requested = searchParams.get('project');
    setSelectedId((current) => sources.projects.some((item) => item.id === current)
      ? current
      : sources.projects.some((item) => item.id === requested) ? requested : sources.projects[0].id);
  }, [searchParams, sources.projects]);

  const loadHealth = useCallback(async (id) => {
    if (!id) return;
    setHealthState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await fetch(`/api/projects/${encodeURIComponent(id)}/execution-health`, { cache: 'no-store' })
        .then((response) => jsonResponse(response, 'Không thể tải Project Execution Health.'));
      setHealthState({ loading: false, data, error: null });
    } catch (error) { setHealthState((current) => ({ loading: false, data: current.data?.project?.id === id ? current.data : null, error })); }
  }, []);
  useEffect(() => { loadHealth(selectedId); }, [loadHealth, selectedId]);

  const selected = sources.projects.find((project) => project.id === selectedId) || null;
  const data = healthState.data?.project?.id === selectedId ? healthState.data : null;
  const health = data?.executionHealth;
  if (sources.loading && !sources.projects.length) return <Panel><StateView state="loading"/></Panel>;
  if (sources.projectError && !sources.projects.length) return <Panel title="Không thể tải Project Realm"><div className={styles.canonicalState}><StateView state={sources.projectError.status === 403 ? 'permission-denied' : 'error'}/><Button variant="secondary" icon="refresh" onClick={sources.reload}>Tải lại an toàn</Button></div></Panel>;
  if (!sources.projects.length) return <Panel title="Project Realm"><StateView state="empty"/></Panel>;

  return <div className={styles.grid}>
    {(sources.projectError || sources.statsError) && <Banner tone="warning" action={<Button variant="secondary" icon="refresh" onClick={sources.reload}>Thử lại</Button>}><strong>Một nguồn Project đang gián đoạn.</strong> Danh sách và health degrade độc lập; Realm không thay bằng fixture.</Banner>}
    <section className={styles.projectHero}>
      <div><span className={styles.eyebrow}>Project Realm · Canonical cockpit</span><h2>{selected?.name}</h2><p>{data?.project?.clientName || 'Chưa có khách hàng'} · {data?.project?.service || selected?.service || 'Chưa phân loại dịch vụ'}</p></div>
      <div className={styles.projectHeroActions}><Button variant="secondary" icon="refresh" loading={healthState.loading} onClick={() => loadHealth(selectedId)}>Làm mới snapshot</Button><Link className={styles.button} href={`/projects/${encodeURIComponent(selectedId)}`}><Icon name="arrow" size={16}/><span>Mở workflow ERP</span></Link></div>
    </section>
    <div className={styles.projectRealmLayout}>
      <Panel title="Danh mục Project" description="Cùng record với ERP Projects."><ProjectSelector projects={sources.projects} stats={sources.stats} value={selectedId} onChange={(id) => { setSelectedId(id); setTab('overview'); }}/></Panel>
      <div className={styles.projectRealmMain}>
        {healthState.error && <Banner tone="danger" action={<Button variant="secondary" icon="refresh" onClick={() => loadHealth(selectedId)}>Thử lại</Button>}><strong>Không thể tải Project Health.</strong> {healthState.error.message}</Banner>}
        {healthState.loading && !health ? <Panel><StateView state="loading"/></Panel> : health ? <>
          <section className={`${styles.grid} ${styles.grid4}`} aria-label="Project Realm summary">
            <MetricCard label="Delivery health" value={health.health.label} meta={`${health.health.confidence.label} · ${health.health.signals.length} tín hiệu`} icon="chart" tone={healthTone(health.health.level)}/>
            <MetricCard label="Tiến độ" value={`${health.progress.percent}%`} meta={`${health.progress.completed}/${health.progress.total} Task`} icon="checklist"/>
            <MetricCard label="Blocker" value={health.delivery.blocked} meta={`${health.delivery.unresolvedDependencies} dependency`} icon="warning" tone={health.delivery.blocked ? 'danger' : 'success'}/>
            <MetricCard label="Timeline" value={health.schedule.daysRemaining == null ? '—' : `${health.schedule.daysRemaining} ngày`} meta={`Deadline ${formatDate(health.schedule.deadline)}`} icon="calendar" tone={(health.schedule.daysRemaining ?? 1) < 0 ? 'danger' : 'success'}/>
          </section>
          <div className={styles.projectTabs}><Segmented label="Góc nhìn Project Realm" options={PROJECT_TABS} value={tab} onChange={setTab}/></div>
          {tab === 'overview' && <ProjectOverview health={health}/>} 
          {tab === 'work' && <ProjectWork health={health} projectId={selectedId}/>} 
          {tab === 'timeline' && <ProjectTimeline health={health} project={data.project}/>} 
          {tab === 'budget' && <ProjectBudget health={health} canSeeMoney={data.canSeeMoney}/>} 
          {tab === 'chronicle' && <Panel title="Chronicle của Project" description="AuditLog hiện chưa expose quan hệ Project có cấu trúc."><div className={styles.canonicalEmpty}><Icon name="timeline"/><strong>Không tự suy đoán audit trail</strong><span>Realm chỉ chuyển tiêu chí Project sang tìm kiếm; người dùng phải xác minh record trong Chronicle.</span><Link className={styles.button} href={`/realm-v2/chronicle?project=${encodeURIComponent(selectedId)}`}><Icon name="arrow" size={16}/><span>Mở Chronicle có bộ lọc</span></Link></div></Panel>}
          <div className={styles.sourceRow}><SourcePill source={data.source} freshness={formatDate(data.generatedAt, true)}/><span>Rule {health.ruleVersion} · snapshot tối đa {data.limits.taskSnapshot} Task / {data.limits.timeLogSnapshot} TimeLog</span></div>
        </> : null}
      </div>
    </div>
  </div>;
}

function auditKind(row) {
  const value = `${row.action || ''} ${row.userName || ''}`.toLowerCase();
  if (value.includes('import')) return { label: 'Imported', tone: 'info', icon: 'receipt' };
  if (value.includes('system') || value.includes('hệ thống')) return { label: 'System', tone: 'warning', icon: 'settings' };
  return { label: 'Human', tone: 'success', icon: 'person' };
}

function ChronicleScreen() {
  const searchParams = useSearchParams();
  const [state, setState] = useState({ loading: true, rows: [], error: null });
  const [query, setQuery] = useState('');
  const [action, setAction] = useState('all');
  const [entity, setEntity] = useState('all');
  const [actor, setActor] = useState('all');
  const [selectedId, setSelectedId] = useState('');
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const rows = await fetch('/api/audit', { cache: 'no-store' }).then((response) => jsonResponse(response, 'Không thể tải Chronicle tổ chức.'));
      setState({ loading: false, rows, error: null });
    } catch (error) { setState((current) => ({ ...current, loading: false, error })); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const project = searchParams.get('project');
    if (project) setQuery(project);
  }, [searchParams]);

  const actions = useMemo(() => [...new Set(state.rows.map((row) => row.action).filter(Boolean))].sort(), [state.rows]);
  const entities = useMemo(() => [...new Set(state.rows.map((row) => row.entity).filter(Boolean))].sort(), [state.rows]);
  const actors = useMemo(() => [...new Set(state.rows.map((row) => row.userName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')), [state.rows]);
  const visible = useMemo(() => state.rows.filter((row) => {
    if (action !== 'all' && row.action !== action) return false;
    if (entity !== 'all' && row.entity !== entity) return false;
    if (actor !== 'all' && row.userName !== actor) return false;
    const needle = query.trim().toLocaleLowerCase('vi-VN');
    return !needle || `${row.userName || ''} ${row.action || ''} ${row.entity || ''} ${row.detail || ''} ${row.refId || ''}`.toLocaleLowerCase('vi-VN').includes(needle);
  }), [action, actor, entity, query, state.rows]);
  useEffect(() => {
    setSelectedId((current) => visible.some((row) => row.id === current) ? current : visible[0]?.id || '');
  }, [visible]);
  const selected = state.rows.find((row) => row.id === selectedId) || null;

  if (state.loading && !state.rows.length) return <Panel><StateView state="loading"/></Panel>;
  if (state.error && !state.rows.length) return <Panel title={state.error.status === 403 ? 'Chronicle tổ chức được giới hạn cho Director' : 'Không thể tải Chronicle'}><div className={styles.canonicalState}><StateView state={state.error.status === 403 ? 'permission-denied' : 'error'}/><div className={styles.threadActions}>{state.error.status !== 403 && <Button variant="secondary" icon="refresh" onClick={load}>Tải lại an toàn</Button>}<Link className={styles.button} data-variant="secondary" href="/realm?view=ledger"><Icon name="ledger" size={16}/><span>Mở Sổ Realm cá nhân</span></Link></div></div></Panel>;

  return <div className={styles.grid}>
    <Banner tone="info"><strong>Chronicle này là AuditLog ERP chỉ đọc.</strong> Backend hiện chưa expose before/after, source event, signed export, correction link hoặc RepositoryRealms receipt; Realm không tự tạo các bằng chứng đó.</Banner>
    <section className={`${styles.grid} ${styles.grid4}`} aria-label="Chronicle summary">
      <MetricCard label="Sự kiện" value={state.rows.length} meta="Tối đa 300 AuditLog" icon="timeline"/>
      <MetricCard label="Tác nhân" value={actors.length} meta="Theo quyền Director" icon="person"/>
      <MetricCard label="Loại bản ghi" value={entities.length} meta="ERP entity" icon="folder"/>
      <MetricCard label="Imported" value={state.rows.filter((row) => auditKind(row).label === 'Imported').length} meta="Được đánh dấu riêng" icon="receipt"/>
    </section>
    <Panel title="Bộ lọc Chronicle" description="Lọc cục bộ trên tối đa 300 record đã được `/api/audit` cấp quyền." actions={<Button variant="secondary" icon="refresh" loading={state.loading} onClick={load}>Đồng bộ</Button>}>
      <div className={styles.chronicleFilters}>
        <label className={styles.inboxSearch}><Icon name="search" size={16}/><span className={styles.srOnly}>Tìm trong Chronicle</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm actor, action, entity, chi tiết…"/></label>
        <label><span>Action</span><select className={styles.select} value={action} onChange={(event) => setAction(event.target.value)}><option value="all">Tất cả action</option>{actions.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
        <label><span>Entity</span><select className={styles.select} value={entity} onChange={(event) => setEntity(event.target.value)}><option value="all">Tất cả entity</option>{entities.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
        <label><span>Actor</span><select className={styles.select} value={actor} onChange={(event) => setActor(event.target.value)}><option value="all">Tất cả actor</option>{actors.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
      </div>
    </Panel>
    <div className={styles.chronicleWorkspace} data-detail-open={selected ? 'true' : undefined}>
      <Panel title={`Dòng sự kiện · ${visible.length}`} description="Mới nhất trước; chỉ đọc.">
        <div className={styles.chronicleList} role="list" aria-label="Sự kiện Chronicle">{visible.length ? visible.map((row) => {
          const kind = auditKind(row);
          return <button type="button" role="listitem" className={styles.chronicleRow} data-selected={row.id === selectedId || undefined} aria-pressed={row.id === selectedId} key={row.id} onClick={() => setSelectedId(row.id)}>
            <span className={styles.projectChoiceIcon}><Icon name={kind.icon} size={16}/></span>
            <span className={styles.chronicleRowCopy}><span><strong>{row.action || 'unknown action'}</strong><time>{formatDate(row.at, true)}</time></span><small>{row.userName || 'Không rõ tác nhân'} · {row.entity || 'Không rõ entity'}</small><span>{row.detail || 'Không có chi tiết'}</span></span>
            <Badge tone={kind.tone}>{kind.label}</Badge><Icon name="chevron" size={14}/>
          </button>;
        }) : <div className={styles.canonicalEmpty}><Icon name="timeline"/><strong>Không có sự kiện phù hợp</strong><span>Thay đổi bộ lọc; Realm không thêm fixture vào product route.</span></div>}</div>
      </Panel>
      <aside className={styles.chronicleDetail} aria-label="Chi tiết sự kiện Chronicle">
        {selected ? <>
          <header><span className={styles.eyebrow}>AuditLog event</span><h2>{selected.action || 'unknown action'}</h2><p>{formatDate(selected.at, true)}</p></header>
          <dl className={styles.chronicleDefinition}><div><dt>Tác nhân</dt><dd>{selected.userName || 'Không rõ'}</dd></div><div><dt>Loại tác nhân</dt><dd><Badge tone={auditKind(selected).tone}>{auditKind(selected).label}</Badge></dd></div><div><dt>Bản ghi ảnh hưởng</dt><dd>{selected.entity || 'Không rõ'}{selected.refId ? ` · ${selected.refId}` : ''}</dd></div><div><dt>Chi tiết / reason</dt><dd>{selected.detail || 'Không được nguồn cung cấp'}</dd></div><div><dt>Before → after</dt><dd>Chưa được `/api/audit` expose</dd></div><div><dt>Nguồn event</dt><dd>ERP AuditLog</dd></div><div><dt>RepositoryRealms receipt</dt><dd>Chưa được nguồn cung cấp</dd></div><div><dt>Audit status</dt><dd>Record canonical · read-only</dd></div></dl>
          <Banner tone="warning"><strong>Không sửa lịch sử tại đây.</strong> Correction phải tạo event liên kết mới khi backend có contract; hiện chưa có action an toàn để gọi.</Banner>
          <div className={styles.chronicleActions}><Link className={styles.button} href="/audit"><Icon name="arrow" size={16}/><span>Mở AuditLog ERP</span></Link><button type="button" className={styles.button} data-variant="secondary" disabled title="Chưa có signed-export contract"><Icon name="receipt" size={16}/><span>Xuất bản có chữ ký</span></button></div>
        </> : <div className={styles.canonicalEmpty}><Icon name="timeline"/><strong>Chọn một sự kiện</strong><span>Xem actor, action, affected record và bằng chứng nguồn đang có.</span></div>}
      </aside>
    </div>
    <div className={styles.sourceRow}><SourcePill source="ERP AuditLog" freshness="Authorized · Read-only"/><span>Không có mutation request từ màn hình Chronicle.</span></div>
  </div>;
}

export default function CanonicalRealmProjectChronicleScreen({ slug }) {
  return slug === 'chronicle' ? <ChronicleScreen/> : <ProjectRealmScreen/>;
}
