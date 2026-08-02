'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { AsyncButton, Forbidden, Icon, useToast } from '@/components/ui';
import { useLanguage } from '@/components/LanguageProvider';
import { initials } from '@/lib/format';
import { rolesOf } from '@/lib/perm';
import styles from './workforce.module.css';

const ACTION = 'group_workforce.request';

const COPY = {
  vi: {
    eyebrow: 'CEO GROUP · NHÂN SỰ LIÊN CÔNG TY',
    title: 'Nhân sự của công ty khác trong group',
    intro: 'Mượn năng lực trong thời hạn rõ ràng mà không chuyển hợp đồng, bảng lương hay dữ liệu HR sang công ty nhờ việc.',
    back: 'Về Master Board', sync: 'Đồng bộ nhân sự', syncing: 'Đang đồng bộ…',
    privacy: 'Chỉ nhân sự tự nguyện chia sẻ hồ sơ mới xuất hiện. Công ty đang tuyển dụng vẫn sở hữu phê duyệt, chấm công và quan hệ lao động.',
    noPayroll: 'Không sao chép lương, đánh giá hiệu suất hoặc hồ sơ nhân sự.',
    step1: '1 · Công ty nhờ việc', step2: '2 · Nguồn nhân sự', step3: '3 · Phạm vi công việc',
    borrower: 'Công ty cần hỗ trợ', employer: 'Công ty quản lý nhân sự', employee: 'Nhân sự được đề nghị',
    choose: 'Chọn', noProfiles: 'Chưa có nhân sự đồng ý chia sẻ từ công ty này.',
    requestTitle: 'Tên yêu cầu', requestTitleHint: 'Ví dụ: Hỗ trợ vận hành chiến dịch livestream tuần khai trương',
    note: 'Kết quả cần đạt', noteHint: 'Mô tả phạm vi, đầu ra và người phối hợp. Không nhập dữ liệu lương hoặc đánh giá cá nhân.',
    start: 'Bắt đầu', end: 'Kết thúc', hours: 'Giờ tối đa mỗi tuần', approver: 'Bên duyệt',
    director: 'Giám đốc công ty quản lý', hr: 'Nhân sự công ty quản lý',
    confirm: 'Tôi xác nhận đây là yêu cầu mượn năng lực, không phải chuyển nhân sự hoặc chuyển nghĩa vụ bảng lương.',
    submit: 'Gửi yêu cầu qua RepositoryRealms', submitting: 'Đang chờ receipt…',
    identity: 'Mở Identity & Registry', stepup: 'Cần CEO session và TOTP step-up để gửi yêu cầu thật.',
    loadError: 'Không thể tải luồng nhân sự liên công ty.', required: 'Hãy hoàn tất ba bước và xác nhận ranh giới dữ liệu.',
    sent: 'Công ty quản lý nhân sự đã nhận yêu cầu và tạo phiếu chờ duyệt.',
    pending: 'Chưa xác nhận receipt. Không gửi lại; hãy đối soát trong Trung tâm điều phối.',
    history: 'Yêu cầu gần đây', historyHint: 'Master Board chỉ giữ metadata giao nhận; nội dung và phê duyệt nằm trong công ty quản lý nhân sự.',
    empty: 'Chưa có yêu cầu nhân sự liên công ty.', company: 'Công ty quản lý', status: 'Trạng thái', created: 'Tạo lúc', receipt: 'Biên nhận', action: 'Thao tác',
    delivered: 'Đã tiếp nhận', pending_confirmation: 'Chờ xác nhận', dispatching: 'Đang gửi', rejected: 'Bị từ chối', failed: 'Chưa gửi được',
    open: 'Mở phiếu tại công ty quản lý', opening: 'Đang cấp SSO…', retry: 'Tải lại',
    consent: 'Hồ sơ được chia sẻ', ownership: 'Nguồn nhân sự duyệt', bounded: 'Giới hạn thời gian và công suất',
  },
  en: {
    eyebrow: 'CEO GROUP · CROSS-COMPANY WORKFORCE',
    title: 'People from another company in the group',
    intro: 'Borrow bounded capacity without transferring employment, payroll, or private HR records to the requesting company.',
    back: 'Back to Master Board', sync: 'Sync people', syncing: 'Syncing…',
    privacy: 'Only employees who explicitly share their profile appear here. The employing company still owns approval, time records, and the employment relationship.',
    noPayroll: 'Salary, performance evidence, and HR files are never copied.',
    step1: '1 · Requesting company', step2: '2 · Workforce source', step3: '3 · Work boundary',
    borrower: 'Company requesting support', employer: 'Company employing the person', employee: 'Requested person',
    choose: 'Choose', noProfiles: 'No employee from this company has consented to directory sharing.',
    requestTitle: 'Request title', requestTitleHint: 'Example: Support livestream launch operations',
    note: 'Expected outcome', noteHint: 'Describe scope, deliverables, and collaborators. Do not enter salary or personal performance data.',
    start: 'Start', end: 'End', hours: 'Maximum hours per week', approver: 'Approver',
    director: 'Employing-company Director', hr: 'Employing-company HR',
    confirm: 'I confirm this borrows bounded capacity and does not transfer employment or payroll obligations.',
    submit: 'Send through RepositoryRealms', submitting: 'Awaiting receipt…',
    identity: 'Open Identity & Registry', stepup: 'An active CEO session and recent TOTP step-up are required.',
    loadError: 'Cross-company workforce could not be loaded.', required: 'Complete all three steps and confirm the data boundary.',
    sent: 'The employing company received the request and created a pending approval.',
    pending: 'No receipt was confirmed. Do not resend; reconcile in Command Center.',
    history: 'Recent requests', historyHint: 'Master Board keeps delivery metadata only; request details and approval stay in the employing company.',
    empty: 'No cross-company workforce requests yet.', company: 'Employing company', status: 'Status', created: 'Created', receipt: 'Receipt', action: 'Action',
    delivered: 'Received', pending_confirmation: 'Awaiting receipt', dispatching: 'Sending', rejected: 'Rejected', failed: 'Not sent',
    open: 'Open approval in employing company', opening: 'Issuing SSO…', retry: 'Reload',
    consent: 'Shared by consent', ownership: 'Employer approval', bounded: 'Bounded dates and capacity',
  },
};

const today = () => new Date().toISOString().slice(0, 10);
const newIds = () => {
  const value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return {
    idempotencyKey: `ceo-group-workforce:${value}`,
    correlationId: `ceo-group-workforce-correlation:${value}`,
  };
};

export default function CeoWorkforcePage() {
  const { data: session, status: sessionStatus } = useSession();
  const { locale } = useLanguage();
  const c = COPY[locale] || COPY.vi;
  const toast = useToast();
  const formRef = useRef(null);
  const [registry, setRegistry] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [identity, setIdentity] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [borrowerId, setBorrowerId] = useState('');
  const [employerId, setEmployerId] = useState('');
  const [profileId, setProfileId] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const responses = await Promise.all([
      fetch('/api/ceo/v1/registry', { cache: 'no-store' }).catch(() => null),
      fetch('/api/ceo/v1/messaging/directory', { cache: 'no-store' }).catch(() => null),
      fetch('/api/ceo/v1/identity/session', { cache: 'no-store' }).catch(() => null),
      fetch('/api/ceo/v1/command-gateway?limit=100', { cache: 'no-store' }).catch(() => null),
    ]);
    if (responses.some((response) => response?.status === 403)) {
      setForbidden(true); setLoading(false); return;
    }
    const bodies = await Promise.all(responses.map((response) => response?.json().catch(() => ({})) || {}));
    if (responses[0]?.ok) setRegistry((bodies[0].entities || []).filter((entity) => entity.enabled));
    if (responses[1]?.ok) setDirectory(bodies[1].profiles || []);
    if (responses[2]?.ok) setIdentity(bodies[2]);
    if (responses[3]?.ok) setDeliveries((bodies[3].deliveries || []).filter((row) => row.action === ACTION));
    if (!responses[0]?.ok || !responses[1]?.ok || !responses[3]?.ok) {
      setError(bodies.find((body) => body?.error)?.error || c.loadError);
    }
    setLoading(false);
  }, [c.loadError]);

  useEffect(() => { if (sessionStatus === 'authenticated') load(); }, [load, sessionStatus]);

  const employers = useMemo(() => {
    const ids = new Set(directory.map((profile) => profile.targetEntityId));
    return registry.filter((entity) => ids.has(entity.id));
  }, [directory, registry]);
  const profiles = useMemo(
    () => directory.filter((profile) => profile.targetEntityId === employerId),
    [directory, employerId],
  );
  const selectedProfile = profiles.find((profile) => profile.id === profileId) || null;
  const borrowers = registry.filter((entity) => entity.id !== employerId);
  const ready = identity?.active && identity?.stepUp;

  useEffect(() => {
    if (borrowerId === employerId) setBorrowerId('');
    setProfileId('');
  }, [employerId]);

  const sync = async () => {
    const response = await fetch('/api/ceo/v1/messaging/directory', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { toast(body.error || c.loadError, 'error'); return false; }
    setDirectory(body.profiles || []);
    return true;
  };

  const submit = async (event) => {
    event.preventDefault();
    const form = formRef.current;
    if (submitting || !form?.reportValidity() || !confirmed || !selectedProfile || borrowerId === employerId) {
      toast(c.required, 'error'); return;
    }
    const data = new FormData(form);
    setSubmitting(true); setError('');
    try {
      const response = await fetch('/api/ceo/v1/command-gateway', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetEntityId: employerId,
          action: ACTION,
          payload: {
            requestingEntityId: borrowerId,
            employeeEmail: selectedProfile.email,
            title: data.get('title'),
            note: data.get('note'),
            startDate: data.get('startDate'),
            endDate: data.get('endDate'),
            hoursPerWeek: data.get('hoursPerWeek'),
            approverRole: data.get('approverRole'),
          },
          ...newIds(),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(body.error || c.loadError); toast(body.error || c.loadError, 'error'); return; }
      setDeliveries((current) => [body.delivery, ...current.filter((item) => item.id !== body.delivery.id)]);
      toast(body.delivery.status === 'delivered' ? c.sent : c.pending, body.delivery.status === 'delivered' ? 'success' : 'error');
      setConfirmed(false); form.reset(); setBorrowerId(''); setEmployerId(''); setProfileId('');
    } finally { setSubmitting(false); }
  };

  const openApproval = async (delivery) => {
    const response = await fetch('/api/ceo/v1/sso/authorize', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId: delivery.targetEntityId, redirectPath: delivery.receipt.href }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { toast(body.error || c.loadError, 'error'); return false; }
    window.location.assign(body.destination); return true;
  };

  if (sessionStatus === 'loading') return <div className={styles.loading}>{c.loadError}</div>;
  if (!rolesOf(session?.user).includes('DIRECTOR') || forbidden) return <Forbidden />;
  const formatDate = (value) => value
    ? new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : '—';

  return <main className={styles.page} data-no-i18n>
    <header className={styles.hero}>
      <div><p className={styles.eyebrow}>{c.eyebrow}</p><h1>{c.title}</h1><p>{c.intro}</p></div>
      <div className={styles.heroActions}>
        <Link className="btn btn-outline" href="/ceo-overview"><Icon name="dashboard" size={17} />{c.back}</Link>
        <AsyncButton className="btn btn-outline" pendingLabel={c.syncing} onClick={sync}><Icon name="repeat" size={16} />{c.sync}</AsyncButton>
      </div>
    </header>

    <section className={styles.policy} role="note">
      <span><Icon name="shield" size={21} /></span>
      <div><strong>{c.privacy}</strong><p>{c.noPayroll}</p></div>
    </section>
    {!ready && <section className={styles.notice} role="status"><Icon name="alert" size={19} /><span>{c.stepup}</span><Link className="btn btn-outline" href="/ceo-registry">{c.identity}</Link></section>}
    {error && <section className={styles.error} role="alert"><span>{error}</span><button type="button" className="btn btn-outline" onClick={load}>{c.retry}</button></section>}

    <section className={styles.invariants} aria-label="RepositoryRealms workforce invariants">
      {[['staff', c.consent], ['shield', c.ownership], ['clock', c.bounded]].map(([icon, label]) => <div key={label}><Icon name={icon} size={19} /><span>{label}</span></div>)}
    </section>

    <form ref={formRef} className={`card ${styles.composer}`} onSubmit={submit} aria-busy={submitting || undefined}>
      <fieldset>
        <legend>{c.step1}</legend>
        <div className="field"><label htmlFor="group-borrower">{c.borrower}<span className="req"> *</span></label><select id="group-borrower" required value={borrowerId} onChange={(event) => setBorrowerId(event.target.value)}><option value="">— {c.choose} —</option>{borrowers.map((entity) => <option key={entity.id} value={entity.id}>{entity.displayName}</option>)}</select></div>
      </fieldset>
      <fieldset>
        <legend>{c.step2}</legend>
        <div className={styles.twoCol}>
          <div className="field"><label htmlFor="group-employer">{c.employer}<span className="req"> *</span></label><select id="group-employer" required value={employerId} onChange={(event) => setEmployerId(event.target.value)}><option value="">— {c.choose} —</option>{employers.map((entity) => <option key={entity.id} value={entity.id}>{entity.displayName}</option>)}</select></div>
          <div className="field"><label htmlFor="group-employee">{c.employee}<span className="req"> *</span></label><select id="group-employee" required value={profileId} onChange={(event) => setProfileId(event.target.value)} disabled={!employerId || !profiles.length}><option value="">— {c.choose} —</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName} · {profile.title || profile.email}</option>)}</select></div>
        </div>
        {employerId && !profiles.length && <p className={styles.helper}>{c.noProfiles}</p>}
        {selectedProfile && <div className={styles.profile}><span>{initials(selectedProfile.displayName)}</span><div><strong>{selectedProfile.displayName}</strong><small>{selectedProfile.title || selectedProfile.email}</small></div><em><Icon name="shield" size={14} />{c.consent}</em></div>}
      </fieldset>
      <fieldset>
        <legend>{c.step3}</legend>
        <div className={styles.twoCol}>
          <div className={`field ${styles.full}`}><label htmlFor="group-title">{c.requestTitle}<span className="req"> *</span></label><input id="group-title" name="title" required minLength={3} maxLength={160} placeholder={c.requestTitleHint} /></div>
          <div className={`field ${styles.full}`}><label htmlFor="group-note">{c.note}<span className="req"> *</span></label><textarea id="group-note" name="note" required minLength={1} maxLength={1000} placeholder={c.noteHint} /></div>
          <div className="field"><label htmlFor="group-start">{c.start}<span className="req"> *</span></label><input id="group-start" name="startDate" type="date" min={today()} required /></div>
          <div className="field"><label htmlFor="group-end">{c.end}<span className="req"> *</span></label><input id="group-end" name="endDate" type="date" min={today()} required /></div>
          <div className="field"><label htmlFor="group-hours">{c.hours}<span className="req"> *</span></label><input id="group-hours" name="hoursPerWeek" type="number" min="1" max="60" step="0.5" defaultValue="8" required /></div>
          <div className="field"><label htmlFor="group-approver">{c.approver}</label><select id="group-approver" name="approverRole" defaultValue="DIRECTOR"><option value="DIRECTOR">{c.director}</option><option value="HR">{c.hr}</option></select></div>
        </div>
      </fieldset>
      <label className={styles.confirm} htmlFor="group-confirm"><input id="group-confirm" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>{c.confirm}</span></label>
      <button type="submit" className="btn btn-primary" disabled={!ready || submitting || !borrowerId || !employerId || !profileId || !confirmed}><Icon name="link" size={17} />{submitting ? c.submitting : c.submit}</button>
    </form>

    <section aria-labelledby="group-workforce-history">
      <div className={styles.sectionHead}><div><h2 id="group-workforce-history">{c.history}</h2><p>{c.historyHint}</p></div><button type="button" className="btn btn-outline" onClick={load}><Icon name="repeat" size={16} />{c.retry}</button></div>
      {loading ? <div className={styles.loading} role="status">{c.loadError}</div> : deliveries.length ? <div className={`card ${styles.ledger}`}><table><caption>{c.history}</caption><thead><tr><th>{c.company}</th><th>{c.status}</th><th>{c.created}</th><th>{c.receipt}</th><th>{c.action}</th></tr></thead><tbody>{deliveries.map((delivery) => <tr key={delivery.id}><th scope="row" data-label={c.company}>{delivery.targetDisplayName}</th><td data-label={c.status}><span className={`${styles.state} ${styles[delivery.status] || ''}`}><i></i>{c[delivery.status] || delivery.status}</span></td><td data-label={c.created}>{formatDate(delivery.createdAt)}</td><td data-label={c.receipt}><code>{delivery.receipt?.id || '—'}</code></td><td data-label={c.action}>{delivery.receipt?.href && <AsyncButton className="btn btn-outline btn-sm" pendingLabel={c.opening} onClick={() => openApproval(delivery)}>{c.open}</AsyncButton>}</td></tr>)}</tbody></table></div> : <div className={`card ${styles.empty}`}>{c.empty}</div>}
    </section>
  </main>;
}
