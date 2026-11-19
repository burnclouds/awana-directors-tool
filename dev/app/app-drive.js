(this.AwanaVersions = this.AwanaVersions || {})['app-drive.js'] = '1.20.1';
// Google Drive buttons (optional). Stays completely inactive unless drive-config.js has a client ID and API key: then there is no button,
// no Google script is loaded and every file is opened and saved locally exactly as before.
(function () {
  const App = window.App, cfg = window.AwanaDriveConfig, esc = App.esc, $ = id => document.getElementById(id);
  const D = window.Drive && cfg ? Drive.create(cfg) : null;
  if (!D || !D.configured()) return;

  // Two folders: the club files folder (where the picker opens and where data files are saved: one place for both) and where slide images go. They live in the DATA FILE (config.driveDirs),
  // so everyone who opens the file gets them (a shared drive); choosing a folder updates the file. This browser also remembers its own choice, for before a file is open and for files that have none.
  // The app can only use a folder a person has picked once (the drive.file permission), so a default from the file opens the picker at that folder with it ticked, to be confirmed once per person.
  // Older files and browsers kept "open from" and "data files go to" separately; the data folder (else the open folder) becomes the club folder.
  const KINDS = { club: 'Club files folder (open and save data files)', slides: 'Slide images, reports and exports go to' };
  // The folders live in the data file (config.driveDirs); nothing about them is kept in the browser.
  // How data files are saved on Drive: 'dated' = every save is a new complete file (older ones stay as backups); 'inplace' = one file kept up to date (Drive keeps the earlier versions).
  // The save style is a setting of the data file (config.saveStyleDrive): it follows the shared file. One file in place until you choose otherwise.
  // The save style and the keep-name choice live in the data file (config.saveStyleDrive, config.driveKeepName); App.driveSettingsLoaded reads them when a file opens.
  const fileCfg = () => (App.season && App.season.config) || {};
  // In-place saves keep the name the Drive file already has. This optional setting of the data file (config.driveKeepName) overrides it (empty = keep the name).
  // An automatic save never asks (no sign-in window, no folder picker, no alert, no download): it waits quietly, says so, and tries again at the next interval (R11).
  // It starts only with at least this much sign-in time left, so the token cannot run out in the middle of the 4 to 8 calls an in-place save makes.
  const AUTO_MARGIN_MS = 300000;
  const waitText = w => w.kind === 'signin' ? 'auto-save is waiting. Press Save to sign in to Google again.' : w.kind === 'folder' ? 'auto-save is waiting for a folder. Press Save to choose one.' : 'auto-save could not save at ' + w.at + (w.msg ? ' (' + w.msg + ')' : '') + '. It will try again.';
  const st = { wait: null, opened: null, save: false, last: '', style: 'inplace', keep: '',cand: null, cur: null, q: Promise.resolve() };      // saving to Drive starts off each visit: signing in needs a click, which "Open from Drive" or the checkbox provides
  // With no file open there is nowhere to keep the choice: it lasts until a file is opened (or the page is closed).
  const setStyle = v => { st.style = v === 'inplace' ? 'inplace' : 'dated'; if (App.season) { App.season.config.saveStyleDrive = st.style; App.commitScope(() => App.changed()); } label(); };
  App.driveSettingsLoaded = () => { st.style = fileCfg().saveStyleDrive === 'dated' ? 'dated' : 'inplace'; st.keep = cleanName(fileCfg().driveKeepName || ''); label(); };
  const cleanName = v => { const n = String(v || '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim(); return n && !/\.json$/i.test(n) ? n + '.json' : n; };
  const setKeep = v => { st.keep = cleanName(v); if (App.season) { if (st.keep) App.season.config.driveKeepName = st.keep; else delete App.season.config.driveKeepName; App.commitScope(() => App.changed()); } };
  const hhmm = () => new Date().toTimeString().slice(0, 5);
  // An automatic save that could not go on: remember why, show it on the status line, and say it once per waiting spell as a banner (not an alert).
  const wait = (kind, msg) => { const first = !st.wait || st.wait.kind !== kind; st.wait = { kind, at: hhmm(), msg: msg || '' }; label(); if (first) App.flash(waitText(st.wait), 'info'); };
  const waitErr = kind => { wait(kind); return Object.assign(new Error(kind === 'signin' ? 'sign-in needed' : 'no Drive folder was chosen'), { auto: true }); };
  // The blue save button says where the file is going: Download data file normally, Save to Google Drive while saving to Drive is on (its tooltip says whether that is a new dated file or an update).
  const label = () => {
    const b = $('btnSeasonSave'), s = $('driveStatus');
    b.textContent = st.save ? 'Save to Google Drive' : 'Download data file';
    b.title = st.save ? (st.style === 'inplace' ? 'Updates the Drive file in place (and merges in changes others saved since you opened it)' : 'Saves a new dated file to Google Drive; older files stay as backups') : '';
    s.hidden = !st.save; s.textContent = st.save ? 'Google Drive' + (st.wait ? ': ' + waitText(st.wait) : st.last ? ': ' + st.last : '') : '';
    const im = $('btnImport'); im.textContent = st.save ? 'Import from Drive\u2026' : 'Import\u2026';
    im.title = st.save ? 'Imports from Google Drive (saving to Drive is on). The arrow chooses this computer instead.' : 'Import a data file, a Planning Center export, or a calendar, rotation or colors CSV from this computer. Planning Center changes are shown for review first.';
  };
  // After a save to Drive works the blue save button turns green and fades back to blue over about 18 seconds (a glance at the screen says whether the last save went through).
  // App.driveSavedMs is how long (a test shortens it). The fade is in style.css; this only starts it again each time.
  let savedTimer = 0; App.driveSavedMs = 18000;
  function flashSaved() {
    const box = $('btnSeasonSave').parentElement; clearTimeout(savedTimer); box.classList.remove('saved'); void box.offsetWidth;      // restart the fade if it was still running
    box.style.setProperty('--savedms', App.driveSavedMs + 'ms'); box.classList.add('saved'); savedTimer = setTimeout(() => box.classList.remove('saved'), App.driveSavedMs + 100);
  }
  $('saveMenuBtn').hidden = false; $('saveMenuBtn').parentElement.classList.add('on'); $('importMenuBtn').hidden = false; $('importMenuBtn').parentElement.classList.add('on'); $('splashDriveRow').hidden = false; label();      // the save button gets its menu only when Drive is set up; without it the button is just Download data file
  const fileDirs = () => (App.season && App.season.config && App.season.config.driveDirs) || {};
  const dirOf = kind => (kind === 'slides' ? fileDirs().slides : fileDirs().club) || null, sharedOf = kind => !!dirOf(kind);      // Season.fromJson has folded an older file's open / data folders into club (R18)
  const dirId = kind => (dirOf(kind) && dirOf(kind).id) || (kind === 'slides' ? ((dirOf('club') && dirOf('club').id) || st.opened) : st.opened) || null;
  const setShared = (kind, entry) => {
    if (!App.season) return;
    const cur = Season.normDriveDirs(App.season.config.driveDirs);
    App.season.config.driveDirs = Object.assign({ club: cur.club, slides: cur.slides }, { [kind]: entry }); App.commitScope(() => App.changed());
  };
  const pinDays = () => { const n = App.season && App.season.config && App.season.config.drivePinDays; return Number.isFinite(+n) && n !== '' && n !== null ? Math.max(0, Math.floor(+n)) : 30; };

  // Google's picker is an ordinary layer of the page, and a modal <dialog> (this one, the slide maker) sits above the whole page, so a picker opened over it cannot be clicked.
  // Any open dialog is put away while the picker is up and brought back when it closes.
  async function pick(kind, opts) {
    const dlg = $('dlg'), was = dlg.open; if (was) dlg.close();
    try { return await D.pick(kind, opts); } finally { if (was && !dlg.open) dlg.showModal(); }
  }
  async function openFromDrive() {
    try {
      // The file's club folder is where the picker starts. If that folder cannot be reached from this account, the picker starts at Drive instead and the club is asked to choose it again.
      const d = dirOf('club'); let parent = d && (d.parent || d.id);
      if (d) { try { await D.meta(d.id); } catch (e) { parent = undefined; App.flash('The club folder in this file cannot be reached from this account: choose the club files folder again in Options.', 'error'); } }
      const picks = await pick('files', { parent }); if (!picks.length) return;
      await openPicks(picks);
    } catch (err) { App.ask.alert('Google Drive: ' + err.message, { title: 'Google Drive' }); }
  }
  // N41: the last Drive data file opened in this browser (its ID and exact name). Kept after sign-out. Blocked storage just means nothing is remembered.
  const LAST_KEY = 'awana-drive-last';
  const rememberLast = f => { try { localStorage.setItem(LAST_KEY, JSON.stringify({ id: f.id, name: f.name })); } catch (e) { /* storage blocked */ } };
  const lastFile = () => { try { const v = JSON.parse(localStorage.getItem(LAST_KEY) || 'null'); return v && v.id && v.name ? v : null; } catch (e) { return null; } };
  // Load the picked Drive files (the same for the picker and the remembered file). The data file is remembered after a successful open.
  async function openPicks(picks) {
    const files = [], datas = []; let folder = null;
    for (const p of picks) {
      const f = await D.read(p.id);
      files.push({ name: f.name, lastModified: f.lastModified, text: async () => f.text });
      if (/\.json$/i.test(f.name)) { datas.push({ id: f.id || p.id, name: f.name, rev: f.revision || '', text: f.text }); if (f.parents[0]) folder = f.parents[0]; }
    }
    st.cand = datas.length === 1 ? datas[0] : null;      // one data file: it may be updated in place later, if the season that opens is really this file's (lineage())
    await App.openFiles(files);
    if (folder) st.opened = folder;
    st.save = true; label();
    const data = picks.find(p => /\.json$/i.test(p.name)); if (data) rememberLast(data);
  }
  // Pick a folder for one kind. The picker opens beside the current one with it ticked. confirm = the saved folder was refused, so ask this person to confirm it.
  async function chooseDir(kind, confirm) {
    kind = kind === 'slides' ? 'slides' : 'club';
    const cur = dirOf(kind);
    const f = await pick('folder', { parent: cur ? (cur.parent || cur.id) : undefined, selected: cur ? [cur.id] : undefined, title: (confirm ? 'Confirm the folder, once: ' : 'Choose the folder: ') + KINDS[kind].toLowerCase() });
    if (!f.length) return false;
    let parent = ''; try { parent = ((await D.meta(f[0].id)).parents || [])[0] || ''; } catch (e) { /* the picker still works without it */ }
    const entry = { id: f[0].id, name: f[0].name, parent };
    setShared(kind, entry);
    st.save = true;
    label(); return true;
  }

  // ---------- one file, updated in place ----------
  // Only the exact Drive file this season was opened from, or created for it by this app, is ever updated. lineage() is that file or null, and null means a new file:
  // a new season, a file opened from the computer, the Try-it-out club, another file opened since and a test session against a real file all save as a new dated file.
  const isTestName = n => /(^|[^a-z])test([^a-z]|$)/i.test(String(n || ''));
  const testing = () => App.testFiles().length > 0;
  function lineage() {
    const s = App.season; if (!s) return null;
    let c = st.cur && st.cur.season === s && st.cur.year === s.year ? st.cur : null;
    const src = App.seasonSource, k = st.cand;
    if (!c && k && src && src.season === s && src.text === k.text) {
      try { c = st.cur = { id: k.id, name: k.name, rev: k.rev, year: s.year, season: s, base: Season.snapshot(Season.fromJson(k.text)) }; } catch (e) { c = null; }
    }
    return c && c.rev && isTestName(c.name) === testing() ? c : null;
  }
  const dropped = list => list.slice(0, 8).map(c => '• ' + Season.describe({ p: c.path, o: c.base, n: c.ours }, id => { const p = App.master && App.master.people.find(x => x[Model.X.ID] === id); return p ? Model.fullName(p) : id; })).join('\n') + (list.length > 8 ? '\n• and ' + (list.length - 8) + ' more' : '');
  async function saveInPlace(c, dated, text, opts) {
    const name = st.keep || c.name || dated;      // keep the Drive file's own name unless one was typed on Options; the dated name is only the last resort
    const seq0 = opts && opts.seq !== undefined ? opts.seq : App.editSeq(), editedSince = () => App.editSeq() !== seq0;      // edits made since the text was taken (the counter, not App.dirty(): the file is marked saved only after Drive answers)
    const ours = App.season; let body = text, basedOn = c.rev, merged = null, choices = {}, approved = false;
    // A save you pressed shows the merge screen (the same summary and conflict choices as File > Merge a data file): what is on Drive is "mine" there, this copy is "other", and what is saved is Drive's file plus this copy's changes.
    // The automatic save has nobody to ask, so it keeps the old rule: what is already on Drive stays, and what clashed is listed afterwards.
    const interactive = !(opts && opts.auto) && !!App.mergeScreen && !!window.DataMerge;
    // Each pass starts again from ours and the newest remote content; a second pass (someone saved in the gap) reuses the decisions already made and asks again only about something new.
    const merge = async (remote, onlyRemerge) => {
      if (!interactive) {      // the Planning Center block (the export record, its columns, "as of" and every person's values) goes whole from one side, never mixed (R17)
        const theirs = Season.fromJson(remote), al = window.DataMerge && DataMerge.alignPc ? DataMerge.alignPc(c.base, ours, theirs) : { ours, theirs };
        merged = Season.merge3(c.base, al.ours, al.theirs, { from: 'another save' }); body = Season.toJson(merged.season); return;
      }
      const P = DataMerge.plan(Season.fromJson(remote), Season.fromJson(text), Object.assign({ base: c.base, pc: true, removals: true, from: 'this copy' }, App.mergeNames(ours)));
      if (onlyRemerge && !P.conflicts.length) approved = true;      // nobody else saved: this only brings back what you already approved once, so there is nothing to ask
      if (!approved || P.conflicts.some(x => !choices[x.id])) {
        const r = await App.mergeScreen(P, { name: 'Google Drive', title: 'Someone else saved this file on Google Drive: merge their changes with yours', intro: 'Nothing is saved to Drive until you press Save to Drive. "Drive" below is what is saved there now; "my copy" is what you have open.',
          applyLabel: 'Save to Drive', mineLabel: 'Keep Drive’s', otherLabel: 'Use my copy’s', allMineLabel: 'Keep all Drive’s', allOtherLabel: 'Use all of my copy’s', choices });
        if (!r) { const e = new Error('the merge with the changes on Drive was cancelled'); e.cancelled = true; throw e; }
        choices = r.choices; approved = true;
      }
      merged = { season: DataMerge.finish(P, choices), conflicts: [], decided: P.conflicts.length, counts: DataMerge.summary(P, P.conflicts.length ? choices : undefined).counts }; body = Season.toJson(merged.season);
    };
    const now = await D.head(c.id);
    // c.remerge: the last save merged in someone else's changes but was edited over, so this copy still lacks them. Merge again even when nobody has saved since (R7).
    if (c.remerge || now.headRevisionId !== c.rev) { const r = await D.read(c.id); await merge(r.text, c.remerge && now.headRevisionId === c.rev); basedOn = r.revision; }       // someone saved since this copy opened or last saved
    let up = await D.update(c.id, name, body, 'application/json'), revs = null;
    // There is a small gap between the check and the write, so look at what Drive holds: the revision just before ours must be the one we built on (or our own earlier write). If not, someone saved in that gap; their revision is still there.
    for (let i = 0; i < 4; i++) {
      revs = await D.revisions(c.id);
      const at = revs.findIndex(x => x.id === up.headRevisionId), prev = at > 0 ? revs[at - 1] : null;
      if (!prev || prev.id === basedOn) break;
      if (i === 3) throw new Error('the file keeps changing under you (someone else is saving at the same time). Try again in a moment.');
      await merge(await D.readRevision(c.id, prev.id));
      basedOn = up.headRevisionId;      // the write before the next one is this one of ours: anything else in between is someone else's
      up = await D.update(c.id, name, body, 'application/json');
    }
    c.rev = up.headRevisionId || c.rev; c.name = up.name || name;
    // Drive drops versions nobody pinned after 30 days (or 100 newer ones): keep one from every few days (pinDays, a club setting; 0 = never) so older ones stay reachable.
    try {
      const days = pinDays(), kept = revs ? revs.filter(x => x.keepForever).map(x => Date.parse(x.modifiedTime) || 0) : [];
      if (days && up.headRevisionId && (!kept.length || Date.now() - Math.max(...kept) > days * 86400000)) await D.pin(c.id, up.headRevisionId);
    } catch (e) { /* the save worked; pinning is an extra */ }
    st.wait = null; st.last = 'saved ' + hhmm(); label(); flashSaved();
    if (!merged) { c.base = Season.snapshot(Season.fromJson(body)); c.remerge = false; return up; }
    let said = 'Saved. Someone else had saved this file since you opened it, so their changes were merged with yours.';
    if (merged.counts) said += ' Added ' + merged.counts.Added + ', changed ' + merged.counts.Changed + ', ' + merged.counts.Review + ' to review' + (merged.decided ? ', ' + merged.decided + ' decided by you' : '') + '.';
    if (merged.conflicts.length) said += '\n\n' + merged.conflicts.length + ' of your changes clashed with theirs and were NOT kept (what was already saved stayed):\n' + dropped(merged.conflicts);
    if (!editedSince()) {       // show everything the file now holds, and start from it: otherwise the next save would build on a copy that lacks the others' changes
      App.openSeason(body, { refresh: true });
      if (App.seasonSource && App.seasonSource.text === body) { c.season = App.season; c.year = App.season.year; c.base = Season.snapshot(Season.fromJson(body)); c.remerge = false; }
    } else {
      // This screen still lacks what was merged in. What was sent becomes the base, so the next save brings the others' changes in first and replays only the edits made since (R7).
      c.base = Season.snapshot(Season.fromJson(text)); c.remerge = true;
      said += '\n\nYou changed something while it was saving, so this screen was not refreshed. Your changes are safe; the next save brings in the others\' changes first.';
    }
    if (merged.conflicts.length) App.ask.alert(said, { title: 'Google Drive' }); else App.flash(said, 'info');      // an automatic save never blocks a phone with an alert unless something of yours was dropped
    return up;
  }
  const queue = fn => { const p = st.q.then(fn, fn); st.q = p.catch(() => {}); return p; };       // saves run one at a time

  // Data files and slide images go to their own folders. If Google refuses a folder (this person has not confirmed it yet), ask once.
  async function goRun(name, text, type, opts) {
      const auto = !!(opts && opts.auto);
      if (auto && !D.connected(AUTO_MARGIN_MS)) throw waitErr('signin');      // no D.* call is made, so no sign-in window can open
      const kind = /json/.test(type || '') ? 'data' : 'slides', where = kind === 'data' ? 'club' : 'slides';      // everything that is not a data file (slides, ZIPs, CSV exports) goes in the second folder
      if (kind === 'data' && st.style === 'inplace') { const c = lineage(); if (c) { await saveInPlace(c, name, text, opts); return; } }
      if (!dirId(where)) { if (auto) throw waitErr('folder'); if (!(await chooseDir(where))) throw new Error('no Drive folder was chosen for ' + (kind === 'data' ? 'data files' : 'slide images')); }
      let r;
      try { r = await D.save(name, text, type, dirId(where)); }
      catch (err) {
        if (err.status !== 403 && err.status !== 404) throw err;
        if (auto) throw waitErr('folder');
        if (!(await chooseDir(where, true))) throw err;
        r = await D.save(name, text, type, dirId(where));
      }
      st.wait = null; st.last = 'saved ' + hhmm(); label(); flashSaved();
      // With "one file" chosen, the file just created becomes the one kept up to date (a new season's first save, a file opened from the computer).
      if (kind === 'data' && st.style === 'inplace' && r.headRevisionId && App.season && isTestName(r.name || name) === testing()) {
        try { st.cur = { id: r.id, name: r.name || name, rev: r.headRevisionId, year: App.season.year, season: App.season, base: Season.snapshot(Season.fromJson(text)) }; } catch (e) { st.cur = null; }
      }
      return r;
  }
  // N9 point 9: one plain sentence for each kind of failure, shown with Try again. The raw text stays in the log (err.message).
  const explain = err => {
    const msg = String((err && err.message) || ''), kind = (err && err.kind) || (/keeps changing/.test(msg) ? 'changing' : 'other');
    if (kind === 'signin') return 'Google asked you to sign in again. Press Try again to sign in; your changes are still here.';
    if (kind === 'busy') return 'Google Drive is busy right now (it said ' + ((err && err.status) || 'busy') + '). Nothing was changed on Drive. Press Try again in a moment.';
    if (kind === 'offline') return 'This computer could not reach Google Drive. Check the connection, then press Try again. Nothing was changed on Drive.';
    if (kind === 'folder') return 'Google Drive will not let this app save to that folder. Choose the folder again, then press Try again.';
    if (kind === 'changing') return 'Someone else is saving the same file right now. Wait a minute and press Try again; their changes will be merged with yours.';
    return 'Google Drive reported a problem (' + msg + ').';
  };
  App.driveSave = {
    explain,
    active: () => st.save,
    waiting: () => st.wait ? { kind: st.wait.kind, at: st.wait.at } : null,
    go: (name, text, type, opts) => queue(async () => {
      // N36: a small floppy icon beside the save button shows while a save runs and fades when it ends (success or error).
      // The save button's label turns into the floppy icon while a save runs (style.css: #btnSeasonSave.saving); its text stays for screen readers.
      const flop = on => { const b = document.getElementById('btnSeasonSave'); if (!b) return; b.classList.toggle('saving', on); if (on) b.setAttribute('aria-busy', 'true'); else b.removeAttribute('aria-busy'); };
      flop(true);
      try { return await goRun(name, text, type, opts); }
      catch (err) { if (opts && opts.auto && !err.auto) wait('error', err.message); throw err; }
      finally { flop(false); }      // any failure of an automatic save is quiet: it is shown on the status line and tried again
    }),
  };
  // For the Options tab: the same settings as this dialog.
  App.driveInfo = () => ({ save: st.save, connected: D.connected(), club: dirOf('club'), slides: dirOf('slides'), clubShared: sharedOf('club'), slidesShared: sharedOf('slides'), style: st.style, keepName: st.keep, pinDays: pinDays(), inPlace: !!lineage() });
  App.driveStyle = { get: () => st.style, set: setStyle };
  App.driveKeepName = { get: () => st.keep, set: setKeep };
  // A session carried through an app update (app-update.js): whether saving goes to Drive and which Drive file the open season is kept up to date in. The sign-in itself cannot be carried; the next save asks.
  App.driveHandoff = {
    get() { const c = lineage(); return { save: st.save, cur: c ? { id: c.id, name: c.name, rev: c.rev, remerge: !!c.remerge } : null }; },
    set(h) { if (!h) return; st.save = !!h.save; if (h.cur && App.season) st.cur = { id: h.cur.id, name: h.cur.name, rev: h.cur.rev, remerge: !!h.cur.remerge, year: App.season.year, season: App.season, base: Season.snapshot(App.season) }; label(); },
  };

  // ---------- the settings (on the Options tab: no pop-up) ----------
  // The Options tab shows and changes everything: the folders (Choose / Clear), whether saving goes to Drive, signing out. These are what it calls.
  App.driveDo = {
    async choose(kind) { try { await chooseDir(kind); } catch (err) { App.ask.alert('Google Drive: ' + err.message, { title: 'Google Drive' }); } label(); },
    clear(kind) { const k = kind === 'slides' ? 'slides' : 'club'; setShared(k, null); },
    setSave(on) { st.save = !!on; label(); },
    signOut() { D.disconnect(); st.save = false; label(); },
    connected: () => D.connected(),
  };
  const showSettings = () => { App.showTab('options'); setTimeout(() => { const c = $('optDriveCard'); if (c) { c.scrollIntoView({ block: 'start' }); c.classList.add('found'); setTimeout(() => c.classList.remove('found'), 2500); } }, 80); };

  // ---------- the buttons' menus ----------
  // Save and Import are each one button with an arrow beside it. The main part does the usual thing (to Drive when saving to Drive is on, otherwise the computer: the same default for both); the arrow chooses.
  // The menus are fixed-position elements at the end of the page so the header's scrolling row cannot clip them.
  const preload = () => { D.preload().catch(() => {}); };      // Google's scripts are fetched when the person first shows interest, so a sign-in or picker window can open straight from the next click
  const menus = [];
  function makeMenu(menu, caret, items, pick) {
    const open = on => {
      if (on) {
        menus.forEach(m => { if (m.menu !== menu) m.close(); }); preload(); menu.innerHTML = items(); menu.hidden = false;
        const r = caret.getBoundingClientRect(); menu.style.left = Math.max(8, Math.min(innerWidth - menu.offsetWidth - 8, r.left)) + 'px'; menu.style.top = (r.bottom + 4) + 'px';
      } else menu.hidden = true;
      caret.setAttribute('aria-expanded', on ? 'true' : 'false');
    };
    caret.addEventListener('click', e => { e.stopPropagation(); open(menu.hidden); if (!menu.hidden) menu.querySelector('[aria-checked="true"], button').focus(); });
    menu.addEventListener('click', e => { const b = e.target.closest('[data-sm]'); if (!b) return; open(false); pick(b.dataset.sm); });
    menus.push({ menu, caret, close: () => open(false) });
  }
  document.addEventListener('click', e => menus.forEach(m => { if (!m.menu.hidden && !e.target.closest('#' + m.menu.id + ', #' + m.caret.id)) m.close(); }));
  document.addEventListener('keydown', e => menus.forEach(m => {
    if (m.menu.hidden) return;
    const items = [...m.menu.querySelectorAll('button')], i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { m.close(); m.caret.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Tab') m.close();
  }));
  const radio = (id, text, on) => '<button type="button" role="menuitemradio" aria-checked="' + on + '" data-sm="' + id + '"><span class="tick">' + (on ? '\u2713' : '') + '</span>' + esc(text) + '</button>';
  const plain = (id, text) => '<button type="button" role="menuitem" data-sm="' + id + '"><span class="tick"></span>' + esc(text) + '</button>';
  // Save: where the file goes.
  makeMenu($('saveMenu'), $('saveMenuBtn'), () => radio('local', 'This computer (download)', !st.save) + radio('dated', 'Google Drive: a new dated file each time', st.save && st.style === 'dated') + radio('inplace', 'Google Drive: update one file in place', st.save && st.style === 'inplace') +
    '<hr>' + plain('settings', 'Google Drive settings\u2026') + (D.connected() ? plain('out', 'Sign out of Google') : ''), id => {
    if (id === 'local') { App.saveNow({ local: true }); return; } else if (id === 'dated' || id === 'inplace') { st.save = true; setStyle(id); }
    else if (id === 'settings') { showSettings(); return; } else if (id === 'out') { D.disconnect(); st.save = false; }
    label();
  });
  // Import: where to bring a file in from (the choice here is for this one import; the main button follows the save target).
  makeMenu($('importMenu'), $('importMenuBtn'), () => radio('local', 'From this computer\u2026', !st.save) + radio('drive', 'From Google Drive\u2026', st.save), id => { if (id === 'drive') openFromDrive(); else $('fileAny').click(); });
  // The File menu (app.js shows it under the arrow beside Save): Import, a separator, then Save and where it goes. Each item drives the same buttons and settings as before; with no Drive set up it is only Import from this computer and Download.
  const driveOn = () => !$('saveMenuBtn').hidden;
  const fm = (id, text, on, ticked) => '<button type="button" role="' + (ticked ? 'menuitemradio' : 'menuitem') + '"' + (ticked ? ' aria-checked="' + !!on + '"' : '') + ' data-fm="' + id + '"><span class="tick">' + (on ? '\u2713' : '') + '</span>' + esc(text) + '</button>';
  App.fileMenu = {
    html: () => { preload(); const dr = driveOn(); return '<div class="smhead">Import</div>' + fm('imp-local', 'Import from this computer\u2026') + (dr ? fm('imp-drive', 'Import from Google Drive\u2026') : '') + fm('imp-merge', 'Merge a data file\u2026') + '<hr>' +
      '<div class="smhead">Save</div>' + fm('save', $('btnSeasonSave').textContent.trim() + ' (now)') + (dr ? fm('dlnow', 'Download now to this computer (timestamped copy)') : '') +
      (dr ? '<hr><div class="smhead">Where Save goes</div>' + fm('to-local', 'This computer (download)', !st.save, true) + fm('to-dated', 'Google Drive: a new dated file each time', st.save && st.style === 'dated', true) + fm('to-inplace', 'Google Drive: update one file in place', st.save && st.style === 'inplace', true) + '<hr>' + fm('settings', 'Google Drive settings\u2026') + (D.connected() ? fm('out', 'Sign out of Google') : '') : ''); },
    pick: id => {
      if (id === 'imp-local') $('fileAny').click(); else if (id === 'imp-merge') $('fileMerge').click(); else if (id === 'imp-drive') openFromDrive(); else if (id === 'save') $('btnSeasonSave').click(); else if (id === 'dlnow') App.saveNow({ local: true });
      else if (id === 'to-local') { App.saveNow({ local: true }); } else if (id === 'to-dated' || id === 'to-inplace') { st.save = true; setStyle(id === 'to-dated' ? 'dated' : 'inplace'); label(); }
      else if (id === 'settings') showSettings(); else if (id === 'out') { D.disconnect(); st.save = false; label(); }
    },
  };
  App.importDefault = () => st.save ? 'drive' : 'local'; App.importFromDrive = () => { preload(); openFromDrive(); };
  $('splashDrive').addEventListener('click', () => { D.preload().then(openFromDrive, err => App.ask.alert('Google Drive: ' + err.message, { title: 'Google Drive' })); });
  // N41: the remembered file on the splash, as its exact name (a long name is cut off on screen; the full name is on hover). It opens with no picker; if Google refuses it, the picker opens instead.
  const showLastFile = () => { const last = lastFile(), b = $('splashLast'); if (!last || !b || !cfg || !D.configured()) return; b.textContent = 'Open ' + last.name + ' from Google Drive'; b.title = last.name; b.setAttribute('aria-label', 'Open ' + last.name + ' from Google Drive'); $('splashLastRow').hidden = false; };
  $('splashLast').addEventListener('click', () => { const last = lastFile(); if (!last) return; D.preload().then(() => openPicks([{ id: last.id, name: last.name }]).catch(err => { App.ask.alert('The remembered file could not be opened (' + err.message + '). Choose it from Google Drive instead.', { title: 'Google Drive' }); openFromDrive(); }), err => App.ask.alert('Google Drive: ' + err.message, { title: 'Google Drive' })); });
  showLastFile();
})();
