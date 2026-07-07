import type { ConvStatus } from '@vertex/shared';

const LABELS: Record<ConvStatus, string> = {
  ai_handling: 'AI handling',
  escalated: 'Escalated',
  staff_replied: 'Staff replied',
  resolved: 'Resolved',
  closed: 'Closed',
};

export function StatusBadge({ status }: { status: ConvStatus }) {
  return <span className={`badge status-${status}`}>{LABELS[status] ?? status}</span>;
}
