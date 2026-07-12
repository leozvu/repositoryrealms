'use client';
import { useState } from 'react';
import { useResource, Icon, FormModal, ConfirmDialog, EmptyState, Forbidden, useToast } from '@/components/ui';
import { BarChart } from '@/components/charts';
import { money, moneyShort, monthKey, localISO, todayISO, docGrand, paidOf } from '@/lib/format';

export default function AnalyticsPage() {
  const invoices = useResource('invoices');
  const transactions = useResource('transactions');
  const clients = useResource('clients');
  const leads = useResource('leads');
  const nps = useResource('nps');
  const [modal, setModal] = useState(null);
  const toast = useToast();
  if (invoices.forbidden && nps.forbidden) return <Forbidden />;

  const cName = id => clients.rows.find(c => c.id === id)?.name || '—';
  const mk = off => { const d = new Date(); d.setMonth(d.getMonth() + off); return localISO(d).slice(0, 7); };

  /* ---------- MRR / ARR: từ hóa đơn retainer (bản mới nhất mỗi nhóm) ---------- */
  const recGroups = {};
  invoices.rows.filter(v => v.recurring).forEach(v => {
    const g = v.recGroup || v.id;
    if (!recGroups[g] || v.date > recGroups[g].date) recGroups[g] = v;
  });
  const mrr = Object.values(recGroups).reduce((s, v) => s + docGrand(v), 0);

  /* ---------- LTV / CAC ---------- */
  const revByClient = {};
  invoices.rows.forEach(v => { const p = paidOf(v); if (p) revByClient[v.clientId] = (revByClient[v.clientId] || 0) + p; });
  const payingClients = Object.keys(revByClient).length;
  const avgRevenue = payingClients ? Object.values(revByClient).reduce((a, b) => a + b, 0) / payingClients : 0;
  // Tuổi thọ TB (tháng): từ ngày tạo khách đến hóa đơn gần nhất
  const lifespans = clients.rows.filter(c => revByClient[c.id] && c.createdAt).map(c => {
    const last = invoices.rows.filter(v => v.clientId === c.id).map(v => v.date).sort().pop();
    return Math.max(1, (new Date(last) - new Date(c.createdAt)) / 86400000 / 30);
  });
  const avgLifespan = lifespans.length ? lifespans.reduce((a, b) => a + b, 0) / lifespans.length : 0;
  const ltv = avgLifespan ? Math.round(avgRevenue) : 0; // avgRevenue đã là tổng cả đời tới nay
  // CAC 3 tháng: chi marketing / khách thắng mới
  const mktMonths = [mk(-2), mk(-1), mk(0)];
  const mktSpend = transactions.rows.filter(t => t.type === 'expense' && ['Ngân sách quảng cáo', 'Marketing nội bộ'].includes(t.category) && mktMonths.includes(monthKey(t.date))).reduce((s, t) => s + t.amount, 0);
  const wonRecent = leads.rows.filter(l => l.stage === 'won' && l.createdAt && mktMonths.includes(monthKey(l.createdAt))).length;
  const cac = wonRecent ? Math.round(mktSpend / wonRecent) : null;

  /* ---------- Retention: khách có giao dịch lặp lại theo tháng ---------- */
  const labels = [], newC = [], retC = [];
  for (let i = -5; i <= 0; i++) {
    const k = mk(i);
    labels.push('T' + +k.slice(5));
    const clientsThis = new Set(invoices.rows.filter(v => monthKey(v.date) === k).map(v => v.clientId));
    const clientsBefore = new Set(invoices.rows.filter(v => monthKey(v.date) < k).map(v => v.clientId));
    let ret = 0, nw = 0;
    clientsThis.forEach(c => clientsBefore.has(c) ? ret++ : nw++);
    newC.push(nw); retC.push(ret);
  }

  /* ---------- NPS ---------- */
  const promoters = nps.rows.filter(r => r.score >= 9).length;
  const detractors = nps.rows.filter(r => r.score <= 6).length;
  const npsScore = nps.rows.length ? Math.round((promoters - detractors) / nps.rows.length * 100) : null;
  const NPS_FIELDS = [
    { key: 'clientId', label: 'Khách hàng', type: 'select', options: clients.rows.map(c => ({ value: c.id, label: c.name })), required: true },
    { key: 'score', label: 'Điểm (0–10): "Anh/chị có sẵn lòng giới thiệu chúng tôi?"', type: 'number', required: true },
    { key: 'date', label: 'Ngày khảo sát', type: 'date', required: true },
    { key: 'comment', label: 'Góp ý của khách', type: 'textarea', full: true },
  ];

  return (
    <>
      <div className="grid kpi-grid">
        <div className="card kpi"><span className="kpi-label">MRR (doanh thu định kỳ/tháng)</span>
          <div className="kpi-value" style={{ color: 'var(--accent)' }}>{money(mrr)}</div>
          <div className="kpi-sub">ARR: {moneyShort(mrr * 12)} · {Object.keys(recGroups).length} hợp đồng retainer</div></div>
        <div className="card kpi"><span className="kpi-label">LTV (giá trị vòng đời KH)</span>
          <div className="kpi-value">{money(ltv)}</div>
          <div className="kpi-sub">TB mỗi khách trả, tuổi thọ TB {avgLifespan.toFixed(1)} tháng</div></div>
        <div className="card kpi"><span className="kpi-label">CAC (chi phí có 1 khách)</span>
          <div className="kpi-value">{cac !== null ? money(cac) : '—'}</div>
          <div className="kpi-sub">{cac !== null ? `Chi mkt 3 tháng ${moneyShort(mktSpend)} / ${wonRecent} deal thắng · LTV/CAC = ${cac ? (ltv / cac).toFixed(1) : '—'}x` : 'Chưa có deal thắng 3 tháng qua'}</div></div>
        <div className="card kpi"><span className="kpi-label">NPS</span>
          <div className="kpi-value" style={{ color: npsScore === null ? 'inherit' : npsScore >= 50 ? 'var(--accent)' : npsScore >= 0 ? 'var(--warn)' : 'var(--danger)' }}>{npsScore === null ? '—' : npsScore}</div>
          <div className="kpi-sub">{nps.rows.length} phản hồi · {promoters} promoter / {detractors} detractor</div></div>
      </div>

      <div className="grid two-col" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-head"><span className="card-title">Khách mới vs khách quay lại (theo tháng có hóa đơn)</span></div>
          <div className="card-body">
            <BarChart labels={labels} series={[
              { name: 'Khách quay lại', color: '#2563EB', values: retC },
              { name: 'Khách mới', color: '#059669', values: newC },
            ]} height={200} />
          </div>
        </div>
        <div className="card">
          <div className="card-head"><span className="card-title">Khảo sát NPS</span>
            {!nps.forbidden && <button className="btn btn-outline btn-sm" onClick={() => setModal({ mode: 'add' })}><Icon name="plus" size={14} /> Ghi phản hồi</button>}
          </div>
          <div className="card-body" style={{ paddingTop: 8 }}>
            {nps.rows.slice(0, 8).map(r => (
              <div key={r.id} className="act-item">
                <span style={{ width: 34, height: 34, borderRadius: 9, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '.9rem', background: r.score >= 9 ? 'var(--accent-soft)' : r.score <= 6 ? 'var(--danger-soft)' : 'var(--warn-soft)', color: r.score >= 9 ? '#047857' : r.score <= 6 ? 'var(--danger)' : '#B45309' }}>{r.score}</span>
                <div style={{ flex: 1 }}>
                  <div className="act-title">{cName(r.clientId)}</div>
                  <div className="act-sub">{r.comment || 'Không có góp ý'} · {r.date}</div>
                </div>
                {!nps.forbidden && <button className="icon-btn danger" onClick={() => setModal({ mode: 'del', row: r })}><Icon name="trash" size={14} /></button>}
              </div>
            ))}
            {!nps.rows.length && <EmptyState title="Chưa có phản hồi NPS" sub="Hỏi khách sau mỗi dự án: 'Anh/chị có sẵn lòng giới thiệu chúng tôi cho người khác? (0-10)'" />}
          </div>
        </div>
      </div>

      {modal?.mode === 'add' && <FormModal title="Ghi phản hồi NPS" fields={NPS_FIELDS} data={{ date: todayISO(), score: 9 }}
        onClose={() => setModal(null)} onSave={async d => {
          const score = Math.max(0, Math.min(10, +d.score || 0));
          await nps.create({ ...d, score }); toast('Đã ghi phản hồi');
        }} />}
      {modal?.mode === 'del' && <ConfirmDialog msg="Xóa phản hồi này?" onClose={() => setModal(null)}
        onYes={async () => { await nps.remove(modal.row.id); toast('Đã xóa'); }} />}
    </>
  );
}
