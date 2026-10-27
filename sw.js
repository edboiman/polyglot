const PRECACHE = ["./","assets/main-NQC63UPH.css","assets/main-PFUTS5L4.js","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png","icons/icon.svg","index.html","manifest.webmanifest"];
const VERSION = '436c8378777f';
/* Polyglot service worker — generated at build time by scripts/precache.mjs.
   The PRECACHE list and VERSION are injected for each build, so the app shell
   and every built asset are cached together on the first visit, and replaced
   together on update. Learner data lives in IndexedDB and is never touched. */
/* global PRECACHE, VERSION */
const APP = 'polyglot';
// Cache names are namespaced by app and deployment path, because Cache
// Storage is shared by every site on the same origin (e.g. all GitHub Pages
// projects of one account). Only this app's own old caches are ever deleted.
const SCOPE = new URL(self.registration.scope).pathname;
const PREFIX = `${APP}:${SCOPE}:`;
const CACHE = `${PREFIX}${VERSION}`;
const url = (p) => new URL(p, self.registration.scope).href;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE.map((p) => new Request(url(p), { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== self.location.origin || !u.pathname.startsWith(SCOPE)) return;
  if (req.mode === 'navigate') {
    // Network first so updates arrive; this build's own shell when offline.
    e.respondWith(
      fetch(req).catch(() => caches.open(CACHE).then((c) => c.match(url('index.html')))),
    );
    return;
  }
  e.respondWith(
    caches.open(CACHE).then((c) =>
      c.match(req, { ignoreSearch: true }).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok && res.type === 'basic') c.put(req, res.clone());
            return res;
          }),
      ),
    ),
  );
});

// The page asks whether everything needed offline is cached.
self.addEventListener('message', (e) => {
  if (!e.data || e.data.type !== 'offline-status' || !e.ports[0]) return;
  caches
    .open(CACHE)
    .then((c) => Promise.all(PRECACHE.map((p) => c.match(url(p)))))
    .then((hits) => {
      const cached = hits.filter(Boolean).length;
      e.ports[0].postMessage({ version: VERSION, cached, total: PRECACHE.length, ready: cached === PRECACHE.length });
    });
});
