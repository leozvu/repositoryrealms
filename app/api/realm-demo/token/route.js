import { issueRealmToken } from '@/lib/realm-token';
import { realmErrorResponse, realmJsonResponse } from '@/lib/realm-api-response';
import { startRealmApiRequest } from '@/lib/realm-observability';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const safeText = (value, maxLength) => typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

function allowedMap(requestedMap) {
  const maps = (process.env.REALM_MAP_IDS || 'castle').split(',').map((item) => item.trim()).filter(Boolean);
  return maps.includes(requestedMap) ? requestedMap : maps[0];
}

function iceServersFromEnvironment() {
  const servers = [];
  const stunUrls = (process.env.REALM_STUN_URLS || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (stunUrls.length) servers.push({ urls: stunUrls });

  const turnUrl = safeText(process.env.REALM_TURN_URL, 500);
  const turnUsername = safeText(process.env.REALM_TURN_USERNAME, 200);
  const turnCredential = safeText(process.env.REALM_TURN_CREDENTIAL, 500);
  if (turnUrl && turnUsername && turnCredential) {
    servers.push({ urls: turnUrl, username: turnUsername, credential: turnCredential });
  }
  return servers;
}

export async function POST(request) {
  const trace = startRealmApiRequest(request, { route: 'realm.token', operation: 'token.issue' });
  const secret = process.env.REALM_SIGNAL_SECRET;
  if (!secret) {
    return realmJsonResponse(trace, { error: 'Realm signaling chưa được cấu hình.', code: 'realm_signal_disabled' }, { status: 503, code: 'realm_signal_disabled', outcome: 'disabled' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return realmJsonResponse(trace, { error: 'Payload không hợp lệ.', code: 'invalid_json' }, { status: 400, code: 'invalid_json', outcome: 'rejected' });
  }

  const sessionId = safeText(body.sessionId, 96);
  const name = safeText(body.profile?.name, 40) || 'Realm Adventurer';
  const mapId = allowedMap(safeText(body.mapId, 64) || 'castle');
  const realmId = safeText(process.env.REALM_ID, 64) || 'crmegoric-demo';
  if (!sessionId) return realmJsonResponse(trace, { error: 'Thiếu session ID.', code: 'realm_session_required' }, { status: 400, code: 'realm_session_required', outcome: 'rejected' });

  const guestMode = process.env.REALM_DEMO_ALLOW_GUESTS === '1';
  let userId = '';
  if (!guestMode) {
    const { currentUser } = await import('@/lib/auth');
    const user = await currentUser();
    if (!user) return realmJsonResponse(trace, { error: 'Bạn cần đăng nhập để vào Realm.', code: 'unauthorized' }, { status: 401, code: 'unauthorized', outcome: 'rejected' });
    userId = user.id;
  }

  try {
    const token = issueRealmToken({ sub: sessionId, realmId, mapId, name, userId }, secret, { ttlSeconds: 300 });
    return realmJsonResponse(trace, {
      token,
      realmId,
      mapId,
      iceServers: iceServersFromEnvironment(),
      expiresIn: 300,
      authMode: guestMode ? 'isolated-demo' : 'crm-session',
    }, { code: 'realm_token_issued' });
  } catch (error) {
    return realmErrorResponse(trace, error, { fallbackMessage: 'Không thể cấp Realm token.', fallbackCode: 'realm_token_error' });
  }
}
