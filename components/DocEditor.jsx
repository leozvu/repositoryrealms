'use client';
// Trình soạn báo giá / hóa đơn dùng chung: items động, VAT, chọn nhanh từ bảng giá
import { useState } from 'react';
import { Modal, Icon, useToast } from './ui';
import { money, todayISO, daysFromNow, parseItems } from '@/lib/format';

export function nextCode(prefix, list) {
  const year = new Date().getFullYear();
  const nums = list.map(d => { const m = (d.code || '').match(/(\d+)$/); return m ? +m[1] : 0; });
  return `${prefix}-${year}-${String(Math.max(0, ...nums) + 1).padStart(3, '0')}`;
}

const STATUS = {
  invoice: [['draft', 'Nháp'], ['sent', 'Đã gửi'], ['overdue', 'Quá hạn'], ['paid', 'Đã thu']],
  quote: [['draft', 'Nháp'], ['sent', 'Đã gửi'], ['accepted', 'Chấp nhận'], ['rejected', 'Từ chối']],
};

export default function DocEditor({ kind, doc, clients, projects = [], services = [], allDocs, onSave, onClose }) {
  const isInv = kind === 'invoice';
  const [d, setD] = useState(() => doc ? { ...doc, items: parseItems(doc.items) } : {
    code: nextCode(isInv ? 'INV' : 'BG', allDocs), clientId: clients[0]?.id || '', projectId: '',
    items: [{ desc: '', qty: 1, price: 0 }], vat: 8, status: 'draft', date: todayISO(),
    ...(isInv ? { dueDate: daysFromNow(15), recurring: false } : { note: '' }),
  });
  const toast = useToast();
  const setItem = (i, k, v) => setD(x => ({ ...x, items: x.items.map((it, j) => j === i ? { ...it, [k]: v } : it) }));
  const sub = d.items.reduce((s, it) => s + (+it.qty || 0) * (+it.price || 0), 0);

  const save = () => {
    const items = d.items.filter(it => it.desc.trim());
    if (!items.length) return toast('Cần ít nhất một hạng mục', 'error');
    const out = {
      code: d.code, clientId: d.clientId,
      items: JSON.stringify(items.map(it => ({ desc: it.desc, qty: +it.qty || 0, price: +it.price || 0 }))),
      vat: +d.vat || 0, status: d.status, date: d.date,
    };
    if (isInv) { out.projectId = d.projectId || null; out.dueDate = d.dueDate; out.recurring = !!d.recurring; }
    else out.note = d.note || null;
    onSave(out);
    onClose();
  };

  return (
    <Modal title={(doc ? 'Sửa' : 'Tạo') + (isInv ? ' hóa đơn — ' : ' báo giá — ') + d.code} large onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose}>Hủy</button>
        <button className="btn btn-primary" onClick={save}>Lưu {isInv ? 'hóa đơn' : 'báo giá'}</button></>}>
      <div className="form-grid" style={{ marginBottom: 16 }}>
        <div className="field"><label>Khách hàng <span className="req">*</span></label>
          <select value={d.clientId} onChange={e => setD({ ...d, clientId: e.target.value })}>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        {isInv && <div className="field"><label>Dự án</label>
          <select value={d.projectId || ''} onChange={e => setD({ ...d, projectId: e.target.value })}>
            <option value="">— Không thuộc dự án —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>}
        <div className="field"><label>Ngày lập</label><input type="date" value={d.date} onChange={e => setD({ ...d, date: e.target.value })} /></div>
        {isInv && <div className="field"><label>Hạn thanh toán</label><input type="date" value={d.dueDate || ''} onChange={e => setD({ ...d, dueDate: e.target.value })} /></div>}
        <div className="field"><label>Trạng thái</label>
          <select value={d.status} onChange={e => setD({ ...d, status: e.target.value })}>
            {STATUS[kind].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="field"><label>VAT (%)</label><input type="number" min="0" max="100" value={d.vat} onChange={e => setD({ ...d, vat: e.target.value })} /></div>
        {isInv && <div className="field full"><label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={!!d.recurring} onChange={e => setD({ ...d, recurring: e.target.checked })} />
          Hóa đơn định kỳ hàng tháng (retainer)</label></div>}
      </div>
      <table className="items-table">
        <thead><tr><th>Hạng mục</th><th className="num">SL</th><th className="num">Đơn giá (đ)</th><th className="num">Thành tiền</th><th></th></tr></thead>
        <tbody>
          {d.items.map((it, i) => (
            <tr key={i}>
              <td style={{ width: '46%' }}><input value={it.desc} placeholder="Nội dung / hạng mục" onChange={e => setItem(i, 'desc', e.target.value)} /></td>
              <td style={{ width: '13%' }}><input className="num" type="number" min="0" step="any" value={it.qty} onChange={e => setItem(i, 'qty', e.target.value)} /></td>
              <td style={{ width: '22%' }}><input className="num" type="number" min="0" step="any" value={it.price} onChange={e => setItem(i, 'price', e.target.value)} /></td>
              <td className="num" style={{ width: '15%', fontWeight: 600 }}>{money((+it.qty || 0) * (+it.price || 0))}</td>
              <td style={{ width: '4%' }}>{d.items.length > 1 &&
                <button className="icon-btn danger" onClick={() => setD(x => ({ ...x, items: x.items.filter((_, j) => j !== i) }))} aria-label="Xóa dòng"><Icon name="x" size={14} /></button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-outline btn-sm" onClick={() => setD(x => ({ ...x, items: [...x.items, { desc: '', qty: 1, price: 0 }] }))}>
          <Icon name="plus" size={14} /> Thêm dòng</button>
        {services.length > 0 && (
          <select className="filter" style={{ fontSize: '.8rem' }} value=""
            onChange={e => {
              const sv = services.find(x => x.id === e.target.value);
              if (sv) setD(x => ({ ...x, items: [...x.items, { desc: sv.name, qty: 1, price: sv.price }] }));
            }}>
            <option value="">— Thêm nhanh từ bảng giá dịch vụ —</option>
            {services.map(sv => <option key={sv.id} value={sv.id}>{sv.name} · {money(sv.price)}/{sv.unit || 'đv'}</option>)}
          </select>
        )}
      </div>
      <div className="totals">
        <div className="trow"><span>Tạm tính</span><b>{money(sub)}</b></div>
        <div className="trow"><span>VAT ({+d.vat || 0}%)</span><b>{money(sub * (+d.vat || 0) / 100)}</b></div>
        <div className="trow grand"><span>Tổng cộng</span><span>{money(sub * (1 + (+d.vat || 0) / 100))}</span></div>
      </div>
    </Modal>
  );
}

/* ---------- In / xuất PDF (dùng #print-area + CSS print có sẵn) ---------- */
export async function printDoc(doc, kind, clientName, clientInfo = {}) {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const s = await (await fetch('/api/settings')).json();
  const items = parseItems(doc.items);
  const sub = items.reduce((t, it) => t + it.qty * it.price, 0);
  const vat = sub * (doc.vat || 0) / 100;
  const fmtD = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('vi-VN') : '';
  let area = document.getElementById('print-area');
  if (!area) { area = document.createElement('div'); area.id = 'print-area'; document.body.appendChild(area); }
  area.innerHTML = `
    <div class="doc">
      <div class="doc-head">
        <div><h2>${esc(s.company)}</h2><div>${esc(s.address || '')}</div>
          <div>MST: ${esc(s.taxCode || '')} · ${esc(s.phone || '')}</div><div>${esc(s.email || '')}</div></div>
        <div style="text-align:right"><h1>${kind === 'invoice' ? 'HÓA ĐƠN' : 'BÁO GIÁ'}</h1>
          <div><b>Số: ${esc(doc.code)}</b></div><div>Ngày: ${fmtD(doc.date)}</div>
          ${kind === 'invoice' && doc.dueDate ? `<div>Hạn thanh toán: ${fmtD(doc.dueDate)}</div>` : ''}</div>
      </div>
      <div><b>Khách hàng:</b> ${esc(clientName)}<br>
        ${clientInfo.contact ? 'Người liên hệ: ' + esc(clientInfo.contact) + '<br>' : ''}
        ${clientInfo.address ? 'Địa chỉ: ' + esc(clientInfo.address) : ''}</div>
      <table><thead><tr><th style="width:40px">STT</th><th>Nội dung</th><th class="num">SL</th><th class="num">Đơn giá</th><th class="num">Thành tiền</th></tr></thead>
        <tbody>${items.map((it, i) => `<tr><td>${i + 1}</td><td>${esc(it.desc)}</td>
          <td class="num">${it.qty}</td><td class="num">${money(it.price)}</td><td class="num">${money(it.qty * it.price)}</td></tr>`).join('')}</tbody></table>
      <div class="doc-totals">
        <div><span>Tạm tính:</span><b>${money(sub)}</b></div>
        <div><span>VAT (${doc.vat || 0}%):</span><b>${money(vat)}</b></div>
        <div class="doc-grand"><span>TỔNG CỘNG:</span><b>${money(sub + vat)}</b></div>
      </div>
      ${s.bank ? `<p style="margin-top:18px"><b>Thông tin thanh toán:</b><br>${esc(s.bank)}</p>` : ''}
      <div class="sign"><div><b>Người lập</b><br><br><br><br>___________</div><div><b>Khách hàng xác nhận</b><br><br><br><br>___________</div></div>
    </div>`;
  window.print();
}
