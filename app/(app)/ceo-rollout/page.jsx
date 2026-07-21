'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { AsyncButton, Forbidden, Icon, Modal, useToast } from '@/components/ui';
import { useLanguage } from '@/components/LanguageProvider';
import { rolesOf } from '@/lib/perm';
import styles from './rollout.module.css';

const RINGS = ['local_staging', 'read_only', 'ceo_sso', 'messaging', 'commands'];
const EVIDENCE_LABELS = {
  backup: ['Bản sao lưu', 'Backup'], restore_test: ['Kiểm thử restore', 'Restore test'], canary: ['Canary', 'Canary'],
  reconciliation: ['Đối soát', 'Reconciliation'], rollback: ['Diễn tập rollback', 'Rollback rehearsal'],
  security_review: ['Duyệt bảo mật', 'Security review'], privacy_review: ['Duyệt riêng tư', 'Privacy review'],
  maker_checker: ['Maker / checker', 'Maker / checker'], finance_review: ['Duyệt tài chính độc lập', 'Independent finance review'],
};

const COPY = {
  vi: {
    eyebrow: 'CEO-9 · PILOT & ROLLOUT', title: 'Trung tâm phát hành bốn công ty',
    intro: 'Điều khiển rollout theo từng ring và từng entity. Chỉ trạng thái ủy quyền của CEO Portal thay đổi; màn hình này không deploy và không ghi database nghiệp vụ.',
    refresh: 'Tải lại', loading: 'Đang kiểm tra rollout…', loadError: 'Không thể tải trạng thái rollout.', forbidden: 'Chỉ Director được truy cập trung tâm rollout.',
    hold: 'CEO-0 HOLD', go: 'Đã có phê duyệt', maxRing: 'Ring tối đa', approval: 'Mã phê duyệt', expires: 'Hết hạn', noApproval: 'Chưa có production approval hợp lệ',
    order: 'Thứ tự rollout bắt buộc', orderHelp: 'Read-only → CEO SSO → messaging → allowlisted commands. Không được nhảy ring.',
    entities: 'Canary theo từng công ty', entitiesHelp: 'Mỗi entity có evidence, version và receipt riêng. Lỗi của một entity không mở quyền cho entity khác.',
    current: 'Ring hiện tại', next: 'Ring kế tiếp', state: 'Trạng thái', version: 'Phiên bản', evidence: 'Evidence cho ring', complete: 'Đủ evidence', incomplete: 'Thiếu evidence',
    addEvidence: 'Ghi evidence', activate: 'Kích hoạt ring', promote: 'Promote ring kế tiếp', pause: 'Tạm dừng', rollback: 'Rollback', receipts: 'Receipt gần nhất', none: 'Chưa có',
    active: 'Đang hoạt động', paused: 'Đã tạm dừng', holdState: 'Đang HOLD', migration: 'Cần chạy migration CEO-9',
    egolive: 'Payout và settlement vẫn chỉ xử lý trong ERP Egolive. Command ring cần reviewer tài chính độc lập.',
    evidenceTitle: 'Ghi evidence đã kiểm chứng', ring: 'Ring', kind: 'Loại evidence', reference: 'Artifact URL', checksum: 'SHA-256', observed: 'Thời điểm kiểm chứng', evidenceExpires: 'Evidence hết hạn', save: 'Lưu evidence', saving: 'Đang lưu…',
    transitionTitle: 'Xác nhận thay đổi rollout', reason: 'Lý do vận hành', confirmation: 'Nhập chính xác', execute: 'Ghi receipt và thay đổi gate', executing: 'Đang xử lý…', cancel: 'Hủy',
    productionHold: 'Production vẫn HOLD. Hoàn tất CEO-0 backup/restore và cấp change-window approval trước khi promote.',
    saved: 'Đã ghi evidence.', transitioned: 'Đã ghi rollout receipt.',
  },
  en: {
    eyebrow: 'CEO-9 · PILOT & ROLLOUT', title: 'Four-company release control center',
    intro: 'Control rollout per ring and per entity. Only CEO Portal authorization state changes; this screen does not deploy or write an entity business database.',
    refresh: 'Refresh', loading: 'Checking rollout posture…', loadError: 'Unable to load rollout posture.', forbidden: 'Only Directors may access rollout control.',
    hold: 'CEO-0 HOLD', go: 'Approved', maxRing: 'Maximum ring', approval: 'Approval ID', expires: 'Expires', noApproval: 'No valid production approval',
    order: 'Mandatory rollout order', orderHelp: 'Read-only → CEO SSO → messaging → allowlisted commands. Rings cannot be skipped.',
    entities: 'Per-company canary', entitiesHelp: 'Each entity has separate evidence, version and receipts. A failing entity never unlocks another entity.',
    current: 'Current ring', next: 'Next ring', state: 'State', version: 'Version', evidence: 'Evidence for ring', complete: 'Evidence complete', incomplete: 'Evidence missing',
    addEvidence: 'Record evidence', activate: 'Activate ring', promote: 'Promote next ring', pause: 'Pause', rollback: 'Rollback', receipts: 'Latest receipt', none: 'None',
    active: 'Active', paused: 'Paused', holdState: 'On hold', migration: 'CEO-9 migration required',
    egolive: 'Payout and settlement remain local to Egolive ERP. The command ring requires an independent finance reviewer.',
    evidenceTitle: 'Record verified evidence', ring: 'Ring', kind: 'Evidence type', reference: 'Artifact URL', checksum: 'SHA-256', observed: 'Observed at', evidenceExpires: 'Evidence expires', save: 'Save evidence', saving: 'Saving…',
    transitionTitle: 'Confirm rollout transition', reason: 'Operational reason', confirmation: 'Type exactly', execute: 'Write receipt and change gate', executing: 'Processing…', cancel: 'Cancel',
    productionHold: 'Production remains on HOLD. Complete CEO-0 backup/restore work and issue a change-window approval before promotion.',
    saved: 'Evidence recorded.', transitioned: 'Rollout receipt recorded.',
  },
};

function dateInput(date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function ringLabel(ring, locale) {
  const labels = {
    local_staging: ['Local / staging', 'Local / staging'], read_only: ['Chỉ đọc', 'Read-only'],
    ceo_sso: ['SSO riêng CEO', 'CEO-only SSO'], messaging: ['Nhắn tin', 'Messaging'], commands: ['Lệnh allowlist', 'Allowlisted commands'],
  };
  return (labels[ring] || [ring, ring])[locale === 'en' ? 1 : 0];
}

function expectedConfirmation(action, entityId, targetRing) {
  if (action === 'pause') return `PAUSE ${entityId}`;
  if (action === 'rollback') return `ROLLBACK ${entityId} TO ${targetRing}`;
  if (action === 'promote') return `PROMOTE ${entityId} TO ${targetRing}`;
  return `ACTIVATE ${entityId} ${targetRing}`;
}

export default function CeoRolloutPage() {
  const { data: session, status } = useSession();
  const { locale } = useLanguage();
  const c = COPY[locale] || COPY.vi;
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [evidenceTarget, setEvidenceTarget] = useState(null);
  const [transitionTarget, setTransitionTarget] = useState(null);
  const [evidenceForm, setEvidenceForm] = useState({ kind: 'backup', reference: '', checksum: '', observedAt: dateInput(new Date()), expiresAt: dateInput(new Date(Date.now() + 7 * 24 * 60 * 60_000)) });
  const [transitionForm, setTransitionForm] = useState({ reason: '', confirmation: '' });
  const isDirector = useMemo(() => rolesOf(session?.user).includes('DIRECTOR'), [session]);

  const load = useCallback(async () => {
    setError('');
    const response = await fetch('/api/ceo/v1/rollout', { cache: 'no-store' }).catch(() => null);
    if (response?.status === 403) { setForbidden(true); return; }
    const body = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) { setError(body.error || c.loadError); return; }
    setData(body);
  }, [c.loadError]);

  useEffect(() => { if (status === 'authenticated' && isDirector) load(); }, [isDirector, load, status]);

  const openEvidence = (entity) => {
    const ring = entity.state.status === 'active' && entity.nextRing ? entity.nextRing : entity.state.currentRing;
    const required = ring === entity.state.currentRing ? entity.currentEvidence.required : entity.nextEvidence?.required || [];
    setEvidenceForm((current) => ({ ...current, kind: required[0] || 'backup' }));
    setEvidenceTarget({ entity, ring, required });
  };

  const submitEvidence = async () => {
    const response = await fetch('/api/ceo/v1/rollout/evidence', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId: evidenceTarget.entity.id, ring: evidenceTarget.ring, expectedVersion: evidenceTarget.entity.state.recordVersion, ...evidenceForm, observedAt: new Date(evidenceForm.observedAt).toISOString(), expiresAt: new Date(evidenceForm.expiresAt).toISOString() }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || c.loadError);
    setEvidenceTarget(null);
    setEvidenceForm((current) => ({ ...current, reference: '', checksum: '' }));
    toast?.(c.saved);
    await load();
  };

  const openTransition = (entity, action) => {
    const index = RINGS.indexOf(entity.state.currentRing);
    const targetRing = action === 'promote' ? entity.nextRing : action === 'rollback' ? RINGS[Math.max(0, index - 1)] : entity.state.currentRing;
    setTransitionTarget({ entity, action, targetRing, phrase: expectedConfirmation(action, entity.id, targetRing) });
    setTransitionForm({ reason: '', confirmation: '' });
  };

  const submitTransition = async () => {
    const { entity, action, targetRing } = transitionTarget;
    const response = await fetch(`/api/ceo/v1/rollout/${encodeURIComponent(entity.id)}/transition`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, targetRing: action === 'pause' ? undefined : targetRing, expectedVersion: entity.state.recordVersion, ...transitionForm }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || c.loadError);
    setTransitionTarget(null);
    toast?.(c.transitioned);
    await load();
  };

  if (status === 'loading') return <main className={styles.page}><div className={styles.loading}>{c.loading}</div></main>;
  if (status === 'authenticated' && (!isDirector || forbidden)) return <Forbidden message={c.forbidden} />;

  const approval = data?.policy?.production;
  return <main className={styles.page} data-no-i18n>
    <header className={styles.hero}>
      <div><p className={styles.eyebrow}>{c.eyebrow}</p><h1>{c.title}</h1><p>{c.intro}</p></div>
      <button type="button" className="btn btn-outline" onClick={load}><Icon name="repeat" size={16} />{c.refresh}</button>
    </header>

    {error && <div className={styles.error} role="alert"><Icon name="alert" size={19} /><span>{error}</span></div>}
    {!data && !error && <div className={styles.loading}>{c.loading}</div>}

    {data && <>
      <section className={`${styles.approval} ${approval.active ? styles.approved : styles.blocked}`} role="status">
        <Icon name={approval.active ? 'check' : 'alert'} size={22} />
        <div><strong>{approval.active ? c.go : c.hold}</strong><p>{approval.active ? `${c.approval}: ${approval.approvalId} · ${c.maxRing}: ${ringLabel(approval.maxRing, locale)}` : c.productionHold}</p></div>
        <span>{approval.expiresAt ? `${c.expires}: ${new Date(approval.expiresAt).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN')}` : c.noApproval}</span>
      </section>

      <section className="card">
        <div className={styles.sectionHead}><div><p className={styles.eyebrow}>PROGRESSIVE DELIVERY</p><h2>{c.order}</h2><p>{c.orderHelp}</p></div><span className="badge">fail-closed</span></div>
        <ol className={styles.rings}>{RINGS.map((ring, index) => <li key={ring}><span>{index + 1}</span><strong>{ringLabel(ring, locale)}</strong><small>{data.policy.rings[ring].capabilities.length} capabilities</small></li>)}</ol>
      </section>

      <section className="card">
        <div className={styles.sectionHead}><div><p className={styles.eyebrow}>CANARY RINGS</p><h2>{c.entities}</h2><p>{c.entitiesHelp}</p></div><span className="badge b-green">4 entities</span></div>
        <div className={styles.entityGrid}>{data.entities.map((entity) => {
          const currentEvidence = entity.state.status === 'active' && entity.nextRing ? entity.nextEvidence : entity.currentEvidence;
          const evidenceRing = entity.state.status === 'active' && entity.nextRing ? entity.nextRing : entity.state.currentRing;
          const migrationRequired = entity.state.migrationRequired;
          return <article className={styles.entity} key={entity.id}>
            <header><div className={styles.monogram}>{entity.id.slice(0, 2).toUpperCase()}</div><div><h3>{entity.displayName}</h3><span>{entity.environment} · {entity.id}</span></div><strong className={`${styles.state} ${styles[entity.state.status] || ''}`}>{migrationRequired ? c.migration : entity.state.status === 'active' ? c.active : entity.state.status === 'paused' ? c.paused : c.holdState}</strong></header>
            <dl><div><dt>{c.current}</dt><dd>{ringLabel(entity.state.currentRing, locale)}</dd></div><div><dt>{c.next}</dt><dd>{entity.nextRing ? ringLabel(entity.nextRing, locale) : '—'}</dd></div><div><dt>{c.version}</dt><dd>{entity.state.recordVersion}</dd></div><div><dt>{c.state}</dt><dd>{entity.state.status}</dd></div></dl>
            {entity.id === 'egolive' && <p className={styles.restriction}><Icon name="shield" size={16} />{c.egolive}</p>}
            <div className={styles.evidenceHead}><div><strong>{c.evidence}: {ringLabel(evidenceRing, locale)}</strong><span className={currentEvidence?.complete ? styles.good : styles.warn}>{currentEvidence?.complete ? c.complete : c.incomplete}</span></div><button type="button" className="btn btn-outline" disabled={migrationRequired} onClick={() => openEvidence(entity)}><Icon name="note" size={16} />{c.addEvidence}</button></div>
            <ul className={styles.checklist}>{(currentEvidence?.required || []).map((kind) => {
              const exists = currentEvidence.evidence.some((item) => item.kind === kind);
              return <li key={kind} className={exists ? styles.checked : ''}><Icon name={exists ? 'check' : 'clock'} size={15} /><span>{(EVIDENCE_LABELS[kind] || [kind, kind])[locale === 'en' ? 1 : 0]}</span></li>;
            })}</ul>
            <div className={styles.actions}>
              {entity.state.status !== 'active' && <button type="button" className="btn btn-primary" disabled={migrationRequired || !currentEvidence?.complete} onClick={() => openTransition(entity, 'activate')}><Icon name="check" size={16} />{c.activate}</button>}
              {entity.state.status === 'active' && entity.nextRing && <button type="button" className="btn btn-primary" disabled={!currentEvidence?.complete || (!approval.active && entity.nextRing !== 'local_staging')} onClick={() => openTransition(entity, 'promote')}><Icon name="link" size={16} />{c.promote}</button>}
              {entity.state.status === 'active' && <button type="button" className="btn btn-outline" onClick={() => openTransition(entity, 'pause')}>{c.pause}</button>}
              {RINGS.indexOf(entity.state.currentRing) > 0 && <button type="button" className="btn btn-outline" onClick={() => openTransition(entity, 'rollback')}>{c.rollback}</button>}
            </div>
            <div className={styles.receipt}><span>{c.receipts}</span><strong>{entity.receipts[0]?.id || c.none}</strong><small>{entity.receipts[0] ? `${entity.receipts[0].action} · ${new Date(entity.receipts[0].createdAt).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN')}` : ''}</small></div>
          </article>;
        })}</div>
      </section>
    </>}

    {evidenceTarget && <Modal title={c.evidenceTitle} onClose={() => setEvidenceTarget(null)} footer={<><button type="button" className="btn btn-outline" onClick={() => setEvidenceTarget(null)}>{c.cancel}</button><AsyncButton type="button" className="btn btn-primary" pendingLabel={c.saving} disabled={!evidenceForm.reference || !evidenceForm.checksum} onClick={submitEvidence}>{c.save}</AsyncButton></>}>
      <div className={styles.form}>
        <label>{c.ring}<input value={ringLabel(evidenceTarget.ring, locale)} readOnly /></label>
        <label>{c.kind}<select value={evidenceForm.kind} onChange={(event) => setEvidenceForm((current) => ({ ...current, kind: event.target.value }))}>{evidenceTarget.required.map((kind) => <option key={kind} value={kind}>{(EVIDENCE_LABELS[kind] || [kind, kind])[locale === 'en' ? 1 : 0]}</option>)}</select></label>
        <label>{c.reference}<input type="url" value={evidenceForm.reference} onChange={(event) => setEvidenceForm((current) => ({ ...current, reference: event.target.value }))} placeholder="artifact://backup/manifest.json" /></label>
        <label>{c.checksum}<input value={evidenceForm.checksum} onChange={(event) => setEvidenceForm((current) => ({ ...current, checksum: event.target.value }))} placeholder="sha256:…" autoComplete="off" /></label>
        <div className={styles.formColumns}><label>{c.observed}<input type="datetime-local" value={evidenceForm.observedAt} onChange={(event) => setEvidenceForm((current) => ({ ...current, observedAt: event.target.value }))} /></label><label>{c.evidenceExpires}<input type="datetime-local" value={evidenceForm.expiresAt} onChange={(event) => setEvidenceForm((current) => ({ ...current, expiresAt: event.target.value }))} /></label></div>
      </div>
    </Modal>}

    {transitionTarget && <Modal title={c.transitionTitle} onClose={() => setTransitionTarget(null)} footer={<><button type="button" className="btn btn-outline" onClick={() => setTransitionTarget(null)}>{c.cancel}</button><AsyncButton type="button" className={transitionTarget.action === 'rollback' || transitionTarget.action === 'pause' ? 'btn btn-danger' : 'btn btn-primary'} pendingLabel={c.executing} disabled={transitionForm.reason.trim().length < 8 || transitionForm.confirmation !== transitionTarget.phrase} onClick={submitTransition}>{c.execute}</AsyncButton></>}>
      <div className={styles.form}><p className={styles.transitionSummary}>{transitionTarget.entity.displayName}: {ringLabel(transitionTarget.entity.state.currentRing, locale)} → {ringLabel(transitionTarget.targetRing, locale)}</p><label>{c.reason}<textarea rows="3" maxLength="240" value={transitionForm.reason} onChange={(event) => setTransitionForm((current) => ({ ...current, reason: event.target.value }))} /></label><label>{c.confirmation}<code>{transitionTarget.phrase}</code><input value={transitionForm.confirmation} onChange={(event) => setTransitionForm((current) => ({ ...current, confirmation: event.target.value }))} autoComplete="off" /></label></div>
    </Modal>}
  </main>;
}
