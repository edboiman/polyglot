import { Component, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { detectBackend } from '../storage/backend';
import { ImportError, parseBackup, rawExport, saveState, startFresh } from '../storage/persistence';
import { useStore } from './store';

function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Shown when stored progress could not be loaded. Nothing is written until the learner chooses. */
export function RecoveryScreen({ reason }: { reason: string }) {
  const { backend, replace } = useStore();
  const [msg, setMsg] = useState('');
  const file = useRef<HTMLInputElement>(null);

  const fresh = async () => {
    if (!backend) return;
    if (!confirm('Start with a new, empty profile? The damaged data stays stored on this device and can still be downloaded.')) return;
    replace(await startFresh(backend));
  };
  const restore = async (f: File) => {
    if (!backend) return;
    try {
      const { state } = parseBackup(await f.text());
      const base = await startFresh(backend); // keeps the damaged data in quarantine
      const r = await saveState(backend, { ...state, revision: base.revision });
      replace({ ...state, revision: r.revision });
    } catch (e) {
      setMsg(e instanceof ImportError ? e.message : 'The backup could not be restored.');
    }
  };

  return (
    <div className="onboard" role="alert">
      <h1 className="display">Your progress needs attention</h1>
      <p className="lead">{reason}</p>
      <p>Nothing has been deleted or overwritten. Choose what to do:</p>
      {msg && <p className="warn">{msg}</p>}
      <button className="btn primary wide" onClick={() => location.reload()}>Try loading again</button>
      <button className="btn ghost wide" onClick={async () => backend && download(`polyglot-stored-data-${Date.now()}.json`, await rawExport(backend))}>
        Download the stored data
      </button>
      <button className="btn ghost wide" onClick={() => file.current?.click()}>Restore from a backup file</button>
      <button className="btn danger-ghost wide" onClick={fresh}>Start a new profile</button>
      <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void restore(f); e.target.value = ''; }} />
    </div>
  );
}

interface BoundaryState {
  error: Error | null;
}

/** Catches rendering errors so a bug never leaves a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Polyglot error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="onboard" role="alert">
        <h1 className="display">Something went wrong</h1>
        <p className="lead">This screen hit an error. Your saved progress has not been changed.</p>
        <p className="muted small">{this.state.error.message}</p>
        <button className="btn primary wide" onClick={() => { location.hash = '#/home'; this.setState({ error: null }); }}>Go to Home</button>
        <button className="btn ghost wide" onClick={() => { location.hash = '#/profile'; this.setState({ error: null }); }}>Open Profile (backup and reset)</button>
        <button className="btn ghost wide" onClick={async () => download(`polyglot-stored-data-${Date.now()}.json`, await rawExport(await detectBackend()))}>Download the stored data</button>
        <button className="btn ghost wide" onClick={() => location.reload()}>Reload the app</button>
      </div>
    );
  }
}
