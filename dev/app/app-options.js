(this.AwanaVersions = this.AwanaVersions || {})['app-options.js'] = '1.20.0';
// Options tab: the list of books, the club settings in one place (including the team color order, this year's T&T book, game points, the store settings and the Drive folders), and the data checks. Changes to the books are held as a draft like the other record-editing tabs (Apply changes / Discard).
// The club settings here are the same settings as on the Reports and Calendar tabs (this tab changes those controls), so nothing is stored twice.
(function () {
  const App = window.App, esc = App.esc, $ = id => document.getElementById(id);
  const COLORS = ['Red', 'Green', 'Blue', 'Yellow', 'Orange', 'Purple', 'Gray'];
  const msg = { text: '', level: '' };      // the last message from an edit (shown above the books table)
  const books = () => (App.season && App.season.config.books) || {};
  const usedBy = code => !App.season ? 0 : Object.keys(App.season.handbooks || {}).filter(id => Check.bookKey((/^\s*([A-Za-z]{2,5})/.exec(App.season.handbooks[id]) || [])[1] || '', books()) === code).length;
  const say = (text, level) => { msg.text = text; msg.level = level || 'error'; render(); };
  const smsg = { text: '', level: '' };     // the last message from an edit of the club settings (shown above them)
  const saySet = (text, level) => { smsg.text = text; smsg.level = level || 'error'; render(); };

  // "This year": one book per group for Cubbies and T&T, who all use the same book together, and for Sparks when the club uses the All Together method. Otherwise Sparks go through HG, WR, SS in turn and no single book is theirs.
  const yearCell = (c, g) => !Season.usesYearBook(App.season, g) ? '<span class="status" title="' + (g === 'Sparks' ? 'Sparks work through their books in turn (change this in Club settings below)' : 'No default for this group') + '">&mdash;</span>' :
    '<input type="checkbox" data-yb="' + esc(c) + '"' + (Season.yearBook(App.season, g) === c ? ' checked' : '') + ' aria-label="' + esc(c) + ' is this year\'s ' + esc(g) + ' book" title="This year\'s ' + esc(g) + ' book: offered to a ' + esc(g) + ' child with no handbook yet">';
  function booksHtml() {
    if (!App.season) return '<p class="status">Open or start a data file first: the list of books is kept in it.</p>';
    const b = books(), codes = Object.keys(b).sort((x, y) => (b[x].group || '').localeCompare(b[y].group || '') || x.localeCompare(y));
    const problems = Check.bookList(b), bad = new Set(problems.map(p => p.code)), std = Catalog.defaultConfig().books, groupOf = c => b[c].group || (std[c] || {}).group;      // an older file's book list may lack the group or the spelling: the standard list fills in what is shown
    return '<p class="status">These are the books the app recognizes. A handbook code typed anywhere (Person, Progress, a CSV merge) is matched on its code, in any capitals (AOG finds AoG); a code that is not here is listed on the To do tab as <i>Unrecognized book</i> for you to fix by hand. ' +
      '<b>This year</b> marks the one book Cubbies, or T&amp;T, are all working in: a child in that group with no handbook on file is offered it in the Handbook box (on the Person tab and its Progress sheet), with a one-tap button; nothing is saved until it is pressed. Sparks have one too only if the club uses the All Together method (see Club settings below); by default they work through HG, WR and SS in turn. Pick again each new year. ' +
      'Press <b>Apply changes</b> (under the tabs) to keep your edits.</p>' + (msg.text ? '<p class="' + (msg.level === 'error' ? 'bad' : 'status') + '" role="alert">' + esc(msg.text) + '</p>' : '') +
      '<table class="roster books"><thead><tr><th>Code</th><th>Name</th><th>Emblem color</th><th>Group</th><th title="The book a group is all working in this year: Cubbies and T&amp;T always, Sparks only with the All Together method (Club settings below).">This year</th><th>Children</th><th></th></tr></thead><tbody>' +
      codes.map(c => '<tr data-code="' + esc(c) + '"' + (bad.has(c) ? ' class="invalidrow"' : '') + '><td><input type="text" data-bf="code" value="' + esc(c) + '" size="4" maxlength="3" aria-label="Book code" title="2 or 3 letters, written exactly like this in handbook records (for example HG or AoG)"></td>' +
        '<td><input type="text" data-bf="name" value="' + esc(b[c].name || '') + '" size="22" aria-label="Book name for ' + esc(c) + '"></td>' +
        '<td><input type="text" data-bf="emblem" list="bookColors" value="' + esc(b[c].emblem || '') + '" size="8" aria-label="Emblem color for ' + esc(c) + '"></td>' +
        '<td><select data-bf="group" aria-label="Group for ' + esc(c) + '">' + Check.BOOK_GROUPS.map(g => '<option' + (groupOf(c) === g ? ' selected' : '') + '>' + g + '</option>').join('') + (groupOf(c) && !Check.BOOK_GROUPS.includes(groupOf(c)) ? '<option selected>' + esc(groupOf(c)) + '</option>' : '') + '</select></td>' +
        '<td class="yb">' + yearCell(c, groupOf(c)) + '</td>' +
        '<td class="num">' + (usedBy(c) || '') + '</td><td><button type="button" data-bdel="' + esc(c) + '" aria-label="Delete the book ' + esc(c) + '">Delete</button></td></tr>').join('') + '</tbody></table>' +
      '<datalist id="bookColors">' + COLORS.map(c => '<option value="' + c + '">').join('') + '</datalist>' +
      tidyHtml() + '<p><button type="button" id="optBookAdd">Add a book</button> <button type="button" id="optBookReset" title="Put the standard list back (Hangglider, Wingrunner, SkyStormer, HoneyComb, Agents of Grace)">Reset to the standard books</button></p>';
  }
  // Records whose code is a longer spelling of a book's code (AOG for AO): offered as one tidy-up, never done on its own.
  function tidyHtml() {
    const list = App.season ? Season.tidyHandbookCodes(App.season, false) : []; if (!list.length) return '';
    const kinds = {}; list.forEach(x => { const k = x.from + ' \u2192 ' + x.to; kinds[k] = (kinds[k] || 0) + 1; });
    return '<p class="status"><b>' + list.length + ' handbook record' + (list.length === 1 ? ' uses' : 's use') + ' a longer spelling of a book code</b> (' + Object.keys(kinds).map(k => esc(k) + ' \u00d7 ' + kinds[k]).join(', ') + '). <button type="button" id="optTidy">Tidy these codes</button> <span>The date and note are kept.</span></p>';
  }
  function settingsHtml() {
    const q = App.settings.quarter || 'Q1', day = App.season ? (+App.season.config.clubDay || 0) : 3, localStyle = App.season ? App.season.config.saveStyleLocal : 'single';
    return '<div class="pgrid"><label class="pf"><span>Quarter (for reports and sheets)</span><select id="optQuarter">' + ['Q1', 'Q2', 'Q3', 'Q4'].map(x => '<option' + (x === q ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></label>' +
      '<label class="pf"><span>Club title</span><input type="text" id="optClub" value="' + esc(App.settings.club || '') + '"></label>' +
      '<label class="pf"><span>Club night</span><select id="optDay"' + (App.season ? '' : ' disabled') + '>' + Calendar.DAYS.map((d, i) => '<option value="' + i + '"' + (i === day ? ' selected' : '') + '>' + d + '</option>').join('') + '</select></label></div>' +
      '<fieldset class="pf" style="border:0;padding:0;margin:.5em 0"><legend>When this data file is saved on this computer</legend>' +
      '<label><input type="radio" name="optLocalSave" value="single"' + (localStyle !== 'dated' ? ' checked' : '') + (App.season ? '' : ' disabled') + '> <b>One file</b>: save over the file you opened (Save as the first time, then the same file)</label><br>' +
      '<label><input type="radio" name="optLocalSave" value="dated"' + (localStyle === 'dated' ? ' checked' : '') + (App.season ? '' : ' disabled') + '> <b>A new dated file</b> each time (older ones stay as backups)</label></fieldset>' +
      '<p class="status">Quarter and title are also on the Reports tab, and the club night is also on the Calendar tab: they are the same settings. The title is kept in the data file.</p>' + (smsg.text ? '<p class="' + (smsg.level === 'error' ? 'bad' : 'status') + '" role="alert">' + esc(smsg.text) + '</p>' : '') + yearHtml();
  }
  // How the color teams are balanced. The first three are built in and always come first; the rest can be reordered and switched off.
  function prioHtml() {
    const pr = TeamPlan.priorities(App.season), info = id => TeamPlan.PRIORITIES.find(x => x.id === id), tun = pr.order.filter(id => !info(id).fixed);
    return '<h4>Color team balancing' + Info.html('options.priorities') + '</h4><p class="status">When two goals collide, the higher one wins. Never repeating a color and even team sizes always come first. A locked quarter, a color you set by hand and a hand move are never changed. The goals below it can be reordered or switched off.</p>' +
      '<ol class="prio">' + pr.order.map(id => {
        const x = info(id); if (x.fixed) return '<li data-prio="' + id + '" data-fixed>' + esc(x.label) + ' <span class="status">(always on' + (x.reserved ? ', used when a new child is placed' : '') + ')</span></li>';
        const i = tun.indexOf(id), on = !pr.off.includes(id);
        return '<li data-prio="' + id + '"><label><input type="checkbox" data-pon="' + id + '"' + (on ? ' checked' : '') + '> ' + esc(x.label) + '</label> ' +
          '<button type="button" data-pmove="' + id + ':-1"' + (i ? '' : ' disabled') + ' aria-label="Move ' + esc(x.label) + ' up">&uarr;</button> ' +
          '<button type="button" data-pmove="' + id + ':1"' + (i < tun.length - 1 ? '' : ' disabled') + ' aria-label="Move ' + esc(x.label) + ' down">&darr;</button></li>';
      }).join('') + '</ol><p><button type="button" id="optPrioReset">Reset to the defaults</button></p>' +
      '<p><label>Trust this season fully after <input type="number" id="optBlend" min="4" max="' + TeamPlan.MAX_FULL + '" step="1" value="' + TeamPlan.fullNights(App.season) + '" style="width:4.5em"> counted nights</label> <span class="status">Until then a child&rsquo;s attendance in earlier years counts too (default ' + TeamPlan.FULL_NIGHTS + '). Used for expected turnout.</span></p>';
  }
  // Settings kept in the data file: they travel with it, and a new season keeps them (except the T&T book, which is chosen again each year).
  function yearHtml() {
    if (!App.season) return '';
    const c = App.season.config, order = Season.teamOrder(App.season), pp = c.placePoints || {};
    return '<h4>Color teams' + Info.html('options.teamorder') + '</h4><p class="status">The order the colors are listed in on every screen: the Games tab, the team pickers, the Color teams list, standings and the printed reports. It does not change any data.</p>' +
      '<ol class="teamorder">' + order.map((t, i) => '<li><span class="team team-' + esc(t) + '">' + esc(t) + '</span> <button type="button" data-tmove="' + esc(t) + ':-1"' + (i ? '' : ' disabled') + ' aria-label="Move ' + esc(t) + ' up">&uarr;</button> <button type="button" data-tmove="' + esc(t) + ':1"' + (i < order.length - 1 ? '' : ' disabled') + ' aria-label="Move ' + esc(t) + ' down">&darr;</button></li>').join('') + '</ol>' + prioHtml() +
      '<h4>Games' + Info.html('options.places') + '</h4><div class="pgrid">' + [1, 2, 3, 4].map(n => '<label class="pf"><span>Points for ' + n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th') + ' place</span><input type="text" inputmode="numeric" data-pp="' + n + '" value="' + esc(pp[n] === undefined ? '' : pp[n]) + '"></label>').join('') + '</div>' +
      '<h4>Cubbies sign-offs' + Info.html('options.cubbies') + '</h4><div role="radiogroup" aria-label="How Cubbies sign-offs are kept">' +
        '<label class="sparkmode"><input type="radio" name="optCubbies" value="unit"' + (c.cubbiesDetail !== 'section' ? ' checked' : '') + '> <b>One box per unit</b> (8 in all): Apple Acres, the Trail and Units 1 to 6. Enter the day the unit was finished.</label>' +
        '<label class="sparkmode"><input type="radio" name="optCubbies" value="section"' + (c.cubbiesDetail === 'section' ? ' checked' : '') + '> <b>One box per Bear Hug</b> (28 in all): the day each Bear Hug was signed. Switching keeps the dates.</label></div>' +
      '<h4>Sparks handbooks' + Info.html('options.sparks') + '</h4><div role="radiogroup" aria-label="How Sparks use their handbooks">' +
      '<label class="sparkmode"><input type="radio" name="optSparks" value="sequence"' + (c.sparksBooks !== 'together' ? ' checked' : '') + '> <b>In order, at each child&rsquo;s own pace</b> (Awana&rsquo;s standard): Flight 3:16, then HG, WR, SS. A child finishes a book before the next, whatever their grade; a late starter catches up by moving on as soon as a book is done.</label>' +
      '<label class="sparkmode"><input type="radio" name="optSparks" value="together"' + (c.sparksBooks === 'together' ? ' checked' : '') + '> <b>All together</b>: the whole Sparks club uses one book this year (HG one year, WR the next, SS the third), which makes leader preparation simpler. Choose the book with <b>This year</b> in the list of books above.</label></div>' +
      '<div class="pgrid">' +
      '<label class="pf"><span>Blue Jewel weeks (4 rising numbers)' + Info.html('options.jewels') + '</span><input type="text" id="optJewels" value="' + esc((c.blueJewelWeeks || []).join(', ')) + '"></label></div>' +
      '<p class="status">The Blue Jewel weeks are the attendance counts at which a Sparks child earns each Blue Jewel. This year\'s Cubbies and T&amp;T books are set in the list of books above.</p>';
  }
  function storeHtml() {
    return !App.season ? '<p class="status">Open or start a data file first: the store settings are kept in it.</p>' :
      '<p class="status">The same settings as on the Awana store points tab, which also shows what they do to each child. Weights are points per earning; 0 leaves it out.</p>' + App.storeSettings.html();
  }
  // Settings of this browser (not of the data file): checking for a new version of the app, and saving automatically. app-update.js does the work.
  // The Bug button switch (config.bugButton, kept in the data file so every leader of that file sees it). Off by default; the key is absent while off.
  function bugsHtml() {
    if (!App.season) return '';
    const on = App.season.config.bugButton === true, n = Season.bugList(App.season).length;
    return '<section class="pcard" id="optBugs"><h3>Bug reports and feature requests</h3><p><label><input type="checkbox" id="optBugOn"' + (on ? ' checked' : '') + '> Show the Bug button (report a problem with the app, or ask for a feature)</label></p>' +
      '<p class="status">The Bug button sits beside Flag. A report goes on the Debug tab (Options, then Debug), where it can be answered; it never goes on To do. Turning this off only hides the button: the ' + n + ' report' + (n === 1 ? '' : 's') + ' in this file stay. Everyone who opens this file sees the same setting and the same reports.</p></section>';
  }
  function updatesHtml() {
    if (!App.updates) return '';
    const u = App.updates.state(), a = App.autosave.state(), sel = (id, list, cur) => '<select id="' + id + '">' + list.map(m => '<option value="' + m + '"' + (+cur === m ? ' selected' : '') + '>' + m + '</option>').join('') + '</select>';
    const where = App.driveInfo && App.driveInfo().save ? 'Google Drive (' + (App.driveInfo().style === 'inplace' ? 'one file updated in place' : 'a new dated file each time') + ')' : 'this computer (a download)';
    return '<section class="pcard" id="optUpdates"><h3>Updates and auto-save' + Info.html('options.updates') + '</h3>' +
      '<h4>New versions of the app</h4>' + (!App.updates.web ? '<p class="status">Updates are checked only when the app is opened from its website, not from a file on this computer.</p>' :
        '<p><label><input type="checkbox" id="optUpdOn"' + (u.on ? ' checked' : '') + '> Check for a new version automatically every ' + sel('optUpdMin', [5, 10, 15, 30, 60], u.minutes) + ' minutes</label> <button type="button" id="optUpdNow"' + (u.checking ? ' disabled' : '') + '>Check now</button></p>' +
        '<p class="status">You are on version ' + esc(App.updates.run.version) + (App.updates.run.build ? ' (' + esc(App.updates.run.build) + ')' : '') + '. ' + (u.checking ? 'Checking&hellip;' : u.error ? 'Could not check' + (u.last ? ' at ' + u.last : '') + ': ' + esc(u.error) + '.' : u.last ? 'Last checked at ' + u.last + ': ' + (u.found ? 'a newer version is available.' : 'up to date.') : 'Not checked yet.') + '</p>' +
        (u.found ? '<p class="ok"><b>Version ' + esc(u.found.version) + ' is available.</b> <button type="button" id="optUpdApply" class="primary">Update now</button> <span class="status">Your open data is saved first if needed, then carried through the reload: nothing is lost. You choose when.</span></p>' : '')) +
      '<h4>Auto-save' + Info.html('options.autosave') + '</h4>' +
      '<p><label><input type="checkbox" id="optAutoOn"' + (a.on ? ' checked' : '') + '> Save automatically every ' + sel('optAutoMin', [1, 2, 5, 10, 15, 30], a.minutes) + ' minutes</label></p>' +
      '<p class="status">Only when something is unsaved, and it never asks anything. It saves where the Save button saves now: <b>' + esc(where) + '</b>.' + (a.on && where.indexOf('computer') > 0 ? ' Each auto-save is a new downloaded file (your browser may ask once to allow several downloads).' : '') + (a.last ? ' Last auto-save at ' + esc(a.last) + '.' : '') + '</p></section>';
  }
  // Optional: only when drive-config.js is filled in (app-drive.js adds the menu to the save button).
  function driveHtml() {
    if (!App.driveInfo) return '';      // app-drive.js defines it only when Drive is set up
    const i = App.driveInfo(), season = !!App.season, pin = season ? (App.season.config.drivePinDays === undefined ? 30 : App.season.config.drivePinDays) : 30;
    const row = (kind, label, d, shared, none) => '<tr><td>' + label + '</td><td>' + (d ? '<b>' + esc(d.name || 'a folder') + '</b> <span class="status">' + (shared ? '(shared: saved in the data file)' : '(this browser only)') + '</span>' : '<span class="status">' + none + '</span>') + '</td>' +
      '<td><button type="button" data-gdset="' + kind + '">Choose&hellip;</button> ' + (d ? '<button type="button" data-gdclear="' + kind + '">Clear</button>' : '') + '</td></tr>';
    return '<section class="pcard" id="optDriveCard"><h3>Google Drive</h3>' +
      '<p><label><input type="checkbox" id="gdSave"' + (i.save ? ' checked' : '') + '> Save to Google Drive instead of downloading</label> <span class="status">(this is also what the Save and Import buttons follow)</span></p>' +
      '<table class="roster"><tbody>' + row('club', 'Club files folder (open and save data files)' + Info.html('drive.folder'), i.club, i.clubShared, 'not chosen: the folder the data file was opened from') +
      row('slides', 'Slide images, reports and exports go to' + Info.html('drive.reports'), i.slides, i.slidesShared, 'same as the club folder') + '</tbody></table>' +
      '<p class="status">Slides, ZIPs and CSV exports (store points, colors, calendar) go to the second folder while saving to Drive is on. <b>Print / Save as PDF</b> opens your browser&rsquo;s own print window: choose the same folder there (the app cannot send a printed report to Drive for you).</p>' +
      '<h4>Save style' + Info.html('drive.style') + '</h4><div role="radiogroup" aria-label="How data files are saved to Drive">' +
      '<label class="sparkmode"><input type="radio" name="optDriveStyle" value="dated"' + (i.style === 'dated' ? ' checked' : '') + '> <b>Dated files</b> (safest): every save is a new complete file; older ones stay as backups.</label>' +
      '<label class="sparkmode"><input type="radio" name="optDriveStyle" value="inplace"' + (i.style === 'inplace' ? ' checked' : '') + '> <b>One file, updated in place</b>: Drive keeps the earlier versions; if someone else saved since you opened it, their changes are merged with yours.</label></div>' +
      '<p class="status">This is a setting of this browser. ' + (i.inPlace ? 'The open data file would be updated in place on the next save.' : i.style === 'inplace' ? 'The open data file is not a Drive file this app can update, so the next save makes a new file (and that file is then kept up to date).' : '') + '</p>' +
      '<div class="pgrid"><label class="pf"><span>File name for "one file" saves (empty = keep the name it has on Drive)</span><input type="text" id="optKeepName" value="' + esc(i.keepName || '') + '" placeholder="keep the current name"></label></div>' +
      '<div class="pgrid"><label class="pf"><span>Keep a version forever every (days; 0 = never)' + Info.html('drive.pin') + '</span><input type="text" inputmode="numeric" id="optPinDays" value="' + esc(pin) + '"' + (season ? '' : ' disabled') + '></label></div>' +
      '<p class="status">' + (season ? 'The folders and the keep-a-version interval are saved in the data file, so everyone who opens it gets them. Each person confirms a shared folder once, the first time Google asks.' : 'Open a data file to share the folders through it.') + '</p>' +
      '<p>' + (i.connected ? '<span class="ok">Signed in to Google.</span> <button type="button" id="optSignOut">Sign out</button>' : '<span class="status">Not signed in: you will be asked the first time you save or import with Google Drive.</span>') + '</p></section>';
  }
  function checksHtml() {
    if (!App.master) return '<p class="status">Load a roster first.</p>';
    const found = Check.scan({ master: App.master, season: App.season, calendar: App.calendar }), errs = found.filter(f => f.level === 'error'), warns = found.filter(f => f.level === 'warn');
    if (!found.length) return '<p class="ok">No problems found: every book is recognized and every value that is typed in looks valid.</p><p><button type="button" id="optRecheck">Check again</button></p>';
    const link = f => f.id ? '<a href="#" data-opt-person="' + esc(f.id) + '">Open</a>' : f.area === 'Calendar' ? '<a href="#" data-opt-tab="calendar">Calendar</a>' : f.area === 'Books' ? '<a href="#optBooksTop" data-opt-books="1">Books</a>' : '';
    return '<p><b>' + errs.length + ' error' + (errs.length === 1 ? '' : 's') + ', ' + warns.length + ' warning' + (warns.length === 1 ? '' : 's') + '.</b> Errors are values that cannot be right; warnings are for you to judge. The same book and value problems are on the To do tab.</p>' +
      '<div class="scroll"><table class="roster"><thead><tr><th></th><th>Area</th><th>Problem</th><th></th></tr></thead><tbody>' +
      errs.concat(warns).slice(0, 300).map(f => '<tr><td>' + (f.level === 'error' ? '<span class="bad" title="error">&#10006;</span>' : '<span title="warning">&#9888;</span>') + '</td><td>' + esc(f.area) + '</td><td class="wrap">' + esc(f.msg) + '</td><td>' + link(f) + '</td></tr>').join('') + '</tbody></table></div>' +
      (found.length > 300 ? '<p class="status">The first 300 of ' + found.length + ' are shown.</p>' : '') + '<p><button type="button" id="optRecheck">Check again</button></p>';
  }
  // Whole club: awards finished before this season's first club night (earlier years' Progress sheets). Two steps: count them, then confirm.
  const past = { n: null, kids: 0 };
  function pastHtml() {
    if (!App.season) return '';
    const cut = Season.firstNight(App.season), shown = cut ? new Date(cut + 'T12:00').toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' }) : '';
    return '<section class="pcard" id="optPastYears"><h3>Earlier years</h3><p class="status">Progress sheets from earlier club years are entered with their real dates. An award finished before this season\'s first club night' + (shown ? ' (' + shown + ')' : '') + ' belongs to an earlier year. ' +
      'This marks all of those <b>given, with no date</b> (the child has them; the day is not shown or printed anywhere), (so the Achievement Record shows them). Earlier-year awards are never offered to announce, marked or not. Awards already given, and this year\'s, are not touched. Undo takes it back.</p>' +
      (!cut ? '<p class="status">Add this year\'s club nights to the Calendar first: the first one is where this season starts.</p>' :
        past.n == null ? '<p><button type="button" id="optPastCount">Count earlier-year awards</button></p>' :
        past.n === 0 ? '<p class="ok">Nothing to mark: every earlier-year award is already given.</p><p><button type="button" id="optPastCount">Count again</button></p>' :
        '<p><b>' + past.n + ' award' + (past.n === 1 ? '' : 's') + ' for ' + past.kids + ' child' + (past.kids === 1 ? '' : 'ren') + '</b> from earlier years ' + (past.n === 1 ? 'is' : 'are') + ' not marked given. <button type="button" id="optPastGo">Mark all ' + past.n + ' given, no date</button> <button type="button" id="optPastCount">Count again</button></p>') + '</section>';
  }
  // Report bundles: named lists of reports that print as one job (Reports tab, "Print several at once"). Until the club edits them, the standard Quarterly Printables bundle is used and nothing is stored.
  const repTitle = id => ((Reports.LIST.find(r => r.id === id) || {}).title) || id + ' (not found)';
  function bundlesHtml() {
    if (!App.season) return '';
    const bs = Reports.bundlesOf(App.season), custom = Array.isArray(App.season.config.bundles) && App.season.config.bundles.length;
    const opts = sel => Reports.LIST.map(r => '<option value="' + r.id + '"' + (r.id === sel ? ' selected' : '') + '>' + esc(r.title) + '</option>').join('');
    return '<section class="pcard" id="optBundles"><h3>Report bundles</h3><p class="status">A bundle prints several reports as one job: choose it on the Reports tab under <i>Print several at once</i>, pick the quarter (the next one is offered) and print. ' +
      'Attendance sheets and the medical pages by class make one page for each class. ' + (custom ? 'These are your own bundles.' : 'This is the standard bundle; change anything to make it yours.') + '</p>' +
      bs.map((b, i) => '<div class="bundle" data-b="' + i + '"><p><label>Bundle name <input type="text" data-bname="' + i + '" value="' + esc(b.name) + '" size="26"></label> <button type="button" data-bundledel="' + i + '"' + (bs.length < 2 ? ' disabled' : '') + '>Delete bundle</button></p>' +
        '<ol class="bitems">' + (b.items || []).map((it, j) => '<li><select data-bitem="' + i + ':' + j + '" aria-label="Report ' + (j + 1) + ' in ' + esc(b.name) + '">' + opts(it.report) + '</select> ' +
          '<button type="button" data-bmove="' + i + ':' + j + ':-1" aria-label="Move up"' + (j ? '' : ' disabled') + '>&uarr;</button><button type="button" data-bmove="' + i + ':' + j + ':1" aria-label="Move down"' + (j < b.items.length - 1 ? '' : ' disabled') + '>&darr;</button>' +
          '<button type="button" data-brem="' + i + ':' + j + '" aria-label="Remove from the bundle">&times;</button></li>').join('') + '</ol>' +
        '<p><select data-badd="' + i + '" aria-label="Add a report to ' + esc(b.name) + '"><option value="">Add a report&hellip;</option>' + opts('') + '</select></p></div>').join('') +
      '<p><button type="button" id="optBundleNew">New bundle</button> <button type="button" id="optBundleReset">Back to the standard bundle</button></p></section>';
  }
  const editBundles = () => { const c = App.season.config; if (!Array.isArray(c.bundles) || !c.bundles.length) c.bundles = Reports.DEFAULT_BUNDLES(); return c.bundles; };
  // Starting next year's data file (the button's click is handled in app-season.js); it used to sit on the Attendance tab.
  function newSeasonHtml() {
    return '<section class="pcard" id="optNewSeason"><h3>New season' + Info.html('attend.season') + '</h3><p class="status">Starts next year’s data file: people, colors, calendar and award lists carry over, and so does last year&rsquo;s <b>progress and awards</b> (every sign-off, handbooks, awards told and given), once, as earlier-year work that is never announced or counted again. Attendance, games and history start empty, but each child&rsquo;s attendance <b>counts</b> are kept for team balance. Save it as a new file; last year’s file is left alone.</p>' +
      '<p><button type="button" id="btnNewSeason">New season&hellip;</button> <label class="btn">Add an earlier year&hellip;<input type="file" id="fileEarlierYear" accept=".json,application/json" class="vh"></label> <span class="status">Reads an older data file and keeps only each child&rsquo;s attendance counts for that year (for color team balance). No names are read out.</span></p></section>';
  }
  function render() {
    const el = $('optionsWrap'); if (!el) return;
    if (!App.master) { el.innerHTML = '<p class="status">Load a roster first (Import&hellip;).</p>' + updatesHtml() + driveHtml(); return; }      // the Google Drive card is about this browser, so it is here even with nothing open
    el.innerHTML = '<section class="pcard" id="optBooksTop"><h3>Books' + Info.html('options.books') + '' + Info.html('options.thisyear') + '</h3>' + booksHtml() + tntOrderHtml() + '</section><section class="pcard"><h3>Club settings' + Info.html('options.clubnight') + '</h3>' + settingsHtml() + '</section><section class="pcard"><h3>Awana store points</h3>' + storeHtml() + '</section>' + bundlesHtml() + pastHtml() + newSeasonHtml() + updatesHtml() + bugsHtml() + driveHtml() + '<section class="pcard" id="optChecks"><h3>Data checks' + Info.html('tools.checks') + '</h3>' + checksHtml() + '</section>';
  }

  // ---- editing the books ----
  // One field at a time. An error (an impossible code, a duplicate) puts the old value back and says why; the edit is not made.
  $('optionsWrap').addEventListener('change', e => {
    const t = e.target, tr = t.closest('tr[data-code]');
    if (App.season && t.dataset && (t.dataset.bname !== undefined || t.dataset.bitem !== undefined || t.dataset.badd !== undefined)) {      // report bundles
      const bs = editBundles();
      if (t.dataset.bname !== undefined) { const v = t.value.trim(); if (!v) { t.value = bs[+t.dataset.bname].name; return; } bs[+t.dataset.bname].name = v; }
      else if (t.dataset.bitem !== undefined) { const [i, j] = t.dataset.bitem.split(':').map(Number); bs[i].items[j].report = t.value; }
      else if (t.value) { bs[+t.dataset.badd].items.push({ report: t.value }); }
      App.touch(); render(); return;
    }
    if (t.id === 'optBlend' && App.season) {      // how many counted nights before this season's attendance fully replaces earlier years' in the expected turnout (teamplan.js, "how history blends in")
      const v = Math.round(Number(t.value)); TeamPlan.setBlendNights(App.season, v); App.touch(); render(); const b = $('optBlend'); if (b) b.focus(); return;
    }
    if (t.id === 'fileEarlierYear' && App.season) {      // "Add an earlier year": counts from an older data file, never names
      const f = t.files && t.files[0]; t.value = ''; if (!f) return;
      f.text().then(text => {
        let r; try { r = Season.addEarlierYear(App.season, text); } catch (err) { App.flash('Could not add that file: ' + err.message, 'error'); return; }
        if (r.added) App.touch();
        App.flash(r.year + ': counts added for ' + r.added + ' child' + (r.added === 1 ? '' : 'ren') + (r.alreadyThere ? ', ' + r.alreadyThere + ' already had that year' : '') + (r.notOnRoster ? ', ' + r.notOnRoster + ' not on this roster (skipped)' : '') + '.', r.added ? 'info' : 'warn'); render();
      });
      return;
    }
    if (t.dataset && t.dataset.pon && App.season) {      // a balancing goal switched on or off
      const cur = TeamPlan.priorities(App.season), off = t.checked ? cur.off.filter(x => x !== t.dataset.pon) : cur.off.concat(t.dataset.pon);
      TeamPlan.setPriorities(App.season, { order: cur.order.filter(x => !TeamPlan.PRIORITIES.find(y => y.id === x).fixed), off }); App.touch(); render(); return;
    }
    if (t.dataset && t.dataset.yb && App.season) {      // this year's book for the group: one per group, so ticking one clears the other, and unticking clears it
      const b = books(), code = t.dataset.yb, g = Season.bookGroup(App.season, code);
      try { Season.setYearBook(App.season, g, t.checked ? code : ''); } catch (err) { return say(err.message); }
      msg.text = t.checked ? (b[code].name || code) + ' is this year\'s ' + g + ' book. ' + g + ' children with no handbook are offered it.' : 'No book chosen for ' + g + ' this year.'; msg.level = 'info'; App.touch(); return render();
    }
    if (t.dataset && t.dataset.bf && tr && App.season) {
      const b = books(), old = tr.dataset.code, f = t.dataset.bf, v = t.value.trim();
      msg.text = '';
      if (f === 'code') {
        const code = v;
        if (!/^[A-Za-z]{2,3}$/.test(code)) return say('A book code is 2 or 3 letters (for example HG or AoG). "' + v + '" was not used.');
        if (code !== old && Object.keys(b).some(k => k !== old && k.toLowerCase() === code.toLowerCase())) return say('There is already a book with the code ' + code + '. The change was not made.');
        if (code !== old) { const n = usedBy(old); b[code] = b[old]; delete b[old]; const yb = App.season.config.yearBook || {}; Object.keys(yb).forEach(g => { if (yb[g] === old) yb[g] = code; }); App.touch(); msg.level = 'info'; msg.text = n ? n + ' child' + (n === 1 ? ' has' : 'ren have') + ' a handbook with the old code ' + old + '; it now shows as an unrecognized book on the To do tab until you correct it.' : ''; return render(); }
      } else if (f === 'name') { if (!v) return say('A book needs a name. The old name was kept.'); b[old].name = v; }
      else if (f === 'emblem') b[old].emblem = v;
      else if (f === 'group') { b[old].group = v; const yb = App.season.config.yearBook || {}; Object.keys(yb).forEach(g => { if (yb[g] === old && g !== v) yb[g] = ''; }); }      // a book moved to another group is no longer this year's book for the old one
      App.touch(); render();
    }
    if (t.id === 'optBugOn' && App.season) { if (t.checked) App.season.config.bugButton = true; else delete App.season.config.bugButton; App.touch(); if (App.syncBugButton) App.syncBugButton(); return render(); }
    if (t.id === 'optUpdOn' || t.id === 'optUpdMin') { App.updates.set($('optUpdOn').checked, +$('optUpdMin').value); return render(); }      // settings of this browser: they work with nothing open
    if (t.id === 'optAutoOn' || t.id === 'optAutoMin') { App.autosave.set($('optAutoOn').checked, +$('optAutoMin').value); return render(); }
    if (t.id === 'gdSave' && App.driveDo) { App.driveDo.setSave(t.checked); return render(); }      // these two are settings of this browser: they work before a data file is open
    if (t.name === 'optDriveStyle') { App.driveStyle.set(t.value); return render(); }
    if (t.id === 'optKeepName' && App.driveKeepName) { App.driveKeepName.set(t.value); return render(); }
    if (App.season) {
      const c = App.season.config;
      if (t.dataset && t.dataset.pp) {
        const n = /^\s*\d+\s*$/.test(t.value) ? parseInt(t.value, 10) : -1;
        if (n < 0) return saySet('Place points are whole numbers, 0 or more. "' + t.value + '" was not used.');
        c.placePoints = Object.assign({}, c.placePoints, { [t.dataset.pp]: n }); smsg.text = ''; App.touch(); return render();
      }
      if (t.id === 'optPinDays') {
        const n = /^\s*\d+\s*$/.test(t.value) ? parseInt(t.value, 10) : -1;
        if (n < 0) return saySet('Days are a whole number, 0 or more (0 = never keep a version). "' + t.value + '" was not used.');
        c.drivePinDays = n; smsg.text = ''; App.touch(); return render();
      }
      if (t.name === 'optCubbies') { try { Season.setCubbiesDetail(App.season, t.value); smsg.text = ''; App.touch(); } catch (err) { alert(err.message); } return render(); }
      if (t.name === 'optSparks') { Season.setSparksBooks(App.season, t.value); smsg.text = ''; App.touch(); return render(); }
      if (t.id === 'optJewels') {
        const w = t.value.split(/[,\s]+/).filter(Boolean).map(Number);
        if (!(w.length === 4 && w.every((n, i) => Number.isInteger(n) && n > 0 && (!i || n > w[i - 1])))) return saySet('Blue Jewel weeks are four whole numbers in rising order, like 6, 12, 19, 27. The old ones were kept.');
        c.blueJewelWeeks = w; smsg.text = ''; App.touch(); return render();
      }
      if (App.storeSettings.change(t)) return render();
    }
    // club settings: change the real control, so the Reports and Calendar tabs follow
    if (t.name === 'optLocalSave' && App.season) { App.season.config.saveStyleLocal = t.value === 'dated' ? 'dated' : 'single'; App.commitScope(() => App.changed()); return render(); }      // a setting of the data file (config.saveStyleLocal)
    if (t.id === 'optQuarter') { const q = $('sQuarter'); q.value = t.value; q.dispatchEvent(new Event('input', { bubbles: true })); render(); }
    if (t.id === 'optDay') { const c = $('calClubDay'); c.value = t.value; c.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  $('optionsWrap').addEventListener('input', e => {
    const map = { optClub: 'sClub' }, t = e.target; if (!map[t.id]) return;
    const o = $(map[t.id]); o.value = t.value; o.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // T&T book order: the rotation's books in the order the club uses (AWANA does not fix one). Shown in the Progress tab and here; it is saved in the file.
  function tntOrderHtml() {
    if (!App.season) return '';
    const list = Season.bookOrder(App.season, 'T&T'), b = books();
    return '<div class="tntorder" style="margin-top:12px"><p><b>T&amp;T book order</b> <span class="status">The books in the order your club uses them. Progress lists them this way.</span></p><ol>' +
      list.map((c, i) => '<li>' + esc((b[c] || {}).name || c) + ' <button type="button" data-tntmove="up" data-tntcode="' + esc(c) + '"' + (i === 0 ? ' disabled' : '') + ' aria-label="Move ' + esc(c) + ' up">&uarr;</button> <button type="button" data-tntmove="down" data-tntcode="' + esc(c) + '"' + (i === list.length - 1 ? ' disabled' : '') + ' aria-label="Move ' + esc(c) + ' down">&darr;</button></li>').join('') +
      '</ol><p><button type="button" data-tntreset="1">Use the standard order</button></p></div>';
  }
  $('optionsWrap').addEventListener('click', e => {
    const t = e.target;
    if (t.dataset && (t.dataset.tntmove || t.dataset.tntreset) && App.season) {
      const cur = Season.bookOrder(App.season, 'T&T').slice();
      if (t.dataset.tntreset) Season.setBookOrder(App.season, 'T&T', []);
      else { const i = cur.indexOf(t.dataset.tntcode), j = t.dataset.tntmove === 'up' ? i - 1 : i + 1; if (i < 0 || j < 0 || j >= cur.length) return; [cur[i], cur[j]] = [cur[j], cur[i]]; Season.setBookOrder(App.season, 'T&T', cur); }
      App.touch(); render(); return;
    }
    if (t.id === 'optBookAdd' && App.season) {
      const b = books(); let code = ''; for (let i = 0; i < 26 * 26 && !code; i++) { const c = String.fromCharCode(65 + (i / 26 | 0)) + String.fromCharCode(65 + i % 26); if (!b[c]) code = c; }
      b[code] = { name: 'New book', emblem: '', group: 'Sparks' }; msg.text = 'Added the book ' + code + ': change its code, name, color and group.'; msg.level = 'info'; App.touch(); render();
      const first = $('optionsWrap').querySelector('tr[data-code="' + code + '"] input'); if (first) first.focus();
    }
    if (t.id === 'optBookReset' && App.season && confirm('Put the standard list of books back? Books you added or changed here are replaced.')) { App.season.config.books = JSON.parse(JSON.stringify(Catalog.defaultConfig().books)); msg.text = ''; App.touch(); render(); }
    const del = t.closest('[data-bdel]');
    if (del && App.season) { const code = del.dataset.bdel, n = usedBy(code); if (confirm('Delete the book ' + code + ' (' + (books()[code] || {}).name + ')?' + (n ? '\n\n' + n + ' child' + (n === 1 ? ' has' : 'ren have') + ' this book in their handbook record; it will show as unrecognized on the To do tab.' : ''))) { delete books()[code]; const yb = App.season.config.yearBook || {}; Object.keys(yb).forEach(g => { if (yb[g] === code) yb[g] = ''; }); msg.text = ''; App.touch(); render(); } }
    if (t.id === 'optTidy' && App.season) { const n = Season.tidyHandbookCodes(App.season, true).length; msg.text = 'Tidied ' + n + ' handbook code' + (n === 1 ? '' : 's') + '.'; msg.level = 'info'; App.touch(); render(); }
    const bt = t.closest && t.closest('[data-bmove],[data-brem],[data-bundledel]');
    if (bt && App.season) {
      const bs = editBundles();
      if (bt.dataset.bmove) { const [i, j, d] = bt.dataset.bmove.split(':').map(Number), a = bs[i].items; if (a[j + d]) { [a[j], a[j + d]] = [a[j + d], a[j]]; } }
      else if (bt.dataset.brem) { const [i, j] = bt.dataset.brem.split(':').map(Number); bs[i].items.splice(j, 1); }
      else if (bs.length > 1 && confirm('Delete the bundle "' + bs[+bt.dataset.bundledel].name + '"? The reports themselves are not affected.')) bs.splice(+bt.dataset.bundledel, 1);
      App.touch(); render(); return;
    }
    if (t.id === 'optBundleNew' && App.season) { const bs = editBundles(); bs.push({ name: 'New bundle', items: [] }); App.touch(); render(); const f = $('optionsWrap').querySelector('input[data-bname="' + (bs.length - 1) + '"]'); if (f) { f.focus(); f.select(); } return; }
    if (t.id === 'optBundleReset' && App.season && confirm('Put the standard Quarterly Printables bundle back? Your own bundles are removed.')) { delete App.season.config.bundles; App.touch(); render(); return; }
    if (t.id === 'optPastCount' && App.season) {
      let n = 0, kids = 0; Object.keys(App.season.progress).forEach(id => { const k = Season.pastYearAwards(App.season, id).length; if (k) { n += k; kids++; } });
      past.n = n; past.kids = kids; render(); return;
    }
    if (t.id === 'optPastGo' && App.season) {
      if (!confirm('Mark ' + past.n + ' award' + (past.n === 1 ? '' : 's') + ' for ' + past.kids + ' child' + (past.kids === 1 ? '' : 'ren') + ' as given, with no date?\n\nThis covers every child with a Progress record, including children who have left. Undo takes it back.')) return;
      let r; try { r = Season.markPastYearsGiven(App.season, App.today()); } catch (err) { alert(err.message); return; }
      past.n = null; App.touch(); render(); App.flash(r.awards + ' award' + (r.awards === 1 ? '' : 's') + ' for ' + r.kids + ' child' + (r.kids === 1 ? '' : 'ren') + ' marked given, no date.', 'info'); return;
    }
    if (t.id === 'optRecheck') render();
    if (t.id === 'optUpdNow') { App.updates.check().then(render); render(); return; }
    if (t.id === 'optUpdApply') { App.updates.apply(); return; }
    const gs = t.closest('[data-gdset]'); if (gs && App.driveDo) { App.driveDo.choose(gs.dataset.gdset).then(render); return; }
    const gc = t.closest('[data-gdclear]'); if (gc && App.driveDo) { App.driveDo.clear(gc.dataset.gdclear); render(); return; }
    if (t.id === 'optSignOut' && App.driveDo) { App.driveDo.signOut(); render(); }
    const mv = t.closest('[data-tmove]');
    if (mv && App.season) {
      const [color, d] = mv.dataset.tmove.split(':'), o = Season.teamOrder(App.season), i = o.indexOf(color), j = i + (+d);
      if (j >= 0 && j < o.length) { [o[i], o[j]] = [o[j], o[i]]; Season.setTeamOrder(App.season, o); smsg.text = ''; App.touch(); render(); const again = $('optionsWrap').querySelector('[data-tmove="' + color + ':' + d + '"]:not([disabled])') || $('optionsWrap').querySelector('[data-tmove^="' + color + ':"]:not([disabled])'); if (again) again.focus(); }
    }
    const pm = t.closest('[data-pmove]');
    if (pm && App.season) {
      const [id, d] = pm.dataset.pmove.split(':'), cur = TeamPlan.priorities(App.season), tun = cur.order.filter(x => !TeamPlan.PRIORITIES.find(y => y.id === x).fixed), i = tun.indexOf(id), j = i + (+d);
      if (j >= 0 && j < tun.length) {
        [tun[i], tun[j]] = [tun[j], tun[i]]; TeamPlan.setPriorities(App.season, { order: tun, off: cur.off }); smsg.text = ''; App.touch(); render();
        const again = $('optionsWrap').querySelector('[data-pmove="' + id + ':' + d + '"]:not([disabled])') || $('optionsWrap').querySelector('[data-pmove^="' + id + ':"]:not([disabled])'); if (again) again.focus();
      }
    }
    if (t.id === 'optPrioReset' && App.season) { TeamPlan.setPriorities(App.season, { order: [], off: [] }); App.touch(); render(); const b = $('optPrioReset'); if (b) b.focus(); }
    const p = t.closest('a[data-opt-person]'); if (p) { e.preventDefault(); App.showPerson(p.dataset.optPerson, { attention: true }); }
    const tb = t.closest('a[data-opt-tab]'); if (tb) { e.preventDefault(); App.showTab(tb.dataset.optTab); }
    const bk = t.closest('a[data-opt-books]'); if (bk) { e.preventDefault(); const f = $('optionsWrap').querySelector('input[data-bf]'); if (f) f.focus(); }
  });
  App.tabs.options = render;
  App.onRefresh.push(() => { if (!$('tab-options').hidden && !($('optionsWrap').contains(document.activeElement) && document.activeElement.tagName === 'INPUT')) render(); });
})();
