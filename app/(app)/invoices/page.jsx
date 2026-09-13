'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useResource, ResourceError, Icon, Modal, ConfirmDialog, EmptyState, Badge, Forbidden, ExportCsv, AsyncButton, useToast } from '@/components/ui';
import { printDoc, nextCode } from '@/components/DocEditor';
import { SendEmailModal } from '@/components/SendEmail';
import { money, moneyC, fmtDate, todayISO, docGrand, paidOf, remainOf } from '@/lib/format';
import { paymentAttempt } from '@/lib/payment-attempt';
import { financialConversionIssues, invoiceCollectedVnd, invoiceReceivableVnd } from '@/lib/financial-reporting';
import PageHeader from '@/components/system/PageHeader';

function PayModal({ inv, onDone, onClose }) {
  const remain = remainOf(inv);
  const [amount, setAmount] = useState(remain);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const attempt = useRef(null);
  const toast = useToast();
  const submit = async () => {
    if (busyRef.current) return;
    const body = { amount: +amount, date, note };
    if (!Number.isFinite(body.amount) || body.amount <= 0 || body.amount > remain || !date) {
      toast('Kiểm tra số tiền thu và ngày thu trước khi ghi nhận.', 'error');
      return;
    }
    attempt.current = paymentAttempt(attempt.current, body);
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await fetch(`/api/invoices/${inv.id}/pay`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': attempt.current.key },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return toast(json.error || 'Chưa xác nhận được thanh toán. Hãy thử lại cùng yêu cầu.', 'error');
      if (json.id !== inv.id || json._blocked) return toast(json._notice || 'Chưa xác minh được thanh toán. Giữ nguyên thông tin để kiểm tra lại an toàn.', 'error');
      attempt.current = null;
      toast('Đã ghi nhận thanh toán và ghi vào sổ quỹ');
      onDone(); onClose();
    } catch {
      toast('Mất kết nối khi xác nhận thanh toán. Giữ nguyên thông tin và bấm Ghi nhận để kiểm tra lại an toàn.', 'error');
    } finally { busyRef.current = false; setBusy(false); }
  };
  const close = () => { if (!busyRef.current) onClose(); };
  return (
    <Modal title={`Ghi nhận thanh toán · ${inv.code}`} onClose={close}
      footer={<><button className="btn btn-outline" disabled={busy} onClick={close}>Hủy</button>
        <button className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? 'Đang xác nhận…' : 'Ghi nhận'}</button></>}>
      <div className="detail-stats">
        <div className="detail-stat"><b>{moneyC(docGrand(inv), inv.currency)}</b><span>Tổng hóa đơn</span></div>
        <div className="detail-stat"><b style={{ color: 'var(--accent)' }}>{moneyC(paidOf(inv), inv.currency)}</b><span>Đã thu</span></div>
        <div className="detail-stat"><b style={{ color: 'var(--warn)' }}>{moneyC(remain, inv.currency)}</b><span>Còn lại</span></div>
      </div>
      <div className="form-grid">
        <div className="field"><label>Số tiền thu ({inv.currency || 'VND'}) <span className="req">*</span></label>
          <input aria-label="Số tiền thu" type="number" min="1" step="1" max={remain} disabled={busy} value={amount} onChange={e => setAmount(e.target.value)} />
          <div className="hint">Thu đủ sẽ tự chuyển trạng thái &quot;Đã thu&quot;</div></div>
        <div className="field"><label>Ngày thu</label><input aria-label="Ngày thu" type="date" disabled={busy} value={date} onChange={e => setDate(e.target.value)} /></div>
        <div className="field full"><label>Ghi chú</label><input aria-label="Ghi chú thanh toán" disabled={busy} value={note} onChange={e => setNote(e.target.value)} placeholder="VD: chuyển khoản đợt 1" /></div>
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
  const [preview, setPreview] = useState({ projectId: '', loading: false, data: null, error: '' });
  const [previewVersion, setPreviewVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const toast = useToast();
  const pv = preview.projectId === projectId ? preview.data : null;
  const previewError = preview.projectId === projectId ? preview.error : '';
  const previewLoading = !!projectId && (preview.projectId !== projectId || preview.loading);

  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    let active = true;
    setPreview({ projectId, loading: true, data: null, error: '' });
    (async () => {
      try {
        const response = await fetch(`/api/invoices/from-hours?projectId=${encodeURIComponent(projectId)}`, { signal: controller.signal, cache: 'no-store' });
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error || 'Không thể tải giờ công. Hãy thử lại.');
        if (!Array.isArray(body?.lines) || !Number.isFinite(body.totalHours)) throw new Error('Chưa xác minh được dữ liệu giờ công. Hãy thử tải lại.');
        if (active) setPreview({ projectId, loading: false, data: body, error: '' });
      } catch (error) {
        if (active) setPreview({ projectId, loading: false, data: null, error: error.message || 'Không thể tải giờ công. Hãy thử lại.' });
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [projectId, previewVersion]);

  const tong = pv && +rate ? Math.round(pv.totalHours * +rate) : 0;
  const submit = async () => {
    if (busyRef.current || !pv?.totalHours) return;
    if (!Number.isFinite(+rate) || +rate <= 0 || !Number.isFinite(+dueDays) || +dueDays < 0) {
      toast('Kiểm tra đơn giá giờ và số ngày đến hạn trước khi tạo hóa đơn.', 'error');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await fetch('/api/invoices/from-hours', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, rate: +rate, dueDays: +dueDays }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) return toast(j?.error || 'Không thể tạo hóa đơn từ giờ công.', 'error');
      if (!j?.id || !j.code || j._blocked) return toast(j?._notice || 'Chưa xác minh được kết quả. Hãy kiểm tra danh sách hóa đơn và giờ công trước khi thử lại.', 'error');
      toast(`Đã tạo ${j.code} từ ${j._hours}h của ${j._people} người. Giờ đó đã được đánh dấu là đã xuất.`);
      onDone(); onClose();
    } catch {
      toast('Kết nối bị gián đoạn; chưa xác minh được kết quả. Hãy kiểm tra danh sách hóa đơn và giờ công trước khi thử lại.', 'error');
    } finally { busyRef.current = false; setBusy(false); }
  };
  const close = () => { if (!busyRef.current) onClose(); };

  return (
    <Modal title="Xuất hóa đơn từ giờ công" onClose={close}
      footer={<><button className="btn btn-outline" disabled={busy} onClick={close}>Hủy</button>
        <button className="btn btn-primary" disabled={busy || !pv?.totalHours || !+rate} onClick={submit}>
          {busy ? 'Đang tạo…' : 'Tạo hóa đơn nháp'}</button></>}>
      <div className="form-grid">
        <div className="field"><label>Dự án <span className="req">*</span></label>
          <select aria-label="Dự án xuất giờ công" disabled={busy} value={projectId} onChange={e => setProjectId(e.target.value)}>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></div>
        <div className="field"><label>Đơn giá giờ xuất cho khách (đ) <span className="req">*</span></label>
          <input aria-label="Đơn giá giờ xuất cho khách" type="number" min="0" disabled={busy} value={rate} onChange={e => setRate(e.target.value)} placeholder="VD: 300000" />
          <div className="hint">Đây là giá bán cho khách, khác đơn giá trả nhân sự</div></div>
        <div className="field"><label>Hạn thu (ngày)</label>
          <input aria-label="Hạn thu theo ngày" type="number" min="0" disabled={busy} value={dueDays} onChange={e => setDueDays(e.target.value)} /></div>

        <div className="field full">
          <ResourceError error={previewError} onRetry={() => setPreviewVersion(value => value + 1)} loading={previewLoading} />
          {!projectId ? <div>Chọn dự án để xem giờ công.</div>
            : previewLoading ? <div role="status" style={{ fontSize: '.85rem', color: 'var(--muted)' }}>Đang xem giờ chưa xuất…</div>
            : !pv ? null : !pv.totalHours ? <div style={{ fontSize: '.85rem', color: 'var(--muted)' }}>Dự án này không còn giờ nào chưa xuất hóa đơn.</div>
              : <>
                <div style={{ fontSize: '.85rem', marginBottom: 6 }}><b>{pv.totalHours}h</b> chưa xuất, sẽ thành {pv.lines.length} dòng hóa đơn:</div>
                <table style={{ fontSize: '.82rem' }}>
                  <thead><tr><th>Nhân sự</th><th className="num">Giờ</th><th className="num">Thành tiền</th></tr></thead>
                  <tbody>{pv.lines.map(l => (
                    <tr key={l.userId}><td>{l.name}</td><td className="num">{l.hours}h</td>
                      <td className="num">{+rate ? money(Math.round(l.hours * +rate)) : 'Chưa có'}</td></tr>
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
  const { rows, loading, error, forbidden, mutating, create, remove, refresh } = useResource('invoices');
  const clients = useResource('clients');
  const projects = useResource('projects');
  const [f, setF] = useState('all');
  const [modal, setModal] = useState(null);
  const toast = useToast();
  const router = useRouter();
  if (forbidden) return <Forbidden />;

  const client = id => clients.rows.find(c => c.id === id);
  const unavailable = loading || !!error;
  const clientUnavailable = clients.loading || !!clients.error || clients.forbidden;
  const projectUnavailable = projects.loading || !!projects.error || projects.forbidden;
  const conversionIssues = financialConversionIssues({ invoices: rows });
  const collected = conversionIssues.length ? null : rows.filter(v => !['draft', 'void'].includes(v.status)).reduce((sum, v) => sum + invoiceCollectedVnd(v), 0);
  const totalOf = s => conversionIssues.length ? null : rows.filter(v => v.status === s).reduce((sum, v) => sum + invoiceReceivableVnd(v), 0);
  const totalLabel = value => unavailable ? '—' : value === null ? 'Cần kiểm tra tỷ giá' : money(value);
  const filtered = rows.filter(v => f === 'all' || v.status === f);

  // v3.13: sinh hóa đơn kỳ tới cho retainer. Trước đây "định kỳ" chỉ là cái tick trang trí:
  // không có cron, không có nút nhân bản — tháng nào cũng phải gõ lại tay từ đầu.
  const nextPeriod = async v => {
    if (mutating || unavailable) return false;
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
    if (r) toast(`Đã tạo ${code} cho kỳ ${date.slice(0, 7)}. Hãy kiểm tra rồi gửi khách.`);
  };

  return (
    <div className="record-index-page">
      <PageHeader
        icon="invoices"
        meta="Tài chính · Phải thu"
        title="Hóa đơn và thu tiền"
        description="Theo dõi số đã thu, số còn lại, hạn thanh toán và lịch sử xử lý."
        actions={<button className="btn btn-primary" disabled={mutating || clientUnavailable} onClick={() => {
          if (!clients.rows.length) return toast('Hãy thêm khách hàng trước', 'error');
          router.push('/invoices/new');
        }}><Icon name="plus" size={16} />Tạo hóa đơn</button>}
      />
      <ResourceError error={error} onRetry={refresh} loading={loading} />
      <ResourceError error={clients.error && `Khách hàng: ${clients.error}`} onRetry={clients.refresh} loading={clients.loading} />
      <ResourceError error={projects.error && `Dự án: ${projects.error}`} onRetry={projects.refresh} loading={projects.loading} />
      <div className="grid kpi-grid" style={{ marginBottom: 16 }}>
        <div className="card kpi"><span className="kpi-label">Đã thu · quy đổi VND</span><div className="kpi-value" style={{ color: 'var(--accent)' }}>{totalLabel(collected)}</div></div>
        <div className="card kpi"><span className="kpi-label">Còn chờ thanh toán · VND</span><div className="kpi-value">{totalLabel(totalOf('sent'))}</div></div>
        <div className="card kpi"><span className="kpi-label">Còn quá hạn · VND</span><div className="kpi-value" style={{ color: 'var(--danger)' }}>{totalLabel(totalOf('overdue'))}</div></div>
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
          { key: 'currency', label: 'Đồng tiền' }, { key: 'fxRate', label: 'Tỷ giá ghi sổ VND' },
          { label: 'Còn lại', value: v => remainOf(v) }, { key: 'status', label: 'Trạng thái' },
        ]} />
        {/* v3.13: nối giờ công vào hóa đơn — trước đây phải gõ tay lại */}
        <button className="btn btn-outline" disabled={mutating || projectUnavailable} onClick={() => {
          if (!projects.rows.some(project => project.status !== 'done')) return toast('Chưa có dự án đang làm để xuất giờ công', 'error');
          setModal({ mode: 'fromHours' });
        }}><Icon name="clock" size={16} /><span>Xuất từ giờ công</span></button>
        <button className="btn btn-primary" disabled={mutating || clientUnavailable} onClick={() => {
          if (!clients.rows.length) return toast('Hãy thêm khách hàng trước', 'error');
          router.push('/invoices/new');
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
                <td>{client(v.clientId)?.name || (clientUnavailable ? 'Chưa tải được khách hàng' : 'Chưa có khách hàng')}</td>
                <td>{fmtDate(v.date)}</td>
                <td style={v.status === 'overdue' ? { color: 'var(--danger)', fontWeight: 600 } : {}}>{fmtDate(v.dueDate)}</td>
                <td className="num" style={{ fontWeight: 700 }}>{moneyC(docGrand(v), v.currency)}</td>
                <td className="num" style={{ fontWeight: 600, color: remainOf(v) > 0 ? 'var(--warn)' : 'var(--accent)' }}>{remainOf(v) > 0 ? moneyC(remainOf(v), v.currency) : '✓ đủ'}</td>
                <td><Badge map="invoice" k={v.status} /></td>
                <td><div className="row-actions">
                  {v.status !== 'paid' && <button className="icon-btn" disabled={mutating} style={{ color: 'var(--accent)' }} title="Ghi nhận thanh toán"
                    onClick={() => setModal({ mode: 'pay', row: v })}><Icon name="wallet" size={16} /></button>}
                  {/* v3.13: nhân bản retainer sang kỳ tới, cùng recGroup để MRR không cộng dồn */}
                  {v.recurring && <AsyncButton className="icon-btn" disabled={mutating || unavailable} pendingLabel="…" style={{ color: 'var(--primary)' }} title="Sinh hóa đơn kỳ tới (tháng sau)"
                    onClick={() => nextPeriod(v)}><Icon name="repeat" size={16} /></AsyncButton>}
                  <button className="icon-btn" disabled={mutating || clientUnavailable} title="Gửi email cho khách" aria-label={`Gửi email hóa đơn ${v.code}`}
                    onClick={() => setModal({ mode: 'email', row: v })}><Icon name="mail" size={16} /></button>
                  <button className="icon-btn" disabled={mutating || clientUnavailable} title="In / xuất PDF" onClick={() => printDoc(v, 'invoice', client(v.clientId)?.name || '', client(v.clientId) || {})}><Icon name="print" size={16} /></button>
                  <button className="icon-btn" disabled={mutating} onClick={() => router.push(`/invoices/${v.id}`)} aria-label="Mở trình soạn hóa đơn"><Icon name="edit" size={16} /></button>
                  <button className="icon-btn danger" disabled={mutating} onClick={() => setModal({ mode: 'del', row: v })} aria-label="Xóa"><Icon name="trash" size={16} /></button>
                </div></td>
              </tr>
            ))}
            {loading && <tr><td colSpan={8} role="status">Đang tải hóa đơn…</td></tr>}
            {!error && !loading && !filtered.length && <tr><td colSpan={8}><EmptyState title="Chưa có hóa đơn" /></td></tr>}
          </tbody>
        </table>
      </div>
      {modal?.mode === 'pay' && <PayModal inv={modal.row} onDone={refresh} onClose={() => setModal(null)} />}
      {modal?.mode === 'fromHours' && <FromHoursModal projects={projects.rows.filter(p => p.status !== 'done')}
        onDone={refresh} onClose={() => setModal(null)} />}
      {modal?.mode === 'email' && <SendEmailModal type="invoice" doc={modal.row} defaultTo={client(modal.row.clientId)?.email || ''} onClose={() => setModal(null)} />}
      {modal?.mode === 'del' && <ConfirmDialog msg={`Xóa hóa đơn ${modal.row.code}?`}
        onClose={() => setModal(null)} onYes={async () => { const result = await remove(modal.row.id); if (!result) return false; toast('Đã xóa'); return true; }} />}
    </div>
  );
}
