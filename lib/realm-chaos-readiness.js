export const REALM_CHAOS_SCENARIOS = Object.freeze([
  {
    id: 'database-slow',
    label: 'Database chậm',
    detection: 'Read deadline 5 giây',
    fallback: 'Trả 503 có Retry-After; UI giữ last-known-good',
    preserves: 'Không retry transaction ghi và không làm sai dữ liệu ERP',
  },
  {
    id: 'websocket-lost',
    label: 'WebSocket mất',
    detection: 'Reconnect budget hữu hạn',
    fallback: 'Chuyển BroadcastChannel local; ERP vẫn dùng bình thường',
    preserves: 'Presence có thể suy giảm nhưng công việc không bị khóa',
  },
  {
    id: 'api-timeout',
    label: 'API timeout',
    detection: 'Client abort deadline 8 giây',
    fallback: 'Giữ snapshot gần nhất, hiện degraded banner và nút thử lại',
    preserves: 'Không biến timeout thành màn trắng hoặc tự gửi lại mutation',
  },
  {
    id: 'notification-failed',
    label: 'Notification fail',
    detection: 'Delivery receipt sau commit',
    fallback: 'Core state đã commit; bảng điều hành báo delivery degraded',
    preserves: 'Notification không thể rollback policy, wave hoặc ERP fallback',
  },
  {
    id: 'approval-timeout',
    label: 'Approval timeout',
    detection: 'Deadline 24 giờ được đánh dấu trên approval board',
    fallback: 'Khóa nút duyệt và giữ nguyên policy hiện tại',
    preserves: 'Không self-approve, không áp dụng proposal hết hạn',
  },
  {
    id: 'stale-cache',
    label: 'Stale cache',
    detection: 'TTL và stale-if-error window tách biệt',
    fallback: 'Chỉ đọc snapshot cũ khi loader lỗi; mutation vẫn dùng version CAS',
    preserves: 'Cache không dùng cho số dư, quyền hạn hoặc write decision',
  },
  {
    id: 'partial-rollout',
    label: 'Partial rollout',
    detection: 'Đối chiếu eligible và ERP fallback tổng hợp',
    fallback: 'Người ngoài cohort tiếp tục trên ERP cùng source of truth',
    preserves: 'Không tạo database song song hoặc roster hiệu suất',
  },
]);

function count(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}
export function buildRealmChaosReadiness({
  metrics,
  policy,
  readiness,
  approvalTimeouts = 0,
  notificationDelivery = null,
} = {}) {
  const eligibleUsers = count(metrics?.eligibleUsers);
  const availableUsers = count(metrics?.cohort?.available);
  const fallbackUsers = Math.max(0, availableUsers - eligibleUsers);
  const erpFallbackReady = readiness?.gates?.find((gate) => gate.id === 'erp-fallback')?.passed !== false;
  const timedOutApprovals = count(approvalTimeouts);
  const notificationDegraded = notificationDelivery?.state === 'degraded';

  const scenarios = REALM_CHAOS_SCENARIOS.map((scenario) => {
    let state = 'protected';
    let liveDetail = 'Recovery contract active';
    if (scenario.id === 'notification-failed' && notificationDegraded) {
      state = 'contained';
      liveDetail = `${count(notificationDelivery.attempted)} notification chưa giao; core state đã được giữ`;
    }
    if (scenario.id === 'approval-timeout' && timedOutApprovals > 0) {
      state = 'contained';
      liveDetail = `${timedOutApprovals} approval quá hạn đã bị khóa áp dụng`;
    }
    if (scenario.id === 'partial-rollout') {
      state = erpFallbackReady ? 'protected' : 'critical';
      liveDetail = erpFallbackReady
        ? `${eligibleUsers} Realm · ${fallbackUsers} ERP fallback`
        : 'ERP fallback gate không đạt';
    }
    if (scenario.id === 'database-slow' && policy?.mode === 'off') {
      liveDetail = 'Realm off; ERP là safe state hiện tại';
    }
    return { ...scenario, state, liveDetail };
  });

  const summary = scenarios.reduce((result, scenario) => {
    result[scenario.state] += 1;
    return result;
  }, { protected: 0, contained: 0, critical: 0 });

  return {
    posture: summary.critical > 0 ? 'critical' : summary.contained > 0 ? 'degraded' : 'ready',
    summary: { ...summary, total: scenarios.length },
    scenarios,
    rules: {
      automaticWriteRetry: false,
      lastKnownGood: true,
      boundedReconnect: true,
      notificationAfterCommit: true,
      aggregateOnly: true,
    },
    privacy: { aggregateOnly: true, rosterIncluded: false, performanceTracking: false },
  };
}
