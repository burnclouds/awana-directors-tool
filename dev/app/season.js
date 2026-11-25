(this.AwanaVersions = this.AwanaVersions || {})['season.js'] = '1.74.7';
// Season store: everything recorded during one club year, kept in one JSON file keyed by person ID
// (attendance, games, awards, handbooks, section-by-section progress, the roster) plus the lists and templates they use.
//
// The file format is specified in docs/DATA-FORMAT.md: every top-level key, every section and its shape, every encoded value
// (handbook string, packed Planning Center record, progress keys, no-date pairs), and what is never stored.
// test/data-format-doc.test.js fails when this file has a section, key or flag level the document lacks.
// This comment keeps no list of sections on purpose (the old one went stale): the one list is SECTIONS, further down, with its own note.
//

// The file contains Unique IDs (RegID_First_Last), so it holds children's names; treat it like the roster.
(function (root) {
  const Catalog = root.Catalog || (typeof require !== 'undefined' ? require('./catalog.js') : null);
  const Model = root.Model || (typeof require !== 'undefined' ? require('./model.js') : null);      /* model.js loads before season.js and does not use it: no cycle */
  const Calendar = root.Calendar || (typeof require !== 'undefined' ? require('./calendar.js') : null);      // the one "club night" rule (Calendar.isNight)
  const FORMAT = 'awana-season', VERSION = 6;      // 6 (R17): roster.pcExport and kept unknown keys; a version 5 reader would drop them without a trace, so it must refuse the file
  const MARKS = ['a', 'h', 'p', 'x'];
  const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
  const TEAMS = ['Red', 'Blue', 'Green', 'Yellow'];
  // This year's book for a group that uses one book together: Cubbies and T&T always, Sparks only when the club uses the All Together method (config.sparksBooks === 'together');
  // otherwise Sparks work through HG, WR, SS in turn and no single book is theirs. config.yearBook[group] is a key of config.books whose group is that group.
  const YEAR_BOOK_GROUPS = ['Cubbies', 'Sparks', 'T&T'], SPARKS_BOOKS = ['sequence', 'together'];
  const usesYearBook = (s, group) => YEAR_BOOK_GROUPS.includes(group) && (group !== 'Sparks' || s.config.sparksBooks === 'together');
  // The group a book belongs to; an older file's book list may lack it, so the standard list fills in.
  // The standard list is built once (it used to be rebuilt on every call, which was most of the time drawing a long report); only the group of a key is kept, never a shared object.
  let defGroups = null; const defGroup = key => { if (!defGroups) { defGroups = {}; const b = Catalog.defaultConfig().books; Object.keys(b).forEach(k => { defGroups[k] = (b[k] || {}).group || ''; }); } return defGroups[key] || ''; };
  const bookGroup = (s, key) => ((s.config.books || {})[key] || {}).group || defGroup(key);
  const yearBook = (s, group) => { const k = usesYearBook(s, group) && ((s.config.yearBook || {})[group] || ''); return k && (s.config.books || {})[k] && bookGroup(s, k) === group ? k : ''; };
  function setYearBook(s, group, code) {
    if (!usesYearBook(s, group)) throw new Error(group === 'Sparks' ? 'Sparks have a book for the year only with the All Together method (Options tab).' : 'Only Cubbies, Sparks and T&T have a book for the year.');
    if (code && !((s.config.books || {})[code] && bookGroup(s, code) === group)) throw new Error('"' + code + '" is not a ' + group + ' book.');
    s.config.yearBook = Object.assign({ Cubbies: '', Sparks: '', 'T&T': '' }, s.config.yearBook, { [group]: code || '' });
  }
  function setSparksBooks(s, mode) {
    if (!SPARKS_BOOKS.includes(mode)) throw new Error('Sparks books are "sequence" or "together".');
    s.config.sparksBooks = mode;
  }
  const DEFAULT_TEAM_ORDER = ['Red', 'Yellow', 'Green', 'Blue'];
  // The order the colors are listed in (config.teamOrder, set on the Options tab). The data does not depend on it. Anything that is not the four colors once each (an older file has none) falls back to the standard order.
  const teamOrder = s => { const o = s && s.config && s.config.teamOrder; return Array.isArray(o) && o.length === TEAMS.length && TEAMS.every(t => o.includes(t)) ? o.slice() : DEFAULT_TEAM_ORDER.slice(); };
  function setTeamOrder(s, order) {
    if (!(Array.isArray(order) && order.length === TEAMS.length && TEAMS.every(t => order.includes(t)))) throw new Error('The team order lists Red, Blue, Green and Yellow once each.');
    s.config.teamOrder = order.slice();
  }
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const clone = o => JSON.parse(JSON.stringify(o));
  const isObj = o => o && typeof o === 'object' && !Array.isArray(o);
  const isRealDate = d => { const m = DATE_RE.test(d) && /^(\d{4})-(\d{2})-(\d{2})$/.exec(d); if (!m) return false; const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return t.getUTCFullYear() === +m[1] && t.getUTCMonth() === +m[2] - 1 && t.getUTCDate() === +m[3]; };
  const needDate = d => { if (!isRealDate(d)) throw new Error('Bad date "' + d + '" (use YYYY-MM-DD).'); return d; };

  // ---------- file ----------
  function blank(year) {
    return { format: FORMAT, version: VERSION, year: year || '', config: Catalog.defaultConfig(),
      handbooks: {}, attendance: {}, awards: {}, given: {}, givenNoDate: {}, held: {}, flags: {}, doneBooks: {}, doneReviews: {}, received: {}, adults: {}, teamMoves: {}, games: {}, progress: {}, roster: { cols: [], people: {} }, calendar: [], rotation: [], history: [] };
  }
  function sortKeys(v) {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (!isObj(v)) return v;
    const o = {}; Object.keys(v).sort().forEach(k => { o[k] = sortKeys(v[k]); }); return o;
  }
  // The Planning Center record of each person: field names once, then one list of values per person (null = the person has no such field).
  // The names are roster.pcCols (the export's column order, already kept for the reports) when it covers every field in use; otherwise roster.pcKeys (sorted) is added.
  // A person whose record holds anything but text stays an object, so nothing is ever changed by packing.
  function packRoster(r) {
    const people = isObj(r) && isObj(r.people) ? r.people : {}, ids = Object.keys(people);
    const packable = id => isObj(people[id]) && isObj(people[id].pc) && Object.keys(people[id].pc).every(k => typeof people[id].pc[k] === 'string');
    const used = [...new Set([].concat(...ids.filter(packable).map(id => Object.keys(people[id].pc))))].sort();
    if (!used.length) return r;
    const own = Array.isArray(r.pcCols) && r.pcCols.every(c => typeof c === 'string') && new Set(r.pcCols).size === r.pcCols.length && used.every(c => r.pcCols.includes(c));
    const cols = own ? r.pcCols : used, out = {};
    ids.forEach(id => { out[id] = packable(id) ? Object.assign({}, people[id], { pc: cols.map(c => c in people[id].pc ? people[id].pc[c] : null) }) : people[id]; });
    return Object.assign({}, r, own ? {} : { pcKeys: used }, { people: out });
  }
  function unpackRoster(r) {
    if (!isObj(r)) return r;
    const cols = Array.isArray(r.pcKeys) ? r.pcKeys : Array.isArray(r.pcCols) ? r.pcCols : [], out = Object.assign({}, r), people = {};
    delete out.pcKeys;
    Object.keys(isObj(r.people) ? r.people : {}).forEach(id => {
      const e = r.people[id];
      if (!isObj(e) || !Array.isArray(e.pc)) { people[id] = e; return; }
      const pc = {}; cols.forEach((c, i) => { if (e.pc[i] !== null && e.pc[i] !== undefined) pc[c] = e.pc[i]; });
      people[id] = Object.assign({}, e, { pc });
    });
    out.people = people; return out;
  }
  // givenNoDate (awards marked given with no date, see setGiven) is left out of the file while it is empty, so most files stay exactly as they were.
  const toJson = s => { const o = Object.assign({}, s, { roster: packRoster(s.roster) }); const extra = o.unknownKeys; delete o.unknownKeys; if (extra) Object.keys(extra).forEach(k => { if (!(k in o)) o[k] = extra[k]; });      /* keys this app does not know are written back at the top level; a known key always wins (R17) */ if (!Object.keys(s.givenNoDate || {}).length) delete o.givenNoDate; if (!Object.keys(s.held || {}).length) delete o.held; if (!Object.keys(s.flags || {}).length) delete o.flags; if (!Object.keys(s.doneBooks || {}).length) delete o.doneBooks; if (!Object.keys(s.doneReviews || {}).length) delete o.doneReviews; if (!Object.keys(s.received || {}).length) delete o.received; if (!Object.keys(s.progressNoDate || {}).length) delete o.progressNoDate; if (!Object.keys(s.extraSheets || {}).length) delete o.extraSheets; if (!Object.keys(s.announcedNoDate || {}).length) delete o.announcedNoDate; if (!Object.keys(s.blueWings || {}).length) delete o.blueWings; if (!Object.keys(s.blueOverrides || {}).length) delete o.blueOverrides; if (!Object.keys(s.blueDrops || {}).length) delete o.blueDrops; if (!Object.keys(s.pastTurnout || {}).length) delete o.pastTurnout; if (!Object.keys(s.absences || {}).length) delete o.absences; return JSON.stringify(sortKeys(o)) + '\n'; };
  // Older files keyed a book by two letters and wrote it differently in records (AO written AoG, kept as the book's "spell"). The key is now the code itself, so the book moves to its written form;
  // the year's book, and any progress kept under the old key, follow. A file from before "spell" existed had AO for Agents of Grace.
  function renameBooks(s, o) {
    const books = s.config.books, moved = {}; if (!isObj(books)) return moved;
    const yb = s.config.yearBook || {}, again = () => Object.keys(yb).forEach(g => { if (yb[g] && !books[yb[g]]) { const k = Catalog.bookKeyOf(books, yb[g]); if (k) yb[g] = k; } });      // a year's book named by an older spelling (AO) finds its book (AoG)
    Object.keys(books).forEach(k => {
      const b = books[k], to = isObj(b) && (b.spell || (k === 'AO' && !isObj(o.config && o.config.books && o.config.books.AoG) ? 'AoG' : ''));
      if (isObj(b) && 'spell' in b) delete b.spell;
      if (!to || to === k || !/^[A-Za-z]{2,3}$/.test(to) || Object.keys(books).some(x => x.toLowerCase() === to.toLowerCase() && x !== k)) return;
      books[to] = b; delete books[k]; moved[k] = to;
      Object.keys(s.config.yearBook || {}).forEach(g => { if (s.config.yearBook[g] === k) s.config.yearBook[g] = to; });
      Object.keys(o.progress || {}).forEach(id => { const kid = o.progress[id]; if (isObj(kid) && kid[k] && !kid[to]) { kid[to] = kid[k]; delete kid[k]; } });
      ['doneBooks', 'doneReviews'].forEach(section => Object.keys(o[section] || {}).forEach(id => { if (Array.isArray(o[section][id])) o[section][id] = o[section][id].map(c => c === k ? to : c); }));
    });
    again();
    return moved;
  }
  // The log names books by key too (a book edited, a year's book chosen, progress kept under it): follow the rename, or the history would no longer add up to the data.
  function renameInHistory(history, moved) {
    const to = v => typeof v === 'string' && moved[v] ? moved[v] : v, keys = o => isObj(o) ? Object.keys(o).reduce((r, k) => { r[to(k)] = o[k]; return r; }, {}) : o;
    return history.map(e => Object.assign({}, e, { changes: (e.changes || []).map(c => {
      const p = c.p || [], n = Object.assign({}, c);
      if (p[0] === 'config' && p[1] === 'books') { n.p = p.map((x, i) => i === 2 ? to(x) : x); if (p.length === 2) { if ('o' in c) n.o = keys(c.o); if ('n' in c) n.n = keys(c.n); } }
      else if (p[0] === 'config' && p[1] === 'yearBook' && p.length === 3) { if ('o' in c) n.o = to(c.o); if ('n' in c) n.n = to(c.n); }
      else if (p[0] === 'progress') { n.p = p.map((x, i) => i === 2 ? to(x) : x); if (p.length === 2) { if ('o' in c) n.o = keys(c.o); if ('n' in c) n.n = keys(c.n); } }
      else if ((p[0] === 'doneBooks' || p[0] === 'doneReviews') && p.length === 2) { if ('o' in c && Array.isArray(c.o)) n.o = c.o.map(to); if ('n' in c && Array.isArray(c.n)) n.n = c.n.map(to); }
      return n;
    }) }));
  }
  function fromJson(text) {
    let o;
    try { o = JSON.parse(String(text).replace(/^﻿/, ''), (k, v) => k === '__proto__' ? undefined : v); } catch (e) { throw new Error('Not a season file (not valid JSON).'); }      // a "__proto__" key in a file is dropped: the paths used by undo, restore and merge would walk into Object.prototype
    if (isObj(o) && o.readable === true) throw new Error('This is a readable copy, made for reading only. Open your data file instead.');
    if (!isObj(o) || o.format !== FORMAT) throw new Error('Not a season file.');
    if (!(o.version <= VERSION)) throw new Error('This season file is from a newer version of the app (version ' + o.version + ').');
    const s = blank(o.year);
    if (o.fake === true) s.fake = true;      // an invented demo club (see freshenFake)
    const dflt = s.config;
    s.config = Object.assign({}, dflt, isObj(o.config) ? o.config : {});
    // The Blue Jewel counts are drawn into pages and used as night counts: only a list of whole, rising, positive numbers is accepted; anything else (a crafted or damaged file) falls back to the defaults.
    { const w = s.config.blueJewelWeeks; if (!(Array.isArray(w) && w.length >= 1 && w.length <= 4 && w.every((n, i) => Number.isInteger(n) && n > 0 && n < 1000 && (i === 0 || n > w[i - 1])))) s.config.blueJewelWeeks = dflt.blueJewelWeeks.slice(); }
    s.config.yearBook = Object.assign({}, dflt.yearBook, isObj(s.config.yearBook) ? s.config.yearBook : {});
    if (s.config.tntBook) { if (!s.config.yearBook['T&T']) s.config.yearBook['T&T'] = s.config.tntBook; }      // 1.32 kept only the T&T book, as tntBook
    delete s.config.tntBook;
    const moved = renameBooks(s, o);
    ['handbooks', 'attendance', 'awards', 'given', 'givenNoDate', 'held', 'flags', 'doneBooks', 'doneReviews', 'received', 'adults', 'teamMoves', 'games', 'progress', 'progressNoDate', 'extraSheets', 'announcedNoDate', 'blueWings', 'blueOverrides', 'blueDrops', 'pastTurnout', 'absences'].forEach(k => { if (isObj(o[k])) s[k] = o[k]; });
    // Given is only ever entered by a person. A file from before the Given check opens with nothing given (an older version of the app assumed every announced award was given on its announce night; that is gone, and assumedGiven finds what it left behind).
    // Version 4: a Sparks jewel is earned by sections 1-4 alone and 5-8 are its reviews (they count toward the book's Review Emblem); SkyStormer's Review Emblem is red.
    // A file with the old template (a single "rev" box per jewel) gets the new one; dates already entered, including any old "rev", stay where they are.
    // The roster, calendar, rotation and History are copied first so the upgrades below can be logged: what they change is recorded as one "File upgrade" entry (none of them reads these four).
    if (isObj(o.roster)) o.roster = unpackRoster(o.roster);
    if (isObj(o.roster)) s.roster = Object.assign({}, o.roster, { cols: Array.isArray(o.roster.cols) ? o.roster.cols : [], people: isObj(o.roster.people) ? o.roster.people : {} });
    ['calendar', 'rotation', 'history'].forEach(k => { if (Array.isArray(o[k])) s[k] = o[k]; });
    // N2: Puggles # and Puggles Title become one Puggles Lesson column. Done here, BEFORE the upgrade snapshot, so it is not logged: a rename of two columns is not worth a whole-calendar History entry (diff treats a list as one value, so it would write the calendar twice, about 25 KB). A row without the old keys is the same object, so a current file changes nothing.
    if (Array.isArray(s.calendar)) s.calendar = s.calendar.map(Calendar.tidy);
    // A top-level key this app does not know (a newer tool's, or a hand-added one) is kept as it is and written back, never dropped (R17). Not a section, so History does not track it.
    { const unknown = Object.keys(o).filter(k => !KNOWN_TOP.includes(k)); if (unknown.length) { s.unknownKeys = {}; unknown.forEach(k => { s.unknownKeys[k] = o[k]; }); } }
    const beforeUpgrade = snapshot(s);
    const oldT = s.config.progress && s.config.progress.Sparks;
    if (oldT && (oldT.perBook || []).some(b => (b.items || []).includes('rev'))) s.config.progress = Object.assign({}, s.config.progress, { Sparks: Catalog.sparksTemplate() });
    renameAward(s, 'SS Review Emblem - Yellow', 'SS Review Emblem - Red');
    addStandardBooks(s); upgradeTnt(s); upgradeSparksJewels(s); upgradeStartZone(s); upgradeCubbies(s); upgradeSettings(s); upgradeLegacyKeys(s);
    if (Object.keys(moved).length) s.history = renameInHistory(s.history, moved);
    // What the upgrades changed becomes one named version, so the History still explains the data (R20). It repeats the last entry's time: two copies opening the same file write the same entry.
    // A file with no History gets none (the upgraded data is simply where it starts), and a current file changes nothing.
    if (s.history.length) {
      const changes = diff(beforeUpgrade, s);
      if (changes.length) s.history.push({ t: s.history[s.history.length - 1].t, label: 'File upgrade', tag: 'File upgrade', changes });
    }
    return s;
  }
  // ---------- demo files: dates that follow today ----------
  // A file with "fake": true is the invented demo club. It keeps its dates as of the day it was made; Try it out opens it through freshenFake, which moves every date forward by whole
  // weeks (so a club night stays on its weekday) until its newest attendance night is the latest one on or before today. Nothing else opens a file this way, so the tests and any
  // file opened from disk keep the dates they hold.
  const DAY = 86400000, addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10);
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/, STAMP = /^\d{4}-\d{2}-\d{2}T/, YYMMDD = /(^|\s)(\d{2})(\d{2})(\d{2})(?=\s|$)/;
  function moveDeep(x, n) {
    if (typeof x === 'string') return ISO_DATE.test(x) ? addDays(x, n) : STAMP.test(x) ? new Date(Date.parse(x) + n * DAY).toISOString() : x;
    if (Array.isArray(x)) return x.map(v => moveDeep(v, n));
    if (isObj(x)) { const o = {}; Object.keys(x).forEach(k => { o[ISO_DATE.test(k) ? addDays(k, n) : k] = moveDeep(x[k], n); }); return o; }
    return x;
  }
  // a handbook is "HG 260916 note": book code, date received as yymmdd, note
  const moveHandbook = (t, n) => typeof t === 'string' ? t.replace(YYMMDD, (m, sp, y, mo, d) => sp + addDays('20' + y + '-' + mo + '-' + d, n).slice(2).replace(/-/g, '')) : t;
  function shiftDates(s, days) {
    if (!days) return s;
    const keep = { format: s.format, version: s.version, year: s.year, fake: s.fake }, out = Object.assign({}, moveDeep(Object.assign({}, s, { handbooks: {}, history: [] }), days), keep);
    out.handbooks = {}; Object.keys(s.handbooks || {}).forEach(id => { out.handbooks[id] = moveHandbook(s.handbooks[id], days); });
    out.history = (s.history || []).map(e => { const h = moveDeep(Object.assign({}, e, { changes: [] }), days); h.changes = (e.changes || []).map(c => { const m = moveDeep(c, days); if (c.p && c.p[0] === 'handbooks') { if ('o' in c) m.o = moveHandbook(c.o, days); if ('n' in c) m.n = moveHandbook(c.n, days); } return m; }); return h; });
    if (out.fake === undefined) delete out.fake;
    return out;
  }
  function freshenFake(text, today) {
    let o; try { o = JSON.parse(String(text).replace(/^\uFEFF/, '')); } catch (e) { return text; }
    if (!isObj(o) || o.fake !== true) return text;
    const s = fromJson(text), nights = Object.keys(s.attendance).filter(isRealDate).sort(), last = nights[nights.length - 1];
    if (!last || !isRealDate(today)) return text;
    const weeks = Math.floor((Date.parse(today + 'T12:00:00Z') - Date.parse(last + 'T12:00:00Z')) / (7 * DAY));
    return weeks > 0 ? toJson(shiftDates(s, weeks * 7)) : text;
  }
  // ---------- dates in an opened file ----------
  // fromJson keeps whatever dates the file holds, so a hand-edited or damaged file can still be opened and repaired. badDates lists every
  // date that is not a real YYYY-MM-DD; fixDates applies a person's decision for each (correct it, or remove that entry).
  function badDates(s) {
    const out = [], add = (section, kind, path, value, what, drops, field) => out.push({ section, kind, path, field, value, what, drops });
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
    const keyed = (sec, what, drops) => { if (isObj(s[sec])) Object.keys(s[sec]).forEach(d => { if (!isRealDate(d)) add(sec, 'key', [d], d, what, drops(s[sec][d])); }); };
    const size = v => Array.isArray(v) ? v.length : isObj(v) ? Object.keys(v).length : 0;
    keyed('attendance', 'Attendance night', v => plural(size(v), 'child’s marks', 'children’s marks'));
    keyed('games', 'Games night', v => plural(size(v), 'group’s results', 'groups’ results'));
    keyed('awards', 'Awards night', v => plural(size(v), 'child’s announced awards', 'children’s announced awards'));
    keyed('adults', 'Adult awards night', v => plural(size(v), 'adult award', 'adult awards'));
    if (isObj(s.given)) Object.keys(s.given).forEach(id => { if (isObj(s.given[id])) Object.keys(s.given[id]).forEach(a => { if (!isRealDate(s.given[id][a])) add('given', 'value', [id, a], s.given[id][a], 'Given date: ' + a + ' (' + id + ')', 'the “given” mark'); }); });
    if (isObj(s.progress)) Object.keys(s.progress).forEach(id => { if (isObj(s.progress[id])) Object.keys(s.progress[id]).forEach(b => { if (isObj(s.progress[id][b])) Object.keys(s.progress[id][b]).forEach(k => {
      if (!isRealDate(s.progress[id][b][k])) add('progress', 'value', [id, b, k], s.progress[id][b][k], 'Progress date: ' + b + ' ' + k + ' (' + id + ')', 'that finished section');
    }); }); });
    if (isObj(s.teamMoves)) Object.keys(s.teamMoves).forEach(id => { if (Array.isArray(s.teamMoves[id])) s.teamMoves[id].forEach((m, i) => { if (isObj(m) && !isRealDate(m.from)) add('teamMoves', 'value', [id, i], m.from, 'Team move' + (m.q ? ' in ' + m.q : '') + ' (' + id + ')', 'that color change', 'from'); }); });
    if (Array.isArray(s.calendar)) s.calendar.forEach((r, i) => { if (isObj(r) && !isRealDate(r.Date)) add('calendar', 'value', [i], r.Date, 'Calendar row' + (r.Theme ? ' “' + r.Theme + '”' : ' ' + (i + 1)), 'that calendar row', 'Date'); });
    return out;
  }
  // A best guess at what a damaged date was meant to be ('' if none): 2026-9-5, 9/5/2026, 20260905, 2026-09-31 (clamped to the month's last day).
  function guessDate(v) {
    const str = String(v == null ? '' : v).trim(), pad = n => String(n).padStart(2, '0');
    let y, m, d, x;
    if ((x = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:$|[T ])/.exec(str))) { y = +x[1]; m = +x[2]; d = +x[3]; }
    else if ((x = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/.exec(str))) { y = +x[3]; m = +x[1]; d = +x[2]; }
    else if ((x = /^(\d{4})(\d{2})(\d{2})$/.exec(str))) { y = +x[1]; m = +x[2]; d = +x[3]; }
    else return '';
    if (m < 1 || m > 12 || d < 1) return '';
    d = Math.min(d, new Date(Date.UTC(y, m, 0)).getUTCDate());
    const g = y + '-' + pad(m) + '-' + pad(d); return isRealDate(g) ? g : '';
  }
  // Two nights becoming one: objects merge, lists join (no repeats), and where both hold a different value for the same thing `prefer` ('existing' or 'new') decides.
  function mergeVal(existing, incoming, prefer) {
    if (isObj(existing) && isObj(incoming)) { const r = Object.assign({}, existing); Object.keys(incoming).forEach(k => { r[k] = k in r ? mergeVal(r[k], incoming[k], prefer) : incoming[k]; }); return r; }
    if (Array.isArray(existing) && Array.isArray(incoming)) { const seen = new Set(existing.map(x => JSON.stringify(x))); return existing.concat(incoming.filter(x => !seen.has(JSON.stringify(x)))); }
    return same(existing, incoming) ? existing : prefer === 'new' ? incoming : existing;
  }
  function clashCount(a, b) {
    if (isObj(a) && isObj(b)) return Object.keys(b).reduce((n, k) => n + (k in a ? clashCount(a[k], b[k]) : 0), 0);
    if (Array.isArray(a) && Array.isArray(b)) return 0;
    return same(a, b) ? 0 : 1;
  }
  // How many values would disagree if this item's night were corrected to `to` and that night already exists (0 = they merge cleanly).
  function dateClashes(s, item, to) { return item.kind === 'key' && isRealDate(to) && to in s[item.section] ? clashCount(s[item.section][to], s[item.section][item.value]) : 0; }
  // decisions: [{ item, action: 'fix' | 'remove', to, prefer }], item as returned by badDates for this same season object. Changes `s` in place; returns { fixed, removed }.
  function fixDates(s, decisions) {
    const n = { fixed: 0, removed: 0 };
    decisions.forEach(d => { if (d.action === 'fix' && !isRealDate(d.to)) throw new Error('"' + d.to + '" is not a real date (use YYYY-MM-DD).'); });
    const at = (it, up) => it.path.slice(0, it.path.length - up).reduce((o, k) => o[k], s[it.section]);
    decisions.filter(d => d.action === 'fix').forEach(({ item: it, to, prefer }) => {
      if (it.kind === 'key') { const o = s[it.section], v = o[it.value]; delete o[it.value]; o[to] = to in o ? mergeVal(o[to], v, prefer) : v; }
      else if (it.field) at(it, 0)[it.field] = to;
      else at(it, 1)[it.path[it.path.length - 1]] = to;
      n.fixed++;
    });
    // Removals last, and list entries from the end backwards, so an index in a later item still points at the same entry.
    const rm = decisions.filter(d => d.action === 'remove').sort((a, b) => {
      const ia = a.item.field ? a.item.path[a.item.path.length - 1] : -1, ib = b.item.field ? b.item.path[b.item.path.length - 1] : -1; return ib - ia; });
    rm.forEach(({ item: it }) => {
      if (it.kind === 'key') delete s[it.section][it.value];
      else if (it.field) { const list = it.section === 'calendar' ? s.calendar : s.teamMoves[it.path[0]]; list.splice(it.path[it.path.length - 1], 1); if (it.section === 'teamMoves' && !list.length) delete s.teamMoves[it.path[0]]; }
      else for (let depth = it.path.length; depth >= 1; depth--) {          // the date, then any award or book left empty by taking it out
        const parent = it.path.slice(0, depth - 1).reduce((o, k) => o[k], s[it.section]), k = it.path[depth - 1];
        if (depth === it.path.length || (isObj(parent[k]) && !Object.keys(parent[k]).length)) delete parent[k]; else break;
      }
      n.removed++;
    });
    return n;
  }

  // The standard books added in 1.50.13 (the other three T&T books and the second Cubbies book) join an older file's book list; a book you already have under that code is left alone.
  function addStandardBooks(s) {
    const std = Catalog.defaultConfig().books, books = s.config.books; if (!isObj(books)) return;
    ['AS', 'DoG', 'GiA', 'EoG'].forEach(k => { if (!Object.keys(books).some(x => x.toLowerCase() === k.toLowerCase())) books[k] = clone(std[k]); });
  }
  // T&T progress used to be one set of four units under "common" (one book per child). It is now per book. An older file's T&T template is replaced, each child's emblem and Silver / Gold
  // dates move to their T&T handbook (else Agents of Grace, the first book of the cycle), and the award names that belonged to those blocks get the book code ("Blue Emblem 1" -> "AoG Blue Emblem 1").
  const TNT_OLD_AWARD = /^((Blue|Red|Green|Yellow) Emblem [12]|Discovery Award (Blue|Red|Green|Yellow) Emblem|(Silver|Gold) [1-4]|Extra Credit (Silver|Gold) Emblem)$/;
  function upgradeTnt(s) {
    const t = s.config.progress && s.config.progress['T&T'];
    if (!t || (t.perBook || []).length || !(t.common || []).some(b => b.key === 'BE1')) return;
    const fresh = Catalog.tntTemplate(), moveKeys = new Set(fresh.perBook.map(b => b.key));
    s.config.progress['T&T'] = fresh;
    const names = new Set();
    const lists = s.config.awardLists || {}, tnt = lists['T&T'] || [];
    tnt.filter(a => TNT_OLD_AWARD.test(a)).forEach(a => names.add(a));
    Object.keys(s.awards).forEach(d => Object.keys(s.awards[d]).forEach(id => s.awards[d][id].forEach(a => { if (TNT_OLD_AWARD.test(a)) names.add(a); })));
    Object.keys(s.given).forEach(id => Object.keys(s.given[id]).forEach(a => { if (TNT_OLD_AWARD.test(a)) names.add(a); }));
    names.forEach(a => renameAward(s, a, 'AoG ' + a));
    const want = Catalog.defaultConfig().awardLists['T&T'];
    if (Array.isArray(lists['T&T'])) want.forEach(a => { if (!lists['T&T'].includes(a)) lists['T&T'].push(a); });
    Object.keys(s.progress).forEach(id => {
      const kid = s.progress[id], c = kid && kid.common; if (!isObj(c)) return;
      const hb = parseHandbook(s.handbooks[id]).code, code = bookKey(s, hb), book = code && bookGroup(s, code) === 'T&T' ? code : 'AoG';
      Object.keys(c).forEach(k => { if (moveKeys.has(k.split('.')[0])) { (kid[book] || (kid[book] = {}))[k] = c[k]; delete c[k]; } });
      if (!Object.keys(c).length) delete kid.common;
    });
  }
  // One spelling for every reader (R18). Drive folders are { club, slides }: an older file's separate open / data folders fold into club (club, else data, else open), so no folder moves.
  // Anything that is not an object, and any other key, is dropped: only the Drive code reads this setting.
  function normDriveDirs(d) { d = isObj(d) ? d : {}; return { club: d.club || d.data || d.open || null, slides: d.slides || null }; }
  // A person's stored x_ClubberID is a copy of their own id (the id is the key). Opening a file removes the copy when it IS the id; a copy that differs is clubber data and is kept (the file check reports it).
  // Both changes are logged by the "File upgrade" entry fromJson writes, so the History still explains the data.
  function upgradeLegacyKeys(s) {
    s.config.driveDirs = normDriveDirs(s.config.driveDirs);
    const people = s.roster && isObj(s.roster.people) ? s.roster.people : {};
    Object.keys(people).forEach(id => { const v = isObj(people[id]) && people[id].v; if (isObj(v) && v.x_ClubberID === id) delete v.x_ClubberID; });
    upgradeTeamColors(s);
    upgradeBugStatus(s);
    upgradeNotAwards(s);
  }
  // N18: 'answered' is retired (a reply is not a resolution, and replies are a conversation now). An old file's answered report opens as open; fixed and open stay. Logged by the one File upgrade entry.
  function upgradeBugStatus(s) { Object.keys(s.flags || {}).forEach(id => { const f = s.flags[id]; if (isObj(f) && f.level === 'bug' && f.status === 'answered') f.status = 'open'; }); }
  // A team color typed in other capitals or with spaces in an old file ('red', 'RED', 'Red ') is the color it names (Fable review T2): the old audit read it that way and the planner and the grid did not, so a child
  // could look hand-set (pinned) and the sizes looked uneven. Opening the file writes the canonical spelling, in the roster's quarter colors (team:Q1, team:2025-26:Q1) and in dated moves.
  // Every screen that sets a color offers only the four, and the file check rejects anything else, so this is the one way such a value gets in. Text that is not one of the four colors is left alone.
  function upgradeTeamColors(s) {
    const canon = v => { if (typeof v !== 'string') return v; const t = v.trim().toLowerCase(), c = TEAMS.find(x => x.toLowerCase() === t); return c || v; };
    const people = s.roster && isObj(s.roster.people) ? s.roster.people : {};
    Object.keys(people).forEach(id => { const v = isObj(people[id]) && people[id].v; if (isObj(v)) Object.keys(v).forEach(k => { if (/^team:(\d{4}-\d{2}:)?Q[1-4]$/.test(k)) v[k] = canon(v[k]); }); });
    if (isObj(s.teamMoves)) Object.keys(s.teamMoves).forEach(id => { if (Array.isArray(s.teamMoves[id])) s.teamMoves[id].forEach(m => { if (isObj(m)) m.team = canon(m.team); }); });
  }
  // Plan item 1: save and update settings live in the file. A file that lacks one takes the default; nothing is copied from a browser.
  function upgradeSettings(s) {
    const d = Catalog.defaultConfig(), c = s.config;
    ['saveStyleDrive', 'saveStyleLocal'].forEach(k => { if (c[k] === undefined) c[k] = d[k]; });
    ['autoUpdate', 'autoSave'].forEach(k => { if (!isObj(c[k])) c[k] = Object.assign({}, d[k]); });
  }
  // Cubbies have a progress sheet from 1.50.23: an older file gets the template (one box per unit unless config.cubbiesDetail says 'section'), the two book awards, and the book awards on the end-of-year list.
  function upgradeCubbies(s) {
    const c = s.config; if (!isObj(c.progress)) return;
    if (!isObj(c.progress.Cubbies)) c.progress.Cubbies = Catalog.cubbiesTemplate(c.cubbiesDetail === 'section' ? 'section' : 'unit');
    if (isObj(c.completion) && !Array.isArray(c.completion.Cubbies)) c.completion.Cubbies = Catalog.defaultConfig().completion.Cubbies.slice();
    const eoy = isObj(c.endOfYear) && c.endOfYear.Cubbies, want = Catalog.defaultConfig().completion.Cubbies;
    if (Array.isArray(eoy) && !want.some(a => eoy.includes(a))) c.endOfYear.Cubbies = want.concat(eoy);
  }
  // How Cubbies sign-offs are kept: one box per block ('unit': Apple Acres, the Trail and six units, 8 in all) or one per Bear Hug ('section', 28). Dates are carried across: a unit's date goes to each of its Bear Hugs,
  // and a unit with every Bear Hug dated becomes one date (its latest). Going to one box per unit is refused while a block is only partly done, so no date is lost.
  const CUBBIES_DETAIL = ['unit', 'section'];
  function setCubbiesDetail(s, mode) {
    if (!CUBBIES_DETAIL.includes(mode)) throw new Error('Cubbies detail is "unit" or "section".');
    const cur = s.config.cubbiesDetail === 'section' ? 'section' : 'unit', fresh = Catalog.cubbiesTemplate(mode), old = s.config.progress.Cubbies || Catalog.cubbiesTemplate(cur);
    if (mode === cur && s.config.progress.Cubbies) return { changed: 0 };
    const blocksOf = (t, scope) => scope === 'common' ? t.common : t.perBook, scopesOf = kid => ['common'].concat(Object.keys(s.config.books || {}).filter(c => bookGroup(s, c) === 'Cubbies' && kid[c]));
    const plan = [];
    Object.keys(s.progress).forEach(id => { const kid = s.progress[id]; if (!isObj(kid)) return;
      scopesOf(kid).forEach(scope => { const dates = kid[scope]; if (!isObj(dates)) return;
        blocksOf(old, scope).forEach((ob, i) => { const nb = blocksOf(fresh, scope)[i], keys = ob.items.map(x => ob.key + '.' + x), have = keys.map(k => dates[k]).filter(Boolean);
          if (!have.length) return;
          if (mode === 'unit') { if (have.length < keys.length) plan.push({ partial: true, id, label: ob.label }); else plan.push({ id, scope, from: keys, to: [nb.key + '.1'], date: have.slice().sort().pop() }); }
          else plan.push({ id, scope, from: keys, to: nb.items.map(x => nb.key + '.' + x), date: have.slice().sort().pop() }); }); }); });
    const partly = plan.filter(x => x.partial);
    if (partly.length) throw new Error(partly.length + ' unit' + (partly.length === 1 ? ' is' : 's are') + ' only partly done, so one box per unit would lose dates. Finish or clear those first, or stay with one box per Bear Hug.');
    plan.forEach(x => { const dates = s.progress[x.id][x.scope]; x.from.forEach(k => delete dates[k]); x.to.forEach(k => { dates[k] = x.date; }); });
    s.config.progress.Cubbies = fresh; if (mode === 'section') s.config.cubbiesDetail = 'section'; else delete s.config.cubbiesDetail;
    return { changed: plan.length };
  }
  // N23: Flight 3:16, Start Zone (and its older "Start Zone 1" / "Start Zone 2") and Apple Acres are booklets and entrance blocks the child finishes; none of them is an award, so none is ever announced, listed to hand out, put on a slide or counted.
  // The sign-off boxes stay on the Progress sheet and still count toward the book; only an AWARD of that name is refused: awardLedger leaves such a row out (so every list that reads the ledger agrees), and opening a file deletes any record of one
  // (an older file, or an older copy of the app, may still carry them), logged by the one "File upgrade" entry.
  const NOT_AWARDS = ['Flight 3:16', 'Start Zone', 'Start Zone 1', 'Start Zone 2', 'Apple Acres'];
  const notAnAward = a => NOT_AWARDS.includes(a);
  function upgradeNotAwards(s) {
    const keep = a => !notAnAward(a);
    if (isObj(s.awards)) Object.keys(s.awards).forEach(d => { const day = s.awards[d]; if (!isObj(day)) return; Object.keys(day).forEach(id => { if (!Array.isArray(day[id])) return; day[id] = day[id].filter(keep); if (!day[id].length) delete day[id]; }); if (!Object.keys(day).length) delete s.awards[d]; });
    if (isObj(s.given)) Object.keys(s.given).forEach(id => { const g = s.given[id]; if (!isObj(g)) return; Object.keys(g).forEach(a => { if (!keep(a)) delete g[a]; }); if (!Object.keys(g).length) delete s.given[id]; });
    ['givenNoDate', 'announcedNoDate'].forEach(k => { if (!isObj(s[k])) return; Object.keys(s[k]).forEach(id => { if (!Array.isArray(s[k][id])) return; s[k][id] = s[k][id].filter(keep); if (!s[k][id].length) delete s[k][id]; }); });
    if (isObj(s.held)) Object.keys(s.held).forEach(id => { const h = s.held[id]; if (!isObj(h)) return; Object.keys(h).forEach(a => { if (!keep(a)) delete h[a]; }); if (!Object.keys(h).length) delete s.held[id]; });
    ['awardLists', 'exclude', 'completion', 'endOfYear'].forEach(k => { const c = s.config[k]; if (isObj(c)) Object.keys(c).forEach(g => { if (Array.isArray(c[g])) c[g] = c[g].filter(keep); }); });
    const sp = s.config.progress && s.config.progress.Sparks; if (sp) (sp.common || []).forEach(b => { if (b && b.key === 'FLT' && Array.isArray(b.awards) && b.awards.some(notAnAward)) b.awards = b.awards.filter(keep); });
  }
  // Start Zone used to be two blocks of one section each, "Start Zone 1" and "Start Zone 2", each with an award. It is one block of two sections with no award (finishing it is how a child earns the book).
  // The two dates move to its sections; awards already recorded under the old names stay in the file as they were.
  function upgradeStartZone(s) {
    const t = s.config.progress && s.config.progress['T&T'];
    if (t && (t.common || []).some(b => b.key === 'SZ1' || b.key === 'SZ2')) t.common = Catalog.tntTemplate().common.concat((t.common || []).filter(b => !/^SZ[12]?$/.test(b.key) && !(b.key === 'SZ')));
    Object.keys(s.progress).forEach(id => {
      const c = (s.progress[id] || {}).common; if (!isObj(c)) return;
      [['SZ1.1', 'SZ.1'], ['SZ2.1', 'SZ.2']].forEach(([from, to]) => { if (c[from] !== undefined) { if (c[to] === undefined) c[to] = c[from]; delete c[from]; } });
    });
    const list = (s.config.awardLists || {})['T&T']; if (Array.isArray(list)) s.config.awardLists['T&T'] = list.filter(a => a !== 'Start Zone 1' && a !== 'Start Zone 2');
  }
  // Sparks jewels used to share one name across the books ("Red Jewel 1"), so a second book's jewels looked already given. They now carry the book code like the Pilot Wing ("WR Red Jewel 1"):
  // Red / Green jewels take the book they were finished in; Blue Jewels (attendance) take the book the child had, as the handbook says. An older file is renamed child by child when opened;
  // a name whose book cannot be told stays as it was (it is still understood: see baseAward).
  const JEWEL_PLAIN = /^(Red|Green|Blue) Jewel [1-4]$/;
  function renameAwardFor(s, id, from, to) {
    Object.keys(s.awards).forEach(d => { const l = s.awards[d][id]; if (l) s.awards[d][id] = l.map(a => a === from ? to : a); });
    const g = s.given[id]; if (g && g[from] !== undefined) { if (g[to] === undefined) g[to] = g[from]; delete g[from]; }
    const nd = (s.givenNoDate || {})[id]; if (nd) s.givenNoDate[id] = [...new Set(nd.map(a => a === from ? to : a))].sort();
    const an = (s.announcedNoDate || {})[id]; if (Array.isArray(an)) s.announcedNoDate[id] = [...new Set(an.map(a => a === from ? to : a))].sort();
    const h = (s.held || {})[id]; if (h && h[from] !== undefined) { h[to] = 1; delete h[from]; }
  }
  function upgradeSparksJewels(s) {
    const t = s.config.progress && s.config.progress.Sparks, rj = t && (t.perBook || []).find(b => b.key === 'RJ1');
    if (!rj || (rj.awards || []).some(a => /\{book\} Red Jewel 1/.test(a))) return;
    s.config.progress.Sparks = Catalog.sparksTemplate();
    const sparks = Object.keys(s.config.books).filter(c => bookGroup(s, c) === 'Sparks'), ids = new Set();
    Object.keys(s.awards).forEach(d => Object.keys(s.awards[d]).forEach(id => ids.add(id)));
    Object.keys(s.given).forEach(id => ids.add(id)); Object.keys(s.givenNoDate || {}).forEach(id => ids.add(id));
    ids.forEach(id => {
      const hbc = bookKey(s, parseHandbook(s.handbooks[id]).code), hb = hbc && sparks.includes(hbc) ? hbc : '', kid = s.progress[id] || {};
      const names = new Set(); Object.keys(s.awards).forEach(d => (s.awards[d][id] || []).forEach(a => names.add(a))); Object.keys(s.given[id] || {}).forEach(a => names.add(a)); ((s.givenNoDate || {})[id] || []).forEach(a => names.add(a));
      names.forEach(a => {
        const m = JEWEL_PLAIN.exec(a); if (!m) return;
        let book = '';
        if (m[1] !== 'Blue') {
          const key = (m[1] === 'Red' ? 'RJ' : 'GJ') + a.slice(-1), blk = t.perBook.find(b => b.key === key);
          const fin = c => blk && kid[c] && blk.items.every(i => kid[c][key + '.' + i]) ? blk.items.map(i => kid[c][key + '.' + i]).sort().pop() : '';
          const done = sparks.filter(c => fin(c)).sort((x, y) => fin(x) < fin(y) ? -1 : 1);
          book = done.includes(hb) ? hb : done[0] || hb || sparks.find(c => kid[c]) || '';
        } else book = hb || sparks.find(c => kid[c]) || '';
        if (book) renameAwardFor(s, id, a, book + ' ' + a);
      });
    });
    const lists = s.config.awardLists || {};
    if (Array.isArray(lists.Sparks)) { lists.Sparks = lists.Sparks.filter(a => !JEWEL_PLAIN.test(a)); Catalog.defaultConfig().awardLists.Sparks.forEach(a => { if (!lists.Sparks.includes(a)) lists.Sparks.push(a); }); }
  }
  // The name of an award without its book code ("WR Red Jewel 1" -> "Red Jewel 1"), and the Blue Jewel a child earns now (the book they have, as the handbook says).
  const baseAward = (s, name) => { const m = /^([A-Za-z]{2,3}) (.+)$/.exec(String(name)); return m && (s.config.books || {})[m[1]] ? m[2] : String(name); };
  // The day a child received a book: Progress (received[id][book]), else the handbook string's date when it is for this book.
  function receivedOf(s, id, book) {
    const r = ((s.received || {})[id] || {})[book]; if (r !== undefined) return r;      // '' is a date you cleared: the handbook string's date does not come back
    const h = handbookParts(s.handbooks[id]); return h.date && bookKey(s, h.code) === book ? h.date : '';
  }
  // "Received, no date": the child has the book but nobody knows the day. Stored as the text 'no date' in received[id][book] (so receivedOf is still truthy and the book still counts as the child's); anything that
  // shows a date uses receivedShown, which is empty for it, and a real date typed later replaces the mark. When Sparks books are ordered by date received, a no-date book counts as the oldest.
  const RECEIVED_NO_DATE = 'no date';
  const isReceivedNoDate = (s, id, book) => receivedOf(s, id, book) === RECEIVED_NO_DATE;
  const receivedShown = (s, id, book) => { const r = receivedOf(s, id, book); return r === RECEIVED_NO_DATE ? '' : r; };
  // N38 follow-up: a handbook that is only a book code (no date) and names this book. Clearing the received date does not clear it, so the sheet still opens on that book; the Person tab offers to clear it.
  function orphanHandbook(s, id, book) { const p = parseHandbook(s.handbooks[id]); return !!p.code && !p.date && bookKey(s, p.code) === book; }
  // Debug (N38 follow-up): a handbook code can select a Progress sheet even with no other book records.
  function hasBareHandbook(s, id) {
    const h = parseHandbook(s.handbooks[id]);
    if (!h.code || h.date || h.note) return false;
    const kid = (s.progress || {})[id] || {};
    return !Object.keys(kid).some(book => book !== 'common' && hasBookSignoffs(s, id, book)) &&
      !Object.keys((s.received || {})[id] || {}).length &&
      !((s.doneBooks || {})[id] || []).length &&
      !((s.doneReviews || {})[id] || []).length &&
      !((s.extraSheets || {})[id] || []).length;
  }
  const noDateBookKids = s => Object.keys(s.handbooks || {}).filter(id => hasBareHandbook(s, id));
  const uniformGivenConflict = v => v && v[Model.UNI.GIVEN_FLAG] && Model.uniHasGivenDate(v);
  // N39 (Debug, "Records that look wrong"): a list of records that look wrong, and a fix only where the fix loses nothing. Nothing is stored; the list is worked out each time and never changes the data.
  // groupOf(id) is the child's group from the roster ('' when unknown: such a child is not judged on class). A row is { check, id, text, fix [, date] }; fix '' means "shown, left alone": a date, a note or a choice a person made is never removed for you.
  // The text never holds a name: the screen adds the child's name from id.
  function oddballs(s, groupOf) {
    const out = [], books = s.config.books || {}, grp = id => { const g = (groupOf && groupOf(id)) || ''; return YEAR_BOOK_GROUPS.includes(g) ? g : ''; },      // Puggles, Volunteers and Unassigned have no book group: not judged on class
     add = (check, id, text, fix, date) => out.push(Object.assign({ check, id, text, fix: fix || '' }, date ? { date } : {}));
    const bare = new Set(noDateBookKids(s));
    bare.forEach(id => add('bare-handbook', id, 'Handbook "' + parseHandbook(s.handbooks[id]).code + '" with no date and nothing else recorded.', 'clearHandbook'));
    Object.keys(s.handbooks || {}).forEach(id => {
      const p = parseHandbook(s.handbooks[id]), b = p.code && bookKey(s, p.code), g = grp(id); if (bare.has(id) || !b || !g || bookGroup(s, b) === g) return;
      add('handbook-group', id, 'Handbook "' + p.code + '" is a ' + bookGroup(s, b) + ' book, but the child is in ' + g + '.', !p.date && !p.note ? 'clearHandbook' : '');
    });
    Object.keys(s.received || {}).forEach(id => Object.keys(s.received[id] || {}).forEach(b => {
      if (!books[b]) add('received-book', id, 'Received date for "' + b + '", which is not in the book list.');
      else if (grp(id) && bookGroup(s, b) !== grp(id)) add('received-book', id, 'Received date for "' + b + '", a ' + bookGroup(s, b) + ' book, but the child is in ' + grp(id) + '.');
    }));
    const people = (s.roster && s.roster.people) || {};
    Object.keys(people).forEach(id => {
      const group = grp(id);
      if (!group) return;
      const current = childBook(s, id);
      progressTabBooks(s, id, group).forEach(book => {
        if (receivedOf(s, id, book) || hasBookSignoffs(s, id, book) || bookTabStatus(s, id, book, current) !== 'open') return;
        add('started-book-no-records', id, (books[book].name || book) + ' has a red tab with no received entry or sign-offs.');
      });
    });
    Object.keys(s.progress || {}).forEach(id => Object.keys(s.progress[id] || {}).forEach(b => { if (b !== 'common' && !books[b]) add('progress-book', id, 'Sign-offs under "' + b + '", which is not in the book list.'); }));
    Object.entries(people).forEach(([id, person]) => {
      if (uniformGivenConflict(person.v)) add('uniform-given-conflict', id, 'Given out is dated ' + person.v[Model.UNI.GIVEN] + ' and still has the no-date flag.', 'clearUniformGivenFlag');
    });
    Object.keys(s.flags || {}).forEach(fid => {
      const f = s.flags[fid]; if (!f || f.level === 'bug') return;
      if (f.kid && !people[f.kid]) add('flag-target', f.kid, 'A note about a child who is no longer on the roster.');
      else if (f.book && !books[f.book]) add('flag-target', f.kid, 'A note about the book "' + f.book + '", which is not in the book list.');
      // N49: an older Edit copied a note's replies into the note's own text. Listed only: a person decides what the note should say.
      if (isObj(f.replies) && Object.keys(f.replies).some(r => isObj(f.replies[r]) && String(f.replies[r].text || '').length >= 4 && String(f.note || '').includes(f.replies[r].text))) add('note-with-reply-text', f.kid || '', 'A note whose text already contains the text of one of its replies (an older Edit copied the replies into the note).');
    });
    Object.keys(people).forEach(id => { const v = people[id].v || {}; Object.keys(v).forEach(k => { if (/^team:Q[1-4]$/.test(k) && v[k] && v[k] !== Model.NO_TEAM && !TEAMS.includes(v[k])) add('team-color', id, k.slice(5) + ' color "' + v[k] + '" is not one of the four colors.'); }); });
    const seen = {};
    Object.keys(s.awards || {}).sort().forEach(d => Object.keys(s.awards[d] || {}).forEach(id => {
      const list = s.awards[d][id] || []; if (new Set(list).size < list.length) add('award-duplicate', id, 'The same award is listed twice on ' + d + '.', 'dedupeAwards', d);
      new Set(list).forEach(a => { const k = id + '\u0001' + a; (seen[k] = seen[k] || { id, a, days: [] }).days.push(d); });
    }));
    Object.keys(seen).forEach(k => { const x = seen[k]; if (x.days.length > 1) add('award-twice', x.id, '"' + x.a + '" was announced on ' + x.days.length + ' nights (' + x.days.join(', ') + ').'); });
    return out;
  }
  // N40 Option A: a readable copy of the file, for a person to read (Debug, Readable copy). The codes are spelled out; the stored file is untouched and nothing is stored about the copy.
  // It is lossless (every spelled-out value maps back to the stored one: test/readable-copy.test.js), marked readable and readOnly, and Season.fromJson refuses it, so it can never be opened as data by mistake.
  // It holds the same names and details as the data file, so it is as private as the data file.
  const READABLE_FORMAT = 'awana-season-readable', QUARTER_WORD = { R: 'Red', B: 'Blue', G: 'Green', Y: 'Yellow', '-': 'none' };
  function readableCopy(s) {
    const c = JSON.parse(JSON.stringify(s)), who = {}, people = {}, markWord = { a: 'present', h: 'handbook', p: 'participation', x: 'extra' };
    (Model.fromRoster(c.roster).people || []).forEach(p => { who[p[Model.X.ID]] = Model.fullName(p); });
    Object.keys((c.roster && c.roster.people) || {}).forEach(id => {
      const p = c.roster.people[id], pc = {}; Object.keys(p.pc || {}).forEach(k => { if (p.pc[k] !== null && p.pc[k] !== undefined && p.pc[k] !== '') pc[k] = p.pc[k]; });
      people[id] = { name: who[id] || '', planningCenter: pc, club: p.v || {} };
    });
    const roster = Object.assign({}, c.roster, { people }); delete roster.pcCols; delete roster.pcKeys;      // the field names are written beside each value now
    const handbooks = {}; Object.keys(c.handbooks || {}).forEach(id => { handbooks[id] = parseHandbook(c.handbooks[id]); });
    const attendance = {}; Object.keys(c.attendance || {}).forEach(d => { attendance[d] = {}; Object.keys(c.attendance[d]).forEach(id => {
      const m = c.attendance[d][id], o = {}; Object.keys(markWord).forEach(k => { if (m[k]) o[markWord[k]] = true; }); if (m.g) o.group = m.g; if (m.t) o.teamThatNight = m.t; attendance[d][id] = o; }); });
    const blueDrops = {}; Object.keys(c.blueDrops || {}).forEach(id => { blueDrops[id] = (c.blueDrops[id] || []).map(x => { const i = String(x).indexOf('|'); if (i < 0) return x; return { gem: +String(x).slice(0, i), on: String(x).slice(i + 1) }; }); });
    const config = c.config || {}; if (config.teamPlan && config.teamPlan.proj) { const proj = {}; Object.keys(config.teamPlan.proj).forEach(id => { const t = String(config.teamPlan.proj[id]); proj[id] = { Q1: QUARTER_WORD[t[0]] || t[0] || '', Q2: QUARTER_WORD[t[1]] || t[1] || '', Q3: QUARTER_WORD[t[2]] || t[2] || '', Q4: QUARTER_WORD[t[3]] || t[3] || '' }; }); config.teamPlan.proj = proj; }
    const history = (c.history || []).map(h => Object.assign({ time: h.t, label: h.label }, h.tag ? { tag: h.tag } : {}, { changes: (h.changes || []).map(x => Object.assign({ path: x.p }, 'o' in x ? { old: x.o } : {}, 'n' in x ? { new: x.n } : {})) }));
    const books = {}; Object.keys(config.books || {}).forEach(k => { books[k] = (config.books[k] || {}).name || k; });
    const out = { format: READABLE_FORMAT, readable: true, readOnly: true,
      about: 'A readable copy of the data file, made for reading only. The app will not open it: open your data file instead. Codes are spelled out and every child id has a name beside it in "who". It holds the same names and details as the data file, so keep it as private.',
      year: c.year, version: c.version, who, books };
    ['year', 'version', 'format', 'history', 'roster', 'handbooks', 'attendance', 'blueDrops'].forEach(k => { delete c[k]; });
    return Object.assign(out, c, { roster, handbooks, attendance }, Object.keys(blueDrops).length ? { blueDrops } : {}, { history });
  }
  // Apply one row's fix. Re-checks the record first (a row can be stale), so a handbook with a date or a note is never cleared. Returns true when something changed.
  function fixOddball(s, row) {
    if (!row || !row.fix) return false;
    if (row.fix === 'clearUniformGivenFlag') {
      const v = (s.roster.people[row.id] || {}).v;
      if (!uniformGivenConflict(v)) return false;
      delete v[Model.UNI.GIVEN_FLAG];
      return true;
    }
    if (row.fix === 'clearHandbook') { const p = parseHandbook((s.handbooks || {})[row.id]); if (!p.code || p.date || p.note || (row.check === 'bare-handbook' && !hasBareHandbook(s, row.id))) return false; delete s.handbooks[row.id]; return true; }
    if (row.fix === 'dedupeAwards') { const list = ((s.awards || {})[row.date] || {})[row.id]; if (!list) return false; const u = [...new Set(list)]; if (u.length === list.length) return false; s.awards[row.date][row.id] = u; return true; }
    return false;
  }
  function setReceived(s, id, book, date, opts) {
    if (!(s.config.books || {})[book]) throw new Error('"' + book + '" is not one of your books.');
    const noDate = !!(opts && opts.noDate) && !date; if (date) needDate(date); if (!s.received) s.received = {};
    const h = handbookParts(s.handbooks[id]), fromString = h.date && bookKey(s, h.code) === book;      // the handbook string would supply a date: clearing says so with ''
    const kid = s.received[id] || (s.received[id] = {}); if (noDate) kid[book] = RECEIVED_NO_DATE; else if (date) kid[book] = date; else if (fromString) kid[book] = ''; else delete kid[book];
    if (!Object.keys(kid).length) delete s.received[id];
  }
  // The Sparks book a child is in, worked out (Sparks work through HG, WR, SS in order): the latest-received book not yet finished; else the handbook on file if it is not finished; else the book after the
  // last one finished (finishing WR puts them in SS, even if HG was never recorded); else the book they signed off most recently; '' when nothing says. Not used with the All Together method.
  function sparksCurrent(s, id) {
    if (s.config.sparksBooks === 'together') return '';
    const order = sparksOrder(s), fin = new Set(finishedBooks(s, id).map(b => b.book)), open = order.filter(c => !fin.has(c)), kid = s.progress[id] || {};
    const recv = open.filter(c => receivedOf(s, id, c)).sort((a, b) => { const k = c => receivedShown(s, id, c) || '0'; return k(a) < k(b) ? 1 : -1; })[0]; if (recv) return recv;      // newest received first; a no-date book is the oldest
    const legacy = bookKey(s, parseHandbook(s.handbooks[id]).code); if (legacy && open.includes(legacy)) return legacy;
    const priorReview = open.filter(c => reviewsDoneBefore(s, id, c)).pop(); if (priorReview) return priorReview;
    const last = Math.max(-1, ...order.map((c, i) => fin.has(c) ? i : -1)); if (last >= 0) return order[last + 1] || '';
    const latest = c => Object.values(kid[c] || {}).filter(Boolean).sort().pop() || '';      // the book with the most recent sign-off
    return open.filter(latest).sort((a, b) => latest(a) < latest(b) ? 1 : -1)[0] || '';
  }
  function receivedBookForGroup(s, id, group) {
    if (group !== 'Cubbies' && group !== 'T&T') return '';
    let book = '', latest = '';
    for (const code of bookOrder(s, group)) {
      if (!receivedOf(s, id, code)) continue;
      const date = receivedShown(s, id, code);
      if (!book || date > latest) {
        book = code;
        latest = date;
      }
    }
    return book;
  }
  function childBook(s, id, group) {
    const assigned = parseHandbook(s.handbooks[id]).code;
    const hb = bookKey(s, assigned);
    if (group === 'Cubbies' || group === 'T&T') {
      const book = assigned ? hb : receivedBookForGroup(s, id, group);
      if (book) return book;
    }
    if (!hb || bookGroup(s, hb) === 'Sparks') { const d = sparksCurrent(s, id); if (d) return d; }
    if (hb) return hb;
    return hasProgress(s, id) ? (yearBook(s, 'Sparks') || '') : '';      // N26: a child with no progress has no current book (the year's book is only the guess once something is recorded)
  }
  // The books of a group in the order they are worked (Cubbies AS, HC; Sparks HG, WR, SS; T&T in the book list's order), and the progress sheets a child has: the book for their class (Sparks: worked out;
  // Cubbies and T&T: the handbook, else this year's book, else the first), the handbook's book, every book with a date entered and every book marked finished before. Nothing is stored: it is all worked out.
  const GROUP_ORDER = ['Cubbies', 'Sparks', 'T&T'], STD_ORDER = { Cubbies: ['AS', 'HC'], Sparks: ['HG', 'WR', 'SS'] };
  // The order of a group's books. config.bookOrder[group] (set in Options; T&T only for now) overrides the standard order; books not listed follow in name order.
  function bookOrder(s, group) {
    const all = Object.keys(s.config.books || {}).filter(c => bookGroup(s, c) === group);
    const custom = ((s.config.bookOrder || {})[group] || []).filter(c => all.includes(c)), std = custom.length ? custom : (STD_ORDER[group] || []).filter(c => all.includes(c));
    return std.concat(all.filter(c => !std.includes(c)));
  }
  // Options: the T&T book order (rotation). codes = [] clears the order back to the standard one.
  function setBookOrder(s, group, codes) {
    if (group !== 'T&T') throw new Error('Only the T&T books have a set order.');
    const all = Object.keys(s.config.books || {}).filter(c => bookGroup(s, c) === group);
    (codes || []).forEach(c => { if (!all.includes(c)) throw new Error('"' + c + '" is not a T&T book.'); });
    const next = Object.assign({}, s.config.bookOrder); if (codes && codes.length) next[group] = codes.slice(); else delete next[group];
    if (Object.keys(next).length) s.config.bookOrder = next; else delete s.config.bookOrder;
  }
  // N33: has any progress been indicated for this child? A date or a sign-off in any book, a book marked finished, a book received, or a handbook code. A child with none of these has no book, and that is legitimate: no "no book" warning.
  function hasProgress(s, id) {
    const kid = s.progress[id] || {};
    if (Object.keys(kid).some(c => c !== 'common' && kid[c] && Object.keys(kid[c]).length)) return true;
    if (Object.keys((s.received || {})[id] || {}).length) return true;
    if (((s.doneBooks || {})[id] || []).length) return true;
    if (((s.doneReviews || {})[id] || []).length) return true;
    return !!s.handbooks[id];
  }
  // N57: the books of `group` this child has started: the handbook's book first, then every book with a sign-off (the "every book" choice of Progress sheets; the records files). Empty when none.
  function booksStarted(s, id, group) {
    const prog = s.progress[id] || {}, hb = parseHandbook(s.handbooks[id]), inG = c => ((s.config.books[c] || {}).group || group) === group;
    return [...new Set([bookKey(s, hb.code)].concat(Object.keys(s.config.books).filter(c => prog[c]), (s.doneBooks || {})[id] || [], (s.doneReviews || {})[id] || []).filter(c => c && inG(c)))];
  }
  function sheetsOf(s, id, group) {
    const set = new Set(), kid = s.progress[id] || {}, hb = bookKey(s, parseHandbook(s.handbooks[id]).code);
    if (hb) set.add(hb);
    Object.keys(kid).forEach(c => { if (c !== 'common' && (s.config.books || {})[c]) set.add(c); });
    ((s.doneBooks || {})[id] || []).forEach(c => { if ((s.config.books || {})[c]) set.add(c); });
    ((s.doneReviews || {})[id] || []).forEach(c => { if ((s.config.books || {})[c]) set.add(c); });
    ((s.extraSheets || {})[id] || []).forEach(c => { if ((s.config.books || {})[c]) set.add(c); });      // sheets added by hand (addExtraSheet)
    if (GROUP_ORDER.includes(group)) {
      const own = group === 'Sparks' ? childBook(s, id) : hb && bookGroup(s, hb) === group ? hb : yearBook(s, group);
      const cur = own && bookGroup(s, own) === group ? own : bookOrder(s, group)[0]; if (cur) set.add(cur);
    }
    return [].concat(...GROUP_ORDER.map(g => bookOrder(s, g))).filter(c => set.has(c));
  }
  function progressTabBooks(s, id, group) {
    const books = s.config.books;
    const codes = group === 'T&T' ? bookOrder(s, group) :
      group === 'Cubbies' ? ['AS', 'HC'].filter(c => books[c]).concat(Object.keys(books).filter(c => !['AS', 'HC'].includes(c) && bookGroup(s, c) === group)) :
      ['HG', 'WR', 'SS'].filter(c => books[c]).concat(Object.keys(books).filter(c => !['HG', 'WR', 'SS', 'HC'].includes(c) && (!books[c].group || books[c].group === group)));
    return codes.concat(sheetsOf(s, id, group).filter(c => !codes.includes(c)));
  }
  // "+ Add sheet" on the Person tab: a book the child has no dates in yet gets a sheet, kept in the file (extraSheets[id]) so it stays after a reload and shows on Progress.
  function addExtraSheet(s, id, book) {
    if (!(s.config.books || {})[book]) return;
    const all = s.extraSheets || (s.extraSheets = {}), list = new Set(all[id] || []); list.add(book); all[id] = [...list].sort();
  }
  const jewelName = (s, id, n) => { const b = bookGroup(s, childBook(s, id)) === 'Sparks' ? childBook(s, id) : ''; return (b ? b + ' ' : '') + 'Blue Jewel ' + n; };
  // How an award is shown to someone looking at one child: the book code is left off when it is the child's own book (handbook, else this year's book for that group).
  function awardLabel(s, id, name) {
    const m = /^([A-Za-z]{2,3}) (.+)$/.exec(String(name)); if (!m || !(s.config.books || {})[m[1]]) return String(name);
    const em = (s.config.books[m[1]] || {}).emblem;
    if (m[2] === 'Pilot Wing' && em) return em + ' Pilot Wing';      // the wing is named by its book's color (HG Green, WR Blue, SS Red), whichever book it is
    const hb = bookKey(s, parseHandbook(s.handbooks[id]).code), own = hb && bookGroup(s, hb) === bookGroup(s, m[1]) ? hb : yearBook(s, bookGroup(s, m[1]));
    return own === m[1] ? m[2] : String(name);
  }
  function renameAward(s, from, to) {
    const lists = (s.config && s.config.awardLists) || {};
    Object.keys(lists).forEach(g => { if (Array.isArray(lists[g])) lists[g] = lists[g].map(a => a === from ? to : a); });
    Object.keys(s.awards).forEach(d => Object.keys(s.awards[d]).forEach(id => { s.awards[d][id] = s.awards[d][id].map(a => a === from ? to : a); }));
    Object.keys(s.given).forEach(id => { if (s.given[id][from] !== undefined) { if (s.given[id][to] === undefined) s.given[id][to] = s.given[id][from]; delete s.given[id][from]; } });
    Object.keys(s.givenNoDate || {}).forEach(id => { s.givenNoDate[id] = [...new Set(s.givenNoDate[id].map(a => a === from ? to : a))]; });
    Object.keys(s.announcedNoDate || {}).forEach(id => { if (Array.isArray(s.announcedNoDate[id])) s.announcedNoDate[id] = [...new Set(s.announcedNoDate[id].map(a => a === from ? to : a))].sort(); });      // a damaged (non-list) entry is left for the Validate tab to report, not crashed on      // "told, no date" follows the new name (blueDrops keep a gem number and day, not a name)
    Object.keys(s.held || {}).forEach(id => { if (s.held[id][from] !== undefined) { s.held[id][to] = 1; delete s.held[id][from]; } });
    const names = s.config && s.config.slideNames; if (isObj(names) && names[from] !== undefined) { if (names[to] === undefined) names[to] = names[from]; delete names[from]; }
  }
  // The club year a file made today belongs to: from August on it is this year to next (2026-27), before that last year to this (2025-26).
  const defaultYear = today => { const m = /^(\d{4})-(\d{2})/.exec(today || ''); if (!m) return ''; const y = +m[1], start = +m[2] >= 8 ? y : y - 1; return start + '-' + String((start + 1) % 100).padStart(2, '0'); };
  const CARRIED = ['handbooks', 'progress', 'doneBooks', 'doneReviews', 'received', 'awards', 'given', 'givenNoDate', 'held', 'progressNoDate', 'extraSheets', 'announcedNoDate'];      // the sections newSeason brings forward (DATA-FORMAT 11.3)
  // ---------- attendance counts from earlier years (team balance) ----------
  // A child's turnout is the share of club nights they came to, counted from their first attended night (a late start is not held against them).
  // turnoutCounts gives { id: { nights, came } } for every child who came at least once, over the held nights up to `today` (all of them when today is empty).
  // The color-team planner uses it for this season; a new season (and "Add an earlier year") keeps the closed year's counts in s.pastTurnout so the next year can start from them.
  function turnoutCounts(s, calRows, today, isChild) {
    const held = heldNights(s, calRows, isChild).filter(d => !today || d <= today), out = {};
    const ids = new Set(); held.forEach(d => Object.keys(s.attendance[d]).forEach(id => { if (s.attendance[d][id].a) ids.add(id); }));
    ids.forEach(id => {
      const at = d => !!(s.attendance[d] && s.attendance[d][id] && s.attendance[d][id].a), i = held.findIndex(at);
      if (i >= 0) { const counted = held.slice(i); out[id] = { nights: counted.length, came: counted.filter(at).length }; }
    });
    return out;
  }
  // pastTurnout[id] = [{ year, nights, came }], oldest year first. A year already recorded for a child is never changed or added twice.
  function addPastYear(s, year, counts) {
    const out = { added: 0, kept: 0 };
    Object.keys(counts).forEach(id => {
      const c = counts[id]; if (!c || !(c.nights > 0)) return;
      const all = s.pastTurnout || (s.pastTurnout = {}), list = all[id] = Array.isArray(all[id]) ? all[id] : [];
      if (list.some(x => x.year === year)) { out.kept++; return; }
      list.push({ year, nights: c.nights, came: Math.min(c.came, c.nights) }); list.sort((a, b) => a.year < b.year ? -1 : a.year > b.year ? 1 : 0); out.added++;
    });
    if (s.pastTurnout && !Object.keys(s.pastTurnout).length) delete s.pastTurnout;
    return out;
  }
  // "Add an earlier year": counts from an older data file (text). The old file's year names the record; ids that are not in this file's roster are skipped. Returns counts only, never names.
  function addEarlierYear(s, text) {
    const o = fromJson(text);
    if (!o.year) throw new Error('That file has no club year, so its counts cannot be labelled.');
    if (o.year === s.year) throw new Error('That file is this season (' + o.year + '). Pick an earlier year\'s file.');
    const counts = turnoutCounts(o, o.calendar || [], ''), known = new Set(Object.keys((s.roster && s.roster.people) || {}));
    const mine = {}; let skipped = 0;
    Object.keys(counts).forEach(id => { if (known.has(id)) mine[id] = counts[id]; else skipped++; });
    // that file's own earlier years come too (an old file made with this feature holds them): a year this file lacks for a child is added
    Object.keys(o.pastTurnout || {}).forEach(id => { if (!known.has(id)) return; (o.pastTurnout[id] || []).forEach(x => { if (x && x.year && x.nights > 0) addPastYear(s, x.year, { [id]: x }); }); });
    const r = addPastYear(s, o.year, mine);
    return { year: o.year, children: Object.keys(counts).length, added: r.added, alreadyThere: r.kept, notOnRoster: skipped };
  }
  function newSeason(s, year) {
    // The year label must be YYYY-YY: anything else wrote a file the file checker rejects once per child (Fable review A11). 2027-2028 is accepted and shortened.
    year = String(year == null ? '' : year).trim(); const long = /^(\d{4})-(\d{4})$/.exec(year); if (long) year = long[1] + '-' + long[2].slice(2);
    if (!/^\d{4}-\d{2}$/.test(year)) throw new Error('Year like 2027-28, please.');
    const n = blank(year);
    // the closed year's counts, once; earlier years' counts stay (a year already recorded is not added again). A season with no year label cannot be named, so only the earlier ones are carried.
    { const carried = { pastTurnout: clone(s.pastTurnout || {}) }; if (s.year) addPastYear(carried, s.year, turnoutCounts(s, s.calendar || [], '')); if (carried.pastTurnout && Object.keys(carried.pastTurnout).length) n.pastTurnout = carried.pastTurnout; }
    n.config = clone(s.config); n.config.teamsOk = { repeats: [], uneven: [] }; n.config.todoIgnored = []; delete n.config.teamPlan; n.config.yearBook = { Cubbies: '', Sparks: '', 'T&T': '' };      // colors start over each year, so what was accepted last year does not carry; the year's books are chosen again each year (how Sparks use their books is club policy and carries over)
    delete n.config.breaks;
    const lastYearCalendar = Calendar.archive(s.calendar || []);
    if (lastYearCalendar.length) n.config.lastYearCalendar = lastYearCalendar;
    if (isObj(n.config.lessons) && isObj(n.config.lessons.groups)) {
      Object.values(n.config.lessons.groups).forEach(group => {
        if (isObj(group)) { delete group.from; delete group.items; }
      });
    }
    ['roster', 'calendar', 'rotation'].forEach(k => { n[k] = clone(s[k]); });
    // Progress and awards come forward ONCE, here (Mike, 2026-11-13): every sign-off (finished or not), the handbooks, books finished before, dates received, and the awards told to the group, handed out, held back or marked no date.
    // They are last year's record: config.carriedThrough (the closed year's last night) marks the boundary, and every earlier-years rule (seasonStart, awardLedger, suggestedAwards) treats anything dated on or before it as earlier-year,
    // so nothing carried is announced again or counted as this season's work. What stays with the closed year: attendance, games, adult awards, flags, team moves, Blue Jewels given by hand or dropped (placements already carry above).
    CARRIED.forEach(k => { if (isObj(s[k]) && Object.keys(s[k]).length) n[k] = clone(s[k]); });
    { const last = Object.keys(s.attendance || {}).concat(Object.keys(counted(s.calendar || []))).filter(isRealDate).sort().pop(); if (last) n.config.carriedThrough = last; }
    // Sparks Blue Jewels: the closed year's placements (and any held gems are dropped) are carried into the new file, so a book that runs across years keeps its slots. Overrides become placements.
    const ids = new Set([].concat(...Object.keys(s.attendance || {}).map(d => Object.keys(s.attendance[d] || {})), Object.keys(s.progress || {}), Object.keys(s.blueWings || {}), Object.keys(s.blueOverrides || {})));
    ids.forEach(id => {
      const all = ((s.blueWings || {})[id] || []).slice().concat(blueWingPlan(s, id, s.calendar || [], { yearEnded: true }).placed.map(p => ({ book: p.book, slot: p.slot, n: p.n, threshold: p.threshold, earned: p.earned, date: p.date, year: p.year, override: p.override, note: p.note || '' })));
      if (all.length) { n.blueWings = n.blueWings || {}; n.blueWings[id] = all; }
    });
    // Bug reports and feature requests are about the app, not the year: the open ones come forward (a fixed or dropped one stays with the closed year).
    Object.keys(s.flags || {}).forEach(id => { const f = s.flags[id]; if (f && f.level === 'bug' && bugStatusOf(f) === 'open') { n.flags = n.flags || {}; n.flags[id] = clone(f); } });
    Object.keys(n.roster.people || {}).forEach(id => {                 // last year's one-off decisions must not hide this year's: pending Planning Center changes and the uniform order/receive/give record
      const v = (n.roster.people[id] || {}).v || {};
      Object.keys(v).forEach(k => { if (k.startsWith('ov:') || YEAR_BOUND.includes(k)) delete v[k]; });
    });
    return n;
  }
  const YEAR_BOUND = ['x_Uni_OrderedDate', 'x_Uni_SizeOrdered', 'x_Uni_ReceivedDate', 'x_Uni_GivenDate', 'x_Uni_GivenFlag', 'x_Uni_SizeGiven'];   // sizes verified and uniform notes carry over

  // ---------- calendar helpers ----------
  const counted = rows => { const m = {}; rows.filter(r => r && Calendar.countsNight(r)).forEach(r => { m[r.Date] = r.Quarter; }); return m; };
  const GROUPS = ['Puggles', 'Cubbies', 'Sparks', 'T&T'];
  const zero = () => ({ a: 0, h: 0, p: 0, x: 0 });

  // ---------- attendance ----------
  // group (optional) is the room's group when Present is ticked; it is kept on the mark as g, so a child who later moves to another group keeps the game points of the nights spent in the old one.
  function setMark(s, date, id, mark, value, group) {
    if (!MARKS.includes(mark)) throw new Error('Unknown mark "' + mark + '".');
    const night = s.attendance[needDate(date)] || (value ? (s.attendance[date] = {}) : null);
    if (!night) return;                                                 // clearing a box on a night nobody was entered for makes no night
    if (value) { const m = night[id] || (night[id] = {}); m[mark] = 1; if (mark === 'a' && GROUPS.includes(group) && !m.g) m.g = group; return; }      // a room that is not a group (Unassigned, Volunteers) is not stamped
    if (!night[id]) return;
    delete night[id][mark]; if (mark === 'a') delete night[id].g;
    if (!MARKS.some(k => night[id][k])) delete night[id];      // no mark left: a one-night team exception goes with it
    if (!Object.keys(night).length) delete s.attendance[date];     // and a night with nobody left is not a night
  }
  const hasNight = (s, date) => !!s.attendance[date];
  // The one rule for "which nights count": a club night on the calendar (not an Event, not No Club) with at least one person marked present.
  // Saved files may still hold empty nights or nights with only handbook marks; they do not count.
  // A club night is held when a CHILD is marked present on it (volunteers' marks do not count). Who is a child comes from THIS file's own roster (Model.childTestOf(s.roster)), so every caller, in the app and in a node test or tool alike,
  // gets the same answer, and an older year's file is judged by its own roster. isChild (optional) replaces that test, for tests only.
  function heldNights(s, calRows, isChild) {
    const q = counted(calRows), childTest = isChild || (Model ? Model.childTestOf(s.roster) : () => true);
    return Object.keys(s.attendance).filter(d => q[d] && Object.keys(s.attendance[d]).some(id => s.attendance[d][id].a && childTest(id))).sort();
  }
  function totals(s, id, calRows) {
    const q = counted(calRows), out = { year: zero(), last: '' };
    QUARTERS.forEach(k => { out[k] = zero(); });
    Object.keys(s.attendance).sort().forEach(d => {
      const m = s.attendance[d][id];
      if (!m || !q[d] || !out[q[d]]) return;
      MARKS.forEach(k => { if (m[k]) { out[q[d]][k]++; out.year[k]++; } });
      if (m.a) out.last = d;
    });
    return out;
  }
  function classificationRecords(season, details, include = () => true) {
    const dates = new Map();
    const add = (date, kind, id, item) => {
      if (!isRealDate(date) || !include(date)) return;
      if (!dates.has(date)) dates.set(date, {});
      if (details) {
        if (!details.has(date)) details.set(date, []);
        details.get(date).push({ kind, id, item });
      }
      const counts = dates.get(date);
      counts[kind] = (counts[kind] || 0) + 1;
    };
    const progress = season.progress || {};
    Object.entries(progress).forEach(([id, books]) => {
      for (const book of Object.keys(books || {})) {
        for (const [section, date] of Object.entries(signsShown(season, id, book))) {
          add(date, 'sign-offs', id, book + ' · ' + section);
        }
      }
    });
    const givenByChild = season.given || {};
    Object.entries(givenByChild).forEach(([id, given]) => {
      Object.entries(given || {}).forEach(([award, date]) => { if (!isGivenNoDate(season, id, award)) add(date, 'award receipts', id, award); });
    });
    const received = season.received || {};
    Object.entries(received).forEach(([id, books]) => Object.keys(books || {}).forEach(book => add(receivedShown(season, id, book), 'book receipts', id, book)));
    Object.entries(season.handbooks || {}).forEach(([id, text]) => add(parseHandbook(text).date, 'handbooks', id));
    for (const section of ['blueOverrides', 'blueWings']) {
      Object.entries(season[section] || {}).forEach(([id, list]) => { if (Array.isArray(list)) list.forEach(x => { if (x) { add(x.date, 'jewel placements', id); if (x.earned !== x.date) add(x.earned, 'jewel earnings', id); } }); });
    }
    Object.entries(season.blueDrops || {}).forEach(([id, list]) => { if (Array.isArray(list)) list.forEach(x => { if (typeof x === 'string') add(x.split('|')[1], 'dropped jewels', id); }); });
    return dates;
  }
  function recordedNightActivity(s, date) {
    const details = new Map();
    classificationRecords(s, details, d => d === date);
    const isChild = Model.childTestOf(s.roster);
    const children = [...new Set([
      ...(details.get(date) || []).map(record => record.id),
      ...Object.keys(s.attendance?.[date] || {}),
      ...Object.keys(s.awards?.[date] || {}),
      ...Object.entries(s.teamMoves || {}).filter(([, moves]) =>
        Array.isArray(moves) && moves.some(move => move?.from === date)).map(([id]) => id)
    ])].filter(isChild);
    const other = {};
    const games = Object.keys(s.games?.[date] || {}).length;
    if (games) other.games = games;
    const adultAwards = Object.keys(s.adults?.[date] || {}).length;
    if (adultAwards) other['adult awards'] = adultAwards;
    return { recorded: children.length > 0 || games > 0 || adultAwards > 0, children, other };
  }
  const isRecordedClosure = (s, row) => !!s && Calendar.isExcused(row) && isRealDate(row.Date) &&
    recordedNightActivity(s, row.Date).recorded;
  const isQuarterNight = (s, row) => Calendar.countsNight(row) || isRecordedClosure(s, row);
  // BEGIN PLAYTEST
  function hasGraceActivity(s, row) {
    const date = row.Date;
    if (!Object.keys(s.adults?.[date] || {}).length) return true;
    const { children, other } = recordedNightActivity(s, date);
    return children.length > 0 || !!other.games;
  }
  // END PLAYTEST
  const graceDates = (s, rows) => [...new Set(rows.filter(row => row && row.Date > (s.config.carriedThrough || '') &&
    // BEGIN PLAYTEST
    hasGraceActivity(s, row) &&
    // END PLAYTEST
    isRecordedClosure(s, row)).map(row => row.Date))].sort();
  const reducedWeeks = (weeks, grace) => Math.max(1, weeks - grace);
  function blueJewelRequirements(s, calRows, id) {
    const dates = graceDates(s, calRows);
    const earned = id == null ? [] : earnedBlueJewels(s, id, calRows, dates);
    return s.config.blueJewelWeeks.map((weeks, i) =>
      earned.find(jewel => jewel.n === i + 1)?.threshold ?? reducedWeeks(weeks, dates.length));
  }
  function earnedBlueJewels(s, id, calRows, dates) {
    const earned = [], awarded = new Set();
    let attended = 0, grace = 0;
    const held = new Set(heldNights(s, calRows));
    for (const date of [...new Set([...held, ...dates])].sort()) {
      if (!s.attendance[date]?.[id]?.a) continue;
      const count = attended + 1;
      // Preserve a jewel earned on the closure date itself without counting that attendance on later dates.
      if (held.has(date)) attended = count;
      while (grace < dates.length && dates[grace] < date) grace++;
      s.config.blueJewelWeeks.forEach((weeks, i) => {
        const threshold = reducedWeeks(weeks, grace);
        if (awarded.has(i) || count < threshold) return;
        awarded.add(i);
        earned.push({ n: i + 1, threshold, date });
      });
    }
    return earned;
  }
  function blueJewels(s, id, calRows) {
    return earnedBlueJewels(s, id, calRows, graceDates(s, calRows));
  }

  // ---------- Sparks Blue Jewels in the book's wings (core logic; no screen uses it yet) ----------
  // Each Sparks book has four gem slots in its pilot wings. A gem earned (blueJewels, by nights attended this club year) goes into the wings of the book the child is in
  // if there is a free slot; if not, it is held until the child finishes that book, and then every held gem from this club year goes into the next book's wings at once (up to four).
  // A gem still held at the end of the club year is dropped (opts.yearEnded). Gems never carry across club years.
  // Stored placements from earlier years: s.blueWings[id] = [{ book, slot, n, threshold, earned, date, year, override }] (they fill slots first).
  // Manual overrides (leaders, Sparks only): s.blueOverrides[id] = [{ book, n, date, note }] count as placed, are never dropped, and fill a slot in their book.
  // Returns { placed (this club year's placements), held (waiting; empty once yearEnded), dropped (held at year end) }.
  function blueWingPlan(s, id, calRows, opts) {
    const o = opts || {}, year = s.year, order = sparksOrder(s);
    const used = {}; order.forEach(b => { used[b] = 0; });
    ((s.blueWings || {})[id] || []).forEach(w => { if (used[w.book] !== undefined) used[w.book]++; });
    const placed = [], pending = [], done = new Set(), fin = finishedBooks(s, id).filter(b => b.group === 'Sparks');
    fin.filter(b => b.before).forEach(b => done.add(b.book));      // finished before this file: its wings are already on the child
    // A child works the books in order, so a book with no progress before the latest book that has progress was skipped (or finished elsewhere): it is not the book they are in.
    // The book they are in now (the handbook, or the latest book with progress) also counts: books before it were skipped.
    const hbBook = bookKey(s, parseHandbook(s.handbooks[id]).code);      // the handbook on file: the book the child started the year in (not moved by finishes)
    const progressed = order.map(b => Object.keys(((s.progress || {})[id] || {})[b] || {}).length > 0), last = Math.max(progressed.lastIndexOf(true), order.indexOf(hbBook));
    order.forEach((b, i) => { if (i < last) done.add(b); });
    const current = () => order.find(b => !done.has(b));
    // Slots: a hand grant takes the slot it names; an earned gem takes the lowest slot of its book that is still free (stored placements have their slots too).
    const taken = {}; order.forEach(b => { taken[b] = new Set(); });
    ((s.blueWings || {})[id] || []).forEach(w => { if (taken[w.book]) taken[w.book].add(w.slot); });
    const freeSlot = b => { for (let k = 1; k <= 4; k++) if (!taken[b].has(k)) { taken[b].add(k); return k; } return 0; };
    const place = (book, gem, date) => { used[book]++; placed.push({ book, slot: freeSlot(book), n: gem.n, threshold: gem.threshold, earned: gem.date, date, year, override: false }); };
    const skipped = [];      // grants that could not take their slot (already filled by an earlier year's gem): reported, not placed
    ((s.blueOverrides || {})[id] || []).forEach(x => { if (used[x.book] === undefined) return; if (taken[x.book].has(x.n)) { skipped.push({ book: x.book, slot: x.n, date: x.date }); return; } used[x.book]++; taken[x.book].add(x.n); placed.push({ book: x.book, slot: x.n, n: x.n, threshold: null, earned: x.date, date: x.date, year, override: true, note: x.note || '' }); });
    const events = [];
    // Stored drops retain their original earned date. Match by gem number so calendar corrections cannot undo a drop.
    const drops = new Set(((s.blueDrops || {})[id] || []).map(key => String(key).split('|')[0]));
    blueJewels(s, id, calRows).filter(j => !drops.has(String(j.n))).forEach(j => events.push({ type: 'gem', date: j.date, rank: 0, gem: j }));
    fin.filter(b => !b.before && b.date).forEach(b => events.push({ type: 'finish', date: b.date, rank: 1, book: b.book }));
    events.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.rank - b.rank);      // a gem on the night a book is finished goes into that book first
    events.forEach(e => {
      if (e.type === 'gem') {
        const B = current();
        if (B && used[B] < 4) place(B, e.gem, e.date); else pending.push(e.gem);
      } else {
        done.add(e.book);
        const C = current();
        if (C) while (pending.length && used[C] < 4) place(C, pending.shift(), e.date);      // the next set of wings: every held gem goes in at once
      }
    });
    if (o.yearEnded) return { placed, held: [], dropped: pending.slice(), skipped };
    return { placed, held: pending.slice(), dropped: [], skipped };
  }

  // What the screens show: the Sparks Blue Jewels placed in a book's wings this club year (and overrides), as { n (slot in that book, 1-4), book, date (the day earned), override, note }.
  // n is the slot in the book's wings (1-4); gem is the gem's own number (its night count, 1-4), used to drop it.
  function sparkJewels(s, id, calRows) { return blueWingPlan(s, id, calRows).placed.map(x => ({ n: x.slot, gem: x.n, book: x.book, date: x.earned, threshold: x.threshold, placedDate: x.date, override: !!x.override, note: x.note || '' })); }
  // Hand grant (leaders): a Sparks Blue Jewel for slot n of a book, with the day it was earned and a note. It takes that slot and is never dropped at year end.
  function grantBlue(s, id, book, slot, date, note) {
    if (!Sparks(s, book)) throw new Error('Only Sparks books have Blue Jewels.');
    if (!(Number.isInteger(slot) && slot >= 1 && slot <= 4)) throw new Error('A Blue Jewel is slot 1 to 4 of its book.');
    needDate(date);
    const all = s.blueOverrides || (s.blueOverrides = {}), list = (all[id] || []).filter(x => !(x.book === book && x.n === slot));
    list.push({ book, n: slot, date, note: String(note || '') }); all[id] = list;
  }
  // Drop a Blue Jewel: an earned one (kind 'earned', by its gem number and day earned) or a hand-granted one (kind 'override', by book, slot and day).
  // The award records the gem made are removed too (announced, given, told without a date), so the Awards list and the counts match the wings. Returns the award names removed.
  // x: { kind, book, slot, gem, date, n }. The slot's award is named "<book> Blue Jewel <slot>" (an older file may leave the book code off).
  function dropBlue(s, id, x) {
    const name = x.book + ' Blue Jewel ' + x.slot, matches = a => a === name || (baseAward(s, a) === 'Blue Jewel ' + x.slot && (!/^[A-Za-z]{2,3} /.test(a) || a.startsWith(x.book + ' ')));
    const removed = [];
    Object.keys(s.awards || {}).forEach(d => { ((s.awards[d] || {})[id] || []).filter(matches).forEach(a => { removeAward(s, d, id, a); if (!removed.includes(a)) removed.push(a); }); });
    Object.keys((s.given || {})[id] || {}).filter(matches).forEach(a => { clearGiven(s, id, a); if (!removed.includes(a)) removed.push(a); });
    annNoDateList(s, id).filter(matches).forEach(a => { setAnnNoDate(s, id, a, false); if (!removed.includes(a)) removed.push(a); });
    if (x.kind === 'override') { const list = (((s.blueOverrides || {})[id]) || []).filter(o => !(o.book === x.book && o.n === x.n && o.date === x.date)); if (list.length) s.blueOverrides[id] = list; else delete s.blueOverrides[id]; if (s.blueOverrides && !Object.keys(s.blueOverrides).length) delete s.blueOverrides; return removed; }
    const all = s.blueDrops || (s.blueDrops = {}), list = new Set(all[id] || []); list.add(x.gem + '|' + x.date); all[id] = [...list].sort();
    return removed;
  }
  const Sparks = (s, book) => !!(s.config.books || {})[book] && bookGroup(s, book) === 'Sparks';
  // Gems earned and still waiting for the next set of wings (the number, for the screens).
  function heldGems(s, id, calRows) { return blueWingPlan(s, id, calRows).held.length; }

  // ---------- color team moves ----------
  const movesOf = (s, id) => ((s.teamMoves || {})[id] || []).slice();
  // calRows (optional): the calendar. With it the date must fall in the quarter, from its first club night to its last (a backdated move is fine: the points from that night on are recalculated from the nights on file).
  function setTeamMove(s, id, q, from, team, calRows) {
    if (!QUARTERS.includes(q)) throw new Error('Bad quarter "' + q + '".');
    needDate(from);
    if (!TEAMS.includes(team)) throw new Error('Team is Red, Blue, Green or Yellow.');
    if (calRows && calRows.length) {
      const c = counted(calRows), nights = Object.keys(c).filter(d => c[d] === q).sort();
      if (nights.length && (from < nights[0] || from > nights[nights.length - 1])) throw new Error(MDATE(from) + ' is not in ' + q + ' (club nights ' + MDATE(nights[0]) + ' to ' + MDATE(nights[nights.length - 1]) + '). Pick a night in ' + q + '.');
    }
    const list = movesOf(s, id).filter(m => !(m.q === q && m.from === from)).concat({ q, from, team });
    list.sort((a, b) => a.from < b.from ? -1 : a.from > b.from ? 1 : 0);
    (s.teamMoves = s.teamMoves || {})[id] = list;
  }
  function removeTeamMove(s, id, q, from) {
    const list = movesOf(s, id).filter(m => !(m.q === q && m.from === from));
    if (list.length) s.teamMoves[id] = list; else if (s.teamMoves) delete s.teamMoves[id];
  }
  // The child's teams through a quarter in words: "Green, then Blue from 11/4" ('' when they were never moved). dflt = the quarter's roster color.
  function teamStory(s, id, q, dflt) {
    const moves = movesOf(s, id).filter(m => m.q === q); if (!moves.length) return '';
    return [dflt || 'no team'].concat(moves.map(m => m.team + ' from ' + MDATE(m.from))).join(', then ');
  }
  // One-night exception (a visitor, a fill-in): the child must already be marked present.
  function setNightTeam(s, date, id, team) {
    needDate(date);
    const m = s.attendance[date] && s.attendance[date][id];
    if (team === '' || team == null) { if (m) delete m.t; return; }
    if (!TEAMS.includes(team)) throw new Error('Team is Red, Blue, Green or Yellow.');
    if (!m || !m.a) throw new Error('Mark the child present that night first.');
    m.t = team;
  }
  // dflt = the quarter's color from the roster. A move starts counting on its own date (that night's games already go to the new team).
  function teamOn(s, id, date, q, dflt) {
    const m = s.attendance[date] && s.attendance[date][id];
    if (m && m.t) return m.t;
    let t = dflt || '';
    movesOf(s, id).forEach(x => { if (x.q === q && x.from <= date) t = x.team; });
    return t;
  }
  // The color a child plays NOW in a quarter, for a printed list with no night chosen: the latest move in the quarter, else dflt (the roster color). A one-night exception does not count.
  function quarterColor(s, id, q, dflt) {
    let t = dflt || ''; movesOf(s, id).forEach(x => { if (x.q === q) t = x.team; });
    return t;
  }
  // The callback kidGamePoints wants: date -> team. dflt(q) gives the roster color for a quarter; quarterOf(date) the quarter.
  const teamResolver = (s, id, dflt, quarterOf) => d => { const q = quarterOf(d); return teamOn(s, id, d, q, dflt(q)); };

  // ---------- games ----------
  function setGame(s, date, group, team, v) {
    needDate(date);
    const has = x => x !== undefined && x !== null && x !== '';
    if (has(v.place) && !(v.place >= 1 && v.place <= 4)) throw new Error('Place is 1 to 4.');
    if (has(v.spirit) && !(v.spirit >= 0 && v.spirit <= 3)) throw new Error('Spirit is 0 to 3.');
    const rec = {}; if (has(v.place)) rec.place = +v.place; if (has(v.spirit)) rec.spirit = +v.spirit;
    const g = ((s.games[date] = s.games[date] || {})[group] = s.games[date][group] || {});
    if (Object.keys(rec).length) g[team] = rec; else delete g[team];
    if (!Object.keys(g).length) delete s.games[date][group];
    if (!Object.keys(s.games[date]).length) delete s.games[date];
  }
  function teamPoints(s, date, group, team) {
    const r = s.games[date] && s.games[date][group] && s.games[date][group][team];
    if (!r) return null;
    return { place: r.place ? (s.config.placePoints[r.place] || 0) : 0, spirit: r.spirit || 0 };
  }
  function kidGamePoints(s, id, group, teamOn, calRows) {
    const q = counted(calRows), out = { year: { place: 0, spirit: 0 } };
    QUARTERS.forEach(k => { out[k] = { place: 0, spirit: 0 }; });
    Object.keys(s.attendance).sort().forEach(d => {
      const m = s.attendance[d][id];
      if (!m || !m.a || !q[d] || !out[q[d]]) return;
      const t = teamOn(d), p = t && teamPoints(s, d, GROUPS.includes(m.g) ? m.g : group, t);      // the group that night (m.g), else the child's group now
      if (!p) return;
      out[q[d]].place += p.place; out[q[d]].spirit += p.spirit; out.year.place += p.place; out.year.spirit += p.spirit;
    });
    return out;
  }
  // The colors a child has played this year once mid-quarter moves exist (the no-repeat rule and the Quarter 4 fallback in teams.js and teamplan.js read this).
  //   moves[q] = the colors the child was moved to during quarter q (the quarter's own color is on the roster, so it is not repeated here)
  //   time[color] = nights the child attended on that color, by the team they were on that night (teamOn)
  // dflt(q) = the roster color for a quarter.
  //   list[q] = the moves in q, oldest first ({ from, team })
  //   end[q] = the color after the last move in q ('' when the child was not moved in q: the roster color stands)
  //   replaced[q] = true when the first move in q is dated on or before q's first club night: the roster color was never played in q (the move IS the quarter's color)
  function colorHistory(s, id, dflt, calRows) {
    const q = counted(calRows), moves = {}, time = {}, list = {}, replaced = {}, end = {}, first = {};
    QUARTERS.forEach(k => { moves[k] = []; list[k] = []; replaced[k] = false; end[k] = ''; });
    Object.keys(q).sort().forEach(d => { if (!first[q[d]]) first[q[d]] = d; });
    movesOf(s, id).forEach(m => { if (!moves[m.q]) return; if (!moves[m.q].includes(m.team)) moves[m.q].push(m.team); list[m.q].push({ from: m.from, team: m.team }); });
    QUARTERS.forEach(k => { const l = list[k].sort((a, b) => a.from < b.from ? -1 : a.from > b.from ? 1 : 0); if (!l.length) return; end[k] = l[l.length - 1].team; replaced[k] = !!first[k] && l[0].from <= first[k]; });
    Object.keys(s.attendance).sort().forEach(d => { const m = s.attendance[d][id]; if (!m || !m.a || !q[d]) return; const t = teamOn(s, id, d, q[d], dflt(q[d])); if (t) time[t] = (time[t] || 0) + 1; });
    return { moves, time, list, replaced, end };
  }
  function standings(s, group, quarter, calRows) {
    const q = counted(calRows);
    const rows = teamOrder(s).map(team => {
      let nights = 0, sum = 0, spirit = 0, points = 0;
      Object.keys(s.games).forEach(d => {
        const r = q[d] === quarter && s.games[d][group] && s.games[d][group][team];
        if (!r) return;
        const p = teamPoints(s, d, group, team);
        if (r.place) { nights++; sum += r.place; }
        spirit += p.spirit; points += p.place + p.spirit;
      });
      return { team, nights, avgPlace: nights ? Math.round(sum / nights * 100) / 100 : null, spirit, points };
    });
    rows.forEach(r => { r.rank = r.avgPlace === null ? null : 1 + rows.filter(o => o.avgPlace !== null && o.avgPlace < r.avgPlace).length; });
    return rows;
  }

  // ---------- awards ----------
  function addAward(s, date, id, award) {
    const night = s.awards[needDate(date)] || (s.awards[date] = {});
    const list = night[id] || (night[id] = []);
    if (!list.includes(award)) list.push(award);
    list.sort();
  }
  function removeAward(s, date, id, award) {
    const night = s.awards[date]; if (!night || !night[id]) return;
    night[id] = night[id].filter(a => a !== award);
    if (!night[id].length) delete night[id];
    if (!Object.keys(night).length) delete s.awards[date];
  }
  // Given dates nobody entered: in a file an older version of the app opened from before the Given check, every announced award was marked given on its announce night. Anything given that the History
  // never shows being set (by a tick, a typed date, the Earlier years button) was not entered by a person. [{ id, award, date }].
  function assumedGiven(s) {
    const set = new Set(), key = (id, a) => id + '\u0001' + a;
    (s.history || []).forEach(h => (h.changes || []).forEach(c => {
      const p = c.p || []; if (p[0] !== 'given') return;
      if (p.length >= 3) { if (c.n !== undefined) set.add(key(p[1], p[2])); else set.delete(key(p[1], p[2])); }
      else if (p.length === 2) { Object.keys(c.o || {}).forEach(a => set.delete(key(p[1], a))); Object.keys(c.n || {}).forEach(a => set.add(key(p[1], a))); }
      else { Object.keys(c.o || {}).forEach(i => Object.keys(c.o[i] || {}).forEach(a => set.delete(key(i, a)))); Object.keys(c.n || {}).forEach(i => Object.keys(c.n[i] || {}).forEach(a => set.add(key(i, a)))); }
    }));
    const start = seasonStart(s);      // a Given date before this season began was carried from an earlier year by newSeason (this file's History starts empty): nobody "assumed" it
    const out = []; Object.keys(s.given).forEach(id => Object.keys(s.given[id]).forEach(a => { if (!set.has(key(id, a)) && !(start && s.given[id][a] < start)) out.push({ id, award: a, date: s.given[id][a] }); })); return out;
  }
  function clearAssumedGiven(s) { const list = assumedGiven(s); list.forEach(x => clearGiven(s, x.id, x.award)); return list.length; }
  // Awards presented at the end-of-year ceremony (config.endOfYear): announced when earned like any other, but handed out then, so they are not on the weekly hand-out list.
  const isEndOfYear = (s, group, award) => ((s.config.endOfYear || {})[group] || []).includes(award);
  // ---- Announced ----
  // Announced is awards[date][id]: the night an award was told to the group. The slides show what is earned and not announced and not held (pendingAwards); Mark all announced stamps it on a night.
  // A wrong click is fixed by setAnnounced on the Progress record (clear it, or give another night). Announced and Given are independent: clearing one never touches the other.
  function announce(s, date, picks) {
    needDate(date); let n = 0;
    (picks || []).forEach(([id, award]) => { if (isHeld(s, id, award)) return; addAward(s, date, id, award); n++; });
    return n;
  }
  function setAnnounced(s, id, award, date) {
    Object.keys(s.awards).forEach(d => { if ((s.awards[d][id] || []).includes(award)) removeAward(s, d, id, award); });
    if (date) { addAward(s, date, id, award); setAnnNoDate(s, id, award, false); }      // a real night replaces the no-date mark
  }
  // "Ignore" on the Awards tab (To tell the group): the award counts as told to the group, with no night. Kept in the file (announcedNoDate[id]), like the Given no-date mark; it is never shown as an announce date.
  const annNoDateList = (s, id) => ((s.announcedNoDate || {})[id] || []);
  const isAnnNoDate = (s, id, award) => annNoDateList(s, id).includes(award);
  function setAnnNoDate(s, id, award, on) {
    const all = s.announcedNoDate || (s.announcedNoDate = {}), list = annNoDateList(s, id).filter(a => a !== award).concat(on ? [award] : []).sort();
    if (list.length) all[id] = list; else delete all[id];
    if (!Object.keys(all).length) delete s.announcedNoDate;
  }
  // Earned and not announced, for one child: [{ award, earned, held }]. Awards on the group's left-off-the-slide list are never listed (everybody gets them); awards finished before the first club night belong to earlier years.
  function pendingAwards(s, id, group, calRows) {
    const skip = (s.config.exclude || {})[group] || [];
    return awardLedger(s, id, group, calRows).filter(r => r.earned && !r.announced && !r.annNoDate && !skip.includes(r.award))
        .map(r => ({ award: r.award, earned: r.earned, earnedNoDate: !!r.earnedNoDate, held: r.held })).sort((a, b) => a.earned < b.earned ? -1 : a.earned > b.earned ? 1 : a.award < b.award ? -1 : 1);
  }
  // What the slides show: pending and not held, for the given children of one group. [{ id, results: [award] }], children with nothing left out.
  function slidePending(s, group, ids, calRows, resolve) {
    const pending = resolve || pendingAwards;      // resolve: tests only
    return ids.map(id => ({ id, results: pending(s, id, group, calRows).filter(r => !r.held).map(r => r.award) })).filter(x => x.results.length);
  }
  // Every award a child has earned, announced or been given this season, one row each: { award, earned, announced (latest night), given ('' | date | 'no date'), status }.
  // Earned comes from Progress and attendance; awards finished before the first club night (earlier years) are left out unless they were announced or given.
  function awardLedger(s, id, group, calRows) {
    const cut = seasonStart(s), rows = new Map(), row = a => { if (!rows.has(a)) rows.set(a, { award: a, earned: '', announced: '', given: '', held: isHeld(s, id, a), annNoDate: isAnnNoDate(s, id, a) }); return rows.get(a); };
    earnedList(s, id, group).forEach(b => { const r = row(b.award); r.earned = b.date; if (b.noDate) r.earnedNoDate = true; });
    if (group === 'Sparks') sparkJewels(s, id, calRows).forEach(j => { const want = j.book + ' Blue Jewel ' + j.n, have = awardsOf(s, id).map(a => a.award).concat(Object.keys(s.given[id] || {})).find(a => a === want || (baseAward(s, a) === 'Blue Jewel ' + j.n && (!/^[A-Za-z]{2,3} /.test(a) || a.startsWith(j.book + ' ')))); row(have || want).earned = j.date; });
    awardsOf(s, id).forEach(a => { const r = row(a.award); if (!r.announced || a.date > r.announced) r.announced = a.date; });
    Object.keys(s.given[id] || {}).forEach(a => { row(a).given = isGivenNoDate(s, id, a) ? 'no date' : s.given[id][a]; });
    // carried: every date this award has (earned, announced night, the day it was given) is before this season's cut, so it is an earlier year's award carried forward (newSeason). It is still listed (it may still need handing out),
    // but it is not this season's earning: earnedAwards (store points, statistics) and the season reports leave it out.
    return [...rows.values()].filter(r => !notAnAward(r.award) && (r.announced || r.annNoDate || r.given || !cut || !r.earned || r.earned >= cut)).map(r => { const ds = [r.earned, r.announced, (s.given[id] || {})[r.award]].filter(Boolean); return Object.assign(r, { status: r.given ? 'Given' : 'Earned, not given', carried: !!cut && ds.length > 0 && ds.every(d => d < cut) }); })
      .sort((a, b) => (a.announced || a.earned || '') < (b.announced || b.earned || '') ? -1 : 1);
  }
  // Every award a child has earned this season: worked out from Progress and attendance, plus any recorded by hand (announced or given) since an award you record is one you say they earned.
  // Earned is the main idea; announcing is a reminder to tell the crowd and Given tracks what was handed over. [{ award, earned (day, '' for one recorded by hand) }].
  // Earned this season (from Progress or attendance) or recorded by hand, or earned in an earlier year and announced; and not Given (a date or the "no date" tick both count as given); not on the group's ignored list (config.exclude);
  // and not an end-of-year award (those wait for the ceremony list). Holds and announcing do not matter.
  // One rule for the Awards tab's To hand out list, its badge and the Awards to hand out strips, so they always agree.
  // N28: a Sparks Blue Jewel is not handed out until the child has the book's Pilot Wing (earned, announced or given), even though attendance earns the jewel first.
  // The same rule for the Awards badge (toGive in app-season.js), so the number and the list agree.
  function jewelWaitsForWing(s, id, group, calRows, award) {
    const m = /^([A-Z0-9]+) Blue Jewel \d+$/.exec(award || ''); if (!m) return false;
    return !awardLedger(s, id, group, calRows).some(x => x.award === m[1] + ' Pilot Wing' && (x.earned || x.announced || x.given));
  }
  function toHandOut(s, id, group, calRows) {
    const skip = (s.config.exclude || {})[group] || [];
    return awardLedger(s, id, group, calRows).filter(r => !r.given && !skip.includes(r.award) && !isEndOfYear(s, group, r.award) && !jewelWaitsForWing(s, id, group, calRows, r.award));
  }
  function earnedAwards(s, id, group, calRows) { return awardLedger(s, id, group, calRows).filter(r => !r.carried).map(r => ({ award: r.award, earned: r.earned })); }
  // ---- Earned -> Announced -> Given ----
  // Earned is worked out (suggestedAwards, blueJewels); Announced is awards[date][id]; Given is a date per child and award, set on the Progress record or the Awards tab. Given does not wait for Announced: an award can be handed over on another night, and the inventory wants the day it left the shelf.
  // "Given, date unknown": handed over, but nobody knows the day. The date stored in given is then the day the box was ticked (so the award still counts as given and history has a day), and the award is
  // listed in givenNoDate[id]. Anything that shows a given date must use givenShown, which is empty for these, so a ticked-on date is never printed or shown as the day the child received it.
  const noDateList = (s, id) => ((s.givenNoDate || {})[id] || []);
  const isGivenNoDate = (s, id, award) => noDateList(s, id).includes(award) && !!(s.given[id] || {})[award];
  const givenShown = (s, id, award) => isGivenNoDate(s, id, award) ? '' : ((s.given[id] || {})[award] || '');
  function setNoDateMark(s, id, award, on) {
    const list = noDateList(s, id).filter(a => a !== award).concat(on ? [award] : []).sort();
    if (!s.givenNoDate) s.givenNoDate = {};
    if (list.length) s.givenNoDate[id] = list; else delete s.givenNoDate[id];
  }
  function clearGiven(s, id, award) { const g = s.given[id]; if (g && g[award]) { delete g[award]; if (!Object.keys(g).length) delete s.given[id]; } setNoDateMark(s, id, award, false); }
  function setGiven(s, id, award, date, opts) {
    if (!date) { clearGiven(s, id, award); return; }
    needDate(date);
    (s.given[id] || (s.given[id] = {}))[award] = date;
    setNoDateMark(s, id, award, !!(opts && opts.noDate));      // a real date written later replaces the mark
  }
  // A hold keeps an earned award off the slides (and out of Mark all announced) until it is released. held[id] = { award: 1 }: an object, so two people's holds on one child merge instead of clashing.
  // ---- Notes and flags ----
  // A note pinned to a place for later review. level: 'child' (the whole record), 'sheet' (one book's sheet: book), 'block' (one section block: book, block) or 'box' (one date box: book, block, key such as GJ1.2).
  // flags[id] = { kid, level, book, block, key, note, at }. Clearing a flag deletes it (History and Undo keep it); a flag on something that is later removed just stays listed until it is cleared.
  // A 'general' note is not about anyone in particular (kid is empty): it is only listed on the To do tab until it is cleared.
  // Also: 'attend' (one night in one class: date, room), 'team' (a quarter's color teams: quarter, group, optional color) and 'field' (one detail on a child's Person tab: field). attend and team are not about one child (kid is empty).
  // These add optional fields to a flag (date, room, quarter, group, color, field); a flag without them reads as before.
  // 'element' (Flag anything, any tab): tab (the tab id), trail (a breadcrumb of labels, tab name first: where the element is, not a screen position), label (the element's own label) and rowIndex (which of several same-named rows). Not about one child.
  // 'bug' is a bug report or feature request about the app (not about a child or the club). It lives in the flags section with an id that starts with b, has a status and a reply, and is listed on the Debug tab, never on To do.
  const FLAG_LEVELS = ['general', 'child', 'sheet', 'block', 'box', 'attend', 'team', 'field', 'element', 'bug'], FLAG_NO_KID = ['general', 'attend', 'team', 'element', 'bug'], FLAG_EXTRA = ['date', 'room', 'quarter', 'group', 'color', 'field', 'sub'], BUG_STATUS = ['open', 'fixed', 'dropped'], BUG_BY = ['leader', 'developer'];
  // N45: notes, flags and bug reports keep their line breaks. A Windows or phone line break (CRLF, or a lone CR) is saved as LF, so a file does not gain doubled breaks; the text is otherwise kept as typed.
  const normText = x => String(x || '').replace(/\r\n?/g, '\n').trim();
  function addFlag(s, f, now) {
    if (!f || (!f.kid && !FLAG_NO_KID.includes(f.level))) throw new Error('A flag needs a child.');
    if (!FLAG_LEVELS.includes(f.level)) throw new Error('Unknown flag level "' + f.level + '".');
    if (f.level === 'attend' && !(f.date && f.room)) throw new Error('An attendance note needs a night and a class.');
    if (f.level === 'team' && !(f.quarter && f.group)) throw new Error('A color team note needs a quarter and a group.');
    if (f.level === 'field' && !f.field) throw new Error('A field note needs the field.');
    if (f.level === 'element' && !(f.tab && Array.isArray(f.trail) && f.trail.length)) throw new Error('A flag on an element needs the tab and the trail to it.');
    const note = normText(f.note); if (!note) throw new Error('Write a note for the flag.');
    const d = now || new Date(), at = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (!s.flags) s.flags = {};
    const id = (f.level === 'bug' ? 'b' : 'f') + d.getTime().toString(36) + Math.floor(Math.random() * 1296).toString(36).padStart(2, '0');
    s.flags[id] = { kid: f.kid || '', level: f.level, book: f.book || '', block: f.block || '', key: f.key || '', note, at };      // book, block and key stay '' for every level: an older copy of the app reads them
    // N44: a flag on a filter (a select such as Night or Class) keeps the filter's id and value, so Go can set the filter back.
    if (f.filter && f.filter.id) s.flags[id].filter = { id: String(f.filter.id), value: String(f.filter.value == null ? '' : f.filter.value) };
    FLAG_EXTRA.forEach(k => { if (f[k]) s.flags[id][k] = String(f[k]); });
    if (f.level === 'bug') {
      s.flags[id].status = 'open'; if (f.ver) s.flags[id].ver = String(f.ver);
      if (f.tab && Array.isArray(f.trail) && f.trail.length) Object.assign(s.flags[id], { tab: String(f.tab), trail: f.trail.map(String), label: String(f.label || f.trail[f.trail.length - 1]), rowIndex: Number.isInteger(f.rowIndex) && f.rowIndex > 0 ? f.rowIndex : 0 });      // where it was captured (optional)
    }
    if (f.level === 'element') Object.assign(s.flags[id], { tab: String(f.tab), trail: f.trail.map(String), label: String(f.label || f.trail[f.trail.length - 1]), rowIndex: Number.isInteger(f.rowIndex) && f.rowIndex > 0 ? f.rowIndex : 0 });
    return id;
  }
  function setFlagNote(s, id, note) { const f = (s.flags || {})[id], t = normText(note); if (!f) throw new Error('No such flag.'); if (!t) throw new Error('Write a note for the flag.'); f.note = t; }
  function clearFlag(s, id) { if (s.flags) delete s.flags[id]; }
  // A bug report is a conversation (N17): replies are an object keyed by reply id, replies[rid] = { at: 'YYYY-MM-DD', by: 'leader' | 'developer', text }. An object, not a list, so two leaders who each add a reply
  // to one report each add a different key and a merge keeps both (a list is one value to the merge). The ids start with r (flags 'f', bugs 'b', absences 'a'); there is no date in them.
  // The older single reply (reply + replyAt, written by 1.51.15 and earlier) stays where it is and reads as the first reply, by the developer, so an older copy of the app still shows it.
  // Status is Open, Fixed or Dropped (N18); a reply never changes it. An unknown word in a file (an older or newer copy's, or the retired 'answered') reads as open.
  const isoOf = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const bugStatusOf = f => BUG_STATUS.includes(f && f.status) ? f.status : 'open';
  function bugOf(s, id) { const f = (s.flags || {})[id]; if (!f || f.level !== 'bug') throw new Error('No such bug report.'); return f; }
  function setBugStatus(s, id, status) { const f = bugOf(s, id), st = String(status); if (!BUG_STATUS.includes(st)) throw new Error('Unknown status "' + st + '".'); f.status = st; }
  // N44: a reply on any note or flag (not only a bug report), in the same shape as a bug reply. Bug reports keep addBugReply.
  function addFlagReply(s, id, text, by, now) {
    const f = (s.flags || {})[id]; if (!f) throw new Error('No such note.');
    const t = normText(text), b = String(by || 'leader'); if (!t) throw new Error('Write a reply.'); if (!BUG_BY.includes(b)) throw new Error('A reply is by a leader or the developer.');
    const d = now || new Date(), rid = 'r' + d.getTime().toString(36) + Math.floor(Math.random() * 1296).toString(36).padStart(2, '0');
    if (!isObj(f.replies)) f.replies = {}; f.replies[rid] = { at: isoOf(d), by: b, text: t }; return rid;
  }
  // N49: a reply is a message of its own: it can be edited or removed without touching the note or the other replies. (removeBugReply is the same for a bug report.)
  function setFlagReply(s, id, rid, text) {
    const f = (s.flags || {})[id]; if (!f) throw new Error('No such note.'); if (!isObj(f.replies) || !isObj(f.replies[rid])) throw new Error('No such reply.');
    const t = normText(text); if (!t) throw new Error('Write a reply.'); f.replies[rid].text = t;
  }
  function removeFlagReply(s, id, rid) {
    const f = (s.flags || {})[id]; if (!f) throw new Error('No such note.'); if (!isObj(f.replies) || !f.replies[rid]) throw new Error('No such reply.');
    delete f.replies[rid]; if (!Object.keys(f.replies).length) delete f.replies;      // a record that becomes empty is deleted (DATA-FORMAT section 2.4)
  }
  function addBugReply(s, id, text, by, now) {
    const f = bugOf(s, id), t = normText(text), b = String(by || 'leader'); if (!t) throw new Error('Write a reply.'); if (!BUG_BY.includes(b)) throw new Error('A reply is by a leader or the developer.');
    const d = now || new Date(), rid = 'r' + d.getTime().toString(36) + Math.floor(Math.random() * 1296).toString(36).padStart(2, '0');
    if (!isObj(f.replies)) f.replies = {}; f.replies[rid] = { at: isoOf(d), by: b, text: t }; return rid;
  }
  // The replies in the order they were written: the older single reply first, then the rest by date and id.
  function bugThread(f) {
    const out = []; if (f && f.reply) out.push({ id: 'legacy', at: f.replyAt || '', by: 'developer', text: f.reply });
    if (f && isObj(f.replies)) Object.keys(f.replies).forEach(rid => { const r = f.replies[rid]; if (isObj(r)) out.push({ id: rid, at: r.at || '', by: r.by || 'leader', text: r.text || '' }); });
    return out.sort((a, b) => (a.id === 'legacy' ? -1 : b.id === 'legacy' ? 1 : a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1));
  }
  function removeBugReply(s, id, rid) {
    const f = bugOf(s, id);
    if (rid === 'legacy') { delete f.reply; delete f.replyAt; return; }
    if (!isObj(f.replies) || !f.replies[rid]) throw new Error('No such reply.');
    delete f.replies[rid]; if (!Object.keys(f.replies).length) delete f.replies;      // a record that becomes empty is deleted (DATA-FORMAT section 2.4)
  }
  // ---- Volunteer absences (S11). Kept with the person: absences[personId][absId] = { reason, at, nights: { 'YYYY-MM-DD': 1 } }.
  // Only club nights are stored; the caller passes the club nights from the calendar, and any other date is refused.
  // The absence id is 'a' + time36 + 2 random base-36 characters (flags use 'f'), with no date in it.
  function pruneAbsence(s, personId, absId) {
    const person = (s.absences || {})[personId]; if (!person) return;
    if (absId && person[absId] && !Object.keys(person[absId].nights || {}).length) delete person[absId];
    if (!Object.keys(person).length) delete s.absences[personId];
    if (s.absences && !Object.keys(s.absences).length) delete s.absences;
  }
  function addAbsence(s, personId, nightDates, reason, clubNights, now) {
    if (!personId) throw new Error('An absence needs a volunteer.');
    const nights = [...new Set((nightDates || []).map(String))].sort();
    if (!nights.length) throw new Error('There are no club nights in that range. An absence holds club nights only.');
    const club = new Set(clubNights || []), bad = nights.filter(d => !isRealDate(d) || !club.has(d));
    if (bad.length) throw new Error('Not a club night: ' + bad.join(', ') + '. An absence holds club nights only.');
    const d = now || new Date(), at = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const id = 'a' + d.getTime().toString(36) + Math.floor(Math.random() * 1296).toString(36).padStart(2, '0');
    if (!s.absences) s.absences = {};
    if (!s.absences[personId]) s.absences[personId] = {};
    const n = {}; nights.forEach(x => { n[x] = 1; });
    s.absences[personId][id] = { reason: String(reason || '').trim(), at, nights: n };
    return id;
  }
  // Clear some club nights of one absence (one night, or the remaining nights). Clearing the last night deletes the absence.
  function clearAbsenceNights(s, personId, absId, dates) {
    const a = ((s.absences || {})[personId] || {})[absId]; if (!a) return;
    (dates || []).forEach(d => { delete a.nights[d]; });
    pruneAbsence(s, personId, absId);
  }
  // Clear the whole absence (every night of it). History keeps it for Undo.
  function clearAbsence(s, personId, absId) {
    const person = (s.absences || {})[personId]; if (!person) return;
    delete person[absId]; pruneAbsence(s, personId, null);
  }
  // One row per absence per club night, for the Attendance tab and To do: { personId, absId, date, reason, at }.
  function absenceList(s) {
    const out = []; Object.keys(s.absences || {}).forEach(pid => { const person = s.absences[pid]; Object.keys(person).forEach(aid => { const a = person[aid]; Object.keys(a.nights || {}).forEach(date => out.push({ personId: pid, absId: aid, date, reason: a.reason || '', at: a.at || '' })); }); });
    return out.sort((x, y) => x.date < y.date ? -1 : x.date > y.date ? 1 : x.personId < y.personId ? -1 : x.personId > y.personId ? 1 : x.absId < y.absId ? -1 : x.absId > y.absId ? 1 : 0);
  }
  // Combined status for a volunteer on a date (S11). Nothing is stored: a Present mark never clears a planned absence, and a night with a Present mark is never counted as planned out.
  function nightStatus(s, personId, date) {
    const mark = !!(s.attendance[date] && s.attendance[date][personId] && s.attendance[date][personId].a);
    const cover = Object.keys((s.absences && s.absences[personId]) || {}).find(aid => s.absences[personId][aid].nights && s.absences[personId][aid].nights[date]);
    const status = mark && cover ? 'came' : mark ? 'present' : cover ? 'planned' : 'none';
    return { status, absId: cover || null, reason: cover ? (s.absences[personId][cover].reason || '') : '' };
  }
  // One row per night for a volunteer, newest first: club nights up to today, every night with a mark, and every planned night (future or no longer on the calendar).
  function volunteerNights(s, personId, clubDates, today, calRows) {
    const dates = new Set(), held = calRows ? new Set(heldNights(s, calRows)) : null;      /* with the calendar, each row says whether the night was HELD (a child was present): the expected-nights figure counts held nights only (CR-12) */
    (clubDates || []).forEach(d => { if (!today || d <= today) dates.add(d); });
    Object.keys(s.attendance || {}).forEach(d => { if (s.attendance[d] && s.attendance[d][personId]) dates.add(d); });
    Object.keys((s.absences && s.absences[personId]) || {}).forEach(aid => Object.keys(s.absences[personId][aid].nights || {}).forEach(d => dates.add(d)));
    const clubs = new Set(clubDates || []);
    return [...dates].sort().reverse().map(date => Object.assign({ date, clubNight: clubs.has(date) }, held ? { held: held.has(date) } : {}, nightStatus(s, personId, date)));
  }
  // Expected club nights for a volunteer (S11, decided 2026-11-16): held nights, less the planned-out nights where the volunteer was not present. A planned night with a Present mark stays expected.
  function volunteerExpected(s, personId, calRows, isChild) {
    const held = heldNights(s, calRows, isChild);
    const st = held.map(d => nightStatus(s, personId, d).status);
    const present = st.filter(x => x === 'present' || x === 'came').length, plannedOut = st.filter(x => x === 'planned').length;
    return { held: held.length, present, plannedOut, expected: held.length - plannedOut };
  }
  const flagList = s => Object.keys(s.flags || {}).map(id => Object.assign({ id }, s.flags[id])).sort((a, b) => a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1);
  const noteList = s => flagList(s).filter(f => f.level !== 'bug');      // notes and flags (To do, a child's sheet): never bug reports
  const bugList = s => { const rank = { open: 0, fixed: 1, dropped: 2 }; return flagList(s).filter(f => f.level === 'bug').sort((a, b) => rank[bugStatusOf(a)] - rank[bugStatusOf(b)] || (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1)); };
  // Hiding a note or flag on To do (N19): flag.hidden = 1 while hidden, the key deleted on Unhide (a record never stores an empty value). Only the To do card leaves a hidden note out of its list and count: the child's sheet, the yellow flags,
  // the popups and History still show it. Any truthy 1 or true reads as hidden. A bug report is never listed on To do, so it cannot be hidden.
  const isFlagHidden = f => !!f && (f.hidden === 1 || f.hidden === true);
  function setFlagHidden(s, id, on) {
    const f = (s.flags || {})[id]; if (!f) throw new Error('No such flag.'); if (f.level === 'bug') throw new Error('A bug report is not listed on To do, so it cannot be hidden there.');
    if (on) f.hidden = 1; else delete f.hidden;
  }
  const todoNotes = s => { const all = noteList(s); return { open: all.filter(f => !isFlagHidden(f)), hidden: all.filter(isFlagHidden) }; };
  const flagsOf = (s, kid) => noteList(s).filter(f => f.kid === kid);
  const flagsAt = (s, kid, book, key) => flagsOf(s, kid).filter(f => f.book === (book || '') && f.key === (key || ''));
  // The flags at one Attendance, Color teams or Person-field place: every named part of the place must match (a team flag with no color is the whole group).
  const flagsAtPlace = (s, p) => flagList(s).filter(f => f.level === p.level && ['kid', 'date', 'room', 'quarter', 'group', 'color', 'field'].every(k => (f[k] || '') === (p[k] || '')));
  const isHeld = (s, id, award) => !!((s.held || {})[id] || {})[award];
  function setHold(s, id, award, on) {
    if (!s.held) s.held = {};
    const h = s.held[id] || (s.held[id] = {});
    if (on) h[award] = 1; else delete h[award];
    if (!Object.keys(h).length) delete s.held[id];
  }
  // Announced awards that have not been given yet: [{ id, award, date (announced) }], oldest first.
  function waitingToGive(s) {
    const out = [];
    Object.keys(s.awards).sort().forEach(d => Object.keys(s.awards[d]).forEach(id => s.awards[d][id].forEach(a => { if (!(s.given[id] || {})[a]) out.push({ id, award: a, date: d }); })));
    return out;
  }
  function awardsOf(s, id) {
    const out = [];
    Object.keys(s.awards).sort().reverse().forEach(d => { if (s.awards[d][id]) s.awards[d][id].forEach(a => out.push({ date: d, award: a })); });
    return out;
  }

  // ---------- handbooks ----------
  // "HG 260916 note": a book code (2 to 5 letters, then a space, a digit or the end), the date received (yymmdd) and a note. A leading word that is not a code ("Returned") is just a note.
  // A note that itself starts with six digits and has no date in front of it is stored as "HG - 260916 ...", so it is not read back as a date.
  function parseHandbook(text) {
    const m = /^\s*(?:([A-Za-z]{2,5})(?=\s|\d|$))?\s*(?:(\d{6})(?!\d))?\s*(.*?)\s*$/.exec(String(text || ''));
    const yy = m[2], marked = !yy && /^-\s+(\d{6}(?!\d).*)$/.exec(m[3]);
    return { code: m[1] || '', date: yy ? '20' + yy.slice(0, 2) + '-' + yy.slice(2, 4) + '-' + yy.slice(4, 6) : '', note: marked ? marked[1] : m[3] || '' };
  }
  // The three parts the screens edit. A date that is not a real calendar date stays in the note, so nothing typed in the old one-box format is lost.
  function handbookParts(text) {
    const p = parseHandbook(text), m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p.date), d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (!p.date || (d && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3])) return p;
    return { code: p.code, date: '', note: (p.date.slice(2).replace(/-/g, '') + ' ' + p.note).trim() };
  }
  // A note only travels with a book or a date; with neither, the entry is empty.
  function formatHandbook(p) {
    const code = String(p.code || '').trim(); let note = String(p.note || '').trim(); const date = p.date ? needDate(p.date).slice(2).replace(/-/g, '') : '';
    if (code && !/^[A-Za-z]{2,5}$/.test(code)) throw new Error('The book code is 2 to 5 letters with no spaces (for example HG), not "' + code + '".');
    if (!date && /^\d{6}(?!\d)/.test(note) && realYymmdd(note.slice(0, 6))) note = '- ' + note;     // keep a six-digit note from turning into a date
    return !code && !date ? '' : [code, date, note].filter(Boolean).join(' ');
  }
  const realYymmdd = t => { const d = new Date(Date.UTC(2000 + +t.slice(0, 2), +t.slice(2, 4) - 1, +t.slice(4, 6))); return d.getUTCMonth() === +t.slice(2, 4) - 1 && d.getUTCDate() === +t.slice(4, 6); };
  // The code box offers book names as hints; if a name is typed instead of the code, use the book's code.
  // A book's code is its key in config.books: 2 or 3 letters (HG, AoG), written in handbook records exactly like that. A typed code in any capitals finds it (AOG = AoG); an older 2-letter
  // spelling that starts like only one book finds that book too (AO = AoG). The book's name typed in place of the code finds it as well.
  const bookKey = (s, text) => Catalog.bookKeyOf(s.config.books || {}, text);
  function bookCode(s, text) {
    const flat = t => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, ''), typed = flat(text), books = s.config.books || {}, key = bookKey(s, text);
    if (key) return key;
    const hit = Object.keys(books).find(c => flat((books[c] || {}).name) === typed && typed);
    return hit || String(text || '').trim();
  }
  function setHandbook(s, id, parts) { const v = formatHandbook(parts); if (v) s.handbooks[id] = v; else delete s.handbooks[id]; }
  // Handbook codes that are another spelling of a book's code (AO or AOG for the book AoG; case differences too): [{ id, from, to }]. apply = true rewrites them to the book's code, keeping the date and note.
  // A code that only starts like a book (a typed book name such as Hang) or matches no book is left alone: that is for a person to look at.
  function tidyHandbookCodes(s, apply) {
    const out = [];
    Object.keys(s.handbooks || {}).forEach(id => {
      const parts = handbookParts(s.handbooks[id]), to = parts.code && /^[A-Za-z]{2,3}$/.test(parts.code) ? bookKey(s, parts.code) : '';
      if (to && parts.code !== to) { out.push({ id, from: parts.code, to }); if (apply) setHandbook(s, id, Object.assign({}, parts, { code: to })); }
    });
    return out;
  }
  function handbookCounts(s, ids, group) {
    const out = {};
    ids.forEach(id => {
      const assigned = parseHandbook(s.handbooks[id]).code;
      const c = assigned ? bookKey(s, assigned) : receivedBookForGroup(s, id, group);
      const name = (s.config.books[c] || {}).name || 'No Book Yet';
      out[name] = (out[name] || 0) + 1;
    });
    return out;
  }

  // ---------- progress ----------
  // Sign-offs marked "no date" (an award given before its section was finished, see markSignsNoDate). The day given is stored as the sign-off's date, so the section counts as finished and the award has a date, but no sign-off shows or prints it.
  // progressNoDate[id][book] = ["<block>.<item>", ...]. A real date typed later, or a cleared box, takes the mark off (setProgress).
  const noDateSigns = (s, id, book) => ((s.progressNoDate || {})[id] || {})[book] || [];
  const isSignNoDate = (s, id, book, key) => noDateSigns(s, id, book).includes(key);
  // The way to READ a sign-off date for anything shown or printed: a no-date sign-off has no shown date (its stored day is only a bookkeeping day). Presence tests may read progress directly.
  const signShown = (s, id, book, key) => isSignNoDate(s, id, book, key) ? '' : ((((s.progress || {})[id] || {})[book] || {})[key] || '');
  const signsShown = (s, id, book) => { const all = (((s.progress || {})[id] || {})[book]) || {}, no = noDateSigns(s, id, book), out = {}; Object.keys(all).forEach(k => { if (!no.includes(k)) out[k] = all[k]; }); return out; };
  function setSignNoDate(s, id, book, key, on) {
    const all = s.progressNoDate || (s.progressNoDate = {}), kid = all[id] || (all[id] = {});
    const list = (kid[book] || []).filter(k => k !== key).concat(on ? [key] : []).sort();
    if (list.length) kid[book] = list; else delete kid[book];
    if (!Object.keys(kid).length) delete all[id];
  }
  // The items of one block of a book that have no date yet (and are not already no-date). Items are the block's item keys, e.g. "1.2".
  const unsignedIn = (s, id, book, blockKey, items) => { const dates = (s.progress[id] || {})[book] || {}; return items.map(i => blockKey + '.' + i).filter(k => !dates[k]); };
  function markSignsNoDate(s, id, book, keys, date) {
    needDate(date);
    keys.forEach(k => { setProgress(s, id, book, k, date); setSignNoDate(s, id, book, k, true); });
  }
  function setProgress(s, id, book, key, date) {
    if (date) needDate(date);
    const kid = s.progress[id] || (s.progress[id] = {});
    const b = kid[book] || (kid[book] = {});
    if (date) b[key] = date; else delete b[key];
    setSignNoDate(s, id, book, key, false);      // a typed or cleared date is a real one now (markSignsNoDate sets the mark after)
    if (!Object.keys(b).length) delete kid[book];
    if (!Object.keys(b).length) delete kid[book];
    if (!Object.keys(kid).length) delete s.progress[id];
  }
  function completedBlocks(s, id, group) {
    const t = s.config.progress[group], kid = s.progress[id];
    if (!t || !kid) return [];
    const out = [];
    const check = (blocks, book) => blocks.forEach(b => {
      const dates = b.items.map(i => (kid[book] || {})[b.key + '.' + i]);
      if (!dates.length || dates.some(d => !d)) return;
      const bk = s.config.books[book] || {};
      out.push({ key: b.key, book: book === 'common' ? '' : book, label: b.label, date: dates.slice().sort().pop(), noDate: b.items.some(i => isSignNoDate(s, id, book, b.key + '.' + i)),      // noDate: finished with a no-date sign-off, so `date` is only a bookkeeping day: show "no date"
        awards: b.awards.map(a => a.replace('{book}', book).replace('{emblem}', bk.emblem || '')) });
    });
    check(t.common, 'common');
    Object.keys(s.config.books).filter(c => kid[c] && (!bookGroup(s, c) || bookGroup(s, c) === group)).forEach(c => {
      check(t.perBook, c);
      // The book's Review Emblem: every section and every review of the blocks that have reviews (the jewels), then it is earned on the latest of those dates.
      const br = t.bookReview, rb = (t.perBook || []).filter(b => (b.review || []).length);
      if (!br || !rb.length) return;
      const core = [].concat(...rb.map(b => b.items.map(i => (kid[c] || {})[b.key + '.' + i])));
      const reviews = [].concat(...rb.map(b => b.review.map(i => (kid[c] || {})[b.key + '.' + i])));
      const reviewsBefore = ((s.doneReviews || {})[id] || []).includes(c);
      if (core.some(d => !d) || (!reviewsBefore && reviews.some(d => !d))) return;
      const dates = core.concat(reviews.filter(Boolean));
      const bk = s.config.books[c] || {};
      out.push({ key: 'BOOKREVIEW', book: c, label: br.label || 'Book Review', date: dates.slice().sort().pop(), noDate: reviewsBefore || rb.some(b => b.items.concat(b.review).some(i => isSignNoDate(s, id, c, b.key + '.' + i))), awards: br.awards.map(a => a.replace('{book}', c).replace('{emblem}', bk.emblem || '')) });
    });
    return out;
  }
  function setBookDone(s, id, code, on) {
    if (!(s.config.books || {})[code]) throw new Error('"' + code + '" is not one of your books.');
    const list = ((s.doneBooks || {})[id] || []).filter(c => c !== code).concat(on ? [code] : []).sort();
    if (!s.doneBooks) s.doneBooks = {};
    if (list.length) s.doneBooks[id] = list; else delete s.doneBooks[id];
  }
  const reviewsDoneBefore = (s, id, code) => ((s.doneReviews || {})[id] || []).includes(code);
  function setReviewsDone(s, id, code, on) {
    const group = bookGroup(s, code), template = (s.config.progress || {})[group];
    if (!((s.config.books || {})[code]) || group !== 'Sparks' || !template || !(template.perBook || []).some(b => (b.review || []).length)) throw new Error('"' + code + '" does not have Sparks reviews.');
    const list = ((s.doneReviews || {})[id] || []).filter(c => c !== code).concat(on ? [code] : []).sort();
    if (!s.doneReviews) s.doneReviews = {};
    if (list.length) s.doneReviews[id] = list; else delete s.doneReviews[id];
  }
  // ---------- finished books ----------
  // A book is finished when every section of its core blocks is dated (Sparks: Rank and the eight jewels, reviews not included; T&T: the emblem blocks, not Silver / Gold),
  // or when it is ticked in doneBooks (finished before, at another club, no section records). { book, group, date (latest section; '' for ticked), before }.
  const TNT_EXTRA = /^(SV|GD)\d/;
  function finishedBooks(s, id) {
    const out = [], kid = s.progress[id] || {}, done = new Set((s.doneBooks || {})[id] || []);
    Object.keys(s.config.books || {}).forEach(code => {
      const g = bookGroup(s, code), t = (s.config.progress || {})[g];
      if (done.has(code)) { out.push({ book: code, group: g, date: '', before: true }); return; }
      if (!t || !kid[code]) return;
      const core = (t.perBook || []).filter(b => !(g === 'T&T' && TNT_EXTRA.test(b.key)));
      const dates = [].concat(...core.map(b => b.items.map(i => kid[code][b.key + '.' + i])));
      if (dates.length && dates.every(Boolean)) out.push({ book: code, group: g, date: dates.slice().sort().pop(), before: false, noDate: core.some(b => b.items.some(i => isSignNoDate(s, id, code, b.key + '.' + i))) });
    });
    return out;
  }
  // How far a child is in one book, for the colored book tabs (Mike, 2026-11-12):
  //   'review'  finished, and its Book Review is earned too (every section dated and every review dated or marked finished before; Sparks only)
  //   'done'    finished (every core section dated, or ticked "finished before")
  //   'started' some date entered or a date received, not finished
  //   ''        not started
  const hasBookSignoffs = (s, id, code) => Object.values((s.progress[id] || {})[code] || {}).some(Boolean);
  function bookStatus(s, id, code) {
    const fin = finishedBooks(s, id).find(b => b.book === code), kid = (s.progress[id] || {})[code] || {};
    if (fin) {
      const t = (s.config.progress || {})[fin.group], rb = t ? (t.perBook || []).filter(b => (b.review || []).length) : [];
      const reviewsBefore = reviewsDoneBefore(s, id, code);
      if (!fin.before && t && t.bookReview && rb.length && (reviewsBefore || [].concat(...rb.map(b => b.review.map(i => kid[b.key + '.' + i]))).every(Boolean))) return 'review';
      return 'done';
    }
    return hasBookSignoffs(s, id, code) || !!((s.received || {})[id] || {})[code] || reviewsDoneBefore(s, id, code) ? 'started' : '';
  }
  function bookTabStatus(s, id, code, current) {
    const status = bookStatus(s, id, code);
    if (status === 'done' || status === 'review') return status;
    if (code === current) return 'current';
    return status === 'started' ? 'open' : '';
  }
  // The awards for how many books the child has finished (config.completion[group], in order). Books ticked as finished before count, but the awards they stand for are presumed received:
  // only an award reached by a book finished here is earned here (dated by that book's last section).
  // Sparks work through the books in order (config.sparksBooks 'sequence', the standard): the award follows the book, in the order HG, WR, SS (1st Book, 2nd Book, Sparky Sculpture), so a child
  // whose first book was finished before the records began still gets the 2nd Book medallion for Wingrunner. With the All Together method, and for T&T (any order), the number of books finished decides.
  const SPARKS_ORDER = ['HG', 'WR', 'SS'];
  const cubbiesOrder = s => { const all = Object.keys(s.config.books || {}).filter(c => bookGroup(s, c) === 'Cubbies'), std = ['AS', 'HC']; return std.filter(c => all.includes(c)).concat(all.filter(c => !std.includes(c))); };
  const sparksOrder = s => { const all = Object.keys(s.config.books || {}).filter(c => bookGroup(s, c) === 'Sparks'); return SPARKS_ORDER.filter(c => all.includes(c)).concat(all.filter(c => !SPARKS_ORDER.includes(c))); };
  function completionAwards(s, id, group) {
    const tiers = (s.config.completion || {})[group] || [], books = finishedBooks(s, id).filter(b => b.group === group), out = [];
    if ((group === 'Sparks' && s.config.sparksBooks !== 'together') || group === 'Cubbies') {
      const order = group === 'Cubbies' ? cubbiesOrder(s) : sparksOrder(s);
      books.filter(b => !b.before).forEach(b => { const award = tiers[order.indexOf(b.book)]; if (award) out.push({ award, date: b.date, block: 'BOOKS', book: b.book }); });
      return out.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    }
    const before = books.filter(b => b.before).length, dated = books.filter(b => !b.before).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    tiers.forEach((award, i) => { const b = dated[i - before]; if (i >= before && b) out.push({ award, date: b.date, block: 'BOOKS', book: b.book }); });
    return out;
  }
  const earnedList = (s, id, group) => {
    const out = []; completedBlocks(s, id, group).forEach(b => b.awards.forEach(a => out.push({ award: a, date: b.date, noDate: !!b.noDate, block: b.key, book: b.book })));      // noDate: the section was finished with a no-date sign-off, so `date` is only a bookkeeping day (kept for sorting and the cut-off): show "no date"
    return out.concat(completionAwards(s, id, group));
  };
  function suggestedAwards(s, id, group) {
    const have = new Set(awardsOf(s, id).map(a => a.award)), out = [], cut = seasonStart(s);
    // An award finished before this season's first club night belongs to an earlier year: it is never offered for announcing (or to hand out), whether or not it was marked given.
    // (A completion award has the date of the book that earned it; one earned by a book finished before, ticked in doneBooks, is not offered either.)
    earnedList(s, id, group).forEach(b => { if (!have.has(b.award) && !(cut && b.date < cut)) out.push(b); });
    return out;
  }
  // ---------- earlier years ----------
  // Progress sheets from earlier club years are entered with their real dates. An award earned before this season's first club night belongs to an earlier year; those can be marked
  // "given, no date" in one step (the child has them; nobody knows the day). Nothing new is stored beyond the usual given / givenNoDate marks, and nothing already given is changed.
  const firstNight = s => Object.keys(counted(s.calendar || [])).sort()[0] || '';
  // The first day that belongs to THIS season, the "cut" every earlier-years rule uses. Normally the first club night on the calendar. A new season carries progress and awards forward (newSeason) and also the old
  // calendar until it is replaced, so config.carriedThrough (the closed year's last night, written once by newSeason) holds the cut back to the day after it: nothing carried is ever this season's work.
  const dayAfter = d => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };
  function seasonStart(s) {
    // Recorded closures preserve the existing classification of awards and sign-offs.
    // BEGIN PLAYTEST
    // A cancelled opening night moves the boundary to the next counted meeting.
    const opening = (s.calendar || []).filter(r => r && isRealDate(r.Date) &&
      (Calendar.countsNight(r) || Calendar.stateOf(r) === 'cancelled' || isRecordedClosure(s, r)))
      .reduce((first, row) => !first || row.Date < first.Date ||
        (row.Date === first.Date && Calendar.countsNight(row)) ? row : first, null);
    if (opening && Calendar.stateOf(opening) === 'cancelled') {
      const next = firstNight(s), cutoff = (s.config || {}).carriedThrough;
      return isRealDate(cutoff) && (!next || next <= cutoff) ? dayAfter(cutoff) : next;
    }
    // END PLAYTEST
    const closed = (s.calendar || []).filter(r => r && isRecordedClosure(s, r)).map(r => r.Date);
    const f = [firstNight(s), ...closed].filter(Boolean).sort()[0] || '';
    const t = (s.config || {}).carriedThrough;
    return isRealDate(t) && (!f || f <= t) ? dayAfter(t) : f;
  }
  // Progress sections signed off in this season (a sign-off dated before the cut was carried from an earlier year); counted by the Awana store points.
  function sectionsThisSeason(s, id) {
    const cut = seasonStart(s); let n = 0;
    Object.values(s.progress[id] || {}).forEach(b => Object.keys(b).forEach(k => { if (!cut || !b[k] || String(b[k]) >= cut) n++; }));
    return n;
  }
  function pastYearAwards(s, id) {
    const cut = seasonStart(s), out = [];
    if (!cut) return out;
    Object.keys(s.config.progress || {}).forEach(g => earnedList(s, id, g).forEach(b => {
      if (b.date < cut && !(s.given[id] || {})[b.award] && !out.includes(b.award)) out.push(b.award);
    }));
    return out;
  }
  // ids = children to do (default: everyone with a progress record). Returns { awards, kids } counted.
  function markPastYearsGiven(s, today, ids) {
    if (!firstNight(s)) throw new Error('There are no club nights on the calendar yet, so the start of this season is not known.');
    let awards = 0, kids = 0;
    (ids || Object.keys(s.progress)).forEach(id => { const list = pastYearAwards(s, id); list.forEach(a => setGiven(s, id, a, today, { noDate: true })); if (list.length) { awards += list.length; kids++; } });
    return { awards, kids };
  }

  // ---------- history ----------
  // The log holds every change as old/new values at a path, so any version can be rebuilt by undoing entries from the
  // newest back, and any two versions compared. Edits to the same night/area within MERGE_MINUTES share one entry.
  // SECTIONS is the one list of everything in a file that holds records. History, undo, restore, Discard, compare and the Drive merge (datamerge.js uses this same list) only see these;
  // a section added to the file (see toJson / fromJson) and left off this list would be saved but never logged, undone or merged. test/season-sections.test.js fails if a written section is missing here.
  const SECTIONS = ['config', 'handbooks', 'attendance', 'awards', 'given', 'givenNoDate', 'held', 'flags', 'doneBooks', 'doneReviews', 'received', 'adults', 'teamMoves', 'games', 'progress', 'progressNoDate', 'extraSheets', 'announcedNoDate', 'blueWings', 'blueOverrides', 'blueDrops', 'pastTurnout', 'absences', 'roster', 'calendar', 'rotation'], MERGE_MINUTES = 5;
  const KNOWN_TOP = ['format', 'version', 'year', 'fake', 'history'].concat(SECTIONS);      // every other top-level key is kept in s.unknownKeys (R17)
  // (a section the season does not hold yet, like the ones that are left out of the file while empty, snapshots as empty)
  const snapshot = s => { const o = {}; SECTIONS.forEach(k => { o[k] = clone(s[k] === undefined ? {} : s[k]); }); return o; };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function diffInto(a, b, p, out) {
    if (isObj(a) && isObj(b)) { [...new Set(Object.keys(a).concat(Object.keys(b)))].sort().forEach(k => diffInto(a[k], b[k], p.concat(k), out)); return; }
    if (same(a, b) || p[p.length - 1] === 'x_LastSeen') return;      // x_LastSeen is a stamp every export refresh rewrites, not an edit
    const c = { p }; if (a !== undefined) c.o = clone(a); if (b !== undefined) c.n = clone(b);
    out.push(c);
  }
  function diff(before, after) { const out = [], held = v => (v === undefined ? {} : v); SECTIONS.forEach(k => diffInto(held(before[k]), held(after[k]), [k], out)); return out; }      // a section the file leaves out while it is empty counts as empty, on either side
  function setPath(state, p, has, v) {
    if (p.includes('__proto__')) return;      // never write through the prototype
    let o = state;
    for (let i = 0; i < p.length - 1; i++) o = o[p[i]] = isObj(o[p[i]]) ? o[p[i]] : {};
    if (has) o[p[p.length - 1]] = clone(v); else delete o[p[p.length - 1]];
  }
  // Apply changes forward, or (reverse) undo them last-to-first.
  function applyChanges(state, changes, reverse) {
    (reverse ? changes.slice().reverse() : changes).forEach(c => reverse ? setPath(state, c.p, c.o !== undefined, c.o) : setPath(state, c.p, c.n !== undefined, c.n));
  }
  const MDATE = d => { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(d || ''); return m ? (+m[1]) + '/' + (+m[2]) : (typeof d === 'string' ? d.replace(/[<>&"']/g, '') : d); };      // the same formatter as Model.md (kept local: this file also runs without the browser's Model)
  const AREA = { attendance: 'Attendance', awards: 'Awards', given: 'Awards given', givenNoDate: 'Awards given', held: 'Awards', flags: 'Notes and flags', absences: 'Volunteer absences', doneBooks: 'Progress', doneReviews: 'Progress', received: 'Progress', adults: 'Adult awards', teamMoves: 'Team moves', games: 'Games', progress: 'Progress', progressNoDate: 'Progress', extraSheets: 'Progress', announcedNoDate: 'Awards', blueWings: 'Awards', blueOverrides: 'Awards', blueDrops: 'Awards', pastTurnout: 'Team balance history', handbooks: 'Handbook', config: 'Award lists & settings', roster: 'Roster', calendar: 'Calendar', rotation: 'Rotation' };
  const WHOLE = ['config', 'roster', 'calendar', 'rotation'];      // one history entry per area; the others are one per night or child
  const changeKey = c => { const k = c.p[0]; return WHOLE.includes(k) ? k : k + ':' + c.p[1]; };
  const keyOf = changes => [...new Set(changes.map(changeKey))].sort().join('|');
  const labelOf = changes => [...new Set(changes.map(changeKey))].sort().map(k => { const [a, x] = k.split(':'); return (a === 'flags' && /^b/.test(x || '') ? 'Bug reports' : AREA[a]) + (['attendance', 'awards', 'adults', 'games'].includes(a) ? ' ' + MDATE(x) : ''); }).join(', ');
  function record(s, before, opts) {
    const changes = diff(before, s); if (!changes.length) return null;
    const now = (opts && opts.now) || new Date().toISOString(), last = s.history[s.history.length - 1];
    // opts.prefix ("Undo", "Redo", a tab name) is put in front of the label; opts.separate keeps the entry on its own line (an undo, redo or applied draft is never folded into the edit before it).
    if (last && !last.tag && !(opts && opts.separate) && keyOf(last.changes) === keyOf(changes) && Date.parse(now) - Date.parse(last.t) <= MERGE_MINUTES * 60000) {
      last.changes = last.changes.concat(changes); last.t = now; return last;
    }
    const e = { t: now, label: opts && opts.label ? opts.label : (opts && opts.prefix ? opts.prefix + ': ' : '') + labelOf(changes), changes };      // opts.label: a name given by the caller (an import: "Planning Center import: <file>")
    s.history.push(e); return e;
  }
  // ---------- merging two people's saves ----------
  // Three-way merge for when someone else saved the shared data file while this copy was open. base = Season.snapshot() of the file as this copy opened it (or last saved it), ours = this copy now
  // (roster, calendar and rotation already synced in), theirs = the file as it is now. What this copy changed since base is replayed onto theirs, change by change, at the same paths:
  //   theirs still holds the base value  -> our change is applied
  //   theirs already holds our new value -> nothing to do (both did the same)
  //   theirs holds something else        -> a conflict: theirs is kept (what is already saved is never overwritten) and ours is listed so it can be redone by hand
  // A night or child removed on one side while the other side edited inside it is one conflict for the whole night or child, not one per mark.
  // The result is theirs plus ONE new history entry holding what was added (their log is left as it is, so History, restore and the file check still work); ours' own log entries are not copied.
  const getPath = (o, p) => { if (p.includes('__proto__')) return undefined; for (let i = 0; i < p.length; i++) { if (!isObj(o) && !Array.isArray(o)) return undefined; o = o[p[i]]; } return o; };
  function merge3(base, ours, theirs, opts) {
    const oursNow = snapshot(ours), mine = diff(base, oursNow), out = clone(theirs), before = snapshot(theirs), conflicts = []; let applied = 0, agreed = 0;
    const pkey = p => JSON.stringify(p), under = (p, q) => q.length <= p.length && q.every((k, i) => p[i] === k);
    // A section a file leaves out while empty (absences, extraSheets, blueWings...) opens as undefined, but the snapshot treats it as empty: without this, the first entry added on one copy looked like a whole section "removed" by theirs (CR-03).
    SECTIONS.forEach(k => { if (out[k] === undefined) out[k] = Array.isArray(oursNow[k]) ? [] : {}; });
    // diff() stops at the first place one side has nothing: a night or child removed here is ONE change at that place, so a removal is judged against what theirs holds there now (any edit inside keeps it).
    // Something theirs removed as a whole (a night, a child's entry) that this copy then edited inside: theirs stays removed, and what was edited is listed once.
    const lost = new Map();
    mine.forEach(c => { for (let i = 1; i < c.p.length; i++) { const q = c.p.slice(0, i); if (getPath(base, q) !== undefined && getPath(out, q) === undefined) { lost.set(pkey(q), q); break; } } });
    lost.forEach(q => conflicts.push({ path: q, ours: getPath(oursNow, q), theirs: undefined, base: getPath(base, q) }));
    // Both sides started the same new night, child or section: that is not a clash, so go inside it and judge each part (two leaders opening the same club night is the usual case).
    const queue = mine.filter(c => ![...lost.values()].some(q => under(c.p, q)));
    while (queue.length) {
      const c = queue.shift(), now = getPath(out, c.p);
      if (same(now, c.n)) agreed++;
      else if (same(now, c.o)) { setPath(out, c.p, c.n !== undefined, c.n); applied++; }
      else if (c.o === undefined && isObj(c.n) && isObj(now)) Object.keys(c.n).sort().forEach(k => queue.push({ p: c.p.concat(k), o: undefined, n: c.n[k] }));
      else conflicts.push({ path: c.p, ours: c.n, theirs: now, base: c.o });
    }
    if (applied) { const e = record(out, before, { separate: true, now: opts && opts.now, prefix: 'Merged' }); if (e) e.label = 'Merged' + (opts && opts.from ? ' (' + opts.from + ')' : '') + ': ' + labelOf(e.changes); }
    return { season: out, applied, agreed, conflicts, changed: mine.length };
  }
  // Season as it was after the first `index` log entries (0 = before any recorded change); out-of-range values are clamped.
  function at(s, index) {
    const n = Math.max(0, Math.min(s.history.length, index | 0)), r = clone(s);
    for (let i = s.history.length - 1; i >= n; i--) applyChanges(r, s.history[i].changes, true);
    r.history = clone(s.history.slice(0, n));
    return r;
  }
  // The places where the data differs from what its History replays to: undo every entry from the data, apply every entry forward, compare. [] = the History explains the data.
  // Each item is { p, o, n }: o is what the replay gives, n is the data. Empty History gives [].
  function replayDiff(s) {
    if (!(s.history || []).length) return [];
    const r = at(s, 0); s.history.forEach(e => applyChanges(r, e.changes, false));
    return diff(snapshot(r), snapshot(s));
  }
  // Record the places where the data differs from its History as one version, so the History explains the data again (a file an older release upgraded without logging it). Changes only `history`.
  // Returns how many places it recorded (0 = nothing to do, nothing pushed).
  function reconcile(s, now) {
    const d = replayDiff(s); if (!d.length) return 0;
    const changes = d.map(c => { const x = { p: c.p }; if (c.o !== undefined) x.o = c.o; if (c.n !== undefined) x.n = c.n; return x; });
    s.history.push({ t: now, label: 'Reconciled: History did not match the data (' + d.length + (d.length === 1 ? ' place)' : ' places)'), tag: 'Reconciled', changes });
    return d.length;
  }
  // Give version `index` (1 = first logged edit) a name; empty text removes it. A named version is never merged into.
  function tag(s, index, text) {
    const e = s.history[index - 1]; if (!e) throw new Error('No such version.');
    const name = String(text || '').trim(); if (name) e.tag = name; else delete e.tag;
  }
  // Gross restore: the season as of version `index` with every later entry deleted. The caller swaps it in.
  function restoreTo(s, index) {
    const season = at(s, index), gone = s.history.slice(season.history.length);
    return { season, dropped: { entries: gone.length, changes: gone.reduce((n, e) => n + e.changes.length, 0) } };
  }
  function compare(s, a, b) {
    const from = Math.max(0, Math.min(a, b, s.history.length)), to = Math.min(s.history.length, Math.max(a, b, 0));
    return { from, to, changes: diff(snapshot(at(s, from)), snapshot(at(s, to))) };
  }
  const kindOf = c => c.o === undefined ? 'add' : c.n === undefined ? 'del' : 'chg';
  const MARK_NAMES = { a: 'Present', h: 'Handbook', p: 'Participation', x: 'Extra', t: 'Team', g: 'Group' };      // g is the group stamp setMark writes beside a mark (UX-27: History used to print the raw key "g")
  function describe(c, nameOf) {
    const p = c.p, nm = id => (nameOf ? nameOf(id) : id), has = v => v !== undefined, val = has(c.n) ? c.n : c.o;
    const kids = n => n + ' ' + (n === 1 ? 'child' : 'children');
    const show = v => v === undefined ? '(none)' : Array.isArray(v) ? v.join(',') : isObj(v) ? JSON.stringify(v) : String(v);
    switch (p[0]) {
      case 'attendance':
        if (p.length === 4 && p[3] === 't') return nm(p[2]) + ' · played with ' + (has(c.n) ? c.n : 'the usual team') + ' on ' + MDATE(p[1]);
        if (p.length === 4) return nm(p[2]) + ' · ' + MARK_NAMES[p[3]] + ': ' + (has(c.n) ? 'marked' : 'cleared');
        if (p.length === 3) return nm(p[2]) + ' · ' + Object.keys(val).filter((k, i, all) => k !== 'g' || all.length === 1).map(k => MARK_NAMES[k] || k).join(', ') + ': ' + (has(c.n) ? 'marked' : 'cleared');
        return has(c.n) ? 'Night entered, ' + kids(Object.keys(c.n).length) + ' marked' : 'Night cleared, ' + kids(Object.keys(c.o).length);
      case 'awards':
        if (p.length === 3) {
          const o = c.o || [], n = c.n || [], add = n.filter(a => !o.includes(a)), rem = o.filter(a => !n.includes(a));
          return nm(p[2]) + ' · awards: ' + add.map(a => 'added ' + a).concat(rem.map(a => 'removed ' + a)).join(', ');
        }
        return (has(c.n) ? 'Awards entered for ' : 'Awards cleared for ') + kids(Object.keys(val).length);
      case 'given':
        if (p.length === 3) return nm(p[1]) + ' · ' + p[2] + ': ' + (has(c.n) ? 'given ' + MDATE(c.n) : 'no longer marked given');
        return nm(p[1]) + ' · awards given ' + (has(c.n) ? 'recorded' : 'cleared');
      case 'received':
        return nm(p[1]) + ' · ' + (p[2] ? p[2] + ' received: ' + (has(c.n) ? MDATE(c.n) : 'cleared') : 'received: ' + (has(c.n) ? Object.keys(c.n || {}).map(b => b + ' ' + MDATE(c.n[b])).join(', ') : 'cleared'));
      case 'doneBooks':
        return nm(p[1]) + ' · books finished before: ' + (has(c.n) ? (c.n || []).join(', ') : 'none');
      case 'doneReviews':
        return nm(p[1]) + ' · reviews finished before: ' + (has(c.n) ? (c.n || []).join(', ') : 'none');
      case 'absences': {
        const who = nm(p[1]);
        if (p.length === 2) return 'Volunteer absence ' + (has(c.n) ? 'changed' : 'cleared') + ': ' + who;
        if (p.length === 4) return who + ' · club night ' + p[3] + (has(c.n) ? ' absent' : ' no longer absent');
        return who + ' · absence ' + (has(c.n) ? 'added' : 'cleared');
      }
      case 'flags': {
        const f = has(c.n) ? c.n : c.o;
        // The words for a change under flags[id].replies: a reply added (with its text), changed or removed. Used for a bug report and for an ordinary note.
        const replyWords = () => { const one = x => isObj(x) && x.text !== undefined ? x : null; const r = p.length === 3 ? (isObj(f) ? Object.keys(f).map(k => one(f[k])).find(Boolean) : null) : p.length === 4 ? one(f) : null; return p.length >= 5 ? 'reply changed' : has(c.n) ? 'reply added' + (r ? ': ' + r.text : '') : 'reply removed'; };
        if (/^b/.test(String(p[1] || ''))) {      // a bug report (id starts with b)
          if (p.length === 2 && isObj(f)) return 'Bug report · ' + (has(c.n) ? 'added' : 'deleted') + ': ' + (f.note || '');
          if (p[2] === 'status') return 'Bug report · status: ' + (has(c.n) ? c.n : 'cleared');
          if (p[2] === 'replies') return 'Bug report · ' + replyWords();
          if (p[2] === 'reply') return 'Bug report · ' + (has(c.n) ? 'reply written: ' + c.n : 'reply removed');
          if (p[2] === 'replyAt') return 'Bug report · reply dated ' + (has(c.n) ? MDATE(c.n) : 'removed');
          return 'Bug report · changed';
        }
        if (p[2] === 'replies') return 'Notes and flags · ' + replyWords();
        if (p[2] === 'hidden') return 'Notes and flags · ' + (has(c.n) ? 'hidden from To do' : 'shown on To do again');
        if (p.length === 2 && isObj(f)) return (f.kid ? nm(f.kid) : 'Note') + ' · ' + (has(c.n) ? (f.kid ? 'flagged' : 'added') : (f.kid ? 'flag cleared' : 'cleared')) + ': ' + (f.note || '');
        return 'Notes and flags ' + (has(c.n) ? 'changed' : 'cleared');
      }
      case 'held':
        return nm(p[1]) + ' · held off the slides: ' + (has(c.n) ? (p.length === 3 ? p[2] : Object.keys(c.n || {}).join(', ')) : 'none');
      case 'givenNoDate':
        return nm(p[1]) + ' · awards given, no date: ' + (has(c.n) ? (c.n || []).join(', ') : 'none');
      case 'games':
        if (p.length === 4) return p[2] + ' ' + p[3] + ': ' + (has(c.n) ? [c.n.place ? 'place ' + c.n.place : '', c.n.spirit !== undefined ? 'spirit ' + c.n.spirit : ''].filter(Boolean).join(', ') : 'result cleared');
        return 'Game results ' + (has(c.n) ? 'entered' : 'cleared');
      case 'progress':
        if (p.length === 4) return nm(p[1]) + ' · ' + p[2] + ' ' + p[3] + ': ' + (has(c.n) ? c.n : 'cleared');
        return nm(p[1]) + ' · progress ' + (has(c.n) ? 'entered' : 'cleared');
      case 'teamMoves': {
        const o = c.o || [], n = c.n || [], key = m => m.q + m.from + m.team, f = m => m.team + ' from ' + MDATE(m.from) + ' (' + m.q + ')';
        const add = n.filter(m => !o.some(x => key(x) === key(m))), rem = o.filter(m => !n.some(x => key(x) === key(m)));
        return nm(p[1]) + ' · team: ' + add.map(m => 'moved to ' + f(m)).concat(rem.map(m => 'move removed (' + f(m) + ')')).join(', ');
      }
      case 'progressNoDate': case 'announcedNoDate': case 'extraSheets': case 'blueDrops': case 'blueOverrides': case 'blueWings': case 'pastTurnout': {
        // lists kept per child: say what was added and what was taken off
        const what = { progressNoDate: 'sign-offs marked with no date', announcedNoDate: 'told to the group, no date', extraSheets: 'sheets added', blueDrops: 'Blue Jewels dropped', blueOverrides: 'Blue Jewels given by hand', blueWings: 'Blue Jewel wings from earlier years', pastTurnout: 'attendance counts from earlier years' }[p[0]];
        const item = x => !isObj(x) ? String(x) : p[0] === 'blueOverrides' ? (x.book || '') + ' slot ' + x.n + (x.date ? ' (' + MDATE(x.date) + ')' : '') : p[0] === 'blueWings' ? (x.book || '') + ' slot ' + x.slot : p[0] === 'pastTurnout' ? (x.year || '') + ': ' + x.came + ' of ' + x.nights + ' nights' : JSON.stringify(x);
        const flat = v => has(v) ? (Array.isArray(v) ? v : isObj(v) ? [].concat(...Object.keys(v).map(k => Array.isArray(v[k]) ? v[k].map(i => k + ' ' + i) : [k])) : [v]) : [];
        const o = flat(c.o).map(item), n = flat(c.n).map(item), add = n.filter(a => !o.includes(a)), rem = o.filter(a => !n.includes(a));
        const book = p[0] === 'progressNoDate' && p[2] ? p[2] + ' ' : '';
        return nm(p[1]) + ' · ' + what + ': ' + (add.length || rem.length ? add.map(a => 'added ' + book + a).concat(rem.map(a => 'removed ' + book + a)).join(', ') : 'changed');
      }
      case 'handbooks':
        return nm(p[1]) + ' · handbook: ' + (has(c.n) ? (has(c.o) ? c.o + ' → ' : '') + c.n : 'cleared');
      case 'roster': {
        if (p[1] === 'pcAsOf') return 'Planning Center data now as of ' + show(c.n) + ' (was ' + show(c.o) + ')';
        if (p[1] === 'pcExport') {      // the kept export record (R17)
          const sum = x => isObj(x) ? 'Planning Center export kept: ' + (x.rows || 0) + ' rows (' + (Array.isArray(x.loose) ? x.loose.length : 0) + ' belong to nobody, ' + (x.blankRows || 0) + ' blank)' : 'Planning Center export record changed';
          if (p.length === 2) return has(c.n) ? sum(c.n) : 'Planning Center export record removed';
          if (p[2] === 'ids' && p.length === 4) return nm(p[3]) + (has(c.n) ? ' is in this Planning Center export' : ' is no longer in the Planning Center export');
          if (p[2] === 'ids') return 'Planning Center export: the people in it changed';
          return 'Planning Center export record: ' + p[2] + ' changed';
        }
        if (p[1] !== 'people') return 'Roster columns changed';
        if (p.length === 3) return nm(p[2]) + (has(c.n) ? ' added to the roster' : ' removed from the roster');
        if (p[3] === 'pc') return nm(p[2]) + ' · ' + p[4] + ' (from Planning Center): ' + show(c.o) + ' → ' + show(c.n);
        const col = p[4] || '';
        return nm(p[2]) + ' · ' + (col.startsWith('ov:') ? 'pending Planning Center change to ' + col.slice(3) : col) + ': ' + show(c.o) + ' → ' + show(c.n);
      }
      case 'calendar': {
        const o = c.o || [], n = c.n || [], inO = new Set(o.map(r => JSON.stringify(r))), inN = new Set(n.map(r => JSON.stringify(r)));
        const add = n.filter(r => !inO.has(JSON.stringify(r))).length, gone = o.filter(r => !inN.has(JSON.stringify(r))).length;
        return 'Calendar edited: ' + add + ' row' + (add === 1 ? '' : 's') + ' added or changed, ' + gone + ' removed or changed (' + n.length + ' rows now)';
      }
      case 'rotation': return 'Rotation edited';
      case 'config':
        if (p[1] === 'clubDay' && p.length === 2) { const D = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']; return 'Club day changed from ' + D[c.o] + ' to ' + D[c.n]; }
        if (p[1] === 'teamPlan') {      // the color team plan: locks, the projected colors, the balancing priorities (teamplan.js)
          const obj = v => (isObj(v) ? v : {}), same2 = (x, y) => JSON.stringify(x || {}) === JSON.stringify(y || {});
          const locks = v => (p.length === 2 ? Object.keys(obj(obj(v).locked)) : p[2] === 'locked' ? (p.length === 3 ? Object.keys(obj(v)) : has(v) ? [p[3]] : []) : []);
          const added = locks(c.n).filter(q => !locks(c.o).includes(q)), gone = locks(c.o).filter(q => !locks(c.n).includes(q)), bits = added.map(q => 'Locked ' + q).concat(gone.map(q => 'Unlocked ' + q));
          if (p.length === 2) { if (!same2(obj(c.o).proj, obj(c.n).proj)) bits.push('team projection updated'); if (!same2(obj(c.o).prio, obj(c.n).prio)) bits.push('balancing priorities changed'); }
          if (p[2] === 'proj' && p.length > 3) return 'Team projection for ' + nm(p[3]) + ': ' + show(c.o) + ' → ' + show(c.n);
          if (p[2] === 'proj') return 'Team projection updated';
          if (p[2] === 'prio') return 'Team balancing priorities changed';
          return bits.length ? bits.join(', ') : 'Color team plan changed';
        }
        return 'Setting ' + p.slice(1).join(' › ') + ': ' + show(c.o) + ' → ' + show(c.n);
      default:
        return 'Setting ' + p.slice(1).join(' › ') + ': ' + show(c.o) + ' → ' + show(c.n);
    }
  }

  // Every data file name ends in a local yyyymmdd-hhmmss tag: awana-2026-27-20261029-070509.json
  function fileName(year, now, kind) {
    const d = now || new Date(), z = (n, w) => String(n).padStart(w || 2, '0');
    return 'awana-' + (year || 'file') + (kind ? '-' + kind : '') + '-' + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes()) + z(d.getSeconds()) + '.json';
  }
  // Which of several data files is the newest: the last edit in its history, then the time in its name (awana-<year>-yyyymmdd-hhmmss.json), then the file's own date.
  // items: [{ name, text, lastModified }]  ->  { keep, skipped }
  function newest(items) {
    const key = it => {
      let hist = 0;
      try { const h = JSON.parse(String(it.text).replace(/^\uFEFF/, '')).history; if (Array.isArray(h) && h.length) hist = Date.parse(h[h.length - 1].t) || 0; } catch (e) { /* not readable: the name and file date decide */ }
      const tag = /-(\d{8})-(\d{6})\.json$/i.exec(it.name || '');
      return [hist, tag ? tag[1] + tag[2] : '', it.lastModified || 0];
    };
    const cmp = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; return 0; };
    const keys = new Map(items.map(it => [it, key(it)]));
    const keep = items.reduce((best, it) => (!best || cmp(keys.get(it), keys.get(best)) > 0 ? it : best), null);
    return { keep, skipped: items.filter(it => it !== keep) };
  }
  const api = { SECTIONS, KNOWN_TOP, nightStatus, volunteerNights, volunteerExpected, addAbsence, clearAbsenceNights, clearAbsence, absenceList, FLAG_LEVELS, FLAG_NO_KID, shiftDates, freshenFake, FORMAT, VERSION, fileName, MARKS, QUARTERS, TEAMS, blank, toJson, fromJson, isRealDate, badDates, guessDate, dateClashes, fixDates, newSeason, turnoutCounts, addPastYear, addEarlierYear, seasonStart, sectionsThisSeason, defaultYear, setMark, hasNight, heldNights, newest, totals, classificationRecords, recordedNightActivity, isQuarterNight, blueJewelRequirements, blueJewels,
    booksStarted, toHandOut, jewelWaitsForWing, addFlagReply, orphanHandbook, setHandbook, noDateBookKids, oddballs, fixOddball, readableCopy, setFlagReply, removeFlagReply, teamOrder, setTeamOrder, DEFAULT_TEAM_ORDER, YEAR_BOOK_GROUPS, SPARKS_BOOKS, usesYearBook, bookGroup, hasProgress, yearBook, setYearBook, setBookOrder, setSparksBooks, setCubbiesDetail, bookOrder, sheetsOf, progressTabBooks, movesOf, setTeamMove, removeTeamMove, setNightTeam, teamOn, quarterColor, teamResolver, setGame, teamPoints, kidGamePoints, colorHistory, teamStory, standings, addAward, removeAward, announce, setAnnounced, pendingAwards, slidePending, awardLedger, earnedAwards, isEndOfYear, assumedGiven, clearAssumedGiven, awardsOf, setGiven, waitingToGive, parseHandbook, bookCode, handbookParts, formatHandbook, setHandbook, bookKey, tidyHandbookCodes, handbookCounts,
    setProgress, addExtraSheet, blueWingPlan, sparkJewels, heldGems, grantBlue, dropBlue, isAnnNoDate, setAnnNoDate, noDateSigns, isSignNoDate, signShown, signsShown, unsignedIn, markSignsNoDate, baseAward, jewelName, awardLabel, childBook, sparksCurrent, receivedOf, receivedShown, isReceivedNoDate, setReceived, completedBlocks, finishedBooks, bookStatus, bookTabStatus, completionAwards, setBookDone, reviewsDoneBefore, setReviewsDone, suggestedAwards, firstNight, pastYearAwards, markPastYearsGiven, counted,
    normDriveDirs, isGivenNoDate, givenShown, isHeld, setHold, addFlag, setFlagNote, clearFlag, setFlagHidden, isFlagHidden, todoNotes, notAnAward, NOT_AWARDS, upgradeNotAwards, setBugStatus, addBugReply, removeBugReply, bugThread, bugStatusOf, BUG_STATUS, BUG_BY, noteList, bugList, flagList, flagsOf, flagsAt, flagsAtPlace, renameAward, snapshot, diff, merge3, applyChanges, record, labelOf, at, replayDiff, reconcile, tag, restoreTo, compare, kindOf, describe, MERGE_MINUTES };
  // BEGIN PLAYTEST
  api.graceDates = graceDates;
  // END PLAYTEST
  if (typeof module !== 'undefined') module.exports = api; else root.Season = api;
})(this);
