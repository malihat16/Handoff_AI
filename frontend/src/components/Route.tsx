import { fmtMs, stepLabel } from '../format';
import type { StepState, TimelineStep } from '../types';
import { Icon, type IconName } from './Icon';

const NODE_ICON: Record<StepState, IconName | null> = {
  done: 'check',
  waiting: 'pause',
  failed: 'x',
  rejected: 'ban',
  running: 'spinner',
  pending: null,
};

const STATE_WORD: Record<StepState, string> = {
  done: 'done',
  waiting: 'waiting for approval',
  failed: 'failed',
  rejected: 'rejected',
  running: 'running',
  pending: 'not reached',
};

/** The route has been flown up to (and including) this waypoint. */
const reached = (s: StepState) => s !== 'pending';

function metaFor(step: TimelineStep): { text: string; bad?: boolean } {
  switch (step.status) {
    case 'done':
      return { text: [fmtMs(step.ms), step.retries ? `${step.retries} ${step.retries === 1 ? 'retry' : 'retries'}` : '']
        .filter(Boolean).join(', ') };
    case 'waiting':
      return { text: 'Holding for approval' };
    case 'failed':
      return { text: 'Stopped here', bad: true };
    case 'rejected':
      return { text: 'Rejected here' };
    case 'running':
      return { text: 'Running' };
    default:
      return { text: '' };
  }
}

/**
 * A run drawn as a route: one waypoint per workflow step. The line fills in as the run
 * progresses, holds (pulsing) at an approval, and stops at a cross where a step failed.
 */
export function RouteLine({ timeline }: { timeline: TimelineStep[] }) {
  if (!timeline.length) return null;
  return (
    <ol className="route" style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="Run route">
      {timeline.map((step, i) => {
        const icon = NODE_ICON[step.status];
        const meta = metaFor(step);
        const nextReached = i < timeline.length - 1 && reached(timeline[i + 1].status);
        return (
          <li key={step.name + i} className="wp">
            <div className="wp__track">
              <span className={`half l${reached(step.status) ? ' on' : ''}`} />
              <span className={`half r${nextReached ? ' on' : ''}`} />
              <span className={`node node--${step.status}`}>
                {icon && <Icon name={icon} size={16} className={step.status === 'running' ? 'spin' : ''} />}
              </span>
            </div>
            <div>
              <div className="wp__name">{stepLabel(step.name)}</div>
              <div className={`wp__meta${meta.bad ? ' wp__meta--bad' : ''}`}>
                <span className="sr-only">{STATE_WORD[step.status]}. </span>
                {meta.text || ' '}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Compact route for table rows. */
export function RouteDots({ timeline }: { timeline: TimelineStep[] }) {
  if (!timeline.length) return null;
  const summary = timeline.map((s) => `${stepLabel(s.name)}: ${STATE_WORD[s.status]}`).join('; ');
  return (
    <span className="dots" role="img" aria-label={summary} title={summary}>
      {timeline.map((s, i) => (
        <span key={s.name + i} style={{ display: 'inline-flex', alignItems: 'center' }}>
          {i > 0 && <span className={`dots__line${reached(s.status) ? ' on' : ''}`} />}
          <span className={`dot dot--${s.status}`} />
        </span>
      ))}
    </span>
  );
}
