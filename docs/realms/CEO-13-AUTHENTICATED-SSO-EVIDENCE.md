# CEO-13 — Authenticated SSO evidence

Ngày kiểm: 2026-08-09. Portal: `https://ceo-terminal-leoz.vercel.app`.

## Kết quả

Fresh password + TOTP login được kiểm bằng `scripts/ceo-authenticated-sso-smoke.mjs`. Script chỉ đọc credential từ file ngoài repository và không log password, TOTP secret, cookie hay authorization code.

| Entity | Portal login | Identity bootstrap | Authorize | Callback | Target session |
|---|---:|---:|---:|---:|---:|
| AIm Agency | PASS | 200 | 200 | 303 | authenticated Director |
| Egoric Agency | PASS | 200 | 200 | 303 | authenticated Director |
| VNECOM LLC | PASS | 200 | 200 | 303 | authenticated Director |
| Egolive | PASS | 200 | 200 | 303 | authenticated Director |

VNECOM không có lỗi SSO riêng; lỗi quan sát trước đó là Portal session cũ/thiếu. `LoginForm` nay bootstrap CEO control-plane session ngay sau fresh MFA login trước khi redirect.

## Finding và remediation

Production log từng ghi `EMAXCONN` với giới hạn 200 connection. `lib/database-runtime.js` đặt `connection_limit=1`, `pool_timeout=15` cho serverless và `lib/prisma.js` dùng một client cho mỗi warm runtime. Schema, SSL và provider parameters được giữ nguyên.

Không thay local ERP login, user/password của entity hoặc lead-snapshot v1.
