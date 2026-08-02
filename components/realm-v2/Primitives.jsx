'use client';

import { useState } from 'react';
import Icon from './Icon';
import styles from './realm-v2.module.css';

export function Button({ children, variant = 'primary', icon, loading = false, onClick, ...props }) {
  return (
    <button type="button" className={styles.button} data-variant={variant} data-loading={loading || undefined} disabled={loading || props.disabled} onClick={onClick} {...props}>
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : icon ? <Icon name={icon} size={17} /> : null}
      <span>{children}</span>
    </button>
  );
}

export function IconButton({ label, icon, onClick, ...props }) {
  return <button type="button" className={styles.iconButton} aria-label={label} title={label} onClick={onClick} {...props}><Icon name={icon} /></button>;
}

export function Panel({ title, description, actions, children, className = '' }) {
  return (
    <section className={`${styles.panel} ${className}`.trim()}>
      {(title || description || actions) && (
        <header className={styles.panelHeader}>
          <div>{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>
          {actions && <div className={styles.panelHeaderActions}>{actions}</div>}
        </header>
      )}
      <div className={styles.panelBody}>{children}</div>
    </section>
  );
}

export function Badge({ children, tone = 'neutral' }) {
  return <span className={styles.badge} data-tone={tone}>{children}</span>;
}

export function Status({ children, tone = 'neutral' }) {
  return <span className={styles.status} data-tone={tone}>{children}</span>;
}

export function SourcePill({ source = 'RepositoryRealms', freshness = 'Live' }) {
  return <span className={styles.sourcePill}><Icon name="link" size={13} /> {source} · {freshness}</span>;
}

export function Avatar({ initials = 'VL', presence = 'available', label = 'Vũ Lương Sơn' }) {
  return <span className={styles.avatar} role="img" aria-label={`${label}, ${presence}`}>{initials}</span>;
}

export function Field({ label, hint, error, children }) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      {children}
      {error ? <span className={styles.fieldError}>{error}</span> : hint ? <span className={styles.hint}>{hint}</span> : null}
    </label>
  );
}

export function Toggle({ label = 'Toggle setting', defaultChecked = false, onChange }) {
  const [checked, setChecked] = useState(defaultChecked);
  const toggle = () => {
    const next = !checked;
    setChecked(next);
    onChange?.(next);
  };
  return <button type="button" className={styles.toggle} role="switch" aria-label={label} aria-checked={checked} onClick={toggle} />;
}

export function Segmented({ label, options, value, onChange }) {
  return (
    <div className={styles.segmented} role="tablist" aria-label={label}>
      {options.map(option => (
        <button key={option.value} type="button" role="tab" aria-selected={value === option.value} className={styles.segment} onClick={() => onChange?.(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ width = '100%', height = 14 }) {
  return <span className={styles.skeleton} aria-hidden="true" style={{ width, height, display: 'block' }} />;
}

const stateCopy = {
  loading: ['Loading current records', 'Reserved space prevents layout movement while data is verified.', 'refresh'],
  empty: ['No records in this view', 'Change filters or create a record if your role permits it.', 'inbox'],
  stale: ['Data may be out of date', 'Last verified 18 minutes ago. Review the timestamp before acting.', 'clock'],
  offline: ['Connection unavailable', 'Read-only cached data remains visible. Commands are paused.', 'offline'],
  error: ['This view could not load', 'Nothing was changed. Retry or inspect the incident reference.', 'warning'],
  'permission-denied': ['Access is restricted', 'Your role does not include this record or action.', 'lock'],
  redacted: ['Sensitive fields are redacted', 'Only the record owner and authorized reviewers can view them.', 'eyeOff'],
};

export function StateView({ state = 'empty', compact = false }) {
  const [title, description, icon] = stateCopy[state] || stateCopy.empty;
  if (state === 'loading') {
    return (
      <div className={styles.stateBox} aria-busy="true" aria-label={title} style={compact ? { minHeight: 120 } : undefined}>
        <div style={{ width: '80%', display: 'grid', gap: 12 }}><Skeleton height={16} width="55%"/><Skeleton height={12}/><Skeleton height={12} width="72%"/></div>
      </div>
    );
  }
  return (
    <div className={styles.stateBox} role={state === 'error' ? 'alert' : 'status'} style={compact ? { minHeight: 120 } : undefined}>
      <div className={styles.stateContent}>
        <span className={styles.stateIcon}><Icon name={icon} /></span>
        <strong>{title}</strong>
        <p>{description}</p>
        {(state === 'error' || state === 'stale' || state === 'offline') && <Button variant="secondary" icon="refresh">Retry safely</Button>}
      </div>
    </div>
  );
}

export function Banner({ children, tone = 'info', action }) {
  return <div className={styles.banner} data-tone={tone} role={tone === 'danger' ? 'alert' : 'status'}><Icon name={tone === 'danger' || tone === 'warning' ? 'warning' : 'link'} size={17}/><span>{children}</span>{action}</div>;
}
