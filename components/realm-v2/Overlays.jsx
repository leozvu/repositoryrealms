'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { COMMAND_STATES } from '@/lib/realm-v2-contracts';
import Icon from './Icon';
import { Badge, Banner, Button, Field, IconButton, SourcePill } from './Primitives';
import { Receipt } from './WorkObjects';
import styles from './realm-v2.module.css';

const FOCUSABLE = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({ title, children, footer, onClose, palette = false }) {
  const dialogRef = useRef(null);
  const returnFocus = useRef(null);
  useEffect(() => {
    returnFocus.current = document.activeElement;
    const dialog = dialogRef.current;
    const focusables = [...dialog.querySelectorAll(FOCUSABLE)];
    focusables[0]?.focus();
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab' || !focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      returnFocus.current?.focus?.();
    };
  }, [onClose]);
  return (
    <div className={styles.overlay} role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} className={`${styles.modal} ${palette ? styles.palette : ''}`} role="dialog" aria-modal="true" aria-labelledby="r2-modal-title">
        {!palette && <header className={styles.modalHeader}><h2 id="r2-modal-title">{title}</h2><IconButton label="Close dialog" icon="close" onClick={onClose}/></header>}
        <div className={palette ? '' : styles.modalBody}>{children}</div>
        {footer && <footer className={styles.modalFooter}>{footer}</footer>}
      </section>
    </div>
  );
}

export function ContextDrawer({ title, children, onClose }) {
  useEffect(() => {
    const onKey = event => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <aside className={styles.drawer} aria-label={title}>
      <header className={styles.drawerHeader}><h2>{title}</h2><IconButton label="Close context drawer" icon="close" onClick={onClose}/></header>
      <div className={styles.drawerBody}>{children}</div>
    </aside>
  );
}

export function CommandPalette({ onClose }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const items = [
    ['Open My Work', 'my-work', 'checklist', 'Navigation'],
    ['Review pending approvals', 'approvals', 'approval', 'Navigation'],
    ['Search operational records', 'search', 'search', 'Navigation'],
    ['Propose a new command', 'command-center', 'command', 'Authorized action'],
    ['Inspect canonical receipts', 'chronicle', 'receipt', 'Audit'],
    ['View executive brief', 'ceo-terminal', 'brief', 'Navigation'],
  ].filter(item => item[0].toLowerCase().includes(query.toLowerCase()));
  const go = slug => { onClose(); router.push(`/realm-v2/${slug}`); };
  return <Modal palette onClose={onClose} title="Search and commands"><div className={styles.paletteSearch}><Icon name="search"/><label htmlFor="r2-command-search" className={styles.srOnly}>Search navigation and authorized commands</label><input id="r2-command-search" autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search records, destinations and authorized commands…"/><kbd>Esc</kbd></div><div className={styles.paletteList}>{items.map(([label, slug, icon, type], index) => <button key={slug + label} type="button" className={styles.paletteItem} data-active={index === 0 || undefined} onClick={() => go(slug)}><Icon name={icon}/><span>{label}</span><small>{type}</small></button>)}{!items.length && <div style={{ padding: 20, color: 'var(--r2-muted)', fontSize: '.76rem' }}>No accessible results. Search respects your current role and workspace.</div>}</div></Modal>;
}

const stateLabels = {
  draft: 'Draft', proposed: 'Proposed', pending_approval: 'Pending approval', approved: 'Approved', executing: 'Executing', confirmed: 'Confirmed', failed: 'Failed',
};

export function CommandLifecycle({ defaultState = 'draft' }) {
  const [state, setState] = useState(defaultState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const current = COMMAND_STATES.indexOf(state);
  const progress = async () => {
    setBusy(true); setError('');
    await new Promise(resolve => setTimeout(resolve, 350));
    if (state === 'draft') setState('proposed');
    else if (state === 'proposed') setState('pending_approval');
    else if (state === 'pending_approval') setState('approved');
    else if (state === 'approved') setState('executing');
    else if (state === 'executing') {
      const id = 'RR-2026-0729-1042-8F31';
      setReceipt(id);
      setState('confirmed');
    }
    setBusy(false);
  };
  const fail = () => { setState('failed'); setError('Execution stopped before confirmation. No success state or business mutation is claimed.'); };
  return (
    <div className={styles.proposal}>
      <div className={styles.commandSteps} aria-label="Command lifecycle">
        {COMMAND_STATES.map((item, index) => <div key={item} className={styles.commandStep} data-current={state === item || undefined} data-complete={state !== 'failed' && index < current || undefined}><Icon name={index < current ? 'check' : item === 'failed' ? 'warning' : 'dot'} size={15}/><span>{stateLabels[item]}</span></div>)}
      </div>
      {error && <Banner tone="danger">{error}</Banner>}
      <div className={styles.proposalGrid}>
        <dl className={styles.definition}><dt>Intent</dt><dd>Reassign project delivery owner</dd></dl>
        <dl className={styles.definition}><dt>Target</dt><dd>Project PRJ-204 · North Star</dd></dl>
        <dl className={styles.definition}><dt>Requested by</dt><dd>Vũ Lương Sơn · CEO</dd></dl>
        <dl className={styles.definition}><dt>Business rule</dt><dd>Owner must have Project Manager capability</dd></dl>
      </div>
      <div className={styles.sourceRow}><SourcePill source="RepositoryRealms command gateway" freshness="Sandbox fixture"/><Badge tone="success">Authorization passed</Badge><Badge tone="success">Business rules passed</Badge><Badge tone="warning">Maker-checker required</Badge></div>
      {receipt ? <Receipt id={receipt} action="Project delivery owner changed from Mai Anh to Minh Quân."/> : <div className={styles.approvalActions}><Button loading={busy} onClick={progress} disabled={state === 'confirmed'}>{state === 'draft' ? 'Structure proposal' : state === 'proposed' ? 'Submit for approval' : state === 'pending_approval' ? 'Approve with check' : state === 'approved' ? 'Execute command' : state === 'executing' ? 'Verify canonical receipt' : 'Confirmed'}</Button>{state === 'executing' && <Button variant="danger" onClick={fail}>Simulate failure</Button>}{state === 'failed' && <Button variant="secondary" onClick={() => { setState('executing'); setError(''); }}>Retry idempotently</Button>}</div>}
    </div>
  );
}

export function ApprovalReview({ approval, onClose }) {
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState('');
  return <Modal title="Review approval evidence" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!confirmed || !reason.trim()} onClick={onClose}>Approve proposal</Button></>}>
    <div className={styles.grid}>
      <Banner tone="warning"><strong>Maker-checker control:</strong> review source evidence before approval. Approval does not imply execution.</Banner>
      <div><span className={styles.eyebrow}>{approval?.type || 'Operational approval'}</span><h3>{approval?.title || 'Change request'}</h3><p style={{ marginTop: 6, color: 'var(--r2-text-2)', fontSize: '.74rem' }}>{approval?.summary}</p></div>
      <div className={styles.proposalGrid}><dl className={styles.definition}><dt>Source</dt><dd>{approval?.source}</dd></dl><dl className={styles.definition}><dt>Risk</dt><dd>{approval?.risk}</dd></dl><dl className={styles.definition}><dt>Requester</dt><dd>{approval?.requester}</dd></dl><dl className={styles.definition}><dt>Policy</dt><dd>OPS-04 maker-checker</dd></dl></div>
      <Field label="Approval rationale" hint="Stored in Chronicle and canonical receipt."><textarea className={styles.textarea} value={reason} onChange={event => setReason(event.target.value)} placeholder="Record the business rationale…"/></Field>
      <label className={styles.checkRow}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>I reviewed authorization, evidence, impact and rollback path.</span></label>
    </div>
  </Modal>;
}

export function ToastDemo({ onDone }) {
  useEffect(() => { const timer = setTimeout(onDone, 3200); return () => clearTimeout(timer); }, [onDone]);
  return <div className={styles.toastRegion} role="status" aria-live="polite"><div className={styles.toast}><Icon name="check"/><div><strong>Proposal saved</strong><p style={{ color: 'var(--r2-text-2)' }}>No execution occurred. Continue when evidence is ready.</p></div></div></div>;
}
