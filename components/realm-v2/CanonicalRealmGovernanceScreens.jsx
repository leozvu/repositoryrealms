'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/components/ui';
import Icon from './Icon';
import { Badge, Banner, Button, Field, Panel, Segmented, SourcePill, StateView, Status } from './Primitives';
import { MetricCard, Receipt } from './WorkObjects';
import styles from './realm-v2.module.css';

const COMMAND_ACTIONS = [
  { value: 'task.create', label: 'Tạo công việc', resource: 'ERP Task', icon: 'checklist' },
  { value: 'status.request', label: 'Yêu cầu trạng thái', resource: 'ERP Task', icon: 'clock' },
  { value: 'announcement.send', label: 'Gửi thông báo', resource: 'ERP Notification', icon: 'bell' },
  { value: 'approval.request', label: 'Tạo yêu cầu phê duyệt', resource: 'ERP Approval', icon: 'approval' },
];

const APPROVAL_VIEWS = [
  { value: 'inbox', label: 'Chờ tôi duyệt' },
  { value: 'requested', label: 'Tôi yêu cầu' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'completed', label: 'Đã hoàn tất' },
];

const ROLE_OPTIONS = ['PM', 'AM', 'ACCOUNTANT', 'HR', 'LEAD', 'DIRECTOR'];

function dateLabel(value, withTime = true) {
  if (!value) return 'Chưa xác định';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('vi-VN', withTime
    ? { dateStyle: 'short', timeStyle: 'short' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function moneyLabel(value) {
  const amount = Number(value || 0);
  return amount ? `${new Intl.NumberFormat('vi-VN').format(amount)} ₫` : 'Không có giá trị tiền';
}

function safeSteps(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function shortIntent(intent, max = 160) {
  const firstLine = String(intent || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean) || '';
  return firstLine.slice(0, max);
}

function commandDraft(action, intent = '') {
  const title = shortIntent(intent, action === 'announcement.send' ? 70 : 160);
  if (action === 'task.create') return { title, note: intent, assigneeEmail: '', projectId: '', dueDate: '', priority: 'medium', estHours: '0' };
  if (action === 'status.request') return { topic: title, message: intent, targetEmail: '', dueDate: '', priority: 'medium' };
  if (action === 'announcement.send') return { title, message: String(intent).slice(0, 240), audience: 'all', role: 'PM' };
  return { title, note: intent, approverRole: 'DIRECTOR' };
}

function commandPayload(action, draft) {
  if (action === 'task.create') return {
    title: draft.title, note: draft.note, assigneeEmail: draft.assigneeEmail,
    projectId: draft.projectId, dueDate: draft.dueDate, priority: draft.priority, estHours: draft.estHours,
  };
  if (action === 'status.request') return {
    topic: draft.topic, message: draft.message, targetEmail: draft.targetEmail,
    dueDate: draft.dueDate, priority: draft.priority,
  };
  if (action === 'announcement.send') return {
    title: draft.title, message: draft.message, audience: draft.audience,
    role: draft.audience === 'role' ? draft.role : null,
  };
  return { title: draft.title, note: draft.note, approverRole: draft.approverRole };
}

function newCommandIds() {
  const value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return { idempotencyKey: `realm-v2-command:${value}`, correlationId: `realm-v2-correlation:${value}` };
}

function useCommandCenterSources() {
  const [state, setState] = useState({ loading: true, registry: null, identity: null, deliveries: [], error: null, denied: false });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null, denied: false }));
    try {
      const [registryResponse, identityResponse] = await Promise.all([
        fetch('/api/ceo/v1/registry', { cache: 'no-store' }),
        fetch('/api/ceo/v1/identity/session', { cache: 'no-store' }),
      ]);
      if (registryResponse.status === 403 || identityResponse.status === 403) {
        setState({ loading: false, registry: null, identity: null, deliveries: [], error: null, denied: true });
        return;
      }
      const [registry, identity] = await Promise.all([
        registryResponse.json().catch(() => ({})),
        identityResponse.json().catch(() => ({})),
      ]);
      if (!registryResponse.ok) throw new Error(registry.error || 'Không thể tải registry công ty.');
      let deliveries = [];
      let deliveryError = null;
      if (identityResponse.ok && identity?.active && identity?.stepUp) {
        const deliveryResponse = await fetch('/api/ceo/v1/command-gateway?limit=50', { cache: 'no-store' });
        const deliveryBody = await deliveryResponse.json().catch(() => ({}));
        if (deliveryResponse.ok) deliveries = deliveryBody.deliveries || [];
        else deliveryError = new Error(deliveryBody.error || 'Không thể tải sổ giao nhận.');
      }
      setState({ loading: false, registry, identity: identityResponse.ok ? identity : null, deliveries, error: deliveryError, denied: false });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error, denied: false }));
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load, setDeliveries: (update) => setState((current) => ({ ...current, deliveries: typeof update === 'function' ? update(current.deliveries) : update })) };
}

function CommandFields({ action, draft, onChange }) {
  const set = (key) => (event) => onChange((current) => ({ ...current, [key]: event.target.value }));
  if (action === 'task.create') return <div className={styles.commandFormGrid}>
    <Field label="Tiêu đề công việc"><input className={styles.input} required minLength={3} maxLength={160} value={draft.title} onChange={set('title')}/></Field>
    <Field label="Email người phụ trách" hint="Không bắt buộc; entity đích kiểm tra nhân sự đang hoạt động."><input className={styles.input} type="email" value={draft.assigneeEmail} onChange={set('assigneeEmail')}/></Field>
    <Field label="Mô tả" hint="Bối cảnh và kết quả cần đạt."><textarea className={styles.textarea} maxLength={1000} value={draft.note} onChange={set('note')}/></Field>
    <Field label="Mã dự án"><input className={styles.input} value={draft.projectId} onChange={set('projectId')}/></Field>
    <Field label="Hạn xử lý"><input className={styles.input} type="date" value={draft.dueDate} onChange={set('dueDate')}/></Field>
    <Field label="Mức ưu tiên"><select className={styles.select} value={draft.priority} onChange={set('priority')}><option value="low">Thấp</option><option value="medium">Vừa</option><option value="high">Cao</option><option value="urgent">Khẩn</option></select></Field>
    <Field label="Giờ dự kiến"><input className={styles.input} type="number" min="0" max="1000" step="0.25" value={draft.estHours} onChange={set('estHours')}/></Field>
  </div>;
  if (action === 'status.request') return <div className={styles.commandFormGrid}>
    <Field label="Nội dung cần cập nhật"><input className={styles.input} required minLength={3} maxLength={160} value={draft.topic} onChange={set('topic')}/></Field>
    <Field label="Email người cần phản hồi"><input className={styles.input} required type="email" value={draft.targetEmail} onChange={set('targetEmail')}/></Field>
    <Field label="Lời nhắn"><textarea className={styles.textarea} required maxLength={800} value={draft.message} onChange={set('message')}/></Field>
    <Field label="Hạn xử lý"><input className={styles.input} type="date" value={draft.dueDate} onChange={set('dueDate')}/></Field>
    <Field label="Mức ưu tiên"><select className={styles.select} value={draft.priority} onChange={set('priority')}><option value="medium">Vừa</option><option value="high">Cao</option><option value="urgent">Khẩn</option></select></Field>
  </div>;
  if (action === 'announcement.send') return <div className={styles.commandFormGrid}>
    <Field label="Tiêu đề thông báo"><input className={styles.input} required minLength={3} maxLength={70} value={draft.title} onChange={set('title')}/></Field>
    <Field label="Người nhận"><select className={styles.select} value={draft.audience} onChange={set('audience')}><option value="all">Toàn bộ nhân sự</option><option value="role">Theo vai trò</option></select></Field>
    <Field label="Nội dung"><textarea className={styles.textarea} required maxLength={240} value={draft.message} onChange={set('message')}/></Field>
    {draft.audience === 'role' && <Field label="Vai trò"><select className={styles.select} value={draft.role} onChange={set('role')}>{ROLE_OPTIONS.map((role) => <option key={role}>{role}</option>)}</select></Field>}
  </div>;
  return <div className={styles.commandFormGrid}>
    <Field label="Tiêu đề yêu cầu"><input className={styles.input} required minLength={3} maxLength={160} value={draft.title} onChange={set('title')}/></Field>
    <Field label="Vai trò phê duyệt"><select className={styles.select} value={draft.approverRole} onChange={set('approverRole')}>{ROLE_OPTIONS.map((role) => <option key={role}>{role}</option>)}</select></Field>
    <Field label="Bối cảnh quyết định"><textarea className={styles.textarea} required maxLength={1000} value={draft.note} onChange={set('note')}/></Field>
  </div>;
}

function DeliveryLedger({ deliveries, busy, onReconcile }) {
  if (!deliveries.length) return <div className={styles.canonicalEmpty}><Icon name="receipt"/><strong>Chưa có lệnh nào được gửi</strong><span>Command Center không tạo history giả. Sổ chỉ xuất hiện sau khi gateway nhận proposal.</span></div>;
  return <div className={styles.deliveryLedger}>{deliveries.map((delivery) => {
    const tone = delivery.status === 'delivered' ? 'success' : delivery.status === 'rejected' || delivery.status === 'failed' ? 'danger' : 'warning';
    return <article className={styles.deliveryRow} key={delivery.id}>
      <span className={styles.deliveryIcon}><Icon name={delivery.receipt ? 'receipt' : 'clock'}/></span>
      <div className={styles.deliveryCopy}><span className={styles.eyebrow}>{delivery.targetDisplayName || delivery.targetEntityId}</span><strong>{COMMAND_ACTIONS.find((item) => item.value === delivery.action)?.label || delivery.action}</strong><small>{delivery.correlationId} · {dateLabel(delivery.createdAt)}</small></div>
      <div className={styles.deliveryState}><Status tone={tone}>{delivery.status === 'delivered' ? 'Đã xác nhận' : delivery.status === 'pending_confirmation' ? 'Chờ xác nhận' : delivery.status === 'dispatching' ? 'Đang giao' : delivery.status === 'rejected' ? 'Bị từ chối' : 'Chưa gửi được'}</Status>{delivery.receipt?.id && <code>{delivery.receipt.id}</code>}</div>
      <div className={styles.deliveryActions}>{['pending_confirmation', 'dispatching'].includes(delivery.status) && <Button variant="secondary" icon="refresh" loading={busy === delivery.id} onClick={() => onReconcile(delivery)}>Đối soát</Button>}{delivery.receipt?.href && <Link className={styles.button} data-variant="secondary" href="/ceo-commands"><Icon name="arrow" size={16}/><span>Mở gateway ERP</span></Link>}</div>
    </article>;
  })}</div>;
}

function CommandCenterScreen() {
  const data = useCommandCenterSources();
  const toast = useToast();
  const formRef = useRef(null);
  const [intent, setIntent] = useState('');
  const [targetEntityId, setTargetEntityId] = useState('');
  const [action, setAction] = useState(COMMAND_ACTIONS[0].value);
  const [draft, setDraft] = useState(commandDraft(COMMAND_ACTIONS[0].value));
  const [structured, setStructured] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const entities = useMemo(() => (data.registry?.entities || []).filter((entity) => entity.enabled), [data.registry]);
  const identityReady = Boolean(data.identity?.active && data.identity?.stepUp);
  const delivered = data.deliveries.filter((delivery) => delivery.status === 'delivered').length;
  const pending = data.deliveries.filter((delivery) => ['dispatching', 'pending_confirmation'].includes(delivery.status)).length;

  const chooseAction = (value) => {
    setAction(value); setDraft(commandDraft(value)); setStructured(false); setConfirmed(false); setFeedback(null); setReceipt(null);
  };

  const structure = () => {
    if (intent.trim().length < 3) {
      setFeedback({ tone: 'danger', text: 'Hãy mô tả ý định bằng ít nhất 3 ký tự trước khi cấu trúc proposal.' });
      return;
    }
    setDraft(commandDraft(action, intent.trim()));
    setStructured(true); setConfirmed(false); setReceipt(null);
    setFeedback({ tone: 'info', text: 'Proposal mới chỉ được cấu trúc cục bộ. Chưa có record hay business action nào được gửi.' });
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy || !formRef.current?.reportValidity()) return;
    if (!structured || !confirmed || !targetEntityId || !identityReady) {
      setFeedback({ tone: 'danger', text: 'Cần proposal hợp lệ, công ty đích, CEO step-up và xác nhận phạm vi trước khi gửi.' });
      return;
    }
    setBusy('submit'); setFeedback(null); setReceipt(null);
    try {
      const ids = newCommandIds();
      const response = await fetch('/api/ceo/v1/command-gateway', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetEntityId, action, payload: commandPayload(action, draft), ...ids }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Command Gateway từ chối proposal.');
      const delivery = body.delivery;
      if (!delivery?.id) throw new Error('Gateway không trả delivery ID; proposal chưa được coi là đã nhận.');
      data.setDeliveries((current) => [delivery, ...current.filter((item) => item.id !== delivery.id)]);
      if (delivery.status === 'delivered' && delivery.receipt?.id) {
        setReceipt({ id: delivery.receipt.id, action: `${COMMAND_ACTIONS.find((item) => item.value === action)?.label} tại ${delivery.targetDisplayName}.` });
        setFeedback({ tone: 'success', text: 'Entity đích đã xác nhận canonical receipt.' });
        toast('Command đã được RepositoryRealms xác nhận bằng receipt.');
      } else {
        setFeedback({ tone: 'warning', text: 'Chưa có canonical receipt. Không tự gửi lại; hãy dùng đối soát với cùng correlation.' });
        toast('Command đang chờ xác nhận; chưa được coi là hoàn tất.', 'error');
      }
      setConfirmed(false);
    } catch (error) {
      setFeedback({ tone: 'danger', text: error?.message || 'Không thể gửi proposal.' });
      toast(error?.message || 'Không thể gửi proposal.', 'error');
    } finally {
      setBusy('');
    }
  };

  const reconcile = async (delivery) => {
    setBusy(delivery.id);
    try {
      const response = await fetch(`/api/ceo/v1/command-gateway/${encodeURIComponent(delivery.id)}/reconcile`, { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Không thể đối soát receipt.');
      data.setDeliveries((current) => current.map((item) => item.id === delivery.id ? body.delivery : item));
      if (body.delivery?.status === 'delivered' && body.delivery.receipt?.id) {
        setReceipt({ id: body.delivery.receipt.id, action: 'Command đã được đối soát và xác nhận tại entity đích.' });
        setFeedback({ tone: 'success', text: 'Đối soát tìm thấy canonical receipt.' });
      } else setFeedback({ tone: 'warning', text: 'Target vẫn chưa xác nhận receipt; không retry business action.' });
    } catch (error) {
      setFeedback({ tone: 'danger', text: error?.message || 'Đối soát thất bại.' });
    } finally { setBusy(''); }
  };

  if (data.loading && !data.registry) return <Panel><StateView state="loading"/></Panel>;
  if (data.denied) return <Panel title="Command Center được giới hạn cho Director"><div className={styles.canonicalState}><StateView state="permission-denied"/><Link className={styles.button} data-variant="secondary" href="/ceo-overview">Mở CEO Portal</Link></div></Panel>;
  if (!data.registry) return <Panel title="Không thể tải Command Center"><div className={styles.canonicalState}><StateView state="error"/><Button variant="secondary" icon="refresh" onClick={data.reload}>Tải lại an toàn</Button></div></Panel>;

  return <div className={styles.grid}>
    <section className={`${styles.grid} ${styles.grid4}`} aria-label="Tóm tắt Command Center">
      <MetricCard label="Entity khả dụng" value={entities.length} meta="CEO Registry" icon="map"/>
      <MetricCard label="Đã gửi" value={data.deliveries.length} meta="Delivery metadata" icon="command"/>
      <MetricCard label="Chờ xác nhận" value={pending} meta="Không tự retry" icon="clock" tone={pending ? 'warning' : 'success'}/>
      <MetricCard label="Receipt xác nhận" value={delivered} meta="RepositoryRealms" icon="receipt" tone="success"/>
    </section>
    {!identityReady && <Banner tone="warning" action={<Link className={styles.button} data-variant="secondary" href="/ceo-registry">Mở Identity & Registry</Link>}><strong>CEO session chưa hoàn tất step-up.</strong> Proposal có thể soạn nhưng không được gửi.</Banner>}
    {data.error && <Banner tone="warning" action={<Button variant="secondary" icon="refresh" onClick={data.reload}>Thử lại</Button>}><strong>Sổ giao nhận đang gián đoạn.</strong> Proposal hiện tại vẫn được giữ cục bộ và chưa gửi.</Banner>}
    {feedback && <Banner tone={feedback.tone}>{feedback.text}</Banner>}
    {receipt && <Receipt id={receipt.id} action={receipt.action} actor="CEO session hiện tại" time={dateLabel(new Date())}/>} 
    <form className={styles.commandCockpit} ref={formRef} onSubmit={submit}>
      <Panel title="1. Compose intent" description="Ngôn ngữ tự nhiên chỉ tạo proposal; không chạy business action." actions={<SourcePill source="Local proposal" freshness="Chưa gửi"/>}>
        <div className={styles.grid}>
          <Field label="Ý định cần thực hiện" hint="Mô tả đối tượng, kết quả mong muốn và bối cảnh. Không nhập secret hoặc dữ liệu nhạy cảm."><textarea className={styles.commandIntent} required minLength={3} maxLength={1000} value={intent} onChange={(event) => { setIntent(event.target.value); setStructured(false); setConfirmed(false); }} placeholder="Ví dụ: Tạo công việc hoàn thiện báo cáo chiến dịch cho đội vận hành trước thứ Sáu…"/></Field>
          <div className={styles.commandSelectors}>
            <Field label="Công ty đích"><select className={styles.select} required value={targetEntityId} onChange={(event) => { setTargetEntityId(event.target.value); setConfirmed(false); }}><option value="">Chọn entity…</option>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.displayName}</option>)}</select></Field>
            <Field label="Loại command"><select className={styles.select} value={action} onChange={(event) => chooseAction(event.target.value)}>{COMMAND_ACTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
          </div>
          <Button icon="command" onClick={structure}>Cấu trúc proposal</Button>
        </div>
      </Panel>
      <Panel title="2. Structured proposal" description="Phải review và sửa các trường trước khi submit." actions={<Status tone={structured ? 'warning' : 'neutral'}>{structured ? 'Draft structured' : 'Chờ cấu trúc'}</Status>}>
        {structured ? <div className={styles.grid}>
          <CommandFields action={action} draft={draft} onChange={setDraft}/>
          <div className={styles.proposalGrid}>
            <dl className={styles.definition}><dt>Normalized command</dt><dd>{action}</dd></dl>
            <dl className={styles.definition}><dt>Canonical resource</dt><dd>{COMMAND_ACTIONS.find((item) => item.value === action)?.resource}</dd></dl>
            <dl className={styles.definition}><dt>Authorization</dt><dd>Target entity revalidates</dd></dl>
            <dl className={styles.definition}><dt>Business rules</dt><dd>RepositoryRealms allowlist</dd></dl>
            <dl className={styles.definition}><dt>Idempotency</dt><dd>Allocated on submit</dd></dl>
            <dl className={styles.definition}><dt>Dry run</dt><dd>Không được backend hỗ trợ</dd></dl>
          </div>
          <Banner tone="warning"><strong>Đây chưa phải kết quả.</strong> Permission, rule, duplicate và target state chỉ được xác nhận khi entity đích xử lý proposal.</Banner>
          <label className={styles.commandConfirm}><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)}/><span>Tôi đã kiểm tra đúng entity, command và tác động; cho phép gửi proposal qua RepositoryRealms.</span></label>
          <button type="submit" className={styles.button} disabled={!identityReady || !targetEntityId || !confirmed || Boolean(busy)} aria-busy={busy === 'submit' || undefined}>{busy === 'submit' ? <span className={styles.spinner}/> : <Icon name="link" size={17}/>}<span>{busy === 'submit' ? 'Đang gửi và chờ receipt…' : 'Submit proposal'}</span></button>
        </div> : <div className={styles.canonicalEmpty}><Icon name="command"/><strong>Chưa có structured proposal</strong><span>Nhập ý định và chọn “Cấu trúc proposal”. Không action nào chạy ở bước này.</span></div>}
      </Panel>
    </form>
    <Panel title="Sổ giao nhận command" description="Chỉ lưu delivery metadata, correlation và receipt; payload nghiệp vụ thuộc entity đích." actions={<Button variant="secondary" icon="refresh" loading={data.loading} onClick={data.reload}>Đồng bộ</Button>}><DeliveryLedger deliveries={data.deliveries} busy={busy} onReconcile={reconcile}/></Panel>
    <div className={styles.sourceRow}><SourcePill source="RepositoryRealms" freshness="Authorization · Rules · Receipt · Audit"/><span>Finance và Payroll không nằm trong Command Center allowlist.</span></div>
  </div>;
}

function useApprovalSource() {
  const [state, setState] = useState({ loading: true, payload: null, error: null });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const response = await fetch('/api/approvals', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload.error || 'Không thể tải phê duyệt ERP.');
        error.status = response.status;
        throw error;
      }
      setState({ loading: false, payload, error: null });
    } catch (error) { setState({ loading: false, payload: null, error }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

function ApprovalRow({ approval, selected, onSelect }) {
  const steps = safeSteps(approval.steps);
  const current = steps.find((step) => step.status === 'pending');
  const tone = approval.status === 'approved' ? 'success' : approval.status === 'rejected' ? 'danger' : 'warning';
  return <button type="button" className={styles.approvalRow} data-selected={selected || undefined} aria-pressed={selected} onClick={() => onSelect(approval)}>
    <span className={styles.actionItemIcon}><Icon name="approval"/></span>
    <span className={styles.actionItemCopy}><span className={styles.eyebrow}>{approval.type || 'ERP Approval'}</span><strong>{approval.title || 'Yêu cầu phê duyệt'}</strong><small>{approval.requesterName || 'Người yêu cầu'} · {moneyLabel(approval.amount)}</small></span>
    <span className={styles.actionItemMeta}><Badge tone={tone}>{approval.status === 'pending' ? current?.label || current?.role || 'Đang chờ' : approval.status}</Badge><small>{dateLabel(approval.createdAt, false)}</small></span>
    <Icon name="chevron" size={15}/>
  </button>;
}

function ApprovalDetail({ approval, user }) {
  if (!approval) return <div className={styles.canonicalEmpty}><Icon name="approval"/><strong>Chọn một yêu cầu để review</strong><span>Realm chỉ hiển thị dữ liệu mà Approval ERP đã cấp quyền.</span></div>;
  const steps = safeSteps(approval.steps);
  const isMine = Boolean(user?.id && approval.requesterId === user.id);
  return <div className={styles.approvalDetail}>
    <div><span className={styles.eyebrow}>{approval.type || 'ERP Approval'}</span><h2>{approval.title || 'Yêu cầu phê duyệt'}</h2><p>{approval.requesterName || 'Người yêu cầu'} · {dateLabel(approval.createdAt)}</p></div>
    <div className={styles.proposalGrid}>
      <dl className={styles.definition}><dt>Tác động / Amount</dt><dd>{moneyLabel(approval.amount)}</dd></dl>
      <dl className={styles.definition}><dt>Trạng thái</dt><dd>{approval.status || 'pending'}</dd></dl>
      <dl className={styles.definition}><dt>Maker</dt><dd>{approval.requesterName || 'ERP identity'}</dd></dl>
      <dl className={styles.definition}><dt>Evidence visibility</dt><dd>Giới hạn theo Approval ERP</dd></dl>
    </div>
    <section className={styles.approvalChain} aria-label="Chuỗi maker-checker">
      {steps.length ? steps.map((step, index) => <span key={`${step.role || step.label}-${index}`} data-state={step.status}><Icon name={step.status === 'approved' ? 'check' : step.status === 'rejected' ? 'close' : 'approval'} size={14}/><strong>{step.label || step.role || `Bước ${index + 1}`}</strong> · {step.status || 'pending'}{step.byName ? ` · ${step.byName}` : ''}</span>) : <span><Icon name="approval" size={14}/>Approval chain chưa được nguồn ERP cung cấp.</span>}
    </section>
    {isMine && <Banner tone="warning"><strong>Yêu cầu do bạn tạo.</strong> Conflict-of-interest và self-approval sẽ được ERP kiểm tra lại khi ra quyết định.</Banner>}
    <div className={styles.policyTests} aria-label="Policy boundary">
      <span><Icon name="check" size={14}/><strong>Visibility</strong> được `/api/approvals` kiểm tra</span>
      <span><Icon name="warning" size={14}/><strong>Decision contract</strong> chưa đăng ký trong RepositoryRealms</span>
      <span><Icon name="receipt" size={14}/><strong>Downstream receipt</strong> chưa thể xác nhận tại Realm</span>
    </div>
    <Banner tone="warning"><strong>Fail-closed theo RepositoryRealms.</strong> `approval.decide` chưa có contract chung, nên Realm không gọi trực tiếp handler duyệt/từ chối của ERP.</Banner>
    <div className={styles.actionDetailActions}><Link className={styles.button} href={`/approvals?focus=${encodeURIComponent(approval.id)}&from=realm-v2-approvals`}><Icon name="approval" size={16}/><span>Mở quyết định trong ERP</span></Link></div>
    <SourcePill source="ERP Approval" freshness="Canonical · Authorized read"/>
  </div>;
}

function ApprovalsScreen({ user }) {
  const data = useApprovalSource();
  const [view, setView] = useState('inbox');
  const [selected, setSelected] = useState(null);
  const toApprove = data.payload?.toApprove || [];
  const mine = data.payload?.mine || [];
  const lists = useMemo(() => ({
    inbox: toApprove,
    requested: mine.filter((approval) => approval.status === 'pending'),
    escalated: [],
    completed: mine.filter((approval) => approval.status !== 'pending'),
  }), [mine, toApprove]);
  const visible = lists[view] || [];
  const active = selected && visible.some((approval) => approval.id === selected.id) ? selected : visible[0] || null;

  if (data.loading && !data.payload) return <Panel><StateView state="loading"/></Panel>;
  if (!data.payload) return <Panel title={data.error?.status === 403 ? 'Phê duyệt bị giới hạn theo vai trò' : 'Không thể tải Approvals'}><div className={styles.canonicalState}><StateView state={data.error?.status === 403 ? 'permission-denied' : 'error'}/><Button variant="secondary" icon="refresh" onClick={data.reload}>Tải lại an toàn</Button></div></Panel>;

  const counts = Object.fromEntries(APPROVAL_VIEWS.map((item) => [item.value, lists[item.value].length]));
  return <div className={styles.grid}>
    <section className={`${styles.grid} ${styles.grid4}`} aria-label="Tóm tắt phê duyệt">
      <MetricCard label="Chờ tôi duyệt" value={counts.inbox} meta="Theo quyền hiện tại" icon="approval" tone={counts.inbox ? 'warning' : 'success'}/>
      <MetricCard label="Yêu cầu đang mở" value={counts.requested} meta="Do tài khoản này tạo" icon="clock"/>
      <MetricCard label="Escalated" value={counts.escalated} meta="Nguồn chưa expose queue" icon="warning"/>
      <MetricCard label="Đã hoàn tất" value={counts.completed} meta="Trong 30 request của tôi" icon="receipt" tone="success"/>
    </section>
    <Panel title="Approval review workspace" description="Evidence, policy và maker-checker được review tại Realm; quyết định vẫn thuộc ERP." actions={<><Button variant="secondary" icon="refresh" loading={data.loading} onClick={data.reload}>Đồng bộ</Button><Link className={styles.button} data-variant="secondary" href="/approvals">Mở ERP</Link></>}>
      <div className={styles.operationsToolbar}><div className={styles.canonicalFilters}><Segmented label="Chọn góc nhìn Approvals" options={APPROVAL_VIEWS.map((item) => ({ ...item, label: `${item.label} ${counts[item.value]}` }))} value={view} onChange={(value) => { setView(value); setSelected(null); }}/></div><SourcePill source="ERP Approval" freshness="Live"/></div>
      {view === 'escalated' && <Banner tone="info"><strong>Không bịa queue Escalated.</strong> `/api/approvals` hiện chưa trả một tập escalated được authorization riêng; tab được giữ để thể hiện contract và trạng thái nguồn.</Banner>}
      <div className={styles.approvalsWorkspace}>
        <div className={styles.approvalList} aria-live="polite">{visible.map((approval) => <ApprovalRow key={approval.id} approval={approval} selected={active?.id === approval.id} onSelect={setSelected}/>)}{!visible.length && <div className={styles.canonicalEmpty}><Icon name="check"/><strong>Không có yêu cầu trong góc nhìn này</strong><span>Dữ liệu không được bổ sung bằng fixture ở product route.</span></div>}</div>
        <aside className={styles.approvalDetailPanel} aria-label="Chi tiết phê duyệt"><ApprovalDetail approval={active} user={user}/></aside>
      </div>
    </Panel>
    <div className={styles.sourceRow}><SourcePill source="RepositoryRealms" freshness="Unregistered decision intent fails closed"/><span>Approval visibility là canonical; decision và downstream execution vẫn tách biệt.</span></div>
  </div>;
}

export default function CanonicalRealmGovernanceScreen({ slug, user }) {
  return slug === 'approvals' ? <ApprovalsScreen user={user}/> : <CommandCenterScreen/>;
}
