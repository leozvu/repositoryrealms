import { CEO_CONTRACT_VERSION, CEO_DOMAIN_ORDER, CEO_SCHEMA_VERSION } from './ceo-entity-contract.js';

export const CEO_REGISTRY_VERSION = 1;
export const CEO_REGISTRY_STATUSES = Object.freeze(['unverified', 'ready', 'degraded', 'unreachable', 'disabled']);
export const CEO_REGISTRY_CIRCUIT_STATES = Object.freeze(['closed', 'open', 'half_open']);
export const CEO_REGISTRY_ENVIRONMENTS = Object.freeze(['production', 'staging', 'development']);
export const CEO_REGISTRY_PROFILES = Object.freeze(['agency', 'entity-specific', 'livestream', 'export']);
export const CEO_REGISTRY_FAILURE_THRESHOLD = 3;
export const CEO_REGISTRY_BASE_COOLDOWN_MS = 5 * 60_000;
export const CEO_REGISTRY_MAX_COOLDOWN_MS = 60 * 60_000;

export const CEO_ENTITY_REGISTRY_SEED = Object.freeze([
  {
    id: 'aim', displayName: 'AIm Agency', baseUrl: 'https://agency-erp-mu.vercel.app',
    businessProfile: 'agency', capabilities: ['finance', 'crm', 'delivery', 'support', 'people'],
    environment: 'production', credentialRef: 'CEO_ENTITY_AIM_API_KEY',
  },
  {
    id: 'egoric', displayName: 'Egoric Agency', baseUrl: 'https://erp-egoric.vercel.app',
    businessProfile: 'agency', capabilities: ['finance', 'crm', 'delivery', 'support', 'people'],
    environment: 'production', credentialRef: 'CEO_ENTITY_EGORIC_API_KEY',
  },
  {
    id: 'vnecom', displayName: 'Vnecom LLC', baseUrl: 'https://erp-vnecom.vercel.app',
    businessProfile: 'entity-specific', capabilities: ['finance', 'crm', 'delivery', 'support', 'people'],
    environment: 'production', credentialRef: 'CEO_ENTITY_VNECOM_API_KEY',
  },
  {
    id: 'egolive', displayName: 'Egolive', baseUrl: 'https://erp-egolive.vercel.app',
    businessProfile: 'livestream', capabilities: ['finance', 'delivery', 'people', 'livestream'],
    environment: 'production', credentialRef: 'CEO_ENTITY_EGOLIVE_API_KEY',
  },
]);

export class CeoRegistryError extends Error {
  constructor(message, status = 400, code = 'ceo_registry_invalid') {
    super(message);
    this.name = 'CeoRegistryError';
    this.status = status;
    this.code = code;
  }
}

function boundedString(value, field, min, max) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  if (normalized.length < min || normalized.length > max) {
    throw new CeoRegistryError(`${field} is invalid.`, 400, `ceo_registry_${field}_invalid`);
  }
  return normalized;
}

function integer(value, field) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new CeoRegistryError(`${field} is invalid.`, 400, `ceo_registry_${field}_invalid`);
  }
  return parsed;
}

function enumValue(value, allowed, field) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!allowed.includes(normalized)) {
    throw new CeoRegistryError(`${field} is invalid.`, 400, `ceo_registry_${field}_invalid`);
  }
  return normalized;
}

function capabilities(value) {
  if (!Array.isArray(value)) {
    throw new CeoRegistryError('capabilities must be an array.', 400, 'ceo_registry_capabilities_invalid');
  }
  const requested = new Set(value.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean));
  const unknown = [...requested].filter((domain) => !CEO_DOMAIN_ORDER.includes(domain));
  if (unknown.length) {
    throw new CeoRegistryError('Unknown CEO capability.', 400, 'ceo_registry_capability_unknown');
  }
  return CEO_DOMAIN_ORDER.filter((domain) => requested.has(domain));
}

export function normalizeCeoRegistryBaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch {
    throw new CeoRegistryError('baseUrl is invalid.', 400, 'ceo_registry_base_url_invalid');
  }
  if (
    parsed.protocol !== 'https:' || parsed.username || parsed.password
    || parsed.pathname !== '/' || parsed.search || parsed.hash
  ) {
    throw new CeoRegistryError('baseUrl must be an HTTPS origin.', 400, 'ceo_registry_base_url_invalid');
  }
  return parsed.origin;
}

export function normalizeCeoCredentialRef(value) {
  const normalized = String(value || '').trim();
  if (!/^CEO_ENTITY_[A-Z0-9_]+_API_KEY$/.test(normalized) || normalized.length > 96) {
    throw new CeoRegistryError(
      'credentialRef must name a dedicated CEO entity API key environment variable.',
      400,
      'ceo_registry_credential_ref_invalid',
    );
  }
  return normalized;
}

export function normalizeCeoRegistryEntityId(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,31}$/.test(normalized)) {
    throw new CeoRegistryError('Entity ID is invalid.', 400, 'ceo_registry_entity_id_invalid');
  }
  return normalized;
}

export function normalizeCeoRegistryUpdate(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new CeoRegistryError('Registry update is invalid.', 400, 'ceo_registry_update_invalid');
  }
  const allowedFields = new Set(['expectedVersion', 'displayName', 'baseUrl', 'businessProfile', 'environment', 'capabilities', 'enabled']);
  if (Object.keys(input).some((field) => !allowedFields.has(field))) {
    throw new CeoRegistryError('Registry update contains an unsupported field.', 400, 'ceo_registry_update_field_unsupported');
  }
  const expectedVersion = integer(input.expectedVersion, 'expected_version');
  const data = {};
  if (Object.hasOwn(input, 'displayName')) data.displayName = boundedString(input.displayName, 'display_name', 2, 80);
  if (Object.hasOwn(input, 'baseUrl')) data.baseUrl = normalizeCeoRegistryBaseUrl(input.baseUrl);
  if (Object.hasOwn(input, 'businessProfile')) {
    data.businessProfile = enumValue(input.businessProfile, CEO_REGISTRY_PROFILES, 'business_profile');
  }
  if (Object.hasOwn(input, 'environment')) {
    data.environment = enumValue(input.environment, CEO_REGISTRY_ENVIRONMENTS, 'environment');
  }
  if (Object.hasOwn(input, 'capabilities')) data.capabilities = capabilities(input.capabilities);
  if (Object.hasOwn(input, 'enabled')) data.enabled = Boolean(input.enabled);
  if (!Object.keys(data).length) {
    throw new CeoRegistryError('No supported registry field was supplied.', 400, 'ceo_registry_update_empty');
  }
  return { expectedVersion, data };
}

export function normalizeCeoCredentialRotation(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new CeoRegistryError('Credential rotation is invalid.', 400, 'ceo_registry_rotation_invalid');
  }
  return {
    expectedVersion: integer(input.expectedVersion, 'expected_version'),
    credentialRef: normalizeCeoCredentialRef(input.credentialRef),
  };
}

export function parseCeoRegistryCapabilities(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return capabilities(parsed);
  } catch (error) {
    if (error instanceof CeoRegistryError) return [];
    return [];
  }
}

export function sanitizeCeoSyncErrorCode(value) {
  const normalized = String(value || 'unknown').trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, '_').slice(0, 64);
  return normalized || 'unknown';
}

export function ceoCircuitAvailability(row, now = new Date()) {
  if (!row?.enabled) return { allowed: false, mode: 'blocked', code: 'ceo_registry_entity_disabled' };
  const state = CEO_REGISTRY_CIRCUIT_STATES.includes(row.circuitState) ? row.circuitState : 'open';
  if (state === 'closed') return { allowed: true, mode: 'normal', code: null };
  const retryAt = row.circuitRetryAt ? new Date(row.circuitRetryAt) : null;
  if (state === 'open' && (!retryAt || retryAt > now)) {
    return { allowed: false, mode: 'blocked', code: 'ceo_registry_circuit_open', retryAt };
  }
  return { allowed: true, mode: 'probe', code: null, retryAt };
}

export function planCeoRegistryFailure(row, {
  now = new Date(),
  threshold = CEO_REGISTRY_FAILURE_THRESHOLD,
  baseCooldownMs = CEO_REGISTRY_BASE_COOLDOWN_MS,
  maxCooldownMs = CEO_REGISTRY_MAX_COOLDOWN_MS,
  errorCode = 'unknown',
} = {}) {
  const consecutiveErrors = Math.max(0, Number(row?.consecutiveErrors || 0)) + 1;
  const open = row?.circuitState === 'half_open' || consecutiveErrors >= threshold;
  const exponent = Math.max(0, consecutiveErrors - threshold);
  const cooldownMs = Math.min(maxCooldownMs, baseCooldownMs * (2 ** exponent));
  return {
    lastSyncAttemptAt: now,
    consecutiveErrors,
    lastErrorCode: sanitizeCeoSyncErrorCode(errorCode),
    status: open ? 'unreachable' : 'degraded',
    circuitState: open ? 'open' : 'closed',
    circuitOpenedAt: open ? now : null,
    circuitRetryAt: open ? new Date(now.getTime() + cooldownMs) : null,
  };
}

export function serializeCeoRegistryEntity(row, { secretResolver = (name) => process.env[name] } = {}) {
  const credentialConfigured = Boolean(row?.credentialRef && secretResolver(row.credentialRef));
  return {
    registryVersion: CEO_REGISTRY_VERSION,
    id: row.id,
    displayName: row.displayName,
    baseUrl: row.baseUrl,
    businessProfile: row.businessProfile,
    capabilities: parseCeoRegistryCapabilities(row.capabilities),
    environment: row.environment,
    enabled: Boolean(row.enabled),
    status: CEO_REGISTRY_STATUSES.includes(row.status) ? row.status : 'unverified',
    contractVersion: row.contractVersion || CEO_CONTRACT_VERSION,
    schemaVersion: Number(row.schemaVersion || CEO_SCHEMA_VERSION),
    recordVersion: Number(row.recordVersion || 1),
    credential: {
      configured: credentialConfigured,
      version: Number(row.credentialVersion || 1),
      rotatedAt: row.rotatedAt || null,
    },
    sync: {
      lastAttemptAt: row.lastSyncAttemptAt || null,
      lastSuccessfulAt: row.lastSuccessfulSyncAt || null,
      consecutiveErrors: Math.max(0, Number(row.consecutiveErrors || 0)),
      lastErrorCode: row.lastErrorCode || null,
      circuitState: CEO_REGISTRY_CIRCUIT_STATES.includes(row.circuitState) ? row.circuitState : 'open',
      circuitOpenedAt: row.circuitOpenedAt || null,
      circuitRetryAt: row.circuitRetryAt || null,
    },
  };
}
