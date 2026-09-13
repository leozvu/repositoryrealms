import { RESOURCES, canRead } from './registry.js';
import { isFreelancer } from './perm.js';
import { readCollection, CollectionQueryError } from './collection-query.js';

export const BOARD_STAGES = ['new', 'contacted', 'proposal', 'negotiation', 'won', 'lost'];
export const LEAD_BOARD_PAGE_SIZE = 25;
const DEFAULT_PROB = { new: 10, contacted: 20, proposal: 40, negotiation: 60 };

export function assertLeadBoardAccess(user) {
  if (!user?.id) throw new CollectionQueryError('Bạn cần đăng nhập ERP.', 'unauthorized', 401);
  if (isFreelancer(user) || !canRead('leads', user)) throw new CollectionQueryError('Bạn không có quyền xem Lead.', 'forbidden', 403);
}

export function forecastMonths(now = new Date()) {
  // Set day to one before changing month: January 31 must not skip February.
  return Array.from({ length: 3 }, (_, offset) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    return date.toISOString().slice(0, 7);
  });
}

function settingsOf(row) {
  let value;
  try { value = JSON.parse(row?.json || '{}'); } catch { value = {}; }
  const probability = Object.fromEntries(Object.entries(DEFAULT_PROB).map(([stage, fallback]) => {
    const configured = value?.[`prob${stage[0].toUpperCase()}${stage.slice(1)}`];
    return [stage, typeof configured === 'number' && Number.isFinite(configured) ? Math.max(0, Math.min(100, configured)) : fallback];
  }));
  return { probability, target: Number.isFinite(value?.monthlyTarget) ? value.monthlyTarget : 0 };
}

export function summarizeLeadGroups(stageGroups, campaignGroups, monthGroups, noDateCount, settings, months) {
  const stages = Object.fromEntries(BOARD_STAGES.map(stage => [stage, { count: 0, value: 0 }]));
  for (const group of stageGroups) stages[group.stage] = { count: group._count._all, value: group._sum.value || 0 };
  const open = stageGroups.filter(group => !['won', 'lost'].includes(group.stage));
  const campaigns = new Map();
  for (const group of campaignGroups) {
    const key = group.campaign || '(không gắn chiến dịch)';
    const item = campaigns.get(key) || { key, total: 0, won: 0, wonValue: 0, openValue: 0 };
    item.total += group._count._all;
    if (group.stage === 'won') { item.won += group._count._all; item.wonValue += group._sum.value || 0; }
    else if (group.stage !== 'lost') item.openValue += group._sum.value || 0;
    campaigns.set(key, item);
  }
  return {
    stages, total: stageGroups.reduce((sum, group) => sum + group._count._all, 0),
    openCount: open.reduce((sum, group) => sum + group._count._all, 0),
    openValue: open.reduce((sum, group) => sum + (group._sum.value || 0), 0),
    noDateCount, ...settings, months,
    forecast: monthGroups.map(groups => Math.round(groups.reduce((sum, group) => sum + (group._sum.value || 0) * (settings.probability[group.stage] || 0) / 100, 0))),
    hasCampaigns: campaignGroups.some(group => !!group.campaign),
    campaigns: [...campaigns.values()].sort((a, b) => b.wonValue - a.wonValue || b.total - a.total || a.key.localeCompare(b.key)).slice(0, 10),
  };
}

export async function readLeadBoard(db, user, params = new URLSearchParams(), now = new Date()) {
  assertLeadBoardAccess(user);
  for (const key of params.keys()) {
    if (!BOARD_STAGES.some(stage => key === `${stage}Cursor`) || params.getAll(key).length !== 1) {
      throw new CollectionQueryError('Tham số bảng Lead không hợp lệ.');
    }
  }
  const cfg = RESOURCES.leads, scope = await cfg.scope(user, db), months = forecastMonths(now);
  const run = async tx => {
    const columns = {};
    for (const stage of BOARD_STAGES) {
      const query = new URLSearchParams({ stage, pageSize: String(LEAD_BOARD_PAGE_SIZE) });
      if (params.has(`${stage}Cursor`)) query.set('cursor', params.get(`${stage}Cursor`));
      columns[stage] = await readCollection(tx, { resource: 'leads', cfg, user, params: query });
    }
    const grouping = { where: scope, _count: { _all: true }, _sum: { value: true } };
    const stageGroups = await tx.lead.groupBy({ ...grouping, by: ['stage'] });
    const campaignGroups = await tx.lead.groupBy({ ...grouping, by: ['campaign', 'stage'] });
    const monthGroups = [];
    for (const month of months) {
      monthGroups.push(await tx.lead.groupBy({ ...grouping, by: ['stage'], where: { AND: [scope, { stage: { notIn: ['won', 'lost'] }, expectedClose: { startsWith: month } }] } }));
    }
    const noDateCount = await tx.lead.count({ where: { AND: [scope, { stage: { notIn: ['won', 'lost'] }, OR: [{ expectedClose: null }, { expectedClose: '' }] }] } });
    const setting = await tx.setting.findUnique({ where: { id: 1 }, select: { json: true } });
    return { columns, summary: summarizeLeadGroups(stageGroups, campaignGroups, monthGroups, noDateCount, settingsOf(setting), months), generatedAt: now.toISOString() };
  };
  // Pages and totals describe one database snapshot. A page never determines KPIs.
  return db.$transaction(run, { isolationLevel: 'RepeatableRead', timeout: 15000 });
}
