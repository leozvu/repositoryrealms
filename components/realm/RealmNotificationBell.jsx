'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, useToast } from '@/components/ui';
import styles from './realm-notification-bell.module.css';

function relativeTime(value) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} phút trước`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} giờ trước`;
  return `${Math.round(minutes / 1440)} ngày trước`;
}

export default function RealmNotificationBell({ dataRevision = 0 }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ rows: [], unread: 0 });
  const [state, setState] = useState('loading');
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications', { cache: 'no-store' });
      if (!response.ok) throw new Error('unavailable');
      const payload = await response.json();
      setData({ rows: Array.isArray(payload.rows) ? payload.rows : [], unread: Number(payload.unread || 0) });
      setState('ready');
    } catch {
      setState('unavailable');
    }
  }, []);

  useEffect(() => { load(); }, [dataRevision, load]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);

  const markRead = async (notification) => {
    if (working) return;
    setWorking(true);
    try {
      const response = await fetch('/api/notifications', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: notification.id }),
      });
      if (!response.ok) throw new Error('Không thể đánh dấu thông báo.');
      setOpen(false);
      await load();
      router.push(String(notification.route || '/messages').startsWith('/') ? notification.route || '/messages' : '/messages');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setWorking(false);
    }
  };

  const markAllRead = async () => {
    if (working) return;
    setWorking(true);
    try {
      const response = await fetch('/api/notifications', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }),
      });
      if (!response.ok) throw new Error('Không thể cập nhật Raven Inbox.');
      await load();
      toast('Đã đánh dấu tất cả Raven là đã đọc.', 'success');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className={styles.root}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Raven Inbox${data.unread ? `, ${data.unread} chưa đọc` : ''}`}
        title="Raven Inbox · thông báo ERP dùng chung"
      >
        <Icon name="bell" size={16} />
        <span>Raven</span>
        {data.unread > 0 && <b>{Math.min(data.unread, 99)}</b>}
      </button>
      {open && (
        <section className={styles.panel} role="dialog" aria-label="Raven Inbox">
          <header><span><strong>Raven Inbox</strong><small>Thông báo ERP dùng chung</small></span>{data.unread > 0 && <button type="button" disabled={working} aria-busy={working || undefined} onClick={markAllRead}>{working ? 'Đang xử lý…' : 'Đọc tất cả'}</button>}</header>
          <div className={styles.list} aria-live="polite">
            {state === 'loading' && <p className={styles.empty}>Đang gọi đàn quạ…</p>}
            {state === 'unavailable' && <p className={styles.empty}>Raven Inbox tạm mất kết nối. Hệ thống sẽ tự thử lại.</p>}
            {state === 'ready' && data.rows.slice(0, 12).map((notification) => (
              <button type="button" key={notification.id} className={styles.item} disabled={working} data-unread={!notification.readAt || undefined} onClick={() => markRead(notification)}>
                <i />
                <span><strong>{notification.text}</strong><small>{relativeTime(notification.createdAt)}</small></span>
              </button>
            ))}
            {state === 'ready' && !data.rows.length && <p className={styles.empty}>Chưa có thư mới. Thông báo từ ERP và Realm sẽ cùng xuất hiện tại đây.</p>}
          </div>
        </section>
      )}
    </div>
  );
}
