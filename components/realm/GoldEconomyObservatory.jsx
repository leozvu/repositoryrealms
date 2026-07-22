'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui';
import { createRealmEconomyDemoSnapshot } from '@/lib/realm-economy';
import styles from './gold-economy.module.css';

const TYPE_META = {
  all: 'Tất cả bút toán',
  quest_reward: 'Quest reward',
  shop_spend: 'Shop spend',
  adjustment: 'Adjustment',
};

const SEVERITY_META = {
  critical: { label: 'Ưu tiên cao', icon: 'alert' },
  warning: { label: 'Cần review', icon: 'shield' },
  info: { label: 'Trong ngưỡng', icon: 'check' },
};

const gold = (value, sign = false) => `${sign && Number(value) > 0 ? '+' : ''}${Number(value || 0).toLocaleString('vi-VN')} G`;
const dateTime = (value) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value));

function StateCard({ loading = false, error = '', onRetry }) {
  return (
    <section className={styles.stateCard} role={error ? 'alert' : 'status'} aria-live="polite">
      <Icon name={loading ? 'clock' : 'alert'} size={23} />
      <div>
        <strong>{loading ? 'Đang mở sổ ngân khố…' : 'Chưa tải được dữ liệu Gold'}</strong>
        <p>{loading ? 'Đang tổng hợp journal, commitment và budget của kỳ.' : error}</p>
      </div>
      {!loading && <button type="button" onClick={onRetry}><Icon name="repeat" size={15} />Thử lại</button>}
    </section>
  );
}

function MetricCard({ label, value, detail, tone = 'neutral', icon }) {
  return (
    <article className={`${styles.metricCard} ${styles[`metric_${tone}`] || ''}`}>
      <span className={styles.metricIcon}><Icon name={icon} size={18} /></span>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function GoldFlowChart({ rows }) {
  const maxValue = Math.max(1, ...rows.flatMap((row) => [row.issued, row.spent]));
  const activeRows = rows.filter((row) => row.issued || row.spent);
  const issued = activeRows.reduce((sum, row) => sum + row.issued, 0);
  const spent = activeRows.reduce((sum, row) => sum + row.spent, 0);
  return (
    <section className={styles.panel} aria-labelledby="gold-flow-title">
      <header className={styles.panelHead}>
        <div><span>Daily flow</span><h2 id="gold-flow-title">Nhịp Gold theo ngày</h2></div>
        <div className={styles.legend} aria-label="Chú giải biểu đồ"><span><i className={styles.issuedKey} />Phát hành</span><span><i className={styles.spentKey} />Đã tiêu</span></div>
      </header>
      <p className={styles.chartSummary}>Trong {activeRows.length || 0} ngày có biến động: phát hành {gold(issued)}, tiêu {gold(spent)}. Trục ngang là ngày trong tháng; chiều cao biểu thị số Gold.</p>
      <div className={styles.chart} style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(3px, 1fr))` }} role="img" aria-label={`Biểu đồ Gold theo ngày: phát hành ${issued} Gold, đã tiêu ${spent} Gold.`}>
        {rows.map((row) => {
          const showTick = row.day === 1 || row.day % 5 === 0 || row.day === rows.length;
          return (
            <div className={styles.chartDay} key={row.day} title={`Ngày ${row.day}: +${row.issued} phát hành, -${row.spent} đã tiêu`}>
              <div className={styles.barPair} aria-hidden="true">
                <i className={styles.issuedBar} style={{ height: `${Math.max(row.issued ? 5 : 0, (row.issued / maxValue) * 100)}%` }} />
                <i className={styles.spentBar} style={{ height: `${Math.max(row.spent ? 5 : 0, (row.spent / maxValue) * 100)}%` }} />
              </div>
              <small>{showTick ? row.day : ''}</small>
            </div>
          );
        })}
      </div>
      <details className={styles.dataAlternative}>
        <summary>Xem bảng dữ liệu biểu đồ</summary>
        <div className={styles.compactRows}>
          {activeRows.length ? activeRows.map((row) => <div key={row.day}><span>Ngày {row.day}</span><b>+{row.issued} G</b><b>−{row.spent} G</b></div>) : <p>Chưa có biến động Gold trong kỳ.</p>}
        </div>
      </details>
    </section>
  );
}

function AdvisoryPanel({ alerts }) {
  return (
    <section className={styles.panel} aria-labelledby="economy-alerts-title">
      <header className={styles.panelHead}>
        <div><span>Explainable signals</span><h2 id="economy-alerts-title">Tín hiệu cần hội đồng review</h2></div>
        <p>{alerts.filter((alert) => alert.severity !== 'info').length} tín hiệu mở</p>
      </header>
      <div className={styles.advisoryNotice}><Icon name="shield" size={17} /><p>Observatory chỉ nêu tín hiệu và bằng chứng. Hệ thống không tự động kỷ luật, xếp hạng hiệu suất hay đảo bút toán.</p></div>
      <div className={styles.alertList}>
        {alerts.map((alert) => {
          const meta = SEVERITY_META[alert.severity] || SEVERITY_META.warning;
          return (
            <article className={`${styles.alertCard} ${styles[`alert_${alert.severity}`] || ''}`} key={alert.id}>
              <div className={styles.alertTitle}><span><Icon name={meta.icon} size={16} />{meta.label}</span><code>{alert.code}</code></div>
              <h3>{alert.title}</h3>
              <p>{alert.summary}</p>
              <ul>{alert.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
              <footer><strong>Review đề xuất</strong><p>{alert.recommendation}</p></footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ExposurePanel({ people, teams, perUserCap }) {
  return (
    <section className={styles.panel} aria-labelledby="gold-exposure-title">
      <header className={styles.panelHead}>
        <div><span>Distribution</span><h2 id="gold-exposure-title">Phân bổ & nghĩa vụ Gold</h2></div>
        <p>Trần {gold(perUserCap)}/người</p>
      </header>
      <div className={styles.exposureSplit}>
        <div>
          <h3>Thành viên</h3>
          <div className={styles.peopleList}>
            {people.slice(0, 6).map((person, index) => (
              <article key={person.userId}>
                <span className={styles.rank}>{String(index + 1).padStart(2, '0')}</span>
                <span><strong>{person.name}</strong><small>{person.teamName} · {person.sharePercent}% Gold đã phát hành</small></span>
                <span><b>{gold(person.issued)}</b><small>+ {gold(person.committed)} cam kết</small></span>
              </article>
            ))}
            {!people.length && <p className={styles.emptyCopy}>Chưa có dữ liệu thành viên trong phạm vi xem.</p>}
          </div>
        </div>
        <div>
          <h3>Guild / team</h3>
          <div className={styles.teamList}>
            {teams.slice(0, 5).map((team) => (
              <article key={team.teamId || team.teamName}>
                <span><strong>{team.teamName}</strong><small>{team.members} thành viên · {team.sharePercent}% phát hành</small></span>
                <b>{gold(team.issued)}</b>
              </article>
            ))}
            {!teams.length && <p className={styles.emptyCopy}>Chưa có dữ liệu team trong kỳ.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function LedgerExplorer({ entries, period }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [direction, setDirection] = useState('all');
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('vi');
    return entries.filter((entry) => {
      const matchesType = type === 'all' || entry.type === type;
      const matchesDirection = direction === 'all' || (direction === 'in' ? entry.amount > 0 : entry.amount < 0);
      const haystack = `${entry.userName} ${entry.label} ${entry.sourceType || ''} ${entry.sourceId || ''}`.toLocaleLowerCase('vi');
      return matchesType && matchesDirection && (!needle || haystack.includes(needle));
    }).slice(0, 100);
  }, [direction, entries, query, type]);

  const exportCsv = () => {
    const header = ['Thời gian UTC', 'Thành viên', 'Team', 'Loại', 'Gold', 'Nhãn', 'Nguồn', 'Mã nguồn'];
    const lines = visible.map((entry) => [entry.createdAt, entry.userName, entry.teamName, entry.type, entry.amount, entry.label, entry.sourceType, entry.sourceId]);
    const csv = [header, ...lines].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `realm-gold-ledger-${period}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <section className={styles.panel} aria-labelledby="ledger-explorer-title">
      <header className={styles.panelHead}>
        <div><span>Append-only journal</span><h2 id="ledger-explorer-title">Ledger explorer</h2></div>
        <button type="button" className={styles.exportButton} onClick={exportCsv} disabled={!visible.length}><Icon name="download" size={15} />Xuất CSV ({visible.length})</button>
      </header>
      <div className={styles.filters}>
        <label><span>Tìm trong ledger</span><span className={styles.searchField}><Icon name="search" size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tên, nhãn hoặc mã nguồn" /></span></label>
        <label><span>Loại bút toán</span><select value={type} onChange={(event) => setType(event.target.value)}>{Object.entries(TYPE_META).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label><span>Chiều dòng Gold</span><select value={direction} onChange={(event) => setDirection(event.target.value)}><option value="all">Cả vào và ra</option><option value="in">Gold vào</option><option value="out">Gold ra</option></select></label>
      </div>
      <div className={styles.ledgerRows} aria-live="polite">
        {visible.map((entry) => (
          <article key={entry.id}>
            <span className={`${styles.entryMark} ${entry.amount >= 0 ? styles.entryIn : styles.entryOut}`}><Icon name={entry.amount >= 0 ? 'trendUp' : 'trendDown'} size={16} /></span>
            <span><strong>{entry.label}</strong><small>{entry.userName} · {entry.teamName}</small></span>
            <span><code>{entry.type}</code><small>{entry.sourceType || 'manual'} / {entry.sourceId || 'không có mã'}</small></span>
            <span><b className={entry.amount >= 0 ? styles.amountIn : styles.amountOut}>{gold(entry.amount, true)}</b><small>{dateTime(entry.createdAt)} UTC</small></span>
          </article>
        ))}
        {!visible.length && <div className={styles.emptyLedger}><Icon name="search" size={20} /><p>Không có bút toán khớp bộ lọc hiện tại.</p></div>}
      </div>
    </section>
  );
}

export default function GoldEconomyObservatory({ operationsSource, rewardDashboard, dataRevision = 0 }) {
  const localSnapshot = useMemo(() => createRealmEconomyDemoSnapshot(rewardDashboard), [rewardDashboard]);
  const [dashboard, setDashboard] = useState(localSnapshot);
  const [loading, setLoading] = useState(operationsSource === 'erp');
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (operationsSource !== 'erp') {
      setDashboard(localSnapshot);
      setLoading(false);
      setError('');
      return undefined;
    }
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 7000);
    setLoading(true);
    setError('');
    fetch('/api/realm-demo/economy', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Không thể tải Gold Economy Observatory.');
        if (active) setDashboard(payload);
      })
      .catch((requestError) => {
        if (!active) return;
        setError(requestError?.name === 'AbortError' ? 'ERP phản hồi quá lâu. Hãy thử tải lại.' : requestError.message);
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
  }, [dataRevision, localSnapshot, operationsSource, refreshKey]);

  if (loading) return <StateCard loading />;
  if (error) return <StateCard error={error} onRetry={() => setRefreshKey((value) => value + 1)} />;
  const metrics = dashboard.metrics;
  const forecastTone = metrics.forecastUsage > dashboard.policy.cap ? 'danger' : metrics.forecastUtilization >= 80 ? 'warning' : 'good';
  const progress = Math.max(0, Math.min(100, metrics.forecastUtilization));
  const scopeLabel = dashboard.permissions?.scope === 'team' ? `Team ${dashboard.permissions.teamId}` : 'Toàn công ty';

  return (
    <div className={styles.observatory}>
      <header className={styles.hero}>
        <div><span>Gold Economy Observatory · {dashboard.period}</span><h1>Đài quan sát ngân khố</h1><p>Đọc sổ Gold append-only, commitment và budget để nhìn dòng chảy kinh tế của Realm—không biến game mechanic thành máy chấm công.</p></div>
        <span className={styles.scopeBadge}><Icon name={dashboard.source === 'erp' ? 'check' : 'shield'} size={16} />{dashboard.source === 'erp' ? 'ERP live' : 'Sandbox cục bộ'} · {scopeLabel}</span>
      </header>

      <section className={styles.metricGrid} aria-label="Chỉ số kinh tế Gold">
        <MetricCard icon="trendUp" label="Gold phát hành" value={gold(metrics.issued)} detail={`${gold(metrics.committed)} commitment approved`} tone="good" />
        <MetricCard icon="trendDown" label="Gold đã tiêu" value={gold(metrics.spent)} detail={`${gold(metrics.reserved)} đang giữ · Net ${gold(metrics.netFlow, true)}`} />
        <MetricCard icon="clock" label="Burn-rate hiện tại" value={`${metrics.burnRate.toLocaleString('vi-VN')} G/ngày`} detail={`${metrics.elapsedDays}/${metrics.totalDays} ngày trong kỳ`} />
        <MetricCard icon="reports" label="Forecast cuối tháng" value={gold(metrics.forecastUsage)} detail={`${metrics.forecastUtilization}% của trần ${gold(dashboard.policy.cap)}`} tone={forecastTone} />
      </section>

      <section className={styles.forecastRail}>
        <div><span>Forecast phát hành + commitment</span><strong>{gold(metrics.forecastUsage)} / {gold(dashboard.policy.cap)}</strong></div>
        <div className={styles.progressTrack} role="progressbar" aria-label="Mức sử dụng Gold dự báo so với trần tháng" aria-valuemin="0" aria-valuemax={dashboard.policy.cap} aria-valuenow={Math.min(metrics.forecastUsage, dashboard.policy.cap)} aria-valuetext={`${metrics.forecastUtilization}% · ${metrics.forecastUsage} trên ${dashboard.policy.cap} Gold`}><i className={styles[`progress_${forecastTone}`]} style={{ width: `${progress}%` }} /></div>
        <p>{metrics.forecastRemaining >= 0 ? `Dự kiến còn ${gold(metrics.forecastRemaining)}.` : `Dự kiến vượt ${gold(Math.abs(metrics.forecastRemaining))}.`} Pending {gold(metrics.pending)} chưa chiếm budget.</p>
      </section>

      <div className={styles.analyticsGrid}>
        <GoldFlowChart rows={dashboard.daily} />
        <AdvisoryPanel alerts={dashboard.alerts} />
      </div>
      <ExposurePanel people={dashboard.people} teams={dashboard.teams} perUserCap={dashboard.policy.perUserCap} />
      <LedgerExplorer entries={dashboard.ledger} period={dashboard.period} />
      <footer className={styles.methodNote}><Icon name="shield" size={15} /><p>Dữ liệu Observatory là tín hiệu vận hành, không phải bảng lương, chấm công hay kết luận hiệu suất. Mọi quyết định nhân sự vẫn cần bối cảnh, người review và quy trình công ty.</p></footer>
    </div>
  );
}
