'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon, useToast } from '@/components/ui';
import { leadCsv } from '@/lib/lead-board-client';

export default function LeadExport({ scopeKey, disabled, userName }) {
  const active = useRef(null), currentScope = useRef(scopeKey);
  currentScope.current = scopeKey;
  const [pending, setPending] = useState(false);
  const toast = useToast();
  useEffect(() => {
    setPending(false);
    return () => { active.current?.abort(); active.current = null; };
  }, [scopeKey]);
  const download = async () => {
    if (active.current) return;
    const controller = new AbortController(), startedScope = scopeKey;
    active.current = controller; setPending(true);
    try {
      // Explicit export uses the full authorized collection, never visible cards.
      const response = await fetch('/api/data/leads', { signal: controller.signal, cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || 'Không thể xuất Lead. Hãy thử lại.');
      if (controller.signal.aborted || currentScope.current !== startedScope) return;
      const csv = leadCsv(body, userName);
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url;
      link.download = `pipeline-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      if (!controller.signal.aborted && currentScope.current === startedScope) toast(error.message || 'Không thể xuất Lead.', 'error');
    } finally {
      if (active.current === controller) { active.current = null; setPending(false); }
    }
  };
  return <button className="btn btn-outline btn-sm" disabled={disabled || pending} onClick={download} title="Xuất toàn bộ Lead bạn được phép xem tại thời điểm xuất">
    <Icon name="download" size={14} /><span>{pending ? 'Đang xuất toàn bộ…' : 'CSV toàn bộ'}</span>
  </button>;
}
