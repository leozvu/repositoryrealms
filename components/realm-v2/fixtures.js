export const metrics = [
  { label: 'Open work', value: '24', meta: '5 due this week', icon: 'checklist', tone: 'warning' },
  { label: 'Pending decisions', value: '7', meta: '2 high risk', icon: 'approval', tone: 'danger' },
  { label: 'Delivery health', value: '92%', meta: 'Within plan', icon: 'chart', tone: 'success' },
  { label: 'Verified receipts', value: '148', meta: 'This month', icon: 'receipt', tone: 'info' },
];

export const tasks = [
  { id: 'TSK-420', title: 'Finalize Q3 operating plan', summary: 'Consolidate capacity, cash and delivery assumptions for the executive review.', progress: 72, priority: 'High', due: '31 Jul', owner: 'Vũ Lương Sơn', source: 'ERP Task', freshness: '2 min ago' },
  { id: 'TSK-417', title: 'Review livestream settlement', summary: 'Reconcile creator payouts against verified session receipts.', progress: 48, priority: 'Medium', due: '01 Aug', owner: 'Lan Phạm', source: 'Egolive Ops', freshness: 'Live' },
  { id: 'TSK-409', title: 'Approve North Star handoff', summary: 'Check scope, capacity and authorization before changing delivery ownership.', progress: 90, priority: 'High', due: 'Today', owner: 'Minh Quân', source: 'RepositoryRealms', freshness: 'Live' },
  { id: 'TSK-401', title: 'Publish client launch brief', summary: 'Prepare an accessible client-facing summary and decision log.', progress: 100, priority: 'Low', due: 'Completed', owner: 'Mai Anh', source: 'ERP Project', freshness: 'Verified' },
];

export const approvals = [
  { id: 'APR-118', type: 'Owner change', title: 'North Star delivery ownership', summary: 'Transfer accountable delivery ownership from Mai Anh to Minh Quân. Existing task assignees remain unchanged.', risk: 'High', source: 'RepositoryRealms · PRJ-204', requester: 'Vũ Lương Sơn', age: '12 min' },
  { id: 'APR-116', type: 'Finance', title: 'Egolive creator settlement batch', summary: 'Approve 18 verified payouts after matching livestream session receipts and exception notes.', risk: 'Medium', source: 'Finance ledger · SET-77', requester: 'Lan Phạm', age: '48 min' },
  { id: 'APR-109', type: 'Access', title: 'Temporary group workforce access', summary: 'Grant VNECOM project visibility to two Egoric delivery staff until 15 August.', risk: 'Medium', source: 'Identity policy · IAM-44', requester: 'Minh Quân', age: '2 h' },
];

export const messages = [
  { id: 'MSG-88', subject: 'Decision needed: campaign scope', preview: 'The client accepted the schedule but requested one additional delivery format.', from: 'Mai Anh', time: '10:18', channel: 'Project North Star', read: false },
  { id: 'MSG-86', subject: 'Settlement exceptions resolved', preview: 'All three exceptions now have source documents and owner notes.', from: 'Lan Phạm', time: '09:42', channel: 'Egolive Finance', read: false },
  { id: 'MSG-81', subject: 'Capacity update for next week', preview: 'Design has 12 hours available after the current launch window.', from: 'Minh Quân', time: 'Yesterday', channel: 'Operations', read: true },
];

export const workRows = [
  { id: 'PRJ-204', title: 'North Star campaign', owner: 'Mai Anh', status: 'At risk', tone: 'warning', due: '02 Aug', source: 'ERP Project', freshness: 'Live' },
  { id: 'PRJ-197', title: 'Egolive creator program', owner: 'Lan Phạm', status: 'On plan', tone: 'success', due: '09 Aug', source: 'Egolive Ops', freshness: '5 min ago' },
  { id: 'CRM-884', title: 'VNECOM retail pipeline', owner: 'Minh Quân', status: 'Needs decision', tone: 'danger', due: 'Today', source: 'CRM Lead', freshness: 'Live' },
  { id: 'OPS-063', title: 'Group access review', owner: 'Vũ Lương Sơn', status: 'In review', tone: 'info', due: '01 Aug', source: 'Identity', freshness: 'Verified' },
];

export const timeline = [
  { id: 1, time: '10:42', title: 'Settlement batch confirmed', body: '18 creator payouts were confirmed after canonical finance receipts were returned.', receipt: 'RR-0729-A821' },
  { id: 2, time: '10:26', title: 'Project owner change approved', body: 'Maker-checker approval completed. Execution is still pending.', receipt: null },
  { id: 3, time: '09:58', title: 'Capacity forecast refreshed', body: 'Read model updated from ERP time logs and committed project estimates.', receipt: 'RR-0729-8CB2' },
  { id: 4, time: '09:12', title: 'Access request proposed', body: 'Temporary cross-entity access was proposed for two Egoric staff members.', receipt: null },
  { id: 5, time: 'Yesterday · 17:48', title: 'Client brief published', body: 'Version 6 became the current approved brief.', receipt: 'RR-0728-9A02' },
];

export const people = [
  { name: 'Mai Anh', role: 'Design Lead', open: 5, capacity: 86, presence: 'Available' },
  { name: 'Minh Quân', role: 'Operations Director', open: 7, capacity: 74, presence: 'Focus time' },
  { name: 'Lan Phạm', role: 'Finance & HR', open: 4, capacity: 62, presence: 'Available' },
  { name: 'Quang Võ', role: 'Account Executive', open: 8, capacity: 94, presence: 'Available' },
];

export const notificationRows = [
  { id: 'NOT-42', title: 'Approval assigned to you', owner: 'RepositoryRealms', status: 'Unread', tone: 'info', due: '12 min ago', source: 'Approval', freshness: 'Live' },
  { id: 'NOT-41', title: 'Project source is stale', owner: 'North Star', status: 'Attention', tone: 'warning', due: '31 min ago', source: 'Project', freshness: '31 min ago' },
  { id: 'NOT-38', title: 'Command execution confirmed', owner: 'System receipt', status: 'Read', tone: 'success', due: '2 h ago', source: 'Chronicle', freshness: 'Verified' },
];

export const recognitionRows = [
  { id: 'GLD-3008', title: 'Client launch contribution', owner: 'Mai Anh', status: '+8 Gold', tone: 'success', due: '28 Jul', source: 'Recognition policy', freshness: 'Verified receipt' },
  { id: 'GLD-3007', title: 'Livestream settlement support', owner: 'Lan Phạm', status: '+5 Gold', tone: 'success', due: '27 Jul', source: 'Recognition policy', freshness: 'Verified receipt' },
  { id: 'GLD-3006', title: 'Manual correction', owner: 'Vũ Lương Sơn', status: 'Reversed', tone: 'warning', due: '26 Jul', source: 'Ledger correction', freshness: 'Verified receipt' },
];

export const executiveMetrics = [
  { label: 'Cash balance', value: '₫4.82B', meta: '+3.2% MoM', icon: 'cash', tone: 'success' },
  { label: 'Recognized revenue', value: '₫1.26B', meta: 'July to date', icon: 'chart', tone: 'info' },
  { label: 'Operating expenses', value: '₫684M', meta: '54% of revenue', icon: 'ledger', tone: 'warning' },
  { label: 'Accounts receivable', value: '₫392M', meta: '₫71M overdue', icon: 'receipt', tone: 'danger' },
  { label: 'Accounts payable', value: '₫218M', meta: 'Next 30 days', icon: 'ledger', tone: 'warning' },
  { label: 'Qualified pipeline', value: '₫2.1B', meta: 'Weighted ₫910M', icon: 'chart', tone: 'info' },
  { label: 'Egolive GMV', value: '₫760M', meta: 'Not recognized revenue', icon: 'cash', tone: 'neutral' },
  { label: 'Settlement pending', value: '₫94M', meta: '18 verified items', icon: 'clock', tone: 'warning' },
];
