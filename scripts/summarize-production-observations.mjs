import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PRODUCTION_OBSERVATION_FORMAT,
  PRODUCTION_SURFACES,
  applicableProductionProbes,
} from './production-observation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_FORMAT = 'repositoryrealms-production-observation-rollup-v1';
const MAX_ARTIFACTS = 1_000;

function fail(message) {
  throw new Error(message);
}

function finiteInteger(value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function isoDate(value, label) {
  const text = String(value || '');
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)
    || Number.isNaN(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== text) {
    fail(`${label} must be YYYY-MM-DD.`);
  }
  return text;
}

function dateRange(start, end) {
  const values = [];
  for (let cursor = new Date(`${start}T00:00:00.000Z`); cursor <= new Date(`${end}T00:00:00.000Z`); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    values.push(cursor.toISOString().slice(0, 10));
  }
  return values;
}

function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
}

function roundPercent(numerator, denominator) {
  return denominator ? Math.round((numerator / denominator) * 10_000) / 100 : 0;
}

function sensitiveShape(value) {
  const forbidden = /^(?:body|headers|cookie|cookies|authorization|token|password|email|payload|response)$/i;
  const stack = [value];
  while (stack.length) {
    const item = stack.pop();
    if (!item || typeof item !== 'object') continue;
    for (const [key, nested] of Object.entries(item)) {
      if (forbidden.test(key)) return key;
      if (nested && typeof nested === 'object') stack.push(nested);
    }
  }
  return null;
}

export function validateObservationArtifact(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { valid: false, reason: 'invalid_json_shape' };
  if (value.format !== PRODUCTION_OBSERVATION_FORMAT || value.catalogVersion !== 2) return { valid: false, reason: 'unsupported_format' };
  if (value.scope !== 'public-read-only') return { valid: false, reason: 'invalid_scope' };
  const observedAt = new Date(value.observedAt);
  if (Number.isNaN(observedAt.getTime()) || observedAt.toISOString() !== value.observedAt) return { valid: false, reason: 'invalid_observed_at' };
  const sensitive = sensitiveShape(value);
  if (sensitive) return { valid: false, reason: `forbidden_field:${sensitive.toLowerCase()}` };
  if (!Array.isArray(value.surfaces) || value.surfaces.length !== PRODUCTION_SURFACES.length) return { valid: false, reason: 'invalid_surface_count' };

  let probeCount = 0;
  let passedCount = 0;
  const passedDurations = [];
  for (const expectedSurface of PRODUCTION_SURFACES) {
    const matches = value.surfaces.filter((surface) => surface?.id === expectedSurface.id);
    if (matches.length !== 1) return { valid: false, reason: `invalid_surface:${expectedSurface.id}` };
    const surface = matches[0];
    if (surface.name !== expectedSurface.name || surface.kind !== expectedSurface.kind || surface.baseUrl !== expectedSurface.baseUrl) {
      return { valid: false, reason: `surface_contract_mismatch:${expectedSurface.id}` };
    }
    const expectedProbes = applicableProductionProbes(expectedSurface);
    if (!Array.isArray(surface.probes) || surface.probes.length !== expectedProbes.length) {
      return { valid: false, reason: `invalid_probe_count:${expectedSurface.id}` };
    }
    for (const expectedProbe of expectedProbes) {
      const matchesProbe = surface.probes.filter((probe) => probe?.probeId === expectedProbe.id);
      if (matchesProbe.length !== 1) return { valid: false, reason: `invalid_probe:${expectedSurface.id}:${expectedProbe.id}` };
      const probe = matchesProbe[0];
      if (probe.method !== 'GET' || probe.path !== expectedProbe.path
        || !finiteInteger(probe.durationMs, 0, 120_000)
        || (probe.status !== null && !finiteInteger(probe.status, 100, 599))
        || typeof probe.passed !== 'boolean'
        || !Array.isArray(probe.failureCodes)
        || probe.failureCodes.some((code) => !/^[a-z0-9_:-]{1,100}$/.test(code))) {
        return { valid: false, reason: `probe_contract_mismatch:${expectedSurface.id}:${expectedProbe.id}` };
      }
      if (probe.passed && !expectedProbe.statuses.includes(probe.status)) {
        return { valid: false, reason: `probe_status_mismatch:${expectedSurface.id}:${expectedProbe.id}` };
      }
      if (probe.passed !== (probe.failureCodes.length === 0)) return { valid: false, reason: `probe_outcome_mismatch:${expectedSurface.id}:${expectedProbe.id}` };
      probeCount += 1;
      if (probe.passed) {
        passedCount += 1;
        passedDurations.push(probe.durationMs);
      }
    }
    if (surface.status !== (surface.probes.every((probe) => probe.passed) ? 'PASS' : 'FAIL')) {
      return { valid: false, reason: `surface_outcome_mismatch:${expectedSurface.id}` };
    }
  }

  const computedFailed = probeCount - passedCount;
  if (!value.summary
    || !finiteInteger(value.summary.slow, 0, probeCount)
    || !finiteInteger(value.summary.slowThresholdMs, 250, 20_000)
    || value.summary.surfaces !== PRODUCTION_SURFACES.length
    || value.summary.probes !== probeCount || value.summary.passed !== passedCount
    || value.summary.failed !== probeCount - passedCount
    || value.summary.slow !== passedDurations.filter((duration) => duration > value.summary.slowThresholdMs).length
    || value.summary.status !== (computedFailed ? 'FAIL' : value.summary.slow ? 'PASS_WITH_WARNINGS' : 'PASS')) {
    return { valid: false, reason: 'summary_mismatch' };
  }
  return { valid: true, observedAt: value.observedAt };
}

export function buildObservationRollup(entries, options = {}) {
  const minimumDays = Number(options.minimumDays ?? 30);
  if (!finiteInteger(minimumDays, 1, 366)) fail('minimumDays must be an integer from 1 to 366.');
  const accepted = [];
  const rejected = [];
  const seen = new Set();
  for (const entry of [...entries].sort((a, b) => String(a.file).localeCompare(String(b.file)))) {
    const validation = validateObservationArtifact(entry.value);
    if (!validation.valid) {
      rejected.push({ file: path.basename(String(entry.file || 'unknown.json')), reason: validation.reason });
      continue;
    }
    if (seen.has(validation.observedAt)) {
      rejected.push({ file: path.basename(String(entry.file || 'unknown.json')), reason: 'duplicate_observed_at' });
      continue;
    }
    seen.add(validation.observedAt);
    accepted.push({ file: path.basename(String(entry.file || 'unknown.json')), value: entry.value });
  }
  accepted.sort((a, b) => a.value.observedAt.localeCompare(b.value.observedAt));

  const observedDates = [...new Set(accepted.map((entry) => entry.value.observedAt.slice(0, 10)))].sort();
  const start = options.windowStart
    ? isoDate(options.windowStart, 'windowStart')
    : observedDates[0] || null;
  const end = options.windowEnd
    ? isoDate(options.windowEnd, 'windowEnd')
    : observedDates.at(-1) || null;
  if ((start && !end) || (!start && end) || (start && start > end)) fail('Observation window is invalid.');
  const expectedDates = start ? dateRange(start, end) : [];
  const selected = accepted.filter((entry) => !start || (entry.value.observedAt.slice(0, 10) >= start && entry.value.observedAt.slice(0, 10) <= end));
  const observedSet = new Set(selected.map((entry) => entry.value.observedAt.slice(0, 10)));
  const missingDates = expectedDates.filter((date) => !observedSet.has(date));

  const incidents = [];
  const surfaces = PRODUCTION_SURFACES.map((expectedSurface) => {
    const samples = [];
    let successfulRuns = 0;
    let passedProbes = 0;
    let totalProbes = 0;
    for (const entry of selected) {
      const surface = entry.value.surfaces.find((item) => item.id === expectedSurface.id);
      if (surface.status === 'PASS') successfulRuns += 1;
      for (const probe of surface.probes) {
        samples.push(probe.durationMs);
        totalProbes += 1;
        if (probe.passed) passedProbes += 1;
        else incidents.push({
          observedAt: entry.value.observedAt,
          surfaceId: surface.id,
          probeId: probe.probeId,
          status: probe.status,
          failureCodes: [...probe.failureCodes],
        });
      }
    }
    return {
      id: expectedSurface.id,
      name: expectedSurface.name,
      runs: selected.length,
      successfulRuns,
      contractPassRatePercent: roundPercent(successfulRuns, selected.length),
      probePassRatePercent: roundPercent(passedProbes, totalProbes),
      latencyP50Ms: percentile(samples, 0.5),
      latencyP95Ms: percentile(samples, 0.95),
      latencyMaxMs: samples.length ? Math.max(...samples) : null,
    };
  });

  const observedDays = observedSet.size;
  const sufficientDays = observedDays >= minimumDays;
  const completeWindow = expectedDates.length > 0 && missingDates.length === 0;
  const decision = incidents.length
    ? 'ATTENTION_REQUIRED'
    : sufficientDays && completeWindow
      ? 'READY_FOR_HUMAN_REVIEW'
      : 'INSUFFICIENT_EVIDENCE';
  return {
    format: REPORT_FORMAT,
    generatedAt: new Date().toISOString(),
    releaseGate: 'HOLD; this report never authorizes merge, migration or deployment',
    decision,
    window: { start, end, expectedDays: expectedDates.length, observedDays, minimumDays, missingDates },
    evidence: {
      accepted: selected.length,
      outsideWindow: accepted.length - selected.length,
      rejected: rejected.length,
      rejectedFiles: rejected,
    },
    summary: {
      runs: selected.length,
      passingRuns: selected.filter((entry) => entry.value.summary.failed === 0).length,
      incidents: incidents.length,
      runPassRatePercent: roundPercent(selected.filter((entry) => entry.value.summary.failed === 0).length, selected.length),
    },
    surfaces,
    incidents: incidents.slice(0, 500),
  };
}

export function renderObservationMarkdown(report) {
  const lines = [
    '# RepositoryRealms — Production observation rollup',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Decision: **${report.decision}**`,
    '',
    `Release gate: **${report.releaseGate}**`,
    '',
    `Window: ${report.window.start || 'n/a'} → ${report.window.end || 'n/a'} · ${report.window.observedDays}/${report.window.minimumDays} minimum observed days · ${report.window.missingDates.length} missing dates.`,
    '',
    `Evidence: ${report.evidence.accepted} accepted, ${report.evidence.outsideWindow} outside window, ${report.evidence.rejected} rejected · Incidents: ${report.summary.incidents}.`,
    '',
    '| Surface | Runs pass | Contract pass | Probe pass | p50 | p95 | max |',
    '|---|---:|---:|---:|---:|---:|---:|',
    ...report.surfaces.map((surface) => `| ${surface.name} | ${surface.successfulRuns}/${surface.runs} | ${surface.contractPassRatePercent}% | ${surface.probePassRatePercent}% | ${surface.latencyP50Ms ?? 'n/a'} ms | ${surface.latencyP95Ms ?? 'n/a'} ms | ${surface.latencyMaxMs ?? 'n/a'} ms |`),
    '',
    'This report is observational evidence only. It never replaces production backup, isolated restore rehearsal, authenticated UAT or maker/checker approval.',
    '',
  ];
  if (report.window.missingDates.length) lines.push(`Missing dates: ${report.window.missingDates.join(', ')}`, '');
  if (report.evidence.rejectedFiles.length) {
    lines.push('Rejected evidence:', '', ...report.evidence.rejectedFiles.map((item) => `- ${item.file}: ${item.reason}`), '');
  }
  if (report.incidents.length) {
    lines.push('Incidents:', '', ...report.incidents.map((item) => `- ${item.observedAt} · ${item.surfaceId}/${item.probeId} · ${item.failureCodes.join(', ')}`), '');
  }
  return `${lines.join('\n')}\n`;
}

function collectJsonFiles(directory) {
  const files = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) files.push(target);
      if (files.length > MAX_ARTIFACTS) fail(`Evidence directory exceeds ${MAX_ARTIFACTS} JSON files.`);
    }
  };
  visit(directory);
  return files.sort();
}

function stamp() {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function reportOutput() {
  const configured = process.env.PRODUCTION_OBSERVATION_REPORT_OUTPUT;
  const output = configured
    ? path.resolve(configured)
    : path.join(root, 'qa', 'production-observation', 'reports', `${stamp()}.json`);
  if (path.extname(output).toLowerCase() !== '.json') fail('PRODUCTION_OBSERVATION_REPORT_OUTPUT must end in .json.');
  return output;
}

function main() {
  const input = path.resolve(process.env.PRODUCTION_OBSERVATION_INPUT_DIR || path.join(root, 'qa', 'production-observation', 'runs'));
  if (!fs.existsSync(input) || !fs.statSync(input).isDirectory()) fail('Observation evidence directory does not exist.');
  const entries = collectJsonFiles(input).map((file) => {
    try {
      return { file, value: JSON.parse(fs.readFileSync(file, 'utf8')) };
    } catch {
      return { file, value: null };
    }
  });
  const report = buildObservationRollup(entries, {
    minimumDays: Number(process.env.PRODUCTION_OBSERVATION_REPORT_MIN_DAYS || 30),
    windowStart: process.env.PRODUCTION_OBSERVATION_WINDOW_START,
    windowEnd: process.env.PRODUCTION_OBSERVATION_WINDOW_END,
  });
  const output = reportOutput();
  const markdown = output.replace(/\.json$/i, '.md');
  if (fs.existsSync(output) || fs.existsSync(markdown)) fail('Observation report output already exists.');
  fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  fs.writeFileSync(markdown, renderObservationMarkdown(report), { mode: 0o600, flag: 'wx' });
  console.log(`Observation rollup: ${report.decision}.`);
  console.log(`Evidence: ${report.evidence.accepted} accepted, ${report.evidence.rejected} rejected; ${report.window.observedDays}/${report.window.minimumDays} observed days.`);
  console.log(`Incidents: ${report.summary.incidents}; missing dates: ${report.window.missingDates.length}.`);
  console.log(`JSON: ${output}`);
  console.log(`Markdown: ${markdown}`);
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  try {
    main();
  } catch (error) {
    console.error(`[production-observation-report] ${String(error?.message || error).trim()}`);
    process.exitCode = 1;
  }
}
