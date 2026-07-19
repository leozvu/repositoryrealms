'use client';
import { useEffect, useRef, useState } from 'react';
import { useResource, Icon, FormModal, ConfirmDialog, Forbidden, ExportCsv, AsyncButton, useToast } from '@/components/ui';
import { ActivitiesModal } from '@/components/Activities';
import { BarChart } from '@/components/charts';
import { money, moneyShort, initials, todayISO, localISO, LEAD_STAGES, leadScore, scoreColor } from '@/lib/format';

export default function LeadsPage() {
  const { rows, loading, forbidden, create, update, remove } = useResource('leads');
  const users = useResource('users');
  const clients = useResource('clients');
  const [modal, setModal] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [settings, setSettings] = useState(null);
  const toast = useToast();
  const focusedRecordRef = useRef(null);
  useEffect(() => { fetch('/api/settings').then(r => r.ok ? r.json() : null).then(setSettings).catch(() => {}); }, []);
  useEffect(() => {
    if (loading || typeof window === 'undefined') return;
    const focusId = new URLSearchParams(window.location.search).get('focus');
    if (!focusId || focusedRecordRef.current === focusId) return;
    focusedRecordRef.current = focusId;
    const lead = rows.find((row) => row.id === focusId);
    if (!lead) {
      toast('Không tìm thấy Lead hoặc bạn không còn quyền xem bản ghi này.', 'error');
      return;
    }
    setModal({ mode: 'edit', row: lead });
  }, [loading, rows, toast]);
  if (forbidden) return <Forbidden />;

  /* ---------- v3.4: forecast doanh thu weighted theo xác suất giai đoạn ---------- */
  const PROB = { new: settings?.probNew ?? 10, contacted: settings?.probContacted ?? 20, proposal: settings?.probProposal ?? 40, negotiation: settings?.probNegotiation ?? 60 };
  const mk = off => { const d = new Date(); d.setMonth(d.getMonth() + off); return localISO(d).slice(0, 7); };
  const fcMonths = [mk(0), mk(1), mk(2)];
  const openAll = rows.filter(l => !['won', 'lost'].includes(l.stage));
  const noDate = openAll.filter(l => !l.expectedClose);
  const fcValues = fcMonths.map(k => Math.round(openAll
    .filter(l => l.expectedClose && l.expectedClose.slice(0, 7) === k)
    .reduce((s, l) => s + (l.value || 0) * (PROB[l.stage] || 0) / 100, 0)));
  const target = settings?.monthlyTarget || 0;

  const FIELDS = [
    { key: 'name', label: 'Người liên hệ', required: true },
    { key: 'company', label: 'Công ty' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Điện thoại' },
    { key: 'source', label: 'Nguồn', type: 'select', options: ['Facebook', 'Instagram', 'TikTok', 'Website', 'Giới thiệu', 'Khác'].map(s => ({ value: s, label: s })) },
    { key: 'value', label: 'Giá trị dự kiến (đ)', type: 'number' },
    { key: 'stage', label: 'Giai đoạn', type: 'select', options: LEAD_STAGES.map(s => ({ value: s.key, label: s.label })) },
    { key: 'expectedClose', label: 'Ngày dự kiến chốt (cho dự báo)', type: 'date' },
    { key: 'ownerId', label: 'Người phụ trách', type: 'select', options: users.rows.filter(u => u.status === 'active').map(u => ({ value: u.id, label: u.name })) },
    { key: 'note', label: 'Ghi chú', type: 'textarea', full: true },
  ];
  const userName = id => users.rows.find(u => u.id === id)?.name || '—';
  const open = rows.filter(l => !['won', 'lost'].includes(l.stage));

  const drop = async stage => {
    setOverCol(null);
    const lead = rows.find(l => l.id === dragId);
    if (!lead || lead.stage === stage) return;
    await update(lead.id, { stage });
    if (stage === 'won') toast(`Chúc mừng! Deal "${lead.company || lead.name}" đã thắng`);
  };

  const convertToClient = async lead => {
    const res = await clients.create({
      name: lead.company || lead.name, contact: lead.name, email: lead.email, phone: lead.phone,
      note: 'Chuyển từ pipeline (' + (lead.source || '') + ')', createdAt: todayISO(),
    });
    if (!res) return false;
    toast('Đã tạo khách hàng mới từ deal thắng');
    setModal(null); return true;
  };

  return (
    <>
      <div className="toolbar">
        <span style={{ fontSize: '.85rem', color: 'var(--muted)' }}>
          Pipeline mở: <b style={{ color: 'var(--fg)' }}>{money(open.reduce((s, l) => s + l.value, 0))}</b> · {open.length} cơ hội
        </span>
        <div className="spacer"></div>
        <ExportCsv rows={rows} name="pipeline" cols={[
          { label: 'Deal', value: l => l.company || l.name }, { key: 'name', label: 'Người liên hệ' },
          { key: 'stage', label: 'Giai đoạn' }, { key: 'value', label: 'Giá trị' }, { key: 'source', label: 'Nguồn' },
          { key: 'expectedClose', label: 'Dự kiến chốt' }, { label: 'Phụ trách', value: l => userName(l.ownerId) },
        ]} />
        <button className="btn btn-primary" onClick={() => setModal({ mode: 'add' })}><Icon name="plus" size={16} /><span>Thêm khách tiềm năng</span></button>
      </div>

      {/* v3.4: dự báo doanh thu chốt 3 tháng (weighted theo xác suất giai đoạn) */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head"><span className="card-title">Dự báo doanh thu chốt (giá trị × xác suất giai đoạn)</span>
          <span style={{ fontSize: '.75rem', color: 'var(--muted)' }}>
            Xác suất: mới {PROB.new}% · liên hệ {PROB.contacted}% · đề xuất {PROB.proposal}% · thương lượng {PROB.negotiation}% — chỉnh trong Cài đặt
          </span>
        </div>
        <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, alignItems: 'center' }}>
          <BarChart labels={fcMonths.map(k => 'T' + +k.slice(5))} series={[{ name: 'Dự báo chốt', color: '#7C3AED', values: fcValues }]} height={170} />
          <div style={{ fontSize: '.83rem', display: 'grid', gap: 8 }}>
            <div><b style={{ fontSize: '1.25rem', color: 'var(--primary)' }}>{moneyShort(fcValues[0])}</b> dự báo tháng này
              {target > 0 && <span style={{ color: fcValues[0] >= target ? 'var(--accent)' : 'var(--muted)' }}> · {Math.round(fcValues[0] / target * 100)}% mục tiêu {moneyShort(target)}</span>}</div>
            {noDate.length > 0 && <div style={{ color: 'var(--warn, #D97706)' }}>⚠ {noDate.length} deal chưa đặt ngày dự kiến chốt — chưa tính vào dự báo</div>}
            <div style={{ color: 'var(--muted)' }}>Deal thắng thực tế sẽ thay dự báo bằng doanh thu thật.</div>
          </div>
        </div>
      </div>

      <div className="kanban">
        {LEAD_STAGES.map(st => {
          const items = rows.filter(l => l.stage === st.key);
          return (
            <div key={st.key} className={`kan-col ${overCol === st.key ? 'drag-over' : ''}`}
              onDragOver={e => { e.preventDefault(); setOverCol(st.key); }}
              onDragLeave={() => setOverCol(null)}
              onDrop={() => drop(st.key)}>
              <div className="kan-head"><span className="dot" style={{ background: st.color }}></span>{st.label}<span className="count">{items.length}</span></div>
              {items.map(l => (
                <div key={l.id} className="kan-card" draggable
                  onDragStart={() => setDragId(l.id)}
                  onClick={() => setModal({ mode: 'edit', row: l })}>
                  <div className="kan-title" style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                    <span>{l.company || l.name}</span>
                    {!['won', 'lost'].includes(l.stage) && (() => { const sc = leadScore(l); return (
                      <span title={`AI Lead Score: ${sc}/100 — dựa trên giá trị, nguồn, độ đầy đủ thông tin, tiến độ`}
                        style={{ fontSize: '.7rem', fontWeight: 800, color: '#fff', background: scoreColor(sc), borderRadius: 99, padding: '1px 7px', flex: 'none', height: 'fit-content' }}>{sc}</span>
                    ); })()}
                  </div>
                  <div className="kan-sub">{l.name} · {l.source || ''}</div>
                  <div className="kan-foot">
                    <span className="kan-value">{l.value ? money(l.value) : ''}</span>
                    <span className="avatar" title={userName(l.ownerId)}>{initials(userName(l.ownerId))}</span>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: '.76rem', color: 'var(--muted)', marginTop: 4 }}>Kéo thả thẻ để đổi giai đoạn · Nhấp vào thẻ để sửa.</p>

      {modal?.mode === 'add' && <FormModal title="Thêm khách tiềm năng" fields={FIELDS} data={{ stage: 'new', source: 'Facebook' }}
        onClose={() => setModal(null)} onSave={async d => { await create({ ...d, createdAt: todayISO() }); toast('Đã thêm'); }} />}
      {modal?.mode === 'edit' && <FormModal title="Chi tiết khách tiềm năng" fields={FIELDS} data={modal.row}
        onClose={() => setModal(null)} onSave={async d => { await update(modal.row.id, d); toast('Đã cập nhật'); }}
        extraFooter={<>
          <button className="btn btn-ghost" style={{ marginRight: 'auto', color: 'var(--danger)' }}
            onClick={() => setModal({ mode: 'del', row: modal.row })}><Icon name="trash" size={16} /> Xóa</button>
          <button className="btn btn-outline" onClick={() => setModal({ mode: 'acts', row: modal.row })}><Icon name="clock" size={16} /> Nhật ký &amp; hẹn</button>
          {modal.row.stage === 'won' && <AsyncButton className="btn btn-outline" pendingLabel="Đang chuyển…" onClick={() => convertToClient(modal.row)}>Chuyển thành khách hàng</AsyncButton>}
        </>} />}
      {modal?.mode === 'acts' && <ActivitiesModal refType="lead" refId={modal.row.id} name={modal.row.company || modal.row.name} onClose={() => setModal(null)} />}
      {modal?.mode === 'del' && <ConfirmDialog msg={`Xóa khách tiềm năng "${modal.row.company || modal.row.name}"?`}
        onClose={() => setModal(null)} onYes={async () => { await remove(modal.row.id); toast('Đã xóa'); }} />}
    </>
  );
}
