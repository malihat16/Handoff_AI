import { useState, type ReactNode } from 'react';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { fmtDateTime, fmtMoney, fmtRelative, humanize } from '../format';
import { usePoll, type Route } from '../hooks';
import type { Contact, InvoiceRow, NotificationRow, RecordKind, TaskRow } from '../types';

const KINDS: { kind: RecordKind; label: string; blurb: string }[] = [
  { kind: 'contacts', label: 'Contacts', blurb: 'People the email workflow added to the CRM.' },
  { kind: 'tasks', label: 'Tasks', blurb: 'Follow-ups created from emails.' },
  { kind: 'invoices', label: 'Invoices', blurb: 'Invoices the AI extracted and checked.' },
  { kind: 'notifications', label: 'Notifications', blurb: 'Messages queued for Slack and email.' },
];

const runLink = (id: number | null) => (id == null ? <span className="muted">–</span> : <a href={`#/runs/${id}`}>Run #{id}</a>);

function Chip({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'good' | 'warn' | 'bad' | 'neutral' }) {
  return <span className={`chip chip--plain chip--${tone}`}>{children}</span>;
}

const invoiceTone = (s: string) => (s === 'approved' ? 'good' : s === 'rejected' ? 'neutral' : 'warn');
const priorityTone = (p: string) => (p === 'high' ? 'bad' : p === 'low' ? 'neutral' : 'info');

function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode[]; empty: string }) {
  if (children.length === 0) {
    return (
      <div className="empty">
        <p className="empty__text">{empty}</p>
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>{head.map((h, i) => <th key={i} className={i >= 0 && typeof h === 'string' && h.startsWith('#') ? 'r' : undefined}>{typeof h === 'string' && h.startsWith('#') ? h.slice(1) : h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const match = (q: string, ...fields: (string | null | undefined)[]) =>
  !q || fields.some((f) => (f ?? '').toLowerCase().includes(q));

export default function Records({ route }: { route: Route }) {
  const kind = (KINDS.find((k) => k.kind === route.path[1])?.kind ?? 'contacts') as RecordKind;
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const rows = usePoll(() => api.data<unknown>(kind), [kind]);
  const data = (rows.data ?? []) as unknown[];
  const meta = KINDS.find((k) => k.kind === kind)!;

  let body: ReactNode = null;
  if (kind === 'contacts') {
    const list = (data as Contact[]).filter((c) => match(q, c.name, c.email, c.company, c.last_intent));
    body = (
      <Table head={['Contact', 'Company', 'Last topic', '#Contacts', 'Last seen']} empty="No contacts yet. They are added when an email is processed.">
        {list.map((c) => (
          <tr key={c.id}>
            <td><span className="cell-title">{c.name ?? c.email}</span><span className="cell-sub">{c.email}</span></td>
            <td>{c.company ?? <span className="muted">–</span>}</td>
            <td>{c.last_intent ? humanize(c.last_intent) : '–'}</td>
            <td className="r">{c.interactions}</td>
            <td className="muted">{fmtRelative(c.last_seen)}</td>
          </tr>
        ))}
      </Table>
    );
  } else if (kind === 'tasks') {
    const list = (data as TaskRow[]).filter((t) => match(q, t.title, t.priority, t.status));
    body = (
      <Table head={['Task', 'Priority', 'Status', 'From', 'Created']} empty="No tasks yet. They are created from emails that need a follow-up.">
        {list.map((t) => (
          <tr key={t.id}>
            <td><span className="cell-title" style={{ maxWidth: '56ch' }}>{t.title}</span></td>
            <td><Chip tone={priorityTone(t.priority) as 'good' | 'warn' | 'bad' | 'neutral'}>{humanize(t.priority)}</Chip></td>
            <td>{humanize(t.status)}</td>
            <td>{runLink(t.run_id)}</td>
            <td className="muted">{fmtRelative(t.created_at)}</td>
          </tr>
        ))}
      </Table>
    );
  } else if (kind === 'invoices') {
    const list = (data as InvoiceRow[]).filter((i) => match(q, i.vendor, i.invoice_number, i.status, i.approved_by));
    body = (
      <Table head={['Invoice', '#Total', 'Due', 'Status', 'Approved by', 'From']} empty="No invoices yet. They are saved when an invoice is processed.">
        {list.map((i) => (
          <tr key={i.id}>
            <td><span className="cell-title">{i.vendor}</span><span className="cell-sub">{i.invoice_number}</span></td>
            <td className="r">{fmtMoney(i.total, i.currency)}</td>
            <td>{i.due_date ?? <span className="muted">–</span>}</td>
            <td><Chip tone={invoiceTone(i.status) as 'good' | 'warn' | 'neutral'}>{i.status === 'pending_approval' ? 'Needs approval' : humanize(i.status)}</Chip></td>
            <td>{i.approved_by ?? <span className="muted">–</span>}</td>
            <td>{runLink(i.run_id)}</td>
          </tr>
        ))}
      </Table>
    );
  } else {
    const list = (data as NotificationRow[]).filter((n) => match(q, n.message, n.channel));
    body = (
      <Table head={['Channel', 'Message', 'From', 'Queued']} empty="No notifications yet.">
        {list.map((n) => (
          <tr key={n.id}>
            <td><Chip>{humanize(n.channel)}</Chip></td>
            <td style={{ maxWidth: '64ch', whiteSpace: 'pre-line' }}>{n.message.length > 220 ? `${n.message.slice(0, 220)}…` : n.message}</td>
            <td>{runLink(n.run_id)}</td>
            <td className="muted" title={fmtDateTime(n.created_at)}>{fmtRelative(n.created_at)}</td>
          </tr>
        ))}
      </Table>
    );
  }

  return (
    <div>
      <div className="filters">
        <div className="seg" role="tablist" aria-label="Record type">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              role="tab"
              aria-selected={k.kind === kind}
              onClick={() => {
                setSearch('');
                window.location.hash = `/records/${k.kind}`;
              }}
            >
              {k.label}
            </button>
          ))}
        </div>
        <div className="searchbox">
          <Icon name="search" />
          <input className="input" type="search" placeholder={`Search ${meta.label.toLowerCase()}`} aria-label={`Search ${meta.label.toLowerCase()}`} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <span className="muted" style={{ fontSize: 'var(--t-small)' }}>{meta.blurb}</span>
      </div>
      <div className="panel" style={{ overflow: 'hidden', opacity: rows.refreshing && rows.loaded ? 0.7 : 1, transition: 'opacity .2s' }}>
        {rows.error && !rows.data ? <div className="empty"><p className="empty__text">{rows.error}</p></div> : body}
      </div>
    </div>
  );
}
