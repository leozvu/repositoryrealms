export const REALM_EMOTES = Object.freeze([
  Object.freeze({ id: 'wave', label: 'Vẫy chào', mark: 'HI' }),
  Object.freeze({ id: 'celebrate', label: 'Ăn mừng', mark: 'GG' }),
  Object.freeze({ id: 'thanks', label: 'Cảm ơn', mark: 'TY' }),
  Object.freeze({ id: 'help', label: 'Cần hỗ trợ', mark: '?' }),
]);

const EMOTE_BY_ID = new Map(REALM_EMOTES.map((emote) => [emote.id, emote]));

export function realmEmote(value) {
  const id = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return EMOTE_BY_ID.get(id) || null;
}

export function normalizeRealmText(value, maxLength = 500) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}
