'use client';
import { useCallback, useEffect, useState } from 'react';
import { Icon, useToast, EmptyState } from '@/components/ui';
import { money, fmtDate } from '@/lib/format';

const TYPE_META = {
  quote: ['Báo giá', 'quotes'], expense: ['Khoản chi', 'finance'],
  leave: ['Nghỉ phép', 'staff'], vendorbill: ['Trả nhà cung cấp', 'wallet'],
};

function Steps({ ap }) {
  const steps = JSON.parse(ap.steps || '[]');
  const curIdx = steps.findIndex(s => s.status === 'pending');
  return (
    <div className="ap-steps">
      {steps.map((s, i) => {
        const cls = s.status === 'approved' ? 'done' : s.status === 'rejected' ? 'no' : i === curIdx ? 'now' : 'wait';
        const mark = s.status === 'approved' ? '✓' : s.status === 'rejected' ? '✕' : i === curIdx ? '●' : '○';
        return <span key={i} className={`ap-step ${cls}`} title={s.note || ''}>{mark} {s.label || s.role}{s.byName ? ` — ${s.byName}` : ''}</span>;
      })}
    </div>
  );
}

function ApCard({ ap, mine, onDecide }) {
  const [t, icon] = TYPE_META[ap.type] || [ap.type, 'alert'];
  return (
    <div className="ap-card">
      <span className="ap-icon"><Icon name={icon} size={17} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="ap-title">{ap.title}</div>
        <div className="ap-sub">{t}{ap.amount ? ' · ' + money(ap.amount) : ''} · {ap.requesterName} yêu cầu · {new Date(ap.createdAt).toLocaleDateString('vi-VN')}
          {ap.status !== 'pending' && <b style={{ color: ap.status === 'approved' ? 'var(--accent)' : 'var(--danger)', marginLeft: 6 }}>
            {ap.status === 'approved' ? '✓ Đã duyệt' : '✕ Bị từ chối'}</b>}
        </div>
        <Steps ap={ap} />
      </div>
      {!mine && ap.status === 'pending' && (
        <div className="ap-actions">
          <button className="btn btn-primary btn-sm" onClick={() => onDecide(ap, 'approve')}><Icon name="check" size={14} /> Duyệt</button>
          <button className="btn btn-outline btn-sm" style={{ color: 'var(--danger)' }} onClick={() => onDecide(ap, 'reject')}><Icon name="x" size={14} /> Từ chối</button>
        </div>
      )}
    </div>
  );
}

export default function ApprovalsPage() {
  const [data, setData] = useState(null);
  const toast = useToast();
  const load = useCallback(() => fetch('/api/approvals').then(r => r.json()).then(setData), []);
  useEffect(() => { load(); }, [load]);

  const decide = async (ap, decision) => {
    if (decision === 'reject' && !confirm(`Từ chối yêu cầu "${ap.title}"?`)) return;
    const res = await fetch(`/api/approvals/${ap.id}/decide`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return toast(json.error || 'Có lỗi', 'error');
    toast(decision === 'approve'
      ? (json.status === 'approved' ? 'Đã duyệt xong — yêu cầu được thực thi' : 'Đã duyệt — chuyển sang cấp tiếp theo')
      : 'Đã từ chối yêu cầu');
    load();
  };

  if (!data) return null;
  return (
    <>
      <div className="card">
        <div className="card-head"><span className="card-title">Chờ tôi duyệt ({data.toApprove.length})</span></div>
        {data.toApprove.length
          ? data.toApprove.map(ap => <ApCard key={ap.id} ap={ap} onDecide={decide} />)
          : <div className="card-body"><EmptyState title="Không có gì chờ bạn duyệt" sub="Báo giá lớn, khoản chi lớn và đơn nghỉ phép sẽ xuất hiện ở đây" /></div>}
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><span className="card-title">Yêu cầu của tôi</span></div>
        {data.mine.length
          ? data.mine.map(ap => <ApCard key={ap.id} ap={ap} mine onDecide={decide} />)
          : <div className="card-body"><EmptyState title="Bạn chưa gửi yêu cầu nào" /></div>}
      </div>
      <p style={{ fontSize: '.76rem', color: 'var(--muted)', marginTop: 10 }}>
        Quy tắc: báo giá ≥ ngưỡng cần Giám đốc duyệt trước khi gửi · khoản chi ≥ ngưỡng cần Kế toán (rất lớn thêm Giám đốc) ·
        nghỉ phép qua Trưởng nhóm rồi HR (nếu &gt;3 ngày). Ngưỡng chỉnh trong Cài đặt. Giám đốc duyệt được mọi bước.
      </p>
    </>
  );
}
