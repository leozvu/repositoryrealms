export const SERVERLESS_CONNECTION_LIMIT = 1;
export const SERVERLESS_POOL_TIMEOUT_SECONDS = 15;

export function isServerlessRuntime(env = process.env) {
  return env.VERCEL === '1' || Boolean(env.VERCEL_ENV || env.AWS_LAMBDA_FUNCTION_NAME);
}

export function runtimeDatabaseUrl(value, env = process.env) {
  const raw = String(value || '').trim();
  if (!raw || !isServerlessRuntime(env)) return raw;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) return raw;

  // Every Vercel route can run in an independent lambda. Prisma's default pool
  // multiplied by those functions can exhaust Neon/Postgres even with modest
  // traffic. Keep one connection per warm runtime and let the external pooler
  // multiplex it; schema, SSL and provider-specific parameters are preserved.
  url.searchParams.set('connection_limit', String(SERVERLESS_CONNECTION_LIMIT));
  if (!url.searchParams.has('pool_timeout')) {
    url.searchParams.set('pool_timeout', String(SERVERLESS_POOL_TIMEOUT_SECONDS));
  }
  return url.toString();
}
