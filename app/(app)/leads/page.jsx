'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useResource, Icon, FormModal, ConfirmDialog, Forbidden, ExportCsv, AsyncButton, useToast } from '@/components/ui';
import { ActivitiesModal } from '@/components/Activities';
import { BarChart } from '@/components/charts';
import { money, moneyShort, initials, todayISO, localISO, LEAD_STAGES } from '@/lib/format';
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
  const { rows, loading, forbidden, create, update, remove } = useResource('leads');
  const users = useResource('users');
  const clients = useResource('clients');
  const [modal, setModal] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [settings, setSettings] = useState(null);
  const [workloadPayload, setWorkloadPayload] = useState(null);
  const [workloadLoading, setWorkloadLoading] = useState(true);
  const [workloadError, setWorkloadError] = useState('');
  const toast = useToast();
  const focusedRecordRef = useRef(null);
  useEffect(() => { fetch('/api/settings').then(r => r.ok ? r.json() : null).then(setSettings).catch(() => {}); }, []);
  const loadWorkload = useCallback(async () => {
    setWorkloadLoading(true);
    setWorkloadError('');
    try {
      const response = await fetch('/api/leads/workload', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || 'Không thể tải CRM Workload Intelligence.');
      setWorkloadPayload(body);
    } catch (error) {
      setWorkloadError(error.message || 'Không thể tải CRM Workload Intelligence.');
    } finally {
      setWorkloadLoading(false);
    }
  }, []);
  useEffect(() => { loadWorkload(); }, [loadWorkload, rows.length]);
  useEffect(() => {
    if (loading || typeof window === 'undefined') return;
    const focusId = new URLSearchParams(window.location.search).get('focus');
    if (!focusId || focusedRecordRef.current === focusId) return;
    focusedRecordRef.current = focusId;
    const lead = rows.find((row) => row.id === focusId);
    if (!lead) {
      toast('Không tìm thấy Lead hoặc bạn không còn quyền xem bản ghi này.', 'error');
      return;
    }
    setModal({ mode: 'edit', row: lead });
  }, [loading, rows, toast]);
  if (forbidden) return <Forbidden />;

  /* ---------- v3.4: forecast doanh thu weighted theo xác suất giai đoạn ---------- */
  const PROB = { new: settings?.probNew ?? 10, contacted: settings?.probContacted ?? 20, proposal: settings?.probProposal ?? 40, negotiation: settings?.probNegotiation ?? 60 };
  const mk = off => { const d = new Date(); d.setMonth(d.getMonth() + off); return localISO(d).slice(0, 7); };
  const fcMonths = [mk(0), mk(1), mk(2)];
  const openAll = rows.filter(l => !['won', 'lost'].includes(l.stage));
  const noDate = openAll.filter(l => !l.expectedClose);
  const fcValues = fcMonths.map(k => Math.round(openAll
    .filter(l => l.expectedClose && l.expectedClose.slice(0, 7) === k)
    .reduce((s, l) => s + (l.value || 0) * (PROB[l.stage] || 0) / 100, 0)));
  const target = settings?.monthlyTarget || 0;

  const FIELDS = [
    { key: 'name', label: 'Người liên hệ', required: true },
    { key: 'company', label: 'Công ty' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Điện thoại' },
    { key: 'source', label: 'Nguồn', type: 'select', options: ['Facebook', 'Instagram', 'TikTok', 'Website', 'Giới thiệu', 'Khác'].map(s => ({ value: s, label: s })) },
    { key: 'value', label: 'Giá trị dự kiến (đ)', type: 'number' },
    { key: 'stage', label: 'Giai đoạn', type: 'select', options: LEAD_STAGES.map(s => ({ value: s.key, label: s.label })) },
    { key: 'expectedClose', label: 'Ngày dự kiến chốt (cho dự báo)', type: 'date' },
    { key: 'ownerId', label: 'Người phụ trách', type: 'select', options: users.rows.filter(u => u.status === 'active').map(u => ({ value: u.id, label: u.name })) },
    { key: 'note', label: 'Ghi chú', type: 'textarea', full: true },
  ];
  const userName = id => users.rows.find(u => u.id === id)?.name || '—';
  const open = rows.filter(l => !['won', 'lost'].includes(l.stage));
  const workload = workloadPayload?.workloadIntelligence;
  const workloadByLead = useMemo(() => new Map((workload?.leads || []).map((lead) => [lead.id, lead])), [workload]);

  const drop = async stage => {
    setOverCol(null);
    const lead = rows.find(l => l.id === dragId);
    if (!lead || lead.stage === stage) return;
    await update(lead.id, { stage });
    await loadWorkload();
    if (stage === 'won') toast(`Chúc mừng! Deal "${lead.company || lead.name}" đã thắng`);
  };

  const convertToClient = async lead => {
    const res = await clients.create({
      name: lead.company || lead.name, contact: lead.name, email: lead.email, phone: lead.phone,
      note: 'Chuyển từ pipeline (' + (lead.source || '') + ')', createdAt: todayISO(),
    });
    if (!res) return false;
    toast('Đã tạo khách hàng mới từ deal thắng');
    setModal(null); return true;
  };

  return (
    <>
      <div className="toolbar">
        <span style={{ fontSize: '.85rem', color: 'var(--muted)' }}>
          Pipeline mở: <b style={{ color: 'var(--fg)' }}>{money(open.reduce((s, l) => s + l.value, 0))}</b> · {open.length} cơ hội
        </span>
        <div className="spacer"></div>
        <ExportCsv rows={rows} name="pipeline" cols={[
          { label: 'Deal', value: l => l.company || l.name }, { key: 'name', label: 'Người liên hệ' },
          { key: 'stage', label: 'Giai đoạn' }, { key: 'value', label: 'Giá trị' }, { key: 'source', label: 'Nguồn' },
          { key: 'expectedClose', label: 'Dự kiến chốt' }, { label: 'Phụ trách', value: l => userName(l.ownerId) },
        ]} />
        <button className="btn btn-primary" onClick={() => setModal({ mode: 'add' })}><Icon name="plus" size={16} /><span>Thêm khách tiềm năng</span></button>
      </div>

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
            : workloadError || `Snapshot ${new Date(workloadPayload.generatedAt).toLocaleString('vi-VN')} · ${workload?.ruleVersion}`}
        </div>
        {workloadError && <div className={styles.error} role="alert"><span>{workloadError}</span><button type="button" onClick={loadWorkload}>Thử lại</button></div>}

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
                  const lead = item.kind === 'lead_review' ? rows.find((row) => row.id === item.entityId) : null;
                  return <article key={item.id} className={styles.queueItem} data-level={item.level}>
                    <div className={styles.queueMain}><span>{item.kind === 'owner_capacity' ? 'Owner capacity' : item.lifecycle?.label || 'Lead review'}</span>
                      <strong>{item.title}</strong><small>{item.ownerName} · nguồn: {item.source}</small></div>
                    <div className={styles.queueReason}><strong>{item.signals[0]?.label}</strong><span>{item.signals[0]?.explanation}</span></div>
                    <div className={styles.queueActions}>
                      <span>{ACTION_LABEL[item.recommendedAction] || item.recommendedAction}</span>
                      {lead && <button type="button" onClick={() => setModal({ mode: 'edit', row: lead })}>Review Lead</button>}
                      {lead && <button type="button" className={styles.secondaryAction} onClick={() => setModal({ mode: 'acts', row: lead })}>Nhật ký / follow-up</button>}
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
        <summary><span>Pipeline &amp; forecast drill-down</span><strong>{open.length} cơ hội đang mở · {moneyShort(open.reduce((sum, lead) => sum + lead.value, 0))}</strong><small>Mở để thao tác forecast và Kanban CRM gốc.</small></summary>
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
            <div><b style={{ fontSize: '1.25rem', color: 'var(--primary)' }}>{moneyShort(fcValues[0])}</b> dự báo tháng này
              {target > 0 && <span style={{ color: fcValues[0] >= target ? 'var(--accent)' : 'var(--muted)' }}> · {Math.round(fcValues[0] / target * 100)}% mục tiêu {moneyShort(target)}</span>}</div>
            {noDate.length > 0 && <div className={styles.forecastWarning}><Icon name="alert" size={15} />{noDate.length} deal chưa đặt ngày dự kiến chốt — chưa tính vào dự báo</div>}
            <div style={{ color: 'var(--muted)' }}>Deal thắng thực tế sẽ thay dự báo bằng doanh thu thật.</div>
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
              <div className="kan-head"><span className="dot" style={{ background: st.color }}></span>{st.label}<span className="count">{items.length}</span></div>
              {items.map(l => {
                const leadWorkload = workloadByLead.get(l.id);
                const lifecycleTone = LIFECYCLE_TONE[leadWorkload?.lifecycle?.band] || 'decided';
                return (
                <button type="button" key={l.id} className={`kan-card ${styles.leadCardButton}`} draggable
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
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: '.76rem', color: 'var(--muted)', marginTop: 4 }}>Kéo thả thẻ để đổi giai đoạn. Người dùng bàn phím có thể mở Lead và đổi trường Giai đoạn trong form.</p>
        </div>
      </details>

      {modal?.mode === 'add' && <FormModal title="Thêm khách tiềm năng" fields={FIELDS} data={{ stage: 'new', source: 'Facebook' }}
        onClose={() => setModal(null)} onSave={async d => { await create({ ...d, createdAt: todayISO() }); toast('Đã thêm'); await loadWorkload(); }} />}
      {modal?.mode === 'edit' && <FormModal title="Chi tiết khách tiềm năng" fields={FIELDS} data={modal.row}
        onClose={() => setModal(null)} onSave={async d => { await update(modal.row.id, d); toast('Đã cập nhật'); await loadWorkload(); }}
        extraFooter={<>
          <button className="btn btn-ghost" style={{ marginRight: 'auto', color: 'var(--danger)' }}
            onClick={() => setModal({ mode: 'del', row: modal.row })}><Icon name="trash" size={16} /> Xóa</button>
          <button className="btn btn-outline" onClick={() => setModal({ mode: 'acts', row: modal.row })}><Icon name="clock" size={16} /> Nhật ký &amp; hẹn</button>
          {modal.row.stage === 'won' && <AsyncButton className="btn btn-outline" pendingLabel="Đang chuyển…" onClick={() => convertToClient(modal.row)}>Chuyển thành khách hàng</AsyncButton>}
        </>} />}
      {modal?.mode === 'acts' && <ActivitiesModal refType="lead" refId={modal.row.id} name={modal.row.company || modal.row.name} onClose={() => { setModal(null); loadWorkload(); }} />}
      {modal?.mode === 'del' && <ConfirmDialog msg={`Xóa khách tiềm năng "${modal.row.company || modal.row.name}"?`}
        onClose={() => setModal(null)} onYes={async () => { await remove(modal.row.id); toast('Đã xóa'); await loadWorkload(); }} />}
    </>
  );
}
