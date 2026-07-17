'use client';
// v3.28: NHẬP LIỆU HÀNG LOẠT — dán bảng từ Excel/Google Sheets (TSV) → tự map cột → xem trước
// (bắt lỗi từng dòng) → nhập. Giảm rào cản đưa dữ liệu thật vào (khách, lead, thu/chi…).
import { useMemo, useState } from 'react';
import { useResource, useModules, Icon, useToast } from '@/components/ui';
import { money } from '@/lib/format';
import { modOn } from '@/lib/modules';
import { IMPORTABLE, validateRow, splitRows } from '@/lib/importable';

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

export default function ImportPage() {
  const modules = useModules();
  const toast = useToast();
  const options = Object.entries(IMPORTABLE).filter(([, s]) => modOn(s.mod, modules));
  const [resource, setResource] = useState(options[0]?.[0] || 'clients');
  const spec = IMPORTABLE[resource];
  const res = useResource(resource); // để refresh sau khi nhập + đếm hiện có
  const [text, setText] = useState('');
  const [mapping, setMapping] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(() => splitRows(text), [text]);
  const header = parsed[0] || [];
  const bodyRows = parsed.slice(1);

  // Tự map: mỗi field → cột có tiêu đề khớp nhất (theo nhãn hoặc key).
  const autoMap = () => {
    const m = {};
    for (const f of spec.fields) {
      const idx = header.findIndex(h => norm(h) === norm(f.label) || norm(h) === norm(f.key));
      if (idx >= 0) m[f.key] = idx;
    }
    setMapping(m);
    setResult(null);
  };
  // Khi đổi resource hoặc dữ liệu, tự map lại một lần.
  const onText = v => { setText(v); setResult(null); };
  const changeResource = r => { setResource(r); setMapping({}); setResult(null); };

  // Dựng các dòng xem trước + kiểm lỗi (dùng validateRow như server).
  const preview = useMemo(() => bodyRows.map(cells => {
    const raw = {};
    for (const f of spec.fields) { const i = mapping[f.key]; if (i != null && i >= 0) raw[f.key] = cells[i] ?? ''; }
    const { errors } = validateRow(raw, spec.fields);
    return { raw, errors };
  }), [bodyRows, mapping, spec]);
  const validRows = preview.filter(p => !p.errors.length);

  const doImport = async () => {
    if (!validRows.length) return toast('Không có dòng hợp lệ để nhập.', 'error');
    setBusy(true);
    const r = await fetch('/api/import/bulk', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource, rows: validRows.map(p => p.raw) }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return toast(j.error || 'Lỗi nhập liệu', 'error');
    setResult(j);
    await res.refresh();
    toast(`Đã nhập ${j.created} dòng${j.failed?.length ? `, ${j.failed.length} lỗi` : ''}`);
    if (j.created) { setText(''); setMapping({}); }
  };

  return (
    <>
      <div className="toolbar">
        <label style={{ fontSize: '.85rem', display: 'flex', alignItems: 'center', gap: 8 }}>Nhập vào:
          <select className="filter" value={resource} onChange={e => changeResource(e.target.value)}>
            {options.map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
          </select>
        </label>
        <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>đang có {res.rows.length} bản ghi</span>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-body">
          <p style={{ fontSize: '.85rem', marginTop: 0 }}>
            <b>Cách dùng:</b> mở Excel/Google Sheets, bôi đen vùng dữ liệu (gồm <b>dòng tiêu đề</b>), copy rồi dán vào ô dưới. Hệ thống tự nhận cột.
          </p>
          <div style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: 8 }}>
            Cột hỗ trợ: {spec.fields.map(f => <span key={f.key} className="badge b-gray" style={{ marginRight: 4, fontWeight: f.required ? 700 : 400 }}>{f.label}{f.required ? ' *' : ''}</span>)}
          </div>
          <textarea value={text} onChange={e => onText(e.target.value)} onPaste={() => setTimeout(autoMap, 0)}
            placeholder={`Dán bảng từ Excel vào đây (Tab phân cột). VD:\n${spec.fields.map(f => f.label).join('\t')}\n${spec.fields.map(() => '…').join('\t')}`}
            style={{ width: '100%', minHeight: 120, fontFamily: 'monospace', fontSize: '.82rem' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-outline btn-sm" onClick={autoMap} disabled={!header.length}>Nhận lại cột</button>
            {parsed.length > 0 && <span style={{ fontSize: '.8rem', color: 'var(--muted)', alignSelf: 'center' }}>{bodyRows.length} dòng dữ liệu, {header.length} cột</span>}
          </div>
        </div>
      </div>

      {header.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head"><span className="card-title">Khớp cột</span></div>
          <div className="card-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {spec.fields.map(f => (
              <label key={f.key} style={{ fontSize: '.82rem' }}>
                <div style={{ marginBottom: 3 }}>{f.label}{f.required && <span style={{ color: 'var(--danger)' }}> *</span>}</div>
                <select className="filter" value={mapping[f.key] ?? ''} onChange={e => { setMapping(m => ({ ...m, [f.key]: e.target.value === '' ? undefined : +e.target.value })); setResult(null); }}>
                  <option value="">— bỏ qua —</option>
                  {header.map((h, i) => <option key={i} value={i}>{h || `Cột ${i + 1}`}</option>)}
                </select>
              </label>
            ))}
          </div>
        </div>
      )}

      {bodyRows.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head">
            <span className="card-title">Xem trước — <span style={{ color: 'var(--accent)' }}>{validRows.length} hợp lệ</span>{preview.length - validRows.length > 0 && <span style={{ color: 'var(--danger)' }}> · {preview.length - validRows.length} lỗi</span>}</span>
            <button className="btn btn-primary" onClick={doImport} disabled={busy || !validRows.length}><Icon name="upload" size={15} /><span>Nhập {validRows.length} dòng hợp lệ</span></button>
          </div>
          <div className="table-wrap" style={{ border: 'none', boxShadow: 'none', maxHeight: 420, overflow: 'auto' }}>
            <table>
              <thead><tr><th>#</th>{spec.fields.map(f => <th key={f.key}>{f.label}</th>)}<th>Kiểm tra</th></tr></thead>
              <tbody>
                {preview.slice(0, 200).map((p, i) => (
                  <tr key={i} style={p.errors.length ? { background: 'var(--danger-soft)' } : {}}>
                    <td style={{ color: 'var(--muted)' }}>{i + 1}</td>
                    {spec.fields.map(f => <td key={f.key} style={{ fontSize: '.8rem' }}>{f.type === 'int' && p.raw[f.key] ? money(+String(p.raw[f.key]).replace(/[^\d-]/g, '') || 0) : (p.raw[f.key] || '')}</td>)}
                    <td style={{ fontSize: '.78rem', color: p.errors.length ? 'var(--danger)' : 'var(--accent)', fontWeight: 600 }}>{p.errors.length ? p.errors.join('; ') : '✓'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.length > 200 && <p style={{ fontSize: '.76rem', color: 'var(--muted)', padding: '0 14px 12px' }}>Xem trước 200 dòng đầu · sẽ nhập tất cả {validRows.length} dòng hợp lệ.</p>}
        </div>
      )}

      {result && (
        <div className="card" style={{ borderLeft: '4px solid var(--accent)' }}>
          <div className="card-body">
            <b style={{ color: 'var(--accent)' }}>✔ Đã nhập {result.created} dòng.</b>
            {result.failed?.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: 'pointer', color: 'var(--danger)' }}>{result.failed.length} dòng lỗi (không nhập)</summary>
                <ul style={{ fontSize: '.8rem', margin: '6px 0 0 18px' }}>{result.failed.slice(0, 30).map((f, i) => <li key={i}>Dòng {f.line}: {f.error}</li>)}</ul>
              </details>
            )}
          </div>
        </div>
      )}
    </>
  );
}
