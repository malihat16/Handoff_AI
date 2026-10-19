import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, errorMessage, onUnauthorized } from './api';
import { Icon, Logo, type IconName } from './components/Icon';
import { KeyDialog } from './components/KeyDialog';
import { NewRunDialog } from './components/NewRunDialog';
import {
  ActionsContext, RefreshContext, StatsContext, ToastProvider, useRoute, useTheme, useToast, usePoll,
  type ThemeChoice,
} from './hooks';
import Approvals from './pages/Approvals';
import Overview from './pages/Overview';
import Records from './pages/Records';
import Reports from './pages/Reports';
import RunDetail from './pages/RunDetail';
import Runs from './pages/Runs';

const NAV: { key: string; href: string; label: string; icon: IconName }[] = [
  { key: '', href: '#/', label: 'Overview', icon: 'overview' },
  { key: 'approvals', href: '#/approvals', label: 'Approvals', icon: 'inbox' },
  { key: 'runs', href: '#/runs', label: 'Runs', icon: 'route' },
  { key: 'records', href: '#/records', label: 'Records', icon: 'database' },
  { key: 'reports', href: '#/reports', label: 'Daily report', icon: 'report' },
];

const TITLES: Record<string, string> = {
  '': 'Overview', approvals: 'Approvals', runs: 'Runs', records: 'Records', reports: 'Daily report',
};

const THEMES: { value: ThemeChoice; icon: IconName; label: string }[] = [
  { value: 'light', icon: 'sun', label: 'Light' },
  { value: 'system', icon: 'monitor', label: 'Match system' },
  { value: 'dark', icon: 'moon', label: 'Dark' },
];

function Shell() {
  const route = useRoute();
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const [newRun, setNewRun] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [theme, setTheme] = useTheme();
  const [seeding, setSeeding] = useState(false);

  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const refresh = useMemo(() => ({ version, bump }), [version, bump]);

  useEffect(() => onUnauthorized(() => setKeyOpen(true)), []);

  return (
    <RefreshContext.Provider value={refresh}>
      <ShellInner
        route={route}
        theme={theme}
        setTheme={setTheme}
        newRun={newRun}
        setNewRun={setNewRun}
        keyOpen={keyOpen}
        setKeyOpen={setKeyOpen}
        seeding={seeding}
        onSeed={async () => {
          setSeeding(true);
          try {
            const res = await api.seed();
            bump();
            toast({ text: `Loaded demo data: ${res.new} new, ${res.duplicates} duplicates skipped.`, tone: 'ok' });
          } catch (e) {
            toast({ text: errorMessage(e), tone: 'bad' });
          } finally {
            setSeeding(false);
          }
        }}
      />
    </RefreshContext.Provider>
  );
}

interface InnerProps {
  route: ReturnType<typeof useRoute>;
  theme: ThemeChoice;
  setTheme: (t: ThemeChoice) => void;
  newRun: boolean;
  setNewRun: (b: boolean) => void;
  keyOpen: boolean;
  setKeyOpen: (b: boolean) => void;
  seeding: boolean;
  onSeed: () => Promise<void>;
}

function ShellInner({ route, theme, setTheme, newRun, setNewRun, keyOpen, setKeyOpen, seeding, onSeed }: InnerProps) {
  const statsPoll = usePoll(() => api.stats(), [], 8000);
  const health = usePoll(() => api.health(), [], 60000);
  const stats = useMemo(
    () => ({ stats: statsPoll.data, loaded: statsPoll.loaded, error: statsPoll.error }),
    [statsPoll.data, statsPoll.loaded, statsPoll.error],
  );
  const actions = useMemo(() => ({ openNewRun: () => setNewRun(true), loadDemo: onSeed }), [setNewRun, onSeed]);

  const section = route.path[0] ?? '';
  const waiting = statsPoll.data?.totals.awaiting_approval ?? 0;
  const title = section === 'runs' && route.path[1] ? `Run #${route.path[1]}` : TITLES[section] ?? 'Not found';

  useEffect(() => {
    document.title = `${title} · Handoff`;
  }, [title]);

  const llm = health.data?.llm;
  const engine = health.error ? 'Server unreachable' : !llm ? 'Connecting…' : llm === 'heuristic' ? 'Built-in rules engine' : `Claude (${llm})`;

  let page;
  switch (section) {
    case '': page = <Overview />; break;
    case 'approvals': page = <Approvals route={route} />; break;
    case 'runs': page = route.path[1] && Number.isFinite(Number(route.path[1])) ? <RunDetail id={Number(route.path[1])} /> : <Runs route={route} />; break;
    case 'records': page = <Records route={route} />; break;
    case 'reports': page = <Reports />; break;
    default:
      page = (
        <div className="panel empty">
          <div className="empty__title">Page not found</div>
          <a className="btn" href="#/">Go to overview</a>
        </div>
      );
  }

  return (
    <StatsContext.Provider value={stats}>
      <ActionsContext.Provider value={actions}>
        <div className="app">
          <aside className="rail">
            <a className="rail__brand" href="#/" aria-label="Handoff home">
              <Logo />
              <span>Handoff</span>
            </a>
            <nav className="rail__nav" aria-label="Main">
              {NAV.map((n) => (
                <a key={n.key} href={n.href} className={`rail__link${section === n.key ? ' is-active' : ''}`} aria-current={section === n.key ? 'page' : undefined}>
                  <Icon name={n.icon} />
                  <span>{n.label}</span>
                  {n.key === 'approvals' && waiting > 0 && <span className="rail__count num" aria-label={`${waiting} waiting`}>{waiting}</span>}
                </a>
              ))}
            </nav>
            <div className="rail__foot">
              <div className="theme" role="group" aria-label="Theme">
                {THEMES.map((t) => (
                  <button key={t.value} type="button" aria-pressed={theme === t.value} aria-label={t.label} title={t.label} onClick={() => setTheme(t.value)}>
                    <Icon name={t.icon} />
                  </button>
                ))}
              </div>
              <button type="button" className="btn" style={{ background: 'transparent', color: '#c9d4e2', borderColor: 'rgba(255,255,255,0.22)', justifyContent: 'flex-start' }} onClick={() => setKeyOpen(true)}>API key</button>
              <p className="rail__hint">Emails and invoices in, CRM records and approvals out.</p>
            </div>
          </aside>
          <div className="main">
            <header className="topbar">
              <h1 className="topbar__title">{title}</h1>
              <div className="topbar__right">
                <span className="engine" title="The engine that reads emails and invoices">
                  <span className={`engine__dot${health.error ? ' is-off' : ''}`} />
                  {engine}
                </span>
                <button type="button" className="btn" onClick={() => void onSeed()} disabled={seeding}>
                  <Icon name={seeding ? 'spinner' : 'sparkle'} />{seeding ? 'Loading…' : 'Load demo data'}
                </button>
                <button type="button" className="btn btn--primary" onClick={() => setNewRun(true)}>
                  <Icon name="plus" />Run workflow
                </button>
              </div>
            </header>
            <main className="page">{page}</main>
          </div>
        </div>
        <NewRunDialog open={newRun} onClose={() => setNewRun(false)} />
        <KeyDialog open={keyOpen} onClose={() => setKeyOpen(false)} />
      </ActionsContext.Provider>
    </StatsContext.Provider>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}
