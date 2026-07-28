'use client';

import { useCallback, useEffect, useState } from 'react';
import { AsyncButton, Icon, useToast } from '@/components/ui';
import { useLanguage } from '@/components/LanguageProvider';
import styles from './CeoFederationPolicy.module.css';

const COPY = {
  vi: {
    loadError: 'Không thể tải chính sách Realm federation.', saveError: 'Không thể cập nhật chính sách federation.',
    enabledToast: 'Đã cho phép chia sẻ presence tự nguyện.', disabledToast: 'Đã tắt chia sẻ presence ra CEO Portal.',
    title: 'Chính sách cổng liên vương quốc', intro: 'CEO luôn có thể đi qua gateway bằng SSO theo membership. Presence chỉ rời entity này khi công ty cho phép và từng nhân sự tự bật chia sẻ.',
    enabled: 'Đang cho phép presence opt-in', disabled: 'Presence federation đang tắt', privacy: 'Không dùng trạng thái online để chấm năng suất, xếp hạng hoặc mở quyền xem record.',
    retry: 'Tải lại', saving: 'Đang cập nhật…', turnOff: 'Tắt chia sẻ presence', turnOn: 'Cho phép presence tự nguyện',
    version: 'Phiên bản policy', audit: 'Thay đổi được ghi AuditLog. Tắt policy có hiệu lực ở lần đọc tiếp theo và không ảnh hưởng ERP login.',
  },
  en: {
    loadError: 'Realm federation policy could not be loaded.', saveError: 'Federation policy could not be updated.',
    enabledToast: 'Voluntary presence sharing is now permitted.', disabledToast: 'Presence sharing to the CEO Portal is off.',
    title: 'Inter-kingdom gateway policy', intro: 'The CEO may enter through SSO according to membership. Presence leaves this entity only when the company permits it and each employee explicitly opts in.',
    enabled: 'Opt-in presence is permitted', disabled: 'Federated presence is off', privacy: 'Online state is never used for productivity scoring, employee ranking, or record authorization.',
    retry: 'Retry', saving: 'Updating…', turnOff: 'Turn off presence sharing', turnOn: 'Permit voluntary presence',
    version: 'Policy version', audit: 'Changes are recorded in AuditLog. Turning this off applies on the next read and does not affect ERP login.',
  },
};

export default function CeoFederationPolicy() {
  const { locale } = useLanguage();
  const c = COPY[locale] || COPY.vi;
  const toast = useToast();
  const [policy, setPolicy] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const response = await fetch('/api/ceo/v1/federation/policy', { cache: 'no-store' }).catch(() => null);
    const body = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) { setError(body.error || c.loadError); return false; }
    setPolicy(body.policy); return true;
  }, [c.loadError]);

  useEffect(() => { load(); }, [load]);

  const toggle = async () => {
    if (!policy) return false;
    const response = await fetch('/api/ceo/v1/federation/policy', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion: policy.version, presenceEnabled: !policy.presenceEnabled }),
    }).catch(() => null);
    const body = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) { setError(body.error || c.saveError); return false; }
    setPolicy(body.policy); setError('');
    toast(body.policy.presenceEnabled ? c.enabledToast : c.disabledToast);
    return true;
  };

  return <section className={`card ${styles.card}`} aria-labelledby="ceo-federation-policy-title">
    <header className={styles.head}>
      <span className={styles.icon}><Icon name="link" size={20} /></span>
      <div><p>CEO-7 · REALM FEDERATION</p><h2 id="ceo-federation-policy-title">{c.title}</h2></div>
    </header>
    <div className={styles.body}>
      <p>{c.intro}</p>
      <div className={`${styles.state} ${policy?.presenceEnabled ? styles.enabled : styles.disabled}`} role="status">
        <Icon name={policy?.presenceEnabled ? 'check' : 'shield'} size={18} />
        <span><strong>{policy?.presenceEnabled ? c.enabled : c.disabled}</strong><small>{c.privacy}</small></span>
      </div>
      {error && <div className={styles.error} role="alert"><span>{error}</span><button type="button" className="btn btn-outline btn-sm" onClick={load}>{c.retry}</button></div>}
      <AsyncButton type="button" className="btn btn-outline" disabled={!policy} pendingLabel={c.saving} onClick={toggle}>
        <Icon name={policy?.presenceEnabled ? 'x' : 'check'} size={16} />{policy?.presenceEnabled ? c.turnOff : c.turnOn}
      </AsyncButton>
      <small>{c.version} {policy?.version || '—'} · {c.audit}</small>
    </div>
  </section>;
}
