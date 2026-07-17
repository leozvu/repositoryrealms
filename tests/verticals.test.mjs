// v3.19–3.20: test logic nghiệp vụ XNK + Livestream. Đây là nơi dễ sai nhất (luật + tiền).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marketBlocked, incotermValid, requiredDocs, presentationDeadline } from '../lib/export-trade.js';
import { reconcile, hostPay, activePoints, plus180, hostPit } from '../lib/livestream.js';

/* ===== XNK: ma trận thị trường (ràng buộc pháp lý) ===== */
test('chặn cứng thị trường cấm', () => {
  assert.ok(marketBlocked('Chanh dây', 'JP'), 'Nhật cấm chanh dây');
  assert.ok(marketBlocked('Chanh dây', 'KR'), 'Hàn cấm chanh dây');
  assert.ok(marketBlocked('Chanh dây', 'US'), 'chanh dây chưa có access Mỹ');
  assert.ok(marketBlocked('Chôm chôm', 'JP'), 'Nhật cấm chôm chôm');
  assert.equal(marketBlocked('Chanh dây', 'CN'), null, 'TQ được');
  assert.equal(marketBlocked('Chanh dây', 'EU'), null, 'EU được');
  assert.equal(marketBlocked('Chôm chôm', 'US'), null, 'chôm chôm đi Mỹ được (có chiếu xạ)');
});

test('incoterm hợp lệ theo phương thức vận chuyển', () => {
  assert.equal(incotermValid('FOB', 'SEA'), true);
  assert.equal(incotermValid('FOB', 'AIR'), false, 'FOB chỉ đường biển');
  assert.equal(incotermValid('CIF', 'AIR'), false);
  assert.equal(incotermValid('FCA', 'AIR'), true);
  assert.equal(incotermValid('DAP', 'SEA'), true);
});

test('checklist chứng từ: chôm chôm đi Mỹ có chiếu xạ, đi TQ thì không', () => {
  const us = requiredDocs('Chôm chôm', 'US').map(d => d.type);
  assert.ok(us.includes('irradiation'), 'Mỹ cần chứng nhận chiếu xạ');
  assert.ok(us.includes('phyto'), 'luôn cần kiểm dịch');
  const cn = requiredDocs('Chanh dây', 'CN').map(d => d.type);
  assert.ok(!cn.includes('irradiation'));
  assert.ok(cn.includes('phyto'));
});

test('hạn xuất trình L/C = min(ETD+21, ngày hết hạn L/C)', () => {
  assert.equal(presentationDeadline('2026-07-01', '2026-08-01'), '2026-07-22', 'ETD+21 sớm hơn');
  assert.equal(presentationDeadline('2026-07-01', '2026-07-10'), '2026-07-10', 'L/C hết hạn sớm hơn');
  assert.equal(presentationDeadline(null, '2026-08-01'), '2026-08-01');
});

/* ===== Livestream: GMV ≠ doanh thu ===== */
test('đối soát: tiền thực nhận = GMV ròng − phí − thuế', () => {
  const r = reconcile({ gmv: 100_000_000, netGmv: 85_000_000, platformFee: 20_000_000, taxWithheld: 1_000_000 });
  assert.equal(r.refunded, 15_000_000, 'hủy/hoàn = GMV sóng − ròng');
  assert.equal(r.netReceived, 64_000_000, '85tr − 20tr − 1tr');
  assert.ok(r.netReceived < r.gmv, 'tiền thực nhận LUÔN nhỏ hơn GMV sóng');
});

test('đối soát: chưa có số ròng thì tạm lấy = GMV sóng (không âm)', () => {
  const r = reconcile({ gmv: 50_000_000 });
  assert.equal(r.netGmv, 50_000_000);
  assert.equal(r.netReceived, 50_000_000);
});

test('công host: tạm ứng theo GMV sóng, quyết toán theo GMV ròng, có clawback', () => {
  const s = { hostPayBase: 2_000_000, hostPayRate: 5, gmv: 100_000_000, netGmv: 80_000_000 };
  const hp = hostPay(s);
  assert.equal(hp.advance, 2_000_000 + 5_000_000, 'tạm ứng: cứng + 5% GMV sóng');
  assert.equal(hp.settled, 2_000_000 + 4_000_000, 'quyết toán: cứng + 5% GMV ròng');
  assert.equal(hp.clawback, 1_000_000, 'phải thu hồi phần chênh do đơn hoàn');
});

test('điểm vi phạm: chỉ tính điểm còn hiệu lực (chưa quá 180 ngày, chưa gỡ)', () => {
  const today = '2026-07-16';
  const vios = [
    { points: 12, status: 'active', expiresAt: '2026-12-01' }, // còn hiệu lực
    { points: 24, status: 'active', expiresAt: '2026-06-01' }, // đã quá 180 ngày
    { points: 10, status: 'cleared', expiresAt: '2026-12-01' }, // đã gỡ
    { points: 6, status: 'active', expiresAt: '2027-01-01' },  // còn
  ];
  assert.equal(activePoints(vios, today), 18, 'chỉ 12 + 6');
});

test('plus180: cộng đúng 180 ngày', () => {
  assert.equal(plus180('2026-01-01'), '2026-06-30');
  assert.equal(plus180(null), null);
});

test('khấu trừ TNCN công host: 10% khi ≥2tr, dưới ngưỡng không trừ', () => {
  const a = hostPit(6_000_000, 10);
  assert.equal(a.pit, 600_000, 'chi 6tr → khấu trừ 10% = 600k');
  assert.equal(a.net, 5_400_000, 'host thực nhận 5,4tr');
  const b = hostPit(1_500_000, 10);
  assert.equal(b.pit, 0, 'dưới 2tr/lần → không khấu trừ');
  assert.equal(b.net, 1_500_000);
  assert.equal(hostPit(6_000_000, 0).pit, 0, 'pct 0 → không trừ');
});

/* ===== v3.21: guard module + validate server ===== */
import { resourceMod, modOn as modOn2 } from '../lib/modules.js';
test('guard module: resource phân hệ tắt bị chặn, lõi không bị', () => {
  // export tắt → shipments/growingareas chặn
  const off = ['sales']; // chỉ bật sales
  assert.equal(modOn2(resourceMod('shipments'), off), false, 'shipments thuộc export, export tắt → chặn');
  assert.equal(modOn2(resourceMod('livesessions'), off), false);
  // lõi không bao giờ chặn
  assert.equal(resourceMod('invoices'), null, 'invoices là lõi');
  assert.equal(resourceMod('transactions'), null);
  assert.equal(modOn2(resourceMod('clients'), off), true, 'clients lõi → luôn qua');
  // sales bật → leads/quotes qua
  assert.equal(modOn2(resourceMod('quotes'), off), true);
});

test('validate shipment chặn thị trường cấm ở cả tạo mới (row=null)', async () => {
  const { RESOURCES } = await import('../lib/registry.js');
  const v = RESOURCES.shipments.validate;
  assert.ok(v(null, { crop: 'Chanh dây', market: 'JP' }), 'tạo mới lô đi Nhật → chặn');
  assert.equal(v(null, { crop: 'Chanh dây', market: 'CN' }), null, 'đi TQ → cho qua');
  // sửa: lấy market từ row nếu data không có
  assert.ok(v({ crop: 'Chanh dây', market: 'KR' }, {}), 'sửa lô đang đi Hàn → vẫn chặn');
});
