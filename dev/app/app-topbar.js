(this.AwanaVersions = this.AwanaVersions || {})['app-topbar.js'] = '1.5.0';
// UX-10, UX-09: the top bar on a phone. Undo and Download stay in the bar; Redo, Flag, Bug and Search go into one "..." menu, so nothing sits off the right edge of the screen.
// On a computer the same four buttons are in the bar as always and the "..." button is hidden (style.css). The menu only forwards a tap to the real button, so every rule those buttons have (a data file must be open, Esc leaves flag mode, Redo's disabled state) stays in one place.
(function () {
  const $ = id => document.getElementById(id);
  const btn = $('btnOverflow'), menu = $('overflowMenu'); if (!btn || !menu) return;
  const ITEMS = [
    { id: 'btnRedo', label: 'Redo', key: 'redo' },
    { id: 'btnFlagMode', label: 'Flag anything', key: 'flag', toggle: true },
    { id: 'btnBugMode', label: 'Report a bug or ask for a feature', key: 'bug', toggle: true },
    { id: 'btnSearch', label: 'Search people', key: 'search' },
    { id: '', label: 'Help for this tab', key: 'help' }      /* UX-08 (trial): the (i) notes and the tab's intro, reachable on a phone where the (i) icons are hidden */
  ];
  const visible = it => { if (!it.id) return true; const b = $(it.id); return b && !b.hidden; };
  function render() {
    menu.innerHTML = ITEMS.filter(visible).map(it => { const b = it.id ? $(it.id) : null, on = it.toggle && b.getAttribute('aria-pressed') === 'true';
      return '<button type="button" role="' + (it.toggle ? 'menuitemcheckbox' : 'menuitem') + '"' + (it.toggle ? ' aria-checked="' + on + '"' : '') + ' data-ov="' + it.key + '"' + (b && b.disabled ? ' disabled' : '') + '><span class="tick">' + (on ? '✓' : '') + '</span>' + it.label + '</button>'; }).join('');
  }
  function setOpen(open) {
    if (open) render();
    menu.hidden = !open; btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) { const r = btn.getBoundingClientRect(); menu.style.left = Math.max(8, Math.min(innerWidth - menu.offsetWidth - 8, r.right - menu.offsetWidth)) + 'px'; menu.style.top = (r.bottom + 4) + 'px'; const f = menu.querySelector('button:not([disabled])'); if (f) f.focus(); }
  }
  btn.addEventListener('click', e => { e.stopPropagation(); setOpen(menu.hidden); });
  menu.addEventListener('click', e => { const b = e.target.closest('[data-ov]'); if (!b || b.disabled) return; const it = ITEMS.find(x => x.key === b.dataset.ov); setOpen(false); if (it.key === 'search') { if (App.openSearch) App.openSearch(); return; } if (it.key === 'help') { helpSheet(); return; } const real = $(it.id); if (real) real.click(); });
  document.addEventListener('click', e => { if (!menu.hidden && !e.target.closest('#overflowMenu, #btnOverflow')) setOpen(false); });
  document.addEventListener('keydown', e => {
    if (menu.hidden) return; const items = [...menu.querySelectorAll('button:not([disabled])')], i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btn.focus(); } else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); } else if (e.key === 'Tab') setOpen(false);
  }, true);
  /* a dot on the "..." button while Flag or Bug mode is on, so the mode is still visible when its own button is tucked away */
  const dot = () => { const lit = ['btnFlagMode', 'btnBugMode'].some(id => $(id) && $(id).getAttribute('aria-pressed') === 'true'); btn.classList.toggle('on', lit); btn.setAttribute('aria-label', 'More: redo, flag, bug report, search' + (lit ? ' (flag mode is on)' : '')); };
  if (window.MutationObserver) { const mo = new MutationObserver(dot); ['btnFlagMode', 'btnBugMode'].forEach(id => { if ($(id)) mo.observe($(id), { attributes: true, attributeFilter: ['aria-pressed'] }); }); }
  if ($('btnSearch')) $('btnSearch').addEventListener('click', () => { if (App.openSearch) App.openSearch(); });
  App.openOverflow = setOpen;
  // The help sheet: a dialog with the open tab's intro line and every (i) note on it (title and text), a Close button, Esc, and a tap on the backdrop; focus goes back to the "..." button.
  function helpSheet() {
    const sec = document.querySelector('main > section:not([hidden])'); if (!sec) return;
    const keys = [...new Set([...sec.querySelectorAll('i.info[data-info]')].map(i => i.dataset.info))], notes = keys.map(k => Info.get(k)).filter(Boolean), intro = sec.querySelector('p.status');
    let d = $('helpSheet'); if (!d) { d = document.createElement('dialog'); d.id = 'helpSheet'; d.className = 'helpsheet'; d.setAttribute('aria-label', 'Help for this tab'); document.body.appendChild(d); d.addEventListener('click', e => { if (e.target === d) d.close(); }); d.addEventListener('close', () => { if ($('btnOverflow')) $('btnOverflow').focus(); }); }
    const title = (document.getElementById('tabMenuLabel') || {}).textContent || 'This tab';
    d.innerHTML = '<h3 style="margin-top:0">Help: ' + Info.esc(title) + '</h3>' + (intro ? '<p class="status">' + Info.esc(intro.textContent.trim()) + '</p>' : '') + (notes.length ? notes.map(n => '<section class="helpnote"><b>' + Info.esc(n.title) + '</b>' + n.html + '</section>').join('') : '<p class="status">There are no notes on this tab. <a href="#" data-helpall="1">Open How it works</a>.</p>') + '<p><a href="#" data-helpall="1">Everything is in How it works</a></p><div class="dlgbtns"><button type="button" class="primary" id="helpClose">Close</button></div>';
    d.querySelector('#helpClose').onclick = () => d.close(); d.querySelectorAll('[data-helpall]').forEach(a => a.onclick = e => { e.preventDefault(); d.close(); App.showTab('help'); });
    d.showModal();
  }
  /* UX-07: the Person bar's five filters sit behind one "Filter" disclosure on a phone, whose summary says what is set ("Filter: Sparks, last name"); on a computer they are all in the bar (the details is kept open and its summary is hidden) */
  const fd = $('peFilter'), fs = $('peFilterSum');
  if (fd && fs) {
    const val = id => { const e = $(id); return e ? (e.options ? (e.options[e.selectedIndex] || {}).text : e.value) : ''; };
    const sum = () => { const bits = []; if ($('peRole') && $('peRole').value !== 'all') bits.push(val('peRole').toLowerCase()); if ($('peGroup') && $('peGroup').value !== 'All') bits.push(val('peGroup')); if ($('peClass') && $('peClass').value !== 'All') bits.push(val('peClass')); bits.push(($('peSort') && $('peSort').value === 'last') ? 'last name' : 'first name'); if ($('peInactive') && $('peInactive').value !== 'active') bits.push($('peInactive').value === 'all' ? 'everyone' : 'inactive'); const t = 'Filter: ' + bits.join(', '); if (fs.textContent !== t) fs.textContent = t; };      /* only when it changed: the summary is inside the bar that is watched */
    const wide = window.matchMedia('(min-width: 761px)'), place = () => { if (wide.matches) fd.open = true; };
    place(); if (wide.addEventListener) wide.addEventListener('change', () => { place(); if (!wide.matches) fd.open = false; });
    const bar = $('personBar'); bar.addEventListener('change', sum); bar.addEventListener('input', sum); sum();
    if (window.MutationObserver && $('peClass')) new MutationObserver(sum).observe($('peClass'), { childList: true });      /* the Class list is rebuilt for each group */
    App.peFilterSummary = sum;
  }
})();

// UX-22: on a phone the column headings of a card table are hidden (style.css), so a box or a number in a card has no caption. Each cell gets its column heading as a small caption (data-label, shown by CSS under 760px).
// It is added after every change to the page, only on a phone width, and skipped for a cell whose text already starts with the same word.
(function () {
  const phone = window.matchMedia ? window.matchMedia('(max-width: 760px)') : { matches: false };
  let queued = false;
  function label(root) {
    (root || document).querySelectorAll('.pcard table.roster').forEach(t => {
      const heads = [...t.querySelectorAll('thead th')].map(h => h.textContent.trim()); if (!heads.some(Boolean)) return;
      t.querySelectorAll('tbody tr').forEach(tr => [...tr.children].forEach((td, i) => {
        const h = heads[i]; if (!h || td.tagName !== 'TD') { return; } if (td.dataset.label === h) return;
        const txt = td.textContent.trim().toLowerCase(); if (txt && txt.split(/\s+/)[0] === h.toLowerCase().split(/\s+/)[0]) { delete td.dataset.label; return; }
        if (!txt && !td.querySelector('input,select,textarea,button')) return;      /* an empty cell needs no caption */
        td.dataset.label = h;
      }));
    });
  }
  App.cardLabels = label;
  const main = document.getElementById('main');
  if (main && window.MutationObserver) new MutationObserver(() => { if (queued || !phone.matches) return; queued = true; requestAnimationFrame(() => { queued = false; label(main); }); }).observe(main, { childList: true, subtree: true });
})();

// UX-18: the Color teams bar keeps Quarter and Fill blanks; Re-draw, Import current colors, Save colors CSV and Start new year are under one "More" menu (the same pattern as the "..." menu above; each item is the real button, so what it does has one home).
(function () {
  const $ = id => document.getElementById(id), btn = $('btnTeamMore'), menu = $('teamMore'); if (!btn || !menu) return;
  function setOpen(open) {
    menu.hidden = !open; btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) { const r = btn.getBoundingClientRect(); menu.style.left = Math.max(8, Math.min(innerWidth - menu.offsetWidth - 8, r.right - menu.offsetWidth)) + 'px'; menu.style.top = (r.bottom + 4) + 'px'; const f = menu.querySelector('button'); if (f) f.focus(); }
  }
  btn.addEventListener('click', e => { e.stopPropagation(); setOpen(menu.hidden); });
  menu.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; setOpen(false); if (b.id === 'btnTeamImport' && $('fileTeams')) $('fileTeams').click(); });
  document.addEventListener('click', e => { if (!menu.hidden && !e.target.closest('#teamMore, #btnTeamMore')) setOpen(false); });
  document.addEventListener('keydown', e => {
    if (menu.hidden) return; const items = [...menu.querySelectorAll('button')], i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btn.focus(); } else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); } else if (e.key === 'Tab') setOpen(false);
  }, true);
  App.openTeamMore = setOpen;
})();
