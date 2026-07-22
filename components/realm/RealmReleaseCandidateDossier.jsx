'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon, useToast } from '@/components/ui';
import styles from './realm-release-candidate-dossier.module.css';

const SIGNAL_LABELS = {
  ready: 'Ready',
  attention: 'Attention',
  blocked: 'Blocked',
  sealed: 'Sealed',
  'not-sealed': 'Not sealed',
  go: 'GO report',
  no_go: 'NO-GO report',
  hold: 'HOLD report',
  critical: 'Critical',
  degraded: 'Degraded',
  complete: 'Complete',
  incomplete: 'Incomplete',
  'insufficient-data': 'Insufficient data',
  missing: 'Missing',
};

const SIGNAL_TONES = {
  ready: 'positive', sealed: 'positive', go: 'positive', complete: 'positive',
  attention: 'warning', 'not-sealed': 'warning', hold: 'warning', degraded: 'warning', 'insufficient-data': 'warning',
  blocked: 'critical', no_go: 'critical', critical: 'critical', incomplete: 'critical', missing: 'critical',
};

function signalLabel(value) {
  return SIGNAL_LABELS[value] || String(value || 'Missing');
}

function signalTone(value) {
  return SIGNAL_TONES[value] || 'neutral';
}

function generatedLabel(value) {
  if (!value) return 'Chưa có';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Không xác định' : date.toLocaleString('vi-VN');
}

export default function RealmReleaseCandidateDossier() {
  const [state, setState] = useState({ loading: true, error: '', dossier: null });
  const [copying, setCopying] = useState(false);
  const toast = useToast();

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const response = await fetch('/api/realm-demo/release-candidate', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Không thể tải Release Candidate dossier.');
      setState({ loading: false, error: '', dossier: payload });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message || 'Không thể tải Release Candidate dossier.' }));
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

  const dossier = state.dossier;
  const presentSections = useMemo(() => dossier?.sections?.filter((section) => section.present).length || 0, [dossier]);

  const copyDigest = async () => {
    if (!dossier?.integrity?.digest || copying) return;
    setCopying(true);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Trình duyệt không hỗ trợ clipboard an toàn.');
      await navigator.clipboard.writeText(dossier.integrity.digest);
      toast('Đã copy SHA-256 digest');
    } catch (error) {
      toast(error.message || 'Không thể copy digest', 'error');
    } finally {
      setCopying(false);
    }
  };

  const downloadDossier = () => {
    if (!dossier) return;
    const blob = new Blob([`${JSON.stringify(dossier, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${dossier.candidateId || 'repository-realms-release-candidate'}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast('Đã tải Release Candidate dossier');
  };

  return (
    <section className={`card ${styles.card}`} aria-labelledby="realm-release-candidate-title">
      <div className={`card-head ${styles.header}`}>
        <span className={styles.icon}><Icon name="shield" size={18} /></span>
        <div>
          <span className="card-title" id="realm-release-candidate-title">Release Candidate Dossier · Phase 24</span>
          <p>Evidence pack read-only có digest. Dossier không phải approval, không tự rollout và không thay thế Controlled Launch.</p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => load()} disabled={state.loading} aria-label="Tải lại Release Candidate dossier">
          <Icon name="repeat" size={14} /><span>{state.loading ? 'Đang tải…' : 'Tải lại'}</span>
        </button>
      </div>

      <div className={`card-body ${styles.body}`}>
        {state.loading ? (
          <div className={styles.loading} aria-live="polite" aria-busy="true">Đang đóng gói release evidence…</div>
        ) : state.error ? (
          <div className={styles.error} role="alert"><span>{state.error}</span><button type="button" className="btn btn-outline btn-sm" onClick={() => load()}>Thử lại</button></div>
        ) : dossier ? (
          <>
            <section className={styles.summary} data-tone={dossier.dossierComplete ? 'positive' : 'critical'} aria-label="Tình trạng đầy đủ của Release Candidate dossier">
              <span><Icon name={dossier.dossierComplete ? 'check' : 'alert'} size={20} /></span>
              <div>
                <small>Evidence completeness · không phải launch decision</small>
                <strong>{dossier.dossierComplete ? `Đủ ${presentSections}/${dossier.sections.length} nguồn evidence` : `Thiếu ${dossier.missingSections.length} nguồn evidence`}</strong>
                <p>Các tín hiệu bên dưới được giữ nguyên từ workflow gốc; không được gộp thành một cổng GO/NO-GO mới.</p>
              </div>
              <b>{dossier.candidateId}</b>
            </section>

            <section className={styles.signals} aria-label="Năm nguồn evidence Release Candidate">
              {dossier.sections.map((section) => (
                <article key={section.id} data-tone={signalTone(section.state)}>
                  <span><Icon name={signalTone(section.state) === 'positive' ? 'check' : signalTone(section.state) === 'critical' ? 'shield' : 'alert'} size={15} /></span>
                  <div><strong>{section.label}</strong><small>{section.source}</small></div>
                  <b>{signalLabel(section.state)}</b>
                </article>
              ))}
            </section>

            <section className={styles.integrity} aria-labelledby="realm-release-integrity-title">
              <div>
                <small id="realm-release-integrity-title">SHA-256 evidence digest</small>
                <code title={dossier.integrity.digest}>{dossier.integrity.digest}</code>
                <p>Digest không đổi chỉ vì reload hoặc đổi thời điểm export; nó đổi khi evidence canonical thay đổi.</p>
              </div>
              <div className={styles.actions}>
                <button type="button" className="btn btn-outline btn-sm" onClick={copyDigest} disabled={copying}>
                  <Icon name="link" size={14} /><span>{copying ? 'Đang copy…' : 'Copy digest'}</span>
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={downloadDossier}>
                  <Icon name="download" size={14} /><span>Tải JSON evidence</span>
                </button>
              </div>
            </section>

            <section className={styles.authority} aria-label="Ranh giới thẩm quyền phát hành">
              <Icon name="shield" size={17} />
              <div>
                <strong>Launch authority vẫn ở Controlled Launch</strong>
                <p>Mọi business action tiếp tục dùng authorization, business rules, receipts và audit của RepositoryRealms. Dossier này chỉ chụp evidence để review.</p>
              </div>
              <small>Tạo lúc {generatedLabel(dossier.generatedAt)}</small>
            </section>

            <p className={styles.privacy}><Icon name="shield" size={16} /><span>Privacy contract: aggregate-only; không roster, user ID, business record ID, nội dung, thời lượng hay điểm hiệu suất.</span></p>
          </>
        ) : null}
      </div>
    </section>
  );
}
