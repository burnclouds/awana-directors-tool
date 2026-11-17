(this.AwanaVersions = this.AwanaVersions || {})['app-flagmarks.js'] = '1.0.0';
// Yellow flags for flags made with Flag anything (level "element"). Such a flag has no place of its own in the page, so each one is found again from its trail (App.flagLocateAll) and a small yellow flag
// is drawn at the element's top-right corner, in an overlay (#flagLayer) outside the tabs: no tab's layout is touched and nothing is printed. A click opens the same popup as every other yellow flag
// (the click handler in app-season.js). A flag whose spot cannot be found draws nothing (To do says "spot not found"). The overlay is rebuilt when the tab changes, a flag changes, or the tab redraws
// (a debounced watch on <main>); scrolling and resizing only move the flags that are already there.
(function () {
  const App = window.App, esc = App.esc;
  let layer = null, items = [], timer = 0, busy = false;
  const ensure = () => { if (!layer) { layer = document.createElement('div'); layer.id = 'flagLayer'; document.body.appendChild(layer); } return layer; };
  function position() {
    items.forEach(it => {
      if (!document.contains(it.el) || !it.el.offsetParent) { it.btn.hidden = true; return; }
      const r = it.el.getBoundingClientRect(); it.btn.hidden = r.bottom < 0 || r.top > innerHeight;
      it.btn.style.left = Math.round(r.right - 10) + 'px'; it.btn.style.top = Math.round(r.top - 10) + 'px';
    });
  }
  function refresh() {
    if (busy) return; busy = true;
    try {
      items.forEach(it => it.btn.remove()); items = [];
      const flags = App.season && window.Season && Season.flagList(App.season).filter(f => f.level === 'element' && f.tab === App.tab);
      if (!flags || !flags.length || !App.flagLocateAll) return;
      const found = App.flagLocateAll(flags), host = ensure();
      flags.forEach(f => { const el = found.get(f.id); if (!el) return;
        const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'flagbtn on'; btn.dataset.fids = f.id; btn.title = f.note; btn.setAttribute('aria-label', 'Note: ' + (f.label || f.trail[f.trail.length - 1]));
        btn.textContent = '⚑'; host.appendChild(btn); items.push({ el, btn }); });
      position();
    } finally { busy = false; }
  }
  const later = ms => { clearTimeout(timer); timer = setTimeout(refresh, ms === undefined ? 150 : ms); };
  for (const name of ['showTab', 'addFlag', 'clearFlag', 'setFlagNote', 'flagsChanged']) { const orig = App[name]; if (typeof orig === 'function') App[name] = function () { const r = orig.apply(this, arguments); later(0); return r; }; }
  const main = document.querySelector('main'); if (main && window.MutationObserver) new MutationObserver(() => { if (!busy) later(); }).observe(main, { childList: true, subtree: true });
  let raf = 0; const move = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; position(); }); };
  window.addEventListener('scroll', move, true); window.addEventListener('resize', move);
  App.flagMarks = { refresh };
})();
