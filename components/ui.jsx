'use client';
// UI kit dùng chung: icon, toast, modal, form động, hook dữ liệu — port từ v1
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { BADGE } from '@/lib/format';

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
};
export function Icon({ name, size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: RAW[name] || RAW.alert }} />
  );
}

/* ---------- Badge ---------- */
export function Badge({ map, k }) {
  const [label, cls] = BADGE[map]?.[k] || [k, 'b-gray'];
  return <span className={`badge ${cls}`}><span className="dot"></span>{label}</span>;
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

/* ---------- Modal ---------- */
export function Modal({ title, children, footer, large, onClose }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${large ? 'modal-lg' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Đóng"><Icon name="x" size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ msg, onYes, onClose, yesLabel = 'Xóa' }) {
  return (
    <Modal title="Xác nhận" onClose={onClose}
      footer={<>
        <button className="btn btn-outline" onClick={onClose}>Hủy</button>
        <button className="btn btn-danger" onClick={() => { onClose(); onYes(); }}>{yesLabel}</button>
      </>}>
      <p style={{ fontSize: '.9rem' }}>{msg}</p>
    </Modal>
  );
}

/* ---------- Form động (port fieldHTML/formModal từ v1) ---------- */
export function FormModal({ title, fields, data = {}, onSave, onClose, large, extraFooter }) {
  const formRef = useRef(null);
  const submit = () => {
    const form = formRef.current;
    if (!form.reportValidity()) return;
    const out = {};
    fields.forEach(f => {
      let v = form.elements[f.key]?.value;
      if (f.type === 'number') v = +v || 0;
      if (f.type === 'multiselect') v = [...(form.elements[f.key]?.selectedOptions || [])].map(o => o.value);
      out[f.key] = v;
    });
    onSave(out);
    onClose();
  };
  return (
    <Modal title={title} onClose={onClose} large={large}
      footer={<>
        {extraFooter}
        <button className="btn btn-outline" onClick={onClose}>Hủy</button>
        <button className="btn btn-primary" onClick={submit}>Lưu</button>
      </>}>
      <form ref={formRef} className="form-grid" onSubmit={e => { e.preventDefault(); submit(); }}>
        {fields.map(f => {
          const v = data[f.key] ?? f.default ?? '';
          return (
            <div key={f.key} className={`field ${f.full ? 'full' : ''}`}>
              <label>{f.label}{f.required && <span className="req"> *</span>}</label>
              {f.type === 'select' ? (
                <select name={f.key} defaultValue={v} required={f.required}>
                  {f.options.map(o => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === 'multiselect' ? (
                <select name={f.key} multiple size={Math.min(5, Math.max(3, f.options.length))}
                  defaultValue={Array.isArray(v) ? v : []}>
                  {f.options.map(o => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === 'textarea' ? (
                <textarea name={f.key} defaultValue={v} />
              ) : (
                <input name={f.key} type={f.type || 'text'} defaultValue={v} required={f.required}
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
export function useResource(name) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const toast = useToast();
  const refresh = useCallback(async () => {
    const res = await fetch(`/api/data/${name}`);
    if (res.status === 403) { setForbidden(true); setLoading(false); return; }
    if (res.ok) setRows(await res.json());
    setLoading(false);
  }, [name]);
  useEffect(() => { refresh(); }, [refresh]);

  const call = async (method, url, body) => {
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { toast(json.error || 'Có lỗi xảy ra', 'error'); return null; }
    await refresh();
    return json;
  };
  return {
    rows, loading, forbidden, refresh,
    create: data => call('POST', `/api/data/${name}`, data),
    update: (id, data) => call('PUT', `/api/data/${name}/${id}`, data),
    remove: id => call('DELETE', `/api/data/${name}/${id}`),
  };
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
  return (
    <div className="empty">
      <Icon name="alert" size={38} />
      <div className="empty-title">{title}</div>
      <p>{sub || ''}</p>
    </div>
  );
}
