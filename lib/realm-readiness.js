import { inspectRealmSchemaReadiness } from './realm-health.js';
import { loadRealmPilotMetrics, normalizeRealmPilotConfig } from './realm-pilot.js';

export function evaluateRealmLaunchReadiness({
  policy: policyValue,
  schema = { ready: false, missing: ['unknown'] },
  metrics = null,
  unresolvedFeedback = 0,
  blockedFeedback = 0,
} = {}) {
  const policy = normalizeRealmPilotConfig(policyValue);
  const gates = [
    {
      id: 'schema',
      label: 'Schema staging sẵn sàng',
      passed: schema.ready === true,
      blocking: true,
      detail: schema.ready ? `Schema v${schema.schemaVersion} đã xác minh.` : `Thiếu: ${(schema.missing || ['unknown']).join(', ')}.`,
    },
    {
      id: 'controlled-cohort',
      label: 'Phát hành theo cohort',
      passed: policy.mode === 'pilot',
      blocking: true,
      detail: policy.mode === 'pilot' ? `${policy.roles.length} vai trò trong cohort.` : 'Chọn “Pilot theo vai trò” trước khi mời nhân sự thật.',
    },
    {
      id: 'cohort-members',
      label: 'Cohort có người đủ điều kiện',
      passed: Number(metrics?.eligibleUsers || 0) > 0,
      blocking: true,
      detail: `${Number(metrics?.eligibleUsers || 0)} tài khoản nội bộ đủ điều kiện.`,
    },
    {
      id: 'erp-fallback',
      label: 'ERP là lối vào an toàn',
      passed: policy.defaultSurface === 'erp',
      blocking: true,
      detail: policy.defaultSurface === 'erp' ? 'Người chưa chọn luôn vào ERP trước.' : 'Đổi giao diện mặc định về ERP trong thời gian pilot.',
    },
    {
      id: 'realm-office',
      label: 'Văn phòng Realm được bật',
      passed: policy.features.office,
      blocking: true,
      detail: policy.features.office ? 'Realm Office đang mở cho cohort.' : 'Feature flag Office đang tắt.',
    },
    {
      id: 'guild-support',
      label: 'Guild Support hoạt động',
      passed: policy.features.feedback,
      blocking: true,
      detail: policy.features.feedback ? `${unresolvedFeedback} phản hồi chưa hoàn tất.` : 'Bật Guild Support để cohort luôn có đường báo lỗi.',
    },
    {
      id: 'blocking-feedback',
      label: 'Không còn blocker đã biết',
      passed: blockedFeedback === 0,
      blocking: true,
      detail: blockedFeedback === 0 ? 'Không có phản hồi mức “bị chặn” đang mở.' : `${blockedFeedback} blocker cần xử lý trước khi mở cohort.`,
    },
    {
      id: 'tavern',
      label: 'Tavern được phát hành',
      passed: policy.features.tavern,
      blocking: false,
      detail: policy.features.tavern ? 'Tavern đang dùng ledger và maker–checker hiện có.' : 'Có thể pilot Office trước và mở Tavern sau.',
    },
  ];
  const blockers = gates.filter((gate) => gate.blocking && !gate.passed);
  const advisories = gates.filter((gate) => !gate.blocking && !gate.passed);
  return {
    status: blockers.length ? 'blocked' : advisories.length ? 'attention' : 'ready',
    ready: blockers.length === 0,
    gates,
    summary: {
      passed: gates.filter((gate) => gate.passed).length,
      total: gates.length,
      blockers: blockers.length,
      advisories: advisories.length,
      unresolvedFeedback,
      blockedFeedback,
      eligibleUsers: Number(metrics?.eligibleUsers || 0),
      onlineNow: Number(metrics?.online?.total || 0),
    },
    rollback: {
      action: 'set-policy-mode-off',
      fallbackRoute: '/dashboard',
      preservesErpData: true,
      reversesMigrations: false,
    },
    privacy: {
      aggregateOnly: true,
      performanceTracking: false,
      durationTracking: false,
      onboardingStorage: 'device-local',
    },
  };
}

export async function loadRealmLaunchReadiness(db, configValue, now = new Date()) {
  const policy = normalizeRealmPilotConfig(configValue);
  const [schema, metrics, unresolvedFeedback, blockedFeedback] = await Promise.all([
    inspectRealmSchemaReadiness(db),
    loadRealmPilotMetrics(db, policy, now),
    db.ticket.count({
      where: { source: 'realm_pilot', status: { notIn: ['resolved', 'closed'] } },
    }),
    db.ticket.count({
      where: {
        source: 'realm_pilot',
        status: { notIn: ['resolved', 'closed'] },
        feedbackContext: { contains: '"impact":"blocked"' },
      },
    }),
  ]);
  return {
    ...evaluateRealmLaunchReadiness({ policy, schema, metrics, unresolvedFeedback, blockedFeedback }),
    policyVersion: policy.version,
    onboardingVersion: policy.onboardingVersion,
    metrics,
    schema: { ready: schema.ready, schemaVersion: schema.schemaVersion, missing: schema.missing },
    evaluatedAt: now.toISOString(),
  };
}
