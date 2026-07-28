'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Modal, useToast } from '@/components/ui';
import { persistWorkspaceSurface } from '@/lib/collaboration';
import styles from './realm-feedback-launcher.module.css';

const TYPES = [
  { value: 'bug', label: 'Lỗi kỹ thuật', detail: 'Một tính năng không chạy như mong đợi.' },
  { value: 'friction', label: 'Khó sử dụng', detail: 'Luồng làm việc gây vướng hoặc khó hiểu.' },
  { value: 'idea', label: 'Ý tưởng', detail: 'Đề xuất cải thiện trải nghiệm.' },
  { value: 'support', label: 'Cần hỗ trợ', detail: 'Cần người hướng dẫn hoặc xử lý.' },
];

const IMPACTS = [
  { value: 'blocked', label: 'Bị chặn hoàn toàn' },
  { value: 'degraded', label: 'Vẫn làm được nhưng khó khăn' },
  { value: 'minor', label: 'Ảnh hưởng nhỏ' },
];

const STATUS_LABELS = {
  open: 'Đã tiếp nhận', in_progress: 'Đang xử lý', waiting: 'Đang chờ', resolved: 'Đã xử lý', closed: 'Đã đóng',
};

const EMPTY_FORM = { category: 'friction', impact: 'degraded', summary: '', details: '', area: '' };

function requestKey() {
  const token = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `realm-feedback:${token}`;
}

export default function RealmFeedbackLauncher() {
  const pathname = usePathname();
  const toast = useToast();
  const firstFieldRef = useRef(null);
  const requestKeyRef = useRef(null);
  const submittingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(null);
  const [recent, setRecent] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const surface = pathname === '/realm' || pathname.startsWith('/realm/') ? 'realm' : 'erp';
  const dirty = Boolean(form.summary.trim() || form.details.trim());
  const routeArea = useMemo(() => surface === 'realm' ? 'Realm workspace' : `ERP · ${pathname.split('/').filter(Boolean)[0] || 'dashboard'}`, [pathname, surface]);

  const openFeedback = () => {
    setOpen(true);
    const payload = new Blob([JSON.stringify({ event: 'feedback_opened', surface })], { type: 'application/json' });
    globalThis.navigator?.sendBeacon?.('/api/realm-demo/experience', payload);
  };

  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch('/api/realm-demo/feedback?scope=mine', { cache: 'no-store' })
      .then(async (response) => response.ok ? response.json() : null)
      .then((payload) => { if (alive && payload) setRecent((payload.rows || []).slice(0, 3)); })
      .catch(() => {});
    const timer = setTimeout(() => firstFieldRef.current?.focus(), 80);
    return () => { alive = false; clearTimeout(timer); };
  }, [open]);

  const close = () => {
    if (submittingRef.current) return;
    if (!submitted && dirty && !window.confirm('Đóng phản hồi và bỏ nội dung đang nhập?')) return;
    requestKeyRef.current = null;
    setOpen(false);
    setError('');
    setSubmitted(null);
    setForm(EMPTY_FORM);
  };

  const submit = async () => {
    if (submittingRef.current) return false;
    setError('');
    if (form.summary.trim().length < 5) {
      setError('Mô tả ngắn cần ít nhất 5 ký tự.');
      firstFieldRef.current?.focus();
      return false;
    }
    if (form.details.trim().length < 10) {
      setError('Hãy thêm ít nhất 10 ký tự chi tiết để đội xử lý có thể tái hiện.');
      return false;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      requestKeyRef.current ||= requestKey();
      const response = await fetch('/api/realm-demo/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestKeyRef.current },
        body: JSON.stringify({
          ...form,
          surface,
          route: pathname,
          area: form.area.trim() || routeArea,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || 'Không thể gửi phản hồi. Hãy thử lại.');
        return false;
      }
      requestKeyRef.current = null;
      setSubmitted(payload.feedback);
      setRecent((rows) => [payload.feedback, ...rows.filter((row) => row.id !== payload.feedback.id)].slice(0, 3));
      toast(`Đã gửi ${payload.feedback.code}. Đội pilot sẽ cập nhật trạng thái trong ERP.`);
      return true;
    } catch {
      setError('Mất kết nối khi gửi phản hồi. Hãy kiểm tra mạng và thử lại.');
      return false;
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={styles.launcher}
        data-surface={surface}
        onClick={openFeedback}
        aria-label="Gửi phản hồi về Realm pilot"
      >
        <Icon name="note" size={17} />
        <span>Phản hồi pilot</span>
      </button>

      {open && (
        <Modal title="Guild Support · Phản hồi pilot" onClose={close}>
          {submitted ? (
            <div className={styles.success} aria-live="polite">
              <span className={styles.successIcon}><Icon name="check" size={24} /></span>
              <div>
                <strong>{submitted.code} đã được tiếp nhận</strong>
                <p>Phản hồi đã trở thành Ticket ERP. Bạn sẽ nhận thông báo khi trạng thái thay đổi.</p>
              </div>
              <div className={styles.successActions}>
                <button type="button" className="btn btn-outline" onClick={close}>Tiếp tục làm việc</button>
                {surface === 'realm' && (
                  <Link className="btn btn-primary" href="/dashboard" onClick={() => persistWorkspaceSurface('erp')}>Về ERP an toàn</Link>
                )}
              </div>
            </div>
          ) : (
            <form className={styles.form} aria-busy={submitting || undefined} onSubmit={(event) => { event.preventDefault(); submit(); }}>
              <p className={styles.intro}>Cho đội pilot biết điều gì đang cản trở công việc. Không cần rời Realm và không tạo một hệ thống dữ liệu thứ hai.</p>

              <fieldset>
                <legend>Loại phản hồi</legend>
                <div className={styles.typeGrid}>
                  {TYPES.map((type) => (
                    <label key={type.value} className={form.category === type.value ? styles.selected : ''}>
                      <input type="radio" name="feedback-category" value={type.value} checked={form.category === type.value} onChange={() => setForm((current) => ({ ...current, category: type.value }))} />
                      <span><strong>{type.label}</strong><small>{type.detail}</small></span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className={styles.field}>
                <label htmlFor="realm-feedback-impact">Mức ảnh hưởng</label>
                <select id="realm-feedback-impact" value={form.impact} onChange={(event) => setForm((current) => ({ ...current, impact: event.target.value }))}>
                  {IMPACTS.map((impact) => <option key={impact.value} value={impact.value}>{impact.label}</option>)}
                </select>
              </div>

              <div className={styles.field}>
                <label htmlFor="realm-feedback-summary">Mô tả ngắn <span aria-hidden="true">*</span></label>
                <input ref={firstFieldRef} id="realm-feedback-summary" maxLength={120} required value={form.summary} onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))} />
                <small>{form.summary.length}/120 ký tự</small>
              </div>

              <div className={styles.field}>
                <label htmlFor="realm-feedback-details">Điều gì đã xảy ra và bạn mong đợi gì? <span aria-hidden="true">*</span></label>
                <textarea id="realm-feedback-details" rows={5} maxLength={2000} required value={form.details} onChange={(event) => setForm((current) => ({ ...current, details: event.target.value }))} />
                <small>Không dán mật khẩu, dữ liệu khách hàng hoặc nội dung nhạy cảm.</small>
              </div>

              <div className={styles.field}>
                <label htmlFor="realm-feedback-area">Khu vực hoặc chức năng</label>
                <input id="realm-feedback-area" maxLength={64} value={form.area} placeholder={routeArea} onChange={(event) => setForm((current) => ({ ...current, area: event.target.value }))} />
              </div>

              <div className={styles.contextBox}>
                <Icon name="shield" size={16} />
                <span>Chỉ đính kèm: <b>{surface === 'realm' ? 'Realm' : 'ERP'}</b>, route <code>{pathname}</code> và khu vực bạn nhập. Không ghi phím bấm, lịch sử duyệt, nội dung record hay thời lượng làm việc.</span>
              </div>
              {error && <p className={styles.error} role="alert">{error}</p>}
              <div className={styles.actions}>
                <button type="button" className="btn btn-outline" onClick={close} disabled={submitting}>Hủy</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Đang gửi…' : 'Gửi vào Guild Support'}</button>
              </div>
            </form>
          )}

          {!submitted && recent.length > 0 && (
            <section className={styles.recent} aria-labelledby="realm-feedback-recent-title">
              <strong id="realm-feedback-recent-title">Phản hồi gần đây của bạn</strong>
              {recent.map((row) => (
                <Link key={row.id} href={`/tickets?focus=${encodeURIComponent(row.id)}&from=realm-feedback`} onClick={() => setOpen(false)}>
                  <span>{row.code}</span><b>{row.summary}</b><small>{STATUS_LABELS[row.status] || row.status}</small>
                </Link>
              ))}
            </section>
          )}
        </Modal>
      )}
    </>
  );
}
