import fs from 'node:fs';
import path from 'node:path';
import {
  collaborationContactRoute,
  mergeCollaborationDirectory,
  normalizeCollaborationAvailability,
  normalizeCollaborationCapabilities,
  normalizeCollaborationSurface,
  serializeCollaborationContact,
} from '../../lib/collaboration.js';

const ROUTES = [
  {
    id: 'presence',
    source: 'app/api/collaboration/presence/route.js',
    signals: ['currentUser()', 'loadCollaborationDirectory', 'heartbeatCollaborationPresence', 'leaveCollaborationPresence', 'collaborationJson'],
  },
  {
    id: 'contact',
    source: 'app/api/collaboration/contact/route.js',
    signals: ['currentUser()', 'loadCollaborationContacts', 'requestCollaborationContact', 'respondCollaborationContact', "headers.get('Idempotency-Key')"],
  },
];

const CONTRACTS = [
  { id: 'additive-collaboration-schema', source: 'prisma/schema.prisma', signals: ['model CollaborationPresenceSession', 'model CollaborationContactRequest', 'idempotencyKey String    @unique'] },
  { id: 'canonical-erp-chat-notification', source: 'lib/collaboration-admin.js', signals: ['tx.message.create', 'tx.notification.create', 'directConversation(tx'] },
  { id: 'authenticated-actor-boundary', source: 'lib/collaboration-admin.js', signals: ["if (!user?.id)", 'userId: user.id', 'requesterId: user.id'] },
  { id: 'presence-session-ownership', source: 'lib/collaboration-admin.js', signals: ['collaborationPresenceSession.findUnique', 'owner.userId !== user.id', 'presence_session_conflict'] },
  { id: 'multi-session-user-merge', source: 'lib/collaboration.js', signals: ['const byUser = new Map()', 'byUser.get(session.userId)', 'online: active.length > 0'] },
  { id: 'contact-idempotency', source: 'lib/collaboration-admin.js', signals: ['idempotencyKey', "error?.code !== 'P2002'", 'duplicate: true'] },
  { id: 'dnd-and-rate-guard', source: 'lib/collaboration-admin.js', signals: ["session.availability === 'dnd'", 'CONTACT_RATE_LIMIT', 'contact_rate_limited'] },
  { id: 'contact-lifecycle-expiry', source: 'lib/collaboration-admin.js', signals: ["status: 'expired'", "['seen', 'accept', 'decline']", "status === 'accepted'"] },
  { id: 'erp-global-bridge', source: 'components/Shell.jsx', signals: ['<CollaborationBridge />', '<WorkspaceSurfaceSwitch pilot={realmPilot}'] },
  { id: 'realm-to-erp-contact', source: 'components/realm/RealmOffice.jsx', signals: ['useCollaborationDirectory', 'sendContactToSelected', 'targetUserId', 'Gõ cửa ERP'] },
  { id: 'server-signed-realm-identity', source: 'scripts/realm-signal-server.mjs', signals: ['socket.realmClaims.userId', 'identityId: socket.realmClaims.userId'] },
  { id: 'message-deep-link', source: 'app/(app)/messages/page.jsx', signals: ['useSearchParams', "searchParams.get('conversation')", 'setSel(requested)'] },
  { id: 'policy-aware-surface-login', source: 'app/login/page.jsx', signals: ["fetch('/api/realm-demo/pilot'", 'pilot.user?.allowed', "destination = '/realm'"] },
  { id: 'fail-soft-directory', source: 'components/collaboration/useCollaborationDirectory.js', signals: ["current === 'ready' ? 'stale' : 'unavailable'", "fetch('/api/collaboration/presence'", "cache: 'no-store'"] },
  { id: 'private-no-store-response', source: 'lib/collaboration-response.js', signals: ["'Cache-Control': 'private, no-cache, no-store, max-age=0'", "Vary: 'Cookie'"] },
];

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function markdownTable(rows, columns) {
  const clean = (value) => String(Array.isArray(value) ? value.join(', ') : value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
  return [
    `| ${columns.map(([label]) => label).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${columns.map(([, key]) => clean(row[key])).join(' | ')} |`),
  ].join('\n');
}

function buildScenarios() {
  const now = new Date('2026-07-18T12:00:00.000Z');
  const users = [
    { id: 'user_01', name: 'An', title: 'Knight' },
    { id: 'user_02', name: 'Binh', title: 'Scribe' },
    { id: 'user_03', name: 'Chi', title: 'Alchemist' },
  ];
  const people = mergeCollaborationDirectory({
    users,
    selfUserId: 'user_01',
    now,
    sessions: [
      { userId: 'user_02', surface: 'erp', availability: 'available', capabilities: '["chat"]', lastSeen: '2026-07-18T11:59:55.000Z' },
      { userId: 'user_02', surface: 'realm', availability: 'focus', capabilities: '["chat","voice"]', lastSeen: '2026-07-18T11:59:59.000Z' },
      { userId: 'user_03', surface: 'realm', availability: 'available', capabilities: '["chat"]', lastSeen: '2026-07-18T11:58:00.000Z' },
    ],
  });
  const contact = serializeCollaborationContact({
    id: 'contact_01',
    requesterId: 'user_01', requesterName: 'An',
    targetId: 'user_02', targetName: 'Binh',
    kind: 'voice', status: 'pending', sourceSurface: 'realm', message: '  Hop\u0000 ngay  ',
    conversationId: 'conv_01', expiresAt: '2026-07-18T12:05:00.000Z', createdAt: now,
  }, 'user_02');
  const rows = [
    { id: 'multi-tab-is-one-online-user', expected: 1, actual: people.filter((person) => person.online).length },
    { id: 'surface-capability-merge', expected: 'erp,realm|chat,voice|focus', actual: `${people[0].surfaces.join(',')}|${people[0].capabilities.join(',')}|${people[0].availability}` },
    { id: 'expired-presence-is-offline', expected: false, actual: people.find((person) => person.id === 'user_03')?.online },
    { id: 'safe-contact-deep-link', expected: '/messages?conversation=conv_01&contact=contact_01', actual: contact.route },
    { id: 'contact-control-char-sanitized', expected: 'Hop ngay', actual: contact.message },
    { id: 'contact-viewer-direction', expected: 'incoming', actual: contact.direction },
    { id: 'surface-fallback', expected: 'erp', actual: normalizeCollaborationSurface('unknown') },
    { id: 'availability-fallback', expected: 'available', actual: normalizeCollaborationAvailability('invisible') },
    { id: 'capability-allowlist', expected: 'chat,voice', actual: normalizeCollaborationCapabilities(['chat', 'admin', 'voice', 'chat']).join(',') },
    { id: 'route-encoding', expected: '/messages?conversation=conv%2F01&contact=contact%3F01', actual: collaborationContactRoute('conv/01', 'contact?01') },
  ];
  return rows.map((row) => ({ ...row, status: row.actual === row.expected ? 'verified' : 'failed' }));
}

export function buildCollaborationBridgeAudit(root) {
  const routeCoverage = ROUTES.map((route) => {
    const file = path.join(root, route.source);
    const code = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const missingSignals = route.signals.filter((signal) => !code.includes(signal));
    return { ...route, missingSignals, status: missingSignals.length ? 'failed' : 'verified' };
  });
  const contracts = CONTRACTS.map((contract) => {
    const file = path.join(root, contract.source);
    const code = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const missingSignals = contract.signals.filter((signal) => !code.includes(signal));
    return { ...contract, missingSignals, status: missingSignals.length ? 'failed' : 'verified' };
  });
  const scenarios = buildScenarios();
  return {
    schemaVersion: 1,
    summary: {
      routes: routeCoverage.length,
      verifiedRoutes: routeCoverage.filter((row) => row.status === 'verified').length,
      contracts: contracts.length,
      verifiedContracts: contracts.filter((row) => row.status === 'verified').length,
      scenarios: scenarios.length,
      verifiedScenarios: scenarios.filter((row) => row.status === 'verified').length,
      additiveModels: 2,
      databaseMutationsExecuted: 0,
    },
    routeCoverage,
    contracts,
    scenarios,
  };
}

function contractCsv(result) {
  const columns = ['id', 'source', 'missingSignals', 'status'];
  return `${columns.map(csvCell).join(',')}\n${result.contracts.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\n')}\n`;
}

function report(result) {
  const s = result.summary;
  return `# Phase 8 — Dual-surface ERP/Realm collaboration bridge\n\n` +
    `Phase 8 cho phép nhân sự dùng ERP thuần và Realm song song trên cùng dữ liệu gốc. Realm không sở hữu bản sao CRM/ERP; mọi cuộc liên hệ đều đi vào Conversation, Message và Notification hiện hữu.\n\n` +
    `## Kết quả\n\n` +
    `- Collaboration API routes: **${s.verifiedRoutes}/${s.routes}**\n` +
    `- Identity/data/UX contracts: **${s.verifiedContracts}/${s.contracts}**\n` +
    `- Deterministic scenarios: **${s.verifiedScenarios}/${s.scenarios}**\n` +
    `- Additive Prisma models: **${s.additiveModels}**\n` +
    `- Database mutations executed by this audit: **${s.databaseMutationsExecuted}**\n\n` +
    `## Route coverage\n\n${markdownTable(result.routeCoverage, [['Route', 'id'], ['Source', 'source'], ['Status', 'status']])}\n\n` +
    `## Contract matrix\n\n${markdownTable(result.contracts, [['Contract', 'id'], ['Evidence', 'source'], ['Status', 'status']])}\n\n` +
    `## Kiến trúc dữ liệu\n\n` +
    `- ERP và Realm là hai giao diện cho cùng User và cùng dữ liệu CRM/ERP; không có cơ chế merge hai database.\n` +
    `- Presence lưu từng tab/thiết bị rồi hợp nhất theo userId. TTL đưa phiên mất kết nối về offline mà không cần thao tác tay.\n` +
    `- Contact request chỉ giữ lifecycle/idempotency. Nội dung bền vững được ghi vào Chat và Notification chuẩn nên người không mở Realm vẫn nhận được.\n` +
    `- Realm gateway gắn userId từ token đã ký; client không tự khai danh tính ERP.\n` +
    `- DND, chống double-submit, reuse cửa sổ 30 giây, rate limit và expiry 5 phút ngăn spam.\n\n` +
    `## Triển khai staging\n\n` +
    `Hai model additive phải được áp dụng vào **database staging cô lập** bằng quy trình provision/DBA review hiện có trước khi test đăng nhập. Audit này không chạy migration, không reset database và không chạm production.\n\n` +
    `## Regression gate\n\n` +
    `Chạy \`npm run audit:collaboration:check\`. Gate thất bại nếu mất auth boundary, canonical ERP persistence, identity binding, cross-surface UX hoặc artifact bị stale.\n`;
}

export function renderCollaborationBridgeArtifacts(result) {
  return {
    'bridge-verification.json': `${JSON.stringify(result, null, 2)}\n`,
    'contract-matrix.csv': contractCsv(result),
    'PHASE-8-REPORT.md': `${report(result)}\n`,
  };
}
