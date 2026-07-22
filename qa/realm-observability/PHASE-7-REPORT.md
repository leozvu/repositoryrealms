# Phase 7 — Realm API observability & incident traceability

Phase 7 gắn correlation ID và latency telemetry vào toàn bộ Realm API family, đồng thời đưa mã hỗ trợ vào sync UI mà không ghi thêm dữ liệu nghiệp vụ.

## Kết quả

- Observed Realm routes: **11/11**
- Observability/privacy contracts: **8/8**
- Deterministic scenarios: **5/5**
- Database migration: **0**

## Route coverage

| Route | Source | Status |
| --- | --- | --- |
| operations | app/api/realm-demo/operations/route.js | verified |
| rewards | app/api/realm-demo/rewards/route.js | verified |
| tavern | app/api/realm-demo/treasury/route.js | verified |
| guild | app/api/realm-demo/guild/route.js | verified |
| war-room | app/api/realm-demo/war-room/route.js | verified |
| economy | app/api/realm-demo/economy/route.js | verified |
| embassy | app/api/realm-demo/embassy/route.js | verified |
| token | app/api/realm-demo/token/route.js | verified |
| health | app/api/realm-demo/health/route.js | verified |
| changes | app/api/realm-demo/changes/route.js | verified |
| actions | app/api/realm-demo/actions/route.js | verified |

## Contract matrix

| Contract | Evidence | Status |
| --- | --- | --- |
| request-id-validation | lib/realm-observability.js | verified |
| latency-headers | lib/realm-observability.js | verified |
| private-no-store | lib/realm-api-response.js | verified |
| error-support-id | lib/realm-api-response.js | verified |
| safe-exception-log | lib/realm-observability.js | verified |
| authenticated-health | app/api/realm-demo/health/route.js | verified |
| client-trace-capture | components/realm/RealmOffice.jsx | verified |
| support-copy-ux | components/realm/RealmOffice.jsx | verified |

## Cơ chế vận hành

- Mỗi response có `X-Realm-Request-Id`, `X-Realm-Duration-Ms`, `X-Realm-Outcome` và `Server-Timing`.
- Error JSON mang cùng request ID để nhân sự copy từ UI và gửi hỗ trợ.
- Structured log chỉ có allowlist metadata; không log body, query, user, token, message hoặc stack.
- Health endpoint yêu cầu session khi integration bật, kiểm tra ERP core, collaboration bridge và migration receipt mới nhất mà không trả dữ liệu nhân sự.
- Toàn bộ response private/no-store; observability failure không được làm hỏng business request.

## Regression gate

Chạy `npm run audit:realm:observability:check`. Gate thất bại nếu một Realm route mất trace wrapper, privacy allowlist lệch hoặc UI mất support-ID recovery.

