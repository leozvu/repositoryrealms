# Phase 2 — UI action → API → Prisma → RBAC map

Báo cáo này được sinh tự động bằng `npm run audit:ui:actions`. Mapping tĩnh có mức confidence; candidate UX không tự động được coi là defect.

## Phạm vi

- Element definitions: **880**
- API route contracts: **107**
- Registry resources: **50**
- Data-bound actions: **157**
- Delegated callback bindings: **1122**
- Actionable unresolved: **0**
- Parse errors: **0**

## Phân loại action

| Loại | Số lượng |
| --- | --- |
| local-state | 237 |
| data-action | 157 |
| form-control | 282 |
| delegated-action | 84 |
| navigation | 85 |
| browser-action | 27 |
| helper-action | 8 |

## Trạng thái mapping

| Trạng thái | Số lượng |
| --- | --- |
| classified-local | 591 |
| delegated-resolved | 46 |
| handler-resolved | 159 |
| delegated | 84 |

## Mức độ tin cậy

| Confidence | Số lượng |
| --- | --- |
| high | 834 |
| medium | 46 |

## UX async/feedback candidates

Không có candidate.

### Hàng chờ state/feedback đầu tiên

Không có candidate.

## Action chưa truy được target

Không có action unresolved.

## Quy ước mapping

- `handler-resolved`: handler trực tiếp truy được fetch/CRUD hook.
- `delegated-resolved`: control dùng callback prop và target được truy từ component caller.
- `classified-local`: navigation, form control, local state hoặc browser action; không cần API.
- `delegated`: callback được nhận diện nhưng target phụ thuộc runtime/caller.
- `unresolved`: cần browser/manual trace trong phase kế tiếp.

## Giới hạn Phase 2

- Mapping theo definition JSX; element sinh trong `.map()` không nhân theo record runtime.
- RBAC dedicated route là static contract extraction; quyết định cuối cùng vẫn ở server.
- Loading/success/error là tín hiệu code tĩnh, sẽ được xác minh bằng browser/E2E sau.

