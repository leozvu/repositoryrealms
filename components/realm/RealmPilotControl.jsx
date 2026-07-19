'use client';

import { useCallback, useEffect, useState } from 'react';
import { AsyncButton, Icon, useToast } from '@/components/ui';
import { ROLES, ROLE_LABEL } from '@/lib/perm';
import styles from './realm-pilot-control.module.css';

const MODE_OPTIONS = [
  { value: 'off', label: 'Tạm đóng', description: 'Kill switch: toàn bộ nhân sự tiếp tục dùng ERP cổ điển.' },
  { value: 'pilot', label: 'Pilot theo vai trò', description: 'Chỉ các vai trò được chọn có thể mở Realm.' },
  { value: 'open', label: 'Mở cho nội bộ', description: 'Mọi nhân sự nội bộ có thể tự chọn Realm hoặc ERP.' },
];

const EMPTY_POLICY = { mode: 'off', defaultSurface: 'erp', roles: [] };

function Metric({ label, value, detail }) {
  return (
    <div className={styles.metric}>
      <strong>{value ?? 0}</strong>
      <span>{label}</span>
      {detail && <small>{detail}</small>}
    </div>
  );
}

export default function RealmPilotControl() {
  const toast = useToast();
  const [state, setState] = useState({ loading: true, error: '', policy: EMPTY_POLICY, metrics: null });
  const [draft, setDraft] = useState(EMPTY_POLICY);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const response = await fetch('/api/realm-demo/pilot', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Không thể tải Realm pilot.');
      setState({ loading: false, error: '', policy: payload.policy, metrics: payload.metrics });
      setDraft(payload.policy);
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message || 'Không thể tải Realm pilot.' }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleRole = (role) => {
    setDraft((current) => ({
      ...current,
      roles: current.roles.includes(role)
        ? current.roles.filter((item) => item !== role)
        : [...current.roles, role],
    }));
  };

  const save = async () => {
    if (draft.mode === 'pilot' && draft.roles.length === 0) {
      toast('Hãy chọn ít nhất một vai trò cho cohort pilot.', 'error');
      return false;
    }
    const response = await fetch('/api/realm-demo/pilot', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ policy: draft }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast(payload.error || 'Không thể lưu Realm pilot.', 'error');
      return false;
    }
    setState({ loading: false, error: '', policy: payload.policy, metrics: payload.metrics });
    setDraft(payload.policy);
    toast('Đã cập nhật Realm pilot. ERP cổ điển vẫn luôn khả dụng.');
    return true;
  };

  const changed = JSON.stringify(draft) !== JSON.stringify(state.policy);
  const metrics = state.metrics;

  return (
    <section className={`card ${styles.card}`} aria-labelledby="realm-pilot-title">
      <div className={`card-head ${styles.header}`}>
        <span className={styles.icon}><Icon name="shield" size={18} /></span>
        <div>
          <span className="card-title" id="realm-pilot-title">Realm Pilot Control</span>
          <p>Triển khai Realm có kiểm soát, không thay thế ERP đang vận hành.</p>
        </div>
        <span className={`${styles.status} ${styles[`status_${draft.mode}`]}`}>{MODE_OPTIONS.find((item) => item.value === draft.mode)?.label}</span>
      </div>

      <div className={`card-body ${styles.body}`}>
        {state.loading ? (
          <div className={styles.loading} aria-live="polite" aria-busy="true">Đang tải chính sách Realm…</div>
        ) : state.error ? (
          <div className={styles.error} role="alert">
            <span>{state.error}</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={load}>Thử lại</button>
          </div>
        ) : (
          <>
            <fieldset className={styles.fieldset}>
              <legend>Phạm vi phát hành</legend>
              <div className={styles.optionGrid}>
                {MODE_OPTIONS.map((option) => (
                  <label key={option.value} className={`${styles.option} ${draft.mode === option.value ? styles.selected : ''}`}>
                    <input
                      type="radio"
                      name="realm-pilot-mode"
                      value={option.value}
                      checked={draft.mode === option.value}
                      onChange={() => setDraft((current) => ({ ...current, mode: option.value }))}
                    />
                    <span><strong>{option.label}</strong><small>{option.description}</small></span>
                  </label>
                ))}
              </div>
            </fieldset>

            {draft.mode === 'pilot' && (
              <fieldset className={styles.fieldset}>
                <legend>Cohort được tham gia</legend>
                <div className={styles.roles}>
                  {ROLES.map((role) => (
                    <label key={role} className={draft.roles.includes(role) ? styles.roleSelected : ''}>
                      <input type="checkbox" checked={draft.roles.includes(role)} onChange={() => toggleRole(role)} />
                      <span>{ROLE_LABEL[role]}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <fieldset className={styles.fieldset}>
              <legend>Giao diện mặc định cho người chưa chọn</legend>
              <div className={styles.surfaceChoice}>
                <label className={draft.defaultSurface === 'erp' ? styles.selected : ''}>
                  <input type="radio" name="realm-default-surface" checked={draft.defaultSurface === 'erp'} onChange={() => setDraft((current) => ({ ...current, defaultSurface: 'erp' }))} />
                  <span><strong>ERP · CRM</strong><small>An toàn nhất cho rollout ban đầu.</small></span>
                </label>
                <label className={draft.defaultSurface === 'realm' ? styles.selected : ''}>
                  <input type="radio" name="realm-default-surface" checked={draft.defaultSurface === 'realm'} onChange={() => setDraft((current) => ({ ...current, defaultSurface: 'realm' }))} />
                  <span><strong>Realm</strong><small>Đưa người đủ điều kiện vào văn phòng medieval.</small></span>
                </label>
              </div>
              <p className={styles.assurance}><Icon name="check" size={15} /> Mỗi nhân sự luôn có thể đổi lại ERP; dữ liệu nghiệp vụ vẫn dùng chung một nguồn.</p>
            </fieldset>

            <div className={styles.metricsHeader}>
              <div><strong>Adoption snapshot</strong><span>Hiện diện hoạt động trong 90 giây gần nhất.</span></div>
              <span>Tổng hợp · riêng tư</span>
            </div>
            <div className={styles.metrics}>
              <Metric label="Đủ điều kiện" value={metrics?.eligibleUsers} />
              <Metric label="Chọn Realm" value={metrics?.preferences?.realm} />
              <Metric label="Chọn ERP" value={metrics?.preferences?.erp} />
              <Metric label="Theo mặc định" value={metrics?.preferences?.auto} />
              <Metric label="Đang online" value={metrics?.online?.total} detail={`${metrics?.online?.realm || 0} Realm · ${metrics?.online?.erp || 0} ERP`} />
            </div>
            <p className={styles.privacy}><Icon name="shield" size={15} /> Không ghi thời lượng làm việc, không dùng adoption để đánh giá hiệu suất cá nhân.</p>

            <div className={styles.actions}>
              <span aria-live="polite">{changed ? 'Có thay đổi chưa lưu' : 'Chính sách đã đồng bộ'}</span>
              <AsyncButton className="btn btn-primary" disabled={!changed} pendingLabel="Đang lưu…" onClick={save}>Lưu chính sách pilot</AsyncButton>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
