'use client';
// v3.8: Đánh giá hiệu suất theo quý — nhân viên tự chấm 5 tiêu chí (1-5),
// quản lý (HR/PM/Trưởng nhóm/GĐ) chấm lại + chốt. Điểm chốt = TB điểm quản lý.
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useResource, Icon, Modal, ConfirmDialog, EmptyState, AsyncButton, useToast } from '@/components/ui';
import { initials } from '@/lib/format';
import { hasAny } from '@/lib/perm';

const CRITERIA = ['Chất lượng công việc', 'Tiến độ & deadline', 'Chủ động & sáng tạo', 'Phối hợp nhóm', 'Kỷ luật & thái độ'];
const Q = () => { const d = new Date(); return `${d.getFullYear()}-Q${Math.ceil((d.getMonth() + 1) / 3)}`; };
const parseScores = s => { try { const a = JSON.parse(s || '[]'); return a.length ? a : CRITERIA.map(name => ({ name, self: 0, mgr: 0 })); } catch { return CRITERIA.map(name => ({ name, self: 0, mgr: 0 })); } };
const avg = (scores, k) => { const v = scores.filter(s => s[k] > 0); return v.length ? Math.round(v.reduce((a, b) => a + b[k], 0) / v.length * 10) / 10 : null; };
const STATUS = { pending: ['Chờ tự chấm', 'b-amber'], self_done: ['Chờ quản lý', 'b-blue'], final: ['Đã chốt', 'b-green'] };

function Stars({ value, onChange, disabled }) {
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} disabled={disabled} onClick={() => onChange?.(n)}
          style={{ background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer', fontSize: '1.05rem', padding: '0 1px', opacity: n <= value ? 1 : .22 }}>⭐</button>
      ))}
    </span>
  );
}

function ReviewModal({ review, userName, isMgr, isSelf, onSave, onClose }) {
  const [scores, setScores] = useState(parseScores(review.scores));
  const [selfNote, setSelfNote] = useState(review.selfNote || '');
  const [mgrNote, setMgrNote] = useState(review.mgrNote || '');
  const canSelf = isSelf && review.status === 'pending';
  const canMgr = isMgr && review.status !== 'final';
  const setS = (i, k, v) => setScores(x => x.map((s, j) => j === i ? { ...s, [k]: v } : s));

  return (
    <Modal title={`Đánh giá ${review.quarter} — ${userName}`} onClose={onClose} large
      footer={<>
        <button className="btn btn-outline" onClick={onClose}>Đóng</button>
        {canSelf && <AsyncButton className="btn btn-primary" pendingLabel="Đang gửi…" onClick={async () => {
          if (scores.some(s => !s.self)) return alert('Hãy tự chấm đủ 5 tiêu chí');
          const r = await onSave({ scores: JSON.stringify(scores), selfNote, status: 'self_done' }); if (r !== false && r !== null) onClose();
        }}>Gửi tự đánh giá</AsyncButton>}
        {canMgr && <AsyncButton className="btn btn-primary" pendingLabel="Đang chốt…" onClick={async () => {
          if (scores.some(s => !s.mgr)) return alert('Hãy chấm đủ 5 tiêu chí phần quản lý');
          const r = await onSave({ scores: JSON.stringify(scores), mgrNote, status: 'final' }); if (r !== false && r !== null) onClose();
        }}>Chốt đánh giá</AsyncButton>}
      </>}>
      <table style={{ fontSize: '.85rem', width: '100%' }}>
        <thead><tr><th>Tiêu chí</th><th style={{ textAlign: 'center' }}>Tự chấm</th><th style={{ textAlign: 'center' }}>Quản lý</th></tr></thead>
        <tbody>
          {scores.map((s, i) => (
            <tr key={i}>
              <td>{s.name}</td>
              <td style={{ textAlign: 'center' }}><Stars value={s.self} disabled={!canSelf} onChange={v => setS(i, 'self', v)} /></td>
              <td style={{ textAlign: 'center' }}><Stars value={s.mgr} disabled={!canMgr} onChange={v => setS(i, 'mgr', v)} /></td>
            </tr>
          ))}
          <tr style={{ fontWeight: 800 }}>
            <td>Trung bình</td>
            <td style={{ textAlign: 'center' }}>{avg(scores, 'self') ?? '—'}</td>
            <td style={{ textAlign: 'center', color: 'var(--primary)' }}>{avg(scores, 'mgr') ?? '—'}</td>
          </tr>
        </tbody>
      </table>
      <div className="field full" style={{ marginTop: 12 }}>
        <label>Nhân viên tự nhận xét</label>
        <textarea value={selfNote} onChange={e => setSelfNote(e.target.value)} disabled={!canSelf} placeholder="Điểm mạnh, điều muốn cải thiện, đề xuất…" />
      </div>
      <div className="field full" style={{ marginTop: 8 }}>
        <label>Nhận xét của quản lý</label>
        <textarea value={mgrNote} onChange={e => setMgrNote(e.target.value)} disabled={!canMgr} placeholder="Ghi nhận, góp ý phát triển, mục tiêu quý sau…" />
      </div>
    </Modal>
  );
}

export default function ReviewsPage() {
  const { data: session } = useSession();
  const me = session?.user;
  const isMgr = hasAny(me, ['HR', 'PM', 'LEAD']);
  const isHR = hasAny(me, ['HR']);
  const reviews = useResource('reviews');
  const users = useResource('users');
  const [modal, setModal] = useState(null);
  const toast = useToast();

  const q = Q();
  const uName = id => users.rows.find(u => u.id === id)?.name || '—';
  const thisQ = reviews.rows.filter(r => r.quarter === q);
  const mine = thisQ.find(r => r.userId === me?.id);

  const openRound = async () => {
    const active = users.rows.filter(u => u.status === 'active');
    const missing = active.filter(u => !thisQ.some(r => r.userId === u.id));
    if (!missing.length) return toast('Mọi người đều đã có phiếu đánh giá quý này');
    for (const u of missing) await reviews.create({ userId: u.id, quarter: q, scores: '[]' });
    toast(`Đã mở đợt đánh giá ${q} cho ${missing.length} nhân sự`);
  };

  return (
    <>
      <div className="toolbar">
        <span style={{ fontSize: '.85rem', color: 'var(--muted)' }}>
          Quý <b style={{ color: 'var(--fg)' }}>{q}</b> · {thisQ.filter(r => r.status === 'final').length}/{thisQ.length} đã chốt
        </span>
        <div className="spacer"></div>
        {isHR && <AsyncButton className="btn btn-primary" pendingLabel="Đang mở đợt…" disabled={reviews.mutating} onClick={openRound}><Icon name="plus" size={16} /><span>Mở đợt đánh giá {q}</span></AsyncButton>}
      </div>

      {mine && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--primary)' }}>
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <b style={{ fontSize: '.9rem' }}>Phiếu của tôi ({q})</b>
            <span className={`badge ${STATUS[mine.status]?.[1]}`}><span className="dot"></span>{STATUS[mine.status]?.[0]}</span>
            {mine.status === 'final' && <span style={{ fontSize: '.9rem' }}>Điểm chốt: <b style={{ color: 'var(--primary)' }}>{avg(parseScores(mine.scores), 'mgr')}⭐</b></span>}
            <div className="spacer"></div>
            <button className="btn btn-outline btn-sm" onClick={() => setModal({ row: mine })}>
              {mine.status === 'pending' ? '✍ Tự đánh giá ngay' : 'Xem phiếu'}</button>
          </div>
        </div>
      )}
      {!mine && !isMgr && <EmptyState title="Chưa có phiếu đánh giá quý này" sub="HR sẽ mở đợt đánh giá — phiếu của bạn sẽ hiện ở đây" />}

      {isMgr && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nhân sự</th><th>Trạng thái</th><th style={{ textAlign: 'center' }}>Tự chấm</th><th style={{ textAlign: 'center' }}>Quản lý</th><th></th></tr></thead>
            <tbody>
              {thisQ.map(r => {
                const sc = parseScores(r.scores);
                const [sl, scls] = STATUS[r.status] || [r.status, 'b-gray'];
                return (
                  <tr key={r.id}>
                    <td><span className="cell-person"><span className="avatar">{initials(uName(r.userId))}</span>{uName(r.userId)}{r.userId === me?.id ? ' (tôi)' : ''}</span></td>
                    <td><span className={`badge ${scls}`}><span className="dot"></span>{sl}</span></td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{avg(sc, 'self') ?? '—'}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--primary)' }}>{avg(sc, 'mgr') ?? '—'}</td>
                    <td><div className="row-actions">
                      <button className="icon-btn" title="Mở phiếu" onClick={() => setModal({ row: r })}><Icon name="edit" size={16} /></button>
                      {isHR && <button className="icon-btn danger" onClick={() => setModal({ del: r })}><Icon name="trash" size={16} /></button>}
                    </div></td>
                  </tr>
                );
              })}
              {!thisQ.length && <tr><td colSpan={5}><EmptyState title={`Chưa mở đợt đánh giá ${q}`} sub='Bấm "Mở đợt đánh giá" để tạo phiếu cho toàn bộ nhân sự đang hoạt động' /></td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: 10 }}>
        Quy trình: HR mở đợt → nhân viên tự chấm 5 tiêu chí + tự nhận xét → quản lý chấm lại + chốt. Điểm chốt hiện trong hồ sơ nhân sự.
      </p>

      {modal?.row && <ReviewModal review={modal.row} userName={uName(modal.row.userId)}
        isMgr={isMgr} isSelf={modal.row.userId === me?.id}
        onClose={() => setModal(null)}
        onSave={async d => { const r = await reviews.update(modal.row.id, d); if (!r) return false; toast(d.status === 'final' ? 'Đã chốt đánh giá' : 'Đã gửi tự đánh giá'); return true; }} />}
      {modal?.del && <ConfirmDialog msg={`Xóa phiếu đánh giá của ${uName(modal.del.userId)}?`}
        onClose={() => setModal(null)} onYes={async () => { await reviews.remove(modal.del.id); toast('Đã xóa'); }} />}
    </>
  );
}
