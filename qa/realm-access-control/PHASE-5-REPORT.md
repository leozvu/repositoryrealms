# Phase 5 — Realm session access & RBAC parity

Phase 5 chiếu quyền của session ERP và cấu hình module vào Realm trước khi người dùng mở một surface; API gốc vẫn là lớp cưỡng chế cuối cùng.

## Kết quả

- Surface policies: **9**
- Role scenarios: **8/8**
- Module scenarios: **5/5**
- Server/UI enforcement contracts: **12/12**
- Failed policies: **0**

## Surface policy

| Surface | Key | Vai trò | Module |
| --- | --- | --- | --- |
| Sổ nhân vật | personal | PM, AM, ACCOUNTANT, HR, LEAD, STAFF |  |
| Quest Board | quests | PM, AM, ACCOUNTANT, HR, LEAD, STAFF | tasks |
| Royal Command Center | command | PM, AM, ACCOUNTANT, HR, LEAD, STAFF | tasks |
| Guild Hall | guild | PM, AM, ACCOUNTANT, HR, LEAD, STAFF | tasks |
| War Room | campaigns | PM, AM, ACCOUNTANT, HR, LEAD, STAFF | delivery |
| Royal Embassy | embassy | AM | sales |
| Hội đồng Gold | rewards | PM, LEAD, HR | tasks |
| Đài quan sát Gold | economy | PM, LEAD, HR | tasks |
| Tavern | treasury | PM, AM, ACCOUNTANT, HR, LEAD, STAFF |  |

## Ma trận vai trò

| Scenario | Expected | Actual | Status |
| --- | --- | --- | --- |
| DIRECTOR | personal, quests, command, guild, campaigns, embassy, rewards, economy, treasury | personal, quests, command, guild, campaigns, embassy, rewards, economy, treasury | verified |
| PM | personal, quests, command, guild, campaigns, rewards, economy, treasury | personal, quests, command, guild, campaigns, rewards, economy, treasury | verified |
| AM | personal, quests, command, guild, campaigns, embassy, treasury | personal, quests, command, guild, campaigns, embassy, treasury | verified |
| ACCOUNTANT | personal, quests, command, guild, campaigns, treasury | personal, quests, command, guild, campaigns, treasury | verified |
| HR | personal, quests, command, guild, campaigns, rewards, economy, treasury | personal, quests, command, guild, campaigns, rewards, economy, treasury | verified |
| LEAD | personal, quests, command, guild, campaigns, rewards, economy, treasury | personal, quests, command, guild, campaigns, rewards, economy, treasury | verified |
| STAFF | personal, quests, command, guild, campaigns, treasury | personal, quests, command, guild, campaigns, treasury | verified |
| FREELANCER |  |  | verified |

## Ma trận module

| Scenario | Modules | Expected | Actual | Status |
| --- | --- | --- | --- | --- |
| staff-none |  | personal, treasury | personal, treasury | verified |
| staff-tasks | tasks | personal, quests, command, guild, treasury | personal, quests, command, guild, treasury | verified |
| am-sales-tasks | sales, tasks | personal, quests, command, guild, embassy, treasury | personal, quests, command, guild, embassy, treasury | verified |
| pm-delivery | delivery | personal, campaigns, treasury | personal, campaigns, treasury | verified |
| lead-team-tasks | tasks | personal, quests, command, guild, rewards, economy, treasury | personal, quests, command, guild, rewards, economy, treasury | verified |

## Enforcement

- Snapshot ERP mang access manifest được sinh từ session, role, team và Setting.modules.
- Endpoint Guild, Rewards, Economy, Embassy và War Room kiểm tra cùng surface policy trước khi query nghiệp vụ.
- Claim Quest bị chặn khi module Tasks tắt; snapshot không trả Task trong trạng thái đó.
- Realm navigation, ledger tabs và portal cards hiện trạng thái khóa kèm lý do thay vì tạo no-op.

## Regression gate

Chạy `npm run audit:realm:access:check`. Gate thất bại nếu policy trùng/thiếu, ma trận role-module lệch hoặc evidence server/UI bị mất.

