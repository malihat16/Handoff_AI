import { useState } from 'react';
import { api, errorMessage, getApproverName, setApproverName } from '../api';
import {
  confidenceTone, fmtClock, fmtDateTime, fmtMoney, fmtRelative, humanize, parseReason, providerLabel,
  stepLabel, workflowLabel,
} from '../format';
import { useRefresh, useToast } from '../hooks';
import type { Classification, InvoiceData, LogEntry, Run, RunDetail } from '../types';
import { Icon } from './Icon';
import { Meter } from './Meter';
import { RouteLine } from './Route';
import { StatusChip } from './StatusChip';

// ---------------------------------------------------------------- heading with the route
export function RunHead({ run }: { run: Run }) {
  const h = run.headline;
  return (
    <section className="panel detail__head">
      <div className="detail__top">
        <div style={{ minWidth: 0 }}>
          <h2 className="detail__title">{h.title}</h2>
          <div className="detail__sub">
            <span>{workflowLabel(run.workflow)}</span>
            <span>{h.subtitle}</span>
            <span className="muted">Run #{run.id}, started {fmtRelative(run.created_at)}</span>
          </div>
        </div>
        <div style={{ display: 'grid', justifyItems: 'end', gap: 8 }}>
          {h.amount && <div className="detail__amount">{h.amount}</div>}
          <StatusChip status={run.status} blocked={run.blocked} />
        </div>
      </div>
      <RouteLine timeline={run.timeline} />
    </section>
  );
}

// ---------------------------------------------------------------- banners
export function ReasonBanner({ run }: { run: Run }) {
  const { text, rule } = parseReason(run.approval_reason);
  return (
    <div className="callout callout--warn">
      <Icon name="pause" size={18} />
      <div>
        <strong>Why this needs you</strong>
        {text || 'A person needs to review this run before it continues.'}
        {rule && <div className="callout__rule">Rule that paused it: {rule}</div>}
      </div>
    </div>
  );
}

export function ResolvedBanner({ run, nextId }: { run: Run; nextId: number | null }) {
  const by = run.approved_by ? ` by ${run.approved_by}` : '';
  const note = run.decision_comment ? ` Note: ${run.decision_comment}` : '';
  const done = run.status === 'completed';
  const rejected = run.status === 'rejected';
  return (
    <div className={`callout ${done ? 'callout--good' : rejected ? '' : 'callout--bad'}`}>
      <Icon name={done ? 'check' : rejected ? 'ban' : 'alert'} size={18} />
      <div>
        <strong>{done ? `Approved${by}. The run completed.` : rejected ? `Rejected${by}.` : `This run is ${run.status.replace('_', ' ')}.`}</strong>
        {note}
        {nextId != null && (
          <div style={{ marginTop: 6 }}>
            <a href={`#/approvals/${nextId}`}>Open the next approval</a>
          </div>
        )}
      </div>
    </div>
  );
}

export function DuplicateBanner({ run }: { run: Run }) {
  return (
    <div className="callout callout--info" role="status">
      <Icon name="ban" size={18} />
      <div style={{ flex: 1 }}>
        <strong>Duplicate blocked</strong>
        {run.error?.replace(/^DuplicateInvoice:\s*/, '')}
        <div className="callout__rule">Nothing was saved or sent. The duplicate check did its job, so there is nothing to retry.</div>
      </div>
    </div>
  );
}

export function FailureBanner({ run, onRetry, busy }: { run: Run; onRetry: () => void; busy: boolean }) {
  const failed = run.timeline.find((s) => s.status === 'failed');
  return (
    <div className="callout callout--bad" role="alert">
      <Icon name="alert" size={18} />
      <div style={{ flex: 1 }}>
        <strong>{failed ? `Stopped at “${stepLabel(failed.name)}”` : 'This run failed'}</strong>
        {run.error}
        <div className="callout__rule">Retrying resumes from the failed step. Steps that already ran are not repeated.</div>
      </div>
      <button type="button" className="btn btn--sm" onClick={onRetry} disabled={busy} style={{ alignSelf: 'center' }}>
        {busy ? <Icon name="spinner" className="spin" /> : <Icon name="refresh" />}
        Retry
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- source and extracted data
export function SourcePanel({ text }: { text: string }) {
  return (
    <section className="panel" style={{ overflow: 'hidden' }}>
      <div className="panel__head" style={{ paddingBottom: 12 }}>
        <h3 className="panel__title">Original</h3>
        <span className="panel__sub">Exactly as received</span>
      </div>
      <pre className="doc" tabIndex={0} aria-label="Original document text">{text}</pre>
    </section>
  );
}

type Field = [label: string, value: string | null | undefined];

function emailFields(c: Classification): Field[] {
  return [
    ['Intent', c.intent ? humanize(c.intent) : null],
    ['Priority', c.priority ? humanize(c.priority) : null],
    ['Summary', c.summary],
    ['Sender', c.sender_name],
    ['Email address', c.sender_email],
    ['Company', c.company],
  ];
}

function invoiceFields(i: InvoiceData): Field[] {
  return [
    ['Vendor', i.vendor],
    ['Invoice number', i.invoice_number],
    ['Issue date', i.issue_date],
    ['Due date', i.due_date],
    ['Subtotal', i.subtotal == null ? null : fmtMoney(i.subtotal, i.currency)],
    ['Tax', i.tax == null ? null : fmtMoney(i.tax, i.currency)],
    ['Total', i.total == null ? null : fmtMoney(i.total, i.currency)],
  ];
}

export function ExtractedPanel({ run }: { run: RunDetail }) {
  const data = run.data.invoice ?? run.data.classification;
  const fields = run.data.invoice
    ? invoiceFields(run.data.invoice)
    : run.data.classification
      ? emailFields(run.data.classification)
      : [];
  return (
    <section className="panel" style={{ overflow: 'hidden' }}>
      <div className="panel__head" style={{ paddingBottom: 12 }}>
        <h3 className="panel__title">What the AI found</h3>
        {data && <span className="panel__sub">{providerLabel(data.provider)}</span>}
      </div>
      {!data ? (
        <div className="empty" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="empty__text">Nothing was extracted. The run stopped before the AI step finished.</div>
        </div>
      ) : (
        <>
          <dl className="fields">
            {fields.flatMap(([label, value]) => [
              <dt key={`${label}-t`}>{label}</dt>,
              <dd key={`${label}-d`} className={value ? undefined : 'muted'}>{value || 'Not found'}</dd>,
            ])}
          </dl>
          <div className="confidence">
            <div className="confidence__row">
              <span className="muted">Confidence</span>
              <strong className="num">{Math.round(data.confidence * 100)}%</strong>
            </div>
            <Meter value={data.confidence} tone={confidenceTone(data.confidence)} label="AI confidence" />
          </div>
          {'grounding_failed' in data && data.grounding_failed && (
            <div style={{ padding: '0 18px 16px' }}>
              <div className="callout callout--warn">
                <Icon name="alert" size={18} />
                <div>
                  <strong>Check these values</strong>
                  Some of them could not be found in the original, so the AI may have guessed. Compare them with the document before approving.
                </div>
              </div>
            </div>
          )}
          {data.fallback_reason && (
            <div style={{ padding: '0 18px 16px' }}>
              <div className="callout">
                <Icon name="info" size={18} />
                <div>
                  <strong>Rules engine used</strong>
                  The AI service did not respond, so the built-in rules extracted these values.
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- decision bar
export function DecisionBar({ run, onResolved }: { run: Run; onResolved: (r: RunDetail) => void }) {
  const toast = useToast();
  const { bump } = useRefresh();
  const [name, setName] = useState(getApproverName);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);

  async function decide(kind: 'approve' | 'reject') {
    setBusy(kind);
    const who = name.trim() || 'reviewer';
    try {
      const res = kind === 'approve' ? await api.approve(run.id, who, comment) : await api.reject(run.id, who, comment);
      setApproverName(name.trim());
      bump();
      toast({ text: kind === 'approve' ? `Approved run #${run.id}.` : `Rejected run #${run.id}.`, tone: 'ok' });
      setComment('');
      onResolved(res);
    } catch (e) {
      toast({ text: errorMessage(e), tone: 'bad' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="bar" role="group" aria-label="Decision">
      <input className="input bar__name" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name" />
      <input className="input bar__note" placeholder="Add a note (optional)" value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Note" />
      <button type="button" className="btn btn--danger" disabled={busy !== null} onClick={() => decide('reject')}>
        {busy === 'reject' ? <Icon name="spinner" className="spin" /> : <Icon name="x" />}
        Reject
      </button>
      <button type="button" className="btn btn--primary" disabled={busy !== null} onClick={() => decide('approve')}>
        {busy === 'approve' ? <Icon name="spinner" className="spin" /> : <Icon name="check" />}
        Approve
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- log
export function LogPanel({ logs }: { logs: LogEntry[] }) {
  return (
    <section className="panel" style={{ overflow: 'hidden' }}>
      <div className="panel__head" style={{ paddingBottom: 10 }}>
        <h3 className="panel__title">Execution log</h3>
        <span className="panel__sub">{logs.length} entries</span>
      </div>
      <div className="table-wrap" style={{ borderTop: '1px solid var(--line)' }}>
        <table className="log">
          <tbody>
            {logs.map((l, i) => (
              <tr key={i}>
                <td className="log__time" title={fmtDateTime(l.ts)}>{fmtClock(l.ts)}</td>
                <td className="log__level">
                  {l.level === 'error' ? <Icon name="x" size={14} /> : l.level === 'warning' ? <Icon name="alert" size={14} /> : <Icon name="check" size={14} />}
                  <span className="sr-only">{l.level}</span>
                </td>
                <td className="log__step">{l.step ? stepLabel(l.step) : 'Run'}</td>
                <td>{l.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
