'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useResource, Icon, FormModal, ConfirmDialog, EmptyState, Badge, useToast } from '@/components/ui';
import { DocLinksModal } from '@/components/DocLinks';
import { money, moneyShort, fmtDate, todayISO, BADGE } from '@/lib/format';
import { hasAny } from '@/lib/perm';

const HEALTH = { green: ['#059669', 'Ổn'], amber: ['#D97706', 'Cần chú ý'], red: ['#DC2626', 'Rủi ro'] };

export default function ProjectsPage() {
  const { data: session } = useSession();
  const isMgmt = hasAny(session?.user, ['PM']); // Dự án: PM + Giám đốc
  const { rows, create, update, remove } = useResource('projects');
  const clients = useResource('clients');
  const templates = useResource('projecttemplates');
  const [q, setQ] = useState('');
  const [f, setF] = useState('all');
  const [modal, setModal] = useState(null);
  const [stats, setStats] = useState({});
  const [canMoney, setCanMoney] = useState(false);
  const toast = useToast();

  const loadStats = () => fetch('/api/projects/stats').then(r => r.ok ? r.json() : null)
    .then(d => { if (d) { setStats(d.stats); setCanMoney(d.canSeeMoney); } }).catch(() => {});
  useEffect(() => { loadStats(); }, [rows.length]);

  const clientName = id => clients.rows.find(c => c.id === id)?.name || '—';
  const FIELDS = [
    { key: 'name', label: 'Tên dự án', required: true, full: true },
    { key: 'clientId', label: 'Khách hàng', type: 'select', options: clients.rows.map(c => ({ value: c.id, label: c.name })), required: true },
    { key: 'service', label: 'Dịch vụ', type: 'select', options: ['Digital Ads', 'Social Media', 'Branding', 'Web & SEO', 'Production', 'PR / Event', 'Khác'].map(s => ({ value: s, label: s })) },
    { key: 'budget', label: 'Ngân sách / giá trị HĐ (đ)', type: 'number' },
    { key: 'budgetHours', label: 'Ngân sách giờ công (giờ)', type: 'number', hint: 'Để 0 nếu chưa ước lượng' },
    { key: 'status', label: 'Trạng thái', type: 'select', options: Object.entries(BADGE.project).map(([v, [l]]) => ({ value: v, label: l })) },
    { key: 'startDate', label: 'Ngày bắt đầu', type: 'date' },
    { key: 'deadline', label: 'Deadline', type: 'date' },
    { key: 'autoProgress', label: 'Tiến độ tự động (theo công việc)', type: 'select', options: [{ value: '1', label: 'Bật — tính từ công việc' }, { value: '', label: 'Tắt — nhập tay' }] },
    { key: 'progress', label: 'Tiến độ (%) — chỉ dùng khi tắt tự động', type: 'number', hint: '0 – 100' },
  ];
  const norm = d => ({ ...d, budget: +d.budget || 0, budgetHours: +d.budgetHours || 0, progress: +d.progress || 0, autoProgress: d.autoProgress === '1' || d.autoProgress === true });
  const filtered = rows.filter(p => (f === 'all' || p.status === f) && (!q || (p.name + clientName(p.clientId)).toLowerCase().includes(q.toLowerCase())));

  const applyTemplate = async (tpl, projectId, startDate) => {
    const base = new Date((startDate || todayISO()) + 'T00:00:00');
    const off = n => { const d = new Date(base); d.setDate(d.getDate() + (+n || 0)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    let phases = []; try { phases = JSON.parse(tpl.phases || '[]'); } catch {}
    let ms = []; try { ms = JSON.parse(tpl.milestones || '[]'); } catch {}
    let order = 0;
    for (const ph of phases) {
      const phase = await fetch('/api/data/phases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, name: ph.name, order: order++ }) }).then(r => r.json());
      for (const t of (ph.tasks || [])) {
        await fetch('/api/data/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, phaseId: phase.id, title: t.title, status: 'todo', priority: t.priority || 'medium', estHours: +t.estHours || 0, dueDate: t.offsetDays != null ? off(t.offsetDays) : null }) });
      }
    }
    for (const m of ms) await fetch('/api/data/milestones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, name: m.name, date: off(m.offsetDays), done: false }) });
  };

  return (
    <>
      <div className="toolbar">
        <div className="search-box"><Icon name="search" size={15} /><input placeholder="Tìm dự án…" value={q} onChange={e => setQ(e.target.value)} /></div>
        <select className="filter" value={f} onChange={e => setF(e.target.value)}>
          <option value="all">Tất cả trạng thái</option>
          {Object.entries(BADGE.project).map(([v, [l]]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <div className="spacer"></div>
        {isMgmt && <Link href="/portfolio" className="btn btn-outline"><Icon name="reports" size={16} /><span>Sở chỉ huy</span></Link>}
        {isMgmt && <button className="btn btn-primary" onClick={() => {
          if (!clients.rows.length) return toast('Hãy thêm khách hàng trước', 'error');
          setModal({ mode: 'add' });
        }}><Icon name="plus" size={16} /><span>Thêm dự án</span></button>}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th></th><th>Dự án</th><th>Khách hàng</th>{isMgmt && <th className="num">Ngân sách</th>}<th>Deadline</th><th style={{ minWidth: 140 }}>Tiến độ</th><th>Giờ (log/NS)</th><th>Trạng thái</th>{isMgmt && <th></th>}</tr></thead>
          <tbody>
            {filtered.map(p => {
              const late = p.status !== 'done' && p.deadline && p.deadline < todayISO();
              const st = stats[p.id] || {};
              const [hc, hl] = HEALTH[st.health] || ['var(--muted)', ''];
              return (
                <tr key={p.id}>
                  <td title={st.healthReasons?.length ? hl + ': ' + st.healthReasons.join(', ') : hl}
                    style={{ width: 8, padding: 0 }}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: hc }}></span></td>
                  <td><Link href={`/projects/${p.id}`} style={{ textDecoration: 'none' }}>
                    <span className="cell-main" style={{ color: 'var(--primary)' }}>{p.name}</span></Link>
                    <span className="cell-sub">{p.service || '—'} · {st.taskTotal ? `${st.taskDone}/${st.taskTotal} việc` : 'chưa có việc'}{st.taskOverdue ? ` · ${st.taskOverdue} trễ` : ''}</span></td>
                  <td>{clientName(p.clientId)}</td>
                  {isMgmt && <td className="num" style={{ fontWeight: 700 }}>{moneyShort(p.budget)}</td>}
                  <td style={late ? { color: 'var(--danger)', fontWeight: 600 } : {}}>{fmtDate(p.deadline)}{late ? ' ⚠' : ''}</td>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className={`progress ${(st.progress ?? p.progress) >= 100 ? 'p-done' : ''}`}><i style={{ width: `${Math.min(100, st.progress ?? p.progress)}%` }}></i></div>
                    <span style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{st.progress ?? p.progress}%</span></div></td>
                  <td style={{ fontSize: '.78rem' }}>{st.loggedHours != null
                    ? <span style={st.burnHours > 100 ? { color: 'var(--danger)', fontWeight: 700 } : st.burnHours > 80 ? { color: 'var(--warn, #D97706)' } : {}}>{st.loggedHours}h{p.budgetHours ? ` / ${p.budgetHours}h` : ''}{st.burnHours != null ? ` (${st.burnHours}%)` : ''}</span>
                    : '—'}</td>
                  <td><Badge map="project" k={p.status} /></td>
                  {isMgmt && (
                    <td><div className="row-actions">
                      <button className="icon-btn" title="Tài liệu (Drive/Notion…)" onClick={() => setModal({ mode: 'docs', row: p })}>📎</button>
                      <button className="icon-btn" onClick={() => setModal({ mode: 'edit', row: p })} aria-label="Sửa"><Icon name="edit" size={16} /></button>
                      <button className="icon-btn danger" onClick={() => setModal({ mode: 'del', row: p })} aria-label="Xóa"><Icon name="trash" size={16} /></button>
                    </div></td>
                  )}
                </tr>
              );
            })}
            {!filtered.length && <tr><td colSpan={9}><EmptyState title="Chưa có dự án" /></td></tr>}
          </tbody>
        </table>
      </div>
      {modal?.mode === 'add' && <FormModal title="Thêm dự án" fields={FIELDS} data={{ status: 'planning', progress: 0, autoProgress: '1', startDate: todayISO() }}
        onClose={() => setModal(null)} onSave={async d => {
          const p = await create(norm(d));
          if (p && modal.template) { await applyTemplate(modal.template, p.id, d.startDate); toast(`Đã tạo dự án + áp mẫu "${modal.template.name}"`); loadStats(); }
          else toast('Đã thêm dự án');
        }}
        extraFooter={templates.rows.length > 0 && <select value={modal.template?.id || ''} onChange={e => setModal(m => ({ ...m, template: templates.rows.find(t => t.id === e.target.value) }))}
          style={{ marginRight: 'auto', maxWidth: 200 }}>
          <option value="">— Không dùng mẫu —</option>
          {templates.rows.map(t => <option key={t.id} value={t.id}>Mẫu: {t.name}</option>)}
        </select>} />}
      {modal?.mode === 'edit' && <FormModal title="Sửa dự án" fields={FIELDS} data={{ ...modal.row, autoProgress: modal.row.autoProgress ? '1' : '' }}
        onClose={() => setModal(null)} onSave={async d => { await update(modal.row.id, norm(d)); toast('Đã cập nhật'); loadStats(); }} />}
      {modal?.mode === 'docs' && <DocLinksModal refType="project" refId={modal.row.id} name={modal.row.name} onClose={() => setModal(null)} />}
      {modal?.mode === 'del' && <ConfirmDialog msg={`Xóa dự án "${modal.row.name}"? Công việc thuộc dự án cần được xóa/chuyển trước.`}
        onClose={() => setModal(null)} onYes={async () => { const r = await remove(modal.row.id); if (r) toast('Đã xóa'); }} />}
    </>
  );
}
