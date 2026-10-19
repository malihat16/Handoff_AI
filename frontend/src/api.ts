import type {
  DailyReport, Health, RecordKind, Run, RunDetail, RunResult, SeedResult, Stats, WorkflowInfo,
} from './types';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

let unauthorizedHandler: (() => void) | null = null;
export function onUnauthorized(fn: () => void): () => void {
  unauthorizedHandler = fn;
  return () => {
    unauthorizedHandler = null;
  };
}

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage unavailable (private mode): the key just won't persist */
    }
  },
};

export const setApiKey = (key: string) => store.set('fp_key', key);
export const getApproverName = () => store.get('fp_name') ?? '';
export const setApproverName = (name: string) => store.set('fp_name', name);

interface Init extends Omit<RequestInit, 'body'> {
  json?: unknown;
  body?: BodyInit;
}

async function request<T>(path: string, init: Init = {}): Promise<T> {
  const { json, ...rest } = init;
  const headers = new Headers(rest.headers);
  const key = store.get('fp_key');
  if (key) headers.set('X-API-Key', key);
  let body = rest.body;
  if (json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(json);
  }
  const res = await fetch('/api' + path, { ...rest, headers, body });
  if (res.status === 401) {
    unauthorizedHandler?.();
    throw new ApiError(401, 'An API key is required to use this dashboard.');
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof payload.detail === 'string' ? payload.detail : null;
    throw new ApiError(res.status, detail ?? `The request failed (${res.status}).`);
  }
  return payload as T;
}

const qs = (params: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export interface RunQuery {
  status?: string;
  workflow?: string;
  q?: string;
  limit?: number;
}

export const api = {
  health: () => fetch('/api/health').then((r) => r.json() as Promise<Health>),
  workflows: () => request<WorkflowInfo[]>('/workflows'),
  stats: () => request<Stats>('/stats'),
  runs: (query: RunQuery = {}) => request<Run[]>('/runs' + qs({ limit: 50, ...query })),
  run: (id: number) => request<RunDetail>(`/runs/${id}`),
  approve: (id: number, approver: string, comment: string) =>
    request<RunDetail>(`/runs/${id}/approve`, { method: 'POST', json: { approver, comment: comment || null } }),
  reject: (id: number, approver: string, comment: string) =>
    request<RunDetail>(`/runs/${id}/reject`, { method: 'POST', json: { approver, comment: comment || null } }),
  retry: (id: number) => request<RunDetail>(`/runs/${id}/retry`, { method: 'POST' }),
  submit: (workflow: string, text: string) =>
    request<RunResult>('/runs', { method: 'POST', json: { workflow, text, source: 'dashboard' } }),
  upload: (workflow: string, file: File) => {
    const form = new FormData();
    form.append('workflow', workflow);
    form.append('file', file);
    return request<RunResult>('/runs/upload', { method: 'POST', body: form });
  },
  seed: () => request<SeedResult>('/demo/seed', { method: 'POST' }),
  report: (date?: string) => request<DailyReport>('/reports/daily' + qs({ date })),
  sendReport: () => request<DailyReport>('/reports/daily/send', { method: 'POST' }),
  data: <T>(kind: RecordKind) => request<T[]>(`/data/${kind}?limit=200`),
};
