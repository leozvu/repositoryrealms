'use client';

import { useState } from 'react';
import Icon from './Icon';
import { Badge, Button, Panel, SourcePill, Status } from './Primitives';
import styles from './realm-v2.module.css';

export function MetricCard({ label, value, meta, icon = 'chart', tone = 'success' }) {
  return (
    <article className={`${styles.panel} ${styles.metric}`}>
      <div className={styles.metricTop}><span>{label}</span><span className={styles.metricIcon}><Icon name={icon} size={18}/></span></div>
      <strong className={styles.metricValue}>{value}</strong>
      <div className={styles.metricMeta}><Status tone={tone}>{meta}</Status></div>
    </article>
  );
}

export function TaskCard({ task, compact = false }) {
  return (
    <article className={styles.taskCard}>
      <div className={styles.taskTop}>
        <h3>{task.title}</h3>
        <Badge tone={task.priority === 'High' ? 'danger' : task.priority === 'Medium' ? 'warning' : 'neutral'}>{task.priority}</Badge>
      </div>
      {!compact && <p style={{ color: 'var(--r2-text-2)', fontSize: '.72rem' }}>{task.summary}</p>}
      <div className={styles.progressTrack} aria-label={`${task.progress}% complete`}><div className={styles.progressBar} style={{ width: `${task.progress}%` }}/></div>
      <div className={styles.objectMeta}>
        <span><Icon name="clock" size={14}/> Due {task.due}</span>
        <span><Icon name="person" size={14}/> {task.owner}</span>
        <SourcePill source={task.source || 'ERP Task'} freshness={task.freshness || 'Live'}/>
      </div>
    </article>
  );
}

export function ApprovalCard({ approval, onReview }) {
  return (
    <article className={styles.approvalCard}>
      <div className={styles.taskTop}>
        <div><span className={styles.eyebrow}>{approval.type}</span><h3>{approval.title}</h3></div>
        <Badge tone={approval.risk === 'High' ? 'danger' : 'warning'}>{approval.risk} risk</Badge>
      </div>
      <p style={{ color: 'var(--r2-text-2)', fontSize: '.73rem' }}>{approval.summary}</p>
      <div className={styles.sourceRow}><SourcePill source={approval.source}/><span>Requested by {approval.requester}</span><span>{approval.age}</span></div>
      <div className={styles.approvalActions}><Button variant="secondary" onClick={() => onReview?.(approval)}>Review evidence</Button></div>
    </article>
  );
}

export function MessageCard({ message }) {
  return (
    <article className={styles.messageCard}>
      <div className={styles.taskTop}><h3>{message.subject}</h3>{!message.read && <Badge tone="info">Unread</Badge>}</div>
      <p style={{ color: 'var(--r2-text-2)', fontSize: '.73rem' }}>{message.preview}</p>
      <div className={styles.objectMeta}><span><Icon name="person" size={14}/> {message.from}</span><span><Icon name="clock" size={14}/> {message.time}</span><SourcePill source={message.channel}/></div>
    </article>
  );
}

export function Receipt({ id, action, actor = 'Vũ Lương Sơn', time = '29 Jul 2026 · 10:42' }) {
  return (
    <section className={styles.receipt} aria-label="Canonical command receipt">
      <div className={styles.receiptHead}><Icon name="receipt"/><strong>Confirmed by canonical receipt</strong></div>
      <p style={{ color: 'var(--r2-text-2)', fontSize: '.72rem' }}>{action}</p>
      <code className={styles.receiptCode}>{id}</code>
      <div className={styles.sourceRow}><span>Actor: {actor}</span><span>{time}</span><SourcePill source="RepositoryRealms" freshness="Verified"/></div>
      <a href="/realm-v2/chronicle#receipt-demo">Open Chronicle audit trail</a>
    </section>
  );
}

export function WorkTable({ rows, caption = 'Operational records' }) {
  const [direction, setDirection] = useState('asc');
  const sorted = [...rows].sort((a, b) => direction === 'asc' ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title));
  return (
    <div className={styles.tableWrap} data-responsive="cards">
      <table className={styles.table}>
        <caption className={styles.srOnly}>{caption}</caption>
        <thead><tr>
          <th scope="col"><button type="button" className={styles.sortButton} onClick={() => setDirection(v => v === 'asc' ? 'desc' : 'asc')} aria-label={`Sort title ${direction === 'asc' ? 'descending' : 'ascending'}`}>Record <Icon name="sort" size={13}/></button></th>
          <th scope="col">Owner</th><th scope="col">Status</th><th scope="col">Due</th><th scope="col">Source</th>
        </tr></thead>
        <tbody>{sorted.map(row => <tr key={row.id}>
          <td data-label="Record"><strong>{row.title}</strong><small>{row.id}</small></td>
          <td data-label="Owner">{row.owner}</td>
          <td data-label="Status"><Status tone={row.tone}>{row.status}</Status></td>
          <td data-label="Due">{row.due}</td>
          <td data-label="Source"><SourcePill source={row.source} freshness={row.freshness}/></td>
        </tr>)}</tbody>
      </table>
    </div>
  );
}

export function Timeline({ entries }) {
  return <ol className={styles.timeline}>{entries.map(entry => <li className={styles.timelineItem} key={entry.id}><time>{entry.time}</time><strong>{entry.title}</strong><p>{entry.body}</p>{entry.receipt && <SourcePill source={`Receipt ${entry.receipt}`} freshness="Verified"/>}</li>)}</ol>;
}

export function Workload({ people }) {
  return <div className={styles.list}>{people.map(person => <div className={styles.listItem} key={person.name}><span className={styles.listIcon}><Icon name="person"/></span><div className={styles.listCopy}><strong>{person.name}</strong><span>{person.role} · {person.open} open records</span><div className={styles.progressTrack}><div className={styles.progressBar} style={{ width: `${Math.min(person.capacity, 100)}%`, background: person.capacity > 90 ? 'var(--r2-amber)' : undefined }}/></div></div><div className={styles.listMeta}><strong>{person.capacity}%</strong><span>capacity</span></div></div>)}</div>;
}

export function QueuePanel({ title, description, approvals, onReview }) {
  return <Panel title={title} description={description}><div className={styles.grid}>{approvals.map(item => <ApprovalCard key={item.id} approval={item} onReview={onReview}/>)}</div></Panel>;
}
