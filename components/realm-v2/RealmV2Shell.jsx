'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { areaBySlug, mobileDestinations, REALM_V2_AREAS } from '@/lib/realm-v2-contracts';
import Icon from './Icon';
import { Avatar, Badge, Button, SourcePill, Status } from './Primitives';
import { ApprovalReview, CommandPalette, ContextDrawer, ToastDemo } from './Overlays';
import { ProductScreen } from './Templates';
import { approvals, notificationRows } from './fixtures';
import styles from './realm-v2.module.css';

const subtitles = {
  home: 'A calm operating overview of owned work, decisions and verified activity.',
  'my-work': 'Your accountable work, schedule and capacity in one focused workspace.',
  'work-management': 'Plan and inspect shared delivery without relying on drag or hidden status.',
  'action-center': 'A risk-aware queue for decisions, exceptions and time-sensitive actions.',
  'command-center': 'Turn intent into an authorized proposal, execution and canonical receipt.',
  inbox: 'Messages, comments and operational updates from connected work surfaces.',
  projects: 'Scope, delivery health, accountability and decisions around each project.',
  chronicle: 'An append-only, source-linked history of approvals, commands and receipts.',
  collaboration: 'User-set presence and contextual rooms for coordinated work.',
  'world-map': 'A spatial group view with an equivalent accessible entity registry.',
  'ceo-terminal': 'Executive decisions grounded in clearly separated financial and operating metrics.',
  'employee-profile': 'Professional identity, capabilities and accountable work without employee scoring.',
  recognition: 'Policy-based recognition accounting with receipts, reversals and audit history.',
  approvals: 'Maker-checker decisions with evidence, rationale and explicit execution boundaries.',
  notifications: 'Prioritized updates with source, freshness and accessible destinations.',
  search: 'Permission-aware discovery and structured authorized commands.',
  settings: 'Personal display preferences, workspace defaults and session controls.',
  mobile: 'The same business invariants in a focused, touch-safe mobile priority view.',
  'design-system': 'Reusable foundations, states, work objects and command-safety patterns.',
};

function groupedAreas() {
  const groups = new Map();
  for (const area of REALM_V2_AREAS) {
    if (!groups.has(area.group)) groups.set(area.group, []);
    groups.get(area.group).push(area);
  }
  return [...groups.entries()];
}

export default function RealmV2Shell({ slug = 'home', children }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [palette, setPalette] = useState(false);
  const [drawer, setDrawer] = useState(null);
  const [review, setReview] = useState(null);
  const [toast, setToast] = useState(false);
  const headingRef = useRef(null);
  const area = slug === 'design-system' ? { slug, label: 'Design System QA', icon: 'settings' } : areaBySlug(slug);
  const groups = useMemo(groupedAreas, []);

  useEffect(() => {
    const saved = window.localStorage.getItem('realm-v2-rail-collapsed');
    if (saved != null) setCollapsed(saved === 'true');
  }, []);
  const toggleRail = () => setCollapsed(value => {
    const next = !value;
    window.localStorage.setItem('realm-v2-rail-collapsed', String(next));
    return next;
  });
  useEffect(() => {
    const onKey = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPalette(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    const id = requestAnimationFrame(() => headingRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [pathname]);
  useEffect(() => {
    const key = `realm-v2-scroll:${pathname}`;
    const saved = Number(sessionStorage.getItem(key) || 0);
    if (saved > 0) requestAnimationFrame(() => window.scrollTo({ top: saved }));
    return () => sessionStorage.setItem(key, String(window.scrollY));
  }, [pathname]);
  const openReview = useCallback(item => setReview(item), []);
  const openContext = useCallback(item => setDrawer({ type: 'entity', item }), []);

  return (
    <div className={styles.theme}>
      <a className={styles.skipLink} href="#realm-v2-main">Skip to main content</a>
      <div className={styles.shell} data-collapsed={collapsed}>
        <aside className={styles.rail} aria-label="Realm primary navigation">
          <Link className={styles.brand} href="/realm-v2/home" aria-label="Realm operations home"><span className={styles.brandMark}>R</span><span className={styles.brandText}>Realm Operations<small>RepositoryRealms</small></span></Link>
          <nav className={styles.nav}>{groups.map(([group, areas]) => <div className={styles.navGroup} key={group}><span className={styles.navLabel}>{group}</span>{areas.map(item => <Link key={item.slug} href={`/realm-v2/${item.slug}`} className={styles.navItem} data-active={slug === item.slug || undefined} aria-current={slug === item.slug ? 'page' : undefined} title={collapsed ? item.label : undefined}><Icon name={item.icon}/><span>{item.label}</span></Link>)}</div>)}</nav>
          <div className={styles.railFooter}><Link href="/realm-v2/design-system" className={styles.navItem} data-active={slug === 'design-system' || undefined}><Icon name="settings"/><span>Design QA</span></Link><button type="button" className={styles.railToggle} onClick={toggleRail} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}><Icon name="panel"/><span>{collapsed ? 'Expand' : 'Collapse'}</span></button></div>
        </aside>

        <header className={styles.topbar}>
          <button type="button" className={styles.mobileMenu} aria-label="Open navigation" onClick={() => setDrawer({ type: 'navigation' })}><Icon name="menu"/></button>
          <button type="button" className={styles.workspaceButton} onClick={() => setDrawer({ type: 'workspace' })}><span className={styles.brandMark} style={{ width: 28, height: 28, flexBasis: 28, borderRadius: 8 }}>E</span><span>Egoric Group · Operations</span><Icon name="chevron" size={14}/></button>
          <button type="button" className={styles.searchButton} onClick={() => setPalette(true)} aria-label="Open search and command palette"><Icon name="search"/><span>Search records or propose a command…</span><kbd>Ctrl K</kbd></button>
          <div className={styles.topActions}>
            <button type="button" className={styles.iconButton} aria-label="Open notifications" onClick={() => setDrawer({ type: 'notifications' })}><Icon name="bell"/><span className={styles.notificationDot}/></button>
            <button type="button" className={styles.profileButton} aria-label="Open your profile" onClick={() => setDrawer({ type: 'profile' })}><Avatar/><span>Vũ Sơn</span></button>
          </div>
        </header>

        <main className={styles.main} id="realm-v2-main">
          <div className={styles.content}>
            <header className={styles.pageHeader}>
              <div className={styles.pageHeaderCopy}>
                <div className={styles.breadcrumbs}><span>Realm</span><Icon name="chevron" size={12}/><span>{area.group || 'System'}</span><Icon name="chevron" size={12}/><span>{area.label}</span></div>
                <span className={styles.eyebrow}>{area.group || 'System'} workspace</span>
                <h1 ref={headingRef} tabIndex={-1}>{area.label}</h1>
                <p className={styles.subtitle}>{subtitles[slug]}</p>
              </div>
              <div className={styles.pageActions}><SourcePill source="Preview fixtures" freshness="Non-canonical"/><Button variant="secondary" icon="panel" onClick={() => setDrawer({ type: 'context' })}>Context</Button><Button icon="plus" onClick={() => { setToast(true); setPalette(true); }}>Propose action</Button></div>
            </header>
            {children || <ProductScreen slug={area.slug} onReview={openReview} onOpenContext={openContext}/>} 
          </div>
        </main>

        <nav className={styles.mobileNav} aria-label="Mobile primary navigation">{mobileDestinations().map(item => <Link className={styles.mobileNavItem} data-active={slug === item.slug || undefined} aria-current={slug === item.slug ? 'page' : undefined} href={`/realm-v2/${item.slug}`} key={item.slug}><Icon name={item.icon} size={19}/><span>{item.label}</span></Link>)}</nav>
      </div>

      {palette && <CommandPalette onClose={() => setPalette(false)}/>} 
      {review && <ApprovalReview approval={review} onClose={() => setReview(null)}/>} 
      {drawer && <ContextDrawer title={drawer.type === 'notifications' ? 'Notifications' : drawer.type === 'navigation' ? 'All destinations' : drawer.type === 'workspace' ? 'Switch workspace' : drawer.type === 'profile' ? 'Your profile' : drawer.type === 'entity' ? drawer.item.name : `${area.label} context`} onClose={() => setDrawer(null)}>
        {drawer.type === 'notifications' ? <div className={styles.list}>{notificationRows.map(item => <Link href="/realm-v2/notifications" className={styles.listItem} key={item.id}><span className={styles.listIcon}><Icon name="bell"/></span><span className={styles.listCopy}><strong>{item.title}</strong><span>{item.due} · {item.source}</span></span><Badge tone={item.tone}>{item.status}</Badge></Link>)}</div>
          : drawer.type === 'navigation' ? <nav className={styles.list}>{REALM_V2_AREAS.map(item => <Link href={`/realm-v2/${item.slug}`} key={item.slug} className={styles.listItem} onClick={() => setDrawer(null)}><span className={styles.listIcon}><Icon name={item.icon}/></span><span className={styles.listCopy}><strong>{item.label}</strong><span>{item.group}</span></span><Icon name="chevron" size={14}/></Link>)}</nav>
          : drawer.type === 'workspace' ? <div className={styles.list}>{['Egoric Agency','AIM Agency','VNECOM LLC','Egolive'].map((name,index) => <button type="button" className={styles.listItem} style={{ width:'100%',background:'none',borderTop:0,borderInline:0,textAlign:'left',color:'inherit' }} key={name} onClick={() => setDrawer(null)}><span className={styles.listIcon}>{name[0]}</span><span className={styles.listCopy}><strong>{name}</strong><span>{index ? 'Connected entity' : 'Current workspace'}</span></span>{!index && <Status tone="success">Current</Status>}</button>)}</div>
          : drawer.type === 'profile' ? <div className={styles.grid}><div style={{ display:'flex',alignItems:'center',gap:12 }}><Avatar/><div><strong>Vũ Lương Sơn</strong><p style={{ color:'var(--r2-muted)',fontSize:'.7rem' }}>Group CEO · Entity administrator</p></div></div><Status tone="success">Available</Status><Link className={styles.button} data-variant="secondary" href="/realm-v2/employee-profile" onClick={() => setDrawer(null)}>Open professional profile</Link><p style={{ color:'var(--r2-muted)',fontSize:'.68rem' }}>Preview identity only. No production session or personal data is read.</p></div>
          : drawer.type === 'entity' ? <div className={styles.grid}><Status tone={drawer.item.risk ? 'warning' : 'success'}>{drawer.item.risk ? 'Needs review' : 'On plan'}</Status><p style={{ color:'var(--r2-text-2)',fontSize:'.75rem' }}>{drawer.item.meta}</p><SourcePill source="Entity registry" freshness="Preview fixture"/><Button variant="secondary" icon="arrow">Open entity brief</Button></div>
          : <div className={styles.grid}><Status tone="success">Source connected</Status><p style={{ color:'var(--r2-text-2)',fontSize:'.75rem' }}>Filters, sources and selected record details live here without replacing the main workspace.</p><SourcePill source="RepositoryRealms" freshness="Preview fixture"/><Button variant="secondary" icon="link">Inspect source contract</Button></div>}
      </ContextDrawer>}
      {toast && <ToastDemo onDone={() => setToast(false)}/>} 
    </div>
  );
}
