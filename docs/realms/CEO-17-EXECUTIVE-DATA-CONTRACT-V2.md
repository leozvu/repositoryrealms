# CEO-17 — Executive Data Contract v2

Contract mới: `repositoryrealms.ceo.executive-snapshot` `2.0.0`. Đây là endpoint additive `/api/ceo/v2/executive-snapshot`; snapshot v1 và lead-snapshot v1 không đổi.

## Sections

- Approval backlog: count, oldest pending timestamp và count theo type; không xuất payload/requester/reviewer.
- Capacity: active work item, WIP limit, saturated queue và active headcount. Đây là planning context, không phải productivity score.
- Incident registry: chỉ ID/code/priority/state/timestamps của Ticket `source=incident_registry`; không xuất title, description hay assignee.
- Forecast: `Lead.value × xác suất stage được cấu hình`; thiếu cấu hình thì `available=false`, không dùng fallback giả.
- Accounting: cash ledger và receivable nhóm theo currency; recognized revenue và accounting profit khai báo unavailable cho tới khi có canonical ledger.
- Egolive: GMV on-stream, net GMV, net received, pending reconciliation và pending platform settlement là các lớp tiền tách biệt; `gmvIsRevenue=false` bắt buộc.

Portal probe capability trước. Entity chưa có endpoint v2 được đánh dấu `not_supported`, không bị coi là zero hoặc outage. Timeout một entity chỉ degrade card đó.
