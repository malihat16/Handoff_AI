import { useState } from 'react';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { RouteDots } from '../components/Route';
import { StatusChip } from '../components/StatusChip';
import { fmtMs, fmtRelative, workflowLabel } from '../format';
import { navigate, useActions, useDebounced, usePoll, type Route } from '../hooks';

const STATUSES = [
  ['', 'All'],
  ['awaiting_approval', 'Needs approval'],
  ['completed', 'Completed'],
  ['failed', 'Failed'],
  ['rejected', 'Rejected'],
] as const;

export default function Runs({ route }: { route: Route }) {
  const { openNewRun } = useActions();
  const [status, setStatus] = useState(route.query.get('status') ?? '');
  const [workflow, setWorkflow] = useState(route.query.get('workflow') ?? '');
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const runs = usePoll(() => api.runs({ status, workflow, q, limit: 100 }), [status, workflow, q]);
  const workflows = usePoll(() => api.workflows(), [], 60000);
  const rows = runs.data ?? [];
  const filtered = status !== '' || workflow !== '' || q !== '';

  return (
    <div>
      <div className="filters" role="search">
        <div className="searchbox">
          <Icon name="search" />
          <input
            className="input"
            type="search"
            placeholder="Search by sender, vendor, invoice number or run #"
            aria-label="Search runs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="select" aria-label="Workflow" value={workflow} onChange={(e) => setWorkflow(e.target.value)}>
          <option value="">All workflows</option>
          {(workflows.data ?? []).map((w) => <option key={w.name} value={w.name}>{workflowLabel(w.name)}</option>)}
        </select>
        <div className="seg" role="group" aria-label="Status">
          {STATUSES.map(([value, label]) => (
            <button key={value} type="button" aria-pressed={status === value} onClick={() => setStatus(value)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="panel" style={{ overflow: 'hidden', opacity: runs.refreshing && runs.loaded ? 0.7 : 1, transition: 'opacity .2s' }}>
        {rows.length === 0 && runs.loaded ? (
          <div className="empty">
            <div className="empty__title">{filtered ? 'No runs match these filters' : 'No runs yet'}</div>
            <p className="empty__text">
              {filtered
                ? 'Try a different search or clear the filters.'
                : 'Run a workflow to see it here, with every step it took.'}
            </p>
            {filtered ? (
              <button type="button" className="btn" onClick={() => { setStatus(''); setWorkflow(''); setSearch(''); }}>Clear filters</button>
            ) : (
              <button type="button" className="btn btn--primary" onClick={openNewRun}>Run a workflow</button>
            )}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table table--click">
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Workflow</th>
                  <th>Route</th>
                  <th>Status</th>
                  <th className="r">Time</th>
                  <th>Started</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    tabIndex={0}
                    onClick={() => navigate(`/runs/${r.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') navigate(`/runs/${r.id}`);
                    }}
                  >
                    <td>
                      <a className="cell-title" href={`#/runs/${r.id}`} onClick={(e) => e.stopPropagation()}>{r.headline.title}</a>
                      <span className="cell-sub">Run #{r.id}, {r.headline.subtitle}{r.headline.amount ? `, ${r.headline.amount}` : ''}</span>
                    </td>
                    <td>{workflowLabel(r.workflow)}</td>
                    <td><RouteDots timeline={r.timeline} /></td>
                    <td><StatusChip status={r.status} blocked={r.blocked} /></td>
                    <td className="r">{fmtMs(r.duration_ms)}</td>
                    <td className="muted">{fmtRelative(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
