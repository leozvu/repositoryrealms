import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { buildInsights } from '@/lib/insights';
import { hasAny, isFreelancer } from '@/lib/perm';

// AI Summary: sinh nhận định từ toàn bộ dữ liệu, lọc theo vai trò người xem
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (isFreelancer(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const all = await buildInsights();
  const mine = all.filter(i => hasAny(user, i.roles)).map(({ roles, ...rest }) => rest);
  // Xấu trước, tốt sau
  const order = { bad: 0, warn: 1, good: 2, info: 3 };
  mine.sort((a, b) => order[a.level] - order[b.level]);
  return NextResponse.json(mine);
}
