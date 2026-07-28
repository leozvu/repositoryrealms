import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ASSIGN_STRATEGIES, LeadIntakeError, leadDedupeKey, normalizeAssignStrategy,
  normalizeLeadPayload, normalizePhone, pickOwner,
} from '../lib/lead-intake.js';

test('chuẩn hóa số điện thoại VN về cùng một dạng', () => {
  // cùng một người tới từ 4 nguồn với 4 kiểu viết → phải ra cùng một số
  assert.equal(normalizePhone('0912345678'), '0912345678');
  assert.equal(normalizePhone('+84912345678'), '0912345678');
  assert.equal(normalizePhone('84912345678'), '0912345678');
  assert.equal(normalizePhone('0912 345 678'), '0912345678');
  assert.equal(normalizePhone('(+84) 912-345-678'), '0912345678');
  assert.equal(normalizePhone('abc'), null);
  assert.equal(normalizePhone('123'), null); // quá ngắn
  assert.equal(normalizePhone(''), null);
});

test('nhận payload từ nhiều nền tảng với tên trường khác nhau', () => {
  const fb = normalizeLeadPayload({ full_name: 'Nguyễn Văn A', phone_number: '+84912345678', platform: 'facebook', campaign_name: '4_MKT_Landing_ThaoVietAn' });
  assert.equal(fb.name, 'Nguyễn Văn A');
  assert.equal(fb.phone, '0912345678');
  assert.equal(fb.source, 'Facebook'); // khớp không phân biệt hoa thường
  assert.equal(fb.campaign, '4_MKT_Landing_ThaoVietAn');

  const vn = normalizeLeadPayload({ ho_ten: 'Trần Thị B', sdt: '0987654321', nguon: 'TikTok', khu_vuc: 'Hà Nội', mang_dich_vu: 'Seeding' });
  assert.equal(vn.name, 'Trần Thị B');
  assert.equal(vn.source, 'TikTok');
  assert.equal(vn.region, 'Hà Nội');
  assert.equal(vn.serviceLine, 'Seeding');

  // nguồn lạ → gom vào "Khác" thay vì tin payload
  assert.equal(normalizeLeadPayload({ phone: '0912345678', source: '<script>' }).source, 'Khác');
  // thiếu tên → sinh tên tạm từ số, không bỏ lead
  assert.equal(normalizeLeadPayload({ phone: '0912345678' }).name, 'Khách 5678');
});

test('từ chối lead không có cách liên hệ + chặn dữ liệu rác', () => {
  assert.throws(() => normalizeLeadPayload({ name: 'Không số không mail' }), (e) => e instanceof LeadIntakeError && e.code === 'lead_intake_no_contact');
  const long = normalizeLeadPayload({ phone: '0912345678', name: 'x'.repeat(500), note: 'y'.repeat(2000) });
  assert.equal(long.name.length, 120); // cắt theo trần
  assert.equal(long.note.length, 500);
  assert.equal(normalizeLeadPayload({ phone: '0912345678', value: -99 }).value, 0); // không nhận giá trị âm
});

test('chống trùng theo liên hệ + chiến dịch, không chặn oan cơ hội mới', () => {
  const a = normalizeLeadPayload({ phone: '0912345678', campaign: 'CT_Thang7' });
  const b = normalizeLeadPayload({ phone: '+84912345678', campaign: 'CT_Thang7' }); // cùng người, cùng chiến dịch
  const c = normalizeLeadPayload({ phone: '0912345678', campaign: 'CT_Thang8' }); // cùng người, chiến dịch khác
  assert.equal(leadDedupeKey(a), leadDedupeKey(b));
  assert.notEqual(leadDedupeKey(a), leadDedupeKey(c));
});

const team = [
  { id: 'am1', regions: ['Hà Nội'], serviceLines: ['Seeding'], campaigns: ['Landing'], openLeads: 9, lastAssignedAt: '2026-07-20T10:00:00Z' },
  { id: 'am2', regions: ['TP.HCM'], serviceLines: ['Digital Ads'], campaigns: ['Fanpage'], openLeads: 2, lastAssignedAt: '2026-07-24T10:00:00Z' },
  { id: 'am3', regions: ['Hà Nội'], serviceLines: ['Seeding'], campaigns: [], openLeads: 5, lastAssignedAt: null },
];

test('chia theo khu vực / mảng dịch vụ / chiến dịch', () => {
  const hn = { region: 'hà nội', serviceLine: 'Seeding', campaign: '1_MKT_Landing_X' };
  // khu vực Hà Nội có am1(9) và am3(5) → chọn người ít tải hơn
  assert.equal(pickOwner(hn, team, { strategy: ASSIGN_STRATEGIES.REGION }), 'am3');
  // mảng Digital Ads chỉ am2
  assert.equal(pickOwner({ serviceLine: 'Digital Ads' }, team, { strategy: ASSIGN_STRATEGIES.SERVICE_LINE }), 'am2');
  // chiến dịch chứa "Landing" → am1
  assert.equal(pickOwner(hn, team, { strategy: ASSIGN_STRATEGIES.CAMPAIGN }), 'am1');
});

test('không ai khớp thì vẫn chia cho cả đội — tuyệt đối không bỏ rơi lead', () => {
  const stranger = { region: 'Đà Nẵng', serviceLine: 'Livestream', campaign: 'ZZZ' };
  assert.equal(pickOwner(stranger, team, { strategy: ASSIGN_STRATEGIES.REGION }), 'am2'); // ít tải nhất toàn đội
  assert.equal(pickOwner(stranger, team, { strategy: ASSIGN_STRATEGIES.SERVICE_LINE }), 'am2');
});

test('luân phiên vòng tròn: ai lâu chưa nhận nhất được ưu tiên', () => {
  assert.equal(pickOwner({}, team, { strategy: ASSIGN_STRATEGIES.ROUND_ROBIN }), 'am3'); // chưa từng nhận
  const assigned = team.map(t => (t.id === 'am3' ? { ...t, lastAssignedAt: '2026-07-25T10:00:00Z' } : t));
  assert.equal(pickOwner({}, assigned, { strategy: ASSIGN_STRATEGIES.ROUND_ROBIN }), 'am1'); // 20/7 cũ nhất
});

test('mặc định ít-tải-nhất; đội rỗng thì để trống chờ chia tay', () => {
  assert.equal(pickOwner({}, team), 'am2');
  assert.equal(pickOwner({}, []), null);
  assert.equal(normalizeAssignStrategy('bừa'), ASSIGN_STRATEGIES.LEAST_LOAD);
  assert.equal(normalizeAssignStrategy('ROUND_ROBIN'), ASSIGN_STRATEGIES.ROUND_ROBIN);
});
