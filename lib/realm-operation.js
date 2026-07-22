const IDEMPOTENCY_KEY = /^[a-zA-Z0-9:_-]{12,120}$/;

export class RealmOperationError extends Error {
  constructor(message, status = 400, code = 'realm_operation_error') {
    super(message);
    this.name = 'RealmOperationError';
    this.status = status;
    this.code = code;
  }
}

export function normalizeRealmIdempotencyKey(value) {
  const key = String(value || '').trim();
  if (!IDEMPOTENCY_KEY.test(key)) throw new RealmOperationError('Idempotency key không hợp lệ.', 400, 'invalid_idempotency_key');
  return key;
}
