'use client';

import { useMemo, useState } from 'react';
import { AsyncButton, Modal, useToast } from '@/components/ui';
import { REALM_FOLLOWUP_KINDS, REALM_FOLLOWUP_LABELS } from '@/lib/realm-action-contract';
import styles from './realm-action-center.module.css';

function idempotencyKey() {
  if (globalThis.crypto?.randomUUID) return `realm-action:${globalThis.crypto.randomUUID()}`;
  return `realm-action:${Date.now()}:${Math.random().toString(36).slice(2, 14)}`;
}

async function postAction(command, key, fields) {
  const response = await fetch('/api/realm-demo/actions', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ action: command.action, entityId: command.entityId, ...fields }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'ERP từ chối thao tác. Hãy thử lại.');
  return payload;
}

function TaskCommentDialog({ command, onClose, onComplete }) {
  const toast = useToast();
  const key = useMemo(() => command.idempotencyKey || idempotencyKey(), [command]);
  const [content, setContent] = useState('');
  const submit = async () => {
    const clean = content.trim();
    if (!clean) {
      toast?.('Hãy nhập nội dung War Council note.', 'error');
      return false;
    }
    try {
      const payload = await postAction(command, key, { content: clean });
      toast?.(payload.idempotent ? 'Ghi chú này đã được ERP nhận trước đó.' : 'War Council note đã xuất hiện trong Task ERP.');
      onComplete?.(payload);
      return payload;
    } catch (error) {
      toast?.(error.message, 'error');
      return false;
    }
  };
  return (
    <Modal title="War Council note" onClose={onClose} footer={<>
      <button type="button" className="btn btn-outline" onClick={onClose}>Hủy</button>
      <AsyncButton type="button" className="btn btn-primary" pendingLabel="Đang gửi tới ERP…" disabled={!content.trim()} onClick={submit}>Gửi tới Task ERP</AsyncButton>
    </>}>
      <div className={styles.composer}>
        <p>Ghi chú cho Quest <strong>“{command.recordLabel}”</strong>. Người phụ trách ERP sẽ nhận thông báo như một comment thông thường.</p>
        <label htmlFor="realm-task-comment">Nội dung ghi chú</label>
        <textarea id="realm-task-comment" value={content} onChange={(event) => setContent(event.target.value)} maxLength={800} rows={6} autoFocus placeholder="Nêu quyết định, blocker hoặc @nhắc đồng đội…" />
        <small>{content.length}/800 · Nội dung được lưu trực tiếp trong Task ERP; audit chỉ lưu mã bản ghi.</small>
      </div>
    </Modal>
  );
}

function todayValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function LeadFollowupDialog({ command, onClose, onComplete }) {
  const toast = useToast();
  const key = useMemo(() => command.idempotencyKey || idempotencyKey(), [command]);
  const [kind, setKind] = useState('call');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayValue);
  const submit = async () => {
    if (!title.trim() || !date) {
      toast?.('Hãy nhập tiêu đề và ngày follow-up.', 'error');
      return false;
    }
    try {
      const payload = await postAction(command, key, { kind, title: title.trim(), date });
      toast?.(payload.idempotent ? 'Follow-up này đã được ERP nhận trước đó.' : 'Lịch follow-up đã được thêm vào CRM ERP.');
      onComplete?.(payload);
      return payload;
    } catch (error) {
      toast?.(error.message, 'error');
      return false;
    }
  };
  return (
    <Modal title="Diplomatic follow-up" onClose={onClose} footer={<>
      <button type="button" className="btn btn-outline" onClick={onClose}>Hủy</button>
      <AsyncButton type="button" className="btn btn-primary" pendingLabel="Đang ghi vào CRM…" disabled={!title.trim() || !date} onClick={submit}>Lưu vào CRM ERP</AsyncButton>
    </>}>
      <div className={styles.composer}>
        <p>Lên lịch chăm sóc <strong>“{command.recordLabel}”</strong>. Đây là Activity CRM thật, không phải dữ liệu game riêng.</p>
        <div className={styles.grid}>
          <label>Hình thức<select value={kind} onChange={(event) => setKind(event.target.value)}>{REALM_FOLLOWUP_KINDS.map((value) => <option value={value} key={value}>{REALM_FOLLOWUP_LABELS[value]}</option>)}</select></label>
          <label>Ngày thực hiện<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        </div>
        <label htmlFor="realm-followup-title">Nội dung follow-up</label>
        <input id="realm-followup-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} autoFocus placeholder="Ví dụ: Gọi xác nhận phạm vi proposal" />
        <small>{title.length}/160 · Có thể tiếp tục chỉnh sửa hoặc hoàn tất Activity từ CRM nguyên bản.</small>
      </div>
    </Modal>
  );
}

export default function RealmCreateActionDialog({ command, onClose, onComplete }) {
  if (!command) return null;
  if (command.action === 'task.comment.create') return <TaskCommentDialog command={command} onClose={onClose} onComplete={onComplete} />;
  if (command.action === 'lead.followup.create') return <LeadFollowupDialog command={command} onClose={onClose} onComplete={onComplete} />;
  return null;
}
