import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const command = process.argv[2] || 'plan';
export const PRODUCTION_OBSERVATION_FORMAT = 'repositoryrealms-production-observation-v2';
const RUN_CONFIRMATION = 'PUBLIC_READ_ONLY_GETS_ONLY';

export const PRODUCTION_SURFACES = Object.freeze([
  { id: 'aim', name: 'AIm Agency', kind: 'entity', baseUrl: 'https://agency-erp-mu.vercel.app' },
  { id: 'egoric', name: 'Egoric Agency', kind: 'entity', baseUrl: 'https://erp-egoric.vercel.app' },
  { id: 'vnecom', name: 'Vnecom LLC', kind: 'entity', baseUrl: 'https://erp-vnecom.vercel.app' },
  { id: 'egolive', name: 'Egolive', kind: 'entity', baseUrl: 'https://erp-egolive.vercel.app' },
  { id: 'ceo-terminal', name: 'CEO Terminal', kind: 'portal', baseUrl: 'https://ceo-terminal-leoz.vercel.app' },
]);

export const PUBLIC_PROBES = Object.freeze([
  { id: 'login', path: '/login', method: 'GET', kind: 'html', statuses: [200] },
  { id: 'auth-providers', path: '/api/auth/providers', method: 'GET', kind: 'json', statuses: [200] },
  { id: 'erp-auth-boundary', path: '/dashboard', method: 'GET', kind: 'auth-redirect', statuses: [302, 303, 307, 308] },
  { id: 'realm-auth-boundary', path: '/realm', method: 'GET', kind: 'auth-redirect', statuses: [302, 303, 307, 308] },
  { id: 'realm-api-fail-closed', path: '/api/realm-demo/health', method: 'GET', kind: 'json', statuses: [401], surfaceKinds: ['entity'] },
  { id: 'ceo-portal-auth-boundary', path: '/ceo-overview', method: 'GET', kind: 'auth-redirect', statuses: [302, 303, 307, 308], surfaceKinds: ['portal'] },
  { id: 'ceo-api-fail-closed', path: '/api/ceo/v1/health', method: 'GET', kind: 'json', statuses: [401] },
  { id: 'web-manifest', path: '/manifest.webmanifest', method: 'GET', kind: 'manifest', statuses: [200] },
]);

export function applicableProductionProbes(surface) {
  return PUBLIC_PROBES.filter((probe) => !probe.surfaceKinds || probe.surfaceKinds.includes(surface.kind));
}

function fail(message) {
  throw new Error(message);
}

function responseHeader(response, name) {
  if (typeof response?.headers?.get === 'function') return response.headers.get(name) || '';
  const entries = Object.entries(response?.headers || {});
  const found = entries.find(([key]) => key.toLowerCase() === name.toLowerCase());
  return found ? String(found[1]) : '';
}

function check(code, passed) {
  return { code, passed: Boolean(passed) };
}

export function evaluatePublicProbe({ surface, probe, response, durationMs }) {
  const checks = [check('expected_status', probe.statuses.includes(response.status))];
  const contentType = responseHeader(response, 'content-type').toLowerCase();

  if (probe.kind === 'html') {
    checks.push(check('html_content_type', contentType.includes('text/html')));
    checks.push(check('content_security_policy', Boolean(responseHeader(response, 'content-security-policy'))));
  } else if (probe.kind === 'json') {
    checks.push(check('json_content_type', contentType.includes('json')));
  } else if (probe.kind === 'manifest') {
    checks.push(check('manifest_content_type', contentType.includes('json') || contentType.includes('manifest')));
  } else if (probe.kind === 'auth-redirect') {
    const location = responseHeader(response, 'location');
    let sameOriginLogin = false;
    try {
      const target = new URL(location, surface.baseUrl);
      sameOriginLogin = target.origin === new URL(surface.baseUrl).origin && target.pathname === '/login';
    } catch {
      sameOriginLogin = false;
    }
    checks.push(check('same_origin_login_redirect', sameOriginLogin));
  }

  const failureCodes = checks.filter((item) => !item.passed).map((item) => item.code);
  return {
    probeId: probe.id,
    method: probe.method,
    path: probe.path,
    status: response.status,
    durationMs: Math.round(durationMs),
    passed: failureCodes.length === 0,
    failureCodes,
  };
}

function transportFailure(probe, durationMs, error) {
  const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
  return {
    probeId: probe.id,
    method: probe.method,
    path: probe.path,
    status: null,
    durationMs: Math.round(durationMs),
    passed: false,
    failureCodes: [timeout ? 'request_timeout' : 'transport_error'],
  };
}

export function summarizeObservation(surfaceResults, slowThresholdMs) {
  const probes = surfaceResults.flatMap((surface) => surface.probes);
  const failed = probes.filter((probe) => !probe.passed).length;
  const slow = probes.filter((probe) => probe.passed && probe.durationMs > slowThresholdMs).length;
  return {
    status: failed ? 'FAIL' : slow ? 'PASS_WITH_WARNINGS' : 'PASS',
    surfaces: surfaceResults.length,
    probes: probes.length,
    passed: probes.length - failed,
    failed,
    slow,
    slowThresholdMs,
  };
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value || fallback);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    fail(`Expected an integer from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

async function runProbe(surface, probe, timeoutMs) {
  const started = performance.now();
  try {
    const response = await fetch(`${surface.baseUrl}${probe.path}`, {
      method: probe.method,
      redirect: 'manual',
      cache: 'no-store',
      credentials: 'omit',
      headers: {
        Accept: probe.kind === 'html' ? 'text/html' : 'application/json',
        'User-Agent': 'RepositoryRealms-Public-Observation/1.0',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const result = evaluatePublicProbe({ surface, probe, response, durationMs: performance.now() - started });
    await response.body?.cancel().catch(() => {});
    return result;
  } catch (error) {
    return transportFailure(probe, performance.now() - started, error);
  }
}

async function runSurface(surface, timeoutMs) {
  const probes = [];
  const applicable = applicableProductionProbes(surface);
  for (const probe of applicable) probes.push(await runProbe(surface, probe, timeoutMs));
  return {
    id: surface.id,
    name: surface.name,
    kind: surface.kind,
    baseUrl: surface.baseUrl,
    status: probes.every((probe) => probe.passed) ? 'PASS' : 'FAIL',
    probes,
  };
}

function stamp() {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function outputPath() {
  if (process.env.PRODUCTION_OBSERVATION_OUTPUT) return path.resolve(process.env.PRODUCTION_OBSERVATION_OUTPUT);
  return path.join(root, 'qa', 'production-observation', 'runs', `${stamp()}.json`);
}

function printPlan() {
  console.log('RepositoryRealms 30-day public observation plan');
  console.log(`Surfaces: ${PRODUCTION_SURFACES.map((surface) => surface.id).join(', ')}`);
  console.log(`Probe catalog: ${PUBLIC_PROBES.map((probe) => `${probe.method} ${probe.path}${probe.surfaceKinds ? ` [${probe.surfaceKinds.join('|')}]` : ''}`).join(', ')}`);
  console.log('Policy: no credential, cookie, request body, response body, mutation, database access or deployment.');
  console.log(`Run confirmation: PRODUCTION_OBSERVATION_CONFIRM=${RUN_CONFIRMATION}`);
}

async function run() {
  if (process.env.PRODUCTION_OBSERVATION_CONFIRM !== RUN_CONFIRMATION) {
    fail(`Run requires PRODUCTION_OBSERVATION_CONFIRM=${RUN_CONFIRMATION}.`);
  }
  const timeoutMs = boundedInteger(process.env.PRODUCTION_OBSERVATION_TIMEOUT_MS, 10_000, 1_000, 20_000);
  const slowThresholdMs = boundedInteger(process.env.PRODUCTION_OBSERVATION_SLOW_MS, 3_000, 250, 20_000);
  const surfaces = [];
  for (const surface of PRODUCTION_SURFACES) surfaces.push(await runSurface(surface, timeoutMs));
  const summary = summarizeObservation(surfaces, slowThresholdMs);
  const artifact = {
    format: PRODUCTION_OBSERVATION_FORMAT,
    catalogVersion: 2,
    observedAt: new Date().toISOString(),
    scope: 'public-read-only',
    releaseGate: 'informational; does not unlock backup or migration HOLD',
    invariants: [
      'GET requests only',
      'no credentials or cookies',
      'no request or response bodies persisted',
      'ERP and Realm protected routes redirect to same-origin login',
      'Realm entity APIs and CEO APIs fail closed without authentication',
    ],
    summary,
    surfaces,
  };
  const output = outputPath();
  fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
  fs.writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  for (const surface of surfaces) {
    const failures = surface.probes.filter((probe) => !probe.passed);
    const maximum = Math.max(...surface.probes.map((probe) => probe.durationMs));
    console.log(`${surface.status} ${surface.name}: ${surface.probes.length - failures.length}/${surface.probes.length} probes, max ${maximum}ms.`);
    for (const probe of failures) console.log(`  ${probe.probeId}: ${probe.failureCodes.join(', ')} (status ${probe.status ?? 'transport'}).`);
  }
  console.log(`Evidence: ${output}`);
  console.log(`Summary: ${summary.status}, ${summary.passed}/${summary.probes} passed, ${summary.slow} slow.`);
  if (summary.failed) process.exitCode = 1;
}

async function main() {
  if (!['plan', 'run'].includes(command)) fail('Use plan or run.');
  printPlan();
  if (command === 'run') await run();
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  main().catch((error) => {
    console.error(`[production-observation] ${String(error?.message || error).trim()}`);
    process.exitCode = 1;
  });
}
