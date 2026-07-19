'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { Icon } from '@/components/ui';
import { createRealmEmbassyDemoDashboard } from '@/lib/realm-embassy';
import { realmLeadTransitions, realmStateLabel } from '@/lib/realm-action-contract';
import RealmActionDialog from './RealmActionDialog';
import RealmCreateActionDialog from './RealmCreateActionDialog';
import styles from './royal-embassy.module.css';

function moneyShort(value) {
  return new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value) || 0) + 'đ';
}

function dateLabel(value) {
  if (!value) return 'Chưa đặt ngày';
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const ACTIVITY = {
  call: { label: 'Cuộc gọi', icon: 'phone' },
  meeting: { label: 'Cuộc họp', icon: 'meeting' },
  email: { label: 'Email', icon: 'mail' },
  note: { label: 'Ghi chú', icon: 'note' },
};

function StateCard({ loading = false, error = '', onRetry, onBack }) {
  return (
    <section className={styles.stateCard} role={error ? 'alert' : 'status'} aria-live="polite">
      <span><Icon name={loading ? 'clock' : 'alert'} size={23} /></span>
      <div><strong>{loading ? 'Đang mở cổng Royal Embassy…' : 'Chưa tải được Royal Embassy'}</strong><p>{loading ? 'Đang tổng hợp Lead, Client và nhịp Project theo quyền CRM.' : error}</p></div>
      <div className={styles.stateActions}>
        {onBack && <button type="button" onClick={onBack}>Về Guild Hall</button>}
        {!loading && <button type="button" onClick={onRetry}><Icon name="repeat" size={15} />Thử lại</button>}
      </div>
    </section>
  );
}

function Metric({ icon, label, value, detail, tone = '' }) {
  return (
    <article className={`${styles.metric} ${tone ? styles[`metric_${tone}`] : ''}`}>
      <span><Icon name={icon} size={18} /></span><small>{label}</small><strong>{value}</strong><p>{detail}</p>
    </article>
  );
}

function LeadCard({ lead, onOpen, onTransition, onFollowUp }) {
  const transitions = lead.canTransition ? realmLeadTransitions(lead.stage) : [];
  return (
    <article className={`${styles.leadCard} ${lead.overdue ? styles.leadOverdue : ''}`}>
      <header><span>{lead.source}</span>{lead.overdue && <strong><Icon name="alert" size={13} />Quá ngày dự kiến</strong>}</header>
      <h4>{lead.company}</h4>
      <p>{lead.name}</p>
      <div className={styles.leadValue}>{moneyShort(lead.value)}</div>
      <footer>
        <span><Icon name="staff" size={13} />{lead.owner?.name || 'Chưa phân công'}</span>
        <span><Icon name="calendar" size={13} />{dateLabel(lead.expectedClose)}</span>
      </footer>
      {lead.activities?.length > 0 && <details className={styles.timeline}>
        <summary><Icon name="calendar" size={14} /><span>Diplomatic log</span><b>{lead.activities.length}</b></summary>
        <ol>
          {lead.activities.map((activity) => {
            const meta = ACTIVITY[activity.kind] || ACTIVITY.note;
            return <li key={activity.id}>
              <div><span><Icon name={meta.icon} size={12} />{meta.label}</span><b data-done={activity.done || undefined}>{activity.done ? 'Đã xong' : dateLabel(activity.date)}</b></div>
              <strong>{activity.title}</strong>
              <small>{activity.author}</small>
            </li>;
          })}
        </ol>
      </details>}
      {transitions.length > 0 && <div className={styles.leadActions} aria-label={`Cập nhật ${lead.company}`}>
        {transitions.map((nextState) => <button type="button" key={nextState} onClick={() => onTransition(lead, nextState)}>{realmStateLabel(nextState)}</button>)}
      </div>}
      {lead.canFollowUp && onFollowUp && <button type="button" className={styles.followupAction} onClick={() => onFollowUp(lead)}><Icon name="calendar" size={14} />Lên lịch follow-up</button>}
      {onOpen && <button type="button" className={styles.recordLink} onClick={() => onOpen(lead)}><Icon name="leads" size={14} />Mở Lead ERP</button>}
    </article>
  );
}

function ClientCard({ client, onOpen }) {
  return (
    <article className={styles.clientCard}>
      <span className={styles.clientSeal}><Icon name="clients" size={18} /></span>
      <div><strong>{client.name}</strong><p>{client.industry}</p></div>
      <dl><div><dt>Project mở</dt><dd>{client.activeProjects}/{client.projectCount}</dd></div><div><dt>Tiến độ chung</dt><dd>{client.averageProgress}%</dd></div></dl>
      <div className={styles.clientProgress} role="progressbar" aria-label={`Tiến độ quan hệ ${client.name}`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={client.averageProgress}><i style={{ width: `${client.averageProgress}%` }} /></div>
      <small><Icon name="calendar" size={13} />{client.nextDeadline ? `Mốc gần nhất ${dateLabel(client.nextDeadline)}` : 'Không có mốc Project đang mở'}</small>
      {onOpen && <button type="button" className={styles.recordLink} onClick={() => onOpen(client)}><Icon name="clients" size={14} />Mở Client ERP</button>}
    </article>
  );
}

export default function RoyalEmbassy({
  operationsSource = 'local',
  localDashboard,
  compact = false,
  onBack,
  onOpenLeads,
  onOpenLead,
  onOpenClient,
  dataRevision = 0,
}) {
  const titleId = useId();
  const [dashboard, setDashboard] = useState(() => localDashboard || createRealmEmbassyDemoDashboard());
  const [loading, setLoading] = useState(operationsSource === 'erp');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [pendingAction, setPendingAction] = useState(null);
  const [pendingCreate, setPendingCreate] = useState(null);
  const retry = useCallback(() => setRevision((value) => value + 1), []);
  const transitionLead = useCallback((lead, nextState) => setPendingAction({
    action: 'lead.transition', entityId: lead.id, expectedState: lead.stage, nextState,
    recordType: 'Lead', recordLabel: `${lead.company} · ${lead.name}`,
  }), []);
  const followupLead = useCallback((lead) => setPendingCreate({
    action: 'lead.followup.create', entityId: lead.id, recordLabel: `${lead.company} · ${lead.name}`,
  }), []);

  useEffect(() => {
    if (operationsSource !== 'erp') {
      setDashboard(localDashboard || createRealmEmbassyDemoDashboard());
      setLoading(false);
      setError('');
      return undefined;
    }
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 6500);
    setLoading(true);
    setError('');
    fetch('/api/realm-demo/embassy', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Không thể tải Royal Embassy.');
        if (payload?.source !== 'erp' || !payload?.embassy || !Array.isArray(payload?.stages)) throw new Error('ERP trả về Royal Embassy không hợp lệ.');
        if (active) setDashboard(payload);
      })
      .catch((requestError) => {
        if (active) setError(requestError.name === 'AbortError' ? 'ERP phản hồi quá lâu. Hãy thử lại.' : requestError.message);
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [dataRevision, localDashboard, operationsSource, revision]);

  if (loading) return <StateCard loading onBack={onBack} />;
  if (error) return <StateCard error={error} onRetry={retry} onBack={onBack} />;
  const { embassy, metrics, stages, clients, focus, source, permissions } = dashboard;
  return (
    <section className={`${styles.embassy} ${compact ? styles.compact : ''}`} aria-labelledby={titleId}>
      <header className={styles.hero}>
        <div className={styles.heroActions}>
          {onBack && <button type="button" onClick={onBack} aria-label="Về Guild Hall"><Icon name="repeat" size={16} /><span>Guild Hall</span></button>}
          <span className={styles.crest}><Icon name="leads" size={27} /></span>
        </div>
        <div><span className={styles.eyebrow}>Royal Embassy · CRM Relationship Bridge</span><h2 id={titleId}>{embassy.name}</h2><p>{embassy.charter}</p></div>
        <div className={styles.heroBadges}><span className={`${styles.sourceBadge} ${source === 'erp' ? styles.sourceLive : ''}`}><Icon name={source === 'erp' ? 'check' : 'shield'} size={14} />{source === 'erp' ? permissions?.readOnly ? 'ERP live · chỉ đọc' : 'ERP live · command bridge' : 'Demo cục bộ'}</span><span className={styles.scopeBadge}>{permissions.scope === 'company' ? 'Toàn công ty' : 'Danh mục của tôi + chưa gán'}</span></div>
      </header>

      <aside className={styles.focus}><Icon name={metrics.overdueLeads ? 'alert' : 'leads'} size={18} /><div><span>Ưu tiên ngoại giao</span><strong>{focus}</strong></div>{source === 'erp' && onOpenLeads && <button type="button" onClick={onOpenLeads}>Mở CRM pipeline<Icon name="leads" size={15} /></button>}</aside>

      <div className={styles.metrics} aria-label="Tổng quan CRM pipeline">
        <Metric icon="leads" label="Cơ hội đang mở" value={metrics.openLeads} detail={moneyShort(metrics.openValue)} />
        <Metric icon="trendUp" label="Forecast trọng số" value={moneyShort(metrics.weightedForecast)} detail="Theo xác suất stage chuẩn" />
        <Metric icon="percent" label="Tỷ lệ thắng" value={`${metrics.winRate}%`} detail={`${moneyShort(metrics.wonValue)} đã chốt`} />
        <Metric icon="alert" label="Cần chú ý" value={metrics.overdueLeads + metrics.unassignedLeads} detail={`${metrics.overdueLeads} quá ngày · ${metrics.unassignedLeads} chưa gán`} tone={(metrics.overdueLeads || metrics.unassignedLeads) ? 'warning' : ''} />
      </div>

      <section className={styles.pipelinePanel} aria-labelledby={`${titleId}-pipeline`}>
        <header className={styles.panelHead}><div><span>Diplomatic pipeline</span><h3 id={`${titleId}-pipeline`}>Hành trình từ tân thư đến minh ước</h3></div><small>Giá trị CRM, không phải điểm nhân sự</small></header>
        <div className={styles.pipeline}>
          {stages.map((stage) => <section className={styles.stage} key={stage.id} aria-label={`${stage.businessLabel}: ${stage.count} cơ hội`} style={{ '--stage-color': stage.color }}>
            <header><i /><div><strong>{stage.label}</strong><small>{stage.businessLabel} · xác suất {stage.probability}%</small></div><span>{stage.count}</span></header>
            <div className={styles.stageValue}>{moneyShort(stage.value)}</div>
            <div className={styles.leads}>{stage.leads.length ? stage.leads.map((lead) => <LeadCard lead={lead} key={lead.id} onOpen={source === 'erp' ? onOpenLead : undefined} onTransition={source === 'erp' ? transitionLead : undefined} onFollowUp={source === 'erp' ? followupLead : undefined} />) : <p className={styles.empty}>Chưa có cơ hội ở giai đoạn này.</p>}</div>
          </section>)}
        </div>
      </section>

      <section className={styles.clientPanel} aria-labelledby={`${titleId}-clients`}>
        <header className={styles.panelHead}><div><span>Alliance registry</span><h3 id={`${titleId}-clients`}>Đối tác đang có chiến dịch</h3></div><small>{metrics.activeClients} quan hệ có Project mở</small></header>
        <div className={styles.clients}>{clients.length ? clients.map((client) => <ClientCard client={client} key={client.id} onOpen={source === 'erp' ? onOpenClient : undefined} />) : <p className={styles.empty}>Chưa có Client trong sổ quan hệ.</p>}</div>
      </section>

      {!compact && <aside className={styles.governance}><Icon name="shield" size={18} /><div><strong>Embassy bảo vệ dữ liệu quan hệ và quyền CRM</strong><p>Dashboard không trả email, số điện thoại hay ghi chú. Chuyển stage và Diplomatic follow-up đều dùng dữ liệu CRM thật; ERP kiểm tra scope và ghi audit. Director có company scope, AM chỉ thao tác lead của mình hoặc chưa gán.</p></div></aside>}
      <RealmActionDialog command={pendingAction} onClose={() => setPendingAction(null)} onComplete={() => { setPendingAction(null); retry(); }} />
      <RealmCreateActionDialog command={pendingCreate} onClose={() => setPendingCreate(null)} onComplete={() => { setPendingCreate(null); retry(); }} />
    </section>
  );
}
