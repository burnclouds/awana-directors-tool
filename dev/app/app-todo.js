(this.AwanaVersions = this.AwanaVersions || {})['app-todo.js'] = '1.23.0';
// To do tab: opens when a Planning Center export has been imported. Shows the file check for that export, what the import did,
// and everything that still needs doing (todo.js computes it from the roster, so it stays right as you fix things).
// An item can be ignored (accepted as it is): it is hidden and not counted until you bring it back. Ignored items are kept in the data file (config.todoIgnored), so they stay ignored next week; without a data file they last for the session.
(function () {
  const { C, X } = Model;
  const App = window.App, esc = App.esc, $ = id => document.getElementById(id);
  const ui = { onlyNew: true, showIgnored: false, view: 'person', tdOpen: {} };      // a view choice for this visit only: not stored
  // The ignored list: in the data file when there is one (it travels with the file and is undoable), else just for this session. quiet = do not log yet (used when ignoring a whole list at once).
  const sessionIgnored = new Set(), listOf = () => App.season ? (Array.isArray(App.season.config.todoIgnored) ? App.season.config.todoIgnored : (App.season.config.todoIgnored = [])) : null;
  const ignored = {
    has: k => { const l = listOf(); return l ? l.includes(k) : sessionIgnored.has(k); },
    add: (k, quiet) => { const l = listOf(); if (l) { if (!l.includes(k)) { l.push(k); if (!quiet) App.touch(); } } else sessionIgnored.add(k); },
    delete: k => { const l = listOf(); if (l) { const n = l.indexOf(k); if (n >= 0) { l.splice(n, 1); App.touch(); } } else sessionIgnored.delete(k); },
    clear: () => { const l = listOf(); if (l) { if (l.length) { l.length = 0; App.touch(); } } else sessionIgnored.clear(); },
    get size() { const l = listOf(); return l ? l.length : sessionIgnored.size; },
  };
  // An item is the same item while its text is the same; if the situation changes (more is missing) it comes back.
  const keyOf = (g, i) => g.id + '|' + i.id + '|' + i.text;
  const compute = () => Todo.compute({ master: App.master, season: App.season, calendar: App.calendar, quarter: App.quarterNow(), today: App.today(), newIds: App.lastImport ? App.lastImport.newIds : null });
  const byId = id => App.master.people.find(p => p[X.ID] === id);

  // Rooms to offer when assigning a class: the suggested group's first, then the rest.
  function roomOptions(suggest) {
    const rooms = App.knownRooms().filter(r => r !== 'Volunteers' || suggest === 'Volunteers'), first = rooms.filter(r => Model.groupOf(r) === suggest);
    return '<option value=""></option>' + first.concat(rooms.filter(r => !first.includes(r))).map(r => '<option>' + esc(r) + '</option>').join('');
  }
  // Books available in the season, for the "Set book for all" picker in the handbook group.
  function bookOptions(selectId) {
    if (!App.season) return '';
    const codes = Object.keys(App.season.config.books || {}).sort();
    if (!codes.length) return '';
    const opts = '<option value=""></option>' + codes.map(c => {
      const b = Object.assign({}, (window.Catalog && Catalog.defaultConfig().books[c]) || {}, App.season.config.books[c] || {});
      const label = c + (b.name ? ' \u2013 ' + b.name : '') + (b.group ? ' (' + b.group + ')' : '');
      return '<option value="' + esc(c) + '">' + esc(label) + '</option>';
    }).join('');
    return '<label>Set book for all: <select id="' + esc(selectId) + '" style="max-width:260px">' + opts + '</select></label> ' +
      '<button data-setbook="' + esc(selectId) + '" title="Set the chosen book for every person listed (keeps existing date and note; skips anyone who already has a book)">Set</button>';
  }
  // Inline entry for two kinds of row: a handbook code that is not one of the books (type the right code), and a medical note to read (tick it).
  const bookBox = (id, code) => '<label class="pf"><span class="status">Correct book code</span> <input type="text" size="6" maxlength="5" data-book-fix="' + esc(id) + '" data-book-old="' + esc(code) + '" aria-label="Correct book code"></label> ';
  // A color for a child with none: the list starts on the best choice (what Assign blanks would give), and Set saves the one shown.
  const teamBox = (id, q, best) => '<label class="pf"><span class="status">Color</span> <select data-team-pick aria-label="Color for ' + esc(q) + '">' + (best ? '' : '<option value="">Choose&hellip;</option>') + (App.season ? Season.teamOrder(App.season) : ['Red', 'Blue', 'Yellow', 'Green']).map(c => '<option value="' + esc(c) + '"' + (c === best ? ' selected' : '') + '>' + esc(c) + (c === best ? ' (best choice)' : '') + '</option>').join('') + '</select></label> <button type="button" data-team-set="' + esc(id) + '" data-q="' + esc(q) + '" data-best="' + esc(best) + '">Set</button> ';
  const printBtn = room => '<button type="button" data-med-print="' + esc(room) + '" title="Opens the medical sheet for this class on the Reports tab and marks these notes printed">Open ' + esc(room) + ' sheet</button> ';
  const medBox = id =>'<label class="uov"><input type="checkbox" data-med-read="' + esc(id) + '"> read</label> ';
  const COUNT = { loaded: 'people loaded', updated: 'refreshed', added: 'added', renamed: 'renamed', deactivated: 'marked inactive', reactivated: 'reappeared', resolved: 'pending changes cleared' };
  const LINKS = { teams: ['Open Color teams', 'teams'], uniform: ['Open Uniforms', 'uniforms'], pc: ['Open the Planning Center changes report', 'reports'] };

  // With the "only people this import added" filter on, row-by-row findings about people who were already on the roster are set aside (counted, not listed).
  function importSection(li, onlyNew) {
    const fresh = new Set(App.master.people.filter(p => li.newIds.has(p[X.ID])).map(p => Model.fullName(p).trim())), rowWho = x => { const m = /^row \d+ \((.*?)\): /.exec(x.msg); return m ? m[1].trim() : null; };
    const hidden = onlyNew ? li.findings.filter(x => rowWho(x) !== null && !fresh.has(rowWho(x))) : [];
    const f = li.findings.filter(x => !hidden.includes(x)), n = l => f.filter(x => x.level === l), err = n('error'), warn = n('warn'), info = n('info');
    const counts = Object.keys(li.counts || {}).filter(k => li.counts[k]).map(k => li.counts[k] + ' ' + COUNT[k]).join(' · ');
    const lvl = { error: 'bad', warn: 'warnline', info: 'status' };
    return '<section class="pcard"><h3>Import: ' + esc(li.name) + (li.asOf ? ' <span class="status">(data as of ' + esc(li.asOf) + ')</span>' : '') + '</h3>' +
      (counts ? '<p>' + esc(counts) + '. Remember to download the data file.</p>' : '') +
      (li.kept ? '<p class="status">Kept from the export: ' + li.kept.cols + ' columns' + (li.kept.unused ? ' (' + li.kept.unused + ' not used by the app)' : '') + (li.kept.loose ? ', ' + li.kept.loose + ' row' + (li.kept.loose === 1 ? '' : 's') + ' that belong' + (li.kept.loose === 1 ? 's' : '') + ' to nobody' : '') + (li.kept.blank ? ', ' + li.kept.blank + ' blank row' + (li.kept.blank === 1 ? '' : 's') : '') + '.</p>' : '') +
      '<details' + (err.length ? ' open' : '') + '><summary><b>File check</b>: ' + (err.length ? '<span class="bad">' + err.length + ' error' + (err.length === 1 ? '' : 's') + '</span>, ' : '') + warn.length + ' warning' + (warn.length === 1 ? '' : 's') + '</summary>' +
      '<div class="pscroll">' + (f.length ? f.map(x => '<div class="' + lvl[x.level] + '">' + (x.level === 'error' ? '&#10006; ' : x.level === 'warn' ? '&#9888; ' : '') + esc(x.msg) + '</div>').join('') : '<p class="ok">No problems found in the file.</p>') + '</div></details>' +
      '<p class="status">' + (hidden.length ? hidden.length + ' more warning' + (hidden.length === 1 ? '' : 's') + ' about people already on the roster are hidden (untick the box below to see them). ' : '') + 'The same check is on the Validate tab; it reads the file only and changes nothing.</p></section>';
  }

  // Groups with ignored items taken out (counted in .ignored); the badge counts what is still open for everyone, not just the filtered view.
  const open = groups => groups.map(g => Object.assign({}, g, { items: g.items.filter(i => !ignored.has(keyOf(g, i))), ignored: g.items.filter(i => ignored.has(keyOf(g, i))) })).filter(g => g.items.length || g.ignored.length);
  const openActions = gs => gs.filter(g => g.level === 'action').reduce((n, g) => n + g.items.length, 0);
  // Open items for one person (not ignored), for the Person tab to highlight: [{ group, title, level, text, fields }].
  App.todoFor = id => { const p = compute().people.find(x => x.id === id); return p ? p.items.filter(i => !ignored.has(i.group + '|' + id + '|' + i.text)) : []; };

  // Everything for one person in one card, in class and name order. Same items, same Ignore, same class picker as the by-task view.
  function peopleHtml(res, li, only) {
    const people = res.people.map(pp => Object.assign({}, pp, { open: pp.items.filter(i => !ignored.has(i.group + '|' + pp.id + '|' + i.text)), off: pp.items.filter(i => ignored.has(i.group + '|' + pp.id + '|' + i.text)) }))
      .filter(pp => (!only || li.newIds.has(pp.id)) && (pp.open.length || (ui.showIgnored && pp.off.length)));
    if (!people.length) return '';
    const row = (pp, i, off) => '<tr' + (off ? ' class="off"' : '') + ' data-id="' + esc(pp.id) + '" data-k="' + esc(i.group + '|' + pp.id + '|' + i.text) + '"><td><span class="status">' + (i.level === 'action' ? 'to do' : i.level === 'note' ? 'note' : 'check') + '</span></td><td>' + esc(i.title) + '</td><td class="wrap">' + esc(i.text) + (off ? ' <i>(ignored)</i>' : '') + '</td>' +
      '<td>' + (!off && (i.group === 'class' || i.group === 'classfit') ? '<select data-room>' + roomOptions(i.suggest) + '</select>' : '') +
      (!off && i.recvBook ? '<label class="pf"><span class="status">Date received</span> <input type="date" data-recv-id="' + esc(pp.id) + '" data-recv-book="' + esc(i.recvBook) + '" aria-label="Date received for ' + esc(pp.name || '') + '"></label> <label class="uov"><input type="checkbox" data-recv-nodate="' + esc(pp.id) + '" data-recv-book="' + esc(i.recvBook) + '"> no date</label>' : '') + (!off && i.bookFix !== undefined ? bookBox(pp.id, i.bookFix) : '') + (!off && i.medRead ? medBox(pp.id) : '') + (!off && i.bestColor !== undefined ? teamBox(pp.id, /Q[1-4]/.exec(i.title)[0], i.bestColor) : '') + (!off && i.printRoom ? printBtn(i.printRoom) : '') + '</td><td>' + (!off && i.group === 'teams' && /Q[1-4]/.test(i.title) ? '<button data-noteam="' + /Q[1-4]/.exec(i.title)[0] + '" title="This child joined after the quarter began and is deliberately on no team: no color, no game points, and no effect on the team sizes or who plays with whom">No team</button> ' : '') + '<button ' + (off ? 'data-unign="1">Bring back' : 'data-ign="1" title="Accept as it is and hide it (kept in the data file)">Ignore') + '</button></td></tr>';
    const card = pp => {
      const n = pp.open.filter(i => i.level === 'action').length, nn = pp.open.filter(i => i.level === 'note').length, c = pp.open.length - n - nn;
      return '<section class="pcard todocard"><h3><a href="#" data-person="' + esc(pp.id) + '">' + esc(pp.name) + '</a> <span class="status">' + esc(pp.room) + ' &middot; ' + [n ? n + ' to do' : '', c ? c + ' to check' : '', nn ? (nn === 1 ? '1 note' : nn + ' notes') + ' †' : ''].filter(Boolean).join(', ') + (!n && !c && !nn ? 'all ignored' : '') + '</span> ' +
        '</h3>' +
        '<table class="roster"><tbody>' + pp.open.map(i => row(pp, i, false)).join('') + (ui.showIgnored ? pp.off.map(i => row(pp, i, true)).join('') : '') + '</tbody></table></section>';
    };
    /* UX-23: the cards sit under one collapsible line per class ("Sparks A (6)"); a class with something to do starts open, a class with only things to check starts closed. Kept while the page is open. */
    const rooms = []; people.forEach(pp => { if (!rooms.includes(pp.room)) rooms.push(pp.room); });
    if (rooms.length < 2) return people.map(card).join('');
    return rooms.map(room => { const ps = people.filter(pp => pp.room === room), key = 'person|' + room, open = key in ui.tdOpen ? ui.tdOpen[key] : ps.some(pp => pp.open.some(i => i.level === 'action'));
      return '<details class="tdclass" data-tdkey="' + esc(key) + '"' + (open ? ' open' : '') + '><summary>' + esc(room || 'No class') + ' (' + ps.length + ')</summary>' + ps.map(card).join('') + '</details>'; }).join('');
  }
  // The number on the To do tab: the open actions only. Awards are not on this page: the Awards tab lists them and its badge counts them (to announce or hand out, ignored and given ones left out). Worked out the same way wherever it is refreshed.
  // The number says in words what it counts (hover title and screen-reader label): each "to do" card and its count, and that "to check" items and awards are not in it.
  const badgeWords = groups => {
    const acts = groups.filter(g => g.level === 'action' && g.items.length), n = acts.reduce((s, g) => s + g.items.length, 0), checks = groups.filter(g => g.level === 'check').reduce((s, g) => s + g.items.length, 0);
    return n ? n + ' to do: ' + acts.map(g => g.title + ' ' + g.items.length).join(', ') + '.' + (checks ? ' ' + checks + ' to check ' + (checks === 1 ? 'is' : 'are') + ' not counted.' : '') + ' Awards are not counted here; the Awards tab has its own number.' : '';
  };
  const setBadge = (groups) => { const tb = $('todoBadge'), words = badgeWords(groups); tb.textContent = openActions(groups) || ''; if (words) { tb.title = words; tb.setAttribute('aria-label', words); tb.setAttribute('role', 'img'); } else { tb.removeAttribute('title'); tb.removeAttribute('aria-label'); tb.removeAttribute('role'); } $('awardsBadge').textContent = (App.awardsToAnnounce && App.awardsToAnnounce()) || ''; $('awardsGiveBadge').textContent = (App.awardsToGive && App.awardsToGive().length) || ''; };      // N22: two numbers on the Awards tab: to announce (the first) and to hand out (the second)
  // Awards are worked out from the record (a block finished on Progress, a Blue Jewel reached by attendance), so any edit of the season can earn one: the badge is brought up to date after every edit.
  let badgeTimer = 0;
  App.updateTodoBadge = () => { clearTimeout(badgeTimer); badgeTimer = setTimeout(() => { if (App.master && $('tab-todo').hidden) setBadge(open(compute().groups)); }, 120); };
  // UX-23: inside a group the rows sit under one collapsible line per class ("Sparks A (6)"). To do groups start open, to check and note groups start closed; what you open or close is kept while the page is open (not in the file).
  // A group whose items are all in one class (or that has few) is a plain table, with no extra lines.
  function classTables(g, rowFix, rowOf, ignRowOf) {
    const head = '<table class="roster"><thead><tr><th>Name</th><th>Class</th><th>What</th>' + (rowFix ? '<th>Assign class</th>' : '') + '<th></th></tr></thead><tbody>';
    const classes = []; g.items.concat(ui.showIgnored ? g.ignored : []).forEach(i => { if (!classes.includes(i.room)) classes.push(i.room); });
    if (classes.length < 2 && g.items.length + g.ignored.length <= 6) return head + g.items.map(rowOf).join('') + (ui.showIgnored ? g.ignored.map(ignRowOf).join('') : '') + '</tbody></table>';
    return classes.map(room => {
      const its = g.items.filter(i => i.room === room), offs = ui.showIgnored ? g.ignored.filter(i => i.room === room) : [], key = g.id + '|' + room, open = key in ui.tdOpen ? ui.tdOpen[key] : g.level === 'action';
      return '<details class="tdclass" data-tdkey="' + esc(key) + '"' + (open ? ' open' : '') + '><summary>' + esc(room || 'No class') + ' (' + (its.length + offs.length) + ')</summary>' + head + its.map(rowOf).join('') + offs.map(ignRowOf).join('') + '</tbody></table></details>';
    }).join('');
  }
  function render() {
    const el = $('todoWrap');
    if (!App.master) { el.innerHTML = '<p class="status">Load a roster first (Import&hellip;).</p>'; $('todoBadge').textContent = ''; return; }
    if (!ignored.size) ui.showIgnored = false;       // nothing ignored: the "show ignored" box is gone, so it must not stay on
    const li = App.lastImport, res = compute(), only = ui.onlyNew && li && li.newIds.size, all = open(res.groups);
    const keep = x => !only ? x : x.filter(i => li.newIds.has(i.id));
    const view = all.map(g => Object.assign({}, g, { items: keep(g.items), ignored: keep(g.ignored) })).filter(g => g.items.length || g.ignored.length);
    const shown = view.filter(g => g.items.length || ui.showIgnored), total = view.filter(g => g.level !== 'note').reduce((n, g) => n + g.items.length, 0), notes = view.filter(g => g.level === 'note').reduce((n, g) => n + g.items.length, 0), actions = openActions(view), nIgnored = view.reduce((n, g) => n + g.ignored.length, 0);
    setBadge(all);
    let tonight = ''; const tn = App.tonight && App.tonight();
    if (tn) { const dt = new Date(tn.date + 'T12:00:00'), lab = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getDay()] + ' ' + (dt.getMonth() + 1) + '/' + dt.getDate(), go = (k, t) => ' <button type="button" data-tonight="' + k + '">' + t + '</button>';
      tonight = '<section class="tonightstrip" aria-label="Tonight, ' + esc(lab) + '"><b>' + esc(lab) + ':</b> classes entered ' + tn.roomsEntered + ' of ' + tn.rooms + go('attend', 'Go') + ' &middot; games entered ' + tn.gamesEntered + ' of ' + tn.games + go('games', 'Go') + ' &middot; awards to announce ' + tn.toAnnounce + go('awards', 'Go') + ' <span class="status">(not counted in the To do number)</span></section>'; }
    let h = tonight + App.staleCalendarHtml() + (li ? importSection(li, only) : '<p class="status">No export imported yet this session. This page lists everything that still needs doing for the people in the roster.</p>');
    h += '<p>' + (total ? '<b>' + actions + ' to do, ' + (total - actions) + ' to check</b>' : '<span class="ok">Nothing left to do.</span>') + (notes ? ' <span class="status">&middot; ' + notes + (notes === 1 ? ' note' : ' notes') + ' † (not counted)</span>' : '') +
      (li && li.newIds.size ? ' &nbsp; <label><input type="checkbox" id="tdOnlyNew"' + (ui.onlyNew ? ' checked' : '') + '> only the ' + li.newIds.size + ' people this import added</label>' : '') +
      (ignored.size ? ' &nbsp; <label><input type="checkbox" id="tdShowIgn"' + (ui.showIgnored ? ' checked' : '') + '> show the ' + ignored.size + ' ignored</label> <button id="tdBack">Bring all back</button>' : '') + '</p>' +
      '<p class="status">Ignore accepts an item as it is and hides it; it is kept in the data file, so it stays ignored until you bring it back or the item changes.</p>';
    // Volunteer absences (S11): the next two club nights from the club calendar, each with that night's absences. Entering an absence is the acknowledgement, and absences do not count toward the To do total.
    if (App.season && App.absenceList) {
      const nightsAhead = (App.absenceClubDates ? App.absenceClubDates() : []).filter(d => d >= App.today()).slice(0, 2), rows = App.absenceList();
      const nameOf = pid => { const p = App.master.people.find(x => x[X.ID] === pid); return p ? Model.fullName(p) + (Model.isVolunteer(p) && Model.isActive(p) ? '' : ' (not on the volunteer list)') : pid + ' (not on the roster)'; };
      h += '<section class="pcard absencecard"><h3>Volunteer absences <span class="status">' + (nightsAhead.length ? 'the next club nights on the calendar' : 'no club nights ahead on the calendar') + '</span></h3>' +
        (nightsAhead.length ? nightsAhead.map(d => { const list = rows.filter(r => r.date === d); return '<h4>' + esc(Model.md ? Model.md(d) : d) + '</h4>' + (list.length ? '<table class="roster"><thead><tr><th>Volunteer</th><th>Reason</th><th></th></tr></thead><tbody>' + list.map(r => '<tr><td><a href="#" data-person="' + esc(r.personId) + '">' + esc(nameOf(r.personId)) + '</a></td><td>' + esc(r.reason) + '</td><td><button type="button" data-absnight="1" data-pid="' + esc(r.personId) + '" data-aid="' + esc(r.absId) + '" data-date="' + esc(r.date) + '">Clear this night</button></td></tr>').join('') + '</tbody></table>' : '<p class="status">No absences.</p>'); }).join('') : '') + '</section>';
    }
    // N19: a note or flag can be hidden from this card (it stays on the child's sheet, in the popups and in History). The card's number counts the ones not hidden. "Show hidden" is remembered in the file (config.showHiddenNotes, like the Bug button: a setting every leader shares); it only applies while something is hidden, so an empty list leaves the stored choice alone.
    const hn = App.season && App.flagWhere ? Season.todoNotes(App.season) : { open: [], hidden: [] }, showHid = !!(App.season && App.season.config.showHiddenNotes === true) && hn.hidden.length > 0, flagRows = hn.open.concat(showHid ? hn.hidden : []);      // notes and flags only: bug reports live on the Debug tab and never count here      // Notes and flags: places pinned for later review (set on the Progress sheet); Clear removes one
    // Notes and flags card: always there when a data file is open, because it is also where a general note (about nothing in particular) is typed.
    if (App.season && App.flagWhere) h += '<section class="pcard flagcard"><h3>Notes and flags (' + hn.open.length + ') <span class="status">to review</span></h3><p class="status">Type a general note here, or press <b>&#9873; Flag</b> in the top bar and click anything on any tab. <b>Go</b> opens the sheet at that place; <b>Clear</b> removes a note or flag when you are done with it.</p>' +
      (hn.hidden.length ? '<p class="status"><label><input type="checkbox" id="tdShowHidNotes"' + (showHid ? ' checked' : '') + '> Show hidden (' + hn.hidden.length + ')</label> <span class="status">hidden notes stay on the child\'s sheet and in History</span></p>' : '') +
      '<p class="noteadd"><input type="text" id="tdNoteText" size="60" maxlength="500" placeholder="Add a note (for example: ask the leaders about Rank sign-offs)" aria-label="New note"> <button type="button" id="tdNoteAdd" class="primary">Add note</button></p>' +
      (flagRows.length ? '<table class="roster"><thead><tr><th>Child</th><th>Where</th><th>Note</th><th>Added</th><th></th></tr></thead><tbody>' + flagRows.map(f => { const p = f.kid ? App.master.people.find(x => x[Model.X.ID] === f.kid) : null;
        const hid = Season.isFlagHidden(f);
        return '<tr data-flag="' + esc(f.id) + '"' + (hid ? ' class="off"' : '') + '><td>' + (f.kid ? esc(p ? Model.fullName(p) : f.kid) : '<span class="status">&mdash;</span>') + '</td><td>' + esc(App.flagWhere(f)) + (App.flagMissing && App.flagMissing.has(f.id) ? ' <span class="status">(spot not found)</span>' : '') + '</td><td class="wrap">' + '<span class="notetext">' + esc(f.note) + '</span>' + (f.replies ? Season.bugThread(f).map(r => '<div class="bugreply"><span class="bugtext">' + esc(r.text) + '</span> <span class="status">' + (r.by === 'developer' ? 'Developer' : 'Leader') + ', ' + esc(r.at) + '</span>' + (r.id === 'legacy' ? '' : ' <button type="button" class="linklike" data-editreply="' + esc(f.id) + '" data-rid="' + esc(r.id) + '">Edit</button> <button type="button" class="linklike" data-rmreply="' + esc(f.id) + '" data-rid="' + esc(r.id) + '">Remove</button>') + '</div>').join('') : '') + (hid ? ' <span class="status">(hidden)</span>' : '') + '</td><td class="status">' + esc(f.at) + '</td><td>' + (f.level !== 'general' ? '<button type="button" data-goflag="' + esc(f.id) + '">Go</button> ' : '') + '<button type="button" data-editnote="' + esc(f.id) + '">Edit</button> <button type="button" data-replyflag="' + esc(f.id) + '">Reply</button> ' + '<button type="button" data-hideflag="' + esc(f.id) + '" data-on="' + (hid ? '' : '1') + '" title="' + (hid ? 'Show this note in the list again' : 'Hide this note from the list. It stays on the child\'s sheet and in History.') + '">' + (hid ? 'Unhide' : 'Hide') + '</button> <button type="button" data-clearflag2="' + esc(f.id) + '">Clear</button></td></tr>'; }).join('') + '</tbody></table>' : hn.hidden.length ? '<p class="status">Nothing to review. ' + hn.hidden.length + ' hidden.</p>' : '<p class="status">No notes yet.</p>') + '</section>';
    h += '<p>Group by: <label class="tdview"><input type="radio" name="tdView" value="person"' + (ui.view === 'person' ? ' checked' : '') + '> person</label> &nbsp; <label class="tdview"><input type="radio" name="tdView" value="task"' + (ui.view === 'task' ? ' checked' : '') + '> task</label> <span class="status">(person: everything for one child in one place; task: one list per kind of job, with the bulk buttons)</span></p>';
    if (ui.view === 'person') { el.innerHTML = h + (peopleHtml(res, li, only) || '<p class="ok">Nothing left to do.</p>'); return; }
    h += shown.map(g => {
      const link = LINKS[g.id], rowFix = g.id === 'class' || g.id === 'classfit';
      const bookBulk = g.id === 'handbook' && g.items.length > 1 ? ' ' + bookOptions('tdBookPick') : '';
      return '<section class="pcard"><h3>' + esc(g.title) + ' (' + g.items.length + ') <span class="status">' + (g.level === 'action' ? 'to do' : g.level === 'note' ? 'note' : 'to check') + '</span></h3><p class="status">' + esc(g.hint) +
        (link ? ' <button data-go="' + link[1] + '"' + (g.id === 'pc' ? ' data-report="pcChanges"' : '') + '>' + link[0] + '</button>' : '') + (g.items.length > 1 ? ' <button data-ignall="' + esc(g.id) + '" title="Accept everything listed here as it is">Ignore all ' + g.items.length + '</button>' : '') + bookBulk + '</p>' +
        classTables(g, rowFix, i => '<tr data-id="' + esc(i.id) + '" data-k="' + esc(keyOf(g, i)) + '"><td><a href="#" data-person="' + esc(i.id) + '">' + esc(i.name) + '</a></td><td>' + esc(i.room) + '</td><td class="wrap">' + esc(i.text) + '</td>' +
          (rowFix ? '<td><select data-room>' + roomOptions(i.suggest) + '</select></td>' : '') + '<td>' + (i.recvBook ? '<label class="pf"><span class="status">Date received</span> <input type="date" data-recv-id="' + esc(i.id) + '" data-recv-book="' + esc(i.recvBook) + '" aria-label="Date received for ' + esc(i.name || '') + '"></label> <label class="uov"><input type="checkbox" data-recv-nodate="' + esc(i.id) + '" data-recv-book="' + esc(i.recvBook) + '"> no date</label> ' : '') + (i.bookFix !== undefined ? bookBox(i.id, i.bookFix) : '') + (i.medRead ? medBox(i.id) : '') + (i.bestColor !== undefined ? teamBox(i.id, /Q[1-4]/.exec(g.title)[0], i.bestColor) : '') + (i.printRoom ? printBtn(i.printRoom) : '') + (g.id === 'teams' && /Q[1-4]/.test(g.title) ? '<button data-noteam="' + /Q[1-4]/.exec(g.title)[0] + '" title="This child joined after the quarter began and is deliberately on no team: no color, no game points, and no effect on the team sizes or who plays with whom">No team</button> ' : '') + '<button data-ign="1" title="Accept as it is and hide it (kept in the data file)">Ignore</button></td></tr>', i => '<tr class="off" data-id="' + esc(i.id) + '" data-k="' + esc(keyOf(g, i)) + '"><td><a href="#" data-person="' + esc(i.id) + '">' + esc(i.name) + '</a></td><td>' + esc(i.room) + '</td><td class="wrap">' + esc(i.text) + ' <i>(ignored)</i></td>' + (rowFix ? '<td></td>' : '') + '<td><button data-unign="1">Bring back</button></td></tr>') + '</section>';
    }).join('');
    el.innerHTML = h;
  }

  $('todoWrap').addEventListener('toggle', e => { const d = e.target; if (d && d.classList && d.classList.contains('tdclass')) ui.tdOpen[d.dataset.tdkey] = d.open; }, true);      /* toggle does not bubble, so it is caught on the way down */
  $('todoWrap').addEventListener('change', e => {
    if (e.target.id === 'tdShowHidNotes') { if (App.season) { if (e.target.checked) App.season.config.showHiddenNotes = true; else delete App.season.config.showHiddenNotes; App.commitScope(() => App.changed()); } render(); return; }
    const t = e.target;
    // A corrected handbook code: kept only if it is one of the books; otherwise the reason is shown and the typed text stays in the box.
    if (t.dataset && t.dataset.bookFix !== undefined) {
      const id = t.dataset.bookFix, code = (t.value || '').trim(), books = App.season ? App.season.config.books || {} : {};
      if (!App.season || !code) return;
      const key = Catalog.bookKeyOf(books, code);
      if (!key) { App.flash('"' + code + '" is not one of your books. Add it on the Options tab, or correct the code.', 'error'); return; }
      const cur = Season.handbookParts(App.season.handbooks[id]);
      Season.setHandbook(App.season, id, { code: key, date: cur.date, note: cur.note });
      App.touch(); render(); return;
    }
    // "read" on a medical note: stores the text that was read, so the row returns only if the note changes.
    if (t.dataset && t.dataset.medRead !== undefined) {
      const id = t.dataset.medRead, p = byId(id);
      if (!App.season) { App.flash('Open a data file first (the read tick is saved in it).', 'error'); t.checked = false; return; }
      const cfg = App.season.config; cfg.medRead = cfg.medRead || {};
      if (t.checked && p) cfg.medRead[id] = Model.medicalText(p); else delete cfg.medRead[id];
      App.touch(); render(); return;
    }
    // A date received (or no date) typed on the To do page: saved the same way as on Progress, then the list is worked out again.
    if (t.dataset && (t.dataset.recvId !== undefined || t.dataset.recvNodate !== undefined)) {
      const isNoDate = t.dataset.recvNodate !== undefined, id = isNoDate ? t.dataset.recvNodate : t.dataset.recvId, book = t.dataset.recvBook;
      try { Season.setReceived(App.season, id, book, isNoDate ? '' : t.value, isNoDate ? { noDate: t.checked } : undefined); } catch (err) { App.ask.alert(err.message); t.value = ''; t.checked = false; }
      App.touch(); render(); return;
    }
    if (t.name === 'tdView') { ui.view = t.value; render(); return; }
    if (t.id === 'tdOnlyNew') { ui.onlyNew = t.checked; render(); return; }
    if (t.id === 'tdShowIgn') { ui.showIgnored = t.checked; render(); return; }
    if (t.matches('select[data-room]') && t.value) {
      const p = byId(t.closest('tr').dataset.id); if (!p) return;
      Model.setField(p, C.ROOM, t.value); App.touch(); App.refresh();
    }
  });
  $('todoWrap').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'tdNoteText') { e.preventDefault(); $('tdNoteAdd').click(); } });      // Enter adds the note
  $('todoWrap').addEventListener('click', e => {
    const a = e.target.closest('a[data-person]');
    if (a) { e.preventDefault(); App.showPerson(a.dataset.person, { attention: true }); return; }
    const po = e.target.closest('button[data-person-open]'); if (po) { App.showPerson(po.dataset.personOpen, { attention: true }); return; }
    if (e.target.id === 'tdNoteAdd') { const box = $('tdNoteText'); try { App.addNote(box.value); } catch (err) { App.flash(err.message, 'error'); return; } render(); const again = $('tdNoteText'); if (again) again.focus(); return; }
    const gf = e.target.closest('button[data-goflag]'); if (gf) { App.goFlag(gf.dataset.goflag); return; }
    const hfl = e.target.closest('button[data-hideflag]'); if (hfl) { App.hideFlag(hfl.dataset.hideflag, !!hfl.dataset.on); render(); return; }
    const cfl = e.target.closest('button[data-clearflag2]'); if (cfl) { App.clearFlag(cfl.dataset.clearflag2); render(); return; }
    const can = e.target.closest('button[data-absnight]'); if (can) { App.clearAbsenceNights(can.dataset.pid, can.dataset.aid, [can.dataset.date]); render(); return; }
    // Edit a general note in place: its text becomes a box with Save and Cancel. Saving keeps the note's date and place.
    const en = e.target.closest('button[data-editnote]');
    if (en) {      // N49: the box holds the note's own text (from the data, with its line breaks), never the replies shown beside it; the replies stay on screen and keep their own Edit and Remove
      const id = en.dataset.editnote, f = ((App.season || {}).flags || {})[id], td = en.closest('tr').querySelector('td.wrap'), span = td && td.querySelector('.notetext'); if (!f || !span) return;
      span.outerHTML = '<div class="noteeditor"><textarea rows="' + Math.max(5, Math.min(12, String(f.note).split('\n').length + 2)) + '" style="display:block;width:100%;box-sizing:border-box" data-noteedit="' + esc(id) + '" aria-label="Edit note">' + esc(f.note) + '</textarea><div class="editbtns"><button type="button" class="primary" data-notesave="' + esc(id) + '">Save</button> <button type="button" data-notecancel="1">Cancel</button></div></div>'; td.querySelector('textarea').focus(); return; }
    const ns = e.target.closest('button[data-notesave]');
    if (ns) { const ta = ns.closest('.noteeditor').querySelector('textarea'); try { App.setFlagNote(ns.dataset.notesave, ta.value); } catch (err) { App.flash(err.message, 'error'); return; } render(); return; }
    if (e.target.closest('button[data-notecancel]')) { render(); return; }
    // N44: a reply on any note. Reply opens a box under the note; Save reply adds it as the leader (History, Undo works).
    const rp = e.target.closest('button[data-replyflag]');
    if (rp) { const tr = rp.closest('tr'); if (!(tr.nextElementSibling && tr.nextElementSibling.classList.contains('replyrow'))) tr.insertAdjacentHTML('afterend', '<tr class="replyrow"><td colspan="5" style="white-space:normal"><textarea rows="3" data-replytext aria-label="Your reply" style="display:block;width:100%;box-sizing:border-box"></textarea><div class="editbtns"><button type="button" class="primary" data-replysave="' + esc(rp.dataset.replyflag) + '">Save reply</button> <button type="button" data-replycancel="1">Cancel</button></div></td></tr>'); const ta = tr.nextElementSibling && tr.nextElementSibling.querySelector('textarea'); if (ta) ta.focus(); return; }
    const rsv = e.target.closest('button[data-replysave]');
    if (rsv) { const ta = rsv.closest('td').querySelector('textarea'); try { App.addFlagReply(rsv.dataset.replysave, ta.value, 'leader'); } catch (err) { App.flash(err.message, 'error'); return; } render(); return; }
    if (e.target.closest('button[data-replycancel]')) { e.target.closest('tr').remove(); return; }
    // N49: each reply is its own message: Edit changes only that reply (the box holds only its text), Remove takes only that one (History and Undo work).
    const er = e.target.closest('button[data-editreply]');
    if (er) { const f = ((App.season || {}).flags || {})[er.dataset.editreply], r = f && f.replies && f.replies[er.dataset.rid], box = er.closest('.bugreply'); if (!r || !box) return; box.innerHTML = '<textarea rows="4" data-replyedit aria-label="Edit reply" style="display:block;width:100%;box-sizing:border-box">' + esc(r.text) + '</textarea><div class="editbtns"><button type="button" class="primary" data-replyeditsave="' + esc(er.dataset.editreply) + '" data-rid="' + esc(er.dataset.rid) + '">Save</button> <button type="button" data-replyeditcancel="1">Cancel</button></div>'; box.querySelector('textarea').focus(); return; }
    const res = e.target.closest('button[data-replyeditsave]');
    if (res) { const ta = res.closest('.bugreply').querySelector('textarea'); try { App.setFlagReply(res.dataset.replyeditsave, res.dataset.rid, ta.value); } catch (err) { App.flash(err.message, 'error'); return; } render(); return; }
    if (e.target.closest('button[data-replyeditcancel]')) { render(); return; }
    const rmr = e.target.closest('button[data-rmreply]');
    if (rmr) { try { App.removeFlagReply(rmr.dataset.rmreply, rmr.dataset.rid); } catch (err) { App.flash(err.message, 'error'); return; } render(); App.done('Reply removed. Undo takes it back.'); return; }
    const tg = e.target.closest('button[data-tonight]'); if (tg) { App.tonightGo(tg.dataset.tonight); return; }
    const b = e.target.closest('button[data-go]');
    if (b) { if (b.dataset.report) App.showReport(b.dataset.report); else App.showTab(b.dataset.go); return; }
    // Set the color shown on the row (the best choice unless it was changed). A color that is the best choice is recorded as the plan's projection, as Assign blanks does; another is a hand-set color.
    const ts = e.target.closest('button[data-team-set]');
    if (ts) {
      const p = byId(ts.dataset.teamSet), pick = ts.closest('tr').querySelector('select[data-team-pick]'), color = pick && pick.value, q = ts.dataset.q;
      if (!p || !color) { App.flash('Pick a color first.', 'error'); return; }
      if (color !== ts.dataset.best && App.checkTeamPick) App.checkTeamPick(p, q, color);      // the best choice is the plan's own; a different one is a hand pick and is checked (A8)
      Model.setTeamChoice(App.master, p, q, color);
      if (App.season && color === ts.dataset.best && TeamPlan.stateOf(App.season, App.calendar, q, App.today()) !== 'locked') TeamPlan.setProjected(App.season, p[X.ID], q, color);
      App.touch(); App.refresh(); render(); return;
    }
    // "Open sheet": the class's medical sheet on the Reports tab, and the notes listed for that class are marked printed (the text is kept so a later change brings the item back).
    const mp = e.target.closest('button[data-med-print]');
    if (mp && App.season) {
      const room = mp.dataset.medPrint, g = compute().groups.find(x => x.id === 'medprint'), cfg = App.season.config; cfg.medPrinted = cfg.medPrinted || {};
      ((g && g.items) || []).filter(i => i.printRoom === room).forEach(i => { const p = byId(i.id); if (p) cfg.medPrinted[i.id] = Model.medicalText(p); });
      App.touch(); App.showReport('binderClass'); if (App.reportOptions) App.reportOptions({ room }); return;
    }
    const nt = e.target.closest('button[data-noteam]'); if (nt) { const p = byId(nt.closest('tr').dataset.id); if (p) { Model.setTeamChoice(App.master, p, nt.dataset.noteam, Model.NO_TEAM); App.touch(); App.refresh(); render(); } return; }      // "No team" for the quarter: the child leaves this list
    const ig = e.target.closest('button[data-ign]'); if (ig) { ignored.add(ig.closest('tr').dataset.k); render(); return; }
    const un = e.target.closest('button[data-unign]'); if (un) { ignored.delete(un.closest('tr').dataset.k); render(); return; }
    const all = e.target.closest('button[data-ignall]');
    if (all) { const rows = el_rows(all.closest('section')); rows.forEach(k => ignored.add(k, true)); if (rows.length && App.season) App.touch(); render(); return; }
    const sb = e.target.closest('button[data-setbook]');
    if (sb) {
      const sel = document.getElementById(sb.dataset.setbook);
      const code = sel && sel.value;
      if (!code) { App.ask.alert('Pick a book first.'); return; }
      const rows = [...sb.closest('section').querySelectorAll('tbody tr:not(.off)')].map(tr => tr.dataset.id);      // the person id comes from the row's own attribute: the stored key is "group|id|text", and a name with | would break a split (CR-11)
      let changed = 0;
      rows.forEach(id => {
        const p = byId(id); if (!p) return;
        const cur = Season.handbookParts(App.season.handbooks[id]);
        if (cur.code) return;      // already has a book — skip
        try { Season.setHandbook(App.season, id, { code, date: cur.date, note: cur.note }); changed++; } catch (err) { /* ignore invalid code warnings */ }
      });
      if (changed) { App.touch(); App.refresh(); }
      else { App.ask.alert('No one without a book in this list (or no valid book chosen).'); }
      return;
    }
    if (e.target.id === 'tdBack') { ignored.clear(); render(); }
  });

  // the open rows listed under one heading (rows already ignored are marked off)
  const el_rows = section => [...section.querySelectorAll('tbody tr:not(.off)')].map(tr => tr.dataset.k);

  App.tabs.todo = render;
  App.onRefresh.push(() => { if ($('tab-todo').hidden) { if (App.master) setBadge(open(compute().groups)); } else render(); });
})();
