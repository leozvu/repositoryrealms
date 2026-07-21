# Phase 20 — Chaos Resilience

Realm degrade gracefully qua 7 fault class, vẫn giữ ERP/CRM làm source of truth.

- Contracts: **17/17**
- Deterministic scenarios: **7/7**
- Automatic write retry: **false**
- Notification after commit: **true**
- Bounded reconnect: **true**
- Additive migration: **0**

| Fault | Evidence | Status |
| --- | --- | --- |
| database-slow | tests/realm-chaos.test.mjs · database slow | verified |
| websocket-lost | tests/realm-chaos.test.mjs · websocket loss | verified |
| api-timeout | tests/realm-chaos.test.mjs · api timeout | verified |
| notification-failed | tests/realm-chaos.test.mjs · notification failure | verified |
| approval-timeout | tests/realm-chaos.test.mjs · id === 'approval-timeout' | verified |
| stale-cache | tests/realm-chaos.test.mjs · stale cache | verified |
| partial-rollout | tests/realm-chaos.test.mjs · partial rollout | verified |

Chạy regression gate: `npm run audit:realm:chaos:check`.
