import Link from 'next/link';
import { deploymentBranding } from '@/lib/deployment-profile';

export default function Home() {
  const brand = deploymentBranding();
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <p>
        Đang mở {brand.company}. Nếu trình duyệt không tự chuyển trang,{' '}
        <Link href={brand.homePath}>vào không gian làm việc tại đây</Link>.
      </p>
    </main>
  );
}
