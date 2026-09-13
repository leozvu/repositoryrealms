export const state = { user: null, db: null };
export const currentUser = async () => state.user;
export const prisma = new Proxy({}, { get(_target, key) { return state.db[key]; } });
