import { useState } from 'react';
import { api, errorMessage } from '../api';
import { Icon } from '../components/Icon';
import {
  DecisionBar, DuplicateBanner, ExtractedPanel, FailureBanner, LogPanel, ReasonBanner, ResolvedBanner, RunHead, SourcePanel,
} from '../components/RunParts';
import { useRefresh, usePoll, useToast } from '../hooks';

export default function RunDetail({ id }: { id: number }) {
  const toast = useToast();
  const { bump } = useRefresh();
  const detail = usePoll(() => api.run(id), [id], 4000);
  const [retrying, setRetrying] = useState(false);
  const run = detail.data && detail.data.id === id ? detail.data : null;

  async function retry() {
    setRetrying(true);
    try {
      const res = await api.retry(id);
      bump();
      toast({ text: res.status === 'failed' ? `Failed again: ${res.error}` : `Run #${id} is ${res.status.replace('_', ' ')}.`, tone: res.status === 'failed' ? 'bad' : 'ok' });
    } catch (e) {
      toast({ text: errorMessage(e), tone: 'bad' });
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="detail">
      <a className="crumb" href="#/runs"><Icon name="chevron-left" />All runs</a>
      {!run ? (
        detail.error ? (
          <div className="callout callout--bad" role="alert">
            <Icon name="alert" size={18} />
            <div><strong>Couldn’t load run #{id}</strong>{detail.error}</div>
          </div>
        ) : (
          <p className="muted">Loading…</p>
        )
      ) : (
        <>
          <RunHead run={run} />
          {run.status === 'failed' && !run.blocked && <FailureBanner run={run} onRetry={() => void retry()} busy={retrying} />}
          {run.blocked && <DuplicateBanner run={run} />}
          {run.status === 'awaiting_approval' && <ReasonBanner run={run} />}
          {(run.status === 'completed' && run.approved_by) || run.status === 'rejected' ? <ResolvedBanner run={run} nextId={null} /> : null}
          <div className="panes">
            <SourcePanel text={run.input_text} />
            <ExtractedPanel run={run} />
          </div>
          {run.status === 'awaiting_approval' && <DecisionBar run={run} onResolved={() => bump()} />}
          <LogPanel logs={run.logs} />
        </>
      )}
    </div>
  );
}
