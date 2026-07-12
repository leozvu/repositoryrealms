'use client';
// Khung ứng dụng v2.1: sidebar theo 7 vai trò + badge phê duyệt
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SessionProvider, signOut } from 'next-auth/react';
import { Icon, ToastProvider } from './ui';
import { initials } from '@/lib/format';
import { rolesOf, hasAny, ROLE_LABEL } from '@/lib/perm';

// roles: các vai trò được thấy mục này (DIRECTOR luôn thấy tất cả)
const ALL = ['PM', 'AM', 'ACCOUNTANT', 'HR', 'LEAD', 'STAFF'];
const NAV = [
  { section: 'Tổng quan' },
  { key: 'dashboard', label: 'Bảng điều khiển', icon: 'dashboard', roles: ALL },
  { key: 'calendar', label: 'Lịch làm việc', icon: 'calendar', roles: ALL },
  { key: 'messages', label: 'Tin nhắn', icon: 'mail', roles: ALL, chatBadge: true },
  { key: 'approvals', label: 'Phê duyệt', icon: 'check', roles: ALL, badge: true },
  { key: 'copilot', label: 'AI Copilot', icon: 'search', roles: ALL },
  { section: 'CRM — Bán hàng' },
  { key: 'leads', label: 'Khách tiềm năng', icon: 'leads', roles: ['AM'] },
  { key: 'clients', label: 'Khách hàng', icon: 'clients', roles: ALL },
  { key: 'quotes', label: 'Báo giá', icon: 'quotes', roles: ['AM', 'PM', 'ACCOUNTANT'] },
  { key: 'services', label: 'Bảng giá dịch vụ', icon: 'tag', roles: ALL },
  { key: 'tickets', label: 'Ticket hỗ trợ', icon: 'check', roles: ALL },
  { section: 'Vận hành' },
  { key: 'projects', label: 'Dự án', icon: 'projects', roles: ALL },
  { key: 'tasks', label: 'Công việc', icon: 'tasks', roles: ALL },
  { key: 'timesheet', label: 'Chấm công giờ', icon: 'clock', roles: ALL },
  { key: 'gantt', label: 'Gantt tiến độ', icon: 'reports', roles: ALL },
  { section: 'Tài chính' },
  { key: 'invoices', label: 'Hóa đơn', icon: 'invoices', roles: ['ACCOUNTANT', 'AM'] },
  { key: 'finance', label: 'Thu / Chi', icon: 'finance', roles: ['ACCOUNTANT'] },
  { key: 'finplan', label: 'Công nợ & Dự báo', icon: 'trendUp', roles: ['ACCOUNTANT'] },
  { key: 'vendors', label: 'Mua hàng / NCC', icon: 'wallet', roles: ['ACCOUNTANT', 'PM'] },
  { key: 'contracts', label: 'Hợp đồng', icon: 'shield', roles: ['ACCOUNTANT', 'AM', 'PM'] },
  { section: 'Nhân sự' },
  { key: 'staff', label: 'Hồ sơ & nhóm', icon: 'staff', roles: ALL },
  { key: 'attendance', label: 'Chấm công ngày', icon: 'calendar', roles: ALL },
  { key: 'payroll', label: 'Bảng lương', icon: 'wallet', roles: ALL },
  { key: 'recruitment', label: 'Tuyển dụng', icon: 'leads', roles: ['HR'] },
  { section: 'Công ty' },
  { key: 'assets', label: 'Tài sản', icon: 'projects', roles: ALL },
  { key: 'reports', label: 'Báo cáo', icon: 'reports', roles: ['ACCOUNTANT', 'PM'] },
  { key: 'analytics', label: 'Analytics (MRR/LTV)', icon: 'trendUp', roles: ['ACCOUNTANT', 'AM', 'PM'] },
  { key: 'okr', label: 'KPI / OKR', icon: 'tasks', roles: ALL },
  { key: 'audit', label: 'Nhật ký hệ thống', icon: 'search', roles: [] }, // chỉ DIRECTOR
  { key: 'settings', label: 'Cài đặt', icon: 'settings', roles: [] },
];

export default function Shell({ user, company, children }) {
  const [open, setOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [unreadChat, setUnreadChat] = useState(0);
  const pathname = usePathname();
  const current = NAV.find(n => n.key && pathname.startsWith('/' + n.key));
  const myRoles = rolesOf(user);
  const visible = item => hasAny(user, item.roles);

  useEffect(() => {
    const load = () => {
      fetch('/api/approvals').then(r => r.ok ? r.json() : null)
        .then(d => d && setPendingCount(d.pendingCount || 0)).catch(() => {});
      fetch('/api/chat').then(r => r.ok ? r.json() : null)
        .then(d => d && setUnreadChat(d.totalUnread || 0)).catch(() => {});
    };
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [pathname]);

  useEffect(() => { // PWA: đăng ký service worker
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  return (
    <SessionProvider>
    <ToastProvider>
      <div id="app">
        <aside id="sidebar" className={open ? 'open' : ''}>
          <div className="brand">
            <div className="brand-logo">{(company || 'A')[0].toUpperCase()}</div>
            <div className="brand-text">
              <span className="brand-name">{company || 'Agency ERP'}</span>
              <span className="brand-sub">ERP v2.1 · 7 vai trò</span>
            </div>
          </div>
          <nav id="nav">
            {NAV.map((item, i) => {
              if (item.section) {
                const next = NAV.findIndex((x, j) => j > i && x.section);
                const group = NAV.slice(i + 1, next === -1 ? undefined : next);
                return group.some(visible) ? <div key={i} className="nav-section">{item.section}</div> : null;
              }
              if (!visible(item)) return null;
              const active = pathname.startsWith('/' + item.key);
              return (
                <Link key={item.key} href={'/' + item.key} className={`nav-item ${active ? 'active' : ''}`} onClick={() => setOpen(false)}>
                  <Icon name={item.icon} size={18} /><span>{item.label}</span>
                  {item.badge && pendingCount > 0 && <span className="count" style={{ background: 'var(--danger)', color: '#fff' }}>{pendingCount}</span>}
                  {item.chatBadge && unreadChat > 0 && <span className="count" style={{ background: 'var(--danger)', color: '#fff' }}>{unreadChat}</span>}
                </Link>
              );
            })}
          </nav>
          <div className="user-chip">
            <span className="avatar">{initials(user.name)}</span>
            <div>
              <div className="uc-name">{user.name}</div>
              <div className="uc-role">{myRoles.map(r => ROLE_LABEL[r] || r).join(' · ')}</div>
            </div>
            <button onClick={() => signOut({ callbackUrl: '/login' })} title="Đăng xuất" aria-label="Đăng xuất">
              <Icon name="logout" size={16} />
            </button>
          </div>
        </aside>
        <div id="backdrop" className={open ? 'show' : ''} onClick={() => setOpen(false)}></div>
        <div id="main">
          <header id="topbar">
            <button id="menu-btn" onClick={() => setOpen(true)} aria-label="Mở menu"><Icon name="menu" /></button>
            <h1 id="page-title">{current?.label || 'Agency ERP'}</h1>
            <div className="topbar-right">
              <span id="today-label">{new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
              <span className={`role-chip role-${myRoles[0]}`}>{myRoles.map(r => ROLE_LABEL[r] || r).join(' · ')}</span>
            </div>
          </header>
          <main id="view">{children}</main>
        </div>
      </div>
    </ToastProvider>
    </SessionProvider>
  );
}
