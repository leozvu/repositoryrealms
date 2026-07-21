export const RESOURCE_INTELLIGENCE_RULE_VERSION = 'resource-intelligence-v1';

export const RESOURCE_WORK_TYPES = Object.freeze([
  Object.freeze({ key: 'design', label: 'Thiết kế' }),
  Object.freeze({ key: 'content', label: 'Nội dung' }),
  Object.freeze({ key: 'campaign', label: 'Chiến dịch' }),
  Object.freeze({ key: 'development', label: 'Phát triển' }),
  Object.freeze({ key: 'operations', label: 'Vận hành' }),
  Object.freeze({ key: 'sales', label: 'Kinh doanh' }),
  Object.freeze({ key: 'finance', label: 'Tài chính' }),
  Object.freeze({ key: 'other', label: 'Khác' }),
]);

export const RESOURCE_COMPLEXITIES = Object.freeze([
  Object.freeze({ key: 'small', label: 'Nhỏ' }),
  Object.freeze({ key: 'medium', label: 'Vừa' }),
  Object.freeze({ key: 'large', label: 'Lớn' }),
  Object.freeze({ key: 'unknown', label: 'Chưa rõ' }),
]);

const WORK_TYPE_SET = new Set(RESOURCE_WORK_TYPES.map((item) => item.key));
const COMPLEXITY_SET = new Set(RESOURCE_COMPLEXITIES.map((item) => item.key));
const TERMINAL = new Set(['done', 'merged']);

function round(value, digits = 1) {
  if (!Number.isFinite(Number(value))) return 0;
  const scale = 10 ** digits;
  return Math.round(Number(value) * scale) / scale;
}

function median(values) {
  const sorted = values.map(Number).filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percent(numerator, denominator) {
  if (!(Number(denominator) > 0) || !Number.isFinite(Number(numerator))) return null;
  return Math.round((Number(numerator) / Number(denominator)) * 100);
}

export function normalizedResourceWorkType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return WORK_TYPE_SET.has(normalized) ? normalized : null;
}

export function normalizedResourceComplexity(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return COMPLEXITY_SET.has(normalized) ? normalized : null;
}

export function resourceClassification(task = {}) {
  return {
    workType: normalizedResourceWorkType(task.workType),
    complexity: normalizedResourceComplexity(task.complexity),
  };
}

function historicalPool(task, samples) {
  const classification = resourceClassification(task);
  if (!classification.workType) return [];
  const sameType = samples.filter((sample) => sample.id !== task.id
    && TERMINAL.has(String(sample.status))
    && normalizedResourceWorkType(sample.workType) === classification.workType
    && Number(sample.actualHours) > 0);
  const exact = classification.complexity
    ? sameType.filter((sample) => normalizedResourceComplexity(sample.complexity) === classification.complexity)
    : [];
  // Three exact samples are enough to avoid silently mixing complexity bands.
  return exact.length >= 3 ? exact : sameType;
}

function confidenceFor(sampleSize) {
  if (!sampleSize) return {
    band: 'unrated',
    label: 'Chưa đủ dữ liệu',
    reason: 'Chưa có Task hoàn tất cùng nhóm với TimeLog hợp lệ.',
  };
  if (sampleSize < 3) return {
    band: 'low',
    label: 'Tham khảo thấp',
    reason: `Chỉ có ${sampleSize} mẫu; chưa đủ để coi là baseline ổn định.`,
  };
  return {
    band: 'medium',
    label: 'Tham khảo vừa',
    reason: `${sampleSize} mẫu lịch sử; confidence bị giới hạn ở medium vì TimeLog hiện là dữ liệu tự khai báo.`,
  };
}

function signalFor({ estimateHours, actualHours, historicalHours, sampleSize, status }) {
  if (!(estimateHours > 0)) return { key: 'estimate_missing', level: 'attention', label: 'Thiếu estimate', explanation: 'Cần khai báo phạm vi trước khi so sánh nguồn lực.' };
  const terminal = TERMINAL.has(String(status));
  const consumed = percent(actualHours, estimateHours);
  if (!terminal && consumed !== null && consumed >= 100) {
    return { key: 'estimate_consumed', level: 'attention', label: 'Đã dùng hết estimate', explanation: `TimeLog đã đạt ${consumed}% estimate trong khi Task chưa hoàn tất.` };
  }
  const historicalDeviation = historicalHours == null ? null : percent(estimateHours - historicalHours, historicalHours);
  if (sampleSize >= 3 && historicalDeviation !== null && Math.abs(historicalDeviation) >= 75) {
    return {
      key: 'estimate_outlier',
      level: 'attention',
      label: 'Estimate lệch baseline',
      explanation: `Estimate lệch ${historicalDeviation > 0 ? '+' : ''}${historicalDeviation}% so với median lịch sử; cần xem lại scope, không tự động bác bỏ.`,
    };
  }
  const finalVariance = terminal && actualHours > 0 ? percent(actualHours - estimateHours, estimateHours) : null;
  if (finalVariance !== null && Math.abs(finalVariance) >= 50) {
    return {
      key: 'actual_variance',
      level: 'review',
      label: 'Cần review variance',
      explanation: `TimeLog cuối cùng lệch ${finalVariance > 0 ? '+' : ''}${finalVariance}% so với estimate.`,
    };
  }
  if (!sampleSize) return { key: 'baseline_building', level: 'info', label: 'Đang tạo baseline', explanation: 'Phân loại đã có nhưng chưa đủ Task hoàn tất cùng nhóm.' };
  return { key: 'within_range', level: 'stable', label: 'Trong vùng tham khảo', explanation: 'Chưa phát hiện độ lệch cần manager review theo rule hiện tại.' };
}

export function buildTaskResourceIntelligence(task = {}, historicalSamples = [], latestRevision = null) {
  const pool = historicalPool(task, historicalSamples);
  const actualValues = pool.map((sample) => Number(sample.actualHours)).filter((value) => value > 0);
  const historicalHours = median(actualValues);
  const estimateHours = round(Math.max(0, Number(task.estHours) || 0));
  const actualHours = round(Math.max(0, Number(task.actualHours) || 0));
  const sampleSize = actualValues.length;
  const confidence = confidenceFor(sampleSize);
  const signal = signalFor({ estimateHours, actualHours, historicalHours, sampleSize, status: task.status });
  const estimateSource = latestRevision?.kind === 'manager_adjustment'
    ? 'manager_validated'
    : latestRevision?.kind === 'declared'
      ? 'employee_declared'
      : estimateHours > 0 ? 'legacy_declared' : 'missing';

  return Object.freeze({
    estimate: Object.freeze({
      hours: estimateHours,
      source: estimateSource,
      revisionAt: latestRevision?.createdAt || null,
    }),
    actual: Object.freeze({
      hours: actualHours,
      source: 'declared_timelog',
      isObservedTruth: false,
    }),
    historical: Object.freeze({
      medianHours: historicalHours == null ? null : round(historicalHours),
      averageHours: sampleSize ? round(actualValues.reduce((sum, value) => sum + value, 0) / sampleSize) : null,
      sampleSize,
      workType: normalizedResourceWorkType(task.workType),
      complexity: normalizedResourceComplexity(task.complexity),
    }),
    variance: Object.freeze({
      estimateVsHistoricalPercent: historicalHours == null ? null : percent(estimateHours - historicalHours, historicalHours),
      actualVsEstimatePercent: estimateHours > 0 && actualHours > 0 ? percent(actualHours - estimateHours, estimateHours) : null,
      consumedPercent: estimateHours > 0 ? percent(actualHours, estimateHours) : null,
      final: TERMINAL.has(String(task.status)),
    }),
    confidence: Object.freeze(confidence),
    signal: Object.freeze(signal),
    explanation: Object.freeze({
      ruleVersion: RESOURCE_INTELLIGENCE_RULE_VERSION,
      advisoryOnly: true,
      employeeRanking: false,
      payrollUse: false,
      goldUse: false,
      presenceAsProductivity: false,
      correctionPath: 'Task estimate revision + TimeLog correction workflow',
    }),
  });
}

export function summarizeResourceIntelligence(tasks = []) {
  const insights = tasks.map((task) => task.intelligence).filter(Boolean);
  return Object.freeze({
    classified: insights.filter((item) => item.historical.workType).length,
    estimateMissing: insights.filter((item) => item.signal.key === 'estimate_missing').length,
    baselineReady: insights.filter((item) => item.historical.sampleSize >= 3).length,
    attention: insights.filter((item) => ['attention', 'review'].includes(item.signal.level)).length,
    estimatedHours: round(insights.reduce((sum, item) => sum + item.estimate.hours, 0)),
    declaredLoggedHours: round(insights.reduce((sum, item) => sum + item.actual.hours, 0)),
    confidenceCeiling: 'medium',
    advisoryOnly: true,
    employeeRanking: false,
  });
}
