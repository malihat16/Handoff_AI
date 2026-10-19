export type Status = 'pending' | 'running' | 'awaiting_approval' | 'completed' | 'failed' | 'rejected';
export type StepState = 'done' | 'running' | 'pending' | 'waiting' | 'failed' | 'rejected';

export interface TimelineStep {
  name: string;
  status: StepState;
  ms: number | null;
  retries: number;
}

export interface Headline {
  kind: 'invoice' | 'email' | null;
  title: string;
  subtitle: string;
  amount: string | null;
  intent?: string;
  priority?: string;
}

export interface Run {
  id: number;
  workflow: string;
  source: string;
  status: Status;
  error: string | null;
  blocked: 'duplicate' | null;
  approval_reason: string | null;
  approved_by: string | null;
  decision_comment: string | null;
  attempts: number;
  duration_ms: number;
  created_at: string;
  finished_at: string | null;
  preview: string;
  headline: Headline;
  timeline: TimelineStep[];
}

export interface Classification {
  intent: string;
  priority: string;
  summary: string;
  sender_name: string | null;
  sender_email: string | null;
  company: string | null;
  confidence: number;
  provider: string;
  fallback_reason?: string;
}

export interface InvoiceData {
  vendor: string | null;
  invoice_number: string | null;
  issue_date: string | null;
  due_date: string | null;
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  confidence: number;
  provider: string;
  fallback_reason?: string;
  grounding_failed?: boolean;
}

export interface LogEntry {
  ts: string;
  level: 'info' | 'warning' | 'error';
  step: string | null;
  message: string;
}

export interface RunDetail extends Run {
  input_text: string;
  data: { classification?: Classification; invoice?: InvoiceData };
  next_step: number;
  logs: LogEntry[];
}

export interface DayStat {
  date: string;
  runs: number;
  completed: number;
  failed: number;
  hours_saved: number;
}

export interface WorkflowStat {
  runs: number;
  completed: number;
  failed: number;
  blocked: number;
  awaiting_approval: number;
  hours_saved: number;
}

export interface Stats {
  totals: {
    runs: number;
    completed: number;
    failed: number;
    blocked: number;
    decided_by_person: number;
    awaiting_approval: number;
    rejected: number;
    success_rate: number | null;
    avg_duration_ms: number;
    hours_saved: number;
  };
  by_workflow: Record<string, WorkflowStat>;
  last_7_days: DayStat[];
}

export interface WorkflowInfo {
  name: string;
  description: string;
  trigger: string | null;
  minutes_saved: number;
  steps: string[];
}

export interface Health {
  status: string;
  llm: string;
  auth_required: boolean;
  workflows: string[];
}

export interface DailyReport {
  date: string;
  runs: number;
  by_status: Record<string, number>;
  hours_saved: number;
  tasks_created: number;
  invoices_processed: number;
  invoice_totals: Record<string, number>;
  needs_attention: { run_id: number; workflow: string; status: string; detail: string | null }[];
  markdown: string;
}

export interface RunResult {
  duplicate: boolean;
  run: Run;
}

export interface SeedResult {
  submitted: number;
  new: number;
  duplicates: number;
}

export interface Contact {
  id: number;
  email: string;
  name: string | null;
  company: string | null;
  last_intent: string | null;
  interactions: number;
  last_seen: string;
}

export interface TaskRow {
  id: number;
  run_id: number;
  title: string;
  priority: string;
  status: string;
  created_at: string;
}

export interface InvoiceRow {
  id: number;
  run_id: number;
  vendor: string;
  invoice_number: string;
  currency: string;
  total: number;
  due_date: string | null;
  status: string;
  approved_by: string | null;
}

export interface NotificationRow {
  id: number;
  run_id: number | null;
  channel: string;
  message: string;
  created_at: string;
}

export type RecordKind = 'contacts' | 'tasks' | 'invoices' | 'notifications';
