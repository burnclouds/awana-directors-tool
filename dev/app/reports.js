(this.AwanaVersions = this.AwanaVersions || {})['reports.js'] = '1.26.3';
// Print reports. Each render(ctx) returns HTML; ctx = { master, settings, opts }.
(function (root) {
  const M = root.Model || (typeof require !== 'undefined' ? require('./model.js') : null);
  const Cal = root.Calendar || (typeof require !== 'undefined' ? require('./calendar.js') : null);
  const Season = root.Season || (typeof require !== 'undefined' ? require('./season.js') : null);
  const { C } = M;

  const esc = M.esc;      // shared (model.js)
  const TEAM_COLORS = ['Red', 'Blue', 'Green', 'Yellow'];
  const ROWS_PER_PAGE = 20;      // attendance rows on one printed page (N11: the top of the page is left clear for the three punch holes)

  const kids = m => m.people.filter(p => M.isActive(p) && M.isClubber(p));
  const adults = m => m.people.filter(p => M.isActive(p) && M.isVolunteer(p));
  const first = p => M.eff(p, C.FIRST), last = p => M.eff(p, C.LAST);
  const byFirst = (a, b) => first(a).localeCompare(first(b)) || last(a).localeCompare(last(b));
  const byLast = (a, b) => last(a).localeCompare(last(b)) || first(a).localeCompare(first(b));
  const roomsOf = list => [...new Set(list.map(M.room))].sort((a, b) => M.roomRank(a) - M.roomRank(b) || a.localeCompare(b));
  const none = '<span class="none">none on file</span>';

  function table(headers, rows, cls, widths) {      // widths: optional percentages, one per column, laid out fixed (N15)
    return '<table class="grid ' + (cls || '') + '">' + (widths ? '<colgroup>' + widths.map(w => '<col style="width:' + w + '%">').join('') + '</colgroup>' : '') + '<thead><tr>' + headers.map(h => '<th>' + esc(h) + '</th>').join('') +
      '</tr></thead><tbody>' + rows.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
  }
  // right: optional text set at the right end of the title line (N53: "Printed 11/20/26"); it is an attribute drawn by CSS, so it is not part of the title that Choose pages lists.
  const sheet = (title, body, orient, sub, right) =>
    '<section class="sheet ' + (orient || 'portrait') + '"><h2' + (right ? ' data-right="' + esc(right) + '"' : '') + '>' + esc(title) + '</h2>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + body + '</section>';
  const teamCell = t => t ? '<span class="team team-' + esc(t) + '">' + esc(t) + '</span>' : '';

  // Team on the sheet's night: a move or one-night exception in the data file wins over the quarter color. * marks a child who changes team this quarter.
  // A sheet for a chosen night uses that night's quarter from the calendar (a date in Q3 under a Q2 setting would mix the two); with no date it uses the chosen quarter.
  const sheetQuarter = ctx => { const d = ctx.opts && ctx.opts.date, r = d && (ctx.calendar || []).find(x => x.Date === d); return r && r.Quarter ? r.Quarter : ctx.settings.quarter; };
  // With a night chosen: the team that night (Season.teamOn). With none (the Color teams list, the coaches list, a binder printed in the quarter): the color the child plays NOW, i.e. the latest move in the quarter (Season.quarterColor), so a moved child is not printed on last month's team.
  // opts.asOfFirst: a binder printed before the quarter starts is "as of its first night" by the app's own choice, not because anyone chose that night: it is a quarter-long page, so a one-night fill-in recorded on that night must not set the printed team (moves still count).
  const movesAsOf = (s, id, d, q, dflt) => Season.movesOf(s, id).filter(x => x.q === q && x.from <= d).reduce((t, x) => x.team, dflt || '');
  const teamAsOf = (ctx, p) => { const q = sheetQuarter(ctx), d = ctx.opts && ctx.opts.date, t = M.teamOf(p, q); return !ctx.season ? t : d ? (ctx.opts.asOfFirst ? movesAsOf : Season.teamOn)(ctx.season, p[M.X.ID], d, q, t) : Season.quarterColor(ctx.season, p[M.X.ID], q, t); };
  const movesThisQuarter = (ctx, p) => !!ctx.season && Season.movesOf(ctx.season, p[M.X.ID]).some(m => m.q === sheetQuarter(ctx));
  // N37 F6: which teams these are (the quarter, or the night chosen) always prints; the "* = changes team" explanation prints only when a child on the page carries a "*" (people: the children the page lists).
  const teamNote = (ctx, people) => { if (!ctx.season) return ''; const star = !people || people.some(p => movesThisQuarter(ctx, p)); return ctx.opts && ctx.opts.date ? 'Teams as of ' + ctx.opts.date + '.' + (star ? ' * = changes team this quarter.' : '') : sheetQuarter(ctx) + ' teams.' + (star ? ' * = changes team during the quarter.' : ''); };

  // ---------- attendance sheets (one page per room, every kid in the room) ----------
  const MARKS = {
    Puggles: ['Attendance'], Cubbies: ['Attendance', '', '', ''],      // Cubbies (Mike, 2026-11-20): four sub-cells a night, the first Attendance and three with blank headings left for writing in (a blank one has no MARK_KEY, so the record never fills it)
    Sparks: ['Attendance', 'Handbook', 'Participation', 'Extra'], 'T&T': ['Attendance', 'Handbook', 'Participation', 'Extra'],
  };
  // Club nights for the selected quarter come from the calendar; typed-in dates are only a fallback.
  function nightDates(ctx) {
    const cal = ctx.calendar;
    if (cal && cal.length) return Cal.nights(cal, ctx.settings.quarter).map(r => Cal.short(r.Date));
    return [];      // no calendar, no club nights: the calendar is part of the data file
  }
  // The Night picker is only for "teams as of that night" inside the picked quarter. A night from another quarter (it defaults to the latest night, usually in a later quarter) must not
  // switch the Color Team column to its own quarter while the title and the dates follow the Quarter pills (flags 1 and 3).
  const quarterCtx = ctx => {
    const d = ctx.opts && ctx.opts.date, row = d && (ctx.calendar || []).find(x => x.Date === d);
    return !d || !row || !row.Quarter || row.Quarter === ctx.settings.quarter ? ctx : Object.assign({}, ctx, { opts: Object.assign({}, ctx.opts, { date: '' }) });
  };
  function attendance(ctx0) {
    const ctx = quarterCtx(ctx0), { master, settings: s, opts } = ctx;
    let list = kids(master);
    if (opts.room) list = list.filter(p => M.room(p) === opts.room);
    return roomsOf(list).map(r => {
      const g = M.groupOf(r), marks = MARKS[g] || [], dates = nightDates(ctx), withTeam = M.hasColorTeams(g);
      const people = list.filter(p => M.room(p) === r).sort(byFirst);
      const span = Math.max(1, marks.length), oneMark = marks.length === 1;      // N8: one box a night (Puggles): the date alone heads the column, no rotated word
      const pages = Math.max(1, Math.ceil(people.length / ROWS_PER_PAGE));      // N11: 20 rows a page (room for the punch holes); a bigger class goes on to a second page
      const isoNights = ctx.calendar && ctx.calendar.length ? Cal.nights(ctx.calendar, ctx.settings.quarter).map(x => x.Date) : [];
      const MARK_KEY = { Attendance: 'a', Handbook: 'h', Participation: 'p', Extra: 'x' };
      const markTick = (p, iso, key) => { const night = ctx.season && iso ? (ctx.season.attendance || {})[iso] : null; if (!night || !p) return ''; const m = night[p[M.X.ID]] || {}; return m[key] ? '&#10003;' : ''; };
      const hrows = marks.length && !oneMark ? 2 : 1;
      let head = '<tr><th rowspan="' + hrows + '" class="num"></th><th rowspan="' + hrows + '" class="name">Name</th>' + (withTeam ? '<th rowspan="' + hrows + '" class="teamcol">' + esc(sheetQuarter(ctx)) + ' Color Team</th>' : '') +
        dates.map(d => '<th colspan="' + span + '" class="date">' + esc(d) + '</th>').join('') + '</tr>';
      if (marks.length && !oneMark) head += '<tr>' + dates.map(() => marks.map(k => '<th class="mark"><span class="rot">' + k + '</span></th>').join('')).join('') + '</tr>';
      const bodyOf = pg => {
        let body = '';
        for (let i = 0; i < ROWS_PER_PAGE; i++) {
          const p = people[pg * ROWS_PER_PAGE + i];
          const nm = p ? M.fullName(p) : '';      // a long name gets a smaller font (style.css), never an ellipsis
          body += '<tr><td class="num">' + (pg * ROWS_PER_PAGE + i + 1) + '</td><td class="name' +      // N50: every row is numbered, the blank write-in rows too; a second page carries on (21 and up)
             (nm.length > 34 ? ' xlong' : nm.length > 24 ? ' long' : '') + '">' + esc(nm) + '</td>';
          if (withTeam) { const t = p ? teamAsOf(ctx, p) : ''; body += '<td class="teamcol' + (t ? ' team-' + esc(t) : '') + '">' + esc(t) + (p && movesThisQuarter(ctx, p) ? '*' : '') + '</td>'; }
          // Each mark cell is filled from the record for that night (a tick when the mark is set); a night with no record stays blank.
          body += dates.map((_, di) => marks.map(k => '<td>' + markTick(p, isoNights[di], MARK_KEY[k]) + '</td>').join('')).join('') + '</tr>';
        }
        return body;
      };
      // A colgroup fixes every column: the name and team columns, then the rest split equally, so the date columns are the same width on every sheet whatever the number of nights or marks.
      const fixed = 23 + (withTeam ? 7 : 0), each = dates.length * span ? ((100 - fixed) / (dates.length * span)).toFixed(3) : 0;
      const cols = '<colgroup><col style="width:3%"><col style="width:20%">' + (withTeam ? '<col style="width:7%">' : '') + dates.map(() => ('<col style="width:' + each + '%">').repeat(span)).join('') + '</colgroup>';
      return Array.from({ length: pages }, (_, pg) => sheet(r + ' — ' + s.quarter + ' Attendance' + (pages > 1 ? ', page ' + (pg + 1) + ' of ' + pages : ''),
        '<table class="att">' + cols + '<thead>' + head + '</thead><tbody>' + bodyOf(pg) + '</tbody></table>', 'landscape att', [withTeam ? esc(teamNote(ctx, people)) : '', esc(printedOn(ctx))].filter(Boolean).join(' &middot; '))).join('');
    }).join('') || '<p class="empty">No clubbers to show.</p>';
  }

  // ---------- color teams (Sparks and T&T play separately) ----------
  function colorTeams(ctx) {
    // List order: color first or name first (the name column then goes first), and the name sorted by first name (the club's usual) or last name then first name ("Smith, Ann"), independently of each other.
    // N35: the name-first lists ("by name") are gone; a saved 'name' or 'nameLast' falls back to color order. N34: no Group column (the Class column already carries the group).
    const { master, settings: s } = ctx, ord = ctx.opts.order || 'color', lastFirst = ord === 'colorLast';
    const cmp = lastFirst ? byLast : byFirst, nameOf = p => lastFirst ? last(p) + ', ' + first(p) : M.fullName(p);
    return ['Sparks', 'T&T'].map(g => {
      const people = kids(master).filter(p => M.groupOf(M.room(p)) === g);
      if (!people.length) return '';
      const rows = [], row = (p, t, star) => [teamCell(t) || '<span class="none">unassigned</span>', esc(nameOf(p)) + star, esc(M.room(p))];
      const star = p => movesThisQuarter(ctx, p) ? ' *' : '';
      (ctx.season ? Season.teamOrder(ctx.season) : TEAM_COLORS).concat(['']).forEach(t => people.filter(p => teamAsOf(ctx, p) === t).sort(cmp).forEach(p => rows.push(row(p, t, star(p)))));
      const head = [sheetQuarter(ctx) + ' Color Team', lastFirst ? 'Last, first name' : 'Full name', 'Class'];
      return sheet(g + ' ' + sheetQuarter(ctx) + ' Color Teams', table(head, rows, 'tight'), 'portrait', esc(teamNote(ctx, people)));
    }).join('');
  }

  // ---------- binders: emergency contact, medical / allergy notes and No Photos together ----------
  // Class binder: one page per class, every child in it (a child with nothing on file says so, so a leader knows it was checked). Coaches binder: everyone in one list by last name, with the class.
  // Emergency contact on two lines, name then phone (stored as "Name - phone"); a contact with no phone is one line. Never more than two lines.
  // The phone, in this order: the registration's "primary phone number for a parent" (no mark); the emergency contact's own number (no mark); the registration contact's number (marked †, with a note under the table). The NAME is always the emergency contact's. With no phone at all the cell says so in bold, and a warning sits under the table.
  const parentPhone = p => M.parentPhone(p);      // 7 or more digits only: "N/A" is skipped and the next number is used (CR-02)
  const regPhone = p => M.regContactPhone(p);
  const emergOf = p => { const raw = String(M.eff(p, C.EMERG) || '').trim(), i = raw.lastIndexOf(' - '); return { name: !raw ? '' : i < 0 ? raw : raw.slice(0, i), phone: M.emergencyPhone(p) }; };
  // The club's own choice (set on the Person tab) comes after the two Planning Center answers and before the registration contact's number. It prints with no mark.
  const phoneSource = p => parentPhone(p) ? 'parent' : emergOf(p).phone ? 'own' : M.clubPhone(p) ? 'club' : regPhone(p) ? 'reg' : '';
  const EMERG_W_CLASS = [24, 28, 48], EMERG_W_CLASS_TEAM = [22, 10, 26, 42], EMERG_W_ALL = [21, 22, 10, 19, 28];      // N30, N31: everyone by name: Name, Class, Color Team, Contact, Medical (Class wide enough for "T&T Girls (Group A)", Contact narrower: it has room); a class page of Sparks or T&T has a Color Team column too, so it has its own set; Cubbies and Puggles pages keep the first      // N15: the same column positions on every class page (and on the everyone-by-name page)
  const warnCell = '<span class="nw" style="color:var(--warntxt);font-weight:700">&#9888; NO PHONE ON FILE</span>';
  const contact = p => {
    const { name } = emergOf(p), src = phoneSource(p);
    // N37 F7: every phone-shaped number in a contact cell prints as (ddd) ddd-dddd whatever way it was typed (5675550163, 513-555-0174). Text around it (a name, "&", an extension) is left as written. Display only: the stored value is not changed.
    const fmtPhone = v => String(v).replace(/(?<!\d)(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})(?!\d)/g, '($1) $2-$3');
    const ph = v => '<span class="' + (String(v).length > 16 ? 'nw nm' : 'nw') + '">' + esc(fmtPhone(v));      // a phone stays on one line, unless the field holds more than a number (N15: it then wraps inside its column instead of spilling into the next one)
    const phoneCell = src === 'parent' ? ph(parentPhone(p)) + '</span>'
      : src === 'own' ? ph(emergOf(p).phone) + '</span>'
      : src === 'club' ? ph(M.clubPhone(p)) + '</span>'
      : src === 'reg' ? ph(regPhone(p)) + ' †</span>' : warnCell;
    return [name && '<span class="nw nm">' + esc(fmtPhone(name)) + '</span>', phoneCell].filter(Boolean).join('<br>');
  };
  // "Printed 11/14/26" in the subtitle of the binder pages (emergency, medical and photos; coaches color lists), so a loose page says how old it is. Nothing when the caller gave no day (ctx.today, ISO).
  const printedOn = ctx => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ctx.today || ''); return m ? 'Printed ' + m[2] + '/' + m[3] + '/' + m[1].slice(2) : ''; };
  const parentNote = people => people.some(p => phoneSource(p) === 'reg') ? '<p class="sub">† The phone number is the registration contact\'s number. No parent\'s primary phone or emergency-contact phone is on file for that child.</p>' : '';
  const noPhoneNote = people => people.some(p => !phoneSource(p)) ? '<p class="sub" style="color:var(--warntxt);font-weight:700">&#9888; Some children have NO phone number on file. Get one from the family before club night.</p>' : '';
  const medCell = p => M.medicalText(p) ? esc(M.medicalText(p)) : '<span class="none">none reported</span>';
  const photoCell = p => M.noPhotos(p) ? '<b>No photos</b>' : '';
  // Medical notes, with "No photos" on its own line under them, in one cell (the binders' space-saving layout).
  const medAndPhotos = p => medCell(p) + (M.noPhotos(p) ? '<br><b>No photos</b>' : '');
  const binderCounts = people => people.filter(p => M.medicalText(p)).length + ' of ' + people.length + ' children have medical or allergy notes; ' + people.filter(p => M.noPhotos(p)).length + ' are marked no photos. ';
  // N30: the child's color team for the quarter being printed, as the colored cell with the color word in it (so a black-and-white print still reads it) and a * for a child who changes team that quarter. Empty for a group with no color teams.
  const teamFor = (ctx, p) => { if (!M.hasColorTeams(M.groupOf(M.room(p)))) return ''; const t = teamAsOf(ctx, p); return t ? teamCell(t) + (movesThisQuarter(ctx, p) ? '*' : '') : ''; };
  function binderClass(ctx) {
    const list = kids(ctx.master).filter(p => !ctx.opts.room || M.room(p) === ctx.opts.room);
    return roomsOf(list).map(r => { const people = list.filter(p => M.room(p) === r).sort(byFirst), teams = M.hasColorTeams(M.groupOf(r));
      const body = teams
        ? table(['Name', sheetQuarter(ctx) + ' Color Team', 'Emergency contact', 'Medical / allergy notes'], people.map(p => [esc(M.fullName(p)), teamFor(ctx, p), contact(p), medAndPhotos(p)]), 'wrap emerg', EMERG_W_CLASS_TEAM)
        : table(['Name', 'Emergency contact', 'Medical / allergy notes'], people.map(p => [esc(M.fullName(p)), contact(p), medAndPhotos(p)]), 'wrap emerg', EMERG_W_CLASS);
      return sheet(r + ' — Emergency, Medical and Photos', body + parentNote(people) + noPhoneNote(people), 'portrait', [printedOn(ctx), teams && ctx.season ? teamNote(ctx, people) : ''].filter(Boolean).join(' · ')); }).join('') || '<p class="status">No children.</p>';
  }
  // Color teams for the games leaders: one sheet for all of Sparks and one for all of T&T, each sorted by color (a heading per color), last name first, with the class. No contact details.
  // N53 (Mike, 2026-11-20): one layout for both groups: color blocks (each kept whole) flowing in two columns, the name at the left and the class at the right, so the columns are the same on every sheet and a group fits one page;
  // no column headings (they are obvious); the printed date is at the right end of the title line; the order follows the List order picker (first name first, or last name first).
  function binderTeams(ctx) {
    const q = sheetQuarter(ctx), lastFirst = (ctx.opts.order || 'color') === 'colorLast', cmp = lastFirst ? byLast : byFirst, nameOf = p => lastFirst ? last(p) + ', ' + first(p) : M.fullName(p);
    const colors = (ctx.season ? Season.teamOrder(ctx.season) : TEAM_COLORS).concat(['']);
    const out = ['Sparks', 'T&T'].map(g => { const people = kids(ctx.master).filter(p => M.groupOf(M.room(p)) === g); if (!people.length) return '';
      const blocks = colors.map(t => { const list = people.filter(p => teamAsOf(ctx, p) === t).sort(cmp); if (!list.length) return '';
        return '<div class="teamblock"><div class="teamhead"><b>' + (t ? teamCell(t) + ' team' : 'No team') + '</b> <span class="status">(' + list.length + ')</span></div>' +
          list.map(p => '<div class="teamrow"><span>' + esc(nameOf(p)) + '</span><span>' + esc(M.room(p)) + '</span></div>').join('') + '</div>'; }).join('');
      return sheet(g + ' ' + q + ' \u2014 color teams', '<div class="teamcols">' + blocks + '</div>', 'portrait', '', printedOn(ctx)); }).join('');
    return out || '<p class="empty">No color teams this quarter.</p>';
  }
  // One printable progress sheet per child, in class order, for the classes in Cubbies, Sparks and T&T. Each sheet opens on the child's current book.
  // Drawn by recordSheet (reports-season.js, which adds itself to this module): the printed record, one page per child. The on-screen entry form (App.sheets.html) is not printed any more.
  // N57 (Mike, 2026-11-20): ONE report. opts.books: 'current' (default: the child's current book, one page each: the class binder), 'all' (a page for every book the child has started: the records files) or 'blank'
  // (blank sheets with the class and year printed, the name and book written in: opts.blanks a class, default 3). opts.blanks with 'current' adds that many blanks after each class's sheets (the class binder).
  // The hidden Achievement record alias passes opts._group (and uses opts.kid) to pick one group or one child.
  function progressSheets(ctx) {
    const { master, season, opts } = ctx; if (!season) return '<p class="empty">Open or start a data file first.</p>';
    if (!api.recordSheet) return '<p class="empty">Progress sheets are not available here.</p>';
    const mode = opts.books === 'all' ? 'all' : opts.books === 'blank' ? 'blank' : 'current', nBlank = Math.max(0, parseInt(opts.blanks, 10) || 0);
    let list = kids(master).filter(p => ['Cubbies', 'Sparks', 'T&T'].includes(M.groupOf(M.room(p))));
    if (opts.room) list = list.filter(p => M.room(p) === opts.room);
    if (opts._group) list = list.filter(p => M.groupOf(M.room(p)) === opts._group);
    if (opts.kid) list = list.filter(p => p[M.X.ID] === opts.kid);
    const byRoom = []; list.sort((a, b) => M.byRoomThenName(a, b)).forEach(p => { const room = M.room(p), last = byRoom[byRoom.length - 1]; if (last && last.room === room) last.kids.push(p); else byRoom.push({ room, kids: [p] }); });
    // onepage: the print CSS starts each child on a new page (style.css, .onepage); no script is involved.
    const page = html => '<div class="onepage">' + html + '</div>', blanks = (room, n) => Array.from({ length: n }, () => page(api.blankSheet(ctx, room))).join('');
    return byRoom.map(({ room, kids: ks }) => {
      if (mode === 'blank') return blanks(room, nBlank || 3);
      const sheets = ks.map(p => { const g = M.groupOf(M.room(p)), id = p[M.X.ID];
        if (mode === 'all') return api.startedBooks(ctx, p).map((b, n) => page(api.recordSheet(ctx, p, b, { common: n === 0 }))).join('');
        const book = Season.childBook(season, id) || (Season.sheetsOf(season, id, g) || [])[0] || ''; return page(api.recordSheet(ctx, p, book)); }).join('');
      return sheets + (nBlank ? blanks(room, nBlank) : '');
    }).join('');
  }
  function binderAll(ctx) {
    const all = kids(ctx.master).sort(byLast);
    return sheet('Emergency, Medical and Photos — everyone by name', table(['Name', 'Class', sheetQuarter(ctx) + ' Team', 'Emergency contact', 'Medical / allergy notes'], all.map(p => [esc(last(p) + ', ' + first(p)), esc(M.room(p)), teamFor(ctx, p), contact(p), medAndPhotos(p)]), 'wrap emerg', EMERG_W_ALL) + parentNote(all) + noPhoneNote(all), 'portrait', [printedOn(ctx), ctx.season ? teamNote(ctx, all) : ''].filter(Boolean).join(' · '));
  }

  function photos(ctx) {
    const rows = ctx.master.people.filter(p => M.isActive(p) && M.noPhotos(p)).sort(M.byRoomThenName).map(p =>
      [esc(first(p)), esc(last(p)), esc(M.room(p)), esc((M.eff(p, C.MED) || '').replace(/[;\s]+$/, ''))]);
    return sheet('No Photos Please', table(['First Name', 'Last Name', 'Class', 'Parent note'], rows), 'portrait',
      '<span class="noprint">Flag is set automatically from parent notes on first import and can be edited on the Roster tab.</span>');      // N37 F9: screen help, not printed
  }

  // ---------- uniforms: who ordered, paid, received ----------
  // Name, class, what they wear, our size, then the dates. The two older size columns appear only when the file has them. (The parent's size from Planning Center is not shown: the club does not use it.)
  const UNI_HEAD = ['Name', 'Class', 'Item', 'Size', 'Ordered', 'Size ordered', 'Received', 'Given', 'Size given', 'Notes'];
  const uniformCols = master => { const old = M.uniformLegacy(master.people).sizes; return { old, head: UNI_HEAD.filter(h => (h !== 'Size ordered' && h !== 'Size given') || old) }; };
  const uniformHead = master => uniformCols(master).head;
  function uniformRows(master) {
    const k = uniformCols(master);
    return kids(master).filter(p => M.uniformItems(p).length).sort(M.byRoomThenName).map(p => [esc(M.fullName(p)), esc(M.room(p)), esc(M.uniformItems(p).join(', '))]
      .concat([esc(p[M.UNI.SIZE_VERIFIED]), esc(p[M.UNI.ORDERED])]).concat(k.old ? [esc(p[M.UNI.SIZE_ORDERED])] : [])
      .concat([esc(p[M.UNI.RECEIVED]), esc(p[M.UNI.GIVEN] || (p[M.UNI.GIVEN_FLAG] ? '\u2713 (no date)' : ''))]).concat(k.old ? [esc(p[M.UNI.SIZE_GIVEN])] : []).concat([esc(p[M.UNI.NOTES])]));
  }
  function uniforms(ctx) {
    const n = f => kids(ctx.master).filter(p => M.uniformItems(p).length && f(p)).length;
    const { head, old } = uniformCols(ctx.master);
    const widths = old ? [16, 10, 10, 7, 10, 7, 10, 10, 7, 13] : [19, 13, 13, 8, 10, 10, 10, 17];
    return sheet('Uniform Tracking', table(head, uniformRows(ctx.master), 'wrap uniform-tracking', widths), 'landscape',
      'Still to order: ' + n(M.uniToOrder) + ' · still to receive from Awana: ' + n(M.uniToReceive) + ' · still to give to students: ' + kids(ctx.master).filter(p => M.uniformItems(p).length && !M.uniGiven(p)).length);
  }

  // Lessons by week (N2): Date, Theme, then one column for each group that is on (Puggles, Cubbies, Sparks, T&T), from the typed lesson cells. A planned No Club night prints NO CLUB across the row; events are left out.
  // A group that is off (Sparks work through their books in turn, so they have no lesson by week) is left out. With lessons off the report says so.
  function lessons(ctx) {
    const all = ctx.calendar || [], cal = all.filter(r => r.Type !== 'Event');
    if (!cal.length) return '<p class="empty">Load a calendar on the Calendar tab first.</p>';
    const L = Cal.lessonSettings(ctx.season && ctx.season.config, all);
    if (!L.on) return '<p class="empty">Lessons by week are not turned on (Calendar tab, Lessons by week).</p>';
    const enabled = Cal.GROUPS.filter(g => L.groups[g].on);
    if (!enabled.length) return '<p class="empty">Every group is switched off for lessons by week (Calendar tab, Lessons by week).</p>';
    const clubNights = cal.filter(Cal.isNight);
    const groups = enabled.filter(g => clubNights.some(r => String(r[Cal.lessonCol(g)] ?? '').trim()));
    const head = '<tr><th>Date</th><th>Theme</th>' + groups.map(g => '<th>' + esc(g) + '</th>').join('') + '</tr>';
    const body = cal.map(r => r['No Club'] === '1'
      ? '<tr><td>' + Cal.short(r.Date) + '</td><td colspan="' + (groups.length + 1) + '"><span class="none">NO CLUB</span>' + (r.Theme ? ' <span class="none">' + esc(r.Theme) + '</span>' : '') + '</td></tr>'
      : '<tr><td>' + Cal.short(r.Date) + '</td><td>' + esc(r.Theme) + '</td>' + groups.map(g => '<td>' + esc(r[Cal.lessonCol(g)]) + '</td>').join('') + '</tr>').join('');
    return sheet('Lessons by week', '<table class="grid wrap"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>', 'portrait');
  }


  // ---------- coaches binder notes (N1): a paper block for each club night, written on during club; stores nothing ----------
  // Three blocks to a page (letter portrait, about 3in each). Events and No Club nights are not blocks (Calendar.nights is the one filter). The quarter is ctx.settings.quarter (a bundle overrides it), never opts.date.
  // A whole quarter goes on ONE letter or A4 page: one table with the column titles once at the top, and for each night a group of write-in rows (a <tbody>, kept whole) with its date and theme in the left cell.
  // Columns, like the club's Excel Notes sheet: date and theme, Workers Not Available (two columns), Supply Orders (Item, Group, Name, Size, Paid), Notes. More than NIGHTS_PER_PAGE nights share the nights evenly over more pages.
  const NIGHTS_PER_PAGE = 14, ROWS_BUDGET_IN = 9.0;      // 14 nights is a long quarter; 9.2in of rows leaves room for the title row and the gaps between nights on A4 (10.7in inside 0.25in margins) and letter (10.5in)
  const rowsFor = n => Math.max(2, Math.min(5, Math.floor(ROWS_BUDGET_IN / (n * 0.26))));      // write-in rows for each night: as many as fit at 0.26in or more a row (2 to 5), so a short quarter gets more room
  const rowHeightIn = n => Math.round(Math.min(0.36, ROWS_BUDGET_IN / (n * rowsFor(n))) * 100) / 100;
  const longDate = iso => Cal.short(iso);      // M/D, no year: the date column is narrow and the date is printed large (the quarter and the club year are known)
  // N16: the theme never sets the height of a night's block: it sits in a clipped box that is as tall as the block's rows, and a long theme is set smaller (the full theme is on the calendar).
  // N37 F5: the size follows the longest word as well as the length, so a long word is made smaller to fit its column instead of being broken in the middle.
  const themeSize = t => { const s = String(t), w = Math.max(0, ...s.split(/[\s/]+/).map(x => x.length)), byLen = s.length <= 30 ? 1 : s.length <= 60 ? 2 : 3, byWord = w <= 8 ? 1 : w <= 10 ? 2 : 3; return 'ts' + Math.max(byLen, byWord); };
  function noteNight(r, rows, h) {
    const cells = '<td></td><td class="r1"></td><td class="gp"></td><td class="c3"></td><td></td><td></td><td class="r2"></td><td class="gp"></td><td class="c8"></td>', tr = '<tr class="nr" style="height:' + h + 'in">';
    return '<tbody class="nblock">' + tr.replace('nr', 'nr nfirst') + '<th rowspan="' + rows + '" class="nhead"><div class="nh" style="max-height:' + Math.round((rows * h - 0.05) * 100) / 100 + 'in"><b>' + esc(longDate(r.Date)) + '</b>' + (r.Theme ? ' <i class="' + themeSize(r.Theme) + '">' + esc(r.Theme).replace(/([A-Za-z])\/(?=[A-Za-z])/g, '$1/<wbr>') + '</i>' : '') + '</div></th>' + cells + '</tr>' + (tr + cells + '</tr>').repeat(rows - 1) + '</tbody>';
  }
  function noteTable(list) {
    const rows = rowsFor(list.length), h = rowHeightIn(list.length);
    return '<table class="nsheet"><colgroup><col class="d"><col class="w1"><col class="w2"><col class="g"><col class="s1"><col class="s2"><col class="s3"><col class="s5"><col class="g"><col class="nt"></colgroup>' +
      '<thead><tr><th>Night</th><th colspan="2" class="r1">Workers Not Available</th><th class="gp"></th><th class="c3">Item / Size</th><th>Group</th><th>Name</th><th class="r2">Paid</th><th class="gp"></th><th class="c8">Notes</th></tr></thead>' +
      list.map(r => noteNight(r, rows, h)).join('<tbody class="ngap"><tr><td colspan="10"></td></tr></tbody>') + '</table>';      // a 3px gap between nights, as between the column groups
  }
  function noteSheets(ctx) {
    const q = ctx.settings.quarter, cal = ctx.calendar || [];
    if (!cal.length) return '<p class="empty">Load a calendar on the Calendar tab first.</p>';
    const nights = Cal.nights(cal, q);
    if (!nights.length) return '<p class="empty">No club nights in ' + esc(q) + ' on the calendar. Add them on the Calendar tab.</p>';
    const pages = Math.ceil(nights.length / NIGHTS_PER_PAGE), per = Math.ceil(nights.length / pages);
    return Array.from({ length: pages }, (_, i) => sheet('Coaches notes, ' + q + ', page ' + (i + 1) + ' of ' + pages,
      noteTable(nights.slice(i * per, (i + 1) * per)), 'portrait notes', esc(printedOn(ctx)))).join('');
  }

  // ---------- volunteers ----------
  function volunteers(ctx) {
    // Volunteers are the people whose Planning Center Selection is a volunteer. Phone and email: the first one filled in, in this order.
    const firstOf = (p, cols) => cols.map(c => M.eff(p, c)).find(v => v) || '';
    const volRank = p => M.room(p) === 'Volunteers' ? 1000 : M.roomRank(M.room(p));      // N13: class order (Puggles, Cubbies, Sparks, T&T...), then name; volunteers with no class last
    // Planning Center joins several numbers or addresses in one cell with a bare ";". Show them "a; b", and keep each one whole so a long list wraps between them (flag 16).
    const pieces = v => String(v || '').split(';').map(x => x.trim()).filter(Boolean);
    const rows = ctx.master.people.filter(p => M.isActive(p) && /volunteer/i.test(M.eff(p, C.SELECTION) || '')).sort((a, b) => volRank(a) - volRank(b) || M.room(a).localeCompare(M.room(b)) || byLast(a, b)).map(p =>['<span class="nw">' + esc(last(p) + ', ' + first(p)) + '</span>', esc(M.room(p)),
      pieces(firstOf(p, ['Mobile Phone Number', 'Home Phone Number', 'Work Phone Number', 'Other Phone Number'])).map(x => '<span class="nw">' + esc(x) + '</span>').join('; '),
      pieces(firstOf(p, ['Home Email Address', 'Work Email Address', 'Other Email Address'])).map(esc).join('; ')]);
    return sheet('Volunteer Contact List', table(['Name', 'Assignment (class)', 'Phone', 'Email'], rows, '', [24, 24, 19, 33]), 'portrait');      // N37 F4: the class column is wide enough for "T&T Girls (Group A)" on one line
  }

  // ---------- changes needed in Planning Center ----------
  function pcChanges(ctx) {
    const list = M.pendingChanges(ctx.master).sort((a, b) => M.byRoomThenName(a.person, b.person));
    const rows = list.map(c => [esc(M.fullName(c.person)), esc(c.person[C.REG]), esc(c.col), esc(c.from) || (M.isGuest(c.person) ? 'not in Planning Center' : none), '<b>' + esc(c.to) + '</b>']);
    return sheet('Changes needed in Planning Center', rows.length ? table(['Person', 'Reg ID', 'Field', 'Planning Center now', 'Change to'], rows, 'wrap') : '<p class="empty">Nothing pending.</p>',
      'landscape' + (rows.length ? '' : ' emptysheet'), '<span class="noprint">Made here as pending changes. Each clears automatically when a later export matches. Name shown is the pending value if one is set.</span>');      // N51: an explanation is screen help, not printed
  }

  function incidentReport() {
    const fields = labels => '<div class="incident-fields">' + labels.map(label =>
      '<div><b>' + label + '</b><div class="incident-line"></div></div>').join('') + '</div>';
    const writing = (label, lines) => '<div class="incident-writing"><b>' + label + '</b>' +
      '<div class="incident-line"></div>'.repeat(lines) + '</div>';
    return sheet('Incident report',
      fields(['Date of incident', 'Time', 'Location']) +
      writing('People involved and witnesses', 3) +
      writing('What happened', 6) +
      writing('Immediate action taken', 4) +
      writing('Who was notified and when', 3) +
      writing('Follow-up needed', 3) +
      fields(['Prepared by', 'Signature', 'Date']),
      'portrait punch incident');
  }

  function clubCalendar(ctx) {
    const rows = Cal.sort((ctx.calendar || []).filter(r => r && Season.isRealDate(r.Date)));
    if (!rows.length) return '<p class="status">Add dates on Calendar to print the club calendar.</p>';
    const months = new Map(), last = new Map();
    const dates = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });
    const eventDate = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' });
    const labels = { Q1: 'First', Q2: 'Second', Q3: 'Third' };
    const config = (ctx.season || {}).config || {}, showLessons = !!(ctx.opts || {}).lessons;
    const lessonConfig = Cal.lessonSettings(config, rows);
    const groups = showLessons && lessonConfig.on ? Cal.GROUPS.filter(group => lessonConfig.groups[group].on) : [];
    rows.filter(Cal.isNight).forEach(row => last.set(row.Quarter, row));
    rows.forEach(row => {
      const month = row.Date.slice(0, 7);
      if (!months.has(month)) months.set(month, { nights: [], events: [] });
      const m = months.get(month), when = new Date(row.Date + 'T12:00:00Z');
      const time = Cal.timeText(row['Start Time'], row['End Time']);
      if (row.Type === 'Event') {
        m.events.push({ html: '<div class="calevent"><strong>' + esc(eventDate.format(when)) + '</strong><div>' +
          esc([row.Theme || 'Event', time].filter(Boolean).join(' · ')) + '</div>' + (row.Notes ? '<div>' + esc(row.Notes) + '</div>' : '') +
          '</div>', lines: 2 + Math.ceil((row.Notes || '').length / 42) });
        return;
      }
      const cancellation = row.Cancelled && row.Cancelled !== 'Cancelled' ? ' (' + row.Cancelled + ')' : '';
      const title = !Cal.isNight(row) ? (row.Cancelled ? 'CANCELLED' + cancellation : 'NO CLUB') : row.Theme || 'Club night';
      const date = Cal.short(row.Date) + '/' + row.Date.slice(0, 4), quarter = labels[row.Quarter] && last.get(row.Quarter) === row;
      const lessons = (Cal.isNight(row) || row.Cancelled) ? groups.map(group => {
        const text = row[Cal.lessonCol(group)];
        return text && text !== '-' ? group + ' ' + text : '';
      }).filter(Boolean).join(' · ') : '';
      const lesson = '<div class="callessons">' + (row.Cancelled ? '<s>' + esc(lessons) + '</s>' : esc(lessons)) + '</div>';
      m.nights.push({ html: '<div class="caldate"><strong>' + esc(date) + '</strong> ' + esc(title) +
        (time ? ' · ' + esc(time) : '') + (row.Holiday ? ' <small>' + esc(row.Holiday) + '</small>' : '') +
        (lessons ? lesson : '') + (quarter ? '<div class="calq">End of ' + labels[row.Quarter] + ' Quarter</div>' : '') + '</div>',
        lines: Math.max(1, Math.ceil((date.length + title.length + time.length + (row.Holiday || '').length) / 42)) + Math.ceil(lessons.length / 42) + Number(!!quarter) });
    });
    const maxLines = 46, columns = [{ blocks: [], used: 0 }];
    const current = () => columns.at(-1);
    function addBlock(month, items) {
      const lines = 1 + items.reduce((sum, item) => sum + item.lines, 0);
      if (current().used && current().used + lines > maxLines) columns.push({ blocks: [], used: 0 });
      current().blocks.push('<section class="calmonth"><h3>' + esc(dates.format(new Date(month + '-01T12:00:00Z'))) +
        '</h3>' + items.map(item => item.html).join('') + '</section>');
      current().used += lines;
    }
    for (const [month, parts] of months) {
      let lines = 1, chunk = [];
      for (const item of parts.nights.concat(parts.events)) {
        if (chunk.length && lines + item.lines > maxLines) { addBlock(month, chunk); chunk = []; lines = 1; }
        chunk.push(item); lines += item.lines;
      }
      addBlock(month, chunk);
    }
    const history = ((ctx.season || {}).history || []).slice().reverse();
    const latest = history.find(e => (e.changes || []).some(c => c.p[0] === 'calendar' ||
      (c.p[0] === 'config' && ['breaks', 'easterFlag', 'lessons', 'clubTagline', 'clubTitle'].includes(c.p[1]))));
    const date = latest ? String(latest.t || '').slice(0, 10) : ctx.today;
    const updated = Season.isRealDate(date) ? 'Updated ' + Cal.short(date) + '/' + date.slice(2, 4) : '';
    const title = (ctx.settings || {}).club || 'Club calendar', pages = [];
    for (let i = 0; i < columns.length; i += 2) {
      const body = '<div class="calcols">' + columns.slice(i, i + 2).map(col => '<div>' + col.blocks.join('') + '</div>').join('') + '</div>';
      pages.push(sheet(title + (i ? ' (continued)' : ''), body, 'portrait clubcal', esc(config.clubTagline || ''), updated));
    }
    return pages.join('');
  }

  const LIST = [
    { id: 'attendance', title: 'Attendance sheets (per room)', render: attendance, opts: ['room', 'quarter'] },
    { id: 'teams', title: 'Color teams (Sparks, T&T)', render: colorTeams, opts: ['order', 'quarter'] },
    { id: 'binderClass', title: 'Emergency, medical and photos by class (class binders)', render: binderClass, opts: ['room', 'quarter'] },
    { id: 'binderAll', title: 'Emergency, medical and photos, everyone by name (coaches binder)', render: binderAll, opts: ['quarter'] },
    { id: 'binderTeams', title: 'Color teams by group and color (coaches binder)', render: binderTeams, opts: ['order', 'quarter'] },
    { id: 'clubCalendar', title: 'Club calendar (families and coaches)', render: clubCalendar, opts: ['lessons'], requiresRoster: false },
    { id: 'noteSheets', title: 'Coaches binder notes (a block for each club night)', render: noteSheets, opts: ['quarter'] },
    { id: 'progressSheets', title: 'Progress sheets, each child, by class (class binder)', render: progressSheets, opts: ['room', 'kid', 'books'] },
    { id: 'photos', title: 'No photos', render: photos },
    { id: 'uniforms', title: 'Uniform tracking', render: uniforms },
    { id: 'lessons', title: 'Lessons by week', render: lessons },
    { id: 'volunteers', title: 'Volunteer contact list', render: volunteers },
    { id: 'pcChanges', title: 'Changes needed in Planning Center', render: pcChanges },
    { id: 'incidentReport', title: 'Blank incident report', render: incidentReport, requiresRoster: false },
  ];

  // ---------- report bundles: a named list of reports printed together (for example everything needed at the start of a quarter) ----------
  // A bundle is { name, items: [{ report: <id of a report in LIST>, room?: <one class>, group?: <Sparks or T&T> }] }. config.bundles holds the club's own; until one is saved here the standard bundle is used.
  const DEFAULT_BUNDLES = () => [{ name: 'Quarterly Printables', items: [{ report: 'attendance' }, { report: 'binderClass' }, { report: 'teams' }, { report: 'binderAll' }] },
    { name: 'Coaches binder', items: [{ report: 'binderClass' }, { report: 'binderAll' }, { report: 'volunteers' }, { report: 'binderTeams' }, { report: 'noteSheets' }, { report: 'clubCalendar' }] },
    { name: 'Class binder', perClass: true, items: [{ report: 'attendance' }, { report: 'binderClass' }, { report: 'volunteers' }, { report: 'progressSheets' }] },
    { name: 'Club night pack', items: [{ report: 'announceList' }, { report: 'handOut' }] }];      // N9 point 13: the awards read and handed out on the night      // perClass: the Class picker applies to each part (Reports tab and the Print class binders pop-up)      // a starting point: the club edits it under Options > Report bundles
  // Reports that were folded into others or dropped (1.50.35): a saved bundle that names one keeps working. The emergency-contact and medical lists became the class binder (by class) and the coaches binder (everyone by name),
  // and the master schedule, nightly rotation, attendance summary and weekly award slips reports are gone, so a bundle simply skips them.
  const REPORT_ALIAS = { ecClass: 'binderClass', medical: 'binderClass', medicalClass: 'binderClass', ecName: 'binderAll', medicalAll: 'binderAll' }, REPORT_GONE = ['schedule', 'rotation', 'attendanceSummary', 'weeklySlips'];      // weeklySlips (1.51.15e): the Awards to hand out strips list every award waiting, so a bundle that named the weekly slips simply skips it
  const tidyBundle = b => { const seen = new Set(); const out = Object.assign({}, b, { items: (b.items || []).map(it => REPORT_ALIAS[it.report] ? Object.assign({}, it, { report: REPORT_ALIAS[it.report] }) : it).filter(it => !REPORT_GONE.includes(it.report)).filter(it => { const k = it.report + '|' + (it.room || '') + '|' + (it.group || ''); if (seen.has(k)) return false; seen.add(k); return true; }) });
    // A bundle saved before 1.51.15c has no perClass: one that holds the per-class pages (attendance, roster, progress sheets) and names no class is a class binder, so the Class picker applies to it.
    if (out.perClass === undefined) out.perClass = out.items.some(it => it.report === 'progressSheets') && out.items.some(it => it.report === 'binderClass') && !out.items.some(it => it.room);
    return out; };
  const bundlesOf = season => season && Array.isArray(season.config && season.config.bundles) && season.config.bundles.length ? season.config.bundles.map(tidyBundle) : DEFAULT_BUNDLES();
  // The night the quarter's sheets are "as of": its first club night on the calendar (a team move or one-night exception later in the quarter does not change a binder page printed before it starts).
  const firstNightOf = (calendar, q) => ((calendar || []).filter(r => Cal.isNight(r) && r.Quarter === q).map(r => r.Date).sort()[0]) || '';
  // The quarter after the one we are in; before the first night, Q1; after Q4's start, Q4.
  function nextQuarter(calendar, today, current) {
    const Q = ['Q1', 'Q2', 'Q3', 'Q4'], row = (calendar || []).filter(r => Cal.isNight(r) && r.Date <= today).sort((a, b) => a.Date < b.Date ? -1 : 1).pop();
    const q = row && row.Quarter ? row.Quarter : (calendar || []).length ? '' : current;
    return q ? Q[Math.min(3, Q.indexOf(q) + 1)] : 'Q1';
  }
  function runBundle(ctx, bundle, quarter) {
    // Before the quarter starts its pages are "as of its first night"; once it has started they show the color each child plays now (a move later in the quarter must not print on a binder reprinted mid-quarter).
    const first = firstNightOf(ctx.calendar, quarter), todayStr = ctx.today || new Date().toLocaleDateString('en-CA');
    const settings = Object.assign({}, ctx.settings, { quarter }), date = first && todayStr < first ? first : '', out = [];
    // "Planning Center data as of" goes only under the pages that carry Planning Center contact and medical data (the same pages as a single report), not under attendance sheets or team lists.
    const CONTACT = ['binderClass', 'binderAll', 'volunteers', 'photos'], asOf = html => ctx.master && ctx.master.pcAsOf ? html.replace(/<\/h2>/g, '</h2><p class="sub asof">Planning Center data as of ' + esc(ctx.master.pcAsOf) + '</p>') : html;
    (bundle.items || []).forEach(it => { const def = LIST.find(r => r.id === it.report); if (!def) return;
      const h = def.render(Object.assign({}, ctx, { settings, opts: Object.assign({}, ctx.opts, { room: it.room || '', group: it.group || (def.opts && def.opts.includes('groupAll') ? '' : ctx.opts.group), date, asOfFirst: !!date, blanks: it.blanks || 0, books: it.books || '' }) })); out.push(CONTACT.includes(def.id) ? asOf(h) : h); });
    return out.join('');
  }
  const api = { LIST, DEFAULT_BUNDLES, bundlesOf, runBundle, nextQuarter, firstNightOf, esc, NIGHTS_PER_PAGE, rowsFor, TEAM_COLORS, kids, roomsOf, nightDates, uniformRows, uniformHead, UNI_HEAD, table };
  if (typeof module !== 'undefined') module.exports = api; else root.Reports = api;
})(this);
