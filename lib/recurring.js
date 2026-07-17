// v3.32: Chi phí định kỳ — logic thuần (test được). Sinh phiếu chi hằng tháng từ mẫu,
// chống trùng bằng thẻ [recur:id] trong diễn giải giao dịch.
export const recurTag = id => `[recur:${id}]`;

// Ngày ghi trong tháng: kẹp 1–28 để không lệch sang tháng khác (tháng 2 / tháng 30 ngày).
export function genDate(month, dayOfMonth) {
  const day = Math.min(28, Math.max(1, +dayOfMonth || 1));
  return `${month}-${String(day).padStart(2, '0')}`;
}

// Các mẫu ĐANG bật mà CHƯA có giao dịch [recur:id] trong tháng `month` (YYYY-MM).
export function dueTemplates(templates, txs, month) {
  return templates.filter(t => t.active && !txs.some(x =>
    x.type === 'expense' && (x.date || '').startsWith(month) && (x.desc || '').includes(recurTag(t.id))));
}
