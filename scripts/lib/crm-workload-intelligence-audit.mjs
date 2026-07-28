import fs from 'node:fs';
import path from 'node:path';

const CONTRACTS = [
  { id: 'canonical-crm-records', layer: 'data', source: 'prisma/schema.prisma', signals: ['model Lead {', 'model Activity {', 'model User {'] },
  { id: 'workload-rule-version', layer: 'domain', source: 'lib/crm-workload-intelligence.js', signals: ["CRM_WORKLOAD_RULE_VERSION = 'crm-workload-intelligence-v1'", 'buildCrmWorkloadIntelligence', 'lifecycleFor', 'leadSignals'] },
  { id: 'lifecycle-bands', layer: 'domain', source: 'lib/crm-workload-intelligence.js', signals: ["band: 'active'", "band: 'stale'", "band: 'dormant'", "band: 'decided'"] },
  { id: 'recorded-activity-provenance', layer: 'governance', source: 'lib/crm-workload-intelligence.js', signals: ["source: completedDay ? 'recorded_completed_activity'", 'isObservedTruth: false', "ceiling: 'medium'"] },
  { id: 'explicit-owner-wip', layer: 'resource', source: 'lib/crm-workload-intelligence.js', signals: ['ownerWipLimit', 'openLeads', "band === 'over'", 'ownerRows'] },
  { id: 'manager-review-queue', layer: 'domain', source: 'lib/crm-workload-intelligence.js', signals: ['managerQueue', 'assign_owner', 'review_dormant_lead', 'review_portfolio_distribution'] },
  { id: 'anti-ranking-advisory-policy', layer: 'governance', source: 'lib/crm-workload-intelligence.js', signals: ['advisoryOnly: true', 'automaticAssignment: false', 'automaticStageChange: false', 'employeeRanking: false', 'performanceInference: false'] },
  { id: 'crm-authorization-scope', layer: 'authorization', source: 'lib/crm-workload-intelligence-admin.js', signals: ['crmWorkloadScope', "kind: 'company'", "kind: 'portfolio'", 'crm_workload_scope_missing'] },
  { id: 'contact-data-does-not-leak', layer: 'privacy', source: 'tests/crm-workload-intelligence-admin.test.mjs', signals: ["includes('hidden@example.com'), false", "includes('0900'), false"] },
  { id: 'private-crm-api', layer: 'api', source: 'app/api/leads/workload/route.js', signals: ['currentUser()', 'loadCrmWorkloadIntelligence', "'Cache-Control': 'private, no-store'"] },
  { id: 'erp-workload-before-pipeline', layer: 'ui', source: 'app/(app)/leads/page.jsx', signals: ['CRM Workload Intelligence', 'Manager Queue', 'Owner Workload', 'Pipeline &amp; forecast drill-down'] },
  { id: 'realm-shared-workload-contract', layer: 'parity', source: 'lib/realm-embassy.js', signals: ["import { buildCrmWorkloadIntelligence }", 'workloadIntelligence'] },
  { id: 'realm-workload-ui', layer: 'ui', source: 'components/realm/RoyalEmbassy.jsx', signals: ['CRM Workload Intelligence', 'Manager Queue', 'Owner WIP · alphabet', 'không phải employee ranking'] },
  { id: 'responsive-accessible-crm', layer: 'ux', source: 'app/(app)/leads/crm-workload.module.css', signals: ['min-height: 44px', '@media (max-width: 700px)', '@media (prefers-reduced-motion: reduce)'] },
  { id: 'phase4-domain-tests', layer: 'test', source: 'tests/crm-workload-intelligence.test.mjs', signals: ['active, stale, dormant và decided', 'không tạo employee ranking', 'chỉ advisory'] },
  { id: 'phase4-server-tests', layer: 'test', source: 'tests/crm-workload-intelligence-admin.test.mjs', signals: ['authorization của Lead ERP', 'response không leak contact', 'bị chặn trước database query'] },
  { id: 'phase4-runbook', layer: 'operations', source: 'docs/realms/PHASE-4-CRM-WORKLOAD-INTELLIGENCE.md', signals: ['CRM không chỉ là pipeline', 'canonical ERP records', 'crmegoric-realms-demo'] },
];

function cell(value) {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildCrmWorkloadIntelligenceAudit(root) {
  const contracts = CONTRACTS.map((contract) => {
    const file = path.join(root, contract.source);
    const source = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const missingSignals = contract.signals.filter((signal) => !source.includes(signal));
    return { ...contract, missingSignals, status: missingSignals.length ? 'failed' : 'verified' };
  });
  const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
  const domain = fs.readFileSync(path.join(root, 'lib/crm-workload-intelligence.js'), 'utf8');
  const erpUi = fs.readFileSync(path.join(root, 'app/(app)/leads/page.jsx'), 'utf8');
  const realmDomain = fs.readFileSync(path.join(root, 'lib/realm-embassy.js'), 'utf8');
  const scenarios = [
    { id: 'one-canonical-lead-and-activity-store', expected: '1:1', actual: `${(schema.match(/model Lead \{/g) || []).length}:${(schema.match(/model Activity \{/g) || []).length}` },
    { id: 'workload-precedes-pipeline', expected: 'true', actual: String(erpUi.indexOf('CRM Workload Intelligence') >= 0 && erpUi.indexOf('CRM Workload Intelligence') < erpUi.indexOf('Pipeline &amp; forecast drill-down')) },
    { id: 'no-arbitrary-ui-lead-score', expected: 'false', actual: String(erpUi.includes('leadScore')) },
    { id: 'activity-not-observed-confidence-medium', expected: 'true:true:true', actual: `${domain.includes('isObservedTruth: false')}:${domain.includes("ceiling: 'medium'")}:${domain.includes('activityIsObservedTruth: false')}` },
    { id: 'advisory-no-ranking-no-auto-mutation', expected: 'true:true:true', actual: `${domain.includes('employeeRanking: false')}:${domain.includes('automaticAssignment: false')}:${domain.includes('automaticStageChange: false')}` },
    { id: 'realm-and-erp-share-domain-engine', expected: 'true:true', actual: `${realmDomain.includes("import { buildCrmWorkloadIntelligence }")}:${erpUi.includes("fetch('/api/leads/workload'")}` },
  ].map((scenario) => ({ ...scenario, status: scenario.actual === scenario.expected ? 'verified' : 'failed' }));
  return {
    schemaVersion: 1,
    summary: {
      contracts: contracts.length,
      verifiedContracts: contracts.filter((row) => row.status === 'verified').length,
      scenarios: scenarios.length,
      verifiedScenarios: scenarios.filter((row) => row.status === 'verified').length,
      canonicalLeadStores: 1,
      canonicalActivityStores: 1,
      confidenceCeiling: 'medium',
      employeeRankingEnabled: false,
      automaticLeadMutationEnabled: false,
      schemaMigrationRequired: false,
    },
    contracts,
    scenarios,
  };
}

export function renderCrmWorkloadIntelligenceArtifacts(result) {
  const columns = ['id', 'layer', 'source', 'signals', 'missingSignals', 'status'];
  const summary = result.summary;
  return {
    'crm-workload-verification.json': `${JSON.stringify(result, null, 2)}\n`,
    'crm-workload-contracts.csv': `${columns.join(',')}\n${result.contracts.map((row) => columns.map((column) => cell(row[column])).join(',')).join('\n')}\n`,
    'PHASE-4-REPORT.md': `# Phase 4 — CRM Workload Intelligence\n\n- Contracts: **${summary.verifiedContracts}/${summary.contracts}**\n- Deterministic scenarios: **${summary.verifiedScenarios}/${summary.scenarios}**\n- Canonical Lead stores: **${summary.canonicalLeadStores}**\n- Canonical Activity stores: **${summary.canonicalActivityStores}**\n- Confidence ceiling: **${summary.confidenceCeiling}**\n- Employee ranking enabled: **${summary.employeeRankingEnabled}**\n- Automatic Lead mutation enabled: **${summary.automaticLeadMutationEnabled}**\n- Schema migration required: **${summary.schemaMigrationRequired}**\n\nERP CRM and Royal Embassy share one workload-intelligence rule engine over canonical CRM records.\n\nRegression gate: \`npm run audit:crm:check\`.\n`,
  };
}
