import { Icon } from '@/components/ui';

const ICONS = {
  empty: 'folder', loading: 'repeat', error: 'warning', offline: 'warning',
  restricted: 'restricted', filtered: 'filter', success: 'check',
};

export default function StatePanel({
  state = 'empty', title, description, action, compact = false, live = false,
}) {
  return (
    <div
      className="state-panel"
      data-state={state}
      data-compact={compact || undefined}
      role={state === 'error' ? 'alert' : 'status'}
      aria-live={live ? 'polite' : undefined}
    >
      <span className="state-panel-icon"><Icon name={ICONS[state] || 'note'} size={compact ? 18 : 22} /></span>
      <div><strong>{title}</strong>{description && <p>{description}</p>}</div>
      {action && <div className="state-panel-action">{action}</div>}
    </div>
  );
}

