(this.AwanaVersions = this.AwanaVersions || {})['app-flagpop.js'] = '1.1.0';
// The flag popup: a yellow flag (a place that has a note) opens this popup next to itself. Each note is in a text box: Save keeps an edit, Clear removes the flag. Closes with the x, Esc, a click anywhere else,
// or a change of tab; an edit that was not saved is dropped. Placement is the (i) note's (App.info.placeBox), so it never leaves the window. New flags are made only by the Flag button and the To do "Add note" box.
(function () {
  const App = window.App, esc = App.esc;
  let box = null, anchor = null;
  const fmt = f => (f.color ? f.color + ' · ' : '') + Model.md(f.at);
  function close() { if (box) { box.remove(); box = null; } anchor = null; }
  function draw() {
    const ids = box._ids.filter(id => (App.season.flags || {})[id]);
    if (!ids.length) { close(); return; }
    box._ids = ids;
    box.innerHTML = '<button type="button" class="infoclose fpclose" aria-label="Close this note">&times;</button><b class="infotitle">&#9873; Flag</b>' + ids.map(id => { const f = App.season.flags[id];
      return '<div class="fpnote"><span class="status">' + esc(App.flagWhere(Object.assign({ id }, f))) + ' · ' + esc(fmt(f)) + '</span><textarea rows="3" data-fnote="' + esc(id) + '" aria-label="Note">' + esc(f.note) + '</textarea>' +
        '<div class="dlgbtns">' + (f.level === 'bug' ? '' : '<button type="button" data-fhide="' + esc(id) + '" data-on="' + (Season.isFlagHidden(f) ? '' : '1') + '" title="' + (Season.isFlagHidden(f) ? 'Show this note on the To do list again' : 'Hide this note from the To do list. It stays here and in History.') + '">' + (Season.isFlagHidden(f) ? 'Unhide' : 'Hide on To do') + '</button>') + '<button type="button" data-fclear="' + esc(id) + '">Clear flag</button><button type="button" class="primary" data-fsave="' + esc(id) + '">Save</button></div></div>'; }).join('');
    App.info.placeBox(anchor, box);
  }
  function show(ids, el) {
    if (box && anchor === el) { close(); return; }
    close(); if (App.info && App.info.close) App.info.close();
    anchor = el; box = document.createElement('div'); box.className = 'flagpop infobox'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Flag note'); box.tabIndex = -1; box._ids = ids.slice();
    document.body.appendChild(box); draw(); if (box) { const t = box.querySelector('textarea'); if (t) t.focus({ preventScroll: true }); }
  }
  document.addEventListener('click', e => {
    if (!box) return;
    const t = e.target.closest && e.target.closest('button');
    if (t && box.contains(t)) {
      e.preventDefault();
      if (t.classList.contains('fpclose')) { close(); return; }
      if (t.dataset.fsave) { const ta = box.querySelector('textarea[data-fnote="' + CSS.escape(t.dataset.fsave) + '"]'); try { App.setFlagNote(t.dataset.fsave, ta.value); } catch (err) { App.flash(err.message, 'error'); return; } close(); if (App.flagsChanged) App.flagsChanged(); App.flash('Note saved.', 'info'); return; }
      if (t.dataset.fhide) { App.hideFlag(t.dataset.fhide, !!t.dataset.on); draw(); if (App.flagsChanged) App.flagsChanged(); return; }
      if (t.dataset.fclear) { App.clearFlag(t.dataset.fclear); draw(); if (App.flagsChanged) App.flagsChanged(); return; }
      return;
    }
    if (!box.contains(e.target) && !(anchor && anchor.contains(e.target))) close();      // a click anywhere else closes it and is otherwise left to do what it does
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && box) { e.preventDefault(); e.stopPropagation(); const a = anchor; close(); if (a && a.focus && document.contains(a)) a.focus(); } }, true);
  window.addEventListener('resize', () => { if (box) App.info.placeBox(anchor, box); });
  document.addEventListener('scroll', e => { if (box && !(e.target.closest && e.target.closest('.flagpop'))) { if (document.contains(anchor)) App.info.placeBox(anchor, box); else close(); } }, true);
  const showTab = App.showTab; if (showTab) App.showTab = function () { close(); return showTab.apply(this, arguments); };
  App.flagPop = { show, close };
})();
