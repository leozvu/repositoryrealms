'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { AsyncButton, Forbidden, Icon, Modal, useToast } from '@/components/ui';
import { useLanguage } from '@/components/LanguageProvider';
import { rolesOf } from '@/lib/perm';
import styles from './security.module.css';

const COPY = {
  vi: {
    eyebrow: 'CEO-8 · SECURITY, CHAOS & RECOVERY',
    title: 'Hầm an toàn CEO Portal',
    intro: 'Kiểm soát quyền tối thiểu, circuit breaker và khôi phục riêng cho Portal. Mọi thao tác tại đây không thay đổi dữ liệu nghiệp vụ của bốn công ty.',
    refresh: 'Tải lại posture', loading: 'Đang kiểm tra posture bảo mật…', loadError: 'Không thể tải trạng thái CEO Security.',
    control: 'Control plane', local: 'Đăng nhập ERP cục bộ', credentials: 'Service credentials', recovery: 'Khôi phục',
    active: 'Đang hoạt động', suspended: 'Đã tạm khóa', preserved: 'Được giữ nguyên', unavailable: 'Chưa sẵn sàng',
    sessions: 'Phiên CEO đang hoạt động', scopedKeys: 'Khóa dịch vụ còn hiệu lực', rpo: 'RPO mục tiêu', rto: 'RTO mục tiêu',
    entities: 'Biên an toàn từng công ty', entityHelp: 'Một công ty lỗi chỉ mở circuit của chính nó; các công ty còn lại tiếp tục hoạt động.',
    ssoSecret: 'SSO secret', serviceSecret: 'Service key', separated: 'Đã tách khóa', notSeparated: 'Chưa hoàn tất tách khóa',
    circuit: 'Circuit', enabled: 'Đang bật', disabled: 'Đang tắt', retry: 'Thử lại lúc', never: 'Không có',
    chaos: 'Diễn tập graceful degradation', chaosHelp: 'Dry-run 7 sự cố, không gọi hệ thống ngoài và không ghi dữ liệu nghiệp vụ.',
    runChaos: 'Chạy toàn bộ diễn tập', running: 'Đang diễn tập…', passed: 'Đạt', notRun: 'Chưa chạy', dryRun: 'Chỉ mô phỏng',
    rotate: 'Xoay service credential cục bộ', rotateHelp: 'Khóa mới bị giới hạn bởi scope, entity, thời hạn và rate limit. Khóa thô chỉ hiển thị một lần.',
    ttl: 'Thời hạn (ngày)', rotateButton: 'Tạo & thu hồi khóa cũ', rotating: 'Đang xoay khóa…', copy: 'Sao chép khóa', copied: 'Đã sao chép khóa.',
    rawTitle: 'Service credential — chỉ hiển thị một lần', rawWarning: 'Lưu khóa này vào secret manager của CEO Portal. Không gửi qua chat hoặc lưu vào source code.',
    danger: 'Kill switch CEO Portal', dangerHelp: 'Thu hồi mọi CEO session và SSO code. Tài khoản ERP cục bộ và database nghiệp vụ không bị khóa hoặc thay đổi.',
    suspend: 'Tạm khóa CEO Portal', suspending: 'Đang thu hồi…', suspendTitle: 'Xác nhận kill switch',
    reason: 'Lý do', reasonHint: 'Ví dụ: nghi ngờ lộ credential', confirmLabel: 'Gõ chính xác SUSPEND CEO PORTAL', cancel: 'Hủy', confirmSuspend: 'Thu hồi toàn bộ phiên CEO',
    restore: 'Dùng mật khẩu ERP + recovery code tại trang đăng nhập, sau đó xác minh TOTP mới để khôi phục Portal.',
    forbidden: 'Chỉ Director được truy cập Hầm an toàn CEO.',
  },
  en: {
    eyebrow: 'CEO-8 · SECURITY, CHAOS & RECOVERY',
    title: 'CEO Portal security vault',
    intro: 'Least-privilege access, circuit breakers, and Portal-only recovery. Nothing here changes business data owned by the four companies.',
    refresh: 'Refresh posture', loading: 'Checking security posture…', loadError: 'Unable to load CEO Security posture.',
    control: 'Control plane', local: 'Local ERP login', credentials: 'Service credentials', recovery: 'Recovery',
    active: 'Active', suspended: 'Suspended', preserved: 'Preserved', unavailable: 'Unavailable',
    sessions: 'Active CEO sessions', scopedKeys: 'Valid service keys', rpo: 'Target RPO', rto: 'Target RTO',
    entities: 'Per-company safety boundary', entityHelp: 'A failing company opens only its own circuit; all other companies continue operating.',
    ssoSecret: 'SSO secret', serviceSecret: 'Service key', separated: 'Credentials separated', notSeparated: 'Credential separation incomplete',
    circuit: 'Circuit', enabled: 'Enabled', disabled: 'Disabled', retry: 'Retry at', never: 'None',
    chaos: 'Graceful-degradation rehearsal', chaosHelp: 'Dry-run seven failures without external calls or business-data writes.',
    runChaos: 'Run full rehearsal', running: 'Running rehearsal…', passed: 'Passed', notRun: 'Not run', dryRun: 'Simulation only',
    rotate: 'Rotate local service credential', rotateHelp: 'The new key is constrained by scope, entity, expiry, and rate limit. Raw value is shown once.',
    ttl: 'Lifetime (days)', rotateButton: 'Create & revoke old key', rotating: 'Rotating key…', copy: 'Copy credential', copied: 'Credential copied.',
    rawTitle: 'Service credential — shown once', rawWarning: 'Store this value in the CEO Portal secret manager. Never send it over chat or commit it to source.',
    danger: 'CEO Portal kill switch', dangerHelp: 'Revokes every CEO session and SSO code. Local ERP accounts and business databases remain unchanged.',
    suspend: 'Suspend CEO Portal', suspending: 'Revoking…', suspendTitle: 'Confirm kill switch',
    reason: 'Reason', reasonHint: 'Example: suspected credential exposure', confirmLabel: 'Type exactly SUSPEND CEO PORTAL', cancel: 'Cancel', confirmSuspend: 'Revoke every CEO session',
    restore: 'Use your ERP password plus a recovery code on the login page, then complete fresh TOTP verification to restore the Portal.',
    forbidden: 'Only Directors may access the CEO Security Vault.',
  },
};

const SCENARIO_LABELS = {
  'entity-offline': 'Entity offline', 'stale-snapshot': 'Stale snapshot', timeout: 'API timeout',
  'duplicate-command': 'Duplicate command', 'lost-receipt': 'Lost receipt', 'partial-rollout': 'Partial rollout',
  'identity-provider-outage': 'Identity provider outage',
};

export default function CeoSecurityPage() {
  const { data: session, status } = useSession();
  const { locale } = useLanguage();
  const c = COPY[locale] || COPY.vi;
  const toast = useToast();
  const [posture, setPosture] = useState(null);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [rehearsal, setRehearsal] = useState(null);
  const [ttlDays, setTtlDays] = useState(90);
  const [rawCredential, setRawCredential] = useState(null);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const isDirector = useMemo(() => rolesOf(session?.user).includes('DIRECTOR'), [session]);
  const load = useCallback(async () => {
    setError('');
    const response = await fetch('/api/ceo/v1/security/control-plane', { cache: 'no-store' }).catch(() => null);
    if (response?.status === 403) { setForbidden(true); return; }
    const body = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) { setError(body.error || c.loadError); return; }
    setPosture(body);
  }, [c.loadError]);

  useEffect(() => { if (status === 'authenticated' && isDirector) load(); }, [isDirector, load, status]);

  const runRehearsal = async () => {
    const response = await fetch('/api/ceo/v1/security/rehearsal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || c.loadError);
    setRehearsal(body);
    toast?.(c.passed);
  };

  const rotate = async () => {
    const response = await fetch('/api/ceo/v1/security/service-credential', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ttlDays: Number(ttlDays) }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || c.loadError);
    setRawCredential(body.credential);
    toast?.(c.rotateButton);
    await load();
  };

  const suspend = async () => {
    const response = await fetch('/api/ceo/v1/security/control-plane', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason, confirmation }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || c.loadError);
    setSuspendOpen(false);
    setConfirmation('');
    setReason('');
    setPosture((current) => current ? { ...current, controlPlane: { ...current.controlPlane, status: 'suspended', activeSessions: 0, killSwitchAvailable: false } } : current);
    toast?.(c.suspended);
  };

  const copyRaw = async () => {
    await navigator.clipboard.writeText(rawCredential?.key || '');
    toast?.(c.copied);
  };

  if (status === 'loading') return <main className={styles.page}><div className={styles.loading}>{c.loading}</div></main>;
  if (status === 'authenticated' && (!isDirector || forbidden)) return <Forbidden message={c.forbidden} />;

  const suspended = posture?.controlPlane?.status === 'suspended';
  return (
    <main className={styles.page} data-no-i18n>
      <header className={styles.hero}>
        <div><p className={styles.eyebrow}>{c.eyebrow}</p><h1>{c.title}</h1><p>{c.intro}</p></div>
        <button type="button" className="btn btn-outline" onClick={load}><Icon name="repeat" size={16} />{c.refresh}</button>
      </header>

      {error && <div className={styles.error} role="alert"><Icon name="alert" size={19} /><span>{error}</span></div>}
      {!posture && !error && <div className={styles.loading}>{c.loading}</div>}

      {posture && <>
        <section className={styles.metrics} aria-label="CEO security posture">
          <article><span>{c.control}</span><strong className={suspended ? styles.bad : styles.good}>{suspended ? c.suspended : c.active}</strong><small>{posture.controlPlane.activeSessions} {c.sessions.toLowerCase()}</small></article>
          <article><span>{c.local}</span><strong className={posture.localErp.loginPreserved ? styles.good : styles.bad}>{posture.localErp.loginPreserved ? c.preserved : c.unavailable}</strong><small>{posture.localErp.email}</small></article>
          <article><span>{c.credentials}</span><strong>{posture.serviceCredentials.active}</strong><small>{c.scopedKeys}</small></article>
          <article><span>{c.recovery}</span><strong>{posture.recovery.targetRpoHours}h / {posture.recovery.targetRtoHours}h</strong><small>{c.rpo} / {c.rto}</small></article>
        </section>

        {suspended && <section className={styles.restore} role="status"><Icon name="shield" size={22} /><div><strong>{c.suspended}</strong><p>{c.restore}</p></div></section>}

        <section className="card">
          <div className={styles.sectionHead}><div><p className={styles.eyebrow}>ENTITY CIRCUIT BREAKERS</p><h2>{c.entities}</h2><p>{c.entityHelp}</p></div><span className="badge b-green"><span className="dot"></span>isolated</span></div>
          <div className={styles.entityGrid}>{posture.entities.map((entity) => <article key={entity.id} className={styles.entity}>
            <header><div className={styles.monogram}>{entity.id.slice(0, 2).toUpperCase()}</div><div><strong>{entity.displayName}</strong><span>{entity.enabled ? c.enabled : c.disabled}</span></div></header>
            <dl><div><dt>{c.circuit}</dt><dd>{entity.circuitState}</dd></div><div><dt>{c.retry}</dt><dd>{entity.retryAt ? new Date(entity.retryAt).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN') : c.never}</dd></div><div><dt>{c.ssoSecret}</dt><dd>{entity.ssoCredentialConfigured ? '✓' : '—'}</dd></div><div><dt>{c.serviceSecret}</dt><dd>{entity.serviceCredentialConfigured ? '✓' : '—'}</dd></div></dl>
            <span className={`${styles.separation} ${entity.credentialsSeparated ? styles.goodBg : styles.warnBg}`}>{entity.credentialsSeparated ? c.separated : c.notSeparated}</span>
          </article>)}</div>
        </section>

        <section className={`card ${styles.actionPanel}`}>
          <div className={styles.sectionHead}><div><p className={styles.eyebrow}>CHAOS REHEARSAL · NO WRITES</p><h2>{c.chaos}</h2><p>{c.chaosHelp}</p></div><span className="badge">{c.dryRun}</span></div>
          <div className={styles.scenarios}>{Object.keys(SCENARIO_LABELS).map((id) => {
            const result = rehearsal?.results?.find((item) => item.scenario === id);
            return <div key={id}><Icon name={result ? 'check' : 'clock'} size={17} /><span>{SCENARIO_LABELS[id]}</span><strong className={result ? styles.good : ''}>{result ? c.passed : c.notRun}</strong></div>;
          })}</div>
          <AsyncButton type="button" className="btn btn-primary" pendingLabel={c.running} disabled={suspended} onClick={runRehearsal}><Icon name="shield" size={16} />{c.runChaos}</AsyncButton>
        </section>

        <section className={`card ${styles.actionPanel}`}>
          <div className={styles.sectionHead}><div><p className={styles.eyebrow}>LEAST PRIVILEGE</p><h2>{c.rotate}</h2><p>{c.rotateHelp}</p></div></div>
          <div className={styles.rotateRow}><label htmlFor="ceo-key-ttl">{c.ttl}</label><input id="ceo-key-ttl" type="number" min="1" max="180" value={ttlDays} onChange={(event) => setTtlDays(event.target.value)} /><AsyncButton type="button" className="btn btn-outline" pendingLabel={c.rotating} disabled={suspended || Number(ttlDays) < 1 || Number(ttlDays) > 180} onClick={rotate}><Icon name="repeat" size={16} />{c.rotateButton}</AsyncButton></div>
        </section>

        <section className={`${styles.danger} card`}>
          <div><p className={styles.eyebrow}>BREAK GLASS</p><h2>{c.danger}</h2><p>{c.dangerHelp}</p></div>
          <button type="button" className="btn btn-danger" disabled={!posture.controlPlane.killSwitchAvailable} onClick={() => setSuspendOpen(true)}><Icon name="alert" size={16} />{c.suspend}</button>
        </section>
      </>}

      {rawCredential && <Modal title={c.rawTitle} onClose={() => setRawCredential(null)} footer={<button type="button" className="btn btn-primary" onClick={copyRaw}><Icon name="note" size={16} />{c.copy}</button>}><div className={styles.rawSecret}><p role="alert">{c.rawWarning}</p><code>{rawCredential.key}</code><small>{rawCredential.audience} · {rawCredential.scopes.length} scopes · {new Date(rawCredential.expiresAt).toLocaleDateString(locale === 'en' ? 'en-US' : 'vi-VN')}</small></div></Modal>}

      {suspendOpen && <Modal title={c.suspendTitle} onClose={() => setSuspendOpen(false)} footer={<><button type="button" className="btn btn-outline" onClick={() => setSuspendOpen(false)}>{c.cancel}</button><AsyncButton type="button" className="btn btn-danger" pendingLabel={c.suspending} disabled={confirmation !== 'SUSPEND CEO PORTAL' || reason.trim().length < 8} onClick={suspend}>{c.confirmSuspend}</AsyncButton></>}><div className={styles.suspendForm}><p>{c.dangerHelp}</p><label htmlFor="ceo-suspend-reason">{c.reason}</label><input id="ceo-suspend-reason" value={reason} maxLength={180} onChange={(event) => setReason(event.target.value)} placeholder={c.reasonHint} /><label htmlFor="ceo-suspend-confirm">{c.confirmLabel}</label><input id="ceo-suspend-confirm" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></div></Modal>}
    </main>
  );
}
