# LeozOps task command contract

Status: **source contract implemented on an isolated branch; not deployed or released**

This boundary supports one command only: create one unassigned Egoric task, then
optionally remove that exact task through a new rollback approval. It is not a
generic CEO command alias and cannot select another resource, action, project,
assignee, tenant, or URL.

## Endpoint

- Command: `POST /api/integrations/leozops/v1/commands/create-task`
- Receipt observation:
  `GET /api/integrations/leozops/v1/commands/create-task/receipts?correlationId=...`
- Contract: `repositoryrealms.leozops.task-command`, version `1`
- Command key: `egoric.task.create.v1`
- Deployment gate: `LEOZOPS_TASK_COMMAND_ENABLED=true`; any other value makes
  every command/receipt method return `404` before authentication or storage.

Every POST must repeat `operation`, `actorSubject`, `idempotencyKey`, and
`correlationId` in the matching `X-LeozOps-Operation`,
`X-LeozOps-Actor-Subject`, `Idempotency-Key`, and `X-Correlation-ID` headers.
The target entity remains audience-bound through `X-CEO-Entity-ID`.

## Six-step state machine

1. `preview` validates the exact payload and current RepositoryRealms business
   rules. It writes no task, approval, command receipt, audit, or change event.
2. `approve_execute` uses a separately scoped credential and persists only a
   short-lived fingerprint grant. The approver subject and credential must
   differ from the execution operator.
3. `execute` consumes that exact grant and atomically creates one unassigned
   task, one command receipt, one payload-free audit row, and one change-feed
   metadata row. Retries are idempotent.
4. `preview_rollback` proves the task still exactly matches its creation
   fingerprint and has no comments, time logs, task events, work evidence,
   quest/reward evidence, lineage, or dependency references. It performs zero
   mutations.
5. `approve_rollback` creates a new short-lived grant bound to the rollback
   preview and original command. The execute approval cannot be reused.
6. `rollback` consumes that grant and deletes only the unchanged task created by
   the original command. A changed or linked task fails closed for manual
   reconciliation. Rollback is idempotent and never automatic.

## Exact payload

```json
{
  "title": "Review stalled opportunities",
  "note": null,
  "dueDate": "2026-08-12",
  "priority": "high",
  "estHours": 2
}
```

All five keys are required. `note` and `dueDate` may be `null`. Email and phone
patterns are denied in title/note. `assigneeId`, `projectId`, arbitrary action,
resource, URL, and unknown fields are impossible in the contract.

## Least-privilege scopes

- `leozops.task.create.preview`
- `leozops.task.create.approve`
- `leozops.task.create.execute`
- `leozops.task.create.rollback.preview`
- `leozops.task.create.rollback.approve`
- `leozops.task.create.rollback.execute`
- `leozops.task.create.receipts.read`

Source approval credentials and command operator credentials must be different
API-key records. Raw credentials and task payloads are never copied to the
approval/receipt ledger or audit detail.

## Release boundary

This branch adds source capability only. It does not deploy the route, create or
rotate credentials, accept G5/G6, register a LeozOps production adapter, execute
a live task, or authorize J6. Those remain separate reviewed release acts.
