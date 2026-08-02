'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui';
import { buildCeoTerminalCockpit } from '@/lib/ceo-terminal-cockpit';
import styles from './ceo-operations-cockpit.module.css';

const COPY = {
  vi: {
    eyebrow: 'CEO-12 · GROUP OPERATIONS COCKPIT',
    title: 'Bàn điều hành hôm nay',
    intro: 'Một nơi để nhìn thấy việc cần CEO xử lý trước, sau đó đi vào đúng workflow của công ty sở hữu dữ liệu.',
    live: 'Tự cập nhật mỗi 2 phút',
    actions: 'Thao tác nhanh',
    command: 'Giao việc liên công ty',
    inbox: 'Nhắn tin cho các công ty',
    workforce: 'Điều phối nhân sự group',
    world: 'Mở bản đồ công ty',
    sources: 'Nguồn đang hoạt động',
    receipts: 'Receipt cần xử lý',
    replies: 'Phản hồi gần nhất',
    people: 'Nhân sự đã liên kết',
    crossEntity: 'người ở nhiều công ty',
    attention: 'Hàng đợi ưu tiên',
    attentionHint: 'Sắp theo ảnh hưởng và khả năng cần hành động; không tự sửa record thay CEO.',
    clear: 'Không có cảnh báo cần xử lý từ các nguồn đang khả dụng.',
    open: 'Mở nơi xử lý',
    companyPulse: 'Nhịp vận hành bốn công ty',
    source: 'Dữ liệu',
    ring: 'Quyền kết nối',
    openReceipts: 'receipt mở',
    lastUpdate: 'Cockpit chốt lúc',
    readPolicy: 'Read model CEO-12 · không ghi trực tiếp database công ty · không cộng gộp GMV, revenue và cash.',
    fresh: 'Mới', stale: 'Cũ còn dùng được', expired: 'Hết hạn', invalid: 'Lỗi', missing: 'Chưa đồng bộ', disabled: 'Đã tắt',
    active: 'Đang hoạt động', hold: 'Đang giữ', paused: 'Tạm dừng', unknown: 'Chưa rõ',
    sourceAvailable: 'Sẵn sàng', sourceUnavailable: 'Gián đoạn', sourceLocked: 'Cần step-up',
    loading: 'Đang tổng hợp luồng vận hành…',
  },
  en: {
    eyebrow: 'CEO-12 · GROUP OPERATIONS COCKPIT',
    title: "Today's operations desk",
    intro: 'See what needs CEO attention first, then enter the canonical workflow owned by the relevant company.',
    live: 'Refreshes every 2 minutes',
    actions: 'Quick actions',
    command: 'Dispatch cross-company work',
    inbox: 'Message company teams',
    workforce: 'Coordinate group workforce',
    world: 'Open company map',
    sources: 'Available sources',
    receipts: 'Receipts requiring attention',
    replies: 'Recent replies',
    people: 'Linked people',
    crossEntity: 'people across companies',
    attention: 'Priority queue',
    attentionHint: 'Ordered by impact and actionability; the cockpit never changes a record on the CEO’s behalf.',
    clear: 'No actionable warning was found in the currently available sources.',
    open: 'Open resolution workflow',
    companyPulse: 'Four-company operating pulse',
    source: 'Data',
    ring: 'Connection scope',
    openReceipts: 'open receipts',
    lastUpdate: 'Cockpit generated at',
    readPolicy: 'CEO-12 read model · no direct company database writes · GMV, revenue, and cash are never combined.',
    fresh: 'Fresh', stale: 'Stale but usable', expired: 'Expired', invalid: 'Invalid', missing: 'Not synced', disabled: 'Disabled',
    active: 'Active', hold: 'On hold', paused: 'Paused', unknown: 'Unknown',
    sourceAvailable: 'Ready', sourceUnavailable: 'Degraded', sourceLocked: 'Step-up required',
    loading: 'Composing the operating picture…',
  },
};

const ATTENTION_COPY = {
  vi: {
    'identity.step_up_required': ['Kích hoạt phiên CEO bảo mật', 'Lệnh, tin nhắn và deep link cần phiên CEO cùng TOTP step-up.'],
    'entity.source_unavailable': ['Nguồn công ty chưa sử dụng được', 'Snapshot hết hạn, lỗi hoặc chưa đồng bộ; các số này không được đưa vào tổng.'],
    'entity.source_stale': ['Snapshot công ty đang cũ', 'Portal đang giữ bản gần nhất theo stale-if-error; cần kiểm tra kết nối nguồn.'],
    'command.delivery_failed': ['Lệnh liên công ty chưa hoàn tất', 'Mở sổ giao nhận để xem lỗi hoặc receipt bị từ chối. Không tự gửi lại.'],
    'command.receipt_pending': ['Lệnh đang chờ receipt', 'Đối soát correlation ID trước khi cân nhắc thao tác tiếp theo.'],
    'message.delivery_failed': ['Tin nhắn chưa giao được', 'Mở Unified Inbox để xem lỗi giao nhận của entity đích.'],
    'message.receipt_pending': ['Tin nhắn đang chờ xác nhận', 'Chưa có receipt từ entity đích; tránh gửi lặp.'],
    'rollout.migration_required': ['Control plane chưa đủ migration', 'Rollout state của một hoặc nhiều công ty chưa sẵn sàng.'],
    'rollout.review_required': ['Ring kết nối cần được rà soát', 'Một hoặc nhiều công ty đang hold/paused theo chính sách rollout.'],
    'terminal.source_degraded': ['Một nguồn cockpit đang gián đoạn', 'Các phần còn lại vẫn hoạt động; mở Security để điều tra theo từng adapter.'],
  },
  en: {
    'identity.step_up_required': ['Activate the protected CEO session', 'Commands, messages, and deep links require the CEO session plus TOTP step-up.'],
    'entity.source_unavailable': ['Company source is unavailable', 'An expired, invalid, or missing snapshot is excluded from every aggregate.'],
    'entity.source_stale': ['Company snapshot is stale', 'The Portal retained the latest usable snapshot under stale-if-error policy.'],
    'command.delivery_failed': ['Cross-company command is incomplete', 'Inspect the delivery ledger for a failure or rejection. Do not resend automatically.'],
    'command.receipt_pending': ['Command is awaiting a receipt', 'Reconcile the correlation ID before taking another action.'],
    'message.delivery_failed': ['Message delivery failed', 'Open Unified Inbox to inspect the target-entity delivery failure.'],
    'message.receipt_pending': ['Message is awaiting confirmation', 'No target receipt exists yet; avoid sending a duplicate.'],
    'rollout.migration_required': ['Control-plane migration is incomplete', 'Rollout state is unavailable for one or more companies.'],
    'rollout.review_required': ['Connection ring needs review', 'One or more companies are intentionally held or paused by rollout policy.'],
    'terminal.source_degraded': ['A cockpit source is degraded', 'Other sources remain usable; investigate the affected adapter in Security.'],
  },
};

const SOURCE_ENDPOINTS = [
  ['rollout', '/api/ceo/v1/rollout'],
  ['workforce', '/api/ceo/v1/staff/links'],
  ['commands', '/api/ceo/v1/command-gateway?limit=100', true],
  ['conversations', '/api/ceo/v1/messaging/conversations', true],
];

function dateTime(value, locale) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function age(value, locale) {
  if (!Number.isFinite(value)) return '—';
  if (value < 60) return `${value}s`;
  if (value < 3600) return `${Math.floor(value / 60)}m`;
  return `${Math.floor(value / 3600)}${locale === 'en' ? 'h' : 'g'}`;
}

export default function CeoOperationsCockpit({ dashboard, identityReady, locale = 'vi', entityId = 'all' }) {
  const c = COPY[locale] || COPY.vi;
  const attentionCopy = ATTENTION_COPY[locale] || ATTENTION_COPY.vi;
  const [operations, setOperations] = useState({ rollout: null, commands: null, conversations: null, workforce: null });
  const [sourceStates, setSourceStates] = useState({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const targets = SOURCE_ENDPOINTS.filter(([, , protectedSource]) => !protectedSource || identityReady);
    const locked = Object.fromEntries(SOURCE_ENDPOINTS.filter(([, , protectedSource]) => protectedSource && !identityReady).map(([key]) => [key, 'locked']));
    const results = await Promise.all(targets.map(async ([key, endpoint]) => {
      const response = await fetch(endpoint, { cache: 'no-store' }).catch(() => null);
      const body = response ? await response.json().catch(() => null) : null;
      return { key, ok: Boolean(response?.ok && body), body };
    }));
    setOperations((current) => ({
      ...current,
      ...Object.fromEntries(results.filter((result) => result.ok).map((result) => [result.key, result.body])),
      ...(identityReady ? {} : { commands: null, conversations: null }),
    }));
    setSourceStates({
      ...locked,
      ...Object.fromEntries(results.map((result) => [result.key, result.ok ? 'available' : 'unavailable'])),
    });
    setLoading(false);
  }, [identityReady]);

  useEffect(() => {
    let active = true;
    const run = () => load().catch(() => { if (active) setLoading(false); });
    run();
    const timer = setInterval(run, 120_000);
    return () => { active = false; clearInterval(timer); };
  }, [load]);

  const model = useMemo(() => buildCeoTerminalCockpit({
    dashboard,
    rollout: operations.rollout,
    commands: operations.commands,
    conversations: operations.conversations,
    staffLinks: operations.workforce,
    sourceStates,
    identityReady,
    entityId,
  }), [dashboard, entityId, identityReady, operations, sourceStates]);

  const sourceLabel = (state) => state === 'available' ? c.sourceAvailable : state === 'locked' ? c.sourceLocked : c.sourceUnavailable;
  const sourceStateLabel = (state) => c[state] || state;

  return <section className={styles.cockpit} aria-labelledby="ceo-operations-cockpit-title" aria-busy={loading || undefined}>
    <header className={styles.header}>
      <div>
        <p className={styles.eyebrow}>{c.eyebrow}</p>
        <h2 id="ceo-operations-cockpit-title">{c.title}</h2>
        <p>{c.intro}</p>
      </div>
      <span className={styles.live}><i aria-hidden="true" />{loading ? c.loading : c.live}</span>
    </header>

    <div className={styles.quickBlock}>
      <span>{c.actions}</span>
      <div className={styles.quickActions}>
        <Link href="/ceo-commands?compose=task.create"><Icon name="tasks" size={17} />{c.command}</Link>
        <Link href="/ceo-inbox"><Icon name="mail" size={17} />{c.inbox}</Link>
        <Link href="/ceo-workforce"><Icon name="staff" size={17} />{c.workforce}</Link>
        <Link href="/ceo-world"><Icon name="link" size={17} />{c.world}</Link>
      </div>
    </div>

    <div className={styles.metrics} aria-label={c.title}>
      <article><span><Icon name="link" size={18} /></span><div><small>{c.sources}</small><strong>{model.metrics.sourcesAvailable}/{model.metrics.sourcesRegistered}</strong></div></article>
      <article><span><Icon name="shield" size={18} /></span><div><small>{c.receipts}</small><strong>{model.metrics.openReceipts}</strong></div></article>
      <article><span><Icon name="mail" size={18} /></span><div><small>{c.replies}</small><strong>{model.metrics.recentReplies}</strong></div></article>
      <article><span><Icon name="staff" size={18} /></span><div><small>{c.people}</small><strong>{model.metrics.groupPeople}</strong><em>{model.metrics.crossEntityPeople} {c.crossEntity}</em></div></article>
    </div>

    <div className={styles.workspace}>
      <section className={styles.attention} aria-labelledby="ceo-attention-title">
        <div className={styles.sectionHead}><div><h3 id="ceo-attention-title">{c.attention}</h3><p>{c.attentionHint}</p></div><span>{model.attention.length}</span></div>
        {model.attention.length ? <ol>
          {model.attention.map((item) => {
            const [title, description] = attentionCopy[item.code] || [item.code, ''];
            return <li key={item.code} className={styles[item.severity]}>
              <span className={styles.severityIcon}><Icon name={item.severity === 'critical' ? 'alert' : item.severity === 'warning' ? 'clock' : 'shield'} size={18} /></span>
              <div><strong>{title}</strong><p>{description}</p>{item.entityIds.length > 0 && <small>{item.entityIds.join(' · ')}</small>}</div>
              <b>{item.count}</b>
              <Link href={item.href}>{c.open}<Icon name="link" size={14} /></Link>
            </li>;
          })}
        </ol> : <div className={styles.clear}><Icon name="check" size={20} /><span>{c.clear}</span></div>}
      </section>

      <section className={styles.pulse} aria-labelledby="ceo-company-pulse-title">
        <div className={styles.sectionHead}><div><h3 id="ceo-company-pulse-title">{c.companyPulse}</h3><p>{entityId === 'all' ? 'AIm · Egoric · Vnecom · Egolive' : entityId}</p></div></div>
        <div className={styles.companyList}>
          {model.companies.map((company) => <article key={company.id}>
            <header><span>{company.id.slice(0, 2).toUpperCase()}</span><div><strong>{company.displayName}</strong><small>{company.id}</small></div></header>
            <dl>
              <div><dt>{c.source}</dt><dd className={styles[company.sourceState]}><i />{sourceStateLabel(company.sourceState)} · {age(company.sourceAgeSeconds, locale)}</dd></div>
              <div><dt>{c.ring}</dt><dd>{company.rolloutRing} · {c[company.rolloutStatus] || company.rolloutStatus}</dd></div>
              <div><dt>Receipt</dt><dd>{company.openReceipts} {c.openReceipts}</dd></div>
            </dl>
          </article>)}
        </div>
      </section>
    </div>

    <footer className={styles.footer}>
      <p><Icon name="shield" size={15} />{c.readPolicy}</p>
      <div aria-label="CEO-12 source status">
        {Object.entries(model.sources).map(([source, state]) => <span key={source} className={styles[state]}><i />{source}: {sourceLabel(state)}</span>)}
      </div>
      <time dateTime={model.generatedAt}>{c.lastUpdate}: {dateTime(model.generatedAt, locale)}</time>
    </footer>
  </section>;
}
