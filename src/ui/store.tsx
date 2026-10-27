/**
 * App state container: loads persisted data, exposes update helpers and
 * saves automatically (debounced, plus on page hide).
 *
 * Writes are suspended while the app is in recovery mode, while showing data
 * from a newer app version, and after another tab has saved newer progress.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LangCode } from '../data/types';
import { type AppState, type LangProgress, initialState } from '../engine/model';
import { type StorageBackend, detectBackend } from '../storage/backend';
import { loadState, saveState } from '../storage/persistence';
import { checkBadges } from './badges';

export type StoreStatus =
  | { kind: 'ok' }
  | { kind: 'recovery'; reason: string }
  | { kind: 'readonly' }
  | { kind: 'conflict' }
  | { kind: 'save-error' };

interface Store {
  state: AppState;
  backend: StorageBackend | null;
  status: StoreStatus;
  /** Number of cards dropped on load because their content was removed from the course. */
  dropped: number;
  update: (f: (s: AppState) => AppState) => void;
  updateLang: (f: (p: LangProgress) => LangProgress, lang?: LangCode) => void;
  /** Replace state that has already been written to storage (import, recovery). */
  replace: (s: AppState) => void;
  flush: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);
const CHANNEL = 'polyglot-sync';

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [backend, setBackend] = useState<StorageBackend | null>(null);
  const [status, setStatus] = useState<StoreStatus>({ kind: 'ok' });
  const [dropped, setDropped] = useState(0);
  const latest = useRef<AppState | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const dirty = useRef(false);
  const writable = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    (async () => {
      const b = await detectBackend();
      setBackend(b);
      const loaded = await loadState(b);
      latest.current = loaded.state;
      setState(loaded.state);
      setDropped(loaded.dropped);
      if (loaded.recovery) setStatus({ kind: 'recovery', reason: loaded.recovery.reason });
      else if (loaded.readOnly) setStatus({ kind: 'readonly' });
      writable.current = !loaded.recovery && !loaded.readOnly;
      if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
    })();
  }, []);

  // Other tabs announce their saves; if they are ahead of us, stop writing.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(CHANNEL);
    channel.current = ch;
    ch.onmessage = (e) => {
      const rev = (e.data as { revision?: number })?.revision ?? 0;
      if (rev > (latest.current?.revision ?? 0) && writable.current) {
        writable.current = false;
        setStatus({ kind: 'conflict' });
      }
    };
    return () => ch.close();
  }, []);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (!backend || !latest.current || !writable.current || !dirty.current) return;
    dirty.current = false;
    try {
      const r = await saveState(backend, latest.current);
      if (r.result === 'saved') {
        latest.current = { ...latest.current, revision: r.revision };
        channel.current?.postMessage({ revision: r.revision });
      } else {
        writable.current = false;
        setStatus({ kind: r.result === 'conflict' ? 'conflict' : 'readonly' });
      }
    } catch {
      dirty.current = true;
      setStatus({ kind: 'save-error' });
    }
  }, [backend]);

  const schedule = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 400);
  }, [flush]);

  useEffect(() => {
    const onHide = () => void flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, [flush]);

  const update = useCallback(
    (f: (s: AppState) => AppState) => {
      // Compute eagerly so an immediate flush() saves the newest state.
      if (!latest.current) return;
      const next = checkBadges(f(latest.current), Date.now());
      latest.current = { ...next, revision: latest.current.revision };
      dirty.current = true;
      setState(latest.current);
      schedule();
    },
    [schedule],
  );

  const updateLang = useCallback(
    (f: (p: LangProgress) => LangProgress, lang?: LangCode) =>
      update((s) => {
        const l = lang ?? s.currentLang;
        return { ...s, langs: { ...s.langs, [l]: f(s.langs[l]) } };
      }),
    [update],
  );

  const replace = useCallback((s: AppState) => {
    latest.current = s;
    dirty.current = false;
    writable.current = true;
    setStatus({ kind: 'ok' });
    setState(s);
    channel.current?.postMessage({ revision: s.revision ?? 0 });
  }, []);

  const value = useMemo(
    () => (state ? { state, backend, status, dropped, update, updateLang, replace, flush } : null),
    [state, backend, status, dropped, update, updateLang, replace, flush],
  );

  if (!value) return <div className="boot" role="status">Loading your progress…</div>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside provider');
  return s;
}

export function useLang() {
  const { state } = useStore();
  return { lang: state.currentLang, progress: state.langs[state.currentLang], settings: state.settings };
}

export { initialState };
