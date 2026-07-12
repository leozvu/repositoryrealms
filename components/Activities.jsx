'use client';
// Nhật ký hoạt động & lịch hẹn CRM — gắn với khách hàng hoặc lead
import { useState } from 'react';
import { Modal, Icon, useToast, useResource } from './ui';
import { fmtDate, todayISO } from '@/lib/format';

const KINDS = { call: ['Cuộc gọi', 'phone'], meeting: ['Cuộc họp', 'meeting'], email: ['Email', 'mail'], note: ['Ghi chú', 'note'] };

export function ActivitiesPanel({ refType, refId }) {
  const { rows, create, update, remove } = useResource('activities');
  const [kind, setKind] = useState('call');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayISO());
  const toast = useToast();

  const acts = rows.filter(a => a.refType === refType && a.refId === refId)
    .sort((a, b) => (a.done - b.done) || (a.date || '').localeCompare(b.date || ''));

  const add = async () => {
    if (!title.trim()) return toast('Nhập nội dung hoạt động', 'error');
    await create({ kind, refType, refId, title: title.trim(), date, done: false });
    setTitle('');
  };

  return (
    <>
      <div className="form-grid" style={{ gridTemplateColumns: '110px 1fr 130px auto', alignItems: 'end', marginBottom: 14 }}>
        <div className="field"><label>Loại</label>
          <select value={kind} onChange={e => setKind(e.target.value)}>
            {Object.entries(KINDS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="field"><label>Nội dung</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="VD: Gọi follow-up báo giá…"
            onKeyDown={e => e.key === 'Enter' && add()} /></div>
        <div className="field"><label>Ngày hẹn</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
        <button className="btn btn-primary" style={{ height: 38 }} onClick={add}><Icon name="plus" size={16} /></button>
      </div>
      {acts.length ? acts.map(a => (
        <div key={a.id} className={`act-item ${a.done ? 'done' : ''}`}>
          <span className="act-kind"><Icon name={KINDS[a.kind]?.[1] || 'note'} size={15} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="act-title">{a.title}</div>
            <div className="act-sub">{KINDS[a.kind]?.[0]} · {a.done ? 'Đã xong'
              : <>hẹn <span className={a.date < todayISO() ? 'act-late' : ''}>{fmtDate(a.date)}</span></>}</div>
          </div>
          <button className="icon-btn" style={{ color: 'var(--accent)' }} title={a.done ? 'Đánh dấu chưa xong' : 'Đánh dấu đã xong'}
            onClick={() => update(a.id, { done: !a.done })}><Icon name="check" size={16} /></button>
          <button className="icon-btn danger" onClick={() => remove(a.id)} aria-label="Xóa"><Icon name="trash" size={16} /></button>
        </div>
      )) : <p style={{ fontSize: '.83rem', color: 'var(--muted)', padding: '18px 0', textAlign: 'center' }}>
        Chưa có hoạt động — ghi lại các cuộc gọi, cuộc họp, lịch hẹn follow-up.</p>}
    </>
  );
}

export function ActivitiesModal({ refType, refId, name, onClose }) {
  return (
    <Modal title={`Nhật ký & lịch hẹn — ${name}`} large onClose={onClose}
      footer={<button className="btn btn-primary" onClick={onClose}>Đóng</button>}>
      <ActivitiesPanel refType={refType} refId={refId} />
    </Modal>
  );
}
