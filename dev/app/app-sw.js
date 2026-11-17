(this.AwanaVersions = this.AwanaVersions || {})['app-sw.js'] = '1.2.0';
// Registers the service worker (sw.js) and tells the update bar when a new release is waiting. Nothing here changes the open session:
// Update now (app-update.js) asks the waiting worker to take over, and the page reloads once it does.
(function () {
  const App = window.App;
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) { App.swWaiting = () => false; App.swApply = () => Promise.resolve(false); App.swCheck = () => Promise.resolve(); App.swControlled = () => false; return; }
  let reg = null;
  App.swWaiting = () => !!(reg && reg.waiting);
  App.swControlled = () => !!navigator.serviceWorker.controller;      // true when a worker's cache is what this page's files come from
  // Asks the browser to look for a new sw.js now. The browser only does that by itself when a page loads, so without this a long-open tab would show the update bar (the version check saw a newer index.html)
  // before the new worker had even started installing, and Update now would reload into the old release's cache.
  App.swCheck = () => reg ? reg.update().catch(() => {}) : Promise.resolve();
  // Waits (up to ms) for the worker that is installing to finish and wait; resolves when one is waiting or the time is up.
  const waitInstalled = ms => new Promise(resolve => {
    if (!reg || reg.waiting || !reg.installing) return resolve();
    const nw = reg.installing, done = () => { clearTimeout(t); nw.removeEventListener('statechange', on); resolve(); }, t = setTimeout(done, ms);
    const on = () => { if (nw.state !== 'installing') done(); }; nw.addEventListener('statechange', on);
  });
  // Resolves true once the new worker controls this page; false if there is no new release ready (not installed in time, or the install failed), so the caller must not reload into the old cache.
  App.swApply = async () => {
    if (!reg) return false;
    if (!reg.waiting) { await App.swCheck(); await waitInstalled(20000); }
    if (!reg.waiting) return false;
    return new Promise(resolve => {
      const t = setTimeout(() => resolve(false), 4000);
      navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(t); resolve(true); }, { once: true });
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    });
  };
  // A waiting worker is a new release even if the version check has not seen it yet: the update bar shows it (app-update.js).
  const watch = r => {
    if (r.waiting && navigator.serviceWorker.controller && App.swReady) App.swReady();
    r.addEventListener('updatefound', () => {
      const nw = r.installing; if (!nw) return;
      nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller && App.swReady) App.swReady(); });
    });
  };
  navigator.serviceWorker.register('sw.js').then(r => { reg = r; watch(r); }).catch(() => { /* the app works without it: it just cannot start offline */ });
})();
