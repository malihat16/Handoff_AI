import { useEffect, useRef, useState, type DragEvent } from 'react';
import { api, errorMessage } from '../api';
import { workflowLabel } from '../format';
import { useRefresh, useToast } from '../hooks';
import type { Run, WorkflowInfo } from '../types';
import { Icon } from './Icon';
import { Modal } from './Modal';

const ACCEPT = ['.txt', '.eml', '.md', '.pdf'];
const hasValidExtension = (name: string) => ACCEPT.some((ext) => name.toLowerCase().endsWith(ext));

function resultToast(run: Run, duplicate: boolean) {
  const open = { label: 'Open run', href: `#/runs/${run.id}` };
  if (duplicate) return { text: `This is already run #${run.id}, so nothing new was created.`, action: open };
  if (run.status === 'awaiting_approval') {
    return { text: `Run #${run.id} needs your approval.`, action: { label: 'Review', href: `#/approvals/${run.id}` } };
  }
  if (run.blocked) return { text: `Blocked: this invoice was already processed (${run.error ?? 'duplicate'}).`, action: open };
  if (run.status === 'failed') return { text: `Run #${run.id} failed: ${run.error ?? 'unknown error'}`, tone: 'bad' as const, action: open };
  return { text: `Run #${run.id} completed.`, tone: 'ok' as const, action: open };
}

export function NewRunDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const { bump } = useRefresh();
  const [workflows, setWorkflows] = useState<WorkflowInfo[]>([]);
  const [workflow, setWorkflow] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    api.workflows()
      .then((w) => {
        setWorkflows(w);
        setWorkflow((cur) => cur || w[0]?.name || '');
      })
      .catch((e) => setError(errorMessage(e)));
  }, [open]);

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!hasValidExtension(f.name)) {
      setError(`${f.name} isn't supported. Use a ${ACCEPT.join(', ')} file.`);
      return;
    }
    setError(null);
    setFile(f);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    pick(e.dataTransfer.files[0]);
  };

  const canRun = !busy && !!workflow && (!!file || text.trim().length > 0);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = file ? await api.upload(workflow, file) : await api.submit(workflow, text);
      bump();
      toast(resultToast(res.run, res.duplicate));
      setText('');
      setFile(null);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Run a workflow">
      <div className="dlg__body">
        <fieldset className="choices">
          <legend className="sr-only">Workflow</legend>
          {workflows.map((w) => (
            <label key={w.name} className="choice">
              <input type="radio" name="workflow" value={w.name} checked={workflow === w.name} onChange={() => setWorkflow(w.name)} />
              <span className="choice__name">{workflowLabel(w.name)}</span>
              <span className="choice__text">{w.description}</span>
            </label>
          ))}
        </fieldset>

        <div
          className={`drop${over ? ' is-over' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => fileInput.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInput.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
        >
          <input
            ref={fileInput}
            type="file"
            hidden
            accept={ACCEPT.join(',')}
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {file ? (
            <span className="drop__file">
              <Icon name="file" />
              {file.name}
              <button
                type="button"
                className="btn btn--quiet btn--sm"
                aria-label={`Remove ${file.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                }}
              >
                <Icon name="x" />
              </button>
            </span>
          ) : (
            <>
              <Icon name="upload" size={22} />
              <span><strong>Drop a file here</strong> or click to choose one</span>
              <span className="muted">Email (.txt, .eml) or invoice (.pdf with selectable text)</span>
            </>
          )}
        </div>

        {!file && (
          <label className="field">
            Or paste the text
            <textarea
              className="textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'From: Jo Lee <jo@example.com>\nSubject: Quote for 20 users\n\nHi, could you send pricing for…'}
            />
          </label>
        )}

        {error && (
          <div className="callout callout--bad" role="alert">
            <Icon name="alert" />
            <div>{error}</div>
          </div>
        )}
      </div>
      <div className="dlg__foot">
        <button type="button" className="btn btn--quiet" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn--primary" disabled={!canRun} onClick={submit}>
          {busy ? <Icon name="spinner" className="spin" /> : <Icon name="plus" />}
          {busy ? 'Running' : 'Run workflow'}
        </button>
      </div>
    </Modal>
  );
}
