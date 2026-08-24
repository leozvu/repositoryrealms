import Link from 'next/link';
import { Icon } from '@/components/ui';

export default function ActionQueue({ sections, emptyTitle = 'Không có việc cần xử lý' }) {
  const visible = sections.filter((section) => section.items?.length);
  if (!visible.length) {
    return (
      <div className="action-queue-empty">
        <Icon name="check" size={21} />
        <div><strong>{emptyTitle}</strong><p>Bạn có thể tiếp tục với công việc đã lên kế hoạch.</p></div>
      </div>
    );
  }

  return (
    <div className="action-queue">
      {visible.map((section) => (
        <section key={section.key} className="action-queue-section" data-tone={section.tone || section.key}>
          <header>
            <span><Icon name={section.icon || 'tasks'} size={16} />{section.label}</span>
            <strong>{section.items.length}</strong>
          </header>
          <div>
            {section.items.map((item) => {
              const content = (
                <>
                  <span className="action-queue-kind"><Icon name={item.icon || 'tasks'} size={16} /></span>
                  <span className="action-queue-copy">
                    <strong>{item.title}</strong>
                    <small>{item.reason || item.meta}</small>
                  </span>
                  {item.due && <span className="action-queue-due">{item.due}</span>}
                  <Icon name="arrow" size={15} />
                </>
              );
              return item.href
                ? <Link key={item.id} href={item.href} className="action-queue-item">{content}</Link>
                : <div key={item.id} className="action-queue-item">{content}</div>;
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

