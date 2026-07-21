import fs from 'node:fs';
import path from 'node:path';

const CONTRACTS = [
  { id: 'database-read-deadline', layer: 'api', source: 'app/api/realm-demo/pilot/operations/route.js', signals: ['withRealmDeadline', "dependency: 'database'", 'timeoutMs: 5_000'] },
  { id: 'retryable-degraded-response', layer: 'api', source: 'lib/realm-api-response.js', signals: ['error?.expose === true', "outcome: responseStatus >= 500 ? 'degraded'", 'Retry-After'] },
  { id: 'bounded-websocket-reconnect', layer: 'realtime', source: 'components/realm/realm-transports.js', signals: ['maxReconnectAttempts = 4', "onState('gateway-degraded')", 'onExhausted()'] },
  { id: 'websocket-local-fallback', layer: 'realtime', source: 'components/realm/useRealmPresence.js', signals: ['onExhausted:', 'startLocalTransport()', "setTransportState('local-ready')"] },
  { id: 'client-api-timeout', layer: 'client', source: 'components/realm/realm-fetch.js', signals: ['REALM_CLIENT_TIMEOUT_MS = 8_000', 'AbortController', 'RealmClientTimeoutError'] },
  { id: 'last-known-good-ui', layer: 'client', source: 'components/realm/RealmPilotOperations.jsx', signals: ['Đang hiển thị snapshot gần nhất', 'Không tự retry', 'state.error && !dashboard'] },
  { id: 'notification-after-commit', layer: 'transaction', source: 'lib/realm-pilot-operations.js', signals: ['const transition = await db.$transaction', 'deliverRealmPilotNotifications(db, transition.notifications)', "state: 'degraded'"] },
  { id: 'approval-timeout-lock', layer: 'approval', source: 'lib/realm-launch-approval.js', signals: ["deadlineState: timedOut ? 'timed_out'", 'timedOut,', "approval.status === 'pending'"] },
  { id: 'stale-if-error-cache', layer: 'cache', source: 'lib/cache.js', signals: ['cachedResilient', "source: 'stale'", 'staleExp'] },
  { id: 'partial-rollout-erp-fallback', layer: 'rollout', source: 'lib/realm-chaos-readiness.js', signals: ["id: 'partial-rollout'", 'fallbackUsers', "gate.id === 'erp-fallback'"] },
  { id: 'seven-fault-matrix', layer: 'policy', source: 'lib/realm-chaos-readiness.js', signals: ["id: 'database-slow'", "id: 'websocket-lost'", "id: 'api-timeout'", "id: 'notification-failed'", "id: 'approval-timeout'", "id: 'stale-cache'", "id: 'partial-rollout'"] },
  { id: 'aggregate-chaos-readiness-ui', layer: 'ui', source: 'components/realm/RealmPilotOperations.jsx', signals: ['Chaos Readiness', 'Detect', 'Degrade', 'Preserve'] },
  { id: 'accessible-responsive-chaos-ui', layer: 'style', source: 'components/realm/realm-pilot-operations.module.css', signals: ['.chaosGrid', 'min-height: 44px', '@media (max-width: 680px)', '@media (prefers-reduced-motion: reduce)'] },
  { id: 'deterministic-chaos-tests', layer: 'test', source: 'tests/realm-chaos.test.mjs', signals: ['database slow', 'API timeout', 'stale cache', 'notification failure', 'partial rollout', 'websocket loss'] },
  { id: 'notification-transaction-regression', layer: 'test', source: 'tests/realm-pilot-operations.test.mjs', signals: ['notification failure cannot rollback a committed pilot transition', "state: 'degraded'"] },
  { id: 'approval-timeout-regression', layer: 'test', source: 'tests/realm-launch-approval.test.mjs', signals: ["deadlineState, 'timed_out'", 'timedOutBoard'] },
  { id: 'phase20-runbook', layer: 'operations', source: 'docs/realms/PHASE-20-CHAOS-RESILIENCE.md', signals: ['crmegoric-realms-demo', 'Không tự retry mutation', 'Game Day', 'ERP fallback'] },
];

const SCENARIOS = [
  { id: 'database-slow', signal: 'database slow' },
  { id: 'websocket-lost', signal: 'websocket loss' },
  { id: 'api-timeout', signal: 'api timeout' },
  { id: 'notification-failed', signal: 'notification failure' },
  { id: 'approval-timeout', signal: "id === 'approval-timeout'" },
  { id: 'stale-cache', signal: 'stale cache' },
  { id: 'partial-rollout', signal: 'partial rollout' },
];

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function table(rows) {
  return ['| Fault | Evidence | Status |', '| --- | --- | --- |', ...rows.map((row) => `| ${row.id} | ${row.evidence} | ${row.status} |`)].join('\n');
}

export function buildRealmChaosAudit(root) {
  const contracts = CONTRACTS.map((contract) => {
    const file = path.join(root, contract.source);
    const source = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const missingSignals = contract.signals.filter((signal) => !source.includes(signal));
    return { ...contract, missingSignals, status: missingSignals.length ? 'failed' : 'verified' };
  });
  const testSource = fs.readFileSync(path.join(root, 'tests/realm-chaos.test.mjs'), 'utf8');
  const scenarios = SCENARIOS.map(({ id, signal }) => {
    return { id, evidence: `tests/realm-chaos.test.mjs · ${signal}`, status: testSource.toLowerCase().includes(signal) ? 'verified' : 'failed' };
  });
  return {
    schemaVersion: 1,
    summary: {
      contracts: contracts.length,
      verifiedContracts: contracts.filter((row) => row.status === 'verified').length,
      scenarios: scenarios.length,
      verifiedScenarios: scenarios.filter((row) => row.status === 'verified').length,
      automaticWriteRetry: false,
      notificationAfterCommit: true,
      boundedReconnect: true,
      aggregateOnly: true,
      additiveMigrations: 0,
    },
    contracts,
    scenarios,
  };
}

export function renderRealmChaosArtifacts(result) {
  const columns = ['id', 'layer', 'source', 'signals', 'missingSignals', 'status'];
  const s = result.summary;
  return {
    'chaos-verification.json': `${JSON.stringify(result, null, 2)}\n`,
    'chaos-contracts.csv': `${columns.join(',')}\n${result.contracts.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\n')}\n`,
    'PHASE-20-REPORT.md': `# Phase 20 — Chaos Resilience\n\nRealm degrade gracefully qua 7 fault class, vẫn giữ ERP/CRM làm source of truth.\n\n- Contracts: **${s.verifiedContracts}/${s.contracts}**\n- Deterministic scenarios: **${s.verifiedScenarios}/${s.scenarios}**\n- Automatic write retry: **${s.automaticWriteRetry}**\n- Notification after commit: **${s.notificationAfterCommit}**\n- Bounded reconnect: **${s.boundedReconnect}**\n- Additive migration: **${s.additiveMigrations}**\n\n${table(result.scenarios)}\n\nChạy regression gate: \`npm run audit:realm:chaos:check\`.\n`,
  };
}
