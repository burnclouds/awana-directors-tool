(this.AwanaVersions = this.AwanaVersions || {})['app.js'] = '1.77.12';
(function () {
  const { C, X } = Model;
  const { esc } = Reports;
  const $ = id => document.getElementById(id);
  const today = () => new Date().toLocaleDateString('en-CA');

  // In-memory settings for this page. Nothing here is stored in the browser: the club title typed by hand lives in the data file (config.clubTitle), and the quarter follows the calendar.
  let settings = { quarter: 'Q1', club: '', clubCustom: false };
  // Browser settings retired by plan item 1 (they now live in the data file or are not kept). Removed once on load, so nothing stale is left behind.
  ['awana.settings', 'awana-drive-style', 'awana-drive-keepname', 'awana-drive-dirs', 'awana-updates', 'awana-autosave', 'awana-todo-view', 'awana-att-hold', 'awana-trail-folded'].forEach(k => { try { localStorage.removeItem(k); } catch (e) { /* storage may be blocked */ } });
  // The report title is "AWANA Club 26-27" for the season of the open data file (or of today's date) unless a different title has been typed into the file.
  function autoClub() {
    const y = /^(\d{4})-(\d{2,4})$/.exec(String((App.season && App.season.year) || '').trim()), t = new Date();
    const a = y ? +y[1] : t.getFullYear() - (t.getMonth() < 7 ? 1 : 0), b = y ? +y[2].slice(-2) : (a + 1) % 100;      // a school year starts in August
    return 'AWANA Club ' + String(a).slice(-2) + '-' + String(b).padStart(2, '0');
  }
  function applyClub() {
    const typed = App.season && App.season.config && String(App.season.config.clubTitle || '').trim();
    settings.clubCustom = !!typed; settings.club = typed || autoClub();
    const f = document.getElementById('sClub'); if (f) { f.placeholder = autoClub(); if (document.activeElement !== f) f.value = settings.club; }
  }
  // Typing a title writes it to the file; clearing it (or typing the automatic one) removes it, so the title follows the season again.
  function setClubTitle(v) {
    if (App.season && App.season.config) { if (v) App.season.config.clubTitle = v; else delete App.season.config.clubTitle; App.commitScope(() => App.changed()); }
    applyClub();
  }

  let master = null, byId = new Map(), pending = null, lastPc = null;
  let calendar = [], rotation = [];      // saved inside the data JSON (see app-season.js)

  // The quarter follows the calendar: the latest club night on or before today. A quarter chosen by hand (Reports or Color teams) is an override that is
  // remembered with the day it was chosen and lapses after OVERRIDE_DAYS, so a leftover choice cannot hold the app in last quarter. With no calendar the last value stays.
  const OVERRIDE_DAYS = 7;
  let locationReportQuarter = null;
  const daysSince = iso => Math.round((Date.parse(today() + 'T12:00:00Z') - Date.parse(iso + 'T12:00:00Z')) / 864e5);
  function applyQuarter() {
    const o = settings.quarterOverride, live = o && /^Q[1-4]$/.test(o.q) && /^\d{4}-\d{2}-\d{2}$/.test(o.on || '') && daysSince(o.on) >= 0 && daysSince(o.on) < OVERRIDE_DAYS;
    if (o && !live) delete settings.quarterOverride;
    const q = live ? o.q : (Calendar.currentQuarter(calendar, today()) || settings.quarter || 'Q1'), changed = q !== settings.quarter;
    settings.quarter = q;
    const f = document.getElementById('sQuarter'); if (f && document.activeElement !== f) f.value = q;
    const fq = document.getElementById('fQuarter'); if (fq) fq.value = q;      // the Roster tab's quarter picker follows the app-wide quarter
    return changed;
  }
  function setQuarter(q) { locationReportQuarter = null; settings.quarterOverride = { q, on: today() }; applyQuarter(); }

  // Shared with app-season.js (attendance, games, awards, progress).
  const App = window.App = {
    tab: 'roster', sub: 'games', view: () => viewOf(App.tab, App.sub), tabs: {}, onRefresh: [], opened: [], noteOpened: (n, t, m) => noteOpened(n, t, m), dirty: () => false, changed: () => {}, rebase: () => {}, updateStatus: () => updateStatus(),
    get master() { return master; }, get calendar() { return calendar; }, get rotation() { return rotation; }, get hasPcExport() { return !!lastPc; }, get settings() { return settings; },
    locationViews: {},
    places: {},      // tab -> { get(), set(state) }: what the Recent places list remembers about the tab (app-trail.js)
    markTest: n => markTest(n),      // for a session carried through an update (app-update.js)
    teamColors: () => Season.teamOrder(App.season),      // the colors in the order set on the Options tab
    testFiles: () => [...testFiles], testGate: (btn, go) => testGate(btn, go),
    today, esc, touch: () => touch(), refresh: () => refresh(), openEdit: p => openEdit(p), knownRooms: () => knownRooms(), readFile, guardedSave, showTab: (n, s) => showTab(n, s),
    openFiles: files => openFiles(files),
    // Optional (app-drive.js): when the person has chosen to save to Google Drive, data files (JSON) and slide images (PNG, ZIP) go there as a new file instead of being downloaded;
    // if that fails the file is downloaded as usual so nothing is lost.
    driveSave: null,
    // opts.single (plan item 1, stage 2): save the data file over one chosen file. Chrome and Edge keep a handle to it for later saves in this page
    // (App.localHandle, reset when a file is opened); other browsers download the file. Resolves false when the person cancels the Save as box.
    download(name, text, type, opts) {
      const final = testFiles.size ? testName(name) : name, local = () => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain;charset=utf-8' })); a.download = final;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      };
      // opts.local: a copy to this computer, even while Drive is on.
      if (App.driveSave && /json|image\/png|zip|csv/.test(type || '') && App.driveSave.active() && !(opts && opts.local)) {
        // Resolves 'drive' when Drive has it, 'copy' when a save you pressed failed and a copy was downloaded instead. An automatic save that fails is quiet: no alert, no download (it rejects, and tries again next time). (R11)
        // N9 point 9: a pressed save that fails gets a plain sentence and Try again. The copy downloads once, on the first failure; a retry never overwrites a newer Drive revision (saveInPlace merges), so it is safe to press again.
        let copied = false;
        const attempt = () => App.driveSave.go(final, text, type, opts).then(() => 'drive', err => {
          if (opts && opts.auto) throw err;
          if (!copied) { local(); copied = true; }
          return App.ask.choose(App.driveSave.explain(err) + ' A copy is downloaded to this computer.', { title: 'Google Drive save', buttons: [{ id: 'again', label: 'Try again', primary: true }, { id: 'close', label: 'Close' }], cancel: 'close' })
            .then(id => id === 'again' ? attempt() : 'copy');
        });
        return attempt();
      }
      // Test data (TEST files) always downloads: automated browsers cannot answer the Save as box, and no leader opens test files.
      if (opts && opts.single && window.showSaveFilePicker && !testFiles.size) return saveOver(final, text, type, local);
      local();
    },
  };

  // Save over the chosen file (Chrome and Edge). The first save asks where (Save as); later saves write to the same file. Anything else falls back to a download.
  async function saveOver(name, text, type, fallback) {
    try {
      if (!App.localHandle) App.localHandle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Awana data file', accept: { 'application/json': ['.json'] } }] });
      const w = await App.localHandle.createWritable(); await w.write(new Blob([text], { type: type || 'application/json' })); await w.close(); return true;
    } catch (err) {
      if (err && err.name === 'AbortError') return false;      // the person cancelled the Save as box
      App.localHandle = null; fallback(); return true;      // could not write there: download it instead
    }
  }

  // ---------- test data ----------
  // A file with TEST as a word in its name (…TEST.csv, _test_, -Test-; not "latest") marks the session as test data. From then on every download is named
  // with TEST (before the date tag, so the name still sorts and validates) and the download buttons need two presses. Reload the page to clear it.
  const isTestName = n => /(^|[^a-z])test([^a-z]|$)/i.test(String(n || ''));
  const testFiles = new Set();
  const testName = n => { if (isTestName(n)) return n; const m = /^(.*?)(-\d{8}-\d{6})?(\.[^.]+)$/.exec(n); return m ? m[1] + '-TEST' + (m[2] || '') + m[3] : n + '-TEST'; };
  function markTest(name) {
    if (!isTestName(name)) return;
    testFiles.add(name);
    $('testBanner').hidden = false;
    $('testBannerText').innerHTML = 'TEST DATA LOADED<span class="tbfiles"> (' + esc([...testFiles].join(', ')) + ')</span>. Downloads are named with TEST and need two presses. Do not use this session for real work; reload the page to clear it.';
  }
  const armed = new Map();
  function testGate(btn, go) {
    if (!testFiles.size) return go();
    const a = armed.get(btn);
    if (a) { clearTimeout(a.t); btn.textContent = a.label; btn.classList.remove('armed'); armed.delete(btn); return go(); }
    const label = btn.textContent;
    btn.textContent = 'TEST data: press again to download'; btn.classList.add('armed');
    armed.set(btn, { label, t: setTimeout(() => { btn.textContent = label; btn.classList.remove('armed'); armed.delete(btn); }, 10000) });
  }

  // ---------- state helpers ----------
  function setMaster(m) { master = m; byId = new Map(m.people.map(p => [p[X.ID], p])); refresh(); }
  function touch() { App.changed(); updateStatus(); }
  function updateStatus() {
    splashDone();
    const s = $('status');
    if (!master) { s.textContent = 'No data loaded'; s.className = 'status'; return; }
    const active = master.people.filter(Model.isActive).length;
    // With a season open, the count of changes Planning Center still needs sits in the bar under the tabs (drawDraftBar) and "unsaved" is said once, on the Data file line; they stay here only while there is no season.
    const full = active + ' active / ' + master.people.length + ' total' + (!App.season && Model.pendingChanges(master).length ? ' \u00b7 ' + Model.pendingChanges(master).length + ' pending PC changes' : '') + (master.pcAsOf ? ' \u00b7 Planning Center data as of ' + master.pcAsOf + (lastPc ? '' : ' (from the data file)') : '') + (App.dirty() && !App.season ? ' \u00b7 UNSAVED CHANGES' : '');
    // The top bar is short: "142 active \u00b7 PC data 2026-10-28"; the long form is the tooltip.
    s.textContent = active + ' active' + (master.people.length !== active ? ' / ' + master.people.length + ' total' : '') + (!App.season && Model.pendingChanges(master).length ? ' \u00b7 ' + Model.pendingChanges(master).length + ' pending PC changes' : '') + (master.pcAsOf ? ' \u00b7 PC data ' + master.pcAsOf : '') + (App.dirty() && !App.season ? ' \u00b7 UNSAVED CHANGES' : ''); s.title = full;
    s.className = 'status' + (App.dirty() && !App.season ? ' dirty' : '');      // with a season open the Data file line carries the orange "unsaved"
  }
  function refresh() {
    applyQuarter();
    byId = new Map((master ? master.people : []).map(p => [p[X.ID], p]));
    applyClub(); fillRoomFilter(); updateStatus();
    // Whatever tab is on screen when data arrives (a file opened from the splash, a restore) must fill in at once.
    if (!$('tab-games').hidden && !$('subTeams').hidden) renderTeams();
    [['roster', renderRoster], ['reports', renderReport], ['uniforms', renderUniforms], ['calendar', renderCalendar]].forEach(([t, f]) => { if (!$('tab-' + t).hidden) f(); });
    renderColsBar(); App.onRefresh.forEach(f => f());
  }
  window.addEventListener('beforeunload', e => { if (App.dirty()) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- file I/O ----------
  // Every file opened this session, with the dates found in it, for the Debug tab.
  function noteOpened(name, text, lastModified) {
    if (typeof Validate === 'undefined') return;
    try { App.opened.push(Object.assign({ name }, Validate.inspect(text, name, lastModified))); } catch (e) { /* the Debug tab is optional */ }
  }
  async function readFile(input) {
    const f = input.files[0]; input.value = '';
    return f ? { name: f.name, text: await f.text(), lastModified: f.lastModified } : null;
  }
  // The Planning Center export is read-only input. People we already know are refreshed silently; anyone new, missing,
  // renamed or moved to another room is shown for review first.
  // What the To do tab shows about the file just imported: the file check, the counts, and who was added. The page opens when an import finishes.
  function recordImport(name, text, counts, newIds) {
    let findings = []; try { findings = Validate.validate(text, name).findings; } catch (e) { /* the check is advisory */ }
    const c = Object.assign({}, counts); delete c.ids; delete c.loose;      // (applyPlan also reports the people and the rows that belong to nobody, for the kept record; they are not counts to show)
    const cap = master && master.pcExport, kept = cap ? { cols: cap.names.length, unused: cap.names.filter(n => !Model.PC_KNOWN.includes(n) && !Model.PC_ROLES.some(r => r.col === n)).length, loose: cap.loose.length, blank: cap.blankRows } : null;
    App.lastImport = { name, text, asOf: master && master.pcAsOf, findings, counts: c, kept, newIds: newIds || new Set() };
    showTab('todo');
  }
  // ---------- the export's columns ----------
  // Planning Center can change its form from year to year (a reworded question, a new uniform item, a dropped column). Model.columnReport says what the export's columns mean for the app;
  // it is shown in a bar under the header (Details opens the list; Hide hides it until the next import), in the file check and on the Debug tab. Nothing stops the import.
  let colReport = null, colHidden = '';
  // An older data file holds only the identity columns of the roster until an export is imported, so there is nothing to judge then (null).
  const colItems = () => !master ? [] : colReport || (master.pcCols.length > Model.TRACKED.length ? Model.columnReport(master.pcCols) : null);
  function renderColsBar() {
    const warn = (colItems() || []).filter(i => i.level !== 'info'), key = warn.map(i => i.text).join('|');
    $('pcColsBar').hidden = !warn.length || colHidden === key;
    if (warn.length) $('pcColsText').textContent = '\u26a0 ' + warn.length + ' thing' + (warn.length === 1 ? '' : 's') + ' to check in the Planning Center export\u2019s columns: the app expects columns that are missing or have changed.';
  }
  function columnsHtml(items) {
    if (!items) return '<p class="status">No Planning Center export has been imported into this file yet, so there are no columns to check.</p>';
    return items.length ? '<ul class="colsitems">' + items.map(i => '<li class="' + i.level + '"><b>' + (i.level === 'error' ? 'Cannot continue' : i.level === 'warn' ? 'Check' : 'Note') + ':</b> ' + esc(i.text) + '</li>').join('') + '</ul>' : '<p class="ok">Every column the app reads is in the export, and there are no new ones.</p>';
  }
  // Every column the last export had, as exported and as stored, and whether the app uses it (R17): nothing in the export is hidden or dropped, used or not.
  function keptHtml() {
    const cap = master && master.pcExport; if (!cap) return '';
    const used = n => Model.PC_KNOWN.includes(n) || Model.PC_ROLES.some(r => r.col === n), cell = v => v === '' ? '<span class="status">(blank)</span>' : esc(v);
    const rows = cap.names.map((n, i) => [cap.header[i] == null ? '' : cap.header[i], n, used(n) ? 'used by the app' : 'kept, not used']);
    (master.pcCols || []).filter(n => !cap.names.includes(n)).forEach(n => rows.push(['', n, 'from an earlier export']));
    return '<h4>Every column kept</h4><p class="status">All ' + cap.names.length + ' columns of the last export, and every value in them, are in the data file, whether the app uses them or not.</p><div class="pscroll"><table class="roster"><thead><tr><th>As exported</th><th>Stored as</th><th></th></tr></thead><tbody>' +
      rows.map(r => '<tr><td>' + cell(r[0]) + '</td><td>' + esc(r[1]) + '</td><td class="status">' + esc(r[2]) + '</td></tr>').join('') + '</tbody></table></div>';
  }
  function columnsDialog() {
    const dlg = $('dlg');
    dlg.innerHTML = '<h3 style="margin-top:0">Planning Center columns</h3><p class="status">Planning Center can change its registration form from year to year. The app reads the export by column name; where a column has been renamed it finds it again by its meaning, and where it cannot, it tells you here what will not work. Everything else keeps working, and the people are imported either way.</p>' +
      columnsHtml(colItems()) + keptHtml() + '<p class="status">To fix a gap: re-export from Planning Center with every field included, or ask for the column to be added to this app. Until then the affected details can be filled in by hand on the Person tab. The same list is on the Debug tab and in the file check (Validate).</p><div class="dlgbtns"><button type="button" id="colsClose" class="primary">Close</button></div>';
    dlg.showModal(); $('colsClose').onclick = () => dlg.close();
  }
  $('pcColsMore').addEventListener('click', columnsDialog);
  $('pcColsHide').addEventListener('click', () => { colHidden = (colItems() || []).filter(i => i.level !== 'info').map(i => i.text).join('|'); renderColsBar(); });
  App.pcColumns = { items: colItems, html: () => columnsHtml(colItems()) };
  function importPc(text, name, opts) {
    const rx = Model.readExport(text), pc = { cols: rx.cols, records: rx.records };      // every column, row and cell is read (R17); blank rows are counted in rx
    if (!pc.cols.includes(C.FIRST) || !pc.cols.includes(C.LAST)) throw new Error('That does not look like a Planning Center export.');
    // An export dated before the Planning Center data the file already holds (R10). Picked by hand: ask first, and Cancel changes nothing. Re-applied by the app (opts.quiet, from loadData, which also runs inside a Drive save): never ask, skip it and say why.
    if (master && master.people.length) {
      const o = Model.olderExport(master.pcAsOf, name);
      if (o.older) {
        const why = 'is older than this file’s Planning Center data (as of ' + o.fileDate + ')';
        if (opts && opts.quiet) { if (lastPc && lastPc.name === name) lastPc.declined = true; App.flash('The export opened earlier (' + name + ', as of ' + o.exportDate + ') ' + why + ', so it was not applied. Import it again if you want it anyway.', 'warn'); return; }
        if (!(opts && opts.olderOk)) {      /* ask in the app's dialog; on "Import it anyway" run the same import again with the answer (importPc itself stays synchronous) */
          App.ask.confirm('This export is as of ' + o.exportDate + ', which is older than the Planning Center data already in this file (as of ' + o.fileDate + ').\n\nImport it anyway? Cancel leaves the file as it is.', { title: 'Older export', ok: 'Import it anyway' }).then(yes => { if (yes) importPc(text, name, Object.assign({}, opts, { olderOk: true })); });
          return;
        }
      }
    }
    lastPc = { pc, name, text, rx };
    // The same export again (the same bytes, whatever its name): nothing changes, nothing is logged, the file is not marked unsaved (R17). Re-applied by the app (opts.quiet) it is skipped without a word.
    if (master && master.people.length && master.pcExport && master.pcExport.hash === Model.hashText(text)) {
      if (!(opts && opts.quiet)) App.flash('This export is already in the file (imported ' + String(master.pcExport.at || '').slice(0, 10) + ').', 'info');
      return;
    }
    colReport = Model.columnReport(rx.reportCols); colHidden = '';      // what this export's columns mean for the app: shown in the bar under the header until the next import
    if (!master || !master.people.length) { setMaster(Model.loadMaster(text, today())); stampExport(name, rx, { ids: master.people.map(p => p[X.ID]), loose: [] }, text); logImport(name); updateStatus(); recordImport(name, text, { loaded: master.people.length }); renderColsBar(); if (colReport.some(i => i.level !== 'info')) columnsDialog(); return; }
    const plan = Model.planImport(master, pc);
    if (Model.needsReview(plan)) { pending = { plan, name, keep: new Map(), rx, text }; if (conflictRows(plan).length) showConflicts(); else showReview(); return; }
    const res0 = Model.applyPlan(master, plan, { rename: new Set(), add: new Set(), deactivate: new Set() }, today());
    stampExport(name, rx, res0, text);
    logImport(name);      // every change the import made (money and unused columns, the export record) is one History entry; an import that changed nothing is only a rebase
    refresh(); recordImport(name, text, res0);
  }
  // The export's date and file name, and the kept record of everything it said (R17).
  const stampExport = (name, rx, result, text) => { master.pcAsOf = Model.exportDate(name, today()); master.pcSource = name; if (rx) Model.captureExport(master, rx, result || { ids: [], loose: [] }, { text, at: new Date().toISOString() }); };
  const logImport = name => { if (App.importChanged) App.importChanged('Planning Center import: ' + name); else App.changed(); };
  App.reapplyExport = (text, name) => importPc(text, name, { quiet: true });      // an export opened earlier this session, applied once the data file that is now open is the starting point (setSeason)
  function showWarn(list, go, cancel) {
    const lines = list.slice(0, 8).map(c => '<li><b>' + esc(Model.fullName(c.person)) + '</b>: ' + esc(c.col) + ' &rarr; ' + esc(c.to) + '</li>').join('');
    $('warnBody').innerHTML = '<h2>&#9888; ' + list.length + ' CHANGE' + (list.length === 1 ? '' : 'S') + ' STILL NEED TO BE MADE IN PLANNING CENTER</h2>' +
      '<ul>' + lines + '</ul>' + (list.length > 8 ? '<p>&hellip;and ' + (list.length - 8) + ' more.</p>' : '') +
      '<a href="#" class="lnk" id="warnLink">Open the &ldquo;Changes needed in Planning Center&rdquo; report</a>' +
      '<p>They stay recorded in the data file and clear themselves when a later export matches.</p>' +
      '<div class="dlgbtns"><button id="warnCancel">Cancel</button><button id="warnGo" class="primary">Save anyway</button></div>';
    $('warn').hidden = false;
    $('warnCancel').onclick = () => { $('warn').hidden = true; if (cancel) cancel(); };
    $('warnGo').onclick = () => { $('warn').hidden = true; go(); };
    $('warnLink').onclick = e => { e.preventDefault(); $('warn').hidden = true; sel.value = 'pcChanges'; showTab('reports'); };
  }
  // Every save or export goes through here, so the red Planning Center warning shows whatever is being saved.
  function guardedSave(go, cancel) {
    const list = master ? Model.pendingChanges(master) : [];
    if (list.length) showWarn(list, go, cancel); else go();
  }
  // ---------- import review ----------
  const pname = p => Model.fullName(p);      // the same name as everywhere else (model.js)
  function showReview() {
    const { plan, name } = pending;
    const withChanges = plan.matched.filter(m => m.changes.length);
    const important = withChanges.filter(m => m.changes.some(c => c.important));
    let h = '<h2 style="margin-top:0">Review import: ' + esc(name) + '</h2>' +
      '<p>' + plan.matched.length + ' matched · ' + plan.added.length + ' new · ' + plan.missing.length + ' missing · ' +
      plan.renames.length + ' possible renames · ' + withChanges.length + ' with field changes. Nothing is applied until you click Apply.</p>';
    // Room, grade and birthdate under each name: brothers and sisters share a last name, so the names alone cannot tell a rename from a different child.
    const who = (p, room) => esc(pname(p)) + '<br><small>' + [room, p[C.GRADE] ? 'grade ' + p[C.GRADE] : '', p[C.BDAY] ? 'born ' + p[C.BDAY] : ''].filter(Boolean).map(esc).join(' &middot; ') + '</small>';
    if (plan.renames.length) h += '<h3>Possible renames (same person?)</h3><table><tr><th>Same person</th><th>In master</th><th>In new export</th><th>Why</th></tr>' +
      plan.renames.map((r, i) => '<tr><td><input type="checkbox" data-rn="' + i + '"' + (r.accept ? ' checked' : '') + '></td><td>' + who(r.person, Model.room(r.person)) + '</td><td>' + who(r.rec, r.rec[C.ROOM]) + '</td><td>' + esc(r.reason) + (r.accept ? '' : ' (birthdates differ or the names are not close: not ticked)') + '</td></tr>').join('') + '</table>' +
      '<p class="status">Unchecked: the new row is added as a new person and the old one is marked inactive (an old inactive record is left alone).</p>';
    if (plan.added.length) h += '<h3>New people</h3><table><tr><th>Add</th><th>Name</th><th>Class</th><th>Role</th></tr>' +
      plan.added.map((r, i) => '<tr><td><input type="checkbox" data-ad="' + i + '" checked></td><td>' + esc(pname(r)) + '</td><td>' + esc(r[C.ROOM]) + '</td><td>' + esc(r[C.SELECTION]) + '</td></tr>').join('') + '</table>';
    if (plan.missing.length) h += '<h3>In master but not in the new export</h3><table><tr><th>Mark inactive</th><th>Name</th><th>Class</th></tr>' +
      plan.missing.map((p, i) => '<tr><td><input type="checkbox" data-ms="' + i + '" checked></td><td>' + esc(pname(p)) + '</td><td>' + esc(Model.room(p)) + '</td></tr>').join('') + '</table>';
    const resolved = plan.matched.reduce((n, m) => n + m.resolved.length, 0);
    const dropped = plan.matched.reduce((n, m) => n + m.superseded.length, 0);
    if (dropped) h += '<p><b>' + dropped + ' pending change(s) of yours</b> that Planning Center now contradicts were decided on the Needs your decision screen. They are marked in the field changes below.</p>';
    if (resolved) h += '<p>' + resolved + ' pending Planning Center change(s) are now reflected in the export and will clear.</p>';
    const reactive = plan.matched.filter(m => m.reactivateAuto), kept = plan.matched.filter(m => m.reactivate && !m.reactivateAuto);
    if (reactive.length) h += '<h3>Reappearing (will be set active)</h3><p>' + reactive.map(m => esc(pname(m.person))).join(', ') + '</p>';
    if (kept.length) h += '<h3>Marked inactive by you, still in Planning Center</h3><table><tr><th>Make active again</th><th>Name</th><th>Class</th></tr>' +
      kept.map((m, i) => '<tr><td><input type="checkbox" data-re="' + i + '"></td><td>' + esc(pname(m.person)) + '</td><td>' + esc(Model.room(m.person)) + '</td></tr>').join('') + '</table>' +
      '<p class="status">Left unticked they stay inactive. Planning Center still lists them (a cancelled or duplicate registration stays in the export).</p>';
    if (withChanges.length) {
      h += '<h3>Field changes from Planning Center</h3><details' + (important.length ? ' open' : '') + '><summary>' + withChanges.length + ' people (' + important.length + ' with changes to name, room, medical, contact or grade)</summary><table>' +
        withChanges.map(m => '<tr><td>' + esc(pname(m.person)) + '</td><td>' + m.changes.map(c => '<div class="chg' + (c.important ? '' : ' minor') + '">' +
          (c.important ? '<b>' + esc(c.col) + '</b>' : esc(c.col)) + ': ' + esc(c.from.slice(0, 60)) + ' &rarr; ' + esc(c.to.slice(0, 60)) +
          (m.person['ov:' + c.col] ? ' <span class="ovmark">' + (m.superseded.includes(c.col) ? '(your pending change to ' + esc(m.person['ov:' + c.col].slice(0, 40)) + ' conflicts: Planning Center now says something else)' : '(you have a pending change here)') + '</span>' : '') + '</div>').join('') + '</td></tr>').join('') + '</table></details>';
    }
    h += '<div class="dlgbtns"><button id="rvCancel">Cancel</button><button id="rvApply" class="primary">Apply import</button></div>';
    $('reviewBody').innerHTML = h; $('review').hidden = false;
    $('rvCancel').onclick = () => { $('review').hidden = true; pending = null; if (lastPc) lastPc.declined = true; };      // declined: a data file opened later must not quietly apply this export after all
    $('rvApply').onclick = applyReview;
  }
  function applyReview() { return App.commitScope ? App.commitScope(applyReviewNow) : applyReviewNow(); }
  function applyReviewNow() {
    const q = sel => [...$('reviewBody').querySelectorAll(sel)];
    const pick = (attr, list) => new Set(q('[' + attr + ']').filter(c => c.checked).map(c => list[+c.getAttribute(attr)]));
    const { plan } = pending;
    applyDecided({
      rename: pick('data-rn', plan.renames), add: pick('data-ad', plan.added), deactivate: pick('data-ms', plan.missing),
      reactivate: pick('data-re', plan.matched.filter(m => m.reactivate && !m.reactivateAuto).map(m => m.person)), keep: pending.keep,
    });
  }
  // The one place an import is written to the file: the review's decisions (or none, when the review was not needed) and the Keep mine choices.
  function applyDecided(decisions) {
    const { plan, name, rx, text } = pending, had = new Set(master.people.map(p => p[X.ID]));
    const res = Model.applyPlan(master, plan, decisions, today());
    stampExport(name, rx, res, text);
    $('review').hidden = true; $('conflicts').hidden = true; pending = null; logImport(name); updateStatus(); refresh();
    recordImport(name, lastPc && lastPc.name === name ? lastPc.text : '', res, new Set(master.people.map(p => p[X.ID]).filter(id => !had.has(id))));
    App.ask.alert('Import applied: ' + res.updated + ' refreshed, ' + res.added + ' added, ' + res.renamed + ' renamed, ' + res.deactivated + ' marked inactive, ' + res.resolved + ' pending PC changes cleared' +
      (res.superseded ? ', ' + res.superseded + ' replaced by the Planning Center value' : '') + (res.kept ? ', ' + res.kept + ' kept as your pending change (Planning Center still says otherwise)' : '') + '. Remember to download the data file.');
  }

  // ---------- needs your decision: a pending change of yours that Planning Center now contradicts ----------
  const conflictRows = plan => plan.matched.filter(m => m.superseded.length);
  // Anything else the review dialog has to show (a rename, a new or missing person, a returning child, an important field change).
  const needsMoreReview = plan => plan.added.length || plan.missing.length || plan.renames.length || plan.matched.some(m => m.reactivate || m.changes.some(c => c.important));
  function showConflicts() {
    const { plan, name } = pending, rows = conflictRows(plan), more = needsMoreReview(plan);
    const idCols = [C.REG, C.FIRST, C.LAST, C.GRADE, C.BDAY, C.ROOM];
    let h = '<h2 style="margin-top:0">Needs your decision: ' + esc(name) + '</h2>' +
      '<p>' + rows.length + ' child' + (rows.length === 1 ? '' : 'ren') + ' with a pending change of yours that Planning Center now says differently. Each conflicting field is highlighted. <b>Use Planning Center</b> (the default) takes its value and drops your change. <b>Keep mine</b> takes its value into the file but keeps your change pending, so the red warning still lists it until Planning Center matches it.</p>';
    rows.forEach((m, i) => {
      h += '<section class="cf-row"><h3>' + esc(pname(m.person)) + '</h3><table class="roster"><thead><tr><th>Field</th><th>In the file</th><th>Planning Center</th><th>Your pending change</th><th>Choose</th></tr></thead><tbody>' +
        idCols.map(c => '<tr><td>' + esc(c) + '</td><td>' + esc(m.person[c] || '') + '</td><td>' + esc(m.rec[c] || '') + '</td><td></td><td></td></tr>').join('') +
        m.superseded.map((c, j) => '<tr class="cf-conflict"><td><b>' + esc(c) + '</b></td><td>' + esc(m.person[c] || '') + '</td><td>' + esc(m.rec[c] || '') + '</td><td>' + esc(m.person['ov:' + c] || '') + '</td>' +
          '<td><label><input type="radio" name="cf-' + i + '-' + j + '" value="pc" checked> Use Planning Center</label><br><label><input type="radio" name="cf-' + i + '-' + j + '" value="mine"> Keep mine</label></td></tr>').join('') +
        '</tbody></table></section>';
    });
    h += '<div class="dlgbtns"><button id="cfCancel">Cancel</button><button id="cfNext" class="primary">' + (more ? 'Next' : 'Apply import') + '</button></div>';
    $('conflictsBody').innerHTML = h; $('conflicts').hidden = false;
    $('cfCancel').onclick = () => { $('conflicts').hidden = true; pending = null; if (lastPc) lastPc.declined = true; };      // same as the review: a later open must not quietly apply this export
    $('cfNext').onclick = () => {
      rows.forEach((m, i) => m.superseded.forEach((c, j) => {
        const v = $('conflictsBody').querySelector('input[name="cf-' + i + '-' + j + '"]:checked');
        if (v && v.value === 'mine') { if (!pending.keep.has(m.person)) pending.keep.set(m.person, new Set()); pending.keep.get(m.person).add(c); }
      }));
      $('conflicts').hidden = true;
      if (more) showReview();
      else App.commitScope ? App.commitScope(() => applyDecided({ rename: new Set(), add: new Set(), deactivate: new Set(), reactivate: new Set(), keep: pending.keep })) : applyDecided({ rename: new Set(), add: new Set(), deactivate: new Set(), reactivate: new Set(), keep: pending.keep });
    };
  }

  // ---------- modal panels (Planning Center review, red warning, the first-screen file picker) ----------
  // While one is showing, everything else on the page is inert (not clickable, not reachable with Tab), focus moves into it, Esc presses its Cancel, and focus goes back to where it was when it closes.
  const MODALS = { conflicts: ['Needs your decision', 'cfCancel'], review: ['Review import', 'rvCancel'],warn: ['Warning', 'warnCancel'], splash: ['Open your files', 'splashSkip'], lockAsk: ['Lock this quarter?', 'lockAskCancel'] }, modalOpener = {};
  function syncModal(el) {
    const info = MODALS[el.id]; if (!info) return;
    const open = !el.hidden, others = [...document.body.children].filter(c => c !== el && c.tagName !== 'SCRIPT' && !c.classList.contains('modal-wrap') && c.id !== 'splash' && c.id !== 'dlg' && c.id !== 'ask' && c.id !== 'doneFlash');
    if (open) {
      modalOpener[el.id] = document.activeElement; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', info[0]);
      others.forEach(c => { c.inert = true; });
      const f = el.querySelector('input:not([hidden]),button,select,textarea,a[href]'); if (f) setTimeout(() => f.focus({ preventScroll: true }), 0);
    } else if (!document.querySelector('#review:not([hidden]),#warn:not([hidden]),#splash:not([hidden]),#lockAsk:not([hidden])')) {
      others.forEach(c => { c.inert = false; });
      const back = modalOpener[el.id]; if (back && back.isConnected && back !== document.body) back.focus({ preventScroll: true });
    }
  }
  const modalWatch = new MutationObserver(list => list.forEach(m => syncModal(m.target)));
  Object.keys(MODALS).forEach(id => { const el = document.getElementById(id); if (el) { modalWatch.observe(el, { attributes: true, attributeFilter: ['hidden'] }); syncModal(el); } });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const open = Object.keys(MODALS).find(id => { const el = document.getElementById(id); return el && !el.hidden; });
    if (open) { const b = document.getElementById(MODALS[open][1]); if (b) { e.preventDefault(); b.click(); } }
  });
  // Tab wraps inside an open dialog: with the page behind it inert, Tab off the last control would otherwise leave the page for the browser's own toolbar (and Shift+Tab off the first).
  document.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const open = Object.keys(MODALS).find(id => { const el = document.getElementById(id); return el && !el.hidden; }); if (!open) return;
    const box = document.getElementById(open), f = [...box.querySelectorAll('input,button,select,textarea,a[href]')].filter(x => !x.disabled && !x.closest('[hidden]') && x.offsetParent && x.tabIndex >= 0);
    if (!f.length) return;
    const at = document.activeElement, out = !box.contains(at);
    if (e.shiftKey ? (out || at === f[0]) : (out || at === f[f.length - 1])) { e.preventDefault(); f[e.shiftKey ? f.length - 1 : 0].focus(); }
  });
  // A bare input or select inside a table cell (roster flags, uniforms, calendar, rotation) gets a spoken name: its column heading and the row's first text. Screen readers announce the heading when you move by cell, but not when you Tab in.
  const nameCells = () => {
    // A table with one row and no heading cells is a list item laid out in columns (a To do item, an award), not data: a screen reader should not announce "table, 1 row, 5 columns" for each.
    document.querySelectorAll('main table:not([role])').forEach(t => { if (t.rows.length === 1 && !t.querySelector('th')) t.setAttribute('role', 'presentation'); });
    document.querySelectorAll('main td input:not([aria-label]):not([type=hidden]):not([type=file]), main td select:not([aria-label]), main td textarea:not([aria-label])').forEach(e => {
      if (e.title || (e.labels && e.labels.length) || e.closest('label')) return;
      const td = e.closest('td'), tr = td.parentElement, tb = tr.closest('table'), cellText = c => { const f = c.querySelector('input[type=text],textarea'); return (f ? f.value : c.querySelector('button,select') ? '' : c.textContent).trim().slice(0, 40); };
      if (!tb.tHead && tr === tb.rows[0]) { e.setAttribute('aria-label', 'Column heading'); return; }      // rotation: its headings are the first row of inputs
      const th = tb.tHead && tb.tHead.rows[0] ? tb.tHead.rows[0].cells[td.cellIndex] : (!tb.tHead ? tb.rows[0].cells[td.cellIndex] : null);
      const col = th ? (th.tagName === 'TH' ? th.textContent.trim().replace(/\s+/g, ' ').slice(0, 40) : cellText(th)) : '', row = [...tr.cells].filter(c => c !== td).map(cellText).find(Boolean) || '';
      const name = [col, row].filter(Boolean).join(', '); if (name) e.setAttribute('aria-label', name);
    });
  };
  let nameTimer = 0; new MutationObserver(() => { clearTimeout(nameTimer); nameTimer = setTimeout(nameCells, 150); }).observe(document.querySelector('main'), { childList: true, subtree: true });

  // ---------- tabs ----------
  // "Color team games" is one tab with two views (Game results, Color teams). showTab('teams') opens that tab on the Color teams view, so every old link still works.
  // The Progress, Attendance and Awards sub-tabs of the Person tab save at once (with Undo), like the tabs they mirror; only Registration (Planning Center and roster fields) is held until Apply.
  const viewOf = (tab, sub) => tab === 'games' && sub === 'teams' ? 'teams' : tab === 'person' && App.personSub && App.personSub() !== 'registration' ? 'personlive' : tab;
  function showTab(name, wantSub) {
    const asked = [name, wantSub]; let sub = App.sub;
    if (name === 'teams') { name = 'games'; sub = 'teams'; } else if (name === 'games' && wantSub) sub = wantSub;
    if (viewOf(name, sub) !== viewOf(App.tab, App.sub) && App.resolveDraft && !App.resolveDraft(() => showTab(asked[0], asked[1]))) return;       // changes held on this tab are applied or discarded (or you stay) before you leave it; the answer opens the tab you asked for
    App.tab = name; App.sub = sub;
    const teamsView = name === 'games' && sub === 'teams';
    $('subGames').hidden = teamsView; $('subTeams').hidden = !teamsView;
    document.querySelectorAll('.subtabs button').forEach(x => { const on = x.dataset.sub === sub; x.classList.toggle('on', on); x.setAttribute('aria-selected', on ? 'true' : 'false'); x.tabIndex = on ? 0 : -1; });
    document.querySelectorAll('.tabs button[data-tab]').forEach(x => { const on = x.dataset.tab === name; x.classList.toggle('on', on); x.setAttribute('aria-selected', on ? 'true' : 'false'); x.tabIndex = on ? 0 : -1; });
    document.querySelectorAll('main > section[id^="tab-"]').forEach(s => { s.hidden = s.id !== 'tab-' + name; });
    if (name === 'validate' || name === 'debug') { const ob = document.querySelector('.tabs button[data-tab="options"]'); ob.classList.add('on'); ob.setAttribute('aria-selected', 'true'); }      // Validate and Debug are pages of Options
    markMore(name); $('tabMenuLabel').textContent = document.querySelector('.tabs button[data-tab="' + name + '"]').firstChild.textContent.trim(); setTabMenu(false);
    if (name === 'roster') renderRoster();
    if (name === 'reports') renderReport();
    if (teamsView) renderTeams();
    if (name === 'uniforms') renderUniforms();
    if (name === 'calendar') renderCalendar();
    if (App.tabs[name]) App.tabs[name]();
    if (App.drawDraftBar) App.drawDraftBar();
    if (App.trail) App.trail.arrived();
  }
  // On a phone the tab strip is a menu (CSS hides it until .open); the menu button shows the current tab and the To do count.
  const openGroup = g => document.querySelectorAll('.tabgrp').forEach(x => { const on = x === g; x.classList.toggle('open', on); x.firstElementChild.setAttribute('aria-expanded', on ? 'true' : 'false'); });
  // Clicking a top-level tab opens it at its top (the page keeps its scroll position across tabs, so a tab could open scrolled past its start), including a tab you are already on.
  // The page scroller: on a desktop <main> scrolls under the fixed header; on a phone the window does.
  const deskScroll = () => window.matchMedia('(min-width: 761px)').matches ? document.querySelector('main') : null;
  App.pageScroll = { y: () => { const m = deskScroll(); return m ? m.scrollTop : window.scrollY; }, to: y => { const m = deskScroll(); if (m) m.scrollTop = y; else window.scrollTo(0, y); } };
  function scrollToTop() { App.pageScroll.to(0); const sc = document.querySelector('main > section:not([hidden]) .scroll'); if (sc) sc.scrollTop = 0; }
  function setTabMenu(open) {
    $('tabsNav').classList.toggle('open', open); $('tabMenu').setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) openGroup(document.querySelector('.tabs button.on').closest('.tabgrp'));     // opens on the group of the tab you are on
  }
  document.querySelectorAll('.grphead').forEach(h => {
    const flip = () => { const g = h.parentElement; openGroup(g.classList.contains('open') ? null : g); };
    h.addEventListener('click', flip); h.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
  });
  $('tabMenu').addEventListener('click', e => { e.stopPropagation(); setTabMenu(!$('tabsNav').classList.contains('open')); });
  document.addEventListener('click', e => { if (!e.target.closest('#tabsNav')) setTabMenu(false); });
  // N9 point 8: a chip in the top bar while this browser is offline (plain words; the Drive save sentence says the rest).
  const setOnline = () => { const c = document.getElementById('offlineChip'); if (c) c.hidden = navigator.onLine !== false; };
  window.addEventListener('online', setOnline); window.addEventListener('offline', setOnline); setOnline();
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('tabsNav').classList.contains('open')) { setTabMenu(false); $('tabMenu').focus(); } });
  { const st = $('stickyTop'); let last = -1; const sync = () => { const h = st.offsetHeight; if (h !== last) { last = h; document.documentElement.style.setProperty('--stickyh', h + 'px'); } }; sync(); window.addEventListener('resize', sync); window.addEventListener('scroll', sync, { passive: true }); if (window.ResizeObserver) new ResizeObserver(sync).observe(st); }      // the sticky title bar and tabs (desktop): the height other sticky things sit under; checked on resize, on scroll (the headings only matter once the page is scrolled) and when the bar changes size
  { const o = { childList: true, characterData: true, subtree: true }, mo = new MutationObserver(() => { const t = +$('todoBadge').textContent || 0, a = +$('awardsBadge').textContent || 0, sum = t + a, words = sum ? t + ' to do, ' + a + ' award' + (a === 1 ? '' : 's') + ' to announce' : ''; ['tabMenuBadge', 'tonightBadge'].forEach(id => { const b = $(id); b.textContent = sum || ''; if (words) { b.title = words; b.setAttribute('aria-label', words); } else { b.removeAttribute('title'); b.removeAttribute('aria-label'); } }); });      /* the menu badge adds To do and Awards, so it says so (UX-27) */ mo.observe($('todoBadge'), o); mo.observe($('awardsBadge'), o); }
  document.querySelectorAll('.subtabs button').forEach(b => b.addEventListener('click', () => showTab('games', b.dataset.sub)));
  document.querySelectorAll('.tabs button[data-tab]').forEach(b => { b.setAttribute('role', 'tab'); b.setAttribute('aria-controls', 'tab-' + b.dataset.tab); b.addEventListener('click', () => { showTab(b.dataset.tab); if (App.tab === b.dataset.tab) scrollToTop(); }); });
  document.querySelectorAll('main > section[id^="tab-"]').forEach(s => s.setAttribute('role', 'tabpanel'));
  document.querySelector('.tabs').setAttribute('role', 'tablist');
  // Arrow keys, Home and End move between tabs like a native tab list; focus follows only if the tab really changed (a held draft can keep you on this one).
  // The More menu (desktop): the tabs marked .moretab are listed in a small menu under the More button; picking one opens it like any tab. The button itself shows "More: Debug" while one of them is open.
  // The File menu: one full menu under the arrow beside the Save button (the Save button itself saves, where saving goes now). App.fileMenu (app-drive.js) writes the items: Import first, a separator, then Save and where it goes.
  // With no Google Drive set up (app-drive.js is inactive) the menu is just these two.
  const BASIC_FILE_MENU = '<div class="smhead">Import</div><button type="button" role="menuitem" data-fm="imp-local"><span class="tick"></span>Import from this computer\u2026</button><button type="button" role="menuitem" data-fm="imp-merge"><span class="tick"></span>Merge a data file\u2026</button><hr><div class="smhead">Save</div><button type="button" role="menuitem" data-fm="save"><span class="tick"></span>Download data file (now)</button>';
  function setFile(open) {
    const m = $('fileMenu'), b = $('btnFile'); if (!m || !b) return;
    if (open) m.innerHTML = App.fileMenu ? App.fileMenu.html() : BASIC_FILE_MENU;
    m.hidden = !open; b.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) { const r = $('btnSeasonSave').getBoundingClientRect(); m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.left)) + 'px'; m.style.top = (r.bottom + 4) + 'px'; const f = m.querySelector('button'); if (f) f.focus(); }
  }
  $('btnFile').addEventListener('click', e => { e.stopPropagation(); setFile($('fileMenu').hidden); });
  $('fileMenu').addEventListener('click', e => { const b = e.target.closest('[data-fm]'); if (!b) return; setFile(false); if (App.fileMenu) App.fileMenu.pick(b.dataset.fm); else if (b.dataset.fm === 'imp-local') $('fileAny').click(); else if (b.dataset.fm === 'imp-merge') $('fileMerge').click(); else if (b.dataset.fm === 'save') $('btnSeasonSave').click(); });
  document.addEventListener('click', e => { if (!$('fileMenu').hidden && !e.target.closest('#fileMenu, #btnFile')) setFile(false); });
  document.addEventListener('keydown', e => {
    const m = $('fileMenu'); if (m.hidden) return; const items = [...m.querySelectorAll('button')], i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { setFile(false); $('btnFile').focus(); } else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); } else if (e.key === 'Tab') setFile(false);
  });
  App.openFileMenu = setFile;
  // What the (i) beside the bar says first: the file, the Planning Center data, where it saves to and when it was last saved (the bar itself shows only unsaved changes).
  App.liveTip = { fileInfo: () => ['driveStatus', 'status', 'seasonStatus', 'autoStatus'].map(id => { const el = $(id); return el && !el.hidden ? (el.title && id === 'seasonStatus' ? el.title : el.textContent).trim() : ''; }).concat([App.pcNeedHidden ? App.pcNeedHidden() : '']).filter(Boolean).join('\n') };
  const MORE = () => [...document.querySelectorAll('.tabs button.moretab')];
  function setMore(open) {
    const m = $('moreMenu'), b = $('tabMore'); if (!m || !b) return;
    if (open) { m.innerHTML = MORE().map(x => '<button type="button" role="menuitem" data-moretab="' + x.dataset.tab + '"' + (x.classList.contains('on') ? ' class="on" aria-current="true"' : '') + '>' + esc(x.firstChild.textContent.trim()) + '</button>').join(''); const r = b.getBoundingClientRect(); m.style.top = Math.round(r.bottom + 2) + 'px'; m.style.right = Math.max(8, Math.round(window.innerWidth - r.right)) + 'px'; m.style.left = 'auto'; }
    m.hidden = !open; b.setAttribute('aria-expanded', open ? 'true' : 'false'); if (open) { const f = m.querySelector('button.on') || m.querySelector('button'); if (f) f.focus(); }
  }
  $('tabMore').addEventListener('click', e => { e.stopPropagation(); setMore($('moreMenu').hidden); });
  $('moreMenu').addEventListener('click', e => { const b = e.target.closest('button[data-moretab]'); if (!b) return; setMore(false); showTab(b.dataset.moretab); if (App.tab === b.dataset.moretab) scrollToTop(); const t = $('tabMore'); t.focus(); });
  $('moreMenu').addEventListener('keydown', e => { const items = [...$('moreMenu').querySelectorAll('button')], at = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); setMore(false); $('tabMore').focus(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus(); }
    else if (e.key === 'Tab') setMore(false); });
  document.addEventListener('click', e => { if (!e.target.closest('#moreMenu, #tabMore')) setMore(false); });
  function markMore(name) { const b = $('tabMore'); if (!b) return; const hit = MORE().find(x => x.dataset.tab === (name === 'validate' || name === 'debug' ? 'options' : name));b.classList.toggle('on', !!hit); b.firstChild.textContent = hit ? 'More: ' + hit.firstChild.textContent.trim() + ' ' : 'More '; }
  const roving = (list, pick) => e => {
    const at = list().indexOf(document.activeElement), step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (at < 0 || !(step || e.key === 'Home' || e.key === 'End')) return; e.preventDefault();
    const items = list(), n = e.key === 'Home' ? items[0] : e.key === 'End' ? items[items.length - 1] : items[(at + step + items.length) % items.length];
    pick(n); if (n.getAttribute('aria-selected') === 'true') n.focus();
  };
  document.querySelector('.tabs').addEventListener('keydown', roving(() => [...document.querySelectorAll('.tabs button')].filter(x => x.offsetParent !== null), n => { if (n.id === 'tabMore') { n.focus(); return; } showTab(n.dataset.tab); if (App.tab === n.dataset.tab) scrollToTop(); }));
  document.querySelector('.subtabs').addEventListener('keydown', roving(() => [...document.querySelectorAll('.subtabs button')], n => showTab('games', n.dataset.sub)));
  document.querySelectorAll('.tabs button[data-tab]').forEach(b => { b.id = 'tabbtn-' + b.dataset.tab; });
  document.querySelectorAll('main > section[id^="tab-"]').forEach(s => s.setAttribute('aria-labelledby', 'tabbtn-' + s.id.slice(4)));
  document.querySelectorAll('.subtabs button').forEach(b => { b.id = 'subbtn-' + b.dataset.sub; b.setAttribute('aria-controls', b.dataset.sub === 'teams' ? 'subTeams' : 'subGames'); });
  [['subGames', 'subbtn-games'], ['subTeams', 'subbtn-teams']].forEach(([p, b]) => { $(p).setAttribute('role', 'tabpanel'); $(p).setAttribute('aria-labelledby', b); });

  document.querySelectorAll('.tabs button').forEach(x => { const on = x.classList.contains('on'); x.setAttribute('aria-selected', on ? 'true' : 'false'); x.tabIndex = on ? 0 : -1; });

  // ---------- roster ----------
  const knownRooms = () => [...new Set(Model.ROOM_ORDER.concat((master ? master.people : []).map(Model.room)))].filter(r => r !== 'Unassigned');
  function fillRoomFilter() {
    const sel = $('fRoom'), cur = sel.value;
    sel.innerHTML = '<option value="">All classes</option>' + knownRooms().filter(r => !master || master.people.some(p => Model.room(p) === r)).map(r => '<option>' + esc(r) + '</option>').join('');
    sel.value = cur;
  }
  // ---- Roster: sort and filter by column ----
  // Click a column heading to sort by it (again for the other direction, a third time to go back to class and name order). The row under the headings filters by each column. Room and Role are the same
  // filters as in the bar above. Nothing here is saved; it only changes what is listed.
  const rs = { sort: '', dir: 1, f: {} };
  // The color a child has in a quarter once team moves are counted (Teams.effective): a move replaces the roster color, from the first club night on or from its own date. Without a data file it is the roster color.
  const teamEff = (p, q) => { const h = App.teamHistory && App.teamHistory(); return Teams.effective(p, q, h ? h(p) : undefined); };
  // Beside the Roster's team picker (which edits the quarter's roster color): what the child actually has when a move changes it, so the Roster never contradicts the Color teams grid.
  const teamNowHtml = (p, q) => {
    const e = teamEff(p, q), base = p['team:' + q] || ''; if (!e.color || (e.color === base && !e.moved.length)) return '';
    const why = e.replaced ? 'Moved to ' + e.color + ' from the first club night of ' + q + ': the roster color' + (base ? ' (' + base + ')' : '') + ' was never played.' : 'Now ' + e.color + (e.moved.length ? ' (moved from ' + Model.md(e.moved[e.moved.length - 1].from) + ')' : '') + '.';
    return ' <span class="team team-' + esc(e.color) + ' tgnow" title="' + esc(why) + '">&rarr; ' + esc(e.color) + '</span>';
  };
  const rosterCols = () => [
    { k: 'first', label: 'First', val: p => Model.eff(p, C.FIRST) }, { k: 'last', label: 'Last', val: p => Model.eff(p, C.LAST) },
    { k: 'role', label: 'Role', val: p => Model.isVolunteer(p) ? 'Volunteer' : 'Clubber' }, { k: 'room', label: 'Class', val: p => Model.room(p) },
    { k: 'grade', label: 'Grade', val: p => Model.eff(p, C.GRADE) },
    { k: 'team', label: settings.quarter + ' team', val: p => Model.hasColorTeams(Model.groupOf(Model.room(p))) ? teamEff(p, settings.quarter).color : '' },      // the effective color (a move replaces the roster color), so sort and filter agree with the grid
    { k: 'nophotos', label: 'No photos', val: p => Model.noPhotos(p) ? 'Yes' : 'No' }, { k: 'active', label: 'Active', val: p => Model.isActive(p) ? 'Yes' : 'No' },
    { k: 'notes', label: 'Notes', val: p => p[X.NOTES] || '' },
  ];
  const textCmp = (x, y) => String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' });
  function visiblePeople() {
    if (!master) return [];
    const q = $('fSearch').value.trim().toLowerCase(), room = $('fRoom').value, role = $('fRole').value, mode = $('fInactive').value || 'active', cols = rosterCols(), byKey = Object.fromEntries(cols.map(c => [c.k, c]));
    let list = master.people.filter(p =>
      (mode === 'all' || (mode === 'active') === Model.isActive(p)) && (!room || Model.room(p) === room) &&
      (role === '' || (role === 'vol') === Model.isVolunteer(p)) && (!q || Model.fullName(p).toLowerCase().includes(q))
    ).sort(Model.byRoomThenName);
    Object.keys(rs.f).forEach(k => {
      const want = rs.f[k], c = byKey[k]; if (!want || !c || k === 'room' || k === 'role' || k === 'active') return;
      if (['team', 'nophotos'].includes(k)) list = list.filter(p => want === 'none' ? !c.val(p) : c.val(p) === want);
      else list = list.filter(p => String(c.val(p)).toLowerCase().includes(want.toLowerCase()));
    });
    const sc = byKey[rs.sort];
    if (sc) {
      const TEAM_ORDER = App.teamColors(), key = p => sc.k === 'room' ? Model.roomRank(Model.room(p)) : sc.k === 'team' ? (TEAM_ORDER.indexOf(sc.val(p)) < 0 ? 9 : TEAM_ORDER.indexOf(sc.val(p))) : sc.val(p);
      list = list.map((p, n) => ({ p, n, k: key(p) })).sort((x, y) => (typeof x.k === 'number' ? x.k - y.k : textCmp(x.k, y.k)) * rs.dir || x.n - y.n).map(x => x.p);
    }
    return list;
  }
  // Redraw a container while keeping the keyboard focus. The focused control is found again by what identifies it (id, name/value, its data-* attributes, and the table row it was in); if it is gone
  // (its row was removed) focus goes to the nearest control of the same kind, never back to the top of the page. Every tab's content area is wrapped this way (see autoKeepFocus), so no redraw can
  // throw a keyboard user out of the table they are working in.
  function esc2(v) { return CSS.escape(String(v)); }
  function focusSig(el, root) {
    const attrs = [...el.attributes].filter(x => x.name.startsWith('data-') || x.name === 'name' || (x.name === 'value' && /^(radio|checkbox)$/.test(el.type))).map(x => '[' + x.name + '="' + esc2(x.value) + '"]').join('');
    const tr = el.closest('tr'), ctx = tr ? [...tr.attributes].filter(x => x.name.startsWith('data-')).map(x => '[' + x.name + '="' + esc2(x.value) + '"]').join('') : '';
    const base = el.tagName.toLowerCase() + (el.type && el.tagName === 'INPUT' ? '[type="' + el.type + '"]' : '') + attrs;
    const same = [...root.querySelectorAll(base)], idx = same.indexOf(el);
    return { id: el.id, base, ctx: tr && ctx ? 'tr' + ctx : '', idx, n: same.length, sx: typeof el.selectionStart === 'number' ? [el.selectionStart, el.selectionEnd] : null, hasAttrs: !!attrs };
  }
  function keepFocus(root, redraw) {
    const el = document.activeElement, inside = el && el !== root && root.contains(el), sig = inside ? focusSig(el, root) : null;
    redraw();
    if (!sig) return;
    const ok = x => x && !x.disabled && !x.hidden && x.offsetParent !== null;
    let n = sig.id ? document.getElementById(sig.id) : null;
    if (!ok(n) && sig.hasAttrs) {
      if (sig.ctx) n = root.querySelector(sig.ctx + ' ' + sig.base);
      if (!ok(n)) { const all = [...root.querySelectorAll(sig.base)].filter(ok); n = all[Math.min(Math.max(sig.idx, 0), all.length - 1)] || null; }      // the row is gone: the nearest one that is left
    }
    if (ok(n)) { n.focus({ preventScroll: true }); if (sig.sx && n.setSelectionRange) try { n.setSelectionRange(sig.sx[0], sig.sx[1]); } catch (e) { /* not a text box */ } }
  }
  // Make setting innerHTML on these elements keep the focus. The setter is replaced on the element itself, so the render code does not change.
  function autoKeepFocus(el) {
    if (!el || el.__keepsFocus) return; const d = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    // A text box commits its "change" when you leave it (Tab, or a click elsewhere), before focus has moved. Redrawing right then removes the control Tab was heading for, so for that one case the
    // redraw waits a tick, until focus has landed. Everything else (a tick, a select, a button) redraws at once.
    Object.defineProperty(el, 'innerHTML', { get() { return d.get.call(this); }, set(v) {
      const a = document.activeElement, ev = window.event, leaving = ev && ev.type === 'change' && a && (a === document.body || (this.contains(a) && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !/^(checkbox|radio|date|button|submit|file|range|color)$/.test(a.type)))));      // focus is between boxes (body) or still in the box being left
      if (leaving) setTimeout(() => keepFocus(this, () => d.set.call(this, v)), 0); else keepFocus(this, () => d.set.call(this, v));
    }, configurable: true }); el.__keepsFocus = true;
  }
  ['rosterWrap', 'todoWrap', 'storeWrap', 'personWrap', 'attDateWrap', 'attendWrap', 'gameDateWrap', 'gamesWrap', 'teamsWrap', 'awardsWrap', 'progressWrap', 'historyWrap', 'uniWrap', 'calWrap', 'statsWrap', 'optionsWrap', 'draftBar'].forEach(id => autoKeepFocus(document.getElementById(id)));
  { const dlg = document.getElementById('dlg'), d = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');      // the native dialog is named after its heading
    if (dlg) Object.defineProperty(dlg, 'innerHTML', { get() { return d.get.call(this); }, set(v) { d.set.call(this, v); const h = this.querySelector('h3'); this.setAttribute('aria-label', h ? h.textContent : 'Dialog'); }, configurable: true }); }
  App.keepFocus = keepFocus;
  // A short message for something that was refused (error) or that you should look at (warn). It is announced to screen readers, stays about 8 seconds, and a click dismisses it.
  let flashTimer = 0;
  App.flash = (text, level) => {
    let f = document.getElementById('flash'); if (!f) { f = document.createElement('div'); f.id = 'flash'; f.setAttribute('role', 'alert'); f.title = 'Click to dismiss'; f.onclick = () => { f.hidden = true; }; document.body.appendChild(f); }
    f.className = 'flash ' + (level === 'error' ? 'bad' : 'warn'); f.textContent = (level === 'error' ? 'Not saved: ' : '') + text; f.hidden = false; clearTimeout(flashTimer); flashTimer = setTimeout(() => { f.hidden = true; }, 8000);
  };
  function rosterHead() {
    const cols = rosterCols(), rooms = knownRooms(), opt = (v, sel, text) => '<option value="' + esc(v) + '"' + (sel ? ' selected' : '') + '>' + esc(text == null ? v : text) + '</option>';
    const sortBtn = c => '<button type="button" class="sortbtn" data-sort="' + c.k + '" title="Sort by ' + esc(c.label) + '">' + esc(c.label) + '<span class="arrow">' + (rs.sort === c.k ? (rs.dir > 0 ? ' \u25B2' : ' \u25BC') : '') + '</span></button>';
    const filt = c => {
      const k = c.k, v = rs.f[k] || '';
      if (k === 'room') return '<select data-cf="room" aria-label="Filter Class"' + ($('fRoom').value ? ' class="cfset"' : '') + '><option value="">All</option>' + rooms.map(r => opt(r, r === $('fRoom').value)).join('') + '</select>';
      if (k === 'role') return '<select data-cf="role" aria-label="Filter Role"' + ($('fRole').value ? ' class="cfset"' : '') + '>' + opt('', $('fRole').value === '', 'All') + opt('kid', $('fRole').value === 'kid', 'Clubber') + opt('vol', $('fRole').value === 'vol', 'Volunteer') + '</select>';
      if (k === 'team') return '<select data-cf="team" aria-label="Filter team"><option value="">All</option>' + App.teamColors().map(t => opt(t, v === t)).join('') + opt('none', v === 'none', 'No team') + '</select>';
      if (k === 'active') return '<select data-cf="active" aria-label="Filter Active"' + ($('fInactive').value !== 'active' ? ' class="cfset"' : '') + '>' + opt('active', $('fInactive').value === 'active', 'Active') + opt('inactive', $('fInactive').value === 'inactive', 'Inactive') + opt('all', $('fInactive').value === 'all', 'Everyone') + '</select>';
      if (k === 'nophotos') return '<select data-cf="' + k + '" aria-label="Filter ' + esc(c.label) + '">' + opt('', !v, 'All') + opt('Yes', v === 'Yes') + opt('No', v === 'No') + '</select>';
      return '<input type="search" data-cf="' + k + '" value="' + esc(v) + '" placeholder="contains" aria-label="Filter ' + esc(c.label) + '" size="8">';
    };
    return '<thead><tr>' + cols.map(c => '<th aria-sort="' + (rs.sort === c.k ? (rs.dir > 0 ? 'ascending' : 'descending') : 'none') + '">' + sortBtn(c) + '</th>').join('') + '<th></th></tr>' +
      '<tr class="filterrow">' + cols.map(c => '<th>' + filt(c) + '</th>').join('') + '<th><button type="button" id="btnRosterClear" title="Remove every column filter and sort">Clear</button></th></tr></thead>';
  }
  function rosterBody(list) {
    const teamCol = 'team:' + settings.quarter, rooms = knownRooms();
    return '<tbody>' + list.map(p => {
        const id = esc(p[X.ID]), room = Model.room(p), hasTeams = Model.hasColorTeams(Model.groupOf(room));
        const ov = c => p['ov:' + c] ? ' <span class="ovmark" title="Pending change in Planning Center. PC value now: ' + esc(p[c]) + '">&#9679;</span>' : '';
        return '<tr data-id="' + id + '" class="' + (Model.isActive(p) ? '' : 'off ') + (Model.isVolunteer(p) ? 'vol' : '') + '">' +
          '<td>' + esc(Model.eff(p, C.FIRST)) + ov(C.FIRST) + (Model.isGuest(p) ? ' <span class="guesttag" title="Added by hand, not in Planning Center. Link them to their entry from the Person page.">guest</span>' : '') + '</td><td>' + esc(Model.eff(p, C.LAST)) + ov(C.LAST) + '</td>' +
          '<td>' + (Model.isVolunteer(p) ? 'Volunteer' : 'Clubber') + '</td>' +
          '<td class="classcell">' + esc(room) + ov(C.ROOM) + '</td>' +      /* UX-17: read-only; Move... is the one place a class changes on Roster */
          '<td>' + esc(Model.eff(p, C.GRADE)) + '</td>' +
          '<td>' + (hasTeams ? '<select data-f="' + esc(teamCol) + '" class="teamsel' + (p[teamCol] ? ' team team-' + esc(p[teamCol]) : '') + '" aria-label="' + esc(settings.quarter) + ' team"><option value=""></option><option value="' + Model.NO_TEAM + '"' + (Model.noTeam(p, settings.quarter) ? ' selected' : '') + '>No team</option>' + App.teamColors().map(t => '<option' + (p[teamCol] === t ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>' + teamNowHtml(p, settings.quarter) : '') + '</td>' +
          '<td><input type="checkbox" data-f="' + X.NOPHOTOS + '"' + (Model.noPhotos(p) ? ' checked' : '') + '></td>' +
          '<td><input type="checkbox" data-f="' + X.ACTIVE + '"' + (Model.isActive(p) ? ' checked' : '') + '></td>' +
          '<td><input type="text" data-f="' + X.NOTES + '" value="' + esc(p[X.NOTES]) + '" size="22"></td>' +
          '<td><button data-move="1" title="Move to another class">Move&hellip;</button> <button data-edit="1">Edit</button></td></tr>';
      }).join('') + '</tbody>';
  }
  function rosterCount(list) {
    const on = !!rs.sort || Object.values(rs.f).some(Boolean) || $('fInactive').value !== 'active';
    $('count').textContent = list.length + ' shown' + (on ? ' (sorted or filtered by column)' : '');
    const b = $('btnRosterClear'); if (b) b.disabled = !(on || $('fRoom').value || $('fRole').value || $('fSearch').value.trim());      /* Clear is live for any filter, including the Class and Role ones */
    /* UX-17: one line saying what is filtered (and the count), and the phone's Filter line; the filters themselves are the header row's dropdowns (the bar's three selects are the state they share) */
    const lab = (id, d) => { const e = $(id); return e.value === d ? '' : (e.options[e.selectedIndex] || {}).text || ''; };
    const bits = [lab('fRoom', ''), lab('fRole', ''), lab('fInactive', 'active')].filter(Boolean), q = $('fSearch').value.trim(), cols = Object.keys(rs.f).filter(k => rs.f[k] && !['room', 'role', 'active'].includes(k)).length;
    if (q) bits.push('matching \u201c' + q + '\u201d'); if (cols) bits.push(cols + ' column filter' + (cols === 1 ? '' : 's'));
    const sh = $('rosterShowing'); if (sh) { sh.hidden = !bits.length; sh.textContent = bits.length ? 'Showing: ' + bits.join(' \u00b7 ') + ' \u2014 ' + list.length + ' of ' + (master ? master.people.length : 0) + ' people' : ''; }
    const fs = $('rosterFilterSum'); if (fs) { const t = 'Filter: ' + (bits.filter(x => !/^matching|column filter/.test(x)).join(', ') || 'everyone active'); if (fs.textContent !== t) fs.textContent = t; }
  }
  function renderRoster() {
    const wrap = $('rosterWrap');
    if (!master) { wrap.innerHTML = '<p style="padding:16px" class="status">Import your data file and this week\u2019s Planning Center export (Import\u2026) to begin.</p>'; $('count').textContent = ''; return; }
    const list = visiblePeople();
    wrap.innerHTML = '<table class="roster">' + rosterHead() + rosterBody(list) + '</table>';
    rosterCount(list);
  }
  // Typing in a filter box or choosing a sort changes only the rows, so the box you are typing in is never replaced.
  function renderRosterRows() {
    const list = visiblePeople(), t = $('rosterWrap').querySelector('table'); if (!t) return renderRoster();
    t.querySelector('tbody').outerHTML = rosterBody(list);
    t.querySelectorAll('th[aria-sort]').forEach((th, n) => { const c = rosterCols()[n], on = rs.sort === c.k; th.setAttribute('aria-sort', on ? (rs.dir > 0 ? 'ascending' : 'descending') : 'none'); th.querySelector('.arrow').textContent = on ? (rs.dir > 0 ? ' \u25B2' : ' \u25BC') : ''; });
    rosterCount(list);
  }
  $('rosterWrap').addEventListener('click', e => {
    const s = e.target.closest('button[data-sort]');
    if (s) { const k = s.dataset.sort; if (rs.sort !== k) { rs.sort = k; rs.dir = 1; } else if (rs.dir > 0) rs.dir = -1; else { rs.sort = ''; rs.dir = 1; } renderRosterRows(); return; }
    if (e.target.id === 'btnRosterClear') { rs.sort = ''; rs.dir = 1; rs.f = {}; $('fSearch').value = ''; $('fRoom').value = ''; $('fRole').value = ''; $('fInactive').value = 'active'; renderRoster(); }
  });
  const roomRoleSync = { room: 'fRoom', role: 'fRole', active: 'fInactive' };      // these three column filters are the same filters as in the bar above
  $('rosterWrap').addEventListener('input', e => {
    const k = e.target.dataset && e.target.dataset.cf; if (!k || e.target.tagName !== 'INPUT') return;
    rs.f[k] = e.target.value.trim(); renderRosterRows();
  });
  $('rosterWrap').addEventListener('change', e => {
    const k = e.target.dataset && e.target.dataset.cf; if (!k || e.target.tagName !== 'SELECT') return;
    if (roomRoleSync[k]) $(roomRoleSync[k]).value = e.target.value; else rs.f[k] = e.target.value;
    e.target.classList.toggle('cfset', e.target.value !== (k === 'active' ? 'active' : ''));      /* a set filter is highlighted */
    renderRosterRows();
  });
  $('rosterWrap').addEventListener('change', e => {
    const el = e.target, f = el.dataset.f, tr = el.closest('tr');
    if (!f || !tr) return;
    const p = byId.get(tr.dataset.id);
    if (el.type === 'checkbox') { if (f === X.ACTIVE) Model.setActive(p, el.checked); else p[f] = el.checked ? '1' : ''; }
    else if (f.startsWith('team:')) { if (App.checkTeamPick) App.checkTeamPick(p, f.slice(5), el.value); Model.setTeamChoice(master, p, f.slice(5), el.value); if (el.classList.contains('teamsel')) el.className = 'teamsel' + (el.value && el.value !== Model.NO_TEAM ? ' team team-' + el.value : ''); }
    else Model.setField(p, f, el.value);
    touch(); if (f === C.ROOM || f === X.ACTIVE) refresh();
  });
  $('rosterWrap').addEventListener('click', e => {
    const mv = e.target.closest('[data-move]'); if (mv) { moveKid(mv.closest('tr').dataset.id); return; }
    const b = e.target.closest('[data-edit]'); if (b) { const id = b.closest('tr').dataset.id; App.showPerson(id, { sub: 'registration' }); setTimeout(() => { const f = document.querySelector('#personWrap .pgrid input, #personWrap .pgrid textarea, #personWrap .pgrid select'); if (f && App.tab === 'person') f.focus({ preventScroll: true }); }, 60); return; }      /* UX-24: Edit opens the Person page (Registration) with its first field focused; the raw all-columns dialog is the All fields button there */
  });
  ['fSearch', 'fRoom', 'fRole', 'fInactive'].forEach(id => $(id).addEventListener('input', renderRoster));

  // ---------- edit-everything dialog ----------
  // Fields with a short list of possible answers are drop-downs filled from what the Planning Center file already contains (assignment areas, selection, grade, gender, status, team colors, yes/no flags);
  // names, addresses, phones, emails, dates, notes and anything with many different values stay typed. A drop-down always ends with "Other" so a value not in the list can still be typed.
  const FREE_TEXT = /name|address|street|city|zip|postal|phone|email|birth|note|medical|allerg|emergency|contact|comment|date|amount|balance|paid|discount|total|\bid\b|registration|x_uni_/i;
  function choicesFor(col) {
    if (col === C.ROOM) return { list: knownRooms().map(v => [v, v]), blank: false };
    if (col.startsWith('team:')) return { list: App.teamColors().map(v => [v, v]), blank: true, noOther: true };
    if (col === X.ACTIVE) return { list: [['1', 'Yes'], ['0', 'No']], blank: false, noOther: true };
    if (col === X.NOPHOTOS) return { list: [['', 'No'], ['1', 'Yes']], blank: false, noOther: true };
    if (Model.isUserCol(col) || FREE_TEXT.test(col)) return null;
    const seen = new Set(); master.people.forEach(p => { const v = String(Model.eff(p, col) || '').trim(); if (v) seen.add(v); });
    if (seen.size < 2 || seen.size > 15 || seen.size > Math.max(3, master.people.length * 0.25)) return null;
    return { list: [...seen].sort((x, y) => x.localeCompare(y, undefined, { numeric: true })).map(v => [v, v]), blank: true };
  }
  function fieldRow(col, value, overridden, isOv) {
    const ch = choicesFor(col), long = value.length > 70 || /\n/.test(value);
    let input;
    if (ch) {
      const has = ch.list.some(([v]) => v === value), opts = (ch.blank ? ['<option value=""' + (value === '' ? ' selected' : '') + '></option>'] : []).concat(ch.list.map(([v, l]) => '<option value="' + esc(v) + '"' + (v === value ? ' selected' : '') + '>' + esc(l) + '</option>'));
      if (!has && value !== '') opts.push('<option value="' + esc(value) + '" selected>' + esc(value) + '</option>');
      if (!ch.noOther) opts.push('<option value="__other__">Other (type it)&hellip;</option>');
      input = '<select data-col="' + esc(col) + '">' + opts.join('') + '</select>';
    } else input = long ? '<textarea rows="3" data-col="' + esc(col) + '">' + esc(value) + '</textarea>' : '<input data-col="' + esc(col) + '" value="' + esc(value) + '">';
    return '<label>' + esc(col) + (overridden ? ' <span class="ovmark">(pending PC change)</span>' : '') + '</label><div class="' + (overridden ? 'ov' : '') + '">' + input + '</div>' +
      (overridden ? '<button type="button" data-reset="' + esc(col) + '">Cancel change</button>' : '<span></span>');
  }
  function openEdit(p, isNew) {
    const dlg = $('dlg'), cols = master.pcCols.concat(master.userCols).filter(c => !(isNew && c === X.ID) && !Model.HIDDEN_COLS.includes(c) && !c.startsWith('x_noteam:'));      // the "No team" flags are set from the team drop-downs, not typed here
    dlg.innerHTML = '<h3 style="margin-top:0">' + (isNew ? 'Add a guest or a person not in Planning Center' : esc(Model.fullName(p))) + '</h3>' + (isNew ? '<p class="status"><b>A guest is added here only.</b> Fill in what you know. When they are registered in Planning Center, tie them to that entry later so their attendance and awards carry over: the next import offers it automatically, or use <i>Link to Planning Center</i> on their Person page.</p>' : '') +
      '<p class="status">Planning Center is the source of truth and is never edited here. A change to one of its fields becomes a pending PC change: it shows in reports now, appears on the &ldquo;Changes needed in Planning Center&rdquo; report, and clears itself once an import matches.</p><form method="dialog"><div class="fields">' +
      (isNew ? ((cols, grp) => ['Name', 'Class and grade', 'Contact', 'Medical', 'Club fields', 'Other'].map(g => { const m = cols.filter(c => grp(c) === g); return m.length ? '<fieldset class="addgrp"><legend>' + g + '</legend>' + m.map(c => fieldRow(c, c === X.ID ? p[c] : (Model.isUserCol(c) ? (p[c] || '') : Model.eff(p, c)), false)).join('') + '</fieldset>' : ''; }).join(''))(cols, c => Model.isUserCol(c) ? 'Club fields' : /^(First|Last)|nick|prefer|gender|birth/i.test(c) ? 'Name' : c === C.ROOM || c === C.GRADE || /^selection$|registration|school|class/i.test(c) ? 'Class and grade' : /phone|email|address|parent|guardian|contact|city|state|zip|emergency/i.test(c) ? 'Contact' : /med|allerg|photo|dietary/i.test(c) ? 'Medical' : 'Other')
        : cols.map(c => fieldRow(c, c === X.ID ? p[c] : (Model.isUserCol(c) ? (p[c] || '') : Model.eff(p, c)), !Model.isUserCol(c) && !!p['ov:' + c])).join('')) +
      '</div><div class="dlgbtns"><button type="button" id="dlgCancel">Cancel</button><button type="submit" class="primary" id="dlgSave">Save</button></div></form>';
    dlg.querySelectorAll('[data-reset]').forEach(b => b.onclick = () => { delete p['ov:' + b.dataset.reset]; touch(); dlg.close(); refresh(); openEdit(p); });
    dlg.onchange = e => { const s = e.target; if (s.tagName === 'SELECT' && s.value === '__other__') { const i = document.createElement('input'); i.setAttribute('data-col', s.dataset.col); s.replaceWith(i); i.focus(); } };      // "Other": a typed value
    $('dlgCancel').onclick = () => dlg.close();
    $('dlgSave').onclick = ev => {
      // Impossible values are refused here, with the reason; judgment calls (an unrecognised grade, a short phone number) are saved and shown on the To do list.
      const errs = [];
      dlg.querySelectorAll('[data-col]').forEach(inp => { const col = inp.dataset.col, v = inp.value.trim(); if (col === X.ID || inp.value === '__other__') return; const r = Check.field(col, v, today(), Model.isClubber(p)); if (r && r.level === 'error') errs.push(col + ': ' + r.msg); });
      if (isNew && !String(((dlg.querySelector('[data-col="' + C.FIRST + '"]') || {}).value || '')).trim()) errs.push('First Name: a person needs a first name.');
      if (isNew && !String(((dlg.querySelector('[data-col="' + C.LAST + '"]') || {}).value || '')).trim()) errs.push('Last Name: a person needs a last name.');
      let eb = $('dlgErr'); if (!eb) { dlg.querySelector('.dlgbtns').insertAdjacentHTML('beforebegin', '<div id="dlgErr" class="bad" role="alert"></div>'); eb = $('dlgErr'); }
      eb.innerHTML = errs.length ? '<b>Not saved:</b><ul>' + errs.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '';
      if (errs.length) { ev.preventDefault(); return; }       // the form would close the dialog: keep it open with the reasons
      dlg.querySelectorAll('[data-col]').forEach(inp => {
        const col = inp.dataset.col;
        if (col === X.ID) return;
        if (isNew || Model.isUserCol(col)) { if (inp.value !== (p[col] || '')) p[col] = inp.value; }
        else if (inp.value !== Model.eff(p, col)) Model.setField(p, col, inp.value);
      });
      if (isNew) Model.addManualPerson(master, p, today());
      touch(); refresh();
      if (!isNew) { const b = document.querySelector('#rosterWrap tr[data-id="' + CSS.escape(p[X.ID]) + '"] [data-edit]'); if (b) b.focus(); }
    };
    dlg.showModal();
  }
  $('btnAddPerson').addEventListener('click', () => {
    if (!master) return App.ask.alert('Load a roster first.');
    const seed = {}; master.pcCols.concat(master.userCols).forEach(c => { seed[c] = ''; });
    seed[C.SELECTION] = 'Clubber (Cubbies, Sparks & T&T only)'; seed[C.REG] = 'manual'; seed[X.ACTIVE] = '1';
    openEdit(seed, true);
  });
  // ---- move a child to another class (Roster and Attendance) ----
  // The class in Planning Center is never edited here, so a move is a pending Planning Center change: it shows everywhere now, appears on the To do list as "Move to X in Planning Center",
  // and clears by itself when an import shows the child in that class.
  function moveKid(id) {
    const p = byId.get(id); if (!p) return;
    const dlg = $('dlg'), from = Model.room(p), pcRoom = p[C.ROOM] || '', rooms = knownRooms().filter(r => r !== 'Unassigned');
    dlg.onchange = null;
    dlg.innerHTML = '<h3 style="margin-top:0">Move ' + esc(Model.fullName(p)) + ' to another class</h3><p class="status">Now in <b>' + esc(from) + '</b>' + (pcRoom && pcRoom !== from ? ' (Planning Center still says ' + esc(pcRoom) + ')' : '') + '. The move takes effect here at once and is added to the To do list: ' +
      '<b>change it in Planning Center too</b>. The next import that shows them in the new class clears the To do item.</p>' +
      '<p><label>Move to <select id="mvRoom">' + rooms.map(r => '<option' + (r === from ? ' selected' : '') + '>' + esc(r) + '</option>').join('') + '</select></label></p><p id="mvNote" class="status"></p>' +
      '<div class="dlgbtns"><button type="button" id="mvCancel">Cancel</button><button type="button" id="mvGo" class="primary">Move</button></div>';
    const note = () => { const to = $('mvRoom').value, a = Model.groupOf(from), b = Model.groupOf(to); $('mvNote').textContent = to === from ? '' : a !== b ? 'This is a different group (' + a + ' to ' + b + '): the marks, color teams and game points follow the new group from the next night on.' : ''; };
    $('mvRoom').onchange = note; $('mvCancel').onclick = () => dlg.close();
    $('mvGo').onclick = () => { const to = $('mvRoom').value; dlg.close(); if (to === from) return; Model.setField(p, C.ROOM, to); touch(); refresh(); };
    dlg.showModal();
  }
  App.moveKid = moveKid;

  // ---- tie a guest to their Planning Center entry ----
  function linkGuest(id) {
    const p = byId.get(id); if (!p || !Model.isGuest(p)) return;
    if (!lastPc) return App.ask.alert('Import a Planning Center export first (Import\u2026 in the top bar), then pick their entry here.');
    const recs = Model.unlinkedRecords(master, lastPc.pc), dlg = $('dlg'), nm = r => ((r[C.FIRST] || '') + ' ' + (r[C.LAST] || '')).trim();
    recs.sort((x, y) => Model.similarity(Model.fullName(p), nm(y)) - Model.similarity(Model.fullName(p), nm(x)));
    dlg.onchange = null;
    dlg.innerHTML = '<h3 style="margin-top:0">Link ' + esc(Model.fullName(p)) + ' to Planning Center</h3><p class="status">Pick their entry from ' + esc(lastPc.name) + ' (only people not yet on the roster are listed, best name match first). Their attendance, awards and notes stay; Planning Center\u2019s details replace the ones typed in.</p>' +
      '<p><input type="search" id="lgFind" placeholder="Search name\u2026" aria-label="Search Planning Center entries"></p><div class="scroll"><table class="roster"><thead><tr><th>Name</th><th>Class</th><th>Grade</th><th>Born</th><th>Registration</th><th></th></tr></thead><tbody id="lgRows">' +
      recs.map((r, n) => '<tr data-n="' + n + '"><td>' + esc(nm(r)) + '</td><td>' + esc(r[C.ROOM] || '') + '</td><td>' + esc(r[C.GRADE] || '') + '</td><td>' + esc(r[C.BDAY] || '') + '</td><td>' + esc(r[C.REG] || '') + '</td><td><button type="button" data-link="' + n + '">Link</button></td></tr>').join('') +
      '</tbody></table></div>' + (recs.length ? '' : '<p class="status">Every person in that export is already on the roster, so there is nothing to link to yet.</p>') + '<div class="dlgbtns"><button type="button" id="lgClose">Close</button></div>';
    $('lgClose').onclick = () => dlg.close();
    $('lgFind').oninput = e => { const q = e.target.value.trim().toLowerCase(); dlg.querySelectorAll('#lgRows tr').forEach(tr => { tr.hidden = !!q && !tr.children[0].textContent.toLowerCase().includes(q); }); };
    dlg.querySelectorAll('[data-link]').forEach(b => b.onclick = () => {
      const r = recs[+b.dataset.link];
      Model.linkToPc(master, p, lastPc.pc, r, today()); dlg.close(); touch(); refresh();      /* one Undo step: done at once, with Undo offered (UX-20) */
      App.done('Linked ' + Model.fullName(p) + ' to ' + nm(r) + ' (' + (r[C.REG] || 'no registration') + ').');
    });
    dlg.showModal();
  }
  App.linkGuest = linkGuest;
  $('btnAddCol').addEventListener('click', () => {
    if (!master) return App.ask.alert('Load a roster first.');
    /* A form, not a typed prefix: pick the kind, then give a name, a date or a quarter; the column name is built for you and shown before you add it (UX-20, D5) */
    const KINDS = [['x_', 'Club field (a note or date the club keeps)'], ['award:', 'Award date'], ['att:', 'Attendance date'], ['prog:', 'Progress'], ['team:', 'Color team quarter']];
    const colOf = v => v.kind === 'x_' || v.kind === 'prog:' ? v.kind + String(v.name || '').trim() : v.kind === 'team:' ? 'team:' + (v.quarter || '') : v.kind + (v.date || '');
    App.ask.form({ title: 'Add a column', message: 'A club column is kept in the data file and in each person’s Edit dialog. Imports never touch it.', ok: 'Add column', fields: [
      { name: 'kind', label: 'Kind', type: 'select', options: KINDS, value: 'x_' },
      { name: 'name', label: 'Name', type: 'text', maxlength: 60, showIf: { name: 'kind', values: ['x_', 'prog:'] }, hint: 'For example: Allergy note' },
      { name: 'date', label: 'Date', type: 'date', showIf: { name: 'kind', values: ['award:', 'att:'] } },
      { name: 'quarter', label: 'Quarter', type: 'select', options: [['Q1', 'Q1'], ['Q2', 'Q2'], ['Q3', 'Q3'], ['Q4', 'Q4']], value: 'Q1', showIf: { name: 'kind', values: ['team:'] } }],
      preview: v => 'Column: ' + colOf(v),
      validate: v => {
        if ((v.kind === 'x_' || v.kind === 'prog:') && !String(v.name || '').trim()) return { name: 'name', message: 'Give the column a name.' };
        if ((v.kind === 'award:' || v.kind === 'att:') && !v.date) return { name: 'date', message: 'Choose a date.' };
        const c = colOf(v); return !Model.isUserCol(c) || master.pcCols.concat(master.userCols).includes(c) ? { name: 'kind', message: 'There is already a column ' + c + '.' } : '';
      } }).then(v => {
      if (!v) return; const c = colOf(v); Model.addUserCol(master, c); touch();
      App.done('Column ' + c + ' added. It appears in each person’s Edit dialog and is saved in the data file.');
    });
  });

  // ---------- reports ----------
  const sel = $('rSel'), reportOptionsDialog = $('reportOptions');
  let reportFiltersChanged = false, previousReportTitle = '';
  // Report groups (the sub-tabs above the report box): each one shows only its own reports in the one list below, so the list and everything that picks a report from it (showReport, the tests) work as before.
  // The group of a report is looked up here, not stored with the report. The group chosen is for this visit only.
  const RSUBS = { attend: ['attendance', 'attendDates'], teams: ['teams', 'binderTeams', 'standings'], binders: ['binderClass', 'binderAll', 'volunteers', 'photos', 'noteSheets', 'clubCalendar'], progress: ['progressSheets', 'awardsByChild', 'ceremony', 'handOut', 'booksYear', 'handbooks', 'paceWatch'] };
  const subOf = v => /^bundle:/.test(v) ? 'binders' : Object.keys(RSUBS).find(k => RSUBS[k].includes(v)) || 'other';      // everything else (uniforms, lessons, Planning Center changes) is "Other"
  let rsub = 'attend'; const lastIn = {};
  let binderSel = null, binderPrefs = null;      // binderSel: the binders chosen in the Print class binders pop-up ({ name, items }); binderPrefs: the pop-up's last settings, kept for the visit
  function applySub() {
    [...sel.options].forEach(o => { o.hidden = subOf(o.value) !== rsub; });
    sel.querySelectorAll('optgroup').forEach(g => { g.hidden = rsub !== 'binders'; });
    document.querySelectorAll('#rSubs button[data-rsub]').forEach(b => { const on = b.dataset.rsub === rsub; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    $('btnBinders').hidden = rsub !== 'binders';      // the Binders button belongs to the Binders group (its progress-sheet tick is in its pop-up)
  }
  // Reports, then the club's report bundles (several reports printed as one job; defined on Options). Rebuilt when the data changes because the bundles live in the data file.
  function fillReportSel() {
    const keep = sel.value, bs = Reports.bundlesOf(App.season);
    sel.innerHTML = Reports.LIST.filter(r => !r.hidden).map(r => '<option value="' + r.id + '">' + esc(r.title) + '</option>').join('') + '<optgroup label="Print several at once">' + (binderSel ? '<option value="bundle:picked">Last made in Print class binders: ' + esc(binderSel.name) + '</option>' : '') + bs.map((b, i) => '<option value="bundle:' + i + '">' + esc(b.name) + ' (bundle)</option>').join('') + '</optgroup>';
    sel.value = [...sel.options].some(o => o.value === keep) ? keep : (Reports.LIST[0] || {}).id;
    rsub = subOf(sel.value); applySub();
  }
  fillReportSel(); App.fillReportSel = fillReportSel;
  let bundleQ = '';      // the quarter chosen for a bundle; empty until chosen, then it is the next quarter
  const reportQuarter = () => locationReportQuarter?.report === sel.value ? locationReportQuarter.quarter : settings.quarter;
  $('sQuarter').value = settings.quarter;
  const bundleOf = () => sel.value === 'bundle:picked' ? binderSel : /^bundle:\d+$/.test(sel.value) ? Reports.bundlesOf(App.season)[+sel.value.slice(7)] || null : null;
  const isNightPack = b => b && b.name === 'Club night pack' && ['announceList', 'handOut'].every(id => b.items.some(i => i.report === id));
  $('btnPackSlides').addEventListener('click', () => { closeReportOptions(); App.openAwardSlides(); });
  // The reports a bundle prints: a perClass bundle (the standard Class binder) takes its class from the Class picker, and a class gets no progress sheets for Puggles.
  function bundleItems(b) {
    const room = !!b.perClass && b !== binderSel ? $('oRoomSel').value : '';
    return room ? (b.items || []).filter(i => !(i.report === 'progressSheets' && Model.groupOf(room) === 'Puggles')).map(i => i.report === 'volunteers' ? i : Object.assign({}, i, { room })) : (b.items || []);
  }
  function renderPackColoringSheets(date) {
    const panel = $('packColoringSheets');
    const sheets = Calendar.coloringSheets(App.season?.config, calendar, date);
    const counts = {};
    if (master) Reports.kids(master).forEach(p => { const g = Model.groupOf(Model.room(p)); counts[g] = (counts[g] || 0) + 1; });
    panel.hidden = false;
    panel.innerHTML = '<h4>Coloring sheets' + (date ? ' for ' + esc(Calendar.short(date)) : '') + '</h4>' +
      (sheets.length ? '<p class="status">Open each PDF and print it from your browser. Suggested copies include every active clubber in the group.</p><ul>' +
        sheets.map(s => '<li>' + esc(s.group + (s.lesson ? ' · ' + s.lesson : '')) + ' · ' + (counts[s.group] || 0) + ' suggested <a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">Open PDF</a></li>').join('') + '</ul>' :
        '<p class="status">Add a PDF link under a group’s lesson in Calendar → Lessons by week.</p>');
  }
  function renderBundle(b) {
    ['oRoom', 'oGroup', 'oKid', 'calNote', 'oNoBook', 'oShowLessons', 'oBooks', 'oBlanks'].forEach(id => { $(id).hidden = true; });
    // Bundle options come from the reports in it. Its quarter is independent of the app-wide quarter.
    const bundleOptions = new Set(b.items.flatMap(item => Reports.LIST.find(r => r.id === item.report)?.opts || []));
    const order = bundleOptions.has('order'), title = bundleOptions.has('title'), perClass = !!b.perClass && b !== binderSel;
    const pack = isNightPack(b), packNight = pack ? App.nextNight() : '';
    if (pack) {
      $('btnPackSlides').hidden = false;
      $('btnPackSlides').disabled = !App.season || !packNight;
      renderPackColoringSheets(packNight);
    }
    $('dateBar').hidden = !(order || title || bundleOptions.has('quarter')); $('oOrder').hidden = !order; $('tWrap').hidden = !title;
    if (!bundleQ) bundleQ = Reports.nextQuarter(calendar, today(), settings.quarter);
    $('qWrap').hidden = !bundleOptions.has('quarter'); $('qLabel').textContent = 'Quarter to print'; syncQ();
    // A bundle marked perClass (the standard Class binder) takes its class from the Class picker, as its comment always said.
    $('oRoom').hidden = !perClass;
    if (perClass && master) { const rs = $('oRoomSel'), cur = rs.value, rl = Reports.roomsOf(Reports.kids(master)); rs.innerHTML = '<option value="">All classes</option>' + rl.map(r => '<option>' + esc(r) + '</option>').join(''); rs.value = rl.includes(cur) ? cur : ''; }
    const items = bundleItems(b);
    $('bNote').textContent = pack ? (packNight ? 'Club night ' + packNight : 'Add a club night to make dated slides.') : reportOptionSummary();
    if (!master) { $('report').innerHTML = '<p class="status">Load a roster first.</p>'; return; }
    $('report').innerHTML = Reports.runBundle({ master, settings, calendar, rotation, season: App.season, today: App.today(), progressSheet: (p, bk) => App.sheets.html(p, bk), opts: { order: $('oOrderSel').value, group: $('oGroupSel').value, packNight: pack ? packNight : '' } }, Object.assign({}, b, { items }), bundleQ) || '<p class="status">This bundle has no reports. Add some on the Options tab.</p>';
    setPageStyle();
  }
  // The paper: the first sheet decides the page (so the printout does not start with a blank page, which a named page on the very first sheet causes); a sheet of the other orientation gets its own named page.
  function setPageStyle() {
    const sheets = [...document.querySelectorAll('#report .sheet:not(.emptysheet,.skip)')], first = sheets[0] && sheets[0].classList.contains('landscape') ? 'landscape' : 'portrait', other = first === 'landscape' ? 'portrait' : 'landscape';
    const firstNotes = !!sheets[0] && sheets[0].classList.contains('notes'), punchOn = o => sheets.some(x => x.classList.contains('punch') && x.classList.contains(o)), margin = o => punchOn(o) ? (sheets.some(x => x.classList.contains('punch') && x.classList.contains('notes')) ? '0.3in 0.4in 0.3in 0.85in' : '0.5in 0.4in 0.5in 0.85in') : firstNotes ? '0.25in' : o === 'landscape' ? '0.4in' : '0.5in'; let st = document.getElementById('pageStyle');
    if (!st) { st = document.createElement('style'); st.id = 'pageStyle'; document.head.appendChild(st); }
    st.textContent = '@page { size: ' + first + '; margin: ' + margin(first) + '; } ' + (!firstNotes && sheets.some(x => x.classList.contains('notes')) ? '#report .sheet.notes { page: pgnotes; } @page pgnotes { size: portrait; margin: ' + (sheets.some(x => x.classList.contains('notes') && x.classList.contains('punch')) ? '0.3in 0.4in 0.3in 0.85in' : '0.25in') + '; } ' : '') + (sheets.some(x => x.classList.contains(other)) ? '#report .sheet.' + other + ' { page: pg' + other + '; } @page pg' + other + ' { size: ' + other + '; margin: ' + margin(other) + '; }' : '');
  }
  App.setPageStyle = setPageStyle;
  let bundleKey = '';
  // Reports made of one page per class (or child) say how many pages will print; "Choose pages" opens the list, and a page unticked there is left out of the printed PDF. The choice lasts until the report is redrawn.
  // A report of many pages (progress sheets for the whole club) says it is being drawn first, so a slow computer shows that something is happening.
  // N4: Progress sheets open on ONE class (the first, or the one chosen); All classes draws everyone behind a "Drawing N progress sheets..." pop-up (#busy). psAll remembers, for this visit, that everyone was asked for.
  let drawingBig = false, psAll = false, psAuto = false;      // psAuto: the class in the picker is Progress sheets' own default, not a choice
  const BIG_DRAW = 30;      // more sheets than this and the pop-up shows
  const psRooms = () => Reports.roomsOf(Reports.kids(master)).filter(r => Model.groupOf(r) !== 'Puggles');      // the classes that have progress sheets (Puggles have none)
  // The class the Progress sheets report will draw: the picker's class if it is listed, else everyone when asked for, else the first class. Counted before the draw so the pop-up and the picker agree.
  function effectiveRoom() { const cur = $('oRoomSel').value, rl = psRooms(); return rl.includes(cur) ? cur : (psAll ? '' : (rl[0] || '')); }
  const sheetCount = room => Reports.kids(master).filter(p => ['Cubbies', 'Sparks', 'T&T'].includes(Model.groupOf(Model.room(p))) && (!room || Model.room(p) === room)).length;
  function bigCount() {
    if (!master) return 0;
    const b = bundleOf();
    if (!b) return sel.value === 'progressSheets' ? sheetCount(effectiveRoom()) : 0;
    return bundleItems(b).filter(i => i.report === 'progressSheets').reduce((s, i) => s + sheetCount(i.room || ''), 0);
  }
  function renderReport() {
    if (locationReportQuarter?.report !== sel.value) locationReportQuarter = null;
    if (reportOptionsDialog.open) { reportOptionChanged(); return; }
    if (drawingBig) return;      // another change while it is being drawn: the drawing in progress picks up the pickers as they are now
    const n = bigCount();
    if (n > BIG_DRAW) {
      drawingBig = true; $('pageSum').textContent = ''; $('btnReportOptions').disabled = true; const busy = $('busy');      // the old report stays on screen under the pop-up until the new one is drawn
      $('busyTxt').textContent = 'Drawing ' + n + ' progress sheets' + (bundleOf() ? ' for the binders' : '') + '…'; busy.showModal();
      requestAnimationFrame(() => setTimeout(() => {
        const t0 = performance.now();
        try { renderReportCore(); pagePick(); App.drawStats = { what: 'progress sheets', n, ms: Math.round(performance.now() - t0), at: Date.now() }; }
        finally { drawingBig = false; $('btnReportOptions').disabled = false; busy.close(); }      // always: Esc is blocked, so a throw must not leave the pop-up on screen
      }, 0));
      return;
    }
    renderReportCore(); pagePick();
  }
  $('busy').addEventListener('cancel', e => e.preventDefault());      // the draw is one synchronous block: it cannot be cancelled
  const printableSheets = () => [...$('report').querySelectorAll('.sheet:not(.emptysheet)')];
  let printAfterLock = null;
  function pagePick() {
    const sheets = printableSheets(), selection = printAfterLock;
    printAfterLock = null;
    if (selection) {
      sheets.forEach((sheet, i) => sheet.classList.toggle('skip', !!selection[i]));
      setPageStyle();
    }
    const count = sheets.filter(sheet => !sheet.classList.contains('skip')).length;
    $('pageSum').textContent = !sheets.length ? 'No pages' : 'Pages to print: ' + (count === sheets.length ? 'all ' + count : count + ' of ' + sheets.length);
    $('btnPrint').disabled = !count;
    $('btnPrint').title = count ? '' : 'No pages selected to print.';
    if (selection && count) setTimeout(() => window.print(), 0);
  }
  function reportOptionSummary() {
    const group = $('oGroupSel'), room = $('oRoomSel'), kid = $('oKidSel');
    const books = $('oBooksSel').value;
    return [
      !$('qWrap').hidden && (bundleOf() ? bundleQ : reportQuarter()),
      !$('oShowLessons').hidden && $('oShowLessonsChk').checked && 'Lessons shown',
      !$('oRoom').hidden && (room.value || (!$('oBooks').hidden && 'All classes')),
      $('oRoom').hidden || !room.value ? !$('oGroup').hidden && group.selectedOptions[0]?.textContent : '',
      !$('oKid').hidden && kid.value && kid.selectedOptions[0]?.textContent.split(' — ').pop(),
      !$('oBooks').hidden && (books === 'blank' ? 'Blank sheets' : books === 'all' ? 'Every book started' : '')
    ].filter(Boolean).join(' · ');
  }
  function showReportPages() {
    const sheets = printableSheets(), panel = $('reportPageOptions');
    if (!sheets.length) { panel.textContent = 'No pages to print.'; return; }
    if (sheets.length === 1) { panel.textContent = '1 page to print.'; return; }
    panel.innerHTML = '<fieldset><legend>Choose pages</legend><div class="bar"><button type="button" id="pgAll">Select all</button> <button type="button" id="pgNone">Select none</button> <span id="pgCount" class="status"></span></div>' +
      '<div class="pglist">' + sheets.map((sheet, i) => '<label><input type="checkbox" data-pg="' + i + '"' + (sheet.classList.contains('skip') ? '' : ' checked') + '> ' + esc(sheet.querySelector('h2')?.textContent || 'Page ' + (i + 1)) + '</label>').join('') + '</div></fieldset>';
    const boxes = [...panel.querySelectorAll('input[data-pg]')];
    const count = () => { $('pgCount').textContent = boxes.filter(box => box.checked).length + ' of ' + boxes.length + ' selected'; };
    const select = checked => { boxes.forEach(box => { box.checked = checked; }); count(); };
    panel.onchange = count;
    $('pgAll').onclick = () => select(true);
    $('pgNone').onclick = () => select(false);
    count();
  }
  function reportOptionChanged() {
    if (!reportOptionsDialog.open) { renderReport(); return; }
    reportFiltersChanged = true;
    const bundle = bundleOf();
    if (!bundle) configureReportControls(Reports.LIST.find(r => r.id === sel.value) || Reports.LIST[0]);
    $('reportPageOptions').textContent = 'The page list will update after you close Options.';
  }
  function closeReportOptions() {
    if (!reportOptionsDialog.open) return;
    const title = $('sClub').value;
    reportOptionsDialog.close();
    if (reportFiltersChanged) {
      if (!$('tWrap').hidden && title !== previousReportTitle) {
        setClubTitle(title.trim() && title.trim() !== autoClub() ? title : '');
      }
      renderReport();
      return;
    }
    const sheets = printableSheets();
    reportOptionsDialog.querySelectorAll('input[data-pg]').forEach(box => {
      sheets[+box.dataset.pg]?.classList.toggle('skip', !box.checked);
    });
    setPageStyle();
    pagePick();
  }
  $('btnReportOptions').addEventListener('click', () => {
    reportFiltersChanged = false;
    previousReportTitle = $('sClub').value;
    showReportPages();
    reportOptionsDialog.showModal();
    reportOptionsDialog.scrollTop = 0;
  });
  $('pgDone').addEventListener('click', closeReportOptions);
  $('oShowLessonsChk').addEventListener('change', () => reportOptionChanged());
  reportOptionsDialog.addEventListener('cancel', e => { e.preventDefault(); closeReportOptions(); });

  function configureReportControls(def) {
    const o = def.opts || [];
    $('oRoom').hidden = !o.includes('room');
    // A report with groupAll (Awards to hand out) has an "All groups" choice in the Group picker; a report without it never sees that choice.
    const gsel0 = $('oGroupSel'), allOpt = [...gsel0.options].find(x => x.value === '');
    if (o.includes('groupAll') && !allOpt) gsel0.insertBefore(new Option('All groups', ''), gsel0.firstChild); else if (!o.includes('groupAll') && allOpt) { const was = gsel0.value === ''; allOpt.remove(); if (was) gsel0.value = 'Sparks'; }
    const blank = o.includes('books') && $('oBooksSel').value === 'blank';
    $('oGroup').hidden = !(o.includes('group') || o.includes('groupAll')); $('oKid').hidden = !o.includes('kid') || blank; $('oBooks').hidden = !o.includes('books'); $('oBlanks').hidden = !blank;
    $('dateBar').hidden = !(o.includes('order') || o.includes('title') || o.includes('noBook') || o.includes('lessons')); $('oNoBook').hidden = !o.includes('noBook'); $('oShowLessons').hidden = !o.includes('lessons');
    $('qWrap').hidden = $('calNote').hidden = !o.includes('quarter'); $('oOrder').hidden = !o.includes('order'); $('tWrap').hidden = !o.includes('title');
    const nights = Calendar.nights(calendar, reportQuarter()).length;
    $('calNote').textContent = calendar.length ? nights + ' club nights in ' + reportQuarter() + ' from the calendar' : '';
    if (!master) return;
    const rs = $('oRoomSel'), cur = psAuto && def.id !== 'progressSheets' ? '' : rs.value;      // the class Progress sheets chose by itself is not carried to another report
    // A report with a Group picker lists only that group's rooms in the Room picker (an old choice from another group is dropped).
    const gsel = $('oGroupSel').value, rl = Reports.roomsOf(Reports.kids(master)).filter(r => (!(o.includes('group') || (o.includes('groupAll') && gsel !== '')) || Model.groupOf(r) === gsel) && !(def.id === 'progressSheets' && Model.groupOf(r) === 'Puggles'));      // Puggles have no progress sheets
    rs.innerHTML = '<option value="">All classes</option>' + rl.map(r => '<option>' + esc(r) + '</option>').join(''); rs.value = rl.includes(cur) ? cur : (def.id === 'progressSheets' && !psAll ? (rl[0] || '') : '');
    psAuto = def.id === 'progressSheets' && (psAuto || !rl.includes(cur)) && !psAll && rs.value !== '';
    const ks = $('oKidSel'), kcur = ks.value;
    ks.innerHTML = '<option value="">Everyone in the ' + (rs.value && o.includes('room') ? 'class' : 'group') + '</option>' + master.people.filter(p => Model.isActive(p) && Model.isClubber(p) && ((!o.includes('group') && (!o.includes('groupAll') || !gsel)) || Model.groupOf(Model.room(p)) === $('oGroupSel').value) && (!rs.value || !o.includes('room') || Model.room(p) === rs.value))
      .sort(Model.byRoomThenName).map(p => '<option value="' + esc(p[X.ID]) + '">' + esc(Model.room(p) + ' \u2014 ' + Model.fullName(p)) + '</option>').join(''); ks.value = [...ks.options].some(opt => opt.value === kcur) ? kcur : '';
  }
  function renderReportCore() {
    $('btnPackSlides').hidden = true;
    $('packColoringSheets').hidden = true;
    syncQ();
    rsub = subOf(sel.value); lastIn[rsub] = sel.value; applySub();      // the group follows the report (a report chosen from elsewhere, such as the To do page, opens in its own group)
    const bk = Reports.bundlesOf(App.season).map(b => b.name).join('|') + '|' + (binderSel ? binderSel.name : ''); if (bk !== bundleKey) { bundleKey = bk; fillReportSel(); }      // another file, or the bundles were edited on Options
    $('bNote').textContent = ''; $('qLabel').textContent = 'Quarter'; const bundle = bundleOf();
    if (bundle) return renderBundle(bundle);
    const def = Reports.LIST.find(r => r.id === sel.value) || Reports.LIST[0], o = def.opts || [];
    configureReportControls(def);
    $('bNote').textContent = reportOptionSummary();
    if (!master && def.requiresRoster !== false) { $('report').innerHTML = '<p class="status">Load a roster first.</p>'; return; }
    const rs = $('oRoomSel'), ks = $('oKidSel');
    const html = def.render({ master, settings: Object.assign({}, settings, { quarter: reportQuarter() }), calendar, rotation, season: App.season, today: App.today(), progressSheet: (p, book) => App.sheets.html(p, book), opts: { room: rs.value, order: $('oOrderSel').value, group: $('oGroupSel').value, kid: ks.value, books: o.includes('books') ? $('oBooksSel').value : '', blanks: o.includes('books') && $('oBooksSel').value === 'blank' ? Math.max(1, Math.min(20, parseInt($('oBlanksNum').value, 10) || 3)) : 0, noBook: o.includes('noBook') && $('oNoBookChk').checked, lessons: o.includes('lessons') && $('oShowLessonsChk').checked } });      // the night only counts for reports that show the Night box
    // Contact and medical details come from the last Planning Center export; say how old it is.
    $('report').innerHTML = ['binderClass', 'binderAll', 'volunteers', 'photos'].includes(def.id) && master && master.pcAsOf ?
      html.replace(/<\/h2>/g, '</h2><p class="sub asof">Planning Center data as of ' + esc(master.pcAsOf) + '</p>') : html;
    setPageStyle();
  }
  // Location codes restore report filters in this view only. Do not apply global quarter overrides.
  const locationReportFilters = [
    ['group', 'oGroup', 'oGroupSel'], ['room', 'oRoom', 'oRoomSel'], ['order', 'oOrder', 'oOrderSel'],
    ['books', 'oBooks', 'oBooksSel'], ['blanks', 'oBlanks', 'oBlanksNum'], ['noBook', 'oNoBook', 'oNoBookChk'],
    ['lessons', 'oShowLessons', 'oShowLessonsChk']
  ];
  App.locationViews.reports = {
    get() {
      if (bundleOf()) return { bundle: 'active' };
      const view = { report: sel.value };
      if (!$('qWrap').hidden) view.quarter = reportQuarter();
      locationReportFilters.forEach(([key, wrap, id]) => {
        if ($(wrap).hidden) return;
        const input = $(id);
        view[key] = input.type === 'checkbox' ? (input.checked ? 'yes' : 'no') : input.value || 'all';
      });
      if (!$('oKid').hidden && $('oKidSel').value) view.child = 'selected';
      return view;
    },
    open(view) {
      const def = Reports.LIST.find(r => r.id === view.report && !r.hidden);
      if (!def || ![...sel.options].some(o => o.value === def.id)) return Object.keys(view);
      sel.value = def.id;
      locationReportQuarter = null;
      $('oKidSel').value = '';
      configureReportControls(def);
      const skipped = [];
      if (view.quarter && !$('qWrap').hidden) locationReportQuarter = { report: def.id, quarter: view.quarter };
      else if (view.quarter) skipped.push('quarter');
      locationReportFilters.forEach(([key, wrap, id]) => {
        if (!view[key]) return;
        const input = $(id), val = ['room', 'group'].includes(key) && view[key] === 'all' ? '' : view[key];
        if ($(wrap).hidden || (input.tagName === 'SELECT' && ![...input.options].some(o => o.value === val))) {
          skipped.push(key === 'room' ? 'class' : key); return;
        }
        if (input.type === 'checkbox') input.checked = val === 'yes'; else input.value = val;
        if (key === 'books' || key === 'group') configureReportControls(def);
      });
      renderReport();
      return skipped;
    }
  };
  // ---- Date boxes default to this year ----
  // Type the month and the day in any date box, then leave the box (Tab out, Enter, or click away) without typing a year: the year is this year. (A short or half-typed year is not guessed: the box goes back to the saved date, as before.) Nothing is done while a year is being typed
  // or when the box already holds a whole date. The browser reports a half-typed date as empty, so the digits typed are followed here (typedMonthDay) the way the box itself splits them into month and day.
  const typed = new WeakMap();
  const isDateBox = el => !!el && el.tagName === 'INPUT' && el.type === 'date';
  function typedMonthDay(s) {
    let i = 0; const next = () => s[i++];
    const seg = (singleFrom, max) => { const a = next(); if (!/\d/.test(a || '')) return null; if (+a >= singleFrom) return +a; const b = s[i]; if (b === '/') { i++; return +a; } if (/\d/.test(b || '') && +(a + b) >= 1 && +(a + b) <= max) { i++; return +(a + b); } return b === undefined ? null : +a; };
    const m = seg(2, 12); if (m === null || m < 1) return null; if (s[i] === '/') i++;
    const d = seg(4, 31); if (d === null || d < 1) return null; if (s[i] === '/') i++;
    return { m, d, yearTyped: /\d/.test(s.slice(i)) };
  }
  function finishDateBox(el) {
    const yr = today().slice(0, 4); let v = el.value, changed = false;
    if (!v && el.validity && el.validity.badInput) {
      const t = typedMonthDay(typed.get(el) || '');
      if (t && !t.yearTyped) { const mm = String(t.m).padStart(2, '0'), dd = String(t.d).padStart(2, '0'), dt = new Date(yr + '-' + mm + '-' + dd + 'T12:00:00'); if (dt.getMonth() + 1 === t.m && dt.getDate() === t.d) { v = yr + '-' + mm + '-' + dd; changed = true; } }
    }
    typed.delete(el);
    if (changed) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
    return changed;
  }
  // Tab after the month and the day goes to the next box. Left alone, the browser's date box makes Tab stop on its calendar icon first, so the first Tab after typing the day did not leave the box.
  function focusAfter(el) {
    const all = [...document.querySelectorAll('input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),a[href]')].filter(x => x.offsetParent !== null && x.tabIndex >= 0), i = all.indexOf(el);
    if (i >= 0 && all[i + 1]) all[i + 1].focus();
  }
  document.addEventListener('focusin', e => { if (isDateBox(e.target)) typed.delete(e.target); }, true);
  document.addEventListener('keydown', e => {
    if (!isDateBox(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[0-9/]$/.test(e.key)) typed.set(e.target, (typed.get(e.target) || '') + e.key);
    else if (e.key === 'Backspace' || e.key === 'Delete') typed.delete(e.target);
    else if (e.key === 'Enter') finishDateBox(e.target);
    else if (e.key === 'Tab' && App.sheetTab && App.sheetTab(e.target, e.shiftKey ? -1 : 1)) e.preventDefault();      // progress sheet: date box to date box
    else if (e.key === 'Tab' && !e.shiftKey && !e.target.value && finishDateBox(e.target)) { e.preventDefault(); if (document.activeElement === e.target) focusAfter(e.target); }      // month and day typed, no year: this year is filled in, then on to the next box
  }, true);
  document.addEventListener('focusout', e => { if (isDateBox(e.target)) finishDateBox(e.target); }, true);
  App.reportOptions = o => {
    const def = Reports.LIST.find(r => r.id === sel.value) || Reports.LIST[0];
    configureReportControls(def);
    const g = $('oGroupSel'), rs = $('oRoomSel'), ks = $('oKidSel');
    if (o.books) $('oBooksSel').value = o.books;
    if ('group' in o && [...g.options].some(x => x.value === o.group)) g.value = o.group;
    if (sel.value === 'progressSheets') { psAll = !o.room; psAuto = false; }
    configureReportControls(def);
    rs.value = o.room || '';
    configureReportControls(def);
    ks.value = o.kid || '';
    renderReport();
  };
  App.showReport = id => { sel.value = id; showTab('reports'); };
  $('oRoomSel').addEventListener('change', () => { psAuto = false; if (sel.value === 'progressSheets') psAll = $('oRoomSel').value === ''; });
  $('oGroupSel').addEventListener('change', () => { $('oKidSel').value = ''; $('oRoomSel').value = ''; });
  sel.addEventListener('change', renderReport);
  ['oNoBookChk', 'oRoomSel', 'oOrderSel', 'oGroupSel', 'oKidSel', 'oBooksSel', 'oBlanksNum'].forEach(id => $(id).addEventListener('change', reportOptionChanged));
  // A group button shows that group's reports: the one used last in it, or its first.
  $('rSubs').addEventListener('click', e => {
    const b = e.target.closest('button[data-rsub]'); if (!b) return;
    const k = b.dataset.rsub, opts = [...sel.options].filter(o => subOf(o.value) === k), pick = opts.find(o => o.value === lastIn[k]) || opts[0];
    if (pick) sel.value = pick.value; rsub = k; renderReport();
  });
  document.addEventListener('click', e => { const b = e.target.closest('.optsubs button[data-optsub]'); if (b) showTab(b.dataset.optsub); });
  function syncQ() { const cur = bundleOf() ? bundleQ : reportQuarter(); document.querySelectorAll('#qWrap button[data-q]').forEach(b => { const on = b.dataset.q === cur; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }); }
  $('qWrap').addEventListener('click', e => { const b = e.target.closest('button[data-q]'); if (!b) return; if (bundleOf()) { bundleQ = b.dataset.q; syncQ(); reportOptionChanged(); return; } const q = $('sQuarter'); q.value = b.dataset.q; q.dispatchEvent(new Event('input', { bubbles: true })); syncQ(); });
  $('sQuarter').addEventListener('input', e => { const q = e.target.value.trim().toUpperCase(); if (/^Q[1-4]$/.test(q)) { setQuarter(q); reportOptionChanged(); renderRoster(); } });
  // The Roster tab's own quarter picker (flag 10) sets the same app-wide quarter as the Reports pills and the Color teams box, and they follow it.
  $('fQuarter').addEventListener('change', e => { setQuarter(e.target.value); $('sQuarter').value = settings.quarter; $('tQuarter').value = settings.quarter; syncQ(); renderRoster(); });
  applyClub(); App.clubChanged = applyClub;      // called whenever a file opens or an undo changes the title (App.loadData runs first)
  // typing a different title keeps it; clearing it (or typing the automatic one) goes back to following the season
  $('sClub').addEventListener('input', e => { if (reportOptionsDialog.open) { reportOptionChanged(); return; } const v = e.target.value.trim(); setClubTitle(v && v !== autoClub() ? e.target.value : ''); renderReport(); });
  $('sClub').addEventListener('change', e => { if (!reportOptionsDialog.open && !settings.clubCustom) e.target.value = autoClub(); });
  // The binder pages (attendance sheets, team lists) are printed shortly before a quarter starts, which is when it should lock. Printing one for a quarter that is not locked asks first; it never locks silently.
  let lockQ = '';
  $('btnPrint').addEventListener('click', () => {
    const b = bundleOf(), q = b ? bundleQ : reportQuarter(); lockQ = q;
    const TEAM_PAGES = ['attendance', 'teams', 'binderTeams'], binder = b ? (b.items || []).some(i => TEAM_PAGES.includes(i.report)) : TEAM_PAGES.includes(sel.value);      // pages that depend on a quarter's colors, the coaches' team list too
    if (App.season && binder && Teams.QUARTERS.includes(q) && TeamPlan.stateOf(App.season, calendar, q, App.today()) !== 'locked') {
      $('lockAskBody').innerHTML = '<h3>Lock ' + esc(q) + ' now?</h3><p>' + esc(q) + ' is not locked yet. Locking makes its team colors final, so the pages you print now match what is played. You can unlock it again on the Color teams tab.</p>' +
        '<div class="dlgbtns"><button type="button" id="lockAskCancel">Cancel</button><button type="button" id="lockAskPrint">Print without locking</button><button type="button" id="lockAskLock" class="primary">Lock and print</button></div>';
      $('lockAsk').hidden = false; return;
    }
    window.print();
  });
  $('lockAsk').addEventListener('click', e => {
    const id = e.target.id; if (!id || !/^lockAsk(Cancel|Print|Lock)$/.test(id)) return;
    $('lockAsk').hidden = true;
    if (id === 'lockAskLock') {
      printAfterLock = printableSheets().map(sheet => sheet.classList.contains('skip'));
      TeamPlan.lock(App.season, lockQ || settings.quarter, App.today()); touch(); refresh();
    } else if (id === 'lockAskPrint') window.print();
  });

  // ---------- color teams tab ----------
  const link = p => '<a href="#" data-person="' + esc(p[X.ID]) + '">' + esc(Model.fullName(p)) + '</a>';
  const nameList = list => list.slice(0, 12).map(x => link(x.person || x)).join(', ') + (list.length > 12 ? ' and ' + (list.length - 12) + ' more' : '');
  // A new season keeps last year's calendar until it is replaced (BACKLOG T1): when no club night is today or later, the Color teams tab and To do say so and link to the Calendar tab.
  App.staleCalendar = () => !!master && !Calendar.nights(calendar).some(r => r.Date >= App.today());
  App.staleCalendarHtml = () => App.staleCalendar() ? '<div class="banner bad stalecal" role="status"><b>The calendar still has last season\'s dates. Replace it before planning teams.</b> <button type="button" data-stalecal>Open the Calendar</button></div>' : '';
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('button[data-stalecal]')) showTab('calendar'); });
  function renderTeams(note) {
    const wrap = $('teamsWrap'), q = settings.quarter;
    $('tQuarter').value = Teams.QUARTERS.includes(q) ? q : 'Q1';
    if (!master) { wrap.innerHTML = '<p class="status">Load a roster first.</p>'; return; }
    const a = Teams.audit(master, $('tQuarter').value, { history: App.teamHistory() });
    const prior = Teams.QUARTERS.slice(0, Teams.QUARTERS.indexOf($('tQuarter').value));
    let h = App.staleCalendarHtml() + (note ? '<p class="banner">' + note + '</p>' : '');
    h += '<p class="status">' + ($('tQuarter').value === 'Q1' ? 'Q1 is a random, even split.' :
      'Nobody gets a color they had in ' + prior.join(', ') + '; teams are mixed so earlier teammates are split up.') +
      ' Colors already entered are kept; only blanks are filled. Sparks and T&amp;T are separate.</p>';
    h += '<table class="roster" style="width:auto"><thead><tr><th>Group</th><th>Kids</th>' + Teams.COLORS.map(c => '<th><span class="team team-' + c + '">' + c + '</span></th>').join('') + '<th>Unassigned</th></tr></thead><tbody>' +
      Teams.GROUPS.map(g => { const gi = a.groups[g], un = a.unassigned.filter(p => Model.groupOf(Model.room(p)) === g).length;
        return '<tr><td>' + esc(g) + '</td><td>' + gi.total + '</td>' + Teams.COLORS.map(c => '<td>' + gi.counts[c] + '</td>').join('') + '<td>' + (un || '') + '</td></tr>'; }).join('') + '</tbody></table>';
    // Warnings can be accepted for good (kept in the data file): a repeated color per child, and uneven teams per quarter. An accepted warning stops being shown as a problem but is listed so it can be taken back.
    const ok = teamsOk(), qNow = $('tQuarter').value, canAccept = !!App.season;
    const repeats = a.repeats.filter(r => !ok.repeats.includes(r.person[X.ID])), acceptedRepeats = a.repeats.filter(r => ok.repeats.includes(r.person[X.ID]));
    const uneven = Teams.GROUPS.some(g => a.groups[g].spread > 1), unevenOk = ok.uneven.includes(qNow);
    const btn = (attr, val, text, title) => canAccept ? ' <button data-' + attr + '="' + esc(val) + '" title="' + esc(title) + '">' + text + '</button>' : '';
    if (repeats.length) h += '<div class="bad"><b>Repeated colors:</b><ul class="warnlist">' + repeats.slice(0, 12).map(r => '<li>' + link(r.person) + ' (' + r.color + ' again, had it in ' + r.quarter + ')' + btn('acc-rep', r.person[X.ID], 'Accept for good', 'Stop warning about this child having a repeated color (kept in the data file)') + '</li>').join('') + '</ul>' + (repeats.length > 12 ? '<p>and ' + (repeats.length - 12) + ' more.</p>' : '') + '</div>';
    const startedNow = !!App.season && TeamPlan.stateOf(App.season, calendar, qNow, App.today()) === 'locked';      // Re-draw is refused for a quarter that has started (A10)
    if (uneven && !unevenOk) h += '<p class="bad"><b>Uneven teams.</b> Hand edits or "never repeat a color" can force this; ' + (startedNow ? 'this quarter has started, so use the move box on the year grid (a dated move) to even them.' : 'Re-draw may fix it.') + btn('acc-uneven', qNow, 'Accept for ' + esc(qNow), 'Stop warning that the ' + qNow + ' teams are uneven (kept in the data file)') + '</p>';
    if (a.unassigned.length) h += '<p class="status">Unassigned: ' + nameList(a.unassigned.map(person => ({ person }))) + '</p>';
    else if (!repeats.length && !(uneven && !unevenOk)) h += '<p class="ok">All assigned, no repeats, teams even' + (acceptedRepeats.length || (uneven && unevenOk) ? ' (apart from what you accepted below)' : '') + '.</p>';
    if (acceptedRepeats.length || (uneven && unevenOk) || ok.repeats.length || ok.uneven.length) {
      h += '<details class="accepted"><summary>Accepted warnings (' + (ok.repeats.length + ok.uneven.length) + ')</summary><ul class="warnlist">' +
        ok.repeats.map(id => byId.get(id)).filter(Boolean).map(p => '<li>Repeated color allowed for ' + link(p) + btn('un-rep', p[X.ID], 'Warn again', 'Show the warning for this child again') + '</li>').join('') +
        ok.uneven.map(q => '<li>Uneven teams allowed in ' + esc(q) + btn('un-uneven', q, 'Warn again', 'Show the uneven-teams warning for ' + q + ' again') + '</li>').join('') + '</ul></details>';
    }
    const moves = App.season ? Object.keys(App.season.teamMoves || {}).reduce((l, id) => l.concat(App.season.teamMoves[id].filter(m => m.q === $('tQuarter').value).map(m => ({ id, m }))), []).filter(x => byId.has(x.id)) : [];
    if (moves.length) h += '<p class="status"><b>Mid-quarter moves in ' + esc($('tQuarter').value) + ':</b> ' + moves.map(x => esc(Model.fullName(byId.get(x.id))) + ' &rarr; ' + esc(x.m.team) + ' from ' + esc(x.m.from)).join('; ') + '. The counts above use the color each child plays now (the latest move); moves are made on the Person tab or the year grid.</p>';
    h += '<p class="status">Edit an individual kid on the Roster tab (Team column) or the Person tab. Print the lists from Reports → Color teams.</p>';
    // The year grid needs a data file (it reads the locks and the calendar); a roster alone keeps the plain list. With the grid, the list sorted by team color stays one click away.
    h += App.season && window.TeamGrid ? TeamGrid.html() + '<details class="tgsorted"' + (tsUi.open ? ' open' : '') + '><summary>Every child sorted by team color</summary>' + scheduleHtml() + '</details>' : scheduleHtml();
    const sc = wrap.querySelector('.tgscroll'), keep = sc ? { l: sc.scrollLeft, t: sc.scrollTop } : null;      // choosing a color redraws the grid: keep where it was scrolled to (flag 4: it used to jump back to the far left)
    wrap.innerHTML = h;
    if (keep) { const n = wrap.querySelector('.tgscroll'); if (n) { n.scrollLeft = keep.l; n.scrollTop = keep.t; } }
  }
  // ---- every child, every quarter, sorted by color: what is coming ----
  const tsUi = { sort: '', group: 'All', open: false };      // open: the "sorted by team color" section under the year grid
  $('teamsWrap').addEventListener('toggle', e => { if (e.target.classList && e.target.classList.contains('tgsorted')) tsUi.open = e.target.open; }, true);
  const teamsOk = () => { const c = (App.season && App.season.config && App.season.config.teamsOk) || {}; return { repeats: Array.isArray(c.repeats) ? c.repeats : [], uneven: Array.isArray(c.uneven) ? c.uneven : [] }; };
  function scheduleHtml() {
    const now = App.quarterNow ? App.quarterNow() : settings.quarter, Q = Teams.QUARTERS, qi = Q.indexOf(now);
    const sortQ = Q.includes(tsUi.sort) ? tsUi.sort : (Q[qi + 1] || now);
    const kids = master.people.filter(p => Model.isActive(p) && Model.isClubber(p) && Teams.GROUPS.includes(Model.groupOf(Model.room(p))) && (tsUi.group === 'All' || Model.groupOf(Model.room(p)) === tsUi.group));
    const ORDER = App.teamColors(), teamIn = (p, q) => teamEff(p, q).color, rank = p => { const i = ORDER.indexOf(teamIn(p, sortQ)); return i < 0 ? 99 : i; };      // the effective color: a move replaces the roster color
    kids.sort((x, y) => rank(x) - rank(y) || Model.byRoomThenName(x, y));
    const chip = (p, q) => { const t = teamIn(p, q), e = teamEff(p, q), mv = e.moved.length ? ' title="moved from ' + esc(Model.md(e.moved[e.moved.length - 1].from)) + '"' : ''; return t ? '<span class="team team-' + esc(t) + '"' + mv + '>' + esc(t) + (e.moved.length ? '*' : '') + '</span>' : Model.teamOf(p, q) ? '<span class="none" title="not one of the four colors">' + esc(Model.teamOf(p, q)) + '</span>' : '<span class="none">&mdash;</span>'; };      // a value that is not one of the four colors stays visible as plain text instead of vanishing      // a color comes from the data file, so it is escaped like every other value
    const state = q => Q.indexOf(q) < qi ? 'past' : Q.indexOf(q) === qi ? 'now' : 'coming';
    let h = '<h3>Every child, every quarter</h3><p class="status">Sorted by the color in the quarter you pick, so you can see who will be on which team. Quarters after the current one (' + esc(now) + ') are what is coming.</p>' +
      '<p>Sort by <select id="tsSort">' + Q.map(q => '<option value="' + q + '"' + (q === sortQ ? ' selected' : '') + '>' + q + (state(q) === 'now' ? ' (now)' : state(q) === 'coming' ? ' (coming)' : '') + '</option>').join('') + '</select> ' +
      '&nbsp; Group <select id="tsGroup">' + ['All'].concat(Teams.GROUPS).map(g => '<option' + (g === tsUi.group ? ' selected' : '') + '>' + esc(g) + '</option>').join('') + '</select> ' + (App.flagPlaceBtn ? App.flagPlaceBtn({ level: 'team', quarter: sortQ, group: tsUi.group }, 'color teams ' + sortQ + ' (' + tsUi.group + ')') + ' ' : '') +
      '<span class="status">' + ORDER.map(c => c + ' ' + kids.filter(p => teamIn(p, sortQ) === c).length).join(' &middot; ') + ' &middot; none ' + kids.filter(p => !teamIn(p, sortQ)).length + ' (in ' + esc(sortQ) + ')</span></p>';
    let last = null, rows = '';
    kids.forEach(p => {
      const c = teamIn(p, sortQ) || 'none';
      if (c !== last) { rows += '<tr class="grouprow"><td colspan="' + (2 + Q.length) + '">' + (c === 'none' ? 'No color yet in ' + esc(sortQ) : '<span class="team team-' + esc(c) + '">' + esc(c) + '</span> in ' + esc(sortQ)) + '</td></tr>'; last = c; }
      rows += '<tr><td>' + link(p) + '</td><td>' + esc(Model.room(p)) + '</td>' + Q.map(q => '<td class="' + (q === sortQ ? 'sortcol ' : '') + state(q) + '">' + chip(p, q) + '</td>').join('') + '</tr>';
    });
    return h + '<div class="scroll" style="max-height:none"><table class="roster sched"><thead><tr><th>Name</th><th>Class</th>' + Q.map(q => '<th class="' + (q === sortQ ? 'sortcol' : '') + '">' + q + (state(q) === 'now' ? ' <small>now</small>' : state(q) === 'coming' ? ' <small>coming</small>' : '') + '</th>').join('') + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }
  $('teamsWrap').addEventListener('change', e => {
    if (window.TeamGrid && TeamGrid.handle(e)) { renderTeams(); TeamGrid.restoreFocus($('teamsWrap')); return; }
    if (e.target.id === 'tsSort') { tsUi.sort = e.target.value; renderTeams(); }
    if (e.target.id === 'tsGroup') { tsUi.group = e.target.value; renderTeams(); }
  });
  $('teamsWrap').addEventListener('click', e => {
    if (window.TeamGrid && TeamGrid.handle(e)) { renderTeams(); TeamGrid.restoreFocus($('teamsWrap')); return; }
    const a = e.target.closest('a[data-person]'); if (a) { e.preventDefault(); App.showPerson(a.dataset.person); return; }
    const b = e.target.closest('button[data-acc-rep],button[data-un-rep],button[data-acc-uneven],button[data-un-uneven]'); if (!b || !App.season) return;
    const cfg = App.season.config, cur = teamsOk(), d = b.dataset;
    const add = (list, v) => list.includes(v) ? list : list.concat(v).sort(), drop = (list, v) => list.filter(x => x !== v);
    if (d.accRep) cur.repeats = add(cur.repeats, d.accRep); if (d.unRep) cur.repeats = drop(cur.repeats, d.unRep);
    if (d.accUneven) cur.uneven = add(cur.uneven, d.accUneven); if (d.unUneven) cur.uneven = drop(cur.uneven, d.unUneven);
    cfg.teamsOk = cur; touch(); renderTeams();
  });
  App.goTeams = (q, g) => { if (Teams.QUARTERS.includes(q)) tsUi.sort = q; tsUi.group = g === 'All' || Teams.GROUPS.includes(g) ? g : 'All'; App.showTab('teams'); };      // Go on a color teams note: the quarter and group it is about
  $('tQuarter').addEventListener('change', e => { setQuarter(e.target.value); $('sQuarter').value = settings.quarter; renderTeams(); renderRoster(); });
  function runAssign(redo, scopeId) {
    if (!master) return App.ask.alert('Load a roster first.');
    const q = $('tQuarter').value, locked = !!App.season && TeamPlan.stateOf(App.season, calendar, q, App.today()) === 'locked';
    // A re-draw clears the whole quarter, so a quarter that has started or is locked is never re-drawn (Assign blanks only fills empty cells, which is how a new child gets a color mid-quarter).
    if (redo && locked) return App.ask.alert(q + ' has started or is locked, so it cannot be re-drawn. Change a color in the year grid (a dated move), or unlock the quarter first if you locked it yourself.');
    const finish = r => {
      // What the draw wrote is a projection, not a hand-set color: mark it, so the quarter is not half pins and half projection (a mark that happens to match would read as projected).
      if (App.season && !locked) r.assigned.forEach(x => TeamPlan.setProjected(App.season, x.person[X.ID], q, x.color));
      touch(); refresh(); renderTeams(r.assigned.length ? 'Assigned ' + r.assigned.length + ' kids for ' + q + (redo ? ' (re-drawn)' : '') + ': ' + nameList(r.assigned) + '.' : 'Nothing to assign: everyone already has a ' + q + ' color.');
      if (redo) App.done('Every ' + q + ' color for Sparks and T&T was cleared and drawn again.');
    };
    if (redo) {      /* the same preview as Assign blanks: the proposed colors, the warnings, Draw again, and nothing changes until Confirm (D6) */
      const drawRedo = rng => { const r = Teams.previewRedo(master, q, { rng, history: App.teamHistory() }); return { r, rows: r.assigned.map(x => ({ p: x.person, q, color: x.color })) }; };
      if (!drawRedo(Math.random).rows.length) return finish({ assigned: [], kept: 0 });
      TeamGrid.preview({
        title: 'Re-draw ' + q + ' colors', intro: 'Every ' + q + ' color for Sparks and T&T is cleared and drawn again (a color that came from a move is kept, and No team children are left alone).', draw: drawRedo,
        apply: res => { Teams.applyRedo(master, q, res.r); finish(res.r); },
        cancel: () => { const b = $('btnTeamRedo'); if (b) b.focus(); },
      });
      return;
    }
    // Fill blanks (UX-18, one button): draw a proposal without writing (dry), show it with the choice of what it covers (this quarter, or every open quarter), and write only the colors shown when Confirm is pressed (no second draw).
    const draw = rng => { const r = Teams.assign(master, q, { dry: true, rng, history: App.teamHistory() }); return { r, rows: r.assigned.map(x => ({ p: x.person, q, color: x.color })) }; };
    const qScope = { id: 'q', label: 'This quarter (' + q + ')', intro: 'These children have no ' + q + ' color. Colors already set, pins and No team children are kept.', draw,
      apply: res => { Model.addUserCol(master, 'team:' + q); res.r.assigned.forEach(x => { x.person['team:' + q] = x.color; }); finish(res.r); } };
    const allScope = App.season ? TeamGrid.allScope() : null, scopes = allScope ? [qScope, allScope] : [qScope];
    const hasRows = sc => !!sc.draw(Math.random).rows.length, want = scopes.find(s => s.id === (scopeId === 'all' ? 'all' : 'q')) || qScope, pick = hasRows(want) ? want : scopes.find(hasRows);
    if (!pick) return finish({ assigned: [], kept: 0 });
    TeamGrid.preview({ title: 'Fill blank colors', intro: '', scopes, scope: pick.id, cancel: () => { const b = $('btnTeamFill'); if (b) b.focus(); } });
  }
  // The CSV buttons save a template for each file the app can read back in (colors, calendar, rotation); an empty calendar or rotation gives the header row to start from.
  const saveCsv = (btn, name, text) => App.testGate(btn, () => App.download(name, text, 'text/csv;charset=utf-8'));
  const yearTag = () => (App.season && App.season.year) || String(new Date().getFullYear());
  $('btnTeamCsv').addEventListener('click', e => { if (!master) return App.ask.alert('Load a roster first.'); saveCsv(e.target, 'Color teams ' + yearTag() + '.csv', Teams.exportList(master)); });
  $('btnCalCsv').addEventListener('click', e => saveCsv(e.target, 'Calendar ' + yearTag() + '.csv', Calendar.toCsv(calendar)));
  $('btnTeamFill').addEventListener('click', () => runAssign(false, 'q'));
  App.fillBlanks = scope => runAssign(false, scope);
  $('btnTeamRedo').addEventListener('click', () => { runAssign(true); });      /* a preview first, then Confirm (D6) */
  $('fileTeams').addEventListener('change', async e => {
    const f = await readFile(e.target); if (!f || !master) return;
    markTest(f.name);
    try {
      const q = $('tQuarter').value, r = Teams.importList(master, q, f.text);
      touch(); refresh();
      const bits = [r.set + ' colors set'];
      ['unmatched', 'invalid', 'ambiguous', 'skipped'].forEach(k => { if (r[k].length) bits.push(k + ': ' + r[k].map(esc).join(', ')); });
      renderTeams(bits.join(' · '));
    } catch (err) { App.ask.alert(err.message); }
  });
  $('btnTeamYear').addEventListener('click', () => {
    if (!master) return App.ask.alert('Load a roster first.');
    App.ask.form({ title: 'Start a new color year', message: 'This year’s colors are archived under a label, and the quarters start blank.', ok: 'Archive and start', fields: [
      { name: 'label', label: 'Label for this year’s colors', type: 'text', required: true, value: App.season && App.season.year ? App.season.year : '', pattern: '\\d{4}-(\\d{2}|\\d{4})', hint: 'Like 2026-27.' }] }).then(v => {
    if (!v) return;
    try {
      const r = App.archiveColors(v.label.trim());
      touch(); refresh(); renderTeams(r.archived.length ? 'Archived ' + r.archived.join(', ') + '. Q1 is blank; press Assign blanks for a fresh random, even split.' + (r.clearedNoTeam ? ' ' + r.clearedNoTeam + ' "No team" mark' + (r.clearedNoTeam === 1 ? ' was' : 's were') + ' cleared.' : '') : 'No colors to archive.');
    } catch (err) { App.ask.alert(err.message); }
    });
  });
  // Start a new color year: the four quarters' colors are archived under `label`, and everything that belonged to last year's quarters is cleared with them: the plan's locks, dated moves, accepted repeats and "No team" marks (Fable review A6).
  // Used by the Start new year button and by New season, so a new season does not show last year's colors as this year's (A7).
  App.archiveColors = label => {
    const r = Teams.startNewYear(master, label);
    if (App.season) TeamPlan.newYear(App.season);
    setQuarter('Q1'); const sq = $('sQuarter'); if (sq) sq.value = 'Q1';
    return r;
  };

  // ---------- uniforms tab ----------
  // Size, Ordered, Received, Given out and Notes are this app's own records (Planning Center only says the family ordered and paid). The older size-at-ordering and size-given boxes show only for a file that has data in them.
  // Ordered, Received and Given out are dates: a date picker with a Today button. A value that is not a date (typed in free text before) stays as a text box marked "not a date" until it is replaced with one.
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  App.uniDateHtml = (col, v, noDate = '') => {
    const input = !v || ISO_DATE.test(v)
      ? '<input type="date" data-u="' + col + '" data-udate="1" value="' + esc(v) + '" aria-label="' + esc(col.replace(/^x_Uni_/, '').replace(/Date$/, '')) + ' date">'
      : '<input type="text" class="baddate" data-u="' + col + '" data-udate="1" value="' + esc(v) + '" title="This is not a date. Type a date (yyyy-mm-dd) or clear it.">';
    const controls = noDate ? '<span class="uni-date-line">' + input + noDate + '</span>' : input;
    return '<span class="pcell">' + controls + (v ? '' : '<button type="button" class="todaybtn" data-utoday="' + col + '">Today</button>') + '</span>';
  };
  // What mid-quarter moves add to the no-repeat rule and the Quarter 4 fallback (teams.js, teamplan.js): the colors a child played, and the nights on each. Undefined without a data file.
  App.teamHistory = () => App.season && App.calendar ? p => Season.colorHistory(App.season, String(p[Model.X.ID]), q => Model.teamOf(p, q), App.calendar) : undefined;
  // Typing over a date that is already in a date box. The browser reports a whole new date after EVERY digit (7/5/2026 plus a typed "1" in the month is 1/5/2026, a complete date), so a box that
  // commits as you type saves the half-typed date and, on the progress sheet, jumps to the next box before the rest is typed. So a box that held a date when you entered it is HELD: its changes
  // are not committed while you type, only when you leave the box or press Enter. An empty box still saves the moment a whole date is typed. A date that is not finished (a month with no
  // such day, a missing part) reads back as empty, so leaving it must not clear the saved date: App.dateUnfinished tells those apart from a date cleared on purpose.
  // "Held" is decided at the first keystroke in the box (the value then is what was there before typing). A date picked from the calendar pop-up, or set by a button, never passes through a keystroke and saves at once.
  document.addEventListener('focusin', e => { const t = e.target; if (t.type === 'date') { t._had = undefined; t._held = false; } }, true);
  document.addEventListener('keydown', e => { const t = e.target; if (t.type === 'date' && t._had === undefined && !e.ctrlKey && !e.metaKey && !e.altKey && (/^\d$/.test(e.key) || ['Backspace', 'Delete', 'ArrowUp', 'ArrowDown'].includes(e.key))) t._had = !!t.value; }, true);
  App.dateHeld = t => { if (t.type !== 'date' || !t._had || t._release) return false; t._held = true; return true; };      // (not tested against document.activeElement: the browser reports the page body for a moment when a typed month completes and moves on to the day)
  App.dateUnfinished = t => !!(t.type === 'date' && t.validity && t.validity.badInput);
  document.addEventListener('focusout', e => {      // a held Uniform date is committed as the box is left (the sheet's boxes commit on leaving by their own handlers)
    const t = e.target; if (t.type !== 'date') return; const held = t._held; t._held = false;
    if (held && t.dataset.udate && !App.dateUnfinished(t)) { t._release = true; t.dispatchEvent(new Event('change', { bubbles: true })); t._release = false; }
    t._had = undefined;      // typing is over: a later change (a button, a pop-up pick) saves at once
  }, true);
  App.uniDateOk = t => { if (!t.dataset.udate || t.type !== 'date') return true; if (App.dateUnfinished(t)) return false; if (!t.value) return true; const y = +t.value.slice(0, 4); return y >= 1990 && y <= 2100; };      // a year still being typed (0002-...) is not saved yet
  App.updateUniformGivenFlag = (box, p) => {
    box.disabled = Model.uniHasGivenDate(p);
    box.checked = !box.disabled && !!p[Model.UNI.GIVEN_FLAG];
  };
  // The sizes first, then the dates, then Notes: what you see, the Tab order and a screen reader's order are the same on a computer and in the phone cards.
  const UNI_FIELDS = [['SIZE_VERIFIED', 'Size', 1], ['SIZE_ORDERED', 'Size ordered', 1, 1], ['SIZE_GIVEN', 'Size given', 1, 1], ['ORDERED', 'Ordered', 0], ['RECEIVED', 'Received', 0], ['GIVEN', 'Given out', 0], ['NOTES', 'Notes', 0]];
  function renderUniforms() {
    const wrap = $('uniWrap');
    if (!master) { wrap.innerHTML = '<p style="padding:16px" class="status">Load a roster first.</p>'; return; }
    const f = $('uFilter').value, U = Model.UNI, fields = UNI_FIELDS.filter(x => !x[3] || Model.uniformLegacy(master.people).sizes);
    const everyone = master.people.filter(p => Model.isActive(p) && Model.isClubber(p) && Model.uniformItems(p).length);
    const list = everyone.filter(p =>
      !f || (f === 'order' && Model.uniToOrder(p)) || (f === 'receive' && p[U.ORDERED] && Model.uniToReceive(p)) || (f === 'give' && p[U.RECEIVED] && !Model.uniGiven(p))).sort(Model.byRoomThenName);
    wrap.innerHTML = !everyone.length ? '<p style="padding:16px" class="status">Nobody has a uniform to track: this export has no uniform column with an order in it (the Planning Center columns window, or the Debug tab, says what was found).</p>' :
      '<table class="roster uni"><thead><tr><th class="wr">Name</th><th class="wr">Class</th>' +
      fields.map(x => '<th>' + x[1] + '</th>').join('') + '</tr></thead><tbody>' + list.map(p => {
        const noDate = '<label class="uov" title="Handed over, but I do not have the date. Counts as given out, like a date."><input type="checkbox" data-uflag="' + U.GIVEN_FLAG + '"' + (Model.uniHasGivenDate(p) ? ' disabled' : p[U.GIVEN_FLAG] ? ' checked' : '') + '> no date</label>';
        return '<tr data-id="' + esc(p[X.ID]) + '"><td class="wr uname">' + esc(Model.fullName(p)) + '</td><td class="wr uclass">' + esc(Model.room(p)) + '</td>' +
          fields.map(x => '<td class="' + (x[2] ? 'sm' : x[0] === 'NOTES' ? 'unotes' : 'udate') + '" data-label="' + x[1] + '">' + (['ORDERED', 'RECEIVED', 'GIVEN'].includes(x[0]) ? App.uniDateHtml(U[x[0]], p[U[x[0]]], x[0] === 'GIVEN' ? noDate : '') : '<input type="text" data-u="' + U[x[0]] + '" value="' + esc(p[U[x[0]]]) + '">') + '</td>').join('') + '</tr>';
      }).join('') + '</tbody></table>';
    wrap.querySelectorAll('tbody tr[data-id]').forEach(tr => { const who = tr.querySelector('.uname').textContent.trim(); tr.querySelectorAll('input[data-udate], input[data-uflag]').forEach(e => { const l = e.getAttribute('aria-label') || (e.dataset.uflag ? 'Given out, no date' : ''); if (l && !l.includes(who)) e.setAttribute('aria-label', l + ', ' + who); }); });      // every box says whose it is, now that on a phone the name is only the card's title
    $('uCount').textContent = list.length + ' shown';
    /* UX-25: bulk buttons act only on the rows shown that have no date in that column */
    [['uBulkOrdered', 'ORDERED', 'ordered'], ['uBulkReceived', 'RECEIVED', 'received']].forEach(([id, k, w]) => { const n = list.filter(p => !p[U[k]]).length, b = $(id); b.textContent = 'Mark the ' + n + ' shown as ' + w + ' today'; b.disabled = !n; b.dataset.n = n; });
  }
  $('uniWrap').addEventListener('change', e => {
    const flag = e.target.dataset.uflag, col = e.target.dataset.u, tr = e.target.closest('tr');
    if (flag && tr) { Model.setUniformField(byId.get(tr.dataset.id), flag, e.target.checked ? '1' : ''); touch(); renderUniforms(); return; }      // the no-date box: the filter and count follow it at once
    if (!col || !tr) return;
    if (App.dateHeld(e.target) || !App.uniDateOk(e.target)) return;      // a date being typed over, or a year still being typed: saved when the box is left
    const p = byId.get(tr.dataset.id);
    Model.setUniformField(p, col, e.target.value);
    if (col === Model.UNI.GIVEN) App.updateUniformGivenFlag(tr.querySelector('input[data-uflag]'), p);
    touch();
    if (e.target.dataset.udate && e.target.type === 'text' && ISO_DATE.test(e.target.value)) renderUniforms();      // a typed-over legacy value is a date now: show the picker
  });
  $('uniWrap').addEventListener('focusout', e => { const t = e.target, tr = t.closest && t.closest('tr'); if (tr && t.dataset && t.dataset.udate && !App.uniDateOk(t)) t.value = byId.get(tr.dataset.id)[t.dataset.u] || ''; });
  $('uniWrap').addEventListener('click', e => { const b = e.target.closest('button[data-utoday]'), tr = b && b.closest('tr'); if (!b || !tr) return; Model.setUniformField(byId.get(tr.dataset.id), b.dataset.utoday, App.today()); touch(); renderUniforms(); });
  $('uFilter').addEventListener('change', renderUniforms);
  [['uBulkOrdered', 'ORDERED', 'ordered'], ['uBulkReceived', 'RECEIVED', 'received']].forEach(([id, k, w]) => $(id).addEventListener('click', () => {
    const U = Model.UNI, f = $('uFilter').value, rows = [...$('uniWrap').querySelectorAll('tbody tr')].map(tr => byId.get(tr.dataset.id)).filter(p => p && !p[U[k]]); if (!rows.length) return;
    const today = App.today(); rows.forEach(p => { p[U[k]] = today; }); touch(); renderUniforms();
    App.done(rows.length + ' ' + (rows.length === 1 ? 'child' : 'children') + ' marked ' + w + ' today. Rows that already had a date were left alone.');
  }));

  // ---------- calendar tab ----------
  const calTouch = () => { App.changed(); renderCalStatus(); };
  const clubDay = () => App.season && Number.isInteger(App.season.config.clubDay) ? App.season.config.clubDay : 3;
  function renderCalStatus() {
    const off = Calendar.offDays(calendar, clubDay()).length;
    $('calStatus').textContent = calendar.length ? calendar.length + ' dates' + (App.dirty() ? ' · UNSAVED CHANGES' : '') : 'No calendar loaded';
    $('calStatus').className = 'status' + (App.dirty() ? ' dirty' : '');
    $('calDayWarn').textContent = off ? '\u26a0 ' + off + ' club night' + (off === 1 ? ' is' : 's are') + ' not on a ' + Calendar.DAYS[clubDay()] : '';
  }
  const CAL_TEXT = ['Theme', 'Notes', 'Puggles Lesson', 'Cubbies Lesson', 'Sparks Lesson', 'T&T Lesson'];
  let calSub = 'dates';      // N2: the Calendar tab has two views of the same rows: Dates (everything about a night) and Lessons by week (the lesson for each group, night by night)
  function renderCalendar() {
    if (applyQuarter()) { renderRoster(); renderReport(); }
    renderCalStatus();
    $('calClubDay').innerHTML = Calendar.DAYS.map((d, i) => '<option value="' + i + '"' + (i === clubDay() ? ' selected' : '') + '>' + d + '</option>').join('');
    $('calClubDay').disabled = !App.season;
    document.querySelectorAll('#calSubs button').forEach(b => { const on = b.dataset.calsub === calSub; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    if (!calendar.length) { $('calWrap').innerHTML = '<p style="padding:16px" class="status">Use Make calendar or add dates one at a time.</p>'; return; }
    if (calSub === 'lessons') { $('calWrap').innerHTML = lessonsGrid(); return; }
    const opt = (list, v) => list.map(x => '<option' + (x === v ? ' selected' : '') + '>' + x + '</option>').join('');
    $('calWrap').innerHTML = '<table class="roster"><thead><tr><th>Date</th><th>Day</th><th>Type</th><th>Quarter</th><th>Meets</th><th>Start time</th><th>End time</th>' + CAL_TEXT.map(c => '<th>' + esc(c) + '</th>').join('') + '<th></th></tr></thead><tbody>' +
      calendar.map((r, i) => '<tr data-i="' + i + '"><td><input type="date" data-c="Date" value="' + esc(r.Date) + '"></td>' +
        (Calendar.offDay(r, clubDay()) ? '<td class="dow-off" title="Club meets on ' + Calendar.DAYS[clubDay()] + 's">\u26a0 ' : '<td>') + (/^\d{4}-\d{2}-\d{2}$/.test(r.Date) ? Calendar.dayName(Calendar.weekday(r.Date)) : '') + '</td>' +
        '<td><select data-c="Type">' + opt(Calendar.TYPES, r.Type) + '</select></td><td><select data-c="Quarter">' + opt(Calendar.QUARTERS, r.Quarter) + '</select></td>' +
        '<td>' + (r.Type === 'Event' ? '' : '<select data-c="State">' + [['meets', 'Meets'], ['planned', 'No club'], ['cancelled', 'Cancelled']].map(([key, label]) =>
          '<option value="' + key + '"' + (key === Calendar.stateOf(r) ? ' selected' : '') + '>' + label + '</option>').join('') + '</select>' +
          (Calendar.stateOf(r) === 'cancelled' ? '<input data-c="Cancelled" aria-label="Cancellation reason" placeholder="Reason" value="' + esc(r.Cancelled === 'Cancelled' ? '' : r.Cancelled) + '">' : '') +
          (r.Holiday ? '<small> ' + esc(r.Holiday) + '</small>' : '')) + '</td>' +
        ['Start Time', 'End Time'].map(c => '<td><input type="time" data-c="' + c + '" value="' + esc(r[c] || '') + '"></td>').join('') +
        CAL_TEXT.map(c => '<td><input type="text" data-c="' + esc(c) + '" value="' + esc(r[c]) + '" size="' + (c === 'Theme' || c === 'Notes' ? 26 : 14) + '"></td>').join('') +
        '<td><button data-del="' + i + '">Delete</button></td></tr>').join('') + '</tbody></table>';
  }
  // Only the Calendar maker calls this after checking a fresh proposal inside commitScope.
  App.applyCalendarProposal = (rows, settings) => {
    calendar = rows;
    Object.assign(App.season.config, settings);
    const changed = App.importChanged('Make calendar');
    refresh();
    return changed;
  };
  // Lessons by week (N2): one row for each club night (events are left out), the theme to read, and a box for the lesson of each group that is switched on. A planned No Club night shows NO CLUB and takes no lesson.
  // The boxes are the calendar's own lesson cells, so typing here is the same as typing on Dates (commitCal), and the Lessons by week report reads them. The switches are the file's config.lessons.
  let lessonGroup = 'Puggles';
  function editLessonSeries() {
    const file = App.season, group = lessonGroup;
    const series = Calendar.lessonSeries(file.config, group);
    const dates = [...new Set(Calendar.nights(calendar).map(row => row.Date).concat(series.from || []))].sort();
    const actions = [['move', 'Move to the next club night'], ['skip', 'Skip this lesson']];
    const numbering = { name: 'mode', values: ['numbered'] };
    App.ask.form({
      title: group + ' weekly lesson series', ok: 'Save series',
      message: 'The series fills nights with empty lesson cells. A typed lesson stays in place. Use a dash for a night without a lesson.',
      fields: [
        { name: 'from', label: 'First night', type: 'select', value: series.from, options: [['', 'First club night'], ...dates.map(date => [date, date])] },
        { name: 'mode', label: 'Lesson list', type: 'select', value: 'manual', options: [['manual', 'Edit the list'], ['numbered', 'Generate lesson numbers']] },
        { name: 'items', label: 'One lesson per line', type: 'textarea', value: series.items.join('\n'), showIf: { name: 'mode', values: ['manual'] } },
        { name: 'units', label: 'Units', type: 'number', min: 1, max: 50, value: 4, required: true, showIf: numbering },
        { name: 'count', label: 'Lessons per unit', type: 'number', min: 1, max: 50, value: 8, required: true, showIf: numbering },
        { name: 'start', label: 'Start at', value: '1.1', required: true, showIf: numbering },
        { name: 'planned', label: 'Planned break', type: 'select', options: actions, value: series.planned },
        { name: 'unplanned', label: 'Cancellation', type: 'select', options: actions, value: series.unplanned }
      ],
      validate: data => data.mode === 'numbered' && !Calendar.numberItems(data.units, data.count, data.start.trim()).length
        ? { name: 'start', message: 'Enter an available lesson number, like 1.1.' } : ''
    }).then(data => {
      if (!data || App.season !== file) return;
      const items = data.mode === 'numbered' ? Calendar.numberItems(data.units, data.count, data.start.trim()) :
        data.items.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
      setLessons(cfg => { Object.assign(cfg.groups[group], { items, from: data.from, planned: data.planned, unplanned: data.unplanned }); });
    });
  }
  function lessonsGrid() {
    const L = Calendar.lessonSettings(App.season && App.season.config, calendar);
    if (!App.season) return '<p style="padding:16px" class="status">Open a data file first: the lessons settings are kept in it.</p>';
    if (!L.on) return '<div style="padding:16px"><p class="status">Lessons by week are off. Turn them on to type the lesson for each group, night by night (Puggles, for example, have a lesson number each week). The Lessons by week report prints them.</p><p><button type="button" id="btnLessonsOn" class="primary">Turn on lessons by week</button></p></div>';
    const groups = Calendar.GROUPS.filter(g => L.groups[g].on);
    const bar = '<div class="bar" style="margin:6px 0">Groups with a lesson each week: ' + Calendar.GROUPS.map(g => '<label><input type="checkbox" data-lg="' + esc(g) + '"' + (L.groups[g].on ? ' checked' : '') + '> ' + esc(g) + '</label>').join(' ') + ' <button type="button" id="btnLessonsOff">Turn off lessons by week</button></div>' +
      '<p class="status" style="margin:0 0 6px">Type each night\u2019s lesson, for example 1.1 God Made the Light. A group that works through its books in turn (Sparks) has no lesson by week: switch it off and it leaves this grid and the report. Changes are kept with Apply, like the other Calendar changes.</p>';
    if (!groups.length) return bar + '<p class="status">Every group is switched off.</p>';
    if (!groups.includes(lessonGroup)) lessonGroup = groups[0];
    const seriesBar = '<div class="bar"><label>Weekly series for <select id="calLessonGroup">' +
      groups.map(g => '<option' + (g === lessonGroup ? ' selected' : '') + '>' + esc(g) + '</option>').join('') +
      '</select></label><button type="button" id="btnLessonSeries">Edit series…</button></div>';
    const planned = new Map(groups.map(g => [g, Calendar.lessonsFor(calendar, g, App.season.config)]));
    const lesson = (r, group) => {
      const field = Calendar.lessonCol(group), pdf = Calendar.coloringCol(group), date = Calendar.short(r.Date);
      const item = planned.get(group).get(r.Date);
      const placeholder = item?.kind === 'series' ? item.text : '';
      return '<td><input type="text" data-c="' + esc(field) + '" value="' + esc(r[field]) + '" size="16" placeholder="' + esc(placeholder) + '" aria-label="' + esc(group + ' lesson, ' + date) + '">' +
        '<details><summary>' + (r[pdf] ? 'Edit coloring PDF' : 'Add coloring PDF') + '</summary><input type="url" data-c="' + esc(pdf) + '" data-coloring-pdf value="' + esc(r[pdf]) + '" size="16" placeholder="https://…" aria-label="' + esc(group + ' coloring PDF, ' + date) + '"></details></td>';
    };
    const cells = r => {
      if (Calendar.isNight(r)) return groups.map(g => lesson(r, g)).join('');
      const status = r.Cancelled ? 'CANCELLED' + (r.Cancelled === 'Cancelled' ? '' : ' (' + r.Cancelled + ')') : 'NO CLUB';
      const detail = groups.map(g => ({ group: g, item: planned.get(g).get(r.Date) })).filter(x => x.item?.text);
      return '<td colspan="' + groups.length + '" class="status"><b>' + esc(status) + '</b>' +
        (r.Notes ? ' · ' + esc(r.Notes) : '') + detail.map(({ group, item }) =>
          '<span> · ' + esc(group) + ' ' + (item.kind === 'missed' ? '<s>' + esc(item.text) + '</s> skipped' :
            esc(item.text) + ' (typed)') + '</span>').join('') + '</td>';
    };
    const rows = calendar.map((r, i) => r.Type === 'Event' ? '' : '<tr data-i="' + i + '"><td>' + esc(Calendar.short(r.Date)) + '</td><td>' +
      (/^\d{4}-\d{2}-\d{2}$/.test(r.Date) ? Calendar.dayName(Calendar.weekday(r.Date)) : '') + '</td><td>' + esc(r.Theme) + '</td>' + cells(r) + '</tr>').join('');

    return bar + seriesBar + '<table class="roster lessonsgrid"><thead><tr><th>Date</th><th>Day</th><th>Theme</th>' + groups.map(g => '<th>' + esc(g) + '</th>').join('') + '</tr></thead><tbody>' + rows + '</tbody></table>';
  }
  const setLessons = fn => {
    const file = App.season; if (!file) return;
    App.commitScope(() => {
      if (App.season !== file) return;
      const prior = file.config.lessons || {}, view = Calendar.lessonSettings(file.config, calendar);
      const cur = { on: view.on, groups: Object.assign({}, prior.groups) };
      Calendar.GROUPS.forEach(g => { cur.groups[g] = Object.assign({}, cur.groups[g], view.groups[g]); });
      fn(cur);
      if (JSON.stringify(cur) === JSON.stringify(prior)) return;
      file.config.lessons = cur;
      App.changed();
      renderCalendar(); renderReport();
    });
  };
  $('calSubs').addEventListener('click', e => { const b = e.target.closest('button[data-calsub]'); if (b && b.dataset.calsub !== calSub) { calSub = b.dataset.calsub; renderCalendar(); } });
  $('calWrap').addEventListener('click', e => { if (e.target.id === 'btnLessonsOn') setLessons(c => { c.on = true; }); else if (e.target.id === 'btnLessonsOff') setLessons(c => { c.on = false; }); else if (e.target.id === 'btnLessonSeries') editLessonSeries(); });
  $('calWrap').addEventListener('change', e => { if (e.target.dataset && e.target.dataset.lg) setLessons(c => { c.groups[e.target.dataset.lg].on = e.target.checked; }); else if (e.target.id === 'calLessonGroup') lessonGroup = e.target.value; });
  // A date box fires "change" as soon as what is typed is a valid date (typing "1" in the month already is), which would re-sort the row and move you away mid-typing. So a date is committed
  // when you leave the box or press Enter; every other box commits as before. A year outside 2000 to 2100 is treated as not finished and is put back.
  const plausibleDate = v => { const y = +String(v).slice(0, 4); return v === '' || (y >= 2000 && y <= 2100); };
  function checkCalendarReplacement(candidate) {
    if (candidate.some(row => !row || !Season.isRealDate(row.Date))) throw new Error('The replacement has an invalid calendar date.');
    if (!App.season) return;
    const impacts = CalendarSafety.compare(App.season, calendar, candidate, App.today());
    if (impacts.blocks.length) throw new Error('This replacement affects recorded activity or locked quarters. Use Make calendar to keep those dates. ' + CalendarSafety.summary(impacts.blocks));
  }
  const calendarStructure = ['Date', 'Type', 'Quarter', 'State'];
  function structuralCalendarEdit(index, field, row, apply) {
    if (!App.season) { apply(); return; }
    const candidate = calendar.slice();
    if (row) candidate[index] = row; else candidate.splice(index, 1);
    const openFile = App.season, original = calendar[index];
    const impact = () => CalendarSafety.compare(openFile, calendar, candidate, App.today()).blocks;
    const blocks = impact();
    if (!blocks.length) { apply(); return; }
    renderCalendar();
    if (field === 'Date' || field === 'Delete') {
      App.flash('This calendar date is protected. Add a new row instead. ' + CalendarSafety.summary(blocks), 'warn');
      return;
    }
    const before = JSON.stringify(calendar), initialImpact = JSON.stringify(blocks);
    App.ask.confirm('This edit can affect scheduled nights and totals. ' + CalendarSafety.summary(blocks) + '. Apply it to this row?', {
      title: 'Review this calendar edit', ok: 'Apply to this row', danger: true
    }).then(ok => {
      if (!ok || App.season !== openFile || calendar[index] !== original) return;
      if (JSON.stringify(calendar) !== before || JSON.stringify(impact()) !== initialImpact) {
        App.flash('The calendar or club records changed. Review the edit again.', 'warn'); return;
      }
      apply();
    });
  }
  function commitCal(t) {
    const c = t.dataset.c, tr = t.closest('tr'); if (!c || !tr) return;
    const r = calendar[+tr.dataset.i]; if (!r) return;
    const input = t.type === 'checkbox' ? (t.checked ? '1' : '') : t.value;
    const coloring = t.hasAttribute('data-coloring-pdf');
    const v = coloring ? Calendar.coloringUrl(input) : input;
    if (coloring && input.trim() && !v) { t.value = r[c] || ''; App.flash('Use an HTTPS link to a coloring PDF.', 'error'); return; }
    if (coloring) { t.value = v; t.closest('details').querySelector('summary').textContent = v ? 'Edit coloring PDF' : 'Add coloring PDF'; }
    if (t.type === 'date') { const bad = Check.date(v); if (bad) { t.value = r[c] || ''; App.flash((c === 'Date' ? 'Calendar date' : c) + ': ' + bad.msg, 'error'); return; } }
    if (c === 'State' ? v === Calendar.stateOf(r) : v === (r[c] || '')) return;
    if (calendarStructure.includes(c)) {
      const index = +tr.dataset.i, next = c === 'State' ? Calendar.setState(r, v, r.Cancelled) : Object.assign({}, r, { [c]: v });
      if (c === 'Type' && v === 'Event') { next['No Club'] = ''; delete next.Cancelled; delete next['Generated Break']; delete next['No Club By Hand']; }
      structuralCalendarEdit(index, c, next, () => {
        calendar[index] = next; Calendar.sort(calendar); calTouch(); renderCalendar(); renderReport();
      });
      return;
    }
    if (c === 'Start Time' || c === 'End Time') {
      const start = c === 'Start Time' ? v : r['Start Time'], end = c === 'End Time' ? v : r['End Time'];
      if (end && (!start || end < start)) {
        t.value = r[c] || ''; App.flash('Enter a start time before the end time.', 'error'); return;
      }
    }
    r[c] = c === 'Cancelled' ? v.trim() || 'Cancelled' : v;
    calTouch(); renderReport();
  }
  $('calWrap').addEventListener('change', e => { if (e.target.type !== 'date') commitCal(e.target); });
  $('calWrap').addEventListener('focusout', e => { if (e.target.type === 'date') commitCal(e.target); });
  $('calWrap').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.type === 'date') { e.preventDefault(); commitCal(e.target); } });
  $('calClubDay').addEventListener('change', e => {
    if (!App.season) return;
    App.season.config.clubDay = +e.target.value; calTouch(); renderCalendar();
  });
  $('calWrap').addEventListener('click', e => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    const r = calendar[+b.dataset.del];
    /* done at once, with an Undo message (UX-20) */
    structuralCalendarEdit(+b.dataset.del, 'Delete', null, () => {
      calendar.splice(+b.dataset.del, 1); calTouch(); renderCalendar(); renderReport();
      App.done('Deleted ' + r.Date + (r.Theme ? ' ' + r.Theme : '') + ' from the calendar.');
    });
  });
  $('btnCalAdd').addEventListener('click', () => {
    const r = Calendar.blank(), last = calendar[calendar.length - 1];
    const start = new Date((last ? last.Date : today()) + 'T12:00:00Z');
    const offset = (clubDay() - start.getUTCDay() + 7) % 7;
    start.setUTCDate(start.getUTCDate() + (offset || (last ? 7 : 0)));
    r.Date = start.toISOString().slice(0, 10); r.Quarter = last ? last.Quarter : 'Q1';
    calendar.push(r); calTouch(); renderCalendar();
  });
  $('btnCalShift').addEventListener('click', () => {
    if (!calendar.length) return App.ask.alert('Load a calendar first.');
    App.ask.form({ title: 'Move every date forward', ok: 'Move dates', fields: [
      { name: 'weeks', label: 'Weeks', type: 'number', min: 1, max: 104, step: 1, value: 52, required: true, hint: '52 keeps the same weekdays for next year. Check Easter, Thanksgiving and holiday weeks afterward.' }] }).then(v => {
      if (!v) return;
      const w = Math.round(v.weeks);
      try {
        const candidate = Calendar.shiftWeeks(calendar.map(row => Object.assign({}, row)), w);
        checkCalendarReplacement(candidate);
        calendar = candidate; calTouch(); renderCalendar(); renderReport();
        App.done('Every date moved forward ' + w + ' week' + (w === 1 ? '' : 's') + '. Check Easter, Thanksgiving and holiday weeks.');
      } catch (err) { App.flash(err.message, 'warn'); }
    });
  });
  // The data JSON holds the roster (with the Planning Center data as of its last import), calendar and rotation. Opening one
  // replaces them; noImport (restore, new season) does not re-apply an export opened earlier in the session.
  App.loadData = (s, opts) => {
    locationReportQuarter = null;
    if (App.fileSettingsLoaded) App.fileSettingsLoaded();      // the update and auto-save timers take the file's settings (app-update.js)
    if (App.clubChanged) App.clubChanged();                   // the title typed in this file (config.clubTitle), or the derived one
    if (App.driveSettingsLoaded) App.driveSettingsLoaded();   // the Drive save style and file name come from the file
    calendar = Calendar.sort(s.calendar.map(r => Object.assign({}, r)));
    rotation = s.rotation.map(r => r.slice());
    const hasRoster = Object.keys(s.roster.people).length > 0;
    if (hasRoster || !master) setMaster(Model.fromRoster(s.roster));
    if (lastPc && !lastPc.declined && !(opts && opts.noImport) && hasRoster) App.pendingReapply = { text: lastPc.text, name: lastPc.name };     // an export opened earlier this session is still applied to the file just opened, but after the open (setSeason), so it is logged against that file
    renderCalendar();
  };

  // ---------- open several files at once ----------
  // Works out what each file is from its contents: the data JSON, Planning Center export, colors list, or an old master / calendar / rotation CSV (imported once into the data file).
  function kindOf(text) {
    if (text.replace(/^\uFEFF/, '').trimStart().startsWith('{')) return /"format"\s*:\s*"awana-progress-patch"/.test(text.slice(0, 400)) ? 'progresspatch' : 'season';
    const first = Csv.parse(text)[0] || [];
    if (first.includes(X.ID)) return 'master';
    if (first.includes('Date') && first.includes('Quarter')) return 'calendar';
    if (first[0] === 'Time') return 'rotation';
    if (first.includes(C.FIRST) && first.includes(C.LAST)) return 'pc';
    if ((first.includes('Unique ID') || first.includes('Name')) && first.some(h => /^q[1-4]$|^colou?r$|^team$/i.test(h.trim()))) return 'colors';
    return '';
  }
  function openFiles(files) { return App.commitScope ? App.commitScope(() => openFilesNow(files)) : openFilesNow(files); }
  async function openFilesNow(files) {
    const items = [];
    for (const f of files) { const text = await f.text(); items.push({ name: f.name, text, kind: kindOf(text), lastModified: f.lastModified }); noteOpened(f.name, text, f.lastModified); markTest(f.name); }
    const order = ['season', 'master', 'pc', 'colors', 'calendar', 'rotation', 'progresspatch'], problems = [];
    items.sort((p, q) => order.indexOf(p.kind) - order.indexOf(q.kind));
    // Several data files picked at once: open the newest, and say so, instead of whichever the browser happens to list last.
    const seasons = items.filter(it => it.kind === 'season');
    if (seasons.length > 1) {
      const { keep, skipped } = Season.newest(seasons);
      skipped.forEach(it => items.splice(items.indexOf(it), 1));
      problems.push('You picked ' + seasons.length + ' data files. Opened the newest, ' + keep.name + '. Not opened: ' + skipped.map(it => it.name).join(', ') + '.');
    }
    for (const it of items) {
      try {
        if (it.kind === 'master') { if (master && App.dirty() && !(await App.ask.confirm('Discard unsaved changes and import the old master ' + it.name + '?', { title: 'Discard unsaved changes?', ok: 'Discard and import', danger: true }))) continue; setMaster(Model.loadMaster(it.text, today())); App.changed(); updateStatus(); }
        else if (it.kind === 'pc') importPc(it.text, it.name);
        else if (it.kind === 'colors') {
          if (!master) throw new Error('open the roster first, then this colors file.');
          const r = Teams.importList(master, null, it.text); touch(); refresh();
          ['unmatched', 'invalid', 'ambiguous', 'skipped'].forEach(k => { if (r[k].length) problems.push(it.name + ' (' + k + '): ' + r[k].join(', ')); });
        }
        else if (it.kind === 'calendar') {
          const candidate = Calendar.load(it.text);
          checkCalendarReplacement(candidate);
          const omitted = calendar.filter(r => !candidate.some(n => n.Date === r.Date && n.Type === r.Type));
          const fields = calendar.filter(r => candidate.some(n => n.Date === r.Date && n.Type === r.Type) &&
            Object.keys(r).some(k => r[k] && !candidate.some(n => n.Date === r.Date && n.Type === r.Type && n[k] === r[k])));
          if (omitted.length || fields.length) {
            const dates = rows => [...new Set(rows.map(r => r.Date))].slice(0, 8).join(', ');
            const details = [omitted.length && omitted.length + ' row(s) omitted: ' + dates(omitted), fields.length && fields.length + ' row(s) changed: ' + dates(fields)].filter(Boolean).join('. ');
            const before = JSON.stringify(calendar), openFile = App.season;
            if (!(await App.ask.confirm(details + '. Replace the current calendar with this CSV?', { title: 'Review calendar replacement', ok: 'Replace calendar', danger: true }))) continue;
            if (App.season !== openFile || JSON.stringify(calendar) !== before) throw new Error('The calendar changed. Open the CSV again to review against the current file.');
            checkCalendarReplacement(candidate);
          }
          calendar = candidate; App.changed(); renderCalendar(); renderReport(); App.onRefresh.forEach(f => f());
        }
        else if (it.kind === 'rotation') problems.push(it.name + ': the nightly rotation is not tracked here any more, so this file was left out.');
        else if (it.kind === 'season') { App.openedName = it.name; App.localHandle = null; await App.openSeason(it.text); }      // a new file: the next save asks where it goes
        else if (it.kind === 'progresspatch') problems.push(it.name + ': importing a progress patch (from the photo-to-progress agent) was removed, so this file was left out.');
        else problems.push(it.name + ': not a file this app knows how to open.');
      } catch (err) { problems.push(it.name + ': ' + err.message); }
    }
    if (problems.length) App.ask.alert(problems.join('\n'), { title: 'About the files you opened' });
    // After a merge, say if any handbook record uses a book that is not on the Options tab (the To do tab lists them for you to correct by hand).
    if (App.season && master) { const n = Check.scan({ master, season: App.season, calendar }).filter(f => f.area === 'Books' && f.id).length; if (n) App.flash(n + ' handbook or progress record' + (n === 1 ? '' : 's') + ' use a book that is not on the Options tab. See To do: Unrecognized book.', 'warn'); }
  }
  $('btnImport').addEventListener('click', () => { if (App.importDefault && App.importDefault() === 'drive') App.importFromDrive(); else $('fileAny').click(); });      // the file picker, or Drive's when saving to Drive is on (app-drive.js)
  $('fileAny').addEventListener('change', e => { const files = [...e.target.files]; e.target.value = ''; return openFiles(files); });

  // ---------- try it out: an invented club kept on the server (try/manifest.json lists the files). Fetched only when a button is pressed ----------
  const tryFile = async (folder, name) => {
    const r = await fetch(folder + encodeURIComponent(name));
    if (!r.ok) throw new Error('could not read ' + name + ' (' + r.status + ')');
    let text = await r.text();
    if (/\.json$/.test(name)) { const t = new Date(); text = Season.freshenFake(text, t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0')); }      // the demo club's dates follow today
    return { name, lastModified: Date.now(), text: async () => text };
  };
  let tryManifest = null;
  async function tryItOut() {
    try {
      const r = await fetch('try/manifest.json');
      if (!r.ok) throw new Error('this copy of the app has no demo files');
      tryManifest = await r.json();
      await openFiles([await tryFile('try/', tryManifest.data), await tryFile('try/', tryManifest.export)]);
      $('tryImport').hidden = !tryManifest.import;
    } catch (err) { App.ask.alert('Try it out needs the app to be opened from the web server (not from a file on disk): ' + err.message); }
  }
  async function tryImport() {
    try { $('tryImport').hidden = true; await openFiles([await tryFile('try/', tryManifest.import)]); }
    catch (err) { $('tryImport').hidden = false; App.ask.alert(err.message); }
  }
  $('splashTry').addEventListener('click', tryItOut);
  $('tryImport').addEventListener('click', tryImport);

  // ---------- splash: asks for the files before anything else; goes away once something is open ----------
  const splashDone = () => { $('splash').hidden = !!(master || App.season); };
  $('splashFiles').addEventListener('change', e => { const files = [...e.target.files]; e.target.value = ''; openFiles(files); });
  $('splashSkip').addEventListener('click', () => { $('splash').hidden = true; });
  // Files can be dropped anywhere on the page, not only on the splash. A drop on a text box or table cell would otherwise make the browser open the file instead.
  ['dragover', 'drop'].forEach(t => document.addEventListener(t, e => { if (!e.dataTransfer || ![...(e.dataTransfer.types || [])].includes('Files')) return; e.preventDefault(); if (t === 'drop') openFiles([...e.dataTransfer.files]); }));

  // Closing the tab, reloading or navigating away with unsaved changes asks first (the browser words the question itself).

  // A .scroll box never scrolls up and down (the page does, so there is only ever one vertical bar). One that is wider than the screen gets .wide and scrolls sideways;
  // until then it clips instead, which lets a table's header stay in view as the page scrolls.
  let fitQ = 0;
  const fitScrolls = () => document.querySelectorAll('.scroll').forEach(e => e.classList.toggle('wide', e.scrollWidth > e.clientWidth + 1));
  const queueFit = () => { cancelAnimationFrame(fitQ); fitQ = requestAnimationFrame(fitScrolls); };
  new MutationObserver(queueFit).observe(document.querySelector('main'), { childList: true, subtree: true }); addEventListener('resize', queueFit); queueFit();

  splashDone();
  refresh();
  // Printing: an empty date box shows "mm/dd/yyyy" in the browser, which is not wanted on paper. Before printing, empty date boxes are made blank (text and calendar icon hidden); after, they are put back as they were.
  const blankDates = on => document.querySelectorAll('input[type=date]').forEach(i => { if (on && !i.value) i.setAttribute('data-blank-print', ''); else i.removeAttribute('data-blank-print'); });
  // Each child's sheet (.onepage in the progress-sheet report) is sized to one printed page by the print CSS alone (style.css, .onepage); no script measures or zooms it.
  window.addEventListener('beforeprint', () => blankDates(true));
  window.addEventListener('afterprint', () => blankDates(false));
  // Print class binders: a quick pick (a saved bundle: Class binder, Coaches binder, Quarterly Printables, the club's own) sets the pages that go in; the pages can be adjusted; the classes are ticked (none = the whole club in one set).
  // "Show binders" makes the choice a selection of the report list ("Your binders"), drawn like any bundle: the bundle quarter, the lock question and the page choice all work on it.
  const BINDER_CLASS_PARTS = [['attendance', 'Attendance sheet'], ['binderClass', 'Roster with medical and contact (each class)'], ['volunteers', 'Volunteer contact list (a copy in each class binder)'], ['progressSheets', 'Progress sheet for each child (none for Puggles)']];
  const BINDER_COACHES_PARTS = [['binderAll', 'Coaches: emergency, medical, photos, color team (print once)'], ['binderTeams', 'Color teams by group and color'], ['teams', 'Color teams list (Sparks, T&T)'], ['noteSheets', 'Coaches notes sheet: the whole quarter on one page (once)'], ['clubCalendar', 'Club calendar (print once)']];
  const BINDER_PARTS = BINDER_CLASS_PARTS.concat(BINDER_COACHES_PARTS);
  const BINDER_PER_CLASS = ['attendance', 'binderClass', 'volunteers', 'progressSheets'];      // pages made once per class when classes are ticked
  const binderItems = (parts, classes, blanks) => {
    const per = BINDER_PER_CLASS.filter(k => parts.includes(k)), items = [], withBlanks = (k, it) => k === 'progressSheets' && blanks > 0 ? Object.assign(it, { blanks }) : it;      // N57: blank progress sheets after each class's own
    if (classes.length) classes.forEach(room => per.forEach(k => { if (k === 'progressSheets' && Model.groupOf(room) === 'Puggles') return; items.push(withBlanks(k, { report: k, room: k === 'volunteers' ? '' : room })); }));      // Puggles have no progress sheets
    else per.forEach(k => items.push(withBlanks(k, { report: k })));
    BINDER_PARTS.map(x => x[0]).filter(k => !BINDER_PER_CLASS.includes(k) && parts.includes(k)).forEach(k => items.push({ report: k }));
    return items;
  };
  const partsOfBundle = b => BINDER_PARTS.map(x => x[0]).filter(k => (b.items || []).some(i => i.report === k));
  const fixedBundle = b => !!b && (b.items || []).some(i => i.room || i.group);      // a club's own bundle that names classes prints exactly as saved
  $('btnBinders').addEventListener('click', () => {
    closeReportOptions();
    if (!master) return App.ask.alert('Open a data file first: the binders are made from its people.');
    const dl = $('dlg'), bundles = Reports.bundlesOf(App.season), rooms = Reports.roomsOf(Reports.kids(master));
    if (!binderPrefs) { const q = Math.max(0, bundles.findIndex(b => b.perClass)); binderPrefs = { quick: String(q), parts: partsOfBundle(bundles[q] || { items: [] }), classes: [] }; }
    const pr = binderPrefs; if (pr.quick !== '' && !bundles[+pr.quick]) pr.quick = '';
    dl.innerHTML = '<h3 style="margin-top:0">Print class binders</h3><p class="status">Pick a quick pick, change the pages if you want, and tick the classes. Nothing prints until you press Print on the Reports tab.</p>' +
      '<fieldset class="addgrp bindquick"><legend>1. Quick pick</legend><label>Pages for <select id="bindQuick">' + bundles.map((b, i) => '<option value="' + i + '"' + (pr.quick === String(i) ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('') + '<option value=""' + (pr.quick === '' ? ' selected' : '') + '>Custom: the pages I tick below</option></select></label> <span class="status" id="bindQuickNote"></span></fieldset>' +
      '<fieldset class="addgrp bindopt"><legend>2. Pages in each class binder</legend>' + BINDER_CLASS_PARTS.map(([k, l]) => '<label class="pf chk"><input type="checkbox" data-part="' + k + '"' + (k === 'progressSheets' ? ' id="bindSheets"' : '') + (pr.parts.includes(k) ? ' checked' : '') + '> ' + esc(l) + '</label>').join('') + '<label class="pf">Blank progress sheets after each class\'s sheets <input type="number" id="bindBlanks" min="0" max="20" value="' + (pr.blanks === undefined ? 3 : pr.blanks) + '" style="width:4em"> <span class="status">(0 for none; a new child already has a sheet to start)</span></label></fieldset>' +
      '<fieldset class="addgrp bindopt"><legend>2b. Coaches pages (print once for the whole club)</legend>' + BINDER_COACHES_PARTS.map(([k, l]) => '<label class="pf chk"><input type="checkbox" data-part="' + k + '"' + (pr.parts.includes(k) ? ' checked' : '') + '> ' + esc(l) + '</label>').join('') + '</fieldset>' +
      '<fieldset class="addgrp bindpick"><legend>3. Classes to print</legend><p class="bar" style="margin:0 0 4px"><button type="button" id="bindAll">Select all</button><button type="button" id="bindNone">Select none</button><span class="status" id="bindCount"></span></p>' +
      '<p class="status" style="margin:4px 0 4px">Leave all unticked to print the whole club in one set (the Coaches binder works this way).</p>' +
      rooms.map((c, i) => '<label class="pf chk"><input type="checkbox" data-bind="' + i + '" data-room="' + esc(c) + '"' + (pr.classes.includes(c) ? ' checked' : '') + '> ' + esc(c) + '</label>').join('') + '</fieldset>' +
      '<div class="dlgbtns"><button id="bindCancel">Cancel</button><button id="bindGo" class="primary">Show binders</button></div>';
    dl.showModal();
    const picks = () => [...dl.querySelectorAll('input[data-bind]')], partBoxes = () => [...dl.querySelectorAll('input[data-part]')], quick = () => $('bindQuick').value;
    const count = () => {
      const b = quick() === '' ? null : bundles[+quick()], pack = isNightPack(b);
      dl.querySelectorAll('.bindopt,.bindpick').forEach(box => { box.hidden = !!pack; });
      $('bindGo').textContent = pack ? 'Show club night pack' : 'Show binders';
      $('bindCount').textContent = picks().filter(i => i.checked).length + ' of ' + picks().length + ' selected';
      $('bindQuickNote').textContent = pack ? 'Print the pack or open slide images from Reports.' : fixedBundle(b) ? 'This one prints its saved classes as they are.' : b && b.perClass ? 'Tick the classes below.' : '';
    };
    $('bindQuick').onchange = () => {
      const b = bundles[+quick()];
      if (b) {
        const keep = partsOfBundle(b);
        partBoxes().forEach(c => { c.checked = keep.includes(c.dataset.part); });
        if (b.name === 'Quarterly Printables') picks().forEach(i => { i.checked = true; });
        else if (b.name === 'Coaches binder') picks().forEach(i => { i.checked = false; });
      }
      count();
    };
    $('bindAll').onclick = () => { picks().forEach(i => { i.checked = true; }); count(); }; $('bindNone').onclick = () => { picks().forEach(i => { i.checked = false; }); count(); };
    const onChange = e => { const t = e.target.closest && e.target.closest('input'); if (!t) return; if (t.dataset.part) $('bindQuick').value = ''; count(); };      // the shared #dlg keeps no handler of this pop-up once it closes
    dl.addEventListener('change', onChange); dl.addEventListener('close', () => dl.removeEventListener('change', onChange), { once: true });      // changing a page makes it a custom choice
    count(); $('bindCancel').onclick = () => dl.close();
    $('bindGo').onclick = () => {
      const q = quick(), b = q === '' ? null : bundles[+q], parts = partBoxes().filter(c => c.checked).map(c => c.dataset.part), classes = picks().filter(i => i.checked).map(i => i.dataset.room);
      const blanks = Math.max(0, Math.min(20, parseInt($('bindBlanks').value, 10) || 0)); binderPrefs = { quick: q, parts, classes, blanks };
      if (isNightPack(b)) { dl.close(); App.showReport('bundle:' + q); return; }
      let items, name;
      if (fixedBundle(b)) { items = (b.items || []).slice(); name = b.name; }
      else {
        if (!parts.length) return App.ask.alert('Tick at least one page to put in the binders.');
        if (b && b.perClass && !classes.length) return App.ask.alert('Tick at least one class for the ' + b.name + '.');
        items = binderItems(parts, classes, blanks); name = (b ? b.name : 'Custom binders') + (classes.length ? ': ' + classes.join(', ') : '');
      }
      binderSel = { name, items }; dl.close(); bundleKey = ''; App.showTab('reports'); fillReportSel(); sel.value = 'bundle:picked'; rsub = 'binders'; applySub(); renderReport();      // it is the selected report now (B3: the paper and the page choice follow it)
    };
  });
})();
