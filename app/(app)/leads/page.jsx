'use client';
import { useState } from 'react';
import { useResource, Icon, FormModal, ConfirmDialog, Forbidden, useToast } from '@/components/ui';
import { ActivitiesModal } from '@/components/Activities';
import { money, initials, todayISO, LEAD_STAGES, leadScore, scoreColor } from '@/lib/format';

export default function LeadsPage() {
  const { rows, forbidden, create, update, remove } = useResource('leads');
  const users = useResource('users');
  const clients = useResource('clients');
  const [modal, setModal] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const toast = useToast();
  if (forbidden) return <Forbidden />;

  const FIELDS = [
    { key: 'name', label: 'Người liên hệ', required: true },
    { key: 'company', label: 'Công ty' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Điện thoại' },
    { key: 'source', label: 'Nguồn', type: 'select', options: ['Facebook', 'Instagram', 'TikTok', 'Website', 'Giới thiệu', 'Khác'].map(s => ({ value: s, label: s })) },
    { key: 'value', label: 'Giá trị dự kiến (đ)', type: 'number' },
    { key: 'stage', label: 'Giai đoạn', type: 'select', options: LEAD_STAGES.map(s => ({ value: s.key, label: s.label })) },
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
    if (res) toast('Đã tạo khách hàng mới từ deal thắng');
    setModal(null);
  };

  return (
    <>
      <div className="toolbar">
        <span style={{ fontSize: '.85rem', color: 'var(--muted)' }}>
          Pipeline mở: <b style={{ color: 'var(--fg)' }}>{money(open.reduce((s, l) => s + l.value, 0))}</b> · {open.length} cơ hội
        </span>
        <div className="spacer"></div>
        <button className="btn btn-primary" onClick={() => setModal({ mode: 'add' })}><Icon name="plus" size={16} /><span>Thêm khách tiềm năng</span></button>
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
                        style={{ fontSize: '.66rem', fontWeight: 800, color: '#fff', background: scoreColor(sc), borderRadius: 99, padding: '1px 7px', flex: 'none', height: 'fit-content' }}>{sc}</span>
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
          {modal.row.stage === 'won' && <button className="btn btn-outline" onClick={() => convertToClient(modal.row)}>Chuyển thành khách hàng</button>}
        </>} />}
      {modal?.mode === 'acts' && <ActivitiesModal refType="lead" refId={modal.row.id} name={modal.row.company || modal.row.name} onClose={() => setModal(null)} />}
      {modal?.mode === 'del' && <ConfirmDialog msg={`Xóa khách tiềm năng "${modal.row.company || modal.row.name}"?`}
        onClose={() => setModal(null)} onYes={async () => { await remove(modal.row.id); toast('Đã xóa'); }} />}
    </>
  );
}
