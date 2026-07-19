'use client';
// v3.7: Việc của tôi — mở lên là biết hôm nay làm gì: việc quá hạn/hôm nay/tuần này,
// yêu cầu chờ mình duyệt, lịch hẹn CRM, giờ đã log tuần này. Mark done ngay tại chỗ.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useResource, Icon, Badge, EmptyState, AsyncButton, useToast } from '@/components/ui';
import { fmtDate, todayISO, daysFromNow, localISO, parseItems } from '@/lib/format';

export default function MyDayPage() {
  const { data: session } = useSession();
  const me = session?.user;
  const tasks = useResource('tasks');
  const activities = useResource('activities');
  const timelogs = useResource('timelogs');
  const [approvals, setApprovals] = useState(null);
  const toast = useToast();
  useEffect(() => { fetch('/api/approvals').then(r => r.ok ? r.json() : null).then(setApprovals).catch(() => {}); }, []);

  const today = todayISO(), week = daysFromNow(7);
  const mine = tasks.rows.filter(t => t.assigneeId === me?.id && t.status !== 'done');
  const late = mine.filter(t => t.dueDate && t.dueDate < today);
  const dueToday = mine.filter(t => t.dueDate === today);
  const dueWeek = mine.filter(t => t.dueDate && t.dueDate > today && t.dueDate <= week);
  const noDue = mine.filter(t => !t.dueDate);
  const toApprove = approvals?.toApprove || [];

  // Giờ log tuần này (từ thứ Hai)
  const monday = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return localISO(d); })();
  const weekHours = timelogs.rows.filter(l => l.userId === me?.id && l.date >= monday).reduce((s, l) => s + l.hours, 0);
  const actsToday = activities.rows.filter(a => !a.done && a.date === today);

  const markDone = async t => {
    const r = await tasks.update(t.id, { status: 'done' });
    if (r) toast(`✔ Xong: ${t.title}`);
  };

  const Row = ({ t, danger }) => {
    const cl = parseItems(t.checklist);
    return (
      <div className="act-item" style={{ alignItems: 'center' }}>
        <AsyncButton className="icon-btn" pendingLabel="…" disabled={tasks.mutating} title="Đánh dấu hoàn thành" style={{ color: 'var(--accent)', flex: 'none' }} onClick={() => markDone(t)}>
          <Icon name="check" size={17} /></AsyncButton>
        <div style={{ flex: 1 }}>
          <div className="act-title">{t.recur && '🔁 '}{t.title}</div>
          <div className="act-sub">{cl.length > 0 && <>☑ {cl.filter(x => x.done).length}/{cl.length} · </>}
            <span style={danger ? { color: 'var(--danger)', fontWeight: 700 } : {}}>{t.dueDate ? 'hạn ' + fmtDate(t.dueDate) : 'không hạn'}</span></div>
        </div>
        <Badge map="priority" k={t.priority} />
      </div>
    );
  };
  const Section = ({ title, items, danger, empty }) => (
    <div className="card">
      <div className="card-head"><span className="card-title" style={danger && items.length ? { color: 'var(--danger)' } : {}}>{title} ({items.length})</span></div>
      <div className="card-body" style={{ paddingTop: 6 }}>
        {items.map(t => <Row key={t.id} t={t} danger={danger} />)}
        {!items.length && <p style={{ fontSize: '.8rem', color: 'var(--muted)' }}>{empty}</p>}
      </div>
    </div>
  );

  return (
    <>
      <div className="grid kpi-grid" style={{ marginBottom: 16 }}>
        <div className="card kpi"><span className="kpi-label">Quá hạn</span>
          <div className="kpi-value" style={{ color: late.length ? 'var(--danger)' : 'var(--accent)' }}>{late.length}</div></div>
        <div className="card kpi"><span className="kpi-label">Hôm nay + 7 ngày</span>
          <div className="kpi-value">{dueToday.length + dueWeek.length}</div></div>
        <div className="card kpi"><span className="kpi-label">Chờ tôi duyệt</span>
          <div className="kpi-value" style={{ color: toApprove.length ? 'var(--warn, #D97706)' : 'inherit' }}>{toApprove.length}</div>
          <div className="kpi-sub"><Link href="/approvals" style={{ color: 'var(--primary)' }}>Mở Phê duyệt →</Link></div></div>
        <div className="card kpi"><span className="kpi-label">Giờ log tuần này</span>
          <div className="kpi-value">{Math.round(weekHours * 10) / 10}h</div>
          <div className="kpi-sub"><Link href="/timesheet" style={{ color: 'var(--primary)' }}>Ghi giờ →</Link></div></div>
      </div>

      <div className="grid two-col" style={{ alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16 }}>
          <Section title="🔥 Quá hạn" items={late} danger empty="Không có việc quá hạn — tuyệt!" />
          <Section title="📌 Hôm nay" items={dueToday} empty="Hôm nay không có việc đến hạn." />
          <Section title="📅 7 ngày tới" items={dueWeek} empty="Tuần tới đang trống." />
          {noDue.length > 0 && <Section title="Không có hạn" items={noDue} empty="" />}
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card">
            <div className="card-head"><span className="card-title">✋ Chờ tôi duyệt ({toApprove.length})</span></div>
            <div className="card-body" style={{ paddingTop: 6 }}>
              {toApprove.slice(0, 6).map(a => (
                <Link key={a.id} href="/approvals" className="act-item" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <span style={{ flex: 'none' }}>📋</span>
                  <div style={{ flex: 1 }}>
                    <div className="act-title">{a.title}</div>
                    <div className="act-sub">từ {a.requesterName}</div>
                  </div>
                </Link>
              ))}
              {!toApprove.length && <p style={{ fontSize: '.8rem', color: 'var(--muted)' }}>Không có yêu cầu nào chờ bạn.</p>}
            </div>
          </div>
          <div className="card">
            <div className="card-head"><span className="card-title">📞 Lịch hẹn hôm nay ({actsToday.length})</span></div>
            <div className="card-body" style={{ paddingTop: 6 }}>
              {actsToday.map(a => (
                <div key={a.id} className="act-item">
                  <span style={{ flex: 'none' }}>🕐</span>
                  <div style={{ flex: 1 }}><div className="act-title">{a.title}</div><div className="act-sub">Hoạt động CRM</div></div>
                </div>
              ))}
              {!actsToday.length && <p style={{ fontSize: '.8rem', color: 'var(--muted)' }}>Không có lịch hẹn nào hôm nay.</p>}
            </div>
          </div>
        </div>
      </div>
      {!mine.length && !toApprove.length && (
        <div style={{ marginTop: 16 }}><EmptyState title="Hôm nay bạn rảnh 🎉" sub="Không có việc được gán và không có gì chờ duyệt." /></div>
      )}
    </>
  );
}
