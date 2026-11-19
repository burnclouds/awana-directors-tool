(this.AwanaVersions = this.AwanaVersions || {})['app-tools.js'] = '1.8.2';
// Debug and Validate tabs. Debug: which version of every file is running, what is open, and the dates of the CSV/JSON files.
// Validate: check a data file, Planning Center export or older CSV for problems without opening it into the app.
(function () {
  const $ = id => document.getElementById(id), App = window.App, esc = App.esc;
  const meta = n => (document.querySelector('meta[name="' + n + '"]') || {}).content || '';
  const KIND = { data: 'Data file', pc: 'Planning Center export', calendar: 'Calendar CSV (old)', colors: 'Colors CSV (old)', master: 'Master CSV (old)', rotation: 'Rotation CSV (old)', json: 'Other JSON', '': 'Unknown' };
  const table = (head, rows) => '<table class="roster"><thead><tr>' + head.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' +
    rows.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table>';

  // The version shown in the header comes from the page itself.
  $('verLink').textContent = 'v' + meta('app-version');
  $('splashVer').textContent = 'Version ' + meta('app-version') + ' (' + meta('app-build') + ') · check for updates';
  // On the start screen the version line is also the check: it asks the website now and says what it found right there (the bar at the top shows the same result). Nothing is open here, so Update now has nothing to save.
  $('splashVer').addEventListener('click', async () => {
    const U = App.updates, msg = $('splashUpdMsg'), go = $('splashUpdApply'); go.hidden = true;
    if (!U) { msg.textContent = 'Updates cannot be checked right now.'; return; }
    if (!U.web) { msg.textContent = 'Updates are checked only when the app is opened from its website, not from a file on this computer.'; return; }
    msg.textContent = 'Checking…'; await U.check(); App.splashUpdate();
  });
  // N7: the line under the version on the start screen always says where the update check stands: Checking..., when it last checked, or why it could not. It is redrawn by app-update.js whenever a check starts or ends (the launch check too), so it is right without a click.
  App.splashUpdate = () => {
    const U = App.updates, msg = $('splashUpdMsg'), go = $('splashUpdApply'); if (!msg || !U || !U.web) return;
    const st = U.state(); go.hidden = true;
    if (st.checking) msg.textContent = 'Checking for updates…';
    else if (st.offline) msg.textContent = 'Could not check for updates (offline).' + (st.last ? ' Last tried at ' + st.last + '.' : '');
    else if (st.error) msg.textContent = 'Could not check: ' + st.error + '.';
    else if (st.found) { msg.textContent = 'Version ' + st.found.version + ' is available (you are on ' + U.run.version + ').'; go.hidden = false; }
    else if (st.last) msg.textContent = 'Checked for updates at ' + st.last + (st.lastDay && st.lastDay !== new Date().toLocaleDateString('en-CA') ? ' on ' + Model.md(st.lastDay) : '') + ': you are on the latest version (' + U.run.version + ').';
  };
  setTimeout(() => App.splashUpdate && App.splashUpdate(), 0);      // a check that is already running (or has finished) when this file loads shows at once
  $('splashUpdApply').addEventListener('click', () => { if (App.updates) App.updates.apply(); });
  // Clicking the version checks for a new version right now (Shift-click opens the Debug tab, which lists every file's version).
  $('verLink').addEventListener('click', e => {
    e.preventDefault(); const U = App.updates;
    if (e.shiftKey || !U) { App.showTab('debug'); return; }
    if (!U.web) { App.flash('Updates are checked only when the app is opened from its website, not from a file on this computer.', 'info'); return; }
    App.flash('Checking for a new version\u2026', 'info');
    U.check().then(() => { const st = U.state(); App.flash(st.error ? 'Could not check: ' + st.error : st.found ? 'A new version is available: ' + st.found.version + ' (you are on ' + U.run.version + '). Use Update in the bar above.' : 'You are on the latest version (' + U.run.version + ').', st.error ? 'error' : 'info'); });
  });

  // ---------- Debug ----------
  const fileRow = f => [esc(f.name), esc(KIND[f.kind] || 'Unknown'), esc(f.modified || '–'), esc(f.nameStamp || '–'),
    esc(Object.keys(f.facts).map(k => k + ': ' + (f.facts[k] || '–')).join(' · '))];
  const FILE_HEAD = ['File', 'What it is', 'File date (from the disk)', 'Date in the name', 'Inside the file'];
  // Given dates nobody entered: found from the History (see Season.assumedGiven), counted first, cleared only on your say-so. Undo takes it back.
  let assumed = null;
  function assumedHtml() {
    const s = App.season; if (!s) return '';
    let h = '<h3>Given dates nobody entered</h3><p class="status">Given is only ever entered by a person. An older version of the app, opening a file from before Given was tracked, marked every announced award as given on the night it was announced. <b>Count</b> finds the Given dates the History never shows anyone entering; <b>Clear</b> removes them, and those awards then wait under <i>Announced, not yet given</i>.</p>';
    if (!assumed) return h + '<p><button type="button" id="dbgAssumedCount">Count them</button></p>';
    if (!assumed.n) return h + '<p class="ok">None: every Given date in this file was entered by a person.</p><p><button type="button" id="dbgAssumedCount">Count again</button></p>';
    return h + '<p><b>' + assumed.n + ' Given date' + (assumed.n === 1 ? '' : 's') + '</b> for ' + assumed.kids + ' child' + (assumed.kids === 1 ? '' : 'ren') + ', on ' + assumed.days.map(d => esc(d[0].slice(5).replace('-', '/')) + ' (' + d[1] + ')').join(', ') + '.</p>' +
      '<p><button type="button" id="dbgAssumedClear" class="primary">Clear these ' + assumed.n + ' Given dates</button> <button type="button" id="dbgAssumedCount">Count again</button></p>';
  }
  // Books with no dates (N38 follow-up): a handbook that is only a book code, for a child with no date of any kind. Counted first, reset only on your say-so; Undo takes it back.
  let noDate = null;
  function noDateHtml() {
    const s = App.season; if (!s) return '';
    let h = '<h3>Books with no dates</h3><p class="status">A child whose only book is a bare code (for example WR) with no date and nothing else recorded: the Progress sheet opens on that code. <b>Reset</b> clears those codes so the sheet opens on the group\'s default book (Hangglider for Sparks, the club book for Cubbies and T&amp;T). Children with any date are never touched. Undo takes it back.</p>';
    if (!noDate) return h + '<p><button type="button" id="dbgNoDateCount">Count them</button></p>';
    if (!noDate.n) return h + '<p class="ok">None: no child has a bare book code with no dates.</p><p><button type="button" id="dbgNoDateCount">Count again</button></p>';
    return h + '<p><b>' + noDate.n + ' child' + (noDate.n === 1 ? '' : 'ren') + '</b>:</p><ul>' + noDate.rows.map(r => '<li>' + esc(r.name) + ' (' + esc(r.room) + '): ' + esc(r.code) + '</li>').join('') + '</ul>' +
      '<p><button type="button" id="dbgNoDateReset" class="primary">Reset these ' + noDate.n + ' book' + (noDate.n === 1 ? '' : 's') + '</button> <button type="button" id="dbgNoDateCount">Count again</button></p>';
  }
  // ---- Bug reports and feature requests (flag level "bug"): listed here, never on To do. Each has a status and a reply, kept in the data file so every leader sees the same list. ----
  let bugFilter = 'open', bugEditing = '', bugBy = 'leader';
  const STATUS_WORD = { open: 'Open', fixed: 'Fixed', dropped: 'Dropped' }, BY_WORD = { leader: 'Leader', developer: 'Developer' };
  function bugsHtml() {
    const s = App.season; if (!s) return '<h3>Bug reports and feature requests</h3><p class="status">Open a data file: bug reports are kept in it.</p>';
    const all = Season.bugList(s), openN = all.filter(f => Season.bugStatusOf(f) === 'open').length, list = all.filter(f => bugFilter === 'all' || Season.bugStatusOf(f) === bugFilter);
    const FT = window.FlagTrail, name = id => { const p = App.master && App.master.people.find(x => x[Model.X.ID] === id); return p ? Model.fullName(p) : '(no longer on the roster)'; };
    const rows = list.map(f => {
      const where = f.trail && FT ? esc(FT.readable(f.trail)) + (App.flagMissing && App.flagMissing.has(f.id) ? ' <span class="status">(spot not found)</span>' : '') : '<span class="status">No spot</span>';
      const edit = bugEditing === f.id;
      // The status is a pick on every row (saved when it changes); the replies are a conversation, oldest first, each with who wrote it and when; Reply opens a box to add one (N17, N18).
      const st = Season.bugStatusOf(f), thread = Season.bugThread(f);
      const talk = thread.map(r => '<div class="bugreply"><span class="bugtext">' + esc(r.text) + '</span> <span class="status">' + esc(BY_WORD[r.by] || r.by) + (r.at ? ', ' + esc(Model.md(r.at)) : '') + '</span> <button type="button" class="linklike" data-bugrm="' + esc(f.id) + '|' + esc(r.id) + '" aria-label="Remove this reply">Remove</button></div>').join('');
      return '<tr data-bug="' + esc(f.id) + '"><td><select data-bugstatus="' + esc(f.id) + '" aria-label="Status">' + Season.BUG_STATUS.map(x => '<option value="' + x + '"' + (st === x ? ' selected' : '') + '>' + STATUS_WORD[x] + '</option>').join('') + '</select></td><td>' + where + '</td><td>' + (f.kid ? esc(name(f.kid)) : '<span class="status">&mdash;</span>') + '</td><td>' + esc(f.note) + '</td>' +
        '<td>' + esc(Model.md(f.at)) + (f.ver ? ' <span class="status">v' + esc(f.ver) + '</span>' : '') + '</td>' +
        '<td>' + (talk || '<span class="status">&mdash;</span>') + (edit ? '<div class="bugedit"><label>Your reply <textarea data-bugtext rows="3"></textarea></label><label>By <select data-bugby><option value="leader"' + (bugBy === 'leader' ? ' selected' : '') + '>Leader</option><option value="developer"' + (bugBy === 'developer' ? ' selected' : '') + '>Developer</option></select></label><button type="button" data-bugadd="' + esc(f.id) + '" class="primary">Add reply</button><button type="button" data-bugcancel>Cancel</button></div>' : '') + '</td>' +
        '<td>' + (f.tab ? '<button type="button" data-buggo="' + esc(f.id) + '">Go</button> ' : '') + (edit ? '' : '<button type="button" data-bugreply="' + esc(f.id) + '">Reply</button> ') + '<button type="button" data-bugdel="' + esc(f.id) + '">Delete</button></td></tr>';
    }).join('');
    return '<h3 id="dbgBugs">Bug reports and feature requests (' + openN + ' open)</h3><p class="status">Added with the Bug button (turn it on under Options). They are kept in the data file, so every leader sees the same list and the same conversation: reply to a report as often as you like, and mark it Open, Fixed or Dropped. They never appear on To do.</p>' +
      '<p class="bugfilter" role="group" aria-label="Show">' + [['all', 'All'], ['open', 'Open'], ['fixed', 'Fixed'], ['dropped', 'Dropped']].map(([k, l]) => '<button type="button" data-bugfilter="' + k + '" aria-pressed="' + (bugFilter === k ? 'true' : 'false') + '"' + (bugFilter === k ? ' class="on"' : '') + '>' + l + '</button>').join(' ') + '</p>' +
      (list.length ? '<div class="scroll" style="max-height:none"><table class="roster"><thead><tr><th>Status</th><th>Where</th><th>Child</th><th>Report</th><th>Reported</th><th>Reply</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<p class="status">' + (all.length ? 'None with that status.' : 'No bug reports yet.') + '</p>');
  }
  function renderDebug() {
    const reg = typeof AwanaVersions === 'undefined' ? {} : AwanaVersions, tags = [...document.scripts].map(s => s.getAttribute('src')).filter(Boolean);
    // A script from another site is not one of the app's files and never registers a version: Google's two scripts (sign-in and the Drive API) are added to the page on demand by drive.js once Google Drive is used. They are named, not flagged.
    const outside = src => /^(https?:)?\/\//i.test(src) && !src.includes(location.host);
    const scripts = tags.map(src => { const v = reg[src.split('/').pop().split('?')[0]]; return [esc(src), v ? '<b>' + esc(v) + '</b>' : outside(src) ? 'from another site (' + esc(src.split('/')[2]) + '), loaded when Google Drive is used' : '<span class="h-del" style="padding:1px 6px">not registered — the file did not load, or this is an old copy</span>']; });
    const S = typeof Season === 'undefined' ? null : Season, s = App.season, last = s && s.history[s.history.length - 1];
    const state = [['This page (index.html)', esc(meta('app-version') + ' · built ' + meta('app-build'))], ['Built from', (() => { const v = meta('app-source'); return v ? esc(v.replace('+changes', ' (with changes not yet committed)')) : '–'; })()], ['Data file format', S ? esc(S.FORMAT + ' version ' + S.VERSION) : '–']];
    const open = s ? [['Club year', esc(s.year)], ['People on the roster', String(App.master ? App.master.people.length : 0)], ['Nights of attendance', String(Object.keys(s.attendance).length)],
      ['Versions in the history', String(s.history.length)], ['Last edit', last ? esc(new Date(last.t).toLocaleString()) : '–'],
      ['Planning Center data as of', esc((s.roster && s.roster.pcAsOf) || '–')], ['Unsaved changes', App.dirty() ? 'yes' : 'no'],
      ['Last big draw', App.drawStats ? esc(App.drawStats.n + ' ' + App.drawStats.what + ' in ' + (App.drawStats.ms / 1000).toFixed(2) + ' s') : 'none yet']] : null;
    let storage = '–'; try { storage = Object.keys(localStorage).filter(k => k.startsWith('awana')).join(', ') || 'none'; } catch (e) { storage = 'blocked'; }
    $('debugWrap').innerHTML = bugsHtml() +
      '<h3>Versions</h3>' + table(['What', 'Version'], state) +
      '<p><a href="version-history.html" target="_blank" rel="noopener">Version history: every version and lettered sub-version, from 1.44 on</a></p>' +
      '<h3>Scripts on this page (' + scripts.length + ')</h3>' + table(['Script', 'Version'], scripts) +
      '<h3>Planning Center columns</h3>' + (App.master ? App.pcColumns.html() : '<p class="status">No roster is open.</p>') +
      assumedHtml() + noDateHtml() + '<h3>Open now</h3>' + (open ? table(['', ''], open) : '<p class="status">No data file is open.</p>') +
      '<h3>Files opened this session</h3>' + (App.opened.length ? table(FILE_HEAD, App.opened.map(fileRow)) : '<p class="status">None yet. Import files from the top bar, or check some here.</p>') +
      '<p><label class="btn">Check files&hellip;<input type="file" id="dbgFiles" multiple class="vh" accept=".csv,.json,.txt,text/csv,application/json,text/plain"></label> <span class="status">reads the dates and counts inside each file; nothing is opened into the app</span></p>' +
      '<h3>Browser</h3>' + table(['', ''], [['Address', esc(location.protocol + '//' + (location.host || '') + location.pathname)], ['Time zone', esc(Intl.DateTimeFormat().resolvedOptions().timeZone)],
        ['Saved settings in this browser', esc(storage)], ['Browser', esc(navigator.userAgent)]]);
  }
  App.renderDebug = renderDebug;
  if (App.onRefresh) App.onRefresh.push(() => { if ($('debugWrap').offsetParent) renderDebug(); });      // another leader's report or reply arrives with a merge
  $('debugWrap').addEventListener('click', e => {
    const t = e.target.closest('[data-bugfilter],[data-bugreply],[data-bugadd],[data-bugcancel],[data-bugdel],[data-buggo],[data-bugrm]'); if (!t || !App.season) return;
    if (t.dataset.bugfilter) { bugFilter = t.dataset.bugfilter; renderDebug(); return; }
    if (t.dataset.bugreply) { bugEditing = t.dataset.bugreply; renderDebug(); return; }
    if (t.hasAttribute('data-bugcancel')) { bugEditing = ''; renderDebug(); return; }
    if (t.dataset.bugadd) {
      const row = t.closest('tr'), text = row.querySelector('[data-bugtext]').value, by = row.querySelector('[data-bugby]').value;
      try { App.addBugReply(t.dataset.bugadd, text, by); } catch (err) { App.flash(err.message, 'error'); return; }
      bugBy = by; bugEditing = ''; renderDebug(); return;      /* the same row stays in view: a reply does not change the status */
    }
    if (t.dataset.bugrm) { const [id, rid] = t.dataset.bugrm.split('|'); try { App.removeBugReply(id, rid); } catch (err) { App.flash(err.message, 'error'); return; } renderDebug(); App.done('Reply removed.'); return; }
    if (t.dataset.bugdel) { App.clearFlag(t.dataset.bugdel); renderDebug(); App.done('Bug report deleted.'); return; }      /* one Undo step: done at once, with an Undo message (UX-20) */
    if (t.dataset.buggo) { const f = Season.bugList(App.season).find(x => x.id === t.dataset.buggo); if (f && App.goElement) App.goElement(f); return; }
  });
  $('debugWrap').addEventListener('click', e => {
    const id = e.target.id, s = App.season;
    if (s && id === 'dbgNoDateCount') { const ids = Season.noDateBookKids(s); noDate = { n: ids.length, rows: ids.map(kid => { const p = App.master && App.master.people.find(x => x[Model.X.ID] === kid); return { name: p ? Model.fullName(p) : '(not on the roster)', room: p ? Model.room(p) : '', code: String(s.handbooks[kid] || '').trim().split(/\s+/)[0] }; }) }; renderDebug(); return; }
    if (s && id === 'dbgNoDateReset') { if (!noDate || !noDate.n) return; const n = Season.resetNoDateBooks(s); noDate = null; App.touch(); renderDebug(); App.done(n + ' book code' + (n === 1 ? '' : 's') + ' with no dates cleared. Each sheet opens on its group\'s default book now. Undo takes it back.'); return; }
    if (!s || !['dbgAssumedCount', 'dbgAssumedClear'].includes(id)) return;
    if (id === 'dbgAssumedCount') { const l = Season.assumedGiven(s), by = {}; l.forEach(x => { by[x.date] = (by[x.date] || 0) + 1; }); assumed = { n: l.length, kids: new Set(l.map(x => x.id)).size, days: Object.keys(by).sort().map(d => [d, by[d]]) }; renderDebug(); return; }
    if (!assumed) return;      /* the count came first; clearing is done at once, with Undo (UX-20) */
    const n = Season.clearAssumedGiven(s); assumed = null; App.touch(); renderDebug(); App.done(n + ' Given date' + (n === 1 ? '' : 's') + ' that nobody entered cleared. The awards stay announced and wait under "Announced, not yet given".');
  });
  $('debugWrap').addEventListener('change', async e => {
    if (e.target.dataset && e.target.dataset.bugstatus && App.season) {      /* a status pick is saved at once; the list follows it so the report stays in view */
      const st = e.target.value; try { App.setBugStatus(e.target.dataset.bugstatus, st); } catch (err) { App.flash(err.message, 'error'); return; }
      if (bugFilter !== 'all' && bugFilter !== st) bugFilter = st; renderDebug(); return;
    }
    if (e.target.id !== 'dbgFiles') return;
    const files = [...e.target.files]; e.target.value = '';
    for (const f of files) App.noteOpened(f.name, await f.text(), f.lastModified);
    renderDebug();
  });

  // ---------- Validate ----------
  const BADGE = { error: 'h-del', warn: 'h-chg', info: '' };
  function renderResult(name, r) {
    const n = l => r.findings.filter(f => f.level === l).length, bad = n('error'), warn = n('warn');
    const head = '<h3>' + esc(name) + ' <small>— ' + esc(KIND[r.kind] || 'Unknown') + ' · ' + (bad ? '<b class="v-bad">' + bad + ' error' + (bad === 1 ? '' : 's') + '</b>' : '0 errors') + ', ' + warn + ' warning' + (warn === 1 ? '' : 's') + '</small></h3>';
    const order = ['error', 'warn', 'info'], list = r.findings.slice().sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
    return head + (bad || warn ? '' : '<p class="ok">No problems found.</p>') + '<ul class="hlist">' + list.map(f => '<li class="' + BADGE[f.level] + '"><span class="mk">' + (f.level === 'error' ? '✖' : f.level === 'warn' ? '⚠' : 'ℹ') + '</span>' + esc(f.msg) + '</li>').join('') + '</ul>';
  }
  $('vFiles').addEventListener('change', async e => {
    const files = [...e.target.files]; e.target.value = ''; let html = '';
    for (const f of files) { let r; try { r = Validate.validate(await f.text(), f.name); } catch (err) { r = { kind: '', findings: [{ level: 'error', msg: 'The checker failed on this file: ' + err.message }] }; } html += renderResult(f.name, r); }
    $('validateWrap').innerHTML = html || '<p class="status">No files chosen.</p>';
  });
  function renderValidate() { if (!$('validateWrap').innerHTML) $('validateWrap').innerHTML = '<p class="status">Choose one or more files to check. Nothing is opened into the app or changed.</p>'; }

  App.tabs.debug = renderDebug; App.tabs.validate = renderValidate;
})();
