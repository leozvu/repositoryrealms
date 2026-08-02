'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Forbidden, Icon } from '@/components/ui';
import { useLanguage } from '@/components/LanguageProvider';
import { buildCeoUniversalNavigator, searchCeoUniversalNavigator } from '@/lib/ceo-universal-navigator';
import { rolesOf } from '@/lib/perm';
import styles from './page.module.css';

const COPY = {
  vi: {
    eyebrow: 'CEO-15 · UNIVERSAL COMPANY NAVIGATOR', title: 'Một ô tìm kiếm. Mọi công ty. Đúng workflow.',
    intro: 'Tìm nhanh không gian CEO hoặc mở ERP, CRM, Realm và workflow gốc của từng công ty qua SSO đã ký.',
    searchLabel: 'Tìm công ty hoặc workflow', searchPlaceholder: 'Ví dụ: Egoric CRM, Egolive ca live, phê duyệt…',
    hint: 'Ctrl+K để mở Navigator · ↑↓ để chọn · Enter để mở', all: 'Tất cả', portal: 'CEO Terminal', companies: 'Workflow công ty',
    loading: 'Đang nạp danh bạ công ty…', retry: 'Thử lại', empty: 'Không có workflow phù hợp.',
    portalMetric: 'Không gian Portal', entityMetric: 'Công ty trong registry', workflowMetric: 'Workflow qua SSO', availableMetric: 'Sẵn sàng mở',
    portalBadge: 'Control plane', open: 'Mở', opening: 'Đang tạo SSO…', entityDisabled: 'Công ty đang tắt', stepUpRequired: 'Cần CEO session + TOTP',
    identityTitle: 'Entity workflow luôn giữ nguyên authorization', identityBody: 'Navigator không index record, không truy cập database công ty và không tự thực thi business action.',
    activate: 'Kích hoạt Identity', sourceError: 'Không thể nạp Entity Registry. Các không gian Portal vẫn sử dụng được.',
    launchError: 'Không thể mở workflow này. Hãy kiểm tra TOTP, rollout ring và trạng thái entity.',
    status: 'Trạng thái', ready: 'Sẵn sàng', degraded: 'Suy giảm', unreachable: 'Mất kết nối', unverified: 'Chưa xác minh', disabled: 'Đã tắt',
  },
  en: {
    eyebrow: 'CEO-15 · UNIVERSAL COMPANY NAVIGATOR', title: 'One search. Every company. The right workflow.',
    intro: 'Find a CEO workspace or open each company’s canonical ERP, CRM, Realm, and workflows through signed SSO.',
    searchLabel: 'Search company or workflow', searchPlaceholder: 'Try: Egoric CRM, Egolive live sessions, approvals…',
    hint: 'Ctrl+K opens Navigator · ↑↓ selects · Enter opens', all: 'All', portal: 'CEO Terminal', companies: 'Company workflows',
    loading: 'Loading the company registry…', retry: 'Try again', empty: 'No matching workflow exists.',
    portalMetric: 'Portal workspaces', entityMetric: 'Registered companies', workflowMetric: 'SSO workflows', availableMetric: 'Ready to open',
    portalBadge: 'Control plane', open: 'Open', opening: 'Creating SSO…', entityDisabled: 'Company is disabled', stepUpRequired: 'CEO session + TOTP required',
    identityTitle: 'Entity workflows always preserve canonical authorization', identityBody: 'Navigator indexes no records, accesses no company database, and never executes a business action itself.',
    activate: 'Activate Identity', sourceError: 'Entity Registry is unavailable. Portal workspaces remain usable.',
    launchError: 'This workflow could not be opened. Check TOTP, rollout ring, and entity status.',
    status: 'Status', ready: 'Ready', degraded: 'Degraded', unreachable: 'Unreachable', unverified: 'Unverified', disabled: 'Disabled',
  },
};

export default function CeoNavigatorPage() {
  const { data: session, status } = useSession();
  const { locale } = useLanguage();
  const c = COPY[locale] || COPY.vi;
  const router = useRouter();
  const searchRef = useRef(null);
  const resultRefs = useRef(new Map());
  const [entities, setEntities] = useState([]);
  const [identityReady, setIdentityReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sourceError, setSourceError] = useState('');
  const [launchError, setLaunchError] = useState('');
  const [openingId, setOpeningId] = useState('');
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');
  const [activeIndex, setActiveIndex] = useState(0);

  const load = useCallback(async () => {
    setLoading(true); setSourceError(''); setLaunchError('');
    const [registryResponse, identityResponse] = await Promise.all([
      fetch('/api/ceo/v1/registry', { cache: 'no-store' }).catch(() => null),
      fetch('/api/ceo/v1/identity/session', { cache: 'no-store' }).catch(() => null),
    ]);
    const [registry, identity] = await Promise.all([
      registryResponse ? registryResponse.json().catch(() => ({})) : {},
      identityResponse ? identityResponse.json().catch(() => ({})) : {},
    ]);
    if (registryResponse?.ok) setEntities(Array.isArray(registry.entities) ? registry.entities : []);
    else { setEntities([]); setSourceError(c.sourceError); }
    setIdentityReady(Boolean(identityResponse?.ok && identity.active && identity.stepUp));
    setLoading(false);
  }, [c.sourceError]);

  useEffect(() => { if (status === 'authenticated') load(); }, [load, status]);
  useEffect(() => {
    const handler = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); searchRef.current?.focus(); searchRef.current?.select();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const catalog = useMemo(() => buildCeoUniversalNavigator({ entities, identityReady, locale }), [entities, identityReady, locale]);
  const results = useMemo(() => searchCeoUniversalNavigator(catalog, { query, scope }), [catalog, query, scope]);
  useEffect(() => { setActiveIndex(0); }, [query, scope]);
  useEffect(() => {
    const active = results[activeIndex];
    if (active) resultRefs.current.get(active.id)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, results]);

  const openItem = useCallback(async (item) => {
    if (!item) return false;
    setLaunchError('');
    if (item.action === 'navigate') { router.push(item.href); return true; }
    if (!item.available || openingId) return false;
    setOpeningId(item.id);
    const response = await fetch('/api/ceo/v1/sso/authorize', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId: item.entityId, redirectPath: item.redirectPath }),
    }).catch(() => null);
    const body = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok || !body.destination) {
      setLaunchError(body.error || c.launchError); setOpeningId(''); return false;
    }
    window.location.assign(body.destination);
    return true;
  }, [c.launchError, openingId, router]);

  const onSearchKeyDown = (event) => {
    if (!results.length) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((value) => (value + 1) % results.length); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((value) => (value - 1 + results.length) % results.length); }
    if (event.key === 'Enter') { event.preventDefault(); openItem(results[activeIndex]); }
    if (event.key === 'Escape') { event.preventDefault(); setQuery(''); setScope('all'); }
  };

  if (status === 'loading') return <div className={styles.loading}>{c.loading}</div>;
  if (!rolesOf(session?.user).includes('DIRECTOR')) return <Forbidden />;
  const scopes = [{ id: 'all', label: c.all }, { id: 'portal', label: c.portal }, { id: 'entity', label: c.companies }, ...catalog.entities.map((entity) => ({ id: entity.id, label: entity.displayName }))];

  return <main className={styles.page} data-no-i18n>
    <header className={styles.hero}>
      <div><p>{c.eyebrow}</p><h1>{c.title}</h1><span>{c.intro}</span></div>
      <Link className="btn btn-outline" href="/ceo-briefing"><Icon name="note" size={16} />CEO Briefing</Link>
    </header>

    <section className={styles.searchPanel} role="search" aria-labelledby="ceo-navigator-search-label">
      <label id="ceo-navigator-search-label" htmlFor="ceo-navigator-search">{c.searchLabel}</label>
      <div className={styles.searchBox}>
        <Icon name="search" size={22} />
        <input ref={searchRef} id="ceo-navigator-search" type="search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onSearchKeyDown} placeholder={c.searchPlaceholder} autoComplete="off" role="combobox" aria-autocomplete="list"
          aria-expanded={results.length > 0} aria-controls="ceo-navigator-results" aria-activedescendant={results[activeIndex] ? `navigator-${results[activeIndex].id.replaceAll(':', '-')}` : undefined} />
        <kbd>Ctrl K</kbd>
      </div>
      <small>{c.hint}</small>
      <div className={styles.scopes} aria-label={c.searchLabel}>
        {scopes.map((item) => <button type="button" key={item.id} aria-pressed={scope === item.id} className={scope === item.id ? styles.activeScope : ''} onClick={() => setScope(item.id)}>{item.label}</button>)}
      </div>
    </section>

    <section className={styles.policy}>
      <span><Icon name="shield" size={21} /></span><div><strong>{c.identityTitle}</strong><p>{c.identityBody}</p></div>
      {!identityReady && <Link href="/ceo-registry">{c.activate}<Icon name="link" size={14} /></Link>}
    </section>

    <section className={styles.metrics} aria-label={c.title}>
      <article><small>{c.portalMetric}</small><strong>{catalog.metrics.portalWorkspaces}</strong></article>
      <article><small>{c.entityMetric}</small><strong>{catalog.metrics.registeredEntities}</strong></article>
      <article><small>{c.workflowMetric}</small><strong>{catalog.metrics.entityWorkflows}</strong></article>
      <article><small>{c.availableMetric}</small><strong>{catalog.metrics.availableEntityWorkflows}</strong></article>
    </section>

    {sourceError && <div className={styles.notice} role="status"><Icon name="alert" size={18} /><span>{sourceError}</span><button type="button" onClick={load}>{c.retry}</button></div>}
    {launchError && <div className={styles.error} role="alert"><Icon name="alert" size={18} /><span>{launchError}</span></div>}
    {loading ? <div className={styles.loading} role="status">{c.loading}</div> : <section className={styles.results} aria-live="polite">
      <div className={styles.resultsHead}><div><p>{scope === 'portal' ? c.portal : scope === 'entity' ? c.companies : c.all}</p><h2>{query ? `“${query}”` : c.searchLabel}</h2></div><b>{results.length}</b></div>
      <div id="ceo-navigator-results" className={styles.resultGrid} role="listbox" aria-label={c.searchLabel}>
        {results.map((item, index) => {
          const disabledText = item.disabledReason === 'entity_disabled' ? c.entityDisabled : item.disabledReason === 'step_up_required' ? c.stepUpRequired : '';
          const resultId = `navigator-${item.id.replaceAll(':', '-')}`;
          return <article key={item.id} id={resultId} role="option" aria-selected={index === activeIndex} aria-disabled={!item.available}
            ref={(node) => { if (node) resultRefs.current.set(item.id, node); else resultRefs.current.delete(item.id); }}
            className={`${styles.resultCard} ${index === activeIndex ? styles.activeResult : ''} ${!item.available ? styles.unavailable : ''}`}>
            <span className={styles.icon}><Icon name={item.icon} size={20} /></span>
            <div className={styles.resultBody}>
              <div className={styles.resultMeta}>
                <small>{item.kind === 'portal' ? c.portalBadge : item.entityName}</small>
                {item.kind === 'entity' && <em className={styles[item.entityStatus]}>{c[item.entityStatus] || item.entityStatus}</em>}
              </div>
              <h3>{item.label}</h3><p>{item.description}</p>{disabledText && <strong className={styles.locked}><Icon name="shield" size={13} />{disabledText}</strong>}
            </div>
            {item.action === 'navigate'
              ? <Link href={item.href} onFocus={() => setActiveIndex(index)}>{c.open}<Icon name="link" size={14} /></Link>
              : <button type="button" disabled={!item.available || Boolean(openingId)} onFocus={() => setActiveIndex(index)} onClick={() => openItem(item)}>
                {openingId === item.id ? c.opening : c.open}<Icon name="link" size={14} />
              </button>}
          </article>;
        })}
      </div>
      {!results.length && <div className={styles.empty}><Icon name="search" size={22} /><p>{c.empty}</p></div>}
    </section>}
  </main>;
}
