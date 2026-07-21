'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon, useToast } from '@/components/ui';
import { applyRealmTreasuryDemoAction } from '@/lib/realm-treasury';
import { money } from '@/lib/format';
import styles from './royal-treasury.module.css';

const STATUS_META = {
  awaiting_approval: { label: 'Chờ hội đồng', icon: 'clock', tone: 'pending' },
  ready: { label: 'Chờ Tavern Keeper', icon: 'upload', tone: 'ready' },
  fulfilled: { label: 'Đã nhận thưởng', icon: 'check', tone: 'fulfilled' },
  refunded: { label: 'Gold đã hoàn', icon: 'repeat', tone: 'refunded' },
};

function StatusBadge({ request }) {
  const meta = STATUS_META[request.fulfillmentStatus] || STATUS_META.awaiting_approval;
  return <span className={`${styles.statusBadge} ${styles[`status_${meta.tone}`]}`}><Icon name={meta.icon} size={14} />{meta.label}</span>;
}

function StateCard({ loading = false, error = '', onRetry }) {
  return (
    <section className={styles.stateCard} role={error ? 'alert' : 'status'} aria-live="polite">
      <Icon name={loading ? 'clock' : 'alert'} size={22} />
      <div><strong>{loading ? 'Đang mở Tavern…' : 'Không thể tải Tavern'}</strong><p>{loading ? 'Đang đối chiếu wallet, menu và hành trình đổi thưởng.' : error}</p></div>
      {!loading && <button type="button" onClick={onRetry}><Icon name="repeat" size={15} />Thử lại</button>}
    </section>
  );
}

function RoyalLedgerIntelligence({ intelligence }) {
  if (!intelligence) return null;
  const { summary, managerQueue, cashForecast, projects, provenance } = intelligence;
  return (
    <section className={styles.ledgerIntelligence} aria-labelledby="royal-ledger-title">
      <header className={styles.ledgerHead}>
        <div><span>Royal Ledger · canonical ERP finance</span><h2 id="royal-ledger-title">The Steward&apos;s Margin Table</h2><p>Task → declared TimeLog → cost proxy → Invoice → cash. Một rule engine với ERP Finance, chỉ khác cách trình bày.</p></div>
        <Link href="/finance"><Icon name="finance" size={15} />Mở ERP ledger</Link>
      </header>
      <div className={styles.ledgerMetrics} aria-label="Royal Ledger summary">
        <article><span>Coin on record</span><strong>{money(summary.cashBalance)}</strong><small>Transaction ledger</small></article>
        <article><span>Tribute due</span><strong>{money(summary.receivable)}</strong><small>{money(summary.overdueReceivable)} quá hạn</small></article>
        <article><span>Obligations</span><strong>{money(summary.payable)}</strong><small>{money(summary.overduePayable)} quá hạn</small></article>
        <article><span>Margin proxy</span><strong>{money(summary.operatingMarginProxy)}</strong><small>Không phải accounting profit</small></article>
      </div>
      <div className={styles.ledgerGrid}>
        <section aria-labelledby="royal-ledger-queue-title">
          <header><div><span>Steward Queue</span><h3 id="royal-ledger-queue-title">Việc cần hội đồng xem xét</h3></div><strong>{managerQueue.length}</strong></header>
          <div className={styles.ledgerQueue}>{managerQueue.length ? managerQueue.slice(0, 6).map((item) => (
            <article key={item.id} className={styles[`ledgerSeverity_${item.severity}`]}><Icon name={item.severity === 'critical' ? 'alert' : 'clock'} size={16} /><div><strong>{item.label}</strong><p>{item.explanation}</p><small>Nguồn: {item.source}</small></div></article>
          )) : <div className={styles.ledgerEmpty}><Icon name="check" size={19} /><span>Steward Queue đang sạch.</span></div>}</div>
        </section>
        <section aria-labelledby="royal-ledger-forecast-title">
          <header><div><span>Three moons</span><h3 id="royal-ledger-forecast-title">Lịch tiền ba kỳ</h3></div><Icon name="calendar" size={18} /></header>
          <div className={styles.ledgerForecast}>{cashForecast.map((row) => <article key={row.month} className={styles[`ledgerForecast_${row.band}`]}><header><strong>{row.month}</strong><span>{row.band === 'negative' ? 'Âm' : row.band === 'thin' ? 'Mỏng' : 'Dương'}</span></header><dl><div><dt>Thu theo hạn</dt><dd>+{money(row.scheduledReceipts)}</dd></div><div><dt>Chi theo lịch</dt><dd>−{money(row.scheduledVendorPayments + row.futureRecurringTemplates)}</dd></div><div><dt>Cuối kỳ</dt><dd>{money(row.closingBalance)}</dd></div></dl></article>)}</div>
        </section>
      </div>
      <details className={styles.ledgerProjects}>
        <summary><span><Icon name="projects" size={17} /><strong>Project economics</strong><small>{projects.length} dự án · alphabet, không phải ranking</small></span><Icon name="menu" size={16} /></summary>
        <div>{projects.map((project) => <article key={project.projectId}><Link href={`/projects/${project.projectId}`}>{project.name}</Link><span>{project.declaredHours}h khai báo</span><strong>{money(project.operatingMarginProxy)}</strong><small>{project.marginBand === 'negative' ? 'Margin proxy âm' : project.marginBand === 'unknown' ? 'Chưa đủ invoice' : 'Margin proxy dương'}</small></article>)}</div>
      </details>
      <footer className={styles.ledgerProvenance}><Icon name="shield" size={16} /><p>Confidence ceiling: {provenance.confidence.ceiling}. Cash dùng Transaction thật; labor cost dùng TimeLog tự khai báo × rate hiện tại. Không xếp hạng cá nhân, không tự tạo invoice và không tự thanh toán.</p></footer>
    </section>
  );
}

function ConfirmRedemption({ item, busy, onClose, onConfirm }) {
  if (!item) return null;
  const benefit = item.kind === 'benefit';
  return (
    <div className={styles.dialogScrim} role="presentation">
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="treasury-confirm-title" aria-describedby="treasury-confirm-copy">
        <header>
          <span className={styles.dialogIcon}><Icon name={item.icon} size={21} /></span>
          <div><span>Redemption review</span><h2 id="treasury-confirm-title">{benefit ? 'Gửi yêu cầu quyền lợi?' : 'Mở khóa vật phẩm?'}</h2></div>
          <button type="button" aria-label="Đóng xác nhận đổi Gold" onClick={onClose} disabled={busy}><Icon name="x" size={18} /></button>
        </header>
        <p id="treasury-confirm-copy">{benefit
          ? `${item.price} Gold sẽ được giữ trong journal. Checker duyệt thì Gold được kết chuyển; từ chối thì hệ thống append bút toán hoàn giữ chỗ.`
          : `${item.price} Gold sẽ bị trừ ngay và ${item.name} được mở khóa một lần cho hồ sơ Realm.`}</p>
        <dl><div><dt>Vật phẩm</dt><dd>{item.name}</dd></div><div><dt>Giá</dt><dd>{item.price} Gold</dd></div><div><dt>Thực hiện</dt><dd>{item.fulfillment}</dd></div></dl>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.secondaryAction} onClick={onClose} disabled={busy}>Quay lại</button>
          <button type="button" className={styles.primaryAction} onClick={onConfirm} disabled={busy}><Icon name={benefit ? 'upload' : 'check'} size={15} />{busy ? 'Đang xử lý…' : benefit ? 'Xác nhận gửi duyệt' : 'Xác nhận mở khóa'}</button>
        </div>
      </section>
    </div>
  );
}

export default function RoyalTreasuryExchange({
  operationsSource,
  localDashboard,
  onLocalDashboardChange,
  onOperationsRefresh,
  dataRevision = 0,
}) {
  const toast = useToast();
  const [dashboard, setDashboard] = useState(localDashboard);
  const [loading, setLoading] = useState(operationsSource === 'erp');
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [confirmItem, setConfirmItem] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

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
    fetch('/api/realm-demo/treasury', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Không thể tải Tavern.');
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
  }, [dataRevision, localDashboard, operationsSource, refreshKey]);

  const pendingCount = useMemo(() => dashboard?.requests?.filter((request) => request.status === 'pending').length || 0, [dashboard?.requests]);
  const readyCount = useMemo(() => dashboard?.requests?.filter((request) => request.fulfillmentStatus === 'ready').length || 0, [dashboard?.requests]);

  const commitLocal = async (nextDashboard) => {
    setDashboard(nextDashboard);
    await onLocalDashboardChange?.(nextDashboard);
  };

  const redeem = async (item) => {
    setBusyKey(item.id);
    setError('');
    try {
      let nextDashboard;
      if (operationsSource === 'erp') {
        const idempotencyKey = `realm-redeem:${crypto.randomUUID()}`;
        const response = await fetch('/api/realm-demo/treasury', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify({ action: 'redeem', itemId: item.id }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'ERP từ chối yêu cầu đổi Gold.');
        nextDashboard = payload;
        setDashboard(payload);
        await onOperationsRefresh?.();
      } else {
        nextDashboard = applyRealmTreasuryDemoAction(dashboard, { type: 'redeem', itemId: item.id });
        await commitLocal(nextDashboard);
      }
      setConfirmItem(null);
      toast(nextDashboard.action?.type === 'pending' || nextDashboard.action?.outcome === 'pending'
        ? `Đã giữ ${item.price} Gold và gửi yêu cầu sang checker`
        : `Đã mở khóa ${item.name}`);
    } catch (actionError) {
      setError(actionError.message || 'Không thể xử lý yêu cầu Tavern.');
      toast(actionError.message || 'Không thể xử lý yêu cầu Tavern.', 'error');
    } finally {
      setBusyKey('');
    }
  };

  const fulfill = async (request) => {
    setBusyKey(request.id);
    setError('');
    try {
      if (operationsSource === 'erp') {
        const response = await fetch('/api/realm-demo/treasury', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'fulfill', approvalId: request.id }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Không thể xác nhận trao thưởng.');
        setDashboard(payload);
        await onOperationsRefresh?.();
      } else {
        await commitLocal(applyRealmTreasuryDemoAction(dashboard, { type: 'demo-fulfill', requestId: request.id }));
      }
      toast(`Tavern Keeper đã xác nhận trao ${request.itemName}`);
    } catch (actionError) {
      setError(actionError.message || 'Không thể xác nhận trao thưởng.');
      toast(actionError.message || 'Không thể xác nhận trao thưởng.', 'error');
    } finally {
      setBusyKey('');
    }
  };

  const equip = async (item) => {
    const actionKey = `equip:${item.id}`;
    setBusyKey(actionKey);
    setError('');
    try {
      let nextDashboard;
      if (operationsSource === 'erp') {
        const idempotencyKey = `realm-equip:${crypto.randomUUID()}`;
        const response = await fetch('/api/realm-demo/treasury', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify({ action: 'equip', itemId: item.id }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'ERP từ chối thay đổi loadout.');
        nextDashboard = payload;
        setDashboard(payload);
        await onOperationsRefresh?.();
      } else {
        nextDashboard = applyRealmTreasuryDemoAction(dashboard, { type: 'equip', itemId: item.id });
        await commitLocal(nextDashboard);
      }
      toast(`Đã trang bị ${item.equipName}`);
    } catch (actionError) {
      setError(actionError.message || 'Không thể thay đổi loadout.');
      toast(actionError.message || 'Không thể thay đổi loadout.', 'error');
    } finally {
      setBusyKey('');
    }
  };

  const demoReview = async (request, decision) => {
    setBusyKey(request.id);
    try {
      const nextDashboard = applyRealmTreasuryDemoAction(dashboard, {
        type: decision === 'approve' ? 'demo-approve' : 'demo-reject',
        requestId: request.id,
      });
      await commitLocal(nextDashboard);
      toast(decision === 'approve' ? 'Sandbox: checker đã duyệt quyền lợi' : 'Sandbox: đã từ chối và hoàn Gold');
    } catch (actionError) {
      setError(actionError.message || 'Không thể review yêu cầu demo.');
    } finally {
      setBusyKey('');
    }
  };

  if (loading) return <StateCard loading />;
  if (error && !dashboard) return <StateCard error={error} onRetry={() => setRefreshKey((value) => value + 1)} />;

  return (
    <div className={styles.treasury} data-realm-business-surface="tavern">
      <header className={styles.hero}>
        <div><span>The Gilded Griffin · governed rewards</span><h1>Tavern</h1><p>Nơi Adventurer dùng Gold để mở khóa vật phẩm và quyền lợi có kiểm soát. Tavern không quy đổi Gold thành lương, tiền mặt hoặc phép luật định.</p></div>
        <span className={styles.sourceBadge}><Icon name={dashboard.source === 'erp' ? 'check' : 'shield'} size={16} />{dashboard.source === 'erp' ? 'ERP journal live' : 'Tavern sandbox'}</span>
      </header>

      {error && <div className={styles.errorBanner} role="alert"><Icon name="alert" size={16} /><span>{error}</span><button type="button" onClick={() => setRefreshKey((value) => value + 1)}>Tải lại</button></div>}

      <RoyalLedgerIntelligence intelligence={dashboard.financialIntelligence} />

      <section className={styles.walletStrip} aria-label="Trạng thái ví Tavern">
        <div><span>Gold khả dụng</span><strong>{dashboard.wallet} G</strong></div>
        <div><span>Đang giữ chờ duyệt</span><strong>{dashboard.reserved} G</strong></div>
        <div><span>Đã duyệt · chờ nhận</span><strong>{readyCount}</strong></div>
        <p><Icon name="shield" size={15} />{pendingCount} yêu cầu chờ checker. Mọi biến động đều append vào Gold journal; không sửa balance trực tiếp.</p>
      </section>

      <section className={styles.policyBanner} aria-labelledby="treasury-policy-title">
        <Icon name="shield" size={21} />
        <div><span>Tavern charter</span><h2 id="treasury-policy-title">Luật quán: một menu, hai mức kiểm soát</h2><p>Cosmetic mở khóa trực tiếp. Quyền lợi thật luôn cần checker và giữ Gold trong lúc chờ; sau khi duyệt, Tavern Keeper xác nhận đã trao.</p></div>
      </section>

      <section className={styles.catalogSection} aria-labelledby="treasury-catalog-title">
        <header className={styles.sectionHead}><div><span>Tavern menu</span><h2 id="treasury-catalog-title">Vật phẩm & quyền lợi</h2></div><p>{dashboard.catalog.length} lựa chọn đang phục vụ</p></header>
        <div className={styles.catalogGrid}>
          {dashboard.catalog.map((item) => {
            const disabled = item.owned || item.pendingRequestId || !item.affordable;
            const buttonLabel = item.owned ? 'Đã sở hữu' : item.pendingRequestId ? 'Đang chờ duyệt' : !item.affordable ? 'Chưa đủ Gold' : item.kind === 'benefit' ? 'Gửi duyệt' : 'Mở khóa';
            return (
              <article className={styles.itemCard} key={item.id}>
                <div className={styles.itemTop}><span className={styles.itemIcon}><Icon name={item.icon} size={21} /></span><span className={`${styles.kindBadge} ${styles[`kind_${item.kind}`]}`}><Icon name={item.kind === 'benefit' ? 'clock' : 'check'} size={13} />{item.kind === 'benefit' ? 'Cần checker' : 'Mở khóa ngay'}</span></div>
                <h3>{item.name}</h3><p>{item.note}</p>
                <dl><div><dt>Giá</dt><dd>{item.price} Gold</dd></div><div><dt>Thực hiện</dt><dd>{item.fulfillment}</dd></div></dl>
                <button type="button" disabled={disabled} onClick={() => setConfirmItem(item)} aria-label={`${buttonLabel} ${item.name} với giá ${item.price} Gold`}><Icon name={item.owned ? 'check' : item.pendingRequestId ? 'clock' : 'wallet'} size={15} />{buttonLabel}<strong>{item.price} G</strong></button>
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.inventorySection} aria-labelledby="treasury-inventory-title">
        <header className={styles.sectionHead}><div><span>Character loadout</span><h2 id="treasury-inventory-title">Tủ đồ Adventurer</h2></div><p>{dashboard.inventory?.length || 0} vật phẩm đã mở khóa</p></header>
        <div className={styles.loadoutRail} aria-label="Loadout hiện tại">
          {[
            ['title', 'Danh hiệu'],
            ['seal', 'Ấn tín'],
            ['banner', 'Banner'],
          ].map(([slot, label]) => {
            const item = dashboard.loadout?.[slot];
            return <div className={styles.loadoutSlot} key={slot}><span><Icon name={item?.icon || 'shield'} size={17} /></span><small>{label}</small><strong>{item?.equipName || 'Đang để trống'}</strong><em>{item ? 'Đã đồng bộ hồ sơ' : 'Chọn từ tủ đồ'}</em></div>;
          })}
        </div>
        {dashboard.inventory?.length ? <div className={styles.inventoryGrid}>
          {dashboard.inventory.map((item) => (
            <article className={item.equipped ? styles.inventoryEquipped : ''} key={item.id}>
              <span className={styles.itemIcon}><Icon name={item.icon} size={20} /></span>
              <div><small>{item.slotLabel}</small><h3>{item.name}</h3><p>{item.equipped ? 'Đang hiển thị trên Character Dossier và trong Realm.' : 'Đã sở hữu vĩnh viễn · có thể trang bị ngay.'}</p></div>
              <button type="button" disabled={item.equipped || Boolean(busyKey)} onClick={() => equip(item)} aria-pressed={item.equipped} aria-label={`${item.equipped ? 'Đang trang bị' : 'Trang bị'} ${item.name}`}>
                <Icon name={item.equipped ? 'check' : 'shield'} size={15} />{busyKey === `equip:${item.id}` ? 'Đang đồng bộ…' : item.equipped ? 'Đang trang bị' : 'Trang bị'}
              </button>
            </article>
          ))}
        </div> : <div className={styles.emptyState}><Icon name="shield" size={22} /><div><strong>Tủ đồ đang trống</strong><p>Mở khóa cosmetic trong Tavern menu; vật phẩm sẽ xuất hiện tại đây để trang bị.</p></div></div>}
      </section>

      <section className={styles.requestsSection} aria-labelledby="treasury-requests-title">
        <header className={styles.sectionHead}><div><span>My tavern orders</span><h2 id="treasury-requests-title">Hành trình đổi thưởng</h2></div><p>Yêu cầu → duyệt → trao thưởng</p></header>
        <div className={styles.requestList}>
          {dashboard.requests?.length ? dashboard.requests.map((request) => (
            <article key={request.id}>
              <span className={styles.requestIcon}><Icon name="wallet" size={17} /></span>
              <span><strong>{request.itemName}</strong><small>{request.price} Gold · {request.createdAt ? new Date(request.createdAt).toLocaleDateString('vi-VN') : 'Vừa tạo'}</small><em>{request.nextAction}</em></span>
              <StatusBadge request={request} />
              {dashboard.permissions?.canDemoReview && request.status === 'pending' && <div className={styles.demoActions}><button type="button" disabled={busyKey === request.id} onClick={() => demoReview(request, 'reject')}>Từ chối</button><button type="button" disabled={busyKey === request.id} onClick={() => demoReview(request, 'approve')}>Duyệt sandbox</button></div>}
              {dashboard.permissions?.canDemoFulfill && request.fulfillmentStatus === 'ready' && <div className={styles.demoActions}><button type="button" className={styles.fulfillAction} disabled={busyKey === request.id} onClick={() => fulfill(request)}><Icon name="check" size={14} />Xác nhận đã trao</button></div>}
            </article>
          )) : <div className={styles.emptyState}><Icon name="wallet" size={22} /><div><strong>Chưa có yêu cầu quyền lợi</strong><p>Cosmetic được mở khóa trực tiếp; quyền lợi cần duyệt sẽ xuất hiện tại đây.</p></div></div>}
        </div>
      </section>

      {dashboard.permissions?.canFulfill && <section className={styles.requestsSection} aria-labelledby="tavern-keeper-title">
        <header className={styles.sectionHead}><div><span>Keeper station</span><h2 id="tavern-keeper-title">Bàn Tavern Keeper</h2></div><p>{dashboard.keeperQueue?.length || 0} phần thưởng chờ trao</p></header>
        <div className={styles.requestList}>
          {dashboard.keeperQueue?.length ? dashboard.keeperQueue.map((request) => (
            <article key={request.id}>
              <span className={styles.requestIcon}><Icon name="staff" size={17} /></span>
              <span><strong>{request.itemName}</strong><small>{request.requesterName} · {request.price} Gold</small><em>Checker đã duyệt. Hãy trao quyền lợi trước khi xác nhận.</em></span>
              <StatusBadge request={request} />
              <div className={styles.demoActions}><button type="button" className={styles.fulfillAction} disabled={busyKey === request.id} onClick={() => fulfill(request)}><Icon name="check" size={14} />Đã trao thưởng</button></div>
            </article>
          )) : <div className={styles.emptyState}><Icon name="check" size={22} /><div><strong>Bàn Keeper đã sạch</strong><p>Không có phần thưởng đã duyệt nào đang chờ trao.</p></div></div>}
        </div>
      </section>}

      <footer className={styles.guardrail}><Icon name="alert" size={16} /><p>Gold là cơ chế ghi nhận nội bộ, không thay thế tiền lương, ngày phép theo luật hoặc quyết định nhân sự. Quyền lợi thật chỉ được trao sau checker và policy công ty; biên nhận Tavern là append-only.</p></footer>
      <ConfirmRedemption item={confirmItem} busy={Boolean(busyKey)} onClose={() => !busyKey && setConfirmItem(null)} onConfirm={() => redeem(confirmItem)} />
    </div>
  );
}
