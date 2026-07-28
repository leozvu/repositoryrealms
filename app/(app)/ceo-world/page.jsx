'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { AsyncButton, Forbidden, Icon, useToast } from '@/components/ui';
import { useLanguage } from '@/components/LanguageProvider';
import { initials } from '@/lib/format';
import { rolesOf } from '@/lib/perm';
import styles from './world.module.css';

const COPY = {
  vi: {
    eyebrow: 'CEO-7 · REALM FEDERATION', title: 'Bản đồ bốn vương quốc', intro: 'Mỗi công ty vẫn là một Realm độc lập. Gateway chỉ tạo phiên SSO tại entity đích; dữ liệu, quyền và business record không rời khỏi vương quốc sở hữu.',
    back: 'Tổng quan CEO', inbox: 'Hộp thư liên công ty', refresh: 'Làm mới presence', refreshing: 'Đang liên lạc…', opening: 'Đang mở cổng…', open: 'Đi qua gateway', message: 'Gửi tân thư', retry: 'Thử lại kingdom này', identity: 'Mở Identity & Registry',
    available: 'Presence khả dụng', policy_disabled: 'Công ty chưa cho phép presence', degraded: 'Presence tạm mất kết nối', disabled: 'Gateway đã tắt', online: 'đang online', optedIn: 'đã tự nguyện chia sẻ', noneOnline: 'Không có thành viên opt-in đang online.',
    policy: 'Presence là tín hiệu phiên ngắn hạn, không phải năng suất. Cross-entity chat không tự mở quyền xem task, lead, tài chính, HR hoặc Gold.',
    stepup: 'Cần CEO session với TOTP step-up để đi qua gateway.', loadError: 'Không thể tải Realm federation.', separate: '4 data boundary độc lập', gateways: 'gateway khả dụng', presenceSources: 'nguồn presence', onlineNow: 'người online đã opt-in',
    realm: 'Realm', erp: 'ERP', focus: 'Tập trung', busy: 'Bận', dnd: 'Không làm phiền', away: 'Vắng', availableStatus: 'Sẵn sàng', source: 'Nguồn', privacy: 'Không cấp quyền record', mapLabel: 'Bản đồ minh họa bốn kingdom của RepositoryRealms với các gateway tương tác.',
  },
  en: {
    eyebrow: 'CEO-7 · REALM FEDERATION', title: 'Map of four kingdoms', intro: 'Each company remains an independent Realm. A gateway only creates an SSO session at the target entity; data, authorization, and business records remain with their owning kingdom.',
    back: 'CEO overview', inbox: 'Cross-company inbox', refresh: 'Refresh presence', refreshing: 'Contacting kingdoms…', opening: 'Opening gateway…', open: 'Enter gateway', message: 'Send message', retry: 'Retry this kingdom', identity: 'Open Identity & Registry',
    available: 'Presence available', policy_disabled: 'Company presence policy is off', degraded: 'Presence connection degraded', disabled: 'Gateway disabled', online: 'online', optedIn: 'explicitly opted in', noneOnline: 'No opted-in members are online.',
    policy: 'Presence is short-lived session context, not productivity. Cross-entity chat never grants task, lead, finance, HR, or Gold record access.',
    stepup: 'A CEO session with recent TOTP step-up is required to enter a gateway.', loadError: 'Realm federation could not be loaded.', separate: 'independent data boundaries', gateways: 'available gateways', presenceSources: 'presence sources', onlineNow: 'opted-in people online',
    realm: 'Realm', erp: 'ERP', focus: 'Focus', busy: 'Busy', dnd: 'Do not disturb', away: 'Away', availableStatus: 'Available', source: 'Source', privacy: 'No record access granted', mapLabel: 'Illustrated map of four RepositoryRealms kingdoms with interactive gateways.',
  },
};

const STATUS_ICON = { available: 'check', policy_disabled: 'shield', degraded: 'alert', disabled: 'x' };

export default function CeoWorldPage() {
  const { data: session, status: sessionStatus } = useSession();
  const { locale } = useLanguage();
  const c = COPY[locale] || COPY.vi;
  const toast = useToast();
  const [world, setWorld] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [openingId, setOpeningId] = useState('');

  const load = useCallback(async (entityId = 'all') => {
    if (entityId === 'all') setLoading(true);
    setError('');
    const response = await fetch(`/api/ceo/v1/federation/world?entity=${encodeURIComponent(entityId)}`, { cache: 'no-store' }).catch(() => null);
    if (response?.status === 403) { setForbidden(true); setLoading(false); return false; }
    const body = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) { setError(body.error || c.loadError); setLoading(false); return false; }
    setWorld((current) => {
      if (entityId === 'all' || !current) return body;
      const refreshed = body.kingdoms?.find((kingdom) => kingdom.id === entityId);
      if (!refreshed) return current;
      const kingdoms = current.kingdoms.map((kingdom) => kingdom.id === entityId ? refreshed : kingdom);
      return {
        ...current, asOf: body.asOf, identity: body.identity, kingdoms,
        summary: {
          registered: kingdoms.length,
          gatewaysAvailable: kingdoms.filter((kingdom) => kingdom.gateway.available).length,
          presenceAvailable: kingdoms.filter((kingdom) => kingdom.presence.state === 'available').length,
          online: kingdoms.reduce((total, kingdom) => total + kingdom.presence.online, 0),
        },
      };
    });
    setLoading(false); return true;
  }, [c.loadError]);

  useEffect(() => { if (sessionStatus === 'authenticated') load(); }, [load, sessionStatus]);

  const openGateway = async (kingdom) => {
    if (!world?.identity.stepUp) { toast(c.stepup, 'error'); return false; }
    if (!kingdom.gateway.available || openingId) return false;
    setOpeningId(kingdom.id);
    try {
      const response = await fetch('/api/ceo/v1/sso/authorize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: kingdom.id, redirectPath: kingdom.gateway.redirectPath }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { toast(body.error || c.loadError, 'error'); return false; }
      window.location.assign(body.destination); return true;
    } catch {
      toast(c.loadError, 'error'); return false;
    } finally { setOpeningId(''); }
  };

  if (sessionStatus === 'loading') return <div className={styles.loading}>{c.loadError}</div>;
  if (!rolesOf(session?.user).includes('DIRECTOR') || forbidden) return <Forbidden />;
  const kingdoms = world?.kingdoms || [];

  return <main className={styles.page} data-no-i18n>
    <header className={styles.hero}>
      <div><p className={styles.eyebrow}>{c.eyebrow}</p><h1>{c.title}</h1><p>{c.intro}</p></div>
      <div className={styles.heroActions}>
        <Link className="btn btn-outline" href="/ceo-overview"><Icon name="dashboard" size={17} />{c.back}</Link>
        <Link className="btn btn-outline" href="/ceo-inbox"><Icon name="mail" size={17} />{c.inbox}</Link>
        <AsyncButton type="button" className="btn btn-primary" pendingLabel={c.refreshing} onClick={() => load()}><Icon name="repeat" size={16} />{c.refresh}</AsyncButton>
      </div>
    </header>

    <section className={styles.trust} role="note"><Icon name="shield" size={22} /><p>{c.policy}</p><strong>{c.separate}</strong></section>
    {!world?.identity.stepUp && !loading && <section className={styles.notice} role="status"><Icon name="alert" size={19} /><span>{c.stepup}</span><Link className="btn btn-outline" href="/ceo-registry">{c.identity}</Link></section>}
    {error && <section className={styles.error} role="alert"><span>{error}</span><button type="button" className="btn btn-outline" onClick={() => load()}>{c.refresh}</button></section>}

    {world && <section className={styles.metrics} aria-label="Federation summary">
      <article><Icon name="shield" size={20} /><span><strong>{world.summary.registered}</strong><small>{c.separate}</small></span></article>
      <article><Icon name="link" size={20} /><span><strong>{world.summary.gatewaysAvailable}</strong><small>{c.gateways}</small></span></article>
      <article><Icon name="reports" size={20} /><span><strong>{world.summary.presenceAvailable}</strong><small>{c.presenceSources}</small></span></article>
      <article><Icon name="staff" size={20} /><span><strong>{world.summary.online}</strong><small>{c.onlineNow}</small></span></article>
    </section>}

    <section className={styles.worldFrame} aria-label={c.mapLabel} aria-busy={loading || undefined}>
      <div className={styles.worldMap}>
        {loading && <div className={styles.mapLoading} role="status"><Icon name="repeat" size={28} /><span>{c.refreshing}</span></div>}
        {kingdoms.map((kingdom) => <article key={kingdom.id} className={`${styles.kingdom} ${styles[kingdom.mapPosition]} ${styles[kingdom.presence.state]}`}>
          <header>
            <span className={styles.crest}>{initials(kingdom.displayName)}</span>
            <span><small>{kingdom.displayName}</small><h2>{kingdom.realmName}</h2></span>
            <i title={c[kingdom.presence.state]}><Icon name={STATUS_ICON[kingdom.presence.state] || 'alert'} size={16} /></i>
          </header>
          <div className={styles.presenceLine}><strong>{kingdom.presence.online}</strong><span>{c.online} · {kingdom.presence.optedInProfiles} {c.optedIn}</span></div>
          <div className={styles.people} aria-label={`${kingdom.presence.online} ${c.online}`}>
            {kingdom.presence.people.slice(0, 4).map((person) => <span key={person.userId} title={`${person.displayName} · ${c[person.availability] || person.availability}`}><b>{initials(person.displayName)}</b><em>{person.displayName}</em><small>{person.surface === 'realm' ? c.realm : c.erp}</small></span>)}
            {!kingdom.presence.people.length && <p>{c[kingdom.presence.state] || c.noneOnline}</p>}
          </div>
          <footer>
            <AsyncButton type="button" className="btn btn-primary" disabled={!kingdom.gateway.available || Boolean(openingId)} pendingLabel={c.opening} onClick={() => openGateway(kingdom)}><Icon name="link" size={16} />{c.open}</AsyncButton>
            <Link className="btn btn-outline" href={kingdom.chat.href}><Icon name="mail" size={16} />{c.message}</Link>
            {kingdom.presence.state === 'degraded' && <AsyncButton type="button" className={styles.retry} pendingLabel={c.refreshing} onClick={() => load(kingdom.id)}><Icon name="repeat" size={14} />{c.retry}</AsyncButton>}
          </footer>
          <div className={styles.boundary}><Icon name="shield" size={13} /><span>{c.privacy}</span><code>{kingdom.id}</code></div>
        </article>)}
      </div>
      <footer className={styles.mapCaption}><span><Icon name="link" size={14} />SSO gateway · one-time code</span><span><Icon name="staff" size={14} />Presence TTL · 70s</span><span><Icon name="shield" size={14} />{c.privacy}</span></footer>
    </section>
  </main>;
}
