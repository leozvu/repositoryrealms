'use client';
// v3.36: Hướng dẫn thêm ERP vào Màn hình chính điện thoại (PWA) — iOS (Safari) + Android (Chrome).
// Minh họa bằng SVG vẽ tay (tự chứa, không ảnh ngoài, hiện đúng cả nền sáng/tối).
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui';

/* ---------- Khung điện thoại dùng chung ---------- */
const Phone = ({ children }) => (
  <svg viewBox="0 0 220 400" style={{ width: '100%', maxWidth: 190, display: 'block', margin: '0 auto' }} role="img">
    <rect x="10" y="8" width="200" height="384" rx="28" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
    <rect x="82" y="14" width="56" height="7" rx="3.5" fill="var(--border)" />
    {children}
  </svg>
);
// Vòng nhấn mạnh + mũi tên chỉ
const Ring = ({ cx, cy, r = 15 }) => (
  <>
    <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--primary)" strokeWidth="3" opacity="0.9" />
    <circle cx={cx} cy={cy} r={r + 6} fill="none" stroke="var(--primary)" strokeWidth="1.5" opacity="0.35" />
  </>
);
const Bar = ({ y, w = 110, x = 30, h = 7, o = 0.25 }) => <rect x={x} y={y} width={w} height={h} rx="3.5" fill="var(--fg)" opacity={o} />;

/* ---------- Minh họa iOS ---------- */
const IosOpen = () => (
  <Phone>
    <rect x="20" y="28" width="180" height="26" rx="6" fill="var(--bg)" />
    <rect x="30" y="36" width="120" height="10" rx="5" fill="var(--fg)" opacity="0.3" />
    <text x="110" y="150" textAnchor="middle" fontSize="13" fill="var(--muted)">Mở bằng</text>
    <circle cx="110" cy="190" r="26" fill="none" stroke="var(--primary)" strokeWidth="2.5" />
    <path d="M122 178 L102 198 L98 202 L118 182 Z" fill="var(--primary)" />
    <text x="110" y="235" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--fg)">Safari</text>
    <text x="110" y="256" textAnchor="middle" fontSize="10" fill="var(--danger)">Chrome trên iPhone KHÔNG thêm được</text>
    <rect x="20" y="352" width="180" height="34" rx="6" fill="var(--bg)" />
  </Phone>
);
const IosShare = () => (
  <Phone>
    <rect x="20" y="28" width="180" height="26" rx="6" fill="var(--bg)" />
    <rect x="30" y="36" width="120" height="10" rx="5" fill="var(--fg)" opacity="0.3" />
    <Bar y="80" /><Bar y="100" w="150" /><Bar y="120" w="90" /><Bar y="150" w="140" /><Bar y="170" w="120" />
    {/* thanh công cụ dưới của Safari */}
    <rect x="20" y="352" width="180" height="34" rx="6" fill="var(--bg)" />
    <path d="M50 375 L44 369 L56 369 Z" fill="var(--fg)" opacity="0.35" />
    {/* nút Chia sẻ */}
    <g>
      <rect x="103" y="360" width="14" height="17" rx="2" fill="none" stroke="var(--primary)" strokeWidth="2" />
      <path d="M110 356 L110 370 M105 361 L110 356 L115 361" stroke="var(--primary)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </g>
    <Ring cx={110} cy={368} r={19} />
    <text x="110" y="330" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--primary)">Bấm nút Chia sẻ</text>
    <path d="M110 336 L110 346 M106 342 L110 347 L114 342" stroke="var(--primary)" strokeWidth="2" fill="none" strokeLinecap="round" />
  </Phone>
);
const IosSheet = () => (
  <Phone>
    <Bar y="60" w="150" o="0.15" /><Bar y="78" w="110" o="0.15" />
    {/* bảng chia sẻ trượt lên */}
    <rect x="18" y="110" width="184" height="276" rx="14" fill="var(--bg)" stroke="var(--border)" />
    <rect x="94" y="118" width="32" height="4" rx="2" fill="var(--border)" />
    <rect x="28" y="136" width="164" height="34" rx="8" fill="var(--card)" stroke="var(--border)" />
    <rect x="36" y="146" width="14" height="14" rx="3" fill="var(--fg)" opacity="0.2" />
    <rect x="58" y="149" width="80" height="8" rx="4" fill="var(--fg)" opacity="0.25" />
    {/* các dòng */}
    <rect x="28" y="180" width="164" height="30" rx="7" fill="var(--card)" />
    <rect x="58" y="191" width="70" height="8" rx="4" fill="var(--fg)" opacity="0.2" />
    {/* dòng cần chọn */}
    <rect x="26" y="218" width="168" height="38" rx="8" fill="var(--info-soft)" stroke="var(--primary)" strokeWidth="2" />
    <rect x="36" y="230" width="16" height="16" rx="4" fill="none" stroke="var(--primary)" strokeWidth="2" />
    <path d="M44 233 L44 243 M39 238 L49 238" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" />
    <text x="60" y="242" fontSize="10.5" fontWeight="700" fill="var(--primary)">Thêm vào MH chính</text>
    <rect x="28" y="266" width="164" height="30" rx="7" fill="var(--card)" />
    <rect x="58" y="277" width="60" height="8" rx="4" fill="var(--fg)" opacity="0.2" />
    <text x="110" y="330" textAnchor="middle" fontSize="10" fill="var(--muted)">Vuốt xuống nếu chưa thấy</text>
  </Phone>
);
const IosAdd = () => (
  <Phone>
    <rect x="18" y="30" width="184" height="40" rx="8" fill="var(--bg)" />
    <text x="34" y="55" fontSize="11" fill="var(--muted)">Hủy</text>
    <rect x="150" y="40" width="42" height="22" rx="11" fill="var(--primary)" />
    <text x="171" y="55" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">Thêm</text>
    <Ring cx={171} cy={51} r={26} />
    <rect x="30" y="100" width="44" height="44" rx="10" fill="var(--primary)" opacity="0.15" stroke="var(--primary)" />
    <text x="52" y="129" textAnchor="middle" fontSize="16" fontWeight="800" fill="var(--primary)">E</text>
    <rect x="86" y="108" width="100" height="10" rx="5" fill="var(--fg)" opacity="0.3" />
    <rect x="86" y="126" width="70" height="8" rx="4" fill="var(--fg)" opacity="0.18" />
    <text x="110" y="200" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--accent)">Xong! Icon xuất hiện</text>
    <text x="110" y="218" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--accent)">trên màn hình chính</text>
  </Phone>
);

/* ---------- Minh họa Android ---------- */
const AndOpen = () => (
  <Phone>
    <rect x="20" y="28" width="180" height="28" rx="6" fill="var(--bg)" />
    <rect x="30" y="37" width="120" height="10" rx="5" fill="var(--fg)" opacity="0.3" />
    <text x="110" y="160" textAnchor="middle" fontSize="13" fill="var(--muted)">Mở bằng</text>
    <circle cx="110" cy="200" r="24" fill="none" stroke="var(--primary)" strokeWidth="2.5" />
    <circle cx="110" cy="200" r="9" fill="var(--primary)" opacity="0.5" />
    <text x="110" y="248" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--fg)">Chrome</text>
  </Phone>
);
const AndMenu = () => (
  <Phone>
    <rect x="20" y="28" width="180" height="28" rx="6" fill="var(--bg)" />
    <rect x="30" y="37" width="110" height="10" rx="5" fill="var(--fg)" opacity="0.3" />
    <circle cx="186" cy="36" r="2" fill="var(--primary)" /><circle cx="186" cy="42" r="2" fill="var(--primary)" /><circle cx="186" cy="48" r="2" fill="var(--primary)" />
    <Ring cx={186} cy={42} r={14} />
    <Bar y="90" /><Bar y="110" w="150" /><Bar y="130" w="90" />
    <text x="120" y="76" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--primary)">Bấm menu ⋮</text>
    <path d="M158 70 L176 52 M170 52 L177 52 L177 59" stroke="var(--primary)" strokeWidth="2" fill="none" strokeLinecap="round" />
  </Phone>
);
const AndAdd = () => (
  <Phone>
    <rect x="20" y="28" width="180" height="28" rx="6" fill="var(--bg)" />
    {/* menu xổ xuống */}
    <rect x="92" y="56" width="112" height="180" rx="8" fill="var(--card)" stroke="var(--border)" />
    <rect x="102" y="70" width="70" height="8" rx="4" fill="var(--fg)" opacity="0.2" />
    <rect x="102" y="92" width="60" height="8" rx="4" fill="var(--fg)" opacity="0.2" />
    {/* mục cần chọn */}
    <rect x="96" y="110" width="104" height="34" rx="7" fill="var(--info-soft)" stroke="var(--primary)" strokeWidth="2" />
    <text x="148" y="124" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="var(--primary)">Thêm vào Màn</text>
    <text x="148" y="136" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="var(--primary)">hình chính</text>
    <rect x="102" y="158" width="66" height="8" rx="4" fill="var(--fg)" opacity="0.2" />
    <rect x="102" y="180" width="50" height="8" rx="4" fill="var(--fg)" opacity="0.2" />
    <text x="56" y="130" textAnchor="middle" fontSize="9" fill="var(--muted)">hoặc</text>
    <text x="56" y="146" textAnchor="middle" fontSize="9" fill="var(--muted)">"Cài đặt</text>
    <text x="56" y="158" textAnchor="middle" fontSize="9" fill="var(--muted)">ứng dụng"</text>
  </Phone>
);
const AndConfirm = () => (
  <Phone>
    <rect x="30" y="130" width="160" height="130" rx="12" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
    <rect x="44" y="146" width="34" height="34" rx="8" fill="var(--primary)" opacity="0.15" stroke="var(--primary)" />
    <text x="61" y="169" textAnchor="middle" fontSize="13" fontWeight="800" fill="var(--primary)">E</text>
    <rect x="88" y="152" width="86" height="9" rx="4.5" fill="var(--fg)" opacity="0.3" />
    <rect x="88" y="168" width="60" height="7" rx="3.5" fill="var(--fg)" opacity="0.18" />
    <rect x="118" y="216" width="58" height="26" rx="13" fill="var(--primary)" />
    <text x="147" y="233" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#fff">Cài đặt</text>
    <Ring cx={147} cy={229} r={30} />
    <text x="110" y="290" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--accent)">Xong! Icon xuất hiện</text>
    <text x="110" y="308" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--accent)">trên màn hình chính</text>
  </Phone>
);

const IOS_STEPS = [
  { t: 'Mở bằng Safari', d: 'Mở link ERP của công ty bằng trình duyệt Safari. Trên iPhone, chỉ Safari mới thêm được vào màn hình chính.', img: <IosOpen /> },
  { t: 'Bấm nút Chia sẻ', d: 'Ở thanh công cụ dưới cùng, bấm biểu tượng Chia sẻ (ô vuông có mũi tên hướng lên).', img: <IosShare /> },
  { t: 'Chọn "Thêm vào MH chính"', d: 'Bảng chia sẻ trượt lên. Vuốt xuống tìm dòng "Thêm vào MH chính" (Add to Home Screen) rồi bấm.', img: <IosSheet /> },
  { t: 'Bấm "Thêm"', d: 'Đặt tên (hoặc để nguyên) rồi bấm "Thêm" ở góc trên bên phải. Icon ERP sẽ nằm trên màn hình chính như một ứng dụng.', img: <IosAdd /> },
];
const AND_STEPS = [
  { t: 'Mở bằng Chrome', d: 'Mở link ERP của công ty bằng trình duyệt Chrome.', img: <AndOpen /> },
  { t: 'Bấm menu ⋮', d: 'Bấm biểu tượng ba chấm dọc ở góc trên bên phải.', img: <AndMenu /> },
  { t: 'Chọn "Thêm vào Màn hình chính"', d: 'Trong menu, chọn "Thêm vào Màn hình chính" — một số máy hiển thị là "Cài đặt ứng dụng".', img: <AndAdd /> },
  { t: 'Bấm "Cài đặt"', d: 'Hộp thoại xác nhận hiện ra, bấm "Cài đặt" (hoặc "Thêm"). Icon ERP sẽ nằm trên màn hình chính như một ứng dụng.', img: <AndConfirm /> },
];

export default function InstallPage() {
  const [os, setOs] = useState('ios');
  useEffect(() => { // đoán hệ điều hành để mở đúng tab trước
    const ua = navigator.userAgent || '';
    if (/android/i.test(ua)) setOs('android');
    else if (/iphone|ipad|ipod/i.test(ua)) setOs('ios');
  }, []);
  const steps = os === 'ios' ? IOS_STEPS : AND_STEPS;

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <h2 style={{ margin: '0 0 6px', fontSize: '1.05rem' }}>Cài ERP lên màn hình điện thoại</h2>
          <p style={{ fontSize: '.87rem', color: 'var(--muted)', margin: 0 }}>
            Thêm vào màn hình chính để mở ERP bằng 1 chạm như một ứng dụng thật — chạy toàn màn hình, không thanh địa chỉ, vào nhanh hơn nhiều so với mở trình duyệt rồi gõ link.
          </p>
        </div>
      </div>

      <div className="toolbar">
        <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <button className={os === 'ios' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'} style={{ borderRadius: 0 }} onClick={() => setOs('ios')}>iPhone / iPad</button>
          <button className={os === 'android' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'} style={{ borderRadius: 0 }} onClick={() => setOs('android')}>Android</button>
        </div>
        <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>{os === 'ios' ? 'Dùng Safari' : 'Dùng Chrome'}</span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
        {steps.map((s, i) => (
          <div className="card" key={i}>
            <div className="card-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '.85rem', flex: 'none' }}>{i + 1}</span>
                <b style={{ fontSize: '.92rem' }}>{s.t}</b>
              </div>
              <div style={{ margin: '10px 0' }}>{s.img}</div>
              <p style={{ fontSize: '.83rem', color: 'var(--muted)', margin: 0 }}>{s.d}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-body" style={{ fontSize: '.84rem' }}>
          <b style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="alert" size={15} /> Lưu ý</b>
          <ul style={{ margin: '8px 0 0 18px', color: 'var(--muted)' }}>
            <li><b>iPhone:</b> bắt buộc dùng <b>Safari</b>. Mở bằng Chrome/Cốc Cốc trên iPhone sẽ không có mục "Thêm vào MH chính".</li>
            <li><b>Android:</b> Chrome đôi khi tự hiện thanh gợi ý "Cài đặt ứng dụng" ở dưới — bấm luôn cũng được.</li>
            <li>Đăng nhập một lần rồi giữ, lần sau mở icon là vào thẳng.</li>
            <li>Vẫn cần Internet — đây là ứng dụng web, không phải bản offline.</li>
          </ul>
        </div>
      </div>
    </>
  );
}
