// v3.41 (Chương 2) — ghi Gold tự động vào sổ RealmGoldEntry.
// Gọi từ event bus khi việc chuyển sang "xong" và khi nhân sự tan ca.
// Mọi bút toán idempotent: chạy lại bao nhiêu lần cũng chỉ ghi một lần.
import { prisma } from './prisma.js';
import {
  attendanceEarnsGold, capDailyGold, goldIdempotencyKey, goldSettings, taskEarnsGold,
} from './gold-earning.js';

async function readGoldSettings() {
  const row = await prisma.setting.findUnique({ where: { id: 1 } });
  return goldSettings(row ? JSON.parse(row.json) : {});
}

// Tổng Gold TỰ ĐỘNG người này đã nhận hôm nay (chỉ tính 2 nguồn tự động, không tính quest)
async function autoGoldEarnedToday(userId, today) {
  const rows = await prisma.realmGoldEntry.findMany({
    where: {
      userId,
      sourceType: { in: ['ontime_task', 'full_attendance_day'] },
      createdAt: { gte: new Date(`${today}T00:00:00.000Z`) },
    },
    select: { amount: true },
  });
  return rows.reduce((sum, entry) => sum + Math.max(0, entry.amount), 0);
}

async function writeGoldEntry({ userId, amount, source, sourceId, label, today }) {
  const key = goldIdempotencyKey(userId, source, sourceId);
  const existing = await prisma.realmGoldEntry.findUnique({ where: { idempotencyKey: key } });
  if (existing) return { skipped: 'duplicate' };

  const earnedToday = await autoGoldEarnedToday(userId, today);
  const allowed = capDailyGold(amount, earnedToday, (await readGoldSettings()).dailyCap);
  if (allowed <= 0) return { skipped: 'daily_cap' };

  try {
    await prisma.realmGoldEntry.create({
      data: {
        userId,
        type: 'quest_reward',
        amount: allowed,
        renown: 0,
        label,
        sourceType: source,
        sourceId: String(sourceId),
        idempotencyKey: key,
      },
    });
    return { awarded: allowed };
  } catch (error) {
    // Đụng unique (2 request song song) = đã có bút toán rồi, coi như xong
    if (error?.code === 'P2002') return { skipped: 'duplicate' };
    throw error;
  }
}

/* Việc chuyển sang "xong" → cộng Gold nếu đúng hạn.
   Trả về null khi Gold đang tắt hoặc không đủ điều kiện — người gọi không cần xử lý gì. */
export async function awardGoldForTask(task, previous, { now = new Date() } = {}) {
  const settings = await readGoldSettings();
  if (!settings.enabled || !task?.assigneeId) return null;
  const today = now.toISOString().slice(0, 10);
  const verdict = taskEarnsGold(task, previous, { today });
  if (!verdict?.earned) return null;
  return writeGoldEntry({
    userId: task.assigneeId,
    amount: settings.perOnTimeTask,
    source: verdict.source,
    sourceId: verdict.sourceId,
    label: verdict.label,
    today,
  });
}

/* Tan ca đủ giờ → cộng Gold ngày công. */
export async function awardGoldForAttendance(attendance, { now = new Date() } = {}) {
  const settings = await readGoldSettings();
  if (!settings.enabled || !attendance?.userId) return null;
  const verdict = attendanceEarnsGold(attendance);
  if (!verdict?.earned) return null;
  return writeGoldEntry({
    userId: attendance.userId,
    amount: settings.perFullAttendanceDay,
    source: verdict.source,
    sourceId: verdict.sourceId,
    label: verdict.label,
    today: now.toISOString().slice(0, 10),
  });
}

/* Ví Gold hiện tại của một người — luôn cộng từ sổ, không cache. */
export async function goldWalletOf(userId) {
  const rows = await prisma.realmGoldEntry.findMany({ where: { userId }, select: { amount: true, renown: true } });
  return rows.reduce(
    (acc, row) => ({ gold: acc.gold + row.amount, renown: acc.renown + (row.renown || 0) }),
    { gold: 0, renown: 0 },
  );
}
