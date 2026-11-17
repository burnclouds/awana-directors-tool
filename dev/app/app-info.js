(this.AwanaVersions = this.AwanaVersions || {})['app-info.js'] = '1.3.0';
// The (i) notes on the page (info.js holds the text). Any <i class="info" data-info="key"></i> that appears, in the page or in a string a tab builds later, becomes a button:
// hover (or keyboard focus) shows the one-line tip, a click opens the full note as a POPUP over the page (it never pushes the page's content down or around), and it closes with a second click,
// the x, Esc, a click anywhere else, a change of tab, or the page redrawing the button it belongs to. One note is open at a time. Desktop only: style.css hides all of it on a phone.
(function () {
  const App = window.App, $ = id => document.getElementById(id);
  let cur = null;       // the (i) whose note is open
  const tip = document.createElement('div'); tip.id = 'infoTip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true; document.body.appendChild(tip);
  function box(btn) {
    const k = btn.dataset.info, n = Info.get(k); let b = btn._box;
    if (!b) {
      b = btn._box = document.createElement('div'); b.className = 'infobox'; b.setAttribute('role', 'dialog'); b.setAttribute('aria-label', n.title); b.tabIndex = -1; b.hidden = true;
      b.innerHTML = '<button type="button" class="infoclose" aria-label="Close this note">&times;</button><b class="infotitle">' + Info.esc(n.title) + '</b>' + n.html + '<p class="infomore"><a href="#o-' + Info.esc(k.replace(/\./g, '-')) + '" data-infohelp="' + Info.esc(k.replace(/\./g, '-')) + '">All the options, and when to use each, are in How it works</a></p>';
      document.body.appendChild(b);
    }
    return b;
  }
  // Below the (i) when there is room, otherwise above it; always inside the window, scrolling inside itself when the note is taller than the space.
  function place(btn, b) {
    const r = btn.getBoundingClientRect(), m = 8, room = innerHeight - 2 * m;
    b.style.maxHeight = room + 'px'; b.style.left = '0px'; b.style.top = '0px';
    const w = b.offsetWidth, h = Math.min(b.scrollHeight, room), below = innerHeight - r.bottom - m - 8, above = r.top - m - 8;
    let top, max;
    if (h <= below || below >= above) { top = r.bottom + 8; max = Math.max(160, below); } else { max = Math.max(160, above); top = Math.max(m, r.top - 8 - Math.min(h, max)); }
    const mh = Math.min(max, room); b.style.maxHeight = mh + 'px'; b.style.top = Math.max(m, Math.min(top, innerHeight - Math.min(h, mh) - m)) + 'px';      // and always inside the window, even when its (i) has scrolled out of sight b.style.left = Math.max(m, Math.min(innerWidth - w - m, r.left + r.width / 2 - 24)) + 'px';
  }
  function close(restoreFocus) {
    if (!cur) return; const btn = cur, b = btn._box; cur = null; btn.setAttribute('aria-expanded', 'false');
    if (b) { const hadFocus = b.contains(document.activeElement); b.hidden = true; if (hadFocus || restoreFocus) btn.focus(); }
  }
  function toggle(btn, want) {
    const on = want === undefined ? cur !== btn : want;
    if (!on) { if (cur === btn) close(true); return; }
    if (cur && cur !== btn) close();
    const b = box(btn);
    if (btn.dataset.live && App.liveTip && App.liveTip[btn.dataset.live]) { let l = b.querySelector('.infolive'); if (!l) { l = document.createElement('p'); l.className = 'infolive'; b.insertBefore(l, b.querySelector('.infotitle').nextSibling); } l.textContent = App.liveTip[btn.dataset.live]().replace(/\n/g, ' · '); }
    b.hidden = false; btn.setAttribute('aria-expanded', 'true'); cur = btn; hideTip(); place(btn, b); b.focus({ preventScroll: true });
  }
  function decorate(root) {
    root.querySelectorAll('i.info[data-info]:not([data-ready])').forEach(el => {
      const n = Info.get(el.dataset.info); if (!n) { el.remove(); return; }
      el.dataset.ready = '1'; el.dataset.tip = n.tip; el.setAttribute('role', 'button'); el.tabIndex = 0; el.setAttribute('aria-expanded', 'false'); el.setAttribute('aria-label', 'About: ' + n.title); el.setAttribute('aria-haspopup', 'dialog'); el.textContent = 'i';
    });
  }
  new MutationObserver(ms => {
    ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1 && !n.classList.contains('infobox') && n.id !== 'infoTip') decorate(n.parentNode || n); }));
    if (cur && !cur.isConnected) close();      // the page redrew the button this note belongs to
  }).observe(document.body, { childList: true, subtree: true });
  decorate(document);

  const hideTip = () => { tip.hidden = true; };
  function showTip(btn) {
    if (btn.getAttribute('aria-expanded') === 'true') return;       // already open: the note says it
    const live = btn.dataset.live && App.liveTip && App.liveTip[btn.dataset.live] ? App.liveTip[btn.dataset.live]() : '';
    tip.textContent = (live ? live + '\n\n' : '') + btn.dataset.tip; tip.hidden = false;
    const r = btn.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
    tip.style.top = (r.top - h - 8 < 8 ? r.bottom + 8 : r.top - h - 8) + 'px';
  }
  document.addEventListener('mouseover', e => { const b = e.target.closest && e.target.closest('i.info[data-ready]'); if (b) showTip(b); });
  document.addEventListener('mouseout', e => { if (e.target.closest && e.target.closest('i.info')) hideTip(); });
  document.addEventListener('focusin', e => { const b = e.target.closest && e.target.closest('i.info[data-ready]'); if (b) showTip(b); });
  document.addEventListener('focusout', hideTip);
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('i.info[data-ready]');
    if (b) { e.preventDefault(); e.stopPropagation(); toggle(b); return; }
    if (e.target.closest && e.target.closest('.infoclose')) { e.preventDefault(); close(true); return; }
    const a = e.target.closest && e.target.closest('a[data-infohelp]');
    if (a) { e.preventDefault(); close(); App.showTab('help'); setTimeout(() => { const t = $('o-' + a.dataset.infohelp); if (t) { t.scrollIntoView({ block: 'start' }); t.classList.add('found'); setTimeout(() => t.classList.remove('found'), 2500); } }, 50); return; }
    if (cur && !(e.target.closest && e.target.closest('.infobox'))) close();      // a click anywhere else closes the note and is otherwise left to do what it does
  }, true);
  document.addEventListener('keydown', e => {
    const b = e.target.closest && e.target.closest('i.info[data-ready]');
    if (b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(b); return; }
    if (e.key === 'Escape' && cur) { e.preventDefault(); e.stopPropagation(); close(true); }
  }, true);
  window.addEventListener('resize', () => { if (cur) place(cur, cur._box); });
  document.addEventListener('scroll', e => { if (cur && !(e.target.closest && e.target.closest('.infobox'))) place(cur, cur._box); }, true);      // the note follows its (i) when the page scrolls
  App.info = { toggle, decorate, close, placeBox: place };      // placeBox(anchor, box): also used by the flag popup (app-flagpop.js)
})();
