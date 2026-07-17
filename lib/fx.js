// v3.25: KẾ TOÁN ĐA NGOẠI TỆ — chênh lệch tỷ giá (logic thuần, test được).
// Nguyên tắc VAS: ghi nhận công nợ/doanh thu theo tỷ giá lúc phát sinh (bookRate); khi THU
// tiền, tỷ giá thực (payRate) thường khác → phần chênh là LÃI/LỖ tỷ giá ĐÃ THỰC HIỆN (doanh
// thu/chi phí tài chính). Cuối kỳ, công nợ ngoại tệ còn dư đánh giá lại theo tỷ giá cuối kỳ
// → lãi/lỗ CHƯA thực hiện.

// Chênh lệch tỷ giá đã thực hiện khi thu: dương = lãi, âm = lỗ (đơn vị VND).
// amount theo nguyên tệ; bookRate = tỷ giá ghi sổ; payRate = tỷ giá thực thu.
export function realizedFx(amount, bookRate, payRate) {
  return Math.round((+amount || 0) * ((+payRate || 0) - (+bookRate || 0)));
}

// Đánh giá lại một khoản công nợ ngoại tệ còn dư theo tỷ giá cuối kỳ (chưa thực hiện).
export function revalueItem(amount, bookRate, closingRate) {
  return Math.round((+amount || 0) * ((+closingRate || 0) - (+bookRate || 0)));
}

// Đánh giá lại danh mục vị thế ngoại tệ. items = [{ currency, amount, bookRate }].
// closingRates = { USD: 25400, CNY: 3500, ... }. Bỏ qua VND và tiền không có tỷ giá cuối kỳ.
// Trả { byCurrency: {USD:{amount,book,close,diff}}, total } — diff dương = lãi (VND).
export function revaluePositions(items, closingRates = {}) {
  const byCurrency = {};
  let total = 0;
  for (const it of items) {
    const cur = it.currency || 'VND';
    if (cur === 'VND') continue;
    const close = +closingRates[cur];
    if (!close) continue; // chưa nhập tỷ giá cuối kỳ cho đồng này → không đánh giá
    const g = byCurrency[cur] || (byCurrency[cur] = { amount: 0, bookVnd: 0, closeVnd: 0, diff: 0, close });
    g.amount += (+it.amount || 0);
    g.bookVnd += Math.round((+it.amount || 0) * (+it.bookRate || 0));
    g.closeVnd += Math.round((+it.amount || 0) * close);
  }
  for (const cur of Object.keys(byCurrency)) {
    const g = byCurrency[cur];
    g.diff = g.closeVnd - g.bookVnd;
    total += g.diff;
  }
  return { byCurrency, total };
}

// Tỷ giá bình quân ghi sổ của một đồng tiền (để hiển thị) từ danh mục vị thế.
export function avgBookRate(items, currency) {
  let amt = 0, vnd = 0;
  for (const it of items) {
    if ((it.currency || 'VND') !== currency) continue;
    amt += (+it.amount || 0);
    vnd += Math.round((+it.amount || 0) * (+it.bookRate || 0));
  }
  return amt ? Math.round(vnd / amt) : 0;
}
