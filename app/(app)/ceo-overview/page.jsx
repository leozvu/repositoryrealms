'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { AsyncButton, Forbidden, Icon, useToast } from '@/components/ui';
import { useLanguage } from '@/components/LanguageProvider';
import { rolesOf } from '@/lib/perm';
import styles from './overview.module.css';

const DEFAULT_ENTITIES = [
  { id: 'aim', displayName: 'AIm Agency' },
  { id: 'egoric', displayName: 'Egoric Agency' },
  { id: 'vnecom', displayName: 'Vnecom LLC' },
  { id: 'egolive', displayName: 'Egolive' },
];

const COPY = {
  vi: {
    eyebrow: 'CEO-4 · UNIFIED READ DASHBOARD', title: 'Toàn cảnh bốn công ty',
    intro: 'Một bảng đọc chung cho AIm, Egoric, Vnecom và Egolive. Mỗi chỉ số luôn cho biết nguồn, thời điểm chốt dữ liệu và độ mới.',
    all: 'Tất cả công ty', refresh: 'Làm mới dữ liệu', refreshing: 'Đang gọi các entity…',
    loading: 'Đang tải snapshot đã lưu…', retry: 'Thử lại', loadError: 'Không thể tải CEO Dashboard.',
    readOnly: 'Control plane chỉ đọc', policy: 'Portal chỉ nhận aggregate đã whitelist. Không truy vấn trực tiếp database công ty và không ghi business record.',
    sourceHealth: 'Nguồn khả dụng', cashRevenue: 'Doanh thu tiền về tháng này', delivery: 'Vận hành dự án', people: 'Nhân sự đang hoạt động', liveGmv: 'GMV livestream',
    activeProjects: 'dự án đang chạy', lateProjects: 'trễ hạn', contributing: 'nguồn đóng góp',
    currentSources: 'snapshot hợp lệ', sourceSnapshot: 'Nguồn: CEO v1 snapshot đã xác thực', noData: 'Chưa có dữ liệu',
    fresh: 'Mới', stale: 'Cũ nhưng còn dùng được', expired: 'Hết hạn', missing: 'Chưa đồng bộ', invalid: 'Snapshot lỗi', disabled: 'Đã tắt',
    sourceAsOf: 'Dữ liệu tại', fetchedAt: 'Portal nhận lúc', age: 'Tuổi dữ liệu', seconds: 'giây', minutes: 'phút', hours: 'giờ',
    entityCards: 'Chi tiết theo công ty', comparison: 'So sánh All companies', company: 'Công ty', state: 'Trạng thái nguồn', revenue: 'Tiền về', pipeline: 'Pipeline CRM', execution: 'Dự án', headcount: 'Nhân sự', vertical: 'Chỉ số dọc',
    crm: 'CRM', winRate: 'Win rate', tasks: 'công việc mở', overdue: 'quá hạn', finance: 'Tài chính', deliveryDomain: 'Delivery', peopleDomain: 'People', livestream: 'Livestream', support: 'Support',
    openDetail: 'Mở chi tiết tại entity', activatingRequired: 'Cần CEO session + TOTP để mở deep link đã ký.', manageIdentity: 'Mở Identity & Registry',
    staleNotice: 'Một số nguồn đang dùng snapshot cũ vì entity chưa phản hồi. Các số hết hạn đã bị loại khỏi tổng.',
    partialRefresh: 'Làm mới một phần: một số entity không phản hồi; snapshot gần nhất vẫn được giữ.', refreshSuccess: 'Đã cập nhật snapshot của các entity khả dụng.',
    cachePolicy: 'Cache 5 phút · stale-if-error 24 giờ', noEntities: 'Chưa có entity hoặc migration CEO-4 chưa được áp dụng.', commandCenter: 'Điều phối liên công ty',
    cashBasis: 'Cash-ledger, không phải lợi nhuận kế toán', gmvWarning: 'GMV không được cộng vào revenue',
  },
  en: {
    eyebrow: 'CEO-4 · UNIFIED READ DASHBOARD', title: 'Four-company overview',
    intro: 'One read surface for AIm, Egoric, Vnecom and Egolive. Every metric exposes its source, source timestamp and freshness.',
    all: 'All companies', refresh: 'Refresh data', refreshing: 'Contacting entities…',
    loading: 'Loading saved snapshots…', retry: 'Try again', loadError: 'CEO Dashboard could not be loaded.',
    readOnly: 'Read-only control plane', policy: 'The Portal accepts whitelisted aggregates only. It never queries company databases directly or writes business records.',
    sourceHealth: 'Available sources', cashRevenue: 'Cash revenue this month', delivery: 'Project delivery', people: 'Active people', liveGmv: 'Livestream GMV',
    activeProjects: 'active projects', lateProjects: 'late', contributing: 'contributing sources',
    currentSources: 'valid snapshots', sourceSnapshot: 'Source: validated CEO v1 snapshots', noData: 'No data yet',
    fresh: 'Fresh', stale: 'Stale but usable', expired: 'Expired', missing: 'Not synchronized', invalid: 'Invalid snapshot', disabled: 'Disabled',
    sourceAsOf: 'Source as of', fetchedAt: 'Portal fetched', age: 'Data age', seconds: 'seconds', minutes: 'minutes', hours: 'hours',
    entityCards: 'Company detail', comparison: 'All companies comparison', company: 'Company', state: 'Source state', revenue: 'Cash revenue', pipeline: 'CRM pipeline', execution: 'Projects', headcount: 'People', vertical: 'Vertical KPI',
    crm: 'CRM', winRate: 'Win rate', tasks: 'open tasks', overdue: 'overdue', finance: 'Finance', deliveryDomain: 'Delivery', peopleDomain: 'People', livestream: 'Livestream', support: 'Support',
    openDetail: 'Open detail in entity', activatingRequired: 'A CEO session with TOTP step-up is required for a signed deep link.', manageIdentity: 'Open Identity & Registry',
    staleNotice: 'Some sources use stale snapshots because an entity did not respond. Expired numbers are excluded from totals.',
    partialRefresh: 'Partial refresh: some entities did not respond; their latest usable snapshots were retained.', refreshSuccess: 'Available entity snapshots were updated.',
    cachePolicy: '5-minute cache · stale-if-error for 24 hours', noEntities: 'No entity exists or the CEO-4 migration has not been applied.', commandCenter: 'Cross-company commands',
    cashBasis: 'Cash-ledger view, not accounting profit', gmvWarning: 'GMV is never added to revenue',
  },
};

const DOMAIN_META = {
  finance: ['finance', 'Finance'], crm: ['leads', 'CRM'], delivery: ['projects', 'Delivery'],
  people: ['staff', 'People'], livestream: ['camera', 'Livestream'], support: ['check', 'Support'],
  export: ['upload', 'Export'], inventory: ['wallet', 'Inventory'],
};

function formatMoney(value, currency, locale) {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
    style: 'currency', currency, notation: Math.abs(value) >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

function moneyList(rows, locale, empty) {
  if (!rows?.length) return empty;
  return rows.map((row) => formatMoney(row.value, row.currency, locale)).join(' · ');
}

function ageLabel(seconds, c) {
  if (!Number.isFinite(seconds)) return '—';
  if (seconds < 60) return `${seconds} ${c.seconds}`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} ${c.minutes}`;
  return `${Math.floor(seconds / 3600)} ${c.hours}`;
}

export default function CeoOverviewPage() {
  const { data: session, status: sessionStatus } = useSession();
  const { locale } = useLanguage();
  const c = COPY[locale] || COPY.vi;
  const toast = useToast();
  const [filter, setFilter] = useState('all');
  const [dashboard, setDashboard] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState('');
  const autoRefreshed = useRef(new Set());

  const load = useCallback(async (entityId = filter) => {
    setError('');
    const response = await fetch(`/api/ceo/v1/dashboard?entity=${encodeURIComponent(entityId)}`, { cache: 'no-store' }).catch(() => null);
    if (response?.status === 403) { setForbidden(true); return false; }
    const body = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) { setError(body.error || c.loadError); return false; }
    setDashboard(body);
    return true;
  }, [c.loadError, filter]);

  const loadIdentity = useCallback(async () => {
    const response = await fetch('/api/ceo/v1/identity/session', { cache: 'no-store' }).catch(() => null);
    const body = response ? await response.json().catch(() => ({})) : {};
    if (response?.ok) setIdentity(body);
  }, []);

  const refresh = useCallback(async (entityId = filter, quiet = false) => {
    if (!quiet) setRefreshNotice('');
    const response = await fetch('/api/ceo/v1/dashboard/refresh', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entityId, force: !quiet }),
    }).catch(() => null);
    const body = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) {
      if (!quiet) toast(body.error || c.loadError, 'error');
      return false;
    }
    setDashboard(body);
    const partial = body.refresh?.failed > 0;
    setRefreshNotice(partial ? c.partialRefresh : '');
    if (!quiet) toast(partial ? c.partialRefresh : c.refreshSuccess, partial ? 'error' : 'success');
    return true;
  }, [c.loadError, c.partialRefresh, c.refreshSuccess, filter, toast]);

  useEffect(() => {
    if (sessionStatus !== 'authenticated') return;
    let active = true;
    Promise.all([load(filter), loadIdentity()]).then(([loaded]) => {
      if (active && loaded && !autoRefreshed.current.has(filter)) {
        autoRefreshed.current.add(filter);
        refresh(filter, true);
      }
    });
    return () => { active = false; };
  }, [filter, load, loadIdentity, refresh, sessionStatus]);

  const entityOptions = useMemo(() => {
    const fromDashboard = dashboard?.entities?.map(({ id, displayName }) => ({ id, displayName })) || [];
    return DEFAULT_ENTITIES.map((fallback) => fromDashboard.find((item) => item.id === fallback.id) || fallback);
  }, [dashboard]);

  const openDetail = async (entity, domain) => {
    if (!identity?.active || !identity?.stepUp) { toast(c.activatingRequired, 'error'); return false; }
    const redirectPath = entity.drillDowns?.[domain];
    if (!redirectPath) return false;
    const response = await fetch('/api/ceo/v1/sso/authorize', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId: entity.id, redirectPath }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { toast(body.error || c.loadError, 'error'); return false; }
    window.location.assign(body.destination);
    return true;
  };

  if (sessionStatus === 'loading') return <div className={styles.loading}>{c.loading}</div>;
  if (!rolesOf(session?.user).includes('DIRECTOR') || forbidden) return <Forbidden />;

  const stateLabel = (state) => c[state] || state;
  const dateLabel = (value) => value
    ? new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : '—';
  const entities = dashboard?.entities || [];
  const portfolio = dashboard?.portfolio;
  const sourceLabel = dashboard ? `${dashboard.health.available}/${dashboard.health.registered} ${c.currentSources}` : c.noData;

  return (
    <main className={styles.page} data-no-i18n>
      <header className={styles.hero}>
        <div><p className={styles.eyebrow}>{c.eyebrow}</p><h1>{c.title}</h1><p>{c.intro}</p></div>
        <div className={styles.heroActions}>
          <Link className="btn btn-outline" href="/ceo-commands"><Icon name="link" size={16} />{c.commandCenter}</Link>
          <AsyncButton type="button" className="btn btn-primary" pendingLabel={c.refreshing} onClick={() => refresh(filter)}>
            <Icon name="repeat" size={16} />{c.refresh}
          </AsyncButton>
        </div>
      </header>

      <section className={styles.policy} aria-label={c.readOnly}>
        <span><Icon name="shield" size={21} /></span>
        <div><strong>{c.readOnly}</strong><p>{c.policy}</p></div>
        <code>{c.cachePolicy}</code>
      </section>

      <nav className={styles.switcher} aria-label={c.company}>
        <button type="button" className={filter === 'all' ? styles.activeFilter : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}><Icon name="dashboard" size={16} />{c.all}</button>
        {entityOptions.map((entity) => <button type="button" key={entity.id} className={filter === entity.id ? styles.activeFilter : ''} aria-pressed={filter === entity.id} onClick={() => setFilter(entity.id)}>{entity.displayName}</button>)}
      </nav>

      {(refreshNotice || dashboard?.health?.stale > 0) && <div className={styles.notice} role="status"><Icon name="alert" size={18} /><span>{refreshNotice || c.staleNotice}</span></div>}
      {error && <div className={styles.error} role="alert"><Icon name="alert" size={18} /><span>{error}</span><button type="button" className="btn btn-outline" onClick={() => load(filter)}>{c.retry}</button></div>}
      {!dashboard && !error && <div className={styles.loading} role="status">{c.loading}</div>}

      {dashboard && <>
        <section className={styles.summaryGrid} aria-label={c.title}>
          <article className={`card ${styles.summaryCard}`}><div className={styles.summaryHead}><span><Icon name="link" size={18} /></span><small>{c.sourceHealth}</small></div><strong>{dashboard.health.available}/{dashboard.health.registered}</strong><p>{dashboard.health.fresh} {c.fresh.toLowerCase()} · {dashboard.health.stale} {c.stale.toLowerCase()}</p><footer>{c.sourceSnapshot}</footer></article>
          <article className={`card ${styles.summaryCard}`}><div className={styles.summaryHead}><span><Icon name="finance" size={18} /></span><small>{c.cashRevenue}</small></div><strong>{moneyList(portfolio.finance.revenueCashByCurrency, locale, c.noData)}</strong><p>{portfolio.finance.entitiesContributing} {c.contributing} · {c.cashBasis}</p><footer>{sourceLabel}</footer></article>
          <article className={`card ${styles.summaryCard}`}><div className={styles.summaryHead}><span><Icon name="projects" size={18} /></span><small>{c.delivery}</small></div><strong>{portfolio.delivery.projectsActive} {c.activeProjects}</strong><p>{portfolio.delivery.projectsLate} {c.lateProjects} · {portfolio.delivery.tasksOverdue} {c.overdue}</p><footer>{portfolio.delivery.entitiesContributing} {c.contributing} · {c.sourceSnapshot}</footer></article>
          <article className={`card ${styles.summaryCard}`}><div className={styles.summaryHead}><span><Icon name="staff" size={18} /></span><small>{c.people}</small></div><strong>{portfolio.people.activeHeadcount}</strong><p>{portfolio.people.entitiesContributing} {c.contributing}</p><footer>{c.sourceSnapshot}</footer></article>
          <article className={`card ${styles.summaryCard} ${styles.liveSummary}`}><div className={styles.summaryHead}><span><Icon name="camera" size={18} /></span><small>{c.liveGmv}</small></div><strong>{moneyList(portfolio.livestream.gmvByCurrency, locale, c.noData)}</strong><p>{portfolio.livestream.pendingReconciliation} pending reconciliation · {c.gmvWarning}</p><footer>{portfolio.livestream.entitiesContributing} {c.contributing} · {c.sourceSnapshot}</footer></article>
        </section>

        {!identity?.active || !identity?.stepUp ? <section className={styles.identityNotice}><Icon name="shield" size={19} /><span>{c.activatingRequired}</span><Link className="btn btn-outline" href="/ceo-registry">{c.manageIdentity}</Link></section> : null}

        <section aria-labelledby="ceo-entity-cards-title">
          <div className={styles.sectionHead}><div><p className={styles.eyebrow}>ENTITY SOURCES</p><h2 id="ceo-entity-cards-title">{c.entityCards}</h2></div><span>{dashboard.provenance.source}</span></div>
          <div className={styles.entityGrid}>
            {entities.map((entity) => <EntityCard key={entity.id} entity={entity} c={c} locale={locale} dateLabel={dateLabel} stateLabel={stateLabel} ageLabel={ageLabel} openDetail={openDetail} identityReady={identity?.active && identity?.stepUp} />)}
            {!entities.length && <div className={`card ${styles.empty}`}>{c.noEntities}</div>}
          </div>
        </section>

        {filter === 'all' && entities.length > 0 && <section className={`card ${styles.comparison}`} aria-labelledby="ceo-comparison-title">
          <div className={styles.comparisonHead}><div><p className={styles.eyebrow}>ALL COMPANIES</p><h2 id="ceo-comparison-title">{c.comparison}</h2></div><span>{c.sourceSnapshot}</span></div>
          <table>
            <caption>{c.comparison} · {dateLabel(dashboard.asOf)}</caption>
            <thead><tr><th>{c.company}</th><th>{c.state}</th><th>{c.revenue}</th><th>{c.pipeline}</th><th>{c.execution}</th><th>{c.headcount}</th><th>{c.vertical}</th></tr></thead>
            <tbody>{entities.map((entity) => {
              const snapshot = entity.snapshot; const domains = snapshot?.domains || {}; const currency = snapshot?.currency;
              return <tr key={entity.id}>
                <th scope="row" data-label={c.company}>{entity.displayName}</th>
                <td data-label={c.state}><span className={`${styles.state} ${styles[entity.freshness.state]}`}><span></span>{stateLabel(entity.freshness.state)}</span></td>
                <td data-label={c.revenue}>{domains.finance ? formatMoney(domains.finance.revenueCash, currency, locale) : '—'}</td>
                <td data-label={c.pipeline}>{domains.crm ? <>{formatMoney(domains.crm.pipelineValue, currency, locale)}<small>{c.winRate}: {domains.crm.winRate ?? '—'}%</small></> : '—'}</td>
                <td data-label={c.execution}>{domains.delivery ? <>{domains.delivery.projectsActive} {c.activeProjects}<small>{domains.delivery.projectsLate} {c.lateProjects}</small></> : '—'}</td>
                <td data-label={c.headcount}>{domains.people?.activeHeadcount ?? '—'}</td>
                <td data-label={c.vertical}>{domains.livestream ? <>{formatMoney(domains.livestream.gmvOnStream, currency, locale)}<small>{c.liveGmv}</small></> : '—'}</td>
              </tr>;
            })}</tbody>
          </table>
          <footer>{dashboard.provenance.caveats.join(' · ')}</footer>
        </section>}
      </>}
    </main>
  );
}

function EntityCard({ entity, c, locale, dateLabel, stateLabel, ageLabel: formatAge, openDetail, identityReady }) {
  const domains = entity.snapshot?.domains || {};
  const currency = entity.snapshot?.currency;
  const domainEntries = Object.entries(domains);
  return <article className={`card ${styles.entityCard}`}>
    <header><div className={styles.entityIdentity}><span>{entity.displayName.slice(0, 2).toUpperCase()}</span><div><h3>{entity.displayName}</h3><code>{entity.id} · {entity.businessProfile}</code></div></div><span className={`${styles.state} ${styles[entity.freshness.state]}`}><span></span>{stateLabel(entity.freshness.state)}</span></header>
    {entity.snapshot ? <div className={styles.domainList}>{domainEntries.map(([domain, values]) => {
      const meta = DOMAIN_META[domain] || ['dashboard', domain];
      let primary = '';
      let secondary = '';
      if (domain === 'finance') { primary = formatMoney(values.revenueCash, currency, locale); secondary = `${c.revenue} · ${c.cashBasis}`; }
      else if (domain === 'crm') { primary = formatMoney(values.pipelineValue, currency, locale); secondary = `${values.pipelineCount} pipeline · ${c.winRate} ${values.winRate ?? '—'}%`; }
      else if (domain === 'delivery') { primary = `${values.projectsActive} ${c.activeProjects}`; secondary = `${values.projectsLate} ${c.lateProjects} · ${values.tasksOpen} ${c.tasks}`; }
      else if (domain === 'people') { primary = String(values.activeHeadcount); secondary = c.people; }
      else if (domain === 'livestream') { primary = formatMoney(values.gmvOnStream, currency, locale); secondary = `${c.liveGmv} · ${c.gmvWarning}`; }
      else if (domain === 'support') { primary = String(values.ticketsOpen); secondary = `${c.support} · SLA ${values.slaBreaches}`; }
      else { primary = Object.values(values).find((value) => typeof value === 'number') ?? '—'; secondary = meta[1]; }
      return <div className={styles.domainRow} key={domain}><span className={styles.domainIcon}><Icon name={meta[0]} size={17} /></span><div><small>{meta[1]}</small><strong>{primary}</strong><p>{secondary}</p></div><AsyncButton type="button" className="btn btn-outline btn-sm" disabled={!identityReady || !entity.drillDowns?.[domain]} pendingLabel="…" onClick={() => openDetail(entity, domain)}>{c.openDetail}</AsyncButton></div>;
    })}</div> : <div className={styles.noSnapshot}><Icon name="alert" size={20} /><strong>{stateLabel(entity.freshness.state)}</strong><p>{entity.sync.lastErrorCode || c.noData}</p></div>}
    <footer className={styles.provenance}>
      <div><span>{c.sourceAsOf}</span><strong>{dateLabel(entity.provenance?.sourceAsOf)}</strong></div>
      <div><span>{c.fetchedAt}</span><strong>{dateLabel(entity.provenance?.fetchedAt)}</strong></div>
      <div><span>{c.age}</span><strong>{formatAge(entity.freshness.ageSeconds, c)}</strong></div>
      <p>{entity.provenance ? `${entity.provenance.upstreamSource} · ${entity.provenance.contract} v${entity.provenance.contractVersion}` : c.sourceSnapshot}</p>
    </footer>
  </article>;
}
