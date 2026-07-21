# RepositoryRealms — Post-pilot roadmap (Phase 26–42)

Status: deferred roadmap  
Owner: Vũ Lương Sơn  
Working branch: `codex/realms-demo`  
Production constraint: no production merge or deployment without an approved Go/No-Go  
Last updated: 2026-07-21

## Product invariants

1. ERP/CRM truyền thống giữ nguyên thuật ngữ, information architecture và workflow.
2. Realm là trải nghiệm tùy chọn, không thay thế ERP.
3. ERP và Realm cùng dùng RepositoryRealms làm business system.
4. Parity được xác định bằng authorization, business rules, receipts và audit; không phải bằng việc hai giao diện có cùng nút.
5. Người chỉ dùng ERP vẫn nhận được presence, contact, message và notification từ người dùng Realm.
6. Gold là cơ chế ghi nhận nội bộ; không tự động thay thế lương, công hoặc quyền lợi pháp định.
7. Mọi rollout phải có feature flag, backup, rollback và independent approval.
8. Không merge `main` hay deploy ERP production trước khi Go/No-Go được phê duyệt.

## Phase 26 — Vận hành pilot 7 ngày

### Ngày 0 — Canary

- Theo dõi login, shared session ERP/Realm, database connection, API errors và receipts.
- Xác nhận ERP fallback luôn dùng được.
- Không mở rộng cohort khi có P0/P1.

### Ngày 1 — Identity và RBAC

- Kiểm tra Director, Accountant, AM, PM, HR, Lead, Staff và Freelancer.
- Chạy negative authorization đối với Finance, HR, Approval và admin operations.
- Kiểm tra role change, logout và session revocation trên cả hai giao diện.

### Ngày 2 — Business actions

- Lead → Opportunity → Quote → Invoice.
- Project → Task → TimeLog → Approval.
- Employee → Attendance → Leave → Payroll evidence.
- Vendor bill → Approval → Payment state.
- Quest completion → RepositoryRealms receipt → Gold ledger.
- Realm action phải cập nhật ERP record; ERP action phải invalidation Realm projection.

Mỗi action phải có actor, authorization result, business-rule version, idempotency key, receipt, audit event và trạng thái trước/sau.

### Ngày 3 — Trải nghiệm song song

- Một người dùng ERP và một người dùng Realm phải thấy presence của nhau.
- Contact, mention, message và notification hoạt động hai chiều.
- Recipient offline nhận inbox khi quay lại.
- Deep link mở đúng record trên surface người nhận đang dùng.

### Ngày 4 — Reliability và chaos

- Database chậm, API timeout, WebSocket mất, notification fail, stale cache, approval timeout và partial rollout.
- Không mất dữ liệu, không duplicate Gold/approval và không rò dữ liệu trái quyền.
- Khi không chắc chắn, UI hiển thị trạng thái đồng bộ hoặc degraded; không giả vờ thành công.

### Ngày 5 — UX người thật

- Test với gamer, non-gamer và manager/approver.
- Đo completion time, first-try discovery, fallback rate, support requests và satisfaction riêng cho ERP/Realm.

### Ngày 6 — Recovery rehearsal

- Restore database vào môi trường tạm.
- Rollback deployment và tắt Realm bằng feature flag.
- Replay outbox; kiểm tra duplicate receipts và session revocation.

### Ngày 7 — Go/No-Go

Điều kiện GO đề xuất:

- P0 = 0; P1 chưa có mitigation = 0.
- 100% business action có receipt/audit.
- Không duplicate Gold, approval hoặc side effect.
- Login success ≥ 99.5%; business-action success ≥ 99%.
- API p95 < 3 giây trong pilot.
- Không có cross-role/cross-user data exposure.
- ERP fallback, backup và restore rehearsal đạt.
- Maker/checker độc lập ký kết quả.

Thiếu bất kỳ gate bắt buộc nào thì quyết định tiếp tục là `HOLD`.

## Phase 27 — Stabilization sprint

- Freeze feature; chỉ xử lý P0/P1 và regression.
- Gom feedback, logs, incidents và UX observations thành một backlog.
- P0: mất dữ liệu, sai quyền hoặc sai tiền/Gold — dừng rollout.
- P1: không hoàn thành được nghiệp vụ chính — sửa trước RC.
- P2: UX kém nhưng có workaround — sửa theo sprint.
- P3: thẩm mỹ hoặc enhancement — đưa vào product backlog.
- Mỗi lỗi phải có regression test; loại mock data runtime; chuẩn hóa loading/empty/error states và Việt/Anh.

Exit gate: P0 = 0, P1 = 0, regression suite xanh và checker chấp nhận báo cáo đóng lỗi.

## Phase 28 — Product hóa RepositoryRealms

- Tạo command contract cho từng business action.
- Tách UI vocabulary khỏi business command.
- Chuẩn hóa error code, receipt schema, idempotency và business-rule version.
- Tập trung authorization policy và correlation ID xuyên API, receipt, audit, event.
- Giữ backward compatibility với ERP routes.
- Viết contract tests dùng chung cho ERP và Realm.

Parity đạt khi ERP và Realm dùng cùng authorization, business rules, side effects, receipt và audit — không yêu cầu cùng tên nút.

## Phase 29 — Data sync và event delivery

- Transactional outbox, consumer inbox deduplication và exponential retry.
- Dead-letter queue, event versioning và schema validation.
- Realm projection rebuild và ERP/Realm reconciliation job.
- Hiển thị `last synced at`; cảnh báo stale projection.
- Action nhạy cảm không được dựa trên dữ liệu stale.
- Test duplicate event, consumer restart, concurrent edit và role change giữa phiên.

Exit gate: không duplicate side effect, rebuild projection được và reconciliation phát hiện mọi sai lệch được cài vào test.

## Phase 30 — Dual Experience chính thức

### ERP mode

- Giữ CRM, Project, Task, Finance, HR, Attendance và Payroll.
- Không yêu cầu người dùng hiểu Quest, Guild, Hall hoặc Tavern.
- Medieval theme chỉ là trang trí tùy chọn, không đổi workflow.

### Realm mode

- Quest liên kết Task/Lead/Approval thật.
- Royal Command phản ánh operational orchestration.
- Tavern đọc reward inventory; Guild đọc team/department; Chronicle đọc receipts/activity.

### Shared preferences

- Surface mặc định: ERP, Realm hoặc Auto.
- Việt/Anh, reduced motion, high contrast, notification, sound và landing page.
- Đổi ERP ↔ Realm không login lại, không mất form draft hoặc record context.

## Phase 31 — Kiểm kê và bảo toàn ERP/CRM

Lập ma trận cho từng route/button gồm vai trò, business action, API/command, receipt, Realm representation, UI states, desktop/mobile, Việt/Anh và test case.

Phạm vi: CRM/Sales, contacts, leads, opportunities, quotes, invoices, projects, tasks, timesheets, attendance, leave, HR, payroll, finance, vendors, procurement, approvals, notifications, collaboration, reports, settings và access management.

Không bắt buộc mọi tính năng ERP có UI Realm; nghiệp vụ chuyên sâu có thể deep-link về ERP.

## Phase 32 — Presence, contact và notification đa giao diện

- Presence service độc lập với Realm map.
- Contact Realm → ERP và mention ERP → Realm.
- Offline inbox, email fallback, read/unread sync và deduplication.
- Preference theo loại thông báo, quiet hours và escalation approval.
- WebSocket mất phải có polling fallback.

## Phase 33 — Realm World System

- Map lớn, camera follow, zoom, collision, spawn, portals, object layering, ambient animation và culling.
- Map editor cho admin: đặt props, interaction zones, deep links, preview, publish và rollback version.
- Asset registry có metadata, WebP/AVIF variants, thumbnails và responsive loading.

## Phase 34 — Character và Avatar Onboarding

- Portrait chi tiết cho onboarding/profile; sprite rõ silhouette cho in-world character.
- Chọn portrait, cosmetic class, màu và phụ kiện; class không ảnh hưởng ERP authorization.
- Character đủ lớn, không giống furniture; nameplate, shadow, direction, speaking/busy/away states và fallback avatar.

## Phase 35 — Tavern Economy Governance

- Tách Gold `pending`, `earned` và `available`.
- Append-only ledger có source receipt, issuer, recipient, amount, rule version, reversal và approval evidence.
- Budget phòng ban, maker/checker, issuance limits, anti-farming, duplicate detection và dispute/reversal.
- Ưu tiên cosmetic, banner, title, profile frame, decoration và learning/mentoring requests.
- Reward liên quan tiền, phép hoặc quyền lợi phải qua HR/pháp lý trước khi kích hoạt.

## Phase 36 — Việt/Anh, accessibility và responsive UX

- Không hard-code UI text; dùng message keys và glossary ERP/Realm.
- Locale-aware date, time, currency và timezone.
- Keyboard, focus, screen reader, reduced motion, high contrast và non-color-only states.
- Modal/panel không overflow; responsive test tại 320, 375, 768, 1366, 1440 và 1920 px.
- Visual regression cho cả Việt và Anh.

## Phase 37 — AI Gateway an toàn

- Rotate secret từng xuất hiện trong chat; không nhúng secret vào source/frontend.
- Provider-neutral AI gateway; key chỉ ở server environment variables.
- Quota, timeout, fallback, PII redaction, prompt registry, audit và cost dashboard.
- Không gửi payroll/password/HR sensitive data ra model.
- AI không tự approve hoặc ghi sổ ngoài RepositoryRealms.

## Phase 38 — Security và SRE hardening

- Session revocation, rate limiting, brute-force protection, CSRF, CSP, dependency/secret scanning.
- RBAC negative tests, data isolation, tamper-resistant audit và encrypted backups.
- SLO khởi đầu: availability 99.9%, auth ≥ 99.5%, business actions ≥ 99%, read p95 < 2s, write p95 < 3s, notification 99%/60s, RPO 15m và RTO 60m.
- Dashboard cho logs, correlation IDs, slow queries, queue backlog, WebSocket health, receipt mismatch và Gold anomalies.

## Phase 39 — Release Candidate

- RC freeze; chỉ sửa P0/P1 và regression.
- Sanitized staging snapshot, full QA/UAT, DR, chaos, visual regression, load test và i18n.
- Hồ sơ release gồm notes, known issues, migration, rollback, backup, feature flags, roles, incident contacts và user/admin guides.

## Phase 40 — Rollout theo vòng

| Ring | Cohort | Thời gian đề xuất |
|---|---|---:|
| 0 | Founder, checker, kỹ thuật | 2–3 ngày |
| 1 | 5–10 champions | 5 ngày |
| 2 | Một phòng ban | 1 tuần |
| 3 | 25% công ty | 1 tuần |
| 4 | 50% công ty | 1 tuần |
| 5 | Toàn công ty; Realm vẫn tùy chọn | Sau approval |

Mỗi ring có health gate, error budget, reconciliation, feedback gate và rollback decision.

## Phase 41 — Production Go-Live

- Approved PR, protected main, production backup và migration dry-run.
- Kiểm tra đúng branch/commit/project/env và feature flags an toàn.
- Mặc định chỉ Ring 0; rollback owner phải online.
- Sau deploy: auth, read/write smoke, receipts, notification, shared session, database metrics và hai giờ canary.

## Phase 42 — 30 ngày sau phát hành

- Daily health review tuần đầu; weekly reconciliation.
- Theo dõi Realm opt-in/retention, ERP fallback, cross-surface contact, duplicate receipt, Gold reversal và satisfaction gamer/non-gamer.
- Đánh giá notification fatigue và reward abuse.
- Loại bỏ game mechanics không tạo giá trị; ERP truyền thống luôn tiếp tục hoạt động.

## Timeline tham chiếu

| Thời gian | Trọng tâm |
|---|---|
| Tuần 1 | Pilot 7 ngày |
| Tuần 2–3 | Stabilization |
| Tuần 4–6 | RepositoryRealms kernel và event sync |
| Tuần 7–9 | Dual UX, ERP inventory, cross-surface collaboration |
| Tuần 10–13 | Map, character, avatar và asset implementation |
| Tuần 14–15 | Tavern governance |
| Tuần 16–17 | i18n, accessibility và responsive |
| Tuần 18–19 | Security, SRE, load và chaos |
| Tuần 20 | Release Candidate |
| Tuần 21–24 | Ring rollout |

## Resume point

Khi tiếp tục roadmap này, bắt đầu từ Phase 26 và đọc evidence của pilot hiện hành. Trong pilot chỉ sửa P0/P1; không mở feature lớn trước khi checker ký Go/No-Go.
