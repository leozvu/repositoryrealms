export const FINANCIAL_INTELLIGENCE_RULE_VERSION = 'financial-operating-intelligence-v1';

const DAY_MS = 86_400_000;
const SEVERITY = { critical: 0, attention: 1, info: 2 };

function amount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function round(value, digits = 0) {
  if (!Number.isFinite(Number(value))) return 0;
  const scale = 10 ** digits;
  return Math.round(Number(value) * scale) / scale;
}

function percent(numerator, denominator) {
  return Number(denominator) > 0 ? round((Number(numerator) / Number(denominator)) * 100, 1) : null;
}

function strictArray(value) {
  try {
    const parsed = Array.isArray(value) ? value : JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isoDay(value) {
  const day = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function monthKey(value) {
  const day = isoDay(value);
  return day ? day.slice(0, 7) : null;
}

function addMonths(month, offset) {
  const [year, value] = month.split('-').map(Number);
  const next = new Date(Date.UTC(year, value - 1 + offset, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
}

function dueBucket(day, currentMonth, horizon) {
  const month = monthKey(day);
  if (!month) return null;
  if (month <= currentMonth) return currentMonth;
  return horizon.includes(month) ? month : null;
}

function isOverdue(day, today) {
  const due = isoDay(day);
  return Boolean(due && due < today);
}

function daysOverdue(day, today) {
  const due = isoDay(day);
  if (!due || due >= today) return 0;
  return Math.max(0, Math.floor((new Date(`${today}T00:00:00Z`) - new Date(`${due}T00:00:00Z`)) / DAY_MS));
}

function toVnd(value, fxRate = 1) {
  return round(amount(value) * Math.max(0, Number(fxRate) || 1));
}

function invoiceSnapshot(invoice) {
  const items = strictArray(invoice?.items);
  const payments = strictArray(invoice?.payments);
  if (!items || !payments) {
    return Object.freeze({ valid: false, id: invoice?.id || null, code: invoice?.code || 'Invoice không rõ' });
  }
  const subtotal = items.reduce((sum, item) => sum + amount(item?.qty) * amount(item?.price), 0);
  const fxRate = Math.max(0, Number(invoice?.fxRate) || 1);
  const total = round(subtotal * (1 + amount(invoice?.vat) / 100) * fxRate);
  const paid = round(payments.reduce((sum, payment) => sum + amount(payment?.amount), 0) * fxRate);
  return Object.freeze({
    valid: true,
    id: invoice.id,
    code: invoice.code || 'Invoice không rõ',
    projectId: invoice.projectId || null,
    status: String(invoice.status || 'draft'),
    date: isoDay(invoice.date),
    dueDate: isoDay(invoice.dueDate),
    total,
    paid: Math.min(total, paid),
    remaining: Math.max(0, total - paid),
  });
}

function rateOf(user) {
  if (!user) return 0;
  return user.userType === 'freelancer'
    ? amount(user.hourlyRate)
    : round(amount(user.salary) / 176);
}

function projectAccumulator(project) {
  return {
    projectId: project.id,
    name: project.name || 'Dự án chưa đặt tên',
    status: project.status || null,
    revenueTarget: amount(project.budget),
    declaredHours: 0,
    billableHours: 0,
    unbilledBillableHours: 0,
    taskLinkedHours: 0,
    laborAccrued: 0,
    vendorCommitted: 0,
    vendorPaid: 0,
    invoiced: 0,
    collected: 0,
    receivable: 0,
    overdueReceivable: 0,
  };
}

function finalizeProject(row) {
  const operatingCostProxy = round(row.laborAccrued + row.vendorCommitted);
  const operatingMarginProxy = round(row.invoiced - operatingCostProxy);
  const marginPercent = percent(operatingMarginProxy, row.invoiced);
  const marginBand = row.invoiced <= 0
    ? 'unknown'
    : operatingMarginProxy < 0 ? 'negative' : marginPercent < 20 ? 'thin' : 'positive';
  return Object.freeze({
    ...row,
    declaredHours: round(row.declaredHours, 2),
    billableHours: round(row.billableHours, 2),
    unbilledBillableHours: round(row.unbilledBillableHours, 2),
    taskLinkedHours: round(row.taskLinkedHours, 2),
    laborAccrued: round(row.laborAccrued),
    vendorCommitted: round(row.vendorCommitted),
    vendorPaid: round(row.vendorPaid),
    invoiced: round(row.invoiced),
    collected: round(row.collected),
    receivable: round(row.receivable),
    overdueReceivable: round(row.overdueReceivable),
    operatingCostProxy,
    operatingMarginProxy,
    marginPercent,
    marginBand,
    billedValuePerDeclaredHour: row.declaredHours > 0 ? round(row.invoiced / row.declaredHours) : null,
    operatingMarginProxyPerDeclaredHour: row.declaredHours > 0 ? round(operatingMarginProxy / row.declaredHours) : null,
    isAccountingProfit: false,
  });
}

function pushQueue(queue, item) {
  queue.push(Object.freeze(item));
}

export function buildFinancialOperatingIntelligence({
  projects = [],
  timeLogs = [],
  usersById = {},
  invoices = [],
  vendorBills = [],
  transactions = [],
  budgets = [],
  recurringExpenses = [],
  today = new Date().toISOString().slice(0, 10),
} = {}) {
  const effectiveToday = isoDay(today) || new Date().toISOString().slice(0, 10);
  const currentMonth = effectiveToday.slice(0, 7);
  const horizon = [currentMonth, addMonths(currentMonth, 1), addMonths(currentMonth, 2)];
  const projectRows = new Map(projects.map((project) => [project.id, projectAccumulator(project)]));
  const queue = [];
  const invoiceRows = invoices.map(invoiceSnapshot);
  const validInvoices = invoiceRows.filter((invoice) => invoice.valid && !['cancelled', 'void'].includes(invoice.status));
  const invalidInvoices = invoiceRows.filter((invoice) => !invoice.valid);

  let declaredHours = 0;
  let billableHours = 0;
  let unbilledBillableHours = 0;
  let taskLinkedHours = 0;
  let laborAccrued = 0;
  let missingRateHours = 0;
  let unassignedProjectHours = 0;
  for (const log of timeLogs) {
    const hours = amount(log.hours);
    if (!hours) continue;
    const rate = rateOf(usersById[log.userId]);
    const cost = hours * rate;
    declaredHours += hours;
    if (log.billable) billableHours += hours;
    if (log.billable && !log.invoiceId) unbilledBillableHours += hours;
    if (log.taskId) taskLinkedHours += hours;
    if (!rate) missingRateHours += hours;
    laborAccrued += cost;
    const project = projectRows.get(log.projectId);
    if (!project) {
      unassignedProjectHours += hours;
      continue;
    }
    project.declaredHours += hours;
    project.laborAccrued += cost;
    if (log.billable) project.billableHours += hours;
    if (log.billable && !log.invoiceId) project.unbilledBillableHours += hours;
    if (log.taskId) project.taskLinkedHours += hours;
  }

  let vendorCommitted = 0;
  let vendorPaid = 0;
  let payable = 0;
  let overduePayable = 0;
  let unassignedVendorBills = 0;
  for (const bill of vendorBills) {
    const value = amount(bill.amount);
    vendorCommitted += value;
    if (bill.status === 'paid') vendorPaid += value;
    else {
      payable += value;
      if (isOverdue(bill.dueDate, effectiveToday)) overduePayable += value;
    }
    const project = projectRows.get(bill.projectId);
    if (project) {
      project.vendorCommitted += value;
      if (bill.status === 'paid') project.vendorPaid += value;
    } else if (bill.projectId) unassignedVendorBills += 1;
  }

  let invoiced = 0;
  let collected = 0;
  let receivable = 0;
  let overdueReceivable = 0;
  let unassignedInvoices = 0;
  for (const invoice of validInvoices) {
    invoiced += invoice.total;
    collected += invoice.paid;
    receivable += invoice.remaining;
    if (invoice.remaining > 0 && isOverdue(invoice.dueDate, effectiveToday)) overdueReceivable += invoice.remaining;
    const project = projectRows.get(invoice.projectId);
    if (project) {
      project.invoiced += invoice.total;
      project.collected += invoice.paid;
      project.receivable += invoice.remaining;
      if (invoice.remaining > 0 && isOverdue(invoice.dueDate, effectiveToday)) project.overdueReceivable += invoice.remaining;
    } else if (invoice.projectId) unassignedInvoices += 1;
  }

  let ledgerIncome = 0;
  let ledgerExpense = 0;
  const currentMonthExpenseByCategory = new Map();
  for (const transaction of transactions) {
    const value = toVnd(transaction.amount, transaction.fxRate);
    if (transaction.type === 'income') ledgerIncome += value;
    if (transaction.type === 'expense') {
      ledgerExpense += value;
      if (monthKey(transaction.date) === currentMonth) {
        const category = String(transaction.category || 'Khác');
        currentMonthExpenseByCategory.set(category, (currentMonthExpenseByCategory.get(category) || 0) + value);
      }
    }
  }
  const cashBalance = round(ledgerIncome - ledgerExpense);

  const budgetRows = budgets.filter((budget) => budget.month === currentMonth).map((budget) => {
    const planned = amount(budget.amount);
    const actual = currentMonthExpenseByCategory.get(String(budget.category || 'Khác')) || 0;
    const usagePercent = percent(actual, planned);
    const band = planned > 0 && actual >= planned ? 'over' : planned > 0 && actual >= planned * 0.8 ? 'near' : 'within';
    return Object.freeze({ category: budget.category || 'Khác', planned, actual, remaining: round(planned - actual), usagePercent, band });
  }).sort((a, b) => a.category.localeCompare(b.category, 'vi'));

  const scheduledByMonth = new Map(horizon.map((month) => [month, { receivable: 0, payable: 0, recurring: 0 }]));
  for (const invoice of validInvoices.filter((row) => row.remaining > 0)) {
    const bucket = dueBucket(invoice.dueDate, currentMonth, horizon);
    if (bucket) scheduledByMonth.get(bucket).receivable += invoice.remaining;
  }
  for (const bill of vendorBills.filter((row) => row.status !== 'paid')) {
    const bucket = dueBucket(bill.dueDate, currentMonth, horizon);
    if (bucket) scheduledByMonth.get(bucket).payable += amount(bill.amount);
  }
  const recurringTemplateAmount = recurringExpenses.filter((row) => row.active).reduce((sum, row) => sum + amount(row.amount), 0);
  let opening = cashBalance;
  const cashForecast = horizon.map((month, index) => {
    const scheduled = scheduledByMonth.get(month);
    const recurring = index === 0 ? 0 : recurringTemplateAmount;
    const closing = round(opening + scheduled.receivable - scheduled.payable - recurring);
    const row = Object.freeze({
      month,
      openingBalance: round(opening),
      scheduledReceipts: round(scheduled.receivable),
      scheduledVendorPayments: round(scheduled.payable),
      futureRecurringTemplates: round(recurring),
      closingBalance: closing,
      band: closing < 0 ? 'negative' : closing < Math.max(1, recurringTemplateAmount) ? 'thin' : 'positive',
    });
    opening = closing;
    return row;
  });

  for (const invoice of invalidInvoices) pushQueue(queue, {
    id: `invoice-data:${invoice.id}`,
    kind: 'data_quality',
    severity: 'critical',
    label: `Kiểm tra dữ liệu ${invoice.code}`,
    explanation: 'Items hoặc payments không đọc được; Financial Intelligence không đoán số tiền.',
    source: 'Invoice.items + Invoice.payments',
    action: 'repair_invoice_record',
    entityId: invoice.id,
  });
  for (const invoice of validInvoices.filter((row) => row.remaining > 0 && isOverdue(row.dueDate, effectiveToday))) pushQueue(queue, {
    id: `receivable-overdue:${invoice.id}`,
    kind: 'receivable',
    severity: 'critical',
    label: `${invoice.code} quá hạn ${daysOverdue(invoice.dueDate, effectiveToday)} ngày`,
    explanation: `Còn phải thu ${round(invoice.remaining).toLocaleString('vi-VN')} ₫.`,
    source: 'Invoice dueDate + payment history',
    action: 'review_receivable',
    entityId: invoice.id,
    projectId: invoice.projectId,
  });
  for (const bill of vendorBills.filter((row) => row.status !== 'paid' && isOverdue(row.dueDate, effectiveToday))) pushQueue(queue, {
    id: `payable-overdue:${bill.id}`,
    kind: 'payable',
    severity: 'critical',
    label: `${bill.code || 'Vendor bill'} quá hạn ${daysOverdue(bill.dueDate, effectiveToday)} ngày`,
    explanation: `Còn phải trả ${round(amount(bill.amount)).toLocaleString('vi-VN')} ₫.`,
    source: 'VendorBill dueDate + status',
    action: 'review_payable',
    entityId: bill.id,
    projectId: bill.projectId || null,
  });
  for (const project of projectRows.values()) {
    if (project.unbilledBillableHours > 0) pushQueue(queue, {
      id: `unbilled-hours:${project.projectId}`,
      kind: 'billing',
      severity: 'attention',
      label: `${project.name}: ${round(project.unbilledBillableHours, 1)} giờ chưa xuất hóa đơn`,
      explanation: 'Giờ billable đã khai báo nhưng chưa được gắn Invoice.',
      source: 'TimeLog.billable + TimeLog.invoiceId',
      action: 'review_unbilled_hours',
      projectId: project.projectId,
    });
  }
  for (const project of [...projectRows.values()].map(finalizeProject).filter((row) => row.marginBand === 'negative')) pushQueue(queue, {
    id: `margin-negative:${project.projectId}`,
    kind: 'project_economics',
    severity: 'attention',
    label: `${project.name}: margin proxy đang âm`,
    explanation: 'Invoice thấp hơn chi phí giờ công khai báo và vendor commitment; cần kiểm tra dữ liệu và phạm vi dự án.',
    source: 'Invoice + declared TimeLog current rate + VendorBill',
    action: 'review_project_economics',
    projectId: project.projectId,
  });
  for (const budget of budgetRows.filter((row) => row.band !== 'within')) pushQueue(queue, {
    id: `budget:${currentMonth}:${budget.category}`,
    kind: 'budget',
    severity: budget.band === 'over' ? 'critical' : 'attention',
    label: `${budget.category}: ${budget.band === 'over' ? 'vượt' : 'gần'} ngân sách tháng`,
    explanation: `${budget.actual.toLocaleString('vi-VN')} ₫ / ${budget.planned.toLocaleString('vi-VN')} ₫ đã ghi sổ.`,
    source: 'Budget + Transaction expense',
    action: 'review_budget',
  });
  for (const forecast of cashForecast.filter((row) => row.closingBalance < 0)) pushQueue(queue, {
    id: `forecast-negative:${forecast.month}`,
    kind: 'cash_forecast',
    severity: 'critical',
    label: `Lịch tiền ${forecast.month} dự kiến âm`,
    explanation: `Closing schedule view ${forecast.closingBalance.toLocaleString('vi-VN')} ₫; chưa bao gồm payroll và chi phí chưa có chứng từ.`,
    source: 'Transaction cash + Invoice/VendorBill due dates + future recurring templates',
    action: 'review_cash_schedule',
  });
  if (missingRateHours > 0) pushQueue(queue, {
    id: 'missing-cost-rate', kind: 'data_quality', severity: 'attention',
    label: `${round(missingRateHours, 1)} giờ chưa có cost rate`,
    explanation: 'Không thể cộng labor cost cho TimeLog có salary/hourlyRate bằng 0.',
    source: 'TimeLog + User current rate', action: 'review_cost_rate',
  });
  if (unassignedProjectHours || unassignedVendorBills || unassignedInvoices) pushQueue(queue, {
    id: 'project-linkage-gap', kind: 'data_quality', severity: 'attention',
    label: 'Có chứng từ chưa nối được dự án',
    explanation: `${round(unassignedProjectHours, 1)} giờ, ${unassignedVendorBills} vendor bill và ${unassignedInvoices} invoice tham chiếu project ngoài snapshot.`,
    source: 'Project linkage', action: 'review_project_linkage',
  });

  const projectEconomics = [...projectRows.values()].map(finalizeProject)
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  queue.sort((a, b) => (SEVERITY[a.severity] ?? 9) - (SEVERITY[b.severity] ?? 9) || a.label.localeCompare(b.label, 'vi'));
  const operatingCostProxy = round(laborAccrued + vendorCommitted);
  const operatingMarginProxy = round(invoiced - operatingCostProxy);

  return Object.freeze({
    ruleVersion: FINANCIAL_INTELLIGENCE_RULE_VERSION,
    asOf: effectiveToday,
    summary: Object.freeze({
      cashBalance,
      ledgerIncome: round(ledgerIncome),
      ledgerExpense: round(ledgerExpense),
      invoiced: round(invoiced),
      collected: round(collected),
      receivable: round(receivable),
      overdueReceivable: round(overdueReceivable),
      payable: round(payable),
      overduePayable: round(overduePayable),
      declaredHours: round(declaredHours, 2),
      billableHours: round(billableHours, 2),
      unbilledBillableHours: round(unbilledBillableHours, 2),
      taskLinkedHours: round(taskLinkedHours, 2),
      laborAccrued: round(laborAccrued),
      vendorCommitted: round(vendorCommitted),
      vendorPaid: round(vendorPaid),
      operatingCostProxy,
      operatingMarginProxy,
      cashContributionProxy: round(collected - laborAccrued - vendorPaid),
      billedValuePerDeclaredHour: declaredHours > 0 ? round(invoiced / declaredHours) : null,
      operatingMarginProxyPerDeclaredHour: declaredHours > 0 ? round(operatingMarginProxy / declaredHours) : null,
      managerQueueItems: queue.length,
      isAccountingProfit: false,
    }),
    cashForecast: Object.freeze(cashForecast),
    currentMonthBudget: Object.freeze({ month: currentMonth, rows: Object.freeze(budgetRows) }),
    managerQueue: Object.freeze(queue),
    projects: Object.freeze(projectEconomics),
    dataQuality: Object.freeze({
      malformedInvoices: invalidInvoices.length,
      missingRateHours: round(missingRateHours, 2),
      taskLinkCoveragePercent: percent(taskLinkedHours, declaredHours),
      unassignedProjectHours: round(unassignedProjectHours, 2),
    }),
    provenance: Object.freeze({
      cashBalance: 'recorded_transactions_vnd',
      invoiced: 'invoice_documents_not_revenue_recognition',
      collected: 'invoice_payment_history_cross_checked_separately_from_cash_ledger',
      laborCost: 'declared_timelog_x_current_rate_not_payroll',
      vendorCost: 'vendorbill_commitment_and_payment_status',
      cashForecast: 'schedule_view_excludes_payroll_and_unrecorded_costs',
      activityIsObservedTruth: false,
      confidence: Object.freeze({ ceiling: 'low', reason: 'TimeLog tự khai báo, rate hiện tại không phải historical payroll và lịch thu/chi không đảm bảo xảy ra.' }),
    }),
    policy: Object.freeze({
      advisoryOnly: true,
      accountingProfit: false,
      revenueRecognition: false,
      automaticPayment: false,
      automaticInvoiceCreation: false,
      employeeRanking: false,
      individualProfitability: false,
    }),
  });
}
