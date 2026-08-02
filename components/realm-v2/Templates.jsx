'use client';

import { useMemo, useState } from 'react';
import Icon from './Icon';
import { Badge, Banner, Button, Field, Panel, Segmented, SourcePill, StateView, Status, Toggle } from './Primitives';
import { ApprovalCard, MessageCard, MetricCard, QueuePanel, Receipt, TaskCard, Timeline, Workload, WorkTable } from './WorkObjects';
import { CommandLifecycle } from './Overlays';
import { approvals, executiveMetrics, messages, metrics, notificationRows, people, recognitionRows, tasks, timeline, workRows } from './fixtures';
import styles from './realm-v2.module.css';

export function FocusWorkspace({ primary, aside }) {
  return <div className={styles.split}><div className={styles.grid}>{primary}</div><aside className={styles.asideStack}>{aside}</aside></div>;
}

export function RegistryTemplate({ metrics: metricData = metrics.slice(0, 3), children, aside }) {
  return <div className={styles.grid}><div className={`${styles.grid} ${styles.grid3}`}>{metricData.map(item => <MetricCard key={item.label} {...item}/>)}</div>{aside ? <div className={styles.split}><Panel title="Records" description="Keyboard-sortable registry with responsive record cards.">{children}</Panel><aside className={styles.asideStack}>{aside}</aside></div> : <Panel title="Records" description="Keyboard-sortable registry with responsive record cards.">{children}</Panel>}</div>;
}

export function BoardTemplate({ lanes }) {
  return <div className={styles.board} aria-label="Work board">{lanes.map(lane => <section className={styles.workLane} key={lane.label}><header className={styles.laneHead}><strong>{lane.label}</strong><Badge>{lane.items.length}</Badge></header>{lane.items.map(task => <TaskCard compact key={task.id} task={task}/>)}</section>)}</div>;
}

export function CommandCockpit({ children, side }) {
  return <div className={styles.split}><Panel title="Structured command" description="Proposal, checks, approval, execution and receipt stay visibly distinct.">{children}</Panel><aside className={styles.asideStack}>{side}</aside></div>;
}

export function TimelineTemplate({ entries = timeline, aside }) {
  return <div className={styles.split}><Panel title="Canonical activity" description="Append-only event history with provenance and receipt links."><Timeline entries={entries}/></Panel><aside className={styles.asideStack}>{aside}</aside></div>;
}

export function MapTemplate({ onSelect }) {
  const nodes = [
    { id: 'egoric', name: 'Egoric Agency', meta: '12 active projects · healthy', left: '12%', top: '58%' },
    { id: 'aim', name: 'AIM Agency', meta: '5 active projects · healthy', left: '39%', top: '22%' },
    { id: 'vnecom', name: 'VNECOM LLC', meta: 'AR review needed', left: '70%', top: '48%', risk: true },
    { id: 'egolive', name: 'Egolive', meta: '18 settlements pending', left: '48%', top: '72%', risk: true },
  ];
  return <><div className={styles.mapCanvas} aria-label="Spatial company view; equivalent accessible list follows"><span className={styles.mapRoute} style={{ width: '39%', left: '20%', top: '61%', transform: 'rotate(-29deg)' }}/><span className={styles.mapRoute} style={{ width: '35%', left: '47%', top: '30%', transform: 'rotate(29deg)' }}/><span className={styles.mapRoute} style={{ width: '28%', left: '26%', top: '63%', transform: 'rotate(18deg)' }}/>{nodes.map(node => <button type="button" key={node.id} className={styles.mapNode} data-risk={node.risk || undefined} style={{ left: node.left, top: node.top }} onClick={() => onSelect?.(node)}><strong>{node.name}</strong><span>{node.meta}</span><Status tone={node.risk ? 'warning' : 'success'}>{node.risk ? 'Needs review' : 'On plan'}</Status></button>)}</div><Panel title="Accessible entity list" description="All map information and actions are available without spatial interpretation."><WorkTable caption="Company entities shown on the map" rows={nodes.map((node, index) => ({ id: `ENT-00${index + 1}`, title: node.name, owner: index === 1 ? 'Phạm Minh Quân' : 'Vũ Lương Sơn', status: node.risk ? 'Needs review' : 'On plan', tone: node.risk ? 'warning' : 'success', due: node.risk ? 'Today' : 'Current', source: 'Entity registry', freshness: 'Live' }))}/></Panel></>;
}

export function ExecutiveBrief() {
  return <div className={styles.grid}><Banner><strong>Metric boundary:</strong> GMV, settlements, pipeline and forecasts are labeled separately from recognized revenue and cash.</Banner><div className={`${styles.grid} ${styles.grid4}`}>{executiveMetrics.map(item => <MetricCard key={item.label} {...item}/>)}</div><div className={styles.split}><Panel title="Entity operating view" description="Comparable decision metrics; source definitions remain entity-specific."><WorkTable rows={workRows} caption="Group operating metrics by entity"/></Panel><Panel title="Decision brief" description="Priority signals, not employee rankings."><div className={styles.list}>{['Collect ₫71M overdue AR before 05 Aug','Resolve VNECOM delivery owner gap','Approve Egolive settlement batch','Protect 12h design capacity'].map((text,index) => <div className={styles.listItem} key={text}><span className={styles.listIcon}>{index + 1}</span><div className={styles.listCopy}><strong>{text}</strong><span>Evidence linked · accountable owner assigned</span></div></div>)}</div></Panel></div></div>;
}

export function SettingsTemplate() {
  const [density, setDensity] = useState('comfortable');
  return <div className={styles.split}><Panel title="Workspace preferences" description="Personal display settings do not change shared business data."><form className={styles.grid} onSubmit={event => event.preventDefault()}><Field label="Default workspace"><select className={styles.select} defaultValue="home"><option value="home">Home</option><option value="my-work">My Work</option><option value="action-center">Action Center</option></select></Field><Field label="Interface density" hint="Comfortable preserves 44px targets; compact only reduces non-interactive spacing."><Segmented label="Interface density" options={[{value:'comfortable',label:'Comfortable'},{value:'compact',label:'Compact'}]} value={density} onChange={setDensity}/></Field><div className={styles.list}><div className={styles.listItem}><div className={styles.listCopy}><strong>Reduced motion</strong><span>Also follows your operating system preference.</span></div><Toggle label="Reduce non-essential motion"/></div><div className={styles.listItem}><div className={styles.listCopy}><strong>Desktop notifications</strong><span>Only events you are authorized to view.</span></div><Toggle label="Desktop notifications" defaultChecked/></div></div><Field label="Locale"><select className={styles.select} defaultValue="vi"><option value="vi">Tiếng Việt</option><option value="en">English</option></select></Field><div><Button icon="check">Save preferences</Button></div></form></Panel><aside className={styles.asideStack}><Panel title="Policy ownership"><div className={styles.grid}><SourcePill source="Identity policy" freshness="Verified"/><p style={{ color: 'var(--r2-text-2)', fontSize: '.74rem' }}>Authorization, approval thresholds and retention cannot be changed in personal settings.</p><Button variant="secondary" icon="link">Open admin policy</Button></div></Panel><Panel title="Session security"><div className={styles.list}><div className={styles.listItem}><div className={styles.listCopy}><strong>Step-up authentication</strong><span>Required for high-risk commands.</span></div><Status tone="success">Enforced</Status></div><div className={styles.listItem}><div className={styles.listCopy}><strong>Current session</strong><span>Windows · Edge · New York</span></div><Status tone="success">Active</Status></div></div></Panel></aside></div>;
}

export function MobilePriorityTemplate() {
  return <div className={styles.mobilePreview}><div style={{ minHeight: 56, display:'flex', alignItems:'center', gap:10, padding:'8px 14px', borderBottom:'1px solid var(--r2-border)' }}><span className={styles.brandMark}>R</span><div><strong style={{ fontSize:'.78rem' }}>My priority</strong><div style={{ color:'var(--r2-muted)', fontSize:'.62rem' }}>Wednesday · 29 July</div></div><span style={{ marginLeft:'auto' }}><Status tone="success">Online</Status></span></div><Panel title="Next best action" description="Based on due date, risk and ownership."><TaskCard compact task={tasks[2]}/><div style={{ marginTop: 12 }}><Button>Open review</Button></div></Panel><Panel title="Today"><div className={styles.list}>{tasks.slice(0,3).map(task => <div className={styles.listItem} key={task.id}><span className={styles.listIcon}><Icon name="checklist"/></span><div className={styles.listCopy}><strong>{task.title}</strong><span>{task.due} · {task.owner}</span></div></div>)}</div></Panel><nav aria-label="Preview mobile navigation" style={{ position:'absolute', inset:'auto 0 0', minHeight:64, display:'grid', gridTemplateColumns:'repeat(5,1fr)', borderTop:'1px solid var(--r2-border)', background:'var(--r2-surface-1)' }}>{[['home','Home'],['checklist','My Work'],['bolt','Actions'],['inbox','Inbox'],['more','More']].map(([icon,label]) => <span key={label} style={{ display:'grid', placeItems:'center', alignContent:'center', color:label==='My Work'?'var(--r2-emerald-strong)':'var(--r2-muted)', fontSize:'.56rem' }}><Icon name={icon} size={18}/>{label}</span>)}</nav></div>;
}

function HomeScreen({ onReview }) {
  return <FocusWorkspace primary={<><div className={`${styles.grid} ${styles.grid4}`}>{metrics.map(item => <MetricCard key={item.label} {...item}/>)}</div><Panel title="Your operating focus" description="Prioritized by ownership, risk and due date—not employee scoring."><div className={`${styles.grid} ${styles.grid2}`}>{tasks.slice(0,2).map(task => <TaskCard key={task.id} task={task}/>)}</div></Panel><Panel title="Recent canonical activity"><Timeline entries={timeline.slice(0,3)}/></Panel></>} aside={<><Panel title="Decisions waiting"><div className={styles.grid}>{approvals.slice(0,2).map(item => <ApprovalCard key={item.id} approval={item} onReview={onReview}/>)}</div></Panel><Panel title="Data health"><div className={styles.grid}><Status tone="success">4 sources current</Status><SourcePill source="RepositoryRealms" freshness="2 min ago"/><SourcePill source="Finance ledger" freshness="5 min ago"/></div></Panel></>}/>
}

function MyWorkScreen() {
  return <FocusWorkspace primary={<Panel title="Owned by you" description="Work you own or must review today."><div className={styles.grid}>{tasks.slice(0,3).map(task => <TaskCard key={task.id} task={task}/>)}</div></Panel>} aside={<><Panel title="Today"><div className={styles.list}>{['10:30 · Operations review','13:00 · Client alignment','16:30 · Settlement check'].map(item => <div key={item} className={styles.listItem}><span className={styles.listIcon}><Icon name="calendar"/></span><div className={styles.listCopy}><strong>{item}</strong><span>Calendar · verified</span></div></div>)}</div></Panel><Panel title="Capacity"><Workload people={people.slice(0,1)}/></Panel></>}/>
}

function WorkManagementScreen() {
  return <div className={styles.grid}><Banner><strong>Board alternative:</strong> every record remains available through the sortable registry below; drag is never required.</Banner><BoardTemplate lanes={[{label:'Planned',items:[tasks[1]]},{label:'In progress',items:[tasks[0],tasks[2]]},{label:'Review',items:[{...tasks[1],id:'TSK-430',title:'Validate source evidence',progress:86}]},{label:'Confirmed',items:[tasks[3]]}]}/><Panel title="All work records"><WorkTable rows={workRows}/></Panel></div>;
}

function ActionCenterScreen({ onReview }) {
  return <div className={styles.grid}><div className={`${styles.grid} ${styles.grid3}`}>{metrics.slice(0,3).map(item => <MetricCard key={item.label} {...item}/>)}</div><QueuePanel title="Decision queue" description="Priority combines deadline, business risk and ownership." approvals={approvals} onReview={onReview}/></div>;
}

function InboxScreen() {
  return <RegistryTemplate aside={<Panel title="Channel health"><div className={styles.grid}><Status tone="success">ERP messages connected</Status><Status tone="success">Project comments connected</Status><Status tone="warning">Email synced 18 min ago</Status></div></Panel>}><div className={styles.grid}>{messages.map(message => <MessageCard message={message} key={message.id}/>)}</div></RegistryTemplate>;
}

function ProjectScreen() {
  return <CommandCockpit side={<><Panel title="Delivery signals"><div className={styles.grid}><Status tone="warning">1 dependency at risk</Status><Status tone="success">Budget within plan</Status><Status tone="success">Capacity reserved</Status></div></Panel><Panel title="Accountability"><Workload people={people.slice(0,2)}/></Panel></>}><div className={styles.grid}><div><span className={styles.eyebrow}>PRJ-204 · Campaign delivery</span><h2>North Star</h2><p className={styles.subtitle}>A single project view joining scope, delivery, decisions and canonical activity.</p></div><div className={`${styles.grid} ${styles.grid3}`}>{metrics.slice(0,3).map(item => <MetricCard key={item.label} {...item}/>)}</div>{tasks.slice(0,2).map(task => <TaskCard key={task.id} task={task}/>)}</div></CommandCockpit>;
}

function CollaborationScreen() {
  return <FocusWorkspace primary={<Panel title="Team rooms" description="Presence is user-set availability, never inferred mood or productivity."><div className={styles.grid}>{messages.map(message => <MessageCard key={message.id} message={message}/>)}</div></Panel>} aside={<Panel title="People online"><div className={styles.list}>{people.map(person => <div key={person.name} className={styles.listItem}><span className={styles.avatar}>{person.name.split(' ').map(x=>x[0]).slice(-2).join('')}</span><div className={styles.listCopy}><strong>{person.name}</strong><span>{person.role}</span></div><Status tone={person.presence === 'Available' ? 'success' : 'info'}>{person.presence}</Status></div>)}</div></Panel>}/>
}

function ProfileScreen() {
  return <FocusWorkspace primary={<><Panel title="Professional profile" description="Role, capabilities and accountable work—no employee score."><div style={{ display:'flex', gap:16, alignItems:'center' }}><span className={styles.avatar} style={{ width:64,height:64,fontSize:'1rem' }}>VS</span><div><h2>Vũ Lương Sơn</h2><p className={styles.subtitle}>Chief Executive Officer · Group workspace</p><div className={styles.qaRow} style={{ marginTop:8 }}><Badge tone="success">Active</Badge><Badge>Approver</Badge><Badge>Entity administrator</Badge></div></div></div></Panel><Panel title="Accountable work"><WorkTable rows={workRows.slice(0,3)}/></Panel></>} aside={<><Panel title="Capabilities"><div className={styles.list}>{['Executive approval','Cross-entity assignment','Financial review','Identity administration'].map(item => <div key={item} className={styles.listItem}><span className={styles.listIcon}><Icon name="check"/></span><div className={styles.listCopy}><strong>{item}</strong><span>Granted by role policy</span></div></div>)}</div></Panel><Panel title="Availability"><Status tone="success">Available</Status><p style={{ marginTop:10,color:'var(--r2-muted)',fontSize:'.7rem' }}>Set by the employee. Last changed at 08:55.</p></Panel></>}/>
}

function SearchScreen() {
  return <FocusWorkspace primary={<Panel title="Search all accessible records" description="Results are filtered by current workspace authorization."><Field label="Search query"><div style={{ position:'relative' }}><span style={{ position:'absolute',left:12,top:13,color:'var(--r2-muted)',display:'flex' }}><Icon name="search" size={18}/></span><input className={styles.input} defaultValue="North Star" style={{ paddingLeft:42 }}/></div></Field><div className={styles.list} style={{ marginTop:16 }}>{workRows.slice(0,3).map(row => <div className={styles.listItem} key={row.id}><span className={styles.listIcon}><Icon name="folder"/></span><div className={styles.listCopy}><strong>{row.title}</strong><span>{row.id} · {row.source}</span></div><Button variant="secondary" icon="arrow">Open</Button></div>)}</div></Panel>} aside={<Panel title="Authorized commands"><div className={styles.list}>{['Propose owner change','Create project brief','Request temporary access'].map(item => <div className={styles.listItem} key={item}><span className={styles.listIcon}><Icon name="command"/></span><div className={styles.listCopy}><strong>{item}</strong><span>Opens a structured proposal</span></div></div>)}</div></Panel>}/>
}

export function ProductScreen({ slug, onReview, onOpenContext }) {
  const screen = useMemo(() => ({
    home: <HomeScreen onReview={onReview}/>,
    'my-work': <MyWorkScreen/>,
    'work-management': <WorkManagementScreen/>,
    'action-center': <ActionCenterScreen onReview={onReview}/>,
    'command-center': <CommandCockpit side={<><Panel title="Control checks"><div className={styles.grid}><Status tone="success">Authorization</Status><Status tone="success">Business rules</Status><Status tone="warning">Maker-checker</Status><Status tone="success">Rollback available</Status></div></Panel><Panel title="Source"><div className={styles.grid}><SourcePill source="RepositoryRealms" freshness="Sandbox fixture"/><p style={{ color:'var(--r2-muted)',fontSize:'.7rem' }}>This preview never invokes production services.</p></div></Panel></>}><CommandLifecycle/></CommandCockpit>,
    inbox: <InboxScreen/>,
    projects: <ProjectScreen/>,
    chronicle: <TimelineTemplate aside={<><Panel title="Audit filters"><div className={styles.grid}><Field label="Event type"><select className={styles.select}><option>All events</option><option>Commands</option><option>Approvals</option><option>Receipts</option></select></Field><Field label="Source"><select className={styles.select}><option>All sources</option><option>RepositoryRealms</option><option>Finance ledger</option></select></Field></div></Panel><Receipt id="RR-0729-A821" action="Creator settlement batch confirmed."/></>}/>,
    collaboration: <CollaborationScreen/>,
    'world-map': <div className={styles.grid}><MapTemplate onSelect={onOpenContext}/></div>,
    'ceo-terminal': <ExecutiveBrief/>,
    'employee-profile': <ProfileScreen/>,
    recognition: <RegistryTemplate metrics={metrics.slice(0,3)} aside={<Panel title="Policy boundary"><p style={{ color:'var(--r2-text-2)',fontSize:'.73rem' }}>Gold records recognition under a published policy. It does not buy leave, rank employees or alter payroll.</p></Panel>}><WorkTable rows={recognitionRows} caption="Recognition and Gold ledger"/></RegistryTemplate>,
    approvals: <ActionCenterScreen onReview={onReview}/>,
    notifications: <RegistryTemplate><WorkTable rows={notificationRows} caption="Notifications"/></RegistryTemplate>,
    search: <SearchScreen/>,
    settings: <SettingsTemplate/>,
    mobile: <MobilePriorityTemplate/>,
  }), [onOpenContext, onReview, slug]);
  return screen[slug] || screen.home;
}
