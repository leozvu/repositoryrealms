'use client';
import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Icon, Forbidden, useToast, useResource, Modal, ConfirmDialog, AsyncButton, useRoleLabels } from '@/components/ui';
import { ROLES, ROLE_LABEL } from '@/lib/perm';
import { MODULE_GROUPS, MODULE_PRESETS } from '@/lib/modules';
import RealmPilotControl from '@/components/realm/RealmPilotControl';
import RealmPilotRehearsal from '@/components/realm/RealmPilotRehearsal';
import RealmPilotOperations from '@/components/realm/RealmPilotOperations';
import RealmFeedbackOperations from '@/components/realm/RealmFeedbackOperations';
import RealmExperienceScorecard from '@/components/realm/RealmExperienceScorecard';
import RealmReleaseCandidateDossier from '@/components/realm/RealmReleaseCandidateDossier';
import CeoFederationPolicy from '@/components/ceo/CeoFederationPolicy';

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
  const [deleteWebhook, setDeleteWebhook] = useState(null);
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
  const toggleKey = async k => {
    const r = await fetch('/api/apikeys', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: k.id, active: !k.active }) });
    if (!r.ok) return toast('Không thể cập nhật API key', 'error');
    await loadKeys(); toast(k.active ? 'Đã khóa API key' : 'Đã mở API key');
  };
  const delKey = async k => {
    if (!confirm(`Xóa key "${k.name}"? Ứng dụng đang dùng key này sẽ mất truy cập.`)) return;
    const r = await fetch('/api/apikeys', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: k.id }) });
    if (!r.ok) return toast('Không thể xóa API key', 'error');
    await loadKeys(); toast('Đã xóa key');
  };

  const addWebhook = async () => {
    if (!wUrl.trim().startsWith('http')) return toast('URL webhook không hợp lệ', 'error');
    const events = wEvents.split(',').map(x => x.trim()).filter(Boolean);
    const result = await webhooks.create({ url: wUrl.trim(), events: JSON.stringify(events.length ? events : ['*']), secret: wSecret.trim() || null });
    if (!result) return false;
    setWUrl(''); setWEvents('*'); setWSecret(''); toast('Đã thêm webhook');
    return true;
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
              <AsyncButton className="btn btn-outline btn-sm" onClick={() => toggleKey(k)}>{k.active ? 'Khóa' : 'Mở'}</AsyncButton>
              <AsyncButton className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => delKey(k)} aria-label={`Xóa API key ${k.name}`}><Icon name="trash" size={14} /></AsyncButton>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <input style={{ flex: 1, minWidth: 140 }} placeholder="Tên key (VD: n8n, Zapier…)" value={kName} onChange={e => setKName(e.target.value)} />
            <select multiple size={3} value={kRoles} onChange={e => setKRoles([...e.target.selectedOptions].map(o => o.value))} title="Ctrl+click chọn nhiều vai trò">
              {ROLES.map(r => <option key={r} value={r}>{RL[r] || ROLE_LABEL[r]}</option>)}
            </select>
            <AsyncButton className="btn btn-primary btn-sm" pendingLabel="Đang tạo…" onClick={createKey}><Icon name="plus" size={14} /> Tạo key</AsyncButton>
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
              <AsyncButton className="btn btn-outline btn-sm" disabled={webhooks.mutating} onClick={async () => { const r = await webhooks.update(h.id, { active: !h.active }); if (r) toast(h.active ? 'Đã tắt webhook' : 'Đã bật webhook'); }}>{h.active ? 'Tắt' : 'Bật'}</AsyncButton>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setDeleteWebhook(h)} aria-label={`Xóa webhook ${h.url}`}><Icon name="trash" size={14} /></button>
            </div>
          ))}
          <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            <input placeholder="https://… (URL nhận webhook)" value={wUrl} onChange={e => setWUrl(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input style={{ flex: 1, minWidth: 120 }} placeholder="Sự kiện (mặc định *)" value={wEvents} onChange={e => setWEvents(e.target.value)} />
              <input style={{ flex: 1, minWidth: 120 }} placeholder="Secret (tùy chọn)" value={wSecret} onChange={e => setWSecret(e.target.value)} />
              <AsyncButton className="btn btn-primary btn-sm" disabled={webhooks.mutating} pendingLabel="Đang thêm…" onClick={addWebhook}><Icon name="plus" size={14} /> Thêm</AsyncButton>
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
      {deleteWebhook && <ConfirmDialog msg={`Xóa webhook "${deleteWebhook.url}"? Hệ thống tích hợp sẽ ngừng nhận sự kiện.`}
        onClose={() => setDeleteWebhook(null)} onYes={async () => { const r = await webhooks.remove(deleteWebhook.id); if (!r) return false; toast('Đã xóa webhook'); }} />}
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
    // v3.37: serviceLines soạn dạng text mỗi dòng một mảng → chuẩn hóa thành mảng khi lưu
    const serviceLines = (Array.isArray(s.serviceLines) ? s.serviceLines : String(s.serviceLines || '').split('\n'))
      .map(x => String(x).trim()).filter(Boolean);
    const res = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...s, serviceLines }) });
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
            <div className="field full">
              <label>Mảng dịch vụ (mỗi dòng một mảng — dùng cho Dự án, Khách hàng, Bảng giá)</label>
              <textarea rows={5} value={Array.isArray(s.serviceLines) ? s.serviceLines.join('\n') : (s.serviceLines ?? '')}
                onChange={e => setS({ ...s, serviceLines: e.target.value })}
                placeholder={'Digital Ads\nSocial Media\nSeeding\nLivestream…'} />
              <div className="hint">Nhân viên chỉ chọn từ danh sách này; muốn thêm mảng mới thì Giám đốc bổ sung tại đây.</div>
            </div>
            <F k="approveQuoteOver" label="Ngưỡng duyệt báo giá (đ)" type="number" />
            <F k="approveExpenseOver" label="Ngưỡng duyệt khoản chi (đ) — nhập 0 nếu muốn MỌI khoản chi đều phải duyệt" type="number" />
            <F k="approveExpenseDirectorOver" label="Chi cần thêm Giám đốc duyệt từ (đ)" type="number" />
            <F k="commissionRate" label="Tỷ lệ hoa hồng mặc định (%)" type="number" />
            <F k="leaveQuota" label="Ngày phép năm / nhân sự" type="number" />
            <F k="workStart" label="Giờ vào ca chuẩn (HH:MM)" />
            <F k="workEnd" label="Giờ tan ca chuẩn (HH:MM)" />
            <F k="otMultiplier" label="Hệ số lương làm thêm (OT)" type="number" />
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

            {/* v3.17: bật/tắt phân hệ theo loại hình công ty */}
            <div className="field full" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <label style={{ fontWeight: 700 }}>Phân hệ sử dụng</label>
              <div className="hint" style={{ marginBottom: 8 }}>
                Tắt phân hệ không dùng để menu gọn lại. Phân hệ lõi (Bảng điều khiển, Khách hàng, Hóa đơn, Thu/Chi, Nhân sự, Cài đặt…) luôn bật.
                {!Array.isArray(s.modules) && <b style={{ color: 'var(--warn, #D97706)' }}> Đang bật tất cả (mặc định) — tick chọn để tùy chỉnh.</b>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {Object.entries(MODULE_PRESETS).map(([k, p]) => (
                  <button key={k} type="button" className="btn btn-outline btn-sm"
                    onClick={() => setS({ ...s, modules: [...p.mods] })}>Mẫu: {p.label}</button>
                ))}
                <button type="button" className="btn btn-outline btn-sm"
                  onClick={() => setS({ ...s, modules: MODULE_GROUPS.filter(g => !g.soon).map(g => g.mod) })}>Bật tất cả</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
                {MODULE_GROUPS.map(g => {
                  // null modules = công ty cũ đang bật hết → tick sẵn để không "mất" phân hệ khi lưu
                  const cur = Array.isArray(s.modules) ? s.modules : MODULE_GROUPS.filter(x => !x.soon).map(x => x.mod);
                  const on = cur.includes(g.mod);
                  return (
                    <label key={g.mod} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', background: on ? 'var(--info-soft)' : 'var(--card)', opacity: g.soon ? 0.6 : 1 }}>
                      <input type="checkbox" style={{ width: 'auto', marginTop: 2 }} checked={on}
                        onChange={e => {
                          const set = new Set(cur);
                          e.target.checked ? set.add(g.mod) : set.delete(g.mod);
                          setS({ ...s, modules: [...set] });
                        }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '.85rem' }}>{g.label}{g.soon && <span className="badge b-gray" style={{ marginLeft: 6 }}>sắp có</span>}</div>
                        <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{g.desc}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="field full" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <label style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="mail" size={15} /> Email công ty (SMTP) — gửi báo giá/hóa đơn cho khách (v3.9)</label>
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
              <AsyncButton className="btn btn-outline btn-sm" pendingLabel="Đang gửi thử…" onClick={async () => {
                const save = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });
                if (!save.ok) return toast('Lưu cài đặt thất bại', 'error');
                const r = await fetch('/api/email/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'test', to: s.smtpUser }) });
                const j = await r.json().catch(() => ({}));
                toast(r.ok ? `Đã gửi email thử tới ${s.smtpUser} — kiểm tra hộp thư` : j.error || 'Gửi thất bại', r.ok ? 'success' : 'error');
              }}>Lưu &amp; gửi email thử tới chính hộp thư này</AsyncButton>
            </div>
            <div className="field full">
              <label>OpenRouter API key (bật AI Copilot)</label>
              <input type="password" value={s.openRouterKey ?? ''} onChange={e => setS({ ...s, openRouterKey: e.target.value })} placeholder="sk-or-v1-…  (tạo tại openrouter.ai/keys)" autoComplete="off" />
              <div className="hint">Dùng cho menu AI Copilot — chat với dữ liệu công ty, viết email/proposal. Không có key thì các tính năng AI rule-based (AI Summary, Lead Score) vẫn chạy bình thường.</div>
            </div>
          </div>
          <div style={{ marginTop: 16 }}><AsyncButton className="btn btn-primary" pendingLabel="Đang lưu…" onClick={save}>Lưu cài đặt</AsyncButton></div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <CeoFederationPolicy />
        <RealmPilotControl />
        <RealmPilotRehearsal />
        <RealmPilotOperations />
        <RealmFeedbackOperations />
        <RealmExperienceScorecard />
        <RealmReleaseCandidateDossier />
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
