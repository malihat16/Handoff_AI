import { useState } from 'react';
import { setApiKey } from '../api';
import { useRefresh } from '../hooks';
import { Modal } from './Modal';

export function KeyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { bump } = useRefresh();
  const [key, setKey] = useState('');
  const save = () => {
    if (!key.trim()) return;
    setApiKey(key.trim());
    setKey('');
    bump();
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Enter your API key">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="dlg__body">
          <p className="muted">This Handoff server is protected. Paste the key set in its API_KEY setting. It stays in this browser.</p>
          <label className="field">
            API key
            <input className="input" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} autoFocus />
          </label>
        </div>
        <div className="dlg__foot">
          <button type="button" className="btn btn--quiet" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={!key.trim()}>Save key</button>
        </div>
      </form>
    </Modal>
  );
}
