import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadVoices } from './audio/speech';
import { App } from './ui/App';
import { ErrorBoundary } from './ui/Recovery';
import { StoreProvider } from './ui/store';
import './styles.css';

void loadVoices();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <StoreProvider>
        <App />
      </StoreProvider>
    </ErrorBoundary>
  </StrictMode>,
);

// Offline support. Registered as early as possible and relative to the page,
// so it works under a GitHub Pages sub-path. The worker precaches every built
// file on install, so a single online visit is enough to work offline.
// Skipped in development to avoid stale caches.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // When an updated version takes over, reload once so the new version is shown
  // straight away instead of on the next visit. (Not on the very first install.)
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
  navigator.serviceWorker
    .register('./sw.js', { scope: './', updateViaCache: 'none' })
    .then((reg) => {
      // Check for a new version whenever the app is reopened.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void reg.update().catch(() => {});
      });
    })
    .catch(() => {
      /* offline mode unavailable (e.g. sandboxed preview); the app still works online */
    });
}
