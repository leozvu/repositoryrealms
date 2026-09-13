export const state = { user: null, db: null, enabled: true };
export const currentUser = async () => state.user;
export const resourceEnabled = async () => state.enabled;
export const prisma = new Proxy({}, { get(_target, key) { return state.db[key]; } });
