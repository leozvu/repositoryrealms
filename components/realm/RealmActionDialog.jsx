'use client';

import { useMemo } from 'react';
import { ConfirmDialog, useToast } from '@/components/ui';
import { realmStateLabel } from '@/lib/realm-action-contract';

function idempotencyKey() {
  if (globalThis.crypto?.randomUUID) return `realm-action:${globalThis.crypto.randomUUID()}`;
  return `realm-action:${Date.now()}:${Math.random().toString(36).slice(2, 14)}`;
}

export default function RealmActionDialog({ command, onClose, onComplete }) {
  const toast = useToast();
  const key = useMemo(() => command ? command.idempotencyKey || idempotencyKey() : null, [command]);
  if (!command) return null;
  const fromLabel = realmStateLabel(command.expectedState);
  const toLabel = realmStateLabel(command.nextState);
  const apply = async () => {
    const response = await fetch('/api/realm-demo/actions', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({
        action: command.action,
        entityId: command.entityId,
        expectedState: command.expectedState,
        nextState: command.nextState,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast?.(payload.error || 'ERP từ chối cập nhật. Hãy tải lại và thử lại.', 'error');
      return false;
    }
    toast?.(payload.idempotent ? 'Lệnh đã được ERP ghi nhận trước đó.' : `${command.recordType} đã chuyển sang “${toLabel}”.`);
    onComplete?.(payload);
    return payload;
  };
  return (
    <ConfirmDialog
      msg={`Suggested Action: chuyển ${command.recordType} “${command.recordLabel}” từ “${fromLabel}” sang “${toLabel}”. RepositoryRealms sẽ kiểm tra quyền, business rules, receipt và audit trước khi xác nhận.`}
      yesLabel={`Suggested Action · ${toLabel}`}
      modalClassName="realm-generated-dialog"
      onYes={apply}
      onClose={onClose}
    />
  );
}
