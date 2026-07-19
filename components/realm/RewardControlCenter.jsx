'use client';

import { useEffect, useMemo, useState } from 'react';
import { Icon, useToast } from '@/components/ui';
import { applyRealmRewardDemoAction } from '@/lib/realm-rewards';
import styles from './reward-control.module.css';

const STATUS = {
  unconfigured: { label: 'Chưa cấu hình', icon: 'edit', tone: 'neutral' },
  draft: { label: 'Bản nháp', icon: 'edit', tone: 'draft' },
  pending: { label: 'Chờ checker', icon: 'clock', tone: 'pending' },
  approved: { label: 'Đã duyệt', icon: 'check', tone: 'approved' },
  rejected: { label: 'Cần điều chỉnh', icon: 'alert', tone: 'rejected' },
};

function statusMeta(status) {
  return STATUS[status] || STATUS.unconfigured;
}

function StatusBadge({ status }) {
  const meta = statusMeta(status);
  return <span className={`${styles.statusBadge} ${styles[`status_${meta.tone}`]}`}><Icon name={meta.icon} size={14} />{meta.label}</span>;
}

function emptyEditor(row, type = 'configure') {
  return {
    type,
    taskId: row.taskId,
    gold: row.gold || 1,
    renown: row.renown || 0,
    note: row.note || '',
    reviewNote: '',
  };
}

function emptyBudgetEditor(budget, type = 'budget-configure') {
  const configuration = budget?.configuration;
  return {
    type,
    goldCap: configuration?.goldCap || budget?.cap || 140,
    perUserGoldCap: configuration?.perUserGoldCap || budget?.perUserCap || 45,
    note: configuration?.note || '',
    reviewNote: '',
  };
}

export default function RewardControlCenter({
  operationsSource,
  localDashboard,
  onLocalDashboardChange,
  onRewardChanged,
  dataRevision = 0,
}) {
  const toast = useToast();
  const [dashboard, setDashboard] = useState(localDashboard);
  const [loading, setLoading] = useState(operationsSource === 'erp');
  const [error, setError] = useState('');
  const [busyTaskId, setBusyTaskId] = useState('');
  const [editor, setEditor] = useState(null);

  useEffect(() => {
    if (operationsSource !== 'erp') {
      setDashboard(localDashboard);
      setLoading(false);
      setError('');
      return undefined;
    }
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 7000);
    setLoading(true);
    setError('');
    fetch('/api/realm-demo/rewards', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Không thể tải Reward Control Center.');
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
  }, [dataRevision, localDashboard, operationsSource]);

  const selectedRow = useMemo(
    () => dashboard?.rows?.find((row) => row.taskId === editor?.taskId) || null,
    [dashboard?.rows, editor?.taskId],
  );

  const commitDashboard = async (nextDashboard, taskId) => {
    setDashboard(nextDashboard);
    if (operationsSource === 'local') onLocalDashboardChange(nextDashboard);
    if (taskId) {
      const changed = nextDashboard.rows?.find((row) => row.taskId === taskId);
      await onRewardChanged?.(changed);
    }
  };

  const runAction = async (action) => {
    const actionKey = action.taskId || `budget:${dashboard.period}`;
    setBusyTaskId(actionKey);
    setError('');
    try {
      let nextDashboard;
      if (operationsSource === 'erp') {
        const response = await fetch('/api/realm-demo/rewards', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'ERP từ chối thao tác reward.');
        nextDashboard = payload;
      } else {
        nextDashboard = applyRealmRewardDemoAction(dashboard, { ...action, type: action.action });
      }
      await commitDashboard(nextDashboard, action.taskId);
      setEditor(null);
      const messages = {
        'save-draft': 'Đã lưu reward draft',
        submit: 'Đã gửi reward sang checker',
        approve: 'Reward đã được phê duyệt trong budget',
        reject: 'Đã trả reward về cho người cấu hình',
        'budget-save-draft': 'Đã lưu budget draft',
        'budget-submit': 'Đã gửi budget sang checker',
        'budget-approve': 'Budget tháng đã được phê duyệt',
        'budget-reject': 'Đã trả budget về cho người cấu hình',
      };
      toast(messages[action.action] || 'Đã cập nhật reward');
    } catch (actionError) {
      setError(actionError.message || 'Không thể cập nhật reward.');
      toast(actionError.message || 'Không thể cập nhật reward.', 'error');
    } finally {
      setBusyTaskId('');
    }
  };

  const submitEditor = (event) => {
    event.preventDefault();
    const budgetConfiguration = dashboard?.budget?.configuration;
    if (editor.type === 'budget-reject') {
      runAction({ action: 'budget-reject', version: budgetConfiguration?.version || 0, reviewNote: editor.reviewNote });
      return;
    }
    if (editor.type === 'budget-configure') {
      runAction({
        action: 'budget-save-draft',
        version: budgetConfiguration?.version || 0,
        goldCap: Number(editor.goldCap),
        perUserGoldCap: Number(editor.perUserGoldCap),
        note: editor.note,
      });
      return;
    }
    if (!selectedRow) return;
    if (editor.type === 'reject') {
      runAction({ action: 'reject', taskId: selectedRow.taskId, version: selectedRow.version, reviewNote: editor.reviewNote });
      return;
    }
    runAction({
      action: 'save-draft',
      taskId: selectedRow.taskId,
      version: selectedRow.version,
      gold: Number(editor.gold),
      renown: Number(editor.renown),
      note: editor.note,
    });
  };

  if (loading) return (
    <section className={styles.stateCard} aria-live="polite">
      <Icon name="clock" size={21} />
      <div><strong>Đang mở Reward Control Center</strong><p>Kiểm tra quyền quản lý, budget và hàng chờ duyệt…</p></div>
    </section>
  );

  if (!dashboard) return (
    <section className={styles.stateCard} role="alert">
      <Icon name="alert" size={21} />
      <div><strong>Không thể mở Reward Control Center</strong><p>{error || 'Chưa có dữ liệu reward.'}</p></div>
    </section>
  );

  const { budget, permissions, actor } = dashboard;
  const budgetConfiguration = budget.configuration || null;
  const budgetBusyKey = `budget:${dashboard.period}`;
  const budgetBusy = busyTaskId === budgetBusyKey;
  const canConfigureBudget = permissions.canConfigureBudget ?? permissions.canManageBudget;
  const canApproveBudget = (permissions.canApproveBudget ?? permissions.canManageBudget)
    && budgetConfiguration?.configuredById !== actor?.id;
  const budgetEditor = editor?.type?.startsWith('budget');
  const rejectEditor = editor?.type?.endsWith('reject');
  return (
    <div className={styles.controlCenter}>
      <section className={styles.governanceBanner}>
        <div>
          <span>Reward governance · {dashboard.period}</span>
          <h2>Hội đồng Gold</h2>
          <p>Maker cấu hình, checker phê duyệt. Gold chỉ trở thành claimable sau khi qua quyền, budget và audit.</p>
        </div>
        <span className={styles.actorBadge}><Icon name="shield" size={16} />{actor?.name} · {actor?.roleLabel}</span>
      </section>

      {error && <div className={styles.errorBanner} role="alert"><Icon name="alert" size={16} /><span>{error}</span></div>}

      <section className={styles.budgetGrid} aria-label="Hạn mức Gold tháng">
        <article><small>Trần tháng</small><strong>{budget.cap} G</strong><span>{budget.policyStatus === 'approved' ? 'Budget đã duyệt' : 'Policy mặc định'}</span></article>
        <article><small>Đã phát hành</small><strong>{budget.issued} G</strong><span>Gold journal</span></article>
        <article><small>Đã cam kết</small><strong>{budget.committed} G</strong><span>Approved, chưa claim</span></article>
        <article><small>Còn khả dụng</small><strong>{budget.remaining} G</strong><span>Pending: {budget.pending} G</span></article>
      </section>

      <section className={styles.budgetMeter} aria-label="Mức sử dụng budget">
        <div><span>Budget utilization</span><strong>{budget.utilization}%</strong></div>
        <div className={styles.meterTrack} role="progressbar" aria-label="Mức sử dụng hạn mức Gold tháng" aria-valuemin="0" aria-valuemax="100" aria-valuenow={budget.utilization} aria-valuetext={`${budget.utilization}% hạn mức đã sử dụng`}><i style={{ width: `${budget.utilization}%` }} /></div>
        <p>Giới hạn mỗi nhân sự: {budget.perUserCap} Gold/tháng · Mỗi Quest tối đa 20 Gold.</p>
      </section>

      <section className={styles.budgetCouncil} aria-labelledby="budget-council-title">
        <div className={styles.budgetCouncilHead}>
          <div><span>Monthly treasury</span><h2 id="budget-council-title">Sắc lệnh ngân khố</h2><p>Budget tháng cũng tuân theo maker/checker và được khóa sau khi duyệt.</p></div>
          {budgetConfiguration && <StatusBadge status={budgetConfiguration.status} />}
        </div>
        {budgetConfiguration ? (
          <div className={styles.budgetProposal}>
            <div className={styles.budgetProposalTerms}>
              <span><small>Đề xuất tháng</small><strong>{budgetConfiguration.goldCap} G</strong></span>
              <span><small>Mỗi nhân sự</small><strong>{budgetConfiguration.perUserGoldCap} G</strong></span>
              <span><small>Version</small><strong>v{budgetConfiguration.version}</strong></span>
            </div>
            <p className={styles.budgetNote}>{budgetConfiguration.note || 'Chưa có lý do điều chỉnh budget.'}</p>
            <div className={styles.auditLine}>
              <span><Icon name="edit" size={14} />Maker: {budgetConfiguration.configuredBy || 'Chưa có'}</span>
              <span><Icon name="check" size={14} />Checker: {budgetConfiguration.approvedBy || 'Chưa có'}</span>
            </div>
            {budgetConfiguration.reviewNote && <p className={styles.reviewNote}><Icon name="alert" size={14} />{budgetConfiguration.reviewNote}</p>}
            <div className={styles.cardActions}>
              {budgetConfiguration.status === 'approved' ? (
                <span className={styles.lockedLabel}><Icon name="shield" size={15} />Đã duyệt · khóa budget kỳ {dashboard.period}</span>
              ) : (
                <>
                  {canConfigureBudget && budgetConfiguration.status !== 'pending' && <button type="button" onClick={() => setEditor(emptyBudgetEditor(budget))}><Icon name="edit" size={15} />Điều chỉnh budget</button>}
                  {canConfigureBudget && ['draft', 'rejected'].includes(budgetConfiguration.status) && <button type="button" disabled={budgetBusy} onClick={() => runAction({ action: 'budget-submit', version: budgetConfiguration.version })}><Icon name="upload" size={15} />{budgetBusy ? 'Đang gửi…' : 'Gửi duyệt'}</button>}
                  {budgetConfiguration.status === 'pending' && canApproveBudget && <button type="button" className={styles.approveAction} disabled={budgetBusy || budgetConfiguration.goldCap < budget.used} onClick={() => runAction({ action: 'budget-approve', version: budgetConfiguration.version })}><Icon name="check" size={15} />{budgetBusy ? 'Đang duyệt…' : 'Phê duyệt budget'}</button>}
                  {budgetConfiguration.status === 'pending' && canApproveBudget && <button type="button" className={styles.secondaryDanger} onClick={() => setEditor(emptyBudgetEditor(budget, 'budget-reject'))}><Icon name="repeat" size={15} />Yêu cầu sửa</button>}
                  {budgetConfiguration.status === 'pending' && !canApproveBudget && <span className={styles.lockedLabel}><Icon name="shield" size={15} />Chờ một Director khác review</span>}
                </>
              )}
            </div>
          </div>
        ) : (
          <div className={styles.budgetEmpty}>
            <Icon name="shield" size={20} />
            <div><strong>Đang dùng policy mặc định</strong><p>{budget.cap} Gold/tháng · {budget.perUserCap} Gold/người.</p></div>
            {canConfigureBudget && <button type="button" onClick={() => setEditor(emptyBudgetEditor(budget))}><Icon name="edit" size={15} />Tạo budget draft</button>}
          </div>
        )}
      </section>

      {editor && (selectedRow || budgetEditor) && (
        <form className={styles.editor} onSubmit={submitEditor}>
          <div className={styles.editorHead}>
            <div>
              <span>{rejectEditor ? 'Checker review' : (budgetEditor ? 'Budget draft' : 'Reward draft')}</span>
              <h3>{budgetEditor ? `Ngân khố kỳ ${dashboard.period}` : selectedRow.title}</h3>
              <p>{budgetEditor ? 'Cấu hình hạn mức trước khi reward được phê duyệt' : `${selectedRow.taskId} · ${selectedRow.assignee}`}</p>
            </div>
            <button type="button" onClick={() => setEditor(null)} aria-label="Đóng form cấu hình"><Icon name="x" size={17} /></button>
          </div>
          {budgetEditor && !rejectEditor ? (
            <>
              <div className={styles.editorFields}>
                <label>Trần Gold toàn công ty<input type="number" min="1" max="10000" required value={editor.goldCap} onChange={(event) => setEditor((current) => ({ ...current, goldCap: event.target.value }))} /></label>
                <label>Trần Gold mỗi nhân sự<input type="number" min="1" max="1000" required value={editor.perUserGoldCap} onChange={(event) => setEditor((current) => ({ ...current, perUserGoldCap: event.target.value }))} /></label>
              </div>
              <label>Lý do và phạm vi budget<textarea minLength="8" maxLength="500" required value={editor.note} onChange={(event) => setEditor((current) => ({ ...current, note: event.target.value }))} /></label>
              <p className={styles.helperText}>Trần mỗi nhân sự không được lớn hơn trần công ty. Budget thấp hơn Gold đã phát hành/cam kết sẽ bị checker từ chối.</p>
              <button type="submit" className={styles.primaryAction} disabled={Boolean(busyTaskId)}>{busyTaskId ? 'Đang lưu…' : 'Lưu budget draft'}</button>
            </>
          ) : !rejectEditor ? (
            <>
              <div className={styles.editorFields}>
                <label>Gold<input type="number" min="1" max="20" required value={editor.gold} onChange={(event) => setEditor((current) => ({ ...current, gold: event.target.value }))} /></label>
                <label>Renown<input type="number" min="0" max="500" required value={editor.renown} onChange={(event) => setEditor((current) => ({ ...current, renown: event.target.value }))} /></label>
              </div>
              <label>Lý do và tiêu chí reward<textarea minLength="8" maxLength="500" required value={editor.note} onChange={(event) => setEditor((current) => ({ ...current, note: event.target.value }))} /></label>
              <p className={styles.helperText}>Lưu draft sẽ hủy approval cũ và tăng version. Reward chỉ có hiệu lực sau khi checker khác phê duyệt.</p>
              <button type="submit" className={styles.primaryAction} disabled={Boolean(busyTaskId)}>{busyTaskId ? 'Đang lưu…' : 'Lưu bản nháp'}</button>
            </>
          ) : (
            <>
              <label>Lý do yêu cầu chỉnh sửa<textarea minLength="8" maxLength="500" required autoFocus value={editor.reviewNote} onChange={(event) => setEditor((current) => ({ ...current, reviewNote: event.target.value }))} /></label>
              <button type="submit" className={styles.rejectAction} disabled={Boolean(busyTaskId)}>{busyTaskId ? 'Đang gửi…' : `Trả ${budgetEditor ? 'budget' : 'reward'} về người cấu hình`}</button>
            </>
          )}
        </form>
      )}

      <section className={styles.queueSection}>
        <div className={styles.queueHead}><div><span>Approval queue</span><h2>Cấu hình reward theo Task</h2></div><p>{dashboard.rows.length} Task · separation of duties đang bật</p></div>
        <div className={styles.rewardList}>
          {dashboard.rows.map((row) => {
            const rowBusy = busyTaskId === row.taskId;
            const canConfigure = row.canConfigure ?? permissions.canConfigure;
            const canApprove = row.canApprove ?? (permissions.canApprove && row.configuredById !== actor?.id);
            return (
              <article className={styles.rewardCard} key={row.taskId}>
                <div className={styles.rewardTitle}>
                  <div><span>{row.taskId} · {row.project}</span><h3>{row.title}</h3><p>Nhận thưởng: {row.assignee}</p></div>
                  <StatusBadge status={row.status} />
                </div>
                <div className={styles.rewardTerms}>
                  <span><small>Gold</small><strong>{row.gold || '—'} G</strong></span>
                  <span><small>Renown</small><strong>{row.renown || 0} XP</strong></span>
                  <span><small>Version</small><strong>v{row.version}</strong></span>
                </div>
                <p className={styles.rewardNote}>{row.note || 'Chưa có lý do reward.'}</p>
                <div className={styles.auditLine}>
                  <span><Icon name="edit" size={14} />Maker: {row.configuredBy || 'Chưa có'}</span>
                  <span><Icon name="check" size={14} />Checker: {row.approvedBy || 'Chưa có'}</span>
                </div>
                {row.reviewNote && <p className={styles.reviewNote}><Icon name="alert" size={14} />{row.reviewNote}</p>}
                <div className={styles.cardActions}>
                  {row.rewardIssued ? <span className={styles.lockedLabel}><Icon name="shield" size={15} />Đã phát hành · khóa chỉnh sửa</span> : (
                    <>
                      {canConfigure && row.status !== 'pending' && <button type="button" onClick={() => setEditor(emptyEditor(row))}><Icon name="edit" size={15} />{row.status === 'unconfigured' ? 'Cấu hình' : 'Điều chỉnh'}</button>}
                      {canConfigure && ['draft', 'rejected'].includes(row.status) && <button type="button" disabled={rowBusy} onClick={() => runAction({ action: 'submit', taskId: row.taskId, version: row.version })}><Icon name="upload" size={15} />{rowBusy ? 'Đang gửi…' : 'Gửi duyệt'}</button>}
                      {row.status === 'pending' && canApprove && <button type="button" className={styles.approveAction} disabled={rowBusy || budget.remaining < row.gold} onClick={() => runAction({ action: 'approve', taskId: row.taskId, version: row.version })}><Icon name="check" size={15} />{rowBusy ? 'Đang duyệt…' : 'Phê duyệt'}</button>}
                      {row.status === 'pending' && canApprove && <button type="button" className={styles.secondaryDanger} onClick={() => setEditor(emptyEditor(row, 'reject'))}><Icon name="repeat" size={15} />Yêu cầu sửa</button>}
                      {row.status === 'pending' && !canApprove && <span className={styles.lockedLabel}><Icon name="shield" size={15} />Chờ checker có quyền khác</span>}
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
