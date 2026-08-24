'use client';

import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useResource, Forbidden, useToast } from '@/components/ui';
import DocEditor from '@/components/DocEditor';
import StatePanel from '@/components/system/StatePanel';
import { hasAny } from '@/lib/perm';

export default function QuoteWorkspacePage() {
  const { id } = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const quotes = useResource('quotes');
  const clients = useResource('clients');
  const services = useResource('services');
  const toast = useToast();
  const createMode = id === 'new';
  const quote = createMode ? null : quotes.rows.find((row) => row.id === id);
  const canWrite = hasAny(session?.user, ['AM']);

  if (quotes.forbidden || !canWrite) return <Forbidden />;
  if (!createMode && !quote) return <StatePanel state="loading" title="Đang mở báo giá" description="Nếu báo giá không tồn tại, hãy quay lại danh sách." action={<button className="btn btn-outline" onClick={() => router.push('/quotes')}>Quay lại</button>} />;
  if (!clients.rows.length) return <StatePanel state="empty" title="Cần có khách hàng trước" description="Báo giá phải thuộc một khách hàng." action={<button className="btn btn-primary" onClick={() => router.push('/clients')}>Mở khách hàng</button>} />;

  return (
    <DocEditor
      embedded
      kind="quote"
      doc={quote}
      clients={clients.rows}
      services={services.rows}
      allDocs={quotes.rows}
      onClose={() => router.push('/quotes')}
      onSave={async (data) => {
        const result = createMode ? await quotes.create(data) : await quotes.update(id, data);
        if (!result) return false;
        toast(createMode ? 'Đã tạo báo giá' : 'Đã cập nhật báo giá');
        return result;
      }}
    />
  );
}
