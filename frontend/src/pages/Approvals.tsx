import { useEffect } from 'react';
import { api } from '../api';
import { Icon } from '../components/Icon';
import {
  DecisionBar, ExtractedPanel, ReasonBanner, ResolvedBanner, RunHead, SourcePanel,
} from '../components/RunParts';
import { fmtRelative, workflowLabel } from '../format';
import { navigate, usePoll, type Route } from '../hooks';
import type { Run } from '../types';

function QueueItem({ run, selected }: { run: Run; selected: boolean }) {
  const h = run.headline;
  return (
    <a className={`qitem${selected ? ' is-selected' : ''}`} href={`#/approvals/${run.id}`} aria-current={selected ? 'true' : undefined}>
      <div className="qitem__top">
        <span>{workflowLabel(run.workflow)}</span>
        <span>{fmtRelative(run.created_at)}</span>
      </div>
      <div className="qitem__title">{h.title}</div>
      <div className="qitem__sub">
        <span>{h.subtitle}</span>
        {h.amount && <span className="qitem__amount">{h.amount}</span>}
      </div>
    </a>
  );
}

export default function Approvals({ route }: { route: Route }) {
  const idParam = route.path[1] ? Number(route.path[1]) : null;
  const list = usePoll(() => api.runs({ status: 'awaiting_approval', limit: 100 }));
  const pending = list.data ?? [];
  const selectedId = idParam && Number.isFinite(idParam) ? idParam : pending[0]?.id ?? null;
  const detail = usePoll(() => (selectedId == null ? Promise.resolve(null) : api.run(selectedId)), [selectedId], 5000);
  
  const run = detail.data && detail.data.id === selectedId ? detail.data : null;

  // J / K move through the queue, the way you would in a mail client.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== 'j' && e.key !== 'k') return;
      const i = pending.findIndex((r) => r.id === selectedId);
      const next = pending[e.key === 'j' ? Math.min(pending.length - 1, i + 1) : Math.max(0, i - 1)];
      if (next) navigate(`/approvals/${next.id}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, selectedId]);

  const nextId = pending.find((r) => r.id !== selectedId)?.id ?? null;

  return (
    <div className="split">
      <aside className="panel qlist" aria-label="Approval queue">
        <div className="panel__head" style={{ paddingBottom: 12 }}>
          <h2 className="panel__title">Waiting for you</h2>
          <span className="chip chip--plain num">{pending.length}</span>
        </div>
        {pending.length === 0 ? (
          <div className="empty" style={{ borderTop: '1px solid var(--line)' }}>
            <div className="empty__title">All caught up</div>
            <p className="empty__text">Runs that need a person, like large invoices or customer complaints, will appear here.</p>
          </div>
        ) : (
          <div style={{ borderTop: '1px solid var(--line)' }}>
            {pending.map((r) => <QueueItem key={r.id} run={r} selected={r.id === selectedId} />)}
            <p className="muted" style={{ padding: '10px 16px', fontSize: 'var(--t-xs)', borderTop: '1px solid var(--line)' }}>
              Press J or K to move through the queue.
            </p>
          </div>
        )}
      </aside>

      <div className="detail">
        {selectedId == null ? (
          <div className="panel empty" style={{ padding: 28 }}>
            <Icon name="check" size={22} />
            <div className="empty__title">Nothing to approve</div>
            <p className="empty__text">When the AI pauses a run for a decision, you will see the original and what it extracted side by side here.</p>
            <a className="btn" href="#/runs">See all runs</a>
          </div>
        ) : !run ? (
          <p className="muted">{detail.error ?? 'Loading…'}</p>
        ) : (
          <>
            <RunHead run={run} />
            {run.status === 'awaiting_approval' ? (
              <ReasonBanner run={run} />
            ) : (
              <ResolvedBanner run={run} nextId={nextId} />
            )}
            <div className="panes">
              <SourcePanel text={run.input_text} />
              <ExtractedPanel run={run} />
            </div>
            {run.status === 'awaiting_approval' && (
              <DecisionBar run={run} onResolved={() => undefined} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
