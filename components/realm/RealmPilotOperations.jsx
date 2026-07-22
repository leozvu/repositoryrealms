'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AsyncButton, ConfirmDialog, Icon, useToast } from '@/components/ui';
import { fetchRealmWithTimeout } from './realm-fetch';
import styles from './realm-pilot-operations.module.css';

const PILOT_OPERATIONS_EVENT = 'crmegoric:pilot-operations-changed';
const OPEN_STATUSES = new Set(['draft', 'awaiting_approval', 'active', 'paused']);
const STATUS = {
  draft: ['Bản nháp', 'draft'],
  awaiting_approval: ['Chờ Director duyệt', 'awaiting'],
  active: ['Đang chạy', 'active'],
  paused: ['Tạm dừng', 'paused'],
  completed: ['Hoàn tất', 'completed'],
};
const REPORT = {
  go: ['GO', 'Có thể đề xuất wave tiếp theo', 'go'],
  hold: ['HOLD', 'Tiếp tục quan sát', 'hold'],
  no_go: ['NO-GO', 'Dừng mở rộng và xử lý blocker', 'noGo'],
};
const ACTIVATION = {
  not_started: ['Chưa bắt đầu', 'neutral', 'clock'],
  watching: ['Đang quan sát', 'watching', 'clock'],
  ready: ['Chờ xác nhận', 'ready', 'check'],
  blocked: ['Guardrail bị chặn', 'blocked', 'alert'],
  cleared: ['Canary đã đạt', 'cleared', 'check'],
  rolled_back: ['Đã rollback', 'rolledBack', 'shield'],
};
const INCIDENT_STATE = {
  stable: ['Ổn định', 'stable', 'check'],
  degraded: ['Đang theo dõi', 'degraded', 'clock'],
  critical: ['Critical · ERP fallback', 'critical', 'shield'],
};
const INCIDENT_STATUS = {
  open: ['Mới', 'open'],
  monitoring: ['Đang theo dõi', 'monitoring'],
  resolved: ['Đã khống chế', 'resolved'],
};
const CHAOS_STATE = {
  protected: ['Đã bảo vệ', 'protected', 'check'],
  contained: ['Đã contain', 'contained', 'shield'],
  critical: ['Cần can thiệp', 'critical', 'alert'],
};

function Metric({ value, label, detail }) {
  return <div className={styles.metric}><strong>{Number(value || 0).toLocaleString('vi-VN')}</strong><span>{label}</span>{detail && <small>{detail}</small>}</div>;
}

function formatDate(value, withTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', withTime
    ? { dateStyle: 'short', timeStyle: 'short' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function WaveTimeline({ wave }) {
  const order = ['draft', 'awaiting_approval', 'active', wave.status === 'paused' ? 'paused' : 'completed'];
  const position = Math.max(0, order.indexOf(wave.status));
  return (
    <ol className={styles.timeline} aria-label="Vòng đời pilot wave">
      {order.map((status, index) => {
        const [label] = STATUS[status];
        const done = index < position || wave.status === 'completed';
        const current = index === position && wave.status !== 'completed';
        return <li key={`${wave.id}-${status}`} data-done={done || undefined} data-current={current || undefined}><span>{done ? <Icon name="check" size={13} /> : index + 1}</span><strong>{label}</strong></li>;
      })}
    </ol>
  );
}

function ActivationGuard({ guard, wave, onClear, onRollback }) {
  if (!guard || (!wave?.activation && !['active', 'paused'].includes(wave?.status))) return null;
  const [label, tone, icon] = ACTIVATION[guard.state] || ACTIVATION.not_started;
  return (
    <section className={styles.activation} aria-labelledby={`canary-${wave.id}`}>
      <div className={styles.activationHead}>
        <div>
          <span>90-minute launch watch</span>
          <h4 id={`canary-${wave.id}`}>Canary Activation Guard</h4>
          <p>Quan sát gate vận hành tổng hợp; không đo thời lượng hay hành vi của từng nhân sự.</p>
        </div>
        <span className={styles[`canary_${tone}`]}><Icon name={icon} size={13} /> {label}</span>
      </div>

      <div className={styles.activationFacts} aria-label="Canary activation snapshot">
        <span><b>Bắt đầu</b>{formatDate(guard.startedAt, true)}</span>
        <span><b>Checkpoint</b>{formatDate(guard.checkpointDueAt, true)}</span>
        <span><b>Trạng thái cửa sổ</b>{guard.state === 'watching' ? `Còn ${guard.remainingMinutes} phút` : guard.state === 'ready' ? 'Đã đến hạn' : guard.state === 'cleared' ? 'Đã xác nhận' : guard.state === 'rolled_back' ? 'Đã dừng' : 'Bị chặn'}</span>
        <span><b>Baseline</b>{guard.baseline ? `${guard.baseline.eligibleUsers} eligible · ${guard.baseline.fallbackUsers} fallback` : 'Aggregate only'}</span>
      </div>

      <div className={styles.activationCriteria} aria-label="Canary guardrails">
        {(guard.criteria || []).map((criterion) => (
          <div key={criterion.id} data-passed={criterion.passed || undefined}>
            <span><Icon name={criterion.passed ? 'check' : 'alert'} size={12} /></span>
            <p><strong>{criterion.label}</strong><small>{criterion.detail}</small></p>
          </div>
        ))}
      </div>

      {guard.decisionNote && <p className={styles.note}><Icon name="note" size={14} /> {guard.decisionNote}</p>}
      {wave.status === 'active' && (
        <div className={styles.activationActions}>
          <span aria-live="polite">
            {guard.state === 'watching' && `Giữ nguyên cohort thêm ${guard.remainingMinutes} phút trước khi xác nhận.`}
            {guard.state === 'ready' && 'Mọi guardrail đều đạt; Director có thể xác nhận canary.'}
            {guard.state === 'blocked' && 'Không tiếp tục activation. Xử lý blocker hoặc rollback về ERP.'}
            {guard.state === 'cleared' && `Đã xác nhận bởi ${guard.clearedByName || 'Director'} lúc ${formatDate(guard.clearedAt, true)}.`}
          </span>
          <div>
            {guard.state !== 'cleared' && <AsyncButton className="btn btn-primary" pendingLabel="Đang kiểm tra…" disabled={!guard.canClear} onClick={onClear}><Icon name="check" size={14} /> Xác nhận qua canary gate</AsyncButton>}
            <button type="button" className="btn btn-danger" onClick={onRollback}><Icon name="shield" size={14} /> Rollback về ERP</button>
          </div>
        </div>
      )}
    </section>
  );
}

function IncidentCommand({ command, wave, onReport, onMonitor, onResolve }) {
  const [category, setCategory] = useState('communications');
  const [severity, setSeverity] = useState('warning');
  if (!command || !wave) return null;
  const categories = command.categories || [];
  const categoryMeta = categories.find((item) => item.id === category) || categories[0];
  const effectiveCategory = categoryMeta?.id || '';
  const effectiveSeverity = categoryMeta?.defaultSeverity === 'critical' ? 'critical' : severity;
  const [stateLabel, stateTone, stateIcon] = INCIDENT_STATE[command.state] || INCIDENT_STATE.stable;
  const unresolved = (command.incidents || []).filter((incident) => incident.status !== 'resolved');

  const changeCategory = (event) => {
    const next = categories.find((item) => item.id === event.target.value);
    setCategory(event.target.value);
    setSeverity(next?.defaultSeverity || 'warning');
  };

  return (
    <section className={styles.incident} aria-labelledby={`incident-command-${wave.id}`}>
      <div className={styles.incidentHead}>
        <div>
          <span>Aggregate incident response</span>
          <h3 id={`incident-command-${wave.id}`}>Incident Command · Timeline</h3>
          <p>Ghi nhận theo loại sự cố cố định; không nhập tên người, nội dung record hoặc dữ liệu hiệu suất.</p>
        </div>
        <span className={styles[`incidentState_${stateTone}`]}><Icon name={stateIcon} size={13} /> {stateLabel}</span>
      </div>

      <div className={styles.incidentMetrics} aria-label="Incident command snapshot">
        <Metric value={command.summary?.criticalOpen} label="Critical đang mở" detail="Critical luôn rollback ERP" />
        <Metric value={command.summary?.warningOpen} label="Warning đang theo dõi" detail="Giữ Go/No-go ở HOLD" />
        <Metric value={command.summary?.resolved} label="Đã khống chế" detail="Không tự tái kích hoạt Realm" />
        <Metric value={command.summary?.rollbackTriggered} label="Rollback đã kích hoạt" detail="Dữ liệu và migration được giữ" />
      </div>

      {command.canReport && categoryMeta && (
        <div className={styles.incidentForm}>
          <label><span>Loại sự cố</span><select value={effectiveCategory} onChange={changeCategory}>{categories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label><span>Mức độ</span><select value={effectiveSeverity} disabled={categoryMeta.defaultSeverity === 'critical'} onChange={(event) => setSeverity(event.target.value)}><option value="warning">Warning · theo dõi</option><option value="critical">Critical · rollback ERP</option></select></label>
          <AsyncButton className={effectiveSeverity === 'critical' ? 'btn btn-danger' : 'btn btn-outline'} pendingLabel="Đang ghi nhận…" onClick={() => onReport(effectiveCategory, effectiveSeverity)}><Icon name="alert" size={14} /> Ghi nhận sự cố</AsyncButton>
          <p><Icon name="shield" size={14} /> {categoryMeta.detail} {effectiveSeverity === 'critical' && 'Khi xác nhận, kill switch được bật trong cùng transaction.'}</p>
        </div>
      )}

      {unresolved.length > 0 && (
        <div className={styles.incidentQueue} aria-label="Incident đang xử lý">
          {unresolved.map((incident) => {
            const [statusLabel, statusTone] = INCIDENT_STATUS[incident.status] || INCIDENT_STATUS.open;
            return <article key={incident.id} data-severity={incident.severity}>
              <span className={styles[`incidentStatus_${statusTone}`]}><Icon name={incident.severity === 'critical' ? 'shield' : 'clock'} size={12} /> {statusLabel}</span>
              <div><strong>{incident.categoryLabel}</strong><small>{incident.categoryDetail}</small></div>
              <div>
                {incident.canMonitor && <AsyncButton className="btn btn-outline" pendingLabel="Đang cập nhật…" onClick={() => onMonitor(incident.id)}>Bắt đầu theo dõi</AsyncButton>}
                {incident.canResolve && <AsyncButton className="btn btn-primary" pendingLabel="Đang xác minh…" onClick={() => onResolve(incident.id)}>Xác nhận đã khống chế</AsyncButton>}
              </div>
            </article>;
          })}
        </div>
      )}

      <ol className={styles.incidentTimeline} aria-label="Dòng thời gian incident và rollout">
        {(command.timeline || []).map((event) => <li key={event.id} data-tone={event.tone}>
          <span><Icon name={event.tone === 'critical' ? 'shield' : event.tone === 'warning' ? 'clock' : event.tone === 'success' ? 'check' : 'reports'} size={13} /></span>
          <div><strong>{event.label}</strong><small>{event.detail}</small></div>
          <time dateTime={event.at}>{formatDate(event.at, true)}</time>
        </li>)}
        {!command.timeline?.length && <li className={styles.incidentEmpty}><span><Icon name="reports" size={13} /></span><div><strong>Chưa có sự kiện vận hành</strong><small>Timeline bắt đầu khi wave được tạo; không ghi hoạt động cá nhân.</small></div></li>}
      </ol>
    </section>
  );
}

function ChaosReadiness({ readiness }) {
  if (!readiness) return null;
  return (
    <section className={styles.chaos} aria-labelledby="realm-chaos-readiness-title">
      <div className={styles.chaosHead}>
        <div>
          <span>Phase 20 · fault containment</span>
          <h3 id="realm-chaos-readiness-title">Chaos Readiness</h3>
          <p>Mỗi dependency được phép hỏng có kiểm soát; ERP, dữ liệu gốc và thao tác đang làm không bị biến thành collateral damage.</p>
        </div>
        <span data-posture={readiness.posture}><Icon name={readiness.posture === 'critical' ? 'alert' : readiness.posture === 'degraded' ? 'shield' : 'check'} size={13} /> {readiness.summary?.protected || 0}/{readiness.summary?.total || 0} protected</span>
      </div>
      <div className={styles.chaosGrid}>
        {(readiness.scenarios || []).map((scenario) => {
          const [label, tone, icon] = CHAOS_STATE[scenario.state] || CHAOS_STATE.protected;
          return (
            <article key={scenario.id} data-state={tone}>
              <div><span><Icon name={icon} size={13} /></span><strong>{scenario.label}</strong><small>{label}</small></div>
              <p>{scenario.liveDetail}</p>
              <dl><div><dt>Detect</dt><dd>{scenario.detection}</dd></div><div><dt>Degrade</dt><dd>{scenario.fallback}</dd></div><div><dt>Preserve</dt><dd>{scenario.preserves}</dd></div></dl>
            </article>
          );
        })}
      </div>
      <p className={styles.chaosRule}><Icon name="shield" size={14} /> Không tự retry mutation. Không dùng stale cache cho Gold, quyền hạn hoặc quyết định duyệt. Evidence chỉ là số tổng hợp.</p>
    </section>
  );
}

export default function RealmPilotOperations() {
  const toast = useToast();
  const [state, setState] = useState({ loading: true, error: '', dashboard: null });
  const [name, setName] = useState('Pilot wave 01');
  const [durationDays, setDurationDays] = useState(7);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const response = await fetchRealmWithTimeout('/api/realm-demo/pilot/operations', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Không thể tải Pilot Operations.');
      setState({ loading: false, error: '', dashboard: payload });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message || 'Không thể tải Pilot Operations.' }));
    }
  }, []);

  useEffect(() => {
    load();
    const refresh = () => load({ quiet: true });
    window.addEventListener(PILOT_OPERATIONS_EVENT, refresh);
    return () => window.removeEventListener(PILOT_OPERATIONS_EVENT, refresh);
  }, [load]);

  const mutate = async (action, extra = {}) => {
    const dashboard = state.dashboard;
    const wave = dashboard?.operations?.currentWave;
    try {
      const response = await fetchRealmWithTimeout('/api/realm-demo/pilot/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          expectedVersion: dashboard?.operations?.version,
          waveId: wave?.id,
          ...extra,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 409) await load({ quiet: true });
        toast(payload.error || 'Không thể cập nhật Pilot Operations.', 'error');
        return false;
      }
      setState({ loading: false, error: '', dashboard: payload });
      window.dispatchEvent(new CustomEvent(PILOT_OPERATIONS_EVENT));
      const messages = {
        create: 'Đã tạo bản nháp pilot wave.',
        submit: 'Đã gửi wave cho Director khác duyệt.',
        approve: 'Wave đã kích hoạt và invitation đã gửi qua ERP.',
        reject: 'Đã trả wave về bản nháp.',
        clear_activation: 'Canary gate đã đạt; cohort hiện tại tiếp tục mà không tự mở rộng.',
        report_incident: 'Đã ghi nhận incident và cập nhật guardrail vận hành.',
        monitor_incident: 'Incident đã chuyển sang trạng thái theo dõi.',
        resolve_incident: 'Incident đã được khống chế; Realm không tự tái kích hoạt.',
        pause: 'Đã tạm dừng wave và bật ERP fallback.',
        complete: 'Đã hoàn tất wave và giữ nguyên toàn bộ dữ liệu.',
      };
      toast(payload.notificationDelivery?.state === 'degraded'
        ? `${messages[action] || 'Đã cập nhật Pilot Operations.'} Chuông thông báo đang gián đoạn; core state vẫn an toàn.`
        : messages[action] || 'Đã cập nhật Pilot Operations.', payload.notificationDelivery?.state === 'degraded' ? 'warning' : undefined);
      return true;
    } catch (error) {
      setState((current) => ({ ...current, error: error.message || 'Không thể cập nhật Pilot Operations.' }));
      toast(error.message || 'Không thể cập nhật Pilot Operations. Không tự retry để tránh gửi lặp.', 'error');
      return false;
    }
  };

  const dashboard = state.dashboard;
  const wave = dashboard?.operations?.currentWave;
  const hasOpenWave = wave && OPEN_STATUSES.has(wave.status);
  const metrics = dashboard?.metrics;
  const readiness = dashboard?.readiness;
  const rehearsal = dashboard?.rehearsal;
  const activationGuard = dashboard?.activationGuard;
  const incidentCommand = dashboard?.incidentCommand;
  const report = dashboard?.report;
  const [reportCode, reportCopy, reportTone] = REPORT[report?.recommendation] || REPORT.hold;
  const history = useMemo(() => (dashboard?.operations?.waves || []).filter((item) => item.id !== wave?.id).slice(0, 4), [dashboard, wave?.id]);

  return (
    <section className={`card ${styles.card}`} aria-labelledby="realm-pilot-operations-title">
      <div className={`card-head ${styles.header}`}>
        <span className={styles.icon}><Icon name="reports" size={18} /></span>
        <div>
          <span className="card-title" id="realm-pilot-operations-title">Pilot Operations · Rollout Waves</span>
          <p>Điều phối cohort theo wave 7–14 ngày, maker–checker, ERP fallback và báo cáo Go/No-go tổng hợp.</p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => load()} disabled={state.loading} aria-label="Tải lại Pilot Operations"><Icon name="repeat" size={14} /><span>Tải lại</span></button>
      </div>

      <div className={`card-body ${styles.body}`}>
        {state.loading && !dashboard ? (
          <div className={styles.loading} aria-live="polite" aria-busy="true">Đang tải bàn điều phối pilot…</div>
        ) : state.error && !dashboard ? (
          <div className={styles.error} role="alert"><span>{state.error}</span><button type="button" className="btn btn-outline btn-sm" onClick={() => load()}>Thử lại</button></div>
        ) : (
          <>
            {state.error && <div className={styles.degraded} role="status"><span><Icon name="shield" size={15} /></span><p><strong>Đang hiển thị snapshot gần nhất</strong><small>{state.error} Core ERP không bị gián đoạn và hệ thống không tự gửi lại mutation.</small></p><button type="button" className="btn btn-outline btn-sm" onClick={() => load()}>Thử lại</button></div>}
            <div className={styles.alerts} aria-label="Cảnh báo vận hành">
              {(dashboard.alerts || []).map((alert) => (
                <div key={alert.id} data-severity={alert.severity}>
                  <span><Icon name={alert.severity === 'critical' ? 'alert' : alert.severity === 'warning' ? 'clock' : 'shield'} size={15} /></span>
                  <p><strong>{alert.title}</strong><small>{alert.detail}</small></p>
                </div>
              ))}
              {!dashboard.alerts?.length && <div data-severity="ok"><span><Icon name="check" size={15} /></span><p><strong>Không có cảnh báo vận hành</strong><small>Policy, wave và readiness hiện đang đồng bộ.</small></p></div>}
            </div>

            <div className={styles.metrics} aria-label="Pilot operations snapshot">
              <Metric value={metrics?.eligibleUsers} label="Cohort đủ điều kiện" detail={`${metrics?.cohort?.available || 0} nhân sự nội bộ khả dụng`} />
              <Metric value={metrics?.preferences?.realm} label="Chọn Realm" detail={`${metrics?.preferences?.erp || 0} chọn ERP`} />
              <Metric value={Math.max(0, (metrics?.cohort?.available || 0) - (metrics?.eligibleUsers || 0))} label="ERP fallback" detail="Ngoài cohort vẫn làm việc bình thường" />
              <Metric value={readiness?.summary?.unresolvedFeedback} label="Feedback đang mở" detail={`${readiness?.summary?.blockedFeedback || 0} mức blocked`} />
              <Metric value={readiness?.summary?.blockers} label="Blocking gates" detail={`${readiness?.summary?.passed || 0}/${readiness?.summary?.total || 0} gate đạt`} />
              <Metric value={dashboard.launchApprovals?.pending} label="Launch approvals" detail="Đang chờ Director thứ hai" />
            </div>

            {hasOpenWave ? (
              <section className={styles.wave} aria-labelledby={`wave-${wave.id}`}>
                <div className={styles.waveHead}>
                  <div><span>Current rollout wave</span><h3 id={`wave-${wave.id}`}>{wave.name}</h3><p>Policy v{wave.policyVersion} · {wave.eligibleUsers} eligible · {wave.fallbackUsers} fallback</p></div>
                  <span className={styles[`status_${STATUS[wave.status]?.[1]}`]}>{STATUS[wave.status]?.[0]}</span>
                </div>
                <WaveTimeline wave={wave} />
                <div className={styles.waveFacts}>
                  <span><b>Cửa sổ</b>{wave.durationDays} ngày</span>
                  <span><b>Dự kiến</b>{formatDate(wave.plannedStartAt)} → {formatDate(wave.plannedEndAt)}</span>
                  <span><b>Kích hoạt</b>{formatDate(wave.activatedAt, true)}</span>
                  <span><b>Maker</b>{wave.submittedByName || wave.createdByName}</span>
                  <span><b>Rehearsal</b>{wave.rehearsalId ? `Sealed · ${formatDate(wave.rehearsalExpiresAt, true)}` : 'Chưa khóa'}</span>
                </div>
                <ActivationGuard guard={activationGuard} wave={wave} onClear={() => mutate('clear_activation')} onRollback={() => setConfirm({ type: 'pause' })} />
                {wave.decisionNote && <p className={styles.note}><Icon name="note" size={14} /> {wave.decisionNote}</p>}
                <div className={styles.waveActions}>
                  <span aria-live="polite">
                    {wave.status === 'draft' && (wave.policyVersion !== dashboard.policy.version ? 'Policy đã đổi; hãy đóng wave cũ.' : rehearsal?.readyForWave ? 'Readiness và sealed rehearsal đã sẵn sàng.' : rehearsal?.reason)}
                    {wave.status === 'awaiting_approval' && (wave.canApprove ? 'Bạn là checker hợp lệ cho wave này.' : 'Đang chờ một Director khác duyệt.')}
                    {wave.status === 'active' && (activationGuard?.state === 'cleared' ? 'Canary đã đạt; wave tiếp tục trong đúng cohort hiện tại.' : 'Invitation đã gửi; Canary Guard đang theo dõi và ERP vẫn là fallback.')}
                    {wave.status === 'paused' && 'Kill switch đang bật; hoàn tất wave để lưu báo cáo.'}
                  </span>
                  <div>
                    {wave.status === 'draft' && <AsyncButton className="btn btn-primary" pendingLabel="Đang gửi…" disabled={!readiness.ready || !rehearsal?.readyForWave || wave.policyVersion !== dashboard.policy.version} onClick={() => mutate('submit')}>Gửi Director duyệt</AsyncButton>}
                    {wave.status === 'awaiting_approval' && wave.canApprove && <><AsyncButton className="btn btn-outline" pendingLabel="Đang trả về…" onClick={() => mutate('reject')}>Trả về nháp</AsyncButton><AsyncButton className="btn btn-primary" pendingLabel="Đang kích hoạt…" disabled={!readiness.ready || !rehearsal?.readyForWave} onClick={() => mutate('approve')}>Duyệt &amp; mời cohort</AsyncButton></>}
                    {wave.status === 'active' && <button type="button" className="btn btn-outline" onClick={() => setConfirm({ type: 'complete' })}>Hoàn tất wave</button>}
                    {['draft', 'awaiting_approval', 'paused'].includes(wave.status) && <button type="button" className="btn btn-outline" onClick={() => setConfirm({ type: 'complete' })}>Đóng wave</button>}
                  </div>
                </div>
              </section>
            ) : (
              <section className={styles.creator} aria-labelledby="pilot-wave-create-title">
                <div><span>Next rollout</span><h3 id="pilot-wave-create-title">Tạo pilot wave mới</h3><p>Policy phải ở chế độ pilot. Wave không tự mở rộng cohort và không thay contract Phase 15.</p></div>
                <div className={styles.createForm}>
                  <label><span>Tên wave</span><input value={name} minLength={3} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
                  <label><span>Thời lượng</span><select value={durationDays} onChange={(event) => setDurationDays(Number(event.target.value))}><option value={7}>7 ngày</option><option value={10}>10 ngày</option><option value={14}>14 ngày</option></select></label>
                  <AsyncButton className="btn btn-primary" pendingLabel="Đang tạo…" disabled={dashboard.policy.mode !== 'pilot' || name.trim().length < 3} onClick={() => mutate('create', { name: name.trim(), durationDays })}><Icon name="plus" size={14} /> Tạo bản nháp</AsyncButton>
                </div>
                {dashboard.policy.mode !== 'pilot' && <p className={styles.creatorHint}><Icon name="shield" size={14} /> Dùng Controlled Launch phía trên để đưa policy vào pilot trước.</p>}
              </section>
            )}

            {wave && <IncidentCommand
              command={incidentCommand}
              wave={wave}
              onReport={(category, severity) => severity === 'critical'
                ? setConfirm({ type: 'critical_incident', category, severity })
                : mutate('report_incident', { category, severity })}
              onMonitor={(incidentId) => mutate('monitor_incident', { incidentId })}
              onResolve={(incidentId) => mutate('resolve_incident', { incidentId })}
            />}

            <ChaosReadiness readiness={dashboard.chaosReadiness} />

            <section className={styles.report} aria-labelledby="pilot-report-title">
              <div className={styles.reportHead}>
                <div><span>7–14 day decision gate</span><h3 id="pilot-report-title">Báo cáo Go / No-go</h3></div>
                <span className={styles[`report_${reportTone}`]}>{reportCode}</span>
              </div>
              <p className={styles.reportSummary}><strong>{reportCopy}</strong><span>{report?.observedDays || 0} ngày kể từ lúc kích hoạt · trạng thái cửa sổ: {report?.observationWindow?.status || 'not_started'}</span></p>
              <div className={styles.criteria}>
                {(report?.criteria || []).map((criterion) => <div key={criterion.id} data-passed={criterion.passed || undefined}><span><Icon name={criterion.passed ? 'check' : 'alert'} size={13} /></span><p><strong>{criterion.label}</strong><small>{criterion.detail}</small></p></div>)}
                {!report?.criteria?.length && <p className={styles.emptyReport}>Kích hoạt wave để bắt đầu cửa sổ đánh giá. Hệ thống không đo thời lượng làm việc của từng người.</p>}
              </div>
            </section>

            {history.length > 0 && <details className={styles.history}><summary>Lịch sử wave ({dashboard.operations.waves.length})</summary><div>{history.map((item) => <p key={item.id}><span className={styles[`status_${STATUS[item.status]?.[1]}`]}>{STATUS[item.status]?.[0]}</span><strong>{item.name}</strong><small>{item.finalReport?.recommendation?.toUpperCase() || `policy v${item.policyVersion}`} · {formatDate(item.completedAt || item.updatedAt)}</small></p>)}</div></details>}

            <p className={styles.privacy}><Icon name="shield" size={15} /> Adoption, fallback, feedback và report chỉ là số tổng hợp. Không lưu thời lượng, lịch sử duyệt, điểm hiệu suất hoặc bảng xếp hạng cá nhân.</p>
          </>
        )}
      </div>

      {confirm && <ConfirmDialog
        msg={confirm.type === 'pause'
          ? 'Tạm dừng wave sẽ bật kill switch và đưa toàn bộ cohort về ERP. Dữ liệu và migration được giữ nguyên.'
          : confirm.type === 'critical_incident'
            ? 'Incident critical sẽ được ghi nhận và kill switch sẽ đưa toàn bộ cohort về ERP trong cùng transaction. Không xóa dữ liệu hoặc rollback migration.'
            : 'Hoàn tất wave sẽ lưu snapshot Go/No-go. Nếu wave đang active, Realm sẽ đóng và ERP trở thành fallback.'}
        yesLabel={confirm.type === 'pause' ? 'Tạm dừng & về ERP' : confirm.type === 'critical_incident' ? 'Ghi nhận & rollback ERP' : 'Hoàn tất wave'}
        onClose={() => setConfirm(null)}
        onYes={() => confirm.type === 'critical_incident'
          ? mutate('report_incident', { category: confirm.category, severity: confirm.severity })
          : mutate(confirm.type)}
      />}
    </section>
  );
}
