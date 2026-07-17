'use client';
// v3.24: KHO HÀNG / LÔ — trang quản lý tồn kho nông sản theo LÔ (đích danh).
// Truy xuất nguồn gốc: mỗi lô gắn nhà cung cấp + vùng trồng (PUC) + ngày thu hoạch + hạn dùng.
// Xuất kho vào lô hàng xuất → ghi StockMove để truy ra "lô hàng đi từ lô tồn nào".
import { useState } from 'react';
import { useResource, Icon, FormModal, ConfirmDialog, EmptyState, Forbidden, Modal, useToast } from '@/components/ui';
import { money, fmtDate, todayISO } from '@/lib/format';
import { CROPS } from '@/lib/export-trade';
import { WAREHOUSES, lotRemaining, lotValue, lotDisplayStatus, stockSummary } from '@/lib/inventory';

const ST = { in_stock: ['Còn tồn', 'b-green'], expiring: ['Cận hạn', 'b-amber'], expired: ['Quá hạn', 'b-red'], depleted: ['Đã xuất hết', 'b-gray'] };

export default function InventoryPage() {
  const lots = useResource('stocklots');
  const moves = useResource('stockmoves');
  const vendors = useResource('vendors');
  const areas = useResource('growingareas');
  const ships = useResource('shipments');
  const [modal, setModal] = useState(null);
  const [detail, setDetail] = useState(null);
  const toast = useToast();
  if (lots.forbidden) return <Forbidden />;

  const today = todayISO();
  const sum = stockSummary(lots.rows, today);
  const vName = id => vendors.rows.find(v => v.id === id)?.name || '—';
  const aName = id => areas.rows.find(a => a.id === id)?.name || '—';
  const sCode = id => ships.rows.find(s => s.id === id)?.code || id;

  const nextCode = () => {
    const y = new Date().getFullYear();
    const nums = lots.rows.map(l => { const m = (l.code || '').match(/(\d+)$/); return m ? +m[1] : 0; });
    return `LOT-${y}-${String(Math.max(0, ...nums) + 1).padStart(3, '0')}`;
  };

  const saveLot = async d => {
    const row = modal.row;
    const payload = { ...d, qtyIn: +d.qtyIn || 0, unitCost: +d.unitCost || 0 };
    if (row) { await lots.update(row.id, payload); toast('Đã lưu lô'); }
    else { await lots.create({ ...payload, code: nextCode(), currency: 'VND', status: 'in_stock' }); toast('Đã nhập kho lô mới'); }
  };

  const issue = async d => {
    const lot = modal.issue;
    const r = await fetch(`/api/stocklots/${lot.id}/issue`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qty: +d.qty, shipmentId: d.shipmentId || null, date: d.date || today, note: d.note }),
    });
    if (!r.ok) { const j = await r.json().catch(() => ({})); toast(j.error || 'Lỗi xuất kho', 'error'); return false; }
    await lots.refresh(); await moves.refresh();
    toast(`Đã xuất ${d.qty} kg từ lô ${lot.code}`);
  };

  const lotFields = [
    { key: 'crop', label: 'Mặt hàng', type: 'select', required: true, options: CROPS.map(c => ({ value: c, label: c })) },
    { key: 'vendorId', label: 'Nhà cung cấp / Nông dân', type: 'select', options: [{ value: '', label: '—' }, ...vendors.rows.map(v => ({ value: v.id, label: v.name }))] },
    { key: 'growingAreaId', label: 'Vùng trồng nguồn (PUC)', type: 'select', options: [{ value: '', label: '—' }, ...areas.rows.filter(a => a.type === 'PUC').map(a => ({ value: a.id, label: a.name }))], hint: 'Để truy xuất nguồn gốc ra tận vườn' },
    { key: 'warehouse', label: 'Kho', type: 'select', options: [{ value: '', label: '—' }, ...WAREHOUSES.map(w => ({ value: w, label: w }))] },
    { key: 'qtyIn', label: 'Khối lượng nhập (kg)', type: 'number', required: true },
    { key: 'unitCost', label: 'Giá vốn (VNĐ/kg)', type: 'number', required: true },
    { key: 'harvestDate', label: 'Ngày thu hoạch', type: 'date' },
    { key: 'expiryDate', label: 'Hạn dùng / nên xuất trước', type: 'date' },
    { key: 'receivedDate', label: 'Ngày nhập kho', type: 'date' },
    { key: 'note', label: 'Ghi chú', type: 'textarea', full: true },
  ];

  return (
    <>
      <div className="grid kpi-grid" style={{ marginBottom: 16 }}>
        <div className="card kpi"><span className="kpi-label">Tồn kho</span>
          <div className="kpi-value">{Math.round(sum.totalKg).toLocaleString('vi-VN')} kg</div>
          <div className="kpi-sub">{lots.rows.filter(l => lotDisplayStatus(l, today) !== 'depleted' && lotDisplayStatus(l, today) !== 'expired').length} lô còn tồn</div></div>
        <div className="card kpi"><span className="kpi-label">Giá trị tồn (giá vốn)</span>
          <div className="kpi-value" style={{ fontSize: '1.15rem' }}>{money(sum.totalValue)}</div>
          <div className="kpi-sub">theo giá mua vào từng lô</div></div>
        <div className="card kpi"><span className="kpi-label">Hàng cận hạn</span>
          <div className="kpi-value" style={{ color: sum.expiringKg ? 'var(--warn)' : 'var(--accent)' }}>{Math.round(sum.expiringKg).toLocaleString('vi-VN')} kg</div>
          <div className="kpi-sub">≤5 ngày tới hạn — ưu tiên xuất trước (FEFO)</div></div>
        <div className="card kpi"><span className="kpi-label">Lô quá hạn</span>
          <div className="kpi-value" style={{ color: sum.expiredCount ? 'var(--danger)' : 'var(--accent)' }}>{sum.expiredCount}</div>
          <div className="kpi-sub">không đưa vào lô hàng xuất</div></div>
      </div>

      <div className="toolbar">
        <span style={{ fontSize: '.85rem', color: 'var(--muted)' }}>{lots.rows.length} lô · giá vốn đích danh theo lô, truy xuất nguồn gốc ra vùng trồng</span>
        <div className="spacer"></div>
        <button className="btn btn-primary" onClick={() => setModal({ row: null })}><Icon name="plus" size={16} /><span>Nhập kho lô mới</span></button>
      </div>

      {!lots.rows.length ? <EmptyState title="Kho chưa có lô nào" sub="Nhập kho lô nông sản đầu tiên — gắn nhà cung cấp, vùng trồng, ngày thu hoạch và hạn dùng để truy xuất nguồn gốc." /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Mã lô</th><th>Mặt hàng</th><th>Nguồn</th><th>Kho</th><th>Hạn dùng</th><th className="num">Tồn (kg)</th><th className="num">Giá vốn</th><th className="num">Giá trị tồn</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>
              {lots.rows.map(l => {
                const st = lotDisplayStatus(l, today);
                const [lbl, cls] = ST[st] || ST.in_stock;
                const rem = lotRemaining(l);
                return (
                  <tr key={l.id} className="clickable" onClick={() => setDetail(l)}>
                    <td><span className="cell-main">{l.code}</span></td>
                    <td>{l.crop}</td>
                    <td><div style={{ fontSize: '.8rem' }}>{vName(l.vendorId)}</div><div className="cell-sub">{aName(l.growingAreaId)}</div></td>
                    <td>{l.warehouse || '—'}</td>
                    <td style={st === 'expired' ? { color: 'var(--danger)', fontWeight: 700 } : st === 'expiring' ? { color: 'var(--warn)', fontWeight: 600 } : {}}>{fmtDate(l.expiryDate)}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{rem.toLocaleString('vi-VN')}</td>
                    <td className="num">{money(l.unitCost)}</td>
                    <td className="num">{money(lotValue(l))}</td>
                    <td><span className={`badge ${cls}`}><span className="dot"></span>{lbl}</span></td>
                    <td onClick={e => e.stopPropagation()}><div className="row-actions">
                      {rem > 0 && st !== 'expired' && <button className="icon-btn" style={{ color: 'var(--accent)' }} title="Xuất kho" onClick={() => setModal({ issue: l })}><Icon name="upload" size={15} /></button>}
                      <button className="icon-btn" onClick={() => setModal({ row: l })} aria-label="Sửa"><Icon name="edit" size={15} /></button>
                      <button className="icon-btn danger" onClick={() => {
                        if (moves.rows.some(m => m.lotId === l.id)) return toast('Lô đã có lịch sử xuất kho — không xóa được (giữ truy xuất nguồn gốc).', 'error');
                        setModal({ del: l });
                      }} aria-label="Xóa"><Icon name="trash" size={15} /></button>
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && !modal.del && !modal.issue && <FormModal title={modal.row ? `Sửa lô ${modal.row.code}` : 'Nhập kho lô mới'} large
        data={modal.row || { receivedDate: today }} onClose={() => setModal(null)} onSave={saveLot} fields={lotFields} />}

      {modal?.issue && <FormModal title={`Xuất kho lô ${modal.issue.code} — còn ${lotRemaining(modal.issue)} kg`}
        data={{ date: today, qty: '' }} onClose={() => setModal(null)} onSave={issue}
        fields={[
          { key: 'qty', label: `Khối lượng xuất (kg) — tối đa ${lotRemaining(modal.issue)}`, type: 'number', required: true },
          { key: 'shipmentId', label: 'Cho lô hàng xuất', type: 'select', options: [{ value: '', label: '— Xuất thủ công —' }, ...ships.rows.filter(s => s.status !== 'paid').map(s => ({ value: s.id, label: `${s.code} · ${s.crop || ''} đi ${s.market}` }))], hint: 'Chọn để truy xuất nguồn gốc lô hàng xuất' },
          { key: 'date', label: 'Ngày xuất', type: 'date' },
          { key: 'note', label: 'Ghi chú', full: true },
        ]} />}

      {modal?.del && <ConfirmDialog msg={`Xóa lô ${modal.del.code}?`}
        onClose={() => setModal(null)} onYes={async () => { await lots.remove(modal.del.id); toast('Đã xóa lô'); }} />}

      {detail && <LotDetail lot={detail} moves={moves.rows.filter(m => m.lotId === detail.id)} vName={vName} aName={aName} sCode={sCode} onClose={() => setDetail(null)} />}
    </>
  );
}

function LotDetail({ lot, moves, vName, aName, sCode, onClose }) {
  const rem = lotRemaining(lot);
  return (
    <Modal title={`Lô ${lot.code} — ${lot.crop}`} onClose={onClose}
      footer={<button className="btn btn-primary" onClick={onClose}>Đóng</button>}>
      <div className="detail-stats" style={{ marginBottom: 12 }}>
        <div className="detail-stat"><b>{lot.qtyIn?.toLocaleString('vi-VN')} kg</b><span>Nhập kho</span></div>
        <div className="detail-stat"><b>{rem.toLocaleString('vi-VN')} kg</b><span>Còn tồn</span></div>
        <div className="detail-stat"><b>{money(lotValue(lot))}</b><span>Giá trị tồn</span></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '.83rem', marginBottom: 14 }}>
        <div><b>Nhà cung cấp:</b> {vName(lot.vendorId)}</div>
        <div><b>Vùng trồng nguồn:</b> {aName(lot.growingAreaId)}</div>
        <div><b>Kho:</b> {lot.warehouse || '—'}</div>
        <div><b>Giá vốn:</b> {money(lot.unitCost)}/kg</div>
        <div><b>Ngày thu hoạch:</b> {fmtDate(lot.harvestDate)}</div>
        <div><b>Hạn dùng:</b> {fmtDate(lot.expiryDate)}</div>
      </div>
      <div className="card-title" style={{ marginBottom: 8 }}>Lịch sử xuất kho ({moves.length})</div>
      {moves.length ? moves.map(m => (
        <div key={m.id} className="act-item" style={{ padding: '6px 0', alignItems: 'center' }}>
          <span className="badge b-blue" style={{ flex: 'none' }}>{m.qty} kg</span>
          <div style={{ flex: 1, fontSize: '.83rem' }}>
            {m.refType === 'shipment' && m.refId ? <>Xuất cho lô hàng <b>{sCode(m.refId)}</b></> : 'Xuất thủ công'}
            {m.note ? ` · ${m.note}` : ''}
          </div>
          <small style={{ color: 'var(--muted)' }}>{fmtDate(m.date)}</small>
        </div>
      )) : <p style={{ fontSize: '.82rem', color: 'var(--muted)' }}>Chưa xuất kho lần nào — toàn bộ {lot.qtyIn} kg còn trong kho.</p>}
    </Modal>
  );
}
