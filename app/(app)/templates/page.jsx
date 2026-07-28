'use client';
// v3.10: Mẫu dự án — bộ giai đoạn + công việc + mốc chuẩn để nhân bản nhanh.
// Khi tạo dự án, chọn mẫu là sinh hết. Chỉ PM/Lead.
import { useState } from 'react';
import { useResource, Icon, Modal, ConfirmDialog, EmptyState, Forbidden, AsyncButton, useToast } from '@/components/ui';
import { BADGE } from '@/lib/format';

const parse = s => { try { return JSON.parse(s || '[]'); } catch { return []; } };

function TemplateModal({ tpl, onSave, onClose }) {
  const [name, setName] = useState(tpl?.name || '');
  const [service, setService] = useState(tpl?.service || '');
  const [budgetHours, setBudgetHours] = useState(tpl?.budgetHours || 0);
  const [phases, setPhases] = useState(tpl ? parse(tpl.phases) : [{ name: 'Giai đoạn 1', tasks: [] }]);
  const [milestones, setMilestones] = useState(tpl ? parse(tpl.milestones) : []);

  const setPhase = (i, k, v) => setPhases(p => p.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const setTask = (pi, ti, k, v) => setPhases(p => p.map((x, j) => j === pi ? { ...x, tasks: x.tasks.map((t, k2) => k2 === ti ? { ...t, [k]: v } : t) } : x));
  const totalTasks = phases.reduce((s, p) => s + (p.tasks?.length || 0), 0);

  return (
    <Modal title={tpl ? 'Sửa mẫu dự án' : 'Tạo mẫu dự án'} onClose={onClose} large
      footer={<><button className="btn btn-outline" onClick={onClose}>Hủy</button>
        <AsyncButton className="btn btn-primary" pendingLabel="Đang lưu…" onClick={async () => {
          if (!name.trim()) return;
          const result = await onSave({ name: name.trim(), service, budgetHours: +budgetHours || 0,
            phases: JSON.stringify(phases.filter(p => p.name?.trim()).map(p => ({ name: p.name.trim(), tasks: (p.tasks || []).filter(t => t.title?.trim()) }))),
            milestones: JSON.stringify(milestones.filter(m => m.name?.trim())) });
          if (result !== false && result !== null) onClose();
        }}>Lưu mẫu</AsyncButton></>}>
      <div className="form-grid">
        <div className="field"><label>Tên mẫu *</label><input value={name} onChange={e => setName(e.target.value)} placeholder="VD: Dự án Branding chuẩn" /></div>
        <div className="field"><label>Dịch vụ</label><input value={service} onChange={e => setService(e.target.value)} placeholder="Branding" /></div>
        <div className="field"><label>Ngân sách giờ gợi ý</label><input type="number" min="0" value={budgetHours} onChange={e => setBudgetHours(e.target.value)} /></div>
      </div>

      <div style={{ marginTop: 12, fontSize: '.85rem', fontWeight: 700 }}>Giai đoạn &amp; công việc ({phases.length} giai đoạn · {totalTasks} việc)</div>
      {phases.map((ph, pi) => (
        <div key={pi} className="card" style={{ margin: '8px 0' }}>
          <div className="card-body" style={{ padding: 12 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
              <input style={{ flex: 1, fontWeight: 600 }} value={ph.name} onChange={e => setPhase(pi, 'name', e.target.value)} placeholder="Tên giai đoạn" />
              <button className="icon-btn danger" onClick={() => setPhases(p => p.filter((_, j) => j !== pi))}><Icon name="trash" size={14} /></button>
            </div>
            {(ph.tasks || []).map((t, ti) => (
              <div key={ti} style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center' }}>
                <input style={{ flex: 1 }} value={t.title} onChange={e => setTask(pi, ti, 'title', e.target.value)} placeholder="Tên việc" />
                <input style={{ width: 60 }} type="number" min="0" value={t.estHours || ''} onChange={e => setTask(pi, ti, 'estHours', +e.target.value || 0)} placeholder="giờ" title="Giờ ước lượng" />
                <select style={{ width: 90 }} value={t.priority || 'medium'} onChange={e => setTask(pi, ti, 'priority', e.target.value)}>
                  {Object.entries(BADGE.priority).map(([v, [l]]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <input style={{ width: 70 }} type="number" value={t.offsetDays ?? ''} onChange={e => setTask(pi, ti, 'offsetDays', e.target.value === '' ? null : +e.target.value)} placeholder="+ngày" title="Hạn = ngày bắt đầu + N ngày" />
                <button className="icon-btn" onClick={() => setPhase(pi, 'tasks', ph.tasks.filter((_, j) => j !== ti))}><Icon name="x" size={12} /></button>
              </div>
            ))}
            <button className="btn btn-ghost btn-sm" onClick={() => setPhase(pi, 'tasks', [...(ph.tasks || []), { title: '', estHours: 0, priority: 'medium', offsetDays: null }])}><Icon name="plus" size={12} /> Thêm việc</button>
          </div>
        </div>
      ))}
      <button className="btn btn-outline btn-sm" onClick={() => setPhases([...phases, { name: `Giai đoạn ${phases.length + 1}`, tasks: [] }])}><Icon name="plus" size={13} /> Thêm giai đoạn</button>

      <div style={{ marginTop: 14, fontSize: '.85rem', fontWeight: 700 }}>Mốc dự án ({milestones.length})</div>
      {milestones.map((m, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, marginTop: 4, alignItems: 'center' }}>
          <input style={{ flex: 1 }} value={m.name} onChange={e => setMilestones(ms => ms.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Tên mốc" />
          <input style={{ width: 80 }} type="number" value={m.offsetDays ?? ''} onChange={e => setMilestones(ms => ms.map((x, j) => j === i ? { ...x, offsetDays: +e.target.value || 0 } : x))} placeholder="+ngày" />
          <button className="icon-btn" onClick={() => setMilestones(ms => ms.filter((_, j) => j !== i))}><Icon name="x" size={12} /></button>
        </div>
      ))}
      <button className="btn btn-ghost btn-sm" style={{ marginTop: 4 }} onClick={() => setMilestones([...milestones, { name: '', offsetDays: 0 }])}><Icon name="plus" size={12} /> Thêm mốc</button>
    </Modal>
  );
}

export default function TemplatesPage() {
  const templates = useResource('projecttemplates');
  const [modal, setModal] = useState(null);
  const toast = useToast();
  if (templates.forbidden) return <Forbidden />;

  return (
    <>
      <div className="toolbar">
        <span style={{ fontSize: '.85rem', color: 'var(--muted)' }}>Mẫu dự án giúp mở dự án mới trong 1 nút — sinh sẵn giai đoạn, công việc, mốc.</span>
        <div className="spacer"></div>
        <button className="btn btn-primary" onClick={() => setModal({ mode: 'add' })}><Icon name="plus" size={16} /><span>Tạo mẫu</span></button>
      </div>
      {!templates.rows.length ? <EmptyState title="Chưa có mẫu dự án" sub='VD: "Branding chuẩn" gồm Nghiên cứu → Thiết kế → Bàn giao với các việc cố định' /> : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {templates.rows.map(t => {
            const phs = parse(t.phases); const nt = phs.reduce((s, p) => s + (p.tasks?.length || 0), 0);
            return (
              <div key={t.id} className="card">
                <div className="card-head"><span className="card-title">{t.name}</span>
                  <div className="row-actions">
                    <button className="icon-btn" onClick={() => setModal({ mode: 'edit', row: t })}><Icon name="edit" size={15} /></button>
                    <button className="icon-btn danger" onClick={() => setModal({ mode: 'del', row: t })}><Icon name="trash" size={15} /></button>
                  </div></div>
                <div className="card-body" style={{ fontSize: '.83rem' }}>
                  <div style={{ color: 'var(--muted)', marginBottom: 6 }}>{t.service || 'Chưa đặt dịch vụ'} · {phs.length} giai đoạn · {nt} việc · {parse(t.milestones).length} mốc{t.budgetHours ? ` · ${t.budgetHours}h` : ''}</div>
                  {phs.map((p, i) => <div key={i}>· <b>{p.name}</b> ({p.tasks?.length || 0} việc)</div>)}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {(modal?.mode === 'add' || modal?.mode === 'edit') && <TemplateModal tpl={modal.row}
        onClose={() => setModal(null)}
        onSave={async d => { const r = modal.row ? await templates.update(modal.row.id, d) : await templates.create(d); if (!r) return false; toast('Đã lưu mẫu'); return true; }} />}
      {modal?.mode === 'del' && <ConfirmDialog msg={`Xóa mẫu "${modal.row.name}"?`}
        onClose={() => setModal(null)} onYes={async () => { await templates.remove(modal.row.id); toast('Đã xóa'); }} />}
    </>
  );
}
