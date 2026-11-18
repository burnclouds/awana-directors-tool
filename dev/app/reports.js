(this.AwanaVersions = this.AwanaVersions || {})['reports.js'] = '1.17.3';
// Print reports. Each render(ctx) returns HTML; ctx = { master, settings, opts }.
(function (root) {
  const M = root.Model || (typeof require !== 'undefined' ? require('./model.js') : null);
  const Cal = root.Calendar || (typeof require !== 'undefined' ? require('./calendar.js') : null);
  const Season = root.Season || (typeof require !== 'undefined' ? require('./season.js') : null);
  const { C } = M;

  const esc = M.esc;      // shared (model.js)
  const TEAM_COLORS = ['Red', 'Blue', 'Green', 'Yellow'];
  const MIN_ROWS = 25;

  const kids = m => m.people.filter(p => M.isActive(p) && M.isClubber(p));
  const adults = m => m.people.filter(p => M.isActive(p) && M.isVolunteer(p));
  const first = p => M.eff(p, C.FIRST), last = p => M.eff(p, C.LAST);
  const byFirst = (a, b) => first(a).localeCompare(first(b)) || last(a).localeCompare(last(b));
  const byLast = (a, b) => last(a).localeCompare(last(b)) || first(a).localeCompare(first(b));
  const roomsOf = list => [...new Set(list.map(M.room))].sort((a, b) => M.roomRank(a) - M.roomRank(b) || a.localeCompare(b));
  const none = '<span class="none">none on file</span>';

  function table(headers, rows, cls) {
    return '<table class="grid ' + (cls || '') + '"><thead><tr>' + headers.map(h => '<th>' + esc(h) + '</th>').join('') +
      '</tr></thead><tbody>' + rows.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
  }
  const sheet = (title, body, orient, sub) =>
    '<section class="sheet ' + (orient || 'portrait') + '"><h2>' + esc(title) + '</h2>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + body + '</section>';
  const teamCell = t => t ? '<span class="team team-' + esc(t) + '">' + esc(t) + '</span>' : '';

  // Team on the sheet's night: a move or one-night exception in the data file wins over the quarter color. * marks a child who changes team this quarter.
  // A sheet for a chosen night uses that night's quarter from the calendar (a date in Q3 under a Q2 setting would mix the two); with no date it uses the chosen quarter.
  const sheetQuarter = ctx => { const d = ctx.opts && ctx.opts.date, r = d && (ctx.calendar || []).find(x => x.Date === d); return r && r.Quarter ? r.Quarter : ctx.settings.quarter; };
  // With a night chosen: the team that night (Season.teamOn). With none (the Color teams list, the coaches list, a binder printed in the quarter): the color the child plays NOW, i.e. the latest move in the quarter (Season.quarterColor), so a moved child is not printed on last month's team.
  // opts.asOfFirst: a binder printed before the quarter starts is "as of its first night" by the app's own choice, not because anyone chose that night: it is a quarter-long page, so a one-night fill-in recorded on that night must not set the printed team (moves still count).
  const movesAsOf = (s, id, d, q, dflt) => Season.movesOf(s, id).filter(x => x.q === q && x.from <= d).reduce((t, x) => x.team, dflt || '');
  const teamAsOf = (ctx, p) => { const q = sheetQuarter(ctx), d = ctx.opts && ctx.opts.date, t = M.teamOf(p, q); return !ctx.season ? t : d ? (ctx.opts.asOfFirst ? movesAsOf : Season.teamOn)(ctx.season, p[M.X.ID], d, q, t) : Season.quarterColor(ctx.season, p[M.X.ID], q, t); };
  const movesThisQuarter = (ctx, p) => !!ctx.season && Season.movesOf(ctx.season, p[M.X.ID]).some(m => m.q === sheetQuarter(ctx));
  const teamNote = ctx => !ctx.season ? '' : ctx.opts && ctx.opts.date ? 'Teams as of ' + ctx.opts.date + '. * = changes team this quarter.' : sheetQuarter(ctx) + ' teams. * = changes team during the quarter.';

  // ---------- attendance sheets (one page per room, every kid in the room) ----------
  const MARKS = {
    Puggles: ['Attendance'], Cubbies: ['Attendance', 'Extra'],
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
      const rows = Math.max(MIN_ROWS, people.length + 3), span = Math.max(1, marks.length);
      const isoNights = ctx.calendar && ctx.calendar.length ? Cal.nights(ctx.calendar, ctx.settings.quarter).map(x => x.Date) : [];
      const MARK_KEY = { Attendance: 'a', Handbook: 'h', Participation: 'p', Extra: 'x' };
      const markTick = (p, iso, key) => { const night = ctx.season && iso ? (ctx.season.attendance || {})[iso] : null; if (!night || !p) return ''; const m = night[p[M.X.ID]] || {}; return m[key] ? '&#10003;' : ''; };
      let head = '<tr><th rowspan="2" class="name">Name</th>' + (withTeam ? '<th rowspan="2" class="teamcol">' + esc(sheetQuarter(ctx)) + ' Color Team</th>' : '') +
        dates.map(d => '<th colspan="' + span + '" class="date">' + esc(d) + '</th>').join('') + '</tr>';
      if (marks.length) head += '<tr>' + dates.map(() => marks.map(k => '<th class="mark"><span class="rot">' + k + '</span></th>').join('')).join('') + '</tr>';
      let body = '';
      for (let i = 0; i < rows; i++) {
        const p = people[i];
        const nm = p ? M.fullName(p) : '';      // a long name gets a smaller font (style.css), never an ellipsis
        body += '<tr><td class="name' + (nm.length > 34 ? ' xlong' : nm.length > 24 ? ' long' : '') + '">' + esc(nm) + '</td>';
        if (withTeam) { const t = p ? teamAsOf(ctx, p) : ''; body += '<td class="teamcol' + (t ? ' team-' + esc(t) : '') + '">' + esc(t) + (p && movesThisQuarter(ctx, p) ? '*' : '') + '</td>'; }
        // Each mark cell is filled from the record for that night (a tick when the mark is set); a night with no record stays blank.
        body += dates.map((_, di) => marks.map(k => '<td>' + markTick(p, isoNights[di], MARK_KEY[k]) + '</td>').join('')).join('') + '</tr>';
      }
      // A colgroup fixes every column: the name and team columns, then the rest split equally, so the date columns are the same width on every sheet whatever the number of nights or marks.
      const fixed = 20 + (withTeam ? 7 : 0), each = dates.length * span ? ((100 - fixed) / (dates.length * span)).toFixed(3) : 0;
      const cols = '<colgroup><col style="width:20%">' + (withTeam ? '<col style="width:7%">' : '') + dates.map(() => ('<col style="width:' + each + '%">').repeat(span)).join('') + '</colgroup>';
      return sheet(r + ' — ' + s.quarter + ' Attendance', '<table class="att">' + cols + '<thead>' + head + '</thead><tbody>' + body + '</tbody></table>', 'landscape', withTeam ? esc(teamNote(ctx)) : '');
    }).join('') || '<p class="empty">No clubbers to show.</p>';
  }

  // ---------- color teams (Sparks and T&T play separately) ----------
  function colorTeams(ctx) {
    // List order: color first or name first (the name column then goes first), and the name sorted by first name (the club's usual) or last name then first name ("Smith, Ann"), independently of each other.
    const { master, settings: s } = ctx, ord = ctx.opts.order || 'color', byName = ord === 'name' || ord === 'nameLast', lastFirst = ord === 'colorLast' || ord === 'nameLast';
    const cmp = lastFirst ? byLast : byFirst, nameOf = p => lastFirst ? last(p) + ', ' + first(p) : M.fullName(p);
    return ['Sparks', 'T&T'].map(g => {
      const people = kids(master).filter(p => M.groupOf(M.room(p)) === g);
      if (!people.length) return '';
      const rows = [], row = (p, t, star) => byName
        ? [esc(g), esc(nameOf(p)) + star, teamCell(t) || '<span class="none">unassigned</span>', esc(M.room(p))]
        : [esc(g), teamCell(t) || '<span class="none">unassigned</span>', esc(nameOf(p)) + star, esc(M.room(p))];
      const star = p => movesThisQuarter(ctx, p) ? ' *' : '';
      if (byName) people.slice().sort(cmp).forEach(p => rows.push(row(p, teamAsOf(ctx, p), star(p))));
      else (ctx.season ? Season.teamOrder(ctx.season) : TEAM_COLORS).concat(['']).forEach(t => people.filter(p => teamAsOf(ctx, p) === t).sort(cmp).forEach(p => rows.push(row(p, t, star(p)))));
      const head = byName ? ['Group', lastFirst ? 'Last, first name' : 'Full name', sheetQuarter(ctx) + ' Color Team', 'Class'] : ['Group', sheetQuarter(ctx) + ' Color Team', lastFirst ? 'Last, first name' : 'Full name', 'Class'];
      return sheet(g + ' ' + sheetQuarter(ctx) + ' Color Teams' + (byName ? ' (by name)' : ''), table(head, rows, 'tight'), 'portrait', esc(teamNote(ctx)));
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
  const warnCell = '<span class="nw" style="color:var(--warntxt);font-weight:700">&#9888; NO PHONE ON FILE</span>';
  const contact = p => {
    const { name } = emergOf(p), src = phoneSource(p);
    const phoneCell = src === 'parent' ? '<span class="nw">' + esc(parentPhone(p)) + '</span>'
      : src === 'own' ? '<span class="nw">' + esc(emergOf(p).phone) + '</span>'
      : src === 'club' ? '<span class="nw">' + esc(M.clubPhone(p)) + '</span>'
      : src === 'reg' ? '<span class="nw">' + esc(regPhone(p)) + ' †</span>' : warnCell;
    return [name && '<span class="nw">' + esc(name) + '</span>', phoneCell].filter(Boolean).join('<br>');
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
  function binderClass(ctx) {
    const list = kids(ctx.master).filter(p => !ctx.opts.room || M.room(p) === ctx.opts.room);
    return roomsOf(list).map(r => { const people = list.filter(p => M.room(p) === r).sort(byFirst);
      return sheet(r + ' — Emergency, Medical and Photos', table(['Name', 'Emergency contact', 'Medical / allergy notes'], people.map(p => [esc(M.fullName(p)), contact(p), medAndPhotos(p)]), 'wrap emerg') + parentNote(people) + noPhoneNote(people), 'portrait', printedOn(ctx)); }).join('') || '<p class="status">No children.</p>';
  }
  // Color teams for the games leaders: one sheet for all of Sparks and one for all of T&T, each sorted by color (a heading per color), last name first, with the class. No contact details.
  function binderTeams(ctx) {
    const q = sheetQuarter(ctx), colors = (ctx.season ? Season.teamOrder(ctx.season) : TEAM_COLORS).concat(['']);
    const out = ['Sparks', 'T&T'].map(g => { const people = kids(ctx.master).filter(p => M.groupOf(M.room(p)) === g); if (!people.length) return '';
      const rows = colors.map(t => { const list = people.filter(p => teamAsOf(ctx, p) === t).sort(byLast); if (!list.length) return '';
        return '<tr class="colorhead"><td colspan="2"><b>' + (t ? teamCell(t) + ' team' : 'No team') + '</b> <span class="status">(' + list.length + ')</span></td></tr>' +
          list.map(p => '<tr><td>' + esc(last(p) + ', ' + first(p)) + '</td><td>' + esc(M.room(p)) + '</td></tr>').join(''); }).join('');
      return sheet(g + ' ' + q + ' — color teams', '<table class="roster teamlist"><thead><tr><th>Last, first name</th><th>Class</th></tr></thead><tbody>' + rows + '</tbody></table>', 'portrait', printedOn(ctx)); }).join('');
    return out || '<p class="empty">No color teams this quarter.</p>';
  }
  // One printable progress sheet per child, in class order, for the classes in Cubbies, Sparks and T&T. Each sheet opens on the child's current book.
  // Drawn by recordSheet (reports-season.js, which adds itself to this module): the printed record, one page per child. The on-screen entry form (App.sheets.html) is not printed any more.
  function progressSheets(ctx) {
    const { master, season, opts } = ctx; if (!season) return '<p class="empty">Open or start a data file first.</p>';
    if (!api.recordSheet) return '<p class="empty">Progress sheets are not available here.</p>';
    let list = kids(master).filter(p => ['Cubbies', 'Sparks', 'T&T'].includes(M.groupOf(M.room(p))));
    if (opts.room) list = list.filter(p => M.room(p) === opts.room);
    return list.sort((a, b) => M.byRoomThenName(a, b)).map(p => {
      const g = M.groupOf(M.room(p)), id = p[M.X.ID], book = Season.childBook(season, id) || (Season.sheetsOf(season, id, g) || [])[0] || '';
      // onepage: the print CSS starts each child on a new page (style.css, .onepage); no script is involved.
      return '<div class="onepage">' + api.recordSheet(ctx, p, book) + '</div>';
    }).join('');
  }
  function binderAll(ctx) {
    const all = kids(ctx.master).sort(byLast);
    return sheet('Emergency, Medical and Photos — everyone by name', table(['Name', 'Class', 'Emergency contact', 'Medical / allergy notes'], all.map(p => [esc(last(p) + ', ' + first(p)), esc(M.room(p)), contact(p), medAndPhotos(p)]), 'wrap emerg') + parentNote(all) + noPhoneNote(all), 'portrait', printedOn(ctx));
  }

  function photos(ctx) {
    const rows = ctx.master.people.filter(p => M.isActive(p) && M.noPhotos(p)).sort(M.byRoomThenName).map(p =>
      [esc(first(p)), esc(last(p)), esc(M.room(p)), esc((M.eff(p, C.MED) || '').replace(/[;\s]+$/, ''))]);
    return sheet('No Photos Please', table(['First Name', 'Last Name', 'Class', 'Parent note'], rows), 'portrait',
      'Flag is set automatically from parent notes on first import and can be edited on the Roster tab.');
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
    return sheet('Uniform Tracking', table(uniformHead(ctx.master), uniformRows(ctx.master), 'wrap'), 'landscape',
      'Still to order: ' + n(M.uniToOrder) + ' · still to receive from Awana: ' + n(M.uniToReceive) + ' · still to give to students: ' + kids(ctx.master).filter(p => M.uniformItems(p).length && !M.uniGiven(p)).length);
  }

  function lessons(ctx) {
    const cal = (ctx.calendar || []).filter(r => r.Type !== 'Event');
    if (!cal.length) return '<p class="empty">Load a calendar on the Calendar tab first.</p>';
    const rows = cal.map(r => r['No Club'] === '1'
      ? [Cal.short(r.Date), '<span class="none">NO CLUB</span>', '', '', '']
      : [Cal.short(r.Date), esc(r['Cubbies Lesson']), esc([r['Puggles #'], r['Puggles Title']].filter(Boolean).join(' ')), esc(r['Sparks Lesson']), esc(r['T&T Lesson'])]);
    return sheet('Lessons', table(['Date', 'Cubbies', 'Puggles', 'Sparks', 'T&T'], rows, 'wrap'), 'portrait');
  }


  // ---------- volunteers ----------
  function volunteers(ctx) {
    // Volunteers are the people whose Planning Center Selection is a volunteer. Phone and email: the first one filled in, in this order.
    const firstOf = (p, cols) => cols.map(c => M.eff(p, c)).find(v => v) || '';
    // Planning Center joins several numbers or addresses in one cell with a bare ";". Show them "a; b", and keep each one whole so a long list wraps between them (flag 16).
    const pieces = v => String(v || '').split(';').map(x => x.trim()).filter(Boolean);
    const rows = ctx.master.people.filter(p => M.isActive(p) && /volunteer/i.test(M.eff(p, C.SELECTION) || '')).sort(byLast).map(p =>['<span class="nw">' + esc(last(p) + ', ' + first(p)) + '</span>', esc(M.room(p)),
      pieces(firstOf(p, ['Mobile Phone Number', 'Home Phone Number', 'Work Phone Number', 'Other Phone Number'])).map(x => '<span class="nw">' + esc(x) + '</span>').join('; '),
      pieces(firstOf(p, ['Home Email Address', 'Work Email Address', 'Other Email Address'])).map(esc).join('; ')]);
    return sheet('Volunteer Contact List', table(['Name', 'Assignment (class)', 'Phone', 'Email'], rows), 'portrait');
  }

  // ---------- changes needed in Planning Center ----------
  function pcChanges(ctx) {
    const list = M.pendingChanges(ctx.master).sort((a, b) => M.byRoomThenName(a.person, b.person));
    const rows = list.map(c => [esc(M.fullName(c.person)), esc(c.person[C.REG]), esc(c.col), esc(c.from) || (M.isGuest(c.person) ? 'not in Planning Center' : none), '<b>' + esc(c.to) + '</b>']);
    return sheet('Changes needed in Planning Center', rows.length ? table(['Person', 'Reg ID', 'Field', 'Planning Center now', 'Change to'], rows, 'wrap') : '<p class="empty">Nothing pending.</p>',
      'landscape', 'Made here as pending changes. Each clears automatically when a later export matches. Name shown is the pending value if one is set.');
  }

  const LIST = [
    { id: 'attendance', title: 'Attendance sheets (per room)', render: attendance, opts: ['room', 'quarter'] },
    { id: 'teams', title: 'Color teams (Sparks, T&T)', render: colorTeams, opts: ['order', 'quarter'] },
    { id: 'binderClass', title: 'Emergency, medical and photos by class (class binders)', render: binderClass, opts: ['room'] },
    { id: 'binderAll', title: 'Emergency, medical and photos, everyone by name (coaches binder)', render: binderAll },
    { id: 'binderTeams', title: 'Color teams by group and color (coaches binder)', render: binderTeams, opts: ['quarter'] },
    { id: 'progressSheets', title: 'Progress sheets, each child, by class (class binder)', render: progressSheets, opts: ['room'] },
    { id: 'photos', title: 'No photos', render: photos },
    { id: 'uniforms', title: 'Uniform tracking', render: uniforms },
    { id: 'lessons', title: 'Lessons by week', render: lessons },
    { id: 'volunteers', title: 'Volunteer contact list', render: volunteers },
    { id: 'pcChanges', title: 'Changes needed in Planning Center', render: pcChanges },
  ];

  // ---------- report bundles: a named list of reports printed together (for example everything needed at the start of a quarter) ----------
  // A bundle is { name, items: [{ report: <id of a report in LIST>, room?: <one class>, group?: <Sparks or T&T> }] }. config.bundles holds the club's own; until one is saved here the standard bundle is used.
  const DEFAULT_BUNDLES = () => [{ name: 'Quarterly Printables', items: [{ report: 'attendance' }, { report: 'binderClass' }, { report: 'teams' }, { report: 'binderAll' }] },
    { name: 'Coaches binder', items: [{ report: 'binderClass' }, { report: 'binderAll' }, { report: 'volunteers' }, { report: 'binderTeams' }] },
    { name: 'Class binder', perClass: true, items: [{ report: 'attendance' }, { report: 'binderClass' }, { report: 'volunteers' }, { report: 'progressSheets' }] }];      // perClass: the Class picker applies to each part (Reports tab and the Print class binders pop-up)      // a starting point: the club edits it under Options > Report bundles
  // Reports that were folded into others or dropped (1.50.35): a saved bundle that names one keeps working. The emergency-contact and medical lists became the class binder (by class) and the coaches binder (everyone by name),
  // and the master schedule, nightly rotation and attendance summary reports are gone, so a bundle simply skips them.
  const REPORT_ALIAS = { ecClass: 'binderClass', medical: 'binderClass', medicalClass: 'binderClass', ecName: 'binderAll', medicalAll: 'binderAll' }, REPORT_GONE = ['schedule', 'rotation', 'attendanceSummary'];
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
      const h = def.render(Object.assign({}, ctx, { settings, opts: Object.assign({}, ctx.opts, { room: it.room || '', group: it.group || ctx.opts.group, date, asOfFirst: !!date }) })); out.push(CONTACT.includes(def.id) ? asOf(h) : h); });
    return out.join('');
  }
  const api = { LIST, DEFAULT_BUNDLES, bundlesOf, runBundle, nextQuarter, firstNightOf, esc, TEAM_COLORS, kids, roomsOf, nightDates, uniformRows, uniformHead, UNI_HEAD, table };
  if (typeof module !== 'undefined') module.exports = api; else root.Reports = api;
})(this);
