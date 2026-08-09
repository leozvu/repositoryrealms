'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useResource, Icon, useModules } from '@/components/ui';
import { money, moneyShort, todayISO, thisMonth, monthKey, remainOf } from '@/lib/format';
import { hasAny } from '@/lib/perm';
import { modOn } from '@/lib/modules';
import { reconcile, activePoints } from '@/lib/livestream';
import PageHeader from '@/components/system/PageHeader';
import ActionQueue from '@/components/system/ActionQueue';
import StatePanel from '@/components/system/StatePanel';

function shortDue(date) {
  if (!date) return '';
  const days = Math.round((new Date(`${date}T00:00:00`) - new Date(`${todayISO()}T00:00:00`)) / 86400000);
  if (days < 0) return `Quá hạn ${Math.abs(days)} ngày`;
  if (days === 0) return 'Hôm nay';
  if (days === 1) return 'Ngày mai';
  return `${days} ngày`;
}

function PulseRow({ label, value, detail, href, tone }) {
  const content = (
    <>
      <span><small>{label}</small><strong data-tone={tone || undefined}>{value}</strong></span>
      <span className="home-pulse-detail">{detail}</span>
      {href && <Icon name="arrow" size={15} />}
    </>
  );
  return href ? <Link className="home-pulse-row" href={href}>{content}</Link> : <div className="home-pulse-row">{content}</div>;
}

export default function Dashboard() {
  const { data: session } = useSession();
  const user = session?.user;
  const tasks = useResource('tasks');
  const projects = useResource('projects');
  const invoices = useResource('invoices');
  const transactions = useResource('transactions');
  const timelogs = useResource('timelogs');
  const leads = useResource('leads');
  const clients = useResource('clients');
  const bills = useResource('vendorbills');
  const users = useResource('users');
  const tickets = useResource('tickets');
  const modules = useModules();
  const on = (module) => modOn(module, modules);
  const shipments = useResource('shipments', null, { enabled: on('export') });
  const areaCodes = useResource('areacodes', null, { enabled: on('export') });
  const liveSessions = useResource('livesessions', null, { enabled: on('livestream') });
  const violations = useResource('violations', null, { enabled: on('livestream') });
  const [insights, setInsights] = useState(null);
  const [approvals, setApprovals] = useState(null);
  const [onboardingHidden, setOnboardingHidden] = useState(() => {
    try { return localStorage.getItem('onbDismissed') === '1'; } catch { return false; }
  });

  useEffect(() => {
    fetch('/api/insights').then((response) => response.ok ? response.json() : [])
      .then(setInsights).catch(() => setInsights([]));
    fetch('/api/approvals', { cache: 'no-store' }).then((response) => response.ok ? response.json() : null)
      .then(setApprovals).catch(() => {});
  }, []);

  const model = useMemo(() => {
    if (!user) return null;
    const financeRole = hasAny(user, ['ACCOUNTANT']);
    const salesRole = hasAny(user, ['AM']);
    const managerRole = hasAny(user, ['PM', 'LEAD']);
    const directorRole = hasAny(user, []);
    const month = thisMonth();
    const openTasks = tasks.rows.filter((task) => !['done', 'merged'].includes(task.status));
    const myTasks = openTasks.filter((task) => task.assigneeId === user.id);
    const overdueTasks = myTasks.filter((task) => task.dueDate && task.dueDate < todayISO());
    const blockedTasks = myTasks.filter((task) => ['blocked', 'waiting'].includes(task.status));
    const nowTasks = myTasks.filter((task) => !blockedTasks.includes(task)
      && (['doing', 'in_progress', 'review'].includes(task.status) || task.dueDate === todayISO()));
    const handledIds = new Set([...overdueTasks, ...blockedTasks, ...nowTasks].map((task) => task.id));
    const nextTasks = myTasks.filter((task) => !handledIds.has(task.id))
      .sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'))).slice(0, 8);
    const activeProjects = projects.rows.filter((project) => project.status === 'active');
    const lateProjects = activeProjects.filter((project) => project.deadline && project.deadline < todayISO());
    const openInvoices = invoices.rows.filter((invoice) => !['paid', 'draft', 'void'].includes(invoice.status));
    const overdueInvoices = openInvoices.filter((invoice) => invoice.dueDate && invoice.dueDate < todayISO());
    const openBills = bills.rows.filter((bill) => bill.status !== 'paid');
    const openLeads = leads.rows.filter((lead) => !['won', 'lost'].includes(lead.stage));
    const openTickets = tickets.rows.filter((ticket) => !['resolved', 'closed'].includes(ticket.status));
    const slaBreaches = openTickets.filter((ticket) => ticket.dueAt && new Date(ticket.dueAt) < new Date());
    const revenue = transactions.rows.filter((transaction) => transaction.type === 'income' && monthKey(transaction.date) === month)
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const expense = transactions.rows.filter((transaction) => transaction.type === 'expense' && monthKey(transaction.date) === month)
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const receivable = openInvoices.reduce((sum, invoice) => sum + remainOf(invoice), 0);
    const payable = openBills.reduce((sum, bill) => sum + (bill.amount || 0), 0);
    const pipeline = openLeads.reduce((sum, lead) => sum + (lead.value || 0), 0);
    const pendingApprovals = approvals?.toApprove || [];
    const unassigned = openTasks.filter((task) => !task.assigneeId);

    const now = [
      ...pendingApprovals.slice(0, 4).map((approval) => ({
        id: `approval-${approval.id}`, icon: 'approval', title: approval.title || approval.subject || 'Yêu cầu phê duyệt',
        reason: approval.requesterName ? `Từ ${approval.requesterName}` : 'Cần quyết định của bạn', href: '/approvals', due: 'Cần xử lý',
      })),
      ...overdueTasks.slice(0, 5).map((task) => ({ id: task.id, icon: 'warning', title: task.title, reason: task.project?.name || 'Công việc chung', href: `/tasks?focus=${task.id}`, due: shortDue(task.dueDate) })),
      ...nowTasks.filter((task) => !overdueTasks.includes(task)).slice(0, 5).map((task) => ({ id: task.id, icon: 'tasks', title: task.title, reason: task.project?.name || 'Công việc chung', href: `/tasks?focus=${task.id}`, due: shortDue(task.dueDate) })),
    ];

    const blocked = [
      ...blockedTasks.slice(0, 5).map((task) => ({ id: task.id, icon: 'warning', title: task.title, reason: task.blockReason || 'Đang chờ điều kiện để tiếp tục', href: `/tasks?focus=${task.id}` })),
      ...(managerRole ? lateProjects.slice(0, 4).map((project) => ({ id: `project-${project.id}`, icon: 'projects', title: project.name, reason: 'Dự án đã qua hạn cam kết', href: `/projects/${project.id}`, due: shortDue(project.deadline) })) : []),
      ...(financeRole ? overdueInvoices.slice(0, 4).map((invoice) => ({ id: `invoice-${invoice.id}`, icon: 'invoices', title: invoice.code || invoice.number || 'Hóa đơn quá hạn', reason: `Còn phải thu ${money(remainOf(invoice))}`, href: '/invoices', due: shortDue(invoice.dueDate) })) : []),
      ...(on('support') ? slaBreaches.slice(0, 3).map((ticket) => ({ id: `ticket-${ticket.id}`, icon: 'warning', title: ticket.title || ticket.subject, reason: 'Ticket đã vượt SLA', href: '/tickets' })) : []),
    ];

    if (on('export')) {
      const atRisk = shipments.rows.filter((shipment) => shipment.paymentMethod === 'LC' && shipment.presentDeadline
        && shipment.status !== 'paid' && (new Date(shipment.presentDeadline) - new Date(todayISO())) / 86400000 <= 7);
      blocked.push(...atRisk.slice(0, 3).map((shipment) => ({ id: `shipment-${shipment.id}`, icon: 'warning', title: shipment.code, reason: 'L/C cần xuất trình trong 7 ngày', href: '/shipments', due: shortDue(shipment.presentDeadline) })));
    }
    if (on('livestream')) {
      blocked.push(...liveSessions.rows.filter((live) => live.status === 'done').slice(0, 3).map((live) => ({ id: `live-${live.id}`, icon: 'receipt', title: live.name || `Ca live ${live.date}`, reason: 'Đã xong ca nhưng chưa đối soát', href: '/live' })));
    }

    const next = nextTasks.map((task) => ({ id: task.id, icon: 'tasks', title: task.title, reason: task.project?.name || 'Công việc chung', href: `/tasks?focus=${task.id}`, due: shortDue(task.dueDate) }));

    const basePulse = directorRole ? [
      { label: 'Ngoại lệ cần can thiệp', value: blocked.length, detail: `${lateProjects.length} dự án trễ`, href: '/portfolio', tone: blocked.length ? 'danger' : 'success' },
      { label: 'Phải thu', value: moneyShort(receivable), detail: `${overdueInvoices.length} hóa đơn quá hạn`, href: '/finplan' },
      { label: 'Pipeline mở', value: moneyShort(pipeline), detail: `${openLeads.length} cơ hội`, href: '/leads' },
      { label: 'Nhân sự hoạt động', value: users.rows.filter((person) => person.status === 'active').length, detail: `${unassigned.length} việc chưa giao`, href: '/staff' },
    ] : financeRole ? [
      { label: 'Phải thu', value: moneyShort(receivable), detail: `${overdueInvoices.length} quá hạn`, href: '/invoices', tone: overdueInvoices.length ? 'danger' : 'success' },
      { label: 'Phải trả', value: moneyShort(payable), detail: `${openBills.length} khoản đang mở`, href: '/vendors' },
      { label: 'Dòng tiền tháng', value: moneyShort(revenue - expense), detail: `Thu ${moneyShort(revenue)}`, href: '/finance' },
      { label: 'Chờ phê duyệt', value: pendingApprovals.length, detail: 'Quyết định tài chính', href: '/approvals' },
    ] : salesRole ? [
      { label: 'Pipeline mở', value: moneyShort(pipeline), detail: `${openLeads.length} cơ hội`, href: '/leads' },
      { label: 'Khách hàng', value: clients.rows.length, detail: `${activeProjects.length} dự án đang chạy`, href: '/clients' },
      { label: 'Việc đến hạn', value: overdueTasks.length + nowTasks.length, detail: `${overdueTasks.length} quá hạn`, href: '/myday', tone: overdueTasks.length ? 'danger' : 'success' },
      { label: 'Ticket đang mở', value: openTickets.length, detail: `${slaBreaches.length} vượt SLA`, href: '/tickets' },
    ] : managerRole ? [
      { label: 'Dự án đang chạy', value: activeProjects.length, detail: `${lateProjects.length} trễ cam kết`, href: '/projects', tone: lateProjects.length ? 'danger' : 'success' },
      { label: 'Việc bị chặn', value: openTasks.filter((task) => task.status === 'blocked').length, detail: `${unassigned.length} chưa giao`, href: '/teamwork' },
      { label: 'Việc của tôi', value: myTasks.length, detail: `${overdueTasks.length} quá hạn`, href: '/myday' },
      { label: 'Chờ phê duyệt', value: pendingApprovals.length, detail: 'Cần quyết định', href: '/approvals' },
    ] : [
      { label: 'Việc đang mở', value: myTasks.length, detail: `${nowTasks.length} cần làm ngay`, href: '/myday' },
      { label: 'Bị chặn', value: blockedTasks.length, detail: 'Cần hỗ trợ', href: '/myday', tone: blockedTasks.length ? 'danger' : 'success' },
      { label: 'Quá hạn', value: overdueTasks.length, detail: 'Cần sắp xếp lại', href: '/myday', tone: overdueTasks.length ? 'danger' : 'success' },
      { label: 'Chờ phê duyệt', value: pendingApprovals.length, detail: 'Cần quyết định', href: '/approvals' },
    ];

    return { financeRole, salesRole, managerRole, now, blocked, next, pulse: basePulse };
  }, [approvals, areaCodes.rows, bills.rows, clients.rows, invoices.rows, leads.rows, liveSessions.rows, projects.rows, shipments.rows, tasks.rows, tickets.rows, timelogs.rows, transactions.rows, user, users.rows, violations.rows]);

  if (!user || !model) return null;

  const onboarding = [
    { label: 'Thêm khách hàng đầu tiên', done: clients.rows.length > 0, href: '/clients' },
    model.salesRole && on('sales') && { label: 'Thêm khách tiềm năng', done: leads.rows.length > 0, href: '/leads' },
    model.financeRole && { label: 'Ghi giao dịch thu hoặc chi đầu tiên', done: transactions.rows.length > 0, href: '/finance' },
    { label: 'Nhập dữ liệu hiện có', done: clients.rows.length > 3, href: '/import' },
  ].filter(Boolean).filter((step) => !step.done);

  const dismissOnboarding = () => {
    try { localStorage.setItem('onbDismissed', '1'); } catch {}
    setOnboardingHidden(true);
  };

  return (
    <div className="role-home">
      <PageHeader
        icon="home"
        meta={new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })}
        title={`Chào ${user.name?.split(/\s+/).slice(-1)[0] || 'bạn'}`}
        description="Bắt đầu từ việc cần hành động, sau đó mới xem số liệu và thay đổi gần đây."
        actions={<Link className="btn btn-primary" href="/myday"><Icon name="work" size={16} />Mở việc của tôi</Link>}
      />

      {!onboardingHidden && onboarding.length > 0 && (
        <section className="home-onboarding" aria-labelledby="home-onboarding-title">
          <div><Icon name="checklist" size={18} /><span><strong id="home-onboarding-title">Thiết lập để bắt đầu vận hành</strong><small>{onboarding.length} bước còn lại</small></span></div>
          <div>{onboarding.map((step) => <Link key={step.href} href={step.href}>{step.label}<Icon name="arrow" size={14} /></Link>)}</div>
          <button className="icon-btn" onClick={dismissOnboarding} aria-label="Ẩn hướng dẫn thiết lập"><Icon name="x" size={15} /></button>
        </section>
      )}

      <div className="home-layout">
        <main className="home-actions" aria-labelledby="home-actions-title">
          <div className="home-section-heading"><div><h2 id="home-actions-title">Cần bạn xử lý</h2><p>Được sắp theo mức độ cần can thiệp.</p></div><Link href="/myday">Xem toàn bộ <Icon name="arrow" size={14} /></Link></div>
          <ActionQueue sections={[
            { key: 'now', label: 'Làm ngay', icon: 'bolt', items: model.now },
            { key: 'blocked', label: 'Bị chặn hoặc có rủi ro', icon: 'warning', items: model.blocked },
            { key: 'next', label: 'Tiếp theo', icon: 'tasks', items: model.next },
          ]} />
        </main>

        <aside className="home-context">
          <section aria-labelledby="home-pulse-title">
            <div className="home-section-heading"><div><h2 id="home-pulse-title">Nhịp vận hành</h2><p>Số liệu hỗ trợ quyết định.</p></div></div>
            <div className="home-pulse">{model.pulse.map((item) => <PulseRow key={item.label} {...item} />)}</div>
          </section>
          <section aria-labelledby="home-changes-title">
            <div className="home-section-heading"><div><h2 id="home-changes-title">Thay đổi đáng chú ý</h2><p>Từ dữ liệu hiện tại của công ty.</p></div></div>
            {insights === null ? <StatePanel compact state="loading" title="Đang phân tích thay đổi" />
              : insights.length ? (
                <div className="home-changes">
                  {insights.slice(0, 6).map((insight, index) => (
                    <Link key={`${insight.route}-${index}`} href={`/${insight.route || 'dashboard'}`}>
                      <Icon name={insight.level === 'bad' || insight.level === 'warn' ? 'warning' : 'chart'} size={15} />
                      <span>{insight.text}</span><Icon name="arrow" size={13} />
                    </Link>
                  ))}
                </div>
              ) : <StatePanel compact state="success" title="Không có thay đổi cần chú ý" description="Các nguồn dữ liệu đang trong ngưỡng bình thường." />}
          </section>
        </aside>
      </div>
    </div>
  );
}
