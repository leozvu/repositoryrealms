'use client';
// Phase 0: error boundary cho toàn bộ khu (app). Khi một trang crash render (trang trắng),
// thay vì màn hình trắng vô hồn: (1) tự báo lỗi về server để Giám đốc thấy trong Nhật ký,
// (2) hiện thông báo thân thiện + nút Tải lại. Đây là lưới an toàn cho đúng loại bug hay lọt.
import { useEffect } from 'react';

export default function AppError({ error, reset }) {
  useEffect(() => {
    fetch('/api/errorlog', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error?.message || String(error),
        stack: error?.stack || '',
        url: typeof window !== 'undefined' ? window.location.pathname : '',
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <div style={{ display: 'flex', minHeight: '60vh', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 440, textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 8 }}>⚠️</div>
        <h2 style={{ margin: '0 0 8px', fontSize: '1.15rem' }}>Trang gặp lỗi tạm thời</h2>
        <p style={{ color: 'var(--muted)', fontSize: '.9rem', marginBottom: 18 }}>
          Sự cố đã được ghi lại tự động và gửi cho quản trị. Bạn thử tải lại trang; nếu vẫn lỗi, báo người phụ trách hệ thống.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={() => reset()}>Thử lại</button>
          <button className="btn btn-outline" onClick={() => { if (typeof window !== 'undefined') window.location.href = '/dashboard'; }}>Về Bảng điều khiển</button>
        </div>
      </div>
    </div>
  );
}
