'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui';

const SUGGESTIONS = [
  'Doanh thu tháng này thế nào so với tháng trước?',
  'Khách nào đang nợ tiền? Viết email nhắc nợ lịch sự cho khách nợ lâu nhất.',
  'Dự án nào đang rủi ro trễ deadline? Đề xuất hành động.',
  'Viết proposal ngắn gói quản lý fanpage 6 tháng cho khách F&B.',
  'Phân tích pipeline: nên ưu tiên chốt deal nào trước?',
];

export default function CopilotPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [noKey, setNoKey] = useState(false);
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  const send = async text => {
    const content = (text || input).trim();
    if (!content || busy) return;
    const next = [...messages, { role: 'user', content }];
    setMessages(next); setInput(''); setBusy(true);
    const res = await fetch('/api/copilot', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: next }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.status === 400 && json.error === 'NO_KEY') { setNoKey(true); return; }
    setMessages([...next, { role: 'assistant', content: json.reply || ('⚠ ' + (json.error || 'Có lỗi xảy ra')) }]);
  };

  if (noKey) return (
    <div className="card" style={{ maxWidth: 620, margin: '40px auto', padding: '30px 34px', textAlign: 'center' }}>
      <div style={{ width: 54, height: 54, borderRadius: 14, background: 'linear-gradient(135deg,#2563EB,#7C3AED)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.2rem', margin: '0 auto 16px' }}>AI</div>
      <h2 style={{ fontSize: '1.05rem', marginBottom: 10 }}>AI Copilot cần Claude API key để hoạt động</h2>
      <p style={{ fontSize: '.86rem', color: 'var(--muted)', lineHeight: 1.7 }}>
        1. Tạo API key tại <b>console.anthropic.com</b> (Settings → API Keys)<br />
        2. Giám đốc dán key vào <b>Cài đặt → Claude API key</b> của hệ thống này<br />
        3. Quay lại đây và bắt đầu hỏi — AI sẽ trả lời dựa trên dữ liệu thật của công ty,<br />tự lọc theo quyền của từng người hỏi.
      </p>
    </div>
  );

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', display: 'flex', flexDirection: 'column', minHeight: 'calc(100dvh - 140px)' }}>
      <div style={{ flex: 1 }}>
        {!messages.length && (
          <div style={{ textAlign: 'center', padding: '36px 0 22px' }}>
            <div style={{ width: 54, height: 54, borderRadius: 14, background: 'linear-gradient(135deg,#2563EB,#7C3AED)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.2rem', margin: '0 auto 14px' }}>AI</div>
            <h2 style={{ fontSize: '1.1rem' }}>Hỏi bất cứ điều gì về công ty của bạn</h2>
            <p style={{ fontSize: '.83rem', color: 'var(--muted)', margin: '6px 0 20px' }}>Trả lời bằng số liệu thật · viết email, proposal, báo cáo · dữ liệu lọc theo quyền của bạn</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 560, margin: '0 auto' }}>
              {SUGGESTIONS.map(s => (
                <button key={s} className="btn btn-outline" style={{ justifyContent: 'flex-start', fontWeight: 500, fontSize: '.83rem' }} onClick={() => send(s)}>💬 {s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 0', alignItems: 'flex-start' }}>
            <span style={{ width: 32, height: 32, borderRadius: 9, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '.7rem', background: m.role === 'user' ? 'var(--muted-bg)' : 'linear-gradient(135deg,#2563EB,#7C3AED)', color: m.role === 'user' ? 'var(--fg)' : '#fff' }}>
              {m.role === 'user' ? 'Bạn' : 'AI'}</span>
            <div style={{ flex: 1, fontSize: '.89rem', lineHeight: 1.65, whiteSpace: 'pre-wrap', paddingTop: 4 }}>{m.content}</div>
          </div>
        ))}
        {busy && <div style={{ display: 'flex', gap: 12, padding: '12px 0' }}>
          <span style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg,#2563EB,#7C3AED)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '.7rem' }}>AI</span>
          <span style={{ color: 'var(--muted)', fontSize: '.86rem', paddingTop: 7 }}>Đang phân tích dữ liệu công ty…</span></div>}
        <div ref={endRef}></div>
      </div>
      <form onSubmit={e => { e.preventDefault(); send(); }}
        style={{ position: 'sticky', bottom: 14, display: 'flex', gap: 9, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 13, padding: 9, boxShadow: 'var(--shadow-lg)', marginTop: 14 }}>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Hỏi về doanh thu, khách hàng, dự án… hoặc nhờ viết email/proposal"
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '.9rem', padding: '6px 8px', color: 'var(--fg)' }} />
        <button className="btn btn-primary" disabled={busy || !input.trim()}>Gửi <Icon name="check" size={14} /></button>
      </form>
    </div>
  );
}
