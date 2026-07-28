'use client';
// v3.3: Rule tự động IF/THEN — chỉ Giám đốc.
// KHI <resource> <create/update> VÀ thỏa mọi điều kiện → chạy các hành động.
import { useState } from 'react';
import { useResource, Icon, Modal, ConfirmDialog, EmptyState, Forbidden, AsyncButton, useToast } from '@/components/ui';
import { parseItems } from '@/lib/format';

const RESOURCES_UI = [
  { key: 'leads', label: 'Khách tiềm năng', fields: 'stage (new/contacted/proposal/negotiation/won/lost), value, source, name, company' },
  { key: 'invoices', label: 'Hóa đơn', fields: 'status (draft/sent/paid), code, dueDate' },
  { key: 'tasks', label: 'Công việc', fields: 'status (todo/doing/review/done), priority (low/medium/high), title' },
  { key: 'tickets', label: 'Ticket hỗ trợ', fields: 'status (open/in_progress/waiting/resolved/closed), priority (urgent/high/normal/low), code' },
  { key: 'projects', label: 'Dự án', fields: 'status (planning/active/paused/done), progress, name' },
  { key: 'quotes', label: 'Báo giá', fields: 'status (draft/sent/accepted/rejected), code' },
  { key: 'vendorbills', label: 'Hóa đơn NCC', fields: 'status (pending/approved/paid), amount' },
  { key: 'clients', label: 'Khách hàng', fields: 'name, industry' },
];
const OPS = ['=', '!=', '>', '>=', '<', '<=', 'contains', 'changed'];
const EVENTS = [{ v: 'create', l: 'được tạo mới' }, { v: 'update', l: 'được cập nhật' }, { v: 'any', l: 'tạo hoặc cập nhật' }];
const ACTION_TYPES = [{ v: 'chat', l: '💬 Nhắn vào Kênh chung' }, { v: 'task', l: '✅ Tạo công việc' }, { v: 'webhook', l: '🔗 Gọi webhook URL' }];

function RuleModal({ row, users, onSave, onClose }) {
  const [f, setF] = useState(() => row
    ? { name: row.name, resource: row.resource, event: row.event, conditions: parseItems(row.conditions), actions: parseItems(row.actions) }
    : { name: '', resource: 'leads', event: 'update', conditions: [{ field: 'stage', op: '=', value: 'won' }], actions: [{ type: 'chat', template: '' }] });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const setCond = (i, k, v) => set('conditions', f.conditions.map((c, j) => j === i ? { ...c, [k]: v } : c));
  const setAct = (i, k, v) => set('actions', f.actions.map((a, j) => j === i ? { ...a, [k]: v } : a));
  const resCfg = RESOURCES_UI.find(r => r.key === f.resource);

  return (
    <Modal title={row ? 'Sửa rule' : 'Tạo rule tự động'} onClose={onClose} large
      footer={<><button className="btn btn-outline" onClick={onClose}>Hủy</button>
        <AsyncButton className="btn btn-primary" pendingLabel="Đang lưu…" onClick={async () => { if (!f.name.trim()) return; const r = await onSave(f); if (r !== false && r !== null) onClose(); }}>Lưu</AsyncButton></>}>
      <div style={{ display: 'grid', gap: 14, fontSize: '.85rem' }}>
        <div className="field"><label>Tên rule *</label>
          <input value={f.name} onChange={e => set('name', e.target.value)} placeholder="VD: Báo tin khi thắng deal" /></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <b>KHI</b>
          <select value={f.resource} onChange={e => set('resource', e.target.value)}>
            {RESOURCES_UI.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
          <select value={f.event} onChange={e => set('event', e.target.value)}>
            {EVENTS.map(ev => <option key={ev.v} value={ev.v}>{ev.l}</option>)}
          </select>
        </div>
        <div>
          <b>VÀ thỏa mọi điều kiện</b> <span style={{ color: 'var(--muted)', fontSize: '.75rem' }}>(trường có thể dùng: {resCfg?.fields})</span>
          {f.conditions.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
              <input style={{ flex: 1 }} placeholder="trường" value={c.field} onChange={e => setCond(i, 'field', e.target.value)} />
              <select value={c.op} onChange={e => setCond(i, 'op', e.target.value)}>{OPS.map(o => <option key={o}>{o}</option>)}</select>
              <input style={{ flex: 1 }} placeholder={c.op === 'changed' ? '(không cần)' : 'giá trị'} disabled={c.op === 'changed'} value={c.value ?? ''} onChange={e => setCond(i, 'value', e.target.value)} />
              <button className="icon-btn" onClick={() => set('conditions', f.conditions.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button>
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={() => set('conditions', [...f.conditions, { field: '', op: '=', value: '' }])}>
            <Icon name="plus" size={13} /> Thêm điều kiện</button>
          {!f.conditions.length && <div style={{ color: 'var(--muted)', fontSize: '.78rem', marginTop: 4 }}>Không có điều kiện = luôn chạy khi có sự kiện.</div>}
        </div>
        <div>
          <b>THÌ</b> <span style={{ color: 'var(--muted)', fontSize: '.75rem' }}>— trong nội dung dùng {'{trường}'} để chèn dữ liệu, VD: {'{name}'}, {'{value}'}</span>
          {f.actions.map((a, i) => (
            <div key={i} style={{ display: 'grid', gap: 6, marginTop: 8, padding: 10, border: '1px solid var(--border)', borderRadius: 8 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <select style={{ flex: 1 }} value={a.type} onChange={e => setAct(i, 'type', e.target.value)}>
                  {ACTION_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
                </select>
                <button className="icon-btn" onClick={() => set('actions', f.actions.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button>
              </div>
              {a.type === 'chat' && <input placeholder="Nội dung tin nhắn — VD: Deal {name} trị giá {value}đ vừa thắng! 🎉" value={a.template ?? ''} onChange={e => setAct(i, 'template', e.target.value)} />}
              {a.type === 'task' && <>
                <input placeholder="Tên công việc — VD: Làm hợp đồng cho {name}" value={a.title ?? ''} onChange={e => setAct(i, 'title', e.target.value)} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <select style={{ flex: 1 }} value={a.assigneeId ?? ''} onChange={e => setAct(i, 'assigneeId', e.target.value)}>
                    <option value="">— Chưa gán ai —</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <input style={{ width: 130 }} type="number" min="0" placeholder="Hạn sau ? ngày" value={a.dueDays ?? ''} onChange={e => setAct(i, 'dueDays', e.target.value)} />
                </div>
              </>}
              {a.type === 'webhook' && <input placeholder="https://… (URL nhận POST)" value={a.url ?? ''} onChange={e => setAct(i, 'url', e.target.value)} />}
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={() => set('actions', [...f.actions, { type: 'chat', template: '' }])}>
            <Icon name="plus" size={13} /> Thêm hành động</button>
        </div>
      </div>
    </Modal>
  );
}

export default function AutomationPage() {
  const rules = useResource('rules');
  const users = useResource('users');
  const [modal, setModal] = useState(null);
  const toast = useToast();
  if (rules.forbidden) return <Forbidden />;

  const save = async f => {
    const data = { name: f.name.trim(), resource: f.resource, event: f.event, conditions: JSON.stringify(f.conditions.filter(c => c.field)), actions: JSON.stringify(f.actions) };
    const result = modal.row ? await rules.update(modal.row.id, data) : await rules.create(data);
    if (!result) return false;
    toast(modal.row ? 'Đã cập nhật rule' : 'Đã tạo rule');
    return true;
  };
  const resLabel = k => RESOURCES_UI.find(r => r.key === k)?.label || k;
  const evLabel = v => EVENTS.find(e => e.v === v)?.l || v;

  return (
    <>
      <div className="toolbar">
        <span style={{ fontSize: '.83rem', color: 'var(--muted)' }}>Rule chạy tự động khi dữ liệu thay đổi (qua giao diện hoặc API mở).</span>
        <div className="spacer"></div>
        <button className="btn btn-primary" onClick={() => setModal({ mode: 'add' })}><Icon name="plus" size={16} /><span>Tạo rule</span></button>
      </div>
      {!rules.rows.length ? <EmptyState title="Chưa có rule tự động nào" sub='VD: "Khi lead chuyển sang Thắng → nhắn Kênh chung + tạo việc làm hợp đồng"' /> : (
        <div className="card"><div className="card-body" style={{ display: 'grid', gap: 4 }}>
          {rules.rows.map(r => (
            <div key={r.id} className="act-item" style={{ alignItems: 'center', cursor: 'pointer' }} onClick={() => setModal({ mode: 'edit', row: r })}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: r.active ? 'var(--accent, #059669)' : 'var(--muted)', flex: 'none' }}></span>
              <div style={{ flex: 1 }}>
                <div className="act-title">{r.name}</div>
                <div className="act-sub">Khi <b>{resLabel(r.resource)}</b> {evLabel(r.event)} · {parseItems(r.conditions).length} điều kiện · {parseItems(r.actions).length} hành động</div>
              </div>
              <AsyncButton className="btn btn-outline btn-sm" disabled={rules.mutating} onClick={async e => { e.stopPropagation(); await rules.update(r.id, { active: !r.active }); }}>{r.active ? 'Tắt' : 'Bật'}</AsyncButton>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={e => { e.stopPropagation(); setModal({ mode: 'del', row: r }); }}><Icon name="trash" size={14} /></button>
            </div>
          ))}
        </div></div>
      )}
      {(modal?.mode === 'add' || modal?.mode === 'edit') && <RuleModal row={modal.row} users={users.rows.filter(u => u.status === 'active')} onSave={save} onClose={() => setModal(null)} />}
      {modal?.mode === 'del' && <ConfirmDialog msg={`Xóa rule "${modal.row.name}"?`} onClose={() => setModal(null)}
        onYes={async () => { await rules.remove(modal.row.id); toast('Đã xóa rule'); }} />}
    </>
  );
}
