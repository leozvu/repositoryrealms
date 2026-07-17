// v3.24: KHO HÀNG + LÔ nông sản. Logic thuần (test được), không đụng DB.
// Nông sản tươi: giá vốn theo LÔ đích danh (mỗi lô 1 nguồn + 1 giá mua), theo dõi hạn dùng.

export const WAREHOUSES = ['Kho lạnh', 'Kho đóng gói', 'Kho biên giới', 'Kho khác'];

export const LOT_STATUS = [
  ['in_stock', 'Còn tồn'],
  ['depleted', 'Đã xuất hết'],
  ['expired', 'Quá hạn'],
];

// kg còn lại trong lô (không âm).
export function lotRemaining(lot) {
  return Math.max(0, (lot.qtyIn || 0) - (lot.qtyOut || 0));
}

// Giá trị tồn của lô = kg còn × giá vốn/kg (theo currency của lô; mặc định VND).
export function lotValue(lot) {
  return lotRemaining(lot) * (lot.unitCost || 0);
}

// Trạng thái HIỂN THỊ suy ra từ dữ liệu (ưu tiên: hết hạn > hết tồn > cận hạn > còn tồn).
// warnDays: số ngày coi là "cận hạn". Trả một trong: expired | depleted | expiring | in_stock.
export function lotDisplayStatus(lot, today, warnDays = 5) {
  if (lot.expiryDate && lot.expiryDate < today) return 'expired';
  if (lotRemaining(lot) <= 0) return 'depleted';
  if (lot.expiryDate && daysBetween(today, lot.expiryDate) <= warnDays) return 'expiring';
  return 'in_stock';
}

// Có xuất được qty kg từ lô không (không vượt tồn còn lại).
export function canIssue(lot, qty) {
  const q = +qty || 0;
  if (q <= 0) return { ok: false, error: 'Số lượng xuất phải lớn hơn 0.' };
  const rem = lotRemaining(lot);
  if (q > rem) return { ok: false, error: `Chỉ còn ${rem} kg trong lô, không xuất được ${q} kg.` };
  return { ok: true };
}

// Tổng hợp tồn kho từ danh sách lô (chỉ tính lô còn tồn, theo currency VND — giá vốn nhập VND).
export function stockSummary(lots, today) {
  let totalKg = 0, totalValue = 0, expiringKg = 0, expiredCount = 0;
  for (const l of lots) {
    const rem = lotRemaining(l);
    const st = lotDisplayStatus(l, today);
    if (st === 'expired') { expiredCount++; continue; } // quá hạn: không tính vào tồn bán được
    totalKg += rem;
    totalValue += lotValue(l);
    if (st === 'expiring') expiringKg += rem;
  }
  return { totalKg, totalValue, expiringKg, expiredCount };
}

// Gợi ý phân bổ FEFO (First-Expired-First-Out): xuất qty kg, ưu tiên lô hết hạn sớm nhất.
// Trả mảng { lotId, qty } hoặc { shortage } nếu tồn không đủ. Dùng cho đóng gói lô hàng xuất.
export function allocateFEFO(lots, crop, qtyNeeded, today) {
  const avail = lots
    .filter(l => l.crop === crop && lotDisplayStatus(l, today) !== 'expired' && lotRemaining(l) > 0)
    .sort((a, b) => (a.expiryDate || '9999').localeCompare(b.expiryDate || '9999'));
  const plan = [];
  let need = +qtyNeeded || 0;
  for (const l of avail) {
    if (need <= 0) break;
    const take = Math.min(need, lotRemaining(l));
    plan.push({ lotId: l.id, code: l.code, qty: take });
    need -= take;
  }
  return { plan, shortage: need > 0 ? need : 0 };
}

function daysBetween(fromISO, toISO) {
  return Math.round((new Date(toISO + 'T00:00:00') - new Date(fromISO + 'T00:00:00')) / 86400000);
}
