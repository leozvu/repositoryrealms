'use client';
// v3.11: Cổng freelancer — view khóa chặt: chỉ dự án được gán + việc của mình + ghi giờ.
// Dữ liệu qua endpoint riêng /api/freelancer/* (không đụng API nội bộ).
import { useEffect, useState } from 'react';
import { Icon, EmptyState, AsyncButton, useToast } from '@/components/ui';
import { fmtDate, todayISO, initials, parseItems } from '@/lib/format';

const COLS = [{ k: 'todo', l: 'Cần làm' }, { k: 'doing', l: 'Đang làm' }, { k: 'review', l: 'Chờ duyệt' }, { k: 'done', l: 'Hoàn thành' }];
const money = n => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0)) + ' ₫';

export default function FreelancerPage() {
  const [data, setData] = useState(null);
  const [logFor, setLogFor] = useState(null); // projectId đang ghi giờ
  const [logH, setLogH] = useState('');
  const [logNote, setLogNote] = useState('');
  const toast = useToast();

  const load = () => fetch('/api/freelancer/home').then(r => r.json()).then(setData).catch(() => setData({ error: 'load' }));
  useEffect(() => { load(); }, []);
  if (!data) return null;
  if (data.error) return <EmptyState title="Không tải được" sub="Tài khoản có thể đã hết hạn — liên hệ quản lý dự án." />;

  const pName = id => data.projects.find(p => p.id === id)?.name || '—';
  const daysLeft = data.me.accessUntil ? Math.ceil((new Date(data.me.accessUntil) - new Date(todayISO())) / 86400000) : null;

  const setStatus = async (t, status) => {
    const r = await fetch('/api/freelancer/task/' + t.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return toast(j.error || 'Lỗi', 'error');
    toast('Đã cập nhật'); load();
  };
  const toggleCheck = async (t, i) => {
    const cl = parseItems(t.checklist).map((c, j) => j === i ? { ...c, done: !c.done } : c);
    const r = await fetch('/api/freelancer/task/' + t.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checklist: JSON.stringify(cl) }) });
    if (r.ok) load();
  };
  const submitLog = async () => {
    if (!(+logH > 0)) return toast('Nhập số giờ', 'error');
    const r = await fetch('/api/freelancer/timelog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: logFor, hours: +logH, note: logNote }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return toast(j.error || 'Lỗi', 'error');
    toast(`Đã ghi ${logH}h`); setLogFor(null); setLogH(''); setLogNote(''); load();
  };

  return (
    <>
      <div className="card" style={{ marginBottom: 16, background: 'var(--brand-soft, #EBF1FE)' }}>
        <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span className="avatar" style={{ width: 42, height: 42 }}>{initials(data.me.name)}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800 }}>Xin chào, {data.me.name} 👋</div>
            <div style={{ fontSize: '.8rem', color: 'var(--muted)' }}>Freelancer{data.me.skills ? ' · ' + data.me.skills : ''}{data.me.hourlyRate ? ' · ' + money(data.me.hourlyRate) + '/giờ' : ''}</div>
          </div>
          {daysLeft != null && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>Hạn truy cập</div>
              <div style={{ fontWeight: 700, color: daysLeft <= 7 ? 'var(--danger)' : daysLeft <= 30 ? 'var(--warn, #D97706)' : 'var(--accent)' }}>
                {daysLeft < 0 ? 'Đã hết hạn' : `còn ${daysLeft} ngày`} · {fmtDate(data.me.accessUntil)}</div>
            </div>
          )}
        </div>
      </div>

      <div className="grid kpi-grid">
        <div className="card kpi"><span className="kpi-label">Dự án tham gia</span><div className="kpi-value">{data.projects.length}</div></div>
        <div className="card kpi"><span className="kpi-label">Việc đang mở</span><div className="kpi-value">{data.tasks.filter(t => t.status !== 'done').length}</div></div>
        <div className="card kpi"><span className="kpi-label">Giờ tháng này</span><div className="kpi-value">{data.hoursThisMonth}h</div>
          <div className="kpi-sub">tổng {data.totalHours}h</div></div>
        <div className="card kpi"><span className="kpi-label">Chờ thanh toán</span>
          <div className="kpi-value" style={{ color: data.pendingPay ? 'var(--warn, #D97706)' : 'var(--accent)' }}>{money(data.pendingPay)}</div></div>
      </div>

      {data.payouts?.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-head"><span className="card-title">Thanh toán ({data.payouts.length})</span></div>
          <div className="card-body" style={{ paddingTop: 6 }}>
            {data.payouts.map(p => (
              <div key={p.id} className="act-item" style={{ alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div className="act-title">{money(p.amount)}{p.kind === 'hourly' && p.hours ? ` · ${p.hours}h` : ' · khoán'}</div>
                  <div className="act-sub">{p.note || ''}{p.paidDate ? ' · đã trả ' + fmtDate(p.paidDate) : ''}</div>
                </div>
                <span className={`badge ${p.status === 'paid' ? 'b-green' : 'b-amber'}`}><span className="dot"></span>{p.status === 'paid' ? 'Đã trả' : 'Chờ trả'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.projects.map(p => {
        const pt = data.tasks.filter(t => t.projectId === p.id);
        return (
          <div className="card" key={p.id} style={{ marginTop: 16 }}>
            <div className="card-head">
              <span className="card-title">{p.name} <span style={{ fontSize: '.74rem', color: 'var(--muted)', fontWeight: 400 }}>· {p.service || ''}{p.deadline ? ' · hạn ' + fmtDate(p.deadline) : ''}</span></span>
              <button className="btn btn-outline btn-sm" onClick={() => { setLogFor(p.id); setLogH(''); setLogNote(''); }}><Icon name="clock" size={14} /> Ghi giờ</button>
            </div>
            <div className="card-body" style={{ paddingTop: 6 }}>
              {logFor === p.id && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg)', padding: 10, borderRadius: 8 }}>
                  <input style={{ width: 90 }} type="number" min="0.5" step="0.5" placeholder="giờ" value={logH} onChange={e => setLogH(e.target.value)} autoFocus />
                  <input style={{ flex: 1, minWidth: 140 }} placeholder="Ghi chú (làm gì)" value={logNote} onChange={e => setLogNote(e.target.value)} />
                  <AsyncButton className="btn btn-primary btn-sm" pendingLabel="Đang lưu…" onClick={submitLog}>Lưu giờ hôm nay</AsyncButton>
                  <button className="btn btn-ghost btn-sm" onClick={() => setLogFor(null)}>Hủy</button>
                </div>
              )}
              {!pt.length && <p style={{ fontSize: '.82rem', color: 'var(--muted)' }}>Chưa có việc nào được giao trong dự án này.</p>}
              {pt.map(t => {
                const cl = parseItems(t.checklist);
                const late = t.status !== 'done' && t.dueDate && t.dueDate < todayISO();
                return (
                  <div key={t.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <b style={{ flex: 1, fontSize: '.9rem' }}>{t.title}</b>
                      {t.dueDate && <small style={{ color: late ? 'var(--danger)' : 'var(--muted)', fontWeight: late ? 700 : 400 }}>hạn {fmtDate(t.dueDate)}</small>}
                      <select value={t.status} onChange={e => setStatus(t, e.target.value)} style={{ fontSize: '.78rem', padding: '3px 6px' }}>
                        {COLS.map(c => <option key={c.k} value={c.k}>{c.l}</option>)}
                      </select>
                    </div>
                    {t.note && <div style={{ fontSize: '.8rem', color: 'var(--muted)', marginTop: 4 }}>{t.note}</div>}
                    {cl.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        {cl.map((c, i) => (
                          <label key={i} style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: '.82rem', padding: '2px 0', cursor: 'pointer' }}>
                            <input type="checkbox" style={{ width: 'auto' }} checked={!!c.done} onChange={() => toggleCheck(t, i)} />
                            <span style={c.done ? { textDecoration: 'line-through', color: 'var(--muted)' } : {}}>{c.text}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {!data.projects.length && <div style={{ marginTop: 16 }}><EmptyState title="Chưa được gán dự án nào" sub="Quản lý sẽ thêm bạn vào dự án — khi đó việc của bạn sẽ hiện ở đây." /></div>}
    </>
  );
}
