export const WORKFLOW_LABELS: Record<string, string> = {
  email_to_crm: 'Email to CRM',
  invoice_to_approval: 'Invoice approval',
};

export const STEP_LABELS: Record<string, string> = {
  classify_email: 'Classify email',
  upsert_contact: 'Update CRM',
  require_approval: 'Approval check',
  create_task: 'Create task',
  notify: 'Notify team',
  extract_invoice: 'Extract fields',
  validate_invoice: 'Validate',
  save_invoice: 'Save invoice',
  finalize_invoice: 'Mark approved',
};

export function humanize(s: string): string {
  const t = s.replace(/_/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export const workflowLabel = (name: string) => WORKFLOW_LABELS[name] ?? humanize(name);
export const stepLabel = (name: string) => STEP_LABELS[name] ?? humanize(name);

export function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return '';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function fmtHours(h: number): string {
  if (h <= 0) return '0 min';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  return `${h.toFixed(1)} h`;
}

const numberFmt = new Intl.NumberFormat();
export const fmtNumber = (n: number) => numberFmt.format(n);

export function fmtMoney(n: number | null | undefined, currency?: string | null): string {
  if (n == null) return '–';
  const v = n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${v}` : v;
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
export function fmtRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const seconds = (new Date(iso).getTime() - now) / 1000;
  const abs = Math.abs(seconds);
  if (abs < 45) return 'just now';
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), 'hour');
  return relative.format(Math.round(seconds / 86400), 'day');
}

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export const fmtClock = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function fmtDay(date: string, style: 'short' | 'long' = 'short'): string {
  const d = new Date(`${date}T00:00:00`);
  return style === 'short'
    ? d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })
    : d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Round axis ticks: 0 .. a clean maximum at or above `max`. */
export function niceTicks(max: number, target = 4, integer = false): number[] {
  if (!(max > 0)) return integer ? [0, 1] : [0, 1];
  const raw = max / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  let step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  if (integer) step = Math.max(1, Math.round(step));
  const top = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

/** Split "Reason text [field=value > limit]" produced by the approval step. */
export function parseReason(reason: string | null | undefined): { text: string; rule: string | null } {
  if (!reason) return { text: '', rule: null };
  const m = reason.match(/^(.*?)\s*\[(.*)\]\s*$/);
  return m ? { text: m[1], rule: m[2] } : { text: reason, rule: null };
}

export function providerLabel(provider: string): string {
  if (provider === 'heuristic') return 'Built-in rules engine';
  if (provider.startsWith('anthropic:')) return `Claude (${provider.slice('anthropic:'.length)})`;
  return provider;
}

export type Tone = 'ok' | 'warn' | 'bad';
export function confidenceTone(v: number): Tone {
  return v >= 0.8 ? 'ok' : v >= 0.6 ? 'warn' : 'bad';
}
