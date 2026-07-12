'use client';
import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Icon, Forbidden, useToast } from '@/components/ui';

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
        <div className="card">
          <div className="card-body" style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
            <b style={{ color: 'var(--fg)' }}>Agency ERP v2.0</b> — đa người dùng, phân quyền 3 cấp.<br />
            Dev: SQLite trên máy này. Khi deploy lên Vercel + Supabase: đổi <code>provider</code> trong
            <code> prisma/schema.prisma</code> thành <code>postgresql</code> và cập nhật <code>DATABASE_URL</code>.
          </div>
        </div>
      </div>
    </div>
  );
}
