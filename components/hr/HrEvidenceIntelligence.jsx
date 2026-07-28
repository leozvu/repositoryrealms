'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useState } from 'react';
import { Icon } from '@/components/ui';
import styles from './hr-evidence-intelligence.module.css';

const LAYERS = [
  { key: 'presence', label: 'Presence', title: 'Có mặt được ghi nhận', icon: 'calendar', note: 'Attendance là declared presence, không phải productivity.' },
  { key: 'activity', label: 'Activity', title: 'Hoạt động có provenance', icon: 'clock', note: 'Tách TimeLog tự khai báo khỏi business event có receipt.' },
  { key: 'output', label: 'Output', title: 'Kết quả công việc', icon: 'tasks', note: 'Task done và completion receipt được hiển thị riêng.' },
  { key: 'outcome', label: 'Outcome', title: 'Kết quả cần xác nhận', icon: 'trendUp', note: 'OKR là declared; final review chỉ thêm manager context.' },
];

const STATUS = {
  missing: { label: 'Chưa có evidence', tone: 'quiet' },
  recorded: { label: 'Đã ghi nhận', tone: 'recorded' },
  mixed: { label: 'Nhiều nguồn', tone: 'mixed' },
  validated: { label: 'Có xác nhận', tone: 'validated' },
};

function State({ loading, error, onRetry, variant }) {
  return (
    <section className={`${styles.state} ${variant === 'realm' ? styles.realm : ''}`} role={error ? 'alert' : 'status'} aria-live="polite">
      <Icon name={loading ? 'clock' : 'alert'} size={22} />
      <div><strong>{loading ? 'Đang dựng evidence dossier…' : 'Chưa tải được HR Evidence'}</strong><p>{loading ? 'Đang đối chiếu Presence, Activity, Output và Outcome từ ERP.' : error}</p></div>
      {!loading && <button type="button" onClick={onRetry}><Icon name="repeat" size={15} />Thử lại</button>}
    </section>
  );
}

function Metric({ icon, label, value, note }) {
  return (
    <article className={styles.metric}>
      <span><Icon name={icon} size={18} /></span>
      <div><small>{label}</small><strong>{value}</strong><p>{note}</p></div>
    </article>
  );
}

function layerFact(key, layer) {
  if (key === 'presence') return `${layer.facts.recordedDays} ngày ghi nhận · ${layer.facts.remoteDays} remote`;
  if (key === 'activity') return `${layer.facts.declaredHours}h khai báo · ${layer.facts.repositoryEvents} event receipt`;
  if (key === 'output') return `${layer.facts.completedTasks} task done · ${layer.facts.completionReceipts} receipt`;
  return `${layer.facts.personalOkrs} OKR · review: ${layer.facts.reviewStatus}`;
}

function EvidenceCell({ layerKey, layer }) {
  const status = STATUS[layer.status] || STATUS.missing;
  return (
    <div className={styles.evidenceCell}>
      <span className={`${styles.status} ${styles[`status_${status.tone}`]}`}>{status.label}</span>
      <small>{layerFact(layerKey, layer)}</small>
      <em>{layer.sourceClasses.length ? layer.sourceClasses.join(' + ') : 'no source'}</em>
    </div>
  );
}

export function HrEvidenceIntelligencePanel({ intelligence, error = '', onRetry, variant = 'erp' }) {
  const instanceId = useId();
  if (!intelligence) return error ? <State error={error} onRetry={onRetry} variant={variant} /> : null;
  const { summary, layerOverview, verificationQueue, dossiers, scope, provenance } = intelligence;
  const realm = variant === 'realm';
  const Title = realm ? 'h3' : 'h1';

  return (
    <section className={`${styles.workspace} ${realm ? styles.realm : ''}`} aria-labelledby={`${instanceId}-title`}>
      <header className={styles.hero}>
        <div><span>HR Evidence · advisory</span><Title id={`${instanceId}-title`}>Bằng chứng nào đã được xác nhận trước khi đánh giá?</Title><p>Bốn lớp evidence được đặt cạnh nhau để quản lý kiểm tra provenance và khoảng trống. Không lớp nào tự trở thành điểm hiệu suất.</p></div>
        <span className={styles.scopeBadge}><Icon name="shield" size={15} />{scope.kind === 'company' ? 'Company scope' : scope.kind === 'team' ? 'Team scope' : 'Hồ sơ của tôi'}</span>
      </header>

      {error && <div className={styles.inlineError} role="alert"><Icon name="alert" size={16} /><span>{error}</span><button type="button" onClick={onRetry}>Tải lại</button></div>}

      <div className={styles.metrics} aria-label="Tổng quan độ phủ evidence">
        <Metric icon="staff" label="Hồ sơ trong phạm vi" value={summary.people} note="Sắp theo tên, không ranking" />
        <Metric icon="reports" label="Đủ dữ liệu ở 4 lớp" value={`${summary.peopleWithAllLayersRecorded}/${summary.people}`} note="Chỉ là coverage, không phải score" />
        <Metric icon="shield" label="Review có manager context" value={summary.peopleWithManagerValidatedReview} note="Không tự chứng minh business impact" />
        <Metric icon="alert" label="Evidence cần kiểm tra" value={summary.verificationItems} note={`${summary.managerValidationItems} mục cần manager validation`} />
      </div>

      <section className={styles.pyramid} aria-labelledby={`${instanceId}-pyramid`}>
        <header><div><span>Evidence Pyramid</span><h2 id={`${instanceId}-pyramid`}>Bốn lớp độc lập, không cộng thành một điểm</h2></div><small>Rule {intelligence.ruleVersion}</small></header>
        <div className={styles.layerGrid}>
          {LAYERS.map((meta) => {
            const row = layerOverview[meta.key];
            return (
              <article key={meta.key}>
                <span className={styles.layerIcon}><Icon name={meta.icon} size={18} /></span>
                <div><small>{meta.label}</small><strong>{meta.title}</strong></div>
                <dl><div><dt>Người có evidence</dt><dd>{row.peopleWithEvidence}/{summary.people}</dd></div><div><dt>Đơn vị evidence</dt><dd>{row.evidenceUnits}</dd></div><div><dt>Có xác nhận</dt><dd>{row.validatedUnits}</dd></div></dl>
                <p>{meta.note}</p>
              </article>
            );
          })}
        </div>
      </section>

      <div className={styles.primaryGrid}>
        <section className={styles.panel} aria-labelledby={`${instanceId}-queue`}>
          <header className={styles.panelHead}><div><span>{scope.canValidate ? 'Manager Validation Queue' : 'Evidence gaps'}</span><h2 id={`${instanceId}-queue`}>{scope.canValidate ? 'Việc cần xác minh trước khi kết luận' : 'Dữ liệu cần được bổ sung hoặc xác minh'}</h2></div><strong>{verificationQueue.length}</strong></header>
          <div className={styles.queue}>
            {verificationQueue.length ? verificationQueue.slice(0, 14).map((item) => (
              <article key={item.id} className={styles[`severity_${item.severity}`]}>
                <span className={styles.queueIcon}><Icon name={item.severity === 'attention' ? 'alert' : 'clock'} size={17} /></span>
                <div><strong>{scope.kind === 'self' ? item.label : `${item.personName} · ${item.label}`}</strong><p>{item.explanation}</p><small>Nguồn: {item.source}</small></div>
                <Link href={item.href}>{realm ? 'Mở ERP' : 'Mở record'}<span aria-hidden="true"> →</span></Link>
              </article>
            )) : <div className={styles.empty}><Icon name="check" size={20} /><div><strong>Không có gap trong snapshot</strong><p>Điều này chỉ nói dữ liệu đủ để review, không tự kết luận hiệu suất.</p></div></div>}
          </div>
        </section>

        <aside className={styles.explanation} aria-label="Giới hạn sử dụng evidence">
          <Icon name="shield" size={22} />
          <div><span>Decision guardrail</span><h2>Evidence hỗ trợ đối thoại, không thay con người quyết định</h2><ul><li>Không dùng presence làm productivity.</li><li>Không xếp hạng hoặc tạo composite score.</li><li>Không tự động Gold, payroll, kỷ luật hay sa thải.</li><li>Mỗi gap phải có đường bổ sung hoặc xác minh.</li></ul></div>
        </aside>
      </div>

      <details className={styles.dossiers}>
        <summary><span><Icon name="staff" size={18} /><strong>Evidence dossier theo nhân sự</strong><small>{dossiers.length} hồ sơ · sắp theo tên, không theo kết quả</small></span><Icon name="menu" size={17} /></summary>
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>Nhân sự</th>{LAYERS.map((layer) => <th key={layer.key}>{layer.label}</th>)}</tr></thead>
            <tbody>{dossiers.map((dossier) => (
              <tr key={dossier.person.id}>
                <td><strong>{dossier.person.name}</strong><small>{dossier.person.title} · {dossier.evidenceGapCount} gap</small></td>
                {LAYERS.map((meta) => <td key={meta.key}><EvidenceCell layerKey={meta.key} layer={dossier.layers[meta.key]} /></td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </details>

      <footer className={styles.provenance}><Icon name="shield" size={17} /><p><strong>Provenance trước kết luận.</strong> {provenance.presence} {provenance.activity} {provenance.output} {provenance.outcome} WorkEvidenceEvent ledger chưa được dùng vì collection Phase 0 vẫn tắt.</p></footer>
    </section>
  );
}

export default function HrEvidenceIntelligence({ variant = 'erp' }) {
  const [intelligence, setIntelligence] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    setLoading(true);
    setError('');
    fetch('/api/hr/evidence-intelligence', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Không thể tải HR Evidence Intelligence.');
        if (!payload?.hrEvidenceIntelligence) throw new Error('ERP trả về evidence dossier không hợp lệ.');
        if (active) setIntelligence(payload.hrEvidenceIntelligence);
      })
      .catch((requestError) => {
        if (!active) return;
        setError(requestError?.name === 'AbortError' ? 'ERP phản hồi quá lâu. Phần đánh giá gốc vẫn hoạt động; hãy thử lại evidence.' : requestError.message);
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
  }, [revision]);

  if (loading && !intelligence) return <State loading variant={variant} />;
  return <HrEvidenceIntelligencePanel intelligence={intelligence} error={error} onRetry={retry} variant={variant} />;
}
