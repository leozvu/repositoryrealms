# Phase 20 — Chaos Resilience & Graceful Degradation

## Mục tiêu

Phase 20 chứng minh Realm có thể suy giảm có kiểm soát khi dependency hỏng, trong khi ERP/CRM gốc vẫn là source of truth. Không có migration, database song song hoặc thay đổi lead-snapshot v1. Mọi triển khai chỉ dành cho `crmegoric-realms-demo`.

## Fault matrix

| Fault | Phát hiện | Safe state | Không được mất |
| --- | --- | --- | --- |
| Database chậm | Read deadline 5 giây | 503 + Retry-After; UI giữ snapshot gần nhất | Mutation ERP, policy, Gold ledger |
| WebSocket mất | Reconnect budget hữu hạn | BroadcastChannel local fallback | Khả năng tiếp tục làm việc trên ERP |
| API timeout | Client abort 8 giây | Degraded banner + retry thủ công | Dữ liệu last-known-good |
| Notification fail | Delivery receipt sau commit | Core state giữ nguyên, cảnh báo delivery degraded | Wave, kill switch, incident |
| Approval timeout | Deadline 24 giờ | Khóa approve, giữ policy hiện tại | Four-eyes control |
| Stale cache | TTL + stale-if-error | Snapshot cũ chỉ cho aggregate read | Số dư, RBAC, write decision |
| Partial rollout | Eligible/fallback aggregate | Ngoài cohort tiếp tục dùng ERP | Một source of truth |

## Invariants

- Không tự retry mutation vì có thể tạo duplicate hoặc trạng thái không xác định.
- Read timeout không được biến thành rollback transaction ghi.
- Notification luôn chạy sau khi transaction chính đã commit.
- Realm reconnect tối đa bốn lần trước khi chuyển local fallback.
- Stale cache cấm dùng cho Gold, quyền hạn, approval và quyết định ghi.
- Partial rollout là trạng thái được thiết kế; ERP fallback phải luôn đạt gate.

## Game Day

1. Chạy `npm run audit:realm:chaos:check` và `node --test tests/realm-chaos.test.mjs`.
2. Inject từng fault độc lập trên staging; không inject production và không dùng dữ liệu nhân sự thật trong evidence.
3. Xác nhận UI có icon + text, đường retry rõ ràng và không xuất hiện màn trắng.
4. Với notification fail, xác nhận wave/policy đã commit trước delivery receipt.
5. Với WebSocket loss, xác nhận trạng thái chuyển `gateway-degraded → local-ready`.
6. Với partial rollout, một người dùng Realm và một người dùng ERP phải quan sát cùng dữ liệu nghiệp vụ sau refresh/change feed.
7. Kết thúc Game Day bằng `mode = off` nếu có bất kỳ critical invariant nào không đạt; giữ nguyên dữ liệu và migration.

## Rollback

Rollback vận hành là kill switch Realm về ERP fallback. Không reset Git, không xóa bảng, không restore database và không tự tái kích hoạt Realm. Mở lại phải qua Controlled Launch, rehearsal, maker–checker và canary gate hiện có.
