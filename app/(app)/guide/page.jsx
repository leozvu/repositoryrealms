'use client';
// v3.9: Cẩm nang sử dụng trong app — phần chung + phần riêng TỰ HIỆN theo vai trò
// của người đang đăng nhập (nhân viên không bị ngợp bởi tính năng không dùng).
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRoleLabels } from '@/components/ui';
import { rolesOf, hasAny } from '@/lib/perm';
import { modOn } from '@/lib/modules';

const S = ({ id, title, children }) => (
  <div className="card" id={id} style={{ marginBottom: 16 }}>
    <div className="card-head"><span className="card-title">{title}</span></div>
    <div className="card-body guide-body">{children}</div>
  </div>
);
const H = ({ children }) => <h4 style={{ margin: '14px 0 4px', fontSize: '.92rem' }}>{children}</h4>;
const P = ({ children }) => <p style={{ fontSize: '.86rem', lineHeight: 1.65, margin: '4px 0', color: 'var(--fg)' }}>{children}</p>;
const B = ({ children }) => <b style={{ color: 'var(--primary)' }}>{children}</b>;

export default function GuidePage() {
  const { data: session } = useSession();
  const user = session?.user;
  const RL = useRoleLabels();
  const myRoles = rolesOf(user);
  const is = r => hasAny(user, [r]);
  // v3.21: chỉ hiện mục cẩm nang của phân hệ đang bật
  const [modules, setModules] = useState(null);
  useEffect(() => { fetch('/api/settings').then(r => r.ok ? r.json() : null).then(d => { if (Array.isArray(d?.modules)) setModules(d.modules); }).catch(() => {}); }, []);
  const modUsed = m => modOn(m, modules);

  return (
    <>
      <div className="toolbar">
        <span style={{ fontSize: '1.02rem', fontWeight: 800 }}>📖 Cẩm nang sử dụng</span>
        <span className="badge b-blue"><span className="dot"></span>Hiển thị theo vai trò: {myRoles.map(r => RL[r] || r).join(' · ')}</span>
        <div className="spacer"></div>
        <button className="btn btn-outline btn-sm" onClick={() => window.print()}>🖨 In cẩm nang</button>
      </div>

      <S id="start" title="🚀 Ngày đầu tiên — làm 4 việc này trước">
        <P><B>1. Đổi mật khẩu:</B> menu <b>Hồ sơ &amp; nhóm</b> → bấm ✏️ ở dòng tên mình → nhập mật khẩu mới (≥6 ký tự) → Lưu.</P>
        <P><B>2. Bật đăng nhập 2 lớp:</B> bấm nút 🛡 cạnh tên bạn (góc dưới sidebar) → mở Google Authenticator trên điện thoại → nhập khóa → nhập mã 6 số xác nhận. Từ đó đăng nhập cần thêm mã từ điện thoại — an toàn hơn nhiều.</P>
        <P><B>3. Cài như app trên điện thoại:</B> mở trang web bằng Chrome/Safari điện thoại → menu trình duyệt → <b>Thêm vào màn hình chính</b>. Dùng như app bình thường.</P>
        <P><B>4. Điền ngày sinh 🎂 + SĐT</B> trong hồ sơ để công ty không bỏ lỡ sinh nhật bạn.</P>
      </S>

      <S id="daily" title="📅 Nhịp làm việc hằng ngày (mọi vị trí)">
        <H>Sáng — mở "Việc của tôi"</H>
        <P>Menu <B>Việc của tôi</B> là trang bắt đầu ngày: việc <b>quá hạn</b> (đỏ), việc <b>hôm nay</b>, <b>7 ngày tới</b>, việc <b>chờ bạn duyệt</b> và lịch hẹn. Xong việc nào bấm ✔ ngay tại dòng đó.</P>
        <P>Đồng thời vào <B>Chấm công ngày</B> → chọn <i>Đi làm / Remote</i> để điểm danh.</P>
        <H>Trong ngày — làm việc trên bảng Công việc</H>
        <P>Menu <B>Công việc</B>: kéo thẻ giữa 4 cột <i>Cần làm → Đang làm → Chờ duyệt → Hoàn thành</i> (bạn chỉ kéo được thẻ của mình). <b>Nhấp vào thẻ</b> để mở chi tiết: tick <b>checklist</b> từng bước, <b>bình luận trao đổi</b> (người phụ trách nhận chuông 🔔), và bấm <b>⏱ Ghi giờ</b> để log giờ công ngay tại đó.</P>
        <P>Thẻ có ⛓ = phải chờ việc khác xong trước · 🔁 = việc lặp lại định kỳ, xong tự tạo kỳ sau.</P>
        <H>Cuối ngày / cuối tuần</H>
        <P><B>Chấm công giờ</B>: đảm bảo đủ giờ công theo dự án (có thể ghi từ thẻ việc như trên). Giờ công là căn cứ tính hiệu suất và chi phí dự án.</P>
        <H>Các tiện ích ai cũng dùng</H>
        <P>🔍 <B>Ctrl+K</B>: tìm mọi thứ (khách, việc, dự án, hóa đơn…) từ bất kỳ đâu · 🔔 <b>chuông</b>: gom thông báo được gán việc, được duyệt, bình luận · 💬 <B>Tin nhắn</B>: Kênh chung cả công ty + chat riêng/nhóm.</P>
        <H>Xin nghỉ phép</H>
        <P>Menu <B>Hồ sơ &amp; nhóm</B> → <i>Xin nghỉ phép</i>. Hệ thống hiện <b>số ngày phép còn lại</b> của bạn. Đơn tự đi theo chuỗi duyệt: Trưởng nhóm → HR (nếu &gt;3 ngày). Theo dõi trạng thái trong <b>Phê duyệt</b>.</P>
        <H>Đánh giá quý</H>
        <P>Mỗi quý HR mở đợt <B>Đánh giá hiệu suất</B> → bạn vào tự chấm 5 tiêu chí (1-5 ⭐) + tự nhận xét → quản lý chấm lại và chốt. Điểm chốt nằm trong hồ sơ của bạn.</P>
      </S>

      {is('AM') && (
        <S id="am" title={`💼 Dành cho ${RL.AM || 'Account/Sales'}`}>
          <H>Pipeline khách tiềm năng</H>
          <P>Menu <B>Khách tiềm năng</B>: kéo deal qua 6 giai đoạn. Mỗi thẻ có <b>AI Lead Score</b> (0-100) — ưu tiên deal điểm cao. Nhập <b>giá trị deal + ngày dự kiến chốt</b> để biểu đồ <b>dự báo doanh thu</b> phía trên chạy đúng. Deal MỚI để quá 48h chưa liên hệ sẽ bị AI nhắc trên dashboard — đừng để bị réo tên 😄</P>
          <H>Khách hàng 360°</H>
          <P>Menu <B>Khách hàng</B> → click tên khách: xem doanh thu lũy kế, công nợ, NPS/CSAT, <b>toàn bộ lịch sử tương tác</b> và <b>danh bạ nhiều người liên hệ</b> (thêm đúng người: Brand Manager, kế toán bên khách…). Ghi <b>hoạt động CRM</b> (gọi/họp/email) sau mỗi lần chạm khách — lịch hẹn sắp tới hiện trong Lịch + Việc của tôi.</P>
          <H>Báo giá → tiền về</H>
          <P>Menu <B>Báo giá</B>: tạo từ bảng giá dịch vụ → bấm 📧 <b>gửi email cho khách</b> (email brand công ty, kèm bảng chi tiết) hoặc in PDF. Báo giá ≥ ngưỡng (mặc định 50tr) khi chuyển "Đã gửi" sẽ <b>tự xin duyệt CEO</b> — theo dõi trong Phê duyệt. Khách chốt → 1 nút chuyển thành <b>hóa đơn</b> hoặc <b>dự án</b>. Deal thắng → xem <b>hoa hồng</b> của bạn trong menu Hoa hồng Sales.</P>
          <H>Đo sự hài lòng</H>
          <P>Sau dự án hỏi khách câu NPS (0-10) và ghi vào <B>Analytics → Ghi phản hồi</B>; sau mỗi ticket hỗ trợ xong, ghi CSAT 1-5⭐ ngay trên ticket.</P>
        </S>
      )}

      {(is('PM') || is('LEAD')) && (
        <S id="pm" title={`🗂 Dành cho ${[is('PM') && (RL.PM || 'Quản lý dự án'), is('LEAD') && (RL.LEAD || 'Trưởng nhóm')].filter(Boolean).join(' + ')}`}>
          <H>Dự án &amp; giao việc</H>
          <P>Menu <B>Dự án</B>: tạo dự án (khách, ngân sách, ngày bắt đầu + deadline — có deadline mới hiện trên Gantt). Menu <B>Công việc</B> → <i>Thêm công việc</i>: gán người, hạn, ưu tiên, <b>checklist bước con</b>, việc <b>phụ thuộc</b> (chưa xong việc trước thì không hoàn thành được việc sau), việc <b>định kỳ</b> 🔁 cho báo cáo tuần/tháng. Người được gán tự nhận chuông.</P>
          <H>Gantt &amp; mốc dự án</H>
          <P>Menu <B>Gantt tiến độ</B>: nhìn toàn cảnh + vạch Hôm nay. Bấm <i>Thêm mốc</i> đặt các mốc quan trọng (kickoff, golive, nghiệm thu) — hình thoi tím, đạt rồi chuyển xanh. Mũi tên nét đứt = chuỗi phụ thuộc.</P>
          <H>Nguồn lực — ai rảnh ai quá tải</H>
          <P>Menu <B>Nguồn lực</B>: ma trận giờ log theo tuần từng người (đỏ = quá tải &gt;40h) + số việc mở/quá hạn. Thấy ai trống → bấm <b>+ Gán việc</b> phân việc chưa gán ngay tại chỗ.</P>
          <H>Trách nhiệm quản lý</H>
          <P>Duyệt <b>nghỉ phép bước 1</b> của team trong <B>Phê duyệt</B> · chấm phần quản lý trong <B>Đánh giá hiệu suất</B> mỗi quý · theo dõi <b>ticket</b> khách và SLA.</P>
        </S>
      )}

      {is('ACCOUNTANT') && (
        <S id="acc" title={`💰 Dành cho ${RL.ACCOUNTANT || 'Kế toán'}`}>
          <H>Dòng tiền vào</H>
          <P>Menu <B>Hóa đơn</B>: tạo (hoặc nhận từ báo giá AM chuyển sang), bấm 📧 gửi khách / in PDF, <b>ghi nhận thanh toán từng phần</b> bằng nút ví — thu đủ tự chuyển "Đã thu" và tự ghi sổ quỹ. Hóa đơn retainer bật <i>định kỳ</i> để tự sinh hàng tháng.</P>
          <H>Sổ quỹ &amp; kiểm soát chi</H>
          <P>Menu <B>Thu / Chi</B>: ghi mọi khoản theo danh mục (xuất CSV cho file kế toán thuế). Khoản chi ≥10tr của người khác sẽ chờ <b>bạn duyệt</b> trong Phê duyệt (≥50tr thêm CEO) — duyệt xong tiền mới vào sổ.</P>
          <H>Công nợ &amp; kế hoạch</H>
          <P>Menu <B>Công nợ &amp; Dự báo</B>: aging phải thu/phải trả theo nhóm tuổi nợ, <b>ngân sách tháng theo danh mục</b> (cam = chạm 80%, đỏ = vượt), dự báo dòng tiền 3 tháng. AI Summary tự nhắc hóa đơn quá hạn — nhắc nợ sớm.</P>
          <H>NCC, hợp đồng, lương, hoa hồng</H>
          <P><B>Mua hàng/NCC</B>: hóa đơn đầu vào + thanh toán (tự ghi sổ) + <b>RFQ so giá</b> nhiều NCC · <B>Hợp đồng</B>: nhắc hết hạn trước 30 ngày, in PDF · <B>Bảng lương</B>: tạo nháp tháng (tự tính BHXH + thuế TNCN lũy tiến) → chỉnh phụ cấp/thưởng → <b>chốt</b> là khóa sổ + tự ghi chi phí · <B>Hoa hồng Sales</B>: duyệt chi trả hoa hồng cho AM.</P>
        </S>
      )}

      {is('HR') && (
        <S id="hr" title={`🧑‍🤝‍🧑 Dành cho ${RL.HR || 'HR'}`}>
          <H>Hồ sơ nhân sự</H>
          <P>Menu <B>Hồ sơ &amp; nhóm</B>: sửa thông tin, lương, nhóm của nhân sự (vai trò/quyền chỉ CEO đổi được). Click tên → <b>hồ sơ 360°</b>: việc đang làm, giờ công, phép còn lại, chấm công, tài sản đang giữ, điểm đánh giá.</P>
          <H>Chấm công &amp; nghỉ phép</H>
          <P><B>Chấm công ngày</B>: xem tổng công tháng từng người, sửa hộ khi ai quên · Duyệt <b>nghỉ phép</b> trong Phê duyệt (bạn là bước cuối với đơn &gt;3 ngày). <b>Quota phép năm</b> đặt trong Cài đặt (CEO chỉnh) — hệ thống tự trừ và cảnh báo khi ai xin vượt.</P>
          <H>Lương, tuyển dụng, onboarding</H>
          <P><B>Bảng lương</B>: cùng quyền với Kế toán — tạo nháp, chỉnh từng người, chốt · <B>Tuyển dụng</B>: kéo ứng viên qua 6 vòng; sang "Nhận việc" hệ thống <b>tự tạo checklist onboarding</b> (tài khoản, thiết bị, giới thiệu team…) và nhắc bạn · <B>Đánh giá hiệu suất</B>: mỗi quý bấm <i>Mở đợt đánh giá</i> — phiếu tự sinh cho toàn bộ nhân sự.</P>
          <P>AI Summary nhắc 🎂 sinh nhật nhân sự trong tuần — nhớ điền ngày sinh vào hồ sơ.</P>
        </S>
      )}

      {is('DIRECTOR') && (
        <S id="ceo" title="👑 Dành cho CEO">
          <H>Buổi sáng 5 phút</H>
          <P><B>Bảng điều khiển</B>: đọc <b>AI Summary</b> — hệ thống tự nêu hóa đơn quá hạn, deal ứ đọng, việc trễ, SLA vỡ, hợp đồng sắp hết hạn, dự báo chốt tháng, burn rate… kèm link nhảy thẳng tới nơi cần xử lý. Sau đó mở <B>Phê duyệt</B> xử lý việc chờ bạn (báo giá lớn, chi lớn).</P>
          <H>Quản 3 công ty một màn hình</H>
          <P><b>Master Dashboard</b> (link riêng đã giao): tổng doanh thu/chi/lợi nhuận/AR/pipeline cả 3 entity + insight từng công ty. Chỉ mình bạn có mật khẩu.</P>
          <H>Cài đặt hệ thống (chỉ bạn)</H>
          <P><B>Cài đặt</B>: thông tin công ty (in trên báo giá/hóa đơn), <b>ngưỡng phê duyệt</b>, xác suất forecast theo giai đoạn, <b>tên chức danh</b> theo công ty, quota phép, <b>Email SMTP</b> (gửi báo giá/hóa đơn), OpenRouter API key (bật AI Copilot), <b>API key + Webhook</b> nối hệ thống ngoài.</P>
          <H>Vận hành nâng cao</H>
          <P><B>Tự động hóa</B>: rule KHI-THÌ (VD thắng deal → nhắn Kênh chung + tạo việc) · <B>Nhật ký hệ thống</B>: mọi thao tác của mọi người · <B>Báo cáo</B> → in báo cáo tháng PDF · Quản tài khoản: tạo/khóa người dùng, đặt lại mật khẩu, <b>reset 2FA</b> khi nhân sự mất điện thoại (Hồ sơ &amp; nhóm).</P>
        </S>
      )}

      {modUsed('export') && hasAny(user, ['PM', 'ACCOUNTANT', 'AM']) && (
        <S id="xnk" title="🌏 Xuất nhập khẩu nông sản (Fretas)">
          <H>Vùng trồng &amp; mã số</H>
          <P><B>Vùng trồng / Đóng gói</B>: khai vùng trồng (PUC) và cơ sở đóng gói (PHC), rồi thêm <b>mã số theo TỪNG thị trường</b> (mã đi Trung Quốc khác mã đi EU). Mỗi mã có trạng thái riêng — mã bị <b>đình chỉ</b> thì <b>không xuất được lô mới</b> bằng mã đó cho thị trường tương ứng.</P>
          <H>Lập lô hàng</H>
          <P><B>Lô hàng xuất</B>: chọn mặt hàng + thị trường → hệ thống <b>chặn cứng</b> thị trường chưa mở cửa (VD chanh dây không đi được Nhật/Hàn/Mỹ) và <b>tự sinh checklist chứng từ</b> theo thị trường (Invoice, Packing, B/L, Phyto, C/O, và chiếu xạ nếu chôm chôm đi Mỹ).</P>
          <P>Nhập theo <b>ngoại tệ</b> (USD/CNY) + tỷ giá → VNĐ. Thanh toán <b>L/C</b> thì hệ thống tính <b>hạn xuất trình chứng từ</b> (ETD+21 ngày) và cảnh báo khi sắp/đã quá hạn — <b>trễ là mất tiền</b>.</P>
          <H>Thu tiền</H>
          <P>Lô về tiền → bấm nút <B>ví (Ghi nhận thanh toán)</B> ở dòng lô → hệ thống tạo <b>phiếu thu quy về VNĐ</b> vào Sổ quỹ và đánh dấu lô "Đã thanh toán".</P>
        </S>
      )}

      {modUsed('livestream') && hasAny(user, ['LEAD', 'ACCOUNTANT', 'PM', 'AM']) && (
        <S id="live" title="🎥 Livestream bán hàng (Egolive)">
          <H>⚠ GMV không phải doanh thu</H>
          <P>Con số chốt trên sóng (GMV) <b>chưa phải tiền về</b>. Sàn giữ tiền, trừ đơn hủy/hoàn, trừ phí sàn (~23%), trừ thuế. Đừng tính lãi theo GMV.</P>
          <H>Ca live</H>
          <P><B>Ca live</B>: tạo ca (nền tảng, host, nhãn hàng, loại hợp đồng) → ghi chỉ số phiên (GMV, đơn, view, CTR/CTOR). Sau khi sàn quyết toán, bấm nút <B>ví (Đối soát)</B> → nhập GMV ròng + phí sàn + thuế → hệ thống chốt <b>tiền thực nhận</b> và <b>tự tạo phiếu công host</b> (theo GMV ròng) để Kế toán trả.</P>
          <H>Điểm vi phạm</H>
          <P><B>Điểm vi phạm</B>: ghi lại điểm phạt nền tảng. Hệ thống cộng dồn theo cửa sổ <b>180 ngày</b> và cảnh báo khi chạm ngưỡng (<b>36đ = hạn chế live, 48đ = đóng shop</b>). Điểm tự hết hiệu lực sau 180 ngày.</P>
        </S>
      )}

      <S id="rules" title="📌 Quy tắc chung của công ty trên ERP">
        <P>1. <b>Mọi việc phải nằm trên bảng Công việc</b> — không giao việc miệng/chat rời. Việc có người phụ trách + hạn rõ ràng.</P>
        <P>2. <b>Ghi giờ công mỗi ngày</b> — là căn cứ tính utilization, chi phí dự án và đánh giá quý.</P>
        <P>3. <b>Chạm khách là ghi CRM</b> — gọi/họp/email với khách xong ghi hoạt động vào hồ sơ khách để cả team nắm lịch sử.</P>
        <P>4. <b>Tiền đi qua phê duyệt</b> — chi ≥10tr, báo giá ≥50tr đều qua chuỗi duyệt trên hệ thống, không duyệt miệng.</P>
        <P>5. <b>Bảo mật</b>: không chia sẻ mật khẩu, bật 2FA, đăng xuất máy công cộng. Quên mật khẩu → báo CEO đặt lại.</P>
      </S>
    </>
  );
}
