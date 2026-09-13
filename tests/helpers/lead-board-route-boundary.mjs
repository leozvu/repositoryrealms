export const leadBoardRouteState = { user: null, db: null, enabled: true, enabledReads: 0 };
export const prisma = new Proxy({}, { get: (_target, key) => leadBoardRouteState.db[key] });
export const currentUser = async () => leadBoardRouteState.user;
export const resourceEnabled = async () => { leadBoardRouteState.enabledReads++; return leadBoardRouteState.enabled; };
export const NextResponse = { json: (body, options = {}) => ({ body, status: options.status ?? 200, headers: options.headers ?? {} }) };
