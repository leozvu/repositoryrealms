'use client';

import { useParams, useRouter } from 'next/navigation';
import { useResource, Forbidden, useToast } from '@/components/ui';
import DocEditor from '@/components/DocEditor';
import StatePanel from '@/components/system/StatePanel';

export default function InvoiceWorkspacePage() {
  const { id } = useParams();
  const router = useRouter();
  const invoices = useResource('invoices');
  const clients = useResource('clients');
  const projects = useResource('projects');
  const services = useResource('services');
  const toast = useToast();
  const createMode = id === 'new';
  const invoice = createMode ? null : invoices.rows.find((row) => row.id === id);

  if (invoices.forbidden) return <Forbidden />;
  if (!createMode && !invoice) return <StatePanel state="loading" title="Đang mở hóa đơn" description="Nếu hóa đơn không tồn tại, hãy quay lại danh sách." action={<button className="btn btn-outline" onClick={() => router.push('/invoices')}>Quay lại</button>} />;
  if (!clients.rows.length) return <StatePanel state="empty" title="Cần có khách hàng trước" description="Hóa đơn phải thuộc một khách hàng." action={<button className="btn btn-primary" onClick={() => router.push('/clients')}>Mở khách hàng</button>} />;

  return (
    <DocEditor
      embedded
      kind="invoice"
      doc={invoice}
      clients={clients.rows}
      projects={projects.rows}
      services={services.rows}
      allDocs={invoices.rows}
      onClose={() => router.push('/invoices')}
      onSave={async (data) => {
        const result = createMode
          ? await invoices.create({ ...data, payments: '[]' })
          : await invoices.update(id, data);
        if (!result) return false;
        toast(createMode ? 'Đã tạo hóa đơn' : 'Đã cập nhật hóa đơn');
        return result;
      }}
    />
  );
}
