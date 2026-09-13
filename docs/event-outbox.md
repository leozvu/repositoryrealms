# Durable event delivery

`EventOutbox` is a PostgreSQL outbox, processed by bounded batches in an explicit one-shot command or opt-in foreground watch process. It does not install a daemon, schedule jobs, or call a remote queue service. A converted command must write its business mutation, audit record and `enqueueEvent(tx, ...)` in one transaction. Any enqueue failure rolls back that mutation. The row reaching `pending` means the work is durably queued, not completed.

## Producer contract

```js
await db.$transaction(async tx => {
  const row = await tx.task.update({ where: { id }, data });
  await tx.auditLog.create({ data: audit });
  await enqueueEvent(tx, { resource: 'tasks', event: 'update', row, old, user });
});
```

The helper generates a new occurrence UUID unless the command supplies a stable `occurrenceId`. An occurrence identifies one mutation, not an entity. Reusing an occurrence with the same canonical payload returns its existing job; changing that payload throws `OUTBOX_OCCURRENCE_CONFLICT`. This does not replace request/command idempotency: two separate successful mutations still produce two occurrences. Payload version is `1`; SHA-256 detects a changed serialized payload. Known credential fields are removed from row/old snapshots, and the actor snapshot contains only id/name. Payloads still contain business data; use the database's existing access and backup controls. The hash is an integrity check, not an authentication signature.

Converted producers are generic record mutations in both API surfaces, financial payment commands, invoice/vendor approval decisions and Lead-to-Client conversion. Other callers of `emitEvent` retain the legacy best-effort, after-write behavior. Do not call both `emitEvent` and `enqueueEvent` for the same occurrence. The non-financial approval path and specialized Realm/CEO routes require separate conversion work before receiving this guarantee.

## Processing and retries

The worker claims a job with a compare-and-swap lease (60 seconds), counting each claim as an attempt. An abandoned lease becomes eligible again. A stale worker's local transaction cannot commit after a newer lease has been acquired. A local event runs at Serializable isolation with a 30-second transaction timeout: system automation, Gold entries, notifications, task history, rule actions, webhook fanout and the delivered receipt commit together or roll back together. No HTTP executes within this transaction. Generated tasks retain the existing behavior of not recursively emitting new events.

Rules and webhook subscriptions are resolved when the local-effects transaction first succeeds. Each matching hook or rule webhook action gets a separate job, so one endpoint failing does not replay already-committed local automation or other endpoints. An invalid local rule can hold the entire event pending/dead; fix that rule before retry. Event ordering across workers is not guaranteed. Delayed task status-age updates are guarded against a more recent task update; business dates use occurrence time while Realm feed cursors use publication time.

Webhook bodies and destination URLs are captured at fanout. Configured webhook secrets stay on the original webhook record and are read at delivery time; disabled/deleted hooks and changed destinations dead-letter instead of silently redirecting pending delivery. Rule-action URLs are immutable for that queued delivery. HTTP has a 5-second timeout and does not follow redirects. Network/timeout failures, HTTP 408/425/429 and 5xx retry; other 4xx dead-letter immediately. Retry delay starts at 5 seconds, doubles and caps at one hour. Eight failed/abandoned attempts exhaust a job's budget. Logs and `lastErrorCode` contain classifications only, never arbitrary error messages, URLs or response bodies.

HTTP delivery is **at-least-once**, not exactly-once: an endpoint may accept a request before the worker loses its connection or fails to save the acknowledgement. Every retry sends the same body, `X-Event-Id` (source occurrence), `X-Delivery-Id` (destination job), and `X-Payload-Version`. When a secret exists, `X-Signature` is the existing SHA-256 HMAC of that exact body. Receivers must atomically persist/deduplicate `X-Delivery-Id` with their own effects and acknowledge previously handled IDs. Different deliveries from one event have different delivery IDs.

## Operator commands

Apply the additive migration and regenerate Prisma against the intended environment before enabling converted producers. Supply that environment's database configuration through the existing runtime mechanism; no command below loads a `.env` file itself.

```text
node scripts/event-outbox-worker.mjs status
node scripts/event-outbox-worker.mjs run --limit 100
node scripts/event-outbox-worker.mjs watch --poll-ms 1000 --limit 100
node scripts/event-outbox-worker.mjs retry --id <dead-job-id>
```

`status` shows counts and up to 20 recent dead jobs without payloads. `run` processes at most 1–1000 jobs and exits. `watch` processes sequential bounded batches and waits 100–60000 ms between batches (default 1000), remaining quiet when idle. Database errors produce safe classification logs and the next polling attempt. SIGINT/SIGTERM, parent IPC shutdown or parent disconnect stops new claims and drains the current job before disconnecting Prisma. Independent workers remain safe through the database leases. No worker was deployed or scheduled as part of this change. Without a worker process, converted producers accumulate pending work.

For an integrated local workspace, set `EVENT_OUTBOX_WORKER_ENABLED=1` in the intended environment and run `node scripts/dev-workspace.mjs -p 3300`. The wrapper loads configuration with the installed Next environment loader (explicit process variables take precedence), then starts Next and the foreground worker using that same environment. `EVENT_OUTBOX_BATCH_SIZE` and `EVENT_OUTBOX_POLL_MS` optionally configure the worker. With the flag absent/off it starts only Next. Existing `npm run dev` is unchanged. The wrapper forwards shutdown, stops Next if the worker exits unexpectedly, and on Windows targets only its owned Next process tree; the worker receives an IPC drain request with a 35-second forced-stop fallback. There is no OS, cron or Codex automation registration.

`retry` resets a dead job's attempt budget after its cause is fixed. It never reopens delivered events; a delivered local event's generated notifications cannot be replayed through this command. Retain delivered receipts for as long as the same occurrence IDs might be retried; no purge policy is enabled here.

## Verification

`tests/event-outbox.test.mjs` checks the actual event handlers with an injected database that rejects global Prisma access, including recurring tasks, Gold, notifications, credential filtering, Decimal/date values, leases, failure rollback, hash/version checks, HMAC and HTTP retry classification. `tests/event-outbox-watch.test.mjs` checks polling, shutdown draining and the wrapper's opt-in child-process lifecycle. `tests/event-outbox-postgres.test.mjs` validates rollback and concurrent claims against real PostgreSQL, including an HTTP-success/acknowledgement-loss simulation with a stubbed transport. It only runs when `OUTBOX_TEST_DATABASE_URL` or `PAYMENT_TEST_DATABASE_URL` explicitly names a loopback `codex_payment_test*` database, and cleans only its generated IDs. These tests do not qualify a live webhook endpoint or prove operational worker uptime.
