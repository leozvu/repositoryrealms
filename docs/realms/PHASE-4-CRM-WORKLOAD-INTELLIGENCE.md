# Phase 4 — CRM Workload Intelligence

## Product invariant

CRM không chỉ là pipeline. Phase 4 trả lời câu hỏi vận hành: đội sales đang dùng năng lực đúng chỗ chưa, Lead nào cần follow-up, owner nào vượt WIP và hồ sơ nào cần manager quyết định.

Phase 4 không tạo một Lead store, Activity store hoặc sales score mới. `Lead`, `Activity` và `User` tiếp tục là canonical ERP records. ERP CRM và Royal Embassy cùng gọi `crm-workload-intelligence-v1`.

## Lead quality lifecycle

Read model phân loại, không tự đổi `Lead.stage`:

- **Active**: Lead mở và chưa vượt ngưỡng follow-up.
- **Stale**: quá ngưỡng ngày chưa có completed CRM activity, Lead mới chưa phản hồi, hoặc có follow-up quá hạn.
- **Dormant**: vượt ngưỡng dormant; đây là ứng viên manager review, không phải tự động đánh lost.
- **Decided**: `won` hoặc `lost`. Chỉ stage `lost` được đếm vào dead leads.

Rule mặc định: stale sau 14 ngày, dormant sau 30 ngày, new-response sau 2 ngày và owner WIP 20 Lead mở. Có thể đọc override từ Setting: `crmStaleDays`, `crmDormantDays`, `crmNewResponseDays`, `crmLeadWipLimit`.

## Evidence và confidence

Activity `done = true` chỉ được gọi là `recorded_completed_activity`: một CRM record do người dùng xác nhận, chưa phải observed truth. Activity sắp tới là commitment; Activity quá hạn là tín hiệu điều phối.

Confidence ceiling giữ ở `medium`. Phase 4 không suy luận nhân viên “giỏi/dở”, không dùng số lượng Lead làm productivity score và không tái sử dụng AI Lead Score cũ trên UI.

## Owner workload và manager queue

Owner capacity dùng số Lead mở so với explicit WIP policy:

- `available`: dưới 80%.
- `near`: từ 80% đến giới hạn.
- `over`: vượt giới hạn.

Owner luôn sắp theo alphabet, không theo doanh thu, số Lead hay score. Manager Queue ưu tiên unassigned Lead, overdue follow-up, dormant review và portfolio vượt WIP. Mỗi item có source, explanation và recommended action.

Queue chỉ advisory. Nó không tự assign owner, tự đổi stage, tự tạo follow-up, thưởng Gold, trừ lương hay kỷ luật.

## Authorization và privacy

- Director đọc company scope.
- Account/Sales đọc Lead của mình cộng Lead chưa gán, đúng scope registry hiện hữu.
- Staff và freelancer bị chặn trước database query.
- Email và phone chỉ được dùng server-side để tính contact coverage; API workload và Royal Embassy không trả giá trị contact.
- API dùng `private, no-store`.

## Hai giao diện, một contract

ERP CRM hiển thị manager queue và owner capacity trước; forecast/Kanban gốc vẫn tồn tại trong `Pipeline & forecast drill-down`. Royal Embassy hiển thị cùng active/stale/dormant, manager queue và owner WIP nhưng giữ theme medieval.

Các command chuyển stage/follow-up trong Realm vẫn đi qua RepositoryRealms authorization, business rules, receipt và audit. Phase 4 không tạo mutation path mới.

## Data model và rollout

Phase 4 chỉ thêm read model, API, UI và audit; không cần schema migration. Staging target duy nhất là project `crmegoric-realms-demo`. Không deploy sang `erp-egoric.vercel.app`.

## Verification

```text
npm run audit:crm
npm run audit:crm:check
node --test tests/crm-workload-intelligence*.test.mjs tests/realm-embassy*.test.mjs
npm run build
npm run staging:smoke:execution
```

Definition of Done:

- Một canonical Lead store và một canonical Activity store.
- Lifecycle, WIP, manager queue và forecast deterministic.
- Activity provenance không bị gọi là observed truth.
- ERP CRM và Royal Embassy chia sẻ cùng engine.
- Pipeline CRM gốc vẫn được giữ.
- Không arbitrary lead score, employee ranking hoặc automatic Lead mutation.
- Desktop/mobile/reduced-motion và keyboard alternative cho drag/drop được kiểm tra.
- Không chạm Lead Snapshot v1, `lib/leozops` hoặc `tests/leozops-*`.
