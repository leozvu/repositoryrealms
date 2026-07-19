'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Icon, useToast } from '@/components/ui';
import {
  COLLABORATION_AVAILABILITY_EVENT,
  collaborationContactLabel,
  persistWorkspaceSurface,
  preferredCollaborationAvailability,
  rememberWorkspaceSurface,
} from '@/lib/collaboration';
import styles from './collaboration-bridge.module.css';
import { REALM_CHANGE_BROWSER_EVENT } from '@/components/realm/useRealmChangeFeed';

const SESSION_STORAGE_KEY = 'crmegoric-collaboration-session-v1';

function browserSessionId() {
  const stored = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (stored) return stored;
  const suffix = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const sessionId = `collab_${suffix}`;
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  return sessionId;
}

async function contactAction(id, action) {
  const response = await fetch('/api/collaboration/contact', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, action }),
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Không thể phản hồi lời mời.');
  return payload.contact;
}

export function WorkspaceSurfaceSwitch({ realm = false, pilot = null }) {
  const href = realm ? '/dashboard' : '/realm';
  const surface = realm ? 'erp' : 'realm';
  const unavailable = !realm && pilot && !pilot.allowed;
  const label = realm ? 'ERP · CRM' : 'Realm';
  if (unavailable) {
    return (
      <span
        className={`btn btn-outline btn-sm ${styles.unavailableSwitch}`}
        role="status"
        aria-disabled="true"
        title={pilot.reason}
        aria-label={`Realm chưa khả dụng: ${pilot.reason}`}
      >
        <Icon name="shield" size={15} />
        <span>Realm chưa mở</span>
      </span>
    );
  }

  const rememberPreference = () => {
    rememberWorkspaceSurface(surface);
  };
  return (
    <Link
      className={realm ? styles.realmToErp : 'btn btn-outline btn-sm'}
      href={href}
      onClick={rememberPreference}
      aria-label={realm ? 'Chuyển sang giao diện ERP CRM' : 'Chuyển sang văn phòng Realm'}
    >
      <Icon name={realm ? 'reports' : 'shield'} size={15} />
      <span>{label}</span>
    </Link>
  );
}

export default function CollaborationBridge() {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [incoming, setIncoming] = useState([]);
  const [workingId, setWorkingId] = useState(null);
  const dismissedRef = useRef(new Set());
  const announcedRef = useRef(new Set());
  const surface = pathname === '/realm' || pathname.startsWith('/realm/') ? 'realm' : 'erp';

  const heartbeat = useCallback(async () => {
    const saved = preferredCollaborationAvailability();
    const availability = document.hidden && !['dnd', 'busy', 'focus'].includes(saved) ? 'away' : saved;
    await fetch('/api/collaboration/presence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: browserSessionId(),
        surface,
        availability,
        capabilities: surface === 'realm' ? ['chat', 'voice', 'video'] : ['chat'],
      }),
      cache: 'no-store',
    }).catch(() => null);
  }, [surface]);

  const loadContacts = useCallback(async () => {
    const response = await fetch('/api/collaboration/contact', { cache: 'no-store' }).catch(() => null);
    if (!response?.ok) return;
    const payload = await response.json().catch(() => ({}));
    setIncoming((payload.incoming || []).filter((item) => !dismissedRef.current.has(item.id)));
    for (const item of payload.outgoing || []) {
      if (!['accepted', 'declined'].includes(item.status) || announcedRef.current.has(`${item.id}:${item.status}`)) continue;
      announcedRef.current.add(`${item.id}:${item.status}`);
      toast(
        item.status === 'accepted'
          ? `${item.target.name} đã mở cuộc trò chuyện của bạn.`
          : `${item.target.name} đã từ chối lời mời.`,
        item.status === 'accepted' ? 'success' : 'error',
      );
    }
  }, [toast]);

  useEffect(() => {
    persistWorkspaceSurface(surface);
    heartbeat();
    loadContacts();
    const heartbeatTimer = window.setInterval(heartbeat, 25_000);
    const contactTimer = window.setInterval(loadContacts, 5_000);
    const refresh = () => { if (!document.hidden) { heartbeat(); loadContacts(); } };
    const availability = () => heartbeat();
    const realmChanges = (event) => {
      if ((event.detail?.domains || []).includes('collaboration')) loadContacts();
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener(COLLABORATION_AVAILABILITY_EVENT, availability);
    window.addEventListener(REALM_CHANGE_BROWSER_EVENT, realmChanges);
    return () => {
      window.clearInterval(heartbeatTimer);
      window.clearInterval(contactTimer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener(COLLABORATION_AVAILABILITY_EVENT, availability);
      window.removeEventListener(REALM_CHANGE_BROWSER_EVENT, realmChanges);
    };
  }, [heartbeat, loadContacts, surface]);

  useEffect(() => {
    const leave = () => {
      const sessionId = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (!sessionId) return;
      fetch('/api/collaboration/presence', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
        keepalive: true,
      }).catch(() => null);
    };
    window.addEventListener('pagehide', leave);
    return () => window.removeEventListener('pagehide', leave);
  }, []);

  const current = incoming[0];
  if (!current) return null;

  const respond = async (action) => {
    setWorkingId(current.id);
    try {
      const contact = await contactAction(current.id, action);
      dismissedRef.current.add(current.id);
      setIncoming((items) => items.filter((item) => item.id !== current.id));
      if (action === 'accept') {
        toast(`Đang mở Lantern Mail với ${current.requester.name}.`);
        router.push(contact.route || '/messages');
      } else {
        toast('Đã từ chối lời mời.', 'error');
      }
    } catch (error) {
      toast(error.message, 'error');
      await loadContacts();
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <section
      className={styles.contactBanner}
      data-surface={surface}
      role="region"
      aria-live="polite"
      aria-labelledby="collaboration-contact-title"
    >
      <span className={styles.contactIcon}><Icon name="meeting" size={21} /></span>
      <div className={styles.contactCopy}>
        <strong id="collaboration-contact-title">{current.requester.name} {collaborationContactLabel(current.kind)}</strong>
        <p>{current.message || `Họ đang ở ${current.sourceSurface === 'realm' ? 'Realm' : 'ERP'} và muốn trao đổi với bạn.`}</p>
        <small>Nguồn: {current.sourceSurface === 'realm' ? 'Văn phòng Realm' : 'ERP · CRM'} · lời mời tự hết hạn sau 5 phút</small>
      </div>
      <div className={styles.contactActions}>
        <button type="button" className={styles.declineButton} disabled={workingId === current.id} onClick={() => respond('decline')}>Từ chối</button>
        <button type="button" className={styles.acceptButton} disabled={workingId === current.id} aria-busy={workingId === current.id || undefined} onClick={() => respond('accept')}>
          {workingId === current.id ? 'Đang mở…' : 'Mở chat'}
        </button>
      </div>
    </section>
  );
}
