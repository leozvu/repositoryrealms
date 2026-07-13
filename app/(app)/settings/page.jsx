'use client';
import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Icon, Forbidden, useToast, useResource, Modal, useRoleLabels } from '@/components/ui';
import { ROLES, ROLE_LABEL } from '@/lib/perm';

/* ---------- v3.3: API key + Webhook (chỉ Giám đốc) ---------- */
function ApiSection() {
  const RL = useRoleLabels();
  const [keys, setKeys] = useState([]);
  const [newKey, setNewKey] = useState(null); // {name, key} — hiện raw đúng 1 lần
  const [kName, setKName] = useState('');
  const [kRoles, setKRoles] = useState(['PM']);
  const webhooks = useResource('webhooks');
  const [wUrl, setWUrl] = useState('');
  const [wEvents, setWEvents] = useState('*');
  const [wSecret, setWSecret] = useState('');
  const toast = useToast();

  const loadKeys = () => fetch('/api/apikeys').then(r => r.ok ? r.json() : []).then(setKeys);
  useEffect(() => { loadKeys(); }, []);

  const createKey = async () => {
    if (!kName.trim()) return toast('Cần tên key', 'error');
    const r = await fetch('/api/apikeys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: kName.trim(), roles: kRoles }) });
    const j = await r.json();
    if (!r.ok) return toast(j.error || 'Lỗi', 'error');
    setNewKey({ name: kName.trim(), key: j.key }); setKName(''); loadKeys();
  };
  const toggleKey = async k => { await fetch('/api/apikeys', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: k.id, active: !k.active }) }); loadKeys(); };
  const delKey = async k => { if (!confirm(`Xóa key "${k.name}"? Ứng dụng đang dùng key này sẽ mất truy cập.`)) return; await fetch('/api/apikeys', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: k.id }) }); loadKeys(); toast('Đã xóa key'); };

  const addWebhook = async () => {
    if (!wUrl.trim().startsWith('http')) return toast('URL webhook không hợp lệ', 'error');
    const events = wEvents.split(',').map(x => x.trim()).filter(Boolean);
    await webhooks.create({ url: wUrl.trim(), events: JSON.stringify(events.length ? events : ['*']), secret: wSecret.trim() || null });
    setWUrl(''); setWEvents('*'); setWSecret(''); toast('Đã thêm webhook');
  };

  return (
    <div className="card">
      <div className="card-head"><span className="card-title">API mở & Webhook</span></div>
      <div className="card-body" style={{ display: 'grid', gap: 14, fontSize: '.83rem' }}>
        <div>
          <b>API key</b> — gọi <code>/api/v1/&lt;resource&gt;</code> với header <code>Authorization: Bearer &lt;key&gt;</code>. Key mang vai trò như một người dùng (đi qua đúng phân quyền + phê duyệt). Lưu ý: phạm vi dữ liệu cũng áp dụng — VD key vai trò AM chỉ thấy lead chưa gán; cần đọc toàn bộ thì cấp vai trò Giám đốc (cân nhắc rủi ro).
          {keys.map(k => (
            <div key={k.id} className="act-item" style={{ alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div className="act-title">{k.name} <code style={{ fontSize: '.72rem' }}>{k.prefix}…</code>{!k.active && <span className="badge b-gray" style={{ marginLeft: 6 }}><span className="dot"></span>Đã khóa</span>}</div>
                <div className="act-sub">{JSON.parse(k.roles || '[]').map(r => RL[r] || r).join(', ')} · dùng lần cuối: {k.lastUsed ? new Date(k.lastUsed).toLocaleString('vi-VN') : 'chưa'}</div>
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => toggleKey(k)}>{k.active ? 'Khóa' : 'Mở'}</button>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => delKey(k)}><Icon name="trash" size={14} /></button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <input style={{ flex: 1, minWidth: 140 }} placeholder="Tên key (VD: n8n, Zapier…)" value={kName} onChange={e => setKName(e.target.value)} />
            <select multiple size={3} value={kRoles} onChange={e => setKRoles([...e.target.selectedOptions].map(o => o.value))} title="Ctrl+click chọn nhiều vai trò">
              {ROLES.map(r => <option key={r} value={r}>{RL[r] || ROLE_LABEL[r]}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" onClick={createKey}><Icon name="plus" size={14} /> Tạo key</button>
          </div>
        </div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <b>Webhook</b> — bắn POST khi dữ liệu thay đổi (n8n/Zapier/hệ thống khác). Sự kiện: <code>*</code>, <code>leads.*</code>, <code>invoices.update</code>… Có secret thì payload được ký HMAC-SHA256 ở header <code>X-Signature</code>.
          {webhooks.rows.map(h => (
            <div key={h.id} className="act-item" style={{ alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="act-title" style={{ wordBreak: 'break-all' }}>{h.url}{!h.active && <span className="badge b-gray" style={{ marginLeft: 6 }}><span className="dot"></span>Tắt</span>}</div>
                <div className="act-sub">{JSON.parse(h.events || '[]').join(', ')} · lần gọi cuối: {h.lastStatus || 'chưa'}</div>
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => webhooks.update(h.id, { active: !h.active })}>{h.active ? 'Tắt' : 'Bật'}</button>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={async () => { await webhooks.remove(h.id); toast('Đã xóa webhook'); }}><Icon name="trash" size={14} /></button>
            </div>
          ))}
          <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            <input placeholder="https://… (URL nhận webhook)" value={wUrl} onChange={e => setWUrl(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input style={{ flex: 1, minWidth: 120 }} placeholder="Sự kiện (mặc định *)" value={wEvents} onChange={e => setWEvents(e.target.value)} />
              <input style={{ flex: 1, minWidth: 120 }} placeholder="Secret (tùy chọn)" value={wSecret} onChange={e => setWSecret(e.target.value)} />
              <button className="btn btn-primary btn-sm" onClick={addWebhook}><Icon name="plus" size={14} /> Thêm</button>
            </div>
          </div>
        </div>
      </div>
      {newKey && (
        <Modal title={`API key "${newKey.name}" đã tạo`} onClose={() => setNewKey(null)}
          footer={<button className="btn btn-primary" onClick={() => { navigator.clipboard?.writeText(newKey.key); toast('Đã copy key'); setNewKey(null); }}>Copy & đóng</button>}>
          <p style={{ fontSize: '.85rem', marginBottom: 10 }}>Lưu key này ngay — <b>chỉ hiển thị một lần duy nhất</b>:</p>
          <code style={{ display: 'block', padding: '10px 12px', background: 'var(--bg, #f1f5f9)', borderRadius: 8, wordBreak: 'break-all', fontWeight: 700 }}>{newKey.key}</code>
        </Modal>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const [s, setS] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);
  const toast = useToast();

  useEffect(() => { fetch('/api/settings').then(r => r.json()).then(setS); }, []);
  if (session && session.user.role !== 'DIRECTOR') return <Forbidden />;
  if (!s) return null;

  const save = async () => {
    const res = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });
    toast(res.ok ? 'Đã lưu cài đặt' : 'Có lỗi khi lưu', res.ok ? 'success' : 'error');
  };

  const importV1 = async file => {
    setImporting(true);
    try {
      const data = JSON.parse(await file.text());
      const res = await fetch('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      toast(`Import xong: ${Object.entries(json.stats).map(([k, v]) => `${v} ${k}`).join(', ')}`);
      alert('Import thành công!\n\nLưu ý: các tài khoản nhân sự được tạo từ file có mật khẩu tạm là "doimatkhau" — hãy yêu cầu mọi người đổi mật khẩu.');
    } catch (e) { toast('Import lỗi: ' + e.message, 'error'); }
    setImporting(false);
  };

  const F = ({ k, label, type = 'text', full }) => (
    <div className={`field ${full ? 'full' : ''}`}>
      <label>{label}</label>
      <input type={type} value={s[k] ?? ''} onChange={e => setS({ ...s, [k]: type === 'number' ? +e.target.value || 0 : e.target.value })} />
    </div>
  );

  return (
    <div className="grid two-col">
      <div className="card">
        <div className="card-head"><span className="card-title">Thông tin công ty</span></div>
        <div className="card-body">
          <div className="form-grid">
            <F k="company" label="Tên công ty" full />
            <F k="taxCode" label="Mã số thuế" />
            <F k="phone" label="Điện thoại" />
            <F k="email" label="Email" type="email" />
            <F k="vat" label="VAT mặc định (%)" type="number" />
            <F k="monthlyTarget" label="Mục tiêu doanh thu tháng (đ)" type="number" />
            <F k="address" label="Địa chỉ" full />
            <F k="bank" label="Thông tin ngân hàng (in trên hóa đơn)" full />
            <F k="approveQuoteOver" label="Ngưỡng duyệt báo giá (đ)" type="number" />
            <F k="approveExpenseOver" label="Ngưỡng duyệt khoản chi (đ)" type="number" />
            <F k="approveExpenseDirectorOver" label="Chi cần thêm Giám đốc duyệt từ (đ)" type="number" />
            <F k="commissionRate" label="Tỷ lệ hoa hồng mặc định (%)" type="number" />
            <F k="leaveQuota" label="Ngày phép năm / nhân sự" type="number" />
            <F k="probNew" label="Xác suất chốt: Mới (%)" type="number" />
            <F k="probContacted" label="Xác suất: Đã liên hệ (%)" type="number" />
            <F k="probProposal" label="Xác suất: Gửi đề xuất (%)" type="number" />
            <F k="probNegotiation" label="Xác suất: Thương lượng (%)" type="number" />
            <div className="field full">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={!!s.autoAssignLeads}
                  onChange={e => setS({ ...s, autoAssignLeads: e.target.checked })} />
                Tự chia lead chưa gán cho AM đang giữ ít lead mở nhất
              </label>
            </div>
            <div className="field full">
              <label>Tên gọi chức danh theo công ty (v3.6) — để trống dùng tên mặc định; quyền hạn không đổi</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, marginTop: 4 }}>
                {ROLES.map(r => (
                  <input key={r} placeholder={ROLE_LABEL[r]} value={s.roleLabels?.[r] ?? ''}
                    onChange={e => setS({ ...s, roleLabels: { ...(s.roleLabels || {}), [r]: e.target.value } })} />
                ))}
              </div>
              <div className="hint">VD: công ty thương mại điện tử đổi "Quản lý dự án" → "Trưởng phòng Vận hành", "Account/Sales" → "Kinh doanh"</div>
            </div>
            <div className="field full" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <label style={{ fontWeight: 700 }}>📧 Email công ty (SMTP) — gửi báo giá/hóa đơn cho khách (v3.9)</label>
            </div>
            <F k="smtpHost" label="Máy chủ SMTP" />
            <F k="smtpPort" label="Port (465=SSL, 587=TLS)" type="number" />
            <F k="smtpUser" label="Tài khoản email" />
            <div className="field">
              <label>Mật khẩu email</label>
              <input type="password" value={s.smtpPass ?? ''} onChange={e => setS({ ...s, smtpPass: e.target.value })} placeholder="••••••••" />
            </div>
            <F k="smtpFrom" label="Địa chỉ gửi (để trống = tài khoản)" full />
            <div className="field full">
              <button className="btn btn-outline btn-sm" onClick={async () => {
                const save = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });
                if (!save.ok) return toast('Lưu cài đặt thất bại', 'error');
                const r = await fetch('/api/email/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'test', to: s.smtpUser }) });
                const j = await r.json().catch(() => ({}));
                toast(r.ok ? `Đã gửi email thử tới ${s.smtpUser} — kiểm tra hộp thư` : j.error || 'Gửi thất bại', r.ok ? 'success' : 'error');
              }}>Lưu &amp; gửi email thử tới chính hộp thư này</button>
            </div>
            <div className="field full">
              <label>Claude API key (bật AI Copilot)</label>
              <input type="password" value={s.anthropicKey ?? ''} onChange={e => setS({ ...s, anthropicKey: e.target.value })} placeholder="sk-ant-…  (tạo tại console.anthropic.com)" />
              <div className="hint">Dùng cho menu AI Copilot — chat với dữ liệu công ty, viết email/proposal. Không có key thì các tính năng AI rule-based (AI Summary, Lead Score) vẫn chạy bình thường.</div>
            </div>
          </div>
          <div style={{ marginTop: 16 }}><button className="btn btn-primary" onClick={save}>Lưu cài đặt</button></div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card">
          <div className="card-head"><span className="card-title">Import dữ liệu từ bản offline (v1)</span></div>
          <div className="card-body">
            <p style={{ fontSize: '.83rem', color: 'var(--muted)', marginBottom: 14 }}>
              Ở bản v1 (thư mục agency-crm), vào <b>Cài đặt → Xuất dữ liệu (JSON)</b> rồi chọn file đó ở đây.
              Toàn bộ khách hàng, dự án, hóa đơn, thu chi, nhân sự… sẽ được chuyển sang hệ thống mới.
            </p>
            <button className="btn btn-outline" disabled={importing} onClick={() => fileRef.current.click()}>
              <Icon name="upload" size={16} /> {importing ? 'Đang import…' : 'Chọn file JSON v1'}
            </button>
            <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }}
              onChange={e => e.target.files[0] && importV1(e.target.files[0])} />
          </div>
        </div>
        <ApiSection />
        <div className="card">
          <div className="card-body" style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
            <b style={{ color: 'var(--fg)' }}>Agency ERP v3.3</b> — đa người dùng, 7 vai trò cộng quyền.<br />
            Dev: SQLite trên máy này. Khi deploy lên Vercel + Supabase: đổi <code>provider</code> trong
            <code> prisma/schema.prisma</code> thành <code>postgresql</code> và cập nhật <code>DATABASE_URL</code>.
          </div>
        </div>
      </div>
    </div>
  );
}
