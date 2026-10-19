import { Icon, type IconName } from '../components/Icon';
import { TOUR_STEPS } from '../components/Tour';
import { useActions } from '../hooks';

const STAGES = [
  { who: 'machine', title: 'Arrives', text: 'An email or invoice comes in. You drop it in or paste it.' },
  { who: 'machine', title: 'Read', text: 'The AI pulls out the sender, intent, amounts and dates.' },
  { who: 'machine', title: 'Checked', text: 'Rules look for problems: bad totals, duplicates, big amounts, complaints.' },
  { who: 'you', title: 'Your call', text: 'Anything risky pauses here. You approve or reject.' },
  { who: 'machine', title: 'Done', text: 'Handoff saves the records, creates tasks and queues the notification.' },
] as const;

const PAGES: { icon: IconName; href: string; name: string; text: string }[] = [
  { icon: 'overview', href: '#/', name: 'Overview', text: 'What is waiting for you, how much Handoff handled alone, charts, and failures.' },
  { icon: 'inbox', href: '#/approvals', name: 'Approvals', text: 'The queue of paused jobs. Original on the left, what the AI found on the right.' },
  { icon: 'route', href: '#/runs', name: 'Runs', text: 'Every job ever processed. Search, filter, and open one to see each step and the log.' },
  { icon: 'database', href: '#/records', name: 'Records', text: 'The contacts, tasks, invoices and notifications Handoff created.' },
  { icon: 'report', href: '#/reports', name: 'Daily report', text: 'A day in numbers, with anything that still needs attention.' },
];

const WORDS: [string, string][] = [
  ['Run', 'One job going through a workflow, for example one email or one invoice.'],
  ['Workflow', 'The list of steps for a kind of job. Handoff ships with Email to CRM and Invoice approval.'],
  ['Step', 'One action in a workflow, like Extract fields or Save invoice. Each shows how long it took.'],
  ['Needs approval', 'The run is paused until a person approves or rejects it. Nothing is sent or saved as approved before then.'],
  ['Duplicate blocked', 'This invoice was already processed, so Handoff stopped it. That is the safety check working. There is nothing to fix.'],
  ['Failed', 'A step could not finish, such as totals that do not add up. The run page says which step and why, and Retry resumes from there.'],
  ['Retry', 'Runs the failed step again. Steps that already finished are not repeated.'],
  ['Confidence', 'How sure the AI is about what it read. Low confidence sends the run to you.'],
  ['Rules engine / Claude', 'The reader behind the AI. The built-in rules engine needs no key. With an Anthropic key, Claude reads the text and Handoff checks every value against the original.'],
  ['Time saved', 'An estimate: minutes per completed run, set per workflow in workflows.json.'],
];

const FAQ: [string, string][] = [
  ['Why did a run need my approval?', 'Each approval shows the rule that paused it. Out of the box, invoices above 1,000 and complaint emails always wait for a person, and so does anything the AI is unsure about.'],
  ['What happens when I reject?', 'The run stops as Rejected. Invoices are marked rejected and no payment notification is queued. Your name and note are kept on the run.'],
  ['Why does a resent invoice say Duplicate blocked?', 'Handoff matches vendor and invoice number. If it has seen the invoice before it refuses to save it twice and points you to the original run.'],
  ['Does it send my data anywhere?', 'With the built-in rules engine, nothing leaves the server. With a Claude key, the email or invoice text is sent to Anthropic’s API to be read.'],
  ['Which files can I upload?', 'Emails as .txt, .eml or .md, and invoices as PDFs with selectable text. Scanned image PDFs are not read yet; paste the text instead.'],
  ['Can I change the rules or add a workflow?', 'Yes. Workflows, thresholds and time-saved values live in workflows.json. Restart the server after editing it.'],
  ['Is the demo data real?', 'No. It is made-up sample emails and invoices, and running Load demo data twice does not create duplicates.'],
];

const KEYS: [string, string][] = [
  ['J / K', 'Next and previous item in the Approvals queue'],
  ['Enter', 'Open the highlighted row in Runs'],
  ['← / →', 'Back and next while the tour is open'],
  ['Esc', 'Close a dialog or the tour'],
];

const FIXES: [string, string][] = [
  ['“Server unreachable” in the top bar', 'The Python server is not running or crashed. Start it again with uvicorn app.asgi:app --port 8000.'],
  ['An API key box appears', 'The server was started with an API_KEY set. Enter the same value in API key (bottom of the sidebar).'],
  ['A PDF produced no data', 'It is probably a scan. Paste the invoice text instead, or export a text PDF.'],
  ['A run is Failed', 'Open it. The red banner names the step and the reason. Fix the data and click Retry.'],
  ['Nothing shows on Overview', 'Click Load demo data in the top bar, or run a workflow.'],
];

export default function Help() {
  const { startTour } = useActions();
  return (
    <div className="help">
      <section className="help__intro">
        <h2 className="help__lead">Handoff does the routine work on emails and invoices, and hands the risky decisions to you.</h2>
        <div className="cluster">
          <button type="button" className="btn btn--primary" onClick={startTour}><Icon name="sparkle" />Take the {TOUR_STEPS.length}-step tour</button>
          <a className="btn" href="#/runs">Go to Runs</a>
        </div>
      </section>

      <section aria-labelledby="h-how">
        <h3 id="h-how" className="help__h">How a job flows</h3>
        <ol className="flow">
          {STAGES.map((s, n) => (
            <li key={s.title} className={`flow__stop flow__stop--${s.who}`}>
              <span className="flow__node" aria-hidden="true">{n + 1}</span>
              <strong>{s.title}</strong>
              <span>{s.text}</span>
              <span className="flow__who">{s.who === 'you' ? 'You' : 'Automatic'}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="h-where">
        <h3 id="h-where" className="help__h">Where everything is</h3>
        <div className="where">
          {PAGES.map((p) => (
            <a key={p.name} className="where__item" href={p.href}>
              <Icon name={p.icon} size={18} />
              <span><strong>{p.name}</strong>{p.text}</span>
            </a>
          ))}
        </div>
      </section>

      <div className="help__cols">
        <section aria-labelledby="h-words">
          <h3 id="h-words" className="help__h">Words you will see</h3>
          <dl className="words">
            {WORDS.map(([t, d]) => (
              <div key={t}><dt>{t}</dt><dd>{d}</dd></div>
            ))}
          </dl>
        </section>
        <div className="stack" style={{ gap: 28 }}>
          <section aria-labelledby="h-faq">
            <h3 id="h-faq" className="help__h">Questions</h3>
            <div className="faq">
              {FAQ.map(([q, a]) => (
                <details key={q}>
                  <summary>{q}</summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </section>
          <section aria-labelledby="h-keys">
            <h3 id="h-keys" className="help__h">Keyboard shortcuts</h3>
            <dl className="keys">
              {KEYS.map(([k, d]) => (
                <div key={k}><dt><kbd>{k}</kbd></dt><dd>{d}</dd></div>
              ))}
            </dl>
          </section>
        </div>
      </div>

      <section aria-labelledby="h-fix">
        <h3 id="h-fix" className="help__h">Something not working?</h3>
        <div className="divided fixes">
          {FIXES.map(([p, s]) => (
            <div key={p} className="fix"><strong>{p}</strong><span>{s}</span></div>
          ))}
        </div>
      </section>
    </div>
  );
}
