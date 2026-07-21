'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { AsyncButton, Forbidden, Icon, useToast } from '@/components/ui';
import { useLanguage } from '@/components/LanguageProvider';
import { rolesOf } from '@/lib/perm';
import styles from './commands.module.css';

const ACTIONS = ['task.create', 'status.request', 'announcement.send', 'approval.request'];
const ROLE_OPTIONS = ['PM', 'AM', 'ACCOUNTANT', 'HR', 'LEAD', 'DIRECTOR'];

const COPY = {
  vi: {
    eyebrow: 'CEO-5 · CROSS-ENTITY COMMAND GATEWAY', title: 'Điều phối công việc liên công ty',
    intro: 'Gửi một hành động tới đúng công ty mà không ghi tắt vào database của họ. Entity đích tự kiểm tra quyền, business rule, tạo receipt RepositoryRealms và AuditLog.',
    back: 'Về tổng quan CEO', policyTitle: 'Không có đường ghi trực tiếp',
    policy: 'Portal chỉ giữ trạng thái giao nhận và mã receipt. Nội dung công việc, thông báo và yêu cầu phê duyệt chỉ tồn tại trong entity đích.',
    noFinance: 'CEO-5 không cho phép ghi Finance hoặc Payroll.',
    compose: 'Tạo lệnh mới', entity: 'Công ty đích', action: 'Hành động',
    taskCreate: 'Tạo công việc', statusRequest: 'Yêu cầu cập nhật trạng thái', announcement: 'Gửi thông báo', approval: 'Gửi yêu cầu phê duyệt',
    recordTitle: 'Tiêu đề', note: 'Mô tả', assigneeEmail: 'Email người phụ trách (không bắt buộc)', projectId: 'Mã dự án (không bắt buộc)',
    dueDate: 'Hạn xử lý', priority: 'Mức ưu tiên', estHours: 'Giờ dự kiến', topic: 'Nội dung cần cập nhật', message: 'Lời nhắn',
    targetEmail: 'Email người cần phản hồi', audience: 'Người nhận', allEmployees: 'Toàn bộ nhân sự', byRole: 'Theo vai trò', role: 'Vai trò', approverRole: 'Vai trò phê duyệt',
    confirm: 'Tôi đã kiểm tra đúng công ty đích và hiểu hành động sẽ tạo record thật tại entity đó.',
    submit: 'Gửi qua RepositoryRealms', submitting: 'Đang gửi và chờ receipt…',
    activate: 'Kích hoạt CEO session + TOTP trước khi gửi lệnh.', identityLink: 'Mở Identity & Registry',
    loadError: 'Không thể tải Command Center.', submitError: 'Không thể gửi lệnh.', deliveredToast: 'Entity đích đã xác nhận receipt.', pendingToast: 'Chưa nhận được receipt. Không tự gửi lại; hãy đối soát.', rejectedToast: 'Entity đích đã từ chối lệnh theo business rule.', failedToast: 'Lệnh chưa rời Portal. Hãy sửa kết nối rồi tạo lệnh mới.',
    history: 'Sổ giao nhận', historyIntro: 'Không chứa payload nghiệp vụ. Correlation ID là khóa đối soát giữa Portal và entity.',
    loading: 'Đang tải sổ giao nhận…', empty: 'Chưa có lệnh nào được gửi.', company: 'Công ty', command: 'Lệnh', status: 'Trạng thái', created: 'Khởi tạo', receipt: 'Receipt', recovery: 'Xử lý',
    dispatching: 'Đang giao', delivered: 'Đã xác nhận', pending_confirmation: 'Chưa xác nhận', rejected: 'Bị từ chối', failed: 'Chưa gửi được',
    reconcile: 'Đối soát receipt', reconciling: 'Đang đối soát…', openRecord: 'Mở record tại entity', opening: 'Đang cấp SSO…',
    retry: 'Tải lại', required: 'Vui lòng điền đủ trường bắt buộc và xác nhận công ty đích.',
    low: 'Thấp', medium: 'Vừa', high: 'Cao', urgent: 'Khẩn',
    taskTitlePlaceholder: 'Ví dụ: Hoàn thiện báo cáo chiến dịch', statusTopicPlaceholder: 'Ví dụ: Tiến độ bàn giao landing page',
    notePlaceholder: 'Bối cảnh và kết quả cần đạt', messagePlaceholder: 'Nêu rõ nội dung cần phản hồi',
    attempts: 'lần kiểm tra', noReceipt: 'Chưa có', correlation: 'Correlation',
  },
  en: {
    eyebrow: 'CEO-5 · CROSS-ENTITY COMMAND GATEWAY', title: 'Cross-company operations',
    intro: 'Send an action to the owning company without bypassing its database boundary. The target enforces authorization and business rules, then issues a RepositoryRealms receipt and AuditLog.',
    back: 'Back to CEO overview', policyTitle: 'No direct-write path',
    policy: 'The Portal stores delivery state and a receipt reference only. Task, announcement, and approval content exists only in the target entity.',
    noFinance: 'CEO-5 does not allow Finance or Payroll writes.',
    compose: 'Compose command', entity: 'Target company', action: 'Action',
    taskCreate: 'Create task', statusRequest: 'Request status update', announcement: 'Send announcement', approval: 'Submit approval request',
    recordTitle: 'Title', note: 'Description', assigneeEmail: 'Assignee email (optional)', projectId: 'Project ID (optional)',
    dueDate: 'Due date', priority: 'Priority', estHours: 'Estimated hours', topic: 'Status topic', message: 'Message',
    targetEmail: 'Employee email', audience: 'Audience', allEmployees: 'All employees', byRole: 'By role', role: 'Role', approverRole: 'Approver role',
    confirm: 'I verified the target company and understand that this action creates a real record in that entity.',
    submit: 'Send through RepositoryRealms', submitting: 'Sending and awaiting receipt…',
    activate: 'Activate the CEO session and complete TOTP step-up before dispatch.', identityLink: 'Open Identity & Registry',
    loadError: 'Command Center could not be loaded.', submitError: 'Command could not be dispatched.', deliveredToast: 'The target entity confirmed its receipt.', pendingToast: 'No receipt was confirmed. Do not resend; reconcile first.', rejectedToast: 'The target entity rejected the command under its business rules.', failedToast: 'The command never left the Portal. Repair connectivity, then create a new command.',
    history: 'Delivery ledger', historyIntro: 'No business payload is retained. Correlation ID links the Portal record to the target receipt.',
    loading: 'Loading delivery ledger…', empty: 'No commands have been dispatched.', company: 'Company', command: 'Command', status: 'Status', created: 'Created', receipt: 'Receipt', recovery: 'Recovery',
    dispatching: 'Dispatching', delivered: 'Confirmed', pending_confirmation: 'Unconfirmed', rejected: 'Rejected', failed: 'Not sent',
    reconcile: 'Reconcile receipt', reconciling: 'Reconciling…', openRecord: 'Open record in entity', opening: 'Issuing SSO…',
    retry: 'Reload', required: 'Complete every required field and confirm the target company.',
    low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent',
    taskTitlePlaceholder: 'Example: Complete campaign report', statusTopicPlaceholder: 'Example: Landing-page delivery progress',
    notePlaceholder: 'Context and expected outcome', messagePlaceholder: 'Describe the update or response required',
    attempts: 'checks', noReceipt: 'Not available', correlation: 'Correlation',
  },
};

const actionLabel = (action, c) => ({
  'task.create': c.taskCreate,
  'status.request': c.statusRequest,
  'announcement.send': c.announcement,
  'approval.request': c.approval,
}[action] || action);

const today = () => new Date().toISOString().slice(0, 10);
const newIds = () => {
  const value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return { idempotencyKey: `ceo-command:${value}`, correlationId: `ceo-correlation:${value}` };
};

function payloadFromForm(action, form) {
  const data = new FormData(form);
  if (action === 'task.create') return {
    title: data.get('title'), note: data.get('note'), assigneeEmail: data.get('assigneeEmail'),
    projectId: data.get('projectId'), dueDate: data.get('dueDate'), priority: data.get('priority'), estHours: data.get('estHours'),
  };
  if (action === 'status.request') return {
    topic: data.get('topic'), message: data.get('message'), targetEmail: data.get('targetEmail'),
    dueDate: data.get('dueDate'), priority: data.get('priority'),
  };
  if (action === 'announcement.send') return {
    title: data.get('title'), message: data.get('message'), audience: data.get('audience'), role: data.get('audience') === 'role' ? data.get('role') : null,
  };
  return { title: data.get('title'), note: data.get('note'), approverRole: data.get('approverRole') };
}

export default function CeoCommandsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const { locale } = useLanguage();
  const c = COPY[locale] || COPY.vi;
  const toast = useToast();
  const formRef = useRef(null);
  const submittingRef = useRef(false);
  const [registry, setRegistry] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [action, setAction] = useState(ACTIONS[0]);
  const [audience, setAudience] = useState('all');
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const [registryResponse, identityResponse, deliveryResponse] = await Promise.all([
      fetch('/api/ceo/v1/registry', { cache: 'no-store' }).catch(() => null),
      fetch('/api/ceo/v1/identity/session', { cache: 'no-store' }).catch(() => null),
      fetch('/api/ceo/v1/command-gateway?limit=75', { cache: 'no-store' }).catch(() => null),
    ]);
    if ([registryResponse, identityResponse, deliveryResponse].some((response) => response?.status === 403)) { setForbidden(true); setLoading(false); return; }
    const [registryBody, identityBody, deliveryBody] = await Promise.all([
      registryResponse?.json().catch(() => ({})) || {}, identityResponse?.json().catch(() => ({})) || {}, deliveryResponse?.json().catch(() => ({})) || {},
    ]);
    if (!registryResponse?.ok) setError(registryBody.error || c.loadError);
    else setRegistry(registryBody);
    if (identityResponse?.ok) setIdentity(identityBody);
    if (deliveryResponse?.ok) setDeliveries((deliveryBody.deliveries || []).filter((item) => ACTIONS.includes(item.action)));
    setLoading(false);
  }, [c.loadError]);

  useEffect(() => { if (sessionStatus === 'authenticated') load(); }, [load, sessionStatus]);

  const entities = useMemo(() => (registry?.entities || []).filter((entity) => entity.enabled), [registry]);
  const identityReady = identity?.active && identity?.stepUp;

  const submit = async (event) => {
    event.preventDefault();
    if (submittingRef.current) return;
    const form = formRef.current;
    if (!form?.reportValidity() || !confirmed) { toast(c.required, 'error'); return; }
    submittingRef.current = true; setSubmitting(true); setError('');
    try {
      const ids = newIds();
      const response = await fetch('/api/ceo/v1/command-gateway', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetEntityId: new FormData(form).get('targetEntityId'), action,
          payload: payloadFromForm(action, form), ...ids,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(body.error || c.submitError); toast(body.error || c.submitError, 'error'); return; }
      setDeliveries((current) => [body.delivery, ...current.filter((item) => item.id !== body.delivery.id)]);
      if (body.delivery.status === 'delivered') toast(c.deliveredToast);
      else if (body.delivery.status === 'rejected') toast(c.rejectedToast, 'error');
      else if (body.delivery.status === 'failed') toast(c.failedToast, 'error');
      else toast(c.pendingToast, 'error');
      setConfirmed(false);
      form.reset();
      setAudience('all');
    } finally {
      submittingRef.current = false; setSubmitting(false);
    }
  };

  const reconcile = async (delivery) => {
    const response = await fetch(`/api/ceo/v1/command-gateway/${encodeURIComponent(delivery.id)}/reconcile`, { method: 'POST' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { toast(body.error || c.submitError, 'error'); return false; }
    setDeliveries((current) => current.map((item) => item.id === delivery.id ? body.delivery : item));
    toast(body.delivery.status === 'delivered' ? c.deliveredToast : c.pendingToast, body.delivery.status === 'delivered' ? 'success' : 'error');
    return true;
  };

  const openRecord = async (delivery) => {
    const response = await fetch('/api/ceo/v1/sso/authorize', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId: delivery.targetEntityId, redirectPath: delivery.receipt.href }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { toast(body.error || c.submitError, 'error'); return false; }
    window.location.assign(body.destination);
    return true;
  };

  if (sessionStatus === 'loading') return <div className={styles.loading}>{c.loading}</div>;
  if (!rolesOf(session?.user).includes('DIRECTOR') || forbidden) return <Forbidden />;

  const dateLabel = (value) => value ? new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';

  return <main className={styles.page} data-no-i18n>
    <header className={styles.hero}>
      <div><p className={styles.eyebrow}>{c.eyebrow}</p><h1>{c.title}</h1><p>{c.intro}</p></div>
      <Link className="btn btn-outline" href="/ceo-overview"><Icon name="dashboard" size={17} />{c.back}</Link>
    </header>

    <section className={styles.policy} aria-labelledby="ceo-command-policy-title">
      <span><Icon name="shield" size={21} /></span>
      <div><h2 id="ceo-command-policy-title">{c.policyTitle}</h2><p>{c.policy}</p></div>
      <strong><Icon name="alert" size={15} />{c.noFinance}</strong>
    </section>

    {!identityReady && <section className={styles.identityNotice} role="status"><Icon name="shield" size={19} /><span>{c.activate}</span><Link className="btn btn-outline" href="/ceo-registry">{c.identityLink}</Link></section>}
    {error && <div className={styles.error} role="alert"><Icon name="alert" size={18} /><span>{error}</span><button type="button" className="btn btn-outline" aria-label={c.retry} onClick={load}>{c.retry}</button></div>}

    <section className={styles.workspace}>
      <form ref={formRef} className={`card ${styles.composer}`} onSubmit={submit} aria-labelledby="ceo-command-compose-title" aria-busy={submitting || undefined}>
        <header><p className={styles.eyebrow}>COMMAND</p><h2 id="ceo-command-compose-title">{c.compose}</h2></header>
        <div className={styles.formGrid}>
          <div className="field"><label htmlFor="ceo-command-entity">{c.entity}<span className="req"> *</span></label><select id="ceo-command-entity" name="targetEntityId" required defaultValue=""><option value="" disabled>—</option>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.displayName}</option>)}</select></div>
          <div className="field"><label htmlFor="ceo-command-action">{c.action}<span className="req"> *</span></label><select id="ceo-command-action" name="action" value={action} onChange={(event) => setAction(event.target.value)}>{ACTIONS.map((value) => <option key={value} value={value}>{actionLabel(value, c)}</option>)}</select></div>

          {action === 'task.create' && <>
            <div className={`field ${styles.full}`}><label htmlFor="command-title">{c.recordTitle}<span className="req"> *</span></label><input id="command-title" name="title" required minLength={3} maxLength={160} placeholder={c.taskTitlePlaceholder} /></div>
            <div className={`field ${styles.full}`}><label htmlFor="command-note">{c.note}</label><textarea id="command-note" name="note" maxLength={1000} placeholder={c.notePlaceholder} /></div>
            <div className="field"><label htmlFor="command-assignee">{c.assigneeEmail}</label><input id="command-assignee" name="assigneeEmail" type="email" autoComplete="off" /></div>
            <div className="field"><label htmlFor="command-project">{c.projectId}</label><input id="command-project" name="projectId" autoComplete="off" /></div>
            <div className="field"><label htmlFor="command-due">{c.dueDate}</label><input id="command-due" name="dueDate" type="date" min={today()} /></div>
            <div className="field"><label htmlFor="command-priority">{c.priority}</label><select id="command-priority" name="priority" defaultValue="medium"><option value="low">{c.low}</option><option value="medium">{c.medium}</option><option value="high">{c.high}</option><option value="urgent">{c.urgent}</option></select></div>
            <div className="field"><label htmlFor="command-hours">{c.estHours}</label><input id="command-hours" name="estHours" type="number" min="0" max="1000" step="0.25" defaultValue="0" /></div>
          </>}

          {action === 'status.request' && <>
            <div className={`field ${styles.full}`}><label htmlFor="command-topic">{c.topic}<span className="req"> *</span></label><input id="command-topic" name="topic" required minLength={3} maxLength={160} placeholder={c.statusTopicPlaceholder} /></div>
            <div className={`field ${styles.full}`}><label htmlFor="command-message">{c.message}<span className="req"> *</span></label><textarea id="command-message" name="message" required minLength={1} maxLength={800} placeholder={c.messagePlaceholder} /></div>
            <div className="field"><label htmlFor="command-target-email">{c.targetEmail}<span className="req"> *</span></label><input id="command-target-email" name="targetEmail" type="email" required autoComplete="off" /></div>
            <div className="field"><label htmlFor="status-due">{c.dueDate}</label><input id="status-due" name="dueDate" type="date" min={today()} /></div>
            <div className="field"><label htmlFor="status-priority">{c.priority}</label><select id="status-priority" name="priority" defaultValue="medium"><option value="medium">{c.medium}</option><option value="high">{c.high}</option><option value="urgent">{c.urgent}</option></select></div>
          </>}

          {action === 'announcement.send' && <>
            <div className={`field ${styles.full}`}><label htmlFor="announcement-title">{c.recordTitle}<span className="req"> *</span></label><input id="announcement-title" name="title" required minLength={3} maxLength={70} /></div>
            <div className={`field ${styles.full}`}><label htmlFor="announcement-message">{c.message}<span className="req"> *</span></label><textarea id="announcement-message" name="message" required minLength={1} maxLength={240} /></div>
            <div className="field"><label htmlFor="announcement-audience">{c.audience}</label><select id="announcement-audience" name="audience" value={audience} onChange={(event) => setAudience(event.target.value)}><option value="all">{c.allEmployees}</option><option value="role">{c.byRole}</option></select></div>
            {audience === 'role' && <div className="field"><label htmlFor="announcement-role">{c.role}</label><select id="announcement-role" name="role">{ROLE_OPTIONS.map((role) => <option key={role}>{role}</option>)}</select></div>}
          </>}

          {action === 'approval.request' && <>
            <div className={`field ${styles.full}`}><label htmlFor="approval-title">{c.recordTitle}<span className="req"> *</span></label><input id="approval-title" name="title" required minLength={3} maxLength={160} /></div>
            <div className={`field ${styles.full}`}><label htmlFor="approval-note">{c.note}<span className="req"> *</span></label><textarea id="approval-note" name="note" required minLength={1} maxLength={1000} /></div>
            <div className="field"><label htmlFor="approval-role">{c.approverRole}</label><select id="approval-role" name="approverRole">{ROLE_OPTIONS.map((role) => <option key={role}>{role}</option>)}</select></div>
          </>}
        </div>
        <label className={styles.confirm} htmlFor="ceo-command-confirm"><input id="ceo-command-confirm" type="checkbox" aria-label={c.confirm} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>{c.confirm}</span></label>
        <button type="submit" className="btn btn-primary" aria-label={c.submit} disabled={!identityReady || submitting || !entities.length} aria-busy={submitting || undefined}><Icon name="link" size={17} />{submitting ? c.submitting : c.submit}</button>
      </form>

      <aside className={`card ${styles.rules}`}><Icon name="shield" size={25} /><h2>RepositoryRealms</h2><ol><li>Authorization + membership scope</li><li>Target business rules</li><li>Idempotency + correlation</li><li>Canonical receipt + AuditLog</li></ol><p>{c.noFinance}</p></aside>
    </section>

    <section aria-labelledby="ceo-delivery-ledger-title">
      <div className={styles.sectionHead}><div><p className={styles.eyebrow}>DELIVERY METADATA ONLY</p><h2 id="ceo-delivery-ledger-title">{c.history}</h2><p>{c.historyIntro}</p></div><button type="button" className="btn btn-outline" aria-label={c.retry} onClick={load}><Icon name="repeat" size={16} />{c.retry}</button></div>
      {loading ? <div className={styles.loading} role="status">{c.loading}</div> : deliveries.length ? <div className={`card ${styles.ledger}`}>
        <table><caption>{c.history}</caption><thead><tr><th>{c.company}</th><th>{c.command}</th><th>{c.status}</th><th>{c.created}</th><th>{c.receipt}</th><th>{c.recovery}</th></tr></thead>
          <tbody>{deliveries.map((delivery) => <tr key={delivery.id}>
            <th scope="row" data-label={c.company}>{delivery.targetDisplayName}</th>
            <td data-label={c.command}><strong>{actionLabel(delivery.action, c)}</strong><code>{c.correlation}: {delivery.correlationId}</code></td>
            <td data-label={c.status}><span className={`${styles.state} ${styles[delivery.status] || ''}`}><span></span>{c[delivery.status] || delivery.status}</span>{delivery.lastErrorCode && <code>{delivery.lastErrorCode}</code>}</td>
            <td data-label={c.created}>{dateLabel(delivery.createdAt)}<small>{delivery.attemptCount} {c.attempts}</small></td>
            <td data-label={c.receipt}>{delivery.receipt ? <><code>{delivery.receipt.id}</code><small>{delivery.receipt.resource}</small></> : c.noReceipt}</td>
            <td data-label={c.recovery}><div className={styles.actions}>{['pending_confirmation', 'dispatching'].includes(delivery.status) && <AsyncButton type="button" className="btn btn-outline btn-sm" aria-label={c.reconcile} pendingLabel={c.reconciling} onClick={() => reconcile(delivery)}>{c.reconcile}</AsyncButton>}{delivery.receipt?.href && <AsyncButton type="button" className="btn btn-outline btn-sm" aria-label={c.openRecord} pendingLabel={c.opening} onClick={() => openRecord(delivery)}>{c.openRecord}</AsyncButton>}</div></td>
          </tr>)}</tbody>
        </table>
      </div> : <div className={`card ${styles.empty}`}>{c.empty}</div>}
    </section>
  </main>;
}
