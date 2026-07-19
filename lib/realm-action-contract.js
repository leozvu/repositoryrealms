export const REALM_TASK_TRANSITIONS = Object.freeze({
  todo: Object.freeze(['in_progress', 'blocked']),
  in_progress: Object.freeze(['review', 'blocked', 'todo']),
  review: Object.freeze(['done', 'in_progress', 'blocked']),
  blocked: Object.freeze(['in_progress', 'todo']),
  done: Object.freeze([]),
});

export const REALM_LEAD_TRANSITIONS = Object.freeze({
  new: Object.freeze(['contacted', 'lost']),
  contacted: Object.freeze(['proposal', 'lost']),
  proposal: Object.freeze(['negotiation', 'lost']),
  negotiation: Object.freeze(['won', 'lost']),
  won: Object.freeze([]),
  lost: Object.freeze([]),
});

export const REALM_STATE_LABELS = Object.freeze({
  todo: 'Chờ thực hiện',
  in_progress: 'Đang thực hiện',
  review: 'Đang review',
  blocked: 'Bị chặn',
  done: 'Hoàn tất',
  new: 'Tân thư',
  contacted: 'Đã tiếp kiến',
  proposal: 'Gửi chiếu thư',
  negotiation: 'Nghị sự',
  won: 'Kết minh ước',
  lost: 'Khép hồ sơ',
});

export function realmTaskTransitions(status) {
  return [...(REALM_TASK_TRANSITIONS[String(status || '')] || [])];
}

export function realmLeadTransitions(stage) {
  return [...(REALM_LEAD_TRANSITIONS[String(stage || '')] || [])];
}

export function realmStateLabel(state) {
  return REALM_STATE_LABELS[String(state || '')] || String(state || '');
}

export const REALM_FOLLOWUP_KINDS = Object.freeze(['call', 'meeting', 'email', 'note']);

export const REALM_FOLLOWUP_LABELS = Object.freeze({
  call: 'Điện đàm',
  meeting: 'Tiếp kiến',
  email: 'Thư tín',
  note: 'Ghi chú',
});

function cleanText(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .slice(0, max);
}

export function normalizeRealmTaskCommentDraft(value) {
  return cleanText(value, 800);
}

export function normalizeRealmFollowupDraft(input = {}) {
  const kind = String(input.kind || '').trim().toLowerCase();
  return {
    kind: REALM_FOLLOWUP_KINDS.includes(kind) ? kind : '',
    title: cleanText(input.title, 160).replace(/\s*\n\s*/g, ' '),
    date: String(input.date || '').trim(),
  };
}
