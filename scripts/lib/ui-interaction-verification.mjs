import fs from 'node:fs';
import path from 'node:path';
import { buildUiActionMap } from './ui-action-map.mjs';

const PHASE_2_BASELINE = Object.freeze({
  candidateElements: 60,
  asyncLoading: 56,
  destructiveConfirmation: 6,
  successFeedback: 5,
});

const DESTRUCTIVE_FLOWS = [
  { id: 'holiday-delete', source: 'app/(app)/attendance/page.jsx', label: 'Xóa ngày lễ', signals: ['setDeleting(h)', '<ConfirmDialog'] },
  { id: 'project-unassign', source: 'app/(app)/freelancers/page.jsx', label: 'Gỡ freelancer khỏi dự án', signals: ["mode: 'unassign'", '<ConfirmDialog'] },
  { id: 'webhook-delete', source: 'app/(app)/settings/page.jsx', label: 'Xóa webhook', signals: ['setDeleteWebhook(h)', '<ConfirmDialog'] },
  { id: 'task-comment-delete', source: 'app/(app)/tasks/page.jsx', label: 'Xóa bình luận công việc', signals: ['setCommentToDelete(c)', '<ConfirmDialog'] },
  { id: 'activity-delete', source: 'components/Activities.jsx', label: 'Xóa hoạt động CRM', signals: ['setActivityToDelete(a)', '<ConfirmDialog'] },
  { id: 'document-unlink', source: 'components/DocLinks.jsx', label: 'Gỡ liên kết tài liệu', signals: ['setLinkToDelete(l)', '<ConfirmDialog'] },
];

const BROWSER_SCENARIOS = [
  { id: 'realm-erp-bridge', route: '/realm-demo', evidence: 'Realm và ERP shell dùng chung hồ sơ nhân vật, Quest, Gold journal và Tavern.' },
  { id: 'erp-auth-boundary', route: '/tasks', evidence: 'Anonymous request chuyển tới /login; ERP gốc không bị mở công khai.' },
  { id: 'login-accessibility', route: '/login', evidence: 'Email, mật khẩu và OTP có label liên kết; lỗi dùng live alert.' },
  { id: 'mobile-overflow', route: '/realm-demo', evidence: 'Viewport 375px không có horizontal overflow.' },
];

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function markdownTable(rows, columns) {
  const clean = value => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
  return [
    `| ${columns.map(([label]) => label).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map(row => `| ${columns.map(([, key]) => clean(row[key])).join(' | ')} |`),
  ].join('\n');
}

export function buildUiInteractionVerification(root) {
  const actionMap = buildUiActionMap(root);
  const guardedActions = actionMap.actions
    .filter(action => action.loadingState !== 'not-required')
    .map(action => ({
      elementId: action.elementId,
      source: action.source,
      line: action.line,
      label: action.label,
      actionType: action.actionType,
      loadingState: action.loadingState,
      successState: action.successState,
      errorState: action.errorState,
      confirmationState: action.confirmationState,
      status: action.uxStateCandidates.length ? 'candidate' : 'verified',
    }));

  const destructiveFlows = DESTRUCTIVE_FLOWS.map(flow => {
    const source = fs.readFileSync(path.join(root, flow.source), 'utf8');
    const missingSignals = flow.signals.filter(signal => !source.includes(signal));
    return { ...flow, missingSignals, status: missingSignals.length ? 'failed' : 'verified' };
  });

  return {
    schemaVersion: 1,
    baseline: PHASE_2_BASELINE,
    summary: {
      finalCandidateElements: actionMap.actions.filter(action => action.uxStateCandidates.length).length,
      finalCandidateFlags: Object.values(actionMap.summary.uxStateCandidates).reduce((sum, count) => sum + count, 0),
      guardedActions: guardedActions.length,
      asyncButtonGuards: guardedActions.filter(action => action.loadingState === 'async-button-guard').length,
      disabledBindings: guardedActions.filter(action => action.loadingState === 'disabled-binding').length,
      localPendingStates: guardedActions.filter(action => action.loadingState === 'local-state').length,
      destructiveFlows: destructiveFlows.length,
      destructiveFlowsVerified: destructiveFlows.filter(flow => flow.status === 'verified').length,
      browserScenarios: BROWSER_SCENARIOS.length,
    },
    guardedActions,
    destructiveFlows,
    browserScenarios: BROWSER_SCENARIOS,
  };
}

export function interactionMatrixCsv(result) {
  const columns = ['elementId', 'source', 'line', 'label', 'actionType', 'loadingState', 'successState', 'errorState', 'confirmationState', 'status'];
  return `${columns.map(csvCell).join(',')}\n${result.guardedActions.map(row => columns.map(column => csvCell(row[column])).join(',')).join('\n')}\n`;
}

export function phase3ReportMarkdown(result) {
  const s = result.summary;
  const flowRows = result.destructiveFlows.map(flow => ({
    flow: flow.label,
    source: flow.source,
    status: flow.status,
    evidence: flow.signals.join(' + '),
  }));
  return `# Phase 3 — Browser verification & interaction hardening\n\n` +
    `Phase 3 xác minh các candidate của Phase 2 trên clone staging; không thay production và không thay business data.\n\n` +
    `## Kết quả\n\n` +
    `- Candidate elements ban đầu: **${result.baseline.candidateElements}**\n` +
    `- Loading candidates ban đầu: **${result.baseline.asyncLoading}**\n` +
    `- Destructive confirmation candidates ban đầu: **${result.baseline.destructiveConfirmation}**\n` +
    `- Success feedback candidates ban đầu: **${result.baseline.successFeedback}**\n` +
    `- Candidate elements còn lại: **${s.finalCandidateElements}**\n` +
    `- Candidate flags còn lại: **${s.finalCandidateFlags}**\n` +
    `- Stateful actions có guard: **${s.guardedActions}** (${s.asyncButtonGuards} AsyncButton, ${s.disabledBindings} disabled/busy binding, ${s.localPendingStates} local pending state)\n` +
    `- Destructive flows có xác nhận: **${s.destructiveFlowsVerified}/${s.destructiveFlows}**\n\n` +
    `## Thay đổi nền tảng\n\n` +
    `- \`AsyncButton\` tự khóa double-submit, gắn \`aria-busy\` và hiển thị trạng thái chờ.\n` +
    `- \`FormModal\` và \`ConfirmDialog\` chờ promise hoàn tất; lỗi không đóng modal và không làm mất dữ liệu nhập.\n` +
    `- \`useResource\` chặn mutation trùng, expose \`mutating\` và trả toast khi lỗi mạng.\n` +
    `- Login có label/input association, autocomplete đúng mục đích và live error alert.\n\n` +
    `## Destructive flows\n\n${markdownTable(flowRows, [['Flow', 'flow'], ['Source', 'source'], ['Status', 'status'], ['Evidence', 'evidence']])}\n\n` +
    `## Browser scenarios\n\n${markdownTable(result.browserScenarios, [['Scenario', 'id'], ['Route', 'route'], ['Evidence', 'evidence']])}\n\n` +
    `## Regression gate\n\n` +
    `Chạy \`npm run audit:ui:interactions:check\`. Gate thất bại nếu action map xuất hiện UX candidate mới, destructive flow mất ConfirmDialog, hoặc artifact Phase 3 bị stale.\n`;
}

export function renderUiInteractionArtifacts(result) {
  return {
    'interaction-verification.json': `${JSON.stringify(result, null, 2)}\n`,
    'interaction-matrix.csv': interactionMatrixCsv(result),
    'PHASE-3-REPORT.md': `${phase3ReportMarkdown(result)}\n`,
  };
}
