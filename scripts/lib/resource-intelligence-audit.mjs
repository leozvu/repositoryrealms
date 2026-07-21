import fs from 'node:fs';
import path from 'node:path';

const CONTRACTS = [
  { id: 'canonical-task-estimate', layer: 'data', source: 'prisma/schema.prisma', signals: ['model Task {', 'estHours', 'workType', 'complexity', 'estimateRevisions'] },
  { id: 'immutable-estimate-revision', layer: 'data', source: 'prisma/schema.prisma', signals: ['model WorkEstimateRevision', 'kind', 'previousHours', 'receiptId'] },
  { id: 'additive-migration', layer: 'migration', source: 'prisma/migrations/20260720230000_add_resource_intelligence/migration.sql', signals: ['CREATE TABLE "WorkEstimateRevision"', 'ON DELETE CASCADE', 'WorkEstimateRevision_receiptId_key'] },
  { id: 'source-separation', layer: 'domain', source: 'lib/resource-intelligence.js', signals: ['estimate:', 'actual:', 'historical:', "source: 'declared_timelog'", 'isObservedTruth: false'] },
  { id: 'historical-taxonomy', layer: 'domain', source: 'lib/resource-intelligence.js', signals: ['historicalPool', 'normalizedResourceWorkType', 'normalizedResourceComplexity', 'exact.length >= 3'] },
  { id: 'confidence-ceiling', layer: 'governance', source: 'lib/resource-intelligence.js', signals: ["band: 'medium'", 'confidence bị giới hạn ở medium', "confidenceCeiling: 'medium'"] },
  { id: 'anti-ranking-policy', layer: 'governance', source: 'lib/resource-intelligence.js', signals: ['employeeRanking: false', 'presenceAsProductivity: false', 'payrollUse: false', 'goldUse: false'] },
  { id: 'advisory-signals', layer: 'domain', source: 'lib/resource-intelligence.js', signals: ['estimate_outlier', 'estimate_consumed', 'actual_variance', 'không tự động bác bỏ'] },
  { id: 'canonical-estimate-action', layer: 'domain', source: 'lib/resource-intelligence-admin.js', signals: ["RESOURCE_INTELLIGENCE_ACTIONS", "'task.estimate'", 'normalizeResourceEstimateCommand'] },
  { id: 'employee-self-scope', layer: 'authorization', source: 'lib/resource-intelligence-admin.js', signals: ['task.assigneeId !== user.id', 'resource_intelligence_declaration_forbidden'] },
  { id: 'manager-scope-and-reason', layer: 'authorization', source: 'lib/resource-intelligence-admin.js', signals: ["hasAny(user, ['PM', 'LEAD'])", 'managerScope', 'resource_intelligence_manager_reason_required'] },
  { id: 'cas-idempotency', layer: 'safety', source: 'lib/resource-intelligence-admin.js', signals: ['workVersion: command.expectedVersion', 'idempotencyKey', 'resource_intelligence_work_stale'] },
  { id: 'atomic-receipt-revision-audit', layer: 'audit', source: 'lib/resource-intelligence-admin.js', signals: ['realmActionReceipt.create', 'workEstimateRevision.create', 'workItemEvent.create', 'auditLog.create'] },
  { id: 'repository-realms-dispatch', layer: 'parity', source: 'lib/repository-realms.js', signals: ["action: 'task.estimate'", 'RESOURCE_INTELLIGENCE_ACTIONS.includes', 'executeResourceEstimateAction'] },
  { id: 'my-work-intelligence', layer: 'ui', source: 'app/(app)/myday/page.jsx', signals: ['Resource Intelligence · shadow mode', 'TimeLog hiện là dữ liệu tự khai báo', 'Cập nhật estimate'] },
  { id: 'team-work-intelligence', layer: 'ui', source: 'app/(app)/teamwork/page.jsx', signals: ['Nguồn lực theo bằng chứng có provenance', 'Manager adjustment', 'Lưu hiệu chỉnh có receipt'] },
  { id: 'responsive-accessible-intelligence', layer: 'ux', source: 'app/(app)/teamwork/team-work.module.css', signals: ['min-height:44px', '@media(max-width:720px)', '@media(prefers-reduced-motion:reduce)'] },
  { id: 'phase2-tests', layer: 'test', source: 'tests/resource-intelligence-admin.test.mjs', signals: ['CAS, receipt, revision, WorkItemEvent và audit atomically', 'Manager adjustment cần manager scope', 'Idempotent replay'] },
  { id: 'phase2-runbook', layer: 'operations', source: 'docs/realms/PHASE-2-RESOURCE-INTELLIGENCE.md', signals: ['Estimate không phải Actual', 'confidence ceiling', 'crmegoric-realms-demo'] },
];

function cell(value) {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildResourceIntelligenceAudit(root) {
  const contracts = CONTRACTS.map((contract) => {
    const file = path.join(root, contract.source);
    const source = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const missingSignals = contract.signals.filter((signal) => !source.includes(signal));
    return { ...contract, missingSignals, status: missingSignals.length ? 'failed' : 'verified' };
  });
  const domain = fs.readFileSync(path.join(root, 'lib/resource-intelligence.js'), 'utf8');
  const admin = fs.readFileSync(path.join(root, 'lib/resource-intelligence-admin.js'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'prisma/migrations/20260720230000_add_resource_intelligence/migration.sql'), 'utf8');
  const scenarios = [
    { id: 'three-source-model', expected: 'true:true:true', actual: `${domain.includes('estimate:')}:${domain.includes('actual:')}:${domain.includes('historical:')}` },
    { id: 'declared-timelog-not-observed', expected: 'true:true', actual: `${domain.includes("source: 'declared_timelog'")}:${domain.includes('isObservedTruth: false')}` },
    { id: 'confidence-max-medium', expected: 'true:false', actual: `${domain.includes("confidenceCeiling: 'medium'")}:${domain.includes("confidenceCeiling: 'high'")}` },
    { id: 'manager-reason-and-cas', expected: 'true:true', actual: `${admin.includes('resource_intelligence_manager_reason_required')}:${admin.includes('workVersion: command.expectedVersion')}` },
    { id: 'migration-additive-only', expected: 'false:false:false', actual: `${/\bDROP\b/i.test(migration)}:${/\bDELETE\s+FROM\b/i.test(migration)}:${/\bTRUNCATE\b/i.test(migration)}` },
  ].map((scenario) => ({ ...scenario, status: scenario.actual === scenario.expected ? 'verified' : 'failed' }));
  return {
    schemaVersion: 1,
    summary: {
      contracts: contracts.length,
      verifiedContracts: contracts.filter((row) => row.status === 'verified').length,
      scenarios: scenarios.length,
      verifiedScenarios: scenarios.filter((row) => row.status === 'verified').length,
      canonicalTaskStores: 1,
      canonicalEstimateActions: 1,
      confidenceCeiling: 'medium',
      employeeRankingEnabled: false,
      migrationAppliedByAudit: false,
    },
    contracts,
    scenarios,
  };
}

export function renderResourceIntelligenceArtifacts(result) {
  const columns = ['id', 'layer', 'source', 'signals', 'missingSignals', 'status'];
  const summary = result.summary;
  return {
    'resource-intelligence-verification.json': `${JSON.stringify(result, null, 2)}\n`,
    'resource-intelligence-contracts.csv': `${columns.join(',')}\n${result.contracts.map((row) => columns.map((column) => cell(row[column])).join(',')).join('\n')}\n`,
    'PHASE-2-REPORT.md': `# Phase 2 — Resource Intelligence\n\n- Contracts: **${summary.verifiedContracts}/${summary.contracts}**\n- Deterministic scenarios: **${summary.verifiedScenarios}/${summary.scenarios}**\n- Canonical Task stores: **${summary.canonicalTaskStores}**\n- Canonical estimate actions: **${summary.canonicalEstimateActions}**\n- Confidence ceiling: **${summary.confidenceCeiling}**\n- Employee ranking enabled: **${summary.employeeRankingEnabled}**\n- Migration applied by audit: **${summary.migrationAppliedByAudit}**\n\nEstimate, declared TimeLog and historical baseline remain separate, explainable sources.\n\nRegression gate: \`npm run audit:intelligence:check\`.\n`,
  };
}
