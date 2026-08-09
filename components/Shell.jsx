'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { SessionProvider, signOut } from 'next-auth/react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Icon, Modal, Avatar, AsyncButton, ToastProvider, useToast,
  RoleLabelsCtx, ModulesCtx,
} from './ui';
import { rolesOf, hasAny, ROLE_LABEL } from '@/lib/perm';
import { modOn } from '@/lib/modules';
import { ERP_NAV } from '@/lib/erp-navigation';
import {
  MOBILE_NAV_KEYS, currentWorkspaceLocation, workspaceNavigation,
} from '@/lib/workspace-navigation';
import CollaborationBridge, { WorkspaceSurfaceSwitch } from './collaboration/CollaborationBridge';
import { useRealmChangeFeed } from './realm/useRealmChangeFeed';
import { NOTIFICATION_SYNC_EVENT } from '@/lib/notification-inbox';
import RealmFeedbackLauncher from './realm/RealmFeedbackLauncher';
import RealmPilotOnboarding from './realm/RealmPilotOnboarding';
import { LanguageSwitch, useLanguage } from './LanguageProvider';
import { GLOBAL_SEARCH_GROUPS, searchGroupRows } from '@/lib/global-search-contract';

const NAV = ERP_NAV;

const CEO_TABS = [
  ['Tổng quan', '/ceo-overview'],
  ['Điều hướng', '/ceo-navigator'],
  ['Briefing', '/ceo-briefing'],
  ['Quyết định', '/ceo-decisions'],
  ['Công ty', '/ceo-world'],
  ['Lệnh điều hành', '/ceo-commands'],
  ['Nhân lực', '/ceo-workforce'],
  ['Hộp thư', '/ceo-inbox'],
  ['Danh mục', '/ceo-registry'],
  ['An ninh', '/ceo-security'],
  ['Triển khai', '/ceo-rollout'],
];

function useDebouncedValue(value, delay = 180) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function GlobalSearch({ onClose, commands = [] }) {
  const [query, setQuery] = useState('');
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const debouncedQuery = useDebouncedValue(query);
  const router = useRouter();

  useEffect(() => {
    const needle = debouncedQuery.trim();
    if (needle.length < 2) {
      setData({});
      setLoading(false);
      setError('');
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    Promise.all(GLOBAL_SEARCH_GROUPS.map(async (group) => {
      const response = await fetch(`/api/data/${group.res}`, { signal: controller.signal });
      if (!response.ok) return [group.res, []];
      const rows = await response.json();
      return [group.res, Array.isArray(rows) ? rows : []];
    }))
      .then((pairs) => setData(Object.fromEntries(pairs)))
      .catch((searchError) => {
        if (searchError.name !== 'AbortError') setError('Không thể tải kết quả. Hãy thử lại.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [debouncedQuery]);

  const resultGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const destinations = commands
      .filter((command) => !needle || command.label.toLowerCase().includes(needle))
      .slice(0, needle ? 5 : 7);
    const records = needle.length < 2 ? [] : GLOBAL_SEARCH_GROUPS
      .map((group) => ({ ...group, items: searchGroupRows(group, data[group.res], needle, 5) }))
      .filter((group) => group.items.length);
    return { destinations, records };
  }, [commands, data, query]);

  const flattened = useMemo(() => [
    ...resultGroups.destinations.map((item) => ({ kind: 'command', href: item.href })),
    ...resultGroups.records.flatMap((group) => group.items.map((row) => ({
      kind: 'record', href: group.href(row), group, row,
    }))),
  ], [resultGroups]);

  useEffect(() => setActiveIndex(0), [query, data]);

  const go = (href) => {
    onClose();
    router.push(href);
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(0, flattened.length - 1)));
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    }
    if (event.key === 'Enter' && flattened[activeIndex]) {
      event.preventDefault();
      go(flattened[activeIndex].href);
    }
  };

  let cursor = 0;
  return (
    <Modal title="Tìm kiếm và mở nhanh" onClose={onClose} className="command-dialog">
      <div className="command-search-field">
        <Icon name="search" size={18} />
        <input
          autoFocus
          aria-label="Tìm bản ghi hoặc chức năng"
          placeholder="Tìm khách hàng, dự án, hóa đơn hoặc chức năng"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <kbd>Esc</kbd>
      </div>
      <div className="command-results" role="listbox" aria-label="Kết quả tìm kiếm" aria-busy={loading || undefined}>
        {resultGroups.destinations.length > 0 && (
          <section className="command-group">
            <h3>{query.trim() ? 'Chức năng' : 'Mở nhanh'}</h3>
            {resultGroups.destinations.map((command) => {
              const index = cursor++;
              return (
                <button
                  key={command.href}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  className="command-result"
                  data-active={index === activeIndex || undefined}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => go(command.href)}
                >
                  <Icon name={command.icon || 'arrow'} size={17} />
                  <span><strong>{command.label}</strong><small>{command.groupLabel}</small></span>
                  <Icon name="arrow" size={15} />
                </button>
              );
            })}
          </section>
        )}
        {loading && (
          <div className="command-loading" aria-live="polite">
            <span className="sk sk-line" /><span className="sk sk-line" /><span className="sk sk-line" />
          </div>
        )}
        {error && <div className="command-state command-state-error"><Icon name="warning" />{error}</div>}
        {!loading && !error && resultGroups.records.map((group) => (
          <section className="command-group" key={group.res}>
            <h3>{group.label}</h3>
            {group.items.map((row) => {
              const index = cursor++;
              return (
                <button
                  key={row.id}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  className="command-result"
                  data-active={index === activeIndex || undefined}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => go(group.href(row))}
                >
                  <Icon name={group.icon} size={17} />
                  <span><strong>{group.title(row)}</strong><small>{group.sub(row)}</small></span>
                  <Icon name="arrow" size={15} />
                </button>
              );
            })}
          </section>
        ))}
        {!loading && !error && query.trim().length >= 2 && !resultGroups.records.length && (
          <div className="command-state"><Icon name="search" />Không có bản ghi phù hợp với “{query.trim()}”.</div>
        )}
        {query.trim().length < 2 && (
          <p className="command-hint">Gõ ít nhất 2 ký tự để tìm bản ghi. Dùng phím mũi tên để chọn và Enter để mở.</p>
        )}
      </div>
    </Modal>
  );
}

async function subscribePush(vapidPublicKey) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'error';
  const registration = await navigator.serviceWorker.ready;
  const raw = atob(vapidPublicKey.replace(/-/g, '+').replace(/_/g, '/'));
  const applicationServerKey = Uint8Array.from(raw, (char) => char.charCodeAt(0));
  const subscription = await registration.pushManager.getSubscription()
    || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
  const response = await fetch('/api/push/subscribe', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint, device: navigator.userAgent.slice(0, 120) }),
  });
  return response.ok ? 'granted' : 'error';
}

export function NotificationsModal({ onClose, onChanged, dataRevision = 0 }) {
  const [data, setData] = useState(null);
  const router = useRouter();
  const toast = useToast();
  const load = useCallback(() => fetch('/api/notifications', { cache: 'no-store' })
    .then((response) => response.ok ? response.json() : null).then(setData), []);

  useEffect(() => { load(); }, [dataRevision, load]);
  useEffect(() => {
    window.addEventListener(NOTIFICATION_SYNC_EVENT, load);
    return () => window.removeEventListener(NOTIFICATION_SYNC_EVENT, load);
  }, [load]);

  const openNotification = async (notification) => {
    const response = await fetch('/api/notifications', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: notification.id }),
    });
    if (!response.ok) return toast('Không thể cập nhật thông báo', 'error');
    window.dispatchEvent(new CustomEvent(NOTIFICATION_SYNC_EVENT));
    onChanged?.();
    onClose();
    if (notification.route) router.push(notification.route);
    return true;
  };

  const readAll = async () => {
    const response = await fetch('/api/notifications', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }),
    });
    if (!response.ok) return toast('Không thể cập nhật thông báo', 'error');
    window.dispatchEvent(new CustomEvent(NOTIFICATION_SYNC_EVENT));
    onChanged?.();
    await load();
    toast('Đã đánh dấu tất cả thông báo là đã đọc');
    return true;
  };

  const ago = (time) => {
    const minutes = Math.round((Date.now() - new Date(time)) / 60000);
    if (minutes < 60) return `${minutes} phút`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} giờ`;
    return `${Math.round(minutes / 1440)} ngày`;
  };

  return (
    <Modal
      title="Hộp thư thông báo"
      onClose={onClose}
      footer={(
        <>
          {process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && (
            <AsyncButton
              className="btn btn-outline"
              pendingLabel="Đang bật…"
              onClick={async () => {
                const state = await subscribePush(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
                toast(state === 'granted' ? 'Đã bật thông báo trên thiết bị này'
                  : state === 'denied' ? 'Trình duyệt đang chặn thông báo'
                    : state === 'unsupported' ? 'Thiết bị chưa hỗ trợ thông báo nền'
                      : 'Không bật được thông báo', state === 'granted' ? 'success' : 'error');
              }}
            >
              <Icon name="bell" size={15} /> Bật trên thiết bị
            </AsyncButton>
          )}
          <AsyncButton className="btn btn-outline" onClick={readAll}>Đánh dấu đã đọc</AsyncButton>
          <button className="btn btn-primary" onClick={onClose}>Đóng</button>
        </>
      )}
    >
      <div className="notification-inbox-list" aria-live="polite">
        {!data && <div className="state-inline"><span className="sk sk-line" /><span className="sk sk-line" /></div>}
        {(data?.rows || []).map((notification) => (
          <button
            type="button"
            key={notification.id}
            className="notification-inbox-item"
            data-unread={!notification.readAt || undefined}
            onClick={() => openNotification(notification)}
          >
            <span className="notification-inbox-icon"><Icon name={notification.icon || 'bell'} size={17} /></span>
            <span className="notification-inbox-copy">
              <span><b>{notification.kindLabel || 'Thông báo công việc'}</b><small>{ago(notification.createdAt)} trước</small></span>
              <strong>{notification.text}</strong>
              <em>Mở {notification.targetLabel || 'bản ghi liên quan'}</em>
            </span>
          </button>
        ))}
        {data && !data.rows.length && (
          <div className="command-state"><Icon name="check" />Bạn đã xử lý hết thông báo.</div>
        )}
      </div>
    </Modal>
  );
}

function TwoFAModal({ onClose }) {
  const [info, setInfo] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const toast = useToast();

  useEffect(() => { fetch('/api/users/2fa').then((response) => response.json()).then(setInfo); }, []);

  const call = async (method) => {
    setError('');
    const response = await fetch('/api/users/2fa', {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(method === 'POST' ? { secret: info.secret, code } : { code }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error || 'Có lỗi xảy ra');
      return false;
    }
    toast(method === 'POST' ? 'Đã bật đăng nhập 2 lớp' : 'Đã tắt đăng nhập 2 lớp');
    onClose();
    return true;
  };

  return (
    <Modal
      title="Bảo mật đăng nhập 2 lớp"
      onClose={onClose}
      footer={(
        <>
          <button className="btn btn-outline" onClick={onClose}>Đóng</button>
          {info && (info.enabled
            ? <AsyncButton className="btn btn-danger" onClick={() => call('DELETE')}>Tắt 2FA</AsyncButton>
            : <AsyncButton className="btn btn-primary" onClick={() => call('POST')}>Bật 2FA</AsyncButton>)}
        </>
      )}
    >
      {!info ? <div className="state-inline"><span className="sk sk-line" /><span className="sk sk-line" /></div> : (
        <div className="security-setup">
          <p>{info.enabled
            ? '2FA đang bật. Nhập mã hiện tại từ ứng dụng xác thực để tắt.'
            : 'Nhập khóa dưới đây vào ứng dụng xác thực, sau đó nhập mã 6 số để xác nhận.'}</p>
          {!info.enabled && <code>{info.secret.match(/.{1,4}/g).join(' ')}</code>}
          <label htmlFor="two-factor-code">Mã xác thực</label>
          <input id="two-factor-code" value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" maxLength={6} autoFocus />
          {error && <p className="field-error">{error}</p>}
        </div>
      )}
    </Modal>
  );
}

function CreateMenu({ groups }) {
  const available = new Map(groups.flatMap((group) => group.items.map((item) => [item.key, item])));
  const options = [
    ['tasks', 'Công việc', 'tasks'],
    ['leads', 'Khách tiềm năng', 'leads'],
    ['clients', 'Khách hàng', 'clients'],
    ['quotes', 'Báo giá', 'quotes'],
    ['invoices', 'Hóa đơn', 'invoices'],
    ['projects', 'Dự án', 'projects'],
  ].filter(([key]) => available.has(key));

  if (!options.length) return null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="btn btn-primary shell-create"><Icon name="plus" size={16} />Tạo mới</button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="workspace-menu" sideOffset={8} align="end">
          <DropdownMenu.Label className="workspace-menu-label">Tạo bản ghi</DropdownMenu.Label>
          {options.map(([key, label, icon]) => (
            <DropdownMenu.Item key={key} asChild>
              <Link className="workspace-menu-item" href={['quotes', 'invoices'].includes(key) ? `${available.get(key).href}/new` : `${available.get(key).href}?create=1`}>
                <Icon name={icon} size={16} /><span>{label}</span>
              </Link>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function UserMenu({ user, roles, roleLabels, onAvatar, onSecurity }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="shell-user-trigger" aria-label="Mở menu tài khoản">
          <Avatar userId={user.id} name={user.name} version={user.avatarVersion} size={32} />
          <span><strong>{user.name}</strong><small>{roles.map((role) => roleLabels[role] || role).join(' · ')}</small></span>
          <Icon name="chevron-down" size={14} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="workspace-menu" sideOffset={8} align="end">
          <DropdownMenu.Label className="workspace-menu-label">Tài khoản</DropdownMenu.Label>
          <DropdownMenu.Item className="workspace-menu-item" onSelect={onAvatar}>
            <Icon name="person" size={16} /><span>Đổi ảnh đại diện</span>
          </DropdownMenu.Item>
          <DropdownMenu.Item className="workspace-menu-item" onSelect={onSecurity}>
            <Icon name="shield" size={16} /><span>Bảo mật 2FA</span>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="workspace-menu-separator" />
          <DropdownMenu.Item className="workspace-menu-item workspace-menu-danger" onSelect={() => signOut({ callbackUrl: '/login' })}>
            <Icon name="logout" size={16} /><span>Đăng xuất</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function WorkspaceNav({ groups, pathname, pendingCount, unreadChat, onNavigate }) {
  const location = currentWorkspaceLocation(groups, pathname);
  const [expanded, setExpanded] = useState(() => new Set(location.group ? [location.group.key] : []));

  useEffect(() => {
    if (!location.group) return;
    setExpanded((current) => new Set([...current, location.group.key]));
  }, [location.group?.key]);

  const toggle = (key) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const itemCount = (item) => item.badge ? pendingCount : item.chatBadge ? unreadChat : 0;

  return (
    <nav id="nav" aria-label="Điều hướng chính">
      {groups.map((group) => {
        const active = location.group?.key === group.key;
        const open = expanded.has(group.key);
        const direct = group.items.length === 1 || group.key === 'home';
        return (
          <div className="workspace-nav-group" key={group.key} data-active={active || undefined}>
            <div className="workspace-nav-row">
              <Link
                href={group.items[0].href}
                className="workspace-nav-primary"
                data-active={active || undefined}
                onClick={onNavigate}
              >
                <Icon name={group.icon} size={19} />
                <span>{group.label}</span>
                {group.items.some((item) => item.badge) && pendingCount > 0 && <span className="nav-count">{pendingCount}</span>}
              </Link>
              {!direct && (
                <button
                  type="button"
                  className="workspace-nav-toggle"
                  aria-label={`${open ? 'Thu gọn' : 'Mở'} ${group.label}`}
                  aria-expanded={open}
                  onClick={() => toggle(group.key)}
                >
                  <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} />
                </button>
              )}
            </div>
            {!direct && open && (
              <div className="workspace-nav-children">
                {group.items.map((item) => {
                  const path = item.href.split('?')[0];
                  const itemActive = pathname === path || pathname.startsWith(`${path}/`);
                  const count = itemCount(item);
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      className="workspace-nav-child"
                      data-active={itemActive || undefined}
                      aria-current={itemActive ? 'page' : undefined}
                      onClick={onNavigate}
                    >
                      <Icon name={item.icon} size={16} /><span>{item.label}</span>
                      {count > 0 && <span className="nav-count">{count}</span>}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function MobileNavigation({ groups, pathname, onNavigate }) {
  const entries = MOBILE_NAV_KEYS.map((key) => groups.find((group) => group.key === key)).filter(Boolean);
  return (
    <nav className="mobile-workspace-nav" aria-label="Điều hướng di động">
      {entries.map((group) => {
        const destination = group.key === 'operations'
          ? group.items.find((item) => item.key === 'approvals') || group.items[0]
          : group.key === 'realm'
            ? group.items.find((item) => item.key === 'messages') || group.items[0]
            : group.items[0];
        const path = destination.href.split('?')[0];
        const active = pathname === path || pathname.startsWith(`${path}/`)
          || group.items.some((item) => pathname.startsWith(item.href.split('?')[0]));
        return (
          <Link key={group.key} href={destination.href} data-active={active || undefined} onClick={onNavigate}>
            <Icon name={group.key === 'operations' ? 'approval' : group.key === 'realm' ? 'inbox' : group.icon} size={20} />
            <span>{group.shortLabel}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default function Shell({
  user, company, realmPilot, realmV2Theme = false, realmV2Available = false,
  ceoPortal = false, ceoPortalOrigin = '', children,
}) {
  const { locale } = useLanguage();
  const [open, setOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [unreadChat, setUnreadChat] = useState(0);
  const [show2fa, setShow2fa] = useState(false);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const avatarInputRef = useRef(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [notificationRevision, setNotificationRevision] = useState(0);
  const [roleLabels, setRoleLabels] = useState(ROLE_LABEL);
  const [modules, setModules] = useState(null);
  const pathname = usePathname();
  const router = useRouter();
  const freelancer = user?.userType === 'freelancer';
  const roles = rolesOf(user);
  const isLegacyRealm = pathname === '/realm' || pathname.startsWith('/realm/');

  useEffect(() => {
    fetch('/api/settings').then((response) => response.ok ? response.json() : null)
      .then((settings) => {
        if (!settings) return;
        const overrides = Object.fromEntries(Object.entries(settings.roleLabels || {})
          .filter(([, value]) => value && String(value).trim()));
        setRoleLabels({ ...ROLE_LABEL, ...overrides });
        if (Array.isArray(settings.modules)) setModules(settings.modules);
      }).catch(() => {});
  }, []);

  useEffect(() => {
    if (freelancer && pathname !== '/freelancer') router.replace('/freelancer');
  }, [freelancer, pathname, router]);

  useEffect(() => {
    if (freelancer || !Array.isArray(modules)) return;
    const current = NAV.find((item) => item.key && pathname.startsWith(`/${item.key}`));
    if (current?.mod && !modOn(current.mod, modules)) router.replace('/dashboard');
  }, [pathname, modules, freelancer, router]);

  const visible = useCallback((item) => freelancer
    ? true
    : (!item.ceoPortalOnly || ceoPortal)
      && (!item.realmSurface || realmPilot?.allowed)
      && hasAny(user, item.roles)
      && modOn(item.mod, modules), [ceoPortal, freelancer, modules, realmPilot?.allowed, user]);

  const groups = useMemo(() => workspaceNavigation(visible, { freelancer, ceoPortal }), [visible, freelancer, ceoPortal]);
  const navigationGroups = useMemo(() => {
    if (!ceoPortal) return groups;
    const overview = groups.flatMap((group) => group.items).find((item) => item.key === 'ceo-overview');
    return overview ? [{ key: 'more', label: 'CEO Terminal', shortLabel: 'CEO', icon: 'command', items: [overview] }] : [];
  }, [ceoPortal, groups]);
  const location = currentWorkspaceLocation(groups, pathname);
  const commands = useMemo(() => groups.flatMap((group) => group.items.map((item) => ({
    href: item.href, label: item.label, icon: item.icon, groupLabel: group.label,
  }))), [groups]);

  const loadShellCounters = useCallback(() => {
    fetch('/api/approvals').then((response) => response.ok ? response.json() : null)
      .then((data) => data && setPendingCount(data.pendingCount || 0)).catch(() => {});
    fetch('/api/chat').then((response) => response.ok ? response.json() : null)
      .then((data) => data && setUnreadChat(data.totalUnread || 0)).catch(() => {});
    fetch('/api/notifications').then((response) => response.ok ? response.json() : null)
      .then((data) => data && setUnreadNotifications(data.unread || 0)).catch(() => {});
  }, []);

  const handleShellChanges = useCallback((feed) => {
    const domains = new Set(feed?.domains || []);
    if (!['notifications', 'communications', 'collaboration'].some((domain) => domains.has(domain))) return;
    setNotificationRevision((revision) => revision + 1);
    loadShellCounters();
  }, [loadShellCounters]);

  useRealmChangeFeed({
    enabled: process.env.NEXT_PUBLIC_REALM_ERP_SYNC === '1' && !freelancer && !isLegacyRealm,
    onChanges: handleShellChanges,
  });

  useEffect(() => {
    loadShellCounters();
    const timer = setInterval(loadShellCounters, 15000);
    return () => clearInterval(timer);
  }, [pathname, loadShellCounters]);

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    subscribePush(key).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  const uploadAvatar = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 512 * 1024) {
      window.alert('Ảnh vượt 512KB. Hãy crop hoặc nén ảnh rồi thử lại.');
      return;
    }
    const form = new FormData();
    form.append('file', file);
    const response = await fetch('/api/avatar', { method: 'POST', body: form });
    if (response.ok) setAvatarVersion((version) => version + 1);
    else window.alert((await response.json().catch(() => ({})))?.error || 'Không thể tải ảnh lên');
  };

  return (
    <SessionProvider>
      <ToastProvider>
        <RoleLabelsCtx.Provider value={roleLabels}>
          <ModulesCtx.Provider value={modules}>
            {!ceoPortal && <CollaborationBridge />}
            {!ceoPortal && !freelancer && realmPilot?.allowed && realmPilot?.config?.features?.feedback !== false && <RealmFeedbackLauncher />}
            {!ceoPortal && !freelancer && <RealmPilotOnboarding user={user} pilot={realmPilot} />}
            <div
              id="app"
              className={isLegacyRealm ? 'realm-immersive' : 'workspace-shell'}
              data-visual-system="workplace-2026"
              data-deployment-kind={ceoPortal ? 'ceo-portal' : 'entity'}
            >
              <aside id="sidebar" className={open ? 'open' : ''} aria-label="Thanh điều hướng">
                <div className="brand">
                  <div className="brand-logo"><Icon name={ceoPortal ? 'company' : 'command'} size={21} /></div>
                  <div className="brand-text">
                    <span className="brand-name">{company || 'RepositoryRealms'}</span>
                    <span className="brand-sub">{ceoPortal ? 'CEO Terminal · 4 công ty' : 'Business workspace'}</span>
                  </div>
                </div>
                {!ceoPortal && roles.includes('DIRECTOR') && ceoPortalOrigin && (
                  <a className="ceo-terminal-entry" href={`${ceoPortalOrigin}/ceo-overview`} rel="noopener noreferrer">
                    <Icon name="command" size={17} /><span>Mở CEO Terminal</span><Icon name="arrow" size={14} />
                  </a>
                )}
                <WorkspaceNav
                  groups={navigationGroups}
                  pathname={pathname}
                  pendingCount={pendingCount}
                  unreadChat={unreadChat}
                  onNavigate={() => setOpen(false)}
                />
                <div className="sidebar-footer">
                  <span>Không gian làm việc</span>
                  <strong>{roles.map((role) => roleLabels[role] || role).join(' · ')}</strong>
                </div>
              </aside>

              <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={uploadAvatar} />
              {show2fa && <TwoFAModal onClose={() => setShow2fa(false)} />}
              {!ceoPortal && showSearch && <GlobalSearch commands={commands} onClose={() => setShowSearch(false)} />}
              {showNotifications && (
                <NotificationsModal
                  dataRevision={notificationRevision}
                  onClose={() => setShowNotifications(false)}
                  onChanged={() => {
                    setNotificationRevision((revision) => revision + 1);
                    loadShellCounters();
                  }}
                />
              )}

              <button id="backdrop" className={open ? 'show' : ''} onClick={() => setOpen(false)} aria-label="Đóng menu" />
              <div id="main">
                <header id="topbar">
                  <button id="menu-btn" onClick={() => setOpen(true)} aria-label="Mở menu"><Icon name="menu" /></button>
                  <div className="page-identity">
                    <div className="breadcrumbs" aria-label="Đường dẫn trang">
                      <span>{location.group?.label || (ceoPortal ? 'CEO Terminal' : 'Không gian làm việc')}</span>
                      {location.item && <><Icon name="chevron" size={12} /><span aria-current="page">{location.item.label}</span></>}
                    </div>
                    <h1 id="page-title">{location.item?.label || (ceoPortal ? 'CEO Terminal' : 'RepositoryRealms')}</h1>
                  </div>
                  <div className="topbar-right">
                    {!ceoPortal && <WorkspaceSurfaceSwitch pilot={realmPilot} realmV2Available={realmV2Available} />}
                    <CreateMenu groups={groups} />
                    <button className="shell-command-trigger" onClick={() => { if (ceoPortal) router.push('/ceo-navigator'); else setShowSearch(true); }} aria-label={ceoPortal ? 'Mở điều hướng CEO' : 'Tìm kiếm toàn hệ thống'}>
                      <Icon name="search" size={17} /><span>Tìm kiếm</span><kbd>Ctrl K</kbd>
                    </button>
                    <button className="shell-icon-button" onClick={() => setShowNotifications(true)} aria-label="Thông báo">
                      <Icon name="bell" size={18} />
                      {unreadNotifications > 0 && <span className="notification-count">{unreadNotifications > 99 ? '99+' : unreadNotifications}</span>}
                    </button>
                    <LanguageSwitch compact />
                    <UserMenu
                      user={{ ...user, avatarVersion }}
                      roles={roles}
                      roleLabels={roleLabels}
                      onAvatar={() => avatarInputRef.current?.click()}
                      onSecurity={() => setShow2fa(true)}
                    />
                  </div>
                </header>
                {ceoPortal && (
                  <nav className="ceo-terminal-tabs" aria-label="Khu vực CEO Terminal">
                    {CEO_TABS.map(([label, href]) => (
                      <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined} data-active={pathname === href || undefined}>{label}</Link>
                    ))}
                  </nav>
                )}
                <main id="view">
                  {freelancer && pathname !== '/freelancer'
                    ? <div className="command-state"><Icon name="work" />Đang mở không gian công việc của bạn…</div>
                    : children}
                </main>
              </div>
              {!ceoPortal && <MobileNavigation groups={navigationGroups} pathname={pathname} onNavigate={() => setOpen(false)} />}
            </div>
          </ModulesCtx.Provider>
        </RoleLabelsCtx.Provider>
      </ToastProvider>
    </SessionProvider>
  );
}
