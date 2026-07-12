'use client';
import { useEffect, useState } from 'react';
import { Icon, Forbidden, EmptyState } from '@/components/ui';
import { initials } from '@/lib/format';

const ACTION_LABEL = {
  create: ['Tạo mới', 'b-green'], update: ['Cập nhật', 'b-blue'], delete: ['Xóa', 'b-red'],
  payment: ['Thanh toán', 'b-green'], import: ['Import dữ liệu', 'b-violet'],
  request: ['Gửi yêu cầu duyệt', 'b-amber'], approve: ['Duyệt', 'b-green'],
  reject: ['Từ chối', 'b-red'], 'approve-executed': ['Thực thi sau duyệt', 'b-violet'],
};
const ENTITY_LABEL = {
  clients: 'Khách hàng', leads: 'Khách tiềm năng', quotes: 'Báo giá', services: 'Bảng giá',
  projects: 'Dự án', tasks: 'Công việc', timelogs: 'Giờ công', invoices: 'Hóa đơn',
  transactions: 'Thu/Chi', vendors: 'NCC', vendorbills: 'HĐ đầu vào', contracts: 'Hợp đồng',
  leaves: 'Nghỉ phép', users: 'Nhân sự', teams: 'Nhóm', assets: 'Tài sản',
  activities: 'Hoạt động CRM', approvals: 'Phê duyệt', settings: 'Cài đặt', all: 'Toàn hệ thống',
};

export default function AuditPage() {
  const [rows, setRows] = useState(null);
  const [forbidden, setForbidden] = useState(false);
  const [q, setQ] = useState('');
  useEffect(() => {
    fetch('/api/audit').then(r => {
      if (r.status === 403) { setForbidden(true); return null; }
      return r.json();
    }).then(d => d && setRows(d));
  }, []);
  if (forbidden) return <Forbidden />;
  if (!rows) return null;

  const visible = rows.filter(r => !q || (r.userName + ' ' + r.entity + ' ' + (r.detail || '')).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="toolbar">
        <div className="search-box"><Icon name="search" size={15} /><input placeholder="Tìm theo người, đối tượng…" value={q} onChange={e => setQ(e.target.value)} /></div>
        <div className="spacer"></div>
        <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>300 thao tác gần nhất — mọi hành động đều được ghi lại</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th><th>Đối tượng</th><th>Chi tiết</th></tr></thead>
          <tbody>
            {visible.map(r => {
              const [al, ac] = ACTION_LABEL[r.action] || [r.action, 'b-gray'];
              return (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(r.at).toLocaleString('vi-VN')}</td>
                  <td><span className="cell-person"><span className="avatar">{initials(r.userName)}</span>{r.userName}</span></td>
                  <td><span className={`badge ${ac}`}><span className="dot"></span>{al}</span></td>
                  <td>{ENTITY_LABEL[r.entity] || r.entity}</td>
                  <td style={{ maxWidth: 340, color: 'var(--muted)', fontSize: '.8rem' }}>{r.detail || '—'}</td>
                </tr>
              );
            })}
            {!visible.length && <tr><td colSpan={5}><EmptyState title="Chưa có bản ghi" /></td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
