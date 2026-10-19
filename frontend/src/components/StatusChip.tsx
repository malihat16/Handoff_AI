import type { Status } from '../types';
import { Icon, type IconName } from './Icon';

const MAP: Record<Status, { label: string; tone: string; icon: IconName }> = {
  completed: { label: 'Completed', tone: 'good', icon: 'check' },
  awaiting_approval: { label: 'Needs approval', tone: 'warn', icon: 'pause' },
  failed: { label: 'Failed', tone: 'bad', icon: 'x' },
  rejected: { label: 'Rejected', tone: 'neutral', icon: 'ban' },
  running: { label: 'Running', tone: 'info', icon: 'spinner' },
  pending: { label: 'Queued', tone: 'neutral', icon: 'circle' },
};

export const statusLabel = (s: Status) => MAP[s].label;

/** Color never carries status alone: every chip pairs an icon with a text label. */
export function StatusChip({ status, blocked }: { status: Status; blocked?: 'duplicate' | null }) {
  const m = blocked ? { label: 'Duplicate blocked', tone: 'neutral', icon: 'ban' as IconName } : MAP[status];
  return (
    <span className={`chip chip--${m.tone}`}>
      <Icon name={m.icon} className={status === 'running' ? 'spin' : ''} />
      {m.label}
    </span>
  );
}

export function Tag({ children }: { children: string }) {
  return <span className="chip chip--plain">{children}</span>;
}
