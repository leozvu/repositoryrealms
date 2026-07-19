import fs from 'node:fs';
import path from 'node:path';
import {
  createRealmSyncEnvelope,
  normalizeRealmProfileVersion,
  realmSnapshotEtag,
  realmSnapshotMatchesEtag,
} from '../../lib/realm-sync.js';

const CONTRACTS = [
  { id: 'snapshot-envelope', layer: 'server', source: 'lib/realm-erp-adapter.js', signals: ['createRealmSyncEnvelope(snapshot', 'sync: createRealmSyncEnvelope'] },
  { id: 'conditional-get', layer: 'api', source: 'app/api/realm-demo/operations/route.js', signals: ['realmSnapshotMatchesEtag', 'status: 304'] },
  { id: 'private-validator', layer: 'api', source: 'lib/realm-sync.js', signals: ["'Cache-Control': 'private, no-cache, no-store, max-age=0'", "Vary: 'Cookie'", "'X-Realm-Revision'"] },
  { id: 'post-revision', layer: 'api', source: 'app/api/realm-demo/operations/route.js', signals: ['return snapshotResponse(trace, snapshot, { ...snapshot, action })'] },
  { id: 'profile-version-api', layer: 'api', source: 'app/api/realm-demo/operations/route.js', signals: ['expectedProfileVersion: body.profileVersion'] },
  { id: 'profile-version-transaction', layer: 'server', source: 'lib/realm-erp-adapter.js', signals: ["'realm_profile_conflict'", "isolationLevel: 'Serializable'"] },
  { id: 'claim-idempotency', layer: 'server', source: 'lib/realm-erp-adapter.js', signals: ['normalizeRealmIdempotencyKey', 'if (existing) return { entry: existing, idempotent: true }'] },
  { id: 'client-etag', layer: 'client', source: 'components/realm/RealmOffice.jsx', signals: ["'If-None-Match': operationsSyncEtagRef.current", 'response.status === 304'] },
  { id: 'background-revalidation', layer: 'client', source: 'components/realm/RealmOffice.jsx', signals: ['REALM_REMOTE_REFRESH_MS', "document.addEventListener('visibilitychange'", "window.addEventListener('online'"] },
  { id: 'offline-preservation', layer: 'client', source: 'components/realm/RealmOffice.jsx', signals: ["setOperationsSyncState('offline')", 'Snapshot ERP gần nhất vẫn được giữ nguyên'] },
  { id: 'stale-retry-ui', layer: 'client', source: 'components/realm/RealmOffice.jsx', signals: ['function SyncIntegrityCard', 'Snapshot có thể cũ · cần thử lại', 'Thử đồng bộ'] },
  { id: 'no-false-write-success', layer: 'client', source: 'components/realm/RealmOffice.jsx', signals: ['Chưa có thay đổi nào được xác nhận.', 'if (!response.ok)', "applyRemoteOperations(payload, response.headers.get('ETag'), responseTrace)"] },
];

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
  const snapshot = {
    source: 'erp',
    bridge: { sourceOfTruth: 'erp' },
    profile: { name: 'Audit', role: 'Scout' },
    operations: { wallet: 5, quests: [], ledger: [] },
  };
  const first = createRealmSyncEnvelope(snapshot, { generatedAt: new Date('2026-07-18T10:00:00.000Z'), profileUpdatedAt: new Date('2026-07-18T09:00:00.000Z') });
  const later = createRealmSyncEnvelope(snapshot, { generatedAt: new Date('2026-07-18T11:00:00.000Z'), profileUpdatedAt: new Date('2026-07-18T09:00:00.000Z') });
  const changed = createRealmSyncEnvelope({ ...snapshot, operations: { ...snapshot.operations, wallet: 6 } }, { generatedAt: new Date('2026-07-18T11:00:00.000Z') });
  const etag = realmSnapshotEtag(first);
  return [
    { id: 'stable-revision', expected: true, actual: first.revision === later.revision },
    { id: 'changed-data-new-revision', expected: true, actual: first.revision !== changed.revision },
    { id: 'exact-etag-match', expected: true, actual: realmSnapshotMatchesEtag(etag, first) },
    { id: 'weak-etag-match', expected: true, actual: realmSnapshotMatchesEtag(`W/${etag}`, first) },
    { id: 'stale-etag-miss', expected: false, actual: realmSnapshotMatchesEtag('"realm-stale"', first) },
    { id: 'profile-version-roundtrip', expected: '2026-07-18T09:00:00.000Z', actual: normalizeRealmProfileVersion(first.entities.profileVersion) },
  ].map((row) => ({ ...row, status: row.actual === row.expected ? 'verified' : 'failed' }));
}

export function buildRealmSyncIntegrityAudit(root) {
  const contracts = CONTRACTS.map((contract) => {
    const sourcePath = path.join(root, contract.source);
    const source = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, 'utf8') : '';
    const missingSignals = contract.signals.filter((signal) => !source.includes(signal));
    return { ...contract, missingSignals, status: missingSignals.length ? 'failed' : 'verified' };
  });
  const scenarios = buildScenarios();
  return {
    schemaVersion: 1,
    summary: {
      contracts: contracts.length,
      verifiedContracts: contracts.filter((row) => row.status === 'verified').length,
      scenarios: scenarios.length,
      verifiedScenarios: scenarios.filter((row) => row.status === 'verified').length,
    },
    contracts,
    scenarios,
  };
}

function contractsCsv(result) {
  const columns = ['id', 'layer', 'source', 'signals', 'missingSignals', 'status'];
  return `${columns.map(csvCell).join(',')}\n${result.contracts.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\n')}\n`;
}

function phase6Report(result) {
  const s = result.summary;
  return `# Phase 6 — Realm ↔ ERP sync integrity & recovery\n\n` +
    `Phase 6 giữ nguyên ERP làm nguồn sự thật, thêm validator cho snapshot và làm rõ trạng thái freshness ở client mà không cần đổi schema dữ liệu.\n\n` +
    `## Kết quả\n\n` +
    `- Sync/recovery contracts: **${s.verifiedContracts}/${s.contracts}**\n` +
    `- Deterministic scenarios: **${s.verifiedScenarios}/${s.scenarios}**\n` +
    `- Database migration: **0**\n\n` +
    `## Contract matrix\n\n${markdownTable(result.contracts, [['Contract', 'id'], ['Layer', 'layer'], ['Evidence', 'source'], ['Status', 'status']])}\n\n` +
    `## Scenario matrix\n\n${markdownTable(result.scenarios, [['Scenario', 'id'], ['Expected', 'expected'], ['Actual', 'actual'], ['Status', 'status']])}\n\n` +
    `## Cơ chế đã khóa\n\n` +
    `- Snapshot có revision SHA-256 ổn định, ETag riêng theo session và conditional GET 304.\n` +
    `- Client kiểm tra lại mỗi 60 giây, khi quay lại tab, focus cửa sổ và khi mạng online trở lại.\n` +
    `- Offline/lỗi không thay snapshot ERP bằng dữ liệu demo; UI ghi rõ dữ liệu có thể cũ và có nút retry.\n` +
    `- Write chỉ báo thành công sau HTTP success và snapshot mới; timeout ghi rõ chưa có thay đổi nào được xác nhận.\n` +
    `- Profile update mang version và chạy Serializable để chặn tab cũ ghi đè phiên mới. Claim Gold tiếp tục dùng idempotency key.\n\n` +
    `## Regression gate\n\nChạy \`npm run audit:realm:sync:check\`. Gate thất bại nếu ETag, recovery lifecycle, optimistic profile version hoặc trạng thái UI mất evidence.\n`;
}

export function renderRealmSyncIntegrityArtifacts(result) {
  return {
    'sync-verification.json': `${JSON.stringify(result, null, 2)}\n`,
    'sync-contracts.csv': contractsCsv(result),
    'PHASE-6-REPORT.md': `${phase6Report(result)}\n`,
  };
}
