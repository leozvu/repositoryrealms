'use client';
// v3.19: Lô hàng xuất khẩu — trang lõi của Fretas.
// Chặn cứng ma trận thị trường (chanh dây/chôm chôm không đi được Nhật/Hàn/…), sinh checklist
// chứng từ theo thị trường, tính hạn xuất trình L/C, cảnh báo điều kiện đặc thù.
import { useState } from 'react';
import { useResource, Icon, FormModal, ConfirmDialog, EmptyState, Forbidden, useToast } from '@/components/ui';
import { moneyC, fmtDate, todayISO } from '@/lib/format';
import {
  MARKETS, CROPS, SHIPMENT_STATUS, INCOTERMS_SEA, INCOTERMS_AIR,
  marketBlocked, marketNotes, incotermValid, requiredDocs, presentationDeadline, CROP_TEMP,
} from '@/lib/export-trade';

const st = s => (SHIPMENT_STATUS.find(([k]) => k === s) || [s, s])[1];
const stColor = s => ({ draft: 'b-gray', booked: 'b-blue', packing: 'b-violet', customs: 'b-amber', shipped: 'b-blue', delivered: 'b-green', paid: 'b-green' }[s] || 'b-gray');

export default function ShipmentsPage() {
  const ships = useResource('shipments');
  const docs = useResource('shipmentdocs');
  const clients = useResource('clients');
  const areas = useResource('growingareas');
  const [modal, setModal] = useState(null);
  const [detail, setDetail] = useState(null);
  const toast = useToast();
  if (ships.forbidden) return <Forbidden />;

  const nextCode = () => {
    const y = new Date().getFullYear();
    const nums = ships.rows.map(s => { const m = (s.code || '').match(/(\d+)$/); return m ? +m[1] : 0; });
    return `LO-${y}-${String(Math.max(0, ...nums) + 1).padStart(3, '0')}`;
  };
  const docsOf = id => docs.rows.filter(d => d.shipmentId === id);
  const cName = id => clients.rows.find(c => c.id === id)?.name || '—';

  const saveShip = async d => {
    // chặn cứng ma trận thị trường — trả false để FormModal GIỮ modal mở (không mất dữ liệu nhập)
    const blocked = marketBlocked(d.crop, d.market);
    if (blocked) { toast(blocked, 'error'); return false; }
    if (d.incoterm && !incotermValid(d.incoterm, d.transportMode)) {
      toast(`Incoterm ${d.incoterm} không dùng cho vận chuyển ${d.transportMode === 'AIR' ? 'hàng không' : 'đường biển'}.`, 'error');
      return false;
    }
    const present = d.paymentMethod === 'LC' ? presentationDeadline(d.etd, d.lcExpiry) : null;
    const row = modal.row;
    const payload = { ...d, presentDeadline: present };
    if (row) { await ships.update(row.id, payload); toast('Đã lưu lô hàng'); }
    else {
      const created = await ships.create({ ...payload, code: nextCode() });
      if (created?.id) {
        for (const rq of requiredDocs(d.crop, d.market)) {
          await docs.create({ shipmentId: created.id, type: rq.type, status: 'pending', note: rq.required ? 'bắt buộc' : 'tùy chọn' });
        }
        await docs.refresh();
        toast(`Đã tạo ${created.code} + checklist chứng từ`);
      }
    }
    // FormModal tự đóng khi onSave không trả false
  };
  const toggleDoc = async d => { await docs.update(d.id, { status: d.status === 'done' ? 'pending' : 'done' }); };

  // cảnh báo L/C sắp tới hạn xuất trình
  const lcWarn = s => {
    if (s.paymentMethod !== 'LC' || !s.presentDeadline || s.status === 'paid') return null;
    const days = Math.round((new Date(s.presentDeadline) - new Date(todayISO())) / 86400000);
    if (days < 0) return { txt: `QUÁ HẠN xuất trình L/C ${-days} ngày`, danger: true };
    if (days <= 5) return { txt: `Còn ${days} ngày xuất trình chứng từ L/C`, danger: true };
    return { txt: `Hạn xuất trình L/C: ${fmtDate(s.presentDeadline)}`, danger: false };
  };

  const fields = (row) => [
    { key: 'crop', label: 'Mặt hàng', type: 'select', required: true, options: CROPS.map(c => ({ value: c, label: c })) },
    { key: 'market', label: 'Thị trường đích', type: 'select', required: true, options: Object.entries(MARKETS).map(([k, v]) => ({ value: k, label: v })) },
    { key: 'clientId', label: 'Người mua (buyer)', type: 'select', options: [{ value: '', label: '—' }, ...clients.rows.map(c => ({ value: c.id, label: c.name }))] },
    { key: 'transportMode', label: 'Vận chuyển', type: 'select', default: 'SEA', options: [{ value: 'SEA', label: 'Đường biển' }, { value: 'AIR', label: 'Hàng không' }] },
    { key: 'incoterm', label: 'Incoterm', type: 'select', default: 'FOB', options: [...new Set([...INCOTERMS_SEA, ...INCOTERMS_AIR])].map(i => ({ value: i, label: i })) },
    { key: 'currency', label: 'Đồng tiền', type: 'select', default: 'USD', options: ['USD', 'CNY', 'EUR', 'VND'].map(c => ({ value: c, label: c })) },
    { key: 'amount', label: 'Giá trị lô (theo đồng tiền trên)', type: 'number', required: true },
    { key: 'fxRate', label: 'Tỷ giá → VND', type: 'number', default: 1, hint: '1 ngoại tệ = ? VND (để quy đổi báo cáo)' },
    { key: 'weightKg', label: 'Khối lượng (kg)', type: 'number' },
    { key: 'paymentMethod', label: 'Thanh toán', type: 'select', default: 'TT', options: [{ value: 'TT', label: 'T/T (chuyển khoản)' }, { value: 'LC', label: 'L/C (tín dụng thư)' }, { value: 'DP', label: 'D/P' }, { value: 'DA', label: 'D/A' }] },
    { key: 'lcNo', label: 'Số L/C (nếu L/C)' },
    { key: 'lcExpiry', label: 'L/C hết hạn', type: 'date' },
    { key: 'containerType', label: 'Loại container', type: 'select', options: [{ value: '', label: '—' }, { value: '20RF', label: '20ft lạnh' }, { value: '40HC-RF', label: '40ft HC lạnh' }] },
    { key: 'containerNo', label: 'Số container' },
    { key: 'sealNo', label: 'Số seal' },
    { key: 'etd', label: 'Ngày tàu chạy (ETD)', type: 'date' },
    { key: 'eta', label: 'Dự kiến đến (ETA)', type: 'date' },
    { key: 'blNo', label: 'Số vận đơn (B/L)' },
    { key: 'growingAreaId', label: 'Vùng trồng nguồn', type: 'select', options: [{ value: '', label: '—' }, ...areas.rows.filter(a => a.type === 'PUC').map(a => ({ value: a.id, label: a.name }))] },
    { key: 'packingHouseId', label: 'Cơ sở đóng gói', type: 'select', options: [{ value: '', label: '—' }, ...areas.rows.filter(a => a.type === 'PHC').map(a => ({ value: a.id, label: a.name }))] },
    { key: 'status', label: 'Trạng thái', type: 'select', default: 'draft', options: SHIPMENT_STATUS.map(([k, l]) => ({ value: k, label: l })) },
    { key: 'note', label: 'Ghi chú', type: 'textarea', full: true },
  ];

  return (
    <>
      <div className="toolbar">
        <span style={{ fontSize: '.85rem', color: 'var(--muted)' }}>{ships.rows.length} lô hàng · chặn cứng thị trường cấm, checklist chứng từ tự sinh theo thị trường</span>
        <div className="spacer"></div>
        <button className="btn btn-primary" onClick={() => setModal({ row: null })}><Icon name="plus" size={16} /><span>Lô hàng mới</span></button>
      </div>

      {!ships.rows.length ? <EmptyState title="Chưa có lô hàng xuất" sub="Tạo lô hàng — hệ thống tự sinh checklist chứng từ (Invoice, Packing, B/L, Phyto, C/O…) theo thị trường và chặn các thị trường chưa mở cửa." /> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Mã lô</th><th>Mặt hàng</th><th>Thị trường</th><th>Buyer</th><th className="num">Giá trị</th><th>Thanh toán</th><th>Chứng từ</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>
              {ships.rows.map(s => {
                const ds = docsOf(s.id); const done = ds.filter(d => d.status === 'done').length;
                const w = lcWarn(s);
                return (
                  <tr key={s.id} className="clickable" onClick={() => setDetail(s)}>
                    <td><span className="cell-main">{s.code}</span>{w && <div className="cell-sub" style={{ color: w.danger ? 'var(--danger)' : 'var(--muted)', fontWeight: w.danger ? 700 : 400 }}>{w.txt}</div>}</td>
                    <td>{s.crop}</td>
                    <td>{MARKETS[s.market] || s.market}</td>
                    <td>{cName(s.clientId)}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{moneyC(s.amount, s.currency)}</td>
                    <td>{s.paymentMethod}</td>
                    <td style={{ color: ds.length && done === ds.length ? 'var(--accent)' : 'var(--muted)' }}>{done}/{ds.length}</td>
                    <td><span className={`badge ${stColor(s.status)}`}><span className="dot"></span>{st(s.status)}</span></td>
                    <td onClick={e => e.stopPropagation()}><div className="row-actions">
                      <button className="icon-btn" onClick={() => setModal({ row: s })} aria-label="Sửa"><Icon name="edit" size={15} /></button>
                      <button className="icon-btn danger" onClick={() => setModal({ del: s })} aria-label="Xóa"><Icon name="trash" size={15} /></button>
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && !modal.del && <FormModal title={modal.row ? `Sửa lô ${modal.row.code}` : 'Lô hàng xuất mới'} large
        data={modal.row || {}} onClose={() => setModal(null)} onSave={saveShip} fields={fields(modal.row)} />}
      {modal?.del && <ConfirmDialog msg={`Xóa lô ${modal.del.code}? Chứng từ của lô cũng sẽ mất.`}
        onClose={() => setModal(null)} onYes={async () => {
          for (const d of docsOf(modal.del.id)) await docs.remove(d.id);
          await ships.remove(modal.del.id); toast('Đã xóa lô hàng');
        }} />}

      {detail && <ShipmentDetail s={detail} docs={docsOf(detail.id)} area={areas.rows} onToggle={toggleDoc} onClose={() => setDetail(null)} />}
    </>
  );
}

function ShipmentDetail({ s, docs, area, onToggle, onClose }) {
  const notes = marketNotes(s.crop, s.market);
  const aName = id => area.find(a => a.id === id)?.name || '—';
  const DOC_LABEL = { invoice: 'Commercial Invoice', packing: 'Packing List', bl: 'Bill of Lading / AWB', phyto: 'Giấy kiểm dịch thực vật', co: 'C/O', irradiation: 'Chứng nhận chiếu xạ', customs: 'Tờ khai hải quan' };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><span className="modal-title">Lô {s.code} — {s.crop} đi {MARKETS[s.market] || s.market}</span>
          <button className="icon-btn" onClick={onClose} aria-label="Đóng"><Icon name="x" size={18} /></button></div>
        <div className="modal-body">
          <div className="detail-stats" style={{ marginBottom: 12 }}>
            <div className="detail-stat"><b>{moneyC(s.amount, s.currency)}</b><span>Giá trị · {s.incoterm}</span></div>
            <div className="detail-stat"><b>{s.paymentMethod}</b><span>Thanh toán</span></div>
            <div className="detail-stat"><b>{s.weightKg || 0} kg</b><span>{s.containerType || 'chưa gán cont'}</span></div>
          </div>

          {notes.length > 0 && <div className="card" style={{ marginBottom: 12, borderColor: 'var(--warn, #D97706)' }}>
            <div className="card-body" style={{ fontSize: '.82rem' }}>
              <b style={{ color: 'var(--warn, #D97706)' }}>Điều kiện đặc thù cần lưu:</b>
              <ul style={{ margin: '6px 0 0 18px' }}>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </div>
          </div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '.83rem', marginBottom: 14 }}>
            <div><b>Vùng trồng:</b> {aName(s.growingAreaId)}</div>
            <div><b>Cơ sở đóng gói:</b> {aName(s.packingHouseId)}</div>
            <div><b>Container/Seal:</b> {[s.containerNo, s.sealNo].filter(Boolean).join(' / ') || '—'}</div>
            <div><b>B/L:</b> {s.blNo || '—'}</div>
            <div><b>ETD → ETA:</b> {fmtDate(s.etd)} → {fmtDate(s.eta)}</div>
            {s.paymentMethod === 'LC' && <div><b>Hạn xuất trình L/C:</b> {fmtDate(s.presentDeadline)}</div>}
          </div>

          <div className="card-title" style={{ marginBottom: 8 }}>Bộ chứng từ ({docs.filter(d => d.status === 'done').length}/{docs.length})</div>
          {docs.map(d => (
            <label key={d.id} className="act-item" style={{ cursor: 'pointer', alignItems: 'center', padding: '6px 0' }}>
              <input type="checkbox" checked={d.status === 'done'} onChange={() => onToggle(d)} style={{ width: 'auto' }} />
              <span style={{ flex: 1, ...(d.status === 'done' ? { color: 'var(--muted)', textDecoration: 'line-through' } : {}) }}>{DOC_LABEL[d.type] || d.type}</span>
              {d.note === 'bắt buộc' && <span className="badge b-red" style={{ flex: 'none' }}>bắt buộc</span>}
            </label>
          ))}
          {!docs.length && <p style={{ fontSize: '.82rem', color: 'var(--muted)' }}>Chưa có checklist chứng từ.</p>}
        </div>
        <div className="modal-foot"><button className="btn btn-primary" onClick={onClose}>Đóng</button></div>
      </div>
    </div>
  );
}
