# Phase 4 — CRM Workload Intelligence

- Contracts: **17/17**
- Deterministic scenarios: **6/6**
- Canonical Lead stores: **1**
- Canonical Activity stores: **1**
- Confidence ceiling: **medium**
- Employee ranking enabled: **false**
- Automatic Lead mutation enabled: **false**
- Schema migration required: **false**

ERP CRM and Royal Embassy share one workload-intelligence rule engine over canonical CRM records.

Regression gate: `npm run audit:crm:check`.
