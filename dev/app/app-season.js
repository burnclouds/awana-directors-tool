(this.AwanaVersions = this.AwanaVersions || {})['app-season.js'] = '1.99.4';
// Season tabs: Attendance, Games, Awards, Progress, History. Talks to app.js through window.App.
// The data JSON is the only file we write: season records, roster extras, calendar and rotation. Every edit goes through touchSeason().
(function () {
  const { C, X } = Model;
  const App = window.App, esc = App.esc, $ = id => document.getElementById(id);
  let season = null, dirty = false, snap = null;
  let pendingEdits = [], draftStarted = null;
  let seq = 0;      // counts every edit and file open. A save remembers which edits its snapshot included.
  let lastEntered = '';      // "Same date" is like paste: the last date entered in any sign-off, given, announced or received box. Kept only until the page is closed (nothing here is saved outside the data file).
  const ui = { hFrom: null, hTo: 0, hLatest: true, attDate: '', attRoom: '', gameDate: '',awGroup: 'All', awSort: 'class', awType: '', awSub: 'announce', awRoom: '', awFix: false, awFixAll: false, awFixFrom: '', awAllNights: false, awHold: new Set(), prGroup: 'Sparks', prClass: 'All', prKid: '', prBook: 'HG', attHold: false };
  const MARK_COLS = { Puggles: [['a', 'Present']], Cubbies: [['a', 'Present'], ['x', 'Extra']],
    Sparks: [['a', 'Present'], ['h', 'Handbook'], ['p', 'Participation'], ['x', 'Extra']], 'T&T': [['a', 'Present'], ['h', 'Handbook'], ['p', 'Participation'], ['x', 'Extra']] };
  const MARK_SHORT = { a: 'Present', h: 'Hdbk', p: 'Part.', x: 'Extra' };      // column heads on a phone, where the full words do not fit
  const GROUPS = ['Puggles', 'Cubbies', 'Sparks', 'T&T'], MD = d => { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(d || ''); return m ? (+m[1]) + '/' + (+m[2]) : d; };
  const idOf = p => p[X.ID];

  // ---------- data file state ----------
  const copy = o => JSON.parse(JSON.stringify(o));
  // Roster extras, calendar and rotation are edited in app.js; the season object keeps a copy so they are saved and versioned with it.
  function syncData() {
    if (!season) return;
    if (App.master) season.roster = Model.toRoster(App.master);
    season.calendar = copy(App.calendar); season.rotation = copy(App.rotation);
  }
  // Take the current state as the starting point without logging it or marking anything unsaved (opening a file, refreshing from the export).
  function rebase() { syncData(); snap = season ? Season.snapshot(season) : null; }
  function setSeason(s, opts) { seq++; season = s; App.season = s; draftTab = ''; draftStarted = null; pendingEdits = []; dirty = false; edits = 0; unsavedSince = null; savedAt = null; undo.length = redo.length = 0; App.loadData(s, opts); rebase();
    // An export opened earlier this session is applied AFTER the opened file is the starting point, so the import is its own History entry against that file (R17), never absorbed or logged against the previous file.
    if (App.pendingReapply) { const re = App.pendingReapply; App.pendingReapply = null; App.reapplyExport(re.text, re.name); }
    status(); App.refresh(); }
  // The merge screen (app-merge.js): the open file brought up to date with what is on screen, and the merged file put in its place as an unsaved change (the roster is reloaded from it, no Planning Center review).
  App.mergeIn = { current: () => { syncData(); return season; }, apply: s => { setSeason(s, { noImport: true }); markEdit('Merged data files'); status(); App.updateStatus(); App.refresh(); } };
  function adopt(s) { season = s; App.season = s; draftTab = ''; undo.length = redo.length = 0; rebase(); status(); App.refresh(); }     // a new data file around what is already open
  // ---------- drafts ----------
  // On the record-editing tabs (and on Attendance when "Hold changes" is ticked) an edit changes the data in memory at once, so every screen shows it, but it is not logged or undoable until
  // the person presses Apply changes. Discard puts the tab back as it was at the last Apply. The draft is the difference between `snap` (the data at the last commit) and the data now.
  const DRAFT_TABS = { roster: 'Roster', person: 'Person', teams: 'Color teams', options: 'Options', uniforms: 'Uniforms', calendar: 'Calendar', attend: 'Attendance' };
  let forced = 0, draftTab = '', draftBaseDirty = false;
  const holdAttendance = () => ui.attHold && !(window.matchMedia && matchMedia('(max-width: 760px)').matches);      // a phone at the door always enters live
  const stagedTab = t => !!DRAFT_TABS[t] && (t !== 'attend' || holdAttendance());
  const staging = () => !forced && stagedTab(App.view());
  const draftChanges = () => { if (!season || !snap) return []; syncData(); return Season.diff(snap, season); };
  // Anything that commits on its own (an import, opening files) first settles the draft, then runs with staging off.
  App.commitScope = fn => {
    if (!resolveDraft(() => App.commitScope(fn))) return;
    forced++; let r; try { r = fn(); } catch (e) { forced--; throw e; }
    if (r && typeof r.then === 'function') return r.finally(() => { forced--; }); forced--; return r;
  };
  function applyDraft() {
    if (!season || !draftTab) return;
    const changes = draftChanges(), name = DRAFT_TABS[draftTab] || 'Edit';
    const started = draftStarted; draftTab = ''; draftStarted = null;
    if (changes.length) {
      const entry = Season.record(season, snap, { prefix: name, separate: true }); snap = Season.snapshot(season);
      undo.push(changes); if (undo.length > UNDO_MAX) undo.shift(); redo.length = 0;
      markEdit(entry.label, changes, 1, started);
    } else if (!draftBaseDirty) { dirty = false; edits = 0; unsavedSince = null; }
    status(); App.updateStatus(); updateUndo();
    if (App.updateTodoBadge) App.updateTodoBadge();      // what the To do page lists (unrecognized books, awards earned) follows the applied change
  }
  function discardDraft() {
    if (!season || !draftTab) return;
    const changes = draftChanges(); draftTab = ''; draftStarted = null;
    if (changes.length) { Season.applyChanges(season, changes, true); App.loadData(season, { noImport: true }); }
    rebase(); dirty = draftBaseDirty; if (!dirty) { edits = 0; unsavedSince = null; }
    status(); App.updateStatus(); updateUndo(); App.refresh(); if (App.updateTodoBadge) App.updateTodoBadge();
  }
  // True when it is fine to carry on right now (nothing pending). When changes are pending it returns false ("stay here") and asks in the app's dialog; the answer re-runs the action that was asked for (`again`):
  // Apply and continue, Discard and continue, or Stay here. A caller with no `again` just gets the false and a message (UX-20: the dialog is asynchronous, so the answer cannot be waited for).
  function resolveDraft(again) {
    if (!draftTab) return true;
    const n = draftChanges().length;
    if (!n) { discardDraft(); return true; }
    const tab = DRAFT_TABS[draftTab];
    if (typeof again !== 'function') { App.flash('The ' + tab + ' tab has ' + n + ' change' + (n === 1 ? '' : 's') + ' you have not applied yet. Apply or discard them first.', 'warn'); return false; }
    App.ask.choose('The ' + tab + ' tab has ' + n + ' change' + (n === 1 ? '' : 's') + ' that you have not applied yet.', { title: 'Unapplied changes', buttons: [{ id: 'apply', label: 'Apply and continue', primary: true }, { id: 'discard', label: 'Discard and continue', danger: true }, { id: 'stay', label: 'Stay here' }], cancel: 'stay' })
      .then(id => { if (id === 'apply') { applyDraft(); again(); } else if (id === 'discard') { discardDraft(); drawDraftBar(); again(); } });
    return false;
  }
  App.resolveDraft = resolveDraft;
  // An edit made here to a Planning Center field is only a note until Planning Center has it. That count lives in this bar (with a link to the list), so there is one place that says "changes": under the Apply line when a draft is open, alone on any other tab.
  // The x hides the line until the next save (markSaved brings it back); while it is hidden the (i) in the title bar still says it.
  let pcHidden = false;
  const pcCount = () => App.master ? Model.pendingChanges(App.master).length : 0;
  App.pcNeedHidden = () => { const k = pcHidden ? pcCount() : 0; return k ? k + ' change' + (k === 1 ? ' is' : 's are') + ' needed in Planning Center (edits made here that Planning Center does not have yet). The warning bar is hidden until you next save.' : ''; };
  const pcNeed = () => { const k = pcHidden ? 0 : pcCount(); return k ? '<span class="pcneed">&#9888; <b>' + k + ' change' + (k === 1 ? ' is' : 's are') + ' needed in Planning Center</b> (edits made here that Planning Center does not have yet). <a href="#" id="lnkPcNeed">See the list</a> <button type="button" class="pcx" id="btnPcNeedHide" title="Hide this until you next save (the (i) in the title bar still says it)" aria-label="Hide this warning until the next save">&times;</button></span>' : ''; };
  function drawDraftBar() {
    const el = $('draftBar'); if (!el) return;
    const staged = !!(season && stagedTab(App.view())), need = season ? pcNeed() : '';
    const idle = staged && !draftChanges().length;      // a held-changes tab with nothing held: no bar until there is something to apply (or a Planning Center line to show)
    el.hidden = (!staged && !need) || (idle && !need);
    if (el.hidden) { el.innerHTML = ''; return; }      // hidden bars keep no old text (a stale "not applied yet" could reappear)
    if (!staged || idle) { el.className = 'draftbar pcneedonly'; el.innerHTML = '<span class="dtext">' + need + '</span>'; return; }
    const ch = draftChanges(), n = ch.length, nm = DRAFT_TABS[App.view()];
    el.className = 'draftbar' + (n ? ' pending' : '');
    el.innerHTML = '<span class="dtext">' + (n ? '<b>' + n + ' change' + (n === 1 ? '' : 's') + ' not applied yet</b> on ' + esc(nm) + '. Check them, then apply or discard.' : esc(nm) + ': changes are held here until you apply them. Nothing is waiting.') + (need ? '<br>' + need : '') + '</span>' +
      '<button id="btnDraftApply" class="primary"' + (n ? '' : ' disabled') + '>Apply changes</button><button id="btnDraftDiscard"' + (n ? '' : ' disabled') + '>Discard</button>' +
      (n ? '<details class="dlist"><summary>What changed</summary><ul>' + ch.slice(0, 30).map(c => '<li>' + esc(Season.describe(c, nameOf)) + '</li>').join('') + (n > 30 ? '<li>&hellip; and ' + (n - 30) + ' more</li>' : '') + '</ul></details>' : '');
  }
  App.drawDraftBar = drawDraftBar; App.isDraftView = v => !!season && stagedTab(v || App.view());      // is this view one whose changes are held until Apply (the bar itself shows only when something is held)
  document.addEventListener('click', e => {
    const fromKeyboard = e.detail === 0, toTab = () => { const t = document.querySelector('.tabs button.on'); if (fromKeyboard && t) t.focus(); };
    if (e.target.id === 'btnPcNeedHide') { pcHidden = true; drawDraftBar(); return; }
    if (e.target.id === 'lnkPcNeed') { e.preventDefault(); App.showReport('pcChanges'); return; }
    if (e.target.id === 'btnDraftApply') { applyDraft(); drawDraftBar(); toTab(); }
    if (e.target.id === 'btnDraftDiscard') {      /* a draft is not on the Undo stack until Apply, so this stays a confirmation, in the app's dialog */
      const n = draftChanges().length, go = () => { discardDraft(); drawDraftBar(); toTab(); };
      if (n) App.ask.confirm('Throw away ' + n + ' change' + (n === 1 ? '' : 's') + ' on this tab?', { title: 'Discard changes?', ok: 'Discard', danger: true }).then(yes => { if (yes) go(); }); else go();
    }
  });

  // Every edit lands in the history, and its changes go on the undo stack (this session only; up to UNDO_MAX edits).
  function touchSeason(label) {
    if (season && staging()) {                                          // a draft: the data is edited in memory, but nothing is logged or put on the undo stack until Apply
      syncData();
      if (!draftTab) { draftTab = App.view(); draftStarted = Date.now(); draftBaseDirty = dirty; }
      if (!dirty) { unsavedSince = Date.now(); edits = 0; }
      seq++; dirty = true; status(); App.updateStatus(); updateUndo(); if (App.updateTodoBadge) App.updateTodoBadge(); return;
    }
    let changes, entry;
    if (season) {
      syncData();
      changes = Season.diff(snap, season);
      entry = Season.record(season, snap, { separate: !pendingEdits.length }); snap = Season.snapshot(season);
      if (changes.length) { undo.push(changes); if (undo.length > UNDO_MAX) undo.shift(); redo.length = 0; }
    }
    markEdit(entry?.label || (typeof label === 'string' ? label : 'Data file changed'), changes?.length ? changes : null); status(); App.updateStatus(); updateUndo();
    if (App.updateTodoBadge) App.updateTodoBadge();      // an edit may have earned an award (a block finished on Progress, a Blue Jewel from attendance)
  }
  const undo = [], redo = [], UNDO_MAX = 100;
  const nameOf = id => { const p = App.master && App.master.people.find(x => x[X.ID] === id); return p ? Model.fullName(p) : id; };
  const say = changes => changes.slice(0, 2).map(c => Season.describe(c, nameOf)).join('; ') + (changes.length > 2 ? ' (and ' + (changes.length - 2) + ' more)' : '');
  function updateUndo() {
    const b = $('btnUndo'), r = $('btnRedo');
    const hadFocus = document.activeElement;
    b.disabled = !undo.length || !!draftTab; r.disabled = !redo.length || !!draftTab;
    if ((hadFocus === b && b.disabled) || (hadFocus === r && r.disabled)) { const next = [b, r].find(x => !x.disabled) || document.querySelector('.tabs button.on'); if (next) next.focus(); }
    const wait = 'Apply or discard the changes on this tab first';
    b.title = draftTab ? wait : undo.length ? 'Undo: ' + say(undo[undo.length - 1]) : 'Nothing to undo' + (season ? '' : ' (undo starts once there is a data file)');
    r.title = draftTab ? wait : redo.length ? 'Redo: ' + say(redo[redo.length - 1]) : 'Nothing to redo';
  }
  // Undo or redo one edit: the opposite changes are applied to the data, the roster and calendar are rebuilt from it, and the step is logged in History like any edit.
  function undoStep(from, to, reverse) {
    if (!season || !from.length || draftTab) return;
    const changes = from.pop(); syncData();
    const before = Season.snapshot(season);
    Season.applyChanges(season, changes, reverse);
    App.loadData(season, { noImport: true });
    syncData();
    const entry = Season.record(season, before, { prefix: reverse ? 'Undo' : 'Redo', separate: true }); snap = Season.snapshot(season);
    to.push(changes); markEdit(entry?.label || (reverse ? 'Undo' : 'Redo'), changes, reverse ? -1 : 1); status(); App.updateStatus(); updateUndo(); App.refresh();
  }
  $('btnUndo').addEventListener('click', () => undoStep(undo, redo, true));
  $('btnRedo').addEventListener('click', () => undoStep(redo, undo, false));
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const t = document.activeElement, typing = t && ((t.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|reset|file|date|color|range)$/.test(t.type)) || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (typing || !$('btnUndo')) return;       // inside a text box, Ctrl+Z is the browser's own undo of the typing; on a checkbox, button or list it is the app's Undo
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); $('btnUndo').click(); } else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); $('btnRedo').click(); }
  });
  // "Saved" can only mean that the download started: a browser does not say whether the save dialog was cancelled. After NUDGE_EDITS edits or NUDGE_MINUTES minutes without a download the line turns bold.
  const NUDGE_EDITS = 20, NUDGE_MINUTES = 15;
  let savedAt = null, unsavedSince = null, edits = 0;
  const hhmm = d => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  // "Later" on the phone's Save bar moves the starting point: the next reminder comes after NUDGE_EDITS more edits or NUDGE_MINUTES more minutes (in memory only; saving or a clean start resets it).
  let nudgeFrom = { edits: 0, at: null };
  const overdueSince = () => nudgeFrom.at || unsavedSince;
  const overdue = () => dirty && (edits - nudgeFrom.edits >= NUDGE_EDITS || (overdueSince() && Date.now() - overdueSince() >= NUDGE_MINUTES * 60000));
  // A phone counts in both orientations: narrow (portrait) or a touch screen with a short height (landscape, wider than 760px). The bar is re-checked on rotation, not only on the next edit.
  const onPhone = () => window.matchMedia && window.matchMedia('(max-width: 760px), (pointer: coarse) and (max-height: 600px)').matches;
  window.addEventListener('resize', () => { if (typeof status === 'function') status(); });
  const modalOpen = () => !!document.querySelector('dialog[open], .modal-wrap:not([hidden]), .savemenu:not([hidden]), #splash:not([hidden])');
  function unsavedSummary() {
    const shown = new Set(), byChange = new Map();
    for (const edit of pendingEdits) {
      const previous = edit.changes && byChange.get(edit.changes);
      if (previous && previous.direction !== edit.direction) {
        shown.delete(previous);
        byChange.delete(edit.changes);
      } else {
        shown.add(edit);
        if (edit.changes) byChange.set(edit.changes, edit);
      }
    }
    const list = [...shown];
    const held = draftTab ? draftChanges().length : 0;
    if (held) list.push({ label: DRAFT_TABS[draftTab] + ' · ' + held + (held === 1 ? ' change held' : ' changes held') + ' (apply or discard)', time: draftStarted });
    return list.reverse();
  }
  function renderUnsavedSummary(summary) {
    const el = $('unsavedDetails');
    const first = summary.reduce((time, edit) => Math.min(time, edit.time), Infinity);
    el.innerHTML = Number.isFinite(first) ? '<p>First unsaved edit at ' + esc(hhmm(new Date(first))) + '.</p><ol>' +
      summary.map(e => {
        const changes = e.changes || [];
        const handbooks = changes.length && changes.every(c => c.p[0] === 'handbooks') ? new Set(changes.map(c => c.p[1])).size : 0;
        return '<li>' + esc(e.label) + (handbooks > 1 ? ', ' + handbooks + ' children' : '') + '</li>';
      }).join('') + '</ol>' : '<p>No pending data edits to list. Save to keep the updated History.</p>';
  }
  $('btnUnsavedEdits').addEventListener('click', () => {
    renderUnsavedSummary(unsavedSummary());
    $('unsavedDialog').showModal();
    status();
  });
  $('unsavedDialog').addEventListener('close', () => status());
  function status() {
    const el = $('seasonStatus');
    const base = season ? 'Data file ' + (season.year || '?') : 'No data file';
    const summary = unsavedSummary();
    const n = summary.length;
    const words = n ? n + ' unsaved edit' + (n === 1 ? '' : 's') : 'unsaved changes';
    const indicator = $('btnUnsavedEdits');
    indicator.hidden = !dirty;
    indicator.setAttribute('aria-label', 'Show ' + words);
    $('unsavedCount').textContent = n || '';
    if ($('unsavedDialog').open) renderUnsavedSummary(summary);
    const tail = dirty ? ' · ' + words + (savedAt ? ', download started ' + hhmm(savedAt) : ', not downloaded yet') : (savedAt ? ' · download started ' + hhmm(savedAt) : '');
    // Short in the bar ("18 unsaved edits"); the whole line, with the file and the last download, is the tooltip. A clean file just says "saved".
    el.textContent = !season ? base + (dirty ? ' \u00b7 not saved' : '') : dirty ? words : (savedAt ? 'saved ' + hhmm(savedAt) : base);      // with no data file the bar says so (and that what was loaded is not saved), not "1 unsaved edit"
    el.className = 'status' + (dirty ? ' dirty' : '') + (overdue() ? ' nudge' : ''); el.title = base + tail + (overdue() ? ' (press Download data file)' : '');
    const dl = $('btnSeasonSave'); if (dl) { dl.classList.toggle('unsaved', !!dirty); dl.title = dirty ? 'Unsaved changes: press to save' : ''; if (dirty) dl.setAttribute('aria-label', dl.textContent.trim() + ', ' + words); else dl.removeAttribute('aria-label'); }
    const nb = $('saveNudge');      // on a phone, unsaved work that has waited too long gets a Save bar with big buttons at the bottom (R12; stands in for a crash-recovery draft)
    if (nb) {
      const show = overdue() && onPhone() && !modalOpen(); nb.hidden = !show; document.body.classList.toggle('nudging', show);
      if (show) { const n = edits - nudgeFrom.edits >= NUDGE_EDITS, mins = Math.floor((Date.now() - overdueSince()) / 60000); $('saveNudgeText').textContent = n ? edits + ' edits are not saved yet.' : 'Changes from the last ' + mins + ' minutes are not saved yet.'; }
    }
    drawDraftBar();
  }
  function markEdit(label, changes = null, direction = 1, time = Date.now()) {
    if (!dirty) { unsavedSince = time; edits = 0; nudgeFrom = { edits: 0, at: null }; }
    edits++; seq++; dirty = true;
    pendingEdits.push({ seq, label, changes, direction, time });
  }
  function markSaved(savedSeq) {
    pendingEdits = pendingEdits.filter(edit => edit.seq > savedSeq);
    const held = !!(draftTab && draftChanges().length);
    draftBaseDirty = !!pendingEdits.length;
    dirty = draftBaseDirty || held;
    edits = pendingEdits.length;
    unsavedSince = pendingEdits[0]?.time ?? (held ? draftStarted : null);
    nudgeFrom = { edits: 0, at: null };
    savedAt = new Date();
    if (dirty) return;
    if (pcHidden) { pcHidden = false; drawDraftBar(); }
    if (ui.givenWarn && Object.keys(ui.givenWarn).length) { ui.givenWarn = {}; redrawSheet(); }
  }
  $('saveNudgeLater').addEventListener('click', () => { nudgeFrom = { edits, at: Date.now() }; status(); });
  $('saveNudgeBtn').addEventListener('click', () => $('btnSeasonSave').click());      // exactly what the top button does (Drive, the TEST two-press gate)
  setInterval(() => { if (dirty) status(); }, 30000);
  App.dirty = () => dirty;
  App.editSeq = () => seq;
  App.changed = () => touchSeason();      // (not touchSeason itself: it is also used as an event listener, which would pass it an Event)
  // A Planning Center import that was applied (R17): every change it made, hidden money columns and the export record included, is ONE History entry named for the export, and one undo step.
  // An import that changed nothing is only a rebase (not unsaved). Returns true when something was logged.
  App.importChanged = label => {
    if (!season || staging()) { touchSeason(); return !!season; }
    syncData(); const changes = Season.diff(snap, season);
    if (!changes.length) { rebase(); status(); App.updateStatus(); return false; }
    Season.record(season, snap, { label, separate: true }); snap = Season.snapshot(season);
    undo.push(changes); if (undo.length > UNDO_MAX) undo.shift(); redo.length = 0;
    markEdit(label, changes); status(); App.updateStatus(); updateUndo(); if (App.updateTodoBadge) App.updateTodoBadge();
    return true;
  };
  App.rebase = () => { rebase(); status(); };
  App.season = null;
  // A data file can hold dates that are not real (hand-edited or damaged). Each one is listed here to correct or remove before the file opens; Cancel opens nothing.
  const shown = v => v === undefined ? '(missing)' : JSON.stringify(v);
  function dateFixDialog(s, items, done) {
    const dlg = $('dlg');
    const row = (it, i) => '<tr data-i="' + i + '"><td>' + esc(it.what) + '</td><td><code>' + esc(shown(it.value)) + '</code></td><td>' +
      '<label><input type="radio" name="act' + i + '" value="fix" checked> Correct to</label> <input type="date" data-to="' + i + '" value="' + esc(Season.guessDate(it.value)) + '" aria-label="Corrected date for ' + esc(it.what) + '">' +
      '<div class="status" data-clash="' + i + '" hidden><span></span> <select data-pref="' + i + '" aria-label="When the two nights disagree"><option value="existing">Keep what is already there</option><option value="new">Use this entry&rsquo;s</option></select></div>' +
      '<div><label><input type="radio" name="act' + i + '" value="remove"> Remove (drops ' + esc(it.drops) + ')</label></div></td></tr>';
    dlg.innerHTML = '<h3 style="margin-top:0">Fix dates before opening</h3><p class="status">This data file has ' + items.length + ' date' + (items.length === 1 ? '' : 's') + ' that ' + (items.length === 1 ? 'is' : 'are') + ' not real. Correct each one, or remove what it belongs to. Nothing is changed in the file on disk; the corrected copy opens as unsaved and the change is logged in History.</p>' +
      '<div class="scroll"><table class="roster"><thead><tr><th>What</th><th>It says</th><th>Do</th></tr></thead><tbody>' + items.map(row).join('') + '</tbody></table></div>' +
      '<div class="dlgbtns"><button type="button" id="dfCancel">Cancel (open nothing)</button><button type="button" id="dfGo" class="primary">Fix and open</button></div>';
    const rows = [...dlg.querySelectorAll('tr[data-i]')];
    const act = r => r.querySelector('input[type=radio]:checked').value, to = r => r.querySelector('input[type=date]').value;
    function sync() {
      let ok = true;
      rows.forEach(r => {
        const it = items[+r.dataset.i], fix = act(r) === 'fix', box = r.querySelector('[data-clash]'), n = fix ? Season.dateClashes(s, it, to(r)) : 0;
        r.querySelector('input[type=date]').disabled = !fix; if (fix && !Season.isRealDate(to(r))) ok = false;
        box.hidden = !n; if (n) box.querySelector('span').textContent = 'That night already has data, and ' + n + ' value' + (n === 1 ? '' : 's') + ' differ. When they do:';
      });
      $('dfGo').disabled = !ok;
    }
    dlg.oninput = dlg.onchange = sync; sync();
    dlg.addEventListener('close', () => { dlg.oninput = dlg.onchange = null; }, { once: true });
    $('dfCancel').onclick = () => dlg.close();
    $('dfGo').onclick = () => {
      const decisions = rows.map(r => ({ item: items[+r.dataset.i], action: act(r), to: to(r), prefer: r.querySelector('select[data-pref]').value }));
      let n; try { n = Season.fixDates(s, decisions); } catch (err) { return App.ask.alert(err.message); }
      dlg.close(); done(n);
    };
    dlg.showModal();
  }
  /* The club year, asked in the app's dialog (one form for a new data file and for New season): YYYY-YY (2027-2028 is shortened); resolves to the year, or null on Cancel. `check(year)` may return a message to refuse it. */
  const nextYear = y => { const m = /^(\d{4})-(\d{2})/.exec(y || ''); return m ? (+m[1] + 1) + '-' + String((+m[2] + 1) % 100).padStart(2, '0') : Season.defaultYear(App.today()); };
  const askClubYear = (title, message, value, check) => App.ask.form({ title, message, ok: 'OK', fields: [{ name: 'year', label: 'Club year', type: 'text', required: true, value, pattern: '\\d{4}-(\\d{2}|\\d{4})', hint: 'Like 2026-27.' }],
    validate: v => { const y = shortYear(v.year); const w = check ? check(y) : ''; return w ? { name: 'year', message: w } : ''; } }).then(v => v ? shortYear(v.year) : null);
  const shortYear = y => { y = String(y || '').trim(); const l = /^(\d{4})-(\d{4})$/.exec(y); return l ? l[1] + '-' + l[2].slice(2) : y; };
  let openingText = '';      // the file text the season being opened came from (app-drive.js uses it to know which Drive file a season belongs to)
  App.openSeason = (text, opts) => {
    /* opts.refresh: a merged Drive save showing what it saved (nothing was edited since its text was taken). Otherwise ask in the app's dialog and, on yes, open it: the returned promise lets the open-files loop wait for the answer before it imports anything else. */
    if (dirty && !(opts && (opts.refresh || opts.discardOk))) return App.ask.confirm('Discard unsaved changes?', { title: 'Discard unsaved changes?', ok: 'Discard and open', danger: true }).then(yes => yes ? App.openSeason(text, Object.assign({}, opts, { discardOk: true })) : undefined);
    openingText = text;
    const s = Season.fromJson(text), bad = Season.badDates(s);
    if (!bad.length) return openParsed(s);
    const before = Season.snapshot(s);
    dateFixDialog(s, bad, n => {
      const e = Season.record(s, before, { separate: true });           // logged before the open, so History shows exactly the date fixes
      if (e) e.label = 'Date fixes: ' + [n.fixed && n.fixed + ' corrected', n.removed && n.removed + ' removed'].filter(Boolean).join(', ');
      openParsed(s, true);
    });
  };
  function openParsed(s, fixed) {
    setSeason(s); App.seasonSource = { season: s, text: openingText }; if (App.applyStartTab) App.applyStartTab();
    if (fixed) { markEdit('Corrected file dates'); status(); App.updateStatus(); }                // the repaired copy is not on disk yet
    // An older season-only file has no roster, colors or calendar of its own; say so instead of leaving empty tabs unexplained.
    if (!Object.keys(season.roster.people).length && !(App.master && App.master.people.length)) App.ask.alert('This is an older season-only data file: it holds attendance, games and awards, but no roster, color teams, calendar or rotation.\n\nOpen your newest awana-…-yyyymmdd-hhmmss.json instead (it has everything), or add a Planning Center export now to supply the roster.');
  }
  // Save the data file the way the Save button does (the computer, or Drive in the chosen style). Resolves true when it was sent, false when it was not (cancelled, no year, a held draft).
  // opts.auto is the automatic save: it never asks anything (no club year, no Planning Center warning) and skips a file with a draft waiting to be applied.
  App.saveNow = opts => new Promise(resolve => {
    const auto = !!(opts && opts.auto);
    if (!season) { if (auto) return resolve(false); askClubYear('Club year', 'Which club year is this data file for?', Season.defaultYear(App.today())).then(y => { if (!y) return resolve(false); adopt(Season.blank(y)); App.saveNow(opts).then(resolve); }); return; }
    if (auto && draftTab && draftChanges().length) return resolve(false);
    if (!resolveDraft(() => App.saveNow(opts))) return resolve(false);                          // the file must hold what the History says
    // Where it goes: Drive (its own naming, unchanged); otherwise this computer. Stage 2: a file opened from this computer is saved over under its own name (no timestamp, new files awana-<year>.json); config.saveStyleLocal 'dated' keeps a dated file each time.
    // A download made from the Save menu while saving to Drive is a one-off copy: a timestamped name, no Save-as, never over an earlier copy.
    const oneOff = !!(opts && opts.local && App.driveSave && App.driveSave.active());
    const driveOn = !(opts && opts.local) && !!(App.driveSave && App.driveSave.active()), single = !driveOn && !oneOff && !(season.config && season.config.saveStyleLocal === 'dated');
    const localName = single ? (App.openedName || 'awana-' + season.year + '.json') : Season.fileName(season.year);
    const go = async () => {
      syncData();
      const savingSeason = season, s0 = seq;
      if (!single) {
        // Clear only the edits included in the confirmed save. A refused or failed Drive save leaves them unsaved. (R11)
        const text = Season.toJson(season); let sent, failed = false;
        try { sent = await App.download(driveOn ? Season.fileName(season.year) : localName, text, 'application/json', driveOn ? { auto, seq: s0 } : { local: true }); } catch (err) { failed = true; }
        if (failed || sent === false || sent === 'copy') { status(); App.updateStatus(); return resolve(false); }      // Drive does not have it (a copy was downloaded, or an automatic save is waiting)
        if (season === savingSeason) markSaved(s0);
        status(); App.updateStatus(); return resolve(true);
      }
      let sent; try { sent = await App.download(localName, Season.toJson(season), 'application/json', { single: true }); } catch (err) { sent = false; }
      if (sent === false) return resolve(false);      // cancelled at Save as: nothing was saved, so the file stays unsaved
      if (season === savingSeason) markSaved(s0); status(); App.updateStatus(); resolve(true);
    };
    if (auto) go(); else App.guardedSave(go, () => resolve(false));
  });
  $('btnSeasonSave').addEventListener('click', () => App.testGate($('btnSeasonSave'), () => { App.saveNow(); }));
  App.snapshotJson = () => { syncData(); return Season.toJson(season); };      // what the file would hold now (for carrying a session through an update)
  App.draftPending = () => !!(season && draftTab && draftChanges().length);
  function startPanel(el) {
    el.innerHTML = '<p class="status">' + (App.master ? 'No data file is open.' : 'Load a roster first.') + '</p>' +
      (App.master ? '<p>Import your saved <code>awana-&hellip;.json</code> with <b>Import&hellip;</b>, or <button id="btnStartSeason" class="primary">Start a new data file</button></p>' : '');
    const b = el.querySelector('#btnStartSeason');
    if (b) b.onclick = () => { askClubYear('Start a new data file', 'Which club year is it for?', Season.defaultYear(App.today())).then(y => { if (y) adopt(Season.blank(y)); }); };
  }
  const ready = el => { if (!App.master || !season) { startPanel(el); return false; } return true; };

  // ---------- shared pickers ----------
  // A night is "entered" when someone has a mark on it (Season.heldNights is the stricter rule used for totals; an old file may hold an empty night).
  const entered = d => !!(season && season.attendance[d] && Object.keys(season.attendance[d]).length);
  function nightList() {
    const set = new Map();
    App.calendar.filter(Calendar.isNight).forEach(r => set.set(r.Date, r.Quarter));
    if (season) Object.keys(season.attendance).forEach(d => { if (entered(d) && !set.has(d)) set.set(d, ''); });
    return [...set.keys()].sort().map(d => ({ date: d, quarter: set.get(d) }));
  }
  function defaultNight() {
    const n = nightList(), t = App.today();
    const past = n.filter(x => x.date <= t);
    return (past.length ? past[past.length - 1] : n[0] || { date: '' }).date;
  }
  // UX-05: which tab a data file opens on (config.startTab: absent or 'roster' = Roster, 'todo', 'tonight'). Applied once from openParsed, never after an Update now restore or a merge.
  // 'tonight': on a club night, or the day after one, Attendance on that night; any other day To do.
  App.applyStartTab = () => {
    const m = season && season.config && season.config.startTab; if (!m || m === 'roster') return;
    if (m === 'todo') { App.showTab('todo'); return; }
    const t = App.today(), d = new Date(t + 'T12:00:00'); d.setDate(d.getDate() - 1); const yday = d.toISOString().slice(0, 10), nights = nightList().map(x => x.date);
    if (nights.includes(t)) ui.attDate = t; else if (nights.includes(yday)) ui.attDate = yday; else { App.showTab('todo'); return; }
    App.showTab('attend');
  };
  // UX-12: what is left tonight, for the strip at the top of To do. Only on a club night or the day after one (the same rule as Start on). Not counted in the To do number.
  // rooms: classes with an active child; one is entered when any of its children has a mark on that night. games: Sparks and T&T (the groups with color teams); entered when the night has a result for the group.
  App.tonight = () => {
    if (!season || !App.master) return null;
    const t = App.today(), d = new Date(t + 'T12:00:00'); d.setDate(d.getDate() - 1); const yday = d.toISOString().slice(0, 10), nights = nightList().map(x => x.date);
    const date = nights.includes(t) ? t : nights.includes(yday) ? yday : ''; if (!date) return null;
    const kids = App.master.people.filter(p => Model.isActive(p) && Model.isClubber(p)), att = season.attendance[date] || {}, byRoom = {};
    kids.forEach(p => { const r = Model.room(p); if (r) (byRoom[r] = byRoom[r] || []).push(p[Model.X.ID]); });
    const rooms = Object.keys(byRoom).sort((a, b) => Model.roomRank(a) - Model.roomRank(b) || a.localeCompare(b)), missing = rooms.filter(r => !byRoom[r].some(id => att[id] !== undefined));
    const groups = ['Sparks', 'T&T'].filter(g => Model.hasColorTeams(g)), gm = season.games[date] || {}, gamesDone = groups.filter(g => gm[g] && Object.keys(gm[g]).length).length;
    return { date, rooms: rooms.length, roomsEntered: rooms.length - missing.length, firstMissingRoom: missing[0] || '', games: groups.length, gamesEntered: gamesDone, toAnnounce: +(document.getElementById('awardsBadge') || {}).textContent || 0 };
  };
  App.tonightGo = kind => {
    const n = App.tonight(); if (!n) return;
    if (kind === 'attend') { ui.attDate = n.date; if (n.firstMissingRoom) ui.attRoom = n.firstMissingRoom; App.showTab('attend'); }
    else if (kind === 'games') { ui.gameDate = n.date; App.showTab('games'); }
    else App.showTab('awards');
  };
  const quarterOf = d => (App.calendar.find(r => r.Date === d) || {}).Quarter || App.settings.quarter;
  // The quarter we are in TODAY, from the calendar (the latest club night on or before today). quarterOf(today) falls back to the Reports quarter on any day that is not a club night, and that choice holds for a week,
  // so looking at Q3 on a Monday made To do ask for Q3 colors and stop asking for Q2 (Fable review, suspected item 2).
  const quarterNow = () => (window.Calendar && App.calendar && App.calendar.length ? Calendar.currentQuarter(App.calendar, App.today()) : '') || App.settings.quarter;
  // One text for a club night everywhere (UX-16): "Wed 11/11 (Q2)", then " · today", " · last" (the night Attendance and Games open on) or " · next" (the night Awards opens on), then " ✓" when it has been entered.
  function nightLabel(date, quarter) {
    const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(date + 'T12:00:00Z').getUTCDay()], q = quarter !== undefined ? quarter : ((nightList().find(n => n.date === date) || {}).quarter || '');
    const t = App.today(), mark = date === t ? ' · today' : date === defaultNight() ? ' · last' : date === nextNight() && date > t ? ' · next' : '';
    return dow + ' ' + MD(date) + (q ? ' (' + q + ')' : '') + mark + (entered(date) ? ' ✓' : '');
  }
  function nightSelect(id, value) {
    return '<select id="' + id + '">' + nightList().map(n => '<option value="' + esc(n.date) + '"' + (n.date === value ? ' selected' : '') + '>' + esc(nightLabel(n.date, n.quarter)) + '</option>').join('') + '</select>';
  }
  const kidsOf = g => App.master.people.filter(p => Model.isActive(p) && Model.isClubber(p) && Model.groupOf(Model.room(p)) === g).sort(Model.byRoomThenName);
  const allKids = () => App.master.people.filter(p => Model.isActive(p) && Model.isClubber(p));
  // Attendance is also kept for adults: every active adult (volunteer) is on one "Volunteers" list, whatever room Planning Center puts them in.
  const attRoomOf = p => Model.isClubber(p) ? Model.room(p) : 'Volunteers';
  const attPeople = room => App.master.people.filter(p => Model.isActive(p) && attRoomOf(p) === room);
  const roomsWithKids = () => [...new Set(App.master.people.filter(Model.isActive).map(attRoomOf))].sort((a, b) => Model.roomRank(a) - Model.roomRank(b) || a.localeCompare(b));
  // the group a person is in today, stamped on Present so a later move to another group does not change the game points of past nights
  const groupOfPerson = p => Model.isClubber(p) ? Model.groupOf(Model.room(p)) : '';      // adults (Volunteers) have no group
  const groupNow = id => { const p = App.master.people.find(x => idOf(x) === id); return p ? groupOfPerson(p) : ''; };
  const teamChip = t => t ? '<span class="team team-' + esc(t) + '">' + esc(t) + '</span>' : '';

  // ---------- attendance ----------
  const teamTonight = (p, q) => Season.teamOn(season, idOf(p), ui.attDate, q, Model.teamOf(p, q));
  // The Volunteers room (S11): volunteer absences, one row per absence, grouped by club night. All or Upcoming (club nights from today). Presence keeps its own boxes below it.
  function absencePanel() {
    const today = App.today(), upcomingOnly = ui.absView === 'upcoming';
    const people = App.master ? App.master.people.filter(p => Model.isVolunteer(p) && Model.isActive(p)).sort((a, b) => Model.fullName(a).localeCompare(Model.fullName(b))) : [];
    const rows = App.absenceList().filter(r => !upcomingOnly || r.date >= today), byNight = {};
    rows.forEach(r => { (byNight[r.date] = byNight[r.date] || []).push(r); });
    const nameOf = pid => { const p = App.master.people.find(x => x[Model.X.ID] === pid); return p ? Model.fullName(p) + (Model.isVolunteer(p) && Model.isActive(p) ? '' : ' (not on the volunteer list)') : pid + ' (not on the roster)'; };
    const body = Object.keys(byNight).sort().map(d => '<h4>' + esc(Model.md(d)) + (App.absenceClubDates().includes(d) ? '' : ' (no longer a club night)') + '</h4><table class="roster"><thead><tr><th>Volunteer</th><th>Reason</th><th></th></tr></thead><tbody>' +
      byNight[d].map(r => '<tr><td>' + esc(nameOf(r.personId)) + '</td><td>' + esc(r.reason) + '</td><td><button type="button" data-absnight="1" data-pid="' + esc(r.personId) + '" data-aid="' + esc(r.absId) + '" data-date="' + esc(r.date) + '">Clear this night</button> <button type="button" data-absall="1" data-pid="' + esc(r.personId) + '" data-aid="' + esc(r.absId) + '">Clear whole absence</button> <button type="button" data-absrem="1" data-pid="' + esc(r.personId) + '" data-aid="' + esc(r.absId) + '">Clear remaining nights</button></td></tr>').join('') + '</tbody></table>').join('');
    return '<section class="pcard absencecard"><h3>Volunteer absences</h3><p class="status">Entering an absence is the acknowledgement. Each row is one club night. <label>Show <select id="absView"><option value="all"' + (upcomingOnly ? '' : ' selected') + '>All</option><option value="upcoming"' + (upcomingOnly ? ' selected' : '') + '>Upcoming (from today)</option></select></label></p>' +
      (body || '<p class="status">No absences' + (upcomingOnly ? ' ahead' : '') + '.</p>') +
      '<h4>Add an absence</h4><p class="pf"><label>Volunteer <select id="absPick"><option value="">Choose</option>' + people.map(p => '<option value="' + esc(Model.X ? p[Model.X.ID] : p[0]) + '">' + esc(Model.fullName(p)) + '</option>').join('') + '</select></label> <label>From <input type="date" id="absFrom"></label> <label>To <input type="date" id="absTo"></label> <label>Reason <input type="text" id="absReason" maxlength="200"></label> <button type="button" data-absadd2="1" class="primary">Add absence</button></p><p class="status">Only club nights from the club calendar are recorded.</p></section>';
  }
  function renderAttend() {
    const el = $('attendWrap'); $('attendBar').hidden = !(App.master && season);
    if (!ready(el)) return;
    if (!ui.attDate) ui.attDate = defaultNight();
    if (!nightList().length) { el.innerHTML = '<p class="status">No club nights yet: import your data file with Import&hellip;, or add dates on the Calendar tab.</p>'; return; }
    const rooms = roomsWithKids(); if (!rooms.includes(ui.attRoom)) ui.attRoom = rooms[0] || '';
    const nightDates = nightList().map(n => n.date), nAt = nightDates.indexOf(ui.attDate);
    $('attDateWrap').innerHTML = '<button type="button" id="attNightPrev" title="Previous club night" aria-label="Previous club night"' + (nAt <= 0 ? ' disabled' : '') + '>&#8249;</button><label>Night ' + nightSelect('attDate', ui.attDate) + '</label><button type="button" id="attNightNext" title="Next club night" aria-label="Next club night"' + (nAt < 0 || nAt >= nightDates.length - 1 ? ' disabled' : '') + '>&#8250;</button>';
    $('attRoomPrev').disabled = rooms.indexOf(ui.attRoom) <= 0; $('attRoomNext').disabled = rooms.indexOf(ui.attRoom) >= rooms.length - 1;
    $('attRoom').innerHTML = rooms.map(r => '<option' + (r === ui.attRoom ? ' selected' : '') + '>' + esc(r) + '</option>').join('');
    $('attFlagWrap').innerHTML = App.flagPlaceBtn({ level: 'attend', date: ui.attDate, room: ui.attRoom }, ui.attRoom + ' on ' + MD(ui.attDate));      // a yellow flag only when this class has a note on this night
    const g = Model.groupOf(ui.attRoom), cols = MARK_COLS[g] || MARK_COLS.Puggles, q = quarterOf(ui.attDate);
    const kids = attPeople(ui.attRoom).sort(Model.byFirstName), night = season.attendance[ui.attDate] || {};
    const here = kids.filter(p => night[idOf(p)] && night[idOf(p)].a).length;
    $('attCount').textContent = here + ' of ' + kids.length + ' present' + (entered(ui.attDate) ? '' : ' · night not entered yet');
    $('attCountFoot').textContent = $('attCount').textContent;      // phone: the count also sits under the table, where a long room ends
    const teams = Model.hasColorTeams(g);
    // Volunteers: a Planned out column from the absences for this night (display only; nothing here writes data). A Present mark on a planned night reads "Present (was planned out)".
    const vol = ui.attRoom === 'Volunteers', planned = new Map(vol ? App.absenceList().filter(r => r.date === ui.attDate).map(r => [r.personId, r]) : []);
    const plannedCell = p => { const r = planned.get(idOf(p)), m = night[idOf(p)] || {}; if (!r) return ''; return m.a ? 'Present (was planned out)' + (r.reason ? ' <small>' + esc(r.reason) + '</small>' : '') : 'Planned out' + (r.reason ? ' <small>' + esc(r.reason) + '</small>' : ''); };
    // The marks come right after the name (the team and year are context): on a phone they must be on screen without scrolling sideways.
    el.innerHTML = (ui.attRoom === 'Volunteers' ? absencePanel() : '') + '<table class="roster att"><thead><tr><th>#</th><th>Name</th>' + cols.map(c => '<th title="' + c[1] + '"><span class="lg">' + c[1] + '</span><span class="sh">' + (MARK_SHORT[c[0]] && c[1] !== 'Present' ? MARK_SHORT[c[0]] : c[1]) + '</span></th>').join('') + (teams ? '<th>' + esc(q) + ' team</th>' : '') + (vol ? '<th>Planned out</th>' : '') + '<th>Year</th></tr></thead><tbody>' +
      kids.map((p, i) => { const m = night[idOf(p)] || {}, t = Season.totals(season, idOf(p), App.calendar);
        return '<tr data-id="' + esc(idOf(p)) + '"' + (m.a ? ' class="here"' : '') + (vol && planned.has(idOf(p)) && !m.a ? ' data-planned="1"' : '') + '><td class="mvcell"><span class="rn">' + (i + 1) + '</span><button type="button" class="movebtn" data-move="1" tabindex="-1" title="Move to another class (or press M on this row)" aria-label="Move ' + esc(Model.fullName(p)) + ' to another class">&#8644;</button></td><td><a href="#" data-person="' + esc(idOf(p)) + '" tabindex="-1" title="Open ' + esc(Model.fullName(p)) + ' on the Person tab (change class, team or details), with a button back to this sheet. From the keyboard, press P on any box in the row.">' + esc(Model.fullName(p)) + '</a></td>' +
          cols.map(c => '<td class="chk"><label><input type="checkbox" data-m="' + c[0] + '" aria-label="' + esc(c[1] + ', ' + Model.fullName(p)) + '"' + (m[c[0]] ? ' checked' : '') + '></label></td>').join('') +
          (teams ? '<td>' + teamChip(teamTonight(p, q)) + (teamTonight(p, q) !== Model.teamOf(p, q) ? '<span title="differs from the ' + esc(q) + ' team (' + esc(Model.teamOf(p, q) || 'none') + '): a move or a one-night team"> *</span>' : '') + '</td>' : '') +
          (vol ? '<td class="plannedcell">' + plannedCell(p) + '</td>' : '') +
          '<td class="yr">' + t.year.a + '</td></tr>'; }).join('') + '</tbody></table>';  }
  // What the Recent places list remembers about these tabs (app-trail.js): enough to open the same night, class or child again.
  const placeName = id => { const p = App.master && App.master.people.find(x => idOf(x) === id); return p ? Model.fullName(p) : ''; };
  App.places.attend = { get: () => ui.attDate && ui.attRoom ? { key: ui.attDate + '|' + ui.attRoom, label: 'Attendance \u00b7 ' + MD(ui.attDate) + ' \u00b7 ' + ui.attRoom, state: { date: ui.attDate, room: ui.attRoom } } : null,
    set: s => { ui.attDate = s.date; ui.attRoom = s.room; } };
  App.places.games = { get: () => ui.gameDate ? { key: ui.gameDate, label: 'Games \u00b7 ' + MD(ui.gameDate), state: { date: ui.gameDate } } : null,
    set: s => { ui.gameDate = s.date; } };      // both groups show together now; an older saved place that names a group still restores the night
  App.places.awards = { get: () => ({ key: ui.awGroup + '|' + ui.awRoom, label: 'Awards · ' + (ui.awRoom || ui.awGroup), state: { group: ui.awGroup, room: ui.awRoom } }),
    set: s => { ui.awGroup = s.group; ui.awRoom = s.room; } };
  App.places.progress = { get: () => App.places.person ? App.places.person.get() : null, set: s => { if (s && s.kid) App.showPerson(s.kid, { sub: 'progress' }); } };      // the Progress tab is gone: an old recent place opens that child's Progress sub-tab
  // The name opens the Person tab for that child; its Back to Attendance button returns to this same night and class, scrolled where it was.
  let attendReturn = null;
  $('attendWrap').addEventListener('click', e => {
    const a = e.target.closest('a[data-person]'); if (!a) return;
    e.preventDefault();
    const id = a.dataset.person, p = App.master.people.find(x => idOf(x) === id);
    attendReturn = { y: App.pageScroll.y(), s: $('attendWrap').scrollTop, id, room: p ? attRoomOf(p) : '', team: p ? Model.teamOf(p, quarterOf(ui.attDate)) : '' };
    App.showPerson(id, { back: 'attend' });
  });
  App.attendBackLabel = () => ui.attDate ? 'Back to Attendance (' + MD(ui.attDate) + ' \u00b7 ' + ui.attRoom + ')' : 'Back to Attendance';
  App.backToAttend = () => {
    if (App.resolveDraft && !App.resolveDraft(() => App.backToAttend())) return false;      // held changes on the Person tab: the question is asked, and the answer re-runs this whole step (the message and the scroll too), not only the tab switch
    const r = attendReturn; App.showTab('attend'); if (App.tab !== 'attend') return false;
    if (r) {
      const p = App.master.people.find(x => idOf(x) === r.id), now = p ? attRoomOf(p) : '';
      if (now && now !== r.room) { ui.attRoom = r.room; renderAttend(); App.flash(Model.fullName(p) + ' is now in ' + now + ', so is no longer on this sheet. Pick ' + now + ' to see them.', 'info'); }
      App.pageScroll.to(r.y); $('attendWrap').scrollTop = r.s;
      const link = $('attendWrap').querySelector('a[data-person="' + CSS.escape(r.id) + '"]'); if (link) link.focus({ preventScroll: true });
    }
    attendReturn = null; return true;
  };
  // The move button is for touch and mouse (it is not a Tab stop, so Tab runs along the checkboxes); from the keyboard, press M on any box in the row.
  $('attendWrap').addEventListener('click', e => { const b = e.target.closest('button[data-move]'); if (b) App.moveKid(b.closest('tr').dataset.id); });
  // Volunteer absences in the Volunteers room (S11): clear a night, the whole absence, or the remaining nights; add one.
  $('attendWrap').addEventListener('click', e => {
    const one = e.target.closest('button[data-absnight]'), all = e.target.closest('button[data-absall]'), rem = e.target.closest('button[data-absrem]'), add = e.target.closest('button[data-absadd2]');
    if (one) { App.clearAbsenceNights(one.dataset.pid, one.dataset.aid, [one.dataset.date]); renderAttend(); return; }
    if (all) { App.clearAbsence(all.dataset.pid, all.dataset.aid); renderAttend(); return; }
    if (rem) { const pid = rem.dataset.pid, aid = rem.dataset.aid, today = App.today(), mine = App.absenceList().filter(r => r.personId === pid && r.absId === aid && r.date >= today).map(r => r.date); App.clearAbsenceNights(pid, aid, mine); renderAttend(); return; }
    if (add) { const v = (document.getElementById('absPick') || {}).value, from = (document.getElementById('absFrom') || {}).value || '', to = (document.getElementById('absTo') || {}).value || from, reason = (document.getElementById('absReason') || {}).value || '';
      if (!v) { App.flash('Choose a volunteer first.', 'error'); return; }
      try { const n = App.absenceNightsBetween(from, to).length; App.addAbsence(v, from, to, reason); App.flash(n + ' club night' + (n === 1 ? '' : 's') + ' recorded.', 'info'); } catch (err) { App.flash(err.message, 'error'); }
      renderAttend(); }
  });
  $('attendWrap').addEventListener('change', e => { if (e.target && e.target.id === 'absView') { ui.absView = e.target.value; renderAttend(); } });
  $('attendWrap').addEventListener('keydown', e => { if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey && !e.altKey && e.target.matches('input[type=checkbox]')) { e.preventDefault(); const l = e.target.closest('tr').querySelector('a[data-person]'); if (l) l.click(); return; }      // like M: the name link is not a Tab stop, so Tab keeps running along the boxes
    if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey && e.target.matches('input[type=checkbox]')) { e.preventDefault(); App.moveKid(e.target.closest('tr').dataset.id); } });
  $('attendWrap').addEventListener('change', e => {
    const cb = e.target.closest('input[data-m]'); if (!cb) return;
    Season.setMark(season, ui.attDate, cb.closest('tr').dataset.id, cb.dataset.m, cb.checked ? 1 : 0, groupNow(cb.closest('tr').dataset.id));
    touchSeason(); renderAttend();
  });
  $('attendBar').addEventListener('change', e => {
    if (e.target.id === 'attDate') ui.attDate = e.target.value; if (e.target.id === 'attRoom') ui.attRoom = e.target.value; renderAttend();
  });
  // Previous / next club night and room: step through the same lists the two boxes offer (the arrows are greyed out at the ends).
  $('attendBar').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled || !/^att(Night|Room)(Prev|Next)$/.test(b.id)) return;
    const dir = /Prev$/.test(b.id) ? -1 : 1;
    if (/^attNight/.test(b.id)) { const ds = nightList().map(n => n.date), i = ds.indexOf(ui.attDate) + dir; if (i >= 0 && i < ds.length) ui.attDate = ds[i]; }
    else { const rs = roomsWithKids(), i = rs.indexOf(ui.attRoom) + dir; if (i >= 0 && i < rs.length) ui.attRoom = rs[i]; }
    renderAttend(); const again = $(b.id); if (again && !again.disabled) again.focus();
  });
  $('btnAllPresent').addEventListener('click', () => {
    attPeople(ui.attRoom).forEach(p => Season.setMark(season, ui.attDate, idOf(p), 'a', 1, groupOfPerson(p))); touchSeason(); renderAttend();
  });
  $('btnClearRoom').addEventListener('click', () => {
    /* one Undo step: do it, then offer Undo (UX-20) */
    const room = ui.attRoom, date = ui.attDate; let n = 0;
    attPeople(room).forEach(p => Season.MARKS.forEach(m => { if (((season.attendance[date] || {})[idOf(p)] || {})[m]) n++; Season.setMark(season, date, idOf(p), m, 0); }));
    touchSeason(); renderAttend(); App.done(n ? 'Cleared ' + n + ' mark' + (n === 1 ? '' : 's') + ' for ' + room + ' on ' + MD(date) + '.' : 'Nothing was marked for ' + room + ' on ' + MD(date) + '.', { undo: n > 0 });
  });

  // Attendance is live by default (each tick is kept at once, which is what a phone at the door needs). Ticking this holds the night as a draft until Apply.
  $('attHold').checked = ui.attHold;
  $('attHold').addEventListener('change', e => {
    const box = e.target; if (!box.checked && !resolveDraft(() => { box.checked = false; box.dispatchEvent(new Event('change', { bubbles: true })); })) { box.checked = true; return; }
    ui.attHold = e.target.checked;      // a view choice for this visit only: not stored
    drawDraftBar();
  });

  // The New season button lives on the Options tab (drawn there, so the click is caught at the page).
  document.addEventListener('click', e => {
    if (!e.target.closest('#btnNewSeason')) return;
    if (!season) return;
    const startNew = () => askClubYear('New season', 'People, calendar, award lists, and last year’s progress and awards carry over once as earlier-year work. Last year’s colors are archived under last year’s label and start blank. Attendance, games and history start empty, and attendance counts are kept for team balance.', nextYear(season.year), v => { try { Season.newSeason(season, v); return ''; } catch (err) { return err.message; } }).then(y => { if (y) beginNewSeason(y); });      /* a year that is not like 2027-28 is refused inside the form, before anything changes */
    if (dirty) App.ask.choose('You have unsaved changes. Download the data file first, or they will be lost.', { title: 'Unsaved changes', buttons: [{ id: 'save', label: 'Download, then continue', primary: true }, { id: 'go', label: 'Continue without saving', danger: true }, { id: 'cancel', label: 'Cancel' }], cancel: 'cancel' })
      .then(async id => { if (id === 'cancel') return; if (id === 'save' && !(await App.saveNow())) return; startNew(); });
    else startNew();
  });
  function beginNewSeason(y) {
    const oldYear = season.year;
    let fresh; try { fresh = Season.newSeason(season, y.trim()); } catch (err) { App.ask.alert(err.message); return; }
    setSeason(fresh, { noImport: true });
    let said = '';
    try { const r = oldYear && App.archiveColors ? App.archiveColors(oldYear) : null; if (r && r.archived.length) said = 'Last year\'s colors were archived as ' + oldYear + ' and Q1 to Q4 are blank. The calendar is still last year\'s: replace it on the Calendar tab, then assign colors on Color teams.'; } catch (err) { said = 'Last year\'s colors were left in place (' + err.message + '). Use Start new year on Color teams to archive them.'; }
    markEdit('Started a new season'); status(); if (said && App.flash) App.flash(said, 'info');
  }

  // ---------- games ----------
  // The order the colors are listed in on this tab (entry rows, and standings that are tied) is the team order on the Options tab. The data does not depend on it.
  function renderGames() {
    const GAME_COLORS = Season.teamOrder(season), el = $('gamesWrap'); $('gamesBar').hidden = !(App.master && season);
    if (!ready(el)) return;
    if (!ui.gameDate) ui.gameDate = defaultNight();
    $('gameDateWrap').innerHTML = 'Night ' + nightSelect('gameDate', ui.gameDate);
    // Both groups are on the screen together (Sparks and T&T), each with its own entry table and standings; the group of an edit is the section it is in.
    const opt = (n, v) => '<option value="' + n + '"' + (String(v) === String(n) ? ' selected' : '') + '>' + (n === '' ? '—' : n) + '</option>', q = quarterOf(ui.gameDate);
    const groupHtml = g => {
      const rec = ((season.games[ui.gameDate] || {})[g]) || {};
      const places = Season.TEAMS.map(t => rec[t] && rec[t].place).filter(Boolean), dup = places.length !== new Set(places).size;
      const st = Season.standings(season, g, q, App.calendar);
      return '<section class="gamegrp" data-group="' + esc(g) + '"><h3>' + esc(g) + '</h3>' + (dup ? '<p class="bad">Two teams have the same place. Ties are allowed, but check the paper sheet.</p>' : '') +
        '<table class="roster games entry"><thead><tr><th>Team</th><th>Place</th><th>Spirit</th><th>Points</th><th><span class="vh">Clear</span></th></tr></thead><tbody>' +
        GAME_COLORS.map(t => { const r = rec[t] || {}, p = Season.teamPoints(season, ui.gameDate, g, t);
          /* UX-11: a tap on a number sets it, a tap on the set number clears it (four buttons instead of a drop-down) */
          const tap = (f, vals, cur) => '<span class="tapgrp" role="group" aria-label="' + esc(g + ' ' + t + ' ' + f) + '">' + vals.map(n => '<button type="button" data-f="' + f + '" data-v="' + n + '" aria-pressed="' + (cur === n) + '"' + (cur === n ? ' class="on"' : '') + '>' + n + '</button>').join('') + '</span>';
          return '<tr data-team="' + t + '"><td>' + teamChip(t) + '</td><td>' + tap('place', [1, 2, 3, 4], r.place) + '</td>' +
            '<td>' + tap('spirit', [0, 1, 2, 3], r.spirit) + '</td><td>' + (p ? p.place + p.spirit : '') + '</td><td><button type="button" data-clearrow="1" aria-label="Clear ' + esc(g + ' ' + t) + '"' + (r.place === undefined && r.spirit === undefined ? ' disabled' : '') + '>Clear</button></td></tr>'; }).join('') + '</tbody></table>' +
        '<h4>' + esc(g + ' standings, ' + q) + '</h4><table class="roster games"><thead><tr><th>Rank</th><th>Team</th><th>Nights</th><th>Avg place</th><th>Spirit</th><th>Points</th></tr></thead><tbody>' +
        st.slice().sort((a, b) => (a.rank || 99) - (b.rank || 99) || GAME_COLORS.indexOf(a.team) - GAME_COLORS.indexOf(b.team)).map(r => '<tr><td>' + (r.rank || '') + '</td><td>' + teamChip(r.team) + '</td><td>' + r.nights + '</td><td>' + (r.avgPlace === null ? '' : r.avgPlace) + '</td><td>' + r.spirit + '</td><td>' + r.points + '</td></tr>').join('') + '</tbody></table></section>';
    };
    el.innerHTML = '<div class="gamecols">' + ['Sparks', 'T&T'].map(groupHtml).join('') + '</div>';
  }
  $('gamesBar').addEventListener('change', e => { if (e.target.id === 'gameDate') { ui.gameDate = e.target.value; renderGames(); } });
  // UX-11: tap a number to set it, tap it again to clear it; Clear empties the row. When three places are set and different, the fourth team gets the one left over (same Undo step); ties are allowed and never filled.
  $('gamesWrap').addEventListener('click', e => {
    const b = e.target.closest('button[data-f], button[data-clearrow]'); if (!b || b.disabled) return;
    const g = b.closest('section.gamegrp').dataset.group, t = b.closest('tr').dataset.team, rec = () => ((season.games[ui.gameDate] || {})[g] || {}), cur = rec()[t] || {};
    const next = Object.assign({}, cur);
    let cleared = false; if (b.dataset.clearrow) { delete next.place; delete next.spirit; cleared = true; } else if (cur[b.dataset.f] === +b.dataset.v) { delete next[b.dataset.f]; cleared = true; } else next[b.dataset.f] = +b.dataset.v;
    try {
      Season.setGame(season, ui.gameDate, g, t, next);
      if (b.dataset.f === 'place' && !cleared) { const TEAMS = Season.teamOrder(season), r = rec(), set = TEAMS.filter(x => r[x] && r[x].place !== undefined), left = TEAMS.filter(x => !(r[x] && r[x].place !== undefined));
        if (set.length === 3 && left.length === 1) { const used = set.map(x => r[x].place); if (new Set(used).size === 3) { const free = [1, 2, 3, 4].filter(n => !used.includes(n)); if (free.length === 1) Season.setGame(season, ui.gameDate, g, left[0], Object.assign({}, r[left[0]] || {}, { place: free[0] })); } } }
    } catch (err) { App.ask.alert(err.message); }
    touchSeason(); renderGames();
    const again = $('gamesWrap').querySelector(b.dataset.clearrow ? 'section.gamegrp[data-group="' + CSS.escape(g) + '"] tr[data-team="' + CSS.escape(t) + '"] [data-f]' : 'section.gamegrp[data-group="' + CSS.escape(g) + '"] tr[data-team="' + CSS.escape(t) + '"] [data-f="' + b.dataset.f + '"][data-v="' + b.dataset.v + '"]'); if (again) again.focus({ preventScroll: true });
  });

  // ---------- awards ----------
  // Awards on the "left off the slide" list (everybody gets them: Start Zone, Flight 3:16) are not announced, so they stay out of Ready to announce and the Awards badge; they are still earned and tracked as Given.
  // Earned and not announced and not held: what the slides show and Mark all announced stamps. [{ award, date (earned), hint }]. The night argument is no longer used (kept so older callers still work).
  const announceDue = (p, g) => Season.pendingAwards(season, idOf(p), g, App.calendar).filter(r => !r.held).map(r => ({ award: r.award, date: r.earned, hint: r.earnedNoDate ? 'finished, no date' : 'finished ' + MD(r.earned) }));
  // ---- Earned, Announced, Given ----
  // Earned awards (finished in Progress, or Blue Jewels reached by attendance) wait on the Announce page until Mark all announced stamps them on a night; the slides show whatever is waiting and not held.
  // Given is separate and is ticked on the child's Progress sheet.
  // ---------- the Awards tab: a manager, in four lists ----------
  // 1 To announce at opening (earned, not announced), 2 Announced (history by night, with fixes), 3 To hand out (earned and not given: Season.toHandOut), 4 End-of-year ceremony (config.endOfYear: announced when earned,
  // presented at the ceremony). One filter and sort bar (group, class, sort) serves all four. Given is only ever ticked by a person.
  const awKey = (id, award) => id + '|' + award;
  const AW_GROUPS = ['Puggles', 'Cubbies', 'Sparks', 'T&T'], grpOf = p => Model.groupOf(Model.room(p));
  const awKidsAll = () => App.master.people.filter(p => Model.isActive(p) && Model.isClubber(p) && AW_GROUPS.includes(grpOf(p))).sort(Model.byRoomThenName);
  const awKids = () => awKidsAll().filter(p => (ui.awGroup === 'All' || grpOf(p) === ui.awGroup) && (!ui.awRoom || Model.room(p) === ui.awRoom));
  const personOf = id => App.master.people.find(x => idOf(x) === id);
  // Rows are { id, p, award, date }: class then name (the default), by award, or by the day earned.
  // An award's type: its name without the book code or the number ("Blue Emblem 2" and "Blue Emblem 1" are both "Blue Emblem").
  const typeOf = award => Season.baseAward(season, award).replace(/\s+\d+$/, '');
  function sortRows(rows) {
    const byClass = (a, b) => Model.byRoomThenName(a.p, b.p) || a.award.localeCompare(b.award);
    return rows.filter(r => !ui.awType || typeOf(r.award) === ui.awType).sort(ui.awSort === 'award' ? (a, b) => Season.awardLabel(season, a.id, a.award).localeCompare(Season.awardLabel(season, b.id, b.award)) || byClass(a, b) : ui.awSort === 'earned' ? (a, b) => (a.date || '9999') < (b.date || '9999') ? -1 : (a.date || '9999') > (b.date || '9999') ? 1 : byClass(a, b) : byClass);
  }
  const eoy = (p, award) => Season.isEndOfYear(season, grpOf(p), award);
  // An award's type, for the filter: see typeOf above. The next club night on or after today (awards are announced at the next opening); else the latest night there is.
  function nextNight() { const n = nightList().map(x => x.date), t = App.today(); return n.find(d => d >= t) || n[n.length - 1] || ''; }
  const tally = items => { const t = {}; items.forEach(i => { const k = Season.baseAward(season, i.award); t[k] = (t[k] || 0) + 1; }); return Object.keys(t).sort().map(a => t[a] + ' &times; ' + esc(a)).join(', '); };
  const nameCell = p => esc(Model.fullName(p));
  // On the Hand out and Ceremony lists a name opens that child's Progress sub-tab on the Person tab, where Given is entered.
  const nameLink = p => '<a href="#" data-awprog="' + esc(p[Model.X.ID]) + '" title="Open this child’s progress sheet, where Given is entered">' + esc(Model.fullName(p)) + '</a>', roomCell = p => esc(Model.room(p).replace(/^(Sparks|T&T) /, '$1 '));
  const roomNote = () => ui.awRoom ? ' in ' + esc(ui.awRoom) : '';

  // 1. Announce: everything earned and not announced, for the children shown. The slides draw from this list (not the held ones); Mark all announced stamps the unheld ones on the current club night.
  function announceSection(kids, night) {
    const items = []; kids.forEach(p => Season.pendingAwards(season, idOf(p), grpOf(p), App.calendar).forEach(r => items.push({ id: idOf(p), p, award: r.award, date: r.earned, noDate: r.earnedNoDate, held: r.held })));
    const rows = sortRows(items), ready = rows.filter(r => !r.held).length, held = rows.length - ready;
    return '<section class="pcard announce" id="awSecAnnounce"><h3>' + (night ? 'Announce on ' + esc(MD(night)) : 'To announce') + ' (' + ready + (held ? ', ' + held + ' held' : '') + ')</h3>' +
      (rows.length ? '<p class="status">Earned awards waiting to be announced. Tick <b>Hold</b> to leave an award off the slides and skip it when marking the group announced. ' +
        (night ? '<b>Mark all announced</b> records the ready awards on ' + esc(MD(night)) + '.' : 'Add a club night on the Calendar to record a group announcement.') + '</p>' +
        '<table class="roster"><thead><tr><th>Name</th><th>Class</th><th>Award</th><th>Earned</th><th>Hold</th><th>No date</th></tr></thead><tbody>' + rows.map(i => '<tr data-id="' + esc(i.id) + '" data-award="' + esc(i.award) + '"' + (i.held ? ' class="held"' : '') + '><td>' + nameCell(i.p) + '</td><td>' + roomCell(i.p) + '</td><td>' + esc(Season.awardLabel(season, i.id, i.award)) + (eoy(i.p, i.award) ? ' <span class="status">(end of year)</span>' : '') + '</td><td class="status">' + esc(i.noDate ? 'no date' : i.date ? MD(i.date) : '') + '</td>' +
          '<td><label title="' + (i.held ? 'Held off the slides (untick to release it)' : 'Tick to keep this award off the slides until you release it') + '"><input type="checkbox" data-hold="' + esc(i.award) + '"' + (i.held ? ' checked' : '') + ' aria-label="Hold: ' + esc(Season.awardLabel(season, i.id, i.award)) + ' for ' + esc(Model.fullName(i.p)) + '"> ' + (i.held ? 'held' : '') + '</label></td><td><button type="button" data-annnodate="' + esc(i.award) + '" data-aid="' + esc(i.id) + '" title="Count this award as told to the group, with no date, so it leaves this list and the slides">Told, no date</button></td></tr>').join('') + '</tbody></table>' +
        '<p><button type="button" id="btnAnnounce" class="primary"' + (ready && night ? '' : ' disabled') + '>Mark all announced (' + ready + ')</button> <button type="button" id="btnAwAnnPrint">Print the list to read from</button></p>' : '<p class="status">Nothing earned is waiting to be announced' + roomNote() + '.</p>') + '</section>';
  }
  // 2. To hand out: everything earned and not given (told to the group or not), except the end-of-year awards. The count of each is what to have ready. Given is ticked on the child's Progress sheet.
  // The Given controls on a Hand out or Ceremony row: hand it over today, or hand it over with no date. Same record as Progress's Given box.
  const giveButtons = r => '<button type="button" class="todaybtn" data-hogtoday="' + esc(r.id) + '" data-hoaward="' + esc(r.award) + '">Given today</button> <label class="uov"><input type="checkbox" data-hognodate="' + esc(r.id) + '" data-hoaward="' + esc(r.award) + '"> no date</label>';
  function handOutSection(kids) {
    const rows = []; kids.forEach(p => Season.toHandOut(season, idOf(p), grpOf(p), App.calendar).forEach(r => { rows.push({ id: idOf(p), p, award: r.award, date: r.earned || r.announced, hand: !r.earned, noDate: r.earnedNoDate, ann: r.announced, annNoDate: r.annNoDate }); }));
    const sorted = sortRows(rows);
    if (!sorted.length) return '<section class="pcard waiting" id="awSecHand"><h3>To hand out (0)</h3><p class="status">Nothing earned is waiting to be given' + roomNote() + '.</p></section>';
    return '<section class="pcard waiting" id="awSecHand"><h3>To hand out (' + sorted.length + ')</h3><p class="status">Earned, and the child does not have it in hand yet. Room leaders mark an award <b>Given</b> on the child’s Person record, Progress sub-tab when they hand it over; until then it stays here. <b>To have ready:</b> ' + tally(sorted) + ' <button type="button" id="btnAwHandPrint" title="Prints the awards on this list as a strip per child, to cut apart.">Print award strips&hellip;</button></p>' +
      '<table class="roster"><thead><tr><th>Name</th><th>Class</th><th>Award</th><th>Earned</th><th>Announced</th><th>Given</th></tr></thead><tbody>' + sorted.map(r => '<tr data-id="' + esc(r.id) + '"><td>' + nameLink(r.p) + '</td><td>' + roomCell(r.p) + '</td><td>' + esc(Season.awardLabel(season, r.id, r.award)) + '</td><td class="status">' + esc(r.hand ? 'by hand' : r.noDate ? 'no date' : r.date ? MD(r.date) : '') + '</td><td class="status">' + esc(r.ann ? MD(r.ann) : r.annNoDate ? 'told, no date' : 'not yet') + '</td><td>' + giveButtons(r) + '</td></tr>').join('') + '</tbody></table></section>';
  }
  // 3. End-of-year awards: tagged awards earned and not yet given; they wait here for the end-of-year awards (Given is ticked on Progress).
  function ceremonySection(kids) {
    const rows = []; kids.forEach(p => Season.awardLedger(season, idOf(p), grpOf(p), App.calendar).forEach(r => { if (eoy(p, r.award) && !r.given) rows.push({ id: idOf(p), p, award: r.award, date: r.earned || r.announced, hand: !r.earned, noDate: r.earnedNoDate, ann: r.announced, annNoDate: r.annNoDate }); }));
    const sorted = sortRows(rows);
    return '<section class="pcard ceremony" id="awSecCeremony"><h3>End-of-year awards (' + sorted.length + ')</h3>' + (sorted.length ? '<p class="status">Earned, and given at the end-of-year awards. <b>To have ready:</b> ' + tally(sorted) + ' <button type="button" id="btnAwCeremony">Print end-of-year list&hellip;</button></p>' +
      '<table class="roster"><thead><tr><th>Name</th><th>Class</th><th>Award</th><th>Earned</th><th>Announced</th><th>Given</th></tr></thead><tbody>' + sorted.map(r => '<tr data-id="' + esc(r.id) + '"><td>' + nameLink(r.p) + '</td><td>' + roomCell(r.p) + '</td><td>' + esc(Season.awardLabel(season, r.id, r.award)) + '</td><td class="status">' + esc(r.hand ? 'by hand' : r.noDate ? 'no date' : r.date ? MD(r.date) : '') + '</td><td class="status">' + esc(r.ann ? MD(r.ann) : r.annNoDate ? 'told, no date' : 'not yet') + '</td><td>' + giveButtons(r) + '</td></tr>').join('') + '</tbody></table>' : '<p class="status">No end-of-year award is waiting' + roomNote() + '.</p>') + '</section>';
  }
  // Earned or announced, and not yet handed to the child: the list the awards are counted from (inventory) so nothing earned is forgotten. Given can be set before an award is announced.
  function toGive(kids, date) {
    // The number on the Awards tab: every award still to announce or to hand out, once each, worked out from the award ledger like the Announce and Hand out lists. Left out: given (with or without a date), awards on the group's "left off the slide" (ignore) list, and end-of-year awards (they wait for the ceremony).
    const out = [], seen = new Set();
    kids.forEach(p => { const id = idOf(p), g = Model.groupOf(Model.room(p));
      Season.toHandOut(season, id, g, App.calendar).forEach(r => { seen.add(id + '|' + r.award); out.push({ id, award: r.award, date: r.earned || r.announced || '', status: r.announced ? 'announced ' + MD(r.announced) : 'earned, not announced' }); });
      announceDue(p, g).forEach(d => { if (!seen.has(id + '|' + d.award) && !(season.given[id] || {})[d.award] && !Season.jewelWaitsForWing(season, id, g, App.calendar, d.award)) { seen.add(id + '|' + d.award); out.push({ id, award: d.award, date: d.date, status: 'earned, not announced' }); } }); });
    return out;
  }
  const giveKids = () => App.master.people.filter(p => Model.isActive(p) && Model.isClubber(p) && ['Puggles', 'Cubbies', 'Sparks', 'T&T'].includes(Model.groupOf(Model.room(p))));
  function renderAwards() {
    const el = $('awardsWrap'); $('awardsBar').hidden = !(App.master && season);
    if (!ready(el)) return;
    const night = nextNight();
    $('awGroup').value = ui.awGroup; $('awSort').value = ui.awSort;
    const rooms = [...new Set(awKidsAll().filter(p => ui.awGroup === 'All' || grpOf(p) === ui.awGroup).map(Model.room))]; if (ui.awRoom && !rooms.includes(ui.awRoom)) ui.awRoom = '';
    const seen = new Set(), tc = {}, add = (id, a) => { const k = id + '|' + a; if (seen.has(k)) return; seen.add(k); const t = typeOf(a); tc[t] = (tc[t] || 0) + 1; };
    awKids().forEach(p => { const g = grpOf(p), id = idOf(p), skip = (season.config.exclude || {})[g] || []; Season.pendingAwards(season, id, g, App.calendar).filter(r => !eoy(p, r.award)).forEach(r => add(id, r.award)); Season.awardLedger(season, id, g, App.calendar).forEach(r => { if (!r.given && !skip.includes(r.award) && !eoy(p, r.award)) add(id, r.award); }); });      // end-of-year awards are on their own sub-tab, so they are not in the Type list
    if (ui.awType && !(ui.awType in tc)) ui.awType = '';
    $('awType').innerHTML = '<option value="">All types (' + seen.size + ')</option>' + Object.keys(tc).sort().map(t => '<option value="' + esc(t) + '"' + (t === ui.awType ? ' selected' : '') + '>' + esc(t) + ' (' + tc[t] + ')</option>').join('');
    $('awRoom').innerHTML = '<option value="">All classes</option>' + rooms.map(r => '<option' + (r === ui.awRoom ? ' selected' : '') + '>' + esc(r) + '</option>').join('');
    const kids = awKids();
    const nAnn = kids.reduce((n, p) => n + announceDue(p, grpOf(p)).length, 0), nHand = kids.reduce((n, p) => n + Season.toHandOut(season, idOf(p), grpOf(p), App.calendar).length, 0);
    // End-of-year awards have their own sub-tab (N-new, 2026-11-18): tagged awards earned and not given, kept off Hand out and off the Type list.
    const nCer = kids.reduce((n, p) => n + Season.awardLedger(season, idOf(p), grpOf(p), App.calendar).filter(r => eoy(p, r.award) && !r.given).length, 0);
    document.querySelectorAll('#awSubs button').forEach(b => { const on = b.dataset.awsub === ui.awSub; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); b.querySelector('.badge').textContent = (b.dataset.awsub === 'announce' ? nAnn : b.dataset.awsub === 'ceremony' ? nCer : nHand) || ''; });
    $('btnAwImages').hidden = ui.awSub !== 'announce';
    $('btnAwImages').disabled = !night;
    el.innerHTML = ui.awSub === 'announce' ? announceSection(kids, night) : ui.awSub === 'ceremony' ? ceremonySection(kids) : handOutSection(kids);
  }
  // ---- the Awards tab's controls ----
  $('awardsBar').addEventListener('change', e => {
    const id = e.target.id;
    if (id === 'awGroup') { ui.awGroup = e.target.value; ui.awRoom = ''; } if (id === 'awRoom') ui.awRoom = e.target.value; if (id === 'awSort') ui.awSort = e.target.value; if (id === 'awType') ui.awType = e.target.value;
    if (['awGroup', 'awRoom', 'awSort', 'awType'].includes(id)) renderAwards();
  });
  $('awardsWrap').addEventListener('change', e => {
    const t = e.target;
    if (t.matches('input[data-hold]')) {      // Hold: keep this award off the slides (and out of Mark all announced) until it is released; the same flag as on the Progress sheet
      Season.setHold(season, t.closest('tr').dataset.id, t.dataset.hold, t.checked); touchSeason(); renderAwards();
    }
  });
  $('awSubs').addEventListener('click', e => { const b = e.target.closest('button[data-awsub]'); if (b) { ui.awSub = b.dataset.awsub; renderAwards(); } });
  $('awardsWrap').addEventListener('click', e => {
    const hgt = e.target.closest && e.target.closest('button[data-hogtoday]');
    if (hgt) { try { Season.setGiven(season, hgt.dataset.hogtoday, hgt.dataset.hoaward, App.today()); } catch (err) { App.ask.alert(err.message); } touchSeason(); renderAwards(); return; }
    const hgn = e.target.closest && e.target.closest('input[data-hognodate]');
    if (hgn) { try { Season.setGiven(season, hgn.dataset.hognodate, hgn.dataset.hoaward, hgn.checked ? App.today() : '', { noDate: true }); } catch (err) { App.ask.alert(err.message); hgn.checked = false; } touchSeason(); renderAwards(); return; }
    const awp = e.target.closest && e.target.closest('a[data-awprog]');
    if (awp) { e.preventDefault(); App.goProgress(awp.dataset.awprog); return; }
    const ig = e.target.closest && e.target.closest('button[data-annnodate]');
    if (ig) { try { Season.setAnnNoDate(season, ig.dataset.aid, ig.dataset.annnodate, true); } catch (err) { App.ask.alert(err.message); } touchSeason(); renderAwards(); return; }      // Ignore: told to the group, with no date
    const id = e.target.id;
    if (id === 'btnAnnounce') {      // Mark all announced: every unheld award listed (under the group, class and type shown) is told-to-the-group on the current club night
      const night = nextNight(); if (!night) return;
      const picks = [...$('awSecAnnounce').querySelectorAll('tbody tr[data-award]:not(.held)')].map(r => [r.dataset.id, r.dataset.award]);
      const n = Season.announce(season, night, picks); if (n) { touchSeason(); App.flash('Marked ' + n + ' award' + (n === 1 ? '' : 's') + ' announced on ' + MD(night) + '.', 'info'); } renderAwards(); return;
    }
    if (id === 'btnAwAnnPrint') { App.showReport('announceList'); App.reportOptions({ group: ui.awGroup === 'All' ? '' : ui.awGroup, room: ui.awRoom }); return; }      // N29: the club-night list, for the group and class picked here
    if (id === 'btnAwHandPrint') { App.showReport('handOut'); App.reportOptions({ group: ui.awGroup === 'All' ? '' : ui.awGroup, room: ui.awRoom }); return; }      // All groups prints every group (the report has an All groups choice)
    if (id === 'btnAwCeremony') { App.reportOptions({ group: ui.awGroup === 'All' ? 'Sparks' : ui.awGroup, room: ui.awRoom }); App.showReport('ceremony'); if (ui.awGroup === 'All') App.flash('This list prints one group at a time: Sparks is showing. Change the Group above the report for the others.', 'info'); }
  });
  // Slide images: the awards earned and not yet announced (and not held) drawn as the 1920x1080 "Awards Earned" slides (slides.js), one PNG per group or all in a ZIP. The night is only the title and the Adult Memorization night.
  function openAwardSlides() {
    const date = nextNight();
    if (!season || !date) return;
    const dlg = $('dlg'), year = season.year || '';
    let cur = 'sparks', built = null;
    dlg.innerHTML = '<h3 style="margin-top:0">Awards slides &mdash; ' + esc(MD(date)) + '</h3><div id="slWarn"></div><div class="bar" id="slTabs"></div>' +
      '<canvas id="slCanvas" style="width:100%;aspect-ratio:16/9;border:1px solid var(--line);background:#000"></canvas>' +
      '<div id="slAdults" hidden><p class="status">Adults are not in the roster, so type each name and award for this night.</p><div id="slAdultRows"></div>' +
      '<div class="bar"><input type="text" id="slName" placeholder="Name" size="18"><input type="text" id="slAward" placeholder="Passage or award" size="22"><button id="slAdd">Add</button></div></div>' +
      '<p id="slEmpty" class="emptynote" role="status" hidden></p><p class="status" id="slMsg"></p><div class="dlgbtns"><button id="slClose">Close</button><button id="slOne">Download this slide</button><button id="slAll" class="primary">Download all (ZIP)</button></div>';
    const draw = () => {
      built = Slides.buildSlides(season, App.master, date);
      const s = built.slides.find(x => x.id === cur);
      $('slTabs').innerHTML = built.slides.map(x => '<button data-slide="' + x.id + '"' + (x.id === cur ? ' class="primary"' : '') + '>' + esc(x.subtitle) + ' (' + x.count + ')</button>').join('');
      $('slWarn').innerHTML = built.warnings.map(w => '<p class="status dirty">' + esc(w) + '</p>').join('');
      $('slAdults').hidden = cur !== 'adult';
      const list = (season.adults || {})[date] || [];
      $('slAdultRows').innerHTML = list.map((e, i) => '<div>' + esc(e.n) + ' &mdash; ' + esc(e.a) + ' <a href="#" data-rm="' + i + '" title="remove" aria-label="Remove">&times;</a></div>').join('');
      // Nothing to download: grey the buttons out and say so in plain sight, instead of a quiet note after the fact.
      const total = built.slides.reduce((n, x) => n + x.count, 0), empty = $('slEmpty');
      $('slOne').disabled = !s.count; $('slAll').disabled = !total; $('slOne').title = s.count ? '' : 'This slide is empty'; $('slAll').title = total ? '' : 'There are no slides to download';
      empty.hidden = !!total; empty.textContent = total ? '' : 'No earned award is waiting to be announced (or all are held), so there are no slides to download. Finish a section on the Progress sheet or release a hold on the Awards tab, then come back.';
      $('slMsg').textContent = s.count || !total ? '' : s.subtitle + ' has nothing waiting to be announced, so this slide is empty and cannot be downloaded. The other slides above can.';
      Slides.fontsReady().then(() => Slides.render($('slCanvas'), s, year));
    };
    const png = s => { const c = document.createElement('canvas'); Slides.render(c, s, year); return Slides.toBlob(c); };
    dlg.onclick = e => {
      const b = e.target.closest('button[data-slide]'); if (b) { cur = b.dataset.slide; draw(); return; }
      const rm = e.target.closest('a[data-rm]');
      if (rm) { e.preventDefault(); const l = season.adults[date]; l.splice(+rm.dataset.rm, 1); if (!l.length) delete season.adults[date]; touchSeason(); draw(); }
    };
    $('slAdd').onclick = () => {
      const n = $('slName').value.trim(), a = $('slAward').value.trim(); if (!n || !a) return;
      (season.adults = season.adults || {})[date] = ((season.adults || {})[date] || []).concat({ n, a }); touchSeason(); $('slName').value = $('slAward').value = ''; draw(); $('slName').focus();
    };
    $('slClose').onclick = () => dlg.close();
    // Every step reports a failure on screen: a slide that cannot be drawn or saved says so here, instead of nothing happening.
    const fail = err => { console.error('Slides:', err); $('slMsg').textContent = 'The slides could not be made or saved: ' + (err && err.message ? err.message : err); };
    $('slOne').onclick = () => App.testGate($('slOne'), () => { const s = built.slides.find(x => x.id === cur); $('slMsg').textContent = 'Working\u2026'; Slides.fontsReady().then(() => png(s)).then(blob => { App.download(s.file, blob, 'image/png'); $('slMsg').textContent = (App.driveSave && App.driveSave.active() ? 'Sending to Google Drive: ' : 'Downloaded ') + s.file + '.'; }).catch(fail); });
    $('slAll').onclick = () => App.testGate($('slAll'), () => {
      const todo = built.slides.filter(x => x.count);
      if (!todo.length) { $('slMsg').textContent = 'No slide has any entries for this night.'; return; }
      $('slMsg').textContent = 'Working\u2026';
      Slides.fontsReady().then(() => Promise.all(todo.map(s => png(s).then(b => b.arrayBuffer()).then(buf => ({ name: s.file, data: new Uint8Array(buf) })))))
        .then(files => { App.download('Awards Earned Slides ' + date + '.zip', Slides.makeZip(files), 'application/zip'); $('slMsg').textContent = (App.driveSave && App.driveSave.active() ? 'Sent to Google Drive: ' : 'Downloaded ') + files.length + (files.length === 1 ? ' slide' : ' slides') + '. Empty slides were skipped.'; }).catch(fail);
    });
    dlg.showModal(); draw();
  }
  $('btnAwImages').addEventListener('click', openAwardSlides);
  App.openAwardSlides = openAwardSlides;
  // Handbook, date received and note as three boxes (shared with the Person tab). The stored value stays one string, "HG 260916".
  const HB_FIELDS = [['code', 'Handbook', 'text', 'e.g. HG'], ['date', 'Date received', 'date', ''], ['note', 'Note', 'text', '']];
  function handbookBox(id) {
    const parts = Season.handbookParts(season.handbooks[id]);
    const codes = Object.keys(season.config.books).sort();      // only books on the Options tab are offered; a code typed that is not there is marked below
    // The subtitle under each code: name, emblem color and group. A typed code in any capitals finds its book (AOG finds AoG).
    const subtitle = c => { const k = Season.bookKey(season, c) || c, b = Object.assign({}, Catalog.defaultConfig().books[k], season.config.books[k]);      // an older file's book list may lack the group: the standard one fills in
      return b.name ? [b.name, b.emblem, b.group].filter(Boolean).join(' \u00b7 ') : ''; };
    $('hbCodes').innerHTML = codes.map(c => '<option value="' + esc(c) + '">' + esc(subtitle(c)) + '</option>').join('');
    // This year's book for the child's group (Options tab; Cubbies and T&T each use one book together) is offered to a child who has no handbook yet: shown as the hint, with a button that fills it in (nothing is saved until then).
    const kid = App.master && App.master.people.find(p => idOf(p) === id), grp = kid ? Model.groupOf(Model.room(kid)) : '', dflt = Season.yearBook(season, grp), offer = dflt && !parts.code ? dflt : '';
    // A Sparks child in the usual in-order method: the book in use is worked out from the received dates and progress (Person tab, Progress); the handbook code here stays editable (it is the fallback, and a wrong or unrecognized one is fixed here).
    const derived = grp === 'Sparks' ? Season.sparksCurrent(season, id) : '', hint = derived && derived !== Season.bookKey(season, parts.code) ? ' <span class="status">Book in use: <b>' + esc((season.config.books[derived] || {}).name || derived) + '</b>, worked out from the received dates and progress on the Person tab (Progress).</span>' : '';
    return '<span class="hbbox">' + HB_FIELDS.filter(f => f[0] !== 'date').map(([k, l, type, ph]) => '<label class="pf"><span>' + l + '</span><input type="' + type + '" data-hb="' + k + '" value="' + esc(parts[k]) + '"' +
      (k === 'code' ? ' list="hbCodes" size="8" placeholder="' + esc(offer || ph) + '"' + (Check.bookCode(parts.code, season.config.books) ? ' class="warnfield" aria-invalid="true" title="' + esc(Check.bookCode(parts.code, season.config.books).msg) + '"' : '') : k === 'note' ? ' size="18"' : '') + '></label>').join('') +
      (offer ? ' <button type="button" class="todaybtn" data-hbuse="' + esc(offer) + '" title="This year\'s ' + esc(grp) + ' book, set on the Options tab">Use ' + esc(offer) + '</button>' : '') + hint + '</span>';
  }
  // Read the three boxes next to an edited one and store them; true if the book code changed.
  function saveHandbook(box, id, leaving) {
    const v = Object.assign({}, Season.handbookParts(season.handbooks[id])); box.querySelectorAll('[data-hb]').forEach(i => { v[i.dataset.hb] = i.value; });      // a box that is not shown (the worked-out book) keeps what is stored
    const dbox = box.querySelector('[data-hb="date"]');
    if (!leaving && dbox && /^0\d{3}-/.test(v.date || '')) return false;      // a date box reports 0002-09-23 as soon as the first digit of the year is typed: wait until the year is finished (focusout checks it)
    const badDate = Check.date(v.date);
    if (badDate) { const di = box.querySelector('[data-hb="date"]'); di.value = Season.handbookParts(season.handbooks[id]).date; App.flash('Date received: ' + badDate.msg, 'error'); return false; }
    v.code = Season.bookCode(season, v.code);
    const bk = Check.bookCode(v.code, season.config.books); if (bk) App.flash(bk.msg + ' (saved as typed; it is on the To do list)', 'warn');
    const was = Season.handbookParts(season.handbooks[id]).code;
    try { Season.setHandbook(season, id, v); } catch (err) { App.ask.alert(err.message); }
    touchSeason();
    const ci = box.querySelector('[data-hb="code"]'), cw = Check.bookCode(v.code, season.config.books);      // mark or clear the box now: the page is not redrawn while you tab between the boxes
    if (ci) { ci.classList.toggle('warnfield', !!cw); ci.setAttribute('aria-invalid', cw ? 'true' : 'false'); ci.title = cw ? cw.msg : ''; }
    return was !== String(v.code || '').trim();
  }
  Object.assign(App, { handbookBox, saveHandbook });
  // Leaving the Date received box with a half-typed year (0020-09-23): check it now, say so, and put the saved date back.
  document.addEventListener('focusout', e => {
    const t = e.target, box = t && t.matches && t.matches('.hbbox [data-hb="date"]') && t.closest('.hbbox');
    if (!box || !/^0\d{3}-/.test(t.value || '')) return;
    const id = ui.prKid && App.progressShowing && App.progressShowing() ? ui.prKid : null; if (!id) return;      // the Person tab's own handler covers the other sub-tabs
    saveHandbook(box, id, true);
  }, true);
  document.addEventListener('click', e => {      // "Use AoG": fill in the code and let the box save it like a typed one
    const b = e.target.closest && e.target.closest('[data-hbuse]'), i = b && b.closest('.hbbox') && b.closest('.hbbox').querySelector('[data-hb="code"]'); if (!i) return;
    i.value = b.dataset.hbuse; i.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // ---------- progress ----------
  // Only Sparks and T&T have a progress record. The pickers narrow the child list: group (or All), then class (room) within it.
  const PR_GROUPS = ['Cubbies', 'Sparks', 'T&T'];
  // The Progress sub-tab of the Person tab: the person picked there (ui.prKid, set by the Person tab) when they have a progress record.
  const progressAllowed = p => Model.isClubber(p) && PR_GROUPS.includes(Model.groupOf(Model.room(p)));
  function currentBook(id, codes, prog) {
    const hb = Season.childBook(season, id);      // Sparks: the book they are in, worked out; the others: the handbook
    if (codes.includes(hb)) return hb;
    const yb = Season.yearBook(season, Season.bookGroup(season, codes[0])); if (yb && codes.includes(yb)) return yb;      // this year's book for the group (All Together for Sparks; always for T&T) when the child has none yet      // the All Together method: this year's book for every Sparks child without a handbook yet
    // Most recent SHOWN day: a no-date sign-off keeps a hidden day in the file, which must not make its book look the most recent (R21). A book with only no-date sign-offs is still started, so it sorts last among the started books.
    const latest = c => Object.keys(prog[c] || {}).filter(k => prog[c][k] && !Season.isSignNoDate(season, id, c, k)).map(k => prog[c][k]).sort().pop() || '';
    const started = c => Object.values(prog[c] || {}).some(Boolean);
    const used = codes.filter(started).sort((a, b) => latest(b).localeCompare(latest(a)));
    return used[0] || codes[0];
  }
  // The pace strip at the top of a child's Progress sheet. Words follow pace.js: overall = all nights attended, recent = the last few attended nights.
  function paceStrip(r, g) {
    if (!r) return '';
    if (!r.roomEntered) return '<div class="pacestrip status">Pace: no sign-off dates are entered for this class yet.</div>';
    const f = Pace.f1, W = Pace.CFG.WINDOW, extraName = g === 'Sparks' ? 'Reviews' : 'Silver / Gold';
    let h = '<div class="pacestrip"><b>Pace</b> ';
    if (r.overall === null) h += '<span class="status">too early: ' + r.nights + ' night' + (r.nights === 1 ? '' : 's') + ' attended so far</span>';
    else h += 'overall <b>' + f(r.overall) + '</b>/night &middot; recent (last ' + Math.min(W, r.nights) + ' nights) <b>' + f(r.recent) + '</b>/night' + (r.trend ? ' &middot; <b class="trend-' + r.trend + '">' + Pace.ARROW[r.trend] + '</b>' : '') +
      (r.list ? ' &middot; <span class="watch">' + esc(Pace.LISTS[r.list]) + '</span>' : '');
    h += '<br><span class="status" title="' + esc(r.dates.map((d, i) => MD(d) + ': ' + r.per[i]).join(', ')) + '">Sections per night attended, oldest to newest:</span> <span class="spark">' + esc(Pace.spark(r.per)) + '</span>' +
      '<br><span class="status">' + r.core + ' core section' + (r.core === 1 ? '' : 's') + ' signed' + (r.last ? ', last ' + esc(MD(r.last)) + (r.nightsSince ? ' (' + r.nightsSince + ' night' + (r.nightsSince === 1 ? '' : 's') + ' attended since)' : '') : '') +
      ' &middot; ' + extraName + ' ' + r.extra + ' of ' + r.extraTotal + ' (not counted in pace) &middot; ' + r.nights + ' night' + (r.nights === 1 ? '' : 's') + ' attended</span>' +
      '<br><a href="#" class="lnk" id="btnPaceWatch">Print pace watch list&hellip;</a></div>';
    return h;
  }
  // One progress sheet: the book's date received, "finished before", and the blocks (Flight 3:16, Start Zone or Apple Acres only with the first book of the group). Used by the Progress tab and by a child's page.
  function sheetHtml(p, book) {
    const id = idOf(p), bg = Season.bookGroup(season, book), t = season.config.progress[bg], prog = season.progress[id] || {};
    if (!t) return '<p class="status">There is no progress sheet for this book.</p>';
    const fillName = (a, scope) => a.replace('{book}', scope).replace('{emblem}', (season.config.books[scope] || {}).emblem || '');
    const earnedBlocks = Season.completedBlocks(season, id, bg), earnedOf = (key, scope) => earnedBlocks.find(x => x.key === key && (x.book || 'common') === scope);
    // An empty date gets a one-tap Today button (the date picker takes two taps and a scroll on a phone); a filled one is edited in the date box.
    // Notes and flags: a small flag on every date box, every block and the whole sheet; a flagged place is outlined and its flag is lit. The notes themselves are listed under the sheet's tabs and on the To do tab.
    const myFlags = Season.flagsOf(season, id), flagsAtPlace = (level, book, block, key) => myFlags.filter(f => f.level === level && f.book === book && f.block === block && f.key === key);
    // The little flag is drawn only where something is flagged: yellow, and a click opens the note's popup (app-flagpop.js). New flags come from the top-bar Flag button and the To do "Add note" box.
    const flagBtn = (level, book, block, key, what) => { const here = flagsAtPlace(level, book, block, key); if (!here.length) return '';
      return '<button type="button" class="flagbtn on" tabindex="-1" data-flag="' + level + '" data-fids="' + esc(here.map(f => f.id).join(',')) + '" data-fbook="' + esc(book) + '" data-fblock="' + esc(block) + '" data-fkey="' + esc(key) + '" title="' + esc(here.map(f => f.note).join(' / ')) + '" aria-label="Note about ' + esc(what) + '">&#9873;</button>'; };
    // N24 (2026-11-18): a block completed by hand (every box no-date) hides the "no date" line and Clear on each box; the boxes stay open for dates (typing one clears its mark).
    const cell = (b, scope, i, dates, label, what) => { const nd = Season.isSignNoDate(season, id, scope, b.key + '.' + i), v = nd ? '' : dates[b.key + '.' + i] || '', d = what || label, wholeNd = nd && (b.items || []).every(x => Season.isSignNoDate(season, id, scope, b.key + '.' + x));      // a no-date sign-off shows no date (its day is kept inside, see markSignsNoDate)
      return '<span class="pcell' + (flagsAtPlace('box', scope, b.key, b.key + '.' + i).length ? ' flagged' : '') + '">' + flagBtn('box', scope, b.key, b.key + '.' + i, d) + '<label class="pitem">' + esc(label) + '<input type="date" data-scope="' + esc(scope) + '" data-key="' + esc(b.key + '.' + i) + '" value="' + esc(v) + '"></label>' +
        (nd && !wholeNd ? ' <span class="status" title="Finished when its award was given, with no date. No date is shown or printed.">no date</span> <button type="button" class="todaybtn" data-clearnd="1" tabindex="-1" title="Take the no-date mark off: this section is not finished again" aria-label="Clear the no-date mark on ' + esc(d) + '">Clear</button>' : '') +
        (v || (nd && !wholeNd) ? '' : '<button type="button" class="todaybtn" data-today="1" tabindex="-1" aria-label="Set ' + esc(d) + ' to today">Today</button>' + sameBtn(b, scope, i, dates, d)) + '</span>'; };
    // "Same date" beside Today (every section row, and each jewel's review row): it fills this box, and every empty box before it back to the last dated one, with that last date. Press it on the last box to sign off the rest of the row at once.
    const sameBtn = (b, scope, i, dates, d) => {
      const list = b.items.includes(i) ? b.items : (b.review || []), at = list.indexOf(i), shown = Season.signsShown(season, id, scope); let j = at - 1; while (j >= 0 && !shown[b.key + '.' + list[j]]) j--;      // walk back over boxes with a REAL date: a no-date box has no date to copy (its hidden tick day must never be written into a real box); the fill below skips it too (it is already signed)
      if (at < 1 || j < 0) return !lastEntered || lastEntered === App.today() ? '' : '<button type="button" class="todaybtn" data-copylast="' + esc(b.key + '.' + i) + '" data-date="' + esc(lastEntered) + '" data-scope="' + esc(scope) + '" tabindex="-1" title="Use the last date entered (' + esc(lastEntered) + ')" aria-label="Set ' + esc(d) + ' to the last date entered">Same date</button>';      // first box of a row: paste the last date entered anywhere
      const date = shown[b.key + '.' + list[j]], fill = list.slice(j + 1, at + 1).filter(x => !dates[b.key + '.' + x]).map(x => b.key + '.' + x);
      return '<button type="button" class="todaybtn" data-copylast="' + esc(fill.join(',')) + '" data-date="' + esc(date) + '" data-scope="' + esc(scope) + '" tabindex="-1" title="Fill this box, and any empty ones before it, with the last date entered (' + esc(date) + ')" aria-label="Set ' + esc(d) + ' to the last date entered">Same date</button>';
    };
    // Earned = the last section dated; Given = the day the award is handed to the child (the Date / Initial column on the paper record). It is offered once the award is earned.
    // Announced = the night the award was told to the group (edit it, or clear it to take the award back to "not announced"); Hold = keep it off the slides until released. Both are per award, like Given.
    // "Same date" for Given, Announced and Received: re-use the last date entered anywhere (Red Pilot Wings and Red Jewel 1 are usually handed over on the same night). Not offered when it is today (Today does that).
    // The date is read when the button is pressed, not when the sheet was drawn, so it is always the latest one.
    const reuseBtn = (kind, a) => !lastEntered || lastEntered === App.today() ? '' : '<button type="button" class="todaybtn" data-' + kind + 'same="' + esc(a) + '" tabindex="-1" title="Use the last date entered (' + esc(lastEntered) + ')" aria-label="Set ' + esc(a) + ({ g: ' given', a: ' announced', r: ' received' }[kind]) + ' to the last date entered">Same date</button>';
    // where: { book, block, items } of the section the award belongs to. Given is offered even before the section is finished; giving it then confirms first (sectionGate).
    const givenBox = (names, earned, where) => names.map(a => { const nd = Season.isGivenNoDate(season, id, a), gd = Season.givenShown(season, id, a), ann =(Season.awardsOf(season, id).find(x => x.award === a) || {}).date || '', held = Season.isHeld(season, id, a);
      const w = where ? ' data-gbook="' + esc(where.book) + '" data-gblock="' + esc(where.block) + '" data-gitems="' + esc(where.items.join(',')) + '"' : '';
      // One compact card per award: its name, then Given (date, Today, no date) and, once earned, Announced (date, hold) side by side, wrapping on a narrow screen.
      const warn = (gd || nd) && ui.givenWarn && ui.givenWarn[id + '|' + a], warnHtml = warn ? '<span class="pwarn" role="note"><span aria-hidden="true">&#9888;</span> Given before its section was finished: ' + warn + ' empty sign-off' + (warn === 1 ? '' : 's') + ' marked no date. This note goes away when the file is saved.</span>' : '';
      return '<span class="pgive"><span class="pgname">' + esc(Season.awardLabel(season, id, a)) + '</span>' + warnHtml +
        '<span class="pgf"><label class="pitem">Given<input type="date" data-gaward="' + esc(a) + '"' + w + ' value="' + esc(gd) + '" aria-label="Given: ' + esc(Season.awardLabel(season, id, a)) + '"></label>' + (gd || nd ? '' : '<button type="button" class="todaybtn" data-gtoday="' + esc(a) + '" tabindex="-1" aria-label="Set ' + esc(a) + ' given today">Today</button>' + reuseBtn('g', a)) +
        '<label class="uov" title="Handed over, but I do not have the date. Counts as given, but no date is shown or printed."><input type="checkbox" data-gnodate="' + esc(a) + '"' + w + (nd ? ' checked' : '') + (gd ? ' disabled' : '') + ' aria-label="' + esc(a) + ' given, date unknown"> no date</label></span>' +
        (earned || ann ?
        '<span class="pgf"><label class="pitem">Announced<input type="date" data-aaward="' + esc(a) + '" value="' + esc(ann) + '" aria-label="Announced: ' + esc(Season.awardLabel(season, id, a)) + '"></label>' +
        (ann ? '' : '<button type="button" class="todaybtn" data-atoday="' + esc(a) + '" tabindex="-1" aria-label="Set ' + esc(a) + ' announced today">Today</button>' + reuseBtn('a', a)) +
        (ann ? '' : '<label class="uov" title="Told to the group, but I do not have the date. Counts as announced; no date is shown or printed."><input type="checkbox" data-annnodate-tick="' + esc(a) + '"' + (Season.isAnnNoDate(season, id, a) ? ' checked' : '') + ' aria-label="' + esc(a) + ' announced, date unknown"> no date</label>') +
        (ann ? '' : '<label class="uov" title="Keep this award off the slides until you release it"><input type="checkbox" data-hold="' + esc(a) + '"' + (held ? ' checked' : '') + ' aria-label="Hold: ' + esc(Season.awardLabel(season, id, a)) + '"> hold</label>') + '</span>' : '') + '</span>'; }).join('');
    const block = (b, scope) => {
      const dates = prog[scope] || {}, done = b.items.every(i => dates[b.key + '.' + i]), names = b.awards.map(a => fillName(a, scope)), er = earnedOf(b.key, scope);
      // Flight 3:16 has no award to hand out: the block just shows it is complete (green, with the day), with no Given / Announced / Hold boxes.
      if ((names.length && names.every(a => a === 'Flight 3:16')) || b.key === 'FLT') return '<div class="pblock' + (done ? ' done' : '') + '"><span class="plabel">' + esc(b.label) + (done ? ' ✓' : '') + flagBtn('block', scope, b.key, '', b.label) + '</span>' +
        b.items.map(i => cell(b, scope, i, dates, b.single ? 'Done' : i, b.label + ' ' + i)).join('') + '<span class="pawards">' + (done ? 'Complete' + (er && !er.noDate ? ' ' + esc(MD(er.date)) : '') : '') + '</span></div>';
      return '<div class="pblock' + (done ? ' done' : '') + '"><span class="plabel">' + esc(b.label) + (done ? ' ✓' : '') + flagBtn('block', scope, b.key, '', b.label) + '</span>' +
        b.items.map(i => cell(b, scope, i, dates, b.single ? 'Done' : i, b.label + ' ' + i)).join('') +
        '<span class="pawards">' + (names.length ? esc(names.map(a => Season.awardLabel(season, id, a)).join(' + ')) + (er ? ' · earned ' + (er.noDate ? '(no date)' : esc(MD(er.date))) : '') : er ? 'completed ' + (er.noDate ? '(no date)' : esc(MD(er.date))) : '') + '</span>' +
        (names.length ? '<span class="prow">' + givenBox(names, done, { book: scope, block: b.key, items: b.items }) + '</span>' : '') + '</div>';
    };
    // The Sparks reviews come after all the jewels, one row per jewel, numbered 1 to 4 like the jewels. They are stored as items 5 to 8 of that jewel (the number shown is the position in the review row).
    const reviews = scope => {
      const rb = t.perBook.filter(b => (b.review || []).length), dates = prog[scope] || {};
      if (!rb.length) return '';
      const before = Season.reviewsDoneBefore(season, id, scope);
      const control = '<p class="status bdone"><label><input type="checkbox" data-reviewsdone="' + esc(scope) + '"' + (before ? ' checked' : '') + ' aria-label="' + esc(bname(scope)) + ' reviews finished before"> Finished before (another club, no review records)</label></p>';
      const rows = rb.map(b => { const done = b.review.every(i => dates[b.key + '.' + i]), n = b.review.filter(i => dates[b.key + '.' + i]).length;
        return '<div class="pblock' + (done ? ' done' : '') + '"><span class="plabel">' + esc(b.label) + ' review' + (done ? ' ✓' : '') + '</span>' + b.review.map((i, k) => cell(b, scope, i, dates, k + 1, b.label + ' review ' + (k + 1))).join('') +
          '<span class="pawards status">' + n + ' of ' + b.review.length + ' (counts toward the book&rsquo;s Review Emblem)</span></div>'; }).join('');
      return '<div class="previews"><span class="plabel status">Reviews</span>' + control + (before ? '<p class="status">Reviews marked finished before this club. Existing dates are kept; uncheck to view or edit them.</p>' : rows) + '</div>';
    };
    // The book's Review Emblem: all the jewels' sections and reviews.
    const bookReview = scope => {
      const br = t.bookReview, rb = t.perBook.filter(b => (b.review || []).length), dates = prog[scope] || {};
      if (!br || !rb.length) return '';
      const all = [].concat(...rb.map(b => b.items.concat(b.review).map(i => b.key + '.' + i))), n = all.filter(k => dates[k]).length, er = earnedOf('BOOKREVIEW', scope), names = br.awards.map(a => fillName(a, scope));
      return '<div class="pblock' + (er ? ' done' : '') + '"><span class="plabel">' + esc(br.label || 'Book Review') + (er ? ' ✓' : '') + '</span><span class="status">' + n + ' of ' + all.length + ' section and review dates entered in the jewels' + (Season.reviewsDoneBefore(season, id, scope) ? '; Reviews finished before this club' : '') + '</span>' +
        '<span class="pawards">' + esc(names.map(a => Season.awardLabel(season, id, a)).join(' + ')) + (er ? ' · earned ' + (er.noDate ? '(no date)' : esc(MD(er.date))) : '') + '</span>' + (er || names.some(a => (season.given[id] || {})[a]) ? '<span class="prow">' + givenBox(names, !!er) + '</span>' : '') + '</div>';
    };
    const bname = c => (season.config.books[c] || {}).name || c, rv = Season.receivedShown(season, id, book), rvNoDate = Season.isReceivedNoDate(season, id, book), rvAny = rv || rvNoDate;
    // T&T: a child gets the book when Start Zone is finished. Offered (never filled in by itself) as the date received when there is none.
    const sz = bg === 'T&T' && !rvAny ? Season.completedBlocks(season, id, 'T&T').find(b => b.key === 'SZ' && !b.noDate) : null;      // not offered when Start Zone was finished with a no-date sign-off (it has no day to offer)
    const szBtn = sz ? ' <button type="button" class="todaybtn" data-recvsz="' + esc(book) + '" tabindex="-1" data-date="' + esc(sz.date) + '" title="The day Start Zone was finished: the day the book is earned">Use Start Zone finished ' + esc(MD(sz.date)) + '</button>' : '';
    const recv = '<p class="recvrow"><label><b>' + esc(bname(book)) + '</b> &nbsp; Date received <input type="date" data-recv="' + esc(book) + '" value="' + esc(rv) + '"></label>' + (rvAny ? '' : ' <button type="button" class="todaybtn" data-recvtoday="' + esc(book) + '" tabindex="-1" aria-label="Set ' + esc(bname(book)) + ' received today">Today</button>' + reuseBtn('r', book) + szBtn) +
      ' <label class="uov" title="The child has this book, but I do not have the day. It counts as received; no date is shown or printed."><input type="checkbox" data-recvnd="' + esc(book) + '"' + (rvNoDate ? ' checked' : '') + (rv ? ' disabled' : '') + ' aria-label="' + esc(bname(book)) + ' received, date unknown"> no date</label></p>';
    const fin = Season.finishedBooks(season, id).find(b => b.book === book), done = ((season.doneBooks || {})[id] || []).includes(book);
    const bd = '<p class="status bdone"><label><input type="checkbox" data-bookdone="' + esc(book) + '"' + (done ? ' checked' : '') + ' aria-label="' + esc(bname(book)) + ' finished before"> Finished before (another club, no section records)</label>' + (fin && !fin.before ? (fin.noDate ? ' &middot; <b>finished</b> (every section is signed off; at least one has no date)' : ' &middot; <b>finished ' + esc(MD(fin.date)) + '</b> (every section is dated)') : '') + '</p>';
    // One row for the four Blue Jewels of a Sparks sheet. They are awarded automatically from nights present (the counts are Blue Jewel weeks on Options: 6, 12, 19, 27 by default), so the four boxes only show the day each was earned
    // and cannot be typed in; under the row an earned jewel has the same Given, Announced and Hold boxes as every other award. The row is on the tab of the book the jewel's name carries (the child's book at the time).
    const blueJewelRow = () => {
      // The gems in this book's wings (placed by the club-year rule: Season.sparkJewels). The row shows on the current book, and on any book with a gem placed in it.
      const jewels = Season.sparkJewels(season, id, App.calendar), weeks = season.config.blueJewelWeeks || [], cur = Season.childBook(season, id) || Season.bookOrder(season, bg)[0], waiting = Season.heldGems(season, id, App.calendar), skippedHere = Season.blueWingPlan(season, id, App.calendar).skipped.filter(x => x.book === book).length;
      const slots = [1, 2, 3, 4].map(n => { const j = jewels.find(x => x.book === book && x.n === n), name = book + ' Blue Jewel ' + n;
        return { n, j, name, home: book, hasGiven: (season.given[id] || {})[name] || Season.isGivenNoDate(season, id, name) }; });
      if (!slots.some(s => s.j) && book !== cur) return '';
      const done = slots.every(s => s.j);
      return '<div class="pblock bjblock' + (done ? ' done' : '') + '"><span class="plabel">Blue Jewels' + (done ? ' ✓' : '') + flagBtn('block', book, 'BJ', '', 'Blue Jewels') + '</span>' +
        slots.map(s => '<span class="pcell"><label class="pitem">' + s.n + ' &middot; ' + esc(String(weeks[s.n - 1] || '?')) + ' nights<input type="date" disabled value="' + esc(s.j ? s.j.date : '') + '" aria-label="Blue Jewel ' + s.n + ' earned' + (s.home !== book ? ' (' + esc(s.home) + ' book)' : '') + '" title="Awarded automatically from nights present' + (s.home !== book ? ' (earned in the ' + esc(s.home) + ' book)' : '') + '"></label>' +
          (s.j ? ' <button type="button" class="todaybtn" data-bjdrop="1" data-bjbook="' + esc(book) + '" data-bjslot="' + s.n + '" data-bjgem="' + esc(String(s.j.gem)) + '" data-bjdate="' + esc(s.j.date) + '" data-bjov="' + (s.j.override ? '1' : '0') + '" aria-label="Drop Blue Jewel ' + s.n + ' of ' + esc(book) + '" title="Drop this Blue Jewel: it leaves the wings and its award">Drop</button>'
            : ' <button type="button" class="todaybtn" data-bjgrant="1" data-bjbook="' + esc(book) + '" data-bjslot="' + s.n + '" aria-label="Grant Blue Jewel ' + s.n + ' of ' + esc(book) + ' by hand" title="Grant this Blue Jewel by hand (a leader decision, with a note)">Grant by hand</button>') + '</span>').join('') +
        '<span class="pawards">awarded automatically, by nights present' + (waiting ? '; ' + waiting + ' earned and held for the next set of wings' : '') + (skippedHere ? '; ' + skippedHere + ' hand grant' + (skippedHere === 1 ? ' was' : 's were') + ' not placed: that slot already holds a gem from an earlier year' : '') + '</span>' +
        slots.filter(s => s.home === book && (s.j || s.hasGiven)).map(s => '<span class="prow">' + givenBox([s.name], !!s.j) + '</span>').join('') + '</div>';
    };
    const flagbar = (myFlags.length ? '<p class="hbrow flagrow"></p>' : '') +
      myFlags.map(f => '<p class="flagnote"><button type="button" class="flagbtn on" tabindex="-1" data-fids="' + esc(f.id) + '" aria-label="Note: ' + esc(flagWhere(f)) + '" title="Read, edit or clear this note">&#9873;</button> <b>' + esc(flagWhere(f)) + '</b>: ' + esc(f.note) + ' <span class="status">' + esc(MD(f.at)) + (Season.isFlagHidden(f) ? ' &middot; hidden on To do' : '') + '</span> <button type="button" data-hideflag="' + esc(f.id) + '" data-on="' + (Season.isFlagHidden(f) ? '' : '1') + '">' + (Season.isFlagHidden(f) ? 'Unhide' : 'Hide') + '</button> <button type="button" data-clearflag="' + esc(f.id) + '">Clear</button></p>').join('');
    // The sheet header: collapse (hides the sign-offs below it), Print, and the flag button with any flagged notes. Collapsed, only this header shows.
    const printBtn = bg === Model.groupOf(Model.room(p)) ? '<button id="btnPrPrint">Print record&hellip;</button>' : '';
    let h = '<p class="hbrow shhead"><button type="button" data-shcol aria-expanded="' + (ui.shCollapsed ? 'false' : 'true') + '">' + (ui.shCollapsed ? '&#9656; Show sheet' : '&#9662; Hide sheet') + '</button> ' + printBtn + ' <i class="info" data-info="progress.sheet"></i></p>' + flagbar;
    if (ui.shCollapsed) return h;
    h += recv + bd;
    // N43: a book finished before (another club, no section records) shows no sections: its dates stay in the data, and unticking brings them back. Reviews, the Book Review and the book award still show.
    if (!done && Season.bookOrder(season, bg)[0] === book) h += t.common.map(b => block(b, 'common')).join('');
    // N59: on a T&T sheet, Silver and Gold extra credit sit directly beneath each emblem section (Unit 1: BE1, RE1; Unit 2: GE1, YE1; Unit 3: BE2, RE2; Unit 4: GE2, YE2).
    const tntSection = (b, scope) => {
      const u = (/^[BR]E1$/.test(b.key) ? 1 : /^[GY]E1$/.test(b.key) ? 2 : /^[BR]E2$/.test(b.key) ? 3 : /^[GY]E2$/.test(b.key) ? 4 : 0);
      const svBlock = t.perBook.find(x => x.key === 'SV' + u), gdBlock = t.perBook.find(x => x.key === 'GD' + u);
      const dates = prog[scope] || {};
      const renderRow = (blk, subItems, isExtraRow) => {
        const rowDone = subItems.length && subItems.every(i => dates[blk.key + '.' + i]);
        const fullDone = blk.items.every(i => dates[blk.key + '.' + i]);
        const names = blk.awards.map(a => fillName(a, scope)), er = earnedOf(blk.key, scope);
        const ghostCount = b.items.length - subItems.length;
        let cellsHtml = subItems.map(i => cell(blk, scope, i, dates, i, blk.label + ' ' + i)).join('');
        for (let g = 0; g < ghostCount; g++) {
          cellsHtml += '<span class="pcell pcell-ghost" aria-hidden="true" style="visibility:hidden"><label class="pitem">&nbsp;<input type="date" disabled tabindex="-1"></label></span>';
        }
        const awText = fullDone ? esc(names.map(a => Season.awardLabel(season, id, a)).join(' + ')) + (er ? ' · earned ' + (er.noDate ? '(no date)' : esc(MD(er.date))) : '') : (er ? 'completed ' + (er.noDate ? '(no date)' : esc(MD(er.date))) : '');
        return '<div class="pblock tnt-row' + (rowDone ? ' done' : '') + (isExtraRow ? ' tnt-extra' : '') + '">' +
          '<span class="plabel">' + esc(blk.label) + (rowDone ? ' ✓' : '') + flagBtn('block', scope, blk.key, '', blk.label) + '</span>' +
          cellsHtml + '<span class="pawards">' + awText + '</span>' +
          (names.length ? '<span class="prow">' + givenBox(names, fullDone, { book: scope, block: blk.key, items: blk.items }) + '</span>' : '') +
          '</div>';
      };
      const emblemRow = renderRow(b, b.items, false);
      const svItems = svBlock ? b.items.filter(i => svBlock.items.includes(i)) : [];
      const gdItems = gdBlock ? b.items.filter(i => gdBlock.items.includes(i)) : [];
      const svRow = svBlock && svItems.length ? renderRow(svBlock, svItems, true) : '';
      const gdRow = gdBlock && gdItems.length ? renderRow(gdBlock, gdItems, true) : '';
      return '<div class="tnt-section">' + emblemRow + svRow + gdRow + '</div>';
    };
    if (!done) {
      if (bg === 'T&T') {
        const emblemBlocks = t.perBook.filter(b => !/^(SV|GD)\d$/.test(b.key));
        h += emblemBlocks.map(b => tntSection(b, book)).join('');
      } else {
        h += t.perBook.map(b => block(b, book)).join('');
      }
    }
    // The book-completion award (Alpha, 2nd Book, ...) gets the same Given / Announced boxes as a section award. It is offered only once the book is finished (all its sections dated, or ticked finished before).
    const bookAw = Season.completionAwards(season, id, bg).filter(x => x.book === book).map(x => x.award);
    if (bookAw.length) h += '<div class="pblock done bookaward"><span class="plabel">Book completed</span><span class="prow">' + givenBox(bookAw, true, { book, block: 'BOOKS', items: [] }) + '</span></div>';
    if (bg === 'Sparks') h += (done ? '' : blueJewelRow()) + reviews(book) + bookReview(book);
    return h;
  }
  // ---- Notes and flags: where a flag points, the note box, and jumping to a flagged place ----
  function flagWhere(f) {
    const books = season.config.books || {}, bookName = c => (books[c] || {}).name || c, tpls = Object.keys(season.config.progress || {}).map(g => season.config.progress[g]);
    const blockLabel = key => { if (key === 'BJ') return 'Blue Jewels'; for (const t of tpls) { const b = (t.common || []).concat(t.perBook || []).find(x => x.key === key); if (b) return b.label; } return key; };
    const inBook = f.book && f.book !== 'common' ? bookName(f.book) + ' · ' : '';
    if (f.level === 'general') return 'General note';
    // N44: a filter note names the value it was made on (the class, night or group), so the To do list says which one.
    if (f.level === 'element') return ((f.trail || []).join(' › ') || f.label || 'A flagged element') + (f.filter && f.filter.value ? ': ' + (String(f.filter.value).length > 40 ? String(f.filter.value).slice(0, 40) + '…' : f.filter.value) : '');
    if (f.level === 'attend') return 'Attendance · ' + (f.room || '') + ' · ' + MD(f.date);
    if (f.level === 'team') return 'Color teams · ' + (f.quarter || '') + ' · ' + (f.group || '') + (f.color ? ' · ' + f.color : '');
    if (f.level === 'field') return 'Person · ' + (f.field || '');
    if (f.level === 'child') return 'Whole record';
    if (f.level === 'sheet') return bookName(f.book) + ' sheet';
    if (f.level === 'block') return inBook + blockLabel(f.block);
    return inBook + blockLabel(f.block) + ' · box ' + f.key.slice(f.block.length + 1);
  }
  // Jump to a flagged place: the child's sheet on the right book tab, scrolled to the box or block and briefly highlighted.
  function goFlag(id) {
    const f = (season.flags || {})[id]; if (!f) return;
    if (f.level === 'element') { App.goElement(Object.assign({ id }, f)); return; }      // any element of any tab: found again by its trail (app-flagmode.js)
    if (f.level === 'attend') { ui.attDate = f.date; ui.attRoom = f.room; App.showTab('attend'); setTimeout(() => flashPlace($('attFlagWrap')), 200); return; }      // the night and class the note is about
    if (f.level === 'team') { App.goTeams(f.quarter, f.group); return; }
    if (f.level === 'field') { App.showPerson(f.kid); setTimeout(() => flashPlace($('personWrap').querySelector('[data-pc="' + CSS.escape(f.field) + '"]')), 250); return; }
    App.goProgress(f.kid); const book = f.book && f.book !== 'common' ? f.book : ''; if (book) ui.prBook = book;
    redrawSheet();
    setTimeout(() => { const root = $('progressWrap'); let el = null;
      if (f.level === 'box') el = root.querySelector('input[type=date][data-key="' + CSS.escape(f.key) + '"]');
      else if (f.level === 'block') { const btn = root.querySelector('button[data-flag="block"][data-fblock="' + CSS.escape(f.block) + '"]'); el = btn && btn.closest('.pblock'); }
      else el = root.querySelector('.flagrow');
      if (el) { el.scrollIntoView({ block: 'center' }); const box = el.closest('.pcell,.pblock') || el; box.classList.add('flashflag'); setTimeout(() => box.classList.remove('flashflag'), 2500); } }, 150);
  }
  // ---- Notes on Attendance (a night in one class), Color teams (a quarter's group, optionally one color) and Person-tab fields ----
  // One small dialog for any place. A place is { level, kid, date, room, quarter, group, color, field } (only the parts that level uses). App.flagPlaceBtn draws the flag button; one click handler on the page opens the dialog.
  // The note is listed on the To do tab with Where, Go and Clear, like a flag on a Progress sheet.
  function flashPlace(el) { if (!el) return; el.scrollIntoView({ block: 'center' }); const box = el.closest('.pf') || el; box.classList.add('flashflag'); setTimeout(() => box.classList.remove('flashflag'), 2500); }
  const placeFlags = p => p.level === 'team' ? Season.flagList(season).filter(f => f.level === 'team' && f.quarter === p.quarter && f.group === p.group) : Season.flagsAtPlace(season, p);      // a team note may name one color; the button lights for any note in the group
  // Drawn only where a note exists (yellow); nothing when there is none. A click opens the popup (app-flagpop.js). New notes are made by the Flag button and the To do "Add note" box.
  App.flagPlaceBtn = (place, what) => { const here = season ? placeFlags(place) : []; if (!here.length) return '';
    return '<button type="button" class="flagbtn on" tabindex="-1" data-fplace="' + esc(JSON.stringify(place)) + '" data-fids="' + esc(here.map(f => f.id).join(',')) + '" title="' + esc(here.map(f => f.note).join(' / ')) + '" aria-label="Note about ' + esc(what) + '">&#9873;</button>'; };
  // One click handler for every yellow flag on the page.
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('button[data-fids]'); if (!b || !App.flagPop) return; e.preventDefault(); App.flagPop.show(b.dataset.fids.split(',').filter(Boolean), b); });
  // The Person tab picks the child (setKid); the sheet opens on the child's current book unless one was chosen for them (setBook).
  App.sheets = { html: sheetHtml, focus: (id, book) => { ui.prKid = id; ui.prBook = book; ui._lastKid = id; },
    setKid: id => { ui.prKid = id; }, setBook: b => { ui.prBook = b; ui._lastKid = ui.prKid; }, book: () => ui.prBook };      // book: the book tab on screen (N20: a flag on a progress box is tied to it)
  // "+ Add sheet": another book's sheet for this child (kept in the file), beside the book tabs. It offers only books that have no tab yet.
  const addSheetMenu = codes => {
    const spare = [...new Set(['Cubbies', 'Sparks', 'T&T'].flatMap(x => Season.bookOrder(season, x)))].filter(c => !codes.includes(c) && season.config.books[c]);
    return spare.length ? '<select id="peAddSheet" aria-label="Add a progress sheet for another book"><option value="">+ Add sheet</option>' + spare.map(c => '<option value="' + esc(c) + '">' + esc((season.config.books[c] || {}).name || c) + ' (' + esc(Season.bookGroup(season, c) || season.config.books[c].group || '') + ')</option>').join('') + '</select>' : '';
  };
  // N38 follow-up: after a received date is cleared, a handbook that is only a book code with that book names it still, so the sheet would open on it. Ask once; Keep leaves everything as it is.
  function offerHandbookClear(book) {
    if (!ui.prKid || !Season.orphanHandbook(season, ui.prKid, book)) return;
    App.ask.confirm('This child\'s handbook still says ' + book + ' with no date, so the Progress sheet keeps opening on ' + book + '. Clear the handbook too?', { title: 'Clear the handbook as well?', ok: 'Clear it', cancel: 'Keep it' })
      .then(ok => { if (ok) { Season.setHandbook(season, ui.prKid, { code: '', date: '' }); touchSeason(); redrawSheet(); } });
  }
  function renderProgress() {
    const el = $('progressWrap');
    if (!ready(el)) return;
    const p = App.master && App.master.people.find(x => idOf(x) === ui.prKid);
    if (!p || !progressAllowed(p)) { el.innerHTML = '<p class="status">' + (p ? esc(Model.fullName(p)) + ' has no progress sheet (Puggles and volunteers do not). Their registration and attendance are on the other tabs.' : 'Pick a child first.') + '</p>'; return; }
    const g = Model.groupOf(Model.room(p));      // the child's own group picks the record (Sparks books or T&T)
    const id = idOf(p), t = season.config.progress[g], prog = season.progress[id] || {}, codes0 = g === 'T&T' ? Season.bookOrder(season, 'T&T') : g === 'Cubbies' ? ['AS', 'HC'].filter(c => season.config.books[c]).concat(Object.keys(season.config.books).filter(c => !['AS', 'HC'].includes(c) && Season.bookGroup(season, c) === 'Cubbies')) : ['HG', 'WR', 'SS'].filter(c => season.config.books[c]).concat(Object.keys(season.config.books).filter(c => !['HG', 'WR', 'SS', 'HC'].includes(c) && (!season.config.books[c].group || season.config.books[c].group === 'Sparks')));
    // Books of this child's sheets that are not in the group's list (a sheet added by hand from another group) are shown too.
    const codes = codes0.concat(Season.sheetsOf(season, id, g).filter(c => !codes0.includes(c)));
    // The book shown first is the child's current one: the handbook on file, else the book they have the most recent progress in, else the first. It only changes when you move to another child (or change their handbook), so a book tab you pick stays picked.
    if (codes.length && (!codes.includes(ui.prBook) || ui._lastKid !== id)) ui.prBook = currentBook(id, codes, prog);
    ui._lastKid = id;
    let h = paceStrip(Pace.kid({ master: App.master, season, calendar: App.calendar }, p), g);
    // The book tabs: the one the child is in (worked out for Sparks) is marked; under the open tab, the day the child received that book.
    const cur = Season.childBook(season, id), bname = c => (season.config.books[c] || {}).name || c;
    // Book tab colors (Mike, 2026-11-12): green = finished; inverted green (light, green text and border) = finished and its Book Review done too; red = started, not finished, and not the book they are working on;
    // blue = the book they are working on now; plain = not started. A finished book stays green even while it is still the child's current book. The tab being looked at has an outline, so it is never mistaken for blue.
    // A check mark (or two) and the tooltip say the same in words, for anyone who cannot tell red from green.
    const tabState = c => {      // [class, mark, tooltip]
      const s = Season.bookStatus(season, id, c);
      if (s === 'review') return ['st-rev', ' ✓✓', 'Finished, with the Book Review'];
      if (s === 'done') return ['st-done', ' ✓', 'Finished'];
      if (c === cur) return ['st-cur', '', 'The book this child is in'];
      if (s === 'started') return ['st-open', '', 'Started, not finished, and not the book they are working on'];
      return ['', '', ''];
    };
    const tabs = '<div class="booktabs">' + codes.map(c => { const st = tabState(c);
      return '<button data-book="' + esc(c) + '" class="' + st[0] + (c === ui.prBook ? ' on' : '') + (c === cur ? ' cur' : '') + '"' + (st[2] ? ' title="' + esc(st[2] + (c === cur && st[0] !== 'st-cur' ? ' (the book this child is in)' : '')) + '"' : '') + '>' + esc(bname(c)) + (st[1] ? '<span class="bkmark" aria-hidden="true">' + st[1] + '</span>' : '') + (c === cur ? ' <span class="curdot" aria-label="(current book)">&#9679;</span>' : '') + '</button>'; }).join('') + addSheetMenu(codes) + '</div>';
    h = tabs + h + (ui.prBook ? sheetHtml(p, ui.prBook) : '');      // the book tabs come first, above the pace line and the sheet
    const sug = Season.suggestedAwards(season, id, g);
    if (sug.length) h += '<p class="ok"><b>Earned, not yet announced:</b> ' + sug.map(s => esc(s.award) + ' (' + (s.noDate ? 'no date' : esc(MD(s.date))) + ')').join(', ') + '. Announce them on the Awards tab.</p>';
    const past = Season.pastYearAwards(season, id);
    if (past.length) h += '<p class="status pastyears"><b>' + past.length + ' award' + (past.length === 1 ? '' : 's') + ' from earlier years ' + (past.length === 1 ? 'is' : 'are') + ' not marked given:</b> ' + past.map(esc).join(', ') + '. <button type="button" id="btnPastGiven">Mark given, no date</button></p>';
    // The sheet is long on a phone, so Previous / Next are repeated at its foot (decision 2026-11-03: after the last sign-off you are already there).
    el.innerHTML = h + '<div class="prfoot"><button type="button" data-prstep="-1">&larr; Previous child</button><button type="button" data-prstep="1">Next child &rarr;</button></div>';
  }
  App.sheets.renderProgress = renderProgress;
  $('progressWrap').addEventListener('change', e => {      // the + Add sheet menu beside the book tabs
    const t = e.target; if (t.id !== 'peAddSheet' || !t.value || !season || !ui.prKid) return;
    Season.addExtraSheet(season, ui.prKid, t.value); touchSeason(); ui.prBook = t.value; ui._lastKid = ui.prKid; renderProgress();
  });
  const afterRender = renderProgress; App.sheets.renderProgress = function () { const r = afterRender.apply(this, arguments); if (App.sheets.pinSync) App.sheets.pinSync(); return r; };
  // Phone: once the Group / Class / Child pickers have scrolled out of sight, a one-line bar under the tab menu keeps the child, the class and the book in view, with Previous and Next
  // (so you never scroll back up to see who you are on or to move on). It is fixed to the screen, costs no room at the top, and is hidden by CSS on wider screens.
  // The foot Previous / Next child buttons step through the Person tab's list (the same list as the Person picker).
  const stepFromButton = e => {
    const b = e.target.closest && e.target.closest('button[data-prstep]'); if (!b) return;
    App.personStep(+b.dataset.prstep); $('tab-person').scrollIntoView({ block: 'start' });      // the new child starts at the top
  };
  $('progressWrap').addEventListener('click', stepFromButton);
  const pin = $('prPin');
  if (pin) {
    let away = false;      // true once the pickers bar has scrolled out of sight
    const sync = () => {
      const on = away && App.tab === 'person' && !$('progressWrap').hidden; pin.hidden = !on;
      if (on) { const h = document.querySelector('#peSub h2'); $('prPinName').textContent = h ? h.textContent : ''; }
    };
    pin.addEventListener('click', stepFromButton); App.sheets.pinSync = sync;
    if (window.IntersectionObserver) new IntersectionObserver(es => { away = !es[es.length - 1].isIntersecting; sync(); }).observe($('personBar'));
  }
  $('progressWrap').addEventListener('click', e => { const b = e.target.closest('button[data-book]'); if (b) { ui.prBook = b.dataset.book; redrawSheet(); } });
  $('progressWrap').addEventListener('click', e => { if (e.target.closest('[data-shcol]')) { ui.shCollapsed = !ui.shCollapsed; redrawSheet(); } });
  // Blue Jewels by hand (leaders): grant a slot with a date and a note, or drop an earned or granted one. Sparks only; kept in the file.
  function blueJewelAction(e) {
    const d = e.target.closest && e.target.closest('[data-bjdrop],[data-bjgrant]'); if (!d) return;
    const book = d.dataset.bjbook, slot = +d.dataset.bjslot, kid = ui.prKid, finish = () => { touchSeason(); redrawSheet(); };
    if (d.dataset.bjgrant !== undefined) {      /* one form: the day (a date picker) and the reason */
      App.ask.form({ title: 'Grant a Blue Jewel by hand', ok: 'Grant', fields: [
        { name: 'day', label: 'Day the Blue Jewel was earned', type: 'date', required: true, value: App.today() },
        { name: 'note', label: 'Why it is granted by hand', type: 'text', maxlength: 200, hint: 'Kept in the file with it.' }] }).then(v => {
        if (!v) return;
        try { Season.grantBlue(season, kid, book, slot, v.day, String(v.note || '').trim()); } catch (err) { App.ask.alert(err.message); return; }
        finish();
      });
      return;
    }
    const ov = d.dataset.bjov === '1';      /* dropping is one Undo step: do it, then offer Undo (UX-20) */
    try { Season.dropBlue(season, kid, ov ? { kind: 'override', book, slot, n: +d.dataset.bjgem, date: d.dataset.bjdate } : { kind: 'earned', book, slot, gem: +d.dataset.bjgem, date: d.dataset.bjdate }); } catch (err) { App.ask.alert(err.message); return; }
    finish(); App.done('Blue Jewel dropped. Its award is removed from the lists (announced, given or told).');
  }
  ['progressWrap', 'personWrap'].forEach(id => $(id).addEventListener('click', blueJewelAction));      // collapse the sheet under its header (Print, flag) and back
  // The sheet's boxes work on the Progress sub-tab of the Person tab (progressWrap). The handlers below listen on the wrap, and personWrap only inside its sheet area.
  const onSheets = (type, fn) => ['progressWrap', 'personWrap'].forEach(id => $(id).addEventListener(type, e => { if (id === 'personWrap' && !(e.target.closest && e.target.closest('.sheetarea'))) return; fn(e); }));
  // A sign-off, date or hold only changes the sheet: on the Progress sub-tab redraw just the sheet, not the whole Person page (the picker lists and the header stay as they are).
  function redrawSheet() { if (App.tab === 'person' && App.personSub && App.personSub() === 'progress') { const y = App.pageScroll ? App.pageScroll.y() : 0; renderProgress(); if (App.pageScroll) App.pageScroll.to(y); return; }
    if (App.tab === 'person' && App.tabs.person) { const y = App.pageScroll ? App.pageScroll.y() : 0; App.tabs.person(); if (App.pageScroll) App.pageScroll.to(y); } else renderProgress(); }
  // A whole date typed or picked in a sign-off box (a four-digit year from 2000 on) is saved at once, so the earned awards, the badges and the block's check mark follow as you type; focus then moves to the next date box,
  // like Tab would. A date still being typed (year 0002...) or typed with a short year waits until you leave the box (see the focusout handler below and finishDateBox in app.js).
  onSheets('click', e => {      // Notes and flags: the flag buttons on boxes, blocks and the sheet, and Clear on a note
    const hf = e.target.closest('button[data-hideflag]'); if (hf) { App.hideFlag(hf.dataset.hideflag, !!hf.dataset.on); redrawSheet(); return; }
    const cf = e.target.closest('button[data-clearflag]'); if (cf) { Season.clearFlag(season, cf.dataset.clearflag); touchSeason(); redrawSheet(); if (App.updateTodoBadge) App.updateTodoBadge(); }
  });
  const SIGN_BOX = 'input[type=date][data-key],input[type=date][data-gaward],input[type=date][data-aaward]';
  const sameBox = (a, b) => a.dataset.key ? a.dataset.key === b.dataset.key && a.dataset.scope === b.dataset.scope : a.dataset.gaward ? a.dataset.gaward === b.dataset.gaward : a.dataset.aaward === b.dataset.aaward;
  onSheets('change', e => {
    const t = e.target;
    if (t.type === 'date' && App.dateHeld(t)) return;      // typing over a date that is already there: nothing is saved until the box is left or Enter is pressed (the focusout and Enter handlers below)
    if (t.type === 'date' && t.matches && t.matches(SIGN_BOX) && /^\d{4}-\d\d-\d\d$/.test(t.value) && +t.value.slice(0, 4) >= 2000) {
      const root = t.closest('#progressWrap, #personWrap'), was = { key: t.dataset.key, scope: t.dataset.scope, gaward: t.dataset.gaward, aaward: t.dataset.aaward };
      lastEntered = t.value;      // remembered for the Same date buttons
      commitProgress(t, true);
      const boxes =[...(root || document).querySelectorAll(SIGN_BOX)], i = boxes.findIndex(b => sameBox({ dataset: was }, b)); if (i >= 0 && boxes[i + 1]) boxes[i + 1].focus();
      return;
    }
    if (t.dataset && t.dataset.recv !== undefined) { commitRecv(t, false); return; }      // the date received, under the book's tab: saved as soon as it is a whole date; the sheet redraws when you leave the box
    if (t.dataset && t.dataset.hb) { if (saveHandbook(t.closest('.hbbox'), ui.prKid)) { ui._lastKid = ''; redrawSheet(); } return; }      // only a new book changes what is on screen, so tabbing between the boxes keeps focus
    if (t.dataset && t.dataset.key && t.type !== 'date') commitProgress(t, true);
    if (t.dataset && t.dataset.bookdone) { try { Season.setBookDone(season, ui.prKid, t.dataset.bookdone, t.checked); } catch (err) { App.ask.alert(err.message); } touchSeason(); redrawSheet(); return; }
    if (t.dataset && t.dataset.reviewsdone) { try { Season.setReviewsDone(season, ui.prKid, t.dataset.reviewsdone, t.checked); } catch (err) { App.ask.alert(err.message); } touchSeason(); redrawSheet(); return; }
    if (t.dataset && t.dataset.recvnd !== undefined) { try { Season.setReceived(season, ui.prKid, t.dataset.recvnd, '', { noDate: t.checked }); } catch (err) { App.ask.alert(err.message); } if (!t.checked) offerHandbookClear(t.dataset.recvnd); touchSeason(); redrawSheet(); return; }      // book received, date unknown
    if (t.dataset && t.dataset.hold !== undefined) { Season.setHold(season, ui.prKid, t.dataset.hold, t.checked); touchSeason(); redrawSheet(); return; }      // the same flag as the Hold box on the Awards tab
    if (t.dataset && t.dataset.annnodateTick !== undefined) {      // announced, date unknown: counts as told to the group; untick to take it back (a real date replaces it)
      try { Season.setAnnNoDate(season, ui.prKid, t.dataset.annnodateTick, t.checked); } catch (err) { App.ask.alert(err.message); }
      touchSeason(); redrawSheet(); return;
    }
    if (t.dataset && t.dataset.gnodate !== undefined) {      // given, date unknown: the day it was ticked is kept inside, but never shown or printed as a given date
      if (t.checked && !sectionGate(t, App.today(), t.dataset.gnodate)) { t.checked = false; return; }
      try { Season.setGiven(season, ui.prKid, t.dataset.gnodate, t.checked ? App.today() : '', { noDate: true }); if (!t.checked) releaseSigns(t); } catch (err) { App.ask.alert(err.message); }
      touchSeason(); redrawSheet();
    }
  });
  // A date box fires "change" as soon as what is typed is a valid date (the first digit of the year already is, giving 0002-10-28), so a date is committed when you leave the box or press Enter.
  // A year outside 2000 to 2100 is not a finished date: the box goes back to what was saved. If you left by pressing another button here, that button's click redraws the page; redrawing now would swallow the tap.
  const stored = t => Season.signShown(season, ui.prKid, t.dataset.scope, t.dataset.key);      // what the box shows: a no-date box is empty (its hidden tick day is never put back into the box)
  // A date left half-typed (or a month with no such day) reads back as empty: that is not "clear the date", so the saved date is put back.
  function unfinished(t, was) { if (!App.dateUnfinished(t)) return false; t.value = was; if (was) App.flash('That date was not finished (or is not a real date), so the saved date was kept.', 'warn'); return true; }
  // Date received (per book): a date box reports 0002-09-23 as soon as the first digit of the year is typed, so it waits for the year to be finished; leaving it half-typed says so and puts the saved date back.
  function commitRecv(t, leaving) {
    const v = t.value, book = t.dataset.recv, was = Season.receivedShown(season, ui.prKid, book);      // a no-date book shows an empty box, so leaving the box alone changes nothing
    if (leaving && unfinished(t, was)) return;
    if (v !== '') { if (!leaving && /^0\d{3}-/.test(v)) return; const bad = Check.date(v); if (bad) { t.value = was; App.flash('Date received: ' + bad.msg, 'error'); return; } }
    if (v === was) return;
    try { Season.setReceived(season, ui.prKid, book, v); } catch (err) { App.ask.alert(err.message); t.value = was; return; }
    if (v === '') offerHandbookClear(book);
    // N43: a real date clears the book's no-date tick at once (no redraw, so the focus stays where it is).
    if (v) { const row = t.closest('.recvrow') || t.parentElement; if (row) row.querySelectorAll('input[data-recvnd]').forEach(c => { c.checked = false; c.disabled = false; }); }
    if (v) lastEntered = v;
    touchSeason(); ui._recvDirty = true;
  }
  onSheets('focusout', e => { const t = e.target; if (t.dataset && t.dataset.recv !== undefined && t.matches('input')) { commitRecv(t, true); if (ui._recvDirty) { ui._recvDirty = false; if (!(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('#progressWrap button, .sheetarea button'))) redrawSheet(); } } });
  // An award given before its section is finished: no pop-up (it interrupts entering data). The section's empty sign-offs are marked as no date (the day given stands in for them and is shown nowhere), so the section
  // counts as finished, and a yellow warning with the count stays under the award until the file is saved (ui.givenWarn, drawn by givenBox, cleared by markSaved). An award whose section is already finished passes straight through.
  function sectionGate(t, date, awardName) {
    const book = t.dataset.gbook, blk = t.dataset.gblock; if (!book || !blk) return true;
    const items = (t.dataset.gitems || '').split(',').filter(Boolean), missing = Season.unsignedIn(season, ui.prKid, book, blk, items);
    if (!missing.length) return true;
    const award = awardName || t.dataset.gaward;
    Season.markSignsNoDate(season, ui.prKid, book, missing, date);
    ui.givenWarn = ui.givenWarn || {}; ui.givenWarn[ui.prKid + '|' + award] = missing.length; return true;
  }
  // Taking Given back (an unticked no date, or a cleared date) also takes back the sign-offs that giving it early marked no date, so the section is unfinished again. Real dates are never touched.
  function releaseSigns(t) {
    const book = t.dataset.gbook, blk = t.dataset.gblock; if (!book || !blk) return;
    (t.dataset.gitems || '').split(',').filter(Boolean).forEach(i => { const k = blk + '.' + i; if (Season.isSignNoDate(season, ui.prKid, book, k)) Season.setProgress(season, ui.prKid, book, k, ''); });
    if (ui.givenWarn) delete ui.givenWarn[ui.prKid + '|' + t.dataset.gaward];
  }
  function commitGiven(t, redraw) {
    const v = t.value, was = Season.givenShown(season, ui.prKid, t.dataset.gaward);      // a no-date award shows no date, so leaving the empty box alone changes nothing
    if (unfinished(t, was)) return;
    if (v !== '') { const bad = Check.date(v); if (bad) { t.value = was; App.flash(bad.msg, 'error'); return; } }
    if (v === was) return;
    if (v && !sectionGate(t, v)) { t.value = was; return; }
    try { Season.setGiven(season, ui.prKid, t.dataset.gaward, v); if (!v) releaseSigns(t); } catch (err) { App.ask.alert(err.message); t.value = was; return; }
    touchSeason(); if (redraw) redrawSheet();
  }
  // Announced (per award): a date sets the night it was told to the group, an empty box takes it back to "earned, not announced". Given is never touched.
  function commitAnnounced(t, redraw) {
    const v = t.value, was = (Season.awardsOf(season, ui.prKid).find(x => x.award === t.dataset.aaward) || {}).date || '';
    if (unfinished(t, was)) return;
    if (v !== '') { const bad = Check.date(v); if (bad) { t.value = was; App.flash(bad.msg, 'error'); return; } }
    if (v === was) return;
    try { Season.setAnnounced(season, ui.prKid, t.dataset.aaward, v); } catch (err) { App.ask.alert(err.message); t.value = was; return; }
    touchSeason(); if (redraw) redrawSheet();
  }
  function commitProgress(t, redraw) {
    if (t.dataset.aaward) return commitAnnounced(t, redraw);
    if (t.dataset.gaward) return commitGiven(t, redraw);
    if (t.type === 'date' && unfinished(t, stored(t))) return;
    const v = t.value;
    if (t.type === 'date' && v !== '') { const bad = Check.date(v); if (bad) { t.value = stored(t); App.flash(bad.msg, 'error'); return; } }
    if (t.type === 'date' && v === stored(t)) return;
    const hadNoDate = Season.isSignNoDate(season, ui.prKid, t.dataset.scope, t.dataset.key);
    try { Season.setProgress(season, ui.prKid, t.dataset.scope, t.dataset.key, v); } catch (err) { App.ask.alert(err.message); t.value = stored(t); return; }
    // N43: a real date clears the box's no-date mark at once, here, without redrawing the sheet (a redraw would move the focus while tabbing).
    if (hadNoDate && v) { const cell = t.closest('.pcell'); if (cell) { cell.querySelectorAll('.status').forEach(s => { if (s.textContent.trim() === 'no date') s.remove(); }); cell.querySelectorAll('button[data-clearnd]').forEach(b => b.remove()); } }
    touchSeason(); if (redraw) redrawSheet();
  }
  onSheets('focusout', e => { const t = e.target; if (t.type === 'date' && (t.dataset.key || t.dataset.gaward || t.dataset.aaward)) commitProgress(t, !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('#progressWrap button, .sheetarea button'))); });
  // Tab / Shift+Tab on a sign-off date box goes straight to the next / previous one (the browser would walk the month, day and year parts and the calendar icon first). The box is left first, so what was typed is saved, then the target is found again in case the sheet redrew. Returns false (the browser's own Tab) at the first or last box.
  App.sheetTab = (el, dir) => {
    const root = el.closest && el.closest('#progressWrap, #personWrap'); if (!root || !el.matches(SIGN_BOX) || (root.id === 'personWrap' && !el.closest('.sheetarea'))) return false;
    const live = () => [...root.querySelectorAll(SIGN_BOX)].filter(b => !b.disabled && b.offsetParent !== null), list = live(), i = list.indexOf(el), to = list[i + dir]; if (i < 0 || !to) return false;
    const was = { key: to.dataset.key, scope: to.dataset.scope, gaward: to.dataset.gaward, aaward: to.dataset.aaward };
    el.blur(); const again = live().find(b => sameBox({ dataset: was }, b)) || to; again.focus(); return true;
  };
  onSheets('keydown', e => { if (e.key === 'Enter' && e.target.type === 'date' && (e.target.dataset.key || e.target.dataset.gaward || e.target.dataset.aaward)) { e.preventDefault(); commitProgress(e.target, true); } });
  onSheets('click', e => {
    const tg = e.target.closest('button[data-gtoday]');
    if (tg) { try { Season.setGiven(season, ui.prKid, tg.dataset.gtoday, App.today()); } catch (err) { App.ask.alert(err.message); } touchSeason(); redrawSheet(); return; }
    const gs = e.target.closest('button[data-gsame]');
    if (gs && lastEntered) { try { Season.setGiven(season, ui.prKid, gs.dataset.gsame, lastEntered); } catch (err) { App.ask.alert(err.message); } touchSeason(); redrawSheet(); return; }      // Given: paste the last date entered
    const as = e.target.closest('button[data-asame]');
    if (as && lastEntered) { try { Season.setAnnounced(season, ui.prKid, as.dataset.asame, lastEntered); } catch (err) { App.ask.alert(err.message); } touchSeason(); redrawSheet(); return; }      // Announced: paste the last date entered
    const rs = e.target.closest('button[data-rsame]');
    if (rs && lastEntered) { try { Season.setReceived(season, ui.prKid, rs.dataset.rsame, lastEntered); } catch (err) { App.ask.alert(err.message); } touchSeason(); redrawSheet(); return; }      // Received: paste the last date entered
    const rz = e.target.closest('button[data-recvsz]');
    if (rz) { try { Season.setReceived(season, ui.prKid, rz.dataset.recvsz, rz.dataset.date); } catch (err) { App.ask.alert(err.message); } touchSeason(); redrawSheet(); return; }
    const rt = e.target.closest('button[data-recvtoday]');
    if (rt) { try { Season.setReceived(season, ui.prKid, rt.dataset.recvtoday, App.today()); } catch (err) { App.ask.alert(err.message); } touchSeason(); redrawSheet(); return; }
    const at = e.target.closest('button[data-atoday]');
    if (at) { try { Season.setAnnounced(season, ui.prKid, at.dataset.atoday, App.today()); } catch (err) { App.ask.alert(err.message); } touchSeason(); redrawSheet(); return; }      // Announced: today
    const cl = e.target.closest('button[data-copylast]');
    if (cl) {      // Same date: this box and every empty one before it (the keys are worked out when the sheet is drawn) get the last date entered before it
      for (const key of cl.dataset.copylast.split(',').filter(Boolean)) { try { Season.setProgress(season, ui.prKid, cl.dataset.scope, key, cl.dataset.date); } catch (err) { App.ask.alert(err.message); break; } }
      touchSeason(); redrawSheet(); return;
    }
    const cn = e.target.closest('button[data-clearnd]');
    if (cn) {      // a no-date sign-off has an empty box, so this is how it is taken back (the section is unfinished again)
      const inp = cn.closest('.pcell').querySelector('input[data-key]');
      try { Season.setProgress(season, ui.prKid, inp.dataset.scope, inp.dataset.key, ''); } catch (err) { App.ask.alert(err.message); }
      touchSeason(); redrawSheet(); return;
    }
    const td = e.target.closest('button[data-today]');
    if (td) {
      const inp = td.closest('.pcell').querySelector('input[data-key]');
      try { Season.setProgress(season, ui.prKid, inp.dataset.scope, inp.dataset.key, App.today()); } catch (err) { App.ask.alert(err.message); }
      touchSeason(); redrawSheet(); return;
    }
    const b = e.target.closest('button[data-book]'); if (b) { ui.prBook = b.dataset.book; redrawSheet(); return; }
    if (e.target.id === 'btnPastGiven') {      // everything this child finished before the season's first club night: handed over long ago, day unknown
      const list = Season.pastYearAwards(season, ui.prKid);
      if (list.length) {      /* one Undo step: do it, then offer Undo (UX-20) */
        try { Season.markPastYearsGiven(season, App.today(), [ui.prKid]); } catch (err) { App.ask.alert(err.message); return; }
        touchSeason(); redrawSheet(); App.done(list.length + ' award' + (list.length === 1 ? '' : 's') + ' from earlier years marked as given, with no date (' + list.join(', ') + '). Nothing is announced or printed with a date.');
      }
      return;
    }
    if (e.target.id === 'btnPaceWatch') { e.preventDefault(); const k = App.master.people.find(p => idOf(p) === ui.prKid), rm = Model.room(k); App.reportOptions({ group: Model.groupOf(rm), room: rm }); App.showReport('paceWatch'); return; }
    if (e.target.id === 'btnPrPrint') { const kid = App.master.people.find(p => idOf(p) === ui.prKid); App.showReport('progressSheets'); App.reportOptions({ room: Model.room(kid), kid: ui.prKid, books: 'all' }); }      // N57: the child's whole record is Progress sheets with every book
  });

  // ---------- history ----------
  const fmtTime = t => { const d = new Date(t); return isNaN(d) ? String(t) : d.toLocaleString([], { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
  const AREAS = { roster: 'Roster', calendar: 'Calendar', rotation: 'Rotation', config: 'Award lists & settings', handbooks: 'Handbooks', attendance: 'Attendance', awards: 'Awards', games: 'Games', progress: 'Progress' };
  const MARK = { add: '+', del: '−', chg: '~' };
  const dayOf = i => { if (!i) return ''; const t = season.history[i - 1].t, d = new Date(t); return isNaN(d) ? String(t).slice(0, 10) : d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const dayLabel = (k, count) => { if (!k) return 'File as opened'; const d = new Date(k + 'T12:00'); return (isNaN(d) ? k : d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })) + ' (' + count + ')'; };
  const clock = t => { const d = new Date(t); return isNaN(d) ? String(t) : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
  function timeLabel(i) {
    if (i === 0) return '0 · File as opened';
    const e = season.history[i - 1];
    return i + ' · ' + (e.tag ? '“' + e.tag + '” · ' : '') + clock(e.t) + ' · ' + e.label + ' (' + e.changes.length + ')' + (i === season.history.length ? ' · latest' : '');
  }
  function versionLabel(i) {
    const n = season.history.length;
    if (i === 0) return '0 · File as opened';
    const e = season.history[i - 1];
    return i + ' · ' + (e.tag ? '“' + e.tag + '” · ' : '') + fmtTime(e.t) + ' · ' + e.label + ' (' + e.changes.length + ')' + (i === n ? ' · latest' : '');
  }
  function nightCounts(s, d) {
    const att = s.attendance[d], aw = s.awards[d] || {}, gm = s.games[d] || {};
    return { present: att ? Object.keys(att).filter(id => att[id].a).length : null,
      awards: Object.keys(aw).reduce((n, id) => n + aw[id].length, 0),
      games: Object.keys(gm).reduce((n, g) => n + Object.keys(gm[g]).length, 0) };
  }
  function renderHistory() {
    const el = $('historyWrap'), bar = $('historyBar'); bar.hidden = true;
    if (!ready(el)) return;
    const n = season.history.length;
    { const d = n ? Season.replayDiff(season).length : 0, box = $('historyReconcile'); box.hidden = !d;      // R20: the History no longer adds up to the data (usually left over from an older version)
      if (d) $('historyReconcileText').textContent = 'History does not add up to the data in ' + d + (d === 1 ? ' place' : ' places') + ' (usually left over from older versions). Reconcile History records the difference as one version.'; }
    if (!n) { el.innerHTML = '<p class="status">No changes recorded yet. From now on every edit is logged here and saved inside the data file.</p>'; return; }
    bar.hidden = false;
    if (ui.hFrom === null) ui.hFrom = Math.max(0, n - 1);
    ui.hFrom = Math.min(Math.max(0, ui.hFrom), n);
    if (ui.hLatest) ui.hTo = n; ui.hTo = Math.min(Math.max(0, ui.hTo), n);
    const days = new Map(); for (let i = 0; i <= n; i++) { const k = dayOf(i); if (!days.has(k)) days.set(k, []); days.get(k).push(i); }
    const fill = (dayId, timeId, cur) => {
      const k = dayOf(cur), sel = on => on ? ' selected' : '';
      $(dayId).innerHTML = [...days].map(([d, list]) => '<option value="' + esc(d) + '"' + sel(d === k) + '>' + esc(dayLabel(d, list.length)) + '</option>').join('');
      $(timeId).innerHTML = days.get(k).map(i => '<option value="' + i + '"' + sel(i === cur) + '>' + esc(timeLabel(i)) + '</option>').join('');
    };
    fill('hFromDay', 'hFrom', ui.hFrom); fill('hToDay', 'hTo', ui.hTo);
    $('hTagFrom').disabled = ui.hFrom < 1; $('hTagTo').disabled = ui.hTo < 1;
    $('hLatest').checked = ui.hLatest; $('hToDay').disabled = $('hTo').disabled = $('hToPrev').disabled = $('hToNext').disabled = ui.hLatest;
    const byId = new Map(App.master.people.map(p => [idOf(p), p])), nameOf = id => byId.has(id) ? Model.fullName(byId.get(id)) : id;
    const c = Season.compare(season, ui.hFrom, ui.hTo);
    const hr = $('hRestore'); hr.textContent = 'Restore to version ' + c.from + '…'; hr.disabled = c.from >= n;
    hr.title = c.from >= n ? 'This is already the latest version' : 'Back up the current file, then delete every version after ' + c.from;
    let h = '<p><b>' + esc(versionLabel(c.from)) + '</b> &rarr; <b>' + esc(versionLabel(c.to)) + '</b> &nbsp; ' +
      (c.changes.length ? c.changes.length + ' difference' + (c.changes.length === 1 ? '' : 's') : '<span class="ok">identical</span>') +
      ' &nbsp; <span class="chip h-add">+ added</span><span class="chip h-del">&minus; removed</span><span class="chip h-chg">~ changed</span></p>';
    if (c.from === c.to) h += '<p class="status">Pick two different versions to see what changed between them.</p>';
    Object.keys(AREAS).forEach(a => {
      const list = c.changes.filter(x => x.p[0] === a); if (!list.length) return;
      h += '<h3>' + AREAS[a] + ' (' + list.length + ')</h3><ul class="hlist">' + list.map(x => { const k = Season.kindOf(x);
        const when = ['attendance', 'awards', 'games'].includes(a) ? '<b>' + esc(MD(x.p[1])) + '</b> ' : '';
        return '<li class="h-' + k + '"><span class="mk">' + MARK[k] + '</span>' + when + esc(Season.describe(x, nameOf)) + '</li>'; }).join('') + '</ul>';
    });
    const A = Season.at(season, c.from), B = Season.at(season, c.to);
    const nights = [...new Set([A, B].flatMap(s => Object.keys(s.attendance).concat(Object.keys(s.awards), Object.keys(s.games))))].sort();
    if (nights.length) {
      const cell = (a, b) => a === b ? '<td>' + (b === null ? '–' : b) + '</td>' :
        '<td class="h-' + (a === null || a === 0 ? 'add' : b === null || b === 0 ? 'del' : 'chg') + '">' + (b === null ? '–' : b) + ' <small>(was ' + (a === null ? '–' : a) + ')</small></td>';
      h += '<h3>Nights at version ' + c.to + '</h3><table class="roster"><thead><tr><th>Night</th><th>Present</th><th>Awards given</th><th>Game results</th></tr></thead><tbody>' +
        nights.map(d => { const a = nightCounts(A, d), b = nightCounts(B, d); return '<tr><td>' + esc(MD(d)) + '</td>' + cell(a.present, b.present) + cell(a.awards, b.awards) + cell(a.games, b.games) + '</tr>'; }).join('') + '</tbody></table>';
    }
    el.innerHTML = h;
  }
  $('hReconcile').addEventListener('click', () => {
    if (!App.resolveDraft(() => $('hReconcile').click())) return;
    if (!Season.reconcile(season, new Date().toISOString())) return renderHistory();
    snap = Season.snapshot(season); markEdit('Reconciled History'); status(); App.updateStatus(); App.refresh();      // Restore to the previous version is the way back
  });
  $('historyBar').addEventListener('change', e => {
    const lastOn = day => { for (let i = season.history.length; i >= 0; i--) if (dayOf(i) === day) return i; return 0; };
    if (e.target.id === 'hFrom') ui.hFrom = +e.target.value; if (e.target.id === 'hTo') ui.hTo = +e.target.value;
    if (e.target.id === 'hFromDay') ui.hFrom = lastOn(e.target.value); if (e.target.id === 'hToDay') ui.hTo = lastOn(e.target.value);
    if (e.target.id === 'hLatest') ui.hLatest = e.target.checked; renderHistory();
  });
  const hTag = key => () => {
    const i = ui[key]; if (i < 1) return;
    App.ask.form({ title: 'Name version ' + i, ok: 'Save name', fields: [{ name: 'name', label: 'Name for version ' + i, type: 'text', value: season.history[i - 1].tag || '', maxlength: 80, hint: 'Leave empty to remove the name.' }] })
      .then(v => { if (!v) return; Season.tag(season, i, v.name); touchSeason('Named History version ' + i); renderHistory(); });
  };
  $('hTagFrom').addEventListener('click', hTag('hFrom')); $('hTagTo').addEventListener('click', hTag('hTo'));
  // A restore deletes history, so it asks three times, and each time the person types the phrase exactly. Any other answer (or Cancel) stops it.
  const RESTORE_PHRASE = "I understand what i'm about to do, I have made backups, and i am confident in my decision. Please Proceed with my dangerous request.";
  async function askRestorePhrase() {      /* the OK button stays disabled until the sentence matches exactly, so a wrong answer cannot be sent */
    for (let i = 1; i <= 3; i++) if (!(await App.ask.typed(RESTORE_PHRASE, { title: 'Restore confirmation ' + i + ' of 3', message: 'Type this sentence exactly:' }))) return false;
    return true;
  }
  // Gross restore: back up the current file, delete everything after the chosen version, load the older one (unsaved).
  $('hRestore').addEventListener('click', async () => {
    const n = season.history.length, v = Season.compare(season, ui.hFrom, ui.hLatest ? n : ui.hTo).from, r = Season.restoreTo(season, v);
    if (!r.dropped.entries) return App.ask.alert('That is already the latest version, so there is nothing to restore.');
    if (!(await App.ask.confirm('Restore to ' + versionLabel(v) + '?\n\nThis deletes ' + r.dropped.entries + ' later version' + (r.dropped.entries === 1 ? '' : 's') + ' (' + r.dropped.changes +
      ' changes) from the file you are working on. A backup of the current file downloads first.', { title: 'Restore this version?', ok: 'Restore', danger: true }))) return;
    if (!(await askRestorePhrase())) { App.flash('Nothing was restored.', 'info'); return; }
    App.guardedSave(async () => {
      App.download(Season.fileName(season.year, new Date(), 'before-restore'), Season.toJson(season), 'application/json');
      if (!(await App.ask.confirm('The backup was downloaded. Check that it saved, then go back to version ' + v + '.', { title: 'Backup downloaded', ok: 'It saved: go back', danger: true }))) return;
      ui.hFrom = null; ui.hLatest = true;
      setSeason(Season.restoreTo(season, v).season, { noImport: true }); markEdit('Restored History version ' + v); status();
    });
  });
  const hStep = (key, d) => () => { ui[key] += d; renderHistory(); };
  $('hFromPrev').addEventListener('click', hStep('hFrom', -1)); $('hFromNext').addEventListener('click', hStep('hFrom', 1));
  $('hToPrev').addEventListener('click', hStep('hTo', -1)); $('hToNext').addEventListener('click', hStep('hTo', 1));

  // For the Person tab (app-person.js).
  // A note on any element of any tab comes from the Flag button in the top bar (app-flagmode.js), which saves it through addFlag.
  // ---- Volunteer absences (S11): club nights come from the club calendar only (Calendar.isNight); the record is kept with the person.
  /* A held club night needs a child present (S11, 2026-11-16). Who is a child comes from the file's own roster inside Season.heldNights (Model.childTestOf): nothing to set up here any more (CR-09). */
  const absenceClubDates = () => (App.calendar || []).filter(Calendar.isNight).map(r => r.Date).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  Object.assign(App, { absenceClubDates, absenceNightsBetween: (from, to) => absenceClubDates().filter(d => d >= from && d <= to),
    addAbsence: (personId, from, to, reason) => { const id = Season.addAbsence(season, personId, App.absenceNightsBetween(from, to), reason, absenceClubDates()); touchSeason(); return id; },
    clearAbsenceNights: (personId, absId, dates) => { Season.clearAbsenceNights(season, personId, absId, dates); touchSeason(); },
    clearAbsence: (personId, absId) => { Season.clearAbsence(season, personId, absId); touchSeason(); },
    absenceList: () => (season ? Season.absenceList(season) : []) });
  Object.assign(App, { addFlagReply: (id, text, by) => { const rid = Season.addFlagReply(season, id, text, by); touchSeason(); return rid; }, setFlagReply: (id, rid, text) => { Season.setFlagReply(season, id, rid, text); touchSeason(); }, removeFlagReply: (id, rid) => { Season.removeFlagReply(season, id, rid); touchSeason(); }, addFlag: f => { const id = Season.addFlag(season, f); touchSeason(); return id; }, flagWhere, goFlag, clearFlag: id => { Season.clearFlag(season, id); touchSeason(); }, setFlagNote: (id, note) => { Season.setFlagNote(season, id, note); touchSeason(); }, hideFlag: (id, on) => { Season.setFlagHidden(season, id, !!on); touchSeason(); }, setBugStatus: (id, status) => { Season.setBugStatus(season, id, status); touchSeason(); }, addBugReply: (id, text, by) => { const rid = Season.addBugReply(season, id, text, by); touchSeason(); return rid; }, removeBugReply: (id, rid) => { Season.removeBugReply(season, id, rid); touchSeason(); },
    quarterNow, flagsChanged: () => { App.onRefresh.forEach(f => f()); const t = App.tabs && App.tabs[App.tab]; if (t && App.tab !== 'todo') t(); if (App.updateTodoBadge) App.updateTodoBadge(); }, addNote: text => { Season.addFlag(season, { level: 'general', note: text }); touchSeason(); }, nightList, quarterOf, markCols: MARK_COLS,
    awardsToGive: () => App.master && season ? toGive(giveKids(), App.today()) : [],
    awardsToAnnounce: () => App.master && season ? giveKids().reduce((n, p) => n + announceDue(p, Model.groupOf(Model.room(p)), App.today()).length, 0) : 0,      // earned and not announced yet: the number on the Awards tab
    nextNight, nightLabel,
    // From a child's Awards tab: open the Awards tab on the Announce page for the child's class (and the slide pictures if asked).
    awardsFor: (id, slide) => { const p = personOf(id); if (!p) return; ui.awSub = 'announce'; ui.awGroup = grpOf(p); ui.awRoom = Model.room(p); ui.awType = ''; App.showTab('awards'); if (slide) $('btnAwImages').click(); },
    // Open a child's Progress sub-tab on the Person tab (the Progress tab no longer exists).
    goProgress: id => { const p = App.master.people.find(x => idOf(x) === id); if (!p) return; App.showPerson(id, { sub: 'progress' }); } });
  App.tabs.attend = renderAttend; App.tabs.games = renderGames; App.tabs.awards = renderAwards; App.tabs.history = renderHistory;
  App.onRefresh.push(() => { ['attend', 'games', 'awards', 'history'].forEach(t => { if (!$('tab-' + t).hidden) App.tabs[t](); }); });
  status();
})();
