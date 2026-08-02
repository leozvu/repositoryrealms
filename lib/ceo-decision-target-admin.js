import { loadCeoCapabilities } from './ceo-entity-admin.js';
import { buildLocalCeoDecisionFeed } from './ceo-decision-queue.js';

export async function loadLocalCeoDecisionFeed(db, now = new Date()) {
  const [capabilities, approvals] = await Promise.all([
    loadCeoCapabilities(db, now),
    db.approval.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: {
        id: true, type: true, title: true, amount: true,
        requesterName: true, steps: true, status: true, createdAt: true,
      },
    }),
  ]);
  return buildLocalCeoDecisionFeed({
    entity: capabilities.entity,
    currency: capabilities.currency,
    approvals,
    asOf: now,
  });
}
