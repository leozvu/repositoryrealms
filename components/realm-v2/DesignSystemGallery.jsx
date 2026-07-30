'use client';

import { useState } from 'react';
import Icon from './Icon';
import { Badge, Banner, Button, Field, IconButton, Panel, Segmented, Skeleton, SourcePill, StateView, Status, Toggle } from './Primitives';
import { ApprovalCard, MessageCard, MetricCard, Receipt, TaskCard, WorkTable } from './WorkObjects';
import { ApprovalReview, CommandLifecycle, ContextDrawer, Modal, ToastDemo } from './Overlays';
import { approvals, messages, metrics, tasks, workRows } from './fixtures';
import styles from './realm-v2.module.css';

export default function DesignSystemGallery() {
  const [density, setDensity] = useState('comfortable');
  const [overlay, setOverlay] = useState(null);
  const colors = [
    ['Canvas','#0B1015'],['Surface 1','#111923'],['Surface 2','#17212B'],['Surface 3','#1D2934'],['Emerald','#4FA47A'],['Gold','#C8A96B'],['Blue','#6398C8'],['Amber','#D69A4C'],['Red','#CF5A5A'],['Text','#F3F5F7'],['Secondary','#AAB4BE'],['Muted','#7F8C98'],
  ];
  return <div className={styles.grid}>
    <Banner><strong>Visual QA route:</strong> deterministic preview fixtures only. No production data, commands or receipts are invoked.</Banner>

    <section className={styles.qaSection}><div><span className={styles.eyebrow}>Foundation</span><h2>Semantic color and type</h2></div><div className={styles.colorGrid}>{colors.map(([name,color]) => <div className={styles.swatch} key={name} style={{ '--swatch': color, color: name === 'Text' || name === 'Secondary' ? '#0B1015' : '#F3F5F7' }}><strong>{name}</strong><span>{color}</span></div>)}</div><div className={styles.grid}><h1>Display / Realm operating clarity</h1><h2>Section / Evidence and decisions</h2><p style={{ color:'var(--r2-text-2)' }}>Body / Enterprise clarity first. Civic atmosphere is restrained to proportion, rhythm and materials.</p><code style={{ color:'var(--r2-gold)' }}>RR-2026-0729-1042-8F31</code></div></section>

    <section className={styles.qaSection}><div><span className={styles.eyebrow}>Primitives</span><h2>Controls and semantic states</h2></div><div className={styles.qaRow}><Button icon="plus">Primary action</Button><Button variant="secondary" icon="filter">Secondary</Button><Button variant="quiet">Quiet</Button><Button variant="danger">Destructive</Button><Button loading>Loading</Button><Button disabled>Disabled</Button><IconButton label="Refresh records" icon="refresh"/></div><div className={styles.qaRow}><Badge>Neutral</Badge><Badge tone="success">Success</Badge><Badge tone="info">Information</Badge><Badge tone="warning">Warning</Badge><Badge tone="danger">Error</Badge><Status tone="success">Connected</Status><Status tone="warning">Stale</Status><SourcePill source="RepositoryRealms" freshness="Live"/></div><div className={`${styles.grid} ${styles.grid2}`}><Field label="Command intent" hint="Describe the business outcome, not an implementation shortcut."><input className={styles.input} placeholder="Example: change accountable project owner"/></Field><Field label="Workspace"><select className={styles.select}><option>Egoric Group</option><option>AIM Agency</option></select></Field><Field label="Validation example" error="A business rationale is required."><input className={styles.input} aria-invalid="true" aria-describedby="qa-error"/></Field><Field label="Business rationale"><textarea className={styles.textarea} placeholder="Evidence-backed rationale…"/></Field></div><div className={styles.qaRow}><label className={styles.checkRow}><input type="checkbox" defaultChecked/> Include completed records</label><label className={styles.checkRow}><input type="radio" name="qa-radio" defaultChecked/> Comfortable</label><label className={styles.checkRow}><input type="radio" name="qa-radio"/> Compact</label><Toggle label="Notifications" defaultChecked/><Segmented label="Density" options={[{value:'comfortable',label:'Comfortable'},{value:'compact',label:'Compact'}]} value={density} onChange={setDensity}/></div></section>

    <section className={styles.qaSection}><div><span className={styles.eyebrow}>Data objects</span><h2>Metrics, tasks, approvals and messages</h2></div><div className={`${styles.grid} ${styles.grid4}`}>{metrics.map(item => <MetricCard key={item.label} {...item}/>)}</div><div className={`${styles.grid} ${styles.grid3}`}><TaskCard task={tasks[0]}/><ApprovalCard approval={approvals[0]} onReview={() => setOverlay('approval')}/><MessageCard message={messages[0]}/></div><Panel title="Responsive registry"><WorkTable rows={workRows}/></Panel></section>

    <section className={styles.qaSection}><div><span className={styles.eyebrow}>Resilience</span><h2>Every operational display state</h2></div><div className={styles.resilienceGrid}>{['loading','empty','stale','offline','error','permission-denied','redacted'].map(state => <Panel title={state.replace('-', ' ')} key={state}><StateView state={state} compact/></Panel>)}</div></section>

    <section className={styles.qaSection}><div><span className={styles.eyebrow}>Feedback and overlays</span><h2>Accessible layers with focus return</h2></div><div className={styles.qaRow}><Button variant="secondary" onClick={() => setOverlay('modal')}>Open modal</Button><Button variant="secondary" onClick={() => setOverlay('drawer')}>Open 400px drawer</Button><Button variant="secondary" onClick={() => setOverlay('toast')}>Show toast</Button></div><Banner><strong>Information:</strong> source contract is current.</Banner><Banner tone="warning"><strong>Stale source:</strong> verify the timestamp before acting.</Banner><Banner tone="danger"><strong>Execution failed:</strong> nothing is confirmed without a canonical receipt.</Banner></section>

    <section className={styles.qaSection}><div><span className={styles.eyebrow}>Command safety</span><h2>Proposal → approval → execution → receipt</h2></div><Panel title="Command lifecycle fixture" description="Use the controls to inspect receipt gating and failure recovery."><CommandLifecycle/></Panel><Receipt id="RR-2026-0729-1042-8F31" action="Project delivery owner changed after authorization, maker-checker approval and canonical execution."/></section>

    <section className={styles.qaSection}><div><span className={styles.eyebrow}>Loading system</span><h2>Reserved asynchronous layout</h2></div><Panel><div className={styles.grid}><Skeleton height={22} width="42%"/><Skeleton/><Skeleton width="82%"/><Skeleton height={88}/></div></Panel></section>

    {overlay === 'modal' && <Modal title="Accessible modal" onClose={() => setOverlay(null)} footer={<><Button variant="secondary" onClick={() => setOverlay(null)}>Cancel</Button><Button onClick={() => setOverlay(null)}>Save draft</Button></>}><div className={styles.grid}><Banner>Escape closes this dialog and focus returns to its trigger.</Banner><Field label="Draft title"><input className={styles.input} autoFocus defaultValue="Operating proposal"/></Field></div></Modal>}
    {overlay === 'approval' && <ApprovalReview approval={approvals[0]} onClose={() => setOverlay(null)}/>} 
    {overlay === 'drawer' && <ContextDrawer title="Context drawer" onClose={() => setOverlay(null)}><div className={styles.grid}><Status tone="success">Connected</Status><p style={{color:'var(--r2-text-2)',fontSize:'.75rem'}}>A 400px supplementary surface for provenance, filters and record detail.</p><SourcePill source="RepositoryRealms" freshness="Preview"/></div></ContextDrawer>}
    {overlay === 'toast' && <ToastDemo onDone={() => setOverlay(null)}/>} 
  </div>;
}
