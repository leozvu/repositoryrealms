import fs from 'node:fs';
import path from 'node:path';
import {
  EVIDENCE_PROHIBITED_DECISION_USES,
  EVIDENCE_PROHIBITED_SIGNALS,
  EVIDENCE_SOURCE_CLASSES,
  WORK_EVIDENCE_POLICY_V1,
} from '../../lib/work-evidence-contract.js';

const CONTRACTS = [
  { id: 'governance-runbook', layer: 'policy', source: 'docs/realms/PHASE-0-EVIDENCE-GOVERNANCE.md', signals: ['Runtime mode: `shadow`', 'Collection: `disabled`', 'Presence không phải productivity', 'Activation gates'] },
  { id: 'machine-readable-policy', layer: 'policy', source: 'docs/realms/evidence-policy-v1.json', signals: ['"mode": "shadow"', '"collectionActive": false', '"individual_performance_ranking"'] },
  { id: 'append-only-ledger-schema', layer: 'data', source: 'prisma/schema.prisma', signals: ['model WorkEvidenceEvent', 'idempotencyKey String', 'sourceClass', 'retentionUntil'] },
  { id: 'employee-review-schema', layer: 'data', source: 'prisma/schema.prisma', signals: ['model EvidenceReviewRequest', 'requestedById', 'reasonCode', 'decisionCode'] },
  { id: 'policy-snapshot-schema', layer: 'data', source: 'prisma/schema.prisma', signals: ['model EvidencePolicySnapshot', 'shadowMode', 'contractHash'] },
  { id: 'additive-migration', layer: 'migration', source: 'prisma/migrations/20260720150000_add_work_evidence_governance/migration.sql', signals: ['CREATE TABLE "WorkEvidenceEvent"', 'CREATE TABLE "EvidenceReviewRequest"', 'CREATE TABLE "EvidencePolicySnapshot"'] },
  { id: 'fail-closed-contract', layer: 'domain', source: 'lib/work-evidence-contract.js', signals: ['work_evidence_metadata_not_allowed', 'work_evidence_purpose_not_allowed', 'work_evidence_source_mismatch'] },
  { id: 'surveillance-denylist', layer: 'privacy', source: 'lib/work-evidence-contract.js', signals: ['EVIDENCE_PROHIBITED_SIGNALS', 'work_evidence_surveillance_signal_prohibited', 'raw_device_id'] },
  { id: 'shadow-decision-guard', layer: 'safety', source: 'lib/work-evidence-contract.js', signals: ['EVIDENCE_PROHIBITED_DECISION_USES', 'work_evidence_shadow_decision_prohibited', 'gold_award'] },
  { id: 'trusted-producer-authorization', layer: 'authorization', source: 'lib/work-evidence-admin.js', signals: ['trustedProducer', 'work_evidence_trusted_producer_required', 'work_evidence_validation_forbidden'] },
  { id: 'atomic-event-audit', layer: 'audit', source: 'lib/work-evidence-admin.js', signals: ['db.$transaction', 'workEvidenceEvent.create', 'auditLog.create'] },
  { id: 'receipt-provenance-verification', layer: 'receipt', source: 'lib/work-evidence-admin.js', signals: ['verifyBusinessReceipt', 'work_evidence_business_receipt_not_found', 'work_evidence_business_receipt_mismatch'] },
  { id: 'idempotent-receipt', layer: 'receipt', source: 'lib/work-evidence-admin.js', signals: ['work_evidence_idempotency_conflict', "type: 'work_evidence.recorded'", "error?.code !== 'P2002'"] },
  { id: 'self-read-server-scope', layer: 'authorization', source: 'lib/work-evidence-admin.js', signals: ['listOwnWorkEvidenceEvents', 'actorId: user.id', 'work_evidence_page_size_invalid'] },
  { id: 'contract-security-tests', layer: 'test', source: 'tests/work-evidence-contract.test.mjs', signals: ['rejects surveillance signal', 'blocks Gold, payroll', 'untrusted producer', 'payload-free audit'] },
];

function read(root, source) {
  const file = path.join(root, source);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function applicationCollectsEvidence(root) {
  const pending = [path.join(root, 'app')];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(file);
      else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
        const source = fs.readFileSync(file, 'utf8');
        if (source.includes('recordWorkEvidenceEvent') || source.includes('workEvidenceEvent.create')) return true;
      }
    }
  }
  return false;
}

export function buildWorkEvidenceGovernanceAudit(root) {
  const contracts = CONTRACTS.map((contract) => {
    const source = read(root, contract.source);
    const missingSignals = contract.signals.filter((signal) => !source.includes(signal));
    return { ...contract, missingSignals, status: missingSignals.length ? 'failed' : 'verified' };
  });
  const policyFile = JSON.parse(read(root, 'docs/realms/evidence-policy-v1.json'));
  const registry = read(root, 'lib/registry.js').toLowerCase();
  const scenarios = [
    { id: 'shadow-mode', expected: 'shadow:false', actual: `${WORK_EVIDENCE_POLICY_V1.mode}:${WORK_EVIDENCE_POLICY_V1.collectionActive}` },
    { id: 'four-source-classes', expected: 'declared,observed,validated,derived', actual: EVIDENCE_SOURCE_CLASSES.join(',') },
    { id: 'policy-file-matches-runtime', expected: JSON.stringify(WORK_EVIDENCE_POLICY_V1.prohibitedDecisionUses), actual: JSON.stringify(policyFile.prohibitedDecisionUses) },
    { id: 'gold-payroll-discipline-blocked', expected: 'true:true:true', actual: `${EVIDENCE_PROHIBITED_DECISION_USES.includes('gold_award')}:${EVIDENCE_PROHIBITED_DECISION_USES.includes('payroll')}:${EVIDENCE_PROHIBITED_DECISION_USES.includes('discipline')}` },
    { id: 'surveillance-signals-blocked', expected: 'true:true:true', actual: `${EVIDENCE_PROHIBITED_SIGNALS.includes('gps')}:${EVIDENCE_PROHIBITED_SIGNALS.includes('keylogger')}:${EVIDENCE_PROHIBITED_SIGNALS.includes('screen_capture')}` },
    { id: 'generic-crud-not-exposed', expected: 'false:false', actual: `${registry.includes('workevidenceevents:')}:${registry.includes('evidencereviewrequests:')}` },
    { id: 'collection-path-disabled', expected: 'false', actual: String(applicationCollectsEvidence(root)) },
  ].map((scenario) => ({ ...scenario, status: scenario.actual === scenario.expected ? 'verified' : 'failed' }));
  return {
    schemaVersion: 1,
    summary: {
      contracts: contracts.length,
      verifiedContracts: contracts.filter((item) => item.status === 'verified').length,
      scenarios: scenarios.length,
      verifiedScenarios: scenarios.filter((item) => item.status === 'verified').length,
      mode: WORK_EVIDENCE_POLICY_V1.mode,
      collectionActive: WORK_EVIDENCE_POLICY_V1.collectionActive,
      decisionAutomationActive: false,
    },
    contracts,
    scenarios,
  };
}

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function renderWorkEvidenceGovernanceArtifacts(result) {
  const columns = ['id', 'layer', 'source', 'signals', 'missingSignals', 'status'];
  const summary = result.summary;
  return {
    'evidence-governance-verification.json': `${JSON.stringify(result, null, 2)}\n`,
    'evidence-governance-contracts.csv': `${columns.join(',')}\n${result.contracts.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\n')}\n`,
    'PHASE-0-REPORT.md': `# Phase 0 — Evidence & Governance Verification\n\n- Contracts: **${summary.verifiedContracts}/${summary.contracts}**\n- Scenarios: **${summary.verifiedScenarios}/${summary.scenarios}**\n- Mode: **${summary.mode}**\n- Collection active: **${summary.collectionActive}**\n- Decision automation active: **${summary.decisionAutomationActive}**\n\nPhase 0 chỉ tạo nền tảng additive. Evidence collection vẫn fail closed cho đến khi CEO, HR, Operations và Technology duyệt activation gate.\n`,
  };
}
