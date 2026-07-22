import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { buildInsights } from '@/lib/insights';
import { hasAny, isFreelancer } from '@/lib/perm';
import { cached } from '@/lib/cache';

// AI Summary: sinh nhận định từ toàn bộ dữ liệu, lọc theo vai trò người xem
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  if (isFreelancer(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  // v3.13: cache 60s. buildInsights quét 12 bảng đầy đủ và cho ra kết quả GIỐNG NHAU cho
  // mọi người xem — lọc theo vai trò làm ở dưới, nên cache phần nặng dùng chung được.
  // Nhận định là số liệu tổng hợp trong ngày, trễ 1 phút không ảnh hưởng gì.
  const all = await cached('insights', 60_000, buildInsights);
  const mine = all.filter(i => hasAny(user, i.roles)).map(({ roles, ...rest }) => rest);
  // Xấu trước, tốt sau
  const order = { bad: 0, warn: 1, good: 2, info: 3 };
  mine.sort((a, b) => order[a.level] - order[b.level]);
  return NextResponse.json(mine);
}
