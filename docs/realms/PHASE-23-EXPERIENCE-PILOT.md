# Phase 23 — Experience Pilot, feedback loop và launch evidence

Phase 23 tạo vòng pilot nội bộ đo đủ để ra quyết định UX nhưng không biến Realm thành công cụ theo dõi năng suất cá nhân.

## Vai trò trong launch governance

`Experience Pilot scorecard` là advisory. Nó không tự mở cohort, không deploy, không thay đổi launch decision và không thay thế RepositoryRealms launch readiness, maker–checker seal, canary gate hoặc kill switch.

Luồng quyết định:

```text
Aggregate UX evidence
  + Guild Support feedback
  + RepositoryRealms launch readiness
  → advisory Experience scorecard
  → Director xem xét
  → launch workflow hiện hữu (authoritative)
```

## Signal contract

Allowlist cố định:

- `realm_opened`
- `mode_changed`
- `journey_opened`
- `continuity_restored`
- `erp_handoff`
- `sync_degraded`
- `sync_recovered`
- `feedback_opened`

Mỗi signal chỉ có `event`, `surface` (`realm`, `ledger`, `erp`) và journey allowlisted (`guild`, `war`, `treasury`, `tavern`). Server bỏ mọi field khác trước khi cộng counter.

Không lưu:

- user ID hoặc cohort member ID;
- record ID, route record parameter hoặc nội dung nghiệp vụ;
- nội dung chat/feedback;
- phím bấm, mouse movement, lịch sử duyệt;
- duration, time-on-task hoặc performance score.

Counter có kích thước cố định và được lưu trong `Setting.json`, vì vậy không cần migration và không tạo event log tăng vô hạn. Settings form không được phép ghi đè counter này.

## Pilot evidence gates

1. RepositoryRealms launch readiness hiện hữu đang xanh.
2. Có evidence khôi phục ngữ cảnh.
3. Có evidence Realm → ERP handoff.
4. Cả bốn journey Guild / War / Treasury / Tavern đã được quan sát.
5. Degraded state có evidence recovery hoặc chưa phát sinh.
6. Không còn Guild Support feedback mang impact `blocked`.

Gate 1–4 và 6 là blocker của advisory scorecard. Gate 5 là advisory. Dù scorecard xanh, Director vẫn phải dùng launch workflow hiện hữu.

## Feedback loop

- Launcher có ở cả Realm và ERP cho thành viên pilot.
- Mở launcher chỉ tăng aggregate counter; nội dung chỉ được gửi khi người dùng chủ động submit.
- Submit tạo Ticket ERP qua Guild Support với idempotency key.
- Pilot Operations xử lý, phản hồi và đóng ticket; blocker chưa đóng giữ scorecard ở trạng thái hold.
- Người dùng Realm luôn có lối `Về ERP an toàn`.

## Pilot cadence đề xuất

- Daily: Director xem blocker, degraded/recovered và four-journey coverage.
- Sau mỗi wave: review ticket themes, không xếp hạng con người.
- Trước expansion: launch readiness + sealed rehearsal + scorecard evidence + zero blocker.
- Khi có regression: pause/rollback về ERP qua control plane hiện hữu.

## Go / no-go

Go chỉ khi authoritative launch workflow cho phép. `ready-for-approved-expansion` nghĩa là evidence UX không cản expansion đã được duyệt; nó không phải quyền tự deploy.

Chạy gate:

```text
npm run audit:realm:experience:check
```

## Evidence hoàn tất 2026-07-20

- Phase 22–23 static contract gate: toàn bộ contracts và 4/4 journeys verified.
- Unit/integration: 450/450 passed.
- Coverage gate: 95.34% lines, 81.39% branches, 94.93% functions.
- Production E2E: 25 passed, 9 skipped có chủ đích vì cần ephemeral staging Director/ERP-sync flag, 0 failed.
- Dependency audit: 0 high-severity production vulnerability.
- Next production build: compile thành công, 78/78 static pages generated.
- Không commit, push hoặc deploy trong phase này; launch authority không thay đổi.
