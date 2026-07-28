# Phase 6 — HR Evidence & Outcome Intelligence

## Product question

**Hiệu suất được đánh giá bằng bằng chứng và kết quả như thế nào, thay vì tin một score hoặc số giờ tự khai báo?**

Phase 6 triển khai read model `Presence → Activity → Output → Outcome` trên canonical ERP records. Read model phục vụ đối thoại và xác minh; nó không tạo employee score, ranking hoặc quyết định nhân sự tự động.

## Một dữ liệu, hai trải nghiệm

- ERP `/reviews` hiển thị HR Evidence workspace trước workflow review gốc.
- Realm Guild Hall dùng cùng component và cùng private API `/api/hr/evidence-intelligence`.
- Cả hai cùng gọi `loadHrEvidenceOutcomeIntelligence`; Realm không tạo evidence store riêng.
- Nếu HR Evidence timeout hoặc lỗi, review CRUD và Guild Hall tiếp tục hoạt động. Người dùng có nút thử lại riêng.

## Evidence Pyramid

| Lớp | Canonical source | Source class | Giới hạn |
|---|---|---|---|
| Presence | Attendance | declared | Không phải productivity; API không trả check-in/check-out chi tiết |
| Activity | TimeLog + WorkItemEvent | declared + observed | TimeLog là tự khai báo; event receipt là hành động nghiệp vụ, không phải đo mức chăm chỉ |
| Output | Task done + WorkItemEvent receipt | observed | Receipt coverage hiển thị riêng; không đồng nghĩa chất lượng hoặc business impact |
| Outcome | Okr + Review status | declared + validated context | OKR progress là declared; final Review thêm manager context nhưng không tự chứng minh impact |

Phase 0 WorkEvidenceEvent ledger chưa được dùng trong dashboard. Collection vẫn disabled và manager-wide ledger read chưa được activation-governance phê duyệt.

## Authorization

- HR và Director: company scope.
- PM/Lead có `teamId`: team scope.
- Nhân viên: self scope.
- Freelancer: bị chặn trước database query.
- Response không chứa salary, hourly rate, review score, self/mgr note, check-in hoặc check-out.

## Manager Validation Queue

Queue chỉ nêu evidence gap có đường xử lý:

- Review chưa mở, đang chờ nhân sự hoặc đang chờ quản lý.
- Task done thiếu `completedAt`.
- Task done chưa có RepositoryRealms completion receipt.
- TimeLog chưa gắn Task.
- OKR đã cập nhật nhưng chưa có review đã chốt.

Gap không phải kết luận tiêu cực và chỉ dùng severity `info` hoặc `attention`.

## Guardrails

- `compositePerformanceScore = false`
- `employeeRanking = false`
- `presenceAsProductivity = false`
- `automaticHrDecision = false`
- Không tự Gold, payroll, kỷ luật hoặc sa thải.
- Dossier sắp theo tên, không theo output/outcome.

## Rollback

Phase 6 không migration schema. Có thể gỡ component khỏi Reviews và Guild Hall cùng API/read model mà không thay đổi Attendance, TimeLog, Task, OKR hay Review hiện hữu.

## Verification

- Domain/server/audit tests: `node --test tests/hr-evidence-outcome-intelligence*.test.mjs`
- Deterministic audit: `npm run audit:hr-evidence:check`
- Full regression gate: `npm run qa`
- Deployment target được phép duy nhất: `crmegoric-realms-demo`.
