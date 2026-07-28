'use client';
// v3.37: Tài liệu công ty (feedback Egoric 07/2026) — kho tài sản số dùng chung:
// profile công ty, brand kit, mẫu hợp đồng/biểu mẫu… Ai cần lên lấy, chưa có thì upload lên.
// File lưu trong DB, cap 4MB/file — file lớn hơn dùng nút "Gắn tài liệu" (dán link) như cũ.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Icon, ConfirmDialog, EmptyState, useToast } from '@/components/ui';
import { isDirector } from '@/lib/perm';

const CATEGORIES = ['Profile công ty', 'Brand kit / Logo', 'Mẫu hợp đồng / biểu mẫu', 'Đào tạo nội bộ', 'Khác'];

const fmtSize = n => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

export default function CompanyDocsPage() {
  const { data: session } = useSession();
  const me = session?.user;
  const toast = useToast();
  const fileRef = useRef(null);
  const [docs, setDocs] = useState(null);
  const [cat, setCat] = useState('all');
  const [upCat, setUpCat] = useState(CATEGORIES[0]);
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const load = useCallback(() => {
    fetch('/api/docs', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).then(setDocs).catch(() => setDocs([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const upload = async files => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        if (file.size > 4 * 1024 * 1024) { toast(`"${file.name}" vượt 4MB — dùng Gắn tài liệu dán link Drive cho file lớn`, 'error'); continue; }
        const form = new FormData();
        form.append('file', file);
        form.append('category', upCat);
        if (note.trim()) form.append('note', note.trim());
        const r = await fetch('/api/docs', { method: 'POST', body: form });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { toast(j.error || `Upload "${file.name}" thất bại`, 'error'); continue; }
        toast(`Đã upload ${file.name}`);
      }
      setNote('');
      load();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async doc => {
    const r = await fetch(`/api/docs/${doc.id}`, { method: 'DELETE' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast(j.error || 'Không xóa được', 'error'); return false; }
    toast('Đã xóa tài liệu');
    load();
  };

  const visible = (docs || []).filter(d => cat === 'all' || (d.category || 'Khác') === cat);
  const canDelete = d => d.uploadedById === me?.id || isDirector(me);

  return (
    <>
      <div className="toolbar">
        <select className="filter" value={cat} onChange={e => setCat(e.target.value)}>
          <option value="all">Mọi danh mục</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span style={{ fontSize: '.85rem', color: 'var(--muted)' }}>Tài sản số dùng chung — ai cần lên lấy, chưa có thì upload (tối đa 4MB/file)</span>
        <div className="spacer"></div>
        <select className="filter" value={upCat} onChange={e => setUpCat(e.target.value)} title="Danh mục cho file sắp upload">
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input style={{ width: 170 }} placeholder="Ghi chú (tùy chọn)" value={note} onChange={e => setNote(e.target.value)} />
        <input ref={fileRef} type="file" multiple hidden onChange={e => upload([...e.target.files])} />
        <button className="btn btn-primary" disabled={uploading} onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={16} /><span>{uploading ? 'Đang tải lên…' : 'Upload tài liệu'}</span>
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Tài liệu</th><th>Danh mục</th><th className="num">Dung lượng</th><th>Người upload</th><th>Ngày</th><th></th></tr></thead>
          <tbody>
            {visible.map(d => (
              <tr key={d.id}>
                <td><span className="cell-main">{d.name}</span>{d.note && <span className="cell-sub">{d.note}</span>}</td>
                <td><span className="badge b-blue">{d.category || 'Khác'}</span></td>
                <td className="num">{fmtSize(d.size)}</td>
                <td>{d.uploadedBy}</td>
                <td style={{ color: 'var(--muted)', fontSize: '.8rem' }}>{new Date(d.createdAt).toLocaleDateString('vi-VN')}</td>
                <td><div className="row-actions">
                  <a className="icon-btn" href={`/api/docs/${d.id}`} title="Tải xuống" aria-label={`Tải ${d.name}`}><Icon name="download" size={16} /></a>
                  {canDelete(d) && <button className="icon-btn danger" onClick={() => setToDelete(d)} aria-label="Xóa"><Icon name="trash" size={16} /></button>}
                </div></td>
              </tr>
            ))}
            {docs && !visible.length && <tr><td colSpan={6}><EmptyState title="Chưa có tài liệu nào" sub="Upload profile công ty, brand kit, mẫu biểu… để cả team dùng chung" /></td></tr>}
          </tbody>
        </table>
      </div>
      {toDelete && <ConfirmDialog msg={`Xóa tài liệu "${toDelete.name}"?`} onClose={() => setToDelete(null)}
        onYes={async () => { const r = await remove(toDelete); if (r === false) return false; }} />}
    </>
  );
}
