# Phase 5 — Realm session access & RBAC parity

Phase 5 chiếu quyền của session ERP và cấu hình module vào Realm trước khi người dùng mở một surface; API gốc vẫn là lớp cưỡng chế cuối cùng.

## Kết quả

- Surface policies: **8**
- Role scenarios: **8/8**
- Module scenarios: **5/5**
- Server/UI enforcement contracts: **11/11**
- Failed policies: **0**

## Surface policy

| Surface | Key | Vai trò | Module |
| --- | --- | --- | --- |
| Sổ nhân vật | personal | PM, AM, ACCOUNTANT, HR, LEAD, STAFF |  |
| Quest Board | quests | PM, AM, ACCOUNTANT, HR, LEAD, STAFF | tasks |
| Guild Hall | guild | PM, AM, ACCOUNTANT, HR, LEAD, STAFF | tasks |
| War Room | campaigns | PM, AM, ACCOUNTANT, HR, LEAD, STAFF | delivery |
| Royal Embassy | embassy | AM | sales |
| Hội đồng Gold | rewards | PM, LEAD, HR | tasks |
| Đài quan sát Gold | economy | PM, LEAD, HR | tasks |
| Tavern | treasury | PM, AM, ACCOUNTANT, HR, LEAD, STAFF |  |

## Ma trận vai trò

| Scenario | Expected | Actual | Status |
| --- | --- | --- | --- |
| DIRECTOR | personal, quests, guild, campaigns, embassy, rewards, economy, treasury | personal, quests, guild, campaigns, embassy, rewards, economy, treasury | verified |
| PM | personal, quests, guild, campaigns, rewards, economy, treasury | personal, quests, guild, campaigns, rewards, economy, treasury | verified |
| AM | personal, quests, guild, campaigns, embassy, treasury | personal, quests, guild, campaigns, embassy, treasury | verified |
| ACCOUNTANT | personal, quests, guild, campaigns, treasury | personal, quests, guild, campaigns, treasury | verified |
| HR | personal, quests, guild, campaigns, rewards, economy, treasury | personal, quests, guild, campaigns, rewards, economy, treasury | verified |
| LEAD | personal, quests, guild, campaigns, rewards, economy, treasury | personal, quests, guild, campaigns, rewards, economy, treasury | verified |
| STAFF | personal, quests, guild, campaigns, treasury | personal, quests, guild, campaigns, treasury | verified |
| FREELANCER |  |  | verified |

## Ma trận module

| Scenario | Modules | Expected | Actual | Status |
| --- | --- | --- | --- | --- |
| staff-none |  | personal, treasury | personal, treasury | verified |
| staff-tasks | tasks | personal, quests, guild, treasury | personal, quests, guild, treasury | verified |
| am-sales-tasks | sales, tasks | personal, quests, guild, embassy, treasury | personal, quests, guild, embassy, treasury | verified |
| pm-delivery | delivery | personal, campaigns, treasury | personal, campaigns, treasury | verified |
| lead-team-tasks | tasks | personal, quests, guild, rewards, economy, treasury | personal, quests, guild, rewards, economy, treasury | verified |

## Enforcement

- Snapshot ERP mang access manifest được sinh từ session, role, team và Setting.modules.
- Endpoint Guild, Rewards, Economy, Embassy và War Room kiểm tra cùng surface policy trước khi query nghiệp vụ.
- Claim Quest bị chặn khi module Tasks tắt; snapshot không trả Task trong trạng thái đó.
- Realm navigation, ledger tabs và portal cards hiện trạng thái khóa kèm lý do thay vì tạo no-op.

## Regression gate

Chạy `npm run audit:realm:access:check`. Gate thất bại nếu policy trùng/thiếu, ma trận role-module lệch hoặc evidence server/UI bị mất.

