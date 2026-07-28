// v3.41 (Chương 2) — GOLD TỰ ĐỘNG TỪ SỰ KIỆN NGHIỆP VỤ.
//
// Quyết định thiết kế quan trọng (đọc trước khi sửa file này):
//
// Gold CHỈ sinh từ SỰ KIỆN KHÁCH QUAN, kiểm chứng được:
//   1. Việc hoàn thành ĐÚNG HẠN (có deadline, completedAt <= dueDate)
//   2. Ngày công ĐỦ GIỜ (checkIn + checkOut, đủ số giờ chuẩn)
//
// Gold KHÔNG lấy từ Resource Intelligence (estimate/TimeLog/historical). Đây là ranh giới
// có chủ đích: chính sách sẵn có của hệ thống ghi rõ dữ liệu RI không dùng cho Gold hay
// lương (goldUse:false / payrollUse:false) vì giờ ước lượng là NHÂN VIÊN TỰ KHAI — lấy nó
// làm thước thưởng sẽ khuyến khích khai khống. Việc-xong-đúng-hạn và ngày-công-đủ là dữ
// kiện có thể kiểm chứng, nên dùng làm cơ sở thưởng thì công bằng.
//
// Mọi bút toán đi vào RealmGoldEntry (sổ append-only, có idempotencyKey) — không bao giờ
// cộng trực tiếp vào ví, không bao giờ sửa bút toán cũ.

export const GOLD_SOURCE = Object.freeze({
  ON_TIME_TASK: 'ontime_task',
  FULL_ATTENDANCE: 'full_attendance_day',
});

export const GOLD_DEFAULTS = Object.freeze({
  goldEnabled: false,
  goldPerOnTimeTask: 10,
  goldPerFullAttendanceDay: 5,
  goldDailyEarnCap: 60, // trần Gold tự động mỗi người mỗi ngày — chặn cày điểm bằng việc vụn
});

export function goldSettings(settings = {}) {
  const number = (value, fallback, max) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, max) : fallback;
  };
  return {
    enabled: settings.goldEnabled === true,
    perOnTimeTask: number(settings.goldPerOnTimeTask, GOLD_DEFAULTS.goldPerOnTimeTask, 100),
    perFullAttendanceDay: number(settings.goldPerFullAttendanceDay, GOLD_DEFAULTS.goldPerFullAttendanceDay, 100),
    dailyCap: number(settings.goldDailyEarnCap, GOLD_DEFAULTS.goldDailyEarnCap, 500),
  };
}

const day = (value) => (value ? String(value).slice(0, 10) : null);

/* Việc hoàn thành đúng hạn?
   - Phải có deadline (không hạn thì không có gì để "đúng hạn")
   - Ngày hoàn tất <= ngày hạn
   - Task phải thực sự chuyển sang done ở lần cập nhật này (tránh cộng lại khi sửa việc đã xong) */
export function taskEarnsGold(task, previous = null, { today = new Date().toISOString().slice(0, 10) } = {}) {
  if (!task || task.status !== 'done') return null;
  if (previous && previous.status === 'done') return null; // đã xong từ trước — không cộng lần hai
  const due = day(task.dueDate);
  if (!due) return { earned: false, reason: 'no_deadline' };
  const finished = day(task.completedAt) || today;
  return finished <= due
    ? { earned: true, source: GOLD_SOURCE.ON_TIME_TASK, sourceId: task.id, label: `Hoàn thành đúng hạn: ${String(task.title || '').slice(0, 80)}` }
    : { earned: false, reason: 'late' };
}

/* Ngày công đủ giờ?
   - Có cả giờ vào và giờ ra
   - Số giờ làm >= ngưỡng (mặc định 7h — nới 1h so với ca 8h cho linh hoạt thực tế)
   - Trạng thái là đi làm hoặc remote (nghỉ thì không tính) */
export function attendanceEarnsGold(attendance, { minHours = 7 } = {}) {
  if (!attendance || !['present', 'remote'].includes(attendance.status)) return null;
  const { checkIn, checkOut } = attendance;
  if (!checkIn || !checkOut) return null;
  const toMinutes = (hm) => {
    const [h, m] = String(hm).split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  };
  const start = toMinutes(checkIn);
  const end = toMinutes(checkOut);
  if (start == null || end == null || end <= start) return null;
  const hours = (end - start) / 60;
  return hours >= minHours
    ? { earned: true, source: GOLD_SOURCE.FULL_ATTENDANCE, sourceId: attendance.date, label: `Ngày công đủ giờ ${attendance.date} (${hours.toFixed(1)}h)` }
    : { earned: false, reason: 'short_day' };
}

// Khóa chống cộng trùng: cùng người + cùng nguồn + cùng bản ghi = một bút toán duy nhất
export function goldIdempotencyKey(userId, source, sourceId) {
  return `gold:${source}:${userId}:${sourceId}`.slice(0, 120);
}

/* Giới hạn trần ngày: trả về số Gold ĐƯỢC PHÉP cộng thêm.
   earnedToday = tổng Gold tự động người đó đã nhận trong ngày. */
export function capDailyGold(amount, earnedToday, dailyCap) {
  if (!Number.isFinite(dailyCap) || dailyCap <= 0) return amount;
  return Math.max(0, Math.min(amount, dailyCap - Math.max(0, earnedToday)));
}
