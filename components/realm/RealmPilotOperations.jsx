'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AsyncButton, ConfirmDialog, Icon, useToast } from '@/components/ui';
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

export default function RealmPilotOperations() {
  const toast = useToast();
  const [state, setState] = useState({ loading: true, error: '', dashboard: null });
  const [name, setName] = useState('Pilot wave 01');
  const [durationDays, setDurationDays] = useState(7);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const response = await fetch('/api/realm-demo/pilot/operations', { cache: 'no-store' });
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
    const response = await fetch('/api/realm-demo/pilot/operations', {
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
      toast(payload.error || 'Không thể cập nhật pilot wave.', 'error');
      return false;
    }
    setState({ loading: false, error: '', dashboard: payload });
    window.dispatchEvent(new CustomEvent(PILOT_OPERATIONS_EVENT));
    const messages = {
      create: 'Đã tạo bản nháp pilot wave.',
      submit: 'Đã gửi wave cho Director khác duyệt.',
      approve: 'Wave đã kích hoạt và invitation đã gửi qua ERP.',
      reject: 'Đã trả wave về bản nháp.',
      pause: 'Đã tạm dừng wave và bật ERP fallback.',
      complete: 'Đã hoàn tất wave và giữ nguyên toàn bộ dữ liệu.',
    };
    toast(messages[action] || 'Đã cập nhật Pilot Operations.');
    return true;
  };

  const dashboard = state.dashboard;
  const wave = dashboard?.operations?.currentWave;
  const hasOpenWave = wave && OPEN_STATUSES.has(wave.status);
  const metrics = dashboard?.metrics;
  const readiness = dashboard?.readiness;
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
        {state.loading ? (
          <div className={styles.loading} aria-live="polite" aria-busy="true">Đang tải bàn điều phối pilot…</div>
        ) : state.error ? (
          <div className={styles.error} role="alert"><span>{state.error}</span><button type="button" className="btn btn-outline btn-sm" onClick={() => load()}>Thử lại</button></div>
        ) : (
          <>
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
                </div>
                {wave.decisionNote && <p className={styles.note}><Icon name="note" size={14} /> {wave.decisionNote}</p>}
                <div className={styles.waveActions}>
                  <span aria-live="polite">
                    {wave.status === 'draft' && (wave.policyVersion === dashboard.policy.version ? 'Sẵn sàng kiểm tra readiness và gửi duyệt.' : 'Policy đã đổi; hãy đóng wave cũ.')}
                    {wave.status === 'awaiting_approval' && (wave.canApprove ? 'Bạn là checker hợp lệ cho wave này.' : 'Đang chờ một Director khác duyệt.')}
                    {wave.status === 'active' && 'Invitation đã gửi; ERP vẫn là fallback.'}
                    {wave.status === 'paused' && 'Kill switch đang bật; hoàn tất wave để lưu báo cáo.'}
                  </span>
                  <div>
                    {wave.status === 'draft' && <AsyncButton className="btn btn-primary" pendingLabel="Đang gửi…" disabled={!readiness.ready || wave.policyVersion !== dashboard.policy.version} onClick={() => mutate('submit')}>Gửi Director duyệt</AsyncButton>}
                    {wave.status === 'awaiting_approval' && wave.canApprove && <><AsyncButton className="btn btn-outline" pendingLabel="Đang trả về…" onClick={() => mutate('reject')}>Trả về nháp</AsyncButton><AsyncButton className="btn btn-primary" pendingLabel="Đang kích hoạt…" disabled={!readiness.ready} onClick={() => mutate('approve')}>Duyệt &amp; mời cohort</AsyncButton></>}
                    {wave.status === 'active' && <><button type="button" className="btn btn-outline" onClick={() => setConfirm('pause')}>Tạm dừng</button><button type="button" className="btn btn-primary" onClick={() => setConfirm('complete')}>Hoàn tất wave</button></>}
                    {['draft', 'awaiting_approval', 'paused'].includes(wave.status) && <button type="button" className="btn btn-outline" onClick={() => setConfirm('complete')}>Đóng wave</button>}
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
        msg={confirm === 'pause' ? 'Tạm dừng wave sẽ bật kill switch và đưa toàn bộ cohort về ERP. Dữ liệu và migration được giữ nguyên.' : 'Hoàn tất wave sẽ lưu snapshot Go/No-go. Nếu wave đang active, Realm sẽ đóng và ERP trở thành fallback.'}
        yesLabel={confirm === 'pause' ? 'Tạm dừng & về ERP' : 'Hoàn tất wave'}
        onClose={() => setConfirm(null)}
        onYes={() => mutate(confirm)}
      />}
    </section>
  );
}
