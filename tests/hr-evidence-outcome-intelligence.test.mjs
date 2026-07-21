import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildHrEvidenceOutcomeIntelligence,
  currentQuarter,
  HR_EVIDENCE_RULE_VERSION,
  quarterWindow,
} from '../lib/hr-evidence-outcome-intelligence.js';

const NOW = '2026-07-20T12:00:00.000Z';

function fixture(overrides = {}) {
  return buildHrEvidenceOutcomeIntelligence({
    people: [
      { id: 'u2', name: 'Zulu', title: 'Designer', status: 'active', userType: 'employee' },
      { id: 'u1', name: 'An', title: 'Developer', status: 'active', userType: 'employee' },
    ],
    attendance: [{ id: 'a1', userId: 'u1', date: '2026-07-18', status: 'remote' }],
    timeLogs: [{ id: 'l1', userId: 'u1', taskId: 't1', date: '2026-07-18', hours: 4 }],
    tasks: [
      { id: 't1', assigneeId: 'u1', status: 'done', completedAt: '2026-07-18T10:00:00.000Z', updatedAt: '2026-07-18T10:00:00.000Z' },
      { id: 't2', assigneeId: 'u2', status: 'done', completedAt: null, updatedAt: '2026-07-19T10:00:00.000Z' },
    ],
    workEvents: [{ id: 'e1', taskId: 't1', toState: 'done', receiptId: 'receipt-1', occurredAt: '2026-07-18T10:00:00.000Z' }],
    okrs: [{ id: 'o1', userId: 'u1', quarter: '2026-Q3', target: 10, current: 10 }],
    reviews: [{ id: 'r1', userId: 'u1', quarter: '2026-Q3', status: 'final', scores: '[{"mgr":5}]', mgrNote: 'private' }],
    quarter: '2026-Q3',
    today: '2026-07-20',
    scope: { kind: 'company', canValidate: true },
    ...overrides,
  });
}

test('dựng Evidence Pyramid bốn lớp nhưng không tạo performance score hoặc ranking', () => {
  const result = fixture();
  assert.equal(result.ruleVersion, HR_EVIDENCE_RULE_VERSION);
  assert.deepEqual(Object.keys(result.layerOverview), ['presence', 'activity', 'output', 'outcome']);
  assert.deepEqual(result.dossiers.map((row) => row.person.name), ['An', 'Zulu']);
  assert.equal(result.dossiers[0].allLayersRecorded, true);
  assert.equal(result.dossiers[0].performanceConclusion, null);
  assert.equal(result.policy.compositePerformanceScore, false);
  assert.equal(result.policy.employeeRanking, false);
  assert.equal(result.policy.presenceAsProductivity, false);
  assert.equal(result.policy.automaticHrDecision, false);
  assert.equal(result.provenance.evidenceLedgerUsed, false);
});

test('tách declared TimeLog, observed receipt và manager-validated Review theo provenance', () => {
  const dossier = fixture().dossiers[0];
  assert.deepEqual(dossier.layers.activity.sourceClasses, ['declared', 'observed']);
  assert.equal(dossier.layers.activity.facts.declaredHours, 4);
  assert.equal(dossier.layers.output.facts.completionReceipts, 1);
  assert.deepEqual(dossier.layers.output.sourceClasses, ['observed']);
  assert.equal(dossier.layers.output.validatedUnits, 0);
  assert.deepEqual(dossier.layers.outcome.sourceClasses, ['declared', 'validated']);
  assert.equal(dossier.layers.outcome.facts.managerValidatedReviews, 1);
});

test('verification queue nêu data gap và không biến thiếu dữ liệu thành kết luận tiêu cực', () => {
  const result = fixture();
  const zulu = result.dossiers.find((row) => row.person.id === 'u2');
  assert.equal(zulu.evidenceGapCount, 3);
  assert.equal(result.verificationQueue.some((row) => row.id === 'completion-time:u2'), true);
  assert.equal(result.verificationQueue.some((row) => row.id === 'completion-receipt:u2'), true);
  assert.equal(result.verificationQueue.some((row) => row.id === 'review-missing:u2'), true);
  assert.equal(result.verificationQueue.every((row) => ['attention', 'info'].includes(row.severity)), true);
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.equal(JSON.stringify(result).includes('"score"'), false);
});

test('attendance nhiều chỉ tăng coverage, không thay policy hay sinh productivity field', () => {
  const attendance = Array.from({ length: 40 }, (_, index) => ({
    id: `a${index}`,
    userId: 'u1',
    date: `2026-07-${String((index % 20) + 1).padStart(2, '0')}`,
    status: 'present',
  }));
  const result = fixture({ attendance });
  assert.equal(result.dossiers[0].layers.presence.units, 40);
  assert.equal(result.dossiers[0].layers.presence.isPerformanceScore, false);
  assert.equal(result.policy.presenceAsProductivity, false);
  assert.equal(JSON.stringify(result).includes('productivityScore'), false);
});

test('quarter helpers dùng ranh giới UTC ổn định và loại dữ liệu ngoài quý', () => {
  assert.equal(currentQuarter(NOW), '2026-Q3');
  const window = quarterWindow('2026-Q3');
  assert.equal(window.startDate, '2026-07-01');
  assert.equal(window.endDateExclusive, '2026-10-01');
  const result = fixture({
    attendance: [
      { id: 'inside', userId: 'u1', date: '2026-09-30', status: 'present' },
      { id: 'outside', userId: 'u1', date: '2026-10-01', status: 'present' },
    ],
  });
  assert.equal(result.dossiers[0].layers.presence.units, 1);
});

test('giữ precision TimeLog theo quarter-hour thay vì làm tròn sai evidence', () => {
  const result = fixture({
    timeLogs: [{ id: 'l1', userId: 'u1', taskId: 't1', date: '2026-07-18', hours: 1.25 }],
  });
  assert.equal(result.dossiers[0].layers.activity.facts.declaredHours, 1.25);
});
