(this.AwanaVersions = this.AwanaVersions || {})['app-update.js'] = '1.6.0';
// App updates and auto-save.
//  Updates: every few minutes (10 by default) the page asks the site for its index.html and compares the version in it with the one running. A newer one shows a bar with Update now / Later; nothing happens until you choose.
//  Update now: anything held on a tab is settled, an unsaved data file is SAVED FIRST (the Save button's way: this computer or Drive), the open session is put in this tab's sessionStorage, the page reloads, and the new version
//  puts the session back (data, tab, whether saving goes to Drive and which Drive file is kept up to date). The copy in sessionStorage lives only for the reload: it is removed as soon as it is read, and if putting it back fails it is
//  downloaded as a file instead, so nothing is lost either way. Undo history and the Recent places list do not carry over.
//  Auto-save: optionally, every few minutes, if something is unsaved, save the way the Save button does (never asking anything). Both settings are kept in the data file (they follow it to every browser); with no file open, the code defaults apply.
(function () {
  const App = window.App, $ = id => document.getElementById(id), esc = App.esc, doc = document;
  const meta = (d, n) => { const m = d.querySelector('meta[name="' + n + '"]'); return m ? m.content : ''; };
  const RUN = { version: meta(doc, 'app-version'), build: meta(doc, 'app-build') };
  // True only when version a is newer than b (1.50.45 > 1.50.44; 1.50.45b after 1.50.45). An older copy of the site (a stale cache) is not an update.
  const newerVersion = (a, b) => { const na = String(a || '').match(/\d+/g) || [], nb = String(b || '').match(/\d+/g) || []; for (let i = 0; i < Math.max(na.length, nb.length); i++) { const x = +(na[i] || 0), y = +(nb[i] || 0); if (x !== y) return x > y; } return String(a || '').localeCompare(String(b || '')) > 0; };
  const HANDOFF = 'awana-handoff';
  const DEF_U = { on: true, minutes: 10 }, DEF_A = { on: false, minutes: 5 };
  const LAUNCH_CHECK_MS = 1500;      // after the page's load event: past the session restore (which runs at load + 0 ms) and the first paint
  // The two timers' settings live in the data file (config.autoUpdate, config.autoSave). Before a file is open, the code defaults apply; App.fileSettingsLoaded runs when a file opens.
  const fromFile = (key, def) => Object.assign({}, def, (App.season && App.season.config && App.season.config[key]) || {});
  const hhmm = () => new Date().toTimeString().slice(0, 5);
  const U = { cfg: fromFile('autoUpdate', DEF_U), found: null, last: null, error: '', hidden: '', checking: false, timer: 0 };
  const A = { cfg: fromFile('autoSave', DEF_A), last: '', busy: false, timer: 0 };
  // A change made on Options is a change to the shared file: it is recorded like any other (History, Undo) and the file is marked unsaved.
  const storeInFile = (key, cfg) => { if (App.season && App.season.config) { App.season.config[key] = { on: !!cfg.on, minutes: +cfg.minutes || 0 }; App.commitScope(() => App.changed()); } };
  const web = /^https?:$/.test(location.protocol), base = location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '');

  // ---------- updates ----------
  function redraw() {
    const bar = $('updateBar'), f = U.found;
    bar.hidden = !f || U.hidden === f.version + '|' + f.build;
    if (f) $('updateText').textContent = (f.version ? 'A new version of Gonkulator is available: ' + f.version + ' (you are on ' + RUN.version + ')' : 'A new version of Gonkulator is ready') + '. Updating keeps your open data: it is saved first if needed and carried through the reload.';
    const o = $('optionsWrap'); if (o && !$('tab-options').hidden && App.tabs.options && !(o.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName))) App.tabs.options();
  }
  async function check() {
    if (!web || U.checking) return; U.checking = true;
    try {
      const r = await fetch(base + 'index.html?_=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error('the site answered ' + r.status);
      const d = new DOMParser().parseFromString(await r.text(), 'text/html'), v = meta(d, 'app-version'), b = meta(d, 'app-build'); if (!v) throw new Error('that is not the app');
      if (App.swCheck) App.swCheck();      // have the new release's worker installing by the time Update now is pressed (it shows the bar itself when it is waiting)
      U.error = ''; U.found = newerVersion(v, RUN.version) || (v === RUN.version && b && RUN.build && b !== RUN.build) ? { version: v, build: b } : null;
    } catch (e) { U.error = e.message || String(e); } finally { U.checking = false; U.last = new Date(); redraw(); }
  }
  function schedule() {
    clearTimeout(U.timer); if (!U.cfg.on || !web) return;
    U.timer = setTimeout(async () => { await check(); schedule(); }, Math.max(0.05, +U.cfg.minutes || 10) * 60000);
  }
  // Carry the open session through the reload (see the header).
  function stash() {
    // The place the user is on (S13): the tab's own place state (the child and sub-tab, or the attendance night and room) comes back before the tab opens.
    const pl = App.places && App.places[App.tab] && App.places[App.tab].get ? App.places[App.tab].get() : null;
    const h = { t: Date.now(), tab: App.tab, sub: App.sub, place: pl && pl.state ? pl.state : null, test: App.testFiles(), drive: App.driveHandoff ? App.driveHandoff.get() : null, trail: App.trail ? App.trail.export() : null };
    if (App.season) h.season = App.snapshotJson(); else if (App.master) h.master = Model.toCsv(App.master);
    sessionStorage.setItem(HANDOFF, JSON.stringify(h));
  }
  async function apply() {
    if (!U.found) return false;
    if (App.resolveDraft && !App.resolveDraft(() => apply())) return false;
    if (App.master && App.dirty()) { const ok = await App.saveNow(); if (!ok) { App.flash('The update was not applied: your changes were not saved.', 'error'); return false; }
      if (App.dirty()) { App.flash('The update was not applied: you changed something while it was saving. Press Update now again.', 'info'); return false; } }      // the reload carries the file as saved, so an edit made during the save would be lost or wrongly merged (R7)
    // The new release's service worker takes over first (it is looked for and waited for here), so the reload fetches the new files. Reloading while the old worker still controls the page would run the OLD scripts under the new index.html.
    const switched = App.swApply ? await App.swApply() : false;
    if (!switched && App.swControlled && App.swControlled()) { App.flash('The new version is not ready to install yet (the site may still be copying its files). Nothing was changed: try Update now again in a minute.', 'error'); return false; }
    try { stash(); } catch (e) { App.flash('The update was not applied: this browser would not keep your session for the reload. Save your file and reload the page yourself.', 'error'); return false; }
    location.replace(location.pathname + '?updated=' + encodeURIComponent(U.found.version)); return true;
  }
  // A carried copy older than this was left by an update that never finished: it is given back as a file, not opened over a fresh page (CR-13).
  const STALE_MS = 10 * 60 * 1000;
  const recoverFile = raw => { const a = doc.createElement('a'); a.href = URL.createObjectURL(new Blob([raw], { type: 'application/json' })); a.download = 'awana-session-recovered-' + Date.now() + '.json'; doc.body.appendChild(a); a.click(); a.remove(); };
  function restore() {
    let raw = null; try { raw = sessionStorage.getItem(HANDOFF); sessionStorage.removeItem(HANDOFF); } catch (e) { /* nothing carried */ }
    if (!raw) return;
    try {
      const h = JSON.parse(raw);
      if (Number.isFinite(h.t) && Date.now() - h.t > STALE_MS) { recoverFile(raw); App.flash('An unfinished update left an old copy of your session. It was not opened; it was downloaded as awana-session-recovered-….json.', 'warn'); return; }
      (h.test || []).forEach(n => App.markTest(n));
      if (h.season) App.openSeason(h.season); else if (h.master) App.openFiles([{ name: 'carried-over.csv', lastModified: Date.now(), text: async () => h.master }]);
      if (App.driveHandoff) App.driveHandoff.set(h.drive);
      if (h.tab && h.place && App.places && App.places[h.tab] && App.places[h.tab].set) { try { App.places[h.tab].set(h.place); } catch (e) { /* the tab opens on its default */ } }      // the place first, so the tab opens on it (S13)
      if (h.tab) App.showTab(h.tab, h.sub);
      if (App.trail && h.trail) App.trail.restore(h.trail);      // Recent places come back too
      if (history.replaceState) history.replaceState(null, '', location.pathname);
      App.flash('Updated to version ' + RUN.version + '. Your open data and place were carried over (undo history starts fresh).', 'info');
    } catch (e) {      // never lose the work: give it back as a file
      try { recoverFile(raw); } catch (e2) {/* last resort below */ }
      App.ask.alert('The update finished, but your open session could not be put back (' + (e && e.message) + '). It was downloaded as awana-session-recovered-….json: import that file.');
    }
  }
  $('updateNow').addEventListener('click', apply);
  $('updateLater').addEventListener('click', () => { if (U.found) U.hidden = U.found.version + '|' + U.found.build; redraw(); });

  // ---------- auto-save ----------
  const busyScreen = () => !!document.querySelector('dialog[open], #warn:not([hidden]), .modal-wrap:not([hidden]), #splash:not([hidden])');
  async function runAuto() {
    if (A.busy || !App.season || !App.dirty() || busyScreen()) return false;
    if (App.draftPending && App.draftPending()) return false;
    A.busy = true;
    try { const ok = await App.saveNow({ auto: true }); if (ok) { A.last = hhmm(); const s = $('autoStatus'); s.hidden = false; s.textContent = 'Auto-saved ' + A.last; redraw(); } return ok; } finally { A.busy = false; }
  }
  function scheduleAuto() {
    clearTimeout(A.timer); if (!A.cfg.on) return;
    A.timer = setTimeout(async () => { await runAuto(); scheduleAuto(); }, Math.max(0.02, +A.cfg.minutes || 5) * 60000);
  }

  // ---------- for the Options tab ----------
  App.updates = {
    run: RUN, web, state: () => ({ found: U.found, last: U.last && U.last.toTimeString().slice(0, 5), error: U.error, checking: U.checking, on: U.cfg.on, minutes: U.cfg.minutes }),
    set(on, minutes) { U.cfg.on = !!on; if (minutes) U.cfg.minutes = +minutes; storeInFile('autoUpdate', U.cfg); schedule(); },
    check, apply,
  };
  App.autosave = {
    state: () => ({ on: A.cfg.on, minutes: A.cfg.minutes, last: A.last }),
    set(on, minutes) { A.cfg.on = !!on; if (minutes) A.cfg.minutes = +minutes; storeInFile('autoSave', A.cfg); scheduleAuto(); },
    run: runAuto,
  };
  if (doc.readyState === 'complete') setTimeout(restore, 0); else window.addEventListener('load', () => setTimeout(restore, 0));      // after every script has loaded (Drive's too), not just the ones before this
  // A new service-worker release is waiting (app-sw.js): show the same bar as a newer version found by the check.
  App.swReady = () => { if (!U.found) { U.found = { version: '', build: '' }; redraw(); } };
  // Called when a data file opens (or the page's file is closed): take the timers' settings from that file.
  App.fileSettingsLoaded = () => { U.cfg = fromFile('autoUpdate', DEF_U); A.cfg = fromFile('autoSave', DEF_A); schedule(); scheduleAuto(); };
  // N5: one check as the LAST step of start-up, not 15 seconds later: after every script has loaded and the session restore above has run, ask the site for its index.html and run the service worker's update check
  // (check() does both), so an installed PWA that served its cached copy finds the new release within seconds of opening. It only shows the bar (never applies anything); offline or a failed request is silent; the timer
  // restarts after it, so a second check does not fire a moment later.
  if (web) { const launch = () => setTimeout(async () => { await check(); schedule(); }, LAUNCH_CHECK_MS); if (doc.readyState === 'complete') launch(); else window.addEventListener('load', launch); schedule(); }
  scheduleAuto();
})();
