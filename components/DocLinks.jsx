'use client';
// v3.5: Gắn link tài liệu ngoài (Drive/Notion/Figma…) vào dự án / khách / hợp đồng.
// Dùng inline trong card hoặc bọc trong Modal đều được.
import { useState } from 'react';
import { useResource, Icon, Modal, useToast } from './ui';

export function DocLinks({ refType, refId }) {
  const links = useResource('doclinks');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const toast = useToast();
  const mine = links.rows.filter(l => l.refType === refType && l.refId === refId);

  const add = async () => {
    if (!url.trim().startsWith('http')) return toast('URL phải bắt đầu bằng http', 'error');
    await links.create({ refType, refId, title: title.trim() || url.trim(), url: url.trim() });
    setTitle(''); setUrl(''); toast('Đã gắn link');
  };

  return (
    <div style={{ fontSize: '.83rem' }}>
      {mine.map(l => (
        <div key={l.id} className="act-item" style={{ alignItems: 'center' }}>
          <span style={{ flex: 'none' }}>📎</span>
          <a href={l.url} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, color: 'var(--primary)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={l.url}>{l.title}</a>
          <button className="icon-btn danger" onClick={async () => { await links.remove(l.id); toast('Đã gỡ link'); }} aria-label="Gỡ"><Icon name="x" size={13} /></button>
        </div>
      ))}
      {!mine.length && <p style={{ color: 'var(--muted)', margin: '4px 0' }}>Chưa có tài liệu nào — dán link Drive/Notion/Figma vào đây.</p>}
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <input style={{ flex: 1, minWidth: 100 }} placeholder="Tên (VD: Brief)" value={title} onChange={e => setTitle(e.target.value)} />
        <input style={{ flex: 2, minWidth: 140 }} placeholder="https://…" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
        <button className="btn btn-outline btn-sm" onClick={add}><Icon name="plus" size={13} /> Gắn</button>
      </div>
    </div>
  );
}

export function DocLinksModal({ refType, refId, name, onClose }) {
  return (
    <Modal title={`📎 Tài liệu — ${name}`} onClose={onClose}
      footer={<button className="btn btn-primary" onClick={onClose}>Đóng</button>}>
      <DocLinks refType={refType} refId={refId} />
    </Modal>
  );
}
