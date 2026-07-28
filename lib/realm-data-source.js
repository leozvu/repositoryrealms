export function realmDataSourceMode({ erpHref = null, syncEnabled = false } = {}) {
  const isErp = Boolean(erpHref);
  const syncRequested = isErp && syncEnabled === true;
  return {
    kind: isErp ? 'erp' : 'demo',
    isErp,
    allowDemoFixtures: !isErp,
    operationsSource: isErp ? 'erp' : 'local',
    syncRequested,
    initialSyncState: isErp ? (syncRequested ? 'connecting' : 'unavailable') : 'local',
  };
}

export function realmInitialOperations(mode, demoOperations = {}) {
  if (mode?.isErp) {
    return { quests: [], ledger: [], wallet: 0, renown: 0, completedQuests: 0, streakDays: 0 };
  }
  return demoOperations;
}

export function realmInitialMessages(mode, demoMessages = []) {
  return mode?.allowDemoFixtures ? demoMessages : [];
}

export function realmLocalFixture(mode, value) {
  return mode?.allowDemoFixtures ? value : null;
}
