'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Forbidden, Icon, useToast } from '@/components/ui';
import { useLanguage } from '@/components/LanguageProvider';
import { rolesOf } from '@/lib/perm';
import styles from './page.module.css';

const COPY = {
  vi: {
    eyebrow: 'CEO-13 · UNIFIED DECISION QUEUE', title: 'Hàng đợi quyết định toàn group',
    intro: 'Nhìn thấy quyết định đang chờ ở bốn công ty, rồi mở đúng workflow của công ty sở hữu để xử lý.',
    back: 'Về Tổng quan', refresh: 'Làm mới', all: 'Tất cả', critical: 'Quá SLA nghiêm trọng', warning: 'Đến SLA', normal: 'Trong SLA',
    total: 'Đang chờ', sources: 'Nguồn phản hồi', amount: 'Giá trị đang chờ', empty: 'Không có quyết định phù hợp bộ lọc.',
    open: 'Mở tại công ty', requester: 'Người yêu cầu', step: 'Bước hiện tại', age: 'Tuổi yêu cầu', hours: 'giờ',
    policy: 'CEO Terminal không duyệt thay ERP. Authorization, business rules, maker-checker, receipt và audit vẫn chạy tại công ty sở hữu.',
    locked: 'Cần CEO session và TOTP step-up để đọc hàng đợi quyết định.', loading: 'Đang tổng hợp hàng đợi…', degraded: 'Một số nguồn chưa phản hồi; phần còn lại vẫn dùng được.',
  },
  en: {
    eyebrow: 'CEO-13 · UNIFIED DECISION QUEUE', title: 'Group decision queue',
    intro: 'See pending decisions across four companies, then open the canonical workflow owned by the relevant company.',
    back: 'Back to Overview', refresh: 'Refresh', all: 'All', critical: 'Severely over SLA', warning: 'At SLA', normal: 'Within SLA',
    total: 'Pending', sources: 'Sources responding', amount: 'Pending value', empty: 'No decision matches this filter.',
    open: 'Open in company', requester: 'Requester', step: 'Current step', age: 'Request age', hours: 'hours',
    policy: 'CEO Terminal never approves on behalf of ERP. Authorization, business rules, maker-checker, receipts, and audit remain in the owning company.',
    locked: 'A CEO session with TOTP step-up is required to read the decision queue.', loading: 'Composing the decision queue…', degraded: 'Some sources did not respond; the remaining queue is still usable.',
  },
};

function money(rows, locale) {
  if (!rows?.length) return '—';
  return rows.map(({ currency, value }) => new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'vi-VN', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(value)).join(' · ');
}

export default function CeoDecisionsPage() {
  const { data: session, status } = useSession();
  const { locale } = useLanguage();
  const c = COPY[locale] || COPY.vi;
  const toast = useToast();
  const [queue, setQueue] = useState(null);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const response = await fetch('/api/ceo/v1/decision-queue', { cache: 'no-store' }).catch(() => null);
    const body = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) setError(response?.status === 428 || response?.status === 401 ? c.locked : body.error || c.degraded);
    else setQueue(body);
    setLoading(false);
  }, [c.degraded, c.locked]);

  useEffect(() => { if (status === 'authenticated') load(); }, [load, status]);
  const rows = useMemo(() => (queue?.items || []).filter((item) => filter === 'all' || item.urgency === filter), [filter, queue]);

  const openEntity = async (decision) => {
    const response = await fetch('/api/ceo/v1/sso/authorize', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId: decision.entityId, redirectPath: decision.recordPath }),
    }).catch(() => null);
    const body = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) return toast(body.error || c.locked, 'error');
    window.location.assign(body.destination);
  };

  if (status === 'loading') return <div className={styles.loading}>{c.loading}</div>;
  if (!rolesOf(session?.user).includes('DIRECTOR')) return <Forbidden />;
  return <main className={styles.page} data-no-i18n>
    <header className={styles.hero}>
      <div><p>{c.eyebrow}</p><h1>{c.title}</h1><span>{c.intro}</span></div>
      <div><Link className="btn btn-outline" href="/ceo-overview"><Icon name="dashboard" size={16} />{c.back}</Link><button className="btn btn-primary" type="button" onClick={load}><Icon name="repeat" size={16} />{c.refresh}</button></div>
    </header>
    <section className={styles.policy}><Icon name="shield" size={20} /><p>{c.policy}</p></section>
    {queue && <section className={styles.metrics} aria-label={c.title}>
      <article><small>{c.total}</small><strong>{queue.metrics.total}</strong></article>
      <article><small>{c.critical}</small><strong>{queue.metrics.critical}</strong></article>
      <article><small>{c.sources}</small><strong>{queue.metrics.companiesResponding}/{queue.metrics.companiesExpected}</strong></article>
      <article><small>{c.amount}</small><strong>{money(queue.metrics.amountByCurrency, locale)}</strong></article>
    </section>}
    {queue?.sources?.some((source) => source.state === 'degraded') && <div className={styles.notice} role="status"><Icon name="alert" size={18} />{c.degraded}</div>}
    {error && <div className={styles.error} role="alert"><Icon name="shield" size={18} /><span>{error}</span><Link className="btn btn-outline" href="/ceo-registry">TOTP</Link></div>}
    {loading && <div className={styles.loading} role="status">{c.loading}</div>}
    {queue && <>
      <nav className={styles.filters} aria-label={c.title}>{['all', 'critical', 'warning', 'normal'].map((key) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{c[key]}<b>{key === 'all' ? queue.metrics.total : queue.items.filter((item) => item.urgency === key).length}</b></button>)}</nav>
      <section className={styles.list} aria-live="polite">
        {rows.map((decision) => <article key={`${decision.entityId}:${decision.id}`} className={styles[decision.urgency]}>
          <header><span>{decision.entityName}</span><i>{c[decision.urgency]}</i></header>
          <h2>{decision.title}</h2>
          <dl><div><dt>{c.requester}</dt><dd>{decision.requesterName}</dd></div><div><dt>{c.step}</dt><dd>{decision.currentStep?.label || '—'}</dd></div><div><dt>{c.age}</dt><dd>{decision.ageHours} {c.hours} / SLA {decision.slaHours}h</dd></div><div><dt>{c.amount}</dt><dd>{decision.amount ? money([{ currency: decision.currency, value: decision.amount }], locale) : '—'}</dd></div></dl>
          <button type="button" onClick={() => openEntity(decision)}><Icon name="link" size={16} />{c.open}</button>
        </article>)}
        {!rows.length && <div className={styles.empty}><Icon name="check" size={22} />{c.empty}</div>}
      </section>
    </>}
  </main>;
}
