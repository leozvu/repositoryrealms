import { outboxErrorCode, OutboxError, runOutboxBatch } from './event-outbox.js';

export function parseOutboxArgs(argv) {
  const [command = 'help', ...args] = argv;
  if (!['help', 'status', 'retry', 'run', 'watch'].includes(command)) throw new OutboxError('OUTBOX_INVALID_COMMAND');
  const options = { command, limit: 100, pollMs: 1000 };
  const seen = new Set();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (seen.has(key) || args[i + 1] === undefined) throw new OutboxError('OUTBOX_INVALID_ARGUMENT');
    seen.add(key);
    if (key === '--limit' && ['run', 'watch'].includes(command)) options.limit = Number(args[i + 1]);
    else if (key === '--poll-ms' && command === 'watch') options.pollMs = Number(args[i + 1]);
    else if (key === '--id' && command === 'retry') options.id = args[i + 1];
    else throw new OutboxError('OUTBOX_INVALID_ARGUMENT');
  }
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 1000) throw new OutboxError('OUTBOX_INVALID_LIMIT');
  if (!Number.isInteger(options.pollMs) || options.pollMs < 100 || options.pollMs > 60_000) throw new OutboxError('OUTBOX_INVALID_POLL');
  if (command === 'retry' && !options.id) throw new OutboxError('OUTBOX_INVALID_ID');
  return options;
}

export function waitForOutboxPoll(ms, signal) {
  if (signal?.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', finish); resolve(); };
    const timer = setTimeout(finish, ms);
    signal?.addEventListener('abort', finish, { once: true });
  });
}

/** Foreground opt-in watch: no concurrent batches or scheduler registration.
 * Shutdown stops new claims and drains only the currently claimed job. */
export async function watchOutbox(db, handlers, { signal, limit = 100, pollMs = 1000, logger = console.log, errorLogger = console.error, batch = runOutboxBatch, pause = waitForOutboxPoll } = {}) {
  parseOutboxArgs(['watch', '--limit', String(limit), '--poll-ms', String(pollMs)]);
  while (!signal?.aborted) {
    try {
      const results = await batch(db, handlers, { limit, signal });
      if (results.length) logger(JSON.stringify({ processed: results.length, results }));
    } catch (error) {
      errorLogger(outboxErrorCode(error));
    }
    if (!signal?.aborted) await pause(pollMs, signal);
  }
}
