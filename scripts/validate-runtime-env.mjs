import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const REQUIRED_KEYS = ['DATABASE_URL', 'DIRECT_URL', 'NEXTAUTH_SECRET', 'NEXTAUTH_URL'];
const PLACEHOLDER_PATTERN = /(thay-bang|change-me|user:pass|example|placeholder)/i;

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function validateRuntimeEnv(env = process.env) {
  const errors = [];
  for (const key of REQUIRED_KEYS) {
    if (!String(env[key] || '').trim()) errors.push(`${key} is required`);
  }

  for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
    const value = String(env[key] || '').trim();
    if (value && !/^postgres(?:ql)?:\/\//i.test(value)) {
      errors.push(`${key} must use postgresql:// or postgres://`);
    }
    if (value && PLACEHOLDER_PATTERN.test(value)) errors.push(`${key} still contains a placeholder`);
  }

  const secret = String(env.NEXTAUTH_SECRET || '');
  if (secret && (secret.length < 32 || PLACEHOLDER_PATTERN.test(secret))) {
    errors.push('NEXTAUTH_SECRET must be a non-placeholder secret of at least 32 characters');
  }

  const publicUrl = parseUrl(String(env.NEXTAUTH_URL || ''));
  if (env.NEXTAUTH_URL && (!publicUrl || !['http:', 'https:'].includes(publicUrl.protocol))) {
    errors.push('NEXTAUTH_URL must be a valid http(s) URL');
  }
  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (env.NODE_ENV === 'production' && publicUrl && !localHosts.has(publicUrl.hostname) && publicUrl.protocol !== 'https:') {
    errors.push('NEXTAUTH_URL must use HTTPS outside localhost in production');
  }

  return errors;
}

function run() {
  const errors = validateRuntimeEnv();
  if (errors.length) {
    console.error('Runtime configuration is invalid:');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log('Runtime configuration is valid.');
}

const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === entryUrl) run();
