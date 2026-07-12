import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import Shell from '@/components/Shell';

export default async function AppLayout({ children }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  let company = 'Agency ERP';
  try {
    const row = await prisma.setting.findUnique({ where: { id: 1 } });
    if (row) company = JSON.parse(row.json).company || company;
  } catch {}
  return <Shell user={user} company={company}>{children}</Shell>;
}
