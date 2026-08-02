export const CEO_UNIVERSAL_NAVIGATOR_VERSION = 1;

const PORTAL_WORKSPACES = Object.freeze([
  { id: 'briefing', href: '/ceo-briefing', icon: 'note', vi: ['Briefing hôm nay', 'Việc cần xử lý ngay, chốt hôm nay và tiếp tục theo dõi.'], en: ["Today's briefing", 'Act now, close today, and keep-watching priorities.'], keywords: ['morning', 'daily', 'priority', 'ưu tiên'] },
  { id: 'decisions', href: '/ceo-decisions', icon: 'check', vi: ['Hàng đợi quyết định', 'Theo dõi SLA và mở workflow phê duyệt tại công ty sở hữu.'], en: ['Decision queue', 'Track SLA and open the approval workflow in the owning company.'], keywords: ['approve', 'approval', 'duyệt', 'sla'] },
  { id: 'overview', href: '/ceo-overview', icon: 'dashboard', vi: ['Tổng quan tập đoàn', 'Snapshot vận hành của AIm, Egoric, Vnecom và Egolive.'], en: ['Group overview', 'Operating snapshots for AIm, Egoric, Vnecom, and Egolive.'], keywords: ['dashboard', 'portfolio', 'snapshot', 'tổng quan'] },
  { id: 'inbox', href: '/ceo-inbox', icon: 'mail', vi: ['Hộp thư liên công ty', 'Nhắn tin và theo dõi biên nhận giao nhận giữa các công ty.'], en: ['Cross-company inbox', 'Message across companies and track delivery receipts.'], keywords: ['chat', 'message', 'tin nhắn', 'conversation'] },
  { id: 'commands', href: '/ceo-commands', icon: 'link', vi: ['Điều phối liên công ty', 'Giao việc, yêu cầu trạng thái và gửi thông báo qua command gateway.'], en: ['Cross-company commands', 'Delegate, request status, and announce through the command gateway.'], keywords: ['delegate', 'task', 'giao việc', 'announcement'] },
  { id: 'workforce', href: '/ceo-workforce', icon: 'staff', vi: ['Nhân sự trong group', 'Liên kết nhân sự giữa các công ty theo phạm vi được duyệt.'], en: ['Group workforce', 'Link people across companies within approved scopes.'], keywords: ['people', 'staff', 'nhân sự', 'team'] },
  { id: 'world', href: '/ceo-world', icon: 'shield', vi: ['Bản đồ bốn vương quốc', 'Vào Realm của từng công ty qua gateway đã xác thực.'], en: ['Four-kingdom map', 'Enter each company Realm through an authenticated gateway.'], keywords: ['realm', 'map', 'kingdom', 'bản đồ'] },
  { id: 'registry', href: '/ceo-registry', icon: 'shield', vi: ['Danh bạ công ty & Identity', 'Quản lý registry, phiên CEO, TOTP và membership.'], en: ['Company registry & Identity', 'Manage registry, CEO sessions, TOTP, and membership.'], keywords: ['identity', 'totp', 'registry', 'danh bạ'] },
  { id: 'security', href: '/ceo-security', icon: 'alert', vi: ['An toàn & khôi phục', 'Theo dõi kill switch, credential và chaos rehearsal.'], en: ['Security & recovery', 'Monitor the kill switch, credentials, and chaos rehearsals.'], keywords: ['security', 'credential', 'recovery', 'an toàn'] },
  { id: 'rollout', href: '/ceo-rollout', icon: 'repeat', vi: ['Pilot & phát hành', 'Kiểm soát rollout ring, evidence và rollback của từng công ty.'], en: ['Pilot & rollout', 'Control rollout rings, evidence, and rollback by company.'], keywords: ['deploy', 'release', 'pilot', 'phát hành'] },
]);

const ENTITY_WORKFLOWS = Object.freeze([
  { id: 'dashboard', redirectPath: '/dashboard', icon: 'dashboard', capability: null, vi: ['Bảng điều khiển ERP', 'Mở dashboard gốc của công ty.'], en: ['ERP dashboard', 'Open the company’s canonical dashboard.'], keywords: ['home', 'erp', 'dashboard'] },
  { id: 'approvals', redirectPath: '/approvals', icon: 'check', capability: null, vi: ['Phê duyệt', 'Xử lý approval trong authorization và maker-checker của công ty.'], en: ['Approvals', 'Decide inside the company authorization and maker-checker workflow.'], keywords: ['approve', 'decision', 'duyệt'] },
  { id: 'realm', redirectPath: '/realm', icon: 'shield', capability: null, vi: ['Văn phòng Realm', 'Vào không gian Realm của công ty.'], en: ['Realm office', 'Enter the company Realm workspace.'], keywords: ['game', 'medieval', 'realm'] },
  { id: 'crm', redirectPath: '/leads', icon: 'leads', capability: 'crm', vi: ['CRM & khách tiềm năng', 'Mở pipeline và lead trong ERP gốc.'], en: ['CRM & leads', 'Open the canonical ERP pipeline and leads.'], keywords: ['sales', 'pipeline', 'lead', 'bán hàng'] },
  { id: 'delivery', redirectPath: '/projects', icon: 'projects', capability: 'delivery', vi: ['Dự án & delivery', 'Theo dõi dự án và tiến độ tại công ty.'], en: ['Projects & delivery', 'Track projects and delivery in the company.'], keywords: ['project', 'gantt', 'dự án', 'tiến độ'] },
  { id: 'tasks', redirectPath: '/tasks', icon: 'tasks', capability: 'delivery', vi: ['Công việc', 'Mở task manager gốc của công ty.'], en: ['Tasks', 'Open the company’s canonical task manager.'], keywords: ['quest', 'task', 'việc'] },
  { id: 'finance', redirectPath: '/finance', icon: 'finance', capability: 'finance', vi: ['Thu / Chi', 'Mở sổ tài chính tại công ty sở hữu.'], en: ['Income / Expense', 'Open the financial ledger in the owning company.'], keywords: ['cash', 'money', 'tài chính', 'thu chi'] },
  { id: 'invoices', redirectPath: '/invoices', icon: 'invoices', capability: 'finance', vi: ['Hóa đơn', 'Mở invoice workflow của công ty.'], en: ['Invoices', 'Open the company invoice workflow.'], keywords: ['invoice', 'billing', 'hóa đơn'] },
  { id: 'people', redirectPath: '/staff', icon: 'staff', capability: 'people', vi: ['Hồ sơ nhân sự', 'Mở danh sách và hồ sơ nhân sự của công ty.'], en: ['People records', 'Open company people and profile records.'], keywords: ['hr', 'people', 'staff', 'nhân sự'] },
  { id: 'messages', redirectPath: '/messages', icon: 'mail', capability: 'people', vi: ['Tin nhắn nội bộ', 'Mở hộp thư nội bộ của công ty.'], en: ['Internal messages', 'Open the company’s internal inbox.'], keywords: ['chat', 'message', 'tin nhắn'] },
  { id: 'support', redirectPath: '/tickets', icon: 'check', capability: 'support', vi: ['Ticket hỗ trợ', 'Mở support queue của công ty.'], en: ['Support tickets', 'Open the company support queue.'], keywords: ['ticket', 'support', 'sla', 'hỗ trợ'] },
  { id: 'inventory', redirectPath: '/inventory', icon: 'wallet', capability: 'inventory', vi: ['Kho hàng', 'Mở tồn kho và lô hàng của công ty.'], en: ['Inventory', 'Open company inventory and stock lots.'], keywords: ['stock', 'warehouse', 'kho'] },
  { id: 'export', redirectPath: '/shipments', icon: 'link', capability: 'export', vi: ['Lô hàng xuất', 'Mở workflow shipment và chứng từ.'], en: ['Export shipments', 'Open shipment and document workflows.'], keywords: ['shipment', 'export', 'xuất khẩu'] },
  { id: 'livestream', redirectPath: '/live', icon: 'calendar', capability: 'livestream', vi: ['Ca livestream', 'Mở lịch ca live và vận hành Egolive.'], en: ['Livestream sessions', 'Open Egolive live-session operations.'], keywords: ['egolive', 'live', 'host', 'ca live'] },
]);

const safeText = (value, max = 96) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
const searchText = (value) => safeText(value, 512).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u0111Đ]/g, 'd').toLowerCase();

function localized(definition, locale) {
  const language = locale === 'en' ? 'en' : 'vi';
  return { label: definition[language][0], description: definition[language][1] };
}

export function buildCeoUniversalNavigator({ entities = [], identityReady = false, locale = 'vi' } = {}) {
  const portalItems = PORTAL_WORKSPACES.map((definition, rank) => ({
    ...localized(definition, locale),
    id: `portal:${definition.id}`,
    kind: 'portal',
    icon: definition.icon,
    href: definition.href,
    action: 'navigate',
    available: true,
    rank,
    search: searchText([definition.id, definition.vi.join(' '), definition.en.join(' '), definition.keywords.join(' ')].join(' ')),
  }));
  const safeEntities = (Array.isArray(entities) ? entities : []).map((entity) => ({
    id: safeText(entity?.id, 48).toLowerCase(),
    displayName: safeText(entity?.displayName, 96),
    enabled: entity?.enabled === true,
    status: ['ready', 'degraded', 'unreachable', 'unverified', 'disabled'].includes(entity?.status) ? entity.status : 'unverified',
    capabilities: [...new Set((Array.isArray(entity?.capabilities) ? entity.capabilities : []).map((item) => safeText(item, 32).toLowerCase()))],
  })).filter((entity) => /^[a-z0-9][a-z0-9_-]{1,47}$/.test(entity.id) && entity.displayName);
  const entityItems = safeEntities.flatMap((entity, entityRank) => ENTITY_WORKFLOWS
    .filter((definition) => !definition.capability || entity.capabilities.includes(definition.capability))
    .map((definition, workflowRank) => {
      const disabledReason = !entity.enabled || entity.status === 'disabled'
        ? 'entity_disabled'
        : !identityReady ? 'step_up_required' : null;
      return {
        ...localized(definition, locale),
        id: `entity:${entity.id}:${definition.id}`,
        kind: 'entity',
        icon: definition.icon,
        action: 'sso',
        entityId: entity.id,
        entityName: entity.displayName,
        entityStatus: entity.status,
        redirectPath: definition.redirectPath,
        available: disabledReason === null,
        disabledReason,
        rank: entityRank * 100 + workflowRank,
        search: searchText([entity.id, entity.displayName, definition.id, definition.vi.join(' '), definition.en.join(' '), definition.keywords.join(' ')].join(' ')),
      };
    }));
  return {
    version: CEO_UNIVERSAL_NAVIGATOR_VERSION,
    portalItems,
    entities: safeEntities,
    items: [...portalItems, ...entityItems],
    metrics: {
      portalWorkspaces: portalItems.length,
      registeredEntities: safeEntities.length,
      entityWorkflows: entityItems.length,
      availableEntityWorkflows: entityItems.filter((item) => item.available).length,
    },
    invariants: {
      businessRecordsIndexed: false,
      directEntityDatabaseReads: false,
      directEntityDatabaseWrites: false,
      entityLaunchRequiresSignedSso: true,
      entityAuthorizationRemainsCanonical: true,
    },
  };
}

export function searchCeoUniversalNavigator(catalog, { query = '', scope = 'all', limit = 60 } = {}) {
  const needle = searchText(query);
  const tokens = needle.split(/\s+/).filter(Boolean);
  const normalizedScope = safeText(scope, 48).toLowerCase() || 'all';
  const rows = (Array.isArray(catalog?.items) ? catalog.items : []).filter((item) => {
    const scopeMatches = normalizedScope === 'all'
      || normalizedScope === item.kind
      || (item.kind === 'entity' && normalizedScope === item.entityId);
    const haystackTokens = item.search.split(/\s+/).filter(Boolean);
    return scopeMatches && tokens.every((token) => haystackTokens.some((word) => (
      token.length <= 2 ? word === token : word.startsWith(token)
    )));
  });
  return rows.sort((a, b) => {
    if (!needle) return (a.kind === 'portal' ? 0 : 1) - (b.kind === 'portal' ? 0 : 1) || a.rank - b.rank;
    const aLabel = searchText(a.label); const bLabel = searchText(b.label);
    const aScore = aLabel === needle ? 0 : aLabel.startsWith(needle) ? 1 : a.search.startsWith(needle) ? 2 : 3;
    const bScore = bLabel === needle ? 0 : bLabel.startsWith(needle) ? 1 : b.search.startsWith(needle) ? 2 : 3;
    return aScore - bScore || a.rank - b.rank;
  }).slice(0, Math.max(1, Math.min(100, Number(limit) || 60)));
}
