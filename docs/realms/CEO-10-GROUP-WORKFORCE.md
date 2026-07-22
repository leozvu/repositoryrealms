# CEO-10 — Group Workforce Exchange

Status: code complete on `codex/realms-demo`; production enablement remains behind the CEO-9 release gate.

Owner: Vũ Lương Sơn

## Product boundary

`Nhân sự của công ty khác trong group` is a private CEO control-plane workflow. It is not part of the single-company ERP package and is hidden unless the Master Board build sets:

```text
NEXT_PUBLIC_CEO_GROUP_WORKFORCE=1
```

The four company deployments retain their normal ERP/CRM navigation. They expose only the scoped RepositoryRealms command adapter required to receive a request and create a local approval.

## Workflow

1. The Master Board synchronizes only directory profiles that an employee explicitly shared with the CEO Portal.
2. The CEO selects the company requesting help, the employing company, the consenting employee, bounded dates, and weekly capacity.
3. The Portal dispatches `group_workforce.request` to the employing company.
4. The employing company re-checks the employee's active status and directory consent.
5. The employing company creates its own pending `Approval`, local notifications, `CeoEntityCommandReceipt`, and `AuditLog` atomically.
6. The Portal stores delivery metadata and the receipt reference only. The CEO opens the approval through signed SSO.
7. Once approved, work can be assigned through the existing `task.create` command to the employing entity. Payroll, employment, timekeeping, and private HR data remain there.

## Invariants

- Requesting company and employing company must differ.
- Employee must be active and have non-revoked directory consent.
- Start/end dates and weekly capacity are bounded.
- No salary, payroll, performance evidence, phone number, or HR file is copied to the Portal or requesting company.
- The Portal never writes an entity database directly.
- Retry uses the same idempotency key; uncertain delivery is reconciled rather than resent.
- The same authorization, business rules, receipts, and audit contract applies regardless of ERP or Realm presentation.

## Release configuration

- Master Board: set `NEXT_PUBLIC_CEO_GROUP_WORKFORCE=1`.
- Entity projects: leave it unset so the private navigation and page are absent.
- All entities and the Master Board must run the same command-contract version before the feature is enabled.
