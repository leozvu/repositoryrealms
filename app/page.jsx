import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <p>
        Đang mở CRMegoric ERP · CRM. Nếu trình duyệt không tự chuyển trang,{' '}
        <Link href="/dashboard">vào Bảng điều khiển tại đây</Link>.
      </p>
    </main>
  );
}
