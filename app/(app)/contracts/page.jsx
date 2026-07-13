'use client';
import { useState } from 'react';
import { useResource, Icon, FormModal, ConfirmDialog, EmptyState, Forbidden, useToast } from '@/components/ui';
import { DocLinksModal } from '@/components/DocLinks';
import { money, fmtDate, todayISO, daysFromNow } from '@/lib/format';

const TYPE_LABEL = { client: ['HĐ khách hàng', 'b-blue'], vendor: ['HĐ nhà cung cấp', 'b-violet'], labor: ['HĐ lao động', 'b-gray'] };

export default function ContractsPage() {
  const { rows, forbidden, create, update, remove } = useResource('contracts');
  const [f, setF] = useState('all');
  const [modal, setModal] = useState(null);
  const toast = useToast();
  if (forbidden) return <Forbidden />;

  const FIELDS = [
    { key: 'code', label: 'Số hợp đồng', required: true },
    { key: 'type', label: 'Loại', type: 'select', options: Object.entries(TYPE_LABEL).map(([v, [l]]) => ({ value: v, label: l })) },
    { key: 'partner', label: 'Đối tác (khách / NCC / nhân sự)', required: true, full: true },
    { key: 'value', label: 'Giá trị (đ)', type: 'number' },
    { key: 'signDate', label: 'Ngày ký', type: 'date' },
    { key: 'startDate', label: 'Hiệu lực từ', type: 'date' },
    { key: 'endDate', label: 'Hết hạn', type: 'date' },
    { key: 'status', label: 'Trạng thái', type: 'select', options: [{ value: 'active', label: 'Đang hiệu lực' }, { value: 'expired', label: 'Đã hết hạn' }, { value: 'terminated', label: 'Đã thanh lý' }] },
    { key: 'note', label: 'Điều khoản chính / ghi chú', type: 'textarea', full: true },
  ];

  // v3.5: in phiếu hợp đồng (dùng #print-area như hóa đơn/báo giá)
  const printContract = async c => {
    const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const s = await (await fetch('/api/settings')).json();
    const fmtD = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('vi-VN') : '—';
    const [tl] = TYPE_LABEL[c.type] || [c.type];
    let area = document.getElementById('print-area');
    if (!area) { area = document.createElement('div'); area.id = 'print-area'; document.body.appendChild(area); }
    area.innerHTML = `
      <div class="doc">
        <div class="doc-head">
          <div><h2>${esc(s.company)}</h2><div>${esc(s.address || '')}</div>
            <div>MST: ${esc(s.taxCode || '')} · ${esc(s.phone || '')}</div><div>${esc(s.email || '')}</div></div>
          <div style="text-align:right"><h1>PHIẾU HỢP ĐỒNG</h1>
            <div><b>Số: ${esc(c.code)}</b></div><div>${esc(tl)}</div></div>
        </div>
        <table><tbody>
          <tr><td style="width:180px"><b>Đối tác</b></td><td>${esc(c.partner)}</td></tr>
          <tr><td><b>Giá trị hợp đồng</b></td><td><b>${money(c.value)}</b></td></tr>
          <tr><td><b>Ngày ký</b></td><td>${fmtD(c.signDate)}</td></tr>
          <tr><td><b>Hiệu lực</b></td><td>${fmtD(c.startDate)} → ${fmtD(c.endDate)}</td></tr>
          <tr><td><b>Trạng thái</b></td><td>${c.status === 'active' ? 'Đang hiệu lực' : c.status === 'expired' ? 'Đã hết hạn' : 'Đã thanh lý'}</td></tr>
        </tbody></table>
        ${c.note ? `<p style="margin-top:14px"><b>Điều khoản chính / ghi chú:</b><br>${esc(c.note).replace(/\n/g, '<br>')}</p>` : ''}
        <p style="margin-top:14px;font-size:.85em;color:#666">Phiếu tóm tắt phục vụ lưu trữ nội bộ — không thay thế bản hợp đồng có chữ ký pháp lý.</p>
        <div class="sign"><div><b>${esc(s.company)}</b><br><br><br><br>___________</div><div><b>${esc(c.partner)}</b><br><br><br><br>___________</div></div>
      </div>`;
    window.print();
  };

  const expiringSoon = rows.filter(c => c.status === 'active' && c.endDate && c.endDate >= todayISO() && c.endDate <= daysFromNow(30));
  const expired = rows.filter(c => c.status === 'active' && c.endDate && c.endDate < todayISO());
  const visible = rows.filter(c => f === 'all' || c.type === f);

  return (
    <>
      {(expiringSoon.length > 0 || expired.length > 0) && (
        <div className="card" style={{ padding: '13px 17px', marginBottom: 16, borderLeft: '4px solid var(--warn)' }}>
          <b style={{ fontSize: '.86rem' }}>⚠ Cần chú ý:</b>
          <span style={{ fontSize: '.83rem', color: 'var(--muted)', marginLeft: 8 }}>
            {expired.length > 0 && `${expired.length} hợp đồng đã quá hạn hiệu lực (${expired.map(c => c.code).join(', ')})`}
            {expired.length > 0 && expiringSoon.length > 0 && ' · '}
            {expiringSoon.length > 0 && `${expiringSoon.length} hợp đồng hết hạn trong 30 ngày tới (${expiringSoon.map(c => c.code).join(', ')})`}
          </span>
        </div>
      )}
      <div className="toolbar">
        <select className="filter" value={f} onChange={e => setF(e.target.value)}>
          <option value="all">Tất cả loại</option>
          {Object.entries(TYPE_LABEL).map(([v, [l]]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <div className="spacer"></div>
        <button className="btn btn-primary" onClick={() => setModal({ mode: 'add' })}><Icon name="plus" size={16} /><span>Thêm hợp đồng</span></button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Số HĐ</th><th>Loại</th><th>Đối tác</th><th className="num">Giá trị</th><th>Hiệu lực</th><th>Hết hạn</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>
            {visible.map(c => {
              const [tl, tc] = TYPE_LABEL[c.type] || [c.type, 'b-gray'];
              const nearEnd = c.status === 'active' && c.endDate && c.endDate <= daysFromNow(30);
              return (
                <tr key={c.id}>
                  <td><span className="cell-main">{c.code}</span></td>
                  <td><span className={`badge ${tc}`}>{tl}</span></td>
                  <td>{c.partner}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{money(c.value)}</td>
                  <td>{fmtDate(c.startDate)}</td>
                  <td style={nearEnd ? { color: 'var(--warn)', fontWeight: 700 } : {}}>{fmtDate(c.endDate)}{nearEnd ? ' ⚠' : ''}</td>
                  <td>{c.status === 'active' ? <span className="badge b-green"><span className="dot"></span>Hiệu lực</span>
                    : c.status === 'expired' ? <span className="badge b-red"><span className="dot"></span>Hết hạn</span>
                    : <span className="badge b-gray"><span className="dot"></span>Đã thanh lý</span>}</td>
                  <td><div className="row-actions">
                    <button className="icon-btn" title="In phiếu hợp đồng (PDF qua hộp thoại in)" onClick={() => printContract(c)}><Icon name="print" size={16} /></button>
                    <button className="icon-btn" title="Tài liệu / bản scan hợp đồng" onClick={() => setModal({ mode: 'docs', row: c })}>📎</button>
                    <button className="icon-btn" onClick={() => setModal({ mode: 'edit', row: c })} aria-label="Sửa"><Icon name="edit" size={16} /></button>
                    <button className="icon-btn danger" onClick={() => setModal({ mode: 'del', row: c })} aria-label="Xóa"><Icon name="trash" size={16} /></button>
                  </div></td>
                </tr>
              );
            })}
            {!visible.length && <tr><td colSpan={8}><EmptyState title="Chưa có hợp đồng" sub="Quản lý HĐ khách, HĐ nhà cung cấp, HĐ lao động — tự nhắc trước khi hết hạn 30 ngày" /></td></tr>}
          </tbody>
        </table>
      </div>
      {modal?.mode === 'add' && <FormModal title="Thêm hợp đồng" fields={FIELDS} data={{ type: 'client', status: 'active', signDate: todayISO() }}
        onClose={() => setModal(null)} onSave={async d => { await create({ ...d, value: +d.value || 0 }); toast('Đã thêm hợp đồng'); }} />}
      {modal?.mode === 'edit' && <FormModal title="Sửa hợp đồng" fields={FIELDS} data={modal.row}
        onClose={() => setModal(null)} onSave={async d => { await update(modal.row.id, { ...d, value: +d.value || 0 }); toast('Đã cập nhật'); }} />}
      {modal?.mode === 'docs' && <DocLinksModal refType="contract" refId={modal.row.id} name={modal.row.code} onClose={() => setModal(null)} />}
      {modal?.mode === 'del' && <ConfirmDialog msg={`Xóa hợp đồng ${modal.row.code}?`}
        onClose={() => setModal(null)} onYes={async () => { await remove(modal.row.id); toast('Đã xóa'); }} />}
    </>
  );
}
