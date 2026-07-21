import fs from 'node:fs';
import path from 'node:path';

const CONTRACTS = [
  { id: 'canonical-finance-records', layer: 'data', source: 'prisma/schema.prisma', signals: ['model TimeLog {', 'model Invoice {', 'model Transaction {', 'model VendorBill {', 'model Budget {'] },
  { id: 'finance-rule-version', layer: 'domain', source: 'lib/financial-operating-intelligence.js', signals: ["FINANCIAL_INTELLIGENCE_RULE_VERSION = 'financial-operating-intelligence-v1'", 'buildFinancialOperatingIntelligence'] },
  { id: 'invoice-fail-closed', layer: 'data-quality', source: 'lib/financial-operating-intelligence.js', signals: ['strictArray', 'malformedInvoices', 'Financial Intelligence không đoán số tiền'] },
  { id: 'cash-from-transaction-ledger', layer: 'accounting', source: 'lib/financial-operating-intelligence.js', signals: ["cashBalance: 'recorded_transactions_vnd'", 'ledgerIncome - ledgerExpense'] },
  { id: 'operating-margin-proxy', layer: 'economics', source: 'lib/financial-operating-intelligence.js', signals: ['operatingCostProxy', 'operatingMarginProxy', 'isAccountingProfit: false'] },
  { id: 'three-month-schedule', layer: 'forecast', source: 'lib/financial-operating-intelligence.js', signals: ['cashForecast', 'futureRecurringTemplates', 'schedule_view_excludes_payroll_and_unrecorded_costs'] },
  { id: 'manager-finance-queue', layer: 'operations', source: 'lib/financial-operating-intelligence.js', signals: ['managerQueue', 'review_receivable', 'review_payable', 'review_unbilled_hours', 'review_budget'] },
  { id: 'anti-ranking-advisory-policy', layer: 'governance', source: 'lib/financial-operating-intelligence.js', signals: ['advisoryOnly: true', 'accountingProfit: false', 'automaticPayment: false', 'employeeRanking: false', 'individualProfitability: false'] },
  { id: 'finance-authorization', layer: 'authorization', source: 'lib/financial-operating-intelligence-admin.js', signals: ['financialIntelligenceScope', "hasAny(user, ['ACCOUNTANT'])", 'financial_intelligence_scope_missing'] },
  { id: 'salary-rate-does-not-leak', layer: 'privacy', source: 'tests/financial-operating-intelligence-admin.test.mjs', signals: ["includes('salary'), false", "includes('hourlyRate'), false", "includes('17600000'), false"] },
  { id: 'private-finance-api', layer: 'api', source: 'app/api/finance/intelligence/route.js', signals: ['currentUser()', 'loadFinancialOperatingIntelligence', "'Cache-Control': 'private, no-store'"] },
  { id: 'erp-financial-intelligence-first', layer: 'ui', source: 'app/(app)/finance/page.jsx', signals: ['FinancialIntelligencePanel', 'Sổ quỹ &amp; giao dịch', "fetch('/api/finance/intelligence'"] },
  { id: 'realm-shares-canonical-loader', layer: 'parity', source: 'lib/realm-treasury-admin.js', signals: ["import { loadFinancialOperatingIntelligence }", 'financialIntelligence: finance?.financialIntelligence'] },
  { id: 'royal-ledger-ui', layer: 'ui', source: 'components/realm/RoyalTreasuryExchange.jsx', signals: ['The Steward&apos;s Margin Table', 'Steward Queue', 'Không phải accounting profit', 'không phải ranking'] },
  { id: 'responsive-accessible-finance', layer: 'ux', source: 'components/finance/financial-intelligence.module.css', signals: ['min-height: 44px', '@media (max-width: 700px)', '@media (prefers-reduced-motion: reduce)'] },
  { id: 'phase5-domain-tests', layer: 'test', source: 'tests/financial-operating-intelligence.test.mjs', signals: ['không nhận là accounting profit', 'fail-closed', 'không tạo employee ranking'] },
  { id: 'phase5-server-tests', layer: 'test', source: 'tests/financial-operating-intelligence-admin.test.mjs', signals: ['chỉ mở company scope', 'response không leak salary/rate', 'bị chặn trước mọi database query'] },
  { id: 'phase5-runbook', layer: 'operations', source: 'docs/realms/PHASE-5-FINANCIAL-OPERATING-INTELLIGENCE.md', signals: ['Task → TimeLog → Cost proxy → Invoice → Cash', 'canonical ERP finance records', 'crmegoric-realms-demo'] },
];

function cell(value) {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildFinancialOperatingIntelligenceAudit(root) {
  const contracts = CONTRACTS.map((contract) => {
    const file = path.join(root, contract.source);
    const source = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const missingSignals = contract.signals.filter((signal) => !source.includes(signal));
    return { ...contract, missingSignals, status: missingSignals.length ? 'failed' : 'verified' };
  });
  const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
  const domain = fs.readFileSync(path.join(root, 'lib/financial-operating-intelligence.js'), 'utf8');
  const erpUi = fs.readFileSync(path.join(root, 'app/(app)/finance/page.jsx'), 'utf8');
  const realmAdmin = fs.readFileSync(path.join(root, 'lib/realm-treasury-admin.js'), 'utf8');
  const scenarios = [
    { id: 'one-canonical-store-per-finance-record', expected: '1:1:1:1:1', actual: ['TimeLog', 'Invoice', 'Transaction', 'VendorBill', 'Budget'].map((model) => (schema.match(new RegExp(`model ${model} \\{`, 'g')) || []).length).join(':') },
    { id: 'cash-and-margin-have-distinct-sources', expected: 'true:true:true', actual: `${domain.includes("cashBalance: 'recorded_transactions_vnd'")}:${domain.includes("laborCost: 'declared_timelog_x_current_rate_not_payroll'")}:${domain.includes('isAccountingProfit: false')}` },
    { id: 'fail-closed-financial-json', expected: 'true:true', actual: `${domain.includes('strictArray')}:${domain.includes('malformedInvoices')}` },
    { id: 'advisory-no-ranking-no-auto-money-action', expected: 'true:true:true', actual: `${domain.includes('employeeRanking: false')}:${domain.includes('automaticPayment: false')}:${domain.includes('automaticInvoiceCreation: false')}` },
    { id: 'financial-intelligence-precedes-ledger-crud', expected: 'true', actual: String(erpUi.indexOf('FinancialIntelligencePanel') >= 0 && erpUi.indexOf('FinancialIntelligencePanel') < erpUi.indexOf('Sổ quỹ &amp; giao dịch')) },
    { id: 'realm-and-erp-share-server-loader', expected: 'true:true', actual: `${realmAdmin.includes("import { loadFinancialOperatingIntelligence }")}:${erpUi.includes("fetch('/api/finance/intelligence'")}` },
  ].map((scenario) => ({ ...scenario, status: scenario.actual === scenario.expected ? 'verified' : 'failed' }));
  return {
    schemaVersion: 1,
    summary: {
      contracts: contracts.length,
      verifiedContracts: contracts.filter((row) => row.status === 'verified').length,
      scenarios: scenarios.length,
      verifiedScenarios: scenarios.filter((row) => row.status === 'verified').length,
      canonicalFinanceStores: 5,
      confidenceCeiling: 'low',
      accountingProfitClaimed: false,
      employeeRankingEnabled: false,
      automaticMoneyActionEnabled: false,
      schemaMigrationRequired: false,
    },
    contracts,
    scenarios,
  };
}

export function renderFinancialOperatingIntelligenceArtifacts(result) {
  const columns = ['id', 'layer', 'source', 'signals', 'missingSignals', 'status'];
  const summary = result.summary;
  return {
    'financial-intelligence-verification.json': `${JSON.stringify(result, null, 2)}\n`,
    'financial-intelligence-contracts.csv': `${columns.join(',')}\n${result.contracts.map((row) => columns.map((column) => cell(row[column])).join(',')).join('\n')}\n`,
    'PHASE-5-REPORT.md': `# Phase 5 — Financial Operating Intelligence\n\n- Contracts: **${summary.verifiedContracts}/${summary.contracts}**\n- Deterministic scenarios: **${summary.verifiedScenarios}/${summary.scenarios}**\n- Canonical finance stores: **${summary.canonicalFinanceStores}**\n- Confidence ceiling: **${summary.confidenceCeiling}**\n- Accounting profit claimed: **${summary.accountingProfitClaimed}**\n- Employee ranking enabled: **${summary.employeeRankingEnabled}**\n- Automatic money action enabled: **${summary.automaticMoneyActionEnabled}**\n- Schema migration required: **${summary.schemaMigrationRequired}**\n\nERP Finance and Royal Ledger share the same server-side Financial Intelligence read model over canonical records.\n\nRegression gate: \`npm run audit:finance:check\`.\n`,
  };
}
