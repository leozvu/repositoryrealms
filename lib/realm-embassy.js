const STAGES = [
  { id: 'new', label: 'Tân thư', businessLabel: 'Mới', probability: 10, color: '#668eb1' },
  { id: 'contacted', label: 'Đã tiếp kiến', businessLabel: 'Đã liên hệ', probability: 20, color: '#8d78ba' },
  { id: 'proposal', label: 'Gửi chiếu thư', businessLabel: 'Gửi đề xuất', probability: 40, color: '#c49352' },
  { id: 'negotiation', label: 'Nghị sự', businessLabel: 'Thương lượng', probability: 60, color: '#b86880' },
  { id: 'won', label: 'Kết minh ước', businessLabel: 'Thắng', probability: 100, color: '#5f9b76' },
  { id: 'lost', label: 'Khép hồ sơ', businessLabel: 'Thua', probability: 0, color: '#898d8a' },
];

const STAGE_MAP = new Map(STAGES.map((stage) => [stage.id, stage]));
const OPEN_STAGES = new Set(['new', 'contacted', 'proposal', 'negotiation']);

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function safeText(value, fallback = '', max = 160) {
  const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return (text || fallback).slice(0, max);
}

function safeId(value, fallback = 'embassy-record') {
  const id = String(value ?? '').trim();
  return /^[a-zA-Z0-9:_-]{1,100}$/.test(id) ? id : fallback;
}

function dateValue(value) {
  const text = safeText(value, '', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = Date.parse(`${text}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function stageOf(value) {
  const stage = safeText(value, 'new', 30).toLowerCase();
  return STAGE_MAP.has(stage) ? stage : 'new';
}

function normalizeLead(lead, index, owners, nowDay) {
  const stage = stageOf(lead?.stage);
  const expectedClose = dateValue(lead?.expectedClose);
  const open = OPEN_STAGES.has(stage);
  const value = clamp(Math.round(finite(lead?.value, 0)), 0, 1_000_000_000_000_000);
  const owner = lead?.ownerId ? owners.get(String(lead.ownerId)) : null;
  const activities = (Array.isArray(lead?.activities) ? lead.activities : []).slice(0, 3).map((activity, activityIndex) => ({
    id: safeId(activity?.id, `embassy-activity-${index}-${activityIndex}`),
    kind: ['call', 'meeting', 'email', 'note'].includes(safeText(activity?.kind, '').toLowerCase()) ? safeText(activity.kind, '', 20).toLowerCase() : 'note',
    title: safeText(activity?.title, 'Follow-up chưa đặt tên', 160),
    date: dateValue(activity?.date) === null ? null : safeText(activity.date, '', 10),
    done: Boolean(activity?.done),
    author: safeText(activity?.author?.name, 'Thành viên ERP', 80),
  }));
  return {
    id: safeId(lead?.id, `embassy-lead-${index}`),
    name: safeText(lead?.name, 'Sứ giả chưa đặt tên', 100),
    company: safeText(lead?.company, 'Cá nhân / chưa có tổ chức', 120),
    source: safeText(lead?.source, 'Chưa ghi nguồn', 80),
    value,
    stage,
    stageLabel: STAGE_MAP.get(stage).label,
    businessStageLabel: STAGE_MAP.get(stage).businessLabel,
    owner: owner ? { id: safeId(owner.id, `embassy-owner-${index}`), name: safeText(owner.name, 'Chưa rõ phụ trách', 80) } : null,
    expectedClose: expectedClose === null ? null : safeText(lead.expectedClose, '', 10),
    overdue: open && expectedClose !== null && expectedClose < nowDay,
    open,
    weightedValue: open ? Math.round(value * STAGE_MAP.get(stage).probability / 100) : 0,
    activities,
    canTransition: Boolean(lead?.canTransition),
    canFollowUp: Boolean(lead?.canFollowUp),
  };
}

function normalizeClient(client, index, nowDay) {
  const projects = Array.isArray(client?.projects) ? client.projects : [];
  const activeProjects = projects.filter((project) => !['done', 'completed', 'archived', 'cancelled'].includes(safeText(project?.status, '').toLowerCase()));
  const nextDeadline = activeProjects
    .map((project) => dateValue(project?.deadline))
    .filter((date) => date !== null && date >= nowDay)
    .sort((a, b) => a - b)[0];
  const averageProgress = activeProjects.length
    ? Math.round(activeProjects.reduce((sum, project) => sum + clamp(finite(project?.progress, 0), 0, 100), 0) / activeProjects.length)
    : projects.length ? 100 : 0;
  return {
    id: safeId(client?.id, `embassy-client-${index}`),
    name: safeText(client?.name, 'Đối tác chưa đặt tên', 120),
    industry: safeText(client?.industry, 'Chưa phân ngành', 80),
    projectCount: projects.length,
    activeProjects: activeProjects.length,
    averageProgress,
    nextDeadline: nextDeadline ? new Date(nextDeadline).toISOString().slice(0, 10) : null,
  };
}

function focusCopy(metrics) {
  if (metrics.overdueLeads) return `Ưu tiên tiếp kiến lại ${metrics.overdueLeads} cơ hội đã qua ngày dự kiến chốt.`;
  if (metrics.unassignedLeads) return `Phân công sứ giả cho ${metrics.unassignedLeads} cơ hội chưa có người phụ trách.`;
  if (metrics.undatedLeads) return `Bổ sung ngày dự kiến chốt cho ${metrics.undatedLeads} cơ hội để forecast có căn cứ.`;
  if (metrics.openLeads) return `Duy trì nhịp chăm sóc ${metrics.openLeads} cơ hội đang mở.`;
  return 'Pipeline đã khép; chuẩn bị nguồn cơ hội mới cho Royal Embassy.';
}

export function createRealmEmbassyDashboard({
  source = 'local',
  leads = [],
  clients = [],
  owners = new Map(),
  now = new Date(),
  generatedAt = now.toISOString(),
  permissions = {},
} = {}) {
  const nowDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const ownerMap = owners instanceof Map ? owners : new Map(Object.entries(owners || {}));
  const leadRows = leads.map((lead, index) => normalizeLead(lead, index, ownerMap, nowDay));
  const clientRows = clients.map((client, index) => normalizeClient(client, index, nowDay));
  const openRows = leadRows.filter((lead) => lead.open);
  const decided = leadRows.filter((lead) => ['won', 'lost'].includes(lead.stage));
  const won = leadRows.filter((lead) => lead.stage === 'won');
  const metrics = {
    openLeads: openRows.length,
    openValue: openRows.reduce((sum, lead) => sum + lead.value, 0),
    weightedForecast: openRows.reduce((sum, lead) => sum + lead.weightedValue, 0),
    wonValue: won.reduce((sum, lead) => sum + lead.value, 0),
    winRate: decided.length ? Math.round((won.length / decided.length) * 100) : 0,
    overdueLeads: openRows.filter((lead) => lead.overdue).length,
    unassignedLeads: openRows.filter((lead) => !lead.owner).length,
    undatedLeads: openRows.filter((lead) => !lead.expectedClose).length,
    activeClients: clientRows.filter((client) => client.activeProjects > 0).length,
  };
  const stageRows = STAGES.map((stage) => {
    const items = leadRows.filter((lead) => lead.stage === stage.id)
      .sort((a, b) => String(a.expectedClose || '9999').localeCompare(String(b.expectedClose || '9999')) || b.value - a.value);
    return {
      ...stage,
      count: items.length,
      value: items.reduce((sum, lead) => sum + lead.value, 0),
      leads: items,
    };
  });
  return {
    source: source === 'erp' ? 'erp' : 'local',
    generatedAt: safeText(generatedAt, now.toISOString(), 40),
    embassy: {
      id: 'royal-embassy',
      name: 'Royal Embassy',
      charter: 'Biến pipeline CRM thành bản đồ quan hệ rõ ràng; dữ liệu cơ hội không phải điểm xếp hạng nhân sự.',
    },
    metrics,
    stages: stageRows,
    clients: clientRows.sort((a, b) => b.activeProjects - a.activeProjects || a.name.localeCompare(b.name, 'vi')).slice(0, 20),
    focus: focusCopy(metrics),
    permissions: {
      scope: permissions?.scope === 'company' ? 'company' : 'portfolio',
      canTransition: Boolean(permissions?.canTransition),
      canFollowUp: Boolean(permissions?.canFollowUp),
      readOnly: !permissions?.canTransition && !permissions?.canFollowUp,
      contactDetails: false,
      performanceRanking: false,
    },
  };
}

const DEMO_LEADS = [
  { id: 'lead-lumen', name: 'Thu Hà', company: 'Lumen Studio', source: 'Giới thiệu', value: 180_000_000, stage: 'proposal', ownerId: 'quang-vo', expectedClose: '2026-07-24' },
  { id: 'lead-northwind', name: 'Đức Anh', company: 'Northwind Foods', source: 'Hội chợ', value: 320_000_000, stage: 'negotiation', ownerId: 'quang-vo', expectedClose: '2026-07-16' },
  { id: 'lead-aurora', name: 'Ngọc Vy', company: 'Aurora Education', source: 'Website', value: 95_000_000, stage: 'contacted', ownerId: null, expectedClose: '2026-08-05' },
  { id: 'lead-river', name: 'Hoàng Nam', company: 'Riverstone Export', source: 'LinkedIn', value: 140_000_000, stage: 'new', ownerId: null, expectedClose: null },
  { id: 'lead-green', name: 'Minh Trang', company: 'Green Dragon', source: 'Giới thiệu', value: 260_000_000, stage: 'won', ownerId: 'quang-vo', expectedClose: '2026-07-10' },
  { id: 'lead-old', name: 'Gia Bảo', company: 'Old Mill', source: 'Facebook', value: 60_000_000, stage: 'lost', ownerId: 'quang-vo', expectedClose: '2026-06-30' },
];

const DEMO_CLIENTS = [
  { id: 'client-green', name: 'Green Dragon', industry: 'F&B', projects: [{ id: 'project-dragon', name: 'Campaign Rồng Xanh', status: 'active', progress: 78, deadline: '2026-07-19' }] },
  { id: 'client-alchemy', name: 'Nhà Giả Kim', industry: 'Dược mỹ phẩm', projects: [{ id: 'project-alchemy', name: 'Website Nhà Giả Kim', status: 'active', progress: 46, deadline: '2026-07-24' }] },
  { id: 'client-north', name: 'Northern Trade Council', industry: 'Thương mại', projects: [{ id: 'project-north', name: 'Hội chợ phương Bắc', status: 'active', progress: 63, deadline: '2026-07-28' }] },
];

export function createRealmEmbassyDemoDashboard(now = new Date('2026-07-17T12:00:00.000Z')) {
  return createRealmEmbassyDashboard({
    source: 'local',
    leads: DEMO_LEADS,
    clients: DEMO_CLIENTS,
    owners: new Map([['quang-vo', { id: 'quang-vo', name: 'Quang Võ' }]]),
    now,
    generatedAt: now.toISOString(),
    permissions: { scope: 'portfolio' },
  });
}
