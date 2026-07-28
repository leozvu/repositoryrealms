export const REALM_DEFAULT_DEADLINE_MS = 5_000;

export class RealmDependencyError extends Error {
  constructor(message, {
    dependency = 'unknown',
    code = 'realm_dependency_unavailable',
    status = 503,
    retryAfter = 5,
  } = {}) {
    super(message);
    this.name = 'RealmDependencyError';
    this.dependency = dependency;
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
    this.expose = true;
  }
}
export async function withRealmDeadline(operation, {
  dependency = 'database',
  timeoutMs = REALM_DEFAULT_DEADLINE_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  const deadline = Math.max(1, Number(timeoutMs) || REALM_DEFAULT_DEADLINE_MS);
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimer(() => reject(new RealmDependencyError(
          `Realm tạm thời không thể đọc ${dependency}. ERP vẫn tiếp tục hoạt động; hãy thử lại sau.`,
          { dependency, code: `realm_${dependency}_timeout` },
        )), deadline);
      }),
    ]);
  } finally {
    clearTimer(timer);
  }
}
