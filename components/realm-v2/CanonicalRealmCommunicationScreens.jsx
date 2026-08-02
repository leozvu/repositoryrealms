'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useToast } from '@/components/ui';
import {
  preferredCollaborationAvailability,
  rememberCollaborationAvailability,
} from '@/lib/collaboration';
import Icon from './Icon';
import { Badge, Banner, Button, Field, Panel, Segmented, SourcePill, StateView, Status } from './Primitives';
import { MetricCard } from './WorkObjects';
import styles from './realm-v2.module.css';

const INBOX_FILTERS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'unread', label: 'Chưa đọc' },
  { value: 'direct', label: 'Trực tiếp' },
  { value: 'team', label: 'Nhóm' },
  { value: 'system', label: 'Hệ thống' },
];

const AVAILABILITY = [
  { value: 'available', label: 'Sẵn sàng' },
  { value: 'focus', label: 'Tập trung' },
  { value: 'busy', label: 'Đang bận' },
  { value: 'dnd', label: 'Không làm phiền' },
  { value: 'away', label: 'Vắng mặt' },
];

function initials(name) {
  return String(name || 'U').split(/\s+/).filter(Boolean).map((part) => part[0]).slice(-2).join('').toUpperCase();
}

function dateLabel(value) {
  if (!value) return 'Chưa có hoạt động';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(date)
    : new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
}

function availabilityLabel(value, online = true) {
  if (!online) return 'Ngoại tuyến';
  return AVAILABILITY.find((item) => item.value === value)?.label || 'Sẵn sàng';
}

async function jsonResponse(response, fallback) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || fallback);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function useInboxSources() {
  const [state, setState] = useState({ loading: true, conversations: [], directory: [], notifications: [], chatError: null, notificationError: null });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true }));
    const [chatResult, notificationResult] = await Promise.allSettled([
      fetch('/api/chat', { cache: 'no-store' }).then((response) => jsonResponse(response, 'Không thể tải hội thoại ERP.')),
      fetch('/api/notifications', { cache: 'no-store' }).then((response) => jsonResponse(response, 'Không thể tải thông báo ERP.')),
    ]);
    setState((current) => ({
      loading: false,
      conversations: chatResult.status === 'fulfilled' ? chatResult.value.conversations || [] : current.conversations,
      directory: chatResult.status === 'fulfilled' ? chatResult.value.directory || [] : current.directory,
      notifications: notificationResult.status === 'fulfilled' ? notificationResult.value.rows || [] : current.notifications,
      chatError: chatResult.status === 'rejected' ? chatResult.reason : null,
      notificationError: notificationResult.status === 'rejected' ? notificationResult.reason : null,
    }));
  }, []);
  useEffect(() => { load(); }, [load]);
  return {
    ...state,
    reload: load,
    setNotifications: (update) => setState((current) => ({ ...current, notifications: typeof update === 'function' ? update(current.notifications) : update })),
  };
}

function inboxItems(conversations, notifications) {
  const conversationItems = conversations.map((conversation) => ({
    key: `conversation:${conversation.id}`,
    id: conversation.id,
    kind: 'conversation',
    category: conversation.type === 'dm' ? 'direct' : 'team',
    title: conversation.name || 'Hội thoại ERP',
    preview: conversation.lastMsg ? `${conversation.lastMsg.senderName}: ${conversation.lastMsg.content}` : 'Chưa có tin nhắn',
    sender: conversation.lastMsg?.senderName || `${conversation.memberCount || 0} thành viên`,
    time: conversation.lastMsg?.at || null,
    unread: Number(conversation.unread || 0),
    source: 'ERP Conversation',
    raw: conversation,
  }));
  const notificationItems = notifications.map((notification) => ({
    key: `notification:${notification.id}`,
    id: notification.id,
    kind: 'notification',
    category: 'system',
    title: notification.kindLabel || 'Realm Dispatch',
    preview: notification.text,
    sender: notification.targetLabel || 'ERP · CRM',
    time: notification.createdAt,
    unread: notification.readAt ? 0 : 1,
    source: notification.kind === 'approval' ? 'ERP Approval' : 'ERP Notification',
    raw: notification,
  }));
  return [...conversationItems, ...notificationItems].sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
}

function InboxRow({ item, selected, onSelect }) {
  return <button type="button" className={styles.inboxRow} data-selected={selected || undefined} aria-pressed={selected} onClick={() => onSelect(item)}>
    <span className={styles.inboxAvatar}><Icon name={item.kind === 'notification' ? 'bell' : item.category === 'direct' ? 'person' : 'people'} size={18}/></span>
    <span className={styles.inboxRowCopy}>
      <span><strong>{item.title}</strong><time>{dateLabel(item.time)}</time></span>
      <small>{item.sender}</small>
      <span className={styles.inboxPreview}>{item.preview}</span>
    </span>
    {item.unread > 0 && <Badge tone="info">{item.unread}</Badge>}
  </button>;
}

function NewConversation({ directory, busy, onCancel, onCreated }) {
  const [type, setType] = useState('dm');
  const [memberIds, setMemberIds] = useState([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const toggle = (id) => setMemberIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const submit = async (event) => {
    event.preventDefault();
    if (type === 'dm' && memberIds.length !== 1) return setError('Chọn đúng một người nhận.');
    if (type === 'group' && (!name.trim() || !memberIds.length)) return setError('Nhập tên nhóm và chọn ít nhất một thành viên.');
    setError('');
    await onCreated(type === 'dm' ? { type, userId: memberIds[0] } : { type, name: name.trim(), memberIds });
  };
  return <Panel title="Cuộc trò chuyện mới" description="Tạo đúng Conversation ERP; Realm không giữ bản sao hội thoại." actions={<Button variant="secondary" icon="close" onClick={onCancel}>Hủy</Button>}>
    <form className={styles.newConversation} onSubmit={submit}>
      <Segmented label="Loại hội thoại" options={[{ value: 'dm', label: 'Nhắn riêng' }, { value: 'group', label: 'Nhóm' }]} value={type} onChange={(value) => { setType(value); setMemberIds([]); setError(''); }}/>
      {type === 'group' && <Field label="Tên nhóm"><input className={styles.input} value={name} maxLength={120} required onChange={(event) => setName(event.target.value)}/></Field>}
      <fieldset className={styles.directoryChoices}><legend>Thành viên</legend>{directory.map((person) => <label key={person.id}><input type={type === 'dm' ? 'radio' : 'checkbox'} name="conversation-member" checked={memberIds.includes(person.id)} onChange={() => type === 'dm' ? setMemberIds([person.id]) : toggle(person.id)}/><span className={styles.inboxAvatar}>{initials(person.name)}</span><span><strong>{person.name}</strong><small>{person.title || 'Nhân sự ERP'}</small></span></label>)}</fieldset>
      {!directory.length && <Banner tone="warning">Danh bạ ERP chưa có nhân sự khả dụng.</Banner>}
      {error && <p className={styles.inlineError} role="alert">{error}</p>}
      <button type="submit" className={styles.button} disabled={busy || !directory.length} aria-busy={busy || undefined}>{busy ? <span className={styles.spinner}/> : <Icon name="plus" size={17}/>}<span>{busy ? 'Đang tạo…' : 'Tạo Conversation ERP'}</span></button>
    </form>
  </Panel>;
}

function ConversationThread({ item, user, thread, loading, error, sending, onBack, onReload, onSend }) {
  const [content, setContent] = useState('');
  const streamRef = useRef(null);
  useEffect(() => {
    const stream = streamRef.current;
    if (stream) stream.scrollTop = stream.scrollHeight;
  }, [thread?.messages?.length]);
  const submit = async (event) => {
    event.preventDefault();
    const value = content.trim();
    if (!value || sending) return;
    const sent = await onSend(value);
    if (sent) setContent('');
  };
  return <div className={styles.inboxThread}>
    <header className={styles.threadHeader}>
      <Button variant="secondary" icon="arrow" onClick={onBack}>Quay lại</Button>
      <div><span className={styles.eyebrow}>{item.category === 'direct' ? 'Direct conversation' : 'Team conversation'}</span><h2>{thread?.conv?.name || item.title}</h2><p>{thread?.conv?.type === 'dm' ? 'Nhắn riêng' : `${thread?.conv?.members?.length || item.raw.memberCount || 0} thành viên`}</p></div>
      <Button variant="secondary" icon="refresh" loading={loading} onClick={onReload}>Đồng bộ</Button>
    </header>
    {error && <Banner tone="danger"><strong>Không thể tải hội thoại.</strong> {error.message}</Banner>}
    {loading && !thread ? <StateView state="loading"/> : thread ? <>
      <div ref={streamRef} className={styles.messageStream} aria-live="polite">{thread.messages.map((message) => {
        const mine = message.senderId === user?.id;
        return <article className={styles.messageBubble} data-mine={mine || undefined} key={message.id}>
          <span className={styles.inboxAvatar}>{initials(message.senderName)}</span>
          <div><header><strong>{mine ? 'Bạn' : message.senderName}</strong><time>{dateLabel(message.at)}</time></header><p>{message.content}</p><small>Message record · {message.id}</small></div>
        </article>;
      })}{!thread.messages.length && <div className={styles.canonicalEmpty}><Icon name="chat"/><strong>Chưa có tin nhắn</strong><span>Gửi tin đầu tiên vào Conversation ERP này.</span></div>}</div>
      <form className={styles.messageComposer} onSubmit={submit}>
        <Field label="Trả lời" hint="Tin nhắn được ghi trực tiếp vào Conversation ERP; tối đa 4.000 ký tự."><textarea className={styles.textarea} maxLength={4000} required value={content} onChange={(event) => setContent(event.target.value)} placeholder={`Nhắn ${thread.conv.name || item.title}…`}/></Field>
        <button type="submit" className={styles.button} disabled={sending || !content.trim()} aria-busy={sending || undefined}>{sending ? <span className={styles.spinner}/> : <Icon name="chat" size={17}/>}<span>{sending ? 'Đang gửi…' : 'Gửi vào ERP'}</span></button>
      </form>
    </> : null}
  </div>;
}

function NotificationDetail({ item, onBack }) {
  const notification = item.raw;
  return <div className={styles.notificationDetail}>
    <header className={styles.threadHeader}><Button variant="secondary" icon="arrow" onClick={onBack}>Quay lại</Button><div><span className={styles.eyebrow}>{notification.kindLabel || 'Realm Dispatch'}</span><h2>{notification.targetLabel || 'Cập nhật ERP · CRM'}</h2><p>{dateLabel(notification.createdAt)}</p></div><Status tone={notification.readAt ? 'neutral' : 'info'}>{notification.readAt ? 'Đã đọc' : 'Vừa đánh dấu đã đọc'}</Status></header>
    <article className={styles.notificationBody}><span className={styles.inboxAvatar}><Icon name={notification.icon || 'bell'}/></span><div><p>{notification.text}</p><SourcePill source={item.source} freshness="Canonical"/></div></article>
    {notification.kind === 'approval' && <Banner tone="warning"><strong>Decision marker.</strong> Quyết định vẫn phải đi qua workflow Approval ERP.</Banner>}
    <div className={styles.threadActions}><Link className={styles.button} href={notification.route || '/dashboard'}><Icon name="arrow" size={16}/><span>Mở bản ghi ERP</span></Link></div>
  </div>;
}

function InboxContext({ item, thread }) {
  if (!item) return <div className={styles.canonicalEmpty}><Icon name="link"/><strong>Chưa có context</strong><span>Chọn một hội thoại hoặc thông báo để xem nguồn và đường dẫn canonical.</span></div>;
  if (item.kind === 'notification') return <div className={styles.inboxContext}>
    <span className={styles.eyebrow}>Authorized context</span><h3>{item.raw.kindLabel || 'ERP Notification'}</h3>
    <dl className={styles.definition}><dt>Nguồn</dt><dd>{item.source}</dd><dt>Đích</dt><dd>{item.raw.targetLabel || 'ERP · CRM'}</dd><dt>Route</dt><dd>{item.raw.route || '/dashboard'}</dd></dl>
    <Banner tone="info">Chỉ metadata đã được Notification API cấp quyền mới hiển thị.</Banner>
  </div>;
  return <div className={styles.inboxContext}>
    <span className={styles.eyebrow}>Conversation context</span><h3>{thread?.conv?.name || item.title}</h3>
    <dl className={styles.definition}><dt>Nguồn</dt><dd>ERP Conversation</dd><dt>Thành viên</dt><dd>{thread?.conv?.members?.join(', ') || `${item.raw.memberCount || 0} người`}</dd><dt>Attachments</dt><dd>API hiện chưa expose</dd><dt>Read receipts</dt><dd>API hiện chưa expose theo người</dd></dl>
    <Banner tone="info">Hội thoại hiện chưa có work-object link canonical; Realm không tự gắn Project hoặc Task.</Banner>
    <Link className={styles.button} data-variant="secondary" href={`/messages?conversation=${encodeURIComponent(item.id)}`}><Icon name="arrow" size={16}/><span>Mở trong ERP Messages</span></Link>
  </div>;
}

function UnifiedInboxScreen({ user }) {
  const data = useInboxSources();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [thread, setThread] = useState(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const items = useMemo(() => inboxItems(data.conversations, data.notifications), [data.conversations, data.notifications]);
  const visible = useMemo(() => items.filter((item) => {
    if (filter === 'unread' && !item.unread) return false;
    if (!['all', 'unread'].includes(filter) && item.category !== filter) return false;
    const needle = query.trim().toLocaleLowerCase('vi-VN');
    return !needle || `${item.title} ${item.preview} ${item.sender}`.toLocaleLowerCase('vi-VN').includes(needle);
  }), [filter, items, query]);
  const active = items.find((item) => item.key === selectedKey) || null;

  const loadThread = useCallback(async (id) => {
    setThreadLoading(true); setThreadError(null);
    try {
      const payload = await fetch(`/api/chat/${encodeURIComponent(id)}`, { cache: 'no-store' }).then((response) => jsonResponse(response, 'Không thể tải hội thoại ERP.'));
      setThread(payload);
    } catch (error) { setThread(null); setThreadError(error); }
    finally { setThreadLoading(false); }
  }, []);

  useEffect(() => {
    const conversationId = searchParams.get('conversation');
    if (!conversationId || selectedKey || !data.conversations.some((item) => item.id === conversationId)) return;
    setSelectedKey(`conversation:${conversationId}`);
    loadThread(conversationId);
  }, [data.conversations, loadThread, searchParams, selectedKey]);

  const selectItem = async (item) => {
    setSelectedKey(item.key); setThread(null); setThreadError(null);
    if (item.kind === 'conversation') {
      await loadThread(item.id);
      data.reload();
    } else if (!item.raw.readAt) {
      try {
        await fetch('/api/notifications', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id }) }).then((response) => jsonResponse(response, 'Không thể đánh dấu thông báo đã đọc.'));
        data.setNotifications((rows) => rows.map((row) => row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row));
      } catch (error) { toast(error.message, 'error'); }
    }
  };

  const createConversation = async (payload) => {
    setBusy('create');
    try {
      const created = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then((response) => jsonResponse(response, 'Không thể tạo Conversation ERP.'));
      await data.reload(); setComposeOpen(false); setSelectedKey(`conversation:${created.id}`); await loadThread(created.id);
      toast(`Conversation ERP đã được tạo: ${created.id}`);
    } catch (error) { toast(error.message, 'error'); }
    finally { setBusy(''); }
  };

  const send = async (content) => {
    if (!active || active.kind !== 'conversation') return false;
    setBusy('send');
    try {
      const message = await fetch(`/api/chat/${encodeURIComponent(active.id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) }).then((response) => jsonResponse(response, 'Không thể gửi tin nhắn ERP.'));
      setThread((current) => current ? { ...current, messages: [...current.messages, message] } : current);
      toast(`Message record đã được lưu: ${message.id}`); data.reload(); return true;
    } catch (error) { toast(error.message, 'error'); return false; }
    finally { setBusy(''); }
  };

  if (data.loading && !items.length) return <Panel><StateView state="loading"/></Panel>;
  if (data.chatError && data.notificationError && !items.length) return <Panel title="Không thể tải Unified Inbox"><div className={styles.canonicalState}><StateView state={data.chatError.status === 403 ? 'permission-denied' : 'error'}/><Button variant="secondary" icon="refresh" onClick={data.reload}>Tải lại an toàn</Button></div></Panel>;

  return <div className={styles.grid}>
    <section className={`${styles.grid} ${styles.grid4} ${styles.communicationMetrics}`} aria-label="Tóm tắt Unified Inbox">
      <MetricCard label="Tổng hội thoại" value={data.conversations.length} meta="ERP Conversation" icon="inbox"/>
      <MetricCard label="Chưa đọc" value={items.reduce((sum, item) => sum + Number(item.unread || 0), 0)} meta="Conversation + Notification" icon="bell" tone="warning"/>
      <MetricCard label="Tin trực tiếp" value={items.filter((item) => item.category === 'direct').length} meta="Theo membership" icon="person"/>
      <MetricCard label="Thông báo hệ thống" value={data.notifications.length} meta="Chỉ của tài khoản này" icon="receipt"/>
    </section>
    {(data.chatError || data.notificationError) && <Banner tone="warning" action={<Button variant="secondary" icon="refresh" onClick={data.reload}>Thử lại</Button>}><strong>Một nguồn Inbox đang gián đoạn.</strong> Nguồn còn lại vẫn hoạt động độc lập; Realm không thay bằng fixture.</Banner>}
    {composeOpen && <NewConversation directory={data.directory} busy={busy === 'create'} onCancel={() => setComposeOpen(false)} onCreated={createConversation}/>} 
    <Panel title="Unified Inbox" description="Conversation và Notification vẫn thuộc ERP; Realm chỉ hợp nhất cách đọc và phản hồi." actions={<><Button variant="secondary" icon="refresh" loading={data.loading} onClick={data.reload}>Đồng bộ</Button><Button icon="plus" onClick={() => setComposeOpen(true)}>Soạn mới</Button></>}>
      <div className={styles.inboxToolbar}><Segmented label="Lọc Unified Inbox" options={INBOX_FILTERS} value={filter} onChange={setFilter}/><label className={styles.inboxSearch}><Icon name="search" size={16}/><span className={styles.srOnly}>Tìm hội thoại hoặc thông báo</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm trong Inbox…"/></label></div>
      <div className={styles.inboxWorkspace} data-thread-open={Boolean(active) || undefined}>
        <section className={styles.inboxListPane} aria-label="Danh sách Inbox"><div className={styles.inboxList}>{visible.map((item) => <InboxRow key={item.key} item={item} selected={active?.key === item.key} onSelect={selectItem}/>)}{!visible.length && <div className={styles.canonicalEmpty}><Icon name="inbox"/><strong>Không có mục trong bộ lọc này</strong><span>Realm không tạo hội thoại hoặc thông báo giả.</span></div>}</div></section>
        <section className={styles.inboxConversationPane} aria-label="Nội dung hội thoại">{active?.kind === 'conversation' ? <ConversationThread item={active} user={user} thread={thread} loading={threadLoading} error={threadError} sending={busy === 'send'} onBack={() => { setSelectedKey(''); setThread(null); }} onReload={() => loadThread(active.id)} onSend={send}/> : active?.kind === 'notification' ? <NotificationDetail item={active} onBack={() => setSelectedKey('')}/> : <div className={styles.canonicalEmpty}><Icon name="inbox"/><strong>Chọn một mục để mở</strong><span>Việc mở Conversation có thể cập nhật `lastReadAt` bằng cùng API mà ERP đang dùng.</span></div>}</section>
        <aside className={styles.inboxContextPane} aria-label="Context của Inbox"><InboxContext item={active} thread={thread}/></aside>
      </div>
    </Panel>
    <div className={styles.sourceRow}><SourcePill source="ERP Conversation + Notification" freshness="Authorized · Live"/><span>Message ID xác nhận bản ghi đã lưu; API local hiện chưa phát hành RepositoryRealms receipt riêng.</span></div>
  </div>;
}

function useCollaborationSources() {
  const [state, setState] = useState({ loading: true, people: [], generatedAt: null, incoming: [], outgoing: [], presenceError: null, contactError: null });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true }));
    const [presenceResult, contactResult] = await Promise.allSettled([
      fetch('/api/collaboration/presence', { cache: 'no-store' }).then((response) => jsonResponse(response, 'Không thể tải presence.')),
      fetch('/api/collaboration/contact', { cache: 'no-store' }).then((response) => jsonResponse(response, 'Không thể tải lời mời cộng tác.')),
    ]);
    setState((current) => ({
      loading: false,
      people: presenceResult.status === 'fulfilled' ? presenceResult.value.people || [] : current.people,
      generatedAt: presenceResult.status === 'fulfilled' ? presenceResult.value.generatedAt || null : current.generatedAt,
      incoming: contactResult.status === 'fulfilled' ? contactResult.value.incoming || [] : current.incoming,
      outgoing: contactResult.status === 'fulfilled' ? contactResult.value.outgoing || [] : current.outgoing,
      presenceError: presenceResult.status === 'rejected' ? presenceResult.reason : null,
      contactError: contactResult.status === 'rejected' ? contactResult.reason : null,
    }));
  }, []);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

function PresenceRow({ person, selected, onSelect }) {
  const tone = !person.online ? 'neutral' : ['dnd', 'busy'].includes(person.availability) ? 'warning' : 'success';
  return <button type="button" className={styles.presenceRow} data-selected={selected || undefined} aria-pressed={selected} onClick={() => onSelect(person.id)}>
    <span className={styles.presenceAvatar}>{initials(person.name)}<i data-state={person.online ? person.availability : 'offline'}/></span>
    <span><strong>{person.name}</strong><small>{person.role || 'Nhân sự ERP'}</small></span>
    <Status tone={tone}>{availabilityLabel(person.availability, person.online)}</Status>
  </button>;
}

function ContactCard({ contact, incoming, busy, onRespond }) {
  const counterpart = incoming ? contact.requester : contact.target;
  const statusTone = contact.status === 'accepted' ? 'success' : contact.status === 'declined' ? 'danger' : contact.status === 'expired' ? 'neutral' : 'warning';
  return <article className={styles.contactCard}>
    <span className={styles.inboxAvatar}><Icon name={contact.kind === 'voice' ? 'chat' : 'people'} size={17}/></span>
    <div><strong>{counterpart?.name || 'Đồng nghiệp'}</strong><p>{contact.message || 'Muốn trao đổi nhanh với bạn.'}</p><small>{contact.kind} · hết hạn {dateLabel(contact.expiresAt)}</small></div>
    {incoming && contact.status === 'pending' ? <div className={styles.contactButtons}><Button variant="secondary" loading={busy === contact.id} onClick={() => onRespond(contact, 'decline')}>Từ chối</Button><Button loading={busy === contact.id} onClick={() => onRespond(contact, 'accept')}>Mở chat</Button></div> : <Status tone={statusTone}>{contact.status}</Status>}
  </article>;
}

function CollaborationScreen() {
  const data = useCollaborationSources();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState('');
  const [availability, setAvailability] = useState('available');
  const [kind, setKind] = useState('chat');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState(null);
  useEffect(() => { setAvailability(preferredCollaborationAvailability()); }, []);
  useEffect(() => { if (!selectedId && data.people.length) setSelectedId(data.people.find((person) => person.online)?.id || data.people[0].id); }, [data.people, selectedId]);
  const selected = data.people.find((person) => person.id === selectedId) || null;
  const online = data.people.filter((person) => person.online);
  const canContact = Boolean(selected?.online && selected.availability !== 'dnd');
  const canVoice = Boolean(canContact && selected.capabilities?.includes('voice'));

  const changeAvailability = (value) => {
    setAvailability(rememberCollaborationAvailability(value));
    setFeedback({ tone: 'info', text: 'Đã cập nhật lựa chọn cục bộ; Collaboration Bridge sẽ đồng bộ heartbeat tiếp theo.' });
  };

  const requestContact = async (event) => {
    event.preventDefault();
    if (!selected || !canContact || busy) return;
    setBusy('request'); setFeedback(null);
    try {
      const idempotencyKey = `realm-v2-contact:${crypto.randomUUID()}`;
      const payload = await fetch('/api/collaboration/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ targetUserId: selected.id, kind, sourceSurface: 'realm', message }),
      }).then((response) => jsonResponse(response, 'Không thể gửi lời mời cộng tác.'));
      setFeedback({ tone: 'success', text: `Contact request đã được ghi nhận: ${payload.contact.id}.` });
      setMessage(''); await data.reload();
    } catch (error) {
      setFeedback({ tone: 'danger', text: `${error.message} Không tự gửi lại nếu trạng thái chưa chắc chắn; hãy đồng bộ danh sách.` });
    } finally { setBusy(''); }
  };

  const respond = async (contact, action) => {
    setBusy(contact.id); setFeedback(null);
    try {
      const payload = await fetch('/api/collaboration/contact', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: contact.id, action }) }).then((response) => jsonResponse(response, 'Không thể phản hồi lời mời.'));
      setFeedback({ tone: 'success', text: action === 'accept' ? 'Đã chấp nhận. Conversation ERP đã sẵn sàng.' : 'Đã từ chối lời mời.' });
      await data.reload();
      if (action === 'accept' && payload.contact?.conversationId) window.location.assign(`/realm-v2/inbox?conversation=${encodeURIComponent(payload.contact.conversationId)}`);
    } catch (error) { setFeedback({ tone: 'danger', text: error.message }); }
    finally { setBusy(''); }
  };

  if (data.loading && !data.people.length) return <Panel><StateView state="loading"/></Panel>;
  if (data.presenceError && data.contactError && !data.people.length) return <Panel title="Không thể tải Collaboration"><div className={styles.canonicalState}><StateView state={data.presenceError.status === 403 ? 'permission-denied' : 'error'}/><Button variant="secondary" icon="refresh" onClick={data.reload}>Tải lại an toàn</Button></div></Panel>;

  return <div className={styles.grid}>
    <section className={`${styles.grid} ${styles.grid4} ${styles.communicationMetrics}`} aria-label="Tóm tắt Collaboration">
      <MetricCard label="Đồng nghiệp online" value={online.length} meta="TTL 70 giây" icon="people"/>
      <MetricCard label="Sẵn sàng trao đổi" value={online.filter((person) => person.availability === 'available').length} meta="Do người dùng tự chọn" icon="chat"/>
      <MetricCard label="Lời mời đến" value={data.incoming.length} meta="Hết hạn sau 5 phút" icon="inbox" tone={data.incoming.length ? 'warning' : 'success'}/>
      <MetricCard label="Đang chờ phản hồi" value={data.outgoing.filter((item) => item.status === 'pending').length} meta="Contact records" icon="clock"/>
    </section>
    {(data.presenceError || data.contactError) && <Banner tone="warning" action={<Button variant="secondary" icon="refresh" onClick={data.reload}>Thử lại</Button>}><strong>Một nguồn Collaboration đang gián đoạn.</strong> Presence và contact requests degrade độc lập.</Banner>}
    {feedback && <Banner tone={feedback.tone}>{feedback.text}</Banner>}
    <Panel className={styles.collaborationPanel} title="Collaboration workspace" description="Presence giúp phối hợp tại thời điểm hiện tại; không đo thời lượng, mood hay năng suất." actions={<><Field label="Trạng thái của tôi"><select className={styles.select} value={availability} onChange={(event) => changeAvailability(event.target.value)}>{AVAILABILITY.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field><Button variant="secondary" icon="refresh" loading={data.loading} onClick={data.reload}>Đồng bộ</Button></>}>
      <div className={styles.collaborationWorkspace}>
        <section className={styles.presenceListPane} aria-label="Danh sách cộng tác viên"><header><span className={styles.eyebrow}>Active collaborators</span><small>As of {dateLabel(data.generatedAt)}</small></header><div className={styles.presenceList}>{data.people.map((person) => <PresenceRow key={person.id} person={person} selected={selected?.id === person.id} onSelect={setSelectedId}/>)}{!data.people.length && <div className={styles.canonicalEmpty}><Icon name="people"/><strong>Chưa có đồng nghiệp trong directory</strong><span>Realm không tạo presence giả.</span></div>}</div></section>
        <section className={styles.collaborationFocus} aria-label="Không gian phối hợp">{selected ? <>
          <header className={styles.collaboratorHeader}><span className={styles.presenceAvatar}>{initials(selected.name)}<i data-state={selected.online ? selected.availability : 'offline'}/></span><div><span className={styles.eyebrow}>Coordination focus</span><h2>{selected.name}</h2><p>{selected.role} · {availabilityLabel(selected.availability, selected.online)}</p></div><Status tone={selected.online ? 'success' : 'neutral'}>{selected.surfaces?.length ? selected.surfaces.join(' + ') : 'Ngoại tuyến'}</Status></header>
          <div className={styles.collaborationFacts}><dl className={styles.definition}><dt>Presence</dt><dd>{selected.online ? 'Active trong TTL hiện tại' : 'Không có active session'}</dd></dl><dl className={styles.definition}><dt>Capabilities</dt><dd>{selected.capabilities?.join(', ') || 'chat'}</dd></dl><dl className={styles.definition}><dt>Shared context</dt><dd>Chưa có context API</dd></dl><dl className={styles.definition}><dt>Co-viewing</dt><dd>Chưa bật</dd></dl></div>
          <Banner tone="info"><strong>Consent boundary.</strong> Không hiển thị raw heartbeat, thời lượng online, Task, Gold hoặc điểm hiệu suất.</Banner>
          <form className={styles.contactComposer} onSubmit={requestContact}>
            <Field label="Hình thức"><select className={styles.select} value={kind} onChange={(event) => setKind(event.target.value)}><option value="chat">Mời chat</option><option value="knock">Gõ cửa</option><option value="voice" disabled={!canVoice}>Mời thoại{!canVoice ? ' · không khả dụng' : ''}</option></select></Field>
            <Field label="Lời nhắn" hint="Contact request tự hết hạn sau 5 phút; dùng Inbox cho tin nhắn cần lưu lâu."><textarea className={styles.textarea} maxLength={280} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Nêu ngắn gọn nội dung cần phối hợp…"/></Field>
            <button type="submit" className={styles.button} disabled={!canContact || busy === 'request'} aria-busy={busy === 'request' || undefined}>{busy === 'request' ? <span className={styles.spinner}/> : <Icon name="people" size={17}/>}<span>{selected.availability === 'dnd' ? 'Đang Không làm phiền' : selected.online ? 'Gửi contact request' : 'Đồng nghiệp đang offline'}</span></button>
          </form>
          {!canContact && <Link className={styles.button} data-variant="secondary" href="/realm-v2/inbox"><Icon name="inbox" size={16}/><span>Gửi tin nhắn bền vững qua Inbox</span></Link>}
        </> : <div className={styles.canonicalEmpty}><Icon name="people"/><strong>Chọn một đồng nghiệp</strong><span>Presence chỉ hỗ trợ coordination, không phải monitoring.</span></div>}</section>
        <aside className={styles.sharedContextPane} aria-label="Shared context"><span className={styles.eyebrow}>Shared workspace</span><h3>Context và quyết định</h3><div className={styles.policyTests}><span><Icon name="folder" size={14}/><strong>Rooms</strong> chưa có canonical source</span><span><Icon name="eyeOff" size={14}/><strong>Co-viewing</strong> không được giả lập</span><span><Icon name="approval" size={14}/><strong>Decision</strong> mở tại Action Center</span></div><div className={styles.threadActions}><Link className={styles.button} data-variant="secondary" href="/teamwork"><Icon name="board" size={16}/><span>Mở Team Work ERP</span></Link><Link className={styles.button} data-variant="secondary" href="/realm-v2/action-center"><Icon name="bolt" size={16}/><span>Mở Action Center</span></Link></div></aside>
      </div>
    </Panel>
    <div className={styles.collaborationRequests}>
      <Panel title="Lời mời đến" description="Accept mở đúng Conversation ERP; decline không xóa lịch sử contact."><div className={styles.contactList}>{data.incoming.map((contact) => <ContactCard key={contact.id} contact={contact} incoming busy={busy} onRespond={respond}/>)}{!data.incoming.length && <div className={styles.canonicalEmpty}><Icon name="inbox"/><strong>Không có lời mời đang chờ</strong><span>Không có contact request giả.</span></div>}</div></Panel>
      <Panel title="Lời mời đã gửi" description="Chỉ các contact record trong 30 phút gần nhất."><div className={styles.contactList}>{data.outgoing.map((contact) => <ContactCard key={contact.id} contact={contact} busy={busy} onRespond={respond}/>)}{!data.outgoing.length && <div className={styles.canonicalEmpty}><Icon name="people"/><strong>Chưa gửi lời mời</strong><span>Chọn một đồng nghiệp để bắt đầu.</span></div>}</div></Panel>
    </div>
    <div className={styles.sourceRow}><SourcePill source="ERP Collaboration" freshness="TTL presence · Canonical contacts"/><span>Presence là context tự nguyện và ngắn hạn; Conversation ERP mới là kênh trao đổi bền vững.</span></div>
  </div>;
}

export default function CanonicalRealmCommunicationScreen({ slug, user }) {
  return slug === 'collaboration' ? <CollaborationScreen/> : <UnifiedInboxScreen user={user}/>;
}
