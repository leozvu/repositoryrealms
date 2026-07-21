// v3.13: cache ngắn hạn trong bộ nhớ tiến trình.
//
// Vì sao: /api/insights gọi buildInsights() — 12 lượt findMany TOÀN BẢNG rồi lắp ghép
// bằng vòng lặp lồng nhau — và nó chạy lại từ đầu MỖI LẦN có người mở Dashboard.
// /api/projects/stats cũng vậy: quét toàn bộ task + timelog cho từng dự án.
// Sáng ra 10 người cùng mở Dashboard = 10 lần quét sạch database, ra kết quả y hệt nhau.
//
// Giới hạn cần biết: mỗi instance serverless có bộ nhớ riêng nên cache không dùng chung
// giữa các instance, và deploy mới là mất sạch. Chấp nhận được — đây chỉ là số liệu tổng
// hợp để xem, trễ vài chục giây không sao. TUYỆT ĐỐI không dùng cho dữ liệu cần chính xác
// tức thì (số dư, quyền hạn).
const store = new Map();

export async function cached(key, ttlMs, fn) {
  const hit = store.get(key);
  if (hit && hit.exp > Date.now()) return hit.val;
  const val = await fn();
  store.set(key, { val, exp: Date.now() + ttlMs });
  // Dọn rác: xóa các mục đã hết hạn để Map không phình mãi
  if (store.size > 50) for (const [k, v] of store) if (v.exp <= Date.now()) store.delete(k);
  return val;
}

// Dành cho dữ liệu tổng hợp chỉ-đọc có thể chịu cũ trong một khoảng ngắn. Khi loader
// lỗi, snapshot gần nhất được dùng thay vì biến một dependency chậm thành màn trắng.
// Không dùng helper này cho số dư, quyền hạn hoặc quyết định ghi.
export async function cachedResilient(key, ttlMs, staleIfErrorMs, fn, {
  now = () => Date.now(),
  onState = () => {},
} = {}) {
  const timestamp = now();
  const hit = store.get(key);
  if (hit && hit.exp > timestamp) {
    onState({ source: 'fresh', degraded: false });
    return hit.val;
  }
  try {
    const val = await fn();
    const storedAt = now();
    store.set(key, {
      val,
      exp: storedAt + Math.max(0, Number(ttlMs) || 0),
      staleExp: storedAt + Math.max(0, Number(ttlMs) || 0) + Math.max(0, Number(staleIfErrorMs) || 0),
    });
    onState({ source: 'live', degraded: false });
    return val;
  } catch (error) {
    if (hit && (hit.staleExp ?? hit.exp) > timestamp) {
      onState({ source: 'stale', degraded: true, error });
      return hit.val;
    }
    throw error;
  }
}

// Gọi khi dữ liệu nền đổi (tạo/sửa/xóa) để lần xem sau thấy số mới ngay
export function invalidate(prefix) {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}
