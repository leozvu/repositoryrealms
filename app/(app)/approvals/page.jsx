'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon, useToast, EmptyState } from '@/components/ui';
import { money, fmtDate, parseItems } from '@/lib/format';

const TYPE_META = {
  quote: ['Báo giá', 'quotes'], expense: ['Khoản chi', 'finance'],
  leave: ['Nghỉ phép', 'staff'], vendorbill: ['Trả nhà cung cấp', 'wallet'],
};

function Steps({ ap }) {
  const steps = parseItems(ap.steps); // v3.13: parse an toàn — tránh 1 bản ghi hỏng làm trắng cả trang
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

function ApCard({ ap, mine, onDecide, busy, focused = false }) {
  const [t, icon] = TYPE_META[ap.type] || [ap.type, 'alert'];
  return (
    <div id={`approval-${ap.id}`} className="ap-card" data-inbox-focus={focused || undefined} tabIndex={focused ? -1 : undefined}>
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
          <button className="btn btn-primary btn-sm" disabled={busy} aria-busy={busy || undefined} onClick={() => onDecide(ap, 'approve')}><Icon name="check" size={14} /> {busy ? 'Đang xử lý…' : 'Duyệt'}</button>
          <button className="btn btn-outline btn-sm" disabled={busy} style={{ color: 'var(--danger)' }} onClick={() => onDecide(ap, 'reject')}><Icon name="x" size={14} /> Từ chối</button>
        </div>
      )}
    </div>
  );
}

export default function ApprovalsPage() {
  const [data, setData] = useState(null);
  const [decidingId, setDecidingId] = useState(null);
  const toast = useToast();
  const [focusId, setFocusId] = useState('');
  const focusedRecordRef = useRef(null);
  const load = useCallback(() => fetch('/api/approvals').then(r => r.json()).then(setData), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!data || typeof window === 'undefined') return;
    const requested = new URLSearchParams(window.location.search).get('focus') || '';
    if (!requested || focusedRecordRef.current === requested) return;
    const record = [...data.toApprove, ...data.mine].find((row) => row.id === requested);
    focusedRecordRef.current = requested;
    if (!record) return toast('Không tìm thấy phê duyệt hoặc bạn không còn quyền xem bản ghi này.', 'error');
    setFocusId(requested);
    window.requestAnimationFrame(() => {
      const target = document.getElementById(`approval-${requested}`);
      target?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
      target?.focus({ preventScroll: true });
    });
  }, [data, toast]);

  const decide = async (ap, decision) => {
    if (decidingId) return;
    if (decision === 'reject' && !confirm(`Từ chối yêu cầu "${ap.title}"?`)) return;
    setDecidingId(ap.id);
    try {
      const res = await fetch(`/api/approvals/${ap.id}/decide`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return toast(json.error || 'Có lỗi', 'error');
      toast(decision === 'approve'
        ? (json.status === 'approved' ? 'Đã duyệt xong — yêu cầu được thực thi' : 'Đã duyệt — chuyển sang cấp tiếp theo')
        : 'Đã từ chối yêu cầu');
      await load();
    } catch {
      toast('Không thể kết nối máy chủ', 'error');
    } finally {
      setDecidingId(null);
    }
  };

  if (!data) return null;
  return (
    <>
      <div className="card">
        <div className="card-head"><span className="card-title">Chờ tôi duyệt ({data.toApprove.length})</span></div>
        {data.toApprove.length
          ? data.toApprove.map(ap => <ApCard key={ap.id} ap={ap} busy={decidingId === ap.id} focused={focusId === ap.id} onDecide={decide} />)
          : <div className="card-body"><EmptyState title="Không có gì chờ bạn duyệt" sub="Báo giá lớn, khoản chi lớn và đơn nghỉ phép sẽ xuất hiện ở đây" /></div>}
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><span className="card-title">Yêu cầu của tôi</span></div>
        {data.mine.length
          ? data.mine.map(ap => <ApCard key={ap.id} ap={ap} mine focused={focusId === ap.id} onDecide={decide} />)
          : <div className="card-body"><EmptyState title="Bạn chưa gửi yêu cầu nào" /></div>}
      </div>
      <p style={{ fontSize: '.76rem', color: 'var(--muted)', marginTop: 10 }}>
        Quy tắc: báo giá ≥ ngưỡng cần Giám đốc duyệt trước khi gửi · khoản chi ≥ ngưỡng cần Kế toán (rất lớn thêm Giám đốc) ·
        nghỉ phép qua Trưởng nhóm rồi HR (nếu &gt;3 ngày). Ngưỡng chỉnh trong Cài đặt. Giám đốc duyệt được mọi bước.
      </p>
    </>
  );
}
