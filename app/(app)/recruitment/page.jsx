'use client';
import { useState } from 'react';
import { useResource, Icon, FormModal, ConfirmDialog, Forbidden, useToast } from '@/components/ui';
import { todayISO, initials } from '@/lib/format';

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
      <p style={{ fontSize: '.76rem', color: 'var(--muted)', marginTop: 4 }}>Kéo thả ứng viên qua các vòng. Ứng viên "Nhận việc" → tạo tài khoản trong mục Nhân sự.</p>

      {modal?.mode === 'add' && <FormModal title="Thêm ứng viên" fields={FIELDS} data={{ stage: 'applied', source: 'TopCV' }}
        onClose={() => setModal(null)} onSave={async d => { await create({ ...d, createdAt: todayISO() }); toast('Đã thêm ứng viên'); }} />}
      {modal?.mode === 'edit' && <FormModal title="Hồ sơ ứng viên" fields={FIELDS} data={modal.row}
        onClose={() => setModal(null)} onSave={async d => { await update(modal.row.id, d); toast('Đã cập nhật'); }}
        extraFooter={<button className="btn btn-ghost" style={{ marginRight: 'auto', color: 'var(--danger)' }}
          onClick={() => setModal({ mode: 'del', row: modal.row })}><Icon name="trash" size={16} /> Xóa</button>} />}
      {modal?.mode === 'del' && <ConfirmDialog msg={`Xóa hồ sơ ứng viên "${modal.row.name}"?`}
        onClose={() => setModal(null)} onYes={async () => { await remove(modal.row.id); toast('Đã xóa'); }} />}
    </>
  );
}
