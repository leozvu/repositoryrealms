import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PRODUCTION_OBSERVATION_FORMAT,
  PRODUCTION_SURFACES,
  applicableProductionProbes,
} from '../scripts/production-observation.mjs';
import {
  buildObservationRollup,
  renderObservationMarkdown,
  validateObservationArtifact,
} from '../scripts/summarize-production-observations.mjs';

function artifact(observedAt, { failedSurface = null, durationMs = 100 } = {}) {
  const surfaces = PRODUCTION_SURFACES.map((surface) => {
    const probes = applicableProductionProbes(surface).map((probe, index) => {
      const failed = surface.id === failedSurface && index === 0;
      return {
        probeId: probe.id,
        method: 'GET',
        path: probe.path,
        status: failed ? 500 : probe.statuses[0],
        durationMs,
        passed: !failed,
        failureCodes: failed ? ['expected_status'] : [],
      };
    });
    return { ...surface, status: probes.every((probe) => probe.passed) ? 'PASS' : 'FAIL', probes };
  });
  const probes = surfaces.flatMap((surface) => surface.probes);
  const passed = probes.filter((probe) => probe.passed).length;
  return {
    format: PRODUCTION_OBSERVATION_FORMAT,
    catalogVersion: 2,
    observedAt,
    scope: 'public-read-only',
    releaseGate: 'informational',
    invariants: ['GET requests only'],
    summary: {
      status: passed === probes.length ? 'PASS' : 'FAIL',
      surfaces: surfaces.length,
      probes: probes.length,
      passed,
      failed: probes.length - passed,
      slow: 0,
      slowThresholdMs: 3_000,
    },
    surfaces,
  };
}

function day(index) {
  return new Date(Date.UTC(2026, 6, 1 + index, 12)).toISOString();
}

test('validator accepts the topology-aware v2 artifact and rejects sensitive or old evidence', () => {
  const current = artifact(day(0));
  assert.equal(validateObservationArtifact(current).valid, true);

  const sensitive = structuredClone(current);
  sensitive.surfaces[0].probes[0].body = 'must never be retained';
  assert.deepEqual(validateObservationArtifact(sensitive), { valid: false, reason: 'forbidden_field:body' });

  const old = structuredClone(current);
  old.format = 'repositoryrealms-production-observation-v1';
  assert.deepEqual(validateObservationArtifact(old), { valid: false, reason: 'unsupported_format' });

  const falsePass = structuredClone(current);
  falsePass.surfaces[0].probes[0].status = 500;
  assert.deepEqual(validateObservationArtifact(falsePass), { valid: false, reason: 'probe_status_mismatch:aim:login' });
});

test('one clean day remains insufficient evidence and never becomes GO', () => {
  const report = buildObservationRollup([{ file: 'day-1.json', value: artifact(day(0)) }], { minimumDays: 30 });
  assert.equal(report.decision, 'INSUFFICIENT_EVIDENCE');
  assert.equal(report.window.observedDays, 1);
  assert.equal(report.summary.runPassRatePercent, 100);
  assert.ok(!JSON.stringify(report).includes('"GO"'));
});

test('thirty complete clean days become ready only for human review', () => {
  const entries = Array.from({ length: 30 }, (_, index) => ({ file: `day-${index + 1}.json`, value: artifact(day(index), { durationMs: 100 + index }) }));
  const report = buildObservationRollup(entries, { minimumDays: 30, windowStart: '2026-07-01', windowEnd: '2026-07-30' });
  assert.equal(report.decision, 'READY_FOR_HUMAN_REVIEW');
  assert.equal(report.window.missingDates.length, 0);
  assert.equal(report.summary.runs, 30);
  assert.equal(report.surfaces.length, 5);
  assert.ok(report.surfaces.every((surface) => surface.contractPassRatePercent === 100));
  assert.match(report.releaseGate, /^HOLD;/);
});

test('failed probes require attention and duplicate timestamps are rejected', () => {
  const observedAt = day(0);
  const report = buildObservationRollup([
    { file: 'a.json', value: artifact(observedAt, { failedSurface: 'egoric' }) },
    { file: 'b.json', value: artifact(observedAt) },
  ], { minimumDays: 1 });
  assert.equal(report.decision, 'ATTENTION_REQUIRED');
  assert.equal(report.summary.incidents, 1);
  assert.deepEqual(report.evidence.rejectedFiles, [{ file: 'b.json', reason: 'duplicate_observed_at' }]);
});

test('explicit report window exposes missing observation dates', () => {
  const report = buildObservationRollup([
    { file: 'first.json', value: artifact(day(0)) },
    { file: 'third.json', value: artifact(day(2)) },
  ], { minimumDays: 3, windowStart: '2026-07-01', windowEnd: '2026-07-03' });
  assert.equal(report.decision, 'INSUFFICIENT_EVIDENCE');
  assert.deepEqual(report.window.missingDates, ['2026-07-02']);
  const markdown = renderObservationMarkdown(report);
  assert.match(markdown, /INSUFFICIENT_EVIDENCE/);
  assert.match(markdown, /2026-07-02/);
});
