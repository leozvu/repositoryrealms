'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Forbidden, Icon } from '@/components/ui';
import { useLanguage } from '@/components/LanguageProvider';
import { buildCeoDailyBriefing } from '@/lib/ceo-daily-briefing';
import { buildCeoTerminalCockpit } from '@/lib/ceo-terminal-cockpit';
import { rolesOf } from '@/lib/perm';
import styles from './page.module.css';

const COPY = {
  vi: {
    eyebrow: 'CEO-14 · EXECUTIVE DAILY BRIEFING', title: 'Briefing điều hành hôm nay',
    intro: 'Một trang trả lời ba câu: cần xử lý ngay gì, cần chốt trong hôm nay gì, và cần tiếp tục theo dõi gì.',
    refresh: 'Cập nhật briefing', back: 'Về Tổng quan', decisions: 'Mở hàng đợi quyết định',
    critical: 'Cần xử lý ngay', today: 'Chốt trong hôm nay', watch: 'Tiếp tục theo dõi',
    clear: 'Không có mục ưu tiên trong nguồn đang khả dụng.', generated: 'Chốt briefing lúc',
    readPolicy: 'Briefing được xếp bằng luật xác định, không dùng AI để phát minh dữ kiện hoặc ra quyết định. Mọi business action vẫn đi qua workflow của công ty sở hữu.',
    loading: 'Đang dựng briefing từ các nguồn khả dụng…', source: 'Tình trạng nguồn', available: 'Khả dụng', degraded: 'Gián đoạn',
    decisionsMetric: 'Quyết định mở', sourceMetric: 'Nguồn snapshot', receiptMetric: 'Receipt mở', urgentMetric: 'Việc khẩn cấp', open: 'Mở nơi xử lý',
  },
  en: {
    eyebrow: 'CEO-14 · EXECUTIVE DAILY BRIEFING', title: "Today's executive briefing",
    intro: 'One page answers three questions: what needs action now, what must close today, and what should remain under watch.',
    refresh: 'Refresh briefing', back: 'Back to Overview', decisions: 'Open decision queue',
    critical: 'Act now', today: 'Close today', watch: 'Keep watching',
    clear: 'No priority item exists in the currently available sources.', generated: 'Briefing generated at',
    readPolicy: 'Deterministic rules rank this briefing. AI never invents facts or makes decisions. Every business action remains in the owning company workflow.',
    loading: 'Building the briefing from available sources…', source: 'Source status', available: 'Available', degraded: 'Degraded',
    decisionsMetric: 'Open decisions', sourceMetric: 'Snapshot sources', receiptMetric: 'Open receipts', urgentMetric: 'Urgent items', open: 'Open workflow',
  },
};

const LABELS = {
  vi: {
    'decision.sla_critical': ['Quyết định đã quá SLA nghiêm trọng', 'Mở hàng đợi và vào đúng workflow của công ty để xử lý.'],
    'decision.sla_warning': ['Quyết định đã đến SLA', 'Cần chốt trong hôm nay tại công ty sở hữu.'],
    'decision.source_degraded': ['Nguồn quyết định đang gián đoạn', 'Briefing vẫn giữ các nguồn còn khả dụng; không suy đoán phần bị thiếu.'],
    'entity.source_unavailable': ['Nguồn công ty chưa khả dụng', 'Snapshot hết hạn, lỗi hoặc chưa đồng bộ đã bị loại khỏi tổng.'],
    'entity.source_stale': ['Snapshot công ty đang cũ', 'Portal đang dùng bản gần nhất theo stale-if-error.'],
    'command.delivery_failed': ['Lệnh liên công ty chưa hoàn tất', 'Kiểm tra receipt trước khi thao tác tiếp.'],
    'command.receipt_pending': ['Lệnh đang chờ receipt', 'Không gửi lại trước khi đối soát correlation ID.'],
    'message.delivery_failed': ['Tin nhắn liên công ty chưa giao', 'Mở Inbox để kiểm tra entity đích.'],
    'message.receipt_pending': ['Tin nhắn đang chờ xác nhận', 'Tránh gửi trùng khi chưa có receipt.'],
    'rollout.migration_required': ['Control plane thiếu migration', 'Giữ rollout và xử lý migration trước.'],
    'rollout.review_required': ['Ring kết nối cần rà soát', 'Một công ty đang hold hoặc paused theo chính sách.'],
    'terminal.source_degraded': ['Adapter cockpit đang gián đoạn', 'Các nguồn khác tiếp tục phục vụ briefing.'],
    'identity.step_up_required': ['Phiên CEO cần TOTP step-up', 'Kích hoạt để xem quyết định, receipt và deep link.'],
    'delivery.tasks_overdue': ['Công việc đang quá hạn', 'Mở Tổng quan để xác định công ty và workflow xử lý.'],
    'delivery.projects_late': ['Dự án đang trễ', 'Mở Tổng quan để xem nguồn và điều phối.'],
    'support.sla_breaches': ['Ticket đã vi phạm SLA', 'Mở Tổng quan và vào Support của công ty sở hữu.'],
  },
  en: {
    'decision.sla_critical': ['Decision is severely over SLA', 'Open the queue and enter the owning company workflow.'],
    'decision.sla_warning': ['Decision reached its SLA', 'Close it today in the owning company.'],
    'decision.source_degraded': ['Decision source is degraded', 'Available sources remain usable; missing facts are never inferred.'],
    'entity.source_unavailable': ['Company source is unavailable', 'Expired, invalid, or missing snapshots are excluded.'],
    'entity.source_stale': ['Company snapshot is stale', 'The Portal retained the latest usable snapshot.'],
    'command.delivery_failed': ['Cross-company command is incomplete', 'Inspect its receipt before the next action.'],
    'command.receipt_pending': ['Command awaits a receipt', 'Do not resend before correlation reconciliation.'],
    'message.delivery_failed': ['Cross-company message failed', 'Inspect the target entity in Inbox.'],
    'message.receipt_pending': ['Message awaits confirmation', 'Avoid duplicates while a receipt is pending.'],
    'rollout.migration_required': ['Control-plane migration is incomplete', 'Hold rollout until migration is resolved.'],
    'rollout.review_required': ['Connection ring needs review', 'A company is held or paused by policy.'],
    'terminal.source_degraded': ['A cockpit adapter is degraded', 'Other sources continue serving the briefing.'],
    'identity.step_up_required': ['CEO session needs TOTP step-up', 'Activate it to see decisions, receipts, and deep links.'],
    'delivery.tasks_overdue': ['Tasks are overdue', 'Open Overview to locate the owning workflow.'],
    'delivery.projects_late': ['Projects are late', 'Open Overview to inspect and coordinate.'],
    'support.sla_breaches': ['Tickets breached SLA', 'Open Overview and enter the owning Support workflow.'],
  },
};

const ENDPOINTS = [
  ['dashboard', '/api/ceo/v1/dashboard'],
  ['rollout', '/api/ceo/v1/rollout'],
  ['workforce', '/api/ceo/v1/staff/links'],
  ['commands', '/api/ceo/v1/command-gateway?limit=100', true],
  ['conversations', '/api/ceo/v1/messaging/conversations', true],
  ['decisions', '/api/ceo/v1/decision-queue', true],
];

export default function CeoBriefingPage() {
  const { data: session, status } = useSession();
  const { locale } = useLanguage();
  const c = COPY[locale] || COPY.vi;
  const labels = LABELS[locale] || LABELS.vi;
  const [data, setData] = useState({});
  const [states, setStates] = useState({});
  const [identityReady, setIdentityReady] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const identityResponse = await fetch('/api/ceo/v1/identity/session', { cache: 'no-store' }).catch(() => null);
    const identity = identityResponse ? await identityResponse.json().catch(() => ({})) : {};
    const ready = Boolean(identityResponse?.ok && identity.active && identity.stepUp);
    setIdentityReady(ready);
    const targets = ENDPOINTS.filter(([, , protectedSource]) => !protectedSource || ready);
    const result = await Promise.all(targets.map(async ([key, endpoint]) => {
      const response = await fetch(endpoint, { cache: 'no-store' }).catch(() => null);
      const body = response ? await response.json().catch(() => null) : null;
      return { key, ok: Boolean(response?.ok && body), body };
    }));
    setData(Object.fromEntries(result.filter((entry) => entry.ok).map((entry) => [entry.key, entry.body])));
    setStates({
      ...Object.fromEntries(ENDPOINTS.filter(([, , protectedSource]) => protectedSource && !ready).map(([key]) => [key, 'locked'])),
      ...Object.fromEntries(result.map((entry) => [entry.key, entry.ok ? 'available' : 'degraded'])),
    });
    setLoading(false);
  }, []);

  useEffect(() => { if (status === 'authenticated') load(); }, [load, status]);
  const cockpit = useMemo(() => buildCeoTerminalCockpit({
    dashboard: data.dashboard, rollout: data.rollout, commands: data.commands,
    conversations: data.conversations, staffLinks: data.workforce,
    sourceStates: states, identityReady,
  }), [data, identityReady, states]);
  const briefing = useMemo(() => buildCeoDailyBriefing({ cockpit, decisionQueue: data.decisions, dashboard: data.dashboard }), [cockpit, data]);
  const dateTime = (value) => new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

  if (status === 'loading') return <div className={styles.loading}>{c.loading}</div>;
  if (!rolesOf(session?.user).includes('DIRECTOR')) return <Forbidden />;
  return <main className={styles.page} data-no-i18n>
    <header className={`${styles.hero} ${styles[briefing.state]}`}>
      <div><p>{c.eyebrow}</p><h1>{c.title}</h1><span>{c.intro}</span></div>
      <div><Link className="btn btn-outline" href="/ceo-overview"><Icon name="dashboard" size={16} />{c.back}</Link><button className="btn btn-primary" type="button" onClick={load}><Icon name="repeat" size={16} />{c.refresh}</button></div>
    </header>
    <section className={styles.policy}><Icon name="shield" size={20} /><p>{c.readPolicy}</p></section>
    <section className={styles.metrics} aria-label={c.title}>
      <article><Icon name="alert" size={19} /><small>{c.urgentMetric}</small><strong>{briefing.metrics.critical}</strong></article>
      <article><Icon name="check" size={19} /><small>{c.decisionsMetric}</small><strong>{briefing.metrics.decisions}</strong></article>
      <article><Icon name="link" size={19} /><small>{c.sourceMetric}</small><strong>{briefing.metrics.sourcesAvailable}/{briefing.metrics.sourcesRegistered}</strong></article>
      <article><Icon name="shield" size={19} /><small>{c.receiptMetric}</small><strong>{briefing.metrics.openReceipts}</strong></article>
    </section>
    {loading ? <div className={styles.loading} role="status">{c.loading}</div> : <div className={styles.columns}>
      {['now', 'today', 'watch'].map((section) => <section key={section} className={styles[section]} aria-labelledby={`brief-${section}`}>
        <header><span><Icon name={section === 'now' ? 'alert' : section === 'today' ? 'clock' : 'search'} size={18} /></span><h2 id={`brief-${section}`}>{section === 'now' ? c.critical : c[section]}</h2><b>{briefing.sections[section].length}</b></header>
        <ol>{briefing.sections[section].map((entry, index) => {
          const [title, description] = labels[entry.code] || [entry.code, ''];
          return <li key={`${entry.code}:${index}`}>
            <i className={styles[entry.severity]} aria-label={entry.severity} />
            <div><strong>{entry.context?.title || title}</strong><p>{description}</p>{entry.entityIds.length > 0 && <small>{entry.entityIds.join(' · ')}</small>}</div>
            <b>{entry.count}</b><Link href={entry.href}>{c.open}<Icon name="link" size={13} /></Link>
          </li>;
        })}</ol>
        {!briefing.sections[section].length && <div className={styles.empty}><Icon name="check" size={18} />{c.clear}</div>}
      </section>)}
    </div>}
    <footer className={styles.footer}>
      <div><strong>{c.source}</strong>{Object.entries(briefing.sources).map(([key, value]) => <span key={key} className={styles[value]}><i />{key}: {c[value]}</span>)}{states.decisions === 'locked' && <Link href="/ceo-registry">TOTP</Link>}</div>
      <div><Link href="/ceo-decisions">{c.decisions}<Icon name="link" size={14} /></Link><time dateTime={briefing.generatedAt}>{c.generated}: {dateTime(briefing.generatedAt)}</time></div>
    </footer>
  </main>;
}
