'use client';
import { useState } from 'react';
import { useResource, Icon, FormModal, ConfirmDialog, Forbidden, useToast } from '@/components/ui';
import { todayISO, initials, fmtDate, parseItems } from '@/lib/format';

const STAGES = [
  { key: 'applied', label: 'Ứng tuyển', color: '#94A3B8' },
  { key: 'interview1', label: 'Phỏng vấn 1', color: '#3B82F6' },
  { key: 'interview2', label: 'Phỏng vấn 2', color: '#7C3AED' },
  { key: 'offer', label: 'Gửi offer', color: '#D97706' },
  { key: 'hired', label: 'Nhận việc', color: '#059669' },
  { key: 'rejected', label: 'Loại', color: '#DC2626' },
];

export default function RecruitmentPage() {
  const { rows, forbidden, create, update, remove } = useResource('candidates');
  const onboardings = useResource('onboardings');
  const [modal, setModal] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const toast = useToast();
  if (forbidden) return <Forbidden />;

  const FIELDS = [
    { key: 'name', label: 'Họ tên ứng viên', required: true },
    { key: 'position', label: 'Vị trí ứng tuyển', required: true },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Điện thoại' },
    { key: 'source', label: 'Nguồn', type: 'select', options: ['TopCV', 'VietnamWorks', 'LinkedIn', 'Facebook', 'Giới thiệu', 'Khác'].map(s => ({ value: s, label: s })) },
    { key: 'stage', label: 'Vòng', type: 'select', options: STAGES.map(s => ({ value: s.key, label: s.label })) },
    { key: 'note', label: 'Đánh giá / ghi chú', type: 'textarea', full: true },
  ];

  const drop = async stage => {
    setOverCol(null);
    const c = rows.find(x => x.id === dragId);
    if (!c || c.stage === stage) return;
    await update(c.id, { stage });
    if (stage === 'hired') toast(`🎉 ${c.name} nhận việc — tạo tài khoản trong mục Nhân sự`);
  };

  return (
    <>
      <div className="toolbar">
        <span style={{ fontSize: '.85rem', color: 'var(--muted)' }}>
          {rows.filter(c => !['hired', 'rejected'].includes(c.stage)).length} ứng viên đang trong quy trình
        </span>
        <div className="spacer"></div>
        <button className="btn btn-primary" onClick={() => setModal({ mode: 'add' })}><Icon name="plus" size={16} /><span>Thêm ứng viên</span></button>
      </div>
      <div className="kanban">
        {STAGES.map(st => {
          const items = rows.filter(c => c.stage === st.key);
          return (
            <div key={st.key} className={`kan-col ${overCol === st.key ? 'drag-over' : ''}`}
              onDragOver={e => { e.preventDefault(); setOverCol(st.key); }}
              onDragLeave={() => setOverCol(null)} onDrop={() => drop(st.key)}>
              <div className="kan-head"><span className="dot" style={{ background: st.color }}></span>{st.label}<span className="count">{items.length}</span></div>
              {items.map(c => (
                <div key={c.id} className="kan-card" draggable
                  onDragStart={() => setDragId(c.id)} onClick={() => setModal({ mode: 'edit', row: c })}>
                  <div className="kan-title">{c.name}</div>
                  <div className="kan-sub">{c.position}{c.source ? ' · ' + c.source : ''}</div>
                  <div className="kan-foot">
                    <small style={{ fontSize: '.7rem', color: 'var(--muted)' }}>{c.note ? c.note.slice(0, 30) + (c.note.length > 30 ? '…' : '') : ''}</small>
                    <span className="avatar">{initials(c.name)}</span>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: '.76rem', color: 'var(--muted)', marginTop: 4 }}>Kéo thả ứng viên qua các vòng. Ứng viên "Nhận việc" → checklist onboarding tự tạo bên dưới.</p>

      {/* v3.5: checklist onboarding nhân sự mới — tự tạo khi ứng viên "Nhận việc" */}
      {onboardings.rows.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 20 }}>Onboarding nhân sự mới</div>
          <div className="grid two-col">
            {onboardings.rows.map(ob => {
              const items = parseItems(ob.items);
              const doneN = items.filter(i => i.done).length;
              const allDone = doneN === items.length && items.length > 0;
              const toggle = async idx => {
                const next = items.map((it, j) => j === idx ? { ...it, done: !it.done } : it);
                await onboardings.update(ob.id, { items: JSON.stringify(next), status: next.every(i => i.done) ? 'done' : 'active' });
              };
              return (
                <div key={ob.id} className="card" style={allDone ? { opacity: .65 } : {}}>
                  <div className="card-head">
                    <span className="card-title">{ob.name}{ob.position ? ` — ${ob.position}` : ''}</span>
                    <span className="badge" style={{ background: allDone ? 'var(--accent-soft, #d1fae5)' : 'var(--warn-soft, #fef3c7)' }}>
                      {doneN}/{items.length}{allDone ? ' ✓ xong' : ''}</span>
                    <button className="icon-btn danger" onClick={() => setModal({ mode: 'delOb', row: ob })} aria-label="Xóa"><Icon name="trash" size={14} /></button>
                  </div>
                  <div className="card-body" style={{ paddingTop: 8 }}>
                    {items.map((it, idx) => (
                      <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.84rem', padding: '5px 0', cursor: 'pointer' }}>
                        <input type="checkbox" style={{ width: 'auto' }} checked={!!it.done} onChange={() => toggle(idx)} />
                        <span style={it.done ? { textDecoration: 'line-through', color: 'var(--muted)' } : {}}>{it.text}</span>
                      </label>
                    ))}
                    <div className="hint" style={{ marginTop: 6 }}>Tạo từ {fmtDate(String(ob.createdAt).slice(0, 10))} · tài khoản đăng nhập tạo trong mục Nhân sự</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {modal?.mode === 'add' && <FormModal title="Thêm ứng viên" fields={FIELDS} data={{ stage: 'applied', source: 'TopCV' }}
        onClose={() => setModal(null)} onSave={async d => { await create({ ...d, createdAt: todayISO() }); toast('Đã thêm ứng viên'); }} />}
      {modal?.mode === 'edit' && <FormModal title="Hồ sơ ứng viên" fields={FIELDS} data={modal.row}
        onClose={() => setModal(null)} onSave={async d => { await update(modal.row.id, d); toast('Đã cập nhật'); }}
        extraFooter={<button className="btn btn-ghost" style={{ marginRight: 'auto', color: 'var(--danger)' }}
          onClick={() => setModal({ mode: 'del', row: modal.row })}><Icon name="trash" size={16} /> Xóa</button>} />}
      {modal?.mode === 'del' && <ConfirmDialog msg={`Xóa hồ sơ ứng viên "${modal.row.name}"?`}
        onClose={() => setModal(null)} onYes={async () => { await remove(modal.row.id); toast('Đã xóa'); }} />}
      {modal?.mode === 'delOb' && <ConfirmDialog msg={`Xóa checklist onboarding của "${modal.row.name}"?`}
        onClose={() => setModal(null)} onYes={async () => { await onboardings.remove(modal.row.id); toast('Đã xóa'); }} />}
    </>
  );
}
