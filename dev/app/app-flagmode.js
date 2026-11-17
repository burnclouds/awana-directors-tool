(this.AwanaVersions = this.AwanaVersions || {})['app-flagmode.js'] = '1.2.0';
// Flag anything: the Flag button in the top bar turns on flag mode; click any part of any tab to leave a note about it. The note is saved in the data file and listed on To do, with Go.
// The flag stores a trail of labels (flagtrail.js), not a screen position. Esc or the Flag button again leaves the mode.
(function () {
  const App = window.App, esc = App.esc, $ = id => document.getElementById(id), FT = window.FlagTrail;
  const HEAD = 'h2,h3,h4,summary,.plabel,legend,.smhead,caption', PICK = 'button,a,input,select,textarea,label,th,td,summary,h1,h2,h3,h4,.chip,.pcell,.pblock,li,p';
  let on = false, hot = null, kind = 'flag'; const missing = new Set(); App.flagMissing = missing;
  const root = () => document.getElementById('tab-' + App.tab) || document.querySelector('main');
  const tabName = id => { const b = document.querySelector('.tabs button[data-tab="' + id + '"]'); return b ? FT.clean([...b.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ')) || FT.clean(b.textContent) : id; };
  // The text of a node without the form controls inside it (a label that wraps a drop-down would otherwise read out every option).
  const ownText = n => { const c = n.cloneNode(true); c.querySelectorAll('select,textarea,input,option,script,style,.badge,i.info').forEach(x => x.remove()); return c.textContent; };
  const cellText = c => c ? ownText(c) : '';
  const colHeader = el => { const td = el.closest('td'), t = td && td.closest('table'); if (!t || !t.tHead || !t.tHead.rows.length) return ''; const h = t.tHead.rows[t.tHead.rows.length - 1].cells[td.cellIndex]; return h ? ownText(h) : ''; };
  const pickTarget = el => { if (!el || el.nodeType !== 1) return null; if (el.closest('dialog,#splash,.modal-wrap,#btnFlagMode,#btnBugMode,#infoTip,#flagLayer,.flagpop,.trailbar,.tabs')) return null; const t = el.closest(PICK); return t && root().contains(t) ? t : (root().contains(el) ? el : null); };
  function labelOf(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      const lab = el.labels && el.labels[0] ? ownText(el.labels[0]) : '';
      return FT.firstText(el.getAttribute('aria-label'), lab, colHeader(el), el.placeholder, el.getAttribute('title'), el.name);
    }
    return FT.firstText(el.getAttribute('aria-label'), ownText(el), el.getAttribute('title'));
  }
  function headingOf(el) {
    for (let n = el.parentElement, top = root(); n && n !== top.parentElement; n = n.parentElement) {
      if (n.tagName === 'DETAILS') { const s = n.querySelector(':scope > summary'); if (s && s !== el) { const t = FT.short(FT.stable(ownText(s))); if (t) return t; } }
      for (let s = n.previousElementSibling; s; s = s.previousElementSibling) { if (s !== el && s.matches && s.matches(HEAD)) { const t = FT.short(FT.stable(ownText(s))); if (t) return t; } }
      if (n === top) break;
    }
    return '';
  }
  const rowOf = el => { const tr = el.closest('tr'); return tr ? FT.short(cellText(tr.cells[0])) : ''; };
  function infoOf(el) {
    const tr = el.closest('tr'); let rowIndex = 0;
    if (tr) { const rows = [...tr.closest('table').querySelectorAll('tr')], names = rows.map(r => FT.short(cellText(r.cells[0]))); rowIndex = FT.rowIndexOf(names, rows.indexOf(tr)); }
    // A row that names a child (data-id, as on Uniforms and Roster) gives the flag that child (S14): the child goes in the Child column, not in the Where trail.
    const kid = tr && tr.dataset && tr.dataset.id ? tr.dataset.id : '';
    return { kid, trail: FT.build({ tab: tabName(App.tab), heading: headingOf(el), row: kid ? '' : rowOf(el), label: labelOf(el) }), rowIndex, label: labelOf(el) };
  }
  // ---- flag mode ----
  // kind is 'flag' (a note on To do) or 'bug' (a bug report or feature request, kept on the Debug tab). Both pick a spot the same way.
  function setMode(v, k) {
    on = v; kind = on && k === 'bug' ? 'bug' : 'flag'; document.body.classList.toggle('flagmode', on);
    [['btnFlagMode', 'flag'], ['btnBugMode', 'bug']].forEach(([id, kd]) => { const b = $(id); if (!b) return; const lit = on && kind === kd; b.setAttribute('aria-pressed', lit ? 'true' : 'false'); b.classList.toggle('on', lit); });
    if (!on && hot) { hot.classList.remove('flagtarget'); hot = null; }
    if (on) App.flash(kind === 'bug' ? 'Bug report: click the part of the app it is about. Esc or the Bug button leaves this mode.' : 'Flag mode: click anything to leave a note about it. Esc or the Flag button leaves flag mode.', 'info');
  }
  function dialog(el) {
    const season = App.season, info = infoOf(el), dlg = $('dlg');
    const bug = kind === 'bug', lvl = bug ? 'bug' : 'element';
    const here = Season.flagList(season).filter(f => f.level === lvl && f.tab === App.tab && FT.same(f.trail, info.trail) && (f.rowIndex || 0) === info.rowIndex);
    dlg.innerHTML = '<h3 style="margin-top:0">' + (bug ? 'Bug report: ' : '&#9873; Flag: ') + esc(info.label || 'this') + '</h3><p class="status">' + esc(FT.readable(info.trail)) + (info.rowIndex ? ' (row ' + (info.rowIndex + 1) + ' of that name)' : '') + (bug
      ? '<br>This goes on the Debug tab, not To do, where it can be answered. Describe the problem or the feature you would like. Do not write a child\'s name; to report about one child\'s record, click that child\'s row.</p>'
      : '<br>The note shows on the To do tab, with a Go button to come back here, until you clear it.</p>') +
      here.map(f => '<p class="flagnote"><b>' + esc(f.note) + '</b> <span class="status">' + esc(Model.md(f.at)) + '</span> <button type="button" data-dlgclear="' + esc(f.id) + '">Clear</button></p>').join('') +
      '<label>Note <textarea id="flNote" rows="3" style="width:100%" placeholder="' + (bug ? 'What went wrong, or what you would like the app to do' : 'What to check') + '"></textarea></label><div class="dlgbtns"><button id="flCancel">Close</button><button id="flSave" class="primary">' + (bug ? 'Add bug report' : 'Add flag') + '</button></div>';
    $('flCancel').onclick = () => dlg.close();
    // Save leaves flag mode: the page stays where it is, so Save and the other buttons work at once. Another note is one more press of the Flag button.
    $('flSave').onclick = () => {
      const ver = (document.querySelector('meta[name="app-version"]') || {}).content || '';
      try { App.addFlag({ level: lvl, kid: info.kid || undefined, tab: App.tab, trail: info.trail, label: info.label, rowIndex: info.rowIndex, note: $('flNote').value, ver: bug ? ver : undefined }); } catch (err) { App.flash(err.message, 'error'); return; }
      dlg.close(); setMode(false);
      if (bug) { if (App.renderDebug) App.renderDebug(); App.flash('Bug report added. It is on the Debug tab (Options, then Debug).', 'info'); }      // a bug report never touches the To do badge
      else { if (App.updateTodoBadge) App.updateTodoBadge(); App.flash('Flag added. It is on the To do tab.', 'info'); }
    };
    // Esc in the note box cancels it without saving, and leaves flag mode.
    dlg.oncancel = () => setMode(false);
    dlg.querySelectorAll('[data-dlgclear]').forEach(b => { b.onclick = () => { App.clearFlag(b.dataset.dlgclear); dlg.close(); if (App.updateTodoBadge) App.updateTodoBadge(); }; });
    dlg.showModal(); $('flNote').focus();
  }
  document.addEventListener('click', e => {
    if (!on) return;
    if (e.target.closest('#btnFlagMode,#btnBugMode,dialog,#splash,.modal-wrap,#flagLayer,.flagpop')) return;      // a yellow flag and its popup work as they do outside flag mode
    e.preventDefault(); e.stopPropagation();
    if (!App.season) { App.flash('Open a data file first: the flag is kept in it.', 'warn'); setMode(false); return; }
    const el = pickTarget(e.target); if (el) dialog(el);
  }, true);
  document.addEventListener('mouseover', e => { if (!on) return; const el = pickTarget(e.target); if (el === hot) return; if (hot) hot.classList.remove('flagtarget'); hot = el; if (el) el.classList.add('flagtarget'); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && on && !document.querySelector('dialog[open]')) { e.preventDefault(); setMode(false); } });
  // Each button turns its own mode on; pressing the other one switches; pressing the same one again leaves the mode.
  $('btnFlagMode').addEventListener('click', () => { if (!on && !App.season) { App.flash('Open a data file first: the flag is kept in it.', 'warn'); return; } setMode(!(on && kind === 'flag'), 'flag'); });
  const bugBtn = $('btnBugMode'); if (bugBtn) bugBtn.addEventListener('click', () => { if (!on && !App.season) { App.flash('Open a data file first: the bug report is kept in it.', 'warn'); return; } setMode(!(on && kind === 'bug'), 'bug'); });
  // The Bug button shows only when the Options switch is on (config.bugButton); off hides the button and leaves every report where it is.
  App.syncBugButton = () => { const b = $('btnBugMode'); if (!b) return; const show = !!(App.season && App.season.config && App.season.config.bugButton === true); b.hidden = !show; if (!show && on && kind === 'bug') setMode(false); };
  // ---- Go: open the tab, rebuild the trails there, and find the one that matches ----
  const candidates = () => { const cands = []; root().querySelectorAll('*').forEach(el => { if (pickTarget(el) !== el || !el.offsetParent) return; const i = infoOf(el); cands.push({ trail: i.trail, rowIndex: i.rowIndex, ref: el }); }); return cands; };
  function locate(f) { const hit = FT.find(f, candidates()); return hit && hit.ref; }
  // Every flag's element at once (the candidates are rebuilt once): Map of flag id -> element, for the flags the open tab can place. Used by the yellow marks (app-flagmarks.js).
  App.flagLocateAll = flags => { const m = new Map(), c = candidates(); flags.forEach(f => { const hit = FT.find(f, c); if (hit) m.set(f.id, hit.ref); }); return m; };
  App.goElement = f => {
    missing.delete(f.id);
    if (!document.querySelector('.tabs button[data-tab="' + f.tab + '"]')) { App.flash('That tab no longer exists: ' + FT.readable(f.trail || []) + '.', 'warn'); return; }      // showTab would throw on a tab that is gone
    App.showTab(f.tab);
    setTimeout(() => {
      const el = locate(f);
      if (!el) { missing.add(f.id); App.flash('Spot not found: ' + FT.readable(f.trail) + '. The tab is open; the label or row may have changed.', 'warn'); if (App.tab === 'todo' && App.tabs && App.tabs.todo) App.tabs.todo(); return; }
      el.scrollIntoView({ block: 'center' }); el.classList.add('flashflag'); setTimeout(() => el.classList.remove('flashflag'), 2500);
    }, 300);
  };
  if (App.onRefresh) App.onRefresh.push(() => App.syncBugButton());      // a file opened, Undo or Redo, a merge: show or hide the button again
  App.flagTrail = { infoOf, locate };      // for the tests
})();
