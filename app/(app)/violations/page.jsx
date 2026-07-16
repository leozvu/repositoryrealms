'use client';
// v3.20: Điểm vi phạm nền tảng — rolling 180 ngày. 36đ = hạn chế live, 48đ = đóng shop.
import { useState } from 'react';
import { useResource, Icon, FormModal, ConfirmDialog, EmptyState, Forbidden, useToast } from '@/components/ui';
import { fmtDate, todayISO } from '@/lib/format';
import { PLATFORMS, VIOLATION_THRESHOLDS, plus180, activePoints } from '@/lib/livestream';

export default function ViolationsPage() {
  const vios = useResource('violations');
  const [modal, setModal] = useState(null);
  const toast = useToast();
  if (vios.forbidden) return <Forbidden />;

  const today = todayISO();
  // nhóm theo nền tảng+shop để cảnh báo ngưỡng
  const groups = {};
  vios.rows.forEach(v => { const k = `${v.platform}|${v.shop || ''}`; (groups[k] ||= []).push(v); });

  const save = async d => {
    const payload = { ...d, expiresAt: plus180(d.occurredAt), status: d.status || 'active' };
    if (modal.row) await vios.update(modal.row.id, payload); else await vios.create(payload);
    toast('Đã lưu'); setModal(null);
  };

  const threshHit = pts => [...VIOLATION_THRESHOLDS].reverse().find(t => pts >= t.at);

  return (
    <>
      {Object.entries(groups).map(([k, list]) => {
        const [platform, shop] = k.split('|');
        const pts = activePoints(list, today);
        const hit = threshHit(pts);
        return (
          <div key={k} className="card" style={{ marginBottom: 12, ...(hit ? { borderColor: 'var(--danger)' } : {}) }}>
            <div className="card-head">
              <span className="card-title">{PLATFORMS[platform] || platform}{shop ? ` · ${shop}` : ''}</span>
              <span className={`badge ${pts >= 36 ? 'b-red' : pts >= 12 ? 'b-amber' : 'b-green'}`} style={{ fontSize: '.85rem' }}>
                <span className="dot"></span>{pts} điểm còn hiệu lực</span>
            </div>
            <div className="card-body" style={{ paddingTop: 8 }}>
              {hit && <div style={{ color: 'var(--danger)', fontWeight: 700, marginBottom: 8 }}>⚠ Đã chạm ngưỡng {hit.at}đ: {hit.label}</div>}
              {list.sort((a, b) => (b.occurredAt || '').localeCompare(a.occurredAt || '')).map(v => {
                const expired = v.expiresAt && v.expiresAt < today;
                return (
                  <div key={v.id} className="act-item" style={{ alignItems: 'center' }}>
                    <span className={`badge ${expired || v.status !== 'active' ? 'b-gray' : v.points >= 12 ? 'b-red' : 'b-amber'}`} style={{ flex: 'none' }}>{v.points}đ</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="act-title">{v.reason}{v.category ? ` · ${v.category}` : ''}</div>
                      <div className="act-sub">
                        {fmtDate(v.occurredAt)} · {expired ? 'đã hết hiệu lực (>180 ngày)' : v.status !== 'active' ? v.status : `hết hiệu lực ${fmtDate(v.expiresAt)}`}
                        {v.appealDeadline && v.status === 'active' && !expired ? ` · khiếu nại trước ${fmtDate(v.appealDeadline)}` : ''}
                      </div>
                    </div>
                    <button className="icon-btn" onClick={() => setModal({ row: v })} aria-label="Sửa"><Icon name="edit" size={14} /></button>
                    <button className="icon-btn danger" onClick={() => setModal({ del: v })} aria-label="Xóa"><Icon name="trash" size={14} /></button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {!vios.rows.length && <EmptyState title="Chưa ghi vi phạm nào" sub="Ghi lại điểm vi phạm nền tảng để theo dõi ngưỡng (36đ = hạn chế live, 48đ = đóng shop). Điểm tự hết hiệu lực sau 180 ngày." />}

      <div className="toolbar" style={{ marginTop: 12 }}>
        <div className="spacer"></div>
        <button className="btn btn-primary" onClick={() => setModal({ row: null })}><Icon name="plus" size={16} /><span>Ghi vi phạm</span></button>
      </div>

      {modal && !modal.del && <FormModal title={modal.row ? 'Sửa vi phạm' : 'Ghi vi phạm mới'}
        data={modal.row || {}} onClose={() => setModal(null)} onSave={save}
        fields={[
          { key: 'platform', label: 'Nền tảng', type: 'select', default: 'tiktok', options: Object.entries(PLATFORMS).map(([k, v]) => ({ value: k, label: v })) },
          { key: 'shop', label: 'Kênh / Shop' },
          { key: 'points', label: 'Số điểm', type: 'number', required: true },
          { key: 'reason', label: 'Lý do vi phạm', required: true, full: true },
          { key: 'category', label: 'Nhóm', type: 'select', options: [{ value: '', label: '—' }, { value: 'vận hành', label: 'Vận hành / SLA' }, { value: 'nội dung', label: 'Nội dung livestream' }, { value: 'sản phẩm', label: 'Sản phẩm' }] },
          { key: 'occurredAt', label: 'Ngày vi phạm', type: 'date', required: true, default: todayISO() },
          { key: 'appealDeadline', label: 'Hạn khiếu nại', type: 'date' },
          { key: 'status', label: 'Trạng thái', type: 'select', default: 'active', options: [{ value: 'active', label: 'Còn hiệu lực' }, { value: 'appealing', label: 'Đang khiếu nại' }, { value: 'cleared', label: 'Đã gỡ' }] },
          { key: 'note', label: 'Ghi chú', type: 'textarea', full: true },
        ]} />}
      {modal?.del && <ConfirmDialog msg={`Xóa vi phạm "${modal.del.reason}"?`}
        onClose={() => setModal(null)} onYes={async () => { await vios.remove(modal.del.id); toast('Đã xóa'); }} />}
    </>
  );
}
