(this.AwanaVersions = this.AwanaVersions || {})['app-trail.js'] = '1.6.0';
// Recent places: the last 10 places you were at, one tap to go back to any of them. A place is a tab plus what matters on it (the night and class on Attendance,
// the child on Person and Progress, the night and group on Games and Awards), as reported by the provider each tab registers in App.places[view] = { get(), set(state) }.
// Kept in memory only: it holds children's names, so it is never saved to the data file or the browser, and it starts over when another file is opened.
// The one exception is an app update: Update now carries it through the reload in the same session storage as the open data (export / restore below), and that copy is removed as soon as it is read.
(function () {
  const App = window.App, esc = App.esc, $ = id => document.getElementById(id), MAX = 10;
  let list = [], cur = null, jumping = null, season = null;
  const tabOf = view => view === 'personlive' ? 'person' : view;      // the Person sub-tabs that save at once are the Person tab for places
  const tabLabel = view => view === 'teams' ? 'Color teams' : ((document.querySelector('.tabs button[data-tab="' + tabOf(view) + '"]') || {}).firstChild || {}).textContent.trim();
  const activeScroll = () => document.querySelector('main > section:not([hidden]) .scroll');

  // Where you are now: { view, key, label, state }. A tab with no provider (or one that has nothing to say yet) is a place by itself.
  function here() {
    const view = App.view(), pr = App.places[tabOf(view)]; let got = null;
    try { got = App.master && pr ? pr.get() : null; } catch (e) { got = null; }
    return { view, key: view + (got ? '|' + got.key : ''), label: got ? got.label : tabLabel(view), state: got ? got.state : null };
  }
  function note() {
    if (App.season !== season) { season = App.season; list = []; cur = null; }       // another file: the old places point at other people
    const h = here();
    if (jumping) {                                                                  // arrived by tapping a place in the list: it keeps its spot
      const e = jumping; jumping = null; Object.assign(e, h, { y: e.y, s: e.s }); list = list.filter(x => x === e || x.key !== e.key); cur = e;
    } else if (cur && cur.view === h.view) {                                         // still on the same tab: the place changed in place (another night, another child)
      list = list.filter(x => x === cur || x.key !== h.key); Object.assign(cur, h, { y: cur.y, s: cur.s });
    } else {
      const same = list.find(x => x.key === h.key);
      if (same) { list.splice(list.indexOf(same), 1); Object.assign(same, h, { y: same.y, s: same.s }); list.unshift(same); cur = same; }
      else { list.unshift(h); cur = h; list.length = Math.min(list.length, MAX); }
    }
    draw();
  }
  function draw() {
    const bar = $('trailBar'), chips = $('trailChips'); if (!bar) return;
    bar.hidden = list.length < 2; if ($('trailTop')) $('trailTop').hidden = list.length < 2;
    const html = list.map((e, i) => '<button type="button" class="chip" data-trail="' + i + '"' + (e === cur ? ' aria-current="true"' : '') + ' title="' + esc(e.label) + '">' + esc(e.label) + '</button>').join('');
    if (chips.innerHTML !== html) { chips.innerHTML = html; $('trailMenu').innerHTML = html; if ($('trailTopMenu')) $('trailTopMenu').innerHTML = html; }
    $('trailBtn').textContent = 'Recent places ▾';
  }
  // Go to a place from the list. Held changes are applied (or you stay) first; a place that no longer exists (a child removed) opens as far as it can.
  function jump(e) {
    if (App.resolveDraft && !App.resolveDraft()) return;
    const back = cur; jumping = e; cur = null;
    const pr = App.places[e.view]; try { if (pr && e.state) pr.set(e.state); } catch (err) { /* the tab opens on whatever it had */ }
    App.showTab(e.view);
    if (jumping) { jumping = null; cur = back; draw(); return; }                   // the switch was refused
    App.pageScroll.to(e.y || 0); const sc = activeScroll(); if (sc) sc.scrollTop = e.s || 0;
  }
  const openMenu = open => { $('trailMenu').hidden = !open; $('trailBtn').setAttribute('aria-expanded', open ? 'true' : 'false'); };
  // The bar can be folded to one thin line for this visit only (a view choice is not stored: every visit starts open).
  const setFold = on => { const b = $('trailBar'), f = $('trailFold'); b.classList.toggle('folded', on); f.setAttribute('aria-expanded', on ? 'false' : 'true'); f.title = on ? 'Show the Recent places again' : 'Hide the Recent places bar (it stays one thin line)'; };      // a view choice: not stored, every visit starts open
  $('trailFold').addEventListener('click', () => setFold(!$('trailBar').classList.contains('folded')));
  $('trailBar').addEventListener('click', ev => {
    if (ev.target.closest('#trailBtn')) { openMenu($('trailMenu').hidden); return; }
    const b = ev.target.closest('[data-trail]'); if (b && list[+b.dataset.trail]) { openMenu(false); jump(list[+b.dataset.trail]); }
  });
  // On a wide screen the same places open from a Recent button after More (the chip row is hidden there).
  const openTop = open => {
    const m = $('trailTopMenu'), b = $('trailTop'); if (!m || !b) return;
    if (open) { const r = b.getBoundingClientRect(); m.style.left = Math.max(8, r.left) + 'px'; m.style.top = (r.bottom + 4) + 'px'; }
    m.hidden = !open; b.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  if ($('trailTop')) {
    $('trailTop').addEventListener('click', ev => { ev.stopPropagation(); openTop($('trailTopMenu').hidden); });
    $('trailTopMenu').addEventListener('click', ev => { const b = ev.target.closest('[data-trail]'); if (b && list[+b.dataset.trail]) { openTop(false); jump(list[+b.dataset.trail]); } });
  }
  document.addEventListener('click', ev => { if (!ev.target.closest('#trailBar')) openMenu(false); if (!ev.target.closest('#trailTop, #trailTopMenu')) openTop(false); });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !$('trailMenu').hidden) { openMenu(false); $('trailBtn').focus(); } if (ev.key === 'Escape' && $('trailTopMenu') && !$('trailTopMenu').hidden) { openTop(false); $('trailTop').focus(); } });
  // A change inside the tab (another night, another child) moves the current place; look after the tab has handled the event.
  const later = () => setTimeout(note, 0);
  document.addEventListener('change', later, true); document.addEventListener('click', later, true);
  document.addEventListener('scroll', () => { if (!cur) return; cur.y = App.pageScroll.y(); const sc = activeScroll(); cur.s = sc ? sc.scrollTop : 0; }, { capture: true, passive: true });
  App.onRefresh.push(note);      // opening another file refreshes every tab: the old places are dropped then, not at the next tap
  // For an app update: the places as plain data, and putting them back once the carried file is open (after the tab is shown, so the current place is the one you left).
  const exportPlaces = () => ({ places: list.map(e => ({ view: e.view, key: e.key, label: e.label, state: e.state, y: e.y, s: e.s })), current: list.indexOf(cur) });
  function restorePlaces(o) {
    if (!o || !Array.isArray(o.places) || !App.season) return;
    season = App.season; list = o.places.filter(e => e && e.view && e.key).slice(0, MAX); cur = list[o.current] || null; draw();
  }
  App.trail = { arrived: note, places: () => list.slice(), current: () => cur, export: exportPlaces, restore: restorePlaces };
  note();
})();
