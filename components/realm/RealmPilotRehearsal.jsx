'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AsyncButton, Icon, useToast } from '@/components/ui';
import styles from './realm-pilot-rehearsal.module.css';

const REHEARSAL_EVENT = 'crmegoric:pilot-rehearsal-changed';
const PILOT_OPERATIONS_EVENT = 'crmegoric:pilot-operations-changed';
const STATUS = {
  draft: ['Bản nháp', 'draft'],
  awaiting_approval: ['Chờ niêm phong', 'awaiting'],
  sealed: ['Đã niêm phong', 'sealed'],
};

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function draftsFrom(payload) {
  return Object.fromEntries((payload?.rehearsals?.currentRun?.checks || []).map((check) => [check.id, {
    result: check.result,
    evidence: check.evidence || '',
  }]));
}

export default function RealmPilotRehearsal() {
  const toast = useToast();
  const [state, setState] = useState({ loading: true, error: '', dashboard: null });
  const [name, setName] = useState('Realm launch rehearsal 01');
  const [drafts, setDrafts] = useState({});
  const [decisionNote, setDecisionNote] = useState('');

  const applyPayload = useCallback((payload) => {
    setState({ loading: false, error: '', dashboard: payload });
    setDrafts(draftsFrom(payload));
  }, []);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const response = await fetch('/api/realm-demo/pilot/rehearsal', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Không thể tải launch rehearsal.');
      applyPayload(payload);
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message || 'Không thể tải launch rehearsal.' }));
    }
  }, [applyPayload]);

  useEffect(() => {
    load();
    const refresh = () => load({ quiet: true });
    window.addEventListener(REHEARSAL_EVENT, refresh);
    window.addEventListener(PILOT_OPERATIONS_EVENT, refresh);
    return () => {
      window.removeEventListener(REHEARSAL_EVENT, refresh);
      window.removeEventListener(PILOT_OPERATIONS_EVENT, refresh);
    };
  }, [load]);

  const mutate = async (action, extra = {}) => {
    const dashboard = state.dashboard;
    const run = dashboard?.rehearsals?.currentRun;
    const response = await fetch('/api/realm-demo/pilot/rehearsal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        expectedVersion: dashboard?.rehearsals?.version,
        runId: run?.id,
        ...extra,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 409) await load({ quiet: true });
      toast(payload.error || 'Không thể cập nhật launch rehearsal.', 'error');
      return false;
    }
    applyPayload(payload);
    setDecisionNote('');
    window.dispatchEvent(new CustomEvent(REHEARSAL_EVENT));
    window.dispatchEvent(new CustomEvent(PILOT_OPERATIONS_EVENT));
    const messages = {
      create: 'Đã tạo launch rehearsal nháp.',
      attest: 'Đã lưu evidence vận hành.',
      submit: 'Đã gửi rehearsal cho Director khác niêm phong.',
      approve: 'Rehearsal đã niêm phong và có hiệu lực 24 giờ.',
      reject: 'Đã trả rehearsal về maker.',
    };
    toast(messages[action] || 'Đã cập nhật launch rehearsal.');
    return true;
  };

  const dashboard = state.dashboard;
  const run = dashboard?.rehearsals?.currentRun;
  const sealedRun = useMemo(() => (
    dashboard?.rehearsals?.runs?.find((item) => item.id === dashboard?.gate?.rehearsalId) || null
  ), [dashboard]);
  const remediation = (dashboard?.remediation || []).filter((item) => !item.passed);
  const history = (dashboard?.rehearsals?.runs || []).filter((item) => item.id !== run?.id).slice(0, 4);

  return (
    <section className={`card ${styles.card}`} aria-labelledby="realm-pilot-rehearsal-title">
      <div className={`card-head ${styles.header}`}>
        <span className={styles.icon}><Icon name="shield" size={18} /></span>
        <div>
          <span className="card-title" id="realm-pilot-rehearsal-title">Launch Rehearsal · Sealed Evidence</span>
          <p>Rehearsal ERP/Realm có maker–checker; chỉ evidence vận hành tổng hợp, không chấm điểm nhân sự.</p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => load()} disabled={state.loading} aria-label="Tải lại launch rehearsal"><Icon name="repeat" size={14} /><span>Tải lại</span></button>
      </div>

      <div className={`card-body ${styles.body}`}>
        {state.loading ? (
          <div className={styles.loading} aria-live="polite" aria-busy="true">Đang tải launch rehearsal…</div>
        ) : state.error ? (
          <div className={styles.error} role="alert"><span>{state.error}</span><button type="button" className="btn btn-outline btn-sm" onClick={() => load()}>Thử lại</button></div>
        ) : (
          <>
            <section className={styles.preflight} aria-labelledby="rehearsal-preflight-title">
              <div className={styles.sectionHead}>
                <div><span>Live controls</span><h3 id="rehearsal-preflight-title">Preflight tự động</h3></div>
                <strong>{dashboard.autoChecks.filter((check) => check.passed).length}/{dashboard.autoChecks.length} đạt</strong>
              </div>
              <div className={styles.autoChecks}>
                {dashboard.autoChecks.map((check) => <div key={check.id} data-passed={check.passed || undefined}><span><Icon name={check.passed ? 'check' : 'alert'} size={14} /></span><p><strong>{check.label}</strong><small>{check.detail}</small></p></div>)}
              </div>
              {remediation.length ? (
                <div className={styles.remediation} aria-label="Hướng xử lý readiness">
                  {remediation.map((item) => <div key={item.id}><span><Icon name={item.blocking ? 'alert' : 'clock'} size={14} /></span><p><strong>{item.label}</strong><small>{item.action}</small></p><a className="btn btn-outline btn-sm" href={item.target}>Xử lý</a></div>)}
                </div>
              ) : <p className={styles.readyMessage}><Icon name="check" size={14} /> Mọi readiness gate hiện đã đạt.</p>}
            </section>

            {run ? (
              <section className={styles.run} aria-labelledby={`rehearsal-${run.id}`}>
                <div className={styles.runHead}>
                  <div><span>Current rehearsal</span><h3 id={`rehearsal-${run.id}`}>{run.name}</h3><p>Policy v{run.policyVersion} · maker {run.submittedByName || run.createdByName}</p></div>
                  <span className={styles[`status_${STATUS[run.status]?.[1]}`]}>{STATUS[run.status]?.[0]}</span>
                </div>

                <div className={styles.progress} aria-label="Tiến độ kịch bản rehearsal"><strong>{run.summary.passed}/{run.summary.total}</strong><span>kịch bản đạt</span><div><i style={{ width: `${Math.round((run.summary.passed / run.summary.total) * 100)}%` }} /></div></div>

                <div className={styles.scenarios}>
                  {run.checks.map((check) => {
                    const draft = drafts[check.id] || { result: check.result, evidence: check.evidence || '' };
                    const dirty = draft.result !== check.result || draft.evidence.trim() !== (check.evidence || '');
                    return (
                      <fieldset key={check.id} className={styles.scenario} data-result={draft.result}>
                        <legend>{check.label}</legend>
                        <p>{check.detail}</p>
                        {run.canEdit ? <div className={styles.scenarioForm}>
                          <label htmlFor={`result-${check.id}`}><span>Kết quả</span><select id={`result-${check.id}`} value={draft.result} onChange={(event) => setDrafts((current) => ({ ...current, [check.id]: { ...draft, result: event.target.value } }))}><option value="pending">Chưa kiểm tra</option><option value="passed">Đạt</option><option value="failed">Không đạt</option></select></label>
                          <label htmlFor={`evidence-${check.id}`}><span>Evidence vận hành</span><input id={`evidence-${check.id}`} maxLength={240} value={draft.evidence} onChange={(event) => setDrafts((current) => ({ ...current, [check.id]: { ...draft, evidence: event.target.value } }))} placeholder="VD: notification hai chiều đạt; không ghi tên/nội dung record" /></label>
                          <AsyncButton className="btn btn-outline btn-sm" pendingLabel="Đang lưu…" disabled={!dirty || (draft.result !== 'pending' && draft.evidence.trim().length < 8)} onClick={() => mutate('attest', { scenarioId: check.id, result: draft.result, evidence: draft.evidence.trim() })}>Lưu</AsyncButton>
                        </div> : <div className={styles.evidence}><span><Icon name={check.result === 'passed' ? 'check' : check.result === 'failed' ? 'alert' : 'clock'} size={14} />{check.result === 'passed' ? 'Đạt' : check.result === 'failed' ? 'Không đạt' : 'Chưa kiểm tra'}</span><p>{check.evidence || 'Chưa có evidence.'}</p></div>}
                      </fieldset>
                    );
                  })}
                </div>

                {run.decisionNote && <p className={styles.note}><Icon name="note" size={14} /> {run.decisionNote}</p>}
                <div className={styles.actions}>
                  <span aria-live="polite">{run.status === 'draft' ? dashboard.readyToSubmit ? 'Đủ điều kiện gửi checker.' : 'Hoàn tất checklist và mọi live control trước khi gửi.' : run.canApprove ? 'Bạn là checker độc lập cho rehearsal này.' : 'Đang chờ một Director khác niêm phong.'}</span>
                  <div>
                    {run.status === 'draft' && run.canEdit && <AsyncButton className="btn btn-primary" pendingLabel="Đang gửi…" disabled={!dashboard.readyToSubmit} onClick={() => mutate('submit')}>Gửi Director niêm phong</AsyncButton>}
                    {run.status === 'awaiting_approval' && run.canApprove && <>
                      <label htmlFor="rehearsal-decision-note"><span>Ghi chú checker</span><input id="rehearsal-decision-note" maxLength={240} value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} placeholder="Không ghi dữ liệu cá nhân" /></label>
                      <AsyncButton className="btn btn-outline" pendingLabel="Đang trả…" disabled={decisionNote.trim().length < 5} onClick={() => mutate('reject', { note: decisionNote.trim() })}>Trả về maker</AsyncButton>
                      <AsyncButton className="btn btn-primary" pendingLabel="Đang niêm phong…" onClick={() => mutate('approve', { note: decisionNote.trim() })}>Niêm phong 24 giờ</AsyncButton>
                    </>}
                  </div>
                </div>
              </section>
            ) : dashboard.gate.readyForWave && sealedRun ? (
              <section className={styles.sealed} aria-labelledby="sealed-rehearsal-title">
                <span><Icon name="shield" size={18} /></span>
                <div><h3 id="sealed-rehearsal-title">{sealedRun.name}</h3><p>Niêm phong bởi {sealedRun.sealedByName} · hết hạn {formatDate(sealedRun.expiresAt)} · policy v{sealedRun.policyVersion}</p></div>
                <strong>READY</strong>
              </section>
            ) : (
              <section className={styles.creator} aria-labelledby="rehearsal-create-title">
                <div><span>Rehearsal packet</span><h3 id="rehearsal-create-title">Tạo launch rehearsal</h3><p>Chỉ tạo sau Controlled Launch về pilot; không tự đổi policy hoặc mời cohort.</p></div>
                <label htmlFor="rehearsal-name"><span>Tên rehearsal</span><input id="rehearsal-name" value={name} minLength={3} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
                <AsyncButton className="btn btn-primary" pendingLabel="Đang tạo…" disabled={!dashboard.canCreate || name.trim().length < 3} onClick={() => mutate('create', { name: name.trim() })}><Icon name="plus" size={14} /> Tạo bản nháp</AsyncButton>
                {!dashboard.canCreate && <p className={styles.creatorHint}><Icon name="shield" size={14} /> {dashboard.policy.mode !== 'pilot' ? 'Dùng Controlled Launch phía trên để đưa policy về Pilot theo cohort trước.' : dashboard.gate.reason}</p>}
              </section>
            )}

            {history.length > 0 && <details className={styles.history}><summary>Lịch sử rehearsal ({dashboard.rehearsals.runs.length})</summary><div>{history.map((item) => <p key={item.id}><span className={styles[`status_${STATUS[item.status]?.[1]}`]}>{STATUS[item.status]?.[0]}</span><strong>{item.name}</strong><small>policy v{item.policyVersion} · {formatDate(item.sealedAt || item.updatedAt)}</small></p>)}</div></details>}
            <p className={styles.privacy}><Icon name="shield" size={15} /> Evidence chỉ mô tả kết quả vận hành. Không ghi tên cohort, nội dung record, thời lượng, điểm hiệu suất hoặc lịch sử duyệt cá nhân.</p>
          </>
        )}
      </div>
    </section>
  );
}
