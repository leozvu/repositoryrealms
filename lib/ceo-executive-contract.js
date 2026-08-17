export const CEO_EXECUTIVE_CONTRACT = 'repositoryrealms.ceo.executive-snapshot';
export const CEO_EXECUTIVE_CONTRACT_VERSION = '2.0.0';
export const CEO_EXECUTIVE_SCHEMA_VERSION = 2;
export const CEO_EXECUTIVE_FETCH_TIMEOUT_MS = 5_000;

const OPEN_LEAD_STAGES = new Set(['new', 'contacted', 'proposal', 'negotiation']);
const ACTIVE_TASK_STATES = new Set(['todo', 'doing', 'blocked', 'waiting']);
const INCIDENT_STATES = new Set(['open', 'in_progress']);

export class CeoExecutiveContractError extends Error {
  constructor(message, status = 400, code = 'ceo_executive_contract_invalid') {
    super(message);
    this.name = 'CeoExecutiveContractError';
    this.status = status;
    this.code = code;
  }
}

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const integer = (value) => Math.round(number(value));
const month = (date) => date.toISOString().slice(0, 7);
const sum = (rows, select) => rows.reduce((total, row) => total + integer(select(row)), 0);

function moneyGroups(rows, selectCurrency, selectValue) {
  const totals = new Map();
  for (const row of rows) {
    const currency = String(selectCurrency(row) || 'VND').trim().toUpperCase().slice(0, 8) || 'VND';
    totals.set(currency, (totals.get(currency) || 0) + integer(selectValue(row)));
  }
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, value]) => ({ currency, value }));
}

function json(value, fallback = []) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function invoiceGrand(invoice) {
  return Math.round(sum(json(invoice.items), (item) => number(item.qty) * number(item.price)) * (1 + number(invoice.vat) / 100));
}

function invoicePaid(invoice) {
  return sum(json(invoice.payments), (payment) => payment.amount);
}

function stageProbabilities(settings = {}) {
  const configured = {
    new: settings.probNew,
    contacted: settings.probContacted,
    proposal: settings.probProposal,
    negotiation: settings.probNegotiation,
  };
  if (Object.values(configured).some((value) => !Number.isFinite(Number(value)))) return null;
  return Object.fromEntries(Object.entries(configured).map(([stage, value]) => [stage, Math.max(0, Math.min(100, number(value)))]));
}

function accountingUnavailable(reason) {
  return { available: false, reason, values: [] };
}

export function buildCeoExecutiveSnapshot({
  identity,
  settings = {},
  records = {},
  capabilities = {},
  asOf = new Date(),
} = {}) {
  const currency = String(settings.currency || 'VND').toUpperCase();
  const currentMonth = month(asOf);
  const approvals = records.approvals || [];
  const tasks = records.tasks || [];
  const queues = records.workQueueStates || [];
  const incidents = records.incidents || [];
  const leads = records.leads || [];
  const transactions = records.transactions || [];
  const invoices = records.invoices || [];
  const liveSessions = records.liveSessions || [];

  const pendingApprovals = approvals.filter((row) => row.status === 'pending');
  const activeTasks = tasks.filter((row) => ACTIVE_TASK_STATES.has(row.status));
  const activeByOwner = new Map();
  for (const task of activeTasks) if (task.assigneeId) activeByOwner.set(task.assigneeId, (activeByOwner.get(task.assigneeId) || 0) + 1);
  const openIncidents = incidents.filter((row) => INCIDENT_STATES.has(row.status));
  const probabilities = stageProbabilities(settings);
  const openLeads = leads.filter((row) => OPEN_LEAD_STAGES.has(row.stage));
  const monthTransactions = transactions.filter((row) => String(row.date || '').startsWith(currentMonth));
  const receivables = invoices.filter((row) => !['paid', 'cancelled', 'void'].includes(row.status));
  const monthLive = liveSessions.filter((row) => String(row.date || '').startsWith(currentMonth));
  const reconciledLive = monthLive.filter((row) => row.status === 'reconciled');

  return {
    contract: CEO_EXECUTIVE_CONTRACT,
    contractVersion: CEO_EXECUTIVE_CONTRACT_VERSION,
    schemaVersion: CEO_EXECUTIVE_SCHEMA_VERSION,
    entityId: identity.id,
    asOf: asOf.toISOString(),
    currency,
    timezone: settings.timezone || 'Asia/Ho_Chi_Minh',
    sections: {
      approvals: {
        available: true,
        pendingCount: pendingApprovals.length,
        oldestPendingAt: pendingApprovals.length
          ? pendingApprovals.map((row) => new Date(row.createdAt).toISOString()).sort()[0]
          : null,
        byType: [...new Set(pendingApprovals.map((row) => String(row.type || 'other')))].sort()
          .map((type) => ({ type, count: pendingApprovals.filter((row) => String(row.type || 'other') === type).length })),
        provenance: 'Approval.status=pending',
      },
      capacity: {
        available: true,
        activeHeadcount: integer(records.activeHeadcount),
        activeWorkItems: activeTasks.length,
        configuredWipLimit: sum(queues, (row) => row.wipLimit),
        saturatedQueues: queues.filter((row) => (activeByOwner.get(row.ownerId) || 0) >= integer(row.wipLimit)).length,
        context: 'Operational WIP planning only; not an individual productivity score.',
        provenance: 'Task.status + WorkQueueState.wipLimit',
      },
      incidents: {
        available: capabilities.support === true,
        openCount: openIncidents.length,
        criticalCount: openIncidents.filter((row) => row.priority === 'urgent').length,
        items: openIncidents.slice(0, 20).map((row) => ({
          id: row.id,
          code: row.code,
          priority: row.priority,
          status: row.status,
          updatedAt: new Date(row.updatedAt).toISOString(),
          dueAt: row.dueAt ? new Date(row.dueAt).toISOString() : null,
        })),
        provenance: 'Ticket.source=incident_registry; content fields excluded',
      },
      forecast: capabilities.crm === true && probabilities ? {
        available: true,
        currency,
        pipeline: sum(openLeads, (row) => row.value),
        weightedPipeline: sum(openLeads, (row) => number(row.value) * probabilities[row.stage] / 100),
        closeDatedCount: openLeads.filter((row) => row.expectedClose).length,
        undatedCount: openLeads.filter((row) => !row.expectedClose).length,
        stageProbabilities: probabilities,
        provenance: 'Lead.value × configured stage probability; no FX conversion',
      } : {
        available: false,
        reason: capabilities.crm === true ? 'stage_probability_not_configured' : 'crm_capability_disabled',
      },
      accounting: {
        cashLedger: {
          available: true,
          inflow: moneyGroups(monthTransactions.filter((row) => row.type === 'income'), (row) => row.currency, (row) => row.amount),
          outflow: moneyGroups(monthTransactions.filter((row) => row.type === 'expense'), (row) => row.currency, (row) => row.amount),
          receivables: moneyGroups(receivables, (row) => row.currency, (row) => Math.max(0, invoiceGrand(row) - invoicePaid(row))),
          provenance: 'Transaction cash ledger + Invoice outstanding balance; currencies are not combined',
        },
        recognizedRevenue: accountingUnavailable('recognized_revenue_not_canonical_in_current_ledger'),
        accountingProfit: accountingUnavailable('accounting_profit_not_canonical_in_current_ledger'),
      },
      livestream: capabilities.livestream === true ? {
        available: true,
        currency,
        gmvOnStream: sum(monthLive, (row) => row.gmv),
        netGmvReconciled: sum(reconciledLive, (row) => row.netGmv),
        netReceivedReconciled: sum(reconciledLive, (row) => row.netReceived),
        pendingReconciliation: monthLive.filter((row) => row.status === 'done').length,
        pendingPlatformSettlement: sum(reconciledLive.filter((row) => !row.settledDate), (row) => row.netReceived),
        gmvIsRevenue: false,
        provenance: 'LiveSession lifecycle; GMV, net GMV and net received remain distinct',
      } : { available: false, reason: 'livestream_capability_disabled' },
    },
  };
}

export function sanitizeCeoExecutiveSnapshot(value, expectedEntityId) {
  if (
    value?.contract !== CEO_EXECUTIVE_CONTRACT
    || value?.contractVersion !== CEO_EXECUTIVE_CONTRACT_VERSION
    || Number(value?.schemaVersion) !== CEO_EXECUTIVE_SCHEMA_VERSION
    || value?.entityId !== expectedEntityId
  ) throw new CeoExecutiveContractError('Executive snapshot contract mismatch.', 502, 'ceo_executive_contract_mismatch');
  if (value?.sections?.livestream?.available && value.sections.livestream.gmvIsRevenue !== false) {
    throw new CeoExecutiveContractError('GMV cannot be classified as revenue.', 502, 'ceo_executive_gmv_claim_rejected');
  }
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded, 'utf8') > 256 * 1024) {
    throw new CeoExecutiveContractError('Executive snapshot is too large.', 502, 'ceo_executive_snapshot_too_large');
  }
  return value;
}
