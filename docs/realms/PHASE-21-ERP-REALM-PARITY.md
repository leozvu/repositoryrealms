# Phase 21 — ERP/Realm Business Invariant Parity

## Milestone wording

Wording chính thức:

> Mọi business action đều dùng cùng authorization, business rules và receipts của RepositoryRealms.

Parity không phải button parity. ERP có button X không bắt buộc Realm phải có button X, và Realm có Suggested Action không bắt buộc ERP phải dùng cùng tên, component hoặc API payload.

Luồng bắt buộc là:

`presentation intent → RepositoryRealms → authorization → business rules → receipt → audit`

## RepositoryRealms contract

Mỗi action được đăng ký bằng intent, resource ERP gốc, availability surface và bốn invariant:

1. Authorization: role, resource permission và row scope được kiểm tra phía server.
2. Business rules: transition graph, validation, compare-and-swap và domain constraints được áp dụng tại canonical service.
3. Receipt: idempotency receipt xác nhận action hoặc replay, không dựa vào trạng thái button.
4. Audit: AuditLog nằm cùng transaction với record và receipt.

Metadata trình bày như `presentation`, `uiLabel` và `sourceControl` bị loại trước khi chạy domain action. Vì vậy việc đổi “Approve” thành “Suggested Action” không làm đổi business outcome.

## Ví dụ Invoice

Nếu ERP có `Approve Invoice`, Realm có thể trình bày `Suggested Action → Approve`. Tuy nhiên Phase 21 không tự động tạo action `invoice.approve`: intent này hiện chưa có trong allowlist RepositoryRealms và phải fail closed.

Trước khi thêm Invoice vào Realm cần đăng ký contract riêng, trỏ tới authorization và business rules canonical của Invoice, xác định receipt/audit, rồi bổ sung deterministic tests. Không sao chép handler từ button ERP sang Realm.

## Action hiện được đăng ký

- `task.transition`
- `task.assign`
- `lead.transition`
- `task.comment.create`
- `lead.followup.create`

Các UI Realm được tự do dùng ngôn ngữ Quest, War Council, Diplomatic follow-up hoặc Suggested Action. Chúng không được phép bypass RepositoryRealms hoặc ghi record trực tiếp.

## Verification và rollout

Chạy:

```bash
npm run audit:realm:parity:check
node --test tests/repository-realms.test.mjs tests/repository-realms-parity-audit.test.mjs
```

Phase 21 không có migration và không tạo business table song song. Chỉ triển khai lên `crmegoric-realms-demo`; ERP gốc và lead-snapshot v1 không thay đổi.
