(this.AwanaVersions = this.AwanaVersions || {})['validate.js'] = '1.13.1';
// File checks for the Validate and Debug tabs. Pure functions: text in, findings out (nothing is read from or written to disk).
//   validate(text, name) -> { kind, findings: [{ level: 'error' | 'warn' | 'info', msg, check }] }   (check: the part of the file the finding is about: a section name, 'config', 'roster', 'ghosts', 'calendar', 'history', 'replay' or 'file')
//   inspect(text, name, lastModifiedMs) -> { kind, nameStamp, modified, facts }   (the dates and counts shown on the Debug tab)
// Kinds: data (the season JSON), pc (Planning Center export), calendar, colors, master (old), rotation, json (some other JSON), '' (unknown).
(function (root) {
  const Csv = root.Csv || require('./csv.js'), Intake = root.Intake || require('./intake.js'), M = root.Model || require('./model.js'), Calendar = root.Calendar || require('./calendar.js'), Season = root.Season || require('./season.js');
  const { C } = M, isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const TEAMS = Season.TEAMS, MARKS = Season.MARKS;
  const z = n => String(n).padStart(2, '0');

  const isDate = Season.isRealDate;                                    // one rule for "a real date" here and when a data file is opened
  const isTime = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(s) && !isNaN(Date.parse(s));
  const local = ms => { const d = new Date(ms); return isNaN(d) ? '' : d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds()); };
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const canon = x => Array.isArray(x) ? x.map(canon) : isObj(x) ? Object.keys(x).sort().reduce((o, k) => { o[k] = canon(x[k]); return o; }, {}) : x;

  function detect(text) {
    const t = String(text || '').replace(/^﻿/, '').trimStart();
    if (t.startsWith('{')) { try { return JSON.parse(t).format === Season.FORMAT ? 'data' : 'json'; } catch (e) { return 'json'; } }
    let first = []; try { first = Csv.parse(t)[0] || []; } catch (e) { return ''; }
    if (first.includes(M.X.ID)) return 'master';
    if (first.includes('Date') && first.includes('Quarter')) return 'calendar';
    if (first[0] === 'Time') return 'rotation';
    if (first.includes(C.FIRST) && first.includes(C.LAST) || first.includes('Assignment Area: Classes')) return 'pc';
    if ((first.includes('Unique ID') || first.includes('Name')) && first.some(h => /^q[1-4]$|^colou?r$|^team$/i.test(h.trim()))) return 'colors';
    return '';
  }

  // What the data-file check covers. test/validate.test.js fails when a section (Season.SECTIONS) or a config key the code uses is missing here, so a new
  // one cannot be added without a check; each entry is exercised by a mutation test there.
  const CHECKED_SECTIONS = ['config', 'handbooks', 'attendance', 'awards', 'given', 'givenNoDate', 'held', 'flags', 'doneBooks', 'received', 'adults', 'teamMoves', 'games', 'progress', 'progressNoDate', 'extraSheets', 'announcedNoDate', 'blueWings', 'blueOverrides', 'blueDrops', 'pastTurnout', 'absences', 'roster', 'calendar', 'rotation'];      // (history is checked too, but is not one of Season.SECTIONS: it is the record of changes to them)
  const CHECKED_CONFIG = ['clubDay', 'blueJewelWeeks', 'teamOrder', 'saveStyleDrive', 'saveStyleLocal', 'autoUpdate', 'autoSave', 'drivePinDays', 'sparksBooks', 'yearBook', 'placePoints', 'books', 'progress', 'awardLists', 'exclude', 'completion', 'endOfYear', 'store', 'teamPlan', 'teamsOk', 'todoIgnored', 'driveDirs', 'bundles', 'bookOrder', 'slideNames', 'medRead', 'medPrinted', 'clubTitle', 'driveKeepName', 'cubbiesDetail', 'tntBook', 'carriedThrough', 'bugButton'];

  // ---------- the data file ----------
  function validateData(text, name, out) {
    let cur = 'file';      // the part of the file the next finding is about (set before each block below)
    const err = m => out.push({ level: 'error', msg: m, check: cur }), warn = m => out.push({ level: 'warn', msg: m, check: cur }), info = m => out.push({ level: 'info', msg: m, check: cur });
    let o; try { o = JSON.parse(String(text).replace(/^﻿/, '')); } catch (e) { return err('This is not valid JSON (' + e.message + ').'); }
    if (!isObj(o)) return err('This is not an AWANA data file.');
    if (o.format !== Season.FORMAT) return err('This is not an AWANA data file (its format is ' + (o.format === undefined ? 'missing' : '"' + o.format + '"') + ').');
    if (!(o.version <= Season.VERSION)) return err('This file is from a newer version of the app (version ' + o.version + ', this app reads up to ' + Season.VERSION + ').');
    if (o.version < Season.VERSION) info('This is an older format (version ' + o.version + '). Opening it upgrades it in memory; the next Download data file writes the current format.');
    let s; try { s = Season.fromJson(text); } catch (e) { return err('The app cannot open this file: ' + e.message); }

    if (name) {
      const m = /-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.json$/.exec(name);
      if (!m) warn('The file name has no -yyyymmdd-hhmmss tag (expected something like ' + Season.fileName(s.year, new Date(2026, 9, 29, 12, 29, 18)) + ').');
      else if (!isDate(m[1] + '-' + m[2] + '-' + m[3]) || +m[4] > 23 || +m[5] > 59 || +m[6] > 59) warn('The tag in the file name (' + m[1] + m[2] + m[3] + '-' + m[4] + m[5] + m[6] + ') is not a real date or time.');
    }
    if (!/^\d{4}-\d{2}$/.test(o.year || '')) warn('The club year is "' + (o.year || '') + '" (expected something like 2026-27).');

    cur = 'config';
    const cfg = isObj(o.config) ? o.config : {}, clubDayOk = cfg.clubDay === undefined || (Number.isInteger(cfg.clubDay) && cfg.clubDay >= 0 && cfg.clubDay <= 6);
    if (!clubDayOk) err('The club day setting is ' + JSON.stringify(cfg.clubDay) + ' (it must be 0 for Sunday through 6 for Saturday).');
    if (cfg.blueJewelWeeks !== undefined && !(Array.isArray(cfg.blueJewelWeeks) && cfg.blueJewelWeeks.every((n, i, a) => typeof n === 'number' && (i === 0 || n > a[i - 1])))) err('Blue Jewel weeks must be a rising list of numbers.');
    if (cfg.teamOrder !== undefined && !(Array.isArray(cfg.teamOrder) && cfg.teamOrder.length === TEAMS.length && TEAMS.every(t => cfg.teamOrder.includes(t)))) err('The team color order must list Red, Blue, Green and Yellow once each (it is ' + JSON.stringify(cfg.teamOrder) + ').');
    if (cfg.saveStyleDrive !== undefined && !['inplace', 'dated'].includes(cfg.saveStyleDrive)) err('The Drive save style is ' + JSON.stringify(cfg.saveStyleDrive) + ' (inplace or dated).');
    if (cfg.saveStyleLocal !== undefined && !['single', 'dated'].includes(cfg.saveStyleLocal)) err('The local save style is ' + JSON.stringify(cfg.saveStyleLocal) + ' (single or dated).');
    if (cfg.bugButton !== undefined && typeof cfg.bugButton !== 'boolean') err('The bugButton setting should be true or false.');      // the Bug button on or off (absent means off)
    ['autoUpdate', 'autoSave'].forEach(k => { if (cfg[k] !== undefined && !(cfg[k] && typeof cfg[k].on === 'boolean' && Number.isFinite(+cfg[k].minutes) && +cfg[k].minutes > 0)) err('The ' + k + ' setting is not a valid on/minutes pair.'); });
    if (cfg.drivePinDays !== undefined && !(Number.isInteger(cfg.drivePinDays) && cfg.drivePinDays >= 0)) err('The Drive keep-a-version interval is ' + JSON.stringify(cfg.drivePinDays) + ' (a whole number of days, 0 or more).');
    if (cfg.sparksBooks !== undefined && !Season.SPARKS_BOOKS.includes(cfg.sparksBooks)) err('The Sparks books setting is ' + JSON.stringify(cfg.sparksBooks) + ' (it must be "sequence" or "together").');
    if (isObj(cfg.yearBook)) Object.keys(cfg.yearBook).forEach(g => { const k = cfg.yearBook[g]; if (k && !(isObj(cfg.books) && isObj(cfg.books[k]) && Season.bookGroup({ config: cfg }, k) === g)) warn('The book for this year for ' + g + ' is "' + k + '", which is not a ' + g + ' book in the list of books (Options tab).'); });
    if (cfg.placePoints !== undefined && !(isObj(cfg.placePoints) && [1, 2, 3, 4].every(k => Number.isInteger(cfg.placePoints[k]) && cfg.placePoints[k] >= 0))) err('The game place points must be whole numbers, 0 or more, for places 1 to 4.');
    { // the other settings (R16 part 2): only keys that are present are checked (an absent key means its default)
      const isTxt = x => typeof x === 'string', txtList = x => Array.isArray(x) && x.every(isTxt), GROUPS = ['Cubbies', 'Sparks', 'T&T'], real = x => isDate(x);
      const groupLists = (k, words) => { if (cfg[k] !== undefined && !(isObj(cfg[k]) && Object.keys(cfg[k]).every(g => txtList(cfg[k][g])))) err('The ' + words + ' (config.' + k + ') is not an object of group to a list of award names.'); };
      if (cfg.books !== undefined) { if (!isObj(cfg.books)) err('The list of books (config.books) is not an object.'); else Object.keys(cfg.books).forEach(c => { const b = cfg.books[c]; if (!/^[A-Za-z]{2,3}$/.test(c)) err('Book ' + c + ' has a code that is not 2 or 3 letters.'); else if (!isObj(b) || !isTxt(b.name) || (b.emblem !== undefined && !isTxt(b.emblem))) err('Book ' + c + ' needs a name and an emblem (text).'); else if (b.group !== undefined && !GROUPS.includes(b.group)) err('Book ' + c + ' has a group of ' + JSON.stringify(b.group) + ' (Cubbies, Sparks or T&T).'); }); }
      if (cfg.progress !== undefined) { if (!isObj(cfg.progress)) err('The progress templates (config.progress) are not an object.'); else Object.keys(cfg.progress).forEach(g => { const t = cfg.progress[g], at = 'The progress template for ' + g; if (!isObj(t)) return err(at + ' is not an object.'); ['common', 'perBook'].forEach(part => { if (t[part] === undefined) return; if (!Array.isArray(t[part])) return err(at + ' has a ' + part + ' part that is not a list of blocks.'); t[part].forEach((b, i) => { if (!(isObj(b) && isTxt(b.key) && b.key && isTxt(b.label) && txtList(b.items) && b.items.length && (b.awards === undefined || txtList(b.awards)) && (b.review === undefined || txtList(b.review)) && (b.single === undefined || typeof b.single === 'boolean'))) err(at + ' has block ' + (i + 1) + ' of ' + part + ' that needs a key, a label and a list of items.'); }); }); if (t.bookReview !== undefined && !isObj(t.bookReview)) err(at + ' has a bookReview that is not an object.'); }); }
      groupLists('awardLists', 'award lists'); groupLists('exclude', 'excluded awards'); groupLists('completion', 'book completion awards'); groupLists('endOfYear', 'end-of-year awards');
      if (cfg.store !== undefined) { const st = cfg.store; if (!(isObj(st) && (st.method === undefined || ['direct', 'top', 'range'].includes(st.method)) && (st.min === undefined || Number.isFinite(st.min)) && (st.max === undefined || Number.isFinite(st.max)) && (st.min === undefined || st.max === undefined || st.min <= st.max) && (st.programs === undefined || (Array.isArray(st.programs) && st.programs.every(p => ['Sparks', 'T&T'].includes(p)))) && (st.weights === undefined || (isObj(st.weights) && Object.keys(st.weights).every(k => Number.isFinite(st.weights[k]) && st.weights[k] >= 0))))) err('The store points settings (config.store) are not valid: a method of direct, top or range, a minimum and maximum that are numbers with the minimum not above the maximum, programs Sparks and/or T&T, and weights that are numbers of 0 or more.'); }
      if (cfg.teamPlan !== undefined) { const t = cfg.teamPlan; if (!isObj(t) || (t.proj !== undefined && !(isObj(t.proj) && Object.keys(t.proj).every(id => /^[RBGY-]{4}$/.test(t.proj[id])))) || (t.locked !== undefined && !(isObj(t.locked) && Object.keys(t.locked).every(q => /^Q[1-4]$/.test(q) && real(t.locked[q])))) || (t.prio !== undefined && !isObj(t.prio)) || (t.blendNights !== undefined && !(Number.isInteger(t.blendNights) && t.blendNights > 3 && t.blendNights <= 60))) err('The team plan (config.teamPlan) is not valid: proj must give each person four letters from R, B, G, Y or -, locked a real date for each of Q1 to Q4, and blendNights (when present) a whole number from 4 to 60.'); else if (isObj(t.proj)) { const ghostsP = Object.keys(t.proj).filter(id => isObj(o.roster) && isObj(o.roster.people) && !(id in o.roster.people)); if (ghostsP.length) warn('The team plan (config.teamPlan) names ' + plural(ghostsP.length, 'person', 'people') + ' who are not on the roster (' + ghostsP.slice(0, 3).join(', ') + (ghostsP.length > 3 ? ', …' : '') + ').'); } }
      if (cfg.teamsOk !== undefined && !(isObj(cfg.teamsOk) && (cfg.teamsOk.repeats === undefined || txtList(cfg.teamsOk.repeats)) && (cfg.teamsOk.uneven === undefined || (Array.isArray(cfg.teamsOk.uneven) && cfg.teamsOk.uneven.every(q => /^Q[1-4]$/.test(q)))))) err('The accepted team warnings (config.teamsOk) need repeats (a list of text) and uneven (a list of Q1 to Q4).');
      if (cfg.todoIgnored !== undefined && !(txtList(cfg.todoIgnored) && cfg.todoIgnored.every(x => x.split('|').length >= 3))) err('The ignored To do items (config.todoIgnored) are not a list of text with two or more | in each.');
      if (cfg.driveDirs !== undefined) { const d = cfg.driveDirs; if (!(isObj(d) && Object.keys(d).every(k => ['club', 'slides', 'open', 'data'].includes(k) && (d[k] === null || (isObj(d[k]) && isTxt(d[k].id) && isTxt(d[k].name)))))) err('A Drive folder setting (config.driveDirs) is not valid: each of club, slides, open and data is empty or has an id and a name (text).'); else if (d.open || d.data) info('config.driveDirs still has the older open/data folder settings; opening the file moves them into the club folder.'); }
      if (cfg.bundles !== undefined && !(Array.isArray(cfg.bundles) && cfg.bundles.every(b => isObj(b) && isTxt(b.name) && Array.isArray(b.items) && b.items.every(i => isObj(i) && isTxt(i.report))))) err('The report bundles (config.bundles) are not a list of a name and items that each name a report.');
      if (cfg.bookOrder !== undefined && !(isObj(cfg.bookOrder) && Object.keys(cfg.bookOrder).every(g => txtList(cfg.bookOrder[g])))) err('The book order (config.bookOrder) is not an object of group to a list of book codes.');
      ['slideNames', 'medRead', 'medPrinted'].forEach(k => { if (cfg[k] !== undefined && !(isObj(cfg[k]) && Object.keys(cfg[k]).every(x => isTxt(cfg[k][x])))) err('The setting ' + k + ' (config.' + k + ') is not an object of text to text.'); });
      if (cfg.carriedThrough !== undefined && !(isTxt(cfg.carriedThrough) && real(cfg.carriedThrough))) err('The carried-through day (config.carriedThrough, the last night of the year this file was started from) is ' + JSON.stringify(cfg.carriedThrough) + ' (it must be a real date, yyyy-mm-dd).');
      ['clubTitle', 'driveKeepName'].forEach(k => { if (cfg[k] !== undefined && !isTxt(cfg[k])) err('The setting ' + k + ' (config.' + k + ') is not text.'); });
      if (cfg.cubbiesDetail !== undefined && !['unit', 'section'].includes(cfg.cubbiesDetail)) err('The Cubbies detail setting (config.cubbiesDetail) is ' + JSON.stringify(cfg.cubbiesDetail) + ' (unit or section).');
      if (cfg.tntBook !== undefined) info('config.tntBook is an older T&T book setting; it is folded into the book for this year when the file is opened.');
      const strange = Object.keys(cfg).filter(k => !CHECKED_CONFIG.includes(k)).sort();
      if (strange.length) info(plural(strange.length, 'setting this app does not know is', 'settings this app does not know are') + ' kept as ' + (strange.length === 1 ? 'it is' : 'they are') + ' (' + strange.join(', ') + ').');
    }
    const clubDay = clubDayOk && cfg.clubDay !== undefined ? cfg.clubDay : 3;

    // A section that is not an object is emptied when the file opens, so its records would be lost at the next save: say so (never lose data silently).
    const typeName = v => Array.isArray(v) ? 'a list' : v === null ? 'empty (null)' : typeof v === 'string' ? 'text' : typeof v === 'number' ? 'a number' : typeof v === 'boolean' ? 'true or false' : typeof v;
    const WORDS = { handbooks: 'Handbook', attendance: 'Attendance', awards: 'Awards', given: 'Awards given', givenNoDate: 'Given, no date', held: 'Held awards', flags: 'Flag', doneBooks: 'Books finished before', received: 'Date received', adults: 'Adult awards', teamMoves: 'Team moves', games: 'Games', progress: 'Progress', progressNoDate: 'No-date sign-offs', extraSheets: 'Added sheets', announcedNoDate: 'Told, no date', blueWings: 'Blue Jewel placement', blueOverrides: 'Blue Jewel given by hand', blueDrops: 'Dropped Blue Jewel', pastTurnout: 'Attendance counts from earlier years', absences: 'Volunteer absence' };
    Object.keys(WORDS).forEach(k => { if (o[k] !== undefined && !isObj(o[k])) { cur = k; err('The ' + WORDS[k] + ' section is ' + typeName(o[k]) + ' (it must be an object); opening the file empties it, so its records are lost at the next save.'); } });

    // roster
    cur = 'roster';
    const people = isObj(o.roster) && isObj(o.roster.people) ? o.roster.people : null;
    if (!people && o.roster !== undefined) err("The roster's people are missing or are not an object, so the roster opens empty and its records are lost at the next save.");
    if (isObj(o.roster)) {
      ['cols', 'pcCols', 'pcKeys'].forEach(k => { const l = o.roster[k]; if (l === undefined) return; if (!Array.isArray(l) || l.some(x => typeof x !== 'string')) err('The roster column names (' + k + ') must be a list of text.'); else if (new Set(l).size !== l.length) err('The roster column names (' + k + ') name a column twice.'); });
      if (o.roster.pcAsOf !== undefined && o.roster.pcAsOf !== '' && !isDate(o.roster.pcAsOf)) warn('The Planning Center data "as of" date (' + JSON.stringify(o.roster.pcAsOf) + ') is not a real date.');
      if (o.roster.pcSource !== undefined && typeof o.roster.pcSource !== 'string') warn('The Planning Center source name (pcSource) is not text; the "as of" line cannot show it.');
    }
    const FLAG_V = /^(x_Active|x_NoPhotos|x_Uni_GivenFlag|x_noteam:Q[1-4])$/, DATE_V = /^(x_FirstSeen|x_LastSeen|x_Uni_(Ordered|Received|Given)Date)$/;
    const KNOWN_V = /^(x_(Active|InactiveBy|NoPhotos|Notes|FirstSeen|LastSeen|Uni_.*|noteam:Q[1-4])|team:(\d{4}-\d{2}:)?Q[1-4]|(ov|att|prog|award):.*)$/;
    const unknownV = new Set(); let oldId = 0, diffId = 0;
    if (people) Object.keys(people).forEach(id => {
      const e = people[id];
      if (!isObj(e)) return err('Roster entry "' + id + '" is not an object.');
      const names = Array.isArray(o.roster.pcKeys) ? o.roster.pcKeys : Array.isArray(o.roster.pcCols) ? o.roster.pcCols : [];
      if (Array.isArray(e.pc) && e.pc.length !== names.length) err('Roster entry "' + id + '" has ' + e.pc.length + ' Planning Center values but the file names ' + names.length + ' columns.');
      else if (!isObj(e.pc) && !Array.isArray(e.pc)) err('Roster entry "' + id + '" has no Planning Center record (missing "pc").');
      if (!isObj(e.v)) return err('Roster entry "' + id + '" has no owned fields (missing "v").');
      Object.keys(e.v).forEach(k => {
        const val = e.v[k];
        if (typeof val !== 'string') return err('"' + id + '": the owned field ' + k + ' is ' + typeName(val) + ' (it must be text).');
        if (FLAG_V.test(k) && val !== '' && val !== '0' && val !== '1') err('"' + id + '": ' + k + ' is "' + val + '" (a flag is 1 or 0).');
        if (DATE_V.test(k) && val !== '' && !isDate(val)) err('"' + id + '": ' + k + ' is "' + val + '" (not a real date).');
        if (k === 'x_ClubberID') { if (val === id) oldId++; else diffId++; } else if (!KNOWN_V.test(k)) unknownV.add(k);
      });
      Object.keys(e.v).filter(k => /^team:(\d{4}-\d{2}:)?Q[1-4]$/.test(k)).forEach(k => { if (e.v[k] !== '' && !TEAMS.includes(e.v[k])) err('"' + id + '": ' + k + ' is "' + e.v[k] + '" (not ' + TEAMS.join(', ').replace(/, ([^,]*)$/, ' or $1') + ').'); });
    });
    if (unknownV.size) info(plural(unknownV.size, 'owned field this app does not know is kept as it is', 'owned fields this app does not know are kept as they are') + ' (' + [...unknownV].sort().slice(0, 5).join(', ') + (unknownV.size > 5 ? ', …' : '') + ').');
    if (oldId) info(plural(oldId, 'person has', 'people have') + ' an older copy of their own ID (x_ClubberID); opening the file removes it.');
    if (diffId) info(plural(diffId, 'person has', 'people have') + " an x_ClubberID that differs from the person's id; it is kept as it is.");
    // The kept export (R17): the last Planning Center export as the file holds it. A shape problem is an error (the export could not be rebuilt); a count that does not add up is a warning.
    if (isObj(o.roster)) {
      const cap = o.roster.pcExport, q = n => '“' + n + '”', list = a => a.slice(0, 3).map(q).join(', ') + (a.length > 3 ? ', …' : '');
      if (cap === undefined) { if (o.version >= 6 && people && Object.keys(people).length) info('No Planning Center export has been captured in this file yet.'); }
      else if (!isObj(cap)) err('The Planning Center export record (roster.pcExport) is not an object, so the export cannot be rebuilt from this file.');
      else {
        const names = Array.isArray(cap.names) ? cap.names : null, header = Array.isArray(cap.header) ? cap.header : null, ids = isObj(cap.ids) ? cap.ids : null, loose = Array.isArray(cap.loose) ? cap.loose : null;
        let bad = false; const fail = m => { bad = true; err(m); };
        if (!names || !header || names.some(n => typeof n !== 'string')) fail('export record: the column names (names, header) are missing or are not lists of text.');
        else {
          if (names.length < header.length) fail('export record: fewer stored names than header cells (' + names.length + ' names, ' + header.length + ' header cells).');
          const dup = names.filter((n, i) => names.indexOf(n) !== i); if (dup.length) fail('export record: the name ' + q(dup[0]) + ' appears twice among the stored names.');
          if (loose && loose.some(r => !Array.isArray(r) || r.length !== names.length || r.some(c => typeof c !== 'string'))) fail('export record: a kept row is not a list of text with one cell per stored name.');
        }
        if (!ids) fail('export record: ids is not an object of person id to 1.');
        if (!loose) fail('export record: loose is not a list of rows.');
        if (!Number.isInteger(cap.rows) || !Number.isInteger(cap.blankRows)) fail('export record: rows and blankRows must be whole numbers.');
        if (!bad) {
          const ghost = Object.keys(ids).filter(id => !(people && id in people)).length; if (ghost) warn('export record: ' + plural(ghost, 'person in the export is', 'people in the export are') + ' not on the roster.');
          if (cap.rows !== Object.keys(ids).length + loose.length + cap.blankRows) warn('export record: the row counts do not add up (rows ' + cap.rows + ', people ' + Object.keys(ids).length + ', kept ' + loose.length + ', blank ' + cap.blankRows + ').');
          const unused = names.filter(n => !M.PC_KNOWN.includes(n) && !M.PC_ROLES.some(r => r.col === n)), old = (Array.isArray(o.roster.pcCols) ? o.roster.pcCols : []).filter(n => !names.includes(n));
          info('Planning Center export kept: ' + plural(cap.rows, 'row', 'rows') + ' (' + loose.length + ' belong' + (loose.length === 1 ? 's' : '') + ' to nobody, ' + cap.blankRows + ' blank), ' + plural(names.length, 'column', 'columns') + (unused.length ? ' (' + unused.length + ' not used by this app: ' + list(unused) + ')' : '') + (isDate(o.roster.pcAsOf) ? ', as of ' + o.roster.pcAsOf : '') + '.');
          if (old.length) info(plural(old.length, 'column holds', 'columns hold') + ' values from an earlier export (' + list(old) + ').');
        }
      }
    }

    // season records
    let ghosts = 0; const ghost = new Set(), known = id => { if (!people || id in people) return true; ghosts++; ghost.add(id); return false; };
    cur = 'attendance';
    const att = isObj(o.attendance) ? o.attendance : {};
    Object.keys(att).forEach(d => {
      if (!isDate(d)) err('Attendance date "' + d + '" is not a real date.');
      Object.keys(att[d] || {}).forEach(id => {
        known(id);
        const marks = att[d][id]; if (!isObj(marks)) return err('Attendance ' + d + ' · ' + id + ' is not a set of marks.');
        Object.keys(marks).forEach(k => { if (k === 'g') { if (!['Puggles', 'Cubbies', 'Sparks', 'T&T'].includes(marks.g)) err('Attendance ' + d + ' · ' + id + ': group "' + marks.g + '" is not Puggles, Cubbies, Sparks or T&T.'); } else if (k === 't') { if (!TEAMS.includes(marks.t)) err('Attendance ' + d + ' · ' + id + ': team "' + marks.t + '" is not Red, Blue, Green or Yellow.'); else if (marks.a !== 1) warn('Attendance ' + d + ' · ' + id + ' has a one-night team but is not marked present.'); } else if (!MARKS.includes(k)) err('Attendance ' + d + ' · ' + id + ': unknown mark "' + k + '".'); else if (marks[k] !== 1) err('Attendance ' + d + ' · ' + id + ': mark ' + k + ' is ' + JSON.stringify(marks[k]) + ' (expected 1).'); });
      });
    });
    cur = 'games';
    const games = isObj(o.games) ? o.games : {};
    Object.keys(games).forEach(d => {
      if (!isDate(d)) err('Games date "' + d + '" is not a real date.');
      Object.keys(games[d] || {}).forEach(g => {
        if (!['Sparks', 'T&T'].includes(g)) err('Games ' + d + ': group "' + g + '" is not Sparks or T&T.');
        Object.keys(games[d][g] || {}).forEach(t => {
          const r = games[d][g][t] || {};
          if (!TEAMS.includes(t)) err('Games ' + d + ' · ' + g + ': team "' + t + '" is not Red, Blue, Green or Yellow.');
          if (r.place !== undefined && !(r.place >= 1 && r.place <= 4)) err('Games ' + d + ' · ' + g + ' · ' + t + ': place ' + r.place + ' is not 1 to 4.');
          if (r.spirit !== undefined && !(r.spirit >= 0 && r.spirit <= 3)) err('Games ' + d + ' · ' + g + ' · ' + t + ': spirit ' + r.spirit + ' is not 0 to 3.');
        });
      });
    });
    cur = 'awards';
    const awards = isObj(o.awards) ? o.awards : {};
    Object.keys(awards).forEach(d => {
      if (!isDate(d)) err('Awards date "' + d + '" is not a real date.');
      Object.keys(awards[d] || {}).forEach(id => { known(id); const l = awards[d][id]; if (!Array.isArray(l) || !l.every(a => typeof a === 'string')) err('Awards ' + d + ' · ' + id + ' is not a list of award names.'); else if (new Set(l).size !== l.length) warn('Awards ' + d + ' · ' + id + ' lists an award twice.'); });
    });
    // Awards marked given need a real date (an award can be given before it is announced).
    cur = 'given';
    const given = isObj(o.given) ? o.given : {};
    Object.keys(given).forEach(id => {
      known(id);
      if (!isObj(given[id])) { err('Awards given for "' + id + '" is not a list of award and date.'); return; }
      Object.keys(given[id]).forEach(a => {
        if (!isDate(given[id][a])) err('Award given "' + a + '" for ' + id + ' has a date that is not a real date.');
      });
    });
    cur = 'adults';
    const adults = isObj(o.adults) ? o.adults : {};
    Object.keys(adults).forEach(d => {
      if (!isDate(d)) err('Adult awards date "' + d + '" is not a real date.');
      if (!Array.isArray(adults[d]) || !adults[d].every(e => isObj(e) && typeof e.n === 'string' && typeof e.a === 'string')) err('Adult awards ' + d + ' is not a list of { n: name, a: award }.');
    });
    cur = 'teamMoves';
    const moves = isObj(o.teamMoves) ? o.teamMoves : {};
    Object.keys(moves).forEach(id => {
      known(id);
      if (!Array.isArray(moves[id])) return err('Team moves for "' + id + '" are not a list.');
      moves[id].forEach(m => {
        if (!isObj(m) || !/^Q[1-4]$/.test(m.q) || !isDate(m.from) || !TEAMS.includes(m.team)) return err('Team move for "' + id + '" needs a quarter (Q1 to Q4), a real date and a team (Red, Blue, Green or Yellow): ' + JSON.stringify(m) + '.');
        // A move is stored with its quarter and matched on it, so a calendar edit that moves the quarter's nights leaves the move pointing at nothing (Fable review, suspected item 3).
        const nights = (Array.isArray(o.calendar) ? o.calendar : []).filter(r => isObj(r) && r.Quarter === m.q && isDate(r.Date)).map(r => r.Date).sort();
        if (nights.length && (m.from < nights[0] || m.from > nights[nights.length - 1])) warn('Team move for "' + id + '" is dated ' + m.from + ', outside ' + m.q + ' (club nights ' + nights[0] + ' to ' + nights[nights.length - 1] + '): it will not apply.');
      });
    });
    cur = 'handbooks';
    const hb = isObj(o.handbooks) ? o.handbooks : {};
    Object.keys(hb).forEach(id => { known(id); if (typeof hb[id] !== 'string') err('Handbook entry for "' + id + '" is not text.'); });
    cur = 'progress';
    const pr = isObj(o.progress) ? o.progress : {};
    Object.keys(pr).forEach(id => { known(id); Object.keys(pr[id] || {}).forEach(b => Object.keys(pr[id][b] || {}).forEach(k => { if (!isDate(pr[id][b][k])) err('Progress ' + id + ' · ' + b + ' · ' + k + ': "' + pr[id][b][k] + '" is not a real date.'); })); });

    // The sections with their own shapes (R16): a wrong shape is an error (the app would lose or misread it); a value that points at nothing is one aggregated warning.
    const bookCodes = new Set(Object.keys(s.config.books || {})), isText = x => typeof x === 'string', textList = x => Array.isArray(x) && x.every(isText), slot14 = n => Number.isInteger(n) && n >= 1 && n <= 4;
    const agg = (check, list, one, many) => { if (!list.length) return; cur = check; warn(plural(list.length, one, many) + ' (' + list.slice(0, 3).join(', ') + (list.length > 3 ? ', …' : '') + ').'); };
    const sect = k => isObj(o[k]) ? o[k] : {};
    { // held
      cur = 'held'; const odd = [];
      Object.keys(sect('held')).forEach(id => { known(id); const h = o.held[id]; if (!isObj(h)) return err('Held awards for "' + id + '" is not an object of award to 1.'); Object.keys(h).forEach(a => { if (h[a] === 1) return; if (h[a]) odd.push(a); else err('Held award "' + a + '" for "' + id + '" is ' + JSON.stringify(h[a]) + ' (expected 1).'); }); });
      agg('held', odd, 'held mark that is not 1', 'held marks that are not 1');
    }
    { // volunteer absences (kept by person, then absence id, then club night; DATA-FORMAT 5.26)
      cur = 'absences';
      const club = new Set((Array.isArray(o.calendar) ? o.calendar : []).filter(r => r && r.Type !== 'Event' && r['No Club'] !== '1').map(r => r.Date));
      Object.keys(sect('absences')).forEach(pid => {
        known(pid);
        const person = o.absences[pid]; if (!isObj(person)) return err('Absences for "' + pid + '" are not an object.');
        Object.keys(person).forEach(aid => {
          const a = person[aid], at = 'Absence ' + aid;
          if (!/^a[0-9a-z]+$/.test(aid)) err(at + ': the id should start with a (DATA-FORMAT 5.26).');
          if (!isObj(a)) return err(at + ' is not an object.');
          if (a.reason !== undefined && !isText(a.reason)) err(at + ': the reason is not text.');
          if (!isDate(a.at)) err(at + ': the date entered is ' + JSON.stringify(a.at) + ' (not a real date).');
          if (!isObj(a.nights) || !Object.keys(a.nights).length) return err(at + ' has no club nights (an empty absence should have been deleted).');
          Object.keys(a.nights).forEach(d => { if (a.nights[d] !== 1) err(at + ': the night ' + d + ' should be 1.'); });
          const gone = Object.keys(a.nights).filter(d => !club.has(d));
          if (gone.length) warn(at + ': ' + gone.length + ' night(s) no longer a club night on the calendar (' + gone.slice(0, 3).join(', ') + ').');
        });
      });
    }
    { // flags (kept by flag id; the child is inside)
      cur = 'flags';
      Object.keys(sect('flags')).forEach(fid => {
        const f = o.flags[fid], at = 'Flag ' + fid; if (!isObj(f)) return err(at + ' is not an object.');
        const levelOk = Season.FLAG_LEVELS.includes(f.level); if (!levelOk) err(at + ': the level is ' + JSON.stringify(f.level) + ' (one of ' + Season.FLAG_LEVELS.join(', ') + ').');
        if (!isText(f.note) || !f.note.trim()) err(at + ' has no note.');
        if (!isDate(f.at)) err(at + ': the date is ' + JSON.stringify(f.at) + ' (not a real date).');
        if (f.kid !== undefined && !isText(f.kid)) err(at + ': the child is not text.'); else if (f.kid) known(f.kid); else if (levelOk && !Season.FLAG_NO_KID.includes(f.level)) err(at + ' needs a child.');
        ['book', 'block', 'key'].forEach(k => { if (f[k] !== undefined && !isText(f[k])) err(at + ': ' + k + ' is not text.'); });
        if (f.level === 'attend' && !(f.date && f.room)) err(at + ' (attendance) needs a night and a class.');
        if (f.level === 'team' && !(f.quarter && f.group)) err(at + ' (color team) needs a quarter and a group.');
        if (f.level === 'field' && !f.field) err(at + ' (field) needs the field.');
        // a bug report or feature request (id starts with b): a status, an optional reply and where it was captured
        if (f.level === 'bug') {
          if (f.status === undefined) warn(at + ' (bug report) has no status; it is read as open.'); else if (!Season.BUG_STATUS.includes(f.status)) err(at + ': the status is ' + JSON.stringify(f.status) + ' (one of ' + Season.BUG_STATUS.join(', ') + ').');
          if (f.reply !== undefined && !isText(f.reply)) err(at + ': the reply is not text.');
          if (f.replyAt !== undefined && !isDate(f.replyAt)) err(at + ': the reply date is ' + JSON.stringify(f.replyAt) + ' (not a real date).');
          if ((f.reply !== undefined) !== (f.replyAt !== undefined)) warn(at + ': a reply and its date go together.');
          if (f.ver !== undefined && !isText(f.ver)) err(at + ': the version is not text.');
          if (f.tab !== undefined && !(isText(f.tab) && textList(f.trail) && (f.rowIndex === undefined || (Number.isInteger(f.rowIndex) && f.rowIndex >= 0)))) err(at + ' (bug report): where it was captured needs a tab, a trail of text and a row number.');
          if (!/^b/.test(fid)) warn(at + ': a bug report id should start with b.');
        } else {
          if (/^b/.test(fid)) warn(at + ': an id starting with b is for a bug report.');
          if (f.status !== undefined || f.reply !== undefined) warn(at + ': a status or reply belongs to a bug report.');
        }
        if (f.level === 'element' && !(isText(f.tab) && f.tab && textList(f.trail) && f.trail.length && (f.rowIndex === undefined || (Number.isInteger(f.rowIndex) && f.rowIndex >= 0)))) err(at + ' (element) needs the tab, a trail of text and a row number of 0 or more.');
      });
    }
    { // books finished before, date received
      cur = 'doneBooks'; const unk = [];
      Object.keys(sect('doneBooks')).forEach(id => { known(id); const l = o.doneBooks[id]; if (!textList(l)) return err('Books finished before for "' + id + '" is not a list of book codes.'); l.forEach(c => { if (!bookCodes.has(c)) unk.push(c); }); });
      agg('doneBooks', unk, 'finished book is not in the list of books', 'finished books are not in the list of books');
      cur = 'received'; const unk2 = [];
      Object.keys(sect('received')).forEach(id => { known(id); const r = o.received[id]; if (!isObj(r)) return err('Date received for "' + id + '" is not an object of book to date.'); Object.keys(r).forEach(b => { const v = r[b]; if (!(v === '' || v === 'no date' || isDate(v))) err('Date received for "' + id + '" · ' + b + ' is ' + JSON.stringify(v) + ' (a real date, "no date" or empty).'); if (!bookCodes.has(b)) unk2.push(b); }); });
      agg('received', unk2, 'received date is for a book that is not in the list of books', 'received dates are for books that are not in the list of books');
    }
    { // no-date pairs and sheets
      cur = 'givenNoDate'; const miss = [];
      Object.keys(sect('givenNoDate')).forEach(id => { known(id); const l = o.givenNoDate[id]; if (!textList(l)) return err('Given, no date for "' + id + '" is not a list of award names.'); l.forEach(a => { if (!((given[id] || {})[a])) miss.push(a); }); });
      agg('givenNoDate', miss, 'award is marked no date given but has no given record', 'awards are marked no date given but have no given record');
      cur = 'progressNoDate'; const nomatch = [], unk = [];
      Object.keys(sect('progressNoDate')).forEach(id => { known(id); const b = o.progressNoDate[id]; if (!isObj(b) || !Object.keys(b).every(k => textList(b[k]))) return err('No-date sign-offs for "' + id + '" are not an object of book to list of sign-off keys.'); Object.keys(b).forEach(bk => { if (bk !== 'common' && !bookCodes.has(bk)) unk.push(bk); b[bk].forEach(k => { if (!(((pr[id] || {})[bk] || {})[k])) nomatch.push(bk + ' ' + k); }); }); });
      agg('progressNoDate', nomatch, 'no-date sign-off has no sign-off behind it', 'no-date sign-offs have no sign-off behind them'); agg('progressNoDate', unk, 'no-date sign-off is for a book that is not in the list of books', 'no-date sign-offs are for books that are not in the list of books');
      cur = 'extraSheets'; const unk3 = [];
      Object.keys(sect('extraSheets')).forEach(id => { known(id); const l = o.extraSheets[id]; if (!textList(l)) return err('Added sheets for "' + id + '" are not a list of book codes.'); l.forEach(c => { if (!bookCodes.has(c)) unk3.push(c); }); });
      agg('extraSheets', unk3, 'added sheet is for a book that is not in the list of books', 'added sheets are for books that are not in the list of books');
      cur = 'announcedNoDate';
      Object.keys(sect('announcedNoDate')).forEach(id => { known(id); if (!textList(o.announcedNoDate[id])) err('Told, no date for "' + id + '" is not a list of award names.'); });
    }
    { // Blue Jewels
      cur = 'blueWings';
      Object.keys(sect('blueWings')).forEach(id => { known(id); const l = o.blueWings[id]; if (!Array.isArray(l)) return err('Blue Jewel placement for "' + id + '" is not a list.'); l.forEach(w => { /* the app reads only book and slot; the rest is checked when present (older files and hand-made entries may leave it out) */ if (!(isObj(w) && isText(w.book) && slot14(w.slot) && (w.n === undefined || slot14(w.n)) && (w.threshold === undefined || (Number.isInteger(w.threshold) && w.threshold > 0)) && (w.earned === undefined || isDate(w.earned)) && (w.date === undefined || isDate(w.date)) && (w.year === undefined || /^\d{4}-\d{2}$/.test(w.year)) && (w.override === undefined || typeof w.override === 'boolean') && (w.note === undefined || isText(w.note)))) err('Blue Jewel placement for "' + id + '" needs a book and a slot 1 to 4 (and, when present, a count 1 to 4, a threshold, real dates and a year): ' + JSON.stringify(w) + '.'); }); });
      cur = 'blueOverrides';
      Object.keys(sect('blueOverrides')).forEach(id => { known(id); const l = o.blueOverrides[id]; if (!Array.isArray(l)) return err('Blue Jewel given by hand for "' + id + '" is not a list.'); l.forEach(x => { if (!(isObj(x) && isText(x.book) && slot14(x.n) && isDate(x.date) && isText(x.note))) err('Blue Jewel given by hand for "' + id + '" needs a book, a number 1 to 4, a real date and a note (it may be empty): ' + JSON.stringify(x) + '.'); }); });
      cur = 'blueDrops'; const unsorted = [];
      Object.keys(sect('blueDrops')).forEach(id => { known(id); const l = o.blueDrops[id]; if (!Array.isArray(l)) return err('Dropped Blue Jewel for "' + id + '" is not a list.'); l.forEach(x => { const m = isText(x) && /^([1-4])\|(\d{4}-\d{2}-\d{2})$/.exec(x); if (!m || !isDate(m[2])) err('Dropped Blue Jewel for "' + id + '" is ' + JSON.stringify(x) + ' (expected "gem|date", for example "1|2026-10-07").'); }); if (l.some((x, i) => i && String(x) <= String(l[i - 1]))) unsorted.push('list'); });
      agg('blueDrops', unsorted, 'dropped Blue Jewel list is not in order or repeats an entry', 'dropped Blue Jewel lists are not in order or repeat an entry');
    }
    { // attendance counts from earlier years (team balance): { id: [ { year, nights, came } ] }, one entry per year, oldest first
      cur = 'pastTurnout'; const unordered = [];
      Object.keys(sect('pastTurnout')).forEach(id => {
        known(id); const l = o.pastTurnout[id]; if (!Array.isArray(l)) return err('Earlier-year attendance counts for "' + id + '" are not a list.');
        l.forEach(x => { if (!(isObj(x) && isText(x.year) && /^\d{4}-\d{2}$/.test(x.year) && Number.isInteger(x.nights) && x.nights > 0 && Number.isInteger(x.came) && x.came >= 0 && x.came <= x.nights)) err('An earlier-year attendance count for "' + id + '" needs a year like 2025-26, nights above 0 and came from 0 up to nights: ' + JSON.stringify(x) + '.'); });
        if (l.some((x, i) => i && isObj(x) && isObj(l[i - 1]) && String(x.year) <= String(l[i - 1].year))) unordered.push('list');
      });
      agg('pastTurnout', unordered, 'earlier-year attendance list is not in year order or repeats a year', 'earlier-year attendance lists are not in year order or repeat a year');
    }
    cur = 'ghosts';
    if (ghosts) warn((ghosts === 1 ? '1 record refers to someone who is not on the roster' : ghosts + ' records refer to people who are not on the roster') + ' (' + [...ghost].slice(0, 3).join(', ') + (ghost.size > 3 ? ', …' : '') + ').');

    // calendar and rotation
    cur = 'calendar';
    const cal = Array.isArray(o.calendar) ? o.calendar : [];
    if (o.calendar !== undefined && !Array.isArray(o.calendar)) err('The calendar must be a list of rows.');
    const seen = {};
    cal.forEach((r, i) => {
      if (!isObj(r) || !isDate(r.Date)) return err('Calendar row ' + (i + 1) + ': date "' + (r && r.Date) + '" is not a real date.');
      seen[r.Date] = (seen[r.Date] || 0) + 1;
      if (!Calendar.TYPES.includes(r.Type)) err('Calendar ' + r.Date + ': Type "' + r.Type + '" is not Club night or Event.');
      if (!Calendar.QUARTERS.includes(r.Quarter)) err('Calendar ' + r.Date + ': Quarter "' + r.Quarter + '" is not Q1 to Q4.');
    });
    Object.keys(seen).filter(d => seen[d] > 1).forEach(d => warn('Calendar: ' + d + ' appears ' + seen[d] + ' times.'));
    if (clubDayOk) { const off = Calendar.offDays(cal.filter(r => isObj(r) && isDate(r.Date)), clubDay).length; if (off) warn(plural(off, 'club night is', 'club nights are') + ' not on a ' + Calendar.DAYS[clubDay] + ' (the club day setting).'); }
    // records on dates that are not counted club nights drop out of every total (attendance summary, statistics, store, Blue Jewels)
    if (cal.length) {
      cur = 'nights';
      const counted = Season.counted(cal.filter(r => isObj(r) && isDate(r.Date))), stray = [...new Set([att, games, awards].flatMap(x => Object.keys(x)))].filter(d => isDate(d) && !counted[d] && ((att[d] && Object.keys(att[d]).length) || (games[d] && Object.keys(games[d]).length) || (awards[d] && Object.keys(awards[d]).length))).sort();
      if (stray.length) warn('Attendance, games or awards are recorded on ' + plural(stray.length, 'date that is not a club night', 'dates that are not club nights') + ' in the calendar (' + stray.slice(0, 3).join(', ') + (stray.length > 3 ? ', …' : '') + '). They are left out of every total; fix the calendar row or move the entries.');
    }
    cur = 'rotation';
    if (o.rotation !== undefined && !(Array.isArray(o.rotation) && o.rotation.every(r => Array.isArray(r)))) err('The rotation must be a list of rows (each row a list of cells).');

    // history
    cur = 'history';
    const hist = Array.isArray(o.history) ? o.history : [];
    if (o.history !== undefined && !Array.isArray(o.history)) err('The history must be a list.');
    let histOk = true, prev = NaN;
    hist.forEach((e, i) => {
      const v = 'Version ' + (i + 1);
      if (!isObj(e)) { histOk = false; return err(v + ' is not an entry.'); }
      if (!isTime(e.t)) { histOk = false; err(v + ': time "' + e.t + '" is not a real time.'); }
      else { if (Date.parse(e.t) < prev) warn(v + ' is out of time order (earlier than version ' + i + ').'); prev = Date.parse(e.t); }
      if (typeof e.label !== 'string') warn(v + ' has no label.');
      if (!Array.isArray(e.changes) || !e.changes.every(c => isObj(c) && Array.isArray(c.p))) { histOk = false; err(v + ': changes is not a list of changes.'); }
    });
    if (histOk && hist.length && !out.some(f => f.level === 'error')) {
      cur = 'replay';
      try {
        const d = Season.replayDiff(s);
        if (d.length) warn('The current data differs from what the history says it should be in ' + plural(d.length, 'place', 'places') + ' (first: ' + d[0].p.join(' › ') + '). If the file was not edited outside the app, open it and use History › Reconcile History.');
      } catch (e) { warn('The history could not be replayed: ' + e.message); }
    }

    cur = 'file';
    {      // parts of the file this app does not know: kept as they are and written back, listed here (R17); never an error
      const strange = Object.keys(o).filter(k => !Season.KNOWN_TOP.includes(k));
      if (isObj(o.roster) && isObj(o.roster.pcExport)) Object.keys(o.roster.pcExport).filter(k => !M.CAPTURE_KEYS.includes(k)).forEach(k => strange.push('roster › pcExport › ' + k));
      if (isObj(o.roster)) { Object.keys(o.roster).filter(k => !M.ROSTER_KEYS.includes(k)).forEach(k => strange.push('roster › ' + k)); const pe = new Set(); Object.keys(people || {}).forEach(id => { if (isObj(people[id])) Object.keys(people[id]).filter(k => k !== 'pc' && k !== 'v').forEach(k => pe.add('person › ' + k)); }); pe.forEach(k => strange.push(k)); }
      if (strange.length) info(plural(strange.length, 'part of this file is', 'parts of this file are') + ' not known to this app and ' + (strange.length === 1 ? 'is kept as it is' : 'are kept as they are') + ' (' + strange.slice(0, 5).join(', ') + (strange.length > 5 ? ', …' : '') + ').');
    }
    info((people ? plural(Object.keys(people).length, 'person', 'people') + ', ' : '') + plural(Object.keys(att).length, 'night', 'nights') + ' of attendance, ' + plural(cal.length, 'calendar date', 'calendar dates') + ', ' + plural(hist.length, 'version', 'versions') + ' in the history.');
  }

  // ---------- Planning Center export ----------
  function validatePc(text, name, out) {
    const err = m => out.push({ level: 'error', msg: m }), warn = m => out.push({ level: 'warn', msg: m }), info = m => out.push({ level: 'info', msg: m });
    let pc, rx; try { rx = M.readExport(text); pc = { cols: rx.cols, records: rx.records }; } catch (e) { return err('Could not read this as CSV: ' + e.message); }
    // Columns: a missing or renamed one is reported with what it affects; only a missing name stops the check (the app cannot read the file at all).
    const colRep = M.columnReport(rx.reportCols);
    if (colRep.some(i => i.level === 'error')) return colRep.filter(i => i.level === 'error').forEach(i => err(i.text));
    colRep.forEach(i => (i.level === 'warn' ? warn : info)('Columns: ' + i.text));
    const date = M.exportDate(name, ''), lead = /^(\d{4})(\d{2})(\d{2})\b/.exec(String(name || '').trim());
    if (!lead) warn('The file name has no yyyymmdd date at the start, so "Planning Center data as of" will be the day the file is opened.');
    else if (!isDate(lead[1] + '-' + lead[2] + '-' + lead[3])) warn('The file name starts with ' + lead[0] + ', which is not a real date.');
    const names = {}, rooms = {}; let inactive = 0;
    const ref = date || new Date().toLocaleDateString('en-CA'), SELECTIONS = ['Clubber', 'Puggles', 'Awana Adult Volunteer'];
    // One person's details: the things that make a registration hard to place or to reach the family about.
    const checkPerson = (r, row, who) => {
      const at = row + (who ? ' (' + who + ')' : ''), sel = String(r[C.SELECTION] || ''), vol = /volunteer/i.test(sel), pug = /^puggles/i.test(sel);
      ['First Name', 'Last Name'].forEach(f => { const o = Intake.oddName(r[f]); if (o) warn(at + ': ' + f.toLowerCase() + ' ' + o + '.'); });
      if (sel && !SELECTIONS.some(s => sel.toLowerCase().startsWith(s.toLowerCase()))) warn(at + ': Selection "' + sel + '" is not Clubber, Puggles or Awana Adult Volunteer.');
      if (!vol) {
        const b = Intake.parseBirthdate(r.Birthdate), calc = b ? Intake.ageOn(b, ref) : null, said = String(r.Age || '').trim() === '' ? null : +r.Age;
        if (!String(r.Birthdate || '').trim()) warn(at + ': no birthdate.'); else if (!b) warn(at + ': birthdate "' + r.Birthdate + '" is not a date.');
        else if (calc < 0 || calc > 20) warn(at + ': birthdate ' + r.Birthdate + ' makes them ' + calc + ' years old.');
        if (b && said !== null && Math.abs(said - calc) > 1) warn(at + ': the Age column says ' + said + ' but the birthdate makes them ' + calc + '.');
        const grade = String(r[C.GRADE] || '').trim(), age = calc !== null ? calc : said;
        if (!grade && !pug) warn(at + ': no grade.');
        else if (grade && Intake.parseGrade(grade) === null) warn(at + ': grade "' + grade + '" is not one I recognise.');
        else if (grade && !Intake.gradeFitsAge(grade, age)) warn(at + ': ' + grade + ' does not fit age ' + age + '.');
        const want = Intake.suggestGroup(sel, grade), have = M.groupOf(M.canon(r[C.ROOM] || ''));
      if (['Puggles', 'Cubbies', 'Sparks', 'T&T'].includes(have) && !Intake.classFits(sel, grade, have)) warn(at + ': ' + (grade || sel) + ' usually goes in ' + want + ', but the room is ' + M.canon(r[C.ROOM]) + '.');
      if (Intake.suggestGroup(sel, grade) === 'Older') warn(at + ': ' + grade + ' is past T&T, so there is no class for them here.');
      }
      const phones = ['Mobile Phone Number', 'Home Phone Number', 'Other Phone Number', 'Registration Contact Phone Number'].some(f => String(r[f] || '').trim());
      const mails = ['Home Email Address', 'Work Email Address', 'Other Email Address', 'Registration Contact Home Email Address', 'Registration Contact Work Email Address', 'Registration Contact Other Email Address'];
      if (!phones && !mails.some(f => String(r[f] || '').trim())) warn(at + ': no phone number or email at all.');
      const bad = new Set(); mails.forEach(f => Intake.emails(r[f]).filter(e => !Intake.validEmail(e)).forEach(e => { if (!bad.has(e)) { bad.add(e); warn(at + ': "' + e + '" (' + f.replace(/ Email Address$/, '').toLowerCase() + ') is not a valid email address.'); } }));
      if (!vol && !String(r['Emergency Contact'] || '').trim()) warn(at + ': no emergency contact.');
    };
    pc.records.forEach((r, i) => {
      const row = 'row ' + (i + 2), who = [r[C.FIRST], r[C.LAST]].filter(Boolean).join(' ');
      if (!String(r[C.REG] || '').trim()) err(row + (who ? ' (' + who + ')' : '') + ': no Registration ID.');
      if (!String(r[C.FIRST] || '').trim()) err(row + ': no First Name.');
      if (!String(r[C.LAST] || '').trim()) err(row + ': no Last Name.');
      const rm = M.canon(String(r[C.ROOM] || '').trim());
      if (!rm) warn(row + (who ? ' (' + who + ')' : '') + ': no room assigned.'); else rooms[rm] = (rooms[rm] || 0) + 1;
      if (pc.cols.includes('Status') && r.Status && r.Status !== 'Active') inactive++;
      checkPerson(r, row, who);
      const k = M.norm(r[C.FIRST]) + '|' + M.norm(r[C.LAST]); if (k !== '|') (names[k] = names[k] || []).push(who);
    });
    Object.keys(rooms).filter(rm => !M.ROOM_ORDER.includes(rm)).forEach(rm => warn('Room "' + rm + '" is not one of the ' + M.ROOM_ORDER.length + ' known rooms (' + plural(rooms[rm], 'person', 'people') + ').'));
    if (inactive) warn(plural(inactive, 'person is', 'people are') + ' not Active in the Status column.');
    Object.keys(names).filter(k => names[k].length > 1).forEach(k => warn('"' + names[k][0] + '" appears ' + names[k].length + ' times.'));
    info(plural(pc.records.length, 'person', 'people') + ' in the export, as of ' + (date || 'an unknown date (no date in the file name)') + '.');
    // What the file holds, counted, so nothing odd goes unnoticed (R17): every row and column is kept by the app, whatever it is.
    const past = rx.names.length - rx.header.length, noHead = rx.names.filter((n, i) => /^\(no header \d+\)$/.test(n) && i < rx.header.length).length;
    info(plural(rx.rows, 'row', 'rows') + (rx.blankRows ? ' (' + rx.blankRows + ' blank)' : '') + ', ' + plural(rx.names.length, 'column', 'columns') + (past > 0 ? ', ' + plural(past, 'cell position', 'cell positions') + ' past the last header column' : '') + (noHead ? ', ' + plural(noHead, 'column', 'columns') + ' with no header' : '') + '.');
  }

  // ---------- older CSVs ----------
  function validateCsv(kind, text, out) {
    const err = m => out.push({ level: 'error', msg: m }), warn = m => out.push({ level: 'warn', msg: m }), info = m => out.push({ level: 'info', msg: m });
    if (kind === 'calendar') {
      let rows; try { rows = Calendar.load(text); } catch (e) { return err(e.message); }
      rows.forEach(r => {
        if (!Calendar.TYPES.includes(r.Type)) err('Calendar ' + r.Date + ': Type "' + r.Type + '" is not Club night or Event.');
        if (!Calendar.QUARTERS.includes(r.Quarter)) err('Calendar ' + r.Date + ': Quarter "' + r.Quarter + '" is not Q1 to Q4.');
      });
      const seen = {}; rows.forEach(r => { seen[r.Date] = (seen[r.Date] || 0) + 1; });
      Object.keys(seen).filter(d => seen[d] > 1).forEach(d => warn('Calendar: ' + d + ' appears ' + seen[d] + ' times.'));
      const off = Calendar.offDays(rows, 3).length; if (off) warn(plural(off, 'club night is', 'club nights are') + ' not on a Wednesday (the usual club day; change it on the Calendar tab).');
      info(plural(rows.length, 'date', 'dates') + (rows.length ? ', ' + rows[0].Date + ' to ' + rows[rows.length - 1].Date : '') + '. Open it once to bring it into the data file.');
    } else if (kind === 'colors') {
      const rows = Csv.parse(text), head = rows[0] || [], cols = head.map((h, i) => /^q[1-4]$|^colou?r$|^team$/i.test(h.trim()) ? i : -1).filter(i => i >= 0);
      rows.slice(1).forEach((r, i) => cols.forEach(c => { const v = (r[c] || '').trim(); if (v && !TEAMS.includes(v)) err('row ' + (i + 2) + ': "' + v + '" is not Red, Blue, Green or Yellow.'); }));
      info(plural(Math.max(0, rows.length - 1), 'row', 'rows') + ' of colors. Open it once to bring it into the data file.');
    } else if (kind === 'master') {
      let n = 0; try { n = Csv.toRecords(Csv.parse(text)).records.length; } catch (e) { return err('Could not read this as CSV: ' + e.message); }
      info('This is an old master CSV (' + plural(n, 'person', 'people') + '). Open it once to bring its colors, uniforms and notes into the data file; nothing reads it afterwards.');
    } else if (kind === 'rotation') {
      const rows = Csv.parse(text); info('Rotation grid: ' + plural(Math.max(0, rows.length - 1), 'time slot', 'time slots') + ', ' + plural(Math.max(0, (rows[0] || []).length - 1), 'group', 'groups') + '. Open it once to bring it into the data file.');
    }
  }

  function validate(text, name) {
    const out = [], kind = detect(text);
    if (kind === 'data') validateData(text, name, out);
    else if (kind === 'json') {
      let o = null; try { o = JSON.parse(String(text).replace(/^﻿/, '')); } catch (e) { out.push({ level: 'error', msg: 'This is not valid JSON (' + e.message + ').' }); }
      if (o) out.push(isObj(o) && o.format !== undefined ? { level: 'error', msg: 'This is JSON but not an AWANA data file (its format is "' + o.format + '").' } : { level: 'warn', msg: 'This is JSON but not an AWANA data file, so this app cannot open it.' });
      else if (!out.length) out.push({ level: 'warn', msg: 'This is not a file this app knows how to open.' });
    }
    else if (kind === 'pc') validatePc(text, name, out);
    else if (kind) validateCsv(kind, text, out);
    else out.push({ level: 'warn', msg: 'This is not a file this app knows how to open (not a data file, Planning Center export, calendar, rotation, colors or old master).' });
    out.forEach(f => { if (!f.check) f.check = 'file'; });      // findings about a whole file (an export, a calendar CSV, a stray JSON) belong to no section
    return { kind, findings: out };
  }

  // ---------- what the Debug tab shows about a file ----------
  function inspect(text, name, lastModified) {
    const kind = detect(text), facts = {}; let nameStamp = '';
    const tag = /-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.json$/.exec(name || ''), lead = /^(\d{4})(\d{2})(\d{2})\b/.exec(String(name || '').trim());
    if (tag) nameStamp = tag[1] + '-' + tag[2] + '-' + tag[3] + ' ' + tag[4] + ':' + tag[5] + ':' + tag[6]; else if (lead) nameStamp = lead[1] + '-' + lead[2] + '-' + lead[3];
    try {
      if (kind === 'data') {
        const s = Season.fromJson(text), last = s.history[s.history.length - 1];
        facts['Club year'] = s.year; facts['Format version'] = String(JSON.parse(String(text).replace(/^﻿/, '')).version);
        facts.People = String(Object.keys(s.roster.people).length); facts['Planning Center data as of'] = s.roster.pcAsOf || '';
        facts['Nights recorded'] = String(Object.keys(s.attendance).length); facts['Calendar dates'] = String(s.calendar.length);
        facts['Versions logged'] = String(s.history.length); facts['Last edit'] = last ? local(Date.parse(last.t)).slice(0, 16) : '';
      } else if (kind === 'pc') {
        facts.People = String(M.normalizePc(Csv.toRecords(Csv.parse(text))).records.length); facts['As of'] = M.exportDate(name, '');
      } else if (kind === 'calendar') {
        const rows = Calendar.load(text); facts.Dates = String(rows.length); if (rows.length) { facts.First = rows[0].Date; facts.Last = rows[rows.length - 1].Date; }
      } else if (kind) facts.Rows = String(Math.max(0, Csv.parse(text).length - 1));
    } catch (e) { facts.Problem = e.message; }
    return { kind, nameStamp, modified: lastModified ? local(lastModified) : '', facts };
  }

  const api = { detect, validate, inspect, isDate, CHECKED_SECTIONS, CHECKED_CONFIG };
  if (typeof module !== 'undefined') module.exports = api; else root.Validate = api;
})(this);
