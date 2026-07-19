'use client';
// Khung ứng dụng v2.1: sidebar theo 7 vai trò + badge phê duyệt
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { SessionProvider, signOut } from 'next-auth/react';
import { Icon, Modal, AsyncButton, ToastProvider, useToast, RoleLabelsCtx, ModulesCtx } from './ui';
import { initials } from '@/lib/format';
import { rolesOf, hasAny, ROLE_LABEL } from '@/lib/perm';
import { modOn } from '@/lib/modules';
import { ERP_NAV } from '@/lib/erp-navigation';
import { realmRecordHref } from '@/lib/realm-business-bridge';
import CollaborationBridge, { WorkspaceSurfaceSwitch } from './collaboration/CollaborationBridge';
import { useRealmChangeFeed } from './realm/useRealmChangeFeed';
import { NOTIFICATION_SYNC_EVENT } from '@/lib/notification-inbox';

/* v3.14: TỰ GẮN NHÃN CỘT CHO BẢNG.
   Toàn app có 19 trang bảng, mỗi bảng viết tay riêng. Trên điện thoại, bảng 8 cột buộc phải
   cuộn ngang mới đọc được — mà ERP thì gần như toàn bảng.
   Cách làm: thay vì sửa tay 19 trang (dễ sót, dễ lệch), đọc <thead> rồi gắn data-label vào
   từng <td>. CSS ở globals.css dùng nhãn đó để biến mỗi dòng thành một thẻ khi màn hình hẹp.
   Một chỗ này lo cho cả 19 trang và mọi bảng viết sau này.

   Lưu ý: chỉ theo dõi childList (KHÔNG theo dõi attributes) — nếu theo dõi attributes thì
   chính việc gắn data-label sẽ kích hoạt lại observer thành vòng lặp vô tận. */
function useTableLabels(pathname) {
  useEffect(() => {
    let timer = 0;
    const apply = () => {
      for (const t of document.querySelectorAll('.table-wrap table')) {
        const heads = [...t.querySelectorAll('thead th')].map(th => th.textContent.trim());
        if (!heads.length) continue;
        for (const tr of t.querySelectorAll('tbody tr')) {
          const tds = tr.children;
          // dòng gộp ô (trạng thái rỗng "Chưa có dữ liệu") không khớp số cột → bỏ qua
          if (tds.length !== heads.length) continue;
          for (let i = 0; i < tds.length; i++) {
            if (heads[i] && tds[i].dataset.label !== heads[i]) tds[i].dataset.label = heads[i];
          }
        }
      }
    };
    // Gộp nhiều biến động DOM liên tiếp thành 1 lần chạy.
    // KHÔNG dùng requestAnimationFrame: trình duyệt treo rAF khi tab đang ẩn, nên bảng mở ở
    // tab nền sẽ không bao giờ được gắn nhãn (đã dính đúng lỗi này lúc kiểm thử).
    const schedule = () => { clearTimeout(timer); timer = setTimeout(apply, 0); };
    schedule();
    const root = document.getElementById('view');
    const mo = new MutationObserver(schedule);
    if (root) mo.observe(root, { childList: true, subtree: true });
    return () => { mo.disconnect(); clearTimeout(timer); };
  }, [pathname]);
}

// v3.4: tìm kiếm toàn cục Ctrl+K — gom mọi resource user được đọc
const SEARCH_GROUPS = [
  { res: 'clients', label: 'Khách hàng', icon: 'clients', text: r => [r.name, r.contact, r.industry, r.phone], title: r => r.name, sub: r => r.industry || '', href: r => `/clients/${r.id}` },
  { res: 'leads', label: 'Khách tiềm năng', icon: 'leads', text: r => [r.name, r.company, r.phone, r.email], title: r => r.company || r.name, sub: r => r.name, href: r => realmRecordHref('lead', r.id) },
  { res: 'projects', label: 'Dự án', icon: 'projects', text: r => [r.name, r.service], title: r => r.name, sub: r => r.service || '', href: r => realmRecordHref('project', r.id) },
  { res: 'tasks', label: 'Công việc', icon: 'tasks', text: r => [r.title, r.note], title: r => r.title, sub: r => r.status, href: r => realmRecordHref('task', r.id) },
  { res: 'invoices', label: 'Hóa đơn', icon: 'invoices', text: r => [r.code], title: r => r.code, sub: r => r.date, href: () => '/invoices' },
  { res: 'tickets', label: 'Ticket', icon: 'check', text: r => [r.code, r.title], title: r => `${r.code}: ${r.title}`, sub: r => r.status, href: () => '/tickets' },
  { res: 'vendors', label: 'Nhà cung cấp', icon: 'wallet', text: r => [r.name, r.type], title: r => r.name, sub: r => r.type || '', href: () => '/vendors' },
  { res: 'contracts', label: 'Hợp đồng', icon: 'shield', text: r => [r.code, r.partner], title: r => `${r.code} — ${r.partner}`, sub: r => r.endDate || '', href: () => '/contracts' },
  { res: 'users', label: 'Nhân sự', icon: 'staff', text: r => [r.name, r.email, r.title], title: r => r.name, sub: r => r.title || '', href: r => realmRecordHref('staff', r.id) },
];

function GlobalSearch({ onClose }) {
  const [q, setQ] = useState('');
  const [data, setData] = useState({});
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    Promise.all(SEARCH_GROUPS.map(async g => {
      const res = await fetch('/api/data/' + g.res).catch(() => null);
      return [g.res, res?.ok ? await res.json() : []];
    })).then(pairs => alive && setData(Object.fromEntries(pairs)));
    return () => { alive = false; };
  }, []);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];
    return SEARCH_GROUPS.map(g => ({
      ...g,
      items: (data[g.res] || []).filter(r => g.text(r).filter(Boolean).join(' ').toLowerCase().includes(needle)).slice(0, 5),
    })).filter(g => g.items.length);
  }, [q, data]);

  const go = (g, r) => { onClose(); router.push(g.href(r)); };

  return (
    <Modal title="Tìm kiếm toàn hệ thống" onClose={onClose}>
      <input autoFocus placeholder="Gõ tên khách, deal, dự án, việc, hóa đơn, ticket… (≥2 ký tự)" value={q}
        onChange={e => setQ(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && results[0]?.items[0]) go(results[0], results[0].items[0]); }}
        style={{ width: '100%', marginBottom: 10 }} />
      <div style={{ maxHeight: 380, overflowY: 'auto' }}>
        {results.map(g => (
          <div key={g.res}>
            <div className="nav-section" style={{ padding: '8px 0 2px' }}>{g.label}</div>
            {g.items.map(r => (
              <div key={r.id} className="act-item" style={{ cursor: 'pointer', alignItems: 'center' }} onClick={() => go(g, r)}>
                <span style={{ color: 'var(--muted)', flex: 'none', display: 'flex' }}><Icon name={g.icon} size={15} /></span>
                <div style={{ flex: 1 }}>
                  <div className="act-title">{g.title(r)}</div>
                  <div className="act-sub">{g.sub(r)}</div>
                </div>
              </div>
            ))}
          </div>
        ))}
        {q.trim().length >= 2 && !results.length && <p style={{ fontSize: '.83rem', color: 'var(--muted)' }}>Không tìm thấy "{q}".</p>}
        {q.trim().length < 2 && <p style={{ fontSize: '.78rem', color: 'var(--muted)' }}>Mẹo: mở nhanh bằng <b>Ctrl+K</b> ở bất kỳ đâu. Kết quả tôn trọng phân quyền của bạn.</p>}
      </div>
    </Modal>
  );
}

// v3.5: chuông thông báo — gom gán việc, phê duyệt, kết quả duyệt một chỗ
function NotificationsModal({ onClose, onChanged, dataRevision = 0 }) {
  const [data, setData] = useState(null);
  const router = useRouter();
  const toast = useToast();
  const load = useCallback(() => fetch('/api/notifications', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(setData), []);
  useEffect(() => { load(); }, [dataRevision, load]);
  useEffect(() => {
    window.addEventListener(NOTIFICATION_SYNC_EVENT, load);
    return () => window.removeEventListener(NOTIFICATION_SYNC_EVENT, load);
  }, [load]);
  const open = async n => {
    const response = await fetch('/api/notifications', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: n.id }) });
    if (!response.ok) return toast('Không thể cập nhật thông báo', 'error');
    window.dispatchEvent(new CustomEvent(NOTIFICATION_SYNC_EVENT));
    onChanged?.(); onClose();
    if (n.route) router.push(n.route);
  };
  const readAll = async () => {
    const res = await fetch('/api/notifications', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) });
    if (!res.ok) return toast('Không thể cập nhật thông báo', 'error');
    window.dispatchEvent(new CustomEvent(NOTIFICATION_SYNC_EVENT));
    onChanged?.(); await load(); toast('Đã đánh dấu tất cả thông báo là đã đọc');
  };
  const ago = t => {
    const m = Math.round((Date.now() - new Date(t)) / 60000);
    return m < 60 ? m + ' phút' : m < 1440 ? Math.round(m / 60) + ' giờ' : Math.round(m / 1440) + ' ngày';
  };
  return (
    <Modal title="Raven Inbox · Thông báo ERP" onClose={onClose}
      footer={<><AsyncButton className="btn btn-outline" onClick={readAll}>Đọc tất cả</AsyncButton>
        <button className="btn btn-primary" onClick={onClose}>Đóng</button></>}>
      <div className="notification-inbox-list" aria-live="polite">
        {(data?.rows || []).map(n => (
          <button type="button" key={n.id} className="notification-inbox-item" data-unread={!n.readAt || undefined} onClick={() => open(n)}>
            <span className="notification-inbox-icon"><Icon name={n.icon || 'bell'} size={17} /></span>
            <span className="notification-inbox-copy">
              <span><b>{n.kindLabel || 'Realm Dispatch'}</b><small>{ago(n.createdAt)} trước</small></span>
              <strong>{n.text}</strong>
              <em>Mở {n.targetLabel || 'ERP · CRM'}</em>
            </span>
          </button>
        ))}
        {data && !data.rows.length && <p style={{ fontSize: '.85rem', color: 'var(--muted)' }}>Chưa có thông báo nào — khi bạn được gán việc, được giao ticket hoặc có yêu cầu chờ duyệt, chúng sẽ hiện ở đây.</p>}
      </div>
    </Modal>
  );
}

// v3.2: modal bật/tắt đăng nhập 2 lớp TOTP cho tài khoản của mình
function TwoFAModal({ onClose }) {
  const [info, setInfo] = useState(null); // {enabled, secret, url}
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const toast = useToast();
  useEffect(() => { fetch('/api/users/2fa').then(r => r.json()).then(setInfo); }, []);

  const call = async method => {
    setErr('');
    const res = await fetch('/api/users/2fa', {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(method === 'POST' ? { secret: info.secret, code } : { code }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(j.error || 'Có lỗi xảy ra'); return; }
    toast(method === 'POST' ? 'Đã bật đăng nhập 2 lớp' : 'Đã tắt đăng nhập 2 lớp');
    onClose();
  };

  return (
    <Modal title="Bảo mật — đăng nhập 2 lớp (2FA)" onClose={onClose}
      footer={<>
        <button className="btn btn-outline" onClick={onClose}>Đóng</button>
        {info && (info.enabled
          ? <AsyncButton className="btn btn-danger" onClick={() => call('DELETE')}>Tắt 2FA</AsyncButton>
          : <AsyncButton className="btn btn-primary" onClick={() => call('POST')}>Bật 2FA</AsyncButton>)}
      </>}>
      {!info ? <p style={{ fontSize: '.85rem' }}>Đang tải…</p> : info.enabled ? (
        <div style={{ fontSize: '.85rem', display: 'grid', gap: 10 }}>
          <p>2FA <b style={{ color: 'var(--accent, #059669)' }}>đang bật</b> cho tài khoản của bạn. Nhập mã hiện tại từ ứng dụng xác thực để tắt.</p>
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="Mã 6 số" inputMode="numeric" maxLength={6} />
          {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}
        </div>
      ) : (
        <div style={{ fontSize: '.85rem', display: 'grid', gap: 10 }}>
          <p>1. Mở <b>Google Authenticator</b> (hoặc Authy, 1Password…) → thêm tài khoản → <b>nhập khóa thủ công</b>:</p>
          <code style={{ padding: '8px 10px', background: 'var(--bg, #f1f5f9)', borderRadius: 8, letterSpacing: 1, wordBreak: 'break-all', fontWeight: 700 }}>
            {info.secret.match(/.{1,4}/g).join(' ')}
          </code>
          <p>2. Nhập mã 6 số ứng dụng hiển thị để xác nhận:</p>
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="Mã 6 số" inputMode="numeric" maxLength={6} autoFocus />
          {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}
          <p style={{ color: 'var(--muted)' }}>Sau khi bật, mỗi lần đăng nhập cần thêm mã từ điện thoại. Giữ khóa cẩn thận — mất điện thoại thì nhờ Giám đốc reset trong Hồ sơ nhân sự.</p>
        </div>
      )}
    </Modal>
  );
}

const NAV = ERP_NAV;

export default function Shell({ user, company, children }) {
  const [open, setOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [unreadChat, setUnreadChat] = useState(0);
  const [show2fa, setShow2fa] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [unreadNotif, setUnreadNotif] = useState(0);
  const [notificationRevision, setNotificationRevision] = useState(0);
  const [roleLabels, setRoleLabels] = useState(ROLE_LABEL);
  const [modules, setModules] = useState(null); // v3.17: null = chưa tải/công ty cũ → bật hết
  const [todayLabel, setTodayLabel] = useState('');
  useEffect(() => {
    // Vercel renders in UTC while the browser uses the employee's local timezone.
    // Resolve the label client-side so midnight never causes a hydration mismatch.
    setTodayLabel(new Date().toLocaleDateString('vi-VN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }));
  }, []);
  useEffect(() => { // v3.6: chức danh tùy biến theo công ty · v3.17: phân hệ bật/tắt
    fetch('/api/settings').then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        const overrides = Object.fromEntries(Object.entries(d.roleLabels || {}).filter(([, v]) => v && String(v).trim()));
        setRoleLabels({ ...ROLE_LABEL, ...overrides });
        if (Array.isArray(d.modules)) setModules(d.modules);
      }).catch(() => {});
  }, []);
  const pathname = usePathname();
  const router = useRouter();
  const isRealmRoute = pathname === '/realm' || pathname.startsWith('/realm/');
  useTableLabels(pathname); // v3.14: bảng đọc được trên điện thoại
  const isFL = user?.userType === 'freelancer';
  // v3.11: freelancer chỉ được ở /freelancer — chuyển hướng nếu lạc sang trang nhân viên
  useEffect(() => { if (isFL && pathname !== '/freelancer') router.replace('/freelancer'); }, [isFL, pathname, router]);
  // v3.17: vào thẳng URL trang có phân hệ đang TẮT → đưa về Dashboard. Chỉ chạy khi đã tải
  // được modules (tránh redirect nhầm lúc chưa biết công ty bật gì).
  useEffect(() => {
    if (isFL || !Array.isArray(modules)) return;
    const cur = NAV.find(n => n.key && pathname.startsWith('/' + n.key));
    if (cur && cur.mod && !modOn(cur.mod, modules)) router.replace('/dashboard');
  }, [pathname, modules, isFL, router]);
  const NAV_FL = [{ key: 'freelancer', label: 'Công việc của tôi', icon: 'tasks', roles: ['FREELANCER'] }];
  const navList = isFL ? NAV_FL : NAV;
  const current = navList.find(n => n.key && pathname.startsWith('/' + n.key));
  const myRoles = rolesOf(user);
  // v3.17: mục menu hiện khi (đúng vai trò) VÀ (phân hệ của nó đang bật). Mục lõi (không mod)
  // luôn qua modOn. Freelancer đi lối riêng.
  const visible = item => isFL ? true : (hasAny(user, item.roles) && modOn(item.mod, modules));

  const loadShellCounters = useCallback(() => {
    fetch('/api/approvals').then(r => r.ok ? r.json() : null)
      .then(d => d && setPendingCount(d.pendingCount || 0)).catch(() => {});
    fetch('/api/chat').then(r => r.ok ? r.json() : null)
      .then(d => d && setUnreadChat(d.totalUnread || 0)).catch(() => {});
    fetch('/api/notifications').then(r => r.ok ? r.json() : null)
      .then(d => d && setUnreadNotif(d.unread || 0)).catch(() => {});
  }, []);

  const handleShellChanges = useCallback((feed) => {
    const domains = new Set(feed?.domains || []);
    if (!['notifications', 'communications', 'collaboration'].some((domain) => domains.has(domain))) return;
    setNotificationRevision((currentRevision) => currentRevision + 1);
    loadShellCounters();
  }, [loadShellCounters]);

  useRealmChangeFeed({
    enabled: process.env.NEXT_PUBLIC_REALM_ERP_SYNC === '1' && !isFL && !isRealmRoute,
    onChanges: handleShellChanges,
  });

  useEffect(() => {
    loadShellCounters();
    const t = setInterval(loadShellCounters, 15000);
    return () => clearInterval(t);
  }, [pathname, loadShellCounters]);

  useEffect(() => { // PWA: đăng ký service worker
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  useEffect(() => { // v3.4: Ctrl+K mở tìm kiếm toàn cục
    const h = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setShowSearch(true); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  return (
    <SessionProvider>
    <ToastProvider>
    <RoleLabelsCtx.Provider value={roleLabels}>
    <ModulesCtx.Provider value={modules}>
      <CollaborationBridge />
      <div id="app" className={isRealmRoute ? 'realm-immersive' : ''}>
        <aside id="sidebar" className={open ? 'open' : ''}>
          <div className="brand">
            <div className="brand-logo">{(company || 'A')[0].toUpperCase()}</div>
            <div className="brand-text">
              <span className="brand-name">{company || 'Agency ERP'}</span>
              <span className="brand-sub">Royal ERP · CRM · 7 vai trò</span>
            </div>
          </div>
          <nav id="nav">
            {navList.map((item, i) => {
              if (item.section) {
                const next = navList.findIndex((x, j) => j > i && x.section);
                const group = navList.slice(i + 1, next === -1 ? undefined : next);
                return group.some(visible) ? <div key={i} className="nav-section">{item.section}</div> : null;
              }
              if (!visible(item)) return null;
              const active = pathname.startsWith('/' + item.key);
              return (
                <Link key={item.key} href={'/' + item.key} className={`nav-item ${active ? 'active' : ''}`} onClick={() => setOpen(false)}>
                  <Icon name={item.icon} size={18} /><span>{item.label}</span>
                  {item.badge && pendingCount > 0 && <span className="count" style={{ background: 'var(--danger)', color: '#fff' }}>{pendingCount}</span>}
                  {item.chatBadge && unreadChat > 0 && <span className="count" style={{ background: 'var(--danger)', color: '#fff' }}>{unreadChat}</span>}
                </Link>
              );
            })}
          </nav>
          <div className="user-chip">
            <span className="avatar">{initials(user.name)}</span>
            <div>
              <div className="uc-name">{user.name}</div>
              <div className="uc-role">{myRoles.map(r => roleLabels[r] || r).join(' · ')}</div>
            </div>
            <button onClick={() => setShow2fa(true)} title="Bảo mật 2 lớp (2FA)" aria-label="Bảo mật 2 lớp">
              <Icon name="shield" size={16} />
            </button>
            <button onClick={() => signOut({ callbackUrl: '/login' })} title="Đăng xuất" aria-label="Đăng xuất">
              <Icon name="logout" size={16} />
            </button>
          </div>
        </aside>
        {show2fa && <TwoFAModal onClose={() => setShow2fa(false)} />}
        {showSearch && <GlobalSearch onClose={() => setShowSearch(false)} />}
        {showNotif && <NotificationsModal dataRevision={notificationRevision} onClose={() => setShowNotif(false)}
          onChanged={() => { setNotificationRevision((currentRevision) => currentRevision + 1); loadShellCounters(); }} />}
        <div id="backdrop" className={open ? 'show' : ''} onClick={() => setOpen(false)}></div>
        <div id="main">
          <header id="topbar">
            <button id="menu-btn" onClick={() => setOpen(true)} aria-label="Mở menu"><Icon name="menu" /></button>
            <h1 id="page-title">{current?.label || 'Agency ERP'}</h1>
            <div className="topbar-right">
              <WorkspaceSurfaceSwitch />
              <button className="btn btn-outline btn-sm" onClick={() => setShowSearch(true)} title="Tìm kiếm toàn hệ thống (Ctrl+K)">
                <Icon name="search" size={14} /><span> Ctrl+K</span>
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => setShowNotif(true)} title="Thông báo" style={{ position: 'relative' }} aria-label="Thông báo">
                {/* v3.14: 🔔 -> icon SVG. Emoji vẽ khác nhau trên Windows/Mac/Android và
                    không đổi màu theo theme — đây lại là nút điều khiển chính trên thanh trên. */}
                <Icon name="bell" size={15} />
                {unreadNotif > 0 && <span className="count" style={{ position: 'absolute', top: -7, right: -7, background: 'var(--danger)', color: '#fff' }}>{unreadNotif}</span>}
              </button>
              <span id="today-label">{todayLabel}</span>
              <span className={`role-chip role-${myRoles[0]}`}>{myRoles.map(r => roleLabels[r] || r).join(' · ')}</span>
            </div>
          </header>
          <main id="view">{isFL && pathname !== '/freelancer'
            ? <div className="empty" style={{ paddingTop: 80 }}><p>Đang chuyển tới trang của bạn…</p></div>
            : children}</main>
        </div>
      </div>
    </ModulesCtx.Provider>
    </RoleLabelsCtx.Provider>
    </ToastProvider>
    </SessionProvider>
  );
}
