export const HR_EVIDENCE_RULE_VERSION = 'hr-evidence-outcome-v1.0.0';

const safeText = (value, fallback = '', max = 120) => {
  const text = String(value ?? '').trim();
  return (text || fallback).slice(0, max);
};
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(finite(value) * factor) / factor;
};
const instant = (value) => {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : null;
};

export function currentQuarter(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  return `${safe.getUTCFullYear()}-Q${Math.floor(safe.getUTCMonth() / 3) + 1}`;
}

export function quarterWindow(quarter) {
  const match = /^(\d{4})-Q([1-4])$/.exec(String(quarter || ''));
  if (!match) throw new Error('Quarter evidence không hợp lệ.');
  const year = Number(match[1]);
  const quarterNumber = Number(match[2]);
  const startMonth = (quarterNumber - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 1));
  return Object.freeze({
    quarter: `${year}-Q${quarterNumber}`,
    start,
    end,
    startDate: start.toISOString().slice(0, 10),
    endDateExclusive: end.toISOString().slice(0, 10),
  });
}

function insideWindow(value, window) {
  const timestamp = instant(value);
  return timestamp !== null && timestamp >= window.start.getTime() && timestamp < window.end.getTime();
}

function dateInsideWindow(value, window) {
  const date = String(value || '').slice(0, 10);
  return date >= window.startDate && date < window.endDateExclusive;
}

function layer({ units = 0, validatedUnits = 0, sourceClasses = [], provenance = [], facts = {} }) {
  const sources = [...new Set(sourceClasses.filter(Boolean))];
  const status = units <= 0
    ? 'missing'
    : validatedUnits > 0
      ? 'validated'
      : sources.length > 1
        ? 'mixed'
        : 'recorded';
  return Object.freeze({
    status,
    units: Math.max(0, Math.round(finite(units))),
    validatedUnits: Math.max(0, Math.round(finite(validatedUnits))),
    sourceClasses: Object.freeze(sources),
    provenance: Object.freeze([...new Set(provenance.filter(Boolean))]),
    facts: Object.freeze(facts),
    isPerformanceScore: false,
  });
}

function completionEvent(event) {
  return event?.toState === 'done' && Boolean(event?.receiptId);
}

function evidenceQueue({ person, tasks, eventsByTask, timeLogs, okrs, review, canValidate }) {
  const rows = [];
  const completed = tasks.filter((task) => task?.status === 'done');
  const missingCompletedAt = completed.filter((task) => !task?.completedAt).length;
  const missingReceipt = completed.filter((task) => !(eventsByTask.get(task.id) || []).some(completionEvent)).length;
  const unlinkedHours = round(timeLogs.filter((row) => !row?.taskId).reduce((sum, row) => sum + finite(row?.hours), 0), 2);
  const progressedOkrs = okrs.filter((row) => finite(row?.current) > 0).length;

  if (!review) {
    rows.push({
      id: `review-missing:${person.id}`,
      personId: person.id,
      personName: person.name,
      kind: 'manager_validation',
      severity: 'info',
      label: 'Chưa có phiếu review trong quý',
      explanation: canValidate
        ? 'Mở phiếu trước khi đưa ra kết luận HR; dữ liệu vận hành không thay thế cuộc review.'
        : 'HR hoặc quản lý chưa mở phiếu review cho quý này.',
      source: 'Review',
      href: '/reviews',
    });
  } else if (review.status === 'self_done') {
    rows.push({
      id: `review-waiting:${person.id}`,
      personId: person.id,
      personName: person.name,
      kind: 'manager_validation',
      severity: 'attention',
      label: 'Tự đánh giá đang chờ quản lý xác nhận',
      explanation: 'Self review vẫn là declared evidence cho tới khi quản lý xem ngữ cảnh và chốt.',
      source: 'Review.status=self_done',
      href: '/reviews',
    });
  } else if (review.status === 'pending') {
    rows.push({
      id: `review-pending:${person.id}`,
      personId: person.id,
      personName: person.name,
      kind: 'employee_context',
      severity: 'info',
      label: 'Phiếu review đang chờ phần tự đánh giá',
      explanation: 'Chưa đủ bối cảnh do nhân sự cung cấp; không suy luận từ attendance hoặc giờ log.',
      source: 'Review.status=pending',
      href: '/reviews',
    });
  }

  if (missingCompletedAt > 0) rows.push({
    id: `completion-time:${person.id}`,
    personId: person.id,
    personName: person.name,
    kind: 'data_quality',
    severity: 'attention',
    label: `${missingCompletedAt} output thiếu thời điểm hoàn tất`,
    explanation: 'Task đã ở trạng thái done nhưng chưa có completedAt trong snapshot; cần sửa provenance trước khi dùng làm bằng chứng.',
    source: 'Task.status + Task.completedAt',
    href: '/tasks',
  });

  if (missingReceipt > 0) rows.push({
    id: `completion-receipt:${person.id}`,
    personId: person.id,
    personName: person.name,
    kind: 'provenance_gap',
    severity: 'info',
    label: `${missingReceipt} output chưa có RepositoryRealms receipt`,
    explanation: 'Trạng thái done được ghi nhận, nhưng snapshot chưa có WorkItemEvent đi tới done kèm receipt.',
    source: 'Task + WorkItemEvent',
    href: '/tasks',
  });

  if (unlinkedHours > 0) rows.push({
    id: `timelog-context:${person.id}`,
    personId: person.id,
    personName: person.name,
    kind: 'context_gap',
    severity: 'info',
    label: `${unlinkedHours}h khai báo chưa gắn Task`,
    explanation: 'Giờ tự khai báo thiếu work-item context; đây là data-quality gap, không phải tín hiệu hiệu suất.',
    source: 'TimeLog.taskId',
    href: '/timesheet',
  });

  if (progressedOkrs > 0 && review?.status !== 'final') rows.push({
    id: `outcome-validation:${person.id}`,
    personId: person.id,
    personName: person.name,
    kind: 'manager_validation',
    severity: 'info',
    label: `${progressedOkrs} outcome khai báo chưa có review đã chốt`,
    explanation: 'Tiến độ OKR/KPI do người dùng cập nhật. Quản lý cần xác minh ngữ cảnh thay vì coi con số là observed truth.',
    source: 'Okr.current + Review.status',
    href: '/okr',
  });

  return rows;
}

const SEVERITY_ORDER = { attention: 0, info: 1 };

export function buildHrEvidenceOutcomeIntelligence({
  people = [],
  attendance = [],
  timeLogs = [],
  tasks = [],
  workEvents = [],
  okrs = [],
  reviews = [],
  quarter = currentQuarter(),
  today = new Date().toISOString().slice(0, 10),
  scope = { kind: 'self', canValidate: false },
} = {}) {
  const window = quarterWindow(quarter);
  const activePeople = people
    .filter((person) => person?.id && person?.status !== 'inactive' && person?.userType !== 'freelancer')
    .map((person) => ({
      id: safeText(person.id, 'unknown', 100),
      name: safeText(person.name, 'Nhân sự chưa đặt tên'),
      title: safeText(person.title, 'Thành viên'),
      teamId: person.teamId ? safeText(person.teamId, '', 100) : null,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'vi'));
  const allowedIds = new Set(activePeople.map((person) => person.id));
  const attendanceRows = attendance.filter((row) => allowedIds.has(row?.userId) && dateInsideWindow(row?.date, window));
  const timeLogRows = timeLogs.filter((row) => allowedIds.has(row?.userId) && dateInsideWindow(row?.date, window));
  const taskRows = tasks.filter((task) => allowedIds.has(task?.assigneeId) && (
    insideWindow(task?.completedAt, window)
    || (task?.status === 'done' && insideWindow(task?.updatedAt, window))
  ));
  const taskIds = new Set(taskRows.map((task) => task.id));
  const eventRows = workEvents.filter((event) => taskIds.has(event?.taskId) && insideWindow(event?.occurredAt, window));
  const okrRows = okrs.filter((row) => allowedIds.has(row?.userId) && row?.quarter === window.quarter);
  const reviewRows = reviews.filter((row) => allowedIds.has(row?.userId) && row?.quarter === window.quarter);
  const eventsByTask = new Map();
  for (const event of eventRows) {
    const list = eventsByTask.get(event.taskId) || [];
    list.push(event);
    eventsByTask.set(event.taskId, list);
  }

  const verificationQueue = [];
  const dossiers = activePeople.map((person) => {
    const personAttendance = attendanceRows.filter((row) => row.userId === person.id);
    const personTimeLogs = timeLogRows.filter((row) => row.userId === person.id);
    const personTasks = taskRows.filter((row) => row.assigneeId === person.id);
    const personTaskIds = new Set(personTasks.map((row) => row.id));
    const personEvents = eventRows.filter((row) => personTaskIds.has(row.taskId));
    const personOkrs = okrRows.filter((row) => row.userId === person.id);
    const review = reviewRows.find((row) => row.userId === person.id) || null;
    const completionReceipts = personEvents.filter(completionEvent).length;
    const completedWithTimestamp = personTasks.filter((row) => row.status === 'done' && row.completedAt).length;
    const declaredHours = round(personTimeLogs.reduce((sum, row) => sum + finite(row?.hours), 0), 2);
    const targetReached = personOkrs.filter((row) => finite(row?.target) > 0 && finite(row?.current) >= finite(row?.target)).length;
    const finalReviews = review?.status === 'final' ? 1 : 0;

    const layers = Object.freeze({
      presence: layer({
        units: personAttendance.length,
        sourceClasses: personAttendance.length ? ['declared'] : [],
        provenance: personAttendance.length ? ['Attendance record'] : [],
        facts: {
          recordedDays: personAttendance.length,
          presentDays: personAttendance.filter((row) => row.status === 'present').length,
          remoteDays: personAttendance.filter((row) => row.status === 'remote').length,
          offDays: personAttendance.filter((row) => row.status === 'off').length,
          latestDate: personAttendance.map((row) => row.date).sort().at(-1) || null,
        },
      }),
      activity: layer({
        units: personTimeLogs.length + personEvents.length,
        sourceClasses: [personTimeLogs.length ? 'declared' : null, personEvents.length ? 'observed' : null],
        provenance: [personTimeLogs.length ? 'TimeLog' : null, personEvents.length ? 'WorkItemEvent receipt' : null],
        facts: {
          declaredHours,
          timeLogEntries: personTimeLogs.length,
          repositoryEvents: personEvents.length,
          linkedTimeLogs: personTimeLogs.filter((row) => row.taskId).length,
        },
      }),
      output: layer({
        units: personTasks.length,
        validatedUnits: 0,
        sourceClasses: [personTasks.length ? 'observed' : null],
        provenance: [personTasks.length ? 'Task.status=done' : null, completionReceipts ? 'RepositoryRealms receipt' : null],
        facts: {
          completedTasks: personTasks.length,
          completedWithTimestamp,
          completionReceipts,
        },
      }),
      outcome: layer({
        units: personOkrs.length + (review ? 1 : 0),
        validatedUnits: finalReviews,
        sourceClasses: [personOkrs.length ? 'declared' : null, review ? (finalReviews ? 'validated' : 'declared') : null],
        provenance: [personOkrs.length ? 'Okr.current' : null, review ? 'Review.status' : null],
        facts: {
          personalOkrs: personOkrs.length,
          reportedTargetsReached: targetReached,
          reviewStatus: review?.status || 'not_opened',
          managerValidatedReviews: finalReviews,
        },
      }),
    });
    const queue = evidenceQueue({
      person,
      tasks: personTasks,
      eventsByTask,
      timeLogs: personTimeLogs,
      okrs: personOkrs,
      review,
      canValidate: scope?.canValidate === true,
    });
    verificationQueue.push(...queue);
    return Object.freeze({
      person: Object.freeze(person),
      layers,
      evidenceGapCount: queue.length,
      allLayersRecorded: Object.values(layers).every((item) => item.units > 0),
      performanceConclusion: null,
    });
  });

  verificationQueue.sort((left, right) => (
    (SEVERITY_ORDER[left.severity] ?? 9) - (SEVERITY_ORDER[right.severity] ?? 9)
    || left.personName.localeCompare(right.personName, 'vi')
    || left.id.localeCompare(right.id)
  ));

  const layerKeys = ['presence', 'activity', 'output', 'outcome'];
  const layerOverview = Object.fromEntries(layerKeys.map((key) => [key, Object.freeze({
    peopleWithEvidence: dossiers.filter((row) => row.layers[key].units > 0).length,
    evidenceUnits: dossiers.reduce((sum, row) => sum + row.layers[key].units, 0),
    validatedUnits: dossiers.reduce((sum, row) => sum + row.layers[key].validatedUnits, 0),
  })]));

  return Object.freeze({
    ruleVersion: HR_EVIDENCE_RULE_VERSION,
    quarter: window.quarter,
    asOf: safeText(today, window.startDate, 10),
    summary: Object.freeze({
      people: dossiers.length,
      peopleWithAllLayersRecorded: dossiers.filter((row) => row.allLayersRecorded).length,
      verificationItems: verificationQueue.length,
      managerValidationItems: verificationQueue.filter((row) => row.kind === 'manager_validation').length,
      peopleWithManagerValidatedReview: dossiers.filter((row) => row.layers.outcome.facts.managerValidatedReviews > 0).length,
    }),
    layerOverview: Object.freeze(layerOverview),
    verificationQueue: Object.freeze(verificationQueue.map((row) => Object.freeze(row))),
    dossiers: Object.freeze(dossiers),
    scope: Object.freeze({
      kind: ['company', 'team', 'self'].includes(scope?.kind) ? scope.kind : 'self',
      canValidate: scope?.canValidate === true,
      teamId: scope?.teamId ? safeText(scope.teamId, '', 100) : null,
    }),
    provenance: Object.freeze({
      presence: 'Attendance is user/HR recorded presence, not productivity.',
      activity: 'TimeLog is declared; WorkItemEvent is a canonical business action receipt.',
      output: 'Task done is recorded output; receipt coverage is shown separately.',
      outcome: 'OKR progress is declared; a final Review adds manager context but is not automatic proof of business impact.',
      evidenceLedgerUsed: false,
      evidenceLedgerReason: 'Phase 0 collection remains disabled and manager-wide ledger reads are not activated.',
    }),
    policy: Object.freeze({
      advisoryOnly: true,
      compositePerformanceScore: false,
      employeeRanking: false,
      presenceAsProductivity: false,
      activityAsObservedTruth: false,
      automaticHrDecision: false,
      automaticGold: false,
      automaticPayroll: false,
      automaticDiscipline: false,
      automaticTermination: false,
      managerValidationRequired: true,
    }),
  });
}
