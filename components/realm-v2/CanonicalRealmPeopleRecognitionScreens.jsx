'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon';
import { Badge, Banner, Button, Field, Panel, Segmented, SourcePill, StateView, Status } from './Primitives';
import styles from './realm-v2.module.css';

const PROFILE_TABS = [
  ['overview', 'Tổng quan'], ['work', 'Công việc'], ['skills', 'Kỹ năng'], ['projects', 'Dự án'],
  ['recognition', 'Ghi nhận'], ['chronicle', 'Chronicle'], ['preferences', 'Tùy chọn'],
].map(([value, label]) => ({ value, label }));

const AVAILABILITY = {
  available: ['Sẵn sàng', 'success'], busy: ['Đang bận', 'warning'], focus: ['Tập trung', 'info'],
  dnd: ['Không làm phiền', 'danger'], away: ['Tạm vắng', 'warning'], offline: ['Ngoại tuyến', 'neutral'],
};

const STATUS_COPY = {
  posted: ['Đã ghi sổ', 'success'], 'correction-posted': ['Bút toán điều chỉnh', 'warning'],
  reserved: ['Đang giữ chỗ', 'info'], released: ['Đã hoàn giữ chỗ', 'neutral'],
};

function initials(name) {
  return String(name || 'U').trim().split(/\s+/).map((part) => part[0]).slice(-2).join('').toUpperCase();
}

function formatDate(value, withTime = false) {
  if (!value) return 'Chưa có';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Chưa có';
  return new Intl.DateTimeFormat('vi-VN', withTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function statusFor(value) {
  return STATUS_COPY[value] || [value || 'Chưa rõ', 'neutral'];
}

function useProfileRecognitionSource() {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ loading: true, payload: null, error: null });
  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: null }));
    fetch('/api/realm-v2/profile-recognition', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw Object.assign(new Error(payload.error || 'Không thể tải hồ sơ.'), { status: response.status, code: payload.code });
        return payload;
      })
      .then((payload) => setState({ loading: false, payload, error: null }))
      .catch((error) => {
        if (error.name !== 'AbortError') setState((current) => ({ ...current, loading: false, error }));
      });
    return () => controller.abort();
  }, [revision]);
  return { ...state, reload: () => setRevision((value) => value + 1) };
}

function ProfileAvatar({ identity }) {
  const [imageFailed, setImageFailed] = useState(false);
  return <span className={styles.peopleAvatar} style={{ '--profile-color': identity.realmColor }}>
    {!imageFailed && <img src={identity.avatarHref} alt="" onError={() => setImageFailed(true)}/>} 
    {imageFailed && <strong>{initials(identity.preferredName)}</strong>}
  </span>;
}

function TaskFocus({ label, task, empty }) {
  return <article className={styles.peopleFocusCard}>
    <span className={styles.peopleCardLabel}>{label}</span>
    {task ? <>
      <h3>{task.title}</h3>
      <div className={styles.objectMeta}>
        <span><Icon name="folder" size={14}/>{task.project?.name || 'Không thuộc dự án'}</span>
        <span><Icon name="calendar" size={14}/>{task.dueDate ? formatDate(task.dueDate) : 'Không có hạn'}</span>
      </div>
      <Link className={styles.inlineLink} href={task.href}>Mở Task ERP <Icon name="arrow" size={14}/></Link>
    </> : <div className={styles.peopleCompactEmpty}><Icon name="check"/><span>{empty}</span></div>}
  </article>;
}

function ProfileOverview({ payload }) {
  const { profile, recognition, links } = payload;
  return <div className={styles.peopleOverviewGrid}>
    <div className={styles.peopleOverviewMain}>
      <div className={styles.grid2}>
        <TaskFocus label="Công việc hiện tại" task={profile.currentWork} empty="Không có Task đang thực hiện."/>
        <TaskFocus label="Ưu tiên tiếp theo" task={profile.nextWork} empty="Hàng đợi cá nhân đang trống."/>
      </div>
      <Panel title="Dự án đang tham gia" description="Chỉ các Project có Task mở được giao cho bạn.">
        {profile.activeProjects.length ? <div className={styles.peopleProjectList}>{profile.activeProjects.map((project) => <Link href={project.href} key={project.id}><span className={styles.listIcon}><Icon name="folder"/></span><span className={styles.listCopy}><strong>{project.name}</strong><span>{project.status} · {project.progress}% tiến độ Project</span></span><Icon name="chevron" size={15}/></Link>)}</div> : <div className={styles.peopleCompactEmpty}><Icon name="folder"/><span>Không có Project đang hoạt động trong phạm vi của bạn.</span></div>}
      </Panel>
      <Panel title="Đóng góp gần đây" description="Task ERP đã hoàn tất; không phải bảng xếp hạng nhân sự.">
        {profile.contributions.length ? <div className={styles.peopleContributionList}>{profile.contributions.map((item) => <Link href={item.href} key={item.id}><span><strong>{item.title}</strong><small>{item.project?.name || 'Công việc nội bộ'} · hoàn tất {formatDate(item.completedAt || item.updatedAt)}</small></span><Icon name="chevron" size={15}/></Link>)}</div> : <div className={styles.peopleCompactEmpty}><Icon name="timeline"/><span>Chưa có Task hoàn tất trong dữ liệu hiện tại.</span></div>}
      </Panel>
    </div>
    <aside className={styles.peopleOverviewAside}>
      <Panel title="Kỹ năng & bằng chứng" description="Kỹ năng tự khai không trở thành chỉ số RPG.">
        {profile.skills.length ? <div className={styles.skillList}>{profile.skills.map((skill) => <div className={styles.skillRow} key={skill.name}><span><strong>{skill.name}</strong><small>Chưa liên kết bằng chứng</small></span><Status tone="warning">Cần bằng chứng</Status></div>)}</div> : <div className={styles.peopleCompactEmpty}><Icon name="person"/><span>ERP chưa có kỹ năng nào được khai báo.</span></div>}
      </Panel>
      <Panel title="Ghi nhận 12 tháng" description="Gold là đơn vị ghi nhận, không phải lương hoặc điểm năng suất.">
        <div className={styles.peopleRecognitionMini}><strong>{recognition.summary.balance} Gold</strong><span>Số dư từ sổ append-only</span><Link className={styles.inlineLink} href="/realm-v2/recognition">Mở sổ ghi nhận <Icon name="arrow" size={14}/></Link></div>
      </Panel>
      <Panel title="Quyền riêng tư hồ sơ">
        <div className={styles.policyTests}>
          <span><Icon name="lock" size={15}/> Liên hệ: chỉ chính chủ</span>
          <span><Icon name="eyeOff" size={15}/> Lương, review và ghi chú nhạy cảm bị loại trừ</span>
          <span><Icon name="check" size={15}/> Công việc theo đúng ERP authorization</span>
        </div>
        <Link className={styles.inlineLink} href={links.settings}>Mở cài đặt ERP <Icon name="arrow" size={14}/></Link>
      </Panel>
    </aside>
  </div>;
}

function ProfileTabContent({ tab, payload }) {
  const { profile, recognition, links } = payload;
  if (tab === 'overview') return <ProfileOverview payload={payload}/>;
  if (tab === 'work') return <Panel title="Công việc của bạn" description="Task nguồn vẫn được mở và cập nhật tại ERP."><div className={styles.grid2}><TaskFocus label="Đang làm" task={profile.currentWork} empty="Không có Task đang làm."/><TaskFocus label="Tiếp theo" task={profile.nextWork} empty="Không có Task kế tiếp."/></div><div className={styles.sourceRow}><SourcePill source="Task ERP" freshness={`${profile.openWorkCount} việc mở`}/><Link className={styles.inlineLink} href={links.tasks}>Mở toàn bộ Task ERP</Link></div></Panel>;
  if (tab === 'skills') return <Panel title="Kỹ năng" description="Chỉ hiển thị kỹ năng tự khai; chưa có evidence contract nên không chấm mức độ thành thạo.">{profile.skills.length ? <div className={styles.skillList}>{profile.skills.map((skill) => <div className={styles.skillRow} key={skill.name}><span><strong>{skill.name}</strong><small>Evidence link chưa được ERP cung cấp</small></span><Status tone="warning">Chưa xác minh</Status></div>)}</div> : <StateView state="empty" compact/>}</Panel>;
  if (tab === 'projects') return <Panel title="Dự án đang tham gia">{profile.activeProjects.length ? <div className={styles.peopleProjectList}>{profile.activeProjects.map((project) => <Link href={project.href} key={project.id}><span className={styles.listIcon}><Icon name="folder"/></span><span className={styles.listCopy}><strong>{project.name}</strong><span>{project.status} · {project.progress}%</span></span><Icon name="chevron" size={15}/></Link>)}</div> : <StateView state="empty" compact/>}</Panel>;
  if (tab === 'recognition') return <Panel title="Ghi nhận cá nhân" description="Mở ledger đầy đủ để xem policy, nguồn, receipt và bút toán điều chỉnh."><div className={styles.peopleRecognitionMini}><strong>{recognition.summary.balance} Gold</strong><span>{recognition.summary.receivedThisPeriod} nhận trong kỳ {recognition.period}</span><Link className={styles.button} href="/realm-v2/recognition"><Icon name="ledger" size={16}/><span>Mở Recognition Ledger</span></Link></div></Panel>;
  if (tab === 'chronicle') return <Panel title="Chronicle cá nhân" description="Sổ thay đổi cá nhân chuẩn vẫn ở Realm hiện tại."><Link className={styles.button} data-variant="secondary" href={links.chronicle}><Icon name="timeline" size={16}/><span>Mở Chronicle chuẩn</span></Link></Panel>;
  return <Panel title="Tùy chọn & cộng tác" description="Thay đổi thiết lập tại ERP để giữ một nguồn cấu hình."><dl className={styles.peopleDefinition}><div><dt>Workspace mặc định</dt><dd>{profile.preferences.workspace}</dd></div><div><dt>Presence</dt><dd>Người dùng kiểm soát</dd></div><div><dt>Phạm vi công việc</dt><dd>ERP authorization</dd></div></dl><Link className={styles.button} data-variant="secondary" href={links.settings}><Icon name="settings" size={16}/><span>Mở cài đặt ERP</span></Link></Panel>;
}

function EmployeeProfile({ source }) {
  const [tab, setTab] = useState('overview');
  if (source.loading && !source.payload) return <Panel><StateView state="loading"/></Panel>;
  if (!source.payload) return <Panel title={source.error?.status === 403 ? 'Hồ sơ bị giới hạn' : 'Không thể tải hồ sơ nhân sự'}><div className={styles.canonicalState}><StateView state={source.error?.status === 403 ? 'permission-denied' : 'error'}/><Button variant="secondary" icon="refresh" onClick={source.reload}>Tải lại an toàn</Button></div></Panel>;
  const { identity, links, privacy } = source.payload;
  const [availabilityLabel, availabilityTone] = AVAILABILITY[identity.availability.state] || [identity.availability.state, 'neutral'];
  return <div className={styles.peopleScreen}>
    <Banner>Hồ sơ này tự-scope theo phiên đăng nhập. Không tải lương, đánh giá, manager note hoặc dữ liệu theo dõi ẩn.</Banner>
    <section className={styles.peopleHero}>
      <ProfileAvatar identity={identity}/>
      <div className={styles.peopleIdentity}>
        <span className={styles.eyebrow}>Employee Profile · ERP canonical</span>
        <h2>{identity.preferredName}</h2>
        <p>{identity.title} · {identity.team?.name || 'Chưa gán nhóm'} · {identity.company}</p>
        <div className={styles.peopleMeta}><Status tone={availabilityTone}>{availabilityLabel}</Status><Badge>{identity.realmClass}</Badge><Badge>Self view</Badge></div>
      </div>
      <div className={styles.peopleHeroActions}>
        <Link className={styles.button} href={links.messages}><Icon name="chat" size={16}/><span>Nhắn tin</span></Link>
        <Link className={styles.button} data-variant="secondary" href={links.calendar}><Icon name="calendar" size={16}/><span>Xem lịch</span></Link>
        <Link className={styles.button} data-variant="secondary" href={links.canonicalProfile}><Icon name="link" size={16}/><span>Hồ sơ ERP</span></Link>
      </div>
      <dl className={styles.peopleIdentityFacts}>
        <div><dt>Email</dt><dd>{identity.email}</dd></div><div><dt>Điện thoại</dt><dd>{identity.phone || 'Chưa chia sẻ'}</dd></div>
        <div><dt>Múi giờ</dt><dd>{identity.timeZone || 'ERP chưa lưu'}</dd></div><div><dt>Thành viên từ</dt><dd>{formatDate(identity.memberSince)}</dd></div>
      </dl>
    </section>
    <div className={`${styles.canonicalFilters} ${styles.peopleTabs}`}><Segmented label="Các phần trong hồ sơ nhân sự" options={PROFILE_TABS} value={tab} onChange={setTab}/></div>
    <ProfileTabContent tab={tab} payload={source.payload}/>
    <div className={styles.sourceRow}><SourcePill source="User, Task, Project và RealmGoldEntry ERP" freshness={`as-of ${formatDate(source.payload.generatedAt, true)}`}/><span>Scope {privacy.scope}; không có ranking hoặc suy luận cảm xúc.</span></div>
  </div>;
}

function downloadLedger(rows, period) {
  const safe = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const header = ['date', 'from', 'to', 'reason', 'source_type', 'source_id', 'approver', 'amount', 'receipt', 'status'];
  const lines = rows.map((row) => [row.date, row.from?.name, row.to?.name, row.reason, row.source.type, row.source.id, row.approver?.name, row.amount, row.receipt.id, row.status].map(safe).join(','));
  const blob = new Blob([`\ufeff${header.join(',')}\n${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `recognition-ledger-${period}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function LedgerDetail({ entry }) {
  if (!entry) return <div className={styles.peopleCompactEmpty}><Icon name="receipt"/><span>Chọn một bút toán để xem receipt và bằng chứng nguồn.</span></div>;
  const [label, tone] = statusFor(entry.status);
  return <div className={styles.ledgerDetail}>
    <header><span className={styles.listIcon}><Icon name="receipt"/></span><div><span className={styles.eyebrow}>Canonical receipt</span><h3>{entry.reason}</h3></div><Status tone={tone}>{label}</Status></header>
    <dl className={styles.peopleDefinition}>
      <div><dt>Ngày ghi sổ</dt><dd>{formatDate(entry.date, true)}</dd></div>
      <div><dt>Từ / Đến</dt><dd>{entry.from.name} → {entry.to.name}</dd></div>
      <div><dt>Nguồn</dt><dd>{entry.source.type} / {entry.source.id}</dd></div>
      <div><dt>Người duyệt</dt><dd>{entry.approver?.name || 'Entry không expose approver'}</dd></div>
      <div><dt>Policy</dt><dd>{entry.policy.period} · {entry.policy.status}</dd></div>
      <div><dt>Gold</dt><dd className={entry.amount < 0 ? styles.ledgerNegative : styles.ledgerPositive}>{entry.amount > 0 ? '+' : ''}{entry.amount}</dd></div>
    </dl>
    {entry.contribution ? <Link className={styles.button} data-variant="secondary" href={entry.contribution.href}><Icon name="link" size={16}/><span>Mở contribution ERP</span></Link> : <Banner tone="warning">Bút toán này không có Task nguồn được endpoint expose; không tự suy đoán bằng chứng.</Banner>}
    <div className={styles.receipt}><div className={styles.receiptHead}><Icon name="check" size={16}/><strong>Receipt đã ghi</strong></div><code className={styles.receiptCode}>{entry.receipt.id}</code>{entry.compensatingCorrection && <span>Bút toán điều chỉnh giữ nguyên lịch sử; entry cũ không bị sửa hoặc xóa.</span>}</div>
  </div>;
}

function RecognitionLedger({ source }) {
  const [filters, setFilters] = useState({ period: 'all', type: 'all', status: 'all', source: 'all', query: '' });
  const [selectedId, setSelectedId] = useState(null);
  const rows = source.payload?.recognition?.ledger || [];
  const filtered = useMemo(() => rows.filter((row) => {
    const isCurrentPeriod = row.date.slice(0, 7) === source.payload.recognition.period;
    if (filters.period === 'current' && !isCurrentPeriod) return false;
    if (filters.type !== 'all' && row.type !== filters.type) return false;
    if (filters.status !== 'all' && row.status !== filters.status) return false;
    if (filters.source !== 'all' && row.source.type !== filters.source) return false;
    const haystack = `${row.reason} ${row.source.id} ${row.contribution?.title || ''} ${row.project?.name || ''} ${row.receipt.id}`.toLowerCase();
    return haystack.includes(filters.query.trim().toLowerCase());
  }), [filters, rows, source.payload]);
  const selected = filtered.find((row) => row.id === selectedId) || filtered[0] || null;

  if (source.loading && !source.payload) return <Panel><StateView state="loading"/></Panel>;
  if (!source.payload) return <Panel title={source.error?.status === 403 ? 'Sổ ghi nhận bị giới hạn' : 'Không thể tải Recognition Ledger'}><div className={styles.canonicalState}><StateView state={source.error?.status === 403 ? 'permission-denied' : 'error'}/><Button variant="secondary" icon="refresh" onClick={source.reload}>Tải lại an toàn</Button></div></Panel>;
  const { recognition, links } = source.payload;
  return <div className={styles.peopleScreen}>
    <Banner tone="warning"><strong>Gold là đơn vị ghi nhận đóng góp.</strong> Màn hình này không đổi lương, phép, cấp bậc hay thứ hạng nhân sự.</Banner>
    <div className={`${styles.grid} ${styles.grid4} ${styles.recognitionMetrics}`}>
      <article className={styles.metric}><div className={styles.metricTop}><span>Số dư hiện tại</span><span className={styles.metricIcon}><Icon name="cash"/></span></div><strong className={styles.metricValue}>{recognition.summary.balance} G</strong><span className={styles.metricMeta}>Toàn bộ ledger của chính bạn</span></article>
      <article className={styles.metric}><div className={styles.metricTop}><span>Nhận trong kỳ</span><span className={styles.metricIcon}><Icon name="plus"/></span></div><strong className={styles.metricValue}>{recognition.summary.receivedThisPeriod} G</strong><span className={styles.metricMeta}>{recognition.period}</span></article>
      <article className={styles.metric}><div className={styles.metricTop}><span>Hạn mức policy cá nhân</span><span className={styles.metricIcon}><Icon name="approval"/></span></div><strong className={styles.metricValue}>{recognition.summary.personalPolicyCap} G</strong><span className={styles.metricMeta}>{recognition.policy.status}</span></article>
      <article className={styles.metric}><div className={styles.metricTop}><span>Còn trong policy</span><span className={styles.metricIcon}><Icon name="ledger"/></span></div><strong className={styles.metricValue}>{recognition.summary.personalPolicyRemaining} G</strong><span className={styles.metricMeta}>Không phải ngân sách cá nhân để tự phát hành</span></article>
    </div>
    <Panel title="Bộ lọc sổ ghi nhận" description="Lọc cục bộ trên dữ liệu đã được server tự-scope." actions={<Button variant="secondary" icon="receipt" onClick={() => downloadLedger(filtered, recognition.period)}>Xuất CSV</Button>}>
      <div className={styles.ledgerFilters}>
        <Field label="Thời gian"><select className={styles.select} value={filters.period} onChange={(event) => setFilters({ ...filters, period: event.target.value })}><option value="all">Tất cả</option><option value="current">Kỳ hiện tại</option></select></Field>
        <Field label="Hoạt động"><select className={styles.select} value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}><option value="all">Tất cả</option><option value="quest_reward">Quest reward</option><option value="adjustment">Điều chỉnh</option><option value="shop_spend">Chi tiêu</option><option value="redemption_hold">Giữ chỗ</option><option value="redemption_release">Hoàn giữ chỗ</option></select></Field>
        <Field label="Trạng thái"><select className={styles.select} value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="all">Tất cả</option><option value="posted">Đã ghi sổ</option><option value="correction-posted">Điều chỉnh</option><option value="reserved">Giữ chỗ</option><option value="released">Đã hoàn</option></select></Field>
        <Field label="Nguồn"><select className={styles.select} value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value })}><option value="all">Tất cả</option>{[...new Set(rows.map((row) => row.source.type))].map((type) => <option value={type} key={type}>{type}</option>)}</select></Field>
        <Field label="Tìm kiếm"><input className={styles.input} type="search" value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} placeholder="Lý do, nguồn hoặc receipt…"/></Field>
      </div>
    </Panel>
    <div className={styles.ledgerWorkspace}>
      <Panel title={`Bút toán (${filtered.length})`} description="Append-only; mọi sửa sai phải là một compensating entry mới.">
        {filtered.length ? <div className={styles.tableWrap} data-responsive="cards"><table className={styles.table}><thead><tr><th>Ngày</th><th>Từ / Đến</th><th>Lý do & đóng góp</th><th>Nguồn</th><th>Người duyệt</th><th>Gold</th><th>Receipt</th></tr></thead><tbody>{filtered.map((entry) => {
          const [label, tone] = statusFor(entry.status);
          return <tr key={entry.id} data-selected={selected?.id === entry.id || undefined}>
            <td data-label="Ngày">{formatDate(entry.date)}</td>
            <td data-label="Từ / Đến"><strong>{entry.from.name}</strong><small>→ {entry.to.name}</small></td>
            <td data-label="Lý do"><strong>{entry.reason}</strong><small>{entry.contribution?.title || entry.project?.name || 'Không có Task nguồn'}</small></td>
            <td data-label="Nguồn"><strong>{entry.source.type}</strong><small>{entry.source.id}</small></td>
            <td data-label="Người duyệt">{entry.approver?.name || 'Không expose'}</td>
            <td data-label="Gold"><strong className={entry.amount < 0 ? styles.ledgerNegative : styles.ledgerPositive}>{entry.amount > 0 ? '+' : ''}{entry.amount} G</strong></td>
            <td data-label="Receipt"><button type="button" className={styles.ledgerReceiptButton} onClick={() => setSelectedId(entry.id)} aria-label={`Xem receipt ${entry.receipt.id}`}><code>{entry.receipt.id}</code><Status tone={tone}>{label}</Status></button></td>
          </tr>;
        })}</tbody></table></div> : <StateView state="empty" compact/>}
      </Panel>
      <Panel title="Chi tiết ledger" description="Nguồn, policy và receipt của bút toán đã chọn."><LedgerDetail entry={selected}/></Panel>
    </div>
    <Panel title="Gửi ghi nhận mới" description="Realm không tự tạo Gold entry. Workflow quản trị hiện có giữ maker/checker, budget và idempotency.">
      {recognition.permissions.canOpenRewardControl ? <div className={styles.suggestedAction}><div><strong>Bạn có quyền mở Hội đồng Gold</strong><p>Tiếp tục tại workflow chuẩn để cấu hình hoặc duyệt reward; receipt chỉ xuất hiện sau khi ERP ghi thành công.</p></div><Link className={styles.button} href={links.rewardControl}><Icon name="approval" size={16}/><span>Mở Hội đồng Gold</span></Link></div> : <div className={styles.suggestedAction}><div><strong>Ghi nhận mới cần người có quyền</strong><p>Vai trò hiện tại chỉ xem ledger cá nhân. Hãy trao đổi với PM, Lead hoặc HR qua luồng công việc chuẩn.</p></div><Link className={styles.button} data-variant="secondary" href={links.messages}><Icon name="chat" size={16}/><span>Mở tin nhắn</span></Link></div>}
    </Panel>
    <div className={styles.sourceRow}><SourcePill source="RealmGoldEntry ERP append-only" freshness={`as-of ${formatDate(source.payload.generatedAt, true)}`}/><span>Mỗi entry có canonical receipt; không leaderboard, streak, scarcity badge hoặc reward shop trên màn hình này.</span></div>
  </div>;
}

export default function CanonicalRealmPeopleRecognitionScreen({ slug }) {
  const source = useProfileRecognitionSource();
  return slug === 'recognition' ? <RecognitionLedger source={source}/> : <EmployeeProfile source={source}/>;
}
