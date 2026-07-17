'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useResource, Icon, Badge, EmptyState, useModules } from '@/components/ui';
import { money, moneyShort, fmtDate, todayISO, thisMonth, monthKey, docGrand, remainOf } from '@/lib/format';
import { hasAny } from '@/lib/perm';
import { modOn } from '@/lib/modules';

const LEVEL = {
  bad: { icon: 'alert', color: 'var(--danger)', bg: 'var(--danger-soft)' },
  warn: { icon: 'alert', color: '#B45309', bg: 'var(--warn-soft)' },
  good: { icon: 'trendUp', color: '#047857', bg: 'var(--accent-soft)' },
  info: { icon: 'check', color: 'var(--primary)', bg: 'var(--info-soft)' },
};

export default function Dashboard() {
  const { data: session } = useSession();
  const user = session?.user;
  const tasks = useResource('tasks');
  const projects = useResource('projects');
  const invoices = useResource('invoices');       // 403 với người không có quyền → tự ẩn
  const transactions = useResource('transactions');
  const timelogs = useResource('timelogs');
  const leads = useResource('leads');
  const clients = useResource('clients');
  const bills = useResource('vendorbills');
  const users = useResource('users');
  const tickets = useResource('tickets');
  const modules = useModules();                    // v3.22: biết công ty bật phân hệ nào
  const on = m => modOn(m, modules);               // mod lõi/null xử lý sẵn trong modOn
  // XNK: công ty không bật 'export' sẽ nhận 403 im lặng (module-guard) → rows rỗng, không lỗi.
  const shipments = useResource('shipments');
  const areaCodes = useResource('areacodes');
  const [insights, setInsights] = useState(null);
  useEffect(() => { fetch('/api/insights').then(r => r.json()).then(setInsights).catch(() => setInsights([])); }, []);
  if (!user) return null;

  const seeFin = hasAny(user, ['ACCOUNTANT']);
  const seeSales = hasAny(user, ['AM']);
  const seeOps = hasAny(user, ['PM', 'LEAD']);
  const tm = thisMonth();

  /* ---- Chỉ số ---- */
  const revenue = transactions.rows.filter(t => t.type === 'income' && monthKey(t.date) === tm).reduce((s, t) => s + t.amount, 0);
  const expense = transactions.rows.filter(t => t.type === 'expense' && monthKey(t.date) === tm).reduce((s, t) => s + t.amount, 0);
  const ar = invoices.rows.filter(v => !['paid', 'draft'].includes(v.status)).reduce((s, v) => s + remainOf(v), 0);
  const ap = bills.rows.filter(b => b.status !== 'paid').reduce((s, b) => s + b.amount, 0);
  const openLeads = leads.rows.filter(l => !['won', 'lost'].includes(l.stage));
  const pipeline = openLeads.reduce((s, l) => s + (l.value || 0), 0);
  const closedLeads = leads.rows.filter(l => ['won', 'lost'].includes(l.stage));
  const convRate = closedLeads.length ? Math.round(leads.rows.filter(l => l.stage === 'won').length / closedLeads.length * 100) : null;
  const activeClients = new Set(projects.rows.filter(p => p.status === 'active').map(p => p.clientId)).size;
  const activeProjects = projects.rows.filter(p => p.status === 'active');
  const lateProjects = activeProjects.filter(p => p.deadline && p.deadline < todayISO()).length;
  const myTasks = tasks.rows.filter(t => t.status !== 'done' && (seeOps || t.assigneeId === user.id));
  const openTickets = tickets.rows.filter(t => !['resolved', 'closed'].includes(t.status));
  const slaBreach = openTickets.filter(t => t.dueAt && new Date(t.dueAt) < new Date()).length;
  // Utilization: giờ log tháng này / (số người có lương × 8h × ngày công đã qua)
  const wd = Math.max(1, Math.min(22, Math.round(+todayISO().slice(8, 10) * 22 / 30)));
  const cap = users.rows.filter(u => u.status === 'active').length * 8 * wd;
  const logged = timelogs.rows.filter(l => monthKey(l.date) === tm).reduce((s, l) => s + l.hours, 0);
  const util = cap ? Math.round(logged / cap * 100) : 0;

  /* ---- v3.22: chỉ số XNK (chỉ tính khi bật phân hệ export) ---- */
  const inTransit = shipments.rows.filter(s => ['booked', 'packing', 'customs', 'shipped'].includes(s.status));
  const unpaidShip = shipments.rows.filter(s => !['draft', 'paid'].includes(s.status));
  const unpaidVnd = unpaidShip.reduce((s, x) => s + (x.amount || 0) * (x.fxRate || 1), 0); // quy về VND để so sánh
  const codeSuspended = areaCodes.rows.filter(c => c.status !== 'active').length;
  const lcAtRisk = shipments.rows.filter(s => s.paymentMethod === 'LC' && s.presentDeadline && s.status !== 'paid'
    && (new Date(s.presentDeadline) - new Date(todayISO())) / 86400000 <= 7).length;

  const Kpi = ({ label, value, sub, icon, bg, color, href }) => {
    const inner = (
      <div className="card kpi" style={href ? { cursor: 'pointer', height: '100%' } : {}}>
        <div className="kpi-top"><span className="kpi-label">{label}</span>
          <span className="kpi-icon" style={{ background: bg || 'var(--info-soft)', color: color || 'var(--primary)' }}><Icon name={icon} size={17} /></span></div>
        <div className="kpi-value" style={{ fontSize: '1.22rem' }}>{value}</div>
        {sub && <div className="kpi-sub">{sub}</div>}
      </div>
    );
    return href ? <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>{inner}</Link> : inner;
  };

  return (
    <>
      {/* ============ AI SUMMARY ============ */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg,#2563EB,#7C3AED)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '.72rem', fontWeight: 800 }}>AI</span>
            Tóm tắt hôm nay — {new Date().toLocaleDateString('vi-VN')}
          </span>
        </div>
        <div className="card-body" style={{ paddingTop: 8 }}>
          {insights === null && <p style={{ fontSize: '.83rem', color: 'var(--muted)' }}>Đang phân tích dữ liệu…</p>}
          {insights?.length === 0 && <p style={{ fontSize: '.83rem', color: 'var(--muted)' }}>Mọi thứ đang ổn — không có gì cần chú ý đặc biệt.</p>}
          {insights?.map((i, idx) => {
            const L = LEVEL[i.level] || LEVEL.info;
            return (
              <Link key={idx} href={'/' + (i.route || 'dashboard')} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="act-item" style={{ cursor: 'pointer' }}>
                  <span className="act-kind" style={{ background: L.bg, color: L.color }}><Icon name={L.icon} size={15} /></span>
                  <div style={{ flex: 1, fontSize: '.86rem', paddingTop: 4 }}>{i.text}</div>
                  <Icon name="search" size={13} />
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ============ KPI THEO VAI TRÒ + PHÂN HỆ (v3.22) ============ */}
      <div className="grid kpi-grid">
        {seeFin && <Kpi label="Doanh thu tháng" value={money(revenue)} sub={`Lợi nhuận: ${money(revenue - expense)}`} icon="trendUp" bg="var(--accent-soft)" color="var(--accent)" href="/finance" />}
        {seeFin && <Kpi label="Chi phí tháng" value={money(expense)} icon="trendDown" bg="var(--danger-soft)" color="var(--danger)" href="/finance" />}
        {seeFin && <Kpi label="Phải thu (AR)" value={money(ar)} sub={`Phải trả NCC: ${moneyShort(ap)}`} icon="wallet" bg="var(--warn-soft)" color="var(--warn)" href="/finplan" />}

        {/* ---- Khối XNK: thay các KPI dịch vụ agency khi công ty là DN xuất khẩu ---- */}
        {on('export') && <Kpi label="Lô hàng đang đi" value={inTransit.length} sub={`${shipments.rows.length} lô trong hệ thống`} icon="invoices" bg="var(--info-soft)" color="var(--primary)" href="/shipments" />}
        {on('export') && <Kpi label="Tiền hàng chưa thu" value={money(unpaidVnd)} sub={`${unpaidShip.length} lô chờ thanh toán (quy VNĐ)`} icon="wallet" bg="var(--warn-soft)" color="var(--warn)" href="/shipments" />}
        {on('export') && lcAtRisk > 0 && <Kpi label="L/C sắp tới hạn" value={lcAtRisk} sub="cần xuất trình chứng từ trong 7 ngày" icon="alert" bg="var(--danger-soft)" color="var(--danger)" href="/shipments" />}
        {on('export') && <Kpi label="Mã vùng bị đình chỉ" value={codeSuspended} sub={codeSuspended ? 'không xuất lô mới bằng mã này' : 'tất cả mã đang hiệu lực'} icon={codeSuspended ? 'alert' : 'check'} color={codeSuspended ? 'var(--danger)' : 'var(--accent)'} bg={codeSuspended ? 'var(--danger-soft)' : 'var(--accent-soft)'} href="/growing" />}

        {/* ---- Khối bán hàng / vận hành: chỉ khi bật phân hệ tương ứng ---- */}
        {seeSales && on('sales') && <Kpi label={on('export') ? 'Pipeline người mua' : 'Pipeline bán hàng'} value={money(pipeline)} sub={`${openLeads.length} cơ hội${convRate !== null ? ` · thắng ${convRate}%` : ''}`} icon="leads" href="/leads" />}
        {seeSales && on('delivery') && <Kpi label="Khách hàng active" value={activeClients} sub={`${clients.rows.length} khách trong hệ thống`} icon="clients" href="/clients" />}
        {seeOps && on('delivery') && <Kpi label="Dự án đang chạy" value={activeProjects.length} sub={lateProjects ? `⚠ ${lateProjects} dự án trễ deadline` : 'Đúng tiến độ'} icon="projects" color={lateProjects ? 'var(--danger)' : undefined} bg={lateProjects ? 'var(--danger-soft)' : undefined} href="/projects" />}
        {seeOps && on('delivery') && <Kpi label="Utilization" value={util + '%'} sub={`${logged}h ghi nhận tháng này`} icon="clock" bg="var(--violet-soft)" color="var(--violet)" href="/timesheet" />}
        {on('support') && <Kpi label="Ticket hỗ trợ" value={openTickets.length} sub={slaBreach ? `⚠ ${slaBreach} vỡ SLA` : 'SLA trong tầm kiểm soát'} icon="check" color={slaBreach ? 'var(--danger)' : undefined} bg={slaBreach ? 'var(--danger-soft)' : undefined} href="/tickets" />}
        {!seeOps && on('delivery') && <Kpi label="Việc của tôi" value={myTasks.length} icon="tasks" href="/tasks" />}
      </div>

      {/* ============ VIỆC / LÔ HÀNG & HÓA ĐƠN (v3.22 module-aware) ============ */}
      <div className="grid dash-cols" style={{ marginTop: 16 }}>
        {on('export') && !on('delivery') ? (
          /* DN xuất khẩu: thay bảng "công việc dự án" bằng danh sách lô hàng cần theo dõi */
          <div className="card">
            <div className="card-head"><span className="card-title">Lô hàng cần theo dõi</span>
              <Link href="/shipments" className="btn btn-ghost btn-sm">Xem tất cả</Link></div>
            <div className="table-wrap" style={{ border: 'none', boxShadow: 'none' }}>
              <table>
                <thead><tr><th>Mã lô</th><th>Mặt hàng</th><th>Thị trường</th><th>Trạng thái</th></tr></thead>
                <tbody>
                  {[...unpaidShip].sort((a, b) => (a.presentDeadline || '9999').localeCompare(b.presentDeadline || '9999')).slice(0, 7).map(s => {
                    const risk = s.paymentMethod === 'LC' && s.presentDeadline && s.status !== 'paid'
                      && (new Date(s.presentDeadline) - new Date(todayISO())) / 86400000 <= 7;
                    return (
                      <tr key={s.id}>
                        <td><span className="cell-main">{s.code}</span>{risk && <div className="cell-sub" style={{ color: 'var(--danger)', fontWeight: 700 }}>L/C hạn {fmtDate(s.presentDeadline)}</div>}</td>
                        <td>{s.crop}</td>
                        <td>{s.market}</td>
                        <td><Badge map="shipment" k={s.status} /></td>
                      </tr>
                    );
                  })}
                  {!unpaidShip.length && <tr><td colSpan={4}><EmptyState title="Không có lô hàng đang chờ" /></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="card-head"><span className="card-title">{seeOps ? 'Công việc sắp đến hạn' : 'Công việc của tôi'}</span>
              <Link href="/tasks" className="btn btn-ghost btn-sm">Xem tất cả</Link></div>
            <div className="table-wrap" style={{ border: 'none', boxShadow: 'none' }}>
              <table>
                <thead><tr><th>Công việc</th><th>Ưu tiên</th><th>Hạn</th><th>Trạng thái</th></tr></thead>
                <tbody>
                  {myTasks.sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')).slice(0, 7).map(t => (
                    <tr key={t.id}>
                      <td><span className="cell-main">{t.title}</span></td>
                      <td><Badge map="priority" k={t.priority} /></td>
                      <td style={t.dueDate && t.dueDate < todayISO() ? { color: 'var(--danger)', fontWeight: 600 } : {}}>{fmtDate(t.dueDate)}</td>
                      <td><Badge map="task" k={t.status} /></td>
                    </tr>
                  ))}
                  {!myTasks.length && <tr><td colSpan={4}><EmptyState title="Không có công việc đang mở" /></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {seeFin ? (
          <div className="card">
            <div className="card-head"><span className="card-title">Hóa đơn cần thu</span>
              <Link href="/invoices" className="btn btn-ghost btn-sm">Xem tất cả</Link></div>
            <div className="card-body" style={{ paddingTop: 6 }}>
              {invoices.rows.filter(v => ['sent', 'overdue'].includes(v.status)).slice(0, 6).map(v => (
                <div key={v.id} style={{ display: 'flex', gap: 11, padding: '9px 0', borderBottom: '1px solid var(--border)', fontSize: '.83rem', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <b style={{ display: 'block' }}>{v.code}</b>
                    <small style={{ color: v.status === 'overdue' ? 'var(--danger)' : 'var(--muted)' }}>Hạn: {fmtDate(v.dueDate)}{v.status === 'overdue' ? ' · quá hạn' : ''}</small>
                  </div>
                  <span style={{ fontWeight: 700 }}>{money(remainOf(v))}</span>
                </div>
              ))}
              {!invoices.rows.filter(v => ['sent', 'overdue'].includes(v.status)).length && <EmptyState title="Không có hóa đơn chờ thu" />}
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="card-head"><span className="card-title">Ticket đang mở</span>
              <Link href="/tickets" className="btn btn-ghost btn-sm">Xem tất cả</Link></div>
            <div className="card-body" style={{ paddingTop: 6 }}>
              {openTickets.slice(0, 6).map(t => (
                <div key={t.id} style={{ display: 'flex', gap: 11, padding: '9px 0', borderBottom: '1px solid var(--border)', fontSize: '.83rem', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}><b>{t.code}</b> · {t.title}</div>
                  <small style={{ color: t.dueAt && new Date(t.dueAt) < new Date() ? 'var(--danger)' : 'var(--muted)' }}>{t.priority}</small>
                </div>
              ))}
              {!openTickets.length && <EmptyState title="Không có ticket nào" />}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
