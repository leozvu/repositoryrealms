'use client';
// v3.34: Tra cứu thị trường xuất khẩu — ma trận tiếp cận + kiểm tra nhanh một cặp mặt hàng×thị
// trường (đi được không, cần chứng từ gì, điều kiện đặc thù, nhiệt độ bảo quản). Dựa trên
// lib/export-trade (ràng buộc đã kiểm chứng). Giúp sales/ops quyết feasibility trước khi chốt.
import { useState } from 'react';
import { Icon, Forbidden, useResource } from '@/components/ui';
import { MARKETS, CROPS, marketBlocked, marketNotes, requiredDocs, CROP_TEMP } from '@/lib/export-trade';

export default function MarketsPage() {
  const probe = useResource('shipments'); // chỉ để kiểm quyền/phân hệ (export)
  const [crop, setCrop] = useState(CROPS[0]);
  const [market, setMarket] = useState('CN');
  if (probe.forbidden) return <Forbidden />;

  const blocked = marketBlocked(crop, market);
  const notes = marketNotes(crop, market);
  const docs = requiredDocs(crop, market);
  const DOC_LABEL = { invoice: 'Commercial Invoice', packing: 'Packing List', bl: 'Bill of Lading / AWB', phyto: 'Kiểm dịch thực vật (Phyto)', co: 'C/O', irradiation: 'Chứng nhận chiếu xạ', customs: 'Tờ khai hải quan XK' };

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><span className="card-title">Kiểm tra nhanh: mặt hàng đi thị trường</span></div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <select className="filter" value={crop} onChange={e => setCrop(e.target.value)}>{CROPS.map(c => <option key={c} value={c}>{c}</option>)}</select>
            <select className="filter" value={market} onChange={e => setMarket(e.target.value)}>{Object.entries(MARKETS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </div>

          <div className="card" style={{ borderLeft: `4px solid ${blocked ? 'var(--danger)' : 'var(--accent)'}`, marginBottom: 12 }}>
            <div className="card-body" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Icon name={blocked ? 'alert' : 'check'} size={20} />
              <div>
                <b style={{ color: blocked ? 'var(--danger)' : 'var(--accent)' }}>{blocked ? 'CHƯA XUẤT ĐƯỢC' : 'Được phép xuất khẩu'}</b>
                <div style={{ fontSize: '.85rem', marginTop: 2 }}>{blocked || `${crop} đi ${MARKETS[market]} — thị trường đã mở cửa.`}</div>
                {CROP_TEMP[crop] && <div style={{ fontSize: '.8rem', color: 'var(--muted)', marginTop: 4 }}>Nhiệt độ bảo quản/container: <b>{CROP_TEMP[crop]}</b></div>}
              </div>
            </div>
          </div>

          {!blocked && (
            <>
              {notes.length > 0 && <div style={{ fontSize: '.83rem', marginBottom: 12 }}>
                <b style={{ color: 'var(--warn, #D97706)' }}>Điều kiện đặc thù:</b>
                <ul style={{ margin: '4px 0 0 18px' }}>{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
              </div>}
              <div style={{ fontSize: '.83rem' }}>
                <b>Bộ chứng từ cần chuẩn bị:</b>
                <ul style={{ margin: '4px 0 0 18px' }}>{docs.map(d => <li key={d.type}>{DOC_LABEL[d.type] || d.type} {d.required ? <span className="badge b-red" style={{ marginLeft: 4 }}>bắt buộc</span> : <span className="badge b-gray" style={{ marginLeft: 4 }}>ưu đãi thuế</span>}</li>)}</ul>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><span className="card-title">Ma trận tiếp cận thị trường</span></div>
        <div className="table-wrap" style={{ border: 'none', boxShadow: 'none' }}>
          <table>
            <thead><tr><th>Mặt hàng</th>{Object.values(MARKETS).map(v => <th key={v} className="num">{v}</th>)}</tr></thead>
            <tbody>
              {CROPS.map(c => (
                <tr key={c}>
                  <td><b>{c}</b></td>
                  {Object.keys(MARKETS).map(mk => {
                    const b = marketBlocked(c, mk);
                    return <td key={mk} className="num" style={{ color: b ? 'var(--danger)' : 'var(--accent)', fontWeight: 700 }} title={b || 'Được phép'}>{b ? '✗' : '✓'}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: '.74rem', color: 'var(--muted)', padding: '0 18px 14px' }}>✓ = đã mở cửa · ✗ = chưa có phép/cấm. Ràng buộc pháp lý đã kiểm chứng (nghị định thư TQ, APHIS, EU). Rê chuột vào ô ✗ để xem lý do.</p>
      </div>
    </>
  );
}
