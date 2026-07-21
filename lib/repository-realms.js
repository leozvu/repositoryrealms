import { executeRealmRecordAction } from './realm-action-admin.js';
import { EXECUTION_ACTIONS, executeExecutionAction } from './execution-engine-admin.js';
import { RESOURCE_INTELLIGENCE_ACTIONS, executeResourceEstimateAction } from './resource-intelligence-admin.js';
import { RealmOperationError } from './realm-operation.js';

export const REPOSITORY_REALMS_NAME = 'RepositoryRealms';
export const REPOSITORY_REALMS_CONTRACT_VERSION = 1;

const CONTRACTS = [
  {
    action: 'task.transition',
    intent: 'advance_quest_state',
    resource: 'tasks',
    surface: 'campaigns',
    authorization: ['registry.canWrite(tasks)', 'guild row scope', 'task row policy'],
    businessRules: ['expected-state CAS', 'task transition graph', 'task validator'],
    receipt: 'RealmActionReceipt',
    audit: 'AuditLog in the record transaction',
  },
  {
    action: 'task.assign',
    intent: 'assign_quest_owner',
    resource: 'tasks',
    surface: 'command',
    authorization: ['PM or LEAD role', 'guild row scope', 'target employee scope'],
    businessRules: ['assignment CAS', 'completed task lock', 'active employee target'],
    receipt: 'RealmActionReceipt',
    audit: 'AuditLog in the record transaction',
  },
  {
    action: 'lead.transition',
    intent: 'advance_diplomatic_stage',
    resource: 'leads',
    surface: 'embassy',
    authorization: ['registry.canWrite(leads)', 'embassy portfolio scope'],
    businessRules: ['expected-stage CAS', 'lead transition graph'],
    receipt: 'RealmActionReceipt',
    audit: 'AuditLog in the record transaction',
  },
  {
    action: 'task.comment.create',
    intent: 'record_war_council_note',
    resource: 'taskcomments',
    surface: 'campaigns',
    authorization: ['registry.canWrite(taskcomments)', 'guild task scope'],
    businessRules: ['bounded normalized content', 'existing task requirement'],
    receipt: 'RealmActionReceipt with payload hash and result id',
    audit: 'Payload-free AuditLog in the record transaction',
  },
  {
    action: 'lead.followup.create',
    intent: 'schedule_diplomatic_followup',
    resource: 'activities',
    surface: 'embassy',
    authorization: ['registry.canWrite(activities)', 'embassy portfolio scope'],
    businessRules: ['follow-up kind allowlist', 'bounded title', 'valid calendar day'],
    receipt: 'RealmActionReceipt with payload hash and result id',
    audit: 'Payload-free AuditLog in the record transaction',
  },
  {
    action: 'task.reprioritize',
    intent: 'reorder_personal_work_queue',
    resource: 'tasks',
    surface: 'command',
    authorization: ['PM or LEAD role', 'guild owner scope'],
    businessRules: ['queue-version CAS', 'open-task queue only', 'stable contiguous positions'],
    receipt: 'RealmActionReceipt linked to WorkItemEvent',
    audit: 'AuditLog in the queue transaction',
  },
  {
    action: 'task.block',
    intent: 'declare_work_blocker',
    resource: 'tasks',
    surface: 'command',
    authorization: ['PM or LEAD role', 'guild task scope'],
    businessRules: ['work-version CAS', 'non-terminal task', 'structured blocker reason'],
    receipt: 'RealmActionReceipt linked to WorkItemEvent',
    audit: 'AuditLog in the record transaction',
  },
  {
    action: 'task.unblock',
    intent: 'resolve_work_blocker',
    resource: 'tasks',
    surface: 'command',
    authorization: ['PM or LEAD role', 'guild task scope'],
    businessRules: ['work-version CAS', 'blocked-state requirement', 'safe next-state allowlist'],
    receipt: 'RealmActionReceipt linked to WorkItemEvent',
    audit: 'AuditLog in the record transaction',
  },
  {
    action: 'task.escalate',
    intent: 'escalate_work_decision',
    resource: 'tasks',
    surface: 'command',
    authorization: ['PM or LEAD role', 'guild task scope'],
    businessRules: ['work-version CAS', 'monotonic escalation level', 'structured reason'],
    receipt: 'RealmActionReceipt linked to WorkItemEvent',
    audit: 'AuditLog in the record transaction',
  },
  {
    action: 'task.split',
    intent: 'decompose_work_item',
    resource: 'tasks',
    surface: 'command',
    authorization: ['PM or LEAD role', 'guild task scope'],
    businessRules: ['work-version CAS', 'two-to-ten children', 'explicit parent lineage'],
    receipt: 'RealmActionReceipt linked to WorkItemEvent and first child',
    audit: 'AuditLog in the split transaction',
  },
  {
    action: 'task.merge',
    intent: 'consolidate_work_items',
    resource: 'tasks',
    surface: 'command',
    authorization: ['PM or LEAD role', 'guild scope for every source'],
    businessRules: ['work-version CAS per source', 'same project and owner', 'explicit merge lineage'],
    receipt: 'RealmActionReceipt linked to WorkItemEvent and merged target',
    audit: 'AuditLog in the merge transaction',
  },
  {
    action: 'task.estimate',
    intent: 'calibrate_work_estimate',
    resource: 'tasks',
    surface: 'command',
    authorization: ['task assignee for declared estimate', 'PM or LEAD for scoped manager adjustment'],
    businessRules: ['work-version CAS', 'non-terminal task', 'work type and complexity taxonomy', 'manager reason required'],
    receipt: 'RealmActionReceipt linked to WorkEstimateRevision and WorkItemEvent',
    audit: 'AuditLog in the estimate transaction',
  },
  {
    action: 'task.create',
    intent: 'create_work_in_target_entity',
    resource: 'tasks',
    surface: 'ceo-command',
    authorization: ['Director API authentication', 'active CEO entity membership', 'command.task.create scope'],
    businessRules: ['target audience match', 'task field allowlist', 'active assignee and existing project checks'],
    receipt: 'CeoEntityCommandReceipt with correlation and payload hash',
    audit: 'AuditLog in the target record transaction',
  },
  {
    action: 'status.request',
    intent: 'request_status_from_target_entity',
    resource: 'tasks',
    surface: 'ceo-command',
    authorization: ['Director API authentication', 'active CEO entity membership', 'command.status.request scope'],
    businessRules: ['target audience match', 'active employee requirement', 'bounded status-request fields'],
    receipt: 'CeoEntityCommandReceipt with correlation and payload hash',
    audit: 'AuditLog in the target record transaction',
  },
  {
    action: 'announcement.send',
    intent: 'announce_to_target_entity',
    resource: 'notifications',
    surface: 'ceo-command',
    authorization: ['Director API authentication', 'active CEO entity membership', 'command.announcement.send scope'],
    businessRules: ['target audience match', 'active employee audience', 'bounded title and message'],
    receipt: 'CeoEntityCommandReceipt with recipient count',
    audit: 'AuditLog in the target notification transaction',
  },
  {
    action: 'approval.request',
    intent: 'request_decision_in_target_entity',
    resource: 'approvals',
    surface: 'ceo-command',
    authorization: ['Director API authentication', 'active CEO entity membership', 'command.approval.request scope'],
    businessRules: ['target audience match', 'active approver-role requirement', 'no finance or payroll side effect'],
    receipt: 'CeoEntityCommandReceipt linked to local Approval',
    audit: 'AuditLog in the target approval transaction',
  },
  {
    action: 'message.send',
    intent: 'deliver_federated_message_to_target_entity',
    resource: 'messages',
    surface: 'ceo-messaging',
    authorization: ['Director API authentication', 'active CEO entity membership', 'message.send scope'],
    businessRules: ['target audience match', 'explicitly shared directory recipient', 'bounded content and mention allowlist'],
    receipt: 'CeoEntityMessageReceipt linked to local Conversation and Message',
    audit: 'Payload-free AuditLog in the target message transaction',
  },
];

export const REPOSITORY_REALMS_ACTION_CONTRACTS = Object.freeze(CONTRACTS.map((contract) => Object.freeze({
  ...contract,
  authorization: Object.freeze([...contract.authorization]),
  businessRules: Object.freeze([...contract.businessRules]),
  parity: Object.freeze({
    presentationIndependent: true,
    buttonMatchingRequired: false,
    apiShapeMatchingRequired: false,
    sharedBusinessInvariantsRequired: true,
  }),
})));

const CONTRACT_BY_ACTION = new Map(REPOSITORY_REALMS_ACTION_CONTRACTS.map((contract) => [contract.action, contract]));

export function repositoryRealmsContract(action) {
  return CONTRACT_BY_ACTION.get(String(action || '')) || null;
}

export function repositoryRealmsSurface(action) {
  const contract = repositoryRealmsContract(action);
  if (!contract) throw new RealmOperationError('RepositoryRealms chưa cho phép business action này.', 400, 'repository_realms_action_unsupported');
  return contract.surface;
}

function businessInput(input = {}) {
  const { presentation: _presentation, uiLabel: _uiLabel, sourceControl: _sourceControl, ...intent } = input;
  return intent;
}

export async function executeRepositoryRealmsAction(db, user, input, {
  now = new Date(),
  executor = null,
} = {}) {
  const contract = repositoryRealmsContract(input?.action);
  if (!contract) throw new RealmOperationError('RepositoryRealms chưa cho phép business action này.', 400, 'repository_realms_action_unsupported');
  const canonicalExecutor = executor
    || (EXECUTION_ACTIONS.includes(contract.action)
      ? executeExecutionAction
      : RESOURCE_INTELLIGENCE_ACTIONS.includes(contract.action)
        ? executeResourceEstimateAction
        : executeRealmRecordAction);
  const result = await canonicalExecutor(db, user, businessInput(input), now);
  if (!result?.action?.id) {
    throw new RealmOperationError('RepositoryRealms không nhận được receipt hợp lệ; action bị coi là chưa hoàn tất.', 500, 'repository_realms_receipt_missing');
  }
  return {
    ...result,
    repository: {
      name: REPOSITORY_REALMS_NAME,
      contractVersion: REPOSITORY_REALMS_CONTRACT_VERSION,
      action: contract.action,
      intent: contract.intent,
      resource: contract.resource,
      receiptId: result.action.id,
      replayed: result.idempotent === true,
      invariants: {
        authorization: 'enforced',
        businessRules: 'enforced',
        receipt: 'verified',
        audit: 'atomic',
      },
      parity: contract.parity,
    },
  };
}
