'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SessionProvider, signOut } from 'next-auth/react';
import { ToastProvider } from '@/components/ui';
import { LanguageSwitch } from '@/components/LanguageProvider';
import CollaborationBridge, { WorkspaceSurfaceSwitch } from '@/components/collaboration/CollaborationBridge';
import { GlobalSearch, NotificationsModal } from '@/components/Shell';
import { areaBySlug, mobileDestinations, REALM_V2_AREAS } from '@/lib/realm-v2-contracts';
import Icon from './Icon';
import { SourcePill } from './Primitives';
import styles from './realm-v2.module.css';

const PAGE_COPY = {
  home: {
    eyebrow: 'Không gian điều hành cá nhân',
    title: 'Realm Home',
    description: 'Một nơi để thấy việc cần chú ý, quyết định đang chờ và bước tiếp theo — đồng bộ trực tiếp từ ERP.',
  },
  'my-work': {
    eyebrow: 'Task ERP · Góc nhìn Realm',
    title: 'Việc của tôi',
    description: 'Cùng một Task, quyền và business rule của ERP; chỉ thay đổi cách trình bày để tập trung hơn.',
  },
  'work-management': {
    eyebrow: 'Guild flow · Task ERP',
    title: 'Quản lý công việc',
    description: 'Điều phối luồng việc, WIP, blocker và workload trên cùng Task ERP — không chấm điểm hay xếp hạng nhân sự.',
  },
  'action-center': {
    eyebrow: 'Ngoại lệ · Quyết định · Can thiệp',
    title: 'Trung tâm hành động',
    description: 'Tập trung quyết định và ngoại lệ được phép xem; unregistered intent luôn fail-closed về workflow ERP.',
  },
  'command-center': {
    eyebrow: 'Intent · Proposal · Governed execution',
    title: 'Command Center',
    description: 'Biến ý định thành proposal có cấu trúc; entity đích tự kiểm tra quyền, business rule và canonical receipt.',
  },
  approvals: {
    eyebrow: 'Maker · Checker · Policy · Evidence',
    title: 'Phê duyệt',
    description: 'Review đúng bằng chứng và chuỗi phê duyệt; quyết định chỉ diễn ra tại workflow có contract RepositoryRealms hợp lệ.',
  },
  inbox: {
    eyebrow: 'Conversation · Notification · Authorized context',
    title: 'Hộp thư hợp nhất',
    description: 'Một điểm đọc và phản hồi trên cùng Conversation và Notification của ERP — không sao chép hội thoại sang store Realm.',
  },
  collaboration: {
    eyebrow: 'Presence · Consent · Coordination',
    title: 'Điều phối cộng tác',
    description: 'Tìm người đang sẵn sàng và mở đúng hội thoại ERP; presence chỉ là context tự nguyện, không phải giám sát.',
  },
  projects: {
    eyebrow: 'Outcome · Delivery health · Canonical work',
    title: 'Project Realm',
    description: 'Một cockpit điều hành Project trên cùng Task, TimeLog, dependency và quyền ERP — không tạo project hay chỉ số song song.',
  },
  chronicle: {
    eyebrow: 'Actor · Action · Record · Evidence',
    title: 'Chronicle',
    description: 'Dòng thay đổi tổ chức từ AuditLog ERP đã cấp quyền; chỉ hiển thị bằng chứng mà nguồn canonical thực sự cung cấp.',
  },
  'world-map': {
    eyebrow: 'Federation · Presence · Source freshness',
    title: 'Bản đồ bốn công ty',
    description: 'Một góc nhìn không gian trên federation thật; mọi trạng thái đều có bản bảng tương đương và không biến presence thành điểm năng suất.',
  },
  'ceo-terminal': {
    eyebrow: 'Portfolio truth · Executive decisions · Provenance',
    title: 'CEO Terminal',
    description: 'Tổng hợp điều hành bốn công ty với tiền tệ, nguồn, as-of và giới hạn dữ liệu được công khai rõ ràng.',
  },
  'employee-profile': {
    eyebrow: 'Identity · Work context · Explicit privacy',
    title: 'Hồ sơ nhân sự',
    description: 'Hồ sơ tự-scope từ ERP để phối hợp công việc; không hiển thị điểm năng suất, xếp hạng hoặc dữ liệu theo dõi ẩn.',
  },
  recognition: {
    eyebrow: 'Contribution · Policy · Receipt',
    title: 'Recognition & Gold Ledger',
    description: 'Sổ ghi nhận append-only với nguồn, policy và receipt; Gold không phải lương, cấp bậc hay tiền tệ đầu cơ.',
  },
  notifications: {
    eyebrow: 'Notification · Authorized route · User scope',
    title: 'Thông báo',
    description: 'Đọc và xử lý cùng Notification record của ERP; không tạo thêm inbox, priority hoặc trạng thái song song.',
  },
  search: {
    eyebrow: 'Authorized records · Canonical destinations',
    title: 'Tìm kiếm toàn hệ thống',
    description: 'Tìm trên các API dữ liệu hiện có và mở đúng workflow ERP; kết quả luôn tuân theo quyền của phiên đăng nhập.',
  },
  settings: {
    eyebrow: 'Preferences · Accessibility · Governance boundary',
    title: 'Cài đặt Realm',
    description: 'Tùy chỉnh trải nghiệm mà không sao chép policy tổ chức, bảo mật hoặc business configuration của ERP.',
  },
  mobile: {
    eyebrow: 'Priority first · Five destinations · Same records',
    title: 'Không gian làm việc di động',
    description: 'Một composition ưu tiên hành động trên màn hình nhỏ; không phải bản desktop bị thu nhỏ hoặc một ứng dụng dữ liệu riêng.',
  },
};

function groups() {
  const result = new Map();
  for (const area of REALM_V2_AREAS) {
    if (!result.has(area.group)) result.set(area.group, []);
    result.get(area.group).push(area);
  }
  return [...result.entries()];
}

function ProductShell({ user, company, slug, pilot, children }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationRevision, setNotificationRevision] = useState(0);
  const [unread, setUnread] = useState(0);
  const headingRef = useRef(null);
  const navigationGroups = useMemo(groups, []);
  const page = PAGE_COPY[slug] || {
    eyebrow: areaBySlug(slug).group,
    title: areaBySlug(slug).labelVi,
    description: 'Góc nhìn Realm sử dụng dữ liệu và workflow chuẩn của ERP.',
  };

  useEffect(() => {
    setCollapsed(window.localStorage.getItem('realm-v2-rail-collapsed') === 'true');
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => headingRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    let alive = true;
    const load = () => fetch('/api/notifications', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => { if (alive && payload) setUnread(payload.unread || 0); })
      .catch(() => null);
    load();
    const timer = window.setInterval(load, 30_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [notificationRevision]);

  const toggleRail = () => setCollapsed((current) => {
    const next = !current;
    window.localStorage.setItem('realm-v2-rail-collapsed', String(next));
    return next;
  });

  return (
    <div className={styles.theme} data-realm-product="true">
      <a className={styles.skipLink} href="#realm-v2-main">Bỏ qua điều hướng</a>
      <CollaborationBridge />
      <div className={styles.shell} data-collapsed={collapsed}>
        <aside className={styles.rail} aria-label="Điều hướng chính Realm">
          <Link className={styles.brand} href="/realm-v2/home" aria-label="Trang chủ Realm">
            <span className={styles.brandMark}>R</span>
            <span className={styles.brandText}>RepositoryRealms<small>{company}</small></span>
          </Link>
          <nav className={styles.nav}>
            {navigationGroups.map(([group, areas]) => (
              <div className={styles.navGroup} key={group}>
                <span className={styles.navLabel}>{group}</span>
                {areas.map((item) => (
                  <Link
                    key={item.slug}
                    href={`/realm-v2/${item.slug}`}
                    className={styles.navItem}
                    data-active={slug === item.slug || undefined}
                    aria-current={slug === item.slug ? 'page' : undefined}
                    title={collapsed ? item.labelVi : undefined}
                  >
                    <Icon name={item.icon}/><span>{item.labelVi}</span>
                  </Link>
                ))}
              </div>
            ))}
          </nav>
          <div className={styles.railFooter}>
            <button type="button" className={styles.railToggle} onClick={toggleRail} aria-label={collapsed ? 'Mở rộng điều hướng' : 'Thu gọn điều hướng'}>
              <Icon name="panel"/><span>{collapsed ? 'Mở rộng' : 'Thu gọn'}</span>
            </button>
          </div>
        </aside>

        <header className={styles.topbar}>
          <button type="button" className={styles.mobileMenu} aria-label="Mở tất cả điểm đến" onClick={() => setDrawerOpen(true)}><Icon name="menu"/></button>
          <Link className={styles.workspaceButton} href="/realm-v2/home">
            <span className={styles.brandMark} style={{ width: 28, height: 28, flexBasis: 28, borderRadius: 8 }}>{(company || 'R')[0]}</span>
            <span>{company} · Realm</span>
          </Link>
          <button type="button" className={styles.searchButton} onClick={() => setSearchOpen(true)} aria-label="Tìm kiếm dữ liệu ERP">
            <Icon name="search"/><span>Tìm bản ghi hoặc tác vụ ERP…</span><kbd>Ctrl K</kbd>
          </button>
          <div className={styles.topActions}>
            <span className={styles.realmErpSwitch}><WorkspaceSurfaceSwitch realm pilot={pilot}/></span>
            <span className={styles.realmLanguage}><LanguageSwitch compact /></span>
            <button type="button" className={styles.iconButton} aria-label={`Thông báo${unread ? `, ${unread} chưa đọc` : ''}`} onClick={() => setNotificationsOpen(true)}>
              <Icon name="bell"/>{unread > 0 && <span className={styles.notificationDot}/>} 
            </button>
            <button type="button" className={styles.profileButton} aria-label="Mở hồ sơ nhân sự" onClick={() => window.location.assign('/realm-v2/employee-profile')}>
              <span className={styles.avatar}>{String(user?.name || 'U').split(/\s+/).map((part) => part[0]).slice(-2).join('').toUpperCase()}</span>
              <span>{user?.name}</span>
            </button>
          </div>
        </header>

        <main className={styles.main} id="realm-v2-main">
          <div className={styles.content}>
            <header className={styles.pageHeader}>
              <div className={styles.pageHeaderCopy}>
                <div className={styles.breadcrumbs}><span>Realm</span><Icon name="chevron" size={12}/><span>{areaBySlug(slug).labelVi}</span></div>
                <span className={styles.eyebrow}>{page.eyebrow}</span>
                <h1 ref={headingRef} tabIndex={-1}>{page.title}</h1>
                <p className={styles.subtitle}>{page.description}</p>
              </div>
              <div className={styles.pageActions}><SourcePill source="RepositoryRealms" freshness="Dữ liệu thật"/></div>
            </header>
            {children}
          </div>
        </main>

        <nav className={styles.mobileNav} aria-label="Điều hướng chính trên di động">
          {mobileDestinations().map((item) => (
            <Link className={styles.mobileNavItem} data-active={slug === item.slug || undefined} aria-current={slug === item.slug ? 'page' : undefined} href={`/realm-v2/${item.slug}`} key={item.slug}>
              <Icon name={item.icon} size={19}/><span>{{ home: 'Trang chủ', 'my-work': 'Việc tôi', 'action-center': 'Hành động', inbox: 'Hộp thư', mobile: 'Thêm' }[item.slug]}</span>
            </Link>
          ))}
        </nav>
      </div>

      {drawerOpen && (
        <div className={styles.overlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawerOpen(false); }}>
          <section className={styles.drawer} role="dialog" aria-modal="true" aria-label="Tất cả điểm đến Realm">
            <header className={styles.drawerHeader}><strong>Tất cả điểm đến</strong><button type="button" className={styles.iconButton} onClick={() => setDrawerOpen(false)} aria-label="Đóng"><Icon name="close"/></button></header>
            <nav className={`${styles.drawerBody} ${styles.list}`}>
              {REALM_V2_AREAS.map((item) => <Link href={`/realm-v2/${item.slug}`} key={item.slug} className={styles.listItem} onClick={() => setDrawerOpen(false)}><span className={styles.listIcon}><Icon name={item.icon}/></span><span className={styles.listCopy}><strong>{item.labelVi}</strong><span>{item.group}</span></span><Icon name="chevron" size={14}/></Link>)}
              <button type="button" className={styles.listItem} onClick={() => signOut({ callbackUrl: '/login' })} style={{ width: '100%', borderInline: 0, background: 'transparent', color: 'inherit', textAlign: 'left' }}><span className={styles.listIcon}><Icon name="lock"/></span><span className={styles.listCopy}><strong>Đăng xuất</strong><span>Kết thúc phiên hiện tại</span></span></button>
            </nav>
          </section>
        </div>
      )}
      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)}/>} 
      {notificationsOpen && <NotificationsModal dataRevision={notificationRevision} onClose={() => setNotificationsOpen(false)} onChanged={() => setNotificationRevision((value) => value + 1)}/>} 
    </div>
  );
}

export default function RealmV2ApplicationShell(props) {
  return <SessionProvider><ToastProvider><ProductShell {...props}/></ToastProvider></SessionProvider>;
}
