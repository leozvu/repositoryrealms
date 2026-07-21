# Phase 1 — UI element & route inventory

Báo cáo này được sinh tự động từ AST bằng `npm run audit:ui:inventory`. Đây là inventory tĩnh, không phải kết luận rằng một candidate chắc chắn là bug.

## Phạm vi

- UI routes: **61**
- API routes: **104**
- Interactive element definitions: **868**
- Source files có interaction: **89**
- Routes có ERP resource candidate: **42**
- Parse errors: **0**

## Phân loại element

| Loại | Số lượng |
| --- | --- |
| action | 512 |
| form-control | 281 |
| form-submit | 14 |
| navigation | 61 |

## UX risk candidates cần review thủ công

| Candidate | Số lượng |
| --- | --- |
| clickable_non_semantic | 17 |
| control_binding_unverified | 237 |
| keyboard_path_unverified | 17 |
| unlabelled_button_candidate | 35 |

Các candidate ưu tiên accessibility, keyboard, semantic control và possible no-op theo checklist UI/UX. Danh sách đầy đủ nằm trong `inventory.json` và `elements.csv`.

### 40 candidate đầu tiên

| Element ID | Source | Nhãn | Candidates |
| --- | --- | --- | --- |
| route.analytics.action.setmodal-mode-del-row-r | app/(app)/analytics/page.jsx:168 | (không có nhãn tĩnh) | unlabelled_button_candidate |
| route.attendance.form-control.select | app/(app)/attendance/page.jsx:73 | (không có nhãn tĩnh) | control_binding_unverified |
| route.attendance.form-control.input | app/(app)/attendance/page.jsx:146 | (không có nhãn tĩnh) | control_binding_unverified |
| route.attendance.form-control.ten-ngay-le-vd-quoc-khanh | app/(app)/attendance/page.jsx:147 | Tên ngày lễ (VD: Quốc khánh) | control_binding_unverified |
| route.attendance.form-control.chon | app/(app)/attendance/page.jsx:173 | — Chọn — | control_binding_unverified |
| route.attendance.form-control.input.2 | app/(app)/attendance/page.jsx:177 | (không có nhãn tĩnh) | control_binding_unverified |
| route.attendance.form-control.input.3 | app/(app)/attendance/page.jsx:178 | (không có nhãn tĩnh) | control_binding_unverified |
| route.audit.form-control.tim-theo-nguoi-oi-tuong | app/(app)/audit/page.jsx:37 | Tìm theo người, đối tượng… | control_binding_unverified |
| route.automation.form-control.vd-bao-tin-khi-thang-deal | app/(app)/automation/page.jsx:37 | VD: Báo tin khi thắng deal | control_binding_unverified |
| route.automation.form-control.select | app/(app)/automation/page.jsx:40 | (không có nhãn tĩnh) | control_binding_unverified |
| route.automation.form-control.select.2 | app/(app)/automation/page.jsx:43 | (không có nhãn tĩnh) | control_binding_unverified |
| route.automation.form-control.truong | app/(app)/automation/page.jsx:51 | trường | control_binding_unverified |
| route.automation.form-control.select.3 | app/(app)/automation/page.jsx:52 | (không có nhãn tĩnh) | control_binding_unverified |
| route.automation.form-control.input | app/(app)/automation/page.jsx:53 | (không có nhãn tĩnh) | control_binding_unverified |
| route.automation.action.set-conditions-f-conditions-filter-j-j-i | app/(app)/automation/page.jsx:54 | (không có nhãn tĩnh) | unlabelled_button_candidate |
| route.automation.form-control.select.4 | app/(app)/automation/page.jsx:66 | (không có nhãn tĩnh) | control_binding_unverified |
| route.automation.action.set-actions-f-actions-filter-j-j-i | app/(app)/automation/page.jsx:69 | (không có nhãn tĩnh) | unlabelled_button_candidate |
| route.automation.form-control.noi-dung-tin-nhan-vd-deal-name-tri-gia-value-vua-thang | app/(app)/automation/page.jsx:71 | Nội dung tin nhắn — VD: Deal {name} trị giá {value}đ vừa thắng! 🎉 | control_binding_unverified |
| route.automation.form-control.ten-cong-viec-vd-lam-hop-ong-cho-name | app/(app)/automation/page.jsx:73 | Tên công việc — VD: Làm hợp đồng cho {name} | control_binding_unverified |
| route.automation.form-control.chua-gan-ai | app/(app)/automation/page.jsx:75 | — Chưa gán ai — | control_binding_unverified |
| route.automation.form-control.han-sau-ngay | app/(app)/automation/page.jsx:79 | Hạn sau ? ngày | control_binding_unverified |
| route.automation.form-control.https-url-nhan-post | app/(app)/automation/page.jsx:82 | https://… (URL nhận POST) | control_binding_unverified |
| route.automation.action.khi-ieu-kien-hanh-ong-tat-bat | app/(app)/automation/page.jsx:120 | Khi / · / điều kiện · / hành động / Tắt / Bật | clickable_non_semantic, keyboard_path_unverified |
| route.automation.action.e-e-stoppropagation-setmodal-mode-del-row-r | app/(app)/automation/page.jsx:127 | (không có nhãn tĩnh) | unlabelled_button_candidate |
| route.calendar.action.d | app/(app)/calendar/page.jsx:83 | {d} | clickable_non_semantic, keyboard_path_unverified |
| route.ceo-inbox.action.load | app/(app)/ceo-inbox/page.jsx:149 | (không có nhãn tĩnh) | unlabelled_button_candidate |
| route.ceo-inbox.form-control.select | app/(app)/ceo-inbox/page.jsx:155 | — | control_binding_unverified |
| route.ceo-inbox.form-control.select.2 | app/(app)/ceo-inbox/page.jsx:156 | (không có nhãn tĩnh) | control_binding_unverified |
| route.ceo-inbox.action.button | app/(app)/ceo-inbox/page.jsx:158 | (không có nhãn tĩnh) | unlabelled_button_candidate |
| route.ceo-inbox.action.setselectedid-conversation-id | app/(app)/ceo-inbox/page.jsx:162 | (không có nhãn tĩnh) | unlabelled_button_candidate |
| route.ceo-inbox.action.button.2 | app/(app)/ceo-inbox/page.jsx:175 | (không có nhãn tĩnh) | unlabelled_button_candidate |
| route.ceo-inbox.form-control.textarea | app/(app)/ceo-inbox/page.jsx:175 | (không có nhãn tĩnh) | control_binding_unverified |
| route.ceo-overview.action.setfilter-all | app/(app)/ceo-overview/page.jsx:193 | (không có nhãn tĩnh) | unlabelled_button_candidate |
| route.ceo-overview.action.setfilter-entity-id | app/(app)/ceo-overview/page.jsx:194 | (không có nhãn tĩnh) | unlabelled_button_candidate |
| route.ceo-overview.action.load-filter | app/(app)/ceo-overview/page.jsx:198 | (không có nhãn tĩnh) | unlabelled_button_candidate |
| route.ceo-registry.action.load | app/(app)/ceo-registry/page.jsx:265 | (không có nhãn tĩnh) | unlabelled_button_candidate |
| route.ceo-registry.action.loadidentity | app/(app)/ceo-registry/page.jsx:288 | (không có nhãn tĩnh) | unlabelled_button_candidate |
| route.ceo-registry.form-control.input | app/(app)/ceo-registry/page.jsx:294 | (không có nhãn tĩnh) | control_binding_unverified |
| route.ceo-registry.form-control.input.2 | app/(app)/ceo-registry/page.jsx:298 | (không có nhãn tĩnh) | control_binding_unverified |
| route.ceo-registry.form-control.input.3 | app/(app)/ceo-registry/page.jsx:316 | (không có nhãn tĩnh) | control_binding_unverified |

## Authenticated routes chưa nằm trong primary navigation

Không có route bất thường.

Dynamic detail routes và route Freelancer được loại khỏi danh sách này vì có entry path riêng.

## Giới hạn Phase 1

- Button sinh từ một JSX template trong `.map()` được ghi một definition, không nhân theo số record runtime.
- API/resource candidates đang gắn ở cấp source file; Phase 2 sẽ truy handler cụ thể tới API/model.
- `uxRiskCandidates` là hàng chờ review, không tự động được coi là defect.
- Element ID dựa trên surface + loại + nhãn/handler nên ổn định khi chỉ thay đổi số dòng.
