'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from './Icon';
import { Badge, Banner, Button, Panel, Segmented, SourcePill, StateView, Status } from './Primitives';
import styles from './realm-v2.module.css';

const LAYERS = [
  { value: 'companies', label: 'Công ty' },
  { value: 'projects', label: 'Dự án' },
  { value: 'incidents', label: 'Sự cố' },
  { value: 'finance', label: 'Tài chính' },
  { value: 'commands', label: 'Mệnh lệnh' },
];

const POSITION = {
  northwest: { left: '10%', top: '13%' },
  northeast: { right: '10%', top: '13%' },
  southwest: { left: '10%', bottom: '13%' },
  southeast: { right: '10%', bottom: '13%' },
  unknown: { left: 'calc(50% - 78px)', top: 'calc(50% - 42px)' },
};

async function jsonResponse(response, fallback) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || fallback);
    error.status = response.status;
    error.code = payload.code || 'source_unavailable';
    throw error;
  }
  return payload;
}

function useExecutiveSources() {
  const [state, setState] = useState({ loading: true, dashboard: null, world: null, commands: null, conversations: null, errors: {} });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true }));
    const sources = [
      ['dashboard', '/api/ceo/v1/dashboard?entity=all', 'Không thể tải CEO aggregate dashboard.'],
      ['world', '/api/ceo/v1/federation/world?entity=all', 'Không thể tải federation world.'],
      ['commands', '/api/ceo/v1/command-gateway?limit=50', 'Không thể tải command gateway.'],
      ['conversations', '/api/ceo/v1/messaging/conversations', 'Không thể tải CEO inbox.'],
    ];
    const results = await Promise.allSettled(sources.map(([, url, fallback]) => fetch(url, { cache: 'no-store' }).then((response) => jsonResponse(response, fallback))));
    setState((current) => {
      const next = { ...current, loading: false, errors: {} };
      results.forEach((result, index) => {
        const key = sources[index][0];
        if (result.status === 'fulfilled') next[key] = result.value;
        else next.errors[key] = result.reason;
      });
      return next;
    });
  }, []);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

function formatDate(value) {
  if (!value) return 'Chưa có';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function formatNumber(value) {
  if (value === null || value === undefined) return '—';
  return Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
}

function formatMoneyGroups(groups = []) {
  if (!groups.length) return 'Không có dữ liệu';
  return groups.map((item) => `${Number(item.value || 0).toLocaleString('vi-VN')} ${item.currency || ''}`.trim()).join(' · ');
}

function entityMoney(entity, field) {
  const finance = entity.snapshot?.domains?.finance;
  if (!finance || finance[field] === null || finance[field] === undefined) return '—';
  return `${Number(finance[field] || 0).toLocaleString('vi-VN')} ${entity.snapshot?.currency || ''}`.trim();
}

function freshnessTone(state) {
  if (state === 'fresh') return 'success';
  if (state === 'stale') return 'warning';
  return 'danger';
}

function freshnessLabel(state) {
  return ({ fresh: 'Mới', stale: 'Cũ nhưng còn dùng', expired: 'Hết hạn', missing: 'Thiếu snapshot', invalid: 'Snapshot lỗi', disabled: 'Đã tắt' })[state] || 'Không rõ';
}

function attention(entity) {
  const state = entity.freshness?.state;
  if (!entity.freshness?.available || !entity.snapshot) return { tone: 'danger', label: 'Nguồn không sẵn sàng', reason: freshnessLabel(state) };
  if (state === 'stale') return { tone: 'warning', label: 'Cần xác minh', reason: 'Snapshot stale' };
  if (Number(entity.sync?.consecutiveErrors || 0) > 0) return { tone: 'warning', label: 'Cần chú ý', reason: `${entity.sync.consecutiveErrors} lỗi đồng bộ liên tiếp` };
  const delivery = entity.snapshot.domains?.delivery;
  if (Number(delivery?.projectsLate || 0) + Number(delivery?.tasksOverdue || 0) > 0) return { tone: 'warning', label: 'Cần chú ý', reason: 'Có dự án hoặc công việc trễ' };
  if (Number(entity.snapshot.domains?.livestream?.pendingReconciliation || 0) > 0) return { tone: 'warning', label: 'Cần chú ý', reason: 'Có đối soát livestream đang chờ' };
  return { tone: 'success', label: 'Nguồn ổn định', reason: 'Không có ngoại lệ trong nguồn hiện có' };
}

function mergeEntities(dashboard, world, commands) {
  const map = new Map();
  for (const item of dashboard?.entities || []) map.set(item.id, { ...item, kingdom: null, deliveries: [] });
  for (const kingdom of world?.kingdoms || []) map.set(kingdom.id, { ...(map.get(kingdom.id) || { id: kingdom.id, displayName: kingdom.displayName }), kingdom, deliveries: map.get(kingdom.id)?.deliveries || [] });
  for (const delivery of commands?.deliveries || []) {
    const current = map.get(delivery.targetEntityId) || { id: delivery.targetEntityId, displayName: delivery.targetDisplayName, kingdom: null, deliveries: [] };
    map.set(delivery.targetEntityId, { ...current, deliveries: [...(current.deliveries || []), delivery] });
  }
  return [...map.values()];
}

function layerValue(entity, layer) {
  if (layer === 'projects') {
    const delivery = entity.snapshot?.domains?.delivery;
    return delivery ? `${formatNumber(delivery.projectsActive)} dự án · ${formatNumber(delivery.tasksOverdue)} việc trễ` : 'Nguồn Project chưa có';
  }
  if (layer === 'incidents') return 'Incident count chưa được contract expose';
  if (layer === 'finance') return entityMoney(entity, 'cashBalance') === '—' ? 'Nguồn tài chính chưa có' : `Cash ${entityMoney(entity, 'cashBalance')}`;
  if (layer === 'commands') {
    const pending = (entity.deliveries || []).filter((item) => !['delivered', 'rejected'].includes(item.status)).length;
    return `${pending} command chưa terminal`;
  }
  const online = entity.kingdom?.presence?.state === 'available' ? `${entity.kingdom.presence.online} online` : `Presence ${entity.kingdom?.presence?.state || 'chưa có'}`;
  return `${freshnessLabel(entity.freshness?.state)} · ${online}`;
}

function SourceFailureBanner({ errors, reload }) {
  const failed = Object.entries(errors || {});
  if (!failed.length) return null;
  return <Banner tone="warning" action={<Button variant="secondary" icon="refresh" onClick={reload}>Thử tải lại</Button>}>
    <strong>{failed.length} nguồn đang degrade độc lập.</strong> {failed.map(([key, error]) => `${key}: ${error.code || error.message}`).join(' · ')}. Dữ liệu còn lại vẫn chỉ đọc được.
  </Banner>;
}

function WorldMapScreen({ sources }) {
  const [layer, setLayer] = useState('companies');
  const entities = useMemo(() => mergeEntities(sources.dashboard, sources.world, sources.commands), [sources.dashboard, sources.world, sources.commands]);
  const [selectedId, setSelectedId] = useState(null);
  useEffect(() => { if (!selectedId && entities[0]) setSelectedId(entities[0].id); }, [entities, selectedId]);
  const selected = entities.find((item) => item.id === selectedId) || entities[0] || null;
  const needsAttention = entities.filter((item) => attention(item).tone !== 'success').length;

  if (sources.loading && !entities.length) return <StateView state="loading"/>;
  if (!sources.loading && !entities.length) return <><SourceFailureBanner errors={sources.errors} reload={sources.reload}/><StateView state="error"/></>;

  return <div className={styles.executiveScreen}>
    <SourceFailureBanner errors={sources.errors} reload={sources.reload}/>
    <div className={`${styles.grid} ${styles.grid4} ${styles.executiveMetrics}`}>
      <article className={styles.metric}><div className={styles.metricTop}><span>Công ty trong scope</span><span className={styles.metricIcon}><Icon name="map"/></span></div><strong className={styles.metricValue}>{entities.length}</strong><span className={styles.metricMeta}>Membership Director hiện tại</span></article>
      <article className={styles.metric}><div className={styles.metricTop}><span>Gateway khả dụng</span><span className={styles.metricIcon}><Icon name="link"/></span></div><strong className={styles.metricValue}>{sources.world?.summary?.gatewaysAvailable ?? '—'}</strong><span className={styles.metricMeta}>Federation world contract</span></article>
      <article className={styles.metric}><div className={styles.metricTop}><span>Presence tự nguyện</span><span className={styles.metricIcon}><Icon name="people"/></span></div><strong className={styles.metricValue}>{sources.world?.summary?.online ?? '—'}</strong><span className={styles.metricMeta}>Không phải dữ liệu năng suất</span></article>
      <article className={styles.metric}><div className={styles.metricTop}><span>Cần CEO chú ý</span><span className={styles.metricIcon}><Icon name="warning"/></span></div><strong className={styles.metricValue}>{needsAttention}</strong><span className={styles.metricMeta}>Rule-based UI attention · không phải điểm sức khỏe</span></article>
    </div>

    <Panel title="World Map" description="Bản đồ là một góc nhìn; bảng công ty phía dưới là phiên bản truy cập tương đương." actions={<Segmented label="Lớp dữ liệu bản đồ" options={LAYERS} value={layer} onChange={setLayer}/> }>
      <div className={styles.worldWorkspace}>
        <div className={styles.worldMapCanvas} aria-label={`Bản đồ federation, lớp ${LAYERS.find((item) => item.value === layer)?.label}`}>
          <span className={styles.worldRoute} data-route="horizontal" aria-hidden="true"/>
          <span className={styles.worldRoute} data-route="vertical" aria-hidden="true"/>
          <span className={styles.worldHub} aria-hidden="true"><Icon name="command" size={24}/></span>
          {entities.map((entity) => {
            const signal = attention(entity);
            return <button key={entity.id} type="button" className={styles.worldNode} data-tone={signal.tone} data-selected={selected?.id === entity.id || undefined} style={POSITION[entity.kingdom?.mapPosition] || POSITION.unknown} onClick={() => setSelectedId(entity.id)} aria-pressed={selected?.id === entity.id}>
              <span className={styles.worldNodeIcon}><Icon name={entity.id === 'egolive' ? 'chart' : 'brief'} size={18}/></span>
              <span className={styles.worldNodeCopy}><strong>{entity.displayName}</strong><small>{entity.kingdom?.realmName || entity.businessProfile || entity.id}</small><span>{layerValue(entity, layer)}</span></span>
              <span className={styles.worldNodeSignal} data-tone={signal.tone} aria-label={signal.label}/>
            </button>;
          })}
        </div>

        <aside className={styles.worldDetail} aria-live="polite">
          {selected ? <>
            <header><div><span className={styles.eyebrow}>Entity context</span><h2>{selected.displayName}</h2><p>{selected.kingdom?.realmName || selected.businessProfile || selected.id}</p></div><Status tone={attention(selected).tone}>{attention(selected).label}</Status></header>
            <dl className={styles.executiveDefinition}>
              <div><dt>Lý do</dt><dd>{attention(selected).reason}</dd></div>
              <div><dt>Snapshot</dt><dd>{freshnessLabel(selected.freshness?.state)}</dd></div>
              <div><dt>As-of</dt><dd>{formatDate(selected.provenance?.sourceAsOf || selected.kingdom?.source?.asOf)}</dd></div>
              <div><dt>Nguồn</dt><dd>{selected.provenance?.upstreamSource || (selected.kingdom ? 'Federation presence' : 'Chưa có')}</dd></div>
              <div><dt>Presence</dt><dd>{selected.kingdom?.presence?.state === 'available' ? `${selected.kingdom.presence.online} online / ${selected.kingdom.presence.optedInProfiles} opt-in` : selected.kingdom?.presence?.state || 'Chưa có'}</dd></div>
              <div><dt>Command</dt><dd>{selected.deliveries?.length || 0} delivery trong ledger</dd></div>
              <div><dt>Approval backlog</dt><dd>Chưa được CEO snapshot contract expose</dd></div>
              <div><dt>Incident count</dt><dd>Chưa được CEO snapshot contract expose</dd></div>
            </dl>
            <div className={styles.executiveActions}><Link className={styles.button} href="/ceo-world"><Icon name="link" size={16}/><span>Mở gateway chuẩn</span></Link><Link className={styles.button} data-variant="secondary" href={selected.kingdom?.chat?.href || `/ceo-inbox?entity=${encodeURIComponent(selected.id)}`}><Icon name="chat" size={16}/><span>Mở CEO Inbox</span></Link></div>
          </> : null}
        </aside>
      </div>
    </Panel>

    <Panel title="Danh sách công ty tương đương" description="Mọi trạng thái trên bản đồ đều có mặt trong cấu trúc bảng có thể đọc bằng bàn phím và screen reader.">
      <div className={styles.tableWrap} data-responsive="cards"><table className={styles.table}><thead><tr><th>Công ty</th><th>Chú ý UI</th><th>Snapshot</th><th>Presence</th><th>Lớp đang xem</th><th>As-of</th></tr></thead><tbody>{entities.map((entity) => {
        const signal = attention(entity);
        return <tr key={entity.id}><td data-label="Công ty"><button className={styles.tableEntityButton} type="button" onClick={() => setSelectedId(entity.id)}><strong>{entity.displayName}</strong><small>{entity.id}</small></button></td><td data-label="Chú ý UI"><Status tone={signal.tone}>{signal.label}</Status><small>{signal.reason}</small></td><td data-label="Snapshot"><Badge tone={freshnessTone(entity.freshness?.state)}>{freshnessLabel(entity.freshness?.state)}</Badge></td><td data-label="Presence">{entity.kingdom?.presence?.state === 'available' ? `${entity.kingdom.presence.online} online` : entity.kingdom?.presence?.state || '—'}</td><td data-label="Lớp đang xem"><strong>{layerValue(entity, layer)}</strong></td><td data-label="As-of">{formatDate(entity.provenance?.sourceAsOf || entity.kingdom?.source?.asOf)}</td></tr>;
      })}</tbody></table></div>
    </Panel>
    <div className={styles.sourceRow}><SourcePill source="CEO federation world + validated aggregate cache" freshness={formatDate(sources.dashboard?.asOf || sources.world?.asOf)}/><span>Presence không dùng để chấm năng suất; map không lưu business record.</span></div>
  </div>;
}

function decisionSignals(entities, commands) {
  const rows = [];
  for (const entity of entities) {
    const signal = attention(entity);
    if (signal.tone !== 'success') rows.push({ id: `entity-${entity.id}`, tone: signal.tone, title: entity.displayName, detail: signal.reason, href: `/ceo-overview?entity=${encodeURIComponent(entity.id)}` });
    const delivery = entity.snapshot?.domains?.delivery;
    if (Number(delivery?.projectsLate || 0) > 0) rows.push({ id: `late-${entity.id}`, tone: 'warning', title: `${entity.displayName}: ${delivery.projectsLate} dự án trễ`, detail: `${delivery.tasksOverdue || 0} Task quá hạn trong snapshot`, href: '/ceo-overview' });
    const live = entity.snapshot?.domains?.livestream;
    if (Number(live?.pendingReconciliation || 0) > 0) rows.push({ id: `live-${entity.id}`, tone: 'warning', title: `${entity.displayName}: đối soát đang chờ`, detail: `${live.pendingReconciliation} phiên/record chờ đối soát`, href: '/ceo-overview' });
  }
  for (const delivery of commands?.deliveries || []) {
    if (!['delivered', 'rejected'].includes(delivery.status)) rows.push({ id: `command-${delivery.id}`, tone: delivery.status === 'failed' ? 'danger' : 'warning', title: `${delivery.targetDisplayName}: command ${delivery.status}`, detail: `${delivery.action} · ${delivery.lastErrorCode || 'chưa có receipt terminal'}`, href: '/ceo-commands' });
  }
  return rows.slice(0, 8);
}

function metricCard(label, value, meta, icon = 'chart') {
  return <article className={styles.metric}><div className={styles.metricTop}><span>{label}</span><span className={styles.metricIcon}><Icon name={icon}/></span></div><strong className={styles.metricValue}>{value}</strong><span className={styles.metricMeta}>{meta}</span></article>;
}

function CeoTerminalScreen({ sources }) {
  const entities = useMemo(() => mergeEntities(sources.dashboard, sources.world, sources.commands), [sources.dashboard, sources.world, sources.commands]);
  const dashboard = sources.dashboard;
  const portfolio = dashboard?.portfolio || {};
  const decisions = useMemo(() => decisionSignals(entities, sources.commands), [entities, sources.commands]);
  const conversations = sources.conversations?.conversations || [];
  const asOf = formatDate(dashboard?.asOf);

  if (sources.loading && !dashboard) return <StateView state="loading"/>;
  if (!sources.loading && !dashboard) return <><SourceFailureBanner errors={sources.errors} reload={sources.reload}/><StateView state="error"/></>;

  return <div className={styles.executiveScreen}>
    <SourceFailureBanner errors={sources.errors} reload={sources.reload}/>
    <div className={styles.executivePriority}>
      <Panel title="Executive brief" description="Tóm tắt rule-based từ snapshot hiện có; không phải AI fact và không thay quyết định của CEO.">
        <div className={styles.briefList}>
          <article><span className={styles.briefIcon}><Icon name={dashboard.health?.unavailable ? 'warning' : 'check'}/></span><div><strong>{dashboard.health?.available || 0}/{dashboard.health?.registered || 0} công ty có snapshot dùng được</strong><p>{dashboard.health?.stale || 0} stale · {dashboard.health?.unavailable || 0} unavailable. Snapshot hết hạn không được đưa vào tổng.</p></div></article>
          <article><span className={styles.briefIcon}><Icon name="folder"/></span><div><strong>{portfolio.delivery?.projectsLate || 0} dự án trễ · {portfolio.delivery?.tasksOverdue || 0} Task quá hạn</strong><p>Dữ liệu đóng góp từ {portfolio.delivery?.entitiesContributing || 0} entity; đây là delivery state, không phải điểm nhân sự.</p></div></article>
          <article><span className={styles.briefIcon}><Icon name="cash"/></span><div><strong>GMV, cash revenue và cash balance được tách riêng</strong><p>Recognized revenue, accounting profit, approval backlog và capacity chưa được contract expose nên không được suy đoán.</p></div></article>
        </div>
      </Panel>
      <Panel title="Quyết định khẩn" description="Ngoại lệ deterministic từ freshness, delivery, reconciliation và command receipt.">
        <div className={styles.decisionList}>{decisions.length ? decisions.map((item) => <Link className={styles.decisionItem} href={item.href} key={item.id}><span className={styles.decisionIcon} data-tone={item.tone}><Icon name={item.tone === 'danger' ? 'warning' : 'bolt'} size={17}/></span><span><strong>{item.title}</strong><small>{item.detail}</small></span><Icon name="chevron" size={16}/></Link>) : <div className={styles.canonicalEmpty}><Icon name="check"/><strong>Không có ngoại lệ trong nguồn hiện có</strong><span>Điều này không khẳng định toàn hệ thống không có rủi ro.</span></div>}</div>
      </Panel>
    </div>

    <div className={`${styles.grid} ${styles.grid4} ${styles.executiveMetrics}`}>
      {metricCard('Cash balance', formatMoneyGroups(portfolio.finance?.cashBalanceByCurrency), `${portfolio.finance?.entitiesContributing || 0} nguồn · as-of ${asOf}`, 'cash')}
      {metricCard('Cash revenue', formatMoneyGroups(portfolio.finance?.revenueCashByCurrency), 'Không phải recognized revenue', 'chart')}
      {metricCard('Cash expense', formatMoneyGroups(portfolio.finance?.expenseCashByCurrency), 'Cash ledger · không phải accounting profit', 'cash')}
      {metricCard('Delivery', `${formatNumber(portfolio.delivery?.projectsActive)} dự án`, `${formatNumber(portfolio.delivery?.projectsLate)} trễ · ${formatNumber(portfolio.delivery?.tasksOverdue)} Task quá hạn`, 'folder')}
      {metricCard('Active headcount', formatNumber(portfolio.people?.activeHeadcount), 'Không suy ra capacity hoặc xếp hạng', 'people')}
      {metricCard('Egolive GMV', formatMoneyGroups(portfolio.livestream?.gmvByCurrency), 'GMV không phải revenue', 'chart')}
      {metricCard('Net received', formatMoneyGroups(portfolio.livestream?.netReceivedByCurrency), `${formatNumber(portfolio.livestream?.pendingReconciliation)} chờ đối soát`, 'cash')}
      {metricCard('Approval backlog', 'Chưa expose', 'Không dùng command count thay approval', 'approval')}
    </div>

    <Panel title="So sánh công ty" description="Cùng một vocabulary nguồn; tiền tệ giữ nguyên và không tự quy đổi.">
      <div className={styles.tableWrap} data-responsive="cards"><table className={styles.table}><thead><tr><th>Công ty</th><th>Freshness</th><th>Cash balance</th><th>Pipeline</th><th>Dự án / trễ</th><th>AR / AP</th><th>Nguồn</th></tr></thead><tbody>{entities.map((entity) => {
        const domains = entity.snapshot?.domains || {};
        return <tr key={entity.id}><td data-label="Công ty"><strong>{entity.displayName}</strong><small>{entity.businessProfile || entity.id}</small></td><td data-label="Freshness"><Status tone={freshnessTone(entity.freshness?.state)}>{freshnessLabel(entity.freshness?.state)}</Status></td><td data-label="Cash balance"><strong>{entityMoney(entity, 'cashBalance')}</strong></td><td data-label="Pipeline">{domains.crm ? `${formatNumber(domains.crm.pipelineValue)} ${entity.snapshot?.currency || ''}` : '—'}</td><td data-label="Dự án / trễ">{domains.delivery ? `${domains.delivery.projectsActive || 0} / ${domains.delivery.projectsLate || 0}` : '—'}</td><td data-label="AR / AP">{domains.finance ? `${entityMoney(entity, 'accountsReceivable')} / ${entityMoney(entity, 'accountsPayable')}` : '—'}</td><td data-label="Nguồn"><small>{entity.provenance?.upstreamSource || 'Không có snapshot'}<br/>{formatDate(entity.provenance?.sourceAsOf)}</small></td></tr>;
      })}</tbody></table></div>
    </Panel>

    <div className={styles.executiveLowerGrid}>
      <Panel title="CEO Inbox" description="Conversation cache đã cấp quyền; mở ERP Inbox để đọc hoặc gửi.">
        <div className={styles.executiveList}>{conversations.length ? conversations.slice(0, 5).map((item) => <Link href={`/ceo-inbox?entity=${encodeURIComponent(item.targetEntityId)}`} key={item.id}><span className={styles.executiveListIcon}><Icon name="chat" size={16}/></span><span><strong>{item.name || item.targetDisplayName}</strong><small>{item.lastMessage?.senderName || 'Chưa có message'} · {formatDate(item.lastMessageAt || item.createdAt)}</small></span><Status tone={item.status === 'active' ? 'success' : 'neutral'}>{item.status}</Status></Link>) : <div className={styles.canonicalEmpty}><Icon name="inbox"/><strong>{sources.errors?.conversations ? 'CEO Inbox đang degrade' : 'Chưa có conversation'}</strong><span>{sources.errors?.conversations ? 'Mở CEO Inbox chuẩn để kiểm tra session hoặc scope.' : 'Không tạo fixture trên product route.'}</span></div>}</div>
        <Link className={styles.textLink} href="/ceo-inbox"><Icon name="arrow" size={15}/><span>Mở CEO Inbox chuẩn</span></Link>
      </Panel>
      <Panel title="Command gateway" description="Quick link chỉ mở workflow chuẩn; terminal không tự dispatch command.">
        <div className={styles.commandGatewaySummary}><strong>{sources.commands?.deliveries?.length ?? '—'}</strong><span>delivery gần nhất</span><p>{(sources.commands?.deliveries || []).filter((item) => item.status === 'delivered').length} đã có receipt terminal · {(sources.commands?.deliveries || []).filter((item) => item.status === 'pending_confirmation').length} chờ xác nhận</p></div>
        <div className={styles.executiveActions}><Link className={styles.button} href="/realm-v2/command-center"><Icon name="command" size={16}/><span>Mở Command Center</span></Link><Link className={styles.button} data-variant="secondary" href="/ceo-commands"><Icon name="receipt" size={16}/><span>Mở delivery ledger</span></Link></div>
      </Panel>
      <Panel title="System health & source freshness" description="Tình trạng contract, cache và sync; không che lỗi bằng dữ liệu giả.">
        <dl className={styles.executiveDefinition}>
          <div><dt>Aggregate</dt><dd>{dashboard.health?.fresh || 0} fresh · {dashboard.health?.stale || 0} stale · {dashboard.health?.unavailable || 0} unavailable</dd></div>
          <div><dt>Currency</dt><dd>Grouped · không tự quy đổi</dd></div>
          <div><dt>Expired</dt><dd>Không đưa vào tổng</dd></div>
          <div><dt>Confidence</dt><dd>{dashboard.health?.available === dashboard.health?.registered ? 'Đủ nguồn đã đăng ký' : 'Một phần nguồn khả dụng'}</dd></div>
          <div><dt>As-of</dt><dd>{asOf}</dd></div>
          <div><dt>Contract</dt><dd>{dashboard.contract} · v{dashboard.dashboardVersion}</dd></div>
        </dl>
      </Panel>
      <Panel title="Khoảng trống được công khai" description="Không thay thế dữ liệu thiếu bằng proxy dễ gây hiểu sai.">
        <div className={styles.gapList}><span><Icon name="warning" size={15}/> Recognized revenue chưa expose</span><span><Icon name="warning" size={15}/> Accounting profit chưa expose</span><span><Icon name="warning" size={15}/> Capacity chưa expose</span><span><Icon name="warning" size={15}/> Approval backlog chưa expose</span><span><Icon name="warning" size={15}/> Incident registry chưa expose</span><span><Icon name="warning" size={15}/> Forecast chưa expose</span></div>
      </Panel>
    </div>
    <div className={styles.sourceRow}><SourcePill source="RepositoryRealms CEO dashboard" freshness={`as-of ${asOf}`}/><span>Read-only composition; mọi business action đi qua authorization, business rules, receipt và audit chuẩn.</span></div>
  </div>;
}

export default function CanonicalRealmExecutiveScreen({ slug }) {
  const sources = useExecutiveSources();
  return slug === 'ceo-terminal' ? <CeoTerminalScreen sources={sources}/> : <WorldMapScreen sources={sources}/>;
}
