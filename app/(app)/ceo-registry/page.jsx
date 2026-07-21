'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { AsyncButton, Forbidden, Icon, Modal, useToast } from '@/components/ui';
import { useLanguage } from '@/components/LanguageProvider';
import { rolesOf } from '@/lib/perm';
import styles from './registry.module.css';

const COPY = {
  vi: {
    eyebrow: 'CEO CONTROL PLANE · ENTITY REGISTRY',
    title: 'Danh bạ bốn công ty',
    intro: 'Một nơi kiểm soát kết nối tới AIm, Egoric, Vnecom và Egolive. Registry chỉ giữ tham chiếu secret; API key thật không nằm trong database hoặc trình duyệt.',
    refresh: 'Tải lại trạng thái',
    loading: 'Đang tải danh bạ công ty…',
    loadError: 'Không thể tải Entity Registry.',
    retry: 'Thử lại',
    registered: 'Đã đăng ký', enabled: 'Đang bật', ready: 'Sẵn sàng', openCircuit: 'Circuit đang mở',
    environment: 'Môi trường', profile: 'Mô hình', contract: 'Contract', credential: 'Server secret',
    configured: 'Đã cấu hình', missing: 'Chưa cấu hình',
    circuit: 'Circuit breaker', errors: 'Lỗi liên tiếp', lastSuccess: 'Đồng bộ thành công gần nhất', never: 'Chưa từng',
    capabilities: 'Phạm vi dữ liệu', enable: 'Bật kết nối', disable: 'Tắt kết nối',
    enabling: 'Đang bật…', disabling: 'Đang tắt…', rotate: 'Đổi secret reference',
    enabledToast: 'Đã bật kết nối entity.', disabledToast: 'Đã tắt kết nối entity.',
    rotatedToast: 'Đã chuyển sang server secret mới.',
    updateError: 'Không thể cập nhật entity.',
    rotateTitle: 'Xoay vòng credential',
    rotateIntro: 'Hãy tạo secret mới trên server trước. Form này chỉ lưu tên biến môi trường, không nhận hoặc lưu API key thật.',
    refLabel: 'Tên biến môi trường mới',
    refHint: 'Định dạng bắt buộc: CEO_ENTITY_<TÊN>_API_KEY. Secret phải tồn tại trên server trước khi chuyển.',
    cancel: 'Hủy', confirmRotate: 'Chuyển credential', rotating: 'Đang chuyển…',
    empty: 'Registry chưa có entity. Hãy chạy migration CEO-2 trước khi sử dụng.',
    disabledStatus: 'Tắt chủ động', unverified: 'Chưa xác minh', degraded: 'Suy giảm', unreachable: 'Không kết nối', readyStatus: 'Sẵn sàng',
    closed: 'Đóng · hoạt động bình thường', open: 'Mở · tạm ngừng gọi', half_open: 'Thử phục hồi',
    securityTitle: 'Nguyên tắc an toàn',
    securityText: 'Không xóa entity, không hiển thị key, không bật khi secret còn thiếu. Mọi thay đổi dùng version check và được ghi AuditLog.',
    noDelete: 'Không có thao tác xóa',
    ssoTitle: 'Danh tính CEO & đăng nhập một lần',
    ssoIntro: 'Lớp bảo mật riêng cho Vũ Lương Sơn. Mật khẩu + TOTP mở Portal; code 45 giây chỉ mở đúng công ty đã cấp quyền.',
    ssoInactive: 'CEO session chưa kích hoạt', ssoActive: 'CEO session đang hoạt động', stepUpReady: 'TOTP vừa xác minh', stepUpExpired: 'Cần xác minh lại TOTP',
    otpLabel: 'Mã TOTP 6 số', otpHint: 'Dùng mã hiện tại trong ứng dụng xác thực. Mã không được lưu.',
    deviceLabel: 'Tên thiết bị', activate: 'Kích hoạt CEO session', activating: 'Đang kích hoạt…', stepUp: 'Xác minh lại', steppingUp: 'Đang xác minh…',
    sessionCount: 'Phiên thiết bị', recoveryRemaining: 'Recovery code còn lại', memberships: 'Công ty được cấp quyền',
    rotateRecovery: 'Tạo bộ recovery code mới', rotatingRecovery: 'Đang tạo…', recoveryTitle: 'Recovery codes — chỉ hiển thị một lần',
    recoveryWarning: 'Lưu các mã này ở nơi an toàn. Tạo bộ mới sẽ vô hiệu hóa toàn bộ mã cũ.', copyCodes: 'Sao chép mã', copied: 'Đã sao chép recovery codes.',
    sessionsTitle: 'Thiết bị đang đăng nhập', currentSession: 'Thiết bị này', revoke: 'Thu hồi', revoking: 'Đang thu hồi…',
    openEntity: 'Mở bằng SSO', openingEntity: 'Đang cấp code…', ssoNotReady: 'Kích hoạt và xác minh CEO session trước.',
    identityError: 'Dịch vụ CEO Identity chưa sẵn sàng. Registry vẫn có thể được quản trị độc lập.',
    activatedToast: 'CEO session đã được kích hoạt.', steppedUpToast: 'Đã xác minh lại TOTP.', revokedToast: 'Đã thu hồi session.',
  },
  en: {
    eyebrow: 'CEO CONTROL PLANE · ENTITY REGISTRY',
    title: 'Four-company registry',
    intro: 'A single control point for AIm, Egoric, Vnecom, and Egolive connections. The registry stores secret references only; raw API keys never enter the database or browser.',
    refresh: 'Refresh status',
    loading: 'Loading company registry…',
    loadError: 'Unable to load the Entity Registry.',
    retry: 'Try again',
    registered: 'Registered', enabled: 'Enabled', ready: 'Ready', openCircuit: 'Open circuits',
    environment: 'Environment', profile: 'Profile', contract: 'Contract', credential: 'Server secret',
    configured: 'Configured', missing: 'Missing',
    circuit: 'Circuit breaker', errors: 'Consecutive errors', lastSuccess: 'Last successful sync', never: 'Never',
    capabilities: 'Data scopes', enable: 'Enable connection', disable: 'Disable connection',
    enabling: 'Enabling…', disabling: 'Disabling…', rotate: 'Rotate secret reference',
    enabledToast: 'Entity connection enabled.', disabledToast: 'Entity connection disabled.',
    rotatedToast: 'Switched to the new server secret.',
    updateError: 'Unable to update the entity.',
    rotateTitle: 'Rotate credential',
    rotateIntro: 'Provision the new server secret first. This form accepts only an environment variable name and never accepts or stores the raw API key.',
    refLabel: 'New environment variable name',
    refHint: 'Required format: CEO_ENTITY_<NAME>_API_KEY. The secret must exist on the server before switching.',
    cancel: 'Cancel', confirmRotate: 'Switch credential', rotating: 'Switching…',
    empty: 'The registry has no entities. Apply the CEO-2 migration before use.',
    disabledStatus: 'Manually disabled', unverified: 'Unverified', degraded: 'Degraded', unreachable: 'Unreachable', readyStatus: 'Ready',
    closed: 'Closed · operating normally', open: 'Open · calls paused', half_open: 'Recovery probe',
    securityTitle: 'Safety policy',
    securityText: 'No entity deletion, no key exposure, and no enablement while a secret is missing. Every change uses version checks and is written to AuditLog.',
    noDelete: 'No delete operation',
    ssoTitle: 'CEO identity & single sign-on',
    ssoIntro: 'A dedicated security layer for Vũ Lương Sơn. Password + TOTP opens the Portal; a 45-second code opens only the authorized company.',
    ssoInactive: 'CEO session is not active', ssoActive: 'CEO session is active', stepUpReady: 'TOTP recently verified', stepUpExpired: 'TOTP re-verification required',
    otpLabel: '6-digit TOTP', otpHint: 'Use the current code from your authenticator. The code is never stored.',
    deviceLabel: 'Device name', activate: 'Activate CEO session', activating: 'Activating…', stepUp: 'Verify again', steppingUp: 'Verifying…',
    sessionCount: 'Device sessions', recoveryRemaining: 'Recovery codes remaining', memberships: 'Authorized companies',
    rotateRecovery: 'Create new recovery codes', rotatingRecovery: 'Creating…', recoveryTitle: 'Recovery codes — shown once',
    recoveryWarning: 'Store these codes securely. Creating a new set invalidates every old code.', copyCodes: 'Copy codes', copied: 'Recovery codes copied.',
    sessionsTitle: 'Signed-in devices', currentSession: 'This device', revoke: 'Revoke', revoking: 'Revoking…',
    openEntity: 'Open with SSO', openingEntity: 'Issuing code…', ssoNotReady: 'Activate and verify the CEO session first.',
    identityError: 'CEO Identity is not ready. The registry can still be managed independently.',
    activatedToast: 'CEO session activated.', steppedUpToast: 'TOTP verification refreshed.', revokedToast: 'Session revoked.',
  },
};

const statusClass = (status) => ({ ready: 'good', degraded: 'warn', unreachable: 'bad', disabled: 'neutral' }[status] || 'neutral');

export default function CeoRegistryPage() {
  const { data: session, status: sessionStatus } = useSession();
  const { locale } = useLanguage();
  const c = COPY[locale] || COPY.vi;
  const toast = useToast();
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [rotating, setRotating] = useState(null);
  const [credentialRef, setCredentialRef] = useState('');
  const [identity, setIdentity] = useState(null);
  const [identityError, setIdentityError] = useState('');
  const [otp, setOtp] = useState('');
  const [deviceLabel, setDeviceLabel] = useState('CEO browser');
  const [recoveryCodes, setRecoveryCodes] = useState(null);

  const load = useCallback(async () => {
    setError('');
    const response = await fetch('/api/ceo/v1/registry', { cache: 'no-store' }).catch(() => null);
    if (response?.status === 403) { setForbidden(true); return; }
    const body = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) { setError(body.error || c.loadError); return; }
    setPayload(body);
  }, [c.loadError]);

  const loadIdentity = useCallback(async () => {
    setIdentityError('');
    const response = await fetch('/api/ceo/v1/identity/session', { cache: 'no-store' }).catch(() => null);
    const body = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) { setIdentityError(body.error || c.identityError); return; }
    setIdentity(body);
  }, [c.identityError]);

  useEffect(() => {
    if (sessionStatus === 'authenticated') Promise.all([load(), loadIdentity()]);
  }, [load, loadIdentity, sessionStatus]);

  const entities = payload?.entities || [];
  const stats = useMemo(() => ({
    registered: entities.length,
    enabled: entities.filter((entity) => entity.enabled).length,
    ready: entities.filter((entity) => entity.status === 'ready').length,
    open: entities.filter((entity) => entity.sync.circuitState === 'open').length,
  }), [entities]);

  const mutate = async (entity, data) => {
    const response = await fetch(`/api/ceo/v1/registry/${encodeURIComponent(entity.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion: entity.recordVersion, ...data }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { toast(body.error || c.updateError, 'error'); return false; }
    setPayload((current) => ({
      ...current,
      entities: current.entities.map((item) => item.id === body.entity.id ? body.entity : item),
    }));
    return true;
  };

  const toggle = async (entity) => {
    const ok = await mutate(entity, { enabled: !entity.enabled });
    if (ok) toast(entity.enabled ? c.disabledToast : c.enabledToast);
    return ok;
  };

  const submitRotation = async () => {
    const ref = credentialRef.trim();
    if (!/^CEO_ENTITY_[A-Z0-9_]+_API_KEY$/.test(ref)) {
      toast(c.refHint, 'error');
      return false;
    }
    const response = await fetch(`/api/ceo/v1/registry/${encodeURIComponent(rotating.id)}/rotate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion: rotating.recordVersion, credentialRef: ref }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { toast(body.error || c.updateError, 'error'); return false; }
    setPayload((current) => ({
      ...current,
      entities: current.entities.map((item) => item.id === body.entity.id ? body.entity : item),
    }));
    setRotating(null);
    setCredentialRef('');
    toast(c.rotatedToast);
    return true;
  };

  const activateIdentity = async () => {
    const response = await fetch('/api/ceo/v1/identity/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ otp, deviceLabel }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { toast(body.error || c.identityError, 'error'); return false; }
    setOtp('');
    await loadIdentity();
    toast(c.activatedToast);
    return true;
  };

  const stepUpIdentity = async () => {
    const response = await fetch('/api/ceo/v1/identity/session/step-up', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ otp }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { toast(body.error || c.identityError, 'error'); return false; }
    setOtp('');
    await loadIdentity();
    toast(c.steppedUpToast);
    return true;
  };

  const rotateRecoveryCodes = async () => {
    const response = await fetch('/api/ceo/v1/identity/recovery', { method: 'POST' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { toast(body.error || c.identityError, 'error'); return false; }
    setRecoveryCodes(body.codes || []);
    await loadIdentity();
    return true;
  };

  const revokeSession = async (sessionId) => {
    const response = await fetch(`/api/ceo/v1/identity/sessions/${encodeURIComponent(sessionId)}/revoke`, { method: 'POST' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { toast(body.error || c.identityError, 'error'); return false; }
    if (body.currentRevoked) setIdentity((current) => ({ ...current, active: false, stepUp: false, sessions: [] }));
    else await loadIdentity();
    toast(c.revokedToast);
    return true;
  };

  const openEntity = async (entity) => {
    if (!identity?.active || !identity.stepUp) { toast(c.ssoNotReady, 'error'); return false; }
    const response = await fetch('/api/ceo/v1/sso/authorize', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entityId: entity.id, redirectPath: '/dashboard' }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { toast(body.error || c.identityError, 'error'); return false; }
    window.location.assign(body.destination);
    return true;
  };

  const copyRecoveryCodes = async () => {
    await navigator.clipboard.writeText((recoveryCodes || []).join('\n'));
    toast(c.copied);
  };

  if (sessionStatus === 'loading') return <div className={styles.loading}>{c.loading}</div>;
  if (!rolesOf(session?.user).includes('DIRECTOR') || forbidden) return <Forbidden />;

  const statusLabel = (status) => ({
    disabled: c.disabledStatus, unverified: c.unverified, degraded: c.degraded,
    unreachable: c.unreachable, ready: c.readyStatus,
  }[status] || c.unverified);
  const circuitLabel = (state) => ({ closed: c.closed, open: c.open, half_open: c.half_open }[state] || c.open);
  const dateLabel = (value) => value
    ? new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : c.never;

  return (
    <main className={styles.page} data-no-i18n>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{c.eyebrow}</p>
          <h1>{c.title}</h1>
          <p className={styles.intro}>{c.intro}</p>
        </div>
        <button type="button" className="btn btn-outline" onClick={load}>
          <Icon name="repeat" size={16} /> {c.refresh}
        </button>
      </header>

      <section className={styles.policy} aria-labelledby="ceo-registry-policy-title">
        <span className={styles.policyIcon}><Icon name="shield" size={21} /></span>
        <div><h2 id="ceo-registry-policy-title">{c.securityTitle}</h2><p>{c.securityText}</p></div>
        <span className="badge b-green"><span className="dot"></span>{c.noDelete}</span>
      </section>

      <section className={`card ${styles.identityPanel}`} aria-labelledby="ceo-identity-title">
        <header className={styles.identityPanelHead}>
          <div>
            <p className={styles.eyebrow}>CEO-3 · CENTRAL IDENTITY</p>
            <h2 id="ceo-identity-title">{c.ssoTitle}</h2>
            <p>{c.ssoIntro}</p>
          </div>
          <span className={`${styles.status} ${identity?.active ? styles.good : styles.neutral}`}>
            <span></span>{identity?.active ? c.ssoActive : c.ssoInactive}
          </span>
        </header>

        {identityError && <div className={styles.inlineNotice} role="status"><Icon name="alert" size={18} /><span>{c.identityError}</span><button type="button" className="btn btn-outline btn-sm" onClick={loadIdentity}>{c.retry}</button></div>}

        {!identity?.active && !identityError && (
          <div className={styles.activationForm}>
            <div className={styles.fieldGroup}>
              <label htmlFor="ceo-device-label">{c.deviceLabel}</label>
              <input id="ceo-device-label" value={deviceLabel} onChange={(event) => setDeviceLabel(event.target.value)} maxLength={80} autoComplete="off" />
            </div>
            <div className={styles.fieldGroup}>
              <label htmlFor="ceo-activation-otp">{c.otpLabel}</label>
              <input id="ceo-activation-otp" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-describedby="ceo-activation-otp-hint" />
              <small id="ceo-activation-otp-hint">{c.otpHint}</small>
            </div>
            <AsyncButton type="button" className="btn btn-primary" pendingLabel={c.activating} disabled={otp.length !== 6} onClick={activateIdentity}><Icon name="shield" size={16} />{c.activate}</AsyncButton>
          </div>
        )}

        {identity?.active && (
          <>
            <div className={styles.identityMetrics}>
              <div><span>{c.stepUpReady}</span><strong className={identity.stepUp ? styles.textGood : styles.textBad}>{identity.stepUp ? c.stepUpReady : c.stepUpExpired}</strong></div>
              <div><span>{c.sessionCount}</span><strong>{identity.sessions?.filter((item) => !item.revokedAt).length || 0}</strong></div>
              <div><span>{c.recoveryRemaining}</span><strong>{identity.recoveryCodesRemaining || 0}</strong></div>
              <div><span>{c.memberships}</span><strong>{identity.memberships?.filter((item) => item.status === 'active').length || 0}</strong></div>
            </div>
            <div className={styles.securityActions}>
              <div className={styles.fieldGroup}>
                <label htmlFor="ceo-step-up-otp">{c.otpLabel}</label>
                <input id="ceo-step-up-otp" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-describedby="ceo-step-up-otp-hint" />
                <small id="ceo-step-up-otp-hint">{c.otpHint}</small>
              </div>
              <AsyncButton type="button" className="btn btn-primary" pendingLabel={c.steppingUp} disabled={otp.length !== 6} onClick={stepUpIdentity}><Icon name="shield" size={16} />{c.stepUp}</AsyncButton>
              <AsyncButton type="button" className="btn btn-outline" pendingLabel={c.rotatingRecovery} disabled={!identity.stepUp} onClick={rotateRecoveryCodes}><Icon name="repeat" size={16} />{c.rotateRecovery}</AsyncButton>
            </div>
            <div className={styles.sessionList} aria-label={c.sessionsTitle}>
              <h3>{c.sessionsTitle}</h3>
              {(identity.sessions || []).map((item) => (
                <div className={styles.sessionRow} key={item.id}>
                  <div><strong>{item.deviceLabel}</strong><span>{item.current ? c.currentSession : dateLabel(item.lastSeenAt)}</span></div>
                  <AsyncButton type="button" className="btn btn-outline btn-sm" pendingLabel={c.revoking} disabled={Boolean(item.revokedAt)} onClick={() => revokeSession(item.id)}>{item.revokedAt ? c.disabledStatus : c.revoke}</AsyncButton>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {error && (
        <section className={styles.error} role="alert">
          <Icon name="alert" size={20} /><span>{error}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={load}>{c.retry}</button>
        </section>
      )}

      {!payload && !error && <div className={styles.loading} role="status">{c.loading}</div>}

      {payload && (
        <>
          <section className={styles.stats} aria-label={c.title}>
            {[
              [c.registered, stats.registered, 'clients'], [c.enabled, stats.enabled, 'link'],
              [c.ready, stats.ready, 'check'], [c.openCircuit, stats.open, 'alert'],
            ].map(([label, value, icon]) => (
              <article className="card kpi" key={label}>
                <div className="kpi-top"><span className="kpi-label">{label}</span><span className="kpi-icon"><Icon name={icon} size={17} /></span></div>
                <strong className="kpi-value">{value}</strong>
              </article>
            ))}
          </section>

          <section className={styles.entityGrid} aria-live="polite">
            {entities.map((entity) => (
              <article className={`card ${styles.entityCard}`} key={entity.id}>
                <header className={styles.entityHead}>
                  <div className={styles.identity}>
                    <span className={styles.monogram}>{entity.displayName.slice(0, 2).toUpperCase()}</span>
                    <div><h2>{entity.displayName}</h2><code>{entity.id}</code></div>
                  </div>
                  <span className={`${styles.status} ${styles[statusClass(entity.status)]}`}>
                    <span></span>{statusLabel(entity.status)}
                  </span>
                </header>

                <a className={styles.entityUrl} href={entity.baseUrl} target="_blank" rel="noreferrer">
                  <Icon name="link" size={15} /><span>{entity.baseUrl}</span>
                </a>

                <dl className={styles.metadata}>
                  <div><dt>{c.environment}</dt><dd>{entity.environment}</dd></div>
                  <div><dt>{c.profile}</dt><dd>{entity.businessProfile}</dd></div>
                  <div><dt>{c.contract}</dt><dd>v{entity.contractVersion} · schema {entity.schemaVersion}</dd></div>
                  <div><dt>{c.credential}</dt><dd className={entity.credential.configured ? styles.textGood : styles.textBad}>{entity.credential.configured ? c.configured : c.missing}</dd></div>
                </dl>

                <div className={styles.capabilityBlock}>
                  <h3>{c.capabilities}</h3>
                  <div className={styles.chips}>{entity.capabilities.map((capability) => <span key={capability}>{capability}</span>)}</div>
                </div>

                <dl className={styles.syncGrid}>
                  <div><dt>{c.circuit}</dt><dd>{circuitLabel(entity.sync.circuitState)}</dd></div>
                  <div><dt>{c.errors}</dt><dd>{entity.sync.consecutiveErrors}</dd></div>
                  <div className={styles.syncWide}><dt>{c.lastSuccess}</dt><dd>{dateLabel(entity.sync.lastSuccessfulAt)}</dd></div>
                </dl>

                <footer className={styles.actions}>
                  <AsyncButton
                    type="button"
                    className="btn btn-primary"
                    pendingLabel={c.openingEntity}
                    disabled={!entity.enabled || !entity.credential.configured || !identity?.active || !identity.stepUp || !identity.memberships?.some((item) => item.entityId === entity.id && item.status === 'active')}
                    onClick={() => openEntity(entity)}
                  >
                    <Icon name="link" size={15} /> {c.openEntity}
                  </AsyncButton>
                  <AsyncButton
                    type="button"
                    className={entity.enabled ? 'btn btn-outline' : 'btn btn-primary'}
                    pendingLabel={entity.enabled ? c.disabling : c.enabling}
                    onClick={() => toggle(entity)}
                  >
                    <Icon name={entity.enabled ? 'x' : 'check'} size={15} /> {entity.enabled ? c.disable : c.enable}
                  </AsyncButton>
                  <button type="button" className="btn btn-outline" onClick={() => { setRotating(entity); setCredentialRef(''); }}>
                    <Icon name="repeat" size={15} /> {c.rotate}
                  </button>
                </footer>
              </article>
            ))}
            {!entities.length && <div className={`card ${styles.empty}`}>{c.empty}</div>}
          </section>
        </>
      )}

      {rotating && (
        <Modal title={`${c.rotateTitle} · ${rotating.displayName}`} onClose={() => setRotating(null)} footer={<>
          <button type="button" className="btn btn-outline" onClick={() => setRotating(null)}>{c.cancel}</button>
          <AsyncButton className="btn btn-primary" pendingLabel={c.rotating} onClick={submitRotation}>{c.confirmRotate}</AsyncButton>
        </>}>
          <div className={styles.rotationForm}>
            <p>{c.rotateIntro}</p>
            <label htmlFor="ceo-credential-ref">{c.refLabel}</label>
            <input
              id="ceo-credential-ref"
              value={credentialRef}
              onChange={(event) => setCredentialRef(event.target.value.toUpperCase())}
              placeholder={`CEO_ENTITY_${rotating.id.toUpperCase()}_V2_API_KEY`}
              autoComplete="off"
              spellCheck={false}
              aria-describedby="ceo-credential-ref-hint"
            />
            <small id="ceo-credential-ref-hint">{c.refHint}</small>
          </div>
        </Modal>
      )}

      {recoveryCodes && (
        <Modal title={c.recoveryTitle} onClose={() => setRecoveryCodes(null)} footer={<>
          <button type="button" className="btn btn-outline" onClick={() => setRecoveryCodes(null)}>{c.cancel}</button>
          <AsyncButton type="button" className="btn btn-primary" onClick={copyRecoveryCodes}>{c.copyCodes}</AsyncButton>
        </>}>
          <div className={styles.recoverySheet}>
            <p role="alert"><Icon name="alert" size={18} />{c.recoveryWarning}</p>
            <ol>{recoveryCodes.map((code) => <li key={code}><code>{code}</code></li>)}</ol>
          </div>
        </Modal>
      )}
    </main>
  );
}
