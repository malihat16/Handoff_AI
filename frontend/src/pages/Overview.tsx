import { useState } from 'react';
import { api, errorMessage } from '../api';
import { Icon } from '../components/Icon';
import { AreaLine, ChartFrame, DayTable, Sparkline, StackedColumns } from '../components/Charts';
import { Meter } from '../components/Meter';
import { RouteDots } from '../components/Route';
import { fmtHours, fmtMs, fmtNumber, fmtRelative, workflowLabel } from '../format';
import { useActions, usePoll, useRefresh, useStats, useToast } from '../hooks';
import type { Run } from '../types';

function Strip({ run }: { run: Run }) {
  return (
    <a className="strip" href={`#/approvals/${run.id}`}>
      <div className="strip__title">{run.headline.title}</div>
      <div className="strip__meta">
        <span>{workflowLabel(run.workflow)}</span>
        <span>{run.headline.subtitle}</span>
        {run.headline.amount && <strong className="num">{run.headline.amount}</strong>}
      </div>
      <div className="strip__side">
        <RouteDots timeline={run.timeline} />
        <span className="strip__age">{fmtRelative(run.created_at)}</span>
        <span className="strip__go">Review<Icon name="chevron-right" /></span>
      </div>
    </a>
  );
}

export default function Overview() {
  const { stats, loaded, error } = useStats();
  const { loadDemo, openNewRun } = useActions();
  const { bump } = useRefresh();
  const toast = useToast();
  const pending = usePoll(() => api.runs({ status: 'awaiting_approval', limit: 5 }));
  const failed = usePoll(() => api.runs({ status: 'failed', limit: 30 }));
  const [retrying, setRetrying] = useState<number | null>(null);

  async function retry(id: number) {
    setRetrying(id);
    try {
      const run = await api.retry(id);
      bump();
      toast({ text: run.status === 'failed' ? `Run #${id} failed again: ${run.error}` : `Run #${id} is ${run.status.replace('_', ' ')}.`, tone: run.status === 'failed' ? 'bad' : 'ok' });
    } catch (e) {
      toast({ text: errorMessage(e), tone: 'bad' });
    } finally {
      setRetrying(null);
    }
  }

  if (!stats) {
    return loaded ? (
      <div className="callout callout--bad" role="alert">
        <Icon name="alert" size={18} />
        <div>
          <strong>Can’t reach the Handoff server</strong>
          {error ?? 'Check that it is running, then reload this page.'}
        </div>
      </div>
    ) : (
      <p className="muted">Loading overview…</p>
    );
  }

  const t = stats.totals;
  const days = stats.last_7_days;
  const week = days.reduce((sum, d) => sum + d.runs, 0);
  const finished = t.completed + t.failed;
  const pendingRuns = pending.data ?? [];
  const failedRuns = (failed.data ?? []).filter((r) => !r.blocked).slice(0, 5);
  const quiet = week === 0;

  return (
    <div className="stack" style={{ gap: 26 }}>
      <section className="hero" aria-label="Needs your attention">
        <div>
          <div className="hero__num" aria-hidden="true">{t.awaiting_approval}</div>
          <div className="hero__label">
            <Icon name="pause" size={18} />
            <span>{t.awaiting_approval === 1 ? 'run is waiting for you' : 'runs are waiting for you'}</span>
          </div>
          <p className="hero__note">
            {t.awaiting_approval
              ? 'The AI paused these because a person should make the call.'
              : t.runs
                ? 'The AI is handling everything on its own.'
                : 'Nothing has run yet.'}
          </p>
        </div>
        <div className="panel strips">
          {pendingRuns.length > 0 ? (
            <>
              {pendingRuns.map((r) => <Strip key={r.id} run={r} />)}
              {t.awaiting_approval > pendingRuns.length && (
                <a className="strip" href="#/approvals" style={{ gridTemplateColumns: '1fr' }}>
                  <span className="strip__go">See all {t.awaiting_approval} approvals<Icon name="chevron-right" /></span>
                </a>
              )}
            </>
          ) : t.runs === 0 ? (
            <div className="empty">
              <div className="empty__title">No runs yet</div>
              <p className="empty__text">Load the sample emails and invoices to watch Handoff work, or run one of your own.</p>
              <div className="cluster">
                <button type="button" className="btn btn--primary" onClick={() => void loadDemo()}>Load demo data</button>
                <button type="button" className="btn" onClick={openNewRun}>Run a workflow</button>
              </div>
            </div>
          ) : (
            <div className="empty">
              <div className="empty__title">Nothing needs a decision</div>
              <p className="empty__text">Runs that need a person, like large invoices or customer complaints, will appear here.</p>
            </div>
          )}
        </div>
      </section>

      <section className="divided divided--kpis" aria-label="Key numbers">
        <div className="kpi">
          <div className="kpi__label">Runs</div>
          <div className="kpi__row">
            <div className="kpi__value num">{fmtNumber(t.runs)}</div>
            <Sparkline values={days.map((d) => d.runs)} label="Runs per day, last 7 days" />
          </div>
          <div className="kpi__sub">{fmtNumber(week)} in the last 7 days</div>
        </div>
        <div className="kpi">
          <div className="kpi__label">Success rate</div>
          <div className="kpi__value num">{t.success_rate == null ? '–' : `${t.success_rate}%`}</div>
          {t.success_rate != null && (
            <Meter value={t.success_rate / 100} tone={t.success_rate >= 80 ? 'ok' : t.success_rate >= 60 ? 'warn' : 'bad'} label="Success rate" />
          )}
          <div className="kpi__sub">
            {finished ? `${fmtNumber(t.completed)} of ${fmtNumber(finished)} finished runs completed` : 'No finished runs yet'}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi__label">Time saved</div>
          <div className="kpi__row">
            <div className="kpi__value num">{fmtHours(t.hours_saved)}</div>
            <Sparkline values={days.map((d) => d.hours_saved)} label="Time saved per day, last 7 days" />
          </div>
          <div className="kpi__sub">Estimated from minutes saved per completed run</div>
        </div>
        <div className="kpi">
          <div className="kpi__label">Average run time</div>
          <div className="kpi__value num">{t.avg_duration_ms ? fmtMs(t.avg_duration_ms) : '–'}</div>
          <div className="kpi__sub">For completed runs</div>
        </div>
      </section>

      <section className="divided divided--charts" aria-label="Activity">
        <ChartFrame
          title="Runs per day"
          hint="Last 7 days, by outcome"
          stale={pending.refreshing}
          chart={quiet ? <p className="muted" style={{ padding: '36px 0' }}>No runs in the last 7 days. Run a workflow and it will show up here.</p> : <StackedColumns days={days} />}
          table={
            <DayTable
              days={days}
              columns={[
                { label: 'Completed', get: (d) => String(d.completed) },
                { label: 'Failed or blocked', get: (d) => String(d.failed) },
                { label: 'In progress or waiting', get: (d) => String(Math.max(0, d.runs - d.completed - d.failed)) },
                { label: 'Total', get: (d) => String(d.runs) },
              ]}
            />
          }
        />
        <ChartFrame
          title="Time saved per day"
          hint="Estimated, last 7 days"
          chart={quiet ? <p className="muted" style={{ padding: '36px 0' }}>Time saved appears once runs complete.</p> : <AreaLine days={days} />}
          table={<DayTable days={days} columns={[{ label: 'Time saved', get: (d) => fmtHours(d.hours_saved) }]} />}
        />
      </section>

      <section className="two-up">
        <div className="panel panel--flush" style={{ overflow: 'hidden' }}>
          <div className="panel__head" style={{ paddingBottom: 10 }}>
            <h2 className="panel__title">Workflows</h2>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Workflow</th>
                  <th className="r">Runs</th>
                  <th className="r">Success</th>
                  <th className="r">Waiting</th>
                  <th className="r">Failed</th>
                  <th className="r">Time saved</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats.by_workflow).map(([name, w]) => {
                  const done = w.completed + w.failed;
                  return (
                    <tr key={name}>
                      <td><a className="cell-title" href={`#/runs?workflow=${name}`}>{workflowLabel(name)}</a></td>
                      <td className="r">{w.runs}</td>
                      <td className="r">{done ? `${Math.round((100 * w.completed) / done)}%` : '–'}</td>
                      <td className="r">{w.awaiting_approval}</td>
                      <td className="r">{w.failed}</td>
                      <td className="r">{fmtHours(w.hours_saved)}</td>
                    </tr>
                  );
                })}
                {Object.keys(stats.by_workflow).length === 0 && (
                  <tr><td colSpan={6} className="muted">No runs yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel" style={{ overflow: 'hidden' }}>
          <div className="panel__head" style={{ paddingBottom: 10 }}>
            <h2 className="panel__title">Failed runs</h2>
            {t.failed > 0 && <a href="#/runs?status=failed" style={{ fontSize: 'var(--t-small)', fontWeight: 600 }}>See all {t.failed}</a>}
          </div>
          {failedRuns.length === 0 ? (
            <div className="empty" style={{ borderTop: '1px solid var(--line)' }}>
              <p className="empty__text">No failed runs. Anything that fails will be listed here with the reason.</p>
            </div>
          ) : (
            <div className="attention" style={{ borderTop: '1px solid var(--line)' }}>
              {failedRuns.map((r) => (
                <div key={r.id} className="attention__item">
                  <div className="cluster" style={{ justifyContent: 'space-between' }}>
                    <a className="cell-title" href={`#/runs/${r.id}`}>{r.headline.title}</a>
                    <span className="muted" style={{ fontSize: 'var(--t-xs)' }}>{fmtRelative(r.created_at)}</span>
                  </div>
                  <div className="attention__err">{r.error}</div>
                  <div className="cluster">
                    <button type="button" className="btn btn--sm" disabled={retrying === r.id} onClick={() => void retry(r.id)}>
                      {retrying === r.id ? <Icon name="spinner" className="spin" /> : <Icon name="refresh" />}
                      Retry
                    </button>
                    <a className="btn btn--quiet btn--sm" href={`#/runs/${r.id}`}>Open run</a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
