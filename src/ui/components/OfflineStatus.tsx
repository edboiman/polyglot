import { useEffect, useState } from 'react';

type Status = { kind: 'checking' } | { kind: 'ready' } | { kind: 'partial'; cached: number; total: number } | { kind: 'unavailable'; why: string };

/** Asks the service worker whether every file needed to run offline is cached. */
export function OfflineStatus() {
  const [s, setS] = useState<Status>({ kind: 'checking' });
  useEffect(() => {
    let alive = true;
    const check = async () => {
      if (!('serviceWorker' in navigator) || !('caches' in window)) return setS({ kind: 'unavailable', why: 'This browser does not support offline apps.' });
      const reg = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 4000))]);
      if (!reg?.active) return alive && setS({ kind: 'unavailable', why: 'Offline mode is only available on the published app.' });
      const ch = new MessageChannel();
      ch.port1.onmessage = (e) => {
        if (!alive) return;
        const d = e.data as { ready: boolean; cached: number; total: number };
        setS(d.ready ? { kind: 'ready' } : { kind: 'partial', cached: d.cached, total: d.total });
        if (!d.ready) setTimeout(check, 2000);
      };
      reg.active.postMessage({ type: 'offline-status' }, [ch.port2]);
    };
    void check();
    return () => {
      alive = false;
    };
  }, []);
  const text =
    s.kind === 'ready'
      ? 'Available offline: all lessons work without a connection. (Device voices and speech recognition may still need one.)'
      : s.kind === 'partial'
        ? `Preparing the offline copy… ${s.cached} of ${s.total} files saved.`
        : s.kind === 'checking'
          ? 'Checking offline availability…'
          : s.why;
  return <p className="small" role="status">{text}</p>;
}
