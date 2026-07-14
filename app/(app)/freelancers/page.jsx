'use client';
// v3.11: Quản lý Freelancer (HR/PM/Lead) — tạo tài khoản, gắn dự án, hạn truy cập tự
// theo deadline dự án, đơn giá giờ. Freelancer là người ngoài: chỉ vai trò FREELANCER.
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useResource, Icon, Modal, ConfirmDialog, EmptyState, Forbidden, useToast } from '@/components/ui';
import { money, fmtDate, todayISO, initials } from '@/lib/format';
import { hasAny } from '@/lib/perm';

export default function FreelancersPage() {
  const { data: session } = useSession();
  const canManage = hasAny(session?.user, ['HR', 'PM', 'LEAD']);
  const users = useResource('users');
  const projects = useResource('projects');
  const members = useResource('projectmembers');
  const [modal, setModal] = useState(null);
  const toast = useToast();
  if (users.forbidden) return <Forbidden />;

  const freelancers = users.rows.filter(u => u.userType === 'freelancer');
  const projName = id => projects.rows.find(p => p.id === id)?.name || '—';
  const flProjects = uid => members.rows.filter(m => m.userId === uid);
  const expired = u => u.accessUntil && u.accessUntil < todayISO();

  const callUsers = async (method, body) => {
    const res = await fetch('/api/users', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { toast(j.error || 'Lỗi', 'error'); return null; }
    return j;
  };
  // Sau khi gắn/bỏ dự án: hạn truy cập = deadline xa nhất trong các dự án freelancer tham gia
  const syncAccess = async (uid) => {
    const mine = members.rows.filter(m => m.userId === uid);
    const deadlines = mine.map(m => projects.rows.find(p => p.id === m.projectId)?.deadline).filter(Boolean).sort();
    const until = deadlines.length ? deadlines[deadlines.length - 1] : null;
    await callUsers('PUT', { id: uid, accessUntil: until });
    await users.refresh();
  };

  const createFL = async f => {
    const r = await callUsers('POST', { userType: 'freelancer', email: f.email, name: f.name, password: f.password, hourlyRate: +f.hourlyRate || 0, skills: f.skills, portfolio: f.portfolio });
    if (r) { toast('Đã tạo tài khoản freelancer'); users.refresh(); setModal(null); }
  };
  const assign = async (uid, projectId) => {
    if (!projectId) return;
    if (members.rows.some(m => m.userId === uid && m.projectId === projectId)) return toast('Đã ở trong dự án này', 'error');
    await members.create({ userId: uid, projectId });
    await new Promise(r => setTimeout(r, 300));
    await members.refresh();
    await syncAccess(uid);
    toast('Đã gắn vào dự án — hạn truy cập tự cập nhật');
  };
  const unassign = async (m) => {
    await members.remove(m.id);
    await new Promise(r => setTimeout(r, 300));
    await members.refresh();
    await syncAccess(m.userId);
    toast('Đã gỡ khỏi dự án');
  };

  return (
    <>
      <div className="toolbar">
        <span style={{ fontSize: '.85rem', color: 'var(--muted)' }}>{freelancers.length} freelancer · tài khoản tự hết hạn theo deadline dự án</span>
        <div className="spacer"></div>
        {canManage && <button className="btn btn-primary" onClick={() => setModal({ mode: 'add' })}><Icon name="plus" size={16} /><span>Thêm freelancer</span></button>}
      </div>

      {!freelancers.length ? <EmptyState title="Chưa có freelancer" sub="Thêm freelancer, gắn vào dự án — họ đăng nhập vào cổng riêng chỉ thấy việc của mình" /> : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {freelancers.map(u => {
            const mine = flProjects(u.id);
            return (
              <div key={u.id} className="card">
                <div className="card-head">
                  <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="avatar">{initials(u.name)}</span>{u.name}
                    {expired(u) && <span className="badge b-red"><span className="dot"></span>Hết hạn</span>}
                  </span>
                  {canManage && <button className="icon-btn danger" title="Vô hiệu hóa (khóa đăng nhập)" onClick={() => setModal({ mode: 'deactivate', row: u })}><Icon name="logout" size={15} /></button>}
                </div>
                <div className="card-body" style={{ fontSize: '.83rem' }}>
                  <div style={{ color: 'var(--muted)', marginBottom: 4 }}>{u.email}{u.skills ? ' · ' + u.skills : ''}</div>
                  <div style={{ display: 'flex', gap: 14, marginBottom: 8 }}>
                    <span>💵 <b>{u.hourlyRate ? money(u.hourlyRate) + '/giờ' : '—'}</b></span>
                    <span style={expired(u) ? { color: 'var(--danger)', fontWeight: 700 } : {}}>⏳ {u.accessUntil ? 'đến ' + fmtDate(u.accessUntil) : 'không hạn'}</span>
                  </div>
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Dự án ({mine.length})</div>
                    {mine.map(m => (
                      <div key={m.id} className="act-item" style={{ padding: '3px 0', alignItems: 'center' }}>
                        <span style={{ flex: 1 }}>{projName(m.projectId)}</span>
                        {canManage && <button className="icon-btn" onClick={() => unassign(m)}><Icon name="x" size={12} /></button>}
                      </div>
                    ))}
                    {canManage && (
                      <select value="" onChange={e => assign(u.id, e.target.value)} style={{ marginTop: 6, fontSize: '.8rem' }}>
                        <option value="">+ Gắn vào dự án…</option>
                        {projects.rows.filter(p => p.status !== 'done' && !mine.some(m => m.projectId === p.id)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal?.mode === 'add' && <FreelancerModal onClose={() => setModal(null)} onSave={createFL} />}
      {modal?.mode === 'deactivate' && <ConfirmDialog yesLabel="Khóa" msg={`Khóa đăng nhập freelancer "${modal.row.name}"? (có thể mở lại sau)`}
        onClose={() => setModal(null)} onYes={async () => { await callUsers('PUT', { id: modal.row.id, status: 'inactive' }); users.refresh(); toast('Đã khóa'); }} />}
    </>
  );
}

function FreelancerModal({ onClose, onSave }) {
  const [f, setF] = useState({ name: '', email: '', password: '', hourlyRate: 0, skills: '', portfolio: '' });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  return (
    <Modal title="Thêm freelancer" onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose}>Hủy</button>
        <button className="btn btn-primary" onClick={() => { if (!f.name || !f.email || f.password.length < 6) return; onSave(f); }}>Tạo tài khoản</button></>}>
      <div className="form-grid">
        <div className="field"><label>Họ tên *</label><input value={f.name} onChange={e => set('name', e.target.value)} /></div>
        <div className="field"><label>Email đăng nhập *</label><input type="email" value={f.email} onChange={e => set('email', e.target.value)} /></div>
        <div className="field"><label>Mật khẩu * (≥6)</label><input value={f.password} onChange={e => set('password', e.target.value)} /></div>
        <div className="field"><label>Đơn giá giờ (đ)</label><input type="number" min="0" value={f.hourlyRate} onChange={e => set('hourlyRate', e.target.value)} /></div>
        <div className="field full"><label>Kỹ năng</label><input value={f.skills} onChange={e => set('skills', e.target.value)} placeholder="VD: Video editor, Motion" /></div>
        <div className="field full"><label>Link portfolio</label><input value={f.portfolio} onChange={e => set('portfolio', e.target.value)} placeholder="https://" /></div>
        <p style={{ fontSize: '.76rem', color: 'var(--muted)' }}>Hạn truy cập sẽ tự đặt theo deadline dự án khi bạn gắn freelancer vào dự án. Freelancer chỉ thấy việc của mình trong cổng riêng.</p>
      </div>
    </Modal>
  );
}
