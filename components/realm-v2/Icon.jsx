import { Icon as ProductIcon } from '@/components/ui';

const ALIASES = {
  refresh: 'repeat',
  close: 'x',
  offline: 'warning',
  dot: 'note',
};

export default function Icon({ name, size = 20, className }) {
  return <span className={className} aria-hidden="true"><ProductIcon name={ALIASES[name] || name} size={size} /></span>;
}
