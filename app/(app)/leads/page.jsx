'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useResource, Icon, FormModal, ConfirmDialog, Forbidden, AsyncButton, useToast, ResourceError } from '@/components/ui';
import LeadExport from '@/components/crm/LeadExport';
import { decodeLeadBoard } from '@/lib/lead-board-client';
import { ActivitiesModal } from '@/components/Activities';
import { BarChart } from '@/components/charts';
import { money, moneyShort, initials, todayISO, LEAD_STAGES } from '@/lib/format';
import { LEAD_SOURCES } from '@/lib/lead-intake';
import styles from './crm-workload.module.css';

const LIFECYCLE_TONE = { active: 'active', stale: 'stale', dormant: 'dormant', decided: 'decided' };
const ACTION_LABEL = {
  assign_owner: 'Phân công owner',
  complete_or_reschedule_followup: 'Xử lý follow-up',
  review_dormant_lead: 'Review dormant lead',
  schedule_followup: 'Lên lịch follow-up',
  set_expected_close: 'Đặt expected close',
  complete_contact_data: 'Bổ sung liên hệ',
  review_portfolio_distribution: 'Điều phối lại portfolio',
};

export default function LeadsPage() {
  const [cursors, setCursors] = useState({});
  const [pageHistory, setPageHistory] = useState({});
  const boardQuery = new URLSearchParams(Object.entries(cursors).sort(([a], [b]) => a.localeCompare(b))).toString();
  const resource = useResource('leads', null, { readUrl: `/api/leads/board${boardQuery ? '?' + boardQuery : ''}`, decodeRead: decodeLeadBoard });
  const { rows, metadata: board, loading, forbidden, error, mutating: resourceMutating } = resource;
  const [converting, setConverting] = useState(false);
  const conversionController = useRef(null);
  const mutating = resourceMutating || converting;
  const resetPages = () => { setCursors({}); setPageHistory({}); };
  const refresh = () => { if (boardQuery) resetPages(); else resource.refresh(); };
  const save = async (method, ...args) => { if (conversionController.current) return null; const result = await resource[method](...args); if (result) resetPages(); return result; };
  const create = data => save('create', data), update = (id, data) => save('update', id, data), remove = id => save('remove', id);
  const summary = board?.summary;
  const users = useResource('users');
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusId = searchParams.get('focus');
  const [modalState, setModalState] = useState(null);
  const modal = modalState?.scopeKey === resource.scopeKey ? modalState : null;
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [settings, setSettings] = useState(null);
  const [workloadPayload, setWorkloadPayload] = useState(null);
  const [workloadLoading, setWorkloadLoading] = useState(true);
  const [workloadError, setWorkloadError] = useState('');
  const toast = useToast();
  const recordController = useRef(null);
  const scopeRef = useRef(resource.scopeKey); scopeRef.current = resource.scopeKey;
  const modalIntent = useRef(0);
  const setModal = useCallback(next => {
    recordController.current?.abort(); modalIntent.current++;
    setModalState(next ? { ...next, scopeKey: scopeRef.current } : null);
  }, []);
  const workloadController = useRef(null);
  useEffect(() => {
    setModal(null); resetPages(); setConverting(false);
    return () => { recordController.current?.abort(); conversionController.current?.abort(); conversionController.current = null; };
  }, [resource.scopeKey, setModal]);
  useEffect(() => {
    const controller = new AbortController(); setSettings(null);
    fetch('/api/settings', { signal: controller.signal, cache: 'no-store' }).then(r => r.ok ? r.json() : null)
      .then(value => { if (!controller.signal.aborted) setSettings(value); }).catch(() => {});
    return () => controller.abort();
  }, [resource.scopeKey]);
  const loadWorkload = useCallback(async () => {
    workloadController.current?.abort();
    const controller = new AbortController(); workloadController.current = controller;
    setWorkloadLoading(true);
    setWorkloadError('');
    setWorkloadPayload(null);
    try {
      const response = await fetch('/api/leads/workload', { cache: 'no-store', signal: controller.signal });
      const body = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(body?.error || 'Không thể tải CRM Workload Intelligence.');
      setWorkloadPayload({ ...body, scopeKey: resource.scopeKey });
    } catch (error) {
      if (!controller.signal.aborted) setWorkloadError(error.message || 'Không thể tải CRM Workload Intelligence.');
    } finally {
      if (!controller.signal.aborted) setWorkloadLoading(false);
    }
  }, [resource.scopeKey]);
  useEffect(() => { loadWorkload(); return () => workloadController.current?.abort(); }, [loadWorkload]);
  const openLead = useCallback(async (id, mode = 'edit', signal) => {
    recordController.current?.abort();
    const controller = new AbortController(), startedScope = scopeRef.current;
    recordController.current = controller;
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const response = await fetch(`/api/data/leads?id=${encodeURIComponent(id)}`, { cache: 'no-store', signal: controller.signal });
      const body = await response.json();
      if (controller.signal.aborted || scopeRef.current !== startedScope) return;
      if (!response.ok || !Array.isArray(body)) throw new Error(body?.error || 'Không thể mở Lead.');
      if (!body[0]) throw new Error('Không tìm thấy Lead hoặc bạn không còn quyền xem bản ghi này.');
      setModal({ mode, row: body[0] });
    } catch (error) { if (!controller.signal.aborted && scopeRef.current === startedScope) toast(error.message, 'error'); }
    finally { signal?.removeEventListener('abort', abort); }
  }, [toast, setModal]);
  useEffect(() => {
    if (!focusId) return;
    const controller = new AbortController();
    openLead(focusId, 'edit', controller.signal);
    return () => controller.abort();
  }, [resource.scopeKey, focusId, openLead]);

  /* ---------- v3.4: forecast doanh thu weighted theo xác suất giai đoạn ---------- */
  const PROB = summary?.probability || {};
  const fcMonths = summary?.months || [];
  const fcValues = summary?.forecast || [];
  const target = summary?.target || 0;

  const keepCurrentOption = (options, value, fallbackLabel = value) => value && !options.some(option => option.value === value)
    ? [{ value, label: fallbackLabel }, ...options] : options;
  const FIELDS = [
    { key: 'name', label: 'Người liên hệ', required: true },
    { key: 'company', label: 'Công ty' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Điện thoại' },
    // v3.42: cùng danh sách nguồn với cổng nhận lead tự động, để lead nhập tay và lead
    // chảy về từ Facebook/TikTok gộp báo cáo được với nhau
    { key: 'source', label: 'Nguồn', type: 'select', options: keepCurrentOption(LEAD_SOURCES.map(s => ({ value: s, label: s })), modal?.row?.source) },
    { key: 'campaign', label: 'Chiến dịch (VD 4_MKT_Landing_ThaoVietAn)' },
    { key: 'region', label: 'Khu vực', type: 'select', options: keepCurrentOption([{ value: '', label: '—' }, ...(settings?.leadRegions || []).map(r => ({ value: r, label: r }))], modal?.row?.region) },
    { key: 'serviceLine', label: 'Mảng dịch vụ quan tâm', type: 'select', options: keepCurrentOption([{ value: '', label: '—' }, ...(settings?.serviceLines || []).map(x => ({ value: x, label: x }))], modal?.row?.serviceLine) },
    { key: 'value', label: 'Giá trị dự kiến (đ)', type: 'number' },
    { key: 'stage', label: 'Giai đoạn', type: 'select', options: LEAD_STAGES.map(s => ({ value: s.key, label: s.label })) },
    { key: 'expectedClose', label: 'Ngày dự kiến chốt (cho dự báo)', type: 'date' },
    { key: 'ownerId', label: 'Người phụ trách', type: 'select', options: keepCurrentOption([{ value: '', label: 'Chưa phân công' }, ...users.rows.filter(u => u.status === 'active').map(u => ({ value: u.id, label: u.name }))], modal?.row?.ownerId, 'Giữ người phụ trách hiện tại') },
    { key: 'note', label: 'Ghi chú', type: 'textarea', full: true },
  ];
  const userName = id => users.rows.find(u => u.id === id)?.name || id || '—';
  const workload = workloadPayload?.scopeKey === resource.scopeKey ? workloadPayload.workloadIntelligence : null;
  const workloadByLead = useMemo(() => new Map((workload?.leads || []).map((lead) => [lead.id, lead])), [workload]);

  // Giá trị deal thắng vẫn là ước tính trên Lead, không phải tiền đã thu.
  // Chỉ dựng khi có ít nhất một lead gắn nhãn chiến dịch, để công ty chưa dùng không bị rác màn hình.
  const campaigns = summary?.campaigns || [];
  const hasCampaigns = summary?.hasCampaigns;

  const drop = async stage => {
    setOverCol(null);
    const lead = rows.find(l => l.id === dragId);
    if (!lead || lead.stage === stage) return;
    const result = await update(lead.id, { stage });
    if (!result) return;
    await loadWorkload();
    if (stage === 'won') toast(`Chúc mừng! Deal "${lead.company || lead.name}" đã thắng`);
  };

  const convertToClient = async lead => {
    if (conversionController.current || resourceMutating) return false;
    const controller = new AbortController(), startedScope = resource.scopeKey, startedIntent = modalIntent.current;
    conversionController.current = controller; setConverting(true);
    const current = () => !controller.signal.aborted && scopeRef.current === startedScope && modalIntent.current === startedIntent;
    try {
      const response = await fetch(`/api/leads/${encodeURIComponent(lead.id)}/convert`, { method: 'POST', signal: controller.signal });
      const result = await response.json();
      if (!current()) return false;
      if (!response.ok || !result.clientId) throw new Error(result.error || 'Không thể chuyển Lead thành khách hàng.');
      toast(result.replayed ? 'Mở khách hàng đã liên kết với Lead' : 'Đã tạo khách hàng và lưu nguồn Lead');
      setModal(null);
      router.push(`/clients/${encodeURIComponent(result.clientId)}`);
      return true;
    } catch (error) {
      if (current()) toast(error.message || 'Chưa xác minh được chuyển Lead. Hãy kiểm tra khách hàng đã liên kết.', 'error');
      return false;
    } finally {
      if (conversionController.current === controller) { conversionController.current = null; setConverting(false); }
    }
  };

  if (forbidden) return <Forbidden />;
  if (error && !modal) return <ResourceError error={error} onRetry={refresh} loading={loading} />;
  return (
    <>
      <ResourceError error={error} onRetry={refresh} loading={loading} />
      <div className="toolbar">
        <span style={{ fontSize: '.85rem', color: 'var(--muted)' }}>
          Pipeline mở: <b style={{ color: 'var(--fg)' }}>{summary ? money(summary.openValue) : '—'}</b> · {summary?.openCount ?? '—'} cơ hội
        </span>
        <div className="spacer"></div>
        <LeadExport scopeKey={resource.scopeKey} disabled={loading || !summary?.total} userName={userName} />
        <button className="btn btn-primary" disabled={mutating} onClick={() => setModal({ mode: 'add' })}><Icon name="plus" size={16} /><span>Thêm khách tiềm năng</span></button>
      </div>

      {hasCampaigns && (
        <div className="card">
          <div className="card-head"><span className="card-title">Hiệu quả theo chiến dịch</span></div>
          <div className="card-body" style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Chiến dịch</th><th style={{ textAlign: 'right' }}>Lead</th><th style={{ textAlign: 'right' }}>Chốt</th><th style={{ textAlign: 'right' }}>Tỷ lệ chốt</th><th style={{ textAlign: 'right' }}>Giá trị deal thắng</th><th style={{ textAlign: 'right' }}>Đang mở</th></tr></thead>
              <tbody>
                {campaigns.map(c => (
                  <tr key={c.key}>
                    <td>{c.key}</td>
                    <td style={{ textAlign: 'right' }}>{c.total}</td>
                    <td style={{ textAlign: 'right' }}>{c.won}</td>
                    <td style={{ textAlign: 'right' }}>{c.total ? Math.round(c.won / c.total * 100) : 0}%</td>
                    <td style={{ textAlign: 'right' }}>{money(c.wonValue)}</td>
                    <td style={{ textAlign: 'right' }}>{money(c.openValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: '.78rem', color: 'var(--muted)' }}>Giá trị dự kiến của các Lead đã chốt thắng. Khoản thu thực tế được ghi nhận tại Tài chính.</p>
          </div>
        </div>
      )}

      <section className={styles.dashboard} aria-labelledby="crm-workload-title">
        <header className={styles.dashboardHead}>
          <div><p>CRM Workload Intelligence</p><h1 id="crm-workload-title">Năng lực sales đang được dùng đúng chỗ chưa?</h1>
            <span>Lead quality, follow-up evidence và owner WIP trên cùng dữ liệu CRM hiện hữu.</span></div>
          <div className={styles.sourceBadges}>
            <span><Icon name="shield" size={14} />{workloadPayload?.source || 'canonical-erp-crm'}</span>
            <span>{workloadPayload?.scope?.kind === 'company' ? 'Company scope' : 'Portfolio của tôi + chưa gán'}</span>
          </div>
        </header>

        <div className={styles.live} aria-live="polite">
          {workloadLoading ? 'Đang tổng hợp Lead, Activity và owner WIP…'
            : workloadError || (workload ? `Snapshot ${new Date(workloadPayload.generatedAt).toLocaleString('vi-VN')} · ${workload.ruleVersion}` : 'Đang tải…')}
        </div>
        {workloadError && <div className={styles.error} role="alert"><span>{workloadError}</span><button type="button" onClick={loadWorkload}>Thử lại</button></div>}
        {workload && (workloadPayload.limits?.leadSnapshotTruncated || workloadPayload.limits?.activitySnapshotTruncated) && <p role="status">Workload dùng tối đa 2.000 Lead và 20.000 activity gần nhất; đây là phân tích một phần. Tổng pipeline và forecast bên dưới vẫn dùng toàn bộ Lead trong quyền xem.</p>}

        {workload && <>
          <div className={styles.metrics} aria-label="CRM workload summary">
            <article data-tone="active"><span>Active</span><strong>{workload.summary.activeLeads}</strong><small>{moneyShort(workload.summary.weightedForecast)} forecast trọng số</small></article>
            <article data-tone="stale"><span>Stale</span><strong>{workload.summary.staleLeads}</strong><small>{workload.summary.overdueFollowups} follow-up quá hạn</small></article>
            <article data-tone="dormant"><span>Dormant / dead</span><strong>{workload.summary.dormantLeads} / {workload.summary.deadLeads}</strong><small>Dormant cần review · dead = stage lost</small></article>
            <article data-tone="attention"><span>Manager queue</span><strong>{workload.summary.managerQueueItems}</strong><small>{workload.summary.unassignedLeads} lead chưa có owner</small></article>
          </div>

          <div className={styles.decisionGrid}>
            <section className={styles.panel} aria-labelledby="crm-manager-queue">
              <header><div><p>Manager Queue</p><h2 id="crm-manager-queue">Việc cần quyết định</h2></div><span>Advisory only</span></header>
              <div className={styles.queueList}>
                {workload.managerQueue.map((item) => {
                  const lead = item.kind === 'lead_review' ? item.entityId : null;
                  return <article key={item.id} className={styles.queueItem} data-level={item.level}>
                    <div className={styles.queueMain}><span>{item.kind === 'owner_capacity' ? 'Owner capacity' : item.lifecycle?.label || 'Lead review'}</span>
                      <strong>{item.title}</strong><small>{item.ownerName} · nguồn: {item.source}</small></div>
                    <div className={styles.queueReason}><strong>{item.signals[0]?.label}</strong><span>{item.signals[0]?.explanation}</span></div>
                    <div className={styles.queueActions}>
                      <span>{ACTION_LABEL[item.recommendedAction] || item.recommendedAction}</span>
                      {lead && <AsyncButton disabled={mutating} onClick={() => openLead(lead)}>Review Lead</AsyncButton>}
                      {lead && <AsyncButton disabled={mutating} className={styles.secondaryAction} onClick={() => openLead(lead, 'acts')}>Nhật ký / follow-up</AsyncButton>}
                    </div>
                  </article>;
                })}
                {!workload.managerQueue.length && <p className={styles.empty}>Không có Lead hoặc owner nào vượt rule cần manager review.</p>}
              </div>
            </section>

            <section className={styles.panel} aria-labelledby="crm-owner-capacity">
              <header><div><p>Owner Workload</p><h2 id="crm-owner-capacity">Capacity theo lead WIP</h2></div><span>Thứ tự alphabet · không ranking</span></header>
              <div className={styles.ownerList}>
                {workload.owners.map((owner) => <article key={owner.ownerId} className={styles.ownerItem} data-band={owner.band}>
                  <span className="avatar">{initials(owner.name)}</span>
                  <div><strong>{owner.name}</strong><small>{owner.title || 'Account / Sales'} · {owner.label}</small>
                    <div className={styles.ownerProgress} role="progressbar" aria-label={`Lead WIP của ${owner.name}`} aria-valuemin="0" aria-valuemax={owner.wipLimit} aria-valuenow={Math.min(owner.openLeads, owner.wipLimit)}><i style={{ width: `${Math.min(100, owner.openLeads / owner.wipLimit * 100)}%` }} /></div>
                    <span>{owner.activeLeads} active · {owner.staleLeads} stale · {owner.dormantLeads} dormant · {owner.overdueFollowups} follow-up trễ</span>
                  </div>
                  <b>{owner.openLeads}/{owner.wipLimit}</b>
                </article>)}
                {!workload.owners.length && <p className={styles.empty}>Chưa có Account/Sales owner active trong scope hiện tại.</p>}
              </div>
            </section>
          </div>

          <aside className={styles.provenance}><Icon name="shield" size={18} /><div><strong>Evidence có provenance, không biến thành performance score</strong>
            <p>Activity là CRM record do người dùng xác nhận, chưa phải observed truth. Hệ thống không tự chia Lead, đổi stage, thưởng/phạt hay xếp hạng nhân viên; confidence tối đa medium.</p></div></aside>
        </>}
      </section>

      <details className={styles.pipelineDrilldown}>
        <summary><span>Pipeline &amp; forecast drill-down</span><strong>{summary?.openCount ?? '—'} cơ hội đang mở · {summary ? moneyShort(summary.openValue) : '—'}</strong><small>Tổng và dự báo tính trên toàn bộ Lead trong quyền xem; mỗi cột tải 25 thẻ.</small></summary>
        <div className={styles.pipelineBody}>

      {/* v3.4: dự báo doanh thu chốt 3 tháng (weighted theo xác suất giai đoạn) */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><span className="card-title">Dự báo doanh thu chốt (giá trị × xác suất giai đoạn)</span>
          <span style={{ fontSize: '.75rem', color: 'var(--muted)' }}>
            Xác suất: mới {PROB.new}% · liên hệ {PROB.contacted}% · đề xuất {PROB.proposal}% · thương lượng {PROB.negotiation}% — chỉnh trong Cài đặt
          </span>
        </div>
        <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, alignItems: 'center' }}>
          <BarChart labels={fcMonths.map(k => 'T' + +k.slice(5))} series={[{ name: 'Dự báo chốt', color: '#7C3AED', values: fcValues }]} height={170} />
          <div style={{ fontSize: '.83rem', display: 'grid', gap: 8 }}>
            <div><b style={{ fontSize: '1.25rem', color: 'var(--primary)' }}>{summary ? moneyShort(fcValues[0]) : '—'}</b> dự báo tháng này
              {target > 0 && <span style={{ color: fcValues[0] >= target ? 'var(--accent)' : 'var(--muted)' }}> · {Math.round(fcValues[0] / target * 100)}% mục tiêu {moneyShort(target)}</span>}</div>
            {summary?.noDateCount > 0 && <div className={styles.forecastWarning}><Icon name="alert" size={15} />{summary.noDateCount} deal chưa đặt ngày dự kiến chốt — chưa tính vào dự báo</div>}
            <div style={{ color: 'var(--muted)' }}>Giá trị Lead là ước tính. Khoản thu thực tế được ghi nhận tại Tài chính.</div>
          </div>
        </div>
      </div>

      <div className="kanban">
        {LEAD_STAGES.map(st => {
          const items = rows.filter(l => l.stage === st.key);
          return (
            <div key={st.key} className={`kan-col ${overCol === st.key ? 'drag-over' : ''}`}
              onDragOver={e => { e.preventDefault(); setOverCol(st.key); }}
              onDragLeave={() => setOverCol(null)}
              onDrop={() => drop(st.key)}>
              <div className="kan-head"><span className="dot" style={{ background: st.color }}></span>{st.label}<span className="count">{summary?.stages[st.key]?.count ?? '—'}</span></div>
              {items.map(l => {
                const leadWorkload = workloadByLead.get(l.id);
                const lifecycleTone = LIFECYCLE_TONE[leadWorkload?.lifecycle?.band] || 'decided';
                return (
                <button type="button" key={l.id} className={`kan-card ${styles.leadCardButton}`} draggable={!mutating} disabled={mutating}
                  onDragStart={() => setDragId(l.id)}
                  onClick={() => setModal({ mode: 'edit', row: l })}
                  aria-label={`Mở Lead ${l.company || l.name}, ${leadWorkload?.lifecycle?.label || st.label}`}>
                  <div className="kan-title" style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                    <span>{l.company || l.name}</span>
                    {leadWorkload && <span className={`${styles.lifecycleBadge} ${styles[lifecycleTone]}`}>{leadWorkload.lifecycle.label}</span>}
                  </div>
                  <div className="kan-sub">{l.name} · {l.source || ''}</div>
                  <div className="kan-foot">
                    <span className="kan-value">{l.value ? money(l.value) : ''}</span>
                    <span className="avatar" title={userName(l.ownerId)}>{initials(userName(l.ownerId))}</span>
                  </div>
                  {leadWorkload && <span className={styles.leadEvidence}>{leadWorkload.lastTouch.date ? `Last recorded touch ${leadWorkload.lastTouch.date}` : 'Chưa có evidence ngày'} · confidence {leadWorkload.confidence.band}</span>}
                </button>
              );})}
              <nav aria-label={`Phân trang ${st.label}`} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 8 }}>
                <button className="btn btn-outline btn-sm" disabled={loading || mutating || !pageHistory[st.key]?.length} onClick={() => {
                  const history = pageHistory[st.key] || [], previous = history.at(-1);
                  setPageHistory(value => ({ ...value, [st.key]: history.slice(0, -1) }));
                  setCursors(value => { const next = { ...value }; if (previous) next[`${st.key}Cursor`] = previous; else delete next[`${st.key}Cursor`]; return next; });
                }}>Trước</button>
                <span style={{ fontSize: '.75rem' }}>Trang {(pageHistory[st.key]?.length || 0) + 1}</span>
                <button className="btn btn-outline btn-sm" disabled={loading || mutating || !board?.columns[st.key]?.page.hasMore} onClick={() => {
                  setPageHistory(value => ({ ...value, [st.key]: [...(value[st.key] || []), cursors[`${st.key}Cursor`] || null] }));
                  setCursors(value => ({ ...value, [`${st.key}Cursor`]: board.columns[st.key].page.nextCursor }));
                }}>Tiếp</button>
              </nav>
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: '.76rem', color: 'var(--muted)', marginTop: 4 }}>Kéo thả thẻ để đổi giai đoạn. Người dùng bàn phím có thể mở Lead và đổi trường Giai đoạn trong form.</p>
        </div>
      </details>

      {modal?.mode === 'add' && <FormModal title="Thêm khách tiềm năng" fields={FIELDS} data={{ stage: 'new', source: 'Facebook' }}
        onClose={() => setModal(null)} onSave={async d => { const result = await create({ ...d, createdAt: todayISO() }); if (!result) return false; toast('Đã thêm'); await loadWorkload(); return result; }} />}
      {modal?.mode === 'edit' && <FormModal key={modal.row.id} title="Chi tiết khách tiềm năng" fields={FIELDS} data={modal.row}
        onClose={() => setModal(null)} onSave={async d => { const result = await update(modal.row.id, d); if (!result) return false; toast('Đã cập nhật'); await loadWorkload(); return result; }}
        extraFooter={<>
          <button className="btn btn-ghost" style={{ marginRight: 'auto', color: 'var(--danger)' }}
            disabled={mutating} onClick={() => setModal({ mode: 'del', row: modal.row })}><Icon name="trash" size={16} /> Xóa</button>
          <button className="btn btn-outline" disabled={mutating} onClick={() => setModal({ mode: 'acts', row: modal.row })}><Icon name="clock" size={16} /> Nhật ký &amp; hẹn</button>
          {(modal.row.clientId || modal.row.stage === 'won') && <AsyncButton disabled={mutating} className="btn btn-outline" pendingLabel="Đang mở khách hàng…" onClick={() => convertToClient(modal.row)}>{modal.row.clientId ? 'Mở khách hàng đã liên kết' : 'Chuyển thành khách hàng'}</AsyncButton>}
        </>} />}
      {modal?.mode === 'acts' && <ActivitiesModal refType="lead" refId={modal.row.id} name={modal.row.company || modal.row.name} onClose={() => { setModal(null); loadWorkload(); }} />}
      {modal?.mode === 'del' && <ConfirmDialog msg={`Xóa khách tiềm năng "${modal.row.company || modal.row.name}"?`}
        onClose={() => setModal(null)} onYes={async () => { const result = await remove(modal.row.id); if (!result) return false; toast('Đã xóa'); await loadWorkload(); return result; }} />}
    </>
  );
}
