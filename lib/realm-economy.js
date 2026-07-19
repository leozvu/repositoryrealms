import { REALM_REWARD_LIMITS, realmRewardPeriod, realmRewardPeriodRange } from './realm-rewards.js';

export const REALM_ECONOMY_THRESHOLDS = Object.freeze({
  concentrationPercent: 35,
  minimumConcentrationGold: 10,
  repeatWindowHours: 24,
  repeatCount: 3,
  adjustmentCapPercent: 10,
  minimumAdjustmentGold: 10,
});

const integer = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback;
const round1 = (value) => Math.round((Number(value) || 0) * 10) / 10;

function safeDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysInUtcMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}

function normalizeEntry(entry, index) {
  const createdAt = safeDate(entry?.createdAt);
  if (!createdAt) return null;
  const amount = integer(entry?.amount);
  return {
    id: String(entry?.id || `gold-entry-${index + 1}`),
    userId: String(entry?.userId || 'unknown'),
    userName: String(entry?.userName || entry?.user?.name || 'Thành viên chưa xác định'),
    teamId: entry?.teamId || entry?.user?.teamId || null,
    teamName: String(entry?.teamName || entry?.user?.teamName || 'Chưa phân đội'),
    title: String(entry?.title || entry?.user?.title || 'Thành viên'),
    type: String(entry?.type || 'adjustment'),
    amount,
    renown: Math.max(0, integer(entry?.renown)),
    label: String(entry?.label || 'Gold journal entry'),
    sourceType: entry?.sourceType ? String(entry.sourceType) : null,
    sourceId: entry?.sourceId ? String(entry.sourceId) : null,
    createdAt: createdAt.toISOString(),
    createdAtMs: createdAt.getTime(),
  };
}

function normalizeRewardRow(row, index) {
  return {
    id: String(row?.id || `reward-row-${index + 1}`),
    taskId: String(row?.taskId || row?.id || `task-${index + 1}`),
    title: String(row?.title || 'Quest chưa đặt tên'),
    assigneeId: String(row?.assigneeId || row?.userId || `unknown-${index + 1}`),
    assignee: String(row?.assignee || row?.userName || 'Chưa giao'),
    teamId: row?.teamId || null,
    teamName: String(row?.teamName || 'Chưa phân đội'),
    gold: Math.max(0, integer(row?.gold)),
    status: String(row?.status || 'draft'),
    rewardIssued: Boolean(row?.rewardIssued),
  };
}

function alertRecord(code, severity, title, summary, evidence, recommendation) {
  return { id: code, code, severity, title, summary, evidence, recommendation, advisoryOnly: true };
}

function findRapidRepeats(entries, threshold) {
  const byUser = new Map();
  for (const entry of entries.filter((row) => row.amount > 0 && row.type !== 'redemption_release')) {
    if (!byUser.has(entry.userId)) byUser.set(entry.userId, []);
    byUser.get(entry.userId).push(entry);
  }
  let strongest = null;
  const windowMs = threshold.repeatWindowHours * 60 * 60 * 1000;
  for (const rows of byUser.values()) {
    rows.sort((a, b) => a.createdAtMs - b.createdAtMs);
    let start = 0;
    for (let end = 0; end < rows.length; end += 1) {
      while (rows[end].createdAtMs - rows[start].createdAtMs > windowMs) start += 1;
      const count = end - start + 1;
      if (count >= threshold.repeatCount && (!strongest || count > strongest.count)) {
        const windowRows = rows.slice(start, end + 1);
        strongest = {
          count,
          userName: rows[end].userName,
          gold: windowRows.reduce((sum, row) => sum + row.amount, 0),
          start: windowRows[0].createdAt,
          end: windowRows.at(-1).createdAt,
        };
      }
    }
  }
  return strongest;
}

function buildPeople(entries, rewardRows, issued) {
  const people = new Map();
  const ensure = (row) => {
    const id = row.userId || row.assigneeId;
    if (!people.has(id)) people.set(id, {
      userId: id,
      name: row.userName || row.assignee,
      title: row.title || 'Thành viên',
      teamId: row.teamId || null,
      teamName: row.teamName || 'Chưa phân đội',
      issued: 0,
      spent: 0,
      committed: 0,
      pending: 0,
      reserved: 0,
    });
    return people.get(id);
  };
  for (const entry of entries) {
    const person = ensure(entry);
    if (entry.amount > 0 && entry.type !== 'redemption_release') person.issued += entry.amount;
    if (entry.amount < 0 && entry.type !== 'redemption_hold') person.spent += Math.abs(entry.amount);
    if (entry.type === 'redemption_hold') person.reserved += Math.abs(entry.amount);
    if (entry.type === 'redemption_release') person.reserved -= Math.max(0, entry.amount);
  }
  for (const row of rewardRows) {
    const person = ensure(row);
    if (row.status === 'approved' && !row.rewardIssued) person.committed += row.gold;
    if (row.status === 'pending') person.pending += row.gold;
  }
  return [...people.values()]
    .map((person) => ({
      ...person,
      reserved: Math.max(0, person.reserved),
      totalExposure: person.issued + person.committed,
      sharePercent: issued > 0 ? round1((person.issued / issued) * 100) : 0,
    }))
    .sort((a, b) => b.totalExposure - a.totalExposure || a.name.localeCompare(b.name, 'vi'));
}

function buildTeams(people, issued) {
  const teams = new Map();
  for (const person of people) {
    const key = person.teamId || person.teamName;
    const current = teams.get(key) || { teamId: person.teamId, teamName: person.teamName, issued: 0, spent: 0, committed: 0, reserved: 0, members: 0 };
    current.issued += person.issued;
    current.spent += person.spent;
    current.committed += person.committed;
    current.reserved += person.reserved;
    current.members += 1;
    teams.set(key, current);
  }
  return [...teams.values()]
    .map((team) => ({ ...team, sharePercent: issued > 0 ? round1((team.issued / issued) * 100) : 0 }))
    .sort((a, b) => b.issued - a.issued || a.teamName.localeCompare(b.teamName, 'vi'));
}

export function createRealmEconomySnapshot({ entries = [], rewardRows = [], budget = {}, now = new Date(), source = 'local', actor = null, permissions = null } = {}) {
  const current = safeDate(now);
  if (!current) throw new TypeError('Economy snapshot requires a valid date.');
  const period = realmRewardPeriod(current);
  const { start, end } = realmRewardPeriodRange(period);
  const normalizedEntries = entries
    .map(normalizeEntry)
    .filter((row) => row && row.createdAtMs >= start.getTime() && row.createdAtMs < end.getTime())
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
  const normalizedRewards = rewardRows.map(normalizeRewardRow);
  const cap = Math.max(1, integer(budget?.cap, REALM_REWARD_LIMITS.defaultMonthlyGoldCap));
  const perUserCap = Math.max(1, integer(budget?.perUserCap, REALM_REWARD_LIMITS.defaultPerUserGoldCap));
  const totalDays = daysInUtcMonth(current);
  const elapsedDays = Math.max(1, Math.min(totalDays, current.getUTCDate()));
  const issued = normalizedEntries.reduce((sum, row) => sum + (row.amount > 0 && row.type !== 'redemption_release' ? row.amount : 0), 0);
  const spent = normalizedEntries.reduce((sum, row) => sum + (row.amount < 0 && row.type !== 'redemption_hold' ? Math.abs(row.amount) : 0), 0);
  const held = normalizedEntries.reduce((sum, row) => sum + (row.type === 'redemption_hold' ? Math.abs(row.amount) : 0), 0);
  const released = normalizedEntries.reduce((sum, row) => sum + (row.type === 'redemption_release' ? Math.max(0, row.amount) : 0), 0);
  const reserved = Math.max(0, held - released);
  const netFlow = normalizedEntries.reduce((sum, row) => sum + row.amount, 0);
  const committed = normalizedRewards.filter((row) => row.status === 'approved' && !row.rewardIssued).reduce((sum, row) => sum + row.gold, 0);
  const pending = normalizedRewards.filter((row) => row.status === 'pending').reduce((sum, row) => sum + row.gold, 0);
  const burnRate = round1(issued / elapsedDays);
  const forecastIssued = Math.round(burnRate * totalDays);
  const forecastUsage = forecastIssued + committed;
  const currentUsage = issued + committed;
  const people = buildPeople(normalizedEntries, normalizedRewards, issued);
  const teams = buildTeams(people, issued);
  const daily = Array.from({ length: totalDays }, (_, index) => ({ day: index + 1, issued: 0, spent: 0, net: 0 }));
  for (const entry of normalizedEntries) {
    const bucket = daily[new Date(entry.createdAt).getUTCDate() - 1];
    if (entry.amount > 0 && entry.type !== 'redemption_release') bucket.issued += entry.amount;
    if (entry.amount < 0 && entry.type !== 'redemption_hold') bucket.spent += Math.abs(entry.amount);
    bucket.net += entry.amount;
  }

  const alerts = [];
  if ((permissions?.scope || 'company') === 'company' && forecastUsage > cap) {
    alerts.push(alertRecord(
      'monthly_forecast_over_cap', 'critical', 'Dự báo vượt trần tháng',
      `Đà phát hành hiện tại dự kiến dùng ${forecastUsage} Gold, cao hơn trần ${cap} Gold.`,
      [`Forecast phát hành: ${forecastIssued} Gold`, `Cam kết approved: ${committed} Gold`, `Chênh lệch: +${forecastUsage - cap} Gold`],
      'Hội đồng nên rà lại nhịp phát hành và các commitment; không tự động hủy reward đã duyệt.',
    ));
  }
  const topPerson = people[0];
  if (issued >= REALM_ECONOMY_THRESHOLDS.minimumConcentrationGold && topPerson?.sharePercent >= REALM_ECONOMY_THRESHOLDS.concentrationPercent) {
    alerts.push(alertRecord(
      'user_concentration_high', 'warning', 'Gold tập trung vào một thành viên',
      `${topPerson.name} nhận ${topPerson.sharePercent}% Gold đã phát hành trong kỳ.`,
      [`Đã phát hành cho thành viên: ${topPerson.issued} Gold`, `Tổng phát hành: ${issued} Gold`, `Ngưỡng quan sát: ${REALM_ECONOMY_THRESHOLDS.concentrationPercent}%`],
      'Đối chiếu phạm vi, độ khó và nghiệm thu của các Quest; tỷ lệ cao không đồng nghĩa với sai phạm.',
    ));
  }
  const overUser = people.find((person) => person.totalExposure > perUserCap);
  if (overUser) {
    alerts.push(alertRecord(
      'user_cap_exposure', 'critical', 'Nghĩa vụ cá nhân vượt policy',
      `${overUser.name} có ${overUser.totalExposure} Gold đã phát hành + cam kết, vượt trần ${perUserCap} Gold/người.`,
      [`Đã phát hành: ${overUser.issued} Gold`, `Cam kết approved: ${overUser.committed} Gold`, `Vượt: ${overUser.totalExposure - perUserCap} Gold`],
      'Kiểm tra dữ liệu nguồn và policy đã duyệt trước khi mở thêm commitment.',
    ));
  }
  const repeat = findRapidRepeats(normalizedEntries, REALM_ECONOMY_THRESHOLDS);
  if (repeat) {
    alerts.push(alertRecord(
      'rapid_repeat_rewards', 'warning', 'Cụm phát hành dày trong 24 giờ',
      `${repeat.count} bút toán dương cho ${repeat.userName} nằm trong một cửa sổ ${REALM_ECONOMY_THRESHOLDS.repeatWindowHours} giờ.`,
      [`Tổng cụm: ${repeat.gold} Gold`, `Từ ${repeat.start.slice(0, 16).replace('T', ' ')} UTC`, `Đến ${repeat.end.slice(0, 16).replace('T', ' ')} UTC`],
      'Đối chiếu idempotency key và Task nguồn để loại trừ retry hoặc tách reward bất thường.',
    ));
  }
  const adjustmentThreshold = Math.max(
    REALM_ECONOMY_THRESHOLDS.minimumAdjustmentGold,
    Math.ceil((cap * REALM_ECONOMY_THRESHOLDS.adjustmentCapPercent) / 100),
  );
  const largeAdjustment = normalizedEntries.find((row) => row.type === 'adjustment' && Math.abs(row.amount) >= adjustmentThreshold);
  if (largeAdjustment) {
    alerts.push(alertRecord(
      'manual_adjustment_spike', 'warning', 'Điều chỉnh thủ công quy mô lớn',
      `Bút toán “${largeAdjustment.label}” điều chỉnh ${largeAdjustment.amount > 0 ? '+' : ''}${largeAdjustment.amount} Gold.`,
      [`Người nhận: ${largeAdjustment.userName}`, `Ngưỡng kỳ này: ${adjustmentThreshold} Gold`, `Nguồn: ${largeAdjustment.sourceType || 'manual'} / ${largeAdjustment.sourceId || 'không có mã'}`],
      'Yêu cầu reviewer đối chiếu chứng từ và lý do adjustment; cảnh báo không tự đảo bút toán.',
    ));
  }
  if (!alerts.length) {
    alerts.push(alertRecord(
      'economy_within_policy', 'info', 'Chưa thấy tín hiệu vượt ngưỡng',
      'Dòng Gold hiện nằm trong các ngưỡng quan sát đã cấu hình.',
      [`Phát hành: ${issued} Gold`, `Forecast + commitment: ${forecastUsage}/${cap} Gold`],
      'Tiếp tục theo dõi; trạng thái này không phải chứng nhận hiệu suất hay kiểm toán tài chính.',
    ));
  }

  return {
    source,
    period,
    generatedAt: current.toISOString(),
    actor,
    permissions,
    policy: {
      cap,
      perUserCap,
      status: budget?.policyStatus || 'default-policy',
      advisoryOnly: true,
    },
    metrics: {
      issued,
      spent,
      reserved,
      netFlow,
      committed,
      pending,
      currentUsage,
      currentRemaining: cap - currentUsage,
      elapsedDays,
      totalDays,
      burnRate,
      forecastIssued,
      forecastUsage,
      forecastRemaining: cap - forecastUsage,
      forecastUtilization: Math.round((forecastUsage / cap) * 100),
    },
    daily,
    people,
    teams,
    alerts,
    ledger: normalizedEntries.map(({ createdAtMs, ...entry }) => entry),
  };
}

function utcDay(now, requestedDay, hour = 10) {
  const lastElapsedDay = Math.max(1, now.getUTCDate());
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), Math.min(requestedDay, lastElapsedDay), hour));
}

export function createRealmEconomyDemoSnapshot(rewardDashboard = {}, now = new Date()) {
  const current = safeDate(now) || new Date();
  const people = [
    { userId: 'staff-mai', userName: 'Mai Anh', teamId: 'creative', teamName: 'Creative Guild', title: 'Art Director' },
    { userId: 'staff-quang', userName: 'Quang Võ', teamId: 'delivery', teamName: 'Delivery Guild', title: 'Project Manager' },
    { userId: 'staff-nghia', userName: 'Nghĩa Nguyễn', teamId: 'engineering', teamName: 'Engineering Guild', title: 'Realm Engineer' },
    { userId: 'staff-lan', userName: 'Lan Phạm', teamId: 'people', teamName: 'People Guild', title: 'People Operations' },
  ];
  const make = (id, person, day, amount, type, label, sourceId, hour = 10) => ({
    id, ...person, amount, type, label, sourceType: type === 'shop_spend' ? 'shop' : type === 'adjustment' ? 'manual_review' : 'task',
    sourceId, createdAt: utcDay(current, day, hour),
  });
  const entries = [
    make('demo-gold-1', people[0], 2, 12, 'quest_reward', 'Nghiệm thu chiến dịch Hạ chí', 'TASK-MKT-042'),
    make('demo-gold-2', people[1], 4, 7, 'quest_reward', 'Bàn giao kế hoạch Rồng Xanh', 'TASK-PM-118'),
    make('demo-gold-3', people[0], 5, 8, 'quest_reward', 'Hoàn tất bộ nhận diện Guild', 'TASK-DES-091'),
    make('demo-gold-4', people[1], 7, -5, 'shop_spend', 'Đổi vật phẩm huy hiệu Guild', 'SHOP-BADGE-04'),
    make('demo-gold-5', people[0], 8, 2, 'quest_reward', 'Nghiệm thu banner ra mắt', 'TASK-DES-102', 9),
    make('demo-gold-6', people[0], 8, 1, 'quest_reward', 'Nghiệm thu social kit', 'TASK-DES-103', 12),
    make('demo-gold-7', people[0], 8, 1, 'quest_reward', 'Nghiệm thu email kit', 'TASK-DES-104', 15),
    make('demo-gold-8', people[2], 10, 6, 'quest_reward', 'Ổn định Realm gateway', 'TASK-ENG-077'),
    make('demo-gold-9', people[0], 12, 18, 'adjustment', 'Điều chỉnh theo biên bản nghiệm thu bổ sung', 'ADJ-2026-014'),
    make('demo-gold-10', people[3], 14, 5, 'quest_reward', 'Hoàn tất onboarding Guild', 'TASK-HR-030'),
  ];
  const identityByName = new Map(people.map((person) => [person.userName, person]));
  const rewardRows = (rewardDashboard?.rows || []).map((row) => ({ ...row, ...(identityByName.get(row.assignee) || {}) }));
  return createRealmEconomySnapshot({
    entries,
    rewardRows,
    budget: rewardDashboard?.budget || {},
    now: current,
    source: 'local',
    actor: rewardDashboard?.actor || { id: 'demo-observer', name: 'Hội đồng Gold', roleLabel: 'Economy observer · sandbox' },
    permissions: { canView: true, scope: 'company', demo: true },
  });
}
