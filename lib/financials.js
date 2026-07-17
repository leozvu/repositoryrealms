// v3.26: BÁO CÁO TÀI CHÍNH (quản trị, cơ sở TIỀN) — dựng từ sổ Thu/Chi.
// Lưu ý trung thực: app ghi sổ ĐƠN (thu/chi tiền), không hạch toán KÉP → KQKD & LCTT ở đây là
// báo cáo quản trị theo cơ sở tiền; Bảng CĐKT đầy đủ (tài sản = nợ + vốn) cần hạch toán kép,
// nên phần "tình hình tài chính" chỉ là ảnh chụp rút gọn, KHÔNG thay báo cáo nộp thuế.

// Danh mục mang tính TÀI CHÍNH (tách khỏi hoạt động kinh doanh chính).
export const FIN_INCOME_CATS = ['Lãi chênh lệch tỷ giá', 'Lãi đánh giá lại tỷ giá'];
export const FIN_EXPENSE_CATS = ['Lỗ chênh lệch tỷ giá', 'Lỗ đánh giá lại tỷ giá'];

// Tạo hàm khớp kỳ. period = { year, quarter? (1-4), month? (1-12) }. Thiếu quarter/month = cả năm.
export function periodMatch(period = {}) {
  return (dateStr) => {
    if (!dateStr || dateStr.length < 7) return false;
    const y = +dateStr.slice(0, 4), m = +dateStr.slice(5, 7);
    if (period.year && y !== period.year) return false;
    if (period.month && m !== period.month) return false;
    if (period.quarter && Math.ceil(m / 3) !== period.quarter) return false;
    return true;
  };
}

// Báo cáo Kết quả kinh doanh (KQKD) trong kỳ. Tách doanh thu/chi phí tài chính (lãi/lỗ tỷ giá).
export function incomeStatement(txs, match) {
  const inc = txs.filter(t => t.type === 'income' && match(t.date));
  const exp = txs.filter(t => t.type === 'expense' && match(t.date));
  const finIncome = inc.filter(t => FIN_INCOME_CATS.includes(t.category)).reduce((s, t) => s + t.amount, 0);
  const opRevenue = inc.reduce((s, t) => s + t.amount, 0) - finIncome;
  const finExpense = exp.filter(t => FIN_EXPENSE_CATS.includes(t.category)).reduce((s, t) => s + t.amount, 0);
  const opexByCat = {};
  exp.filter(t => !FIN_EXPENSE_CATS.includes(t.category)).forEach(t => { const c = t.category || 'Khác'; opexByCat[c] = (opexByCat[c] || 0) + t.amount; });
  const opex = Object.entries(opexByCat).map(([cat, amount]) => ({ cat, amount })).sort((a, b) => b.amount - a.amount);
  const totalOpex = opex.reduce((s, o) => s + o.amount, 0);
  const netProfit = opRevenue + finIncome - totalOpex - finExpense;
  return {
    opRevenue, finIncome, totalRevenue: opRevenue + finIncome,
    opex, totalOpex, finExpense, totalExpense: totalOpex + finExpense,
    netProfit, margin: opRevenue ? Math.round(netProfit / opRevenue * 100) : 0,
  };
}

// Lưu chuyển tiền tệ (trực tiếp, cơ sở tiền) trong kỳ.
export function cashFlow(txs, match) {
  const inMap = {}, outMap = {};
  txs.filter(t => match(t.date)).forEach(t => {
    const map = t.type === 'income' ? inMap : outMap;
    const c = t.category || 'Khác'; map[c] = (map[c] || 0) + t.amount;
  });
  const inflows = Object.entries(inMap).map(([cat, amount]) => ({ cat, amount })).sort((a, b) => b.amount - a.amount);
  const outflows = Object.entries(outMap).map(([cat, amount]) => ({ cat, amount })).sort((a, b) => b.amount - a.amount);
  const totalIn = inflows.reduce((s, x) => s + x.amount, 0);
  const totalOut = outflows.reduce((s, x) => s + x.amount, 0);
  return { inflows, outflows, totalIn, totalOut, net: totalIn - totalOut };
}

// Số dư tiền lũy kế đến hết kỳ (cơ sở tiền): Σ thu − Σ chi cho mọi giao dịch có ngày ≤ đến ngày.
export function cashBalanceAsOf(txs, asOfDate) {
  return txs.filter(t => t.date && t.date <= asOfDate)
    .reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
}
