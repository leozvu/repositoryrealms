'use client';
import { useState, useEffect } from 'react';
import { useResource, Icon, Modal, ConfirmDialog, EmptyState, Badge, Forbidden, ExportCsv, useToast } from '@/components/ui';
import DocEditor, { printDoc, nextCode } from '@/components/DocEditor';
import { SendEmailModal } from '@/components/SendEmail';
import { money, fmtDate, todayISO, docGrand, paidOf, remainOf } from '@/lib/format';

function PayModal({ inv, onDone, onClose }) {
  const remain = remainOf(inv);
  const [amount, setAmount] = useState(remain);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const toast = useToast();
  const submit = async () => {
    const res = await fetch(`/api/invoices/${inv.id}/pay`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: +amount, date, note }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return toast(json.error || 'Có lỗi', 'error');
    toast('Đã ghi nhận thanh toán và ghi vào sổ quỹ');
    onDone(); onClose();
  };
  return (
    <Modal title={`Ghi nhận thanh toán — ${inv.code}`} onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose}>Hủy</button>
        <button className="btn btn-primary" onClick={submit}>Ghi nhận</button></>}>
      <div className="detail-stats">
        <div className="detail-stat"><b>{money(docGrand(inv))}</b><span>Tổng hóa đơn</span></div>
        <div className="detail-stat"><b style={{ color: 'var(--accent)' }}>{money(paidOf(inv))}</b><span>Đã thu</span></div>
        <div className="detail-stat"><b style={{ color: 'var(--warn)' }}>{money(remain)}</b><span>Còn lại</span></div>
      </div>
      <div className="form-grid">
        <div className="field"><label>Số tiền thu <span className="req">*</span></label>
          <input type="number" min="1" max={remain} value={amount} onChange={e => setAmount(e.target.value)} />
          <div className="hint">Thu đủ sẽ tự chuyển trạng thái &quot;Đã thu&quot;</div></div>
        <div className="field"><label>Ngày thu</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
        <div className="field full"><label>Ghi chú</label><input value={note} onChange={e => setNote(e.target.value)} placeholder="VD: chuyển khoản đợt 1" /></div>
      </div>
    </Modal>
  );
}

/* ---------- v3.13: Xuất hóa đơn từ giờ công đã log ----------
   Trước đây giờ "có tính phí" ghi trong Bảng chấm giờ không đi đâu cả — muốn xuất hóa đơn
   theo giờ phải gõ tay lại từng dòng, và không có gì đánh dấu giờ nào đã xuất rồi. */
function FromHoursModal({ projects, onClose, onDone }) {
  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const [rate, setRate] = useState('');
  const [dueDays, setDueDays] = useState(15);
  const [pv, setPv] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!projectId) { setPv(null); return; }
    setPv(null);
    fetch(`/api/invoices/from-hours?projectId=${projectId}`).then(r => r.ok ? r.json() : null).then(setPv).catch(() => {});
  }, [projectId]);

  const tong = pv && +rate ? Math.round(pv.totalHours * +rate) : 0;
  const submit = async () => {
    setBusy(true);
    const res = await fetch('/api/invoices/from-hours', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, rate: +rate, dueDays: +dueDays }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast(j.error || 'Có lỗi', 'error');
    toast(`Đã tạo ${j.code} từ ${j._hours}h của ${j._people} người — giờ đó đã đánh dấu là đã xuất`);
    onDone(); onClose();
  };

  return (
    <Modal title="Xuất hóa đơn từ giờ công" onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose}>Hủy</button>
        <button className="btn btn-primary" disabled={busy || !pv?.totalHours || !+rate} onClick={submit}>
          {busy ? 'Đang tạo…' : 'Tạo hóa đơn nháp'}</button></>}>
      <div className="form-grid">
        <div className="field"><label>Dự án <span className="req">*</span></label>
          <select value={projectId} onChange={e => setProjectId(e.target.value)}>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></div>
        <div className="field"><label>Đơn giá giờ xuất cho khách (đ) <span className="req">*</span></label>
          <input type="number" min="0" value={rate} onChange={e => setRate(e.target.value)} placeholder="VD: 300000" />
          <div className="hint">Đây là giá bán cho khách, khác đơn giá trả nhân sự</div></div>
        <div className="field"><label>Hạn thu (ngày)</label>
          <input type="number" min="0" value={dueDays} onChange={e => setDueDays(e.target.value)} /></div>

        <div className="field full">
          {!pv ? <div style={{ fontSize: '.85rem', color: 'var(--muted)' }}>Đang xem giờ chưa xuất…</div>
            : !pv.totalHours ? <div style={{ fontSize: '.85rem', color: 'var(--muted)' }}>Dự án này không còn giờ nào chưa xuất hóa đơn.</div>
              : <>
                <div style={{ fontSize: '.85rem', marginBottom: 6 }}><b>{pv.totalHours}h</b> chưa xuất — sẽ thành {pv.lines.length} dòng hóa đơn:</div>
                <table style={{ fontSize: '.82rem' }}>
                  <thead><tr><th>Nhân sự</th><th className="num">Giờ</th><th className="num">Thành tiền</th></tr></thead>
                  <tbody>{pv.lines.map(l => (
                    <tr key={l.userId}><td>{l.name}</td><td className="num">{l.hours}h</td>
                      <td className="num">{+rate ? money(Math.round(l.hours * +rate)) : '—'}</td></tr>
                  ))}</tbody>
                </table>
                <div style={{ fontSize: '.9rem', marginTop: 8 }}>Tạm tính (chưa VAT): <b style={{ color: 'var(--primary)' }}>{money(tong)}</b></div>
              </>}
        </div>
      </div>
    </Modal>
  );
}

export default function InvoicesPage() {
  const { rows, forbidden, create, update, remove, refresh } = useResource('invoices');
  const clients = useResource('clients');
  const projects = useResource('projects');
  const services = useResource('services');
  const [f, setF] = useState('all');
  const [modal, setModal] = useState(null);
  const toast = useToast();
  if (forbidden) return <Forbidden />;

  const client = id => clients.rows.find(c => c.id === id);
  const totalOf = s => rows.filter(v => v.status === s).reduce((sum, v) => sum + docGrand(v), 0);
  const filtered = rows.filter(v => f === 'all' || v.status === f);

  // v3.13: sinh hóa đơn kỳ tới cho retainer. Trước đây "định kỳ" chỉ là cái tick trang trí:
  // không có cron, không có nút nhân bản — tháng nào cũng phải gõ lại tay từ đầu.
  const nextPeriod = async v => {
    const d = new Date(v.date + 'T00:00:00');
    d.setMonth(d.getMonth() + 1);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dd = new Date(date + 'T00:00:00'); dd.setDate(dd.getDate() + 15);
    const dueDate = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`;
    const code = nextCode('INV', rows);
    if (rows.some(x => x.recGroup && x.recGroup === v.recGroup && x.date === date)) {
      return toast(`Kỳ ${date.slice(0, 7)} của retainer này đã có hóa đơn rồi`, 'error');
    }
    const r = await create({
      code, clientId: v.clientId, projectId: v.projectId || null,
      items: v.items, vat: v.vat, status: 'draft', date, dueDate,
      payments: '[]', recurring: true,
      // cùng nhóm với kỳ trước → Phân tích chỉ tính kỳ mới nhất vào MRR, không cộng dồn
      recGroup: v.recGroup || `RET-${v.clientId}-${Date.now().toString(36)}`,
    });
    if (r) toast(`Đã tạo ${code} cho kỳ ${date.slice(0, 7)} — kiểm tra rồi gửi khách`);
  };

  return (
    <>
      <div className="grid kpi-grid" style={{ marginBottom: 16 }}>
        <div className="card kpi"><span className="kpi-label">Đã thu</span><div className="kpi-value" style={{ color: 'var(--accent)' }}>{money(totalOf('paid'))}</div></div>
        <div className="card kpi"><span className="kpi-label">Chờ thanh toán</span><div className="kpi-value">{money(totalOf('sent'))}</div></div>
        <div className="card kpi"><span className="kpi-label">Quá hạn</span><div className="kpi-value" style={{ color: 'var(--danger)' }}>{money(totalOf('overdue'))}</div></div>
      </div>
      <div className="toolbar">
        <select className="filter" value={f} onChange={e => setF(e.target.value)}>
          <option value="all">Tất cả trạng thái</option>
          <option value="draft">Nháp</option><option value="sent">Đã gửi</option>
          <option value="overdue">Quá hạn</option><option value="paid">Đã thu</option>
        </select>
        <div className="spacer"></div>
        <ExportCsv rows={filtered} name="hoa-don" cols={[
          { key: 'code', label: 'Mã' }, { label: 'Khách hàng', value: v => client(v.clientId)?.name || '' },
          { key: 'date', label: 'Ngày lập' }, { key: 'dueDate', label: 'Hạn thu' },
          { label: 'Tổng tiền', value: v => docGrand(v) }, { label: 'Đã thu', value: v => paidOf(v) },
          { label: 'Còn lại', value: v => remainOf(v) }, { key: 'status', label: 'Trạng thái' },
        ]} />
        {/* v3.13: nối giờ công vào hóa đơn — trước đây phải gõ tay lại */}
        <button className="btn btn-outline" onClick={() => {
          if (!projects.rows.length) return toast('Chưa có dự án nào', 'error');
          setModal({ mode: 'fromHours' });
        }}><Icon name="clock" size={16} /><span>Xuất từ giờ công</span></button>
        <button className="btn btn-primary" onClick={() => {
          if (!clients.rows.length) return toast('Hãy thêm khách hàng trước', 'error');
          setModal({ mode: 'add' });
        }}><Icon name="plus" size={16} /><span>Tạo hóa đơn</span></button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Mã</th><th>Khách hàng</th><th>Ngày lập</th><th>Hạn thu</th><th className="num">Tổng tiền</th><th className="num">Còn lại</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>
            {filtered.map(v => (
              <tr key={v.id}>
                <td><span className="cell-main" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {v.code}{v.recurring && <span title="Hóa đơn định kỳ" style={{ color: 'var(--primary)', display: 'inline-flex' }}><Icon name="repeat" size={14} /></span>}</span></td>
                <td>{client(v.clientId)?.name || '—'}</td>
                <td>{fmtDate(v.date)}</td>
                <td style={v.status === 'overdue' ? { color: 'var(--danger)', fontWeight: 600 } : {}}>{fmtDate(v.dueDate)}</td>
                <td className="num" style={{ fontWeight: 700 }}>{money(docGrand(v))}</td>
                <td className="num" style={{ fontWeight: 600, color: remainOf(v) > 0 ? 'var(--warn)' : 'var(--accent)' }}>{remainOf(v) > 0 ? money(remainOf(v)) : '✓ đủ'}</td>
                <td><Badge map="invoice" k={v.status} /></td>
                <td><div className="row-actions">
                  {v.status !== 'paid' && <button className="icon-btn" style={{ color: 'var(--accent)' }} title="Ghi nhận thanh toán"
                    onClick={() => setModal({ mode: 'pay', row: v })}><Icon name="wallet" size={16} /></button>}
                  {/* v3.13: nhân bản retainer sang kỳ tới, cùng recGroup để MRR không cộng dồn */}
                  {v.recurring && <button className="icon-btn" style={{ color: 'var(--primary)' }} title="Sinh hóa đơn kỳ tới (tháng sau)"
                    onClick={() => nextPeriod(v)}><Icon name="repeat" size={16} /></button>}
                  <button className="icon-btn" title="Gửi email cho khách" onClick={() => setModal({ mode: 'email', row: v })}>📧</button>
                  <button className="icon-btn" title="In / xuất PDF" onClick={() => printDoc(v, 'invoice', client(v.clientId)?.name || '', client(v.clientId) || {})}><Icon name="print" size={16} /></button>
                  <button className="icon-btn" onClick={() => setModal({ mode: 'edit', row: v })} aria-label="Sửa"><Icon name="edit" size={16} /></button>
                  <button className="icon-btn danger" onClick={() => setModal({ mode: 'del', row: v })} aria-label="Xóa"><Icon name="trash" size={16} /></button>
                </div></td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={8}><EmptyState title="Chưa có hóa đơn" /></td></tr>}
          </tbody>
        </table>
      </div>
      {modal?.mode === 'add' && <DocEditor kind="invoice" doc={null} clients={clients.rows} projects={projects.rows} services={services.rows} allDocs={rows}
        onClose={() => setModal(null)} onSave={async d => { await create({ ...d, payments: '[]' }); toast('Đã tạo hóa đơn'); }} />}
      {modal?.mode === 'edit' && <DocEditor kind="invoice" doc={modal.row} clients={clients.rows} projects={projects.rows} services={services.rows} allDocs={rows}
        onClose={() => setModal(null)} onSave={async d => { await update(modal.row.id, d); toast('Đã cập nhật'); }} />}
      {modal?.mode === 'pay' && <PayModal inv={modal.row} onDone={refresh} onClose={() => setModal(null)} />}
      {modal?.mode === 'fromHours' && <FromHoursModal projects={projects.rows.filter(p => p.status !== 'done')}
        onDone={refresh} onClose={() => setModal(null)} />}
      {modal?.mode === 'email' && <SendEmailModal type="invoice" doc={modal.row} defaultTo={client(modal.row.clientId)?.email || ''} onClose={() => setModal(null)} />}
      {modal?.mode === 'del' && <ConfirmDialog msg={`Xóa hóa đơn ${modal.row.code}?`}
        onClose={() => setModal(null)} onYes={async () => { await remove(modal.row.id); toast('Đã xóa'); }} />}
    </>
  );
}
