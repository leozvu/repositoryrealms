'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon, useToast, EmptyState, Modal } from '@/components/ui';
import { money, fmtDate, parseItems } from '@/lib/format';
import styles from './leozops-review.module.css';

const TYPE_META = {
  quote: ['Báo giá', 'quotes'], expense: ['Khoản chi', 'finance'],
  leave: ['Nghỉ phép', 'staff'], vendorbill: ['Trả nhà cung cấp', 'wallet'],
  task_handoff: ['Bàn giao công việc', 'tasks'],
  realm_launch: ['Mở rộng Realm', 'shield'],
};

const LEOZOPS_SIGNAL_LABELS = {
  unassigned_active_leads: 'Lead đang mở chưa có người phụ trách',
  overdue_expected_close: 'Ngày dự kiến chốt đã quá hạn',
  late_stage_missing_close: 'Lead giai đoạn cuối thiếu ngày chốt',
  aging_active_leads: 'Lead đang mở vượt ngưỡng tuổi',
  missing_lead_source: 'Thiếu nguồn lead',
  unknown_funnel_stage: 'Stage nằm ngoài funnel chuẩn',
  no_active_leads: 'Không có lead đang mở',
};

const LEOZOPS_ACTION_LABELS = {
  review_lead_assignment: 'Rà soát phân công lead',
  review_expected_close: 'Rà soát ngày dự kiến chốt',
  complete_expected_close: 'Bổ sung ngày dự kiến chốt',
  review_aging_leads: 'Rà soát lead tồn lâu',
  complete_lead_source: 'Bổ sung nguồn lead',
  review_funnel_stage: 'Rà soát stage funnel',
  review_funnel_sync: 'Rà soát đồng bộ funnel',
};

const REJECT_REASONS = [
  ['not_actionable', 'Chưa đủ khả năng hành động'],
  ['outside_current_priority', 'Ngoài ưu tiên hiện tại'],
  ['duplicate_or_superseded', 'Trùng hoặc đã có đề xuất mới hơn'],
  ['stale_or_incorrect', 'Evidence cũ hoặc chưa chính xác'],
];

const COMMAND_STATUS_LABELS = {
  prepared: 'Chờ xác nhận', confirmed: 'Đã xác nhận', executing: 'Đang thực thi',
  pending_reconciliation: 'Chờ đối soát', succeeded: 'Có receipt', failed: 'Thất bại',
  dead_letter: 'Cần xử lý tay', expired: 'Hết hạn', invalid: 'Dữ liệu lỗi',
};

const SOURCE_OPTIONS = [
  ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['zalo', 'Zalo'], ['website', 'Website'],
  ['referral', 'Giới thiệu'], ['partner', 'Đối tác'], ['webinar', 'Webinar'], ['youtube', 'YouTube'],
  ['seo', 'SEO'], ['other', 'Khác'],
];

function futureDay(days = 1) {
  const date = new Date(Date.now() + days * 86_400_000);
  return date.toISOString().slice(0, 10);
}

function Steps({ ap }) {
  const steps = parseItems(ap.steps); // v3.13: parse an toàn — tránh 1 bản ghi hỏng làm trắng cả trang
  const curIdx = steps.findIndex(s => s.status === 'pending');
  return (
    <div className="ap-steps">
      {steps.map((s, i) => {
        const cls = s.status === 'approved' ? 'done' : s.status === 'rejected' ? 'no' : i === curIdx ? 'now' : 'wait';
        const mark = s.status === 'approved' ? '✓' : s.status === 'rejected' ? '✕' : i === curIdx ? '●' : '○';
        return <span key={i} className={`ap-step ${cls}`} title={s.note || ''}>{mark} {s.label || s.role}{s.byName ? ` — ${s.byName}` : ''}</span>;
      })}
    </div>
  );
}

function ApCard({ ap, mine, onDecide, busy, focused = false }) {
  const [t, icon] = TYPE_META[ap.type] || [ap.type, 'alert'];
  return (
    <div id={`approval-${ap.id}`} className="ap-card" data-inbox-focus={focused || undefined} tabIndex={focused ? -1 : undefined}>
      <span className="ap-icon"><Icon name={icon} size={17} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="ap-title">{ap.title}</div>
        <div className="ap-sub">{t}{ap.amount ? ' · ' + money(ap.amount) : ''} · {ap.requesterName} yêu cầu · {new Date(ap.createdAt).toLocaleDateString('vi-VN')}
          {ap.status !== 'pending' && <b style={{ color: ap.status === 'approved' ? 'var(--accent)' : 'var(--danger)', marginLeft: 6 }}>
            {ap.status === 'approved' ? '✓ Đã duyệt' : '✕ Bị từ chối'}</b>}
        </div>
        <Steps ap={ap} />
      </div>
      {!mine && ap.status === 'pending' && (
        <div className="ap-actions">
          <button className="btn btn-primary btn-sm" disabled={busy} aria-busy={busy || undefined} onClick={() => onDecide(ap, 'approve')}><Icon name="check" size={14} /> {busy ? 'Đang xử lý…' : 'Duyệt'}</button>
          <button className="btn btn-outline btn-sm" disabled={busy} style={{ color: 'var(--danger)' }} onClick={() => onDecide(ap, 'reject')}><Icon name="x" size={14} /> Từ chối</button>
        </div>
      )}
    </div>
  );
}

function ReviewStatus({ status }) {
  const meta = status === 'accepted'
    ? ['Đã ghi nhận xem xét', 'check', styles.accepted]
    : status === 'rejected'
      ? ['Đã khép đề xuất', 'x', styles.rejected]
      : status === 'invalid'
        ? ['Review không hợp lệ', 'alert', styles.rejected]
        : ['Chờ xem xét', 'clock', styles.pending];
  return <span className={`${styles.status} ${meta[2]}`}><Icon name={meta[1]} size={13} />{meta[0]}</span>;
}

function LeozOpsReviewCard({ proposal, busy, rejectReason, onReasonChange, onRequestDecision }) {
  const pending = proposal.review?.status === 'pending' && proposal.status === 'proposed';
  const referenceCount = Array.isArray(proposal.lead_refs) ? proposal.lead_refs.length : 0;
  return (
    <article className={styles.reviewCard} aria-labelledby={`leozops-proposal-${proposal.id}`}>
      <span className={styles.reviewIcon} aria-hidden="true"><Icon name="shield" size={18} /></span>
      <div className={styles.reviewBody}>
        <div className={styles.reviewHeading}>
          <div>
            <h3 id={`leozops-proposal-${proposal.id}`}>{LEOZOPS_ACTION_LABELS[proposal.action_type] || proposal.action_type}</h3>
            <p>{LEOZOPS_SIGNAL_LABELS[proposal.signal_type] || proposal.signal_type}</p>
          </div>
          <ReviewStatus status={proposal.review?.status} />
        </div>
        <dl className={styles.facts}>
          <div><dt>Evidence</dt><dd>{referenceCount} lead tham chiếu</dd></div>
          <div><dt>Hiệu lực đến</dt><dd>{proposal.expires_at ? new Date(proposal.expires_at).toLocaleString('vi-VN') : 'Không xác định'}</dd></div>
          <div><dt>Quyền sau review</dt><dd>Không được thực thi</dd></div>
        </dl>
        <p className={styles.governanceNote}>
          Review solo chỉ xác nhận bạn đã xem evidence. Nó không phải phê duyệt và không thay đổi Lead.
        </p>
        {pending && (
          <div className={styles.reviewActions}>
            <div className={styles.reasonField}>
              <label htmlFor={`leozops-reject-${proposal.id}`}>Lý do nếu khép đề xuất</label>
              <select
                id={`leozops-reject-${proposal.id}`}
                value={rejectReason}
                disabled={busy}
                onChange={event => onReasonChange(proposal.id, event.target.value)}
              >
                {REJECT_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className={styles.buttons}>
              <button className="btn btn-primary" disabled={busy} aria-busy={busy || undefined}
                onClick={() => onRequestDecision(proposal, 'accept', 'reviewed_current_evidence')}>
                <Icon name="check" size={15} /> Ghi nhận đã xem
              </button>
              <button className="btn btn-outline" disabled={busy}
                onClick={() => onRequestDecision(proposal, 'reject', rejectReason)}>
                <Icon name="x" size={15} /> Khép đề xuất
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function ReviewDecisionDialog({ request, busy, onClose, onConfirm }) {
  if (!request) return null;
  const accepting = request.decision === 'accept';
  return (
    <Modal title={accepting ? 'Ghi nhận đã xem proposal' : 'Khép proposal LeoZOps'} onClose={() => !busy && onClose()}>
      <p className={styles.dialogCopy}>
        {accepting
          ? 'Hệ thống sẽ kiểm tra lại Brief và evidence hiện tại trước khi ghi nhận. Không Lead nào bị thay đổi và không hành động nào được thực thi.'
          : 'Quyết định này sẽ khép proposal dưới dạng review metadata. Không Lead nào bị thay đổi.'}
      </p>
      <div className={styles.dialogBoundary}>
        <Icon name="shield" size={17} />
        <span>Single-operator review · không four-eyes · không approval · không execution</span>
      </div>
      <div className={styles.dialogActions}>
        <button className="btn btn-outline" disabled={busy} onClick={onClose}>Hủy</button>
        <button className={accepting ? 'btn btn-primary' : 'btn btn-danger'} disabled={busy}
          aria-busy={busy || undefined} onClick={onConfirm}>
          {busy ? 'Đang kiểm tra…' : accepting ? 'Xác nhận đã xem' : 'Xác nhận khép'}
        </button>
      </div>
    </Modal>
  );
}

function CommandRuntime({ runtime, busy, onControl, onRunJobs }) {
  const active = runtime.execution_enabled;
  const armed = runtime.configured && !runtime.kill_switch_active;
  return (
    <div className={styles.runtimePanel} aria-label="LeoZOps execution control">
      <div>
        <span className={`${styles.status} ${active ? styles.accepted : styles.pending}`}>
          <Icon name={active ? 'check' : 'shield'} size={13} />
          {active ? 'Execution đang mở' : runtime.kill_switch_active ? 'Kill switch đang bật' : 'Execution chưa sẵn sàng'}
        </span>
        <p>Giới hạn {runtime.daily_action_limit || 0} action/ngày · circuit {runtime.circuit_state}</p>
      </div>
      <div className={styles.runtimeActions}>
        {armed
          ? <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => onControl('kill')}><Icon name="shield" size={14} /> Dừng khẩn cấp</button>
          : runtime.deployment_execution_enabled && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => onControl('activate')}><Icon name="check" size={14} /> Mở execution</button>}
        <button className="btn btn-outline btn-sm" disabled={busy} onClick={onRunJobs}><Icon name="refresh" size={14} /> Đối soát</button>
      </div>
    </div>
  );
}

function CommandComposer({ proposal, busy, onPrepare }) {
  const capabilities = (proposal.command_capabilities || []).filter(capability => capability.enabled);
  const [capabilityId, setCapabilityId] = useState(capabilities[0]?.id || '');
  const [targetRef, setTargetRef] = useState(proposal.lead_refs?.[0] || '');
  const [kind, setKind] = useState('call');
  const [title, setTitle] = useState('Theo dõi tiến độ lead');
  const [date, setDate] = useState(futureDay(1));
  const [closeAt, setCloseAt] = useState(futureDay(7));
  const [source, setSource] = useState('website');
  const capability = capabilities.find(item => item.id === capabilityId);
  if (!capabilities.length) return <p className={styles.unsupported}><Icon name="alert" size={14} /> {proposal.unsupported_reason || 'Capability đang tắt hoặc chưa được hỗ trợ.'}</p>;
  const submit = () => {
    const parameters = capabilityId === 'lead.followup.create' ? { kind, title, date }
      : capabilityId === 'lead.expected_close.update' ? { close_at: closeAt }
        : capabilityId === 'lead.source.update' ? { source }
          : { next_stage: 'contacted' };
    onPrepare({ proposal, capability, targetRef, parameters });
  };
  return (
    <fieldset className={styles.commandForm} disabled={busy}>
      <legend>Chuẩn bị command · chỉ dry-run</legend>
      <div className={styles.commandGrid}>
        <label>Capability
          <select value={capabilityId} onChange={event => setCapabilityId(event.target.value)}>
            {capabilities.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label>Lead evidence
          <select value={targetRef} onChange={event => setTargetRef(event.target.value)}>
            {(proposal.lead_refs || []).map((ref, index) => <option key={ref} value={ref}>Lead #{index + 1} · {ref.slice(0, 10)}</option>)}
          </select>
        </label>
        {capabilityId === 'lead.followup.create' && <>
          <label>Loại follow-up
            <select value={kind} onChange={event => setKind(event.target.value)}>
              <option value="call">Cuộc gọi</option><option value="meeting">Cuộc họp</option>
              <option value="email">Email nội bộ</option><option value="note">Ghi chú</option>
            </select>
          </label>
          <label>Ngày follow-up<input type="date" value={date} min={futureDay(0)} onChange={event => setDate(event.target.value)} /></label>
          <label className={styles.wideField}>Tiêu đề không chứa PII
            <input value={title} maxLength={160} onChange={event => setTitle(event.target.value)} />
          </label>
        </>}
        {capabilityId === 'lead.expected_close.update' && <label>Ngày dự kiến chốt mới
          <input type="date" value={closeAt} min={futureDay(0)} onChange={event => setCloseAt(event.target.value)} />
        </label>}
        {capabilityId === 'lead.source.update' && <label>Nguồn Lead
          <select value={source} onChange={event => setSource(event.target.value)}>
            {SOURCE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>}
      </div>
      <div className={styles.commandFormFooter}>
        <span><Icon name="shield" size={14} /> Rủi ro {capability?.risk} · xác nhận riêng · receipt bắt buộc</span>
        <button type="button" className="btn btn-primary" disabled={busy || !targetRef} aria-busy={busy || undefined} onClick={submit}>
          <Icon name="search" size={15} /> {busy ? 'Đang kiểm tra…' : 'Tạo dry-run'}
        </button>
      </div>
    </fieldset>
  );
}

function CommandConfirmationDialog({ request, busy, onClose, onConfirm }) {
  if (!request) return null;
  const preview = request.intent.preview;
  return (
    <Modal title="Xác nhận command LeoZOps" onClose={() => !busy && onClose()}>
      <p className={styles.dialogCopy}>Dry-run đã kiểm tra evidence, capability và trạng thái hiện tại. Xác nhận này sẽ enqueue command; mọi mutation phải đi qua RepositoryRealms và trả canonical receipt.</p>
      <dl className={styles.previewGrid}>
        <div><dt>Capability</dt><dd>{request.intent.capability}</dd></div>
        <div><dt>Risk</dt><dd>{request.intent.risk}</dd></div>
        <div><dt>Operation</dt><dd>{preview?.operation} · {preview?.resource}</dd></div>
        <div><dt>Rollback</dt><dd>{preview?.rollback_supported ? 'Có thể tạo lệnh đảo ngược' : 'Không hỗ trợ tự động'}</dd></div>
      </dl>
      <pre className={styles.previewCode} aria-label="Command before and after preview">{JSON.stringify({ before: preview?.before, after: preview?.after }, null, 2)}</pre>
      <div className={styles.dialogBoundary}><Icon name="shield" size={17} /><span>Explicit confirmation · persistent queue · CAS · idempotency · canonical receipt</span></div>
      <div className={styles.dialogActions}>
        <button className="btn btn-outline" disabled={busy} onClick={onClose}>Hủy</button>
        <button className="btn btn-primary" disabled={busy} aria-busy={busy || undefined} onClick={onConfirm}>
          {busy ? 'Đang enqueue và đối soát…' : 'Xác nhận thực thi'}
        </button>
      </div>
    </Modal>
  );
}

export default function ApprovalsPage() {
  const [data, setData] = useState(null);
  const [reviewData, setReviewData] = useState(undefined);
  const [commandData, setCommandData] = useState(undefined);
  const [decidingId, setDecidingId] = useState(null);
  const [reviewRequest, setReviewRequest] = useState(null);
  const [commandRequest, setCommandRequest] = useState(null);
  const [commandBusy, setCommandBusy] = useState('');
  const [rejectReasons, setRejectReasons] = useState({});
  const toast = useToast();
  const [focusId, setFocusId] = useState('');
  const focusedRecordRef = useRef(null);
  const load = useCallback(async () => {
    const [approvalsResponse, reviewsResponse, commandsResponse] = await Promise.all([
      fetch('/api/approvals', { cache: 'no-store' }),
      fetch('/api/leozops/action-proposals', { cache: 'no-store' }),
      fetch('/api/leozops/command-intents', { cache: 'no-store' }),
    ]);
    setData(await approvalsResponse.json());
    setReviewData(reviewsResponse.ok ? await reviewsResponse.json() : null);
    setCommandData(commandsResponse.ok ? await commandsResponse.json() : null);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!data || typeof window === 'undefined') return;
    const requested = new URLSearchParams(window.location.search).get('focus') || '';
    if (!requested || focusedRecordRef.current === requested) return;
    const record = [...data.toApprove, ...data.mine].find((row) => row.id === requested);
    focusedRecordRef.current = requested;
    if (!record) return toast('Không tìm thấy phê duyệt hoặc bạn không còn quyền xem bản ghi này.', 'error');
    setFocusId(requested);
    window.requestAnimationFrame(() => {
      const target = document.getElementById(`approval-${requested}`);
      target?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
      target?.focus({ preventScroll: true });
    });
  }, [data, toast]);

  const decide = async (ap, decision) => {
    if (decidingId) return;
    if (decision === 'reject' && !confirm(`Từ chối yêu cầu "${ap.title}"?`)) return;
    setDecidingId(ap.id);
    try {
      const res = await fetch(`/api/approvals/${ap.id}/decide`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return toast(json.error || 'Có lỗi', 'error');
      toast(decision === 'approve'
        ? (json.status === 'approved' ? 'Đã duyệt xong — yêu cầu được thực thi' : 'Đã duyệt — chuyển sang cấp tiếp theo')
        : 'Đã từ chối yêu cầu');
      await load();
    } catch {
      toast('Không thể kết nối máy chủ', 'error');
    } finally {
      setDecidingId(null);
    }
  };

  const decideReview = async () => {
    if (!reviewRequest || decidingId) return false;
    const { proposal, decision, reasonCode } = reviewRequest;
    setDecidingId(proposal.id);
    try {
      const correlationId = crypto.randomUUID();
      const response = await fetch(`/api/leozops/action-proposals/${proposal.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Correlation-ID': correlationId },
        body: JSON.stringify({
          contract: 'leozops.proposal-review',
          version: 1,
          decision,
          reason_code: reasonCode,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast(body.error || 'Không thể ghi nhận review LeoZOps.', 'error');
        return false;
      }
      toast(decision === 'accept'
        ? 'Đã ghi nhận bạn xem evidence — chưa có hành động nào được thực thi.'
        : 'Đã khép proposal — không có Lead nào bị thay đổi.');
      setReviewRequest(null);
      await load();
      return true;
    } catch {
      toast('Không thể kết nối dịch vụ review LeoZOps.', 'error');
      return false;
    } finally {
      setDecidingId(null);
    }
  };

  const prepareCommand = async ({ proposal, capability, targetRef, parameters }) => {
    if (commandBusy) return;
    setCommandBusy(`prepare:${proposal.id}`);
    try {
      const response = await fetch('/api/leozops/command-intents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': crypto.randomUUID(),
          'Idempotency-Key': `leozops_cmd_${crypto.randomUUID().replaceAll('-', '')}`,
        },
        body: JSON.stringify({
          contract: 'leozops.command-intent', version: 1,
          proposal_id: proposal.id, capability: capability.id,
          target_ref: targetRef, parameters,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return toast(body.error || 'Không thể tạo dry-run command.', 'error');
      setCommandRequest({ intent: body.intent, confirmationToken: body.confirmation_token });
      toast('Dry-run hợp lệ. Kiểm tra before/after trước khi xác nhận.');
    } catch {
      toast('Không thể kết nối command plane LeoZOps.', 'error');
    } finally {
      setCommandBusy('');
    }
  };

  const confirmCommand = async () => {
    if (!commandRequest || commandBusy) return;
    const intentId = commandRequest.intent.id;
    setCommandBusy(`confirm:${intentId}`);
    try {
      const response = await fetch(`/api/leozops/command-intents/${intentId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Correlation-ID': crypto.randomUUID() },
        body: JSON.stringify({
          contract: 'leozops.command-confirmation', version: 1,
          intent_id: intentId, confirmation_token: commandRequest.confirmationToken, confirm: true,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return toast(body.error || 'Không thể xác nhận command.', 'error');
      const succeeded = body.intent?.status === 'succeeded';
      toast(succeeded
        ? `Command hoàn tất với receipt ${body.intent.repository_receipt_id}.`
        : `Command đã được ghi nhận ở trạng thái ${COMMAND_STATUS_LABELS[body.intent?.status] || body.intent?.status}.`);
      setCommandRequest(null);
      await load();
    } catch {
      toast('Không thể kết nối command plane LeoZOps.', 'error');
    } finally {
      setCommandBusy('');
    }
  };

  const controlRuntime = async (action) => {
    if (!commandData?.runtime || commandBusy) return;
    setCommandBusy(`runtime:${action}`);
    try {
      const response = await fetch('/api/leozops/runtime', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Correlation-ID': crypto.randomUUID() },
        body: JSON.stringify({
          contract: 'leozops.runtime-control', version: 1, action,
          expected_version: commandData.runtime.record_version,
          daily_action_limit: commandData.runtime.daily_action_limit || 5,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return toast(body.error || 'Không thể đổi runtime control.', 'error');
      toast(action === 'kill' ? 'Kill switch đã dừng mọi execution mới.' : 'Execution runtime đã được mở.');
      await load();
    } catch {
      toast('Không thể kết nối runtime control.', 'error');
    } finally {
      setCommandBusy('');
    }
  };

  const runCommandJobs = async () => {
    if (commandBusy) return;
    setCommandBusy('jobs');
    try {
      const response = await fetch('/api/leozops/jobs/run', { method: 'POST', headers: { 'X-Correlation-ID': crypto.randomUUID() } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return toast(body.error || 'Không thể chạy đối soát.', 'error');
      toast(`Đối soát xong: ${body.succeeded || 0} thành công · ${body.retrying || 0} chờ thử lại · ${body.failed || 0} lỗi.`);
      await load();
    } catch {
      toast('Không thể kết nối job runner.', 'error');
    } finally {
      setCommandBusy('');
    }
  };

  if (!data) return null;
  return (
    <>
      {reviewData && (
        <section className={`card ${styles.reviewSection}`} aria-labelledby="leozops-review-title">
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.eyebrow}>LEOZOPS · HUMAN GATE</span>
              <h2 id="leozops-review-title">Proposal chờ bạn xem ({reviewData.pending.length})</h2>
              <p>Review solo trung thực: xác nhận attention, không giả vờ có collaborator và không cấp quyền thực thi.</p>
            </div>
            <div className={styles.summary} aria-live="polite">
              <span><b>{reviewData.summary.accepted}</b> đã xem</span>
              <span><b>{reviewData.summary.rejected}</b> đã khép</span>
              <span><b>{reviewData.summary.expired}</b> hết hạn</span>
            </div>
          </div>
          {reviewData.pending.length
            ? reviewData.pending.map(proposal => (
              <LeozOpsReviewCard
                key={proposal.id}
                proposal={proposal}
                busy={decidingId === proposal.id}
                rejectReason={rejectReasons[proposal.id] || 'not_actionable'}
                onReasonChange={(id, value) => setRejectReasons(current => ({ ...current, [id]: value }))}
                onRequestDecision={(target, decision, reasonCode) => setReviewRequest({ proposal: target, decision, reasonCode })}
              />
            ))
            : <div className="card-body"><EmptyState title="Không có proposal LeoZOps chờ xem" sub="Proposal mới sẽ xuất hiện ở đây sau khi vượt qua evidence contract." /></div>}
          {reviewData.recent.length > 0 && (
            <details className={styles.recent}>
              <summary>Lịch sử review gần đây ({reviewData.recent.length})</summary>
              {reviewData.recent.map(proposal => (
                <LeozOpsReviewCard key={proposal.id} proposal={proposal} busy={false}
                  rejectReason="not_actionable" onReasonChange={() => {}} onRequestDecision={() => {}} />
              ))}
            </details>
          )}
        </section>
      )}
      {commandData && (
        <section className={`card ${styles.reviewSection}`} aria-labelledby="leozops-command-title">
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.eyebrow}>LEOZOPS · SAFE COMMAND PLANE · SPRINT 1E–1J</span>
              <h2 id="leozops-command-title">Command có kiểm soát</h2>
              <p>Capability registry, dry-run, explicit confirmation, durable queue, quota, circuit breaker và canonical receipt — tất cả mặc định đóng.</p>
            </div>
            <div className={styles.summary} aria-live="polite">
              <span><b>{commandData.accepted_proposals.length}</b> proposal hợp lệ</span>
              <span><b>{commandData.intents.filter(intent => intent.status === 'succeeded').length}</b> có receipt</span>
              <span><b>{commandData.intents.filter(intent => ['failed', 'dead_letter'].includes(intent.status)).length}</b> cần chú ý</span>
            </div>
          </div>
          <CommandRuntime runtime={commandData.runtime} busy={Boolean(commandBusy)} onControl={controlRuntime} onRunJobs={runCommandJobs} />
          {commandData.accepted_proposals.length
            ? commandData.accepted_proposals.map(proposal => (
              <article key={proposal.id} className={styles.commandCard} aria-labelledby={`command-proposal-${proposal.id}`}>
                <div className={styles.reviewHeading}>
                  <div>
                    <h3 id={`command-proposal-${proposal.id}`}>{LEOZOPS_ACTION_LABELS[proposal.action_type] || proposal.action_type}</h3>
                    <p>{LEOZOPS_SIGNAL_LABELS[proposal.signal_type] || proposal.signal_type} · {proposal.lead_refs?.length || 0} lead evidence</p>
                  </div>
                  <span className={`${styles.status} ${styles.accepted}`}><Icon name="check" size={13} />Review hiện hành</span>
                </div>
                <CommandComposer proposal={proposal} busy={commandBusy === `prepare:${proposal.id}`} onPrepare={prepareCommand} />
              </article>
            ))
            : <div className="card-body"><EmptyState title="Chưa có proposal đủ điều kiện tạo command" sub="Review proposal hiện hành trước; review không tự cấp quyền thực thi." /></div>}
          {commandData.intents.length > 0 && (
            <details className={styles.recent}>
              <summary>Command ledger gần đây ({commandData.intents.length})</summary>
              <div className={styles.intentList}>
                {commandData.intents.map(intent => (
                  <article key={intent.id} className={styles.intentRow}>
                    <div>
                      <b>{intent.capability}</b>
                      <span>{new Date(intent.created_at).toLocaleString('vi-VN')} · work version {intent.work_version}</span>
                    </div>
                    <span className={`${styles.status} ${intent.status === 'succeeded' ? styles.accepted : ['failed', 'dead_letter', 'invalid'].includes(intent.status) ? styles.rejected : styles.pending}`}>
                      {COMMAND_STATUS_LABELS[intent.status] || intent.status}
                    </span>
                    <code>{intent.repository_receipt_id ? `receipt ${intent.repository_receipt_id}` : intent.last_error_code || 'chưa có receipt'}</code>
                  </article>
                ))}
              </div>
            </details>
          )}
        </section>
      )}
      <div className="card">
        <div className="card-head"><span className="card-title">Chờ tôi duyệt ({data.toApprove.length})</span></div>
        {data.toApprove.length
          ? data.toApprove.map(ap => <ApCard key={ap.id} ap={ap} busy={decidingId === ap.id} focused={focusId === ap.id} onDecide={decide} />)
          : <div className="card-body"><EmptyState title="Không có gì chờ bạn duyệt" sub="Báo giá lớn, khoản chi lớn và đơn nghỉ phép sẽ xuất hiện ở đây" /></div>}
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><span className="card-title">Yêu cầu của tôi</span></div>
        {data.mine.length
          ? data.mine.map(ap => <ApCard key={ap.id} ap={ap} mine focused={focusId === ap.id} onDecide={decide} />)
          : <div className="card-body"><EmptyState title="Bạn chưa gửi yêu cầu nào" /></div>}
      </div>
      <p style={{ fontSize: '.76rem', color: 'var(--muted)', marginTop: 10 }}>
        Quy tắc: báo giá ≥ ngưỡng cần Giám đốc duyệt trước khi gửi · khoản chi ≥ ngưỡng cần Kế toán (rất lớn thêm Giám đốc) ·
        nghỉ phép qua Trưởng nhóm rồi HR (nếu &gt;3 ngày) · bàn giao Task qua Trưởng Guild hoặc PM · mở rộng Realm cần hai Director khác nhau.
        Ngưỡng chỉnh trong Cài đặt. Giám đốc duyệt được mọi bước ngoại trừ yêu cầu Realm do chính mình tạo.
      </p>
      <ReviewDecisionDialog
        request={reviewRequest}
        busy={Boolean(reviewRequest && decidingId === reviewRequest.proposal.id)}
        onClose={() => setReviewRequest(null)}
        onConfirm={decideReview}
      />
      <CommandConfirmationDialog
        request={commandRequest}
        busy={Boolean(commandRequest && commandBusy === `confirm:${commandRequest.intent.id}`)}
        onClose={() => setCommandRequest(null)}
        onConfirm={confirmCommand}
      />
    </>
  );
}
