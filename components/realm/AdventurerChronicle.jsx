'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Icon } from '@/components/ui';
import styles from './adventurer-chronicle.module.css';

const QUEST_STATUS = {
  todo: 'Chờ thực hiện', doing: 'Đang thực hiện', in_progress: 'Đang thực hiện', review: 'Đang review', blocked: 'Bị chặn', done: 'Hoàn tất',
};
const ATTENDANCE = { present: 'Tại văn phòng', remote: 'Làm việc từ xa', off: 'Nghỉ' };
const PRIORITY = { low: 'Thấp', medium: 'Vừa', high: 'Cao', urgent: 'Khẩn' };

function dateLabel(value, withYear = true) {
  if (!value) return 'Chưa đặt';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('vi-VN', withYear
    ? { day: '2-digit', month: '2-digit', year: 'numeric' }
    : { day: '2-digit', month: '2-digit' });
}

function timelineDate(value) {
  const parsed = new Date(value || '');
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function initials(name) {
  return String(name || 'A').trim().split(/\s+/).slice(-2).map((part) => part[0]).join('').toUpperCase();
}

function StateCard({ loading = false, error = '', onRetry }) {
  return <section className={styles.stateCard} role={error ? 'alert' : 'status'} aria-live="polite">
    <span><Icon name={loading ? 'clock' : 'alert'} size={22} /></span>
    <div><strong>{loading ? 'Đang mở Adventurer Chronicle…' : 'Chưa tải được Sổ nhân vật'}</strong><p>{loading ? 'Đang tổng hợp dữ liệu cá nhân từ Task, Project, TimeLog, Leave, Attendance, Approval và Gold journal.' : error}</p></div>
    {error && <button type="button" onClick={onRetry}><Icon name="repeat" size={15} />Thử lại</button>}
  </section>;
}

function QuestCard({ quest }) {
  const percent = quest.total ? Math.round((quest.progress / quest.total) * 100) : 0;
  return <article className={`${styles.questCard} ${quest.overdue ? styles.questDanger : ''}`}>
    <header>
      <span className={`${styles.priority} ${styles[`priority_${quest.priority}`] || ''}`}>{PRIORITY[quest.priority] || quest.priority}</span>
      <span className={quest.overdue ? styles.dangerText : ''}><Icon name={quest.overdue ? 'alert' : 'calendar'} size={14} />{dateLabel(quest.dueDate, false)}</span>
    </header>
    <h4>{quest.title}</h4>
    <p>{quest.project?.name || 'Việc chung'} · {QUEST_STATUS[quest.status] || quest.status}</p>
    <div className={styles.progressLabel}><span>{quest.progress}/{quest.total} tiêu chí</span><strong>{percent}%</strong></div>
    <div className={styles.progressBar} role="progressbar" aria-label={`Tiến độ ${quest.title}`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent}><i style={{ width: `${percent}%` }} /></div>
    <footer>
      <span><Icon name="clock" size={14} />{quest.estHours > 0 ? `${quest.estHours}h ước lượng` : 'Chưa ước lượng'}</span>
      {quest.reward && <span><Icon name="wallet" size={14} />{quest.reward.gold} Gold</span>}
      {quest.href && <Link href={quest.href}>Mở Task ERP</Link>}
    </footer>
  </article>;
}

function ChronicleMetric({ icon, label, value, note, tone = '' }) {
  return <article className={`${styles.metricCard} ${tone ? styles[`metric_${tone}`] || '' : ''}`}>
    <span><Icon name={icon} size={19} /></span>
    <div><small>{label}</small><strong>{value}</strong><p>{note}</p></div>
  </article>;
}

export default function AdventurerChronicle({ operationsSource = 'local', localDashboard = null, dataRevision = 0, compact = false }) {
  const titleId = useId();
  const [dashboard, setDashboard] = useState(localDashboard);
  const [loading, setLoading] = useState(operationsSource === 'erp');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (operationsSource !== 'erp') {
      setDashboard(localDashboard);
      setLoading(false);
      setError('');
      return undefined;
    }
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 7000);
    setLoading(true);
    setError('');
    fetch('/api/realm-demo/chronicle', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Không thể tải Adventurer Chronicle.');
        if (payload?.source !== 'erp' || payload?.privacy?.scope !== 'self' || !Array.isArray(payload?.quests) || !Array.isArray(payload?.timeline)) {
          throw new Error('ERP trả về Chronicle không hợp lệ.');
        }
        if (active) setDashboard(payload);
      })
      .catch((requestError) => {
        if (active) setError(requestError.name === 'AbortError' ? 'ERP phản hồi quá lâu. Hãy thử lại.' : requestError.message);
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (active) setLoading(false);
      });
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [dataRevision, localDashboard, operationsSource, revision]);

  const visibleQuests = useMemo(() => (dashboard?.quests || []).filter((quest) => {
    if (quest.status === 'done') return false;
    return !attentionOnly || quest.overdue || quest.dueSoon || quest.status === 'blocked';
  }).slice(0, compact ? 4 : 8), [attentionOnly, compact, dashboard]);

  if (loading && !dashboard) return <StateCard loading />;
  if (error && !dashboard) return <StateCard error={error} onRetry={reload} />;
  if (!dashboard) return <StateCard error="Chưa có dữ liệu Chronicle." onRetry={reload} />;

  const { identity, career, metrics, muster, campaigns, approvals, timeline, privacy, source, links } = dashboard;
  return <section className={`${styles.chronicle} ${compact ? styles.compact : ''}`} aria-label="Adventurer Chronicle từ dữ liệu ERP cá nhân">
    <header className={styles.hero}>
      <span className={styles.avatar} style={{ '--chronicle-color': identity.color }}>{initials(identity.name)}</span>
      <div className={styles.heroCopy}>
        <span className={styles.eyebrow}>Adventurer Chronicle · Self-service ERP status</span>
        <h2 id={titleId}>Nhật trình của {identity.name}</h2>
        <p>{identity.title} · {identity.realmClass}{identity.team ? ` · ${identity.team.name}` : ''}</p>
      </div>
      <span className={`${styles.sourceBadge} ${source === 'erp' ? styles.sourceLive : ''}`}><Icon name={source === 'erp' ? 'check' : 'shield'} size={14} />{source === 'erp' ? 'ERP live · chỉ dữ liệu của bạn' : 'Demo cục bộ'}</span>
    </header>

    {error && <div className={styles.staleNotice} role="alert"><Icon name="alert" size={16} /><span>{error} Snapshot gần nhất vẫn được giữ.</span><button type="button" onClick={reload}>Thử lại</button></div>}

    <div className={styles.metrics} aria-label="Tổng quan trạng thái cá nhân">
      <ChronicleMetric icon="tasks" label="Quest đang mở" value={metrics.openQuests} note={`${metrics.dueSoonQuests} đến hạn trong 7 ngày`} tone={metrics.overdueQuests ? 'danger' : ''} />
      <ChronicleMetric icon="clock" label="Giờ tự ghi tuần này" value={`${metrics.loggedHours}h`} note={`${metrics.trackedDays} ngày có TimeLog`} />
      <ChronicleMetric icon="shield" label="Chờ hội đồng" value={metrics.pendingApprovals} note="Yêu cầu do chính bạn tạo" />
      <ChronicleMetric icon="wallet" label="Gold khả dụng" value={`${career.wallet} G`} note={`Level ${career.level} · ${career.renown.toLocaleString('vi-VN')} Renown`} />
    </div>

    <div className={styles.primaryGrid}>
      <section className={styles.panel} aria-labelledby={`${titleId}-quests`}>
        <header className={styles.sectionHead}>
          <div><span>Personal quest watch</span><h3 id={`${titleId}-quests`}>Quest cần bạn chú ý</h3></div>
          <label className={styles.attentionToggle}><input type="checkbox" checked={attentionOnly} onChange={(event) => setAttentionOnly(event.target.checked)} /><span>Chỉ việc gần hạn / bị chặn</span></label>
        </header>
        <div className={styles.questGrid}>{visibleQuests.length ? visibleQuests.map((quest) => <QuestCard quest={quest} key={quest.id} />) : <div className={styles.empty}><Icon name="check" size={20} /><strong>Không có Quest cần chú ý</strong><p>Bộ lọc hiện tại không có công việc phù hợp.</p></div>}</div>
        {links.tasks && <Link className={styles.sectionLink} href={links.tasks}><Icon name="tasks" size={15} />Mở toàn bộ Task ERP</Link>}
      </section>

      <aside className={styles.sideStack}>
        <section className={styles.panel} aria-labelledby={`${titleId}-muster`}>
          <header className={styles.sectionHead}><div><span>Royal Muster</span><h3 id={`${titleId}-muster`}>Lịch làm việc của bạn</h3></div></header>
          <dl className={styles.musterList}>
            <div><dt>Hôm nay</dt><dd>{muster.today ? ATTENDANCE[muster.today.status] || muster.today.status : 'Chưa check-in'}{muster.today?.checkIn ? ` · ${muster.today.checkIn}` : ''}</dd></div>
            <div><dt>Kỳ nghỉ kế tiếp</dt><dd>{muster.nextLeave ? `${dateLabel(muster.nextLeave.from, false)}${muster.nextLeave.to !== muster.nextLeave.from ? ` → ${dateLabel(muster.nextLeave.to, false)}` : ''} · ${muster.nextLeave.status === 'approved' ? 'Đã duyệt' : 'Đang chờ'}` : 'Chưa có lịch nghỉ'}</dd></div>
          </dl>
          <div className={styles.linkRow}>{muster.attendanceHref && <Link href={muster.attendanceHref}>Mở Attendance</Link>}{muster.timesheetHref && <Link href={muster.timesheetHref}>Mở Timesheet</Link>}</div>
        </section>

        <section className={styles.panel} aria-labelledby={`${titleId}-loadout`}>
          <header className={styles.sectionHead}><div><span>Identity loadout</span><h3 id={`${titleId}-loadout`}>Trang bị hồ sơ</h3></div><small>{identity.inventoryCount} vật phẩm sở hữu</small></header>
          <div className={styles.loadout}>
            {[['title', 'Danh hiệu'], ['seal', 'Ấn tín'], ['banner', 'Banner']].map(([slot, label]) => {
              const item = identity.loadout?.[slot];
              return <span key={slot}><Icon name={item?.icon || 'shield'} size={16} /><small>{label}</small><strong>{item?.equipName || 'Chưa trang bị'}</strong></span>;
            })}
          </div>
          <div className={styles.levelLabel}><span>Level {career.level}</span><strong>{career.renown.toLocaleString('vi-VN')} / {career.nextLevelRenown.toLocaleString('vi-VN')} Renown</strong></div>
          <div className={styles.levelBar} role="progressbar" aria-label="Tiến độ cấp độ nhân vật" aria-valuemin="0" aria-valuemax="100" aria-valuenow={career.levelProgress}><i style={{ width: `${career.levelProgress}%` }} /></div>
        </section>
      </aside>
    </div>

    {!compact && <div className={styles.secondaryGrid}>
      <section className={styles.panel} aria-labelledby={`${titleId}-campaigns`}>
        <header className={styles.sectionHead}><div><span>Assigned campaigns</span><h3 id={`${titleId}-campaigns`}>Chiến dịch có Quest của bạn</h3></div><small>{metrics.activeCampaigns} đang hoạt động</small></header>
        <div className={styles.campaignList}>{campaigns.length ? campaigns.map((campaign) => <article key={campaign.id}>
          <span><Icon name="projects" size={17} /></span><div><strong>{campaign.name}</strong><small>{campaign.openQuests}/{campaign.quests} Quest đang mở{campaign.overdue ? ` · ${campaign.overdue} quá hạn` : ''}</small></div><b>{campaign.progress}%</b>{campaign.href && <Link href={campaign.href} aria-label={`Mở chiến dịch ${campaign.name}`}><Icon name="repeat" size={15} /></Link>}
        </article>) : <div className={styles.empty}><strong>Chưa có chiến dịch</strong><p>Task của bạn chưa gắn Project ERP.</p></div>}</div>
      </section>

      <section className={styles.panel} aria-labelledby={`${titleId}-timeline`}>
        <header className={styles.sectionHead}><div><span>Personal record trail</span><h3 id={`${titleId}-timeline`}>Dòng thời gian gần đây</h3></div><small>Không chứa ghi chú nhạy cảm</small></header>
        <ol className={styles.timeline}>{timeline.length ? timeline.map((event) => <li key={event.id}><span><Icon name={event.icon} size={15} /></span><div><strong>{event.title}</strong><small>{event.detail}</small></div><time dateTime={event.at}>{timelineDate(event.at)}</time>{event.href && <Link href={event.href} aria-label={`Mở bản ghi ${event.title}`}><Icon name="repeat" size={14} /></Link>}</li>) : <li className={styles.empty}><strong>Chưa có nhật trình</strong><small>Các thay đổi ERP của chính bạn sẽ xuất hiện tại đây.</small></li>}</ol>
      </section>
    </div>}

    {approvals.length > 0 && <section className={styles.approvalStrip} aria-label="Yêu cầu đang chờ của bạn"><span><Icon name="shield" size={18} /></span><div><strong>{approvals.length} yêu cầu đang chờ hội đồng</strong><p>{approvals.slice(0, 2).map((approval) => approval.title).join(' · ')}</p></div>{links.approvals && <Link href={links.approvals}>Mở Council Chamber</Link>}</section>}

    <aside className={styles.governance}><Icon name="shield" size={18} /><div><strong>Hồ sơ tự phục vụ, không phải công cụ giám sát</strong><p>{privacy.capacityNote} Chronicle không đọc lương, điểm review, nhận xét quản lý hoặc ghi chú riêng tư; ERP vẫn là nguồn sự thật duy nhất.</p></div></aside>
  </section>;
}
