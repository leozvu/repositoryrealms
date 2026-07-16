'use client';
// v3.19: Vùng trồng (PUC) + Cơ sở đóng gói (PHC) + mã số theo từng thị trường.
// Điểm mấu chốt: 1 cơ sở ↔ n thị trường, mỗi cặp có mã + TRẠNG THÁI riêng (TQ đình chỉ không
// kéo theo EU). Đình chỉ mã là chuyện thường ngày (167 PUC đã bị TQ đình chỉ).
import { useState } from 'react';
import { useResource, Icon, FormModal, ConfirmDialog, EmptyState, Forbidden, useToast } from '@/components/ui';
import { MARKETS, CROPS, CODE_STATUS } from '@/lib/export-trade';

const CODE_BADGE = { active: 'b-green', suspended: 'b-amber', revoked: 'b-red', pending: 'b-gray' };
const codeLabel = s => (CODE_STATUS.find(([k]) => k === s) || [s, s])[1];

export default function GrowingPage() {
  const areas = useResource('growingareas');
  const codes = useResource('areacodes');
  const [modal, setModal] = useState(null);
  const toast = useToast();
  if (areas.forbidden) return <Forbidden />;

  const codesOf = id => codes.rows.filter(c => c.areaId === id);
  const suspended = codes.rows.filter(c => c.status !== 'active').length;

  const saveArea = async d => {
    const r = areas.rows.find(x => x.id === modal.row?.id);
    if (r) await areas.update(r.id, d); else await areas.create(d);
    toast('Đã lưu cơ sở'); setModal(null);
  };
  const saveCode = async d => {
    await codes.create({ ...d, areaId: modal.areaId });
    toast('Đã thêm mã thị trường'); setModal(null);
  };

  return (
    <>
      <div className="grid kpi-grid" style={{ marginBottom: 16 }}>
        <div className="card kpi"><span className="kpi-label">Vùng trồng (PUC)</span>
          <div className="kpi-value">{areas.rows.filter(a => a.type === 'PUC').length}</div></div>
        <div className="card kpi"><span className="kpi-label">Cơ sở đóng gói (PHC)</span>
          <div className="kpi-value">{areas.rows.filter(a => a.type === 'PHC').length}</div></div>
        <div className="card kpi"><span className="kpi-label">Mã đang bị đình chỉ / thu hồi</span>
          <div className="kpi-value" style={{ color: suspended ? 'var(--danger)' : 'var(--accent)' }}>{suspended}</div>
          <div className="kpi-sub">không xuất được lô mới bằng mã này</div></div>
      </div>

      <div className="toolbar">
        <span style={{ fontSize: '.85rem', color: 'var(--muted)' }}>Mã số theo NĐ 38/2026 — đuôi mã là mã nước nhập khẩu; mỗi thị trường có mã + trạng thái riêng.</span>
        <div className="spacer"></div>
        <button className="btn btn-primary" onClick={() => setModal({ mode: 'area', row: null })}><Icon name="plus" size={16} /><span>Thêm cơ sở</span></button>
      </div>

      {!areas.rows.length ? <EmptyState title="Chưa có vùng trồng / cơ sở đóng gói" sub="Thêm vùng trồng (PUC) hoặc cơ sở đóng gói (PHC), rồi khai mã số theo từng thị trường xuất." /> : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
          {areas.rows.map(a => (
            <div key={a.id} className="card">
              <div className="card-head">
                <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`badge ${a.type === 'PUC' ? 'b-green' : 'b-violet'}`}>{a.type}</span>{a.name}
                </span>
                <div className="row-actions">
                  <button className="icon-btn" onClick={() => setModal({ mode: 'area', row: a })} aria-label="Sửa"><Icon name="edit" size={15} /></button>
                  <button className="icon-btn danger" onClick={() => setModal({ mode: 'delArea', row: a })} aria-label="Xóa"><Icon name="trash" size={15} /></button>
                </div>
              </div>
              <div className="card-body" style={{ fontSize: '.84rem' }}>
                <div style={{ color: 'var(--muted)', marginBottom: 8 }}>
                  {[a.crop, a.province, a.areaHa ? a.areaHa + ' ha' : null, a.owner].filter(Boolean).join(' · ') || '—'}
                </div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <b>Mã số theo thị trường</b>
                    <button className="btn btn-outline btn-sm" onClick={() => setModal({ mode: 'code', areaId: a.id })}>+ Mã</button>
                  </div>
                  {codesOf(a.id).map(c => (
                    <div key={c.id} className="act-item" style={{ padding: '4px 0', alignItems: 'center' }}>
                      <span className="badge b-blue" style={{ flex: 'none' }}>{MARKETS[c.market] || c.market}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'monospace', fontSize: '.8rem' }}>{c.code}</div>
                        {c.legacyCode && <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>cũ: {c.legacyCode}</div>}
                      </div>
                      <span className={`badge ${CODE_BADGE[c.status]}`} style={{ flex: 'none' }}><span className="dot"></span>{codeLabel(c.status)}</span>
                      <button className="icon-btn danger" style={{ flex: 'none' }} onClick={() => setModal({ mode: 'delCode', row: c })} aria-label="Xóa mã"><Icon name="x" size={13} /></button>
                    </div>
                  ))}
                  {!codesOf(a.id).length && <div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>Chưa khai mã thị trường nào.</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal?.mode === 'area' && <FormModal title={modal.row ? 'Sửa cơ sở' : 'Thêm vùng trồng / cơ sở đóng gói'}
        data={modal.row || { type: 'PUC' }} onClose={() => setModal(null)} onSave={saveArea}
        fields={[
          { key: 'type', label: 'Loại', type: 'select', required: true, options: [{ value: 'PUC', label: 'PUC — Vùng trồng' }, { value: 'PHC', label: 'PHC — Cơ sở đóng gói' }] },
          { key: 'name', label: 'Tên cơ sở', required: true, full: true },
          { key: 'crop', label: 'Mặt hàng', type: 'select', options: [{ value: '', label: '—' }, ...CROPS.map(c => ({ value: c, label: c }))] },
          { key: 'province', label: 'Tỉnh / Thành' },
          { key: 'areaHa', label: 'Diện tích (ha)', type: 'number' },
          { key: 'owner', label: 'Chủ vườn / Đơn vị' },
          { key: 'note', label: 'Ghi chú', type: 'textarea', full: true },
        ]} />}

      {modal?.mode === 'code' && <FormModal title="Thêm mã số cho một thị trường"
        onClose={() => setModal(null)} onSave={saveCode}
        fields={[
          { key: 'market', label: 'Thị trường', type: 'select', required: true, options: Object.entries(MARKETS).map(([k, v]) => ({ value: k, label: v })) },
          { key: 'code', label: 'Mã số (mới, NĐ 38/2026)', required: true, full: true, placeholder: 'VD: 01-PUC-CHANHDAY01-000001-CHN' },
          { key: 'legacyCode', label: 'Mã cũ (nếu có)', full: true, placeholder: 'VD: VN-HNOR-0001' },
          { key: 'status', label: 'Trạng thái', type: 'select', default: 'active', options: CODE_STATUS.map(([k, l]) => ({ value: k, label: l })) },
          { key: 'validFrom', label: 'Hiệu lực từ', type: 'date' },
          { key: 'validTo', label: 'Đến (nếu có)', type: 'date' },
          { key: 'note', label: 'Ghi chú (lý do đình chỉ…)', type: 'textarea', full: true },
        ]} />}

      {modal?.mode === 'delArea' && <ConfirmDialog msg={`Xóa "${modal.row.name}"? Các mã thị trường của cơ sở này vẫn còn — xóa riêng nếu cần.`}
        onClose={() => setModal(null)} onYes={async () => { await areas.remove(modal.row.id); toast('Đã xóa'); }} />}
      {modal?.mode === 'delCode' && <ConfirmDialog msg={`Xóa mã ${modal.row.code}?`}
        onClose={() => setModal(null)} onYes={async () => { await codes.remove(modal.row.id); toast('Đã xóa mã'); }} />}
    </>
  );
}
