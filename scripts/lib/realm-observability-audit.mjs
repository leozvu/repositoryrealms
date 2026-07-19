import fs from 'node:fs';
import path from 'node:path';
import { observeRealmApiRequest, safeRealmException, startRealmApiRequest } from '../../lib/realm-observability.js';

const ROUTES = [
  ['operations', 'app/api/realm-demo/operations/route.js'],
  ['rewards', 'app/api/realm-demo/rewards/route.js'],
  ['tavern', 'app/api/realm-demo/treasury/route.js'],
  ['guild', 'app/api/realm-demo/guild/route.js'],
  ['war-room', 'app/api/realm-demo/war-room/route.js'],
  ['economy', 'app/api/realm-demo/economy/route.js'],
  ['embassy', 'app/api/realm-demo/embassy/route.js'],
  ['token', 'app/api/realm-demo/token/route.js'],
  ['health', 'app/api/realm-demo/health/route.js'],
  ['changes', 'app/api/realm-demo/changes/route.js'],
  ['actions', 'app/api/realm-demo/actions/route.js'],
];

const CONTRACTS = [
  { id: 'request-id-validation', source: 'lib/realm-observability.js', signals: ['normalizeRealmRequestId', "request?.headers?.get?.('X-Request-Id')", 'realm_${idFactory()}'] },
  { id: 'latency-headers', source: 'lib/realm-observability.js', signals: ["'X-Realm-Duration-Ms'", "'Server-Timing'", "'X-Realm-Outcome'"] },
  { id: 'private-no-store', source: 'lib/realm-api-response.js', signals: ["'Cache-Control': 'private, no-cache, no-store, max-age=0'", "Vary: 'Cookie'"] },
  { id: 'error-support-id', source: 'lib/realm-api-response.js', signals: ['requestId: observed.event.requestId', 'realmErrorResponse'] },
  { id: 'safe-exception-log', source: 'lib/realm-observability.js', signals: ['safeRealmException', 'errorName:', 'Logging failure is non-fatal'] },
  { id: 'authenticated-health', source: 'app/api/realm-demo/health/route.js', signals: ['const user = await currentUser()', 'inspectRealmSchemaReadiness', "migration: 'ready'"] },
  { id: 'client-trace-capture', source: 'components/realm/RealmOffice.jsx', signals: ['function realmTraceFromResponse', "headers?.get('X-Realm-Request-Id')", "headers?.get('X-Realm-Duration-Ms')"] },
  { id: 'support-copy-ux', source: 'components/realm/RealmOffice.jsx', signals: ['copyRealmSupportId', 'Copy mã', 'Mã hỗ trợ'] },
];

const EVENT_FIELDS = ['schemaVersion', 'timestamp', 'requestId', 'route', 'operation', 'method', 'status', 'outcome', 'code', 'durationMs'];

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function markdownTable(rows, columns) {
  const clean = (value) => String(Array.isArray(value) ? value.join(', ') : value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
  return [
    `| ${columns.map(([label]) => label).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${columns.map(([, key]) => clean(row[key])).join(' | ')} |`),
  ].join('\n');
}

function buildScenarios() {
  const trusted = startRealmApiRequest({ method: 'GET', headers: { get: () => 'edge_request-12345678' } }, {
    route: 'realm.operations', operation: 'snapshot.read',
  }, { now: () => 100, idFactory: () => 'unused' });
  const generated = startRealmApiRequest({ method: 'POST', headers: { get: () => 'bad/request' } }, {
    route: 'realm.operations', operation: 'snapshot.write',
  }, { now: () => 100, idFactory: () => 'generated-12345678' });
  const observed = observeRealmApiRequest(trusted, { status: 200, code: 'realm_snapshot_ready' }, {
    now: () => 112.34,
    timestamp: () => '2026-07-18T12:00:00.000Z',
    logger: () => {},
  });
  const exceptionLines = [];
  safeRealmException(trusted, new Error('secret payload'), 'realm_test_error', (line) => exceptionLines.push(line));
  return [
    { id: 'trusted-id-preserved', expected: 'edge_request-12345678', actual: trusted.requestId },
    { id: 'invalid-id-replaced', expected: 'realm_generated-12345678', actual: generated.requestId },
    { id: 'latency-rounded', expected: 12.3, actual: observed.event.durationMs },
    { id: 'event-field-allowlist', expected: EVENT_FIELDS.join(','), actual: Object.keys(observed.event).join(',') },
    { id: 'exception-redacted', expected: false, actual: exceptionLines[0].includes('secret payload') },
  ].map((row) => ({ ...row, status: row.actual === row.expected ? 'verified' : 'failed' }));
}

export function buildRealmObservabilityAudit(root) {
  const routeCoverage = ROUTES.map(([id, source]) => {
    const file = path.join(root, source);
    const code = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const missingSignals = ['startRealmApiRequest', 'realmJsonResponse'].filter((signal) => !code.includes(signal));
    return { id, source, missingSignals, status: missingSignals.length ? 'failed' : 'verified' };
  });
  const contracts = CONTRACTS.map((contract) => {
    const file = path.join(root, contract.source);
    const code = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const missingSignals = contract.signals.filter((signal) => !code.includes(signal));
    return { ...contract, missingSignals, status: missingSignals.length ? 'failed' : 'verified' };
  });
  const scenarios = buildScenarios();
  return {
    schemaVersion: 1,
    summary: {
      routes: routeCoverage.length,
      verifiedRoutes: routeCoverage.filter((row) => row.status === 'verified').length,
      contracts: contracts.length,
      verifiedContracts: contracts.filter((row) => row.status === 'verified').length,
      scenarios: scenarios.length,
      verifiedScenarios: scenarios.filter((row) => row.status === 'verified').length,
    },
    routeCoverage,
    contracts,
    scenarios,
  };
}

function routeCoverageCsv(result) {
  const columns = ['id', 'source', 'missingSignals', 'status'];
  return `${columns.map(csvCell).join(',')}\n${result.routeCoverage.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\n')}\n`;
}

function report(result) {
  const s = result.summary;
  return `# Phase 7 — Realm API observability & incident traceability\n\n` +
    `Phase 7 gắn correlation ID và latency telemetry vào toàn bộ Realm API family, đồng thời đưa mã hỗ trợ vào sync UI mà không ghi thêm dữ liệu nghiệp vụ.\n\n` +
    `## Kết quả\n\n` +
    `- Observed Realm routes: **${s.verifiedRoutes}/${s.routes}**\n` +
    `- Observability/privacy contracts: **${s.verifiedContracts}/${s.contracts}**\n` +
    `- Deterministic scenarios: **${s.verifiedScenarios}/${s.scenarios}**\n` +
    `- Database migration: **0**\n\n` +
    `## Route coverage\n\n${markdownTable(result.routeCoverage, [['Route', 'id'], ['Source', 'source'], ['Status', 'status']])}\n\n` +
    `## Contract matrix\n\n${markdownTable(result.contracts, [['Contract', 'id'], ['Evidence', 'source'], ['Status', 'status']])}\n\n` +
    `## Cơ chế vận hành\n\n` +
    `- Mỗi response có \`X-Realm-Request-Id\`, \`X-Realm-Duration-Ms\`, \`X-Realm-Outcome\` và \`Server-Timing\`.\n` +
    `- Error JSON mang cùng request ID để nhân sự copy từ UI và gửi hỗ trợ.\n` +
    `- Structured log chỉ có allowlist metadata; không log body, query, user, token, message hoặc stack.\n` +
    `- Health endpoint yêu cầu session khi integration bật, kiểm tra ERP core, collaboration bridge và migration receipt mới nhất mà không trả dữ liệu nhân sự.\n` +
    `- Toàn bộ response private/no-store; observability failure không được làm hỏng business request.\n\n` +
    `## Regression gate\n\nChạy \`npm run audit:realm:observability:check\`. Gate thất bại nếu một Realm route mất trace wrapper, privacy allowlist lệch hoặc UI mất support-ID recovery.\n`;
}

export function renderRealmObservabilityArtifacts(result) {
  return {
    'observability-verification.json': `${JSON.stringify(result, null, 2)}\n`,
    'route-coverage.csv': routeCoverageCsv(result),
    'PHASE-7-REPORT.md': `${report(result)}\n`,
  };
}
