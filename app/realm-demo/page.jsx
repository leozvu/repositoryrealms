import { notFound } from 'next/navigation';
import RealmOffice from '@/components/realm/RealmOffice';

// v3.38 (chỉ đạo 07/2026): trang demo Realm với dữ liệu/nhân vật giả KHÔNG được lên production —
// công ty thật chỉ dùng /realm với nhân sự và dữ liệu ERP thật. Demo chỉ còn chạy ở môi trường
// dev local và Vercel Preview (nơi Playwright + pilot rehearsal cần fixture sandbox).
export default async function RealmDemoPage({ searchParams }) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const query = await searchParams;
  return <RealmOffice erpHref="/dashboard" demoMode initialMode={query?.view === 'ledger' ? 'ledger' : 'world'} />;
}
