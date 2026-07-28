'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { AsyncButton, Forbidden, Icon, useToast } from '@/components/ui';
import { useLanguage } from '@/components/LanguageProvider';
import { rolesOf } from '@/lib/perm';
import { initials } from '@/lib/format';
import styles from './inbox.module.css';

const COPY = {
  vi: {
    eyebrow: 'CEO-6 · UNIFIED INBOX', title: 'Hộp thư liên công ty', intro: 'Một nơi để nhắn tới AIm, Egoric, Vnecom và Egolive. Nhân sự nhận bằng Tin nhắn ERP và notification Realm hiện có.',
    back: 'Về tổng quan CEO', sync: 'Đồng bộ danh bạ', syncing: 'Đang đồng bộ…', export: 'Xuất dữ liệu', policy: 'Tin nhắn được mã hóa tại Portal; entity đích vẫn sở hữu bản ghi chat, receipt và audit của mình.',
    newChat: 'Cuộc trò chuyện mới', company: 'Công ty', recipient: 'Người nhận', type: 'Loại hội thoại', dm: 'Nhắn riêng', channel: 'Kênh công ty', create: 'Bắt đầu trò chuyện', creating: 'Đang tạo…',
    conversations: 'Hội thoại', emptyConversations: 'Chưa có hội thoại. Đồng bộ danh bạ rồi bắt đầu một cuộc trao đổi.', select: 'Chọn một hội thoại', selectHint: 'Tin nhắn của từng entity vẫn hiện trong ERP/Realm của họ.',
    noDirectory: 'Chưa có hồ sơ được chia sẻ. Nhân sự có thể bật chia sẻ trong mục Tin nhắn của entity.', message: 'Nội dung', send: 'Gửi tin nhắn', sending: 'Đang gửi…', refresh: 'Nhận phản hồi', refreshing: 'Đang kiểm tra…',
    delivered: 'Đã giao', read: 'Đã đọc', pending_confirmation: 'Chờ xác nhận', failed: 'Chưa gửi được', dispatching: 'Đang gửi', inbound: 'Phản hồi từ entity', outbound: 'Bạn', reconcile: 'Đối soát', reconciling: 'Đang đối soát…',
    loadError: 'Không thể tải Unified Inbox.', sendError: 'Không thể gửi tin nhắn.', stepup: 'Cần CEO session và TOTP step-up để gửi hoặc xuất dữ liệu.', identity: 'Mở Identity & Registry', retry: 'Thử lại', synced: 'Đã cập nhật danh bạ chia sẻ.', sent: 'Entity đích đã nhận tin nhắn.', pending: 'Chưa có receipt; không gửi lại, hãy đối soát.',
  },
  en: {
    eyebrow: 'CEO-6 · UNIFIED INBOX', title: 'Cross-company inbox', intro: 'Message AIm, Egoric, Vnecom, and Egolive from one place. Staff receive it through their existing ERP Messages and Realm notifications.',
    back: 'Back to CEO overview', sync: 'Sync directory', syncing: 'Syncing…', export: 'Export data', policy: 'Messages are encrypted in the Portal; each target entity still owns its local chat record, receipt, and audit.',
    newChat: 'New conversation', company: 'Company', recipient: 'Recipient', type: 'Conversation type', dm: 'Direct message', channel: 'Company channel', create: 'Start conversation', creating: 'Creating…',
    conversations: 'Conversations', emptyConversations: 'No conversations yet. Sync the shared directory, then start one.', select: 'Select a conversation', selectHint: 'Each entity still receives messages in its own ERP and Realm.',
    noDirectory: 'No profiles are shared yet. Staff can opt in from Messages in their entity.', message: 'Message', send: 'Send message', sending: 'Sending…', refresh: 'Fetch replies', refreshing: 'Checking…',
    delivered: 'Delivered', read: 'Read', pending_confirmation: 'Awaiting receipt', failed: 'Not sent', dispatching: 'Sending', inbound: 'Entity reply', outbound: 'You', reconcile: 'Reconcile', reconciling: 'Reconciling…',
    loadError: 'Unified Inbox could not be loaded.', sendError: 'Message could not be sent.', stepup: 'An active CEO session and recent TOTP step-up are required to send or export.', identity: 'Open Identity & Registry', retry: 'Retry', synced: 'Shared directory updated.', sent: 'The target entity received the message.', pending: 'No receipt yet; do not resend. Reconcile first.',
  },
};

const newKeys = () => {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return { idempotencyKey: `ceo-message:${id}`, correlationId: `ceo-message-correlation:${id}` };
};

const dateTime = (value, locale) => value ? new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';

export default function CeoInboxPage() {
  const { data: session, status: sessionStatus } = useSession();
  const { locale } = useLanguage();
  const c = COPY[locale] || COPY.vi;
  const toast = useToast();
  const formRef = useRef(null);
  const [identity, setIdentity] = useState(null);
  const [directory, setDirectory] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [thread, setThread] = useState(null);
  const [entityId, setEntityId] = useState('');
  const [type, setType] = useState('dm');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const responses = await Promise.all([
      fetch('/api/ceo/v1/identity/session', { cache: 'no-store' }).catch(() => null),
      fetch('/api/ceo/v1/messaging/directory', { cache: 'no-store' }).catch(() => null),
      fetch('/api/ceo/v1/messaging/conversations', { cache: 'no-store' }).catch(() => null),
    ]);
    if (responses.some((response) => response?.status === 403)) { setForbidden(true); setLoading(false); return; }
    const [identityBody, directoryBody, conversationBody] = await Promise.all(responses.map((response) => response?.json().catch(() => ({})) || {}));
    if (responses[0]?.ok) setIdentity(identityBody);
    if (responses[1]?.ok) setDirectory(directoryBody.profiles || []);
    if (responses[2]?.ok) setConversations(conversationBody.conversations || []);
    if (!responses[1]?.ok || !responses[2]?.ok) setError(directoryBody.error || conversationBody.error || c.loadError);
    setLoading(false);
  }, [c.loadError]);

  const loadThread = useCallback(async (id) => {
    const response = await fetch(`/api/ceo/v1/messaging/conversations/${encodeURIComponent(id)}`, { cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error || c.loadError); return; }
    setThread(body.conversation);
  }, [c.loadError]);

  useEffect(() => { if (sessionStatus === 'authenticated') load(); }, [load, sessionStatus]);
  // Đợt 1: tự đồng bộ danh bạ lần đầu khi trống (bỏ 1 bước bấm tay) — chỉ thử 1 lần/phiên
  const autoSynced = useRef(false);
  useEffect(() => {
    if (loading || autoSynced.current || directory.length > 0 || !identity?.active) return;
    autoSynced.current = true;
    sync().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, directory.length, identity?.active]);
  // Đợt 1: polling hội thoại đang mở mỗi 20s — reply từ công ty tự hiện, khỏi bấm "Nhận phản hồi"
  useEffect(() => {
    if (!selectedId) return;
    const timer = setInterval(() => { loadThread(selectedId); }, 20_000);
    return () => clearInterval(timer);
  }, [selectedId, loadThread]);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('entity')?.trim().toLowerCase() || '';
    if (requested && directory.some((profile) => profile.targetEntityId === requested)) setEntityId((current) => current || requested);
  }, [directory]);
  useEffect(() => { if (selectedId) loadThread(selectedId); else setThread(null); }, [selectedId, loadThread]);

  const companies = useMemo(() => [...new Map(directory.map((profile) => [profile.targetEntityId, { id: profile.targetEntityId, name: profile.targetDisplayName }])).values()], [directory]);
  const recipients = directory.filter((profile) => profile.targetEntityId === entityId);
  const ready = identity?.active && identity?.stepUp;

  const sync = async () => {
    const response = await fetch('/api/ceo/v1/messaging/directory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { toast(body.error || c.loadError, 'error'); return false; }
    setDirectory(body.profiles || []); toast(c.synced); return true;
  };

  const create = async (event) => {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
    const data = new FormData(formRef.current);
    const recipient = recipients.find((profile) => profile.remoteUserId === data.get('remoteUserId'));
    const company = companies.find((item) => item.id === entityId);
    const body = { targetEntityId: entityId, type, remoteUserId: type === 'dm' ? data.get('remoteUserId') : null, name: type === 'dm' ? recipient?.displayName : `${c.channel} · ${company?.name || entityId}` };
    const response = await fetch('/api/ceo/v1/messaging/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { toast(payload.error || c.loadError, 'error'); return false; }
    setConversations((current) => [payload.conversation, ...current.filter((item) => item.id !== payload.conversation.id)]); setSelectedId(payload.conversation.id); return true;
    } finally { setCreating(false); }
  };

  const send = async (event) => {
    event.preventDefault(); if (!content.trim() || !thread || sending) return;
    setSending(true);
    try {
      const response = await fetch(`/api/ceo/v1/messaging/conversations/${encodeURIComponent(thread.id)}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: content.trim(), ...newKeys() }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { toast(body.error || c.sendError, 'error'); return; }
      setContent(''); await loadThread(thread.id); await load();
      toast(['delivered', 'read'].includes(body.message.status) ? c.sent : c.pending, ['delivered', 'read'].includes(body.message.status) ? 'success' : 'error');
    } finally { setSending(false); }
  };

  const refresh = async () => {
    const response = await fetch(`/api/ceo/v1/messaging/conversations/${encodeURIComponent(thread.id)}/refresh`, { method: 'POST' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { toast(body.error || c.loadError, 'error'); return false; }
    setThread(body.conversation); await load(); return true;
  };

  const reconcile = async (message) => {
    const response = await fetch(`/api/ceo/v1/messaging/messages/${encodeURIComponent(message.id)}/reconcile`, { method: 'POST' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { toast(body.error || c.sendError, 'error'); return false; }
    await loadThread(thread.id); return true;
  };

  if (sessionStatus === 'loading') return <div className={styles.loading}>{c.loadError}</div>;
  if (!rolesOf(session?.user).includes('DIRECTOR') || forbidden) return <Forbidden />;

  return <main className={styles.page} data-no-i18n>
    <header className={styles.hero}>
      <div><p className={styles.eyebrow}>{c.eyebrow}</p><h1>{c.title}</h1><p>{c.intro}</p></div>
      <div className={styles.heroActions}><Link className="btn btn-outline" href="/ceo-overview"><Icon name="dashboard" size={17} />{c.back}</Link><AsyncButton className="btn btn-outline" pendingLabel={c.syncing} onClick={sync}><Icon name="repeat" size={16} />{c.sync}</AsyncButton><a className="btn btn-outline" href="/api/ceo/v1/messaging/export" download><Icon name="upload" size={16} />{c.export}</a></div>
    </header>
    <section className={styles.policy} role="note"><Icon name="shield" size={21} /><p>{c.policy}</p></section>
    {!ready && <section className={styles.notice} role="status"><Icon name="alert" size={19} /><span>{c.stepup}</span><Link className="btn btn-outline" href="/ceo-registry">{c.identity}</Link></section>}
    {error && <div className={styles.error} role="alert"><span>{error}</span><button type="button" className="btn btn-outline" onClick={load}>{c.retry}</button></div>}

    <section className={styles.layout} aria-busy={loading || undefined}>
      <aside className={styles.sidebar}>
        <form ref={formRef} className={styles.composer} onSubmit={create} aria-busy={creating || undefined}>
          <h2>{c.newChat}</h2>
          <div className="field"><label htmlFor="inbox-company">{c.company}</label><select id="inbox-company" required value={entityId} onChange={(event) => setEntityId(event.target.value)}><option value="">—</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></div>
          <div className="field"><label htmlFor="inbox-type">{c.type}</label><select id="inbox-type" value={type} onChange={(event) => setType(event.target.value)}><option value="dm">{c.dm}</option><option value="entity_channel">{c.channel}</option></select></div>
          {type === 'dm' && <div className="field"><label htmlFor="inbox-recipient">{c.recipient}</label><select id="inbox-recipient" name="remoteUserId" required><option value="">—</option>{recipients.map((profile) => <option key={profile.id} value={profile.remoteUserId}>{profile.displayName} · {profile.title || profile.email}</option>)}</select></div>}
          <button type="submit" className="btn btn-primary" disabled={!ready || creating || !entityId || (type === 'dm' && !recipients.length)}>{creating ? c.creating : c.create}</button>
          {!directory.length && <p className={styles.helper}>{c.noDirectory}</p>}
        </form>
        <div className={styles.listHead}><h2>{c.conversations}</h2><span>{conversations.length}</span></div>
        <div className={styles.conversationList}>{conversations.map((conversation) => <button type="button" key={conversation.id} className={`${styles.conversation} ${selectedId === conversation.id ? styles.active : ''}`} onClick={() => setSelectedId(conversation.id)} aria-pressed={selectedId === conversation.id}>
          <span className={styles.avatar}>{conversation.type === 'dm' ? initials(conversation.name) : <Icon name="staff" size={18} />}</span><span><strong>{conversation.name}</strong><small>{conversation.targetDisplayName}</small><em>{conversation.lastMessage?.content || c.selectHint}</em></span>{conversation.lastMessage?.status === 'pending_confirmation' && <i aria-label={c.pending_confirmation}>!</i>}
        </button>)}</div>
        {!loading && !conversations.length && <p className={styles.emptyList}>{c.emptyConversations}</p>}
      </aside>

      <article className={styles.thread}>
        {!thread ? <div className={styles.empty}><Icon name="mail" size={38} /><h2>{c.select}</h2><p>{c.selectHint}</p></div> : <>
          <header className={styles.threadHead}><div><h2>{thread.name}</h2><p>{thread.targetDisplayName} · {thread.type === 'dm' ? c.dm : c.channel}</p></div><AsyncButton className="btn btn-outline" pendingLabel={c.refreshing} onClick={refresh}><Icon name="repeat" size={16} />{c.refresh}</AsyncButton></header>
          <div className={styles.messages} aria-live="polite">{thread.messages.map((message) => <div key={message.id} className={`${styles.message} ${message.direction === 'outbound' ? styles.mine : ''}`}>
            <div className={styles.messageMeta}><strong>{message.direction === 'outbound' ? c.outbound : message.senderName}</strong><time>{dateTime(message.sentAt, locale)}</time></div>
            <p>{message.content || '—'}</p><div className={styles.delivery}><span className={styles[message.status] || ''}>{c[message.status] || message.status}</span>{message.lastErrorCode && <code>{message.lastErrorCode}</code>}{message.direction === 'outbound' && ['pending_confirmation', 'dispatching'].includes(message.status) && <AsyncButton className="btn btn-outline btn-sm" pendingLabel={c.reconciling} onClick={() => reconcile(message)}>{c.reconcile}</AsyncButton>}</div>
          </div>)}</div>
          <form className={styles.send} onSubmit={send} aria-busy={sending || undefined}><label htmlFor="ceo-inbox-message">{c.message}</label><textarea id="ceo-inbox-message" value={content} onChange={(event) => setContent(event.target.value)} maxLength={4000} required placeholder={`@email · ${c.message}`} /><button className="btn btn-primary" disabled={!ready || sending || !content.trim()}><Icon name="mail" size={16} />{sending ? c.sending : c.send}</button></form>
        </>}
      </article>
    </section>
  </main>;
}
