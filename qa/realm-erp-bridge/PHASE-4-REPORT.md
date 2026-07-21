# Phase 4 — Realm ↔ ERP/CRM business bridge

Phase 4 giữ ERP/CRM làm nguồn sự thật duy nhất và biến lớp medieval thành một cách điều hướng/hiển thị khác, không tạo bản ghi nghiệp vụ song song.

## Kết quả

- Primary ERP navigation routes: **57**
- Routes có medieval mapping: **57/57**
- Route files được xác minh: **57/57**
- Record-level bridge flows: **10/10**
- Link contracts: **5/5**
- Unresolved mappings: **0**
- Navigation catalog drift: **0**

## Nguyên tắc kiến trúc

- Menu ERP và ma trận Realm dùng chung `lib/erp-navigation.js`; không nhân đôi route/role/module trong component.
- Medieval label chỉ đổi ngôn ngữ trình bày. API, Prisma, RBAC và dữ liệu vẫn là ERP gốc.
- Quest, Campaign, Guild member, Lead và Client mở đúng record gốc; không dừng ở trang danh sách.
- Deep-link Task/Lead tự mở modal đúng ID và báo lỗi nếu record không còn tồn tại hoặc vượt quyền.

## Record-level flows

| Flow | Realm | ERP target | Target | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| quest-snapshot | Quest | Task | /tasks?focus=:id | verified | links: buildRealmQuestLinks(task, accessContext) |
| quest-board | Quest Board | Task detail | /tasks?focus=:id | verified | quest.links?.task \|\| realmRecordHref('task' |
| task-focus | Realm deep-link | Task modal | TaskDetailModal | verified | get('focus') + setModal({ mode: 'edit', row: task }) |
| guild-member | Guild member | Staff profile | /staff/:id | verified | realmRecordHref('staff', member.id) |
| war-room-task | War Room Task | Task detail | /tasks?focus=:id | verified | onOpenTask + Mở Task ERP |
| war-room-project | Campaign | Project detail | /projects/:id | verified | realmRecordHref('project', selectedCampaign?.id) |
| embassy-lead | Embassy opportunity | Lead detail | /leads?focus=:id | verified | onOpenLead + Mở Lead ERP |
| lead-focus | Realm deep-link | Lead modal | Lead FormModal | verified | get('focus') + setModal({ mode: 'edit', row: lead }) |
| embassy-client | Embassy alliance | Client detail | /clients/:id | verified | onOpenClient + Mở Client ERP |
| global-search | Shared navigation | Exact record | record-aware routes | verified | realmRecordHref('lead' + realmRecordHref('task' + realmRecordHref('project' + realmRecordHref('staff' |

## Browser scenarios

| Scenario | Route | Evidence |
| --- | --- | --- |
| portal-registry | /realm-demo | Sổ nhân vật hiển thị 7 cổng lõi với medieval label và route ERP nguyên bản. |
| deep-link-auth | /tasks?focus=task-demo&from=realm | Anonymous deep-link chuyển về login; record ERP không bị lộ. |
| responsive-bridge | /realm-demo | Viewport mobile không overflow; portal card cao 64px, vượt touch target tối thiểu 44px. |
| browser-console | /realm-demo | Không có browser warning/error trong các scenario Phase 4. |

## Regression gate

Chạy `npm run audit:realm:bridge:check`. Gate thất bại khi ERP navigation có route chưa map, route file mất, deep-link contract sai, record flow thiếu evidence hoặc artifact Phase 4 bị stale.

