import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ReactNode,
} from 'react';
import { errorMessage } from './api';
import type { Stats } from './types';

// ---------------------------------------------------------------- refresh bus
interface RefreshValue {
  version: number;
  bump: () => void;
}
export const RefreshContext = createContext<RefreshValue>({ version: 0, bump: () => {} });
export const useRefresh = () => useContext(RefreshContext);

// ---------------------------------------------------------------- polling
export interface Poll<T> {
  data: T | null;
  error: string | null;
  loaded: boolean;
  refreshing: boolean;
}

/**
 * Fetch on mount, when `deps` change, after any mutation (refresh bus) and on an interval.
 * The previous data stays on screen while a refetch is in flight (no skeleton flash).
 */
export function usePoll<T>(load: () => Promise<T>, deps: unknown[] = [], intervalMs = 6000): Poll<T> {
  const { version } = useRefresh();
  const [state, setState] = useState<{ data: T | null; error: string | null; loaded: boolean }>({
    data: null, error: null, loaded: false,
  });
  const [refreshing, setRefreshing] = useState(false);
  const loadRef = useRef(load);
  loadRef.current = load;
  const seq = useRef(0);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      const mine = ++seq.current;
      setRefreshing(true);
      try {
        const data = await loadRef.current();
        if (alive && mine === seq.current) setState({ data, error: null, loaded: true });
      } catch (e) {
        if (alive && mine === seq.current) setState((s) => ({ ...s, error: errorMessage(e), loaded: true }));
      } finally {
        if (alive && mine === seq.current) setRefreshing(false);
      }
    };
    void run();
    const id = window.setInterval(() => {
      if (!document.hidden) void run();
    }, intervalMs);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, intervalMs, ...deps]);

  return { ...state, refreshing };
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

// ---------------------------------------------------------------- hash router
export interface Route {
  path: string[];
  query: URLSearchParams;
}

const parseHash = (): Route => {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [p, q = ''] = raw.split('?');
  return { path: p.split('/').filter(Boolean), query: new URLSearchParams(q) };
};

export function useRoute(): Route {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export const navigate = (to: string) => {
  window.location.hash = to;
};

// ---------------------------------------------------------------- toasts
export interface ToastInput {
  text: string;
  tone?: 'info' | 'ok' | 'bad';
  action?: { label: string; href: string };
}
interface Toast extends ToastInput {
  id: number;
}
const ToastContext = createContext<(t: ToastInput) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const push = useCallback((t: ToastInput) => {
    const id = nextId.current++;
    setToasts((all) => [...all, { ...t, id }]);
    window.setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), t.action ? 8000 : 5000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone ?? 'info'}`}>
            <span>{t.text}</span>
            {t.action && <a href={t.action.href}>{t.action.label}</a>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ---------------------------------------------------------------- shared shell state
export const StatsContext = createContext<{ stats: Stats | null; loaded: boolean; error: string | null }>({
  stats: null, loaded: false, error: null,
});
export const useStats = () => useContext(StatsContext);

export interface Actions {
  openNewRun: () => void;
  loadDemo: () => Promise<void>;
  startTour: () => void;
}
export const ActionsContext = createContext<Actions>({ openNewRun: () => {}, loadDemo: async () => {}, startTour: () => {} });
export const useActions = () => useContext(ActionsContext);

// ---------------------------------------------------------------- theme
export type ThemeChoice = 'system' | 'light' | 'dark';
export function useTheme(): [ThemeChoice, (t: ThemeChoice) => void] {
  const [theme, setTheme] = useState<ThemeChoice>(() => {
    const t = document.documentElement.dataset.theme;
    return t === 'light' || t === 'dark' ? t : 'system';
  });
  const choose = useCallback((t: ThemeChoice) => {
    setTheme(t);
    try {
      if (t === 'system') {
        delete document.documentElement.dataset.theme;
        localStorage.removeItem('fp_theme');
      } else {
        document.documentElement.dataset.theme = t;
        localStorage.setItem('fp_theme', t);
      }
    } catch {
      /* ignore storage failures */
    }
  }, []);
  return [theme, choose];
}
