import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { navigate } from '../hooks';
import { Icon } from './Icon';

interface Step {
  target: string;
  title: string;
  body: string;
  route?: string;
  side?: 'right' | 'bottom' | 'left' | 'top';
}

export const TOUR_STEPS: Step[] = [
  {
    target: 'demo',
    title: 'Start with sample data',
    body: 'Load demo data adds 10 sample emails and invoices. Handoff reads each one, finishes the routine ones itself, and pauses the risky ones for you.',
    side: 'bottom',
  },
  {
    target: 'hero',
    route: '/',
    title: 'This is your handoff tray',
    body: 'The big number counts jobs the AI paused because a person should decide. Open one from this list to review it.',
    side: 'bottom',
  },
  {
    target: 'nav-approvals',
    title: 'Approvals: you make the call',
    body: 'See the original email or invoice next to what the AI found, then approve or reject. Press J and K to move through the queue.',
    side: 'right',
  },
  {
    target: 'nav-runs',
    title: 'Runs: every job, step by step',
    body: 'Search by sender, vendor or invoice number. Open a run to see each step, how long it took, any retries, and the full log.',
    side: 'right',
  },
  {
    target: 'nav-records',
    title: 'Records: what Handoff created',
    body: 'Contacts, follow-up tasks, invoices and queued notifications. This is the output your team would normally type in by hand.',
    side: 'right',
  },
  {
    target: 'nav-reports',
    title: 'Daily report',
    body: 'A summary of the day: runs, time saved, invoice totals, and anything still needing attention. Copy it or queue it as an email.',
    side: 'right',
  },
  {
    target: 'run',
    title: 'Now try your own',
    body: 'Drop an email or a PDF invoice, or paste text, and choose a workflow. Stuck on a word or a message? Open Help in the sidebar, or replay this tour from there.',
    side: 'bottom',
  },
];

const PAD = 8;
const find = (key: string) => document.querySelector<HTMLElement>(`[data-tour="${key}"]`);

interface Box { top: number; left: number; width: number; height: number }

export function Tour({ open, onClose }: { open: boolean; onClose: (finished: boolean) => void }) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const step = TOUR_STEPS[i];
  const last = i === TOUR_STEPS.length - 1;

  useEffect(() => {
    if (open) setI(0);
  }, [open]);

  // Locate the target for the current step; wait briefly for it to render after a route change.
  const measure = useCallback(() => {
    const el = find(step.target);
    if (!el) {
      setBox(null);
      return false;
    }
    const r = el.getBoundingClientRect();
    setBox({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
    return true;
  }, [step.target]);

  useEffect(() => {
    if (!open) return;
    if (step.route && (window.location.hash.replace(/^#/, '') || '/') !== step.route) navigate(step.route);
    let tries = 0;
    let timer = 0;
    const attempt = () => {
      const el = find(step.target);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'auto' });
        window.requestAnimationFrame(() => measure());
      } else if (tries++ < 20) {
        timer = window.setTimeout(attempt, 100);
      } else {
        setBox(null);
      }
    };
    attempt();
    return () => window.clearTimeout(timer);
  }, [open, step, measure]);

  useEffect(() => {
    if (!open) return;
    const on = () => measure();
    window.addEventListener('resize', on);
    window.addEventListener('scroll', on, true);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('scroll', on, true);
    };
  }, [open, measure]);

  // Place the card next to the highlighted element, kept inside the viewport.
  useLayoutEffect(() => {
    if (!open || !card.current) return;
    const c = card.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!box || vw < 700) {
      setPos(null);
      return;
    }
    const gap = 14;
    let top = box.top + box.height + gap;
    let left = box.left;
    if (step.side === 'right') {
      top = box.top;
      left = box.left + box.width + gap;
    } else if (step.side === 'left') {
      top = box.top;
      left = box.left - c.width - gap;
    } else if (step.side === 'top') {
      top = box.top - c.height - gap;
    }
    left = Math.max(12, Math.min(left, vw - c.width - 12));
    top = Math.max(12, Math.min(top, vh - c.height - 12));
    setPos({ top, left });
  }, [open, box, step.side, i]);

  const finish = useCallback((done: boolean) => onClose(done), [onClose]);
  const next = useCallback(() => (last ? finish(true) : setI((n) => n + 1)), [last, finish]);
  const back = useCallback(() => setI((n) => Math.max(0, n - 1)), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(false);
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, finish, next, back]);

  useEffect(() => {
    if (open) card.current?.focus();
  }, [open, i]);

  if (!open) return null;

  const sheet = !!box && window.innerWidth < 700; // narrow screens show a bottom sheet instead of a floating card
  return (
    <div className="tour" role="presentation">
      <div className="tour__shield" onClick={() => finish(false)} />
      {box && <div className="tour__spot" style={box} aria-hidden="true" />}
      <div
        ref={card}
        className={`tour__card${sheet ? ' is-sheet' : ''}${!box ? ' is-center' : ''}`}
        style={pos ?? undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        tabIndex={-1}
      >
        <div className="tour__count" aria-label={`Step ${i + 1} of ${TOUR_STEPS.length}`}>
          {TOUR_STEPS.map((_, n) => <i key={n} className={n === i ? 'is-now' : n < i ? 'is-done' : ''} />)}
        </div>
        <h2 id="tour-title" className="tour__title">{step.title}</h2>
        <p className="tour__body">{step.body}</p>
        <div className="tour__foot">
          <button type="button" className="btn btn--quiet btn--sm" onClick={() => finish(false)}>Skip tour</button>
          <span className="tour__step num">{i + 1} of {TOUR_STEPS.length}</span>
          {i > 0 && <button type="button" className="btn btn--sm" onClick={back}>Back</button>}
          <button type="button" className="btn btn--primary btn--sm" onClick={next}>
            {last ? 'Finish' : 'Next'}
            {!last && <Icon name="chevron-right" size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}
