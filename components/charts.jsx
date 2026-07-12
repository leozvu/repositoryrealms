'use client';
// Biểu đồ SVG thuần — port từ v1, không cần thư viện ngoài
import { money, moneyShort } from '@/lib/format';

export function BarChart({ labels, series, height = 220 }) {
  const W = 640, H = height, padL = 46, padB = 24, padT = 12;
  const all = series.flatMap(s => s.values);
  const max = Math.max(...all, 1) * 1.12;
  const n = labels.length, groupW = (W - padL - 8) / n;
  const barW = Math.min(20, (groupW - 12) / series.length);
  return (
    <>
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img">
        {[0, 1, 2, 3, 4].map(g => {
          const y = padT + (H - padT - padB) * g / 4;
          return (
            <g key={g}>
              <line x1={padL} y1={y} x2={W} y2={y} stroke="var(--border)" strokeWidth="1" />
              <text x={padL - 7} y={y + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{moneyShort(max * (4 - g) / 4)}</text>
            </g>
          );
        })}
        {labels.map((lb, i) => {
          const cx = padL + groupW * i + groupW / 2;
          return (
            <g key={i}>
              <text x={cx} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">{lb}</text>
              {series.map((s, si) => {
                const v = s.values[i] || 0;
                const bh = (H - padT - padB) * v / max;
                const x = cx - (barW * series.length + 4 * (series.length - 1)) / 2 + si * (barW + 4);
                return <rect key={si} x={x} y={H - padB - bh} width={barW} height={bh} rx="3" fill={s.color}>
                  <title>{`${lb} — ${s.name}: ${money(v)}`}</title></rect>;
              })}
            </g>
          );
        })}
      </svg>
      <div className="legend">{series.map(s => <span key={s.name}><i style={{ background: s.color }}></i>{s.name}</span>)}</div>
    </>
  );
}

export function DonutChart({ data, centerLabel = 'Tổng' }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <p style={{ fontSize: '.83rem', color: 'var(--muted)' }}>Chưa có dữ liệu</p>;
  const R = 70, C = 2 * Math.PI * R;
  let off = 0;
  return (
    <div style={{ display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg width="150" height="150" viewBox="0 0 180 180" role="img">
        {data.map((d, i) => {
          const frac = d.value / total;
          const el = (
            <circle key={i} r={R} cx="90" cy="90" fill="none" stroke={d.color} strokeWidth="26"
              strokeDasharray={`${(frac * C).toFixed(2)} ${C.toFixed(2)}`}
              strokeDashoffset={(-off * C).toFixed(2)} transform="rotate(-90 90 90)">
              <title>{`${d.label}: ${money(d.value)} (${Math.round(frac * 100)}%)`}</title>
            </circle>
          );
          off += frac;
          return el;
        })}
        <text x="90" y="86" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--fg)">{moneyShort(total)}</text>
        <text x="90" y="103" textAnchor="middle" fontSize="9.5" fill="var(--muted)">{centerLabel}</text>
      </svg>
      <div style={{ flex: 1, minWidth: 170 }}>
        {data.map(d => (
          <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.79rem', padding: '4px 0' }}>
            <i style={{ width: 10, height: 10, borderRadius: 3, background: d.color, flex: 'none', display: 'inline-block' }}></i>
            <span style={{ flex: 1, color: 'var(--muted)' }}>{d.label}</span>
            <b>{moneyShort(d.value)}</b>
            <span style={{ color: 'var(--muted)', width: 38, textAlign: 'right' }}>{Math.round(d.value / total * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Funnel({ stages }) {
  const max = Math.max(...stages.map(s => s.count), 1);
  return stages.map(s => (
    <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', fontSize: '.8rem' }}>
      <span style={{ width: 100, color: 'var(--muted)', flex: 'none' }}>{s.label}</span>
      <div style={{ flex: 1, background: 'var(--muted-bg)', borderRadius: 6, height: 24, overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(4, s.count / max * 100)}%`, height: '100%', background: s.color, borderRadius: 6, display: 'flex', alignItems: 'center', paddingLeft: 8, color: '#fff', fontSize: '.7rem', fontWeight: 700 }}>{s.count}</div>
      </div>
      <b style={{ width: 76, textAlign: 'right', fontSize: '.76rem' }}>{moneyShort(s.value)}</b>
    </div>
  ));
}
