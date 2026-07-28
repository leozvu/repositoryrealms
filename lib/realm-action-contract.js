export const REALM_TASK_TRANSITIONS = Object.freeze({
  todo: Object.freeze(['doing', 'in_progress', 'waiting', 'blocked']),
  doing: Object.freeze(['review', 'waiting', 'blocked', 'todo']),
  in_progress: Object.freeze(['review', 'waiting', 'blocked', 'todo']),
  review: Object.freeze(['done', 'doing', 'in_progress', 'waiting', 'blocked']),
  waiting: Object.freeze(['doing', 'in_progress', 'blocked', 'todo']),
  blocked: Object.freeze(['doing', 'in_progress', 'waiting', 'todo']),
  done: Object.freeze([]),
  merged: Object.freeze([]),
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
  doing: 'Đang thực hiện',
  in_progress: 'Đang thực hiện',
  review: 'Đang review',
  waiting: 'Đang chờ',
  blocked: 'Bị chặn',
  done: 'Hoàn tất',
  merged: 'Đã hợp nhất',
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
