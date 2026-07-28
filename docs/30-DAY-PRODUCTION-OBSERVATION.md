# 30-day production observation — RepositoryRealms

Status: operational baseline; không mở khóa Milestone 2

Phạm vi: AIm Agency, Egoric Agency, Vnecom LLC, Egolive và CEO Terminal.

## Mục tiêu

Trong thời gian dùng thử, tự động kiểm tra public availability và ranh giới xác thực mà không đăng nhập, không gửi dữ liệu nghiệp vụ và không thay đổi production. Monitor này bổ sung evidence cho review ngày 07/08/2026; nó không thay thế backup production, authenticated UAT hoặc receipt reconciliation.

## Chạy thủ công

```powershell
npm run observe:production:plan
$env:PRODUCTION_OBSERVATION_CONFIRM='PUBLIC_READ_ONLY_GETS_ONLY'
npm run observe:production
```

Có thể đặt `PRODUCTION_OBSERVATION_OUTPUT` thành một file JSON mới. Script dùng `flag=wx`, nên không ghi đè evidence cũ.

## Tổng hợp evidence

Tải các artifact GitHub của khoảng thời gian cần review, giải nén vào một thư mục, sau đó chạy:

```powershell
$env:PRODUCTION_OBSERVATION_INPUT_DIR='<thư mục chứa các JSON đã tải>'
$env:PRODUCTION_OBSERVATION_REPORT_MIN_DAYS='30'
$env:PRODUCTION_OBSERVATION_WINDOW_START='2026-07-28'
$env:PRODUCTION_OBSERVATION_WINDOW_END='2026-08-26'
npm run observe:production:report
```

Rollup sinh cả JSON và Markdown trong `qa/production-observation/reports/` (đã gitignore). Nó:

- xác minh đúng format v2, topology 4 entity + CEO Terminal và đủ probe theo từng surface;
- từ chối artifact chứa body/header/cookie/token/email/payload;
- loại evidence sai format hoặc trùng timestamp và ghi rõ lý do;
- phát hiện ngày thiếu, contract pass rate, probe pass rate, latency p50/p95/max và incident;
- trả `INSUFFICIENT_EVIDENCE`, `ATTENTION_REQUIRED` hoặc tối đa `READY_FOR_HUMAN_REVIEW`.

Không có trạng thái `GO`. Quyết định phát hành luôn cần backup/restore, authenticated UAT và maker/checker độc lập.

## Contract mỗi lượt

- `GET /login`: `200`, HTML và có Content-Security-Policy.
- `GET /api/auth/providers`: `200`, JSON.
- `GET /dashboard` và `/realm`: redirect về `/login` cùng origin.
- Bốn entity: `GET /api/realm-demo/health` phải `401` khi không có credential.
- CEO Terminal: `GET /ceo-overview` redirect về `/login`; không ép Realm health vì Portal chủ động tắt Realm sync.
- Cả năm surface: `GET /api/ceo/v1/health` phải `401` khi không có credential.
- `GET /manifest.webmanifest`: `200`, manifest/JSON.
- Không dùng cookie, credential, request body hoặc response body; không gọi POST/PUT/PATCH/DELETE.

Mỗi artifact lưu status, latency và failure code đã chuẩn hóa. Không lưu HTML, JSON response, header đầy đủ, token, email hay dữ liệu người dùng.

## Phân loại và phản ứng

| Kết quả | Ý nghĩa | Hành động |
|---|---|---|
| `PASS` | Tất cả public probes đúng contract | Lưu evidence, tiếp tục theo dõi |
| `PASS_WITH_WARNINGS` | Contract đúng nhưng có probe vượt ngưỡng chậm | Kiểm tra Vercel/database latency; chưa rollout thêm |
| `FAIL` | Route unavailable hoặc auth boundary sai | Mở incident, giữ nguyên HOLD, kiểm deployment/log; không tự redeploy |

GitHub workflow chạy hằng ngày và giữ artifact 30 ngày sau khi file workflow được duyệt vào default branch. Workflow failure là tín hiệu điều tra, không tự rollback và không tự deploy.

## Giới hạn bắt buộc

- Monitor này không chứng minh business action, RBAC nội bộ, Gold ledger hay cross-entity messaging hoạt động.
- Không dùng monitor để tuyên bố RPO/RTO hoặc disaster recovery đã đạt.
- Milestone 2 vẫn HOLD cho tới khi có fresh production backup và isolated restore rehearsal đủ bốn entity.
