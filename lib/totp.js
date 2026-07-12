// TOTP theo RFC 6238 (HMAC-SHA1, 6 số, bước 30 giây) — tự cài bằng node:crypto,
// không thêm thư viện ngoài. Tương thích Google Authenticator / Authy / 1Password.
import crypto from 'crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateSecret() {
  const bytes = crypto.randomBytes(20);
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function b32decode(s) {
  let bits = 0, value = 0;
  const out = [];
  for (const ch of s.toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

function hotp(secret, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', b32decode(secret)).update(buf).digest();
  const off = h[h.length - 1] & 0xf;
  const code = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 1e6).padStart(6, '0');
}

export const totp = (secret, stepOffset = 0) =>
  hotp(secret, Math.floor(Date.now() / 30000) + stepOffset);

// Chấp nhận lệch ±1 bước (90 giây) cho đồng hồ điện thoại không chuẩn
export const verifyTotp = (secret, code) =>
  !!code && [-1, 0, 1].some(o => totp(secret, o) === String(code).trim());

export const otpauthURL = (secret, email) =>
  `otpauth://totp/AgencyERP:${encodeURIComponent(email)}?secret=${secret}&issuer=AgencyERP&digits=6&period=30`;
