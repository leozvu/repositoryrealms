import { Icon } from '@/components/ui';

export default function PageHeader({ title, description, meta, actions, icon }) {
  return (
    <header className="work-page-header">
      <div className="work-page-heading">
        {icon && <span className="work-page-icon"><Icon name={icon} size={20} /></span>}
        <div>
          {meta && <p className="work-page-meta">{meta}</p>}
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
      </div>
      {actions && <div className="work-page-actions">{actions}</div>}
    </header>
  );
}

