import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTaskResourceIntelligence,
  resourceClassification,
  summarizeResourceIntelligence,
} from '../lib/resource-intelligence.js';

const historical = [2, 3, 4, 5].map((actualHours, index) => ({
  id: `history-${index}`,
  status: 'done',
  workType: 'design',
  complexity: 'medium',
  actualHours,
}));

test('Resource Intelligence giữ estimate, TimeLog và historical thành ba nguồn riêng', () => {
  const result = buildTaskResourceIntelligence({
    id: 'task-current', status: 'doing', estHours: 9, actualHours: 1.5, workType: 'design', complexity: 'medium',
  }, historical, { kind: 'declared', createdAt: new Date('2026-07-20T12:00:00.000Z') });
  assert.equal(result.estimate.source, 'employee_declared');
  assert.equal(result.actual.source, 'declared_timelog');
  assert.equal(result.actual.isObservedTruth, false);
  assert.equal(result.historical.medianHours, 3.5);
  assert.equal(result.historical.sampleSize, 4);
  assert.equal(result.confidence.band, 'medium');
  assert.equal(result.signal.key, 'estimate_outlier');
  assert.equal(result.explanation.employeeRanking, false);
  assert.equal(result.explanation.payrollUse, false);
});

test('Baseline không tự so Task chưa phân loại và sample nhỏ chỉ có confidence low', () => {
  const missing = buildTaskResourceIntelligence({ id: 'x', status: 'todo', estHours: 0, actualHours: 0 }, historical);
  assert.equal(missing.signal.key, 'estimate_missing');
  assert.equal(missing.confidence.band, 'unrated');
  assert.equal(missing.historical.sampleSize, 0);

  const low = buildTaskResourceIntelligence({ id: 'x', status: 'todo', estHours: 3, actualHours: 0, workType: 'content', complexity: 'small' }, [
    { id: 'one', status: 'done', workType: 'content', complexity: 'small', actualHours: 4 },
  ]);
  assert.equal(low.confidence.band, 'low');
  assert.equal(low.historical.medianHours, 4);
});

test('Actual burn cảnh báo theo Task nhưng không suy diễn thành performance score', () => {
  const result = buildTaskResourceIntelligence({
    id: 'x', status: 'doing', estHours: 4, actualHours: 5, workType: 'operations', complexity: 'large',
  }, []);
  assert.equal(result.signal.key, 'estimate_consumed');
  assert.equal(result.variance.consumedPercent, 125);
  assert.equal(result.explanation.presenceAsProductivity, false);
  assert.equal(result.explanation.goldUse, false);
});

test('Summary chỉ tổng hợp operational context và không tạo employee ranking', () => {
  const tasks = [
    { intelligence: buildTaskResourceIntelligence({ id: 'a', status: 'todo', estHours: 0, actualHours: 0 }) },
    { intelligence: buildTaskResourceIntelligence({ id: 'b', status: 'doing', estHours: 4, actualHours: 2, workType: 'design', complexity: 'medium' }, historical) },
  ];
  const summary = summarizeResourceIntelligence(tasks);
  assert.equal(summary.estimateMissing, 1);
  assert.equal(summary.baselineReady, 1);
  assert.equal(summary.estimatedHours, 4);
  assert.equal(summary.declaredLoggedHours, 2);
  assert.equal(summary.employeeRanking, false);
  assert.equal(summary.confidenceCeiling, 'medium');
  assert.deepEqual(resourceClassification({ workType: 'DESIGN', complexity: 'medium' }), { workType: 'design', complexity: 'medium' });
});
