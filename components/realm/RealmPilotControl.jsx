'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AsyncButton, Icon, useToast } from '@/components/ui';
import { ROLES, ROLE_LABEL } from '@/lib/perm';
import { REALM_PILOT_MEMBER_LIMIT } from '@/lib/realm-pilot';
import { REALM_ONBOARDING_RESET_EVENT } from './RealmPilotOnboarding';
import styles from './realm-pilot-control.module.css';

const PILOT_OPERATIONS_EVENT = 'crmegoric:pilot-operations-changed';

const MODE_OPTIONS = [
  { value: 'off', label: 'Tạm đóng', description: 'Kill switch: toàn bộ nhân sự tiếp tục dùng ERP cổ điển.' },
  { value: 'pilot', label: 'Pilot theo cohort', description: 'Chỉ danh sách nhân sự hoặc vai trò được chọn có thể mở Realm.' },
  { value: 'open', label: 'Mở cho nội bộ', description: 'Mọi nhân sự nội bộ có thể tự chọn Realm hoặc ERP.' },
];

const COHORT_OPTIONS = [
  { value: 'members', label: 'Nhân sự cụ thể', description: 'Khuyến nghị: mở cho một nhóm nhỏ được chọn đích danh.' },
  { value: 'roles', label: 'Theo vai trò', description: 'Mở cho toàn bộ nhân sự có một trong các vai trò đã chọn.' },
];

const FEATURE_OPTIONS = [
  { value: 'office', label: 'Văn phòng Realm', description: 'Bật route, navigation và trải nghiệm virtual office cho cohort.' },
  { value: 'tavern', label: 'Tavern', description: 'Bật Gold ledger, trang đổi thưởng và fulfillment có maker–checker.' },
  { value: 'feedback', label: 'Guild Support', description: 'Cho cohort gửi phản hồi thành Ticket ERP và nhận cập nhật.' },
];

const EMPTY_POLICY = {
  mode: 'off', defaultSurface: 'erp', cohortStrategy: 'roles', roles: [], memberIds: [],
  features: { office: true, tavern: true, feedback: true },
  onboardingVersion: 1, version: 0,
};

const RISK_LABELS = {
  emergency: 'Khẩn cấp',
  restriction: 'Thu hẹp an toàn',
  operational: 'Vận hành',
  expansion: 'Mở rộng cohort',
};

function Metric({ label, value, detail }) {
  return (
    <div className={styles.metric}>
      <strong>{value ?? 0}</strong>
      <span>{label}</span>
      {detail && <small>{detail}</small>}
    </div>
  );
}

function LaunchApprovalCard({ approval, mine = false, busy = false, onDecide }) {
  const statusLabel = approval.status === 'approved' ? 'Đã duyệt' : approval.status === 'rejected' ? 'Đã đóng' : mine ? 'Chờ Director khác' : 'Chờ bạn duyệt';
  const expiresAt = approval.expiresAt ? new Date(approval.expiresAt) : null;
  return (
    <article className={styles.approvalCard} data-status={approval.status}>
      <div className={styles.approvalCardHeader}>
        <div>
          <strong>{approval.title}</strong>
          <span>{mine ? 'Bạn tạo yêu cầu' : `${approval.requesterName} tạo yêu cầu`} · {new Date(approval.createdAt).toLocaleString('vi-VN')}</span>
        </div>
        <span className={styles.approvalStatus}>{statusLabel}</span>
      </div>
      <div className={styles.approvalImpact} aria-label="Tác động yêu cầu phát hành tổng hợp">
        <span><strong>{approval.impact?.eligibleUsers ?? 0}</strong> được mở Realm</span>
        <span><strong>{approval.impact?.fallbackUsers ?? 0}</strong> fallback ERP</span>
        <span><strong>v{approval.policyVersion ?? '—'}</strong> policy nguồn</span>
      </div>
      <div className={styles.approvalCardFooter}>
        <span>{expiresAt ? `Hết hạn ${expiresAt.toLocaleString('vi-VN')}` : 'Payload không thể xác minh — không được duyệt'}</span>
        {!mine && approval.status === 'pending' && (
          <div>
            <AsyncButton className="btn btn-primary btn-sm" disabled={!approval.payloadReadable || busy} pendingLabel="Đang duyệt…" onClick={() => onDecide(approval, 'approve')}>Duyệt &amp; áp dụng</AsyncButton>
            <AsyncButton className="btn btn-outline btn-sm" disabled={busy} pendingLabel="Đang đóng…" onClick={() => onDecide(approval, 'reject')}>Từ chối</AsyncButton>
          </div>
        )}
      </div>
    </article>
  );
}

export default function RealmPilotControl() {
  const toast = useToast();
  const [state, setState] = useState({
    loading: true,
    error: '',
    policy: EMPTY_POLICY,
    metrics: null,
    readiness: null,
    directory: [],
    approvals: { toReview: [], mine: [] },
  });
  const [draft, setDraft] = useState(EMPTY_POLICY);
  const [memberQuery, setMemberQuery] = useState('');
  const [launch, setLaunch] = useState({ error: '', token: '', preview: null, draftKey: '' });
  const [approvalBusyId, setApprovalBusyId] = useState('');

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const [pilotResponse, readinessResponse, approvalsResponse] = await Promise.all([
        fetch('/api/realm-demo/pilot', { cache: 'no-store' }),
        fetch('/api/realm-demo/readiness', { cache: 'no-store' }),
        fetch('/api/realm-demo/launch/approvals', { cache: 'no-store' }),
      ]);
      const [pilotPayload, readinessPayload, approvalsPayload] = await Promise.all([
        pilotResponse.json().catch(() => ({})),
        readinessResponse.json().catch(() => ({})),
        approvalsResponse.json().catch(() => ({})),
      ]);
      if (!pilotResponse.ok) throw new Error(pilotPayload.error || 'Không thể tải Realm pilot.');
      if (!readinessResponse.ok) throw new Error(readinessPayload.error || 'Không thể chạy preflight Realm.');
      if (!approvalsResponse.ok) throw new Error(approvalsPayload.error || 'Không thể tải bàn duyệt phát hành.');
      setState({
        loading: false,
        error: '',
        policy: pilotPayload.policy,
        metrics: pilotPayload.metrics,
        readiness: readinessPayload,
        directory: pilotPayload.directory || [],
        approvals: { toReview: approvalsPayload.toReview || [], mine: approvalsPayload.mine || [] },
      });
      setDraft(pilotPayload.policy);
      setLaunch({ error: '', token: '', preview: null, draftKey: '' });
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

  const toggleMember = (id) => {
    setDraft((current) => {
      const selected = current.memberIds.includes(id);
      if (!selected && current.memberIds.length >= REALM_PILOT_MEMBER_LIMIT) return current;
      return {
        ...current,
        memberIds: selected
          ? current.memberIds.filter((item) => item !== id)
          : [...current.memberIds, id],
      };
    });
  };

  const toggleFeature = (feature) => {
    setDraft((current) => {
      const enabled = !current.features?.[feature];
      return {
        ...current,
        ...(feature === 'office' && !enabled ? { defaultSurface: 'erp' } : {}),
        features: { ...current.features, [feature]: enabled },
      };
    });
  };

  const validateDraft = () => {
    if (draft.mode === 'pilot' && draft.cohortStrategy === 'roles' && draft.roles.length === 0) {
      toast('Hãy chọn ít nhất một vai trò cho cohort pilot.', 'error');
      return false;
    }
    if (draft.mode === 'pilot' && draft.cohortStrategy === 'members' && draft.memberIds.length === 0) {
      toast('Hãy chọn ít nhất một nhân sự cho cohort pilot.', 'error');
      return false;
    }
    return true;
  };

  const draftKey = JSON.stringify(draft);
  const previewValid = Boolean(launch.token && launch.draftKey === draftKey);
  const previewAllowsApply = previewValid && (launch.preview?.risk !== 'expansion' || launch.preview?.readiness?.ready);
  const expansionPreview = previewValid && launch.preview?.risk === 'expansion';

  const runLaunchPreview = async () => {
    if (!validateDraft()) return false;
    setLaunch({ error: '', token: '', preview: null, draftKey: '' });
    const response = await fetch('/api/realm-demo/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ policy: draft }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 409 && payload.code === 'realm_pilot_version_conflict') await load();
      setLaunch({ error: payload.error || 'Không thể chạy dry-run phát hành.', token: '', preview: null, draftKey });
      return false;
    }
    setLaunch({ error: '', token: payload.token, preview: payload.preview, draftKey });
    toast('Dry-run hoàn tất. Preview chỉ hợp lệ cho đúng bản nháp và policy version này.');
    return true;
  };

  const save = async () => {
    if (!validateDraft()) return false;
    if (draft.mode !== 'off' && !previewValid) {
      toast('Hãy chạy dry-run cho đúng bản nháp trước khi lưu.', 'error');
      return false;
    }
    if (draft.mode !== 'off' && !previewAllowsApply) {
      toast('Không thể mở rộng rollout khi preflight còn blocker.', 'error');
      return false;
    }
    if (expansionPreview) {
      toast('Mở rộng Realm phải được gửi tới một Director khác phê duyệt.', 'error');
      return false;
    }
    const response = await fetch('/api/realm-demo/pilot', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ policy: draft, launchPreviewToken: launch.token }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (payload.code === 'realm_pilot_version_conflict' || payload.code === 'realm_launch_preview_version_mismatch') await load();
      else if (String(payload.code || '').startsWith('realm_launch_')) {
        setLaunch({ error: payload.error || 'Preview không còn hợp lệ. Hãy chạy lại dry-run.', token: '', preview: null, draftKey });
      }
      toast(payload.error || 'Không thể lưu Realm pilot.', 'error');
      return false;
    }
    const readinessResponse = await fetch('/api/realm-demo/readiness', { cache: 'no-store' });
    const readiness = readinessResponse.ok ? await readinessResponse.json() : null;
    setState((current) => ({ ...current, loading: false, error: '', policy: payload.policy, metrics: payload.metrics, readiness, directory: payload.directory || current.directory }));
    setDraft(payload.policy);
    setLaunch({ error: '', token: '', preview: null, draftKey: '' });
    window.dispatchEvent(new CustomEvent(PILOT_OPERATIONS_EVENT));
    toast('Đã cập nhật Realm pilot. ERP cổ điển vẫn luôn khả dụng.');
    return true;
  };

  const requestExpansionApproval = async () => {
    if (!validateDraft()) return false;
    if (!expansionPreview || !previewAllowsApply) {
      toast('Hãy chạy dry-run hợp lệ cho bản mở rộng trước khi gửi duyệt.', 'error');
      return false;
    }
    const response = await fetch('/api/realm-demo/launch/approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ policy: draft, launchPreviewToken: launch.token }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (String(payload.code || '').includes('version') || payload.code === 'realm_launch_approval_duplicate') await load();
      toast(payload.error || 'Không thể gửi yêu cầu mở rộng Realm.', 'error');
      return false;
    }
    toast('Đã gửi Director thứ hai duyệt. Policy hiện tại chưa thay đổi.');
    await load();
    window.dispatchEvent(new CustomEvent(PILOT_OPERATIONS_EVENT));
    return true;
  };

  const decideLaunchApproval = async (approval, decision) => {
    if (approvalBusyId) return false;
    if (decision === 'reject' && !window.confirm(`Từ chối yêu cầu "${approval.title}"? Policy hiện tại sẽ được giữ nguyên.`)) return false;
    setApprovalBusyId(approval.id);
    try {
      const response = await fetch(`/api/approvals/${approval.id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast(payload.error || 'Không thể xử lý yêu cầu phát hành.', 'error');
        await load();
        return false;
      }
      toast(decision === 'approve'
        ? 'Đã duyệt và áp dụng policy Realm. ERP vẫn là source of truth.'
        : 'Đã từ chối yêu cầu. Policy hiện tại được giữ nguyên.');
      await load();
      window.dispatchEvent(new CustomEvent(PILOT_OPERATIONS_EVENT));
      return true;
    } catch {
      toast('Không thể kết nối máy chủ phê duyệt. Policy chưa bị thay đổi.', 'error');
      return false;
    } finally {
      setApprovalBusyId('');
    }
  };

  const changed = JSON.stringify(draft) !== JSON.stringify(state.policy);
  const metrics = state.metrics;
  const filteredDirectory = useMemo(() => {
    const query = memberQuery.trim().toLocaleLowerCase('vi');
    if (!query) return state.directory;
    return state.directory.filter((member) => {
      const roles = member.roles.map((role) => ROLE_LABEL[role] || role).join(' ');
      return `${member.name} ${member.title} ${roles}`.toLocaleLowerCase('vi').includes(query);
    });
  }, [memberQuery, state.directory]);

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
                <div className={styles.cohortStrategy}>
                  {COHORT_OPTIONS.map((option) => (
                    <label key={option.value} className={draft.cohortStrategy === option.value ? styles.selected : ''}>
                      <input
                        type="radio"
                        name="realm-cohort-strategy"
                        checked={draft.cohortStrategy === option.value}
                        onChange={() => setDraft((current) => ({ ...current, cohortStrategy: option.value }))}
                      />
                      <span><strong>{option.label}</strong><small>{option.description}</small></span>
                    </label>
                  ))}
                </div>

                {draft.cohortStrategy === 'roles' ? (
                  <div className={styles.roles}>
                    {ROLES.map((role) => (
                      <label key={role} className={draft.roles.includes(role) ? styles.roleSelected : ''}>
                        <input type="checkbox" checked={draft.roles.includes(role)} onChange={() => toggleRole(role)} />
                        <span>{ROLE_LABEL[role]}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className={styles.memberPicker}>
                    <div className={styles.memberToolbar}>
                      <label>
                        <span className="sr-only">Tìm nhân sự pilot</span>
                        <Icon name="search" size={15} />
                        <input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="Tìm theo tên, chức danh hoặc vai trò…" />
                      </label>
                      <span aria-live="polite">Đã chọn {draft.memberIds.length}/{REALM_PILOT_MEMBER_LIMIT}</span>
                      {draft.memberIds.length > 0 && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft((current) => ({ ...current, memberIds: [] }))}>Bỏ chọn</button>
                      )}
                    </div>
                    <div className={styles.memberList} role="group" aria-label="Danh sách nhân sự có thể tham gia pilot">
                      {filteredDirectory.length ? filteredDirectory.map((member) => {
                        const selected = draft.memberIds.includes(member.id);
                        const disabled = !selected && draft.memberIds.length >= REALM_PILOT_MEMBER_LIMIT;
                        return (
                          <label key={member.id} className={selected ? styles.memberSelected : ''} aria-disabled={disabled || undefined}>
                            <input type="checkbox" checked={selected} disabled={disabled} onChange={() => toggleMember(member.id)} />
                            <span>
                              <strong>{member.name}</strong>
                              <small>{[member.title, member.roles.map((role) => ROLE_LABEL[role] || role).join(', ')].filter(Boolean).join(' · ')}</small>
                            </span>
                          </label>
                        );
                      }) : <p className={styles.memberEmpty}>Không tìm thấy nhân sự nội bộ phù hợp.</p>}
                    </div>
                    <p className={styles.assurance}><Icon name="shield" size={15} /> Danh sách này chỉ kiểm soát quyền mở Realm; không hiển thị thời lượng, tiến độ hay điểm hiệu suất.</p>
                  </div>
                )}
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

            <fieldset className={styles.fieldset}>
              <legend>Feature flags phát hành độc lập</legend>
              <div className={styles.featureGrid}>
                {FEATURE_OPTIONS.map((feature) => (
                  <label key={feature.value} className={draft.features?.[feature.value] ? styles.featureEnabled : ''}>
                    <input type="checkbox" checked={draft.features?.[feature.value] !== false} onChange={() => toggleFeature(feature.value)} />
                    <span><strong>{feature.label}</strong><small>{feature.description}</small></span>
                  </label>
                ))}
              </div>
              <p className={styles.assurance}><Icon name="shield" size={15} /> Tắt Office hoặc chuyển mode sang “Tạm đóng” luôn đưa người dùng về ERP; không rollback migration.</p>
            </fieldset>

            <fieldset className={styles.fieldset}>
              <legend>Phiên bản onboarding</legend>
              <div className={styles.onboardingVersion}>
                <div><strong>Tour v{draft.onboardingVersion}</strong><span>Tăng phiên bản để cohort thấy lại hướng dẫn ở lần mở tiếp theo.</span></div>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setDraft((current) => ({ ...current, onboardingVersion: Math.min(99, current.onboardingVersion + 1) }))}>Tạo tour v{Math.min(99, draft.onboardingVersion + 1)}</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { window.dispatchEvent(new CustomEvent(REALM_ONBOARDING_RESET_EVENT)); toast('Đã mở lại hướng dẫn trên thiết bị này.'); }}>Mở tour của tôi</button>
              </div>
            </fieldset>

            <section className={styles.readiness} aria-labelledby="realm-readiness-title">
              <div className={styles.readinessHeader}>
                <div><strong id="realm-readiness-title">Release readiness preflight</strong><span>Gate tổng hợp trước khi mời cohort thật.</span></div>
                <span className={`${styles.readinessStatus} ${styles[`readiness_${state.readiness?.status || 'blocked'}`]}`}>{state.readiness?.status === 'ready' ? 'Sẵn sàng' : state.readiness?.status === 'attention' ? 'Cần chú ý' : 'Đang bị chặn'}</span>
              </div>
              <div className={styles.gates}>
                {(state.readiness?.gates || []).map((gate) => (
                  <div key={gate.id} data-passed={gate.passed || undefined}>
                    <span><Icon name={gate.passed ? 'check' : 'alert'} size={15} /></span>
                    <p><strong>{gate.label}</strong><small>{gate.detail}</small></p>
                    {!gate.blocking && <em>Khuyến nghị</em>}
                  </div>
                ))}
              </div>
              <p className={styles.rollback}><Icon name="repeat" size={15} /> Rollback vận hành: chuyển mode sang “Tạm đóng”, xác minh <code>/dashboard</code>; giữ nguyên dữ liệu ERP và migration đã áp dụng.</p>
            </section>

            <section className={styles.launchControl} aria-labelledby="realm-launch-title">
              <div className={styles.launchHeader}>
                <div>
                  <strong id="realm-launch-title">Controlled launch dry-run</strong>
                  <span>Preview được ký, hết hạn sau 10 phút và chỉ dùng cho đúng Director, policy version cùng bản nháp này.</span>
                </div>
                {previewValid && <span className={`${styles.riskChip} ${styles[`risk_${launch.preview?.risk}`]}`}>{RISK_LABELS[launch.preview?.risk] || launch.preview?.risk}</span>}
              </div>
              {launch.error ? (
                <div className={styles.launchError} role="alert"><Icon name="alert" size={16} /><span>{launch.error} Sửa bản nháp hoặc tải lại rồi thử lại.</span></div>
              ) : previewValid ? (
                <div className={styles.launchPreview} aria-live="polite">
                  <div className={styles.previewGrid} aria-label="Tác động rollout tổng hợp">
                    <Metric label="Được mở Realm" value={launch.preview?.impact?.eligibleUsers} />
                    <Metric label="Fallback ERP" value={launch.preview?.impact?.fallbackUsers} />
                    <Metric label="Thay đổi cohort" value={launch.preview?.impact?.eligibleDelta > 0 ? `+${launch.preview.impact.eligibleDelta}` : launch.preview?.impact?.eligibleDelta} />
                    <Metric label="Blocking gate" value={launch.preview?.readiness?.summary?.blockers} />
                  </div>
                  <p className={styles.launchAssurance}>
                    <Icon name={launch.preview?.readiness?.ready ? 'check' : 'alert'} size={15} />
                    {launch.preview?.risk === 'expansion' && !launch.preview?.readiness?.ready
                      ? 'Mở rộng đang bị khóa cho tới khi mọi blocking gate đạt.'
                      : `Preview ${launch.preview?.id} dùng được tới ${new Date(launch.preview?.expiresAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}.`}
                  </p>
                </div>
              ) : (
                <div className={styles.launchEmpty}>
                  <Icon name="shield" size={18} />
                  <div><strong>Chưa có preview cho bản nháp này</strong><span>Chạy kiểm tra tác động trước khi áp dụng policy.</span></div>
                </div>
              )}
              <p className={styles.launchPrivacy}><Icon name="shield" size={15} /> Dry-run chỉ trả số liệu tổng hợp; không trả roster, thời lượng hay dữ liệu hiệu suất.</p>
            </section>

            <section className={styles.approvalBoard} aria-labelledby="realm-launch-approval-title">
              <div className={styles.approvalBoardHeader}>
                <div>
                  <strong id="realm-launch-approval-title">Bàn duyệt phát hành</strong>
                  <span>Four-eyes control: Director tạo bản mở rộng không thể tự duyệt. Thu hẹp và kill switch không bị trì hoãn.</span>
                </div>
                <span>{state.approvals.toReview.length} chờ bạn</span>
              </div>
              <div className={styles.approvalColumns}>
                <div>
                  <h3>Chờ tôi duyệt</h3>
                  {state.approvals.toReview.length ? state.approvals.toReview.map((approval) => (
                    <LaunchApprovalCard
                      key={approval.id}
                      approval={approval}
                      busy={Boolean(approvalBusyId)}
                      onDecide={decideLaunchApproval}
                    />
                  )) : (
                    <p className={styles.approvalEmpty}>Không có yêu cầu mở rộng nào chờ bạn.</p>
                  )}
                </div>
                <div>
                  <h3>Yêu cầu của tôi</h3>
                  {state.approvals.mine.length ? state.approvals.mine.map((approval) => (
                    <LaunchApprovalCard key={approval.id} approval={approval} mine />
                  )) : (
                    <p className={styles.approvalEmpty}>Bạn chưa gửi yêu cầu mở rộng Realm.</p>
                  )}
                </div>
              </div>
              <p className={styles.launchPrivacy}><Icon name="shield" size={15} /> Approval chỉ hiển thị số lượng tổng hợp. Policy chi tiết được mã hóa và chỉ giải mã trong transaction duyệt.</p>
            </section>

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
              <span aria-live="polite">{changed ? previewValid ? expansionPreview ? 'Bản mở rộng sẵn sàng gửi Director khác' : 'Dry-run khớp với bản nháp hiện tại' : 'Có thay đổi chưa preview' : 'Chính sách đã đồng bộ'}</span>
              <div className={styles.launchActions}>
                {changed && draft.mode !== 'off' && (
                  <AsyncButton className={`btn ${previewValid ? 'btn-outline' : 'btn-primary'}`} pendingLabel="Đang dry-run…" onClick={runLaunchPreview}>Chạy dry-run phát hành</AsyncButton>
                )}
                {expansionPreview ? (
                  <AsyncButton
                    className="btn btn-primary"
                    disabled={!changed || !previewAllowsApply}
                    pendingLabel="Đang gửi bàn duyệt…"
                    onClick={requestExpansionApproval}
                  >Gửi Director khác duyệt</AsyncButton>
                ) : (
                  <AsyncButton
                    className={`btn ${draft.mode === 'off' || previewAllowsApply ? 'btn-primary' : 'btn-outline'}`}
                    disabled={!changed || (draft.mode !== 'off' && !previewAllowsApply)}
                    pendingLabel={draft.mode === 'off' ? 'Đang tắt Realm…' : 'Đang áp dụng…'}
                    onClick={save}
                  >{draft.mode === 'off' ? 'Kích hoạt kill switch' : 'Lưu chính sách pilot'}</AsyncButton>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
