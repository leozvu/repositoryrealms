const QUEST_STATUSES = new Set(['active', 'ready', 'claimed']);

export const REALM_OPERATIONS_STORAGE_KEY = 'crmegoric-realms-operations-v1';

const finiteNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function cloneQuest(quest) {
  const total = Math.max(1, Math.round(finiteNumber(quest?.total, 1)));
  const progress = clamp(Math.round(finiteNumber(quest?.progress, 0)), 0, total);
  let status = QUEST_STATUSES.has(quest?.status) ? quest.status : 'active';
  if (status === 'active' && progress === total) status = 'ready';
  if (status === 'ready' && progress < total) status = 'active';
  return { ...quest, progress, total, status };
}

function cloneLedgerEntry(entry, index) {
  const amount = Math.round(finiteNumber(entry?.amount, 0));
  const semanticType = typeof entry?.type === 'string' && /^[a-z][a-z0-9_-]{0,39}$/.test(entry.type)
    ? entry.type
    : amount >= 0 ? 'earn' : 'spend';
  return {
    id: String(entry?.id || `realm-entry-${index}`),
    at: String(entry?.at || 'Không rõ'),
    type: semanticType,
    amount,
    label: String(entry?.label || 'Điều chỉnh Gold').slice(0, 120),
    sourceId: entry?.sourceId ? String(entry.sourceId).slice(0, 80) : undefined,
  };
}

export function createRealmOperations({
  quests = [],
  ledger = [],
  wallet = 0,
  renown = 1280,
  completedQuests = 7,
  streakDays = 8,
} = {}) {
  return {
    quests: quests.map(cloneQuest),
    ledger: ledger.slice(0, 100).map(cloneLedgerEntry),
    wallet: Math.max(0, Math.round(finiteNumber(wallet, 0))),
    renown: Math.max(0, Math.round(finiteNumber(renown, 0))),
    completedQuests: Math.max(0, Math.round(finiteNumber(completedQuests, 0))),
    streakDays: Math.max(0, Math.round(finiteNumber(streakDays, 0))),
  };
}

export function normalizeRealmOperations(value, fallback) {
  const base = createRealmOperations(fallback);
  if (!value || typeof value !== 'object') return base;
  const savedQuests = new Map(Array.isArray(value.quests) ? value.quests.map((quest) => [quest?.id, quest]) : []);
  const quests = base.quests.map((quest) => {
    const saved = savedQuests.get(quest.id);
    return cloneQuest(saved ? { ...quest, progress: saved.progress, status: saved.status } : quest);
  });
  const ledger = Array.isArray(value.ledger) && value.ledger.length
    ? value.ledger.slice(0, 100).map(cloneLedgerEntry)
    : base.ledger;
  return createRealmOperations({
    quests,
    ledger,
    wallet: clamp(finiteNumber(value.wallet, base.wallet), 0, 1_000_000),
    renown: clamp(finiteNumber(value.renown, base.renown), 0, 10_000_000),
    completedQuests: clamp(finiteNumber(value.completedQuests, base.completedQuests), 0, 1_000_000),
    streakDays: clamp(finiteNumber(value.streakDays, base.streakDays), 0, 3650),
  });
}

export function advanceRealmQuest(state, questId) {
  const quest = state.quests.find((item) => item.id === questId);
  if (!quest || quest.status !== 'active') return state;
  const progress = Math.min(quest.total, quest.progress + 1);
  return {
    ...state,
    quests: state.quests.map((item) => item.id === questId
      ? { ...item, progress, status: progress === item.total ? 'ready' : 'active' }
      : item),
  };
}

export function claimRealmQuest(state, questId, { entryId, at = 'Vừa xong' } = {}) {
  const quest = state.quests.find((item) => item.id === questId);
  if (!quest || quest.status !== 'ready') return state;
  return {
    ...state,
    quests: state.quests.map((item) => item.id === questId ? { ...item, status: 'claimed' } : item),
    wallet: state.wallet + quest.reward,
    renown: state.renown + quest.renown,
    completedQuests: state.completedQuests + 1,
    ledger: [{
      id: entryId || `quest-${quest.id}-${state.completedQuests + 1}`,
      at,
      type: 'earn',
      amount: quest.reward,
      label: `Quest: ${quest.title}`,
      sourceId: quest.businessRef || quest.id,
    }, ...state.ledger].slice(0, 100),
  };
}

export function spendRealmGold(state, item, { entryId, at = 'Vừa xong' } = {}) {
  const price = Math.max(0, Math.round(finiteNumber(item?.price, 0)));
  if (!price || state.wallet < price) return state;
  return {
    ...state,
    wallet: state.wallet - price,
    ledger: [{
      id: entryId || `spend-${item.id || state.ledger.length}`,
      at,
      type: 'spend',
      amount: -price,
      label: `Đổi: ${String(item.name || 'Vật phẩm')}`,
      sourceId: item?.id ? String(item.id) : undefined,
    }, ...state.ledger].slice(0, 100),
  };
}

export function summarizeRealmCareer(state) {
  const renown = Math.max(0, finiteNumber(state?.renown, 0));
  const level = 11 + Math.max(0, Math.floor((renown - 1000) / 250));
  const levelFloor = 1000 + Math.max(0, level - 11) * 250;
  const nextLevelRenown = levelFloor + 250;
  const quests = Array.isArray(state?.quests) ? state.quests : [];
  const criteria = quests.reduce((sum, quest) => sum + finiteNumber(quest.total, 0), 0);
  const progress = quests.reduce((sum, quest) => sum + finiteNumber(quest.progress, 0), 0);
  return {
    level,
    renown,
    nextLevelRenown,
    levelProgress: clamp(Math.round(((renown - levelFloor) / 250) * 100), 0, 100),
    completedQuests: Math.max(0, Math.round(finiteNumber(state?.completedQuests, 0))),
    streakDays: Math.max(0, Math.round(finiteNumber(state?.streakDays, 0))),
    completionPercent: criteria ? Math.round((progress / criteria) * 100) : 0,
    openQuests: quests.filter((quest) => quest.status !== 'claimed').length,
    readyQuests: quests.filter((quest) => quest.status === 'ready').length,
    totalEarned: (state?.ledger || []).reduce((sum, entry) => sum + Math.max(0, finiteNumber(entry.amount, 0)), 0),
  };
}
