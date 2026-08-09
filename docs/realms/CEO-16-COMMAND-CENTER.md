# CEO-16 — Capability-negotiated Command Center

## Contract

Portal chỉ hiển thị action mà `/api/ceo/v1/capabilities` của entity đích công bố. Nếu capability probe lỗi, UI hạ về bốn action tương thích ổn định; không đoán backend hỗ trợ action mới.

Allowlist gồm:

- `task.create`
- `task.adjust` — field allowlist + `updatedAt` compare-and-swap; không đổi workflow status
- `status.request`
- `project.status.request` — tạo request Task gắn ngữ cảnh Project, không sửa Project status
- `announcement.send`
- `approval.request`
- `group_workforce.request`
- `incident.acknowledge` — chỉ Ticket `source=incident_registry`, state `open`, có CAS

Mọi action đi qua RepositoryRealms authorization, target business rules, idempotency/correlation, canonical receipt và payload-free AuditLog. Portal không giữ business payload và không cho phép write invoice, payroll, payout hoặc settlement.

## Activation

Action mới chỉ xuất hiện sau khi entity cùng version được deploy và membership được cấp đúng command scope. Partial rollout giữ action mới ẩn; các action cũ vẫn sử dụng được.
