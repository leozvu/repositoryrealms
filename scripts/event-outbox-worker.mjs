#!/usr/bin/env node
// Explicit operator process; watch is opt-in and never installs a scheduler.
import { outboxErrorCode, retryDeadOutboxJob, runOutboxBatch } from '../lib/event-outbox.js';
import { parseOutboxArgs, watchOutbox } from '../lib/event-outbox-watch.js';

let prisma;
const controller = new AbortController();
const stop = () => controller.abort();
const onMessage = message => { if (message?.type === 'outbox:shutdown') stop(); };
try {
  const options = parseOutboxArgs(process.argv.slice(2));
  if (options.command === 'help') {
    console.log('Outbox: node scripts/event-outbox-worker.mjs status | run [--limit 100] | watch [--limit 100] [--poll-ms 1000] | retry --id <dead-job-id>');
  } else {
    ({ prisma } = await import('../lib/prisma.js'));
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    process.on('message', onMessage);
    if (process.connected) process.once('disconnect', stop);
    if (options.command === 'status') {
      const counts = await prisma.eventOutbox.groupBy({ by: ['status', 'kind'], _count: { _all: true } });
      const dead = await prisma.eventOutbox.findMany({ where: { status: 'dead' }, select: { id: true, resource: true, event: true, kind: true, attempts: true, lastErrorCode: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 20 });
      console.log(JSON.stringify({ counts, dead }, null, 2));
    } else if (options.command === 'retry') {
      console.log(JSON.stringify(await retryDeadOutboxJob(prisma, options.id)));
    } else {
      const { processDurableEvent, sendDurableWebhook } = await import('../lib/events.js');
      const handlers = { processLocal: processDurableEvent, sendWebhook: (payload, job) => sendDurableWebhook(prisma, payload, job) };
      if (options.command === 'watch') await watchOutbox(prisma, handlers, { ...options, signal: controller.signal });
      else {
        const results = await runOutboxBatch(prisma, handlers, { limit: options.limit, signal: controller.signal });
        console.log(JSON.stringify({ processed: results.length, results }, null, 2));
        if (results.some(row => row.status === 'dead')) process.exitCode = 2;
      }
    }
  }
} catch (error) {
  console.error(outboxErrorCode(error));
  process.exitCode = 1;
} finally {
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
  process.removeListener('message', onMessage);
  process.removeListener('disconnect', stop);
  if (prisma) await prisma.$disconnect();
  if (process.connected) process.disconnect();
}
