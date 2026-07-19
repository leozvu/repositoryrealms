import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRealmGuildDemoDashboard,
  mergeRealmGuildPresence,
  serializeRealmGuildDashboard,
} from '../lib/realm-guild.js';

const MEMBERS = [
  { id: 'minh-quan', name: 'Minh Quân', role: 'Quest Master', status: 'available', color: '#4f9f73' },
  { id: 'nghia-nguyen', name: 'Nghĩa Nguyễn', role: 'Arcane Engineer', status: 'focus', color: '#946fc7' },
];
const QUESTS = [
  { id: 'q-1', owner: 'Minh Quân', project: 'Campaign Rồng Xanh', status: 'ready', progress: 4, total: 4, due: 'Hôm nay' },
  { id: 'q-2', owner: 'Nghĩa Nguyễn', project: 'Website Egoric', status: 'active', progress: 2, total: 5, due: 'Ngày mai' },
];
const CAMPAIGNS = [
  { name: 'Campaign Rồng Xanh', owner: 'Minh Quân', progress: 78, health: 'Ổn định' },
  { name: 'Website Nhà Giả Kim', owner: 'Nghĩa Nguyễn', progress: 46, health: 'Cần chú ý' },
];

test('Guild demo tổng hợp roster, Quest và campaign nhưng không bật ranking', () => {
  const dashboard = createRealmGuildDemoDashboard({ members: MEMBERS, quests: QUESTS, campaigns: CAMPAIGNS });
  assert.equal(dashboard.source, 'local');
  assert.equal(dashboard.guild.name, 'Egoric Adventurers Guild');
  assert.equal(dashboard.metrics.members, 2);
  assert.equal(dashboard.metrics.present, 2);
  assert.equal(dashboard.metrics.openQuests, 2);
  assert.equal(dashboard.metrics.readyQuests, 1);
  assert.equal(dashboard.metrics.completionPercent, 62);
  assert.equal(dashboard.members[0].isLead, true);
  assert.equal(dashboard.permissions.performanceRanking, false);
  assert.equal(dashboard.permissions.readOnly, true);
});

test('Presence realtime chỉ phủ trạng thái client và không thay đổi dữ liệu campaign', () => {
  const dashboard = createRealmGuildDemoDashboard({ members: MEMBERS, quests: QUESTS, campaigns: CAMPAIGNS });
  const merged = mergeRealmGuildPresence(dashboard, [{ id: 'nghia-nguyen', name: 'Nghĩa Nguyễn', status: 'dnd', statusText: 'Đang review riêng', color: '#aabbcc' }]);
  const member = merged.members.find((item) => item.id === 'nghia-nguyen');
  assert.equal(member.presence, 'dnd');
  assert.equal(member.statusText, 'Đang review riêng');
  assert.equal(member.color, '#aabbcc');
  assert.deepEqual(merged.campaigns, dashboard.campaigns);
});

test('ERP Guild snapshot suy ra scope, reward sẵn sàng và sức khỏe project từ dữ liệu hiện hữu', () => {
  const members = [
    { id: 'lead-1', name: 'Minh Quân', title: 'Delivery Lead', realmProfile: { realmClass: 'Guild Master', color: '#336655' } },
    { id: 'staff-1', name: 'Mai Anh', title: 'Designer', realmProfile: null },
  ];
  const tasks = [
    {
      id: 'task-overdue', title: 'Landing page', status: 'doing', dueDate: '2026-07-16', assigneeId: 'staff-1',
      project: { id: 'project-1', name: 'Rồng Xanh', status: 'active', progress: 50 }, realmQuest: null,
    },
    {
      id: 'task-ready', title: 'QA', status: 'done', dueDate: '2026-07-18', assigneeId: 'staff-1',
      project: { id: 'project-1', name: 'Rồng Xanh', status: 'active', progress: 50 }, realmQuest: { active: true, approvedAt: new Date('2026-07-10') },
    },
    {
      id: 'task-paid', title: 'Release', status: 'done', dueDate: '2026-07-17', assigneeId: 'lead-1',
      project: { id: 'project-1', name: 'Rồng Xanh', status: 'active', progress: 50 }, realmQuest: { active: true, approvedAt: new Date('2026-07-10') },
    },
  ];
  const dashboard = serializeRealmGuildDashboard({
    team: { id: 'delivery', name: 'Delivery Guild', leadId: 'lead-1' },
    members,
    tasks,
    rewardedSourceIds: new Set(['task-paid']),
    now: new Date('2026-07-17T12:00:00.000Z'),
  });
  assert.equal(dashboard.source, 'erp');
  assert.equal(dashboard.permissions.scope, 'team');
  assert.equal(dashboard.guild.lead.name, 'Minh Quân');
  assert.equal(dashboard.metrics.readyQuests, 1);
  assert.equal(dashboard.campaigns[0].health, 'critical');
  assert.equal(dashboard.campaigns[0].overdueTasks, 1);
  assert.equal(dashboard.campaigns[0].progress, 50);
  assert.equal(dashboard.members.find((item) => item.id === 'staff-1').presence, 'unknown');
});
