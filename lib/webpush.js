// Web Push tối giản — KHÔNG thêm thư viện ngoài (cùng triết lý với lib/totp.js).
//
// Cách làm: gửi push RỖNG (không payload) + service worker tự gọi /api/notifications để
// lấy nội dung mới nhất. Nhờ vậy không cần mã hóa aes128gcm phức tạp; chỉ cần ký VAPID JWT
// (ES256) — node:crypto làm được — và POST tới endpoint của trình duyệt.
//
// ENV cần: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (sinh bằng scripts/generate-vapid.mjs)
//          VAPID_SUBJECT (mailto: hoặc https:) — mặc định mailto của CEO.
import crypto from 'node:crypto';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

export function vapidConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

// Khóa riêng VAPID lưu dạng base64url raw (32 byte) → dựng lại PKCS8 để node ký được
function privateKeyObject(rawBase64Url) {
  const raw = Buffer.from(rawBase64Url, 'base64url');
  if (raw.length !== 32) throw new Error('VAPID_PRIVATE_KEY phải là 32 byte base64url');
  const pub = Buffer.from(process.env.VAPID_PUBLIC_KEY, 'base64url'); // 65 byte, uncompressed
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: raw.toString('base64url'),
    x: pub.subarray(1, 33).toString('base64url'),
    y: pub.subarray(33, 65).toString('base64url'),
  };
  return crypto.createPrivateKey({ key: jwk, format: 'jwk' });
}

function vapidHeaders(endpoint) {
  const audience = new URL(endpoint).origin;
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64url(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: process.env.VAPID_SUBJECT || 'mailto:leozvu.work@gmail.com',
  }));
  const signingInput = `${header}.${claims}`;
  const signature = crypto.sign('sha256', Buffer.from(signingInput), {
    key: privateKeyObject(process.env.VAPID_PRIVATE_KEY),
    dsaEncoding: 'ieee-p1363', // JWS ES256 dùng r||s thô, không phải DER
  });
  return {
    Authorization: `vapid t=${signingInput}.${b64url(signature)}, k=${process.env.VAPID_PUBLIC_KEY}`,
    TTL: '900',
    'Content-Length': '0',
    Urgency: 'normal',
  };
}

// Trả { ok, status } — 404/410 nghĩa là subscription chết, người gọi nên xóa khỏi DB.
export async function sendPushTickle(endpoint, { timeoutMs = 8000 } = {}) {
  if (!vapidConfigured()) return { ok: false, status: 0, code: 'vapid_not_configured' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: vapidHeaders(endpoint), signal: controller.signal });
    return { ok: response.ok, status: response.status, gone: response.status === 404 || response.status === 410 };
  } catch (error) {
    return { ok: false, status: 0, code: error?.name === 'AbortError' ? 'timeout' : 'network_error' };
  } finally {
    clearTimeout(timer);
  }
}
