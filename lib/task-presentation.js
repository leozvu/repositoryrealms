import { realmTaskTransitions } from './realm-action-contract.js';

const PRIMARY_ACTIONS = Object.freeze({
  todo: Object.freeze({ nextState: 'doing', label: 'Bắt đầu' }),
  doing: Object.freeze({ nextState: 'review', label: 'Gửi review' }),
  in_progress: Object.freeze({ nextState: 'review', label: 'Gửi review' }),
  review: Object.freeze({ nextState: 'done', label: 'Hoàn tất' }),
  waiting: Object.freeze({ nextState: 'doing', label: 'Tiếp tục' }),
});

// Presentation only: the canonical action endpoint still checks ownership,
// dependencies, authorization and compare-and-swap before issuing a receipt.
// Both work surfaces must offer the same review step, including legacy states.
export function nextTaskAction(task) {
  const action = PRIMARY_ACTIONS[task?.status];
  return action && realmTaskTransitions(task.status).includes(action.nextState) ? action : null;
}

export function taskSnapshotFreshness(generatedAt, { loading = false, locale = 'vi-VN' } = {}) {
  if (loading) return 'Đang cập nhật…';
  const date = generatedAt ? new Date(generatedAt) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Chưa rõ thời điểm cập nhật';
  return `Cập nhật ${new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(date)}`;
}
