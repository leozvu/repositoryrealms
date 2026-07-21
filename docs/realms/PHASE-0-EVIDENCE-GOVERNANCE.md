# Phase 0 — Evidence & Governance Contract

## Trạng thái

- Policy version: `1.0.0-draft`
- Runtime mode: `shadow`
- Collection: `disabled`
- Decision automation: `disabled`
- Repository: `CRMegoric-Realms-Demo`
- Branch: `codex/realms-demo`

Phase 0 tạo contract và storage additive nhưng không tự động thu thập evidence. Không có dữ liệu Phase 0 nào được dùng cho Gold, payroll, kỷ luật, sa thải hoặc xếp hạng cá nhân.

## Mục tiêu

Chuyển hệ thống từ việc coi dữ liệu tự khai báo là sự thật duy nhất sang mô hình có provenance:

1. `declared`: người dùng chủ động khai báo.
2. `observed`: hành động nghiệp vụ được server ghi nhận, ưu tiên RepositoryRealms receipt.
3. `validated`: quản lý hoặc HR xác nhận, có audit.
4. `derived`: kết quả tính toán có rule version và confidence.

Presence không phải productivity. Evidence đơn lẻ không phải performance score.

## Data contract

`WorkEvidenceEvent` là ledger append-only. Evidence sai không bị overwrite; quy trình đúng là:

`event gốc → EvidenceReviewRequest → manager/HR decision → correction event có parentEventId`

Mọi event phải có:

- Idempotency key.
- Subject type và subject ID.
- Event type nằm trong allowlist.
- Source class.
- Operational purpose.
- Occurred time và retention deadline.
- Provenance.
- Confidence band, không dùng điểm số giả chính xác.
- Metadata tối đa 2KB và chỉ nhận field allowlist.
- Policy/schema version.

Ledger không đăng ký trong generic `/api/data/[resource]`; client không thể CRUD trực tiếp. Write path tương lai phải đi qua server service `recordWorkEvidenceEvent`.

Self read path dùng `listOwnWorkEvidenceEvents`, luôn khóa `actorId` theo session user. Phase 0 chưa mở route/UI và không có manager-wide read path cho tới khi team scope cùng employee notice được duyệt.

## Privacy guardrails

Hệ thống từ chối các signal sau ở contract layer:

- GPS, tọa độ hoặc precise location.
- Keylogger, keyboard/mouse activity.
- Browser history, clipboard hoặc screen capture.
- Camera/microphone.
- Raw IP và raw device ID.

Nếu attendance cần network/device context, chỉ lưu categorical trust signal và hash không đảo ngược. Raw telemetry không được đưa vào metadata hay audit detail.

## Shadow-mode rules

Được phép:

- Kiểm tra chất lượng dữ liệu.
- Hiển thị operational context có giải thích.
- Phân tích capacity ở cấp nhóm với sample phù hợp.
- Audit và phát hiện missing evidence.

Bị chặn:

- Tự động trao hoặc trừ Gold.
- Chuyển evidence vào payroll.
- Kỷ luật hoặc sa thải tự động.
- Xếp hạng hiệu suất cá nhân.
- Suy luận năng suất từ online duration hoặc attendance.

## Authorization

- `declared`: actor phải là session user.
- `observed`: chỉ trusted server producer được ghi.
- `validated`: PM, Lead, HR hoặc Director; validator phải là session user.
- `derived`: chỉ trusted server producer, phải có rule version trong metadata.
- Review: actor của evidence hoặc HR/Director được tạo yêu cầu; xử lý review sẽ được triển khai bằng action riêng trước khi activation.

## Retention

Draft mặc định 365 ngày, contract chỉ cho phép 30–730 ngày. Trước khi activation, HR và Technology phải chốt:

- Retention theo từng event type.
- Legal hold.
- Cách purge có audit aggregate nhưng không giữ raw metadata.
- Export/correction flow cho nhân viên.

## Activation gates

Collection chỉ được bật khi tất cả gate sau đạt:

1. CEO phê duyệt mục tiêu sử dụng.
2. HR phê duyệt privacy, correction và employee notice.
3. Operations phê duyệt task lifecycle và provenance.
4. Technology phê duyệt authorization, retention job và incident controls.
5. Security tests xác nhận ledger không đi qua generic CRUD.
6. Pilot notice được gửi trước khi collection bắt đầu.
7. Dashboard luôn hiển thị source, confidence và explanation.
8. Có kill switch tắt collection mà không ảnh hưởng ERP/CRM.

## RACI

| Hạng mục | Accountable | Responsible | Consulted |
|---|---|---|---|
| Purpose/policy | CEO | Product Owner | HR, Ops, employee representative |
| Privacy/appeal | HR | HR Operations | Legal, Security |
| Event taxonomy | Operations | Product + Tech Lead | PM, Lead, Staff |
| Authorization/storage | Technology | Backend + Security | HR, QA |
| Verification | Technology | QA | Product, HR |
| Activation | CEO | Product Owner | HR, Ops, Technology |

## Rollback

Phase 0 là additive. Kill switch đặt collection về `disabled`; ERP, CRM và Realm tiếp tục vận hành bằng dữ liệu gốc. Không xóa evidence trong incident response. Purge chỉ chạy theo retention procedure đã được duyệt.

## Definition of Done

- Prisma schema và migration additive hợp lệ.
- Contract fail closed với event/source/purpose/metadata ngoài allowlist.
- Surveillance signals bị test từ chối.
- Observed/derived evidence không thể giả mạo từ client path.
- Event, audit và receipt được ghi trong cùng transaction.
- Idempotent replay không tạo event thứ hai.
- Employee/HR có nền tảng request review.
- Policy vẫn là draft, shadow mode và collection disabled.
- Không đổi Lead Snapshot v1, `lib/leozops` hoặc `tests/leozops-*`.
