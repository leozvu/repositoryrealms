'use client';
// v3.9: Modal gửi báo giá / hóa đơn qua email — server dựng nội dung từ chứng từ.
import { useState } from 'react';
import { Modal, useToast } from './ui';

export function SendEmailModal({ type, doc, defaultTo, onClose }) {
  const [to, setTo] = useState(defaultTo || '');
  const [message, setMessage] = useState(
    `Kính gửi Quý khách,\n\nChúng tôi gửi ${type === 'invoice' ? 'hóa đơn' : 'báo giá'} ${doc.code} kèm chi tiết bên dưới.\nRất mong nhận được phản hồi của Quý khách.\n\nTrân trọng!`);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const send = async () => {
    setBusy(true);
    const r = await fetch('/api/email/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, id: doc.id, to: to.trim(), message }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return toast(j.error || 'Gửi thất bại', 'error');
    toast(`Đã gửi ${doc.code} tới ${to.trim()}`);
    onClose();
  };

  return (
    <Modal title={`📧 Gửi ${type === 'invoice' ? 'hóa đơn' : 'báo giá'} ${doc.code}`} onClose={onClose}
      footer={<>
        <button className="btn btn-outline" onClick={onClose}>Hủy</button>
        <button className="btn btn-primary" disabled={busy} onClick={send}>{busy ? 'Đang gửi…' : 'Gửi email'}</button>
      </>}>
      <div className="form-grid">
        <div className="field full"><label>Gửi tới (email khách)</label>
          <input type="email" value={to} onChange={e => setTo(e.target.value)} placeholder="khach@congty.vn" /></div>
        <div className="field full"><label>Lời nhắn (đặt đầu email, bên trên bảng chi tiết)</label>
          <textarea rows={5} value={message} onChange={e => setMessage(e.target.value)} /></div>
        <p style={{ fontSize: '.76rem', color: 'var(--muted)' }}>
          Email gửi từ hộp thư công ty (Cài đặt → Email SMTP), kèm bảng chi tiết + thông tin thanh toán. Mọi lần gửi được ghi vào Nhật ký hệ thống.
        </p>
      </div>
    </Modal>
  );
}
