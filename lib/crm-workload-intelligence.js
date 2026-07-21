export const CRM_WORKLOAD_RULE_VERSION = 'crm-workload-intelligence-v1';

const OPEN_STAGES = new Set(['new', 'contacted', 'proposal', 'negotiation']);
const TERMINAL_STAGES = new Set(['won', 'lost']);
const STAGE_PROBABILITY = { new: 10, contacted: 20, proposal: 40, negotiation: 60, won: 100, lost: 0 };
const SEVERITY = { critical: 0, attention: 1, info: 2 };

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function isoDay(value) {
  const text = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return Number.isNaN(Date.parse(`${text}T00:00:00.000Z`)) ? null : text;
}

function daysBetween(from, to) {
  const start = isoDay(from);
  const end = isoDay(to);
  if (!start || !end) return null;
  return Math.floor((Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000);
}

function safeStage(value) {
  const stage = String(value || 'new').trim().toLowerCase();
  return OPEN_STAGES.has(stage) || TERMINAL_STAGES.has(stage) ? stage : 'new';
}

function safePolicy(policy = {}) {
  const probabilities = Object.fromEntries(Object.entries(STAGE_PROBABILITY).map(([stage, fallback]) => [
    stage,
    clamp(policy.stageProbability?.[stage] ?? fallback, 0, 100),
  ]));
  return Object.freeze({
    staleDays: clamp(policy.staleDays ?? 14, 3, 90),
    dormantDays: clamp(policy.dormantDays ?? 30, 7, 180),
    newResponseDays: clamp(policy.newResponseDays ?? 2, 1, 14),
    ownerWipLimit: clamp(policy.ownerWipLimit ?? 20, 1, 200),
    stageProbability: Object.freeze(probabilities),
  });
}

function contactCoverage(lead) {
  const checks = Object.freeze({
    owner: Boolean(lead.ownerId),
    contactChannel: Boolean(String(lead.email || '').trim() || String(lead.phone || '').trim()),
    source: Boolean(String(lead.source || '').trim()),
    expectedClose: Boolean(isoDay(lead.expectedClose)),
  });
  const covered = Object.values(checks).filter(Boolean).length;
  return Object.freeze({
    percent: Math.round((covered / Object.keys(checks).length) * 100),
    checks,
    missing: Object.entries(checks).filter(([, ok]) => !ok).map(([key]) => key),
  });
}

function latestDay(rows) {
  return rows.map((row) => isoDay(row.date)).filter(Boolean).sort().at(-1) || null;
}

function earliestDay(rows) {
  return rows.map((row) => isoDay(row.date)).filter(Boolean).sort()[0] || null;
}

function lifecycleFor({ stage, ageDays, daysSinceTouch, completedTouches, overdueFollowups, policy }) {
  if (TERMINAL_STAGES.has(stage)) return stage === 'won'
    ? { band: 'decided', label: 'Đã thắng', reason: 'Lead đã kết thúc ở stage won.' }
    : { band: 'decided', label: 'Đã mất', reason: 'Lead đã kết thúc ở stage lost.' };
  if (daysSinceTouch != null && daysSinceTouch > policy.dormantDays) {
    return { band: 'dormant', label: 'Dormant', reason: `${daysSinceTouch} ngày chưa có completed CRM activity.` };
  }
  if (overdueFollowups > 0) return { band: 'stale', label: 'Stale', reason: `${overdueFollowups} follow-up đã quá hạn.` };
  if (daysSinceTouch != null && daysSinceTouch > policy.staleDays) {
    return { band: 'stale', label: 'Stale', reason: `${daysSinceTouch} ngày chưa có completed CRM activity.` };
  }
  if (stage === 'new' && completedTouches === 0 && ageDays != null && ageDays >= policy.newResponseDays) {
    return { band: 'stale', label: 'Chưa phản hồi', reason: `Lead mới đã ${ageDays} ngày nhưng chưa có completed CRM activity.` };
  }
  return { band: 'active', label: 'Active', reason: 'Lead đang mở và chưa vượt ngưỡng follow-up của policy.' };
}

function leadSignals(lead, policy) {
  const signals = [];
  if (!lead.owner) signals.push({ id: 'unassigned', level: 'critical', label: 'Chưa có owner', explanation: 'Lead mở chưa có trách nhiệm chăm sóc rõ ràng.', action: 'assign_owner', source: 'Lead.ownerId' });
  if (lead.overdueFollowups) signals.push({ id: 'overdue_followup', level: 'critical', label: `${lead.overdueFollowups} follow-up quá hạn`, explanation: 'Lịch follow-up đã qua nhưng chưa được đánh dấu hoàn tất.', action: 'complete_or_reschedule_followup', source: 'Activity.date + done' });
  if (lead.lifecycle.band === 'dormant') signals.push({ id: 'dormant_review', level: 'critical', label: 'Dormant cần quyết định', explanation: lead.lifecycle.reason, action: 'review_dormant_lead', source: lead.lastTouch.source });
  else if (lead.lifecycle.band === 'stale') signals.push({ id: 'stale_followup', level: 'attention', label: lead.lifecycle.label, explanation: lead.lifecycle.reason, action: 'schedule_followup', source: lead.lastTouch.source });
  if (!lead.expectedClose) signals.push({ id: 'missing_expected_close', level: 'info', label: 'Thiếu expected close', explanation: 'Forecast chưa có ngày cam kết để đặt vào nhịp quản lý.', action: 'set_expected_close', source: 'Lead.expectedClose' });
  if (!lead.contactCoverage.checks.contactChannel) signals.push({ id: 'missing_contact_channel', level: 'info', label: 'Thiếu kênh liên hệ', explanation: 'Lead chưa có email hoặc số điện thoại trong CRM.', action: 'complete_contact_data', source: 'Lead.email + phone' });
  return signals.sort((a, b) => SEVERITY[a.level] - SEVERITY[b.level] || a.id.localeCompare(b.id));
}

export function buildCrmWorkloadIntelligence({
  leads = [],
  activities = [],
  owners = [],
  now = new Date(),
  policy: policyInput = {},
} = {}) {
  const today = now.toISOString().slice(0, 10);
  const policy = safePolicy(policyInput);
  const ownerMap = new Map((owners instanceof Map ? [...owners.values()] : owners).map((owner) => [String(owner.id), owner]));
  const activitiesByLead = new Map();
  for (const activity of activities) {
    const refId = String(activity.refId || '');
    if (!activitiesByLead.has(refId)) activitiesByLead.set(refId, []);
    activitiesByLead.get(refId).push(activity);
  }

  const leadRows = leads.map((lead) => {
    const stage = safeStage(lead.stage);
    const open = OPEN_STAGES.has(stage);
    const rows = activitiesByLead.get(String(lead.id)) || [];
    const completed = rows.filter((activity) => activity.done && isoDay(activity.date) && activity.date <= today);
    const pending = rows.filter((activity) => !activity.done && isoDay(activity.date));
    const overdue = pending.filter((activity) => activity.date < today);
    const upcoming = pending.filter((activity) => activity.date >= today);
    const completedDay = latestDay(completed);
    const createdDay = isoDay(lead.createdAt);
    const lastTouchDay = completedDay || createdDay;
    const ageDays = createdDay ? Math.max(0, daysBetween(createdDay, today)) : null;
    const daysSinceTouch = lastTouchDay ? Math.max(0, daysBetween(lastTouchDay, today)) : null;
    const lifecycle = lifecycleFor({ stage, ageDays, daysSinceTouch, completedTouches: completed.length, overdueFollowups: overdue.length, policy });
    const owner = lead.ownerId ? ownerMap.get(String(lead.ownerId)) : null;
    const coverage = contactCoverage(lead);
    const row = {
      id: String(lead.id),
      name: String(lead.name || 'Lead chưa đặt tên').slice(0, 120),
      company: String(lead.company || lead.name || 'Chưa có công ty').slice(0, 160),
      stage,
      open,
      source: String(lead.source || 'Chưa ghi nguồn').slice(0, 80),
      value: Math.max(0, Number(lead.value) || 0),
      weightedValue: open ? Math.round(Math.max(0, Number(lead.value) || 0) * policy.stageProbability[stage] / 100) : 0,
      owner: owner ? { id: String(owner.id), name: String(owner.name || 'Chưa rõ owner').slice(0, 100), title: owner.title || null } : null,
      createdAt: createdDay,
      expectedClose: isoDay(lead.expectedClose),
      lifecycle: Object.freeze(lifecycle),
      lastTouch: Object.freeze({
        date: lastTouchDay,
        daysAgo: daysSinceTouch,
        source: completedDay ? 'recorded_completed_activity' : createdDay ? 'lead_created_at' : 'missing',
        isObservedTruth: false,
      }),
      completedActivities: completed.length,
      overdueFollowups: overdue.length,
      nextFollowup: earliestDay(upcoming),
      contactCoverage: coverage,
      confidence: Object.freeze({
        band: completed.length && coverage.percent >= 75 ? 'medium' : completed.length || createdDay ? 'low' : 'unrated',
        ceiling: 'medium',
        reason: 'Activity vẫn là CRM record do người dùng xác nhận, chưa phải observed truth.',
      }),
    };
    row.signals = Object.freeze(leadSignals(row, policy).map(Object.freeze));
    return Object.freeze(row);
  });

  const openRows = leadRows.filter((lead) => lead.open);
  const ownerIds = new Set([...ownerMap.keys(), ...openRows.map((lead) => lead.owner?.id).filter(Boolean)]);
  const ownerRows = [...ownerIds].map((ownerId) => {
    const owner = ownerMap.get(ownerId) || { id: ownerId, name: 'Owner không còn active' };
    const portfolio = openRows.filter((lead) => lead.owner?.id === ownerId);
    const ratio = portfolio.length / policy.ownerWipLimit;
    const band = ratio > 1 ? 'over' : ratio >= 0.8 ? 'near' : 'available';
    return Object.freeze({
      ownerId,
      name: String(owner.name || 'Chưa rõ owner').slice(0, 100),
      title: owner.title || null,
      openLeads: portfolio.length,
      activeLeads: portfolio.filter((lead) => lead.lifecycle.band === 'active').length,
      staleLeads: portfolio.filter((lead) => lead.lifecycle.band === 'stale').length,
      dormantLeads: portfolio.filter((lead) => lead.lifecycle.band === 'dormant').length,
      overdueFollowups: portfolio.reduce((sum, lead) => sum + lead.overdueFollowups, 0),
      openValue: portfolio.reduce((sum, lead) => sum + lead.value, 0),
      weightedForecast: portfolio.reduce((sum, lead) => sum + lead.weightedValue, 0),
      wipLimit: policy.ownerWipLimit,
      band,
      label: band === 'over' ? 'Vượt lead WIP' : band === 'near' ? 'Gần giới hạn' : 'Còn capacity theo WIP',
    });
  }).sort((a, b) => a.name.localeCompare(b.name, 'vi'));

  const managerQueue = [];
  for (const lead of openRows) {
    if (!lead.signals.length) continue;
    const primary = lead.signals[0];
    managerQueue.push(Object.freeze({
      id: `lead:${lead.id}`,
      kind: 'lead_review',
      entityId: lead.id,
      level: primary.level,
      title: lead.company,
      ownerName: lead.owner?.name || 'Chưa có owner',
      lifecycle: lead.lifecycle,
      recommendedAction: primary.action,
      signals: lead.signals,
      source: primary.source,
    }));
  }
  for (const owner of ownerRows.filter((row) => row.band === 'over')) {
    managerQueue.push(Object.freeze({
      id: `owner:${owner.ownerId}`,
      kind: 'owner_capacity',
      entityId: owner.ownerId,
      level: 'attention',
      title: owner.name,
      ownerName: owner.name,
      lifecycle: null,
      recommendedAction: 'review_portfolio_distribution',
      signals: Object.freeze([Object.freeze({
        id: 'owner_wip_exceeded', level: 'attention', label: `${owner.openLeads}/${owner.wipLimit} lead mở`,
        explanation: 'Lead WIP vượt ngưỡng điều phối; đây không phải điểm hiệu suất cá nhân.', action: 'review_portfolio_distribution', source: 'Lead.ownerId + CRM policy',
      })]),
      source: 'Lead.ownerId + CRM policy',
    }));
  }
  managerQueue.sort((a, b) => SEVERITY[a.level] - SEVERITY[b.level] || a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title, 'vi'));

  const won = leadRows.filter((lead) => lead.stage === 'won');
  const lost = leadRows.filter((lead) => lead.stage === 'lost');
  return Object.freeze({
    ruleVersion: CRM_WORKLOAD_RULE_VERSION,
    generatedAt: now.toISOString(),
    summary: Object.freeze({
      totalLeads: leadRows.length,
      openLeads: openRows.length,
      activeLeads: openRows.filter((lead) => lead.lifecycle.band === 'active').length,
      staleLeads: openRows.filter((lead) => lead.lifecycle.band === 'stale').length,
      dormantLeads: openRows.filter((lead) => lead.lifecycle.band === 'dormant').length,
      wonLeads: won.length,
      deadLeads: lost.length,
      unassignedLeads: openRows.filter((lead) => !lead.owner).length,
      overdueFollowups: openRows.reduce((sum, lead) => sum + lead.overdueFollowups, 0),
      openValue: openRows.reduce((sum, lead) => sum + lead.value, 0),
      weightedForecast: openRows.reduce((sum, lead) => sum + lead.weightedValue, 0),
      managerQueueItems: managerQueue.length,
    }),
    leads: Object.freeze(leadRows),
    owners: Object.freeze(ownerRows),
    managerQueue: Object.freeze(managerQueue),
    policy: Object.freeze({
      ...policy,
      advisoryOnly: true,
      automaticAssignment: false,
      automaticStageChange: false,
      employeeRanking: false,
      performanceInference: false,
      activityIsObservedTruth: false,
    }),
    provenance: Object.freeze({
      lead: 'canonical_erp_lead',
      activity: 'recorded_crm_activity_not_observed_truth',
      ownerCapacity: 'canonical_lead_owner_plus_explicit_wip_policy',
      forecast: 'lead_value_times_configured_stage_probability',
    }),
  });
}
