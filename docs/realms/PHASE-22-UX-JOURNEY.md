# Phase 22 — Realm UX/UI journey contract

Phase 22 biến Realm thành một giao diện công việc medieval hoàn chỉnh mà không thay thế ERP/CRM. Realm có ngôn ngữ hình ảnh riêng; mọi business action vẫn đi qua authorization, business rules, receipt và audit của RepositoryRealms.

## Runtime visual system

- Realm mặc định tải character, environment, business prop và ornamental UI đã generate; từng lớp vẫn có cờ `=0` để rollback độc lập và tự fallback về procedural/CSS khi tải lỗi.
- ERP/CRM giữ nguyên information architecture và mật độ thao tác, nhưng dùng chung stone, dark wall, parchment, brass divider, shield và portrait ring của Phase 22 ở shell, card, table, modal và login.
- Raster art luôn `pointer-events: none`; text, icon, input, authorization, receipt và audit vẫn là DOM/business contract hiện hữu.
- Character atlas v2 ưu tiên silhouette người ở kích thước map: đầu, vai, tay và hai chân tách bạch; runtime hiển thị cao `2.3` tiles, đặt tên phía trên đầu và dùng vòng sáng dưới chân thay cho khung chữ nhật.

## Journey được nghiệm thu

| Journey | Realm entry | Business meaning | Safe ERP handoff |
| --- | --- | --- | --- |
| Guild | Guild Hall / Sổ Realm | Người, task, workload và collaboration | Staff, tasks và ticket ERP hiện hữu |
| War | Chiến dịch / War Room | Project health, task dependency và suggested action | Project/task record ERP hiện hữu |
| Treasury | Royal Treasury | Gold balance, journal và career status | RepositoryRealms receipt/audit |
| Tavern | Arcane Forge / Tavern | Reward catalogue và redemption | Gold ledger, approval và receipt hiện hữu |

Parity là parity của business invariant, không phải parity của button. Realm không cần sao chép tên hoặc bố cục nút ERP.

## Continuity

- Thiết bị chỉ lưu `mode`, stable panel, ledger view và tọa độ bản đồ đã giới hạn.
- Không lưu user ID, record ID, nội dung record, phím bấm, lịch sử duyệt hoặc thời lượng.
- Context sai version, panel không còn trong pilot hoặc surface bị thu hồi quyền tự fallback về Great Hall / Sổ nhân vật.
- Realm → ERP luôn ghi nhớ lựa chọn surface nhưng không tạo bản sao dữ liệu.
- Presence, contact và notification tiếp tục dùng collaboration bridge để người ở ERP vẫn nhận liên hệ từ người ở Realm.

## Responsive và accessibility

- Desktop giữ navigation ba vùng; dưới 1280px inspector xuống hàng; dưới 900px navigation gọn; dưới 620px dùng destination select thay danh sách nút dài.
- Target tương tác tối thiểu 44px; input trên mobile không nhỏ hơn 16px ở feedback flow.
- Có skip link, programmatic focus sau chuyển vùng, live status announcement, label đầy đủ và progressbar semantic.
- Tôn trọng `prefers-reduced-motion`, safe-area inset và dynamic text scaling.
- Realm vẫn dùng icon SVG chung; generated art chỉ là decoration và không chặn pointer/focus.

## Performance budget

- Decorative UI runtime: dưới 125 KB.
- Business props runtime: dưới 100 KB.
- Environment WebP runtime: dưới 750 KB.
- Ledger section dưới fold dùng `content-visibility: auto` với intrinsic size để giảm work render.
- Khi generated art lỗi, procedural/CSS rendering vẫn là fallback; không chặn business action.

## Degraded states

Realm hiển thị last-known-good snapshot, support ID và nút thử lại có chủ đích. Không tự retry mutation. WebSocket có bounded reconnect rồi local fallback; API timeout không làm mất snapshot; notification failure không rollback transaction đã commit.

## Verification

Chạy:

```text
npm run audit:realm:experience:check
npm test
npm run build
```

Browser QA tối thiểu: desktop 1440×900, tablet 768×1024, mobile 390×844; kiểm tra Realm, Sổ Realm, Realm → ERP, focus keyboard, reduced motion và một degraded state.

## Evidence hoàn tất 2026-07-20

- Desktop 1440×900, tablet 768×1024 và mobile 390×844: `scrollWidth - clientWidth = 0`.
- Tablet navigation giữ target 51px; mobile chuyển sang destination select và ẩn danh sách nav dài.
- Mobile destination mở trực tiếp `ledger:treasury`; Tavern surface và pressed state khớp.
- Context reload khôi phục Sổ Realm/Tavern và chỉ có năm key presentation: `version`, `mode`, `panel`, `ledgerView`, `position`.
- Generated art preload chuyển `loading → ready`, UI frame URL hợp lệ, không có console error; dưới 1280px inspector frame nặng được tắt.
- Production Chromium E2E: 25 passed, 9 skipped có chủ đích, 0 failed trên desktop + Pixel 5.
