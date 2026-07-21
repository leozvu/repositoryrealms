'use client';

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/ui';
import styles from './realm-experience-scorecard.module.css';

const STATUS = {
  ready: { label: 'Sẵn sàng mở rộng có duyệt', tone: 'ready', icon: 'check' },
  attention: { label: 'Tiếp tục với giám sát', tone: 'attention', icon: 'alert' },
  blocked: { label: 'Giữ pilot giới hạn', tone: 'blocked', icon: 'shield' },
  'insufficient-data': { label: 'Chưa đủ evidence', tone: 'neutral', icon: 'clock' },
};

function count(value) {
  return Number(value || 0).toLocaleString('vi-VN');
}

export default function RealmExperienceScorecard() {
  const [state, setState] = useState({ loading: true, error: '', scorecard: null });

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const response = await fetch('/api/realm-demo/experience', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Không thể tải Experience Pilot scorecard.');
      setState({ loading: false, error: '', scorecard: payload });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message || 'Không thể tải Experience Pilot scorecard.' }));
    }
  }, []);

  useEffect(() => {
    load();
    const refresh = () => load({ quiet: true });
    window.addEventListener('crmegoric:pilot-operations-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('crmegoric:pilot-operations-changed', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [load]);

  const scorecard = state.scorecard;
  const status = STATUS[scorecard?.status] || STATUS['insufficient-data'];

  return (
    <section className={`card ${styles.card}`} aria-labelledby="realm-experience-scorecard-title">
      <div className={`card-head ${styles.header}`}>
        <span className={styles.icon}><Icon name="reports" size={18} /></span>
        <div>
          <span className="card-title" id="realm-experience-scorecard-title">Experience Pilot · Phase 23</span>
          <p>Evidence UX tổng hợp cho rollout. Đây là advisory scorecard; RepositoryRealms launch readiness vẫn là cổng phát hành duy nhất.</p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => load()} disabled={state.loading} aria-label="Tải lại Experience Pilot scorecard"><Icon name="repeat" size={14} /><span>Tải lại</span></button>
      </div>

      <div className={`card-body ${styles.body}`}>
        {state.loading ? (
          <div className={styles.loading} aria-live="polite" aria-busy="true">Đang tổng hợp evidence trải nghiệm…</div>
        ) : state.error ? (
          <div className={styles.error} role="alert"><span>{state.error}</span><button type="button" className="btn btn-outline btn-sm" onClick={() => load()}>Thử lại</button></div>
        ) : (
          <>
            <section className={styles.decision} data-tone={status.tone} aria-label={`Khuyến nghị pilot: ${status.label}`}>
              <span><Icon name={status.icon} size={20} /></span>
              <div><small>Khuyến nghị trải nghiệm</small><strong>{status.label}</strong><p>{scorecard.authoritativeLaunchGate === false ? 'Không tự động mở pilot, deploy hoặc thay đổi launch decision.' : 'Cần kiểm tra cấu hình scorecard.'}</p></div>
            </section>

            <div className={styles.metrics} aria-label="Tổng hợp evidence Phase 23">
              <span><small>Gate đạt</small><strong>{count(scorecard.summary.passed)}/{count(scorecard.summary.total)}</strong></span>
              <span><small>Journey quan sát</small><strong>{count(scorecard.summary.observedJourneys)}/4</strong></span>
              <span><small>Signal tổng hợp</small><strong>{count(scorecard.summary.totalEvents)}</strong></span>
              <span><small>Feedback blocker</small><strong>{count(scorecard.summary.blockedFeedback)}</strong></span>
            </div>

            <section className={styles.gates} aria-labelledby="realm-experience-gates-title">
              <div className={styles.sectionHead}><span id="realm-experience-gates-title">Pilot evidence gates</span><small>{count(scorecard.summary.blockers)} blocker · {count(scorecard.summary.advisories)} advisory</small></div>
              {scorecard.gates.map((gate) => (
                <article key={gate.id} data-passed={gate.passed || undefined} data-blocking={gate.blocking || undefined}>
                  <span><Icon name={gate.passed ? 'check' : gate.blocking ? 'shield' : 'alert'} size={15} /></span>
                  <div><strong>{gate.label}</strong><small>{gate.detail}</small></div>
                  <b>{gate.passed ? 'Đạt' : gate.blocking ? 'Blocker' : 'Theo dõi'}</b>
                </article>
              ))}
            </section>

            <section className={styles.journeys} aria-label="Evidence bốn journey trọng yếu">
              {Object.entries(scorecard.telemetry.journeys).map(([journey, total]) => <span key={journey} data-observed={total > 0 || undefined}><b>{journey}</b><small>{count(total)} lượt mở tổng hợp</small></span>)}
            </section>

            <p className={styles.privacy}><Icon name="shield" size={16} /><span>Privacy contract: chỉ đếm tổng hợp theo event/surface/journey; không lưu user ID, record ID, nội dung, thời lượng hay điểm hiệu suất. Feedback nghiệp vụ vẫn đi qua Guild Support Ticket ERP.</span></p>
          </>
        )}
      </div>
    </section>
  );
}
