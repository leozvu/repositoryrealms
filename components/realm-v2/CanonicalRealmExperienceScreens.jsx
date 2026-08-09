'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LanguageSwitch, useLanguage } from '@/components/LanguageProvider';
import { useToast } from '@/components/ui';
import {
  rememberCollaborationAvailability,
  preferredCollaborationAvailability,
} from '@/lib/collaboration';
import { GLOBAL_SEARCH_GROUPS, searchGroupRows } from '@/lib/global-search-contract';
import Icon from './Icon';
import { Badge, Banner, Button, Field, Panel, Segmented, SourcePill, StateView, Status, Toggle } from './Primitives';
import styles from './realm-v2.module.css';

const NOTIFICATION_FILTERS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'unread', label: 'Chưa đọc' },
  { value: 'action', label: 'Cần hành động' },
  { value: 'mentions', label: 'Tin nhắn' },
  { value: 'updates', label: 'Cập nhật' },
];

const NOTIFICATION_SECTIONS = [
  ['action', 'Cần hành động', 'approval'],
  ['mentions', 'Tin nhắn & liên hệ', 'chat'],
  ['updates', 'Cập nhật công việc', 'checklist'],
  ['system', 'Hệ thống', 'bell'],
];

const SEARCH_ICON = {
  clients: 'people', leads: 'people', projects: 'folder', tasks: 'checklist', invoices: 'receipt',
  check: 'checklist', wallet: 'cash', shield: 'approval', staff: 'person',
};

const SEARCH_RECENT_KEY = 'realm-v2-recent-searches';
const REALM_DENSITY_KEY = 'realm-v2-density';
const REALM_MOTION_KEY = 'realm-v2-reduced-motion';

function asDate(value, withTime = true) {
  if (!value) return 'Chưa xác định';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('vi-VN', withTime
    ? { dateStyle: 'short', timeStyle: 'short' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function notificationSection(row) {
  if (row.kind === 'approval') return 'action';
  if (row.kind === 'message') return 'mentions';
  if (['quest', 'diplomacy', 'support'].includes(row.kind)) return 'updates';
  return 'system';
}

function notificationTone(row) {
  if (row.kind === 'approval') return 'warning';
  if (row.kind === 'message') return 'info';
  return row.readAt ? 'neutral' : 'success';
}

function useNotifications() {
  const [state, setState] = useState({ loading: true, payload: null, error: '' });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const response = await fetch('/api/notifications', { cache: 'no-store', credentials: 'same-origin' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Không thể tải thông báo.');
      setState({ loading: false, payload, error: '' });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error?.message || 'Không thể kết nối máy chủ.' }));
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load, setState };
}

function NotificationRow({ row, busy, onRead }) {
  const isUnread = !row.readAt;
  return (
    <article className={styles.experienceNotification} data-unread={isUnread || undefined}>
      <span className={styles.listIcon}><Icon name={SEARCH_ICON[row.icon] || 'bell'}/></span>
      <div className={styles.experienceNotificationCopy}>
        <div><strong>{row.text}</strong>{isUnread && <Badge tone={notificationTone(row)}>Mới</Badge>}</div>
        <span>{row.kindLabel || 'RepositoryRealms'} · {asDate(row.createdAt)}</span>
      </div>
      <div className={styles.experienceNotificationActions}>
        {isUnread && <Button variant="quiet" loading={busy} onClick={() => onRead(row.id)}>Đánh dấu đã đọc</Button>}
        <Link className={styles.button} data-variant="secondary" href={row.route || '/dashboard'}><span>Mở nguồn</span><Icon name="arrow" size={15}/></Link>
      </div>
    </article>
  );
}

function NotificationsScreen() {
  const source = useNotifications();
  const toast = useToast();
  const [filter, setFilter] = useState('all');
  const [busyId, setBusyId] = useState('');
  const rows = source.payload?.rows || [];
  const grouped = useMemo(() => NOTIFICATION_SECTIONS.map(([key, label, icon]) => {
    const items = rows.filter((row) => {
      const section = notificationSection(row);
      if (filter === 'unread') return !row.readAt && section === key;
      if (!['all', 'unread'].includes(filter)) return section === key && filter === key;
      return section === key;
    });
    return { key, label, icon, items };
  }).filter((section) => section.items.length), [filter, rows]);

  const markRead = useCallback(async (id = null) => {
    setBusyId(id || 'all');
    try {
      const response = await fetch('/api/notifications', {
        method: 'PUT', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(id ? { id } : { all: true }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Không thể cập nhật thông báo.');
      source.setState((current) => ({
        ...current,
        payload: {
          ...current.payload,
          unread: payload.unread,
          rows: (current.payload?.rows || []).map((row) => (!id || row.id === id) ? { ...row, readAt: row.readAt || new Date().toISOString() } : row),
        },
      }));
      window.dispatchEvent(new CustomEvent('crmegoric:notifications-changed'));
      toast(id ? 'Thông báo đã được đánh dấu đã đọc.' : 'Tất cả thông báo đã được đánh dấu đã đọc.');
    } catch (error) {
      toast(error?.message || 'Không thể cập nhật thông báo.', 'error');
    } finally { setBusyId(''); }
  }, [source, toast]);

  if (source.loading && !source.payload) return <Panel><StateView state="loading"/></Panel>;
  if (!source.payload) return <Panel title="Không thể tải Thông báo"><div className={styles.canonicalState}><StateView state="error"/><Button variant="secondary" icon="refresh" onClick={source.reload}>Tải lại an toàn</Button></div></Panel>;

  return <div className={styles.experienceScreen}>
    <Banner>Thông báo dùng cùng Notification record và authorization của ERP. Realm không tạo hộp thư, mức độ ưu tiên hoặc lịch sử riêng.</Banner>
    <Panel
      title={`Thông báo (${rows.length})`}
      description={`${source.payload.unread || 0} chưa đọc · tối đa 30 bản ghi gần nhất của chính bạn`}
      actions={<Button variant="secondary" loading={busyId === 'all'} disabled={!source.payload.unread} onClick={() => markRead()}>Đọc tất cả</Button>}
    >
      <div className={styles.experienceToolbar}>
        <Segmented label="Lọc thông báo" options={NOTIFICATION_FILTERS} value={filter} onChange={setFilter}/>
        <SourcePill source="Notification ERP" freshness="Private · no-store"/>
      </div>
      {source.error && <Banner tone="warning" action={<Button variant="secondary" icon="refresh" onClick={source.reload}>Thử lại</Button>}>Không thể làm mới dữ liệu. Danh sách đã tải vẫn được giữ nguyên.</Banner>}
      {grouped.length ? <div className={styles.notificationSections}>{grouped.map((section) => <section key={section.key} aria-labelledby={`notification-${section.key}`}>
        <header className={styles.experienceSectionHeader}><span className={styles.listIcon}><Icon name={section.icon}/></span><div><h3 id={`notification-${section.key}`}>{section.label}</h3><span>{section.items.length} bản ghi</span></div></header>
        <div>{section.items.map((row) => <NotificationRow key={row.id} row={row} busy={busyId === row.id} onRead={markRead}/>)}</div>
      </section>)}</div> : <StateView state="empty"/>}
    </Panel>
    <div className={styles.sourceRow}><SourcePill source="RepositoryRealms Notification" freshness="Self-scoped"/><span>Tắt tiếng, snooze và rule cá nhân chưa có canonical contract nên không được mô phỏng.</span></div>
  </div>;
}

function safeRecentSearches() {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SEARCH_RECENT_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string').slice(0, 5) : [];
  } catch { return []; }
}

function SearchScreen() {
  const router = useRouter();
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [resources, setResources] = useState({});
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState([]);
  const [recent, setRecent] = useState([]);
  const [active, setActive] = useState(0);

  useEffect(() => { setRecent(safeRecentSearches()); inputRef.current?.focus(); }, []);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all(GLOBAL_SEARCH_GROUPS.map(async (group) => {
      try {
        const response = await fetch(`/api/data/${group.res}`, { cache: 'no-store', credentials: 'same-origin' });
        const payload = await response.json().catch(() => ([]));
        if (!response.ok) throw new Error(group.label);
        return [group.res, Array.isArray(payload) ? payload : [], null];
      } catch { return [group.res, [], group.label]; }
    })).then((entries) => {
      if (!alive) return;
      setResources(Object.fromEntries(entries.map(([key, rows]) => [key, rows])));
      setErrors(entries.map((entry) => entry[2]).filter(Boolean));
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const groups = useMemo(() => GLOBAL_SEARCH_GROUPS.map((group) => ({
    ...group, items: searchGroupRows(group, resources[group.res], query, 6),
  })).filter((group) => group.items.length), [query, resources]);
  const flat = useMemo(() => groups.flatMap((group) => group.items.map((row) => ({ group, row }))), [groups]);
  useEffect(() => { setActive(0); }, [query]);

  const open = useCallback((href) => {
    const needle = query.trim();
    if (needle.length >= 2) {
      const next = [needle, ...safeRecentSearches().filter((item) => item !== needle)].slice(0, 5);
      window.localStorage.setItem(SEARCH_RECENT_KEY, JSON.stringify(next));
      setRecent(next);
    }
    router.push(href);
  }, [query, router]);

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown' && flat.length) { event.preventDefault(); setActive((value) => (value + 1) % flat.length); }
    if (event.key === 'ArrowUp' && flat.length) { event.preventDefault(); setActive((value) => (value - 1 + flat.length) % flat.length); }
    if (event.key === 'Enter' && flat[active]) { event.preventDefault(); open(flat[active].group.href(flat[active].row)); }
    if (event.key === 'Escape') { setQuery(''); inputRef.current?.focus(); }
  };

  let flatIndex = -1;
  return <div className={styles.experienceScreen}>
    <section className={styles.searchHero} aria-labelledby="realm-search-title">
      <Icon name="search" size={26}/>
      <div><span className={styles.eyebrow}>Authorized search · ERP records</span><h2 id="realm-search-title">Bạn cần tìm gì?</h2></div>
      <input ref={inputRef} className={styles.searchHeroInput} type="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onKeyDown} placeholder="Tên khách hàng, Task, dự án, hóa đơn…" aria-label="Tìm kiếm toàn hệ thống" aria-controls="realm-search-results" aria-activedescendant={flat[active] ? `realm-search-option-${flat[active].group.res}-${flat[active].row.id}` : undefined}/>
      <kbd>↑↓ chọn · Enter mở · Esc xóa</kbd>
    </section>
    {errors.length > 0 && <Banner tone="warning">Một số nguồn bị giới hạn hoặc tạm gián đoạn: {errors.join(', ')}. Kết quả còn lại vẫn sử dụng đúng quyền API.</Banner>}
    <div className={styles.searchLayout}>
      <Panel title={query.trim().length < 2 ? 'Bắt đầu tìm kiếm' : `Kết quả cho “${query.trim()}”`} description="Kết quả chỉ gồm bản ghi mà API hiện tại cho phép tài khoản này đọc.">
        <div id="realm-search-results" role="listbox" aria-label="Kết quả tìm kiếm">
          {loading ? <StateView state="loading" compact/> : query.trim().length < 2 ? <div className={styles.searchStart}><div><span className={styles.eyebrow}>Tìm gần đây</span>{recent.length ? recent.map((item) => <button type="button" key={item} onClick={() => setQuery(item)}><Icon name="clock" size={15}/>{item}</button>) : <span>Chưa có lịch sử tìm trên thiết bị này.</span>}</div><Banner>Lịch sử chỉ lưu cụm từ trên trình duyệt; không sao chép record hoặc dữ liệu nghiệp vụ.</Banner></div> : groups.length ? <div className={styles.searchGroups}>{groups.map((group) => <section key={group.res}>
            <header><span>{group.label}</span><Badge>{group.items.length}</Badge></header>
            {group.items.map((row) => {
              flatIndex += 1;
              const index = flatIndex;
              return <button id={`realm-search-option-${group.res}-${row.id}`} type="button" role="option" aria-selected={active === index} data-active={active === index || undefined} className={styles.searchResult} key={`${group.res}:${row.id}`} onMouseEnter={() => setActive(index)} onClick={() => open(group.href(row))}>
                <span className={styles.listIcon}><Icon name={SEARCH_ICON[group.icon] || 'search'}/></span><span className={styles.listCopy}><strong>{group.title(row)}</strong><span>{group.sub(row) || group.label}</span></span><Icon name="arrow" size={15}/>
              </button>;
            })}
          </section>)}</div> : <StateView state="empty" compact/>}
        </div>
      </Panel>
      <aside className={styles.searchAside}>
        <Panel title="Tác vụ nhanh" description="Đi đến workflow; không thực thi lệnh ngầm.">
          <div className={styles.list}>
            <Link className={styles.listItem} href="/realm-v2/command-center"><span className={styles.listIcon}><Icon name="command"/></span><span className={styles.listCopy}><strong>Đề xuất tác vụ</strong><span>Authorization và receipt tại RepositoryRealms</span></span><Icon name="chevron" size={14}/></Link>
            <Link className={styles.listItem} href="/tasks"><span className={styles.listIcon}><Icon name="plus"/></span><span className={styles.listCopy}><strong>Tạo Task ERP</strong><span>Mở form chuẩn theo quyền hiện tại</span></span><Icon name="chevron" size={14}/></Link>
            <Link className={styles.listItem} href="/realm-v2/approvals"><span className={styles.listIcon}><Icon name="approval"/></span><span className={styles.listCopy}><strong>Mở phê duyệt</strong><span>Không bỏ qua maker-checker</span></span><Icon name="chevron" size={14}/></Link>
          </div>
        </Panel>
        <SourcePill source="9 API data resources" freshness="RBAC hiện tại"/>
      </aside>
    </div>
  </div>;
}

function readPresentationPreferences() {
  if (typeof window === 'undefined') return { density: 'comfortable', reducedMotion: false };
  return {
    density: window.localStorage.getItem(REALM_DENSITY_KEY) === 'compact' ? 'compact' : 'comfortable',
    reducedMotion: window.localStorage.getItem(REALM_MOTION_KEY) === 'true',
  };
}

function applyPresentationPreferences({ density, reducedMotion }) {
  document.documentElement.dataset.realmDensity = density;
  document.documentElement.dataset.realmReducedMotion = String(reducedMotion);
}

function SettingsScreen() {
  const toast = useToast();
  const { locale } = useLanguage();
  const [pilot, setPilot] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');
  const [density, setDensity] = useState('comfortable');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [availability, setAvailability] = useState('available');

  useEffect(() => {
    const preferences = readPresentationPreferences();
    setDensity(preferences.density); setReducedMotion(preferences.reducedMotion);
    setAvailability(preferredCollaborationAvailability());
    applyPresentationPreferences(preferences);
    fetch('/api/realm-demo/pilot', { cache: 'no-store', credentials: 'same-origin' })
      .then(async (response) => { const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || 'Không thể tải tùy chọn workspace.'); return payload; })
      .then(setPilot).catch((reason) => setError(reason?.message || 'Không thể tải cài đặt.'));
  }, []);

  const setPresentation = (next) => {
    const preferences = { density, reducedMotion, ...next };
    setDensity(preferences.density); setReducedMotion(preferences.reducedMotion);
    window.localStorage.setItem(REALM_DENSITY_KEY, preferences.density);
    window.localStorage.setItem(REALM_MOTION_KEY, String(preferences.reducedMotion));
    applyPresentationPreferences(preferences);
  };
  const saveWorkspace = async (preference) => {
    setSaving('workspace');
    try {
      const response = await fetch('/api/realm-demo/pilot', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preference }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Không thể lưu workspace mặc định.');
      setPilot((current) => ({ ...current, user: payload.user }));
      toast('Workspace mặc định đã được RepositoryRealms cập nhật và audit.');
    } catch (reason) { toast(reason?.message || 'Không thể lưu workspace.', 'error'); }
    finally { setSaving(''); }
  };
  const changeAvailability = (value) => {
    const next = rememberCollaborationAvailability(value);
    setAvailability(next);
    toast('Trạng thái cộng tác đã cập nhật trên thiết bị này.');
  };

  return <div className={styles.experienceScreen}>
    <Banner>Cài đặt Realm tách rõ tùy chọn trình bày cục bộ với policy nghiệp vụ. Quyền, bảo mật và cấu hình tổ chức vẫn do ERP quản trị.</Banner>
    {error && <Banner tone="warning">{error} Tùy chọn trình bày cục bộ vẫn có thể dùng.</Banner>}
    <div className={styles.settingsLayout}>
      <nav className={styles.settingsNav} aria-label="Nhóm cài đặt"><a href="#workspace"><Icon name="panel"/>Workspace</a><a href="#appearance"><Icon name="eyeOff"/>Hiển thị</a><a href="#collaboration"><Icon name="people"/>Cộng tác</a><a href="#governance"><Icon name="lock"/>Quản trị ERP</a></nav>
      <div className={styles.settingsPanels}>
        <Panel title="Workspace mặc định" description="Preference canonical, được lưu qua RepositoryRealms." actions={<SourcePill source="Realm pilot" freshness="Audited"/>}>
          <div id="workspace" className={styles.settingsChoiceGrid}>
            {[['realm', 'Realm', 'Trải nghiệm tập trung, không thay business rules.'], ['erp', 'ERP · CRM', 'Giao diện nghiệp vụ gốc cho người không dùng Realm.']].map(([value, title, description]) => <button type="button" key={value} data-selected={pilot?.user?.preference === value || undefined} onClick={() => saveWorkspace(value)} disabled={saving === 'workspace'}><span className={styles.listIcon}><Icon name={value === 'realm' ? 'home' : 'brief'}/></span><span><strong>{title}</strong><small>{description}</small></span>{pilot?.user?.preference === value && <Icon name="check"/>}</button>)}
          </div>
        </Panel>
        <Panel title="Ngôn ngữ & hiển thị" description="Các lựa chọn này chỉ đổi trải nghiệm trên trình duyệt hiện tại.">
          <div id="appearance" className={styles.settingsRows}>
            <div><span><strong>Ngôn ngữ</strong><small>Hiện tại: {locale === 'vi' ? 'Tiếng Việt' : 'English'}</small></span><LanguageSwitch/></div>
            <div><span><strong>Mật độ nội dung</strong><small>Không thay dữ liệu hoặc workflow.</small></span><Segmented label="Mật độ nội dung" options={[{ value: 'comfortable', label: 'Thoải mái' }, { value: 'compact', label: 'Gọn' }]} value={density} onChange={(value) => setPresentation({ density: value })}/></div>
            <div><span><strong>Giảm chuyển động</strong><small>Hỗ trợ tập trung và accessibility.</small></span><Toggle key={String(reducedMotion)} label="Giảm chuyển động" defaultChecked={reducedMotion} onChange={(value) => setPresentation({ reducedMotion: value })}/></div>
          </div>
        </Panel>
        <Panel title="Cộng tác & hiện diện" description="Trạng thái do chính người dùng kiểm soát; không dùng để đánh giá năng suất.">
          <div id="collaboration" className={styles.settingsRows}><div><span><strong>Khả dụng hiện tại</strong><small>Presence được gửi bởi Collaboration Bridge khi bạn online.</small></span><select className={styles.select} aria-label="Trạng thái cộng tác" value={availability} onChange={(event) => changeAvailability(event.target.value)}><option value="available">Sẵn sàng</option><option value="busy">Đang bận</option><option value="focus">Tập trung</option><option value="dnd">Không làm phiền</option><option value="away">Tạm vắng</option></select></div></div>
        </Panel>
        <Panel title="Quản trị, bảo mật & tổ chức" description="Không sao chép policy sang Realm.">
          <div id="governance" className={styles.settingsGateway}><span className={styles.listIcon}><Icon name="lock"/></span><div><strong>Mở Cài đặt ERP chuẩn</strong><p>Vai trò, 2FA, tích hợp, công ty và policy vẫn tuân theo authorization hiện có.</p></div><Link className={styles.button} href="/settings"><span>Mở Cài đặt ERP</span><Icon name="arrow" size={15}/></Link></div>
        </Panel>
      </div>
    </div>
    <div className={styles.sourceRow}><SourcePill source="RepositoryRealms" freshness="Policy canonical"/><span>Local: language, density, reduced motion, presence. Audited: workspace preference. ERP-only: governance and security.</span></div>
  </div>;
}

function MobileTask({ label, task, empty }) {
  if (!task) return <div className={styles.mobileTask}><span className={styles.eyebrow}>{label}</span><strong>{empty}</strong><span>Realm không tạo dữ liệu thay cho ERP.</span></div>;
  return <Link className={styles.mobileTask} href={task.href || '/tasks'}><span className={styles.eyebrow}>{label}</span><strong>{task.title}</strong><span>{task.project?.name || 'Task ERP'} · {task.dueDate ? asDate(task.dueDate, false) : 'Chưa có hạn'}</span><Icon name="chevron" size={15}/></Link>;
}

function MobileRealmScreen({ user }) {
  const [state, setState] = useState({ loading: true, profile: null, notifications: null, errors: [] });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, errors: [] }));
    const sources = await Promise.all([
      fetch('/api/realm-v2/profile-recognition', { cache: 'no-store', credentials: 'same-origin' }).then(async (response) => { const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Hồ sơ'); return body; }).catch((error) => ({ error: error.message })),
      fetch('/api/notifications', { cache: 'no-store', credentials: 'same-origin' }).then(async (response) => { const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || 'Thông báo'); return body; }).catch((error) => ({ error: error.message })),
    ]);
    setState({ loading: false, profile: sources[0].error ? null : sources[0], notifications: sources[1].error ? null : sources[1], errors: sources.filter((source) => source.error).map((source) => source.error) });
  }, []);
  useEffect(() => { load(); }, [load]);
  if (state.loading && !state.profile) return <Panel><StateView state="loading"/></Panel>;
  const profile = state.profile?.profile;
  const identity = state.profile?.identity;
  const unread = state.notifications?.unread || 0;
  return <div className={styles.mobileExperience}>
    <section className={styles.mobileWelcome}><span className={styles.avatar}>{String(user?.name || 'U').split(/\s+/).map((part) => part[0]).slice(-2).join('').toUpperCase()}</span><div><span className={styles.eyebrow}>Mobile Realm · Priority first</span><h2>Chào {identity?.preferredName || user?.name || 'bạn'}</h2><p>{identity?.title || 'Workspace cá nhân'} · {identity?.company || 'RepositoryRealms'}</p></div><Link href="/realm-v2/employee-profile" aria-label="Mở hồ sơ"><Icon name="person"/></Link></section>
    {state.errors.length > 0 && <Banner tone="warning" action={<Button variant="secondary" icon="refresh" onClick={load}>Thử lại</Button>}>Một số nguồn đang gián đoạn; không có hành động nào được tự gửi.</Banner>}
    <section className={styles.mobilePriority}>
      <MobileTask label="Đang ưu tiên" task={profile?.currentWork} empty="Không có việc đang làm"/>
      <MobileTask label="Tiếp theo" task={profile?.nextWork} empty="Không có việc kế tiếp"/>
    </section>
    <div className={styles.mobileQuickGrid}>
      <Link href="/realm-v2/action-center"><Icon name="bolt"/><strong>Hành động</strong><span>Ngoại lệ và quyết định</span></Link>
      <Link href="/realm-v2/notifications"><Icon name="bell"/><strong>Thông báo</strong><span>{unread} chưa đọc</span></Link>
      <Link href="/realm-v2/search"><Icon name="search"/><strong>Tìm kiếm</strong><span>Record theo quyền</span></Link>
      <Link href="/realm-v2/settings"><Icon name="settings"/><strong>Cài đặt</strong><span>Workspace & hiển thị</span></Link>
    </div>
    <Panel title="Tất cả điểm đến" description="Mobile không nén menu desktop; chỉ đưa hành động quan trọng lên trước.">
      <div className={styles.mobileMoreList}>
        <Link href="/realm-v2/my-work"><Icon name="checklist"/><span><strong>Việc của tôi</strong><small>{profile?.openWorkCount ?? '—'} việc đang mở</small></span><Icon name="chevron" size={14}/></Link>
        <Link href="/realm-v2/inbox"><Icon name="inbox"/><span><strong>Hộp thư hợp nhất</strong><small>Conversation ERP</small></span><Icon name="chevron" size={14}/></Link>
        <Link href="/realm-v2/projects"><Icon name="folder"/><span><strong>Dự án</strong><small>{profile?.activeProjects?.length ?? '—'} dự án đang tham gia</small></span><Icon name="chevron" size={14}/></Link>
        <Link href="/realm-v2/recognition"><Icon name="ledger"/><span><strong>Sổ Realm và Gold</strong><small>{state.profile?.recognition?.summary?.balance ?? '—'} Gold</small></span><Icon name="chevron" size={14}/></Link>
        <Link href="/dashboard"><Icon name="brief"/><span><strong>Mở ERP · CRM</strong><small>Toàn bộ workflow nghiệp vụ gốc</small></span><Icon name="chevron" size={14}/></Link>
      </div>
    </Panel>
    <div className={styles.sourceRow}><SourcePill source="Task, User, Notification ERP" freshness="Self-scoped"/><span>Không có mobile business store riêng.</span></div>
  </div>;
}

export default function CanonicalRealmExperienceScreen({ slug, user }) {
  if (slug === 'notifications') return <NotificationsScreen/>;
  if (slug === 'search') return <SearchScreen/>;
  if (slug === 'settings') return <SettingsScreen/>;
  return <MobileRealmScreen user={user}/>;
}
