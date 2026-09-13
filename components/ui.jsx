'use client';
// UI kit dùng chung: icon, toast, modal, form động, hook dữ liệu — port từ v1
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { SessionContext } from 'next-auth/react';
import {
  ArrowRight, ArrowsClockwise, Article, Bank, Bell, Briefcase, Buildings,
  Cake, CalendarBlank, CaretDown, CaretRight, CaretUp, ChartBar, ChartLineUp,
  ChatCircle, ChatTeardropText, Check, CheckSquare, ClipboardText, Clock,
  Columns, Command, Compass, DeviceMobile, DotsThree, DownloadSimple,
  EnvelopeSimple, EyeSlash, FileText, FloppyDisk, Folder, FolderOpen, Funnel,
  GearSix, House, IdentificationCard, Kanban, Lightning, LinkSimple, List,
  ListChecks, Lock, MagnifyingGlass, MapTrifold, Microphone, Money, Monitor,
  NotePencil, PencilSimple, Percent, Phone, Plus, Printer, Pulse, Receipt,
  ShieldCheck, ShieldWarning, SidebarSimple, SignOut, SortAscending, SquaresFour,
  Sun, Tag, Target, Trash, TrendDown, TrendUp, UploadSimple, User, Users,
  UsersThree, VideoCamera, Wallet, Warning, WarningCircle, X,
} from '@phosphor-icons/react';
import { BADGE } from '@/lib/format';
import { ROLE_LABEL } from '@/lib/perm';
import { createResourceClient } from '@/lib/resource-client';

/* ---------- v3.6: tên chức danh tùy biến theo công ty (Settings.roleLabels) ---------- */
export const RoleLabelsCtx = createContext(null);
// Trả map {DIRECTOR: 'Giám đốc', ...} — công ty đổi tên trong Cài đặt thì mọi nơi đổi theo
export const useRoleLabels = () => useContext(RoleLabelsCtx) || ROLE_LABEL;

/* ---------- v3.22: phân hệ bật/tắt theo công ty (Setting.modules) ---------- */
// Shell nạp modules 1 lần rồi cung cấp qua context — trang con đọc để hiện KPI đúng loại hình
// mà không phải fetch lại. Giá trị: mảng mod đang bật | null (công ty cũ = coi như bật hết agency).
export const ModulesCtx = createContext(null);
export const useModules = () => useContext(ModulesCtx);

/* ---------- v3.37: mảng dịch vụ theo công ty (Setting.serviceLines) ---------- */
// Feedback Egoric 07/2026: danh sách mảng dịch vụ từng hard-code (thiếu Seeding/Livestream).
// Nay đọc từ Cài đặt; fallback đúng bộ mặc định của /api/settings khi chưa tải xong.
export const DEFAULT_SERVICE_LINES = ['Digital Ads', 'Social Media', 'Branding', 'Web & SEO', 'Production', 'PR / Event', 'Seeding', 'Livestream', 'Khác'];
export function useServiceLines() {
  const [lines, setLines] = useState(DEFAULT_SERVICE_LINES);
  useEffect(() => {
    let alive = true;
    fetch('/api/settings').then(r => r.ok ? r.json() : null).then(s => {
      if (alive && Array.isArray(s?.serviceLines) && s.serviceLines.length) setLines(s.serviceLines);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return lines;
}

/* ---------- v3.38: Avatar thật — ảnh upload của từng người, fallback chữ cái đầu ---------- */
// Dùng thay cho <span className="avatar">{initials(...)}</span> ở những chỗ quan trọng.
// Ảnh lấy từ /api/avatar/<userId>?v=<version>; 404 (chưa upload) → hiện chữ cái đầu như cũ.
// Nạp ảnh bằng fetch (không phải <img src> trần): người chưa có ảnh / ngữ cảnh chưa đăng nhập
// trả 404/401 — fetch nuốt êm trong JS, không xả console.error "Failed to load resource"
// (gate e2e coi mọi console.error là runtime issue). Cache theo phiên để không gọi lặp.
const AVATAR_CACHE = new Map(); // `${userId}:${version}` -> objectURL | null (null = không có ảnh)
export function useAvatarUrl(userId, version = 0) {
  const cacheKey = `${userId}:${version}`;
  const [url, setUrl] = useState(() => (userId ? AVATAR_CACHE.get(cacheKey) ?? undefined : null));
  useEffect(() => {
    if (!userId) { setUrl(null); return; }
    if (AVATAR_CACHE.has(cacheKey)) { setUrl(AVATAR_CACHE.get(cacheKey)); return; }
    let alive = true;
    fetch(`/api/avatar/${userId}?v=${version}`)
      .then(r => (r.status === 200 ? r.blob() : null))
      .then(blob => {
        const value = blob ? URL.createObjectURL(blob) : null;
        AVATAR_CACHE.set(cacheKey, value);
        if (alive) setUrl(value);
      })
      .catch(() => { AVATAR_CACHE.set(cacheKey, null); if (alive) setUrl(null); });
    return () => { alive = false; };
  }, [userId, version, cacheKey]);
  return url; // undefined = đang tải · null = không có ảnh · string = objectURL
}

export function Avatar({ userId, name = '', version = 0, size, className = 'avatar', title, style: styleProp }) {
  const url = useAvatarUrl(userId, version);
  const init = String(name).split(/\s+/).filter(Boolean).slice(-2).map(w => w[0]).join('').toUpperCase() || '?';
  const style = { ...(size ? { width: size, height: size } : {}), ...styleProp };
  if (!url) return <span className={className} style={style} title={title || name}>{init}</span>;
  return (
    <span className={className} style={{ ...style, overflow: 'hidden', padding: 0 }} title={title || name}>
      <img src={url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit', display: 'block' }} />
    </span>
  );
}

/* ---------- Icons (Lucide-style, giữ nguyên từ v1) ---------- */
const RAW = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  leads: '<path d="M3 3v5h5"/><path d="M3 8a9 9 0 1 1-2 5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  clients: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  projects: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  tasks: '<rect x="3" y="5" width="6" height="6" rx="1"/><path d="m3.5 17 2 2 3.5-4"/><line x1="13" y1="8" x2="21" y2="8"/><line x1="13" y1="17" x2="21" y2="17"/>',
  quotes: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>',
  invoices: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/>',
  finance: '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/>',
  staff: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M5.5 18a3.5 3.5 0 0 1 7 0"/><line x1="15" y1="9" x2="19" y2="9"/><line x1="15" y1="13" x2="19" y2="13"/>',
  reports: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 1v4m0 14v4M4.2 4.2l2.8 2.8m10 10 2.8 2.8M1 12h4m14 0h4M4.2 19.8l2.8-2.8m10-10 2.8-2.8"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  tag: '<path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.24H4a2 2 0 0 0-2 2v5.59c0 .53.21 1.04.59 1.41l9.58 9.59a2 2 0 0 0 2.83 0l5.59-5.59a2 2 0 0 0 0-2.83z"/><circle cx="7.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/>',
  edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  print: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  alert: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  wallet: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  menu: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  repeat: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.6 2.81.72A2 2 0 0 1 22 16.92z"/>',
  mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
  meeting: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/>',
  note: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trendUp: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  trendDown: '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>',
  percent: '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  // v3.14: bổ sung cho các chỗ đang dùng emoji làm icon. Cùng bộ Feather (nét 2px, bo tròn)
  // để không lệch phong cách với 36 icon sẵn có.
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  camera: '<path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>',
  screen: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  cake: '<path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16s1-1 2.5-1 2.5 2 5 2 3.5-2 5-2 2.5 1 2.5 1"/><path d="M2 21h20"/><path d="M12 4v3"/><path d="M8 5v2"/><path d="M16 5v2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.3 17.7-1.4 1.4"/><path d="m19.1 4.9-1.4 1.4"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  'chevron-up': '<polyline points="18 15 12 9 6 15"/>',
  'chevron-down': '<polyline points="6 9 12 15 18 9"/>',
};
export function Icon({ name, size = 20 }) {
  const icons = {
    alert: WarningCircle, approval: CheckSquare, arrow: ArrowRight, bell: Bell,
    board: Kanban, bolt: Lightning, brief: Article, cake: Cake, calendar: CalendarBlank,
    camera: VideoCamera, cash: Money, chart: ChartLineUp, chat: ChatCircle,
    check: Check, checklist: ListChecks, chevron: CaretRight,
    'chevron-down': CaretDown, 'chevron-up': CaretUp, clients: UsersThree,
    clock: Clock, close: X, command: Command, dashboard: SquaresFour,
    download: DownloadSimple, edit: PencilSimple, eyeOff: EyeSlash, finance: Bank,
    folder: Folder, home: House, inbox: ChatTeardropText, invoices: Receipt,
    leads: Target, ledger: ClipboardText, link: LinkSimple, lock: Lock, logout: SignOut,
    mail: EnvelopeSimple, map: MapTrifold, meeting: Users, menu: List,
    messages: ChatCircle, mic: Microphone, mobile: DeviceMobile, more: DotsThree,
    note: NotePencil, panel: SidebarSimple, people: UsersThree, person: User,
    percent: Percent, phone: Phone, plus: Plus, print: Printer, projects: FolderOpen,
    quotes: FileText, receipt: Receipt, repeat: ArrowsClockwise, reports: ChartBar,
    screen: Monitor, search: MagnifyingGlass, settings: GearSix, shield: ShieldCheck,
    sort: SortAscending, staff: IdentificationCard, tag: Tag, tasks: CheckSquare,
    timeline: Pulse, trash: Trash, trendDown: TrendDown, trendUp: TrendUp,
    upload: UploadSimple, wallet: Wallet, warning: Warning, x: X,
    columns: Columns, filter: Funnel, save: FloppyDisk, company: Buildings,
    work: Briefcase, restricted: ShieldWarning,
  };
  const Glyph = icons[name] || WarningCircle;
  return <Glyph size={size} weight="regular" aria-hidden="true" focusable="false" />;
}

/* ---------- Badge ---------- */
export function Badge({ map, k }) {
  const [label, cls] = BADGE[map]?.[k] || [k, 'b-gray'];
  const icon = cls === 'b-green' ? 'check' : cls === 'b-red' ? 'warning' : cls === 'b-yellow' ? 'alert' : 'note';
  return <span className={`badge ${cls}`}><Icon name={icon} size={12} />{label}</span>;
}

/* ---------- Toast ---------- */
const ToastCtx = createContext(null);
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const toast = useCallback((msg, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div id="toast-root" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            <Icon name={t.type === 'success' ? 'check' : 'alert'} size={17} /><span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ---------- Nút async dùng chung: khóa double-submit + phản hồi tiến trình ---------- */
export function AsyncButton({ onClick, pendingLabel = 'Đang xử lý…', disabled, children, ...props }) {
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const toast = useToast();

  const run = async e => {
    if (pendingRef.current) return;
    try {
      const result = onClick?.(e);
      if (!result || typeof result.then !== 'function') return result;
      pendingRef.current = true;
      setPending(true);
      return await result;
    } catch {
      toast?.('Không thể hoàn tất thao tác. Vui lòng thử lại.', 'error');
      return false;
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  return (
    <button {...props} onClick={run} disabled={disabled || pending} aria-busy={pending || undefined}>
      {pending ? pendingLabel : children}
    </button>
  );
}

/* ---------- Modal ---------- */
export function Modal({ title, children, footer, large, className = '', onClose }) {
  return (
    <Dialog.Root open onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className={`modal ${large ? 'modal-lg' : ''} ${className}`.trim()} aria-describedby={undefined}>
        <div className="modal-head">
          <Dialog.Title className="modal-title">{title}</Dialog.Title>
          <Dialog.Close asChild>
            <button className="icon-btn" aria-label="Đóng"><Icon name="x" size={16} /></button>
          </Dialog.Close>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ConfirmDialog({ msg, onYes, onClose, yesLabel = 'Xóa', modalClassName = '' }) {
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const toast = useToast();
  const close = () => { if (!submittingRef.current) onClose(); };
  const confirm = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const result = await onYes();
      if (result !== false && result !== null) onClose();
    } catch {
      toast?.('Không thể hoàn tất thao tác. Vui lòng thử lại.', 'error');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };
  return (
    <Modal title="Xác nhận" className={modalClassName} onClose={close}
      footer={<>
        <button className="btn btn-outline" onClick={close} disabled={submitting}>Hủy</button>
        <button className="btn btn-danger" onClick={confirm} disabled={submitting} aria-busy={submitting || undefined}>
          {submitting ? 'Đang xử lý…' : yesLabel}
        </button>
      </>}>
      <p style={{ fontSize: '.9rem' }}>{msg}</p>
    </Modal>
  );
}

/* ---------- Form động (port fieldHTML/formModal từ v1) ---------- */
export function FormModal({ title, fields, data = {}, onSave, onClose, large, extraFooter }) {
  const formRef = useRef(null);
  const fieldPrefix = useId();
  const dirtyRef = useRef(false);
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();
  useEffect(() => {
    const warn = event => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  // v3.20: onSave có thể async và trả về false để GIỮ modal mở (validate thất bại).
  // Trước đây luôn onClose() sau onSave → validate lỗi vẫn đóng modal, người dùng thấy toast
  // lỗi nhưng mất hết dữ liệu vừa nhập. Ảnh hưởng mọi FormModal toàn app.
  const submit = async () => {
    if (submittingRef.current) return;
    const form = formRef.current;
    if (!form.reportValidity()) return;
    const out = {};
    fields.forEach(f => {
      let v = form.elements[f.key]?.value;
      if (f.type === 'number') v = +v || 0;
      if (f.type === 'multiselect') v = [...(form.elements[f.key]?.selectedOptions || [])].map(o => o.value);
      out[f.key] = v;
    });
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const res = await onSave(out);
      if (res !== false && res !== null) { dirtyRef.current = false; onClose(); }
    } catch {
      toast?.('Không thể lưu dữ liệu. Vui lòng thử lại.', 'error');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };
  const close = () => {
    if (submittingRef.current) return;
    if (dirtyRef.current && !window.confirm('Bạn có thay đổi chưa lưu. Bỏ các thay đổi này và đóng?')) return;
    dirtyRef.current = false; onClose();
  };
  return (
    <Modal title={title} onClose={close} large={large}
      footer={<>
        {extraFooter}
        <button className="btn btn-outline" onClick={close} disabled={submitting}>Hủy</button>
        <button className="btn btn-primary" onClick={submit} disabled={submitting} aria-busy={submitting || undefined}>
          {submitting ? 'Đang lưu…' : 'Lưu'}
        </button>
      </>}>
      <form ref={formRef} className="form-grid" aria-busy={submitting || undefined} onChange={() => { dirtyRef.current = true; }} onSubmit={e => { e.preventDefault(); submit(); }}>
        {fields.map(f => {
          const v = data[f.key] ?? f.default ?? '';
          return (
            <div key={f.key} className={`field ${f.full ? 'full' : ''}`}>
              <label htmlFor={`${fieldPrefix}-${f.key}`}>{f.label}{f.required && <span className="req"> *</span>}</label>
              {f.type === 'select' ? (
                <select id={`${fieldPrefix}-${f.key}`} name={f.key} defaultValue={v} required={f.required} disabled={submitting}>
                  {f.options.map(o => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === 'multiselect' ? (
                <select id={`${fieldPrefix}-${f.key}`} name={f.key} disabled={submitting} multiple size={Math.min(5, Math.max(3, f.options.length))}
                  defaultValue={Array.isArray(v) ? v : []}>
                  {f.options.map(o => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === 'textarea' ? (
                <textarea id={`${fieldPrefix}-${f.key}`} name={f.key} defaultValue={v} disabled={submitting} />
              ) : (
                <input id={`${fieldPrefix}-${f.key}`} name={f.key} type={f.type || 'text'} defaultValue={v} required={f.required} disabled={submitting}
                  placeholder={f.placeholder || ''} {...(f.type === 'number' ? { min: 0, step: 'any' } : {})} />
              )}
              {f.hint && <div className="hint">{f.hint}</div>}
            </div>
          );
        })}
      </form>
    </Modal>
  );
}

/* ---------- Hook dữ liệu: gọi API generic có phân quyền ---------- */
/* v3.14: đếm số lượt tải đang bay, để EmptyState biết mà đừng nói dối.
   Vấn đề: rows khởi tạo [] nên lần render ĐẦU của mọi trang đều rơi vào nhánh
   {!rows.length && <EmptyState title="Chưa có hóa đơn"/>} — người dùng đọc "Chưa có hóa đơn"
   trong lúc dữ liệu đang về. Ở máy dev chỉ ~100ms nên không ai để ý, nhưng trên production
   lúc hàm serverless nguội thì đứng 1-2 giây, gây hiểu nhầm là mất dữ liệu.
   Sửa ở đây thay vì sửa 17 trang: mỗi trang đặt tên biến khác nhau (rows/visible/filtered),
   sửa tay từng chỗ vừa dễ sót vừa dễ gãy — mà bảng viết sau này lại quên. */
let inflight = 0;
const inflightSubs = new Set();
const bumpInflight = n => { inflight = Math.max(0, inflight + n); inflightSubs.forEach(f => f(inflight)); };
function useAnyLoading() {
  const [n, setN] = useState(inflight);
  useEffect(() => { inflightSubs.add(setN); setN(inflight); return () => inflightSubs.delete(setN); }, []);
  return n > 0;
}

// v3.13: useResource(name, filter, options) — filter lọc Ở SERVER, VD useResource('timelogs', { taskId }).
// Chỉ các cột có trong danh sách trắng FILTERABLE (lib/registry) mới có tác dụng.
// options.enabled=false giữ nguyên thứ tự hook nhưng không phát request cho phân hệ đang tắt.
export function useResource(name, filter, options = {}) {
  const session = useContext(SessionContext);
  const enabled = options.enabled !== false;
  const clientRef = useRef(null);
  const toast = useToast();
  const toastRef = useRef(toast); toastRef.current = toast;
  const qs = filter
    ? new URLSearchParams(Object.entries(filter).filter(([, v]) => v !== undefined && v !== null && v !== '').sort(([a], [b]) => a.localeCompare(b))).toString()
    : '';
  const url = options.readUrl || `/api/data/${name}${qs ? '?' + qs : ''}`;
  const scopeKey = JSON.stringify([enabled, options.scopeKey ?? '', session?.status, session?.data?.user]);
  const key = JSON.stringify([url, scopeKey]);
  const initial = { rows: [], metadata: null, loading: enabled, mutating: false, forbidden: false, error: '', updatedAt: null };
  const [snapshot, setSnapshot] = useState(() => ({ key, ...initial }));
  useEffect(() => {
    setSnapshot({ key, ...initial });
    if (!enabled) return undefined;
    const client = createResourceClient({ url, decodeRead: options.decodeRead, onInflight: bumpInflight,
      onMessage: message => toastRef.current?.(message, 'error'),
      onState: patch => setSnapshot(previous => previous.key === key ? { ...previous, ...patch } : previous),
    });
    clientRef.current = { key, client };
    void client.refresh();
    return () => { client.dispose(); if (clientRef.current?.client === client) clientRef.current = null; };
  }, [key]);
  const refresh = useCallback(() => clientRef.current?.key === key ? clientRef.current.client.refresh() : Promise.resolve(null), [key]);
  const call = (method, target, body) => clientRef.current?.key === key
    ? clientRef.current.client.call(method, target, body) : Promise.resolve(null);
  // Never expose the previous filter/resource's rows, even in the render before cleanup.
  const state = snapshot.key === key ? snapshot : initial;
  return {
    ...state, scopeKey, refresh,
    create: data => call('POST', `/api/data/${name}`, data),
    update: (id, data) => call('PUT', `/api/data/${name}/${id}`, data),
    remove: id => call('DELETE', `/api/data/${name}/${id}`),
  };
}

export function ResourceError({ error, onRetry, loading = false }) {
  if (!error) return null;
  return <div className="resource-error" role="alert">
    <span>{error}</span>
    <button type="button" className="btn btn-outline btn-sm" onClick={onRetry} disabled={loading}>
      {loading ? 'Đang tải…' : 'Thử tải lại'}
    </button>
  </div>;
}

/* ---------- v3.4: Xuất CSV (BOM UTF-8 để Excel đọc tiếng Việt) ---------- */
export function ExportCsv({ rows, name, cols }) {
  const dl = () => {
    const lines = [cols.map(c => c.label), ...rows.map(r => cols.map(c => {
      const v = typeof c.value === 'function' ? c.value(r) : r[c.key];
      return v == null ? '' : String(v);
    }))];
    const csv = '\ufeff' + lines.map(l => l.map(x => /[",;\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  };
  return (
    <button className="btn btn-outline btn-sm" onClick={dl} disabled={!rows.length} title="Tải bảng này về file CSV (mở bằng Excel)">
      <Icon name="download" size={14} /><span> CSV</span>
    </button>
  );
}

/* ---------- Khối trang bị chặn quyền ---------- */
export function Forbidden() {
  return (
    <div className="empty" style={{ paddingTop: 80 }}>
      <Icon name="shield" size={38} />
      <div className="empty-title">Bạn không có quyền xem trang này</div>
      <p>Liên hệ Giám đốc nếu bạn cần được cấp quyền.</p>
    </div>
  );
}

export function EmptyState({ title, sub }) {
  // v3.14: đang tải thì hiện khung xám, KHÔNG khẳng định "Chưa có dữ liệu" — nói vậy là sai
  // sự thật và làm người dùng tưởng mất dữ liệu (nhất là khi hàm serverless nguội, đứng 1-2s).
  const loading = useAnyLoading();
  if (loading) {
    return (
      <div className="empty" aria-busy="true" aria-live="polite">
        <span className="sr-only">Đang tải dữ liệu…</span>
        <div className="sk sk-line" style={{ width: 180 }}></div>
        <div className="sk sk-line" style={{ width: 260 }}></div>
        <div className="sk sk-line" style={{ width: 210 }}></div>
      </div>
    );
  }
  return (
    <div className="empty">
      <Icon name="alert" size={38} />
      <div className="empty-title">{title}</div>
      <p>{sub || ''}</p>
    </div>
  );
}
