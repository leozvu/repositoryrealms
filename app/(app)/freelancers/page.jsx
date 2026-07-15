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
  const timelogs = useResource('timelogs');
  const payouts = useResource('payouts');
  const [modal, setModal] = useState(null);
  const toast = useToast();
  if (users.forbidden) return <Forbidden />;

  const freelancers = users.rows.filter(u => u.userType === 'freelancer');
  const projName = id => projects.rows.find(p => p.id === id)?.name || '—';
  const flProjects = uid => members.rows.filter(m => m.userId === uid);
  const expired = u => u.accessUntil && u.accessUntil < todayISO();
  const flPayouts = uid => payouts.rows.filter(p => p.userId === uid);
  const r1 = n => Math.round(n * 10) / 10;
  const loggedHours = (uid, pid) => timelogs.rows.filter(l => l.userId === uid && l.projectId === pid).reduce((s, l) => s + l.hours, 0);
  // v3.13: giờ ĐÃ nằm trong phiếu thanh toán rồi — tính cả phiếu 'pending', vì phiếu chờ trả
  // cũng đã là cam kết trả cho số giờ đó; bỏ qua nó là chốt trùng lần hai.
  const settledHours = (uid, pid) => payouts.rows
    .filter(p => p.userId === uid && p.kind === 'hourly' && (p.projectId || '') === (pid || ''))
    .reduce((s, p) => s + (+p.hours || 0), 0);
  // v3.13: giờ CHƯA thanh toán — trước đây modal mặc định điền TỔNG giờ log từ trước tới nay,
  // nên chốt lần 2 là trả trùng nếu người dùng không tự nhớ trừ ra.
  const unpaidHours = (uid, pid) => Math.max(0, r1(loggedHours(uid, pid) - settledHours(uid, pid)));

  const settle = async (f) => {
    const amount = f.kind === 'hourly' ? Math.round((+f.hours || 0) * (+f.rate || 0)) : (+f.amount || 0);
    if (amount <= 0) return toast('Số tiền không hợp lệ', 'error');
    await payouts.create({ userId: f.userId, projectId: f.projectId || null, kind: f.kind, hours: f.kind === 'hourly' ? +f.hours || 0 : 0, amount, note: f.note || (f.projectId ? projName(f.projectId) : '') });
    toast('Đã tạo khoản phải trả freelancer');
  };
  const payNow = async (p) => {
    const r = await fetch(`/api/payouts/${p.id}/pay`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!r.ok) { const j = await r.json().catch(() => ({})); return toast(j.error || 'Lỗi', 'error'); }
    await payouts.refresh(); toast('Đã trả + ghi sổ quỹ');
  };

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
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="wallet" size={13} />
                      <b>{u.hourlyRate ? money(u.hourlyRate) + '/giờ' : '—'}</b></span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, ...(expired(u) ? { color: 'var(--danger)', fontWeight: 700 } : {}) }}>
                      <Icon name="clock" size={13} />{u.accessUntil ? 'đến ' + fmtDate(u.accessUntil) : 'không hạn'}</span>
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
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>Thanh toán</span>
                      {(() => { const pend = flPayouts(u.id).filter(p => p.status === 'pending').reduce((s, p) => s + p.amount, 0); return pend > 0 ? <span className="badge b-amber"><span className="dot"></span>chờ trả {money(pend)}</span> : null; })()}
                      <div className="spacer"></div>
                      {canManage && <button className="btn btn-outline btn-sm" onClick={() => setModal({ mode: 'settle', row: u })}>Chốt thanh toán</button>}
                    </div>
                    {flPayouts(u.id).slice(0, 5).map(p => (
                      <div key={p.id} className="act-item" style={{ padding: '3px 0', alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                          <span>{money(p.amount)}{p.kind === 'hourly' && p.hours ? ` (${p.hours}h)` : ''}</span>
                          <span style={{ fontSize: '.72rem', color: 'var(--muted)' }}> · {p.note || '—'}</span>
                        </div>
                        {p.status === 'paid'
                          ? <span className="badge b-green"><span className="dot"></span>Đã trả</span>
                          : (canManage && <button className="btn btn-primary btn-sm" onClick={() => payNow(p)}>Trả</button>)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal?.mode === 'add' && <FreelancerModal onClose={() => setModal(null)} onSave={createFL} />}
      {modal?.mode === 'settle' && <SettleModal fl={modal.row} projects={flProjects(modal.row.id).map(m => ({ id: m.projectId, name: projName(m.projectId) }))}
        loggedHours={loggedHours} settledHours={settledHours} unpaidHours={unpaidHours}
        onClose={() => setModal(null)} onSave={settle} />}
      {modal?.mode === 'deactivate' && <ConfirmDialog yesLabel="Khóa" msg={`Khóa đăng nhập freelancer "${modal.row.name}"? (có thể mở lại sau)`}
        onClose={() => setModal(null)} onYes={async () => { await callUsers('PUT', { id: modal.row.id, status: 'inactive' }); users.refresh(); toast('Đã khóa'); }} />}
    </>
  );
}

function SettleModal({ fl, projects, loggedHours, settledHours, unpaidHours, onClose, onSave }) {
  const [kind, setKind] = useState('hourly');
  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  // v3.13: mặc định = giờ CHƯA thanh toán, không phải tổng giờ log (tránh trả trùng)
  const [hours, setHours] = useState(projectId ? unpaidHours(fl.id, projectId) : 0);
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState('');
  const rate = fl.hourlyRate || 0;
  const pickProject = pid => { setProjectId(pid); setHours(pid ? unpaidHours(fl.id, pid) : 0); };
  const preview = kind === 'hourly' ? Math.round((+hours || 0) * rate) : (+amount || 0);
  const daLog = projectId ? Math.round(loggedHours(fl.id, projectId) * 10) / 10 : 0;
  const daChot = projectId ? Math.round(settledHours(fl.id, projectId) * 10) / 10 : 0;
  const conLai = projectId ? unpaidHours(fl.id, projectId) : 0;
  const vuot = kind === 'hourly' && projectId && +hours > conLai; // chốt quá số giờ còn lại
  return (
    <Modal title={`Chốt thanh toán — ${fl.name}`} onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose}>Hủy</button>
        <button className="btn btn-primary" onClick={() => { if (preview <= 0) return; onSave({ userId: fl.id, projectId, kind, hours, amount, rate, note }); onClose(); }}>Tạo khoản phải trả</button></>}>
      <div className="form-grid">
        <div className="field"><label>Dự án</label>
          <select value={projectId} onChange={e => pickProject(e.target.value)}>
            <option value="">— Không gắn dự án —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></div>
        <div className="field"><label>Cách tính</label>
          <select value={kind} onChange={e => setKind(e.target.value)}>
            <option value="hourly">Theo giờ × đơn giá</option>
            <option value="fixed">Khoán (số tiền cố định)</option>
          </select></div>
        {kind === 'hourly' ? <>
          <div className="field"><label>Số giờ (mặc định = giờ chưa thanh toán)</label><input type="number" min="0" step="0.5" value={hours} onChange={e => setHours(e.target.value)} /></div>
          <div className="field"><label>Đơn giá giờ</label><input value={money(rate)} disabled /></div>
          {/* v3.13: bày rõ sổ giờ để không phải tự nhớ đã trả bao nhiêu */}
          {projectId && <div className="field full" style={{ fontSize: '.8rem', color: 'var(--muted)', background: 'var(--bg)', padding: '8px 10px', borderRadius: 8 }}>
            Dự án này: đã log <b>{daLog}h</b> · đã chốt phiếu <b>{daChot}h</b> · <b style={{ color: conLai > 0 ? 'var(--accent)' : 'var(--muted)' }}>còn {conLai}h chưa trả</b>
            {daChot > 0 && <span> — số giờ đã nằm trong phiếu trước (kể cả phiếu chờ trả) đã được trừ sẵn.</span>}
          </div>}
        </> : (
          <div className="field"><label>Số tiền khoán (đ)</label><input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} /></div>
        )}
        <div className="field full"><label>Ghi chú</label><input value={note} onChange={e => setNote(e.target.value)} placeholder="VD: Dựng 5 video social" /></div>
        {vuot && <div className="field full" style={{ fontSize: '.82rem', color: 'var(--danger)', fontWeight: 600 }}>
          ⚠ Đang chốt {hours}h nhưng dự án chỉ còn {conLai}h chưa trả — kiểm tra lại kẻo trả trùng.
        </div>}
        <div className="field full" style={{ fontSize: '.9rem' }}>Sẽ tạo khoản phải trả: <b style={{ color: 'var(--primary)' }}>{money(preview)}</b></div>
      </div>
    </Modal>
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
