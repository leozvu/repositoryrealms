'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useResource, Icon, Modal, FormModal, ConfirmDialog, EmptyState, Badge, useToast, useRoleLabels } from '@/components/ui';
import { money, fmtDate, todayISO, initials } from '@/lib/format';
import { ROLES, ROLE_LABEL, rolesOf, hasAny, isDirector } from '@/lib/perm';

/* ---------- Modal tài khoản: đa vai trò (checkbox) + nhóm ---------- */
function UserModal({ row, teams, canRoles, onSave, onClose }) {
  const RL = useRoleLabels();
  const [f, setF] = useState(() => row
    ? { name: row.name, title: row.title || '', phone: row.phone || '', birthday: row.birthday || '', salary: row.salary || 0, teamId: row.teamId || '', status: row.status, roles: rolesOf(row), password: '', reset2fa: false }
    : { name: '', email: '', password: '', title: '', phone: '', birthday: '', salary: 0, teamId: '', status: 'active', roles: ['STAFF'] });
  const toggleRole = r => setF(x => ({ ...x, roles: x.roles.includes(r) ? x.roles.filter(v => v !== r) : [...x.roles, r] }));
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  return (
    <Modal title={row ? `Sửa: ${row.name}` : 'Tạo tài khoản nhân sự'} onClose={onClose} large
      footer={<><button className="btn btn-outline" onClick={onClose}>Hủy</button>
        <button className="btn btn-primary" onClick={() => onSave(f)}>Lưu</button></>}>
      <div className="form-grid">
        <div className="field"><label>Họ tên <span className="req">*</span></label><input value={f.name} onChange={e => set('name', e.target.value)} /></div>
        {!row && <div className="field"><label>Email đăng nhập <span className="req">*</span></label><input type="email" value={f.email} onChange={e => set('email', e.target.value)} /></div>}
        <div className="field"><label>{row ? 'Đặt lại mật khẩu (bỏ trống nếu giữ)' : 'Mật khẩu *'}</label><input value={f.password} onChange={e => set('password', e.target.value)} placeholder="Tối thiểu 6 ký tự" /></div>
        <div className="field"><label>Chức danh</label><input value={f.title} onChange={e => set('title', e.target.value)} /></div>
        <div className="field"><label>Điện thoại</label><input value={f.phone} onChange={e => set('phone', e.target.value)} /></div>
        <div className="field"><label>Ngày sinh</label><input type="date" value={f.birthday || ''} onChange={e => set('birthday', e.target.value)} /></div>
        <div className="field"><label>Lương tháng (đ)</label><input type="number" min="0" value={f.salary} onChange={e => set('salary', e.target.value)} /></div>
        <div className="field"><label>Nhóm</label>
          <select value={f.teamId} onChange={e => set('teamId', e.target.value)}>
            <option value="">— Không thuộc nhóm —</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        {row && <div className="field"><label>Trạng thái</label>
          <select value={f.status} onChange={e => set('status', e.target.value)}>
            <option value="active">Đang làm việc</option><option value="inactive">Đã nghỉ (khóa đăng nhập)</option></select></div>}
        {canRoles && (
          <div className="field full"><label>Vai trò (chọn nhiều — cộng quyền)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
              {ROLES.map(r => (
                <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.83rem', cursor: 'pointer', padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 8, background: f.roles.includes(r) ? 'var(--info-soft)' : 'var(--card)' }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={f.roles.includes(r)} onChange={() => toggleRole(r)} />
                  {RL[r] || ROLE_LABEL[r]}
                </label>
              ))}
            </div>
            <div className="hint">Giám đốc = toàn quyền · Trưởng nhóm cần được gán làm lead của một nhóm bên dưới</div>
          </div>
        )}
        {row && canRoles && (
          <div className="field full">
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={!!f.reset2fa} onChange={e => set('reset2fa', e.target.checked)} />
              Reset đăng nhập 2 lớp (2FA) — dùng khi nhân sự mất điện thoại
            </label>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function StaffPage() {
  const { data: session } = useSession();
  const RL = useRoleLabels();
  const me = session?.user;
  const canRoles = isDirector(me);
  const canHR = hasAny(me, ['HR']);
  const canSalary = hasAny(me, ['HR', 'ACCOUNTANT']);
  const users = useResource('users');
  const leaves = useResource('leaves');
  const teams = useResource('teams');
  const [modal, setModal] = useState(null);
  const [leaveQuota, setLeaveQuota] = useState(12);
  const toast = useToast();
  useEffect(() => { fetch('/api/settings').then(r => r.ok ? r.json() : null).then(d => d && setLeaveQuota(+d.leaveQuota || 12)).catch(() => {}); }, []);

  const uName = id => users.rows.find(u => u.id === id)?.name || '—';
  const teamName = id => teams.rows.find(t => t.id === id)?.name;
  // v3.7: phép năm đã dùng (đơn phép năm được duyệt trong năm nay)
  const leaveDays = l => Math.round((new Date(l.to) - new Date(l.from)) / 86400000) + 1;
  const usedLeave = uid => leaves.rows
    .filter(l => l.userId === uid && l.status === 'approved' && l.type === 'annual' && String(l.from).startsWith(String(new Date().getFullYear())))
    .reduce((s, l) => s + leaveDays(l), 0);
  const myRemaining = me ? Math.max(0, leaveQuota - usedLeave(me.id)) : leaveQuota;

  const callUsers = async (method, body) => {
    const res = await fetch('/api/users', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { toast(json.error || 'Có lỗi', 'error'); return null; }
    await users.refresh();
    return json;
  };
  const saveUser = async f => {
    const body = { name: f.name, title: f.title, phone: f.phone, birthday: f.birthday || null, salary: +f.salary || 0, teamId: f.teamId || null, status: f.status, roles: f.roles };
    if (f.password) body.password = f.password;
    if (f.reset2fa) body.reset2fa = true;
    let r;
    if (modal.row) r = await callUsers('PUT', { id: modal.row.id, ...body });
    else {
      if (!f.email || !f.password) return toast('Cần email và mật khẩu', 'error');
      r = await callUsers('POST', { ...body, email: f.email, password: f.password });
    }
    if (r) { toast(modal.row ? 'Đã cập nhật' : 'Đã tạo tài khoản'); setModal(null); }
  };

  const LEAVE_FIELDS = [
    ...(canHR ? [{ key: 'userId', label: 'Nhân sự', type: 'select', options: users.rows.filter(u => u.status === 'active').map(u => ({ value: u.id, label: u.name })), required: true }] : []),
    { key: 'type', label: 'Loại', type: 'select', options: [{ value: 'annual', label: 'Phép năm' }, { value: 'sick', label: 'Nghỉ ốm' }, { value: 'unpaid', label: 'Không lương' }] },
    { key: 'from', label: 'Từ ngày', type: 'date', required: true },
    { key: 'to', label: 'Đến ngày', type: 'date', required: true },
    { key: 'note', label: 'Lý do / ghi chú', type: 'textarea', full: true },
  ];
  const TEAM_FIELDS = [
    { key: 'name', label: 'Tên nhóm', required: true, full: true },
    { key: 'leadId', label: 'Trưởng nhóm', type: 'select', options: [{ value: '', label: '— Chưa gán —' }, ...users.rows.filter(u => u.status === 'active').map(u => ({ value: u.id, label: u.name }))] },
  ];

  return (
    <>
      <div className="toolbar">
        <span style={{ fontSize: '.85rem', color: 'var(--muted)' }}>
          {users.rows.filter(u => u.status === 'active').length} nhân sự đang hoạt động
          {canSalary && <> · Quỹ lương: <b style={{ color: 'var(--fg)' }}>{money(users.rows.filter(u => u.status === 'active').reduce((s, u) => s + (u.salary || 0), 0))}</b></>}
        </span>
        <div className="spacer"></div>
        {canRoles && <button className="btn btn-primary" onClick={() => setModal({ mode: 'user', row: null })}><Icon name="plus" size={16} /><span>Tạo tài khoản</span></button>}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nhân sự</th><th>Vai trò</th><th>Nhóm</th><th>Chức danh</th>{canSalary && <th className="num">Lương tháng</th>}<th>Trạng thái</th><th></th></tr></thead>
          <tbody>
            {users.rows.map(u => (
              <tr key={u.id}>
                <td><Link href={`/staff/${u.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <span className="cell-person"><span className="avatar">{initials(u.name)}</span>
                  <span><span className="cell-main" style={{ color: 'var(--primary)' }}>{u.name}{u.id === me?.id ? ' (tôi)' : ''}</span><span className="cell-sub">{u.email}</span></span></span></Link></td>
                <td><div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {rolesOf(u).map(r => <span key={r} className={`role-chip role-${r}`}>{RL[r] || r}</span>)}</div></td>
                <td>{teamName(u.teamId) || '—'}</td>
                <td>{u.title || '—'}</td>
                {canSalary && <td className="num" style={{ fontWeight: 700 }}>{u.salary !== undefined ? money(u.salary) : '•••'}</td>}
                <td><Badge map="user" k={u.status} /></td>
                <td><div className="row-actions">
                  {(canRoles || canHR || u.id === me?.id) &&
                    <button className="icon-btn" onClick={() => setModal({ mode: 'user', row: u })} aria-label="Sửa"><Icon name="edit" size={16} /></button>}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid two-col" style={{ marginTop: 24 }}>
        <div>
          <div className="toolbar" style={{ marginBottom: 10 }}>
            <span className="card-title">Nghỉ phép</span>
            <span className="badge b-blue" title={`Quota ${leaveQuota} ngày phép năm — chỉnh trong Cài đặt`}>
              <span className="dot"></span>Tôi còn {myRemaining}/{leaveQuota} ngày phép</span>
            <div className="spacer"></div>
            <button className="btn btn-outline btn-sm" onClick={() => setModal({ mode: 'leave' })}><Icon name="plus" size={14} /><span>Xin nghỉ phép</span></button>
          </div>
          <div className="table-wrap">
            <table style={{ minWidth: 0 }}>
              <thead><tr><th>Nhân sự</th><th>Thời gian</th><th>Trạng thái</th><th></th></tr></thead>
              <tbody>
                {leaves.rows.map(l => (
                  <tr key={l.id}>
                    <td>{uName(l.userId)}</td>
                    <td>{fmtDate(l.from)} → {fmtDate(l.to)}</td>
                    <td><Badge map="leave" k={l.status} /></td>
                    <td>{canHR && <button className="icon-btn danger" onClick={() => setModal({ mode: 'delLeave', row: l })} aria-label="Xóa"><Icon name="trash" size={16} /></button>}</td>
                  </tr>
                ))}
                {!leaves.rows.length && <tr><td colSpan={4}><EmptyState title="Chưa có đơn nghỉ phép" /></td></tr>}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: '.74rem', color: 'var(--muted)', marginTop: 8 }}>Đơn mới sẽ đi qua chuỗi duyệt: Trưởng nhóm → HR (&gt;3 ngày). Duyệt trong mục <b>Phê duyệt</b>.</p>
        </div>
        <div>
          <div className="toolbar" style={{ marginBottom: 10 }}>
            <span className="card-title">Nhóm làm việc</span>
            <div className="spacer"></div>
            {(canRoles || canHR) && <button className="btn btn-outline btn-sm" onClick={() => setModal({ mode: 'team' })}><Icon name="plus" size={14} /><span>Tạo nhóm</span></button>}
          </div>
          <div className="table-wrap">
            <table style={{ minWidth: 0 }}>
              <thead><tr><th>Nhóm</th><th>Trưởng nhóm</th><th className="num">Thành viên</th><th></th></tr></thead>
              <tbody>
                {teams.rows.map(t => (
                  <tr key={t.id}>
                    <td><span className="cell-main">{t.name}</span></td>
                    <td>{uName(t.leadId)}</td>
                    <td className="num">{users.rows.filter(u => u.teamId === t.id).length}</td>
                    <td>{(canRoles || canHR) && <button className="icon-btn" onClick={() => setModal({ mode: 'team', row: t })} aria-label="Sửa"><Icon name="edit" size={16} /></button>}</td>
                  </tr>
                ))}
                {!teams.rows.length && <tr><td colSpan={4}><EmptyState title="Chưa có nhóm" sub="Tạo nhóm và gán trưởng nhóm để bật quy trình duyệt theo nhóm" /></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modal?.mode === 'user' && <UserModal row={modal.row} teams={teams.rows} canRoles={canRoles} onSave={saveUser} onClose={() => setModal(null)} />}
      {modal?.mode === 'leave' && <FormModal title={`Đơn nghỉ phép — bạn còn ${myRemaining}/${leaveQuota} ngày phép năm`} fields={LEAVE_FIELDS} data={{ from: todayISO(), to: todayISO(), type: 'annual' }}
        onClose={() => setModal(null)} onSave={async d => {
          const days = Math.round((new Date(d.to) - new Date(d.from)) / 86400000) + 1;
          const target = d.userId || me?.id; // HR gửi hộ thì tính quota của người đó
          const remain = Math.max(0, leaveQuota - usedLeave(target));
          if (d.type === 'annual' && days > remain && !confirm(`Đơn ${days} ngày VƯỢT số phép còn lại (${remain}) của ${uName(target)}. Vẫn gửi? (phần vượt thường tính không lương)`)) return;
          const r = await leaves.create(d);
          if (r) toast(r._notice || 'Đã gửi đơn — theo dõi trong mục Phê duyệt');
        }} />}
      {modal?.mode === 'team' && <FormModal title={modal.row ? 'Sửa nhóm' : 'Tạo nhóm'} fields={TEAM_FIELDS} data={modal.row ? { ...modal.row, leadId: modal.row.leadId || '' } : {}}
        onClose={() => setModal(null)} onSave={async d => {
          const body = { name: d.name, leadId: d.leadId || null };
          if (modal.row) await teams.update(modal.row.id, body); else await teams.create(body);
          toast('Đã lưu nhóm');
        }} />}
      {modal?.mode === 'delLeave' && <ConfirmDialog msg="Xóa đơn nghỉ phép này?" onClose={() => setModal(null)}
        onYes={async () => { await leaves.remove(modal.row.id); toast('Đã xóa'); }} />}
    </>
  );
}
