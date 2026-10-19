import { useState } from 'react';
import { api, errorMessage } from '../api';
import { Icon } from '../components/Icon';
import { StatusChip } from '../components/StatusChip';
import { fmtDay, fmtHours, fmtMoney, humanize, workflowLabel } from '../format';
import { useRefresh, usePoll, useToast } from '../hooks';
import type { Status } from '../types';

const today = () => new Date().toISOString().slice(0, 10);

export default function Reports() {
  const toast = useToast();
  const { bump } = useRefresh();
  const [date, setDate] = useState(today());
  const report = usePoll(() => api.report(date), [date], 15000);
  const r = report.data && report.data.date === date ? report.data : null;
  const isToday = date === today();

  async function queue() {
    try {
      await api.sendReport();
      bump();
      toast({ text: 'Report queued as an email notification.', tone: 'ok', action: { label: 'See notifications', href: '#/records/notifications' } });
    } catch (e) {
      toast({ text: errorMessage(e), tone: 'bad' });
    }
  }
  async function copy() {
    if (!r) return;
    try {
      await navigator.clipboard.writeText(r.markdown);
      toast({ text: 'Report copied as text.', tone: 'ok' });
    } catch {
      toast({ text: 'Copying was blocked by the browser. Select the text and copy it instead.', tone: 'bad' });
    }
  }

  const totals = r ? Object.entries(r.invoice_totals) : [];

  return (
    <div className="stack" style={{ gap: 22 }}>
      <div className="filters" style={{ marginBottom: 0 }}>
        <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          Day
          <input className="input" type="date" style={{ width: 'auto' }} value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        <span className="muted">{fmtDay(date, 'long')}</span>
        <div className="cluster" style={{ marginLeft: 'auto' }}>
          <button type="button" className="btn" onClick={() => void copy()} disabled={!r}><Icon name="copy" />Copy as text</button>
          {isToday && <button type="button" className="btn btn--primary" onClick={() => void queue()}><Icon name="report" />Queue as email</button>}
        </div>
      </div>

      {!r ? (
        <p className="muted">{report.error ?? 'Loading report…'}</p>
      ) : (
        <>
          <section className="divided divided--kpis" aria-label="Report summary">
            <div className="kpi">
              <div className="kpi__label">Runs</div>
              <div className="kpi__value num">{r.runs}</div>
              <div className="cluster" style={{ gap: 6 }}>
                {Object.entries(r.by_status).map(([s, n]) => (
                  <span key={s} className="muted" style={{ fontSize: 'var(--t-xs)' }}>{n} {humanize(s === 'awaiting_approval' ? 'waiting' : s).toLowerCase()}</span>
                ))}
                {r.runs === 0 && <span className="kpi__sub">Nothing ran on this day</span>}
              </div>
            </div>
            <div className="kpi">
              <div className="kpi__label">Time saved</div>
              <div className="kpi__value num">{fmtHours(r.hours_saved)}</div>
              <div className="kpi__sub">Estimated</div>
            </div>
            <div className="kpi">
              <div className="kpi__label">Tasks created</div>
              <div className="kpi__value num">{r.tasks_created}</div>
              <div className="kpi__sub">From emails</div>
            </div>
            <div className="kpi">
              <div className="kpi__label">Invoices processed</div>
              <div className="kpi__value num">{r.invoices_processed}</div>
              <div className="kpi__sub">{totals.length ? totals.map(([c, a]) => fmtMoney(a, c)).join(', ') : 'None'}</div>
            </div>
          </section>

          <section className="panel" style={{ overflow: 'hidden' }}>
            <div className="panel__head" style={{ paddingBottom: 10 }}>
              <h2 className="panel__title">Needs attention</h2>
              <span className="panel__sub">All open items, not just this day’s</span>
            </div>
            {r.needs_attention.length === 0 ? (
              <div className="empty" style={{ borderTop: '1px solid var(--line)' }}>
                <p className="empty__text">Nothing is waiting and nothing has failed.</p>
              </div>
            ) : (
              <div className="attention" style={{ borderTop: '1px solid var(--line)' }}>
                {r.needs_attention.map((a) => (
                  <div key={a.run_id} className="attention__item">
                    <div className="cluster">
                      <StatusChip status={a.status as Status} />
                      <a className="cell-title" style={{ maxWidth: 'none' }} href={a.status === 'awaiting_approval' ? `#/approvals/${a.run_id}` : `#/runs/${a.run_id}`}>
                        Run #{a.run_id}, {workflowLabel(a.workflow)}
                      </a>
                    </div>
                    <div className="attention__err">{a.detail}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
