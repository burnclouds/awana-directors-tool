// Service worker for the app (spec: docs/superpowers/specs/2026-11-10-service-worker-design.md).
// make-deploy.sh writes the real RELEASE and SHELL into deploy/app/sw.js; this file is only the template.
// A page load is answered from the release's own cache (one release per page, never a mix); the update check's fetch of index.html
// goes to the server, so it always sees the newest copy. The app's files are cached whole per release; cross-origin requests
// (Google, sign-in) are not touched; data is never cached.
const RELEASE = '1.51.20+2026-11-22';
const SHELL = ["app-ask.js","app-drive.js","app-flagmarks.js","app-flagmode.js","app-flagpop.js","app-help.js","app-info.js","app-merge.js","app-options.js","app-person.js","app-search.js","app-season.js","app-stats.js","app-store.js","app-sw.js","app-teamgrid.js","app-todo.js","app-tools.js","app-topbar.js","app-trail.js","app-update.js","app.js","backlog.html","calendar.js","catalog.js","check.js","csv.js","datamerge.js","drive-config.js","drive.js","flagtrail.js","fonts.css","icon-192.png","icon-512.png","icon.svg","index.html","info.js","intake.js","manifest.json","model.js","pace.js","reports-season.js","reports.js","rotation.js","season.js","slides.js","stats.js","store.js","style.css","teamplan.js","teams.js","todo.js","validate.js","version-history.html"];
const CACHE = 'awana-shell-' + RELEASE;
const PREFIX = 'awana-shell-';

// The new release is fetched in full into its own cache. If any file fails, the install fails and the previous release keeps running.
// It does NOT skip waiting: the page decides (Update now, or the next visit).
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(p => new Request(p, { cache: 'reload' })))));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith(PREFIX) && k !== CACHE) await caches.delete(k);      // only the previous release's cache is left behind until this one is active
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();      // sent by Update now, after the leader's data is saved
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;      // Google and other sites: not intercepted
  const base = self.registration.scope;
  if (!url.href.startsWith(base)) return;
  const file = url.href.slice(base.length).split('?')[0];
  if (file === '' || file === 'index.html') {
    // A page load (navigation) is answered from THIS release's cache, the same cache its scripts come from, so a page never mixes two releases:
    // after a deploy the old page keeps running until Update now. Only a first visit (nothing cached yet) goes to the network.
    if (req.mode === 'navigate') {
      e.respondWith(caches.match(base + 'index.html', { ignoreSearch: true, cacheName: CACHE }).then(hit => hit || fetch(req)));
      return;
    }
    // Any other request for the page (the update check fetches index.html with a cache-busting query): the server's copy, so it always sees the newest release; the cached shell only when offline.
    // Offline, the cached shell is returned with x-awana-offline, so the update check can say it could not reach the site instead of finding "the same version" in the cached copy (N7).
    e.respondWith(fetch(req).catch(() => caches.match(base + 'index.html', { ignoreSearch: true, cacheName: CACHE }).then(hit => hit ? hit.blob().then(b => new Response(b, { status: 200, headers: { 'content-type': 'text/html', 'x-awana-offline': '1' } })) : hit)));
    return;
  }
  if (file.startsWith('try/')) return;      // the sample club is fetched as it is
  e.respondWith(caches.open(CACHE).then(c => c.match(base + file, { ignoreSearch: true })).then(hit => hit || fetch(req)));      // the cache keeps one release, so a page never mixes two
});
