'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Icon } from '@/components/ui';
import { createRealmGuildDashboard, mergeRealmGuildPresence } from '@/lib/realm-guild';
import styles from './guild-hall.module.css';

const PRESENCE_META = {
  available: { label: 'Sẵn sàng', tone: 'ready' },
  busy: { label: 'Đang bận', tone: 'busy' },
  focus: { label: 'Tập trung', tone: 'focus' },
  dnd: { label: 'Không làm phiền', tone: 'dnd' },
  offline: { label: 'Ngoài Realm', tone: 'quiet' },
  unknown: { label: 'Chưa ghép phiên', tone: 'quiet' },
};

const HEALTH_META = {
  stable: { label: 'Ổn định', icon: 'check', tone: 'stable' },
  attention: { label: 'Cần chú ý', icon: 'clock', tone: 'attention' },
  critical: { label: 'Có việc quá hạn', icon: 'alert', tone: 'critical' },
  completed: { label: 'Đã hoàn tất', icon: 'check', tone: 'completed' },
};

function StateCard({ loading, error, onRetry }) {
  return (
    <section className={styles.stateCard} role={error ? 'alert' : 'status'} aria-live="polite">
      <Icon name={loading ? 'clock' : 'alert'} size={22} />
      <div>
        <strong>{loading ? 'Đang mở Sổ bộ Guild…' : 'Chưa tải được Guild Hall'}</strong>
        <p>{loading ? 'Đang tổng hợp thành viên, Quest và chiến dịch từ ERP.' : error}</p>
      </div>
      {!loading && <button type="button" onClick={onRetry}><Icon name="repeat" size={15} />Thử lại</button>}
    </section>
  );
}

function Metric({ icon, label, value, detail }) {
  return (
    <article className={styles.metric}>
      <span><Icon name={icon} size={18} /></span>
      <small>{label}</small>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function MemberRow({ member, onSelect }) {
  const presence = PRESENCE_META[member.presence] || PRESENCE_META.unknown;
  const content = <>
    <span className={styles.avatar} style={{ '--guild-color': member.color }}>{member.name.split(' ').slice(-2).map((part) => part[0]).join('').toUpperCase()}</span>
    <span className={styles.memberIdentity}>
      <strong>{member.name}{member.isLead && <small className={styles.leadBadge}>Guild Lead</small>}</strong>
      <small>{member.realmClass} · {member.currentProject}</small>
    </span>
    <span className={`${styles.presence} ${styles[`presence_${presence.tone}`]}`}><i />{presence.label}</span>
    <span className={styles.questCount}><b>{member.openQuests}</b><small>Quest mở</small></span>
  </>;
  return onSelect ? (
    <button type="button" className={styles.memberRow} onClick={() => onSelect(member)} aria-label={`Mở tương tác với ${member.name}`}>{content}</button>
  ) : <article className={styles.memberRow}>{content}</article>;
}

function CampaignCard({ campaign, onOpen }) {
  const health = HEALTH_META[campaign.health] || HEALTH_META.attention;
  return (
    <article className={styles.campaignCard}>
      <header>
        <div><span>Campaign</span><h3>{campaign.name}</h3></div>
        <span className={`${styles.health} ${styles[`health_${health.tone}`]}`}><Icon name={health.icon} size={14} />{health.label}</span>
      </header>
      <p>Điều phối: {campaign.owner} · Hạn gần nhất: {campaign.nextDue}</p>
      <div className={styles.progressLabel}><span>{campaign.doneTasks}/{campaign.totalTasks || 0} tiêu chí</span><strong>{campaign.progress}%</strong></div>
      <div className={styles.progress} role="progressbar" aria-label={`Tiến độ ${campaign.name}`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={campaign.progress}><i style={{ width: `${campaign.progress}%` }} /></div>
      <footer>
        <span><b>{campaign.activeTasks}</b> đang mở</span>
        <span><b>{campaign.overdueTasks}</b> quá hạn</span>
        {onOpen && <button type="button" onClick={() => onOpen(campaign)}>Mở War Room<Icon name="projects" size={15} /></button>}
      </footer>
    </article>
  );
}

export default function GuildHall({
  operationsSource = 'local',
  localDashboard,
  presence = [],
  compact = false,
  onSelectMember,
  onOpenCampaign,
  onOpenEmbassy,
  dataRevision = 0,
}) {
  const titleId = useId();
  const [dashboard, setDashboard] = useState(() => localDashboard || createRealmGuildDashboard());
  const [loading, setLoading] = useState(operationsSource === 'erp');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  const load = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (operationsSource !== 'erp') {
      setDashboard(localDashboard || createRealmGuildDashboard());
      setLoading(false);
      setError('');
      return undefined;
    }
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 6500);
    setLoading(true);
    setError('');
    fetch('/api/realm-demo/guild', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Không thể tải Guild Hall.');
        if (payload?.source !== 'erp' || !payload?.guild) throw new Error('ERP trả về Sổ bộ Guild không hợp lệ.');
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

  const visibleDashboard = useMemo(() => mergeRealmGuildPresence(dashboard, presence), [dashboard, presence]);
  if (loading) return <StateCard loading />;
  if (error) return <StateCard error={error} onRetry={load} />;
  const { guild, metrics, members, campaigns, source } = visibleDashboard;

  return (
    <section className={`${styles.guildHall} ${compact ? styles.compact : ''}`} aria-labelledby={titleId}>
      <header className={styles.hero}>
        <span className={styles.crest}><Icon name="shield" size={compact ? 22 : 28} /></span>
        <div>
          <span className={styles.eyebrow}>Guild Hall · Team & Campaign Bridge</span>
          <h2 id={titleId}>{guild.name}</h2>
          <p>{guild.charter}</p>
        </div>
        <span className={`${styles.sourceBadge} ${source === 'erp' ? styles.sourceLive : ''}`}><Icon name={source === 'erp' ? 'check' : 'shield'} size={14} />{source === 'erp' ? 'ERP live · read-only' : 'Demo cục bộ'}</span>
      </header>

      <div className={styles.metrics} aria-label="Tổng quan Guild">
        <Metric icon="staff" label="Thành viên" value={metrics.members} detail={`${metrics.present} đang hiện diện`} />
        <Metric icon="tasks" label="Quest đang mở" value={metrics.openQuests} detail={`${metrics.readyQuests} sẵn sàng ghi Gold`} />
        <Metric icon="projects" label="Chiến dịch" value={metrics.activeCampaigns} detail="Đang được phối hợp" />
        <Metric icon="reports" label="Tiến độ chung" value={`${metrics.completionPercent}%`} detail="Theo tiêu chí công việc" />
      </div>

      {onOpenEmbassy && <button type="button" className={styles.embassyLink} onClick={onOpenEmbassy}>
        <span><Icon name="leads" size={20} /></span>
        <div><small>CRM relationship bridge</small><strong>Mở Royal Embassy</strong><p>Xem tân thư, pipeline cơ hội và sổ minh ước với đối tác.</p></div>
        <Icon name="clients" size={19} />
      </button>}

      <div className={styles.columns}>
        <section className={styles.panel} aria-labelledby={`${titleId}-roster`}>
          <header className={styles.panelHead}><div><span>Guild roster</span><h3 id={`${titleId}-roster`}>Sổ bộ thành viên</h3></div><small>Presence chỉ là trạng thái tự nguyện</small></header>
          <div className={styles.roster}>
            {members.length ? members.map((member) => <MemberRow key={member.id} member={member} onSelect={onSelectMember} />) : <p className={styles.empty}>Chưa có thành viên trong phạm vi Guild này.</p>}
          </div>
        </section>

        <section className={styles.panel} aria-labelledby={`${titleId}-campaigns`}>
          <header className={styles.panelHead}><div><span>Campaign pulse</span><h3 id={`${titleId}-campaigns`}>Chiến dịch của Guild</h3></div><small>Không xếp hạng cá nhân</small></header>
          <div className={styles.campaigns}>
            {campaigns.length ? campaigns.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} onOpen={onOpenCampaign} />) : <p className={styles.empty}>Chưa có Project gắn với thành viên Guild.</p>}
          </div>
        </section>
      </div>

      {!compact && (
        <aside className={styles.governance}>
          <Icon name="shield" size={18} />
          <div><strong>Guild Hall phục vụ phối hợp, không chấm điểm con người</strong><p>Dashboard không hiển thị Gold theo thành viên, không suy diễn năng suất từ presence và không tạo leaderboard. Dữ liệu chiến dịch chỉ đọc từ Team, Project và Task hiện hữu.</p></div>
        </aside>
      )}
    </section>
  );
}
