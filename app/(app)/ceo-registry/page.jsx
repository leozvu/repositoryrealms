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

  const load = useCallback(async () => {
    setError('');
    const response = await fetch('/api/ceo/v1/registry', { cache: 'no-store' }).catch(() => null);
    if (response?.status === 403) { setForbidden(true); return; }
    const body = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) { setError(body.error || c.loadError); return; }
    setPayload(body);
  }, [c.loadError]);

  useEffect(() => {
    if (sessionStatus === 'authenticated') load();
  }, [load, sessionStatus]);

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
    </main>
  );
}
