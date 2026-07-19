'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Icon, Modal, AsyncButton, useToast } from '@/components/ui';
import { initials } from '@/lib/format';

const fmtTime = at => {
  const d = new Date(at), now = new Date();
  const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === now.toDateString() ? time : d.toLocaleDateString('vi-VN') + ' ' + time;
};

/* ---------- Modal tạo cuộc trò chuyện ---------- */
function NewChatModal({ directory, onCreated, onClose }) {
  const [tab, setTab] = useState('dm');
  const [name, setName] = useState('');
  const [sel, setSel] = useState([]);
  const toast = useToast();
  const toggle = id => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const create = async () => {
    const body = tab === 'dm' ? { type: 'dm', userId: sel[0] } : { type: 'group', name, memberIds: sel };
    if (tab === 'dm' && !sel.length) return toast('Chọn người muốn nhắn', 'error');
    const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json();
    if (!res.ok) return toast(json.error || 'Có lỗi', 'error');
    onCreated(json.id); onClose();
  };
  return (
    <Modal title="Cuộc trò chuyện mới" onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose}>Hủy</button>
        <AsyncButton className="btn btn-primary" pendingLabel="Đang tạo…" onClick={create}>Bắt đầu</AsyncButton></>}>
      <div className="tabs">
        <button className={`tab ${tab === 'dm' ? 'active' : ''}`} onClick={() => { setTab('dm'); setSel([]); }}>Nhắn riêng</button>
        <button className={`tab ${tab === 'group' ? 'active' : ''}`} onClick={() => { setTab('group'); setSel([]); }}>Tạo nhóm</button>
      </div>
      {tab === 'group' && <div className="field" style={{ marginBottom: 12 }}><label>Tên nhóm</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="VD: Team dự án Lumia" /></div>}
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {directory.map(u => (
          <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
            <input type={tab === 'dm' ? 'radio' : 'checkbox'} name="who" style={{ width: 'auto' }}
              checked={sel.includes(u.id)} onChange={() => tab === 'dm' ? setSel([u.id]) : toggle(u.id)} />
            <span className="avatar">{initials(u.name)}</span>
            <span style={{ fontSize: '.86rem', fontWeight: 600 }}>{u.name}</span>
            <span style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{u.title || ''}</span>
          </label>
        ))}
      </div>
    </Modal>
  );
}

export default function MessagesPage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const me = session?.user;
  const [convs, setConvs] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [sel, setSel] = useState(null);       // conv id đang mở
  const [thread, setThread] = useState(null); // {conv, messages}
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const endRef = useRef(null);
  const lastAtRef = useRef(null);
  const toast = useToast();

  const loadList = useCallback(async () => {
    const d = await (await fetch('/api/chat')).json();
    if (d.conversations) { setConvs(d.conversations); setDirectory(d.directory || []); }
  }, []);
  const loadThread = useCallback(async id => {
    const d = await (await fetch(`/api/chat/${id}`)).json();
    if (d.messages) { setThread(d); lastAtRef.current = d.messages.at(-1)?.at || null; }
  }, []);

  useEffect(() => { loadList(); const t = setInterval(loadList, 12000); return () => clearInterval(t); }, [loadList]);
  useEffect(() => {
    const requested = searchParams.get('conversation');
    if (requested && convs.some((conversation) => conversation.id === requested)) setSel(requested);
  }, [convs, searchParams]);
  useEffect(() => { if (sel) loadThread(sel); }, [sel, loadThread]);
  // Poll tin mới của hội thoại đang mở mỗi 4 giây
  useEffect(() => {
    if (!sel) return;
    const t = setInterval(async () => {
      const url = lastAtRef.current ? `/api/chat/${sel}?after=${encodeURIComponent(lastAtRef.current)}` : `/api/chat/${sel}`;
      const d = await (await fetch(url)).json();
      if (d.messages?.length) {
        setThread(prev => prev ? { ...prev, messages: [...prev.messages, ...d.messages.filter(m => !prev.messages.some(x => x.id === m.id))] } : d);
        lastAtRef.current = d.messages.at(-1).at;
        loadList();
      }
    }, 4000);
    return () => clearInterval(t);
  }, [sel, loadList]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [thread?.messages?.length]);

  const send = async e => {
    e?.preventDefault();
    const content = input.trim();
    if (!content || !sel || sending) return;
    setSending(true);
    setInput('');
    try {
      const res = await fetch(`/api/chat/${sel}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
      const msg = await res.json();
      if (!res.ok) { setInput(content); return toast(msg.error || 'Gửi lỗi', 'error'); }
      setThread(prev => ({ ...prev, messages: [...prev.messages, msg] }));
      lastAtRef.current = msg.at;
      loadList();
    } catch {
      setInput(content); toast('Không thể gửi tin nhắn', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className={`chat-wrap ${sel ? 'thread-open' : ''}`}>
        {/* Danh sách hội thoại */}
        <div className="chat-list">
          <div className="chat-list-head">
            <b style={{ fontSize: '.9rem', flex: 1 }}>Tin nhắn</b>
            <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}><Icon name="plus" size={13} /> Mới</button>
          </div>
          <div className="chat-list-body">
            {convs.map(c => (
              <button key={c.id} className={`chat-item ${sel === c.id ? 'active' : ''}`} onClick={() => setSel(c.id)}>
                <span className="avatar" style={c.type !== 'dm' ? { background: 'var(--violet-soft)', color: 'var(--violet)' } : {}}>
                  {c.type === 'general' ? '#' : c.type === 'group' ? '👥' : initials(c.name)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="ci-name"><span>{c.name}</span>{c.unread > 0 && <span className="chat-unread">{c.unread}</span>}</span>
                  <span className="ci-last">{c.lastMsg ? `${c.lastMsg.senderName.split(' ').pop()}: ${c.lastMsg.content}` : c.type === 'general' ? 'Kênh của cả công ty' : 'Chưa có tin nhắn'}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Luồng tin nhắn */}
        <div className="chat-thread">
          {!thread ? (
            <div className="chat-empty">
              <Icon name="mail" size={34} />
              <b>Chọn một cuộc trò chuyện</b>
              <span>hoặc bấm &quot;Mới&quot; để nhắn cho đồng nghiệp</span>
            </div>
          ) : (
            <>
              <div className="chat-thread-head" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button className="icon-btn" style={{ display: 'none' }} id="back-btn" onClick={() => { setSel(null); setThread(null); }}>←</button>
                <div style={{ flex: 1 }}>
                  <b style={{ fontSize: '.92rem' }}>{thread.conv.name}</b>
                  <div style={{ fontSize: '.71rem', color: 'var(--muted)' }}>
                    {thread.conv.type === 'dm' ? 'Nhắn riêng' : `${thread.conv.members.length} thành viên: ${thread.conv.members.join(', ').slice(0, 80)}`}
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => { setSel(null); setThread(null); }}>Đóng</button>
              </div>
              <div className="chat-msgs">
                {thread.messages.map((m, i) => {
                  const mine = m.senderId === me?.id;
                  const showName = !mine && (i === 0 || thread.messages[i - 1].senderId !== m.senderId);
                  return (
                    <div key={m.id}>
                      {showName && thread.conv.type !== 'dm' && <div className="msg-meta" style={{ marginLeft: 44 }}>{m.senderName}</div>}
                      <div className={`msg-row ${mine ? 'mine' : ''}`}>
                        {!mine && <span className="avatar" style={{ width: 30, height: 30, fontSize: '.7rem' }}>{initials(m.senderName)}</span>}
                        <div>
                          <div className="msg-bubble">{m.content}</div>
                          <div className="msg-meta">{fmtTime(m.at)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!thread.messages.length && <div className="chat-empty" style={{ padding: 30 }}>Hãy gửi tin nhắn đầu tiên 👋</div>}
                <div ref={endRef}></div>
              </div>
              <form className="chat-input" aria-busy={sending || undefined} onSubmit={send}>
                <input value={input} onChange={e => setInput(e.target.value)} placeholder={`Nhắn ${thread.conv.name}…`} autoFocus />
                <button className="btn btn-primary" disabled={sending || !input.trim()}>{sending ? 'Đang gửi…' : 'Gửi'}</button>
              </form>
            </>
          )}
        </div>
      </div>
      {showNew && <NewChatModal directory={directory} onClose={() => setShowNew(false)}
        onCreated={id => { loadList(); setSel(id); }} />}
    </>
  );
}
