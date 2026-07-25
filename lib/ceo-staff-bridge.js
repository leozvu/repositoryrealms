// v3.40 — Cầu nối NHÂN SỰ giữa các công ty trong group (Đợt 3b + 3c).
//
// Nguyên tắc giữ nguyên như phần CEO: portal KHÔNG bao giờ ghi thẳng database công ty.
// - SSO nhân sự: công ty nguồn (đã xác thực bằng service key của chính nó) xin mã cho một
//   nhân sự của mình; portal chỉ xác nhận "người này có mặt ở cả hai công ty" rồi phát mã
//   ngắn hạn. Công ty đích tự tạo phiên local theo quyền của chính nó.
// - Nhắn tin ngang hàng: portal chuyển tiếp nội dung, công ty đích tự tạo bản ghi chat.
//
// Danh tính một CON NGƯỜI xuyên công ty được nhận diện bằng email chuẩn hóa (personKey).
import crypto from 'node:crypto';

export const STAFF_SSO_CODE_TTL_MS = 60_000; // mã dùng một lần, sống 60 giây
export const STAFF_MESSAGE_MAX_LENGTH = 2000;

export class CeoStaffError extends Error {
  constructor(message, status = 400, code = 'ceo_staff_error') {
    super(message);
    this.name = 'CeoStaffError';
    this.status = status;
    this.code = code;
  }
}

export function normalizePersonKey(email) {
  const value = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]{1,64}@[^\s@]{3,120}$/.test(value)) {
    throw new CeoStaffError('Email nhân sự không hợp lệ.', 400, 'ceo_staff_email_invalid');
  }
  return value;
}

export function normalizeRedirectPath(value, fallback = '/dashboard') {
  const path = String(value || fallback);
  // chỉ cho phép đường dẫn nội bộ — chặn open redirect sang tên miền ngoài
  return /^\/[A-Za-z0-9\-_/?=&.]{0,120}$/.test(path) && !path.startsWith('//') ? path : fallback;
}

export const hashStaffCode = (raw, secret) =>
  crypto.createHmac('sha256', String(secret || 'ceo-staff')).update(String(raw)).digest('hex');

export const createStaffCode = () => `stf_${crypto.randomBytes(24).toString('hex')}`;

export function normalizeStaffMessage(value) {
  const text = String(value || '').trim();
  if (!text) throw new CeoStaffError('Nội dung tin nhắn trống.', 400, 'ceo_staff_message_empty');
  if (text.length > STAFF_MESSAGE_MAX_LENGTH) {
    throw new CeoStaffError(`Tin nhắn vượt ${STAFF_MESSAGE_MAX_LENGTH} ký tự.`, 400, 'ceo_staff_message_too_long');
  }
  return text;
}

// Hai công ty phải khác nhau và đều nằm trong group đang bật
export function assertDistinctEntities(sourceEntityId, targetEntityId) {
  if (!sourceEntityId || !targetEntityId || sourceEntityId === targetEntityId) {
    throw new CeoStaffError('Công ty nguồn và đích phải khác nhau.', 400, 'ceo_staff_entity_pair_invalid');
  }
}
