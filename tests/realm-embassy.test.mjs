import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealmEmbassyDashboard, createRealmEmbassyDemoDashboard } from '../lib/realm-embassy.js';

test('Royal Embassy demo tổng hợp pipeline và client portfolio nhưng không ranking', () => {
  const dashboard = createRealmEmbassyDemoDashboard();
  assert.equal(dashboard.source, 'local');
  assert.equal(dashboard.metrics.openLeads, 4);
  assert.equal(dashboard.metrics.openValue, 735_000_000);
  assert.equal(dashboard.metrics.weightedForecast, 297_000_000);
  assert.equal(dashboard.metrics.overdueLeads, 1);
  assert.equal(dashboard.metrics.unassignedLeads, 2);
  assert.equal(dashboard.metrics.undatedLeads, 1);
  assert.equal(dashboard.metrics.winRate, 50);
  assert.equal(dashboard.stages.length, 6);
  assert.equal(dashboard.clients.length, 3);
  assert.equal(dashboard.permissions.contactDetails, false);
  assert.equal(dashboard.permissions.performanceRanking, false);
});

test('Lead quá ngày, chưa gán và forecast được suy ra từ stage chuẩn', () => {
  const dashboard = createRealmEmbassyDashboard({
    source: 'erp',
    leads: [
      { id: 'lead-1', name: 'Lan', company: 'Lumen', value: 100_000_000, stage: 'proposal', ownerId: 'am-1', expectedClose: '2026-07-16', email: 'must-not-leak@example.com' },
      { id: 'lead-2', name: 'Minh', company: 'North', value: 50_000_000, stage: 'contacted', ownerId: null, expectedClose: null },
    ],
    owners: new Map([['am-1', { id: 'am-1', name: 'Quang Võ' }]]),
    now: new Date('2026-07-17T12:00:00.000Z'),
    permissions: { scope: 'portfolio' },
  });
  assert.equal(dashboard.metrics.weightedForecast, 50_000_000);
  assert.equal(dashboard.metrics.overdueLeads, 1);
  assert.equal(dashboard.metrics.unassignedLeads, 1);
  const proposal = dashboard.stages.find((stage) => stage.id === 'proposal').leads[0];
  assert.equal(proposal.owner.name, 'Quang Võ');
  assert.equal(proposal.overdue, true);
  assert.equal('email' in proposal, false);
});

test('Client registry chỉ trả nhịp Project, không trả contact details', () => {
  const dashboard = createRealmEmbassyDashboard({
    clients: [{
      id: 'client-1', name: 'Green Dragon', industry: 'F&B', email: 'hidden@example.com', phone: '000',
      projects: [
        { id: 'project-1', status: 'active', progress: 60, deadline: '2026-07-20' },
        { id: 'project-2', status: 'done', progress: 100, deadline: '2026-07-10' },
      ],
    }],
    now: new Date('2026-07-17T12:00:00.000Z'),
  });
  assert.deepEqual(dashboard.clients[0], {
    id: 'client-1', name: 'Green Dragon', industry: 'F&B', projectCount: 2,
    activeProjects: 1, averageProgress: 60, nextDeadline: '2026-07-20',
  });
});

test('Stage lạ được hạ an toàn về Tân thư', () => {
  const dashboard = createRealmEmbassyDashboard({ leads: [{ id: 'lead-1', name: 'Unknown', stage: 'hacked', value: -1 }] });
  const lead = dashboard.stages.find((stage) => stage.id === 'new').leads[0];
  assert.equal(lead.stage, 'new');
  assert.equal(lead.value, 0);
});
