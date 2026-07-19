# Phase 2 — UI action → API → Prisma → RBAC map

Báo cáo này được sinh tự động bằng `npm run audit:ui:actions`. Mapping tĩnh có mức confidence; candidate UX không tự động được coi là defect.

## Phạm vi

- Element definitions: **645**
- API route contracts: **54**
- Registry resources: **50**
- Data-bound actions: **88**
- Delegated callback bindings: **1021**
- Actionable unresolved: **0**
- Parse errors: **0**

## Phân loại action

| Loại | Số lượng |
| --- | --- |
| local-state | 215 |
| data-action | 88 |
| form-control | 204 |
| delegated-action | 69 |
| navigation | 48 |
| browser-action | 13 |
| helper-action | 8 |

## Trạng thái mapping

| Trạng thái | Số lượng |
| --- | --- |
| classified-local | 470 |
| delegated-resolved | 31 |
| handler-resolved | 75 |
| delegated | 69 |

## Mức độ tin cậy

| Confidence | Số lượng |
| --- | --- |
| high | 614 |
| medium | 31 |

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

