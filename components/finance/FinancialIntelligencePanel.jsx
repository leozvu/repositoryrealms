'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui';
import { money } from '@/lib/format';
import styles from './financial-intelligence.module.css';

const QUEUE_LINK = {
  review_receivable: '/invoices',
  review_payable: '/vendors',
  review_unbilled_hours: '/invoices',
  review_project_economics: '/projects',
  review_budget: '/finplan',
  review_cash_schedule: '/finance',
  repair_invoice_record: '/invoices',
  review_cost_rate: '/staff',
  review_project_linkage: '/projects',
};

function State({ loading, error, onRetry }) {
  return (
    <section className={styles.state} role={error ? 'alert' : 'status'} aria-live="polite">
      <Icon name={loading ? 'clock' : 'alert'} size={22} />
      <div><strong>{loading ? 'Đang đối chiếu sổ tài chính…' : 'Không thể tải Financial Intelligence'}</strong><p>{loading ? 'Đang nối giờ công, cost, invoice và dòng tiền từ ERP.' : error}</p></div>
      {!loading && <button type="button" onClick={onRetry}><Icon name="repeat" size={15} />Thử lại</button>}
    </section>
  );
}

function Metric({ label, value, note, icon, tone = 'neutral' }) {
  return (
    <article className={`${styles.metric} ${styles[`tone_${tone}`]}`}>
      <span className={styles.metricIcon}><Icon name={icon} size={18} /></span>
      <div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
    </article>
  );
}

function queueHref(item) {
  if (item.projectId && ['review_unbilled_hours', 'review_project_economics'].includes(item.action)) return `/projects/${item.projectId}`;
  return QUEUE_LINK[item.action] || '/finance';
}

export default function FinancialIntelligencePanel({ intelligence, loading = false, error = '', onRetry }) {
  if (loading) return <State loading />;
  if (error && !intelligence) return <State error={error} onRetry={onRetry} />;
  if (!intelligence) return null;
  const { summary, managerQueue, cashForecast, currentMonthBudget, projects, provenance } = intelligence;

  return (
    <section className={styles.intelligence} aria-labelledby="financial-intelligence-title">
      <header className={styles.hero}>
        <div><span>Financial Intelligence · advisory</span><h1 id="financial-intelligence-title">Mỗi giờ làm tạo ra bao nhiêu giá trị và lợi nhuận?</h1><p>Task → TimeLog → cost proxy → Invoice → cash. Dashboard dùng cùng record ERP và không tự nhận margin proxy là lợi nhuận kế toán.</p></div>
        <span className={styles.source}><Icon name="shield" size={15} />Canonical ERP finance</span>
      </header>

      {error && <div className={styles.inlineError} role="alert"><Icon name="alert" size={16} /><span>{error}</span><button type="button" onClick={onRetry}>Tải lại</button></div>}

      <div className={styles.metrics} aria-label="Tổng quan tài chính vận hành">
        <Metric label="Tiền đã ghi sổ" value={money(summary.cashBalance)} note={`${money(summary.ledgerIncome)} thu · ${money(summary.ledgerExpense)} chi`} icon="wallet" tone={summary.cashBalance < 0 ? 'critical' : 'positive'} />
        <Metric label="Phải thu" value={money(summary.receivable)} note={`${money(summary.overdueReceivable)} đã quá hạn`} icon="invoices" tone={summary.overdueReceivable > 0 ? 'attention' : 'neutral'} />
        <Metric label="Phải trả" value={money(summary.payable)} note={`${money(summary.overduePayable)} đã quá hạn`} icon="clock" tone={summary.overduePayable > 0 ? 'critical' : 'neutral'} />
        <Metric label="Operating margin proxy" value={money(summary.operatingMarginProxy)} note={`${money(summary.billedValuePerDeclaredHour || 0)} billed / giờ khai báo`} icon="trendUp" tone={summary.operatingMarginProxy < 0 ? 'critical' : 'positive'} />
      </div>

      <div className={styles.primaryGrid}>
        <section className={styles.panel} aria-labelledby="finance-queue-title">
          <header className={styles.panelHead}><div><span>Manager Queue</span><h2 id="finance-queue-title">Việc tài chính cần quyết định</h2></div><strong>{managerQueue.length}</strong></header>
          <div className={styles.queue}>
            {managerQueue.length ? managerQueue.slice(0, 10).map((item) => (
              <article key={item.id} className={styles[`severity_${item.severity}`]}>
                <span className={styles.queueIcon}><Icon name={item.severity === 'critical' ? 'alert' : 'clock'} size={17} /></span>
                <div><strong>{item.label}</strong><p>{item.explanation}</p><small>Nguồn: {item.source}</small></div>
                <Link href={queueHref(item)}>Mở record<span aria-hidden="true"> →</span></Link>
              </article>
            )) : <div className={styles.empty}><Icon name="check" size={20} /><div><strong>Queue đang sạch</strong><p>Chưa có công nợ quá hạn, budget alert hoặc dữ liệu cần sửa trong snapshot.</p></div></div>}
          </div>
        </section>

        <section className={styles.panel} aria-labelledby="cash-forecast-title">
          <header className={styles.panelHead}><div><span>Three-month schedule</span><h2 id="cash-forecast-title">Lịch tiền 3 tháng</h2></div><Icon name="calendar" size={19} /></header>
          <div className={styles.forecastList}>
            {cashForecast.map((row) => (
              <article key={row.month} className={styles[`forecast_${row.band}`]}>
                <header><strong>{row.month}</strong><span>{row.band === 'negative' ? 'Dự kiến âm' : row.band === 'thin' ? 'Biên mỏng' : 'Dương'}</span></header>
                <dl>
                  <div><dt>Đầu kỳ</dt><dd>{money(row.openingBalance)}</dd></div>
                  <div><dt>Thu theo hạn</dt><dd>+{money(row.scheduledReceipts)}</dd></div>
                  <div><dt>NCC + định kỳ</dt><dd>−{money(row.scheduledVendorPayments + row.futureRecurringTemplates)}</dd></div>
                  <div><dt>Cuối kỳ</dt><dd>{money(row.closingBalance)}</dd></div>
                </dl>
              </article>
            ))}
          </div>
          <p className={styles.forecastNote}><Icon name="alert" size={15} />Schedule view có confidence thấp: chưa gồm payroll và chi phí chưa có chứng từ; ngày đến hạn không bảo đảm tiền sẽ thực thu/thực chi.</p>
        </section>
      </div>

      {currentMonthBudget.rows.length > 0 && <section className={styles.panel} aria-labelledby="budget-watch-title">
        <header className={styles.panelHead}><div><span>Budget watch · {currentMonthBudget.month}</span><h2 id="budget-watch-title">Ngân sách theo khoản chi đã ghi sổ</h2></div><Link href="/finplan">Mở kế hoạch</Link></header>
        <div className={styles.budgetGrid}>{currentMonthBudget.rows.map((row) => (
          <article key={row.category} className={styles[`budget_${row.band}`]}><header><strong>{row.category}</strong><span>{row.usagePercent ?? 0}%</span></header><div className={styles.budgetTrack}><span style={{ width: `${Math.min(100, Math.max(0, row.usagePercent || 0))}%` }} /></div><p>{money(row.actual)} / {money(row.planned)} · {row.band === 'over' ? 'Đã vượt' : row.band === 'near' ? 'Gần ngưỡng' : 'Trong kế hoạch'}</p></article>
        ))}</div>
      </section>}

      <details className={styles.drilldown}>
        <summary><span><Icon name="projects" size={18} /><strong>Project economics drill-down</strong><small>{projects.length} dự án · sắp theo tên, không phải ranking</small></span><Icon name="menu" size={17} /></summary>
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>Dự án</th><th className="num">Giờ khai báo</th><th className="num">Invoice</th><th className="num">Cost proxy</th><th className="num">Margin proxy</th><th className="num">Phải thu</th></tr></thead>
            <tbody>{projects.map((project) => <tr key={project.projectId}><td><Link href={`/projects/${project.projectId}`}>{project.name}</Link><small>{project.marginBand === 'negative' ? 'Margin proxy âm' : project.marginBand === 'thin' ? 'Margin proxy mỏng' : project.marginBand === 'unknown' ? 'Chưa đủ invoice' : 'Margin proxy dương'}</small></td><td className="num">{project.declaredHours}h</td><td className="num">{money(project.invoiced)}</td><td className="num">{money(project.operatingCostProxy)}</td><td className="num">{money(project.operatingMarginProxy)}</td><td className="num">{money(project.receivable)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>

      <footer className={styles.provenance}><Icon name="shield" size={17} /><p><strong>Provenance trước kết luận.</strong> Cash = Transaction đã ghi sổ. Invoice không đồng nghĩa revenue recognition. Labor cost = TimeLog tự khai báo × rate hiện tại, không phải payroll lịch sử. Confidence ceiling: {provenance.confidence.ceiling}. Không xếp hạng nhân sự, không tự tạo invoice và không tự thanh toán.</p></footer>
    </section>
  );
}
