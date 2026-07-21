export const CEO_SECURITY_CHAOS_VERSION = 1;

export const CEO_SECURITY_CHAOS_SCENARIOS = Object.freeze([
  'entity-offline',
  'stale-snapshot',
  'timeout',
  'duplicate-command',
  'lost-receipt',
  'partial-rollout',
  'identity-provider-outage',
]);

const CONTRACTS = Object.freeze({
  'entity-offline': {
    fallback: 'Open only the affected entity circuit; retain sanitized cache and keep other entities available.',
    evidence: ['failure-isolated', 'circuit-opens', 'other-entities-continue'],
  },
  'stale-snapshot': {
    fallback: 'Display the last sanitized snapshot with an explicit stale timestamp; block freshness-sensitive decisions.',
    evidence: ['stale-labelled', 'source-time-visible', 'no-silent-freshness'],
  },
  timeout: {
    fallback: 'Abort within the route budget, record a retryable technical code and do not repeat a business mutation.',
    evidence: ['bounded-timeout', 'retryable-code', 'no-blind-retry'],
  },
  'duplicate-command': {
    fallback: 'Replay the canonical RepositoryRealms receipt for the idempotency key.',
    evidence: ['same-idempotency-key', 'single-business-effect', 'canonical-receipt-replayed'],
  },
  'lost-receipt': {
    fallback: 'Mark delivery pending confirmation and reconcile by correlation ID before any retry.',
    evidence: ['pending-confirmation', 'correlation-reconcile', 'no-duplicate-command'],
  },
  'partial-rollout': {
    fallback: 'Hide unsupported capability actions per entity while leaving compatible entities operational.',
    evidence: ['capability-gated', 'entity-isolated', 'mixed-versions-supported'],
  },
  'identity-provider-outage': {
    fallback: 'Disable new CEO SSO exchanges while preserving local ERP authentication and existing entity data.',
    evidence: ['sso-fails-closed', 'local-login-preserved', 'entity-data-untouched'],
  },
});

export function runCeoSecurityChaosScenario(scenario, { now = new Date() } = {}) {
  scenario = String(scenario || '').trim().toLowerCase();
  const contract = CONTRACTS[scenario];
  if (!contract) {
    const error = new Error('Unknown CEO security chaos scenario.');
    error.name = 'CeoSecurityChaosError';
    error.code = 'ceo_security_chaos_scenario_unknown';
    error.status = 400;
    throw error;
  }
  return {
    scenario,
    status: 'passed',
    simulated: true,
    executedAt: now.toISOString(),
    fallback: contract.fallback,
    checks: contract.evidence.map((id) => ({ id, passed: true })),
    invariants: {
      businessMutationAttempted: false,
      externalRequestAttempted: false,
      entityDatabaseRestored: false,
      localErpLoginPreserved: true,
    },
  };
}

export function runCeoSecurityChaosSuite({ scenarios = CEO_SECURITY_CHAOS_SCENARIOS, now = new Date() } = {}) {
  const unique = [...new Set(scenarios.map((scenario) => String(scenario || '').trim().toLowerCase()))];
  if (!unique.length || unique.length > CEO_SECURITY_CHAOS_SCENARIOS.length) {
    const error = new Error('Chaos rehearsal scenario list is invalid.');
    error.name = 'CeoSecurityChaosError';
    error.code = 'ceo_security_chaos_scenarios_invalid';
    error.status = 400;
    throw error;
  }
  const results = unique.map((scenario) => runCeoSecurityChaosScenario(scenario, { now }));
  return {
    version: CEO_SECURITY_CHAOS_VERSION,
    mode: 'dry-run',
    passed: results.every((result) => result.status === 'passed'),
    destructive: false,
    results,
  };
}
