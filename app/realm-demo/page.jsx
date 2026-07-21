import RealmOffice from '@/components/realm/RealmOffice';

export default async function RealmDemoPage({ searchParams }) {
  const query = await searchParams;
  return <RealmOffice erpHref="/dashboard" demoMode initialMode={query?.view === 'ledger' ? 'ledger' : 'world'} />;
}
