// v3.41 (Chương 1) — BẰNG CHỨNG NGỮ CẢNH KHI CHẤM CÔNG.
//
// Vì sao có file này: feedback Egoric 07/2026 chỉ ra "nhân viên nhấn ở đâu cũng được, đang
// đi du lịch vẫn chấm công" — giờ công vì thế không phản ánh kỷ luật thật.
//
// Cách tiếp cận (cố ý KHÔNG theo dõi vị trí GPS liên tục):
//   - Chỉ ghi IP tại ĐÚNG khoảnh khắc bấm Vào ca / Tan ca, không theo dõi lúc khác.
//   - Công ty khai IP văn phòng trong Cài đặt (officeNetworks). Khớp → 'office', không
//     khớp → 'remote'. Không khai gì → 'unknown' và hệ thống im lặng như trước.
//   - Ba mức siết (attendanceStrictness) để công ty tự chọn văn hoá của mình:
//       off    : chỉ ghi nhận, không nói gì (mặc định — không phá thói quen đang chạy)
//       warn   : vẫn cho chấm, ghi chú "ngoài mạng công ty" để quản lý thấy
//       strict : chặn chấm công ngoài mạng công ty (trừ người có status=remote hôm đó)
// Ai cũng thấy được quy tắc; không có theo dõi ngầm.

export const ATTENDANCE_STRICTNESS = Object.freeze(['off', 'warn', 'strict']);

export function normalizeStrictness(value) {
  const level = String(value || 'off').toLowerCase();
  return ATTENDANCE_STRICTNESS.includes(level) ? level : 'off';
}

// Lấy IP người bấm từ header proxy (Vercel luôn đặt x-forwarded-for)
export function clientIpFrom(request) {
  const forwarded = request?.headers?.get?.('x-forwarded-for') || '';
  const ip = forwarded.split(',')[0]?.trim() || request?.headers?.get?.('x-real-ip') || '';
  return /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : '';
}

// Che phần cuối IP trước khi lưu: đủ để đối chiếu mạng, không thành hồ sơ theo dõi cá nhân
export function maskIp(ip) {
  if (!ip) return '';
  if (ip.includes(':')) return ip.split(':').slice(0, 3).join(':') + '::';
  const parts = ip.split('.');
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.x` : ip;
}

// officeNetworks: mảng chuỗi — IP đầy đủ ("113.161.10.5") hoặc tiền tố ("113.161.10.")
export function parseOfficeNetworks(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(/[\n,]/);
  return list.map((item) => String(item).trim()).filter(Boolean).slice(0, 50);
}

export function classifyPlace(ip, officeNetworks) {
  const networks = parseOfficeNetworks(officeNetworks);
  if (!networks.length) return 'unknown'; // công ty chưa khai → không phán xét
  if (!ip) return 'unknown';
  return networks.some((net) => (net.endsWith('.') || net.endsWith(':') ? ip.startsWith(net) : ip === net))
    ? 'office'
    : 'remote';
}

/* Quyết định cho một lần bấm.
   settings: { attendanceStrictness, officeNetworks }
   status  : trạng thái nhân sự khai hôm đó (present | remote | off)
   → { allowed, place, ip, note } */
export function evaluateAttendanceContext({ ip, settings = {}, status = 'present' } = {}) {
  const strictness = normalizeStrictness(settings.attendanceStrictness);
  const place = classifyPlace(ip, settings.officeNetworks);
  const masked = maskIp(ip);
  // Người khai làm từ xa hôm đó thì không bị chặn — chế độ strict nhắm vào việc
  // khai "có mặt tại văn phòng" nhưng bấm từ nơi khác.
  const claimsOnsite = status === 'present';

  if (place !== 'remote' || !claimsOnsite || strictness === 'off') {
    return { allowed: true, place, ip: masked, note: null };
  }
  if (strictness === 'warn') {
    return { allowed: true, place, ip: masked, note: 'Bấm ngoài mạng công ty — khai có mặt tại văn phòng' };
  }
  return {
    allowed: false,
    place,
    ip: masked,
    note: 'Chấm công tại văn phòng chỉ thực hiện được trong mạng công ty',
  };
}
