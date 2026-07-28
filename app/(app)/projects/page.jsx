'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useResource, useServiceLines, Icon, FormModal, ConfirmDialog, EmptyState, Badge, useToast } from '@/components/ui';
import { DocLinksModal } from '@/components/DocLinks';
import { moneyShort, fmtDate, todayISO, BADGE } from '@/lib/format';
import { hasAny } from '@/lib/perm';
import styles from './projects-execution-list.module.css';

const HEALTH = { green: ['Ổn định', 'green'], amber: ['Cần chú ý', 'amber'], red: ['Rủi ro', 'red'] };

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
  const serviceLines = useServiceLines(); // v3.37: mảng dịch vụ theo công ty (chỉnh trong Cài đặt)
  const FIELDS = [
    { key: 'name', label: 'Tên dự án', required: true, full: true },
    { key: 'clientId', label: 'Khách hàng', type: 'select', options: clients.rows.map(c => ({ value: c.id, label: c.name })), required: true },
    { key: 'service', label: 'Dịch vụ', type: 'select', options: serviceLines.map(s => ({ value: s, label: s })) },
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

  // v3.41: áp mẫu chạy TRỌN GÓI ở server (một giao dịch). Trước đây chạy ở trình duyệt bằng
  // vài chục request nối nhau — mất mạng giữa chừng để lại dự án dở dang phải dọn tay.
  const applyTemplate = async (tpl, projectId) => {
    const response = await fetch('/api/projects/apply-template', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, templateId: tpl.id }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { toast(body.error || 'Không áp được mẫu dự án', 'error'); return false; }
    toast(`Đã áp mẫu "${tpl.name}": ${body.phaseCount} giai đoạn · ${body.taskCount} việc · ${body.milestoneCount} mốc`);
    return true;
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
          <thead><tr><th>Sức khỏe</th><th>Dự án</th><th>Khách hàng</th>{isMgmt && <th className="num">Ngân sách</th>}<th>Deadline</th><th style={{ minWidth: 140 }}>Tiến độ</th><th>Giờ khai báo / NS</th><th>Trạng thái</th>{isMgmt && <th><span className="sr-only">Thao tác</span></th>}</tr></thead>
          <tbody>
            {filtered.map(p => {
              const late = p.status !== 'done' && p.deadline && p.deadline < todayISO();
              const st = stats[p.id] || {};
              const [healthLabel, healthTone] = HEALTH[st.health] || ['Chưa đủ dữ liệu', 'neutral'];
              const riskDetails = [
                st.blockedTasks ? `${st.blockedTasks} blocked` : null,
                st.dependencyBlocked ? `${st.dependencyBlocked} dependency` : null,
                st.constrainedMembers ? `${st.constrainedMembers} vượt WIP` : null,
              ].filter(Boolean);
              return (
                <tr key={p.id}>
                  <td><span className={`${styles.healthBadge} ${styles[healthTone]}`} title={st.healthReasons?.join(', ') || healthLabel}>
                    <span className={styles.healthDot} aria-hidden="true"></span>{healthLabel}
                  </span></td>
                  <td><Link href={`/projects/${p.id}`} style={{ textDecoration: 'none' }}>
                    <span className="cell-main" style={{ color: 'var(--primary)' }}>{p.name}</span></Link>
                    <span className="cell-sub">{p.service || '—'} · {st.taskTotal ? `${st.taskDone}/${st.taskTotal} việc` : 'chưa có execution plan'}{st.taskOverdue ? ` · ${st.taskOverdue} trễ` : ''}</span>
                    {riskDetails.length > 0 && <span className={styles.riskDetails}>{riskDetails.join(' · ')}</span>}</td>
                  <td>{clientName(p.clientId)}</td>
                  {isMgmt && <td className="num" style={{ fontWeight: 700 }}>{moneyShort(p.budget)}</td>}
                  <td style={late ? { color: 'var(--danger)', fontWeight: 600 } : {}}>{fmtDate(p.deadline)}{late && <span className={styles.overdueLabel}>Trễ</span>}</td>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className={`progress ${(st.progress ?? p.progress) >= 100 ? 'p-done' : ''}`}><i style={{ width: `${Math.min(100, st.progress ?? p.progress)}%` }}></i></div>
                    <span style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{st.progress ?? p.progress}%</span></div></td>
                  <td style={{ fontSize: '.78rem' }}>{st.loggedHours != null
                    ? <span style={st.burnHours > 100 ? { color: 'var(--danger)', fontWeight: 700 } : st.burnHours > 80 ? { color: 'var(--warn, #D97706)' } : {}}>{st.loggedHours}h{p.budgetHours ? ` / ${p.budgetHours}h` : ''}{st.burnHours != null ? ` (${st.burnHours}%)` : ''}</span>
                    : '—'}</td>
                  <td><Badge map="project" k={p.status} /></td>
                  {isMgmt && (
                    <td><div className="row-actions">
                      <button className={`icon-btn ${styles.projectAction}`} title="Tài liệu (Drive/Notion…)" onClick={() => setModal({ mode: 'docs', row: p })} aria-label={`Mở tài liệu của ${p.name}`}><Icon name="link" size={16} /></button>
                      <button className={`icon-btn ${styles.projectAction}`} onClick={() => setModal({ mode: 'edit', row: p })} aria-label={`Sửa ${p.name}`}><Icon name="edit" size={16} /></button>
                      <button className={`icon-btn danger ${styles.projectAction}`} onClick={() => setModal({ mode: 'del', row: p })} aria-label={`Xóa ${p.name}`}><Icon name="trash" size={16} /></button>
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
          if (p && modal.template) { await applyTemplate(modal.template, p.id); loadStats(); }
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
