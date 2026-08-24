import { Icon } from '@/components/ui';

export default function ReceiptBar({ title, detail, time, action }) {
  return (
    <div className="receipt-bar" role="status">
      <span><Icon name="receipt" size={17} /></span>
      <div><strong>{title}</strong>{detail && <p>{detail}</p>}</div>
      {time && <time>{time}</time>}
      {action}
    </div>
  );
}

