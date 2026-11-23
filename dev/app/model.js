(this.AwanaVersions = this.AwanaVersions || {})['model.js'] = '1.10.6';
// Roster data model: Planning Center import/merge, plus the roster section of the data JSON.
//
// The Planning Center export is the only CSV and is read-only input. Everything you own (colors, uniforms, notes, pending
// Planning Center changes, people added by hand) is saved in the data JSON keyed by the frozen x_ClubberID (toRoster /
// fromRoster), together with the full Planning Center record as of the last import (pcAsOf / pcSource), so the JSON alone
// can run every report. A newer export refreshes that copy; Planning Center fields are never edited here.
//
// Column ownership
//   PC-owned    every column that is not user-owned; refreshed from each Planning Center export.
//   user-owned  x_*, ov:*, team:*, att:*, prog:*, award:*; never touched by an import.
//   ov:<Col>    pending Planning Center change: the value you want <Col> to have. PC columns are never edited
//               here; the ov: value shows in reports until a later export matches it, then it clears itself.
(function (root) {
  const Csv = root.Csv || (typeof require !== 'undefined' ? require('./csv.js') : null);

  const C = {
    REG: 'Registration ID', FIRST: 'First Name', LAST: 'Last Name', GRADE: 'Grade',
    BDAY: 'Birthdate', MED: 'Medical Notes', ROOM: 'Assignment Area: Classes',
    SELECTION: 'Selection', EMERG: 'Emergency Contact', GENDER: 'Gender', PARENT_PHONE: 'Please provide the primary phone number for a parent.',
    ALLERGY: 'Does your child have any allergies or medical conditions that we should be made aware of?',
    SHIRT: 'If you are purchasing a Awana shirt, please provide size.',
    CUB_VEST: 'Cubbies Vest', SPARKS_VEST: 'Sparks Vest', TNT_SHIRT: 'T&T shirt',
    UNIFORM: 'Uniform',      // from next year's form: one column saying the family ordered and paid for a uniform (no size, no program)
  };
  const X = { ID: 'x_ClubberID', ACTIVE: 'x_Active', INACTIVE_BY: 'x_InactiveBy', NOPHOTOS: 'x_NoPhotos', NOTES: 'x_Notes', FIRST_SEEN: 'x_FirstSeen', LAST_SEEN: 'x_LastSeen', EMERG_PHONE: 'x_EmergencyPhone' };      // EMERG_PHONE: the club's chosen emergency phone (a number from the record, or one typed in). Never sent to Planning Center.
  // Uniform tracking: PC says who ordered a vest/shirt (flag columns) and what they paid; these record the rest.
  const UNI = { SIZE_VERIFIED: 'x_Uni_SizeVerified', ORDERED: 'x_Uni_OrderedDate', SIZE_ORDERED: 'x_Uni_SizeOrdered',
    RECEIVED: 'x_Uni_ReceivedDate', GIVEN: 'x_Uni_GivenDate', GIVEN_FLAG: 'x_Uni_GivenFlag', SIZE_GIVEN: 'x_Uni_SizeGiven', NOTES: 'x_Uni_Notes' };
  // Given out: a date, or the box ticked when it was handed over but nobody wrote down when (either one counts).
  function uniHasGivenDate(p) {
    const value = p[UNI.GIVEN];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function setUniformField(p, col, value) {
    const hadDate = col === UNI.GIVEN && uniHasGivenDate(p);
    p[col] = value;
    if (hadDate || ((col === UNI.GIVEN || col === UNI.GIVEN_FLAG) && uniHasGivenDate(p))) p[UNI.GIVEN_FLAG] = '';
  }
  const uniGiven = p => !!(p[UNI.GIVEN] || p[UNI.GIVEN_FLAG]);
  // Later steps settle earlier ones: a uniform given out (a date, or the no-date box) needs no order and no receive date; one received needs no order date.
  const uniToOrder = p => !p[UNI.ORDERED] && !p[UNI.RECEIVED] && !uniGiven(p);
  const uniToReceive = p => !p[UNI.RECEIVED] && !uniGiven(p);
  const BASE_USER_COLS = [X.ID, X.ACTIVE, X.NOPHOTOS, X.NOTES, X.FIRST_SEEN, X.LAST_SEEN, X.EMERG_PHONE].concat(Object.values(UNI));
  const USER_RE = /^(x_|ov:|team:|att:|prog:|award:)/;
  const isUserCol = c => USER_RE.test(c);

  const ROOM_ORDER = ['Puggles', 'Cubbies', 'Sparks A', 'Sparks B', 'Sparks C', 'Sparks D',
    'T&T Boys (Group A)', 'T&T Boys (Group B)', 'T&T Girls (Group A)', 'T&T Girls (Group B)', 'Volunteers'];
  // Money columns are Planning Center's business: the values stay in the data file (refreshed with every import) but the app does not show them, ask about them or report them as changed.
  const HIDDEN_COLS = ['Balance Due', 'Attendee Balance Due', 'Registration Amount Paid'];
  const IMPORTANT_COLS = [C.FIRST, C.LAST, C.ROOM, C.GRADE, C.MED, C.ALLERGY, C.EMERG, C.SELECTION, C.BDAY];

  // Planning Center has spelled the program both "T&T" and "TnT" across exports; treat them as one.
  const canon = s => String(s == null ? '' : s).replace(/\bTnT\b/gi, 'T&T');
  const HEADER_ALIAS = { 'TnT shirt': 'T&T shirt' };
  // ---------- what the app reads from a Planning Center export ----------
  // Next year's export may rename, drop or add columns (a new uniform item, a reworded question). Each thing the app reads is a ROLE with the column that normally fills it; when that column
  // is not there, a column that matches the role's pattern is used in its place if there is exactly one (and the change is reported), and otherwise the gap is reported with what it affects.
  // Nothing is ever guessed silently, and a role that cannot be filled never stops the import: everything else still works.
  const PC_ROLES = [
    { col: C.FIRST, level: 'required', alias: /^first\s*name$/i, what: 'first names', effect: 'The export cannot be read without it.' },
    { col: C.LAST, level: 'required', alias: /^last\s*name$/i, what: 'last names', effect: 'The export cannot be read without it.' },
    { col: C.REG, level: 'core', alias: /^registration\s*(id|number|#)$/i, what: 'the registration id', effect: 'Children are matched between exports by registration id plus name; without it only by name, so two children with the same name cannot be told apart and a renamed child looks new.' },
    { col: C.ROOM, level: 'core', alias: /assignment|^class(es)?\b|^room|classes?$/i, what: 'the class', effect: 'Every child shows as Unassigned until given a class by hand (To do: Assign a class), and color teams, attendance rooms and group points depend on the class.' },
    { col: C.GRADE, level: 'core', alias: /^(school\s*)?grade$/i, what: 'the grade', effect: 'The class-fit check and the suggested group cannot work, and every child is listed on the To do tab as missing a grade.' },
    { col: C.BDAY, level: 'core', alias: /birth\s*date|date\s*of\s*birth|^dob$/i, what: 'the birthdate', effect: 'Ages and birthdays are blank and every child is listed on the To do tab as missing a birthdate.' },
    { col: C.SELECTION, level: 'core', alias: /^selection$|registration\s*(type|selection)/i, what: 'the registration selection', effect: 'Volunteers can no longer be told from children by their registration (the Volunteers class still works), and the suggested group cannot use it.' },
    { col: C.EMERG, level: 'core', alias: /emergency/i, what: 'the emergency contact', effect: 'Emergency contact sheets are blank and every child is listed on the To do tab as missing one.' },
    { col: C.MED, level: 'core', alias: /^medical(\s*notes)?$/i, what: 'medical notes', effect: 'Medical notes are not shown or printed.' },
    { col: C.ALLERGY, level: 'core', alias: /allerg/i, what: 'the allergy question', effect: 'Allergy answers are not shown or printed, and a no-photos request in them is not noticed.' },
    { col: C.GENDER, level: 'minor', alias: /^(gender|sex)$/i, what: 'gender', effect: 'Gender is not shown.' },
    // A uniform: next year's form has ONE column (anything but blank or No means the family ordered and paid); the older form had a column per program and a size question. Either is read; neither is required.
    { col: C.UNIFORM, level: 'uniformany', alias: /^(?!.*size)(?=.*(uniform|vest|shirt|polo))/i, what: 'the uniform order', effect: 'No column says who wants a uniform, so the Uniforms tab will be empty. The app looks for a column with \u201cuniform\u201d (or \u201cvest\u201d, \u201cshirt\u201d) in its name, or the older Cubbies Vest, Sparks Vest and T&T shirt columns.' },
    { col: C.CUB_VEST, level: 'legacy', alias: /cubbies?.*vest/i, what: 'the Cubbies vest order', effect: '' },
    { col: C.SPARKS_VEST, level: 'legacy', alias: /sparks?.*vest/i, what: 'the Sparks vest order', effect: '' },
    { col: C.TNT_SHIRT, level: 'legacy', alias: /(t&t|tnt|t\s*and\s*t).*(t-?shirt|shirt|jersey)/i, what: 'the T&T shirt order', effect: '' },
    { col: C.SHIRT, level: 'legacy', alias: /awana\s*shirt|shirt\s*size/i, what: 'the parent\u2019s shirt size', effect: '' },
  ];
  // Every column of the export as it was when the app was built. A column that is in neither this list nor a role is NEW: kept with each child (the Roster\u2019s All fields) but not used.
  const PC_KNOWN = ['Registration ID', 'First Name', 'Last Name', 'Grade', 'Birthdate', 'Age', 'Gender', 'Medical Notes', 'Mobile Phone Number', 'Home Phone Number', 'Work Phone Number', 'Other Phone Number', 'Home Email Address', 'Work Email Address', 'Other Email Address', 'Home Address Street', 'Home Address City', 'Home Address State', 'Home Address Zip', 'Registration Contact First Name', 'Registration Contact Last Name', 'Registration Contact Phone Number', 'Registration Contact Address', 'Registration Contact Home Email Address', 'Registration Contact Work Email Address', 'Registration Contact Other Email Address', 'Selection', 'Status', 'Submitted', 'Registration Cost', 'Emergency Contact', 'Attendee Balance Due', 'Registration Amount Paid', 'Balance Due', 'Attendance Status', 'Times Attended', 'Paid by Check', 'Paid by Credit', 'Paid by Cash', 'Paid by Other', 'Paid by Scholarships', 'Paid by ACH', 'Discount Name', 'Discount Type', 'Discount Amount', C.ALLERGY, 'Please list the names of ALL adults with permission to pick up your child.', 'Please provide the primary phone number for a parent.', C.SHIRT, C.CUB_VEST, C.SPARKS_VEST, C.TNT_SHIRT, C.ROOM];
  const LOOKS_LIKE_UNIFORM = /vest|shirt|uniform|jersey|polo|hoodie|jacket|sweatshirt|t-?shirt|\bsize\b|\bcap\b|\bhat\b|bandana|belt|medal|handbook|book\b/i;
  // Which of the export's columns fill which role: { map: Map(columnAsExported -> role column), ambiguous: Map(role column -> [candidates]) }.
  function roleMap(cols) {
    const have = new Set(cols), map = new Map(), ambiguous = new Map(), taken = new Set(PC_ROLES.map(r => r.col).concat(PC_KNOWN));
    const oldForm = [C.CUB_VEST, C.SPARKS_VEST, C.TNT_SHIRT].some(c => have.has(c));      // the older per-program columns are there: a new uniform-looking column is flagged, not taken for the order
    PC_ROLES.forEach(r => {
      if (have.has(r.col) || (r.col === C.UNIFORM && oldForm)) return;
      const cand = cols.filter(c => !taken.has(c) && !map.has(c) && r.alias.test(c.trim()));
      if (cand.length === 1) map.set(cand[0], r.col); else if (cand.length > 1) ambiguous.set(r.col, cand);
    });
    return { map, ambiguous };
  }
  function normalizePc(pc) {
    const ren0 = c => HEADER_ALIAS[c] || c, cols0 = pc.cols.map(ren0), { map } = roleMap(cols0), ren = c => map.get(ren0(c)) || ren0(c);
    return { cols: pc.cols.map(ren), records: pc.records.map(r => { const o = {}; Object.keys(r).forEach(k => { o[ren(k)] = r[k]; }); return o; }), renamed: [...map].map(([from, to]) => ({ from, to })) };
  }
  // Read a Planning Center export with nothing dropped (R17). `header` is what the export said, cell for cell; `names` is the key each column's values are stored under:
  // trimmed; a blank header, and every cell position past the header, is "(no header N)" (N = the column's position, from 1); a repeat gets " (2)", " (3)"; the app's own renames
  // (HEADER_ALIAS and the roles, as normalizePc does); then a name this app uses for its own data (x_, ov:, team:, att:, prog:, award:) is stored as "pc:<name>" so it can never overwrite
  // the club's value. `records[i]` is keyed by names; `cells[i]` is the same row as a list in names order; `blankRows` counts rows with every cell empty. An extended CSV saved by this app
  // (it has an x_ClubberID column) keeps its club columns as they are.
  function readExport(text) {
    const t = Csv.toTable(Csv.parse(text)), header = t.header, width = t.body.reduce((w, r) => Math.max(w, r.length), header.length), club = header.some(h => String(h).trim() === X.ID);
    const seen = {}, base = [];
    for (let i = 0; i < width; i++) {
      let h = i < header.length ? String(header[i]).trim() : ''; if (h === '') h = '(no header ' + (i + 1) + ')';
      if (seen[h] == null) { seen[h] = 1; base.push(h); } else { seen[h]++; base.push(h + ' (' + seen[h] + ')'); }
    }
    const reportCols = base.map(n => (!club && isUserCol(n) ? 'pc:' + n : n));      // the names as exported (so columnReport can say "read as"), with a club-like name already shown as it will be stored
    const norm = normalizePc({ cols: base, records: [] }), renamed = norm.renamed.slice(), used = new Set();
    const names = norm.cols.map(n => {
      if (!club && isUserCol(n)) { renamed.push({ from: n, to: 'pc:' + n }); n = 'pc:' + n; }
      let k = n, i = 1; while (used.has(k)) k = n + ' (' + (++i) + ')'; used.add(k); return k;
    });
    const cells = t.body.map(r => names.map((n, i) => r[i] == null ? '' : r[i])), records = cells.map(r => { const o = {}; names.forEach((n, i) => { o[n] = r[i]; }); return o; });
    return { header, names, cols: names, reportCols, records, cells, blankRows: t.blankRows, rows: records.length + t.blankRows, renamed };
  }
  // What is wrong with an export's columns, for the person to read: [{ level: 'error'|'warn'|'info', col, text }]. Give it the header as exported (it also reports what was renamed) or a loaded roster's columns.
  function columnReport(cols) {
    const out = [], c0 = cols.map(c => HEADER_ALIAS[c] || c), { map, ambiguous } = roleMap(c0), now = new Set(c0.map(c => map.get(c) || c));
    map.forEach((to, from) => out.push({ level: 'info', col: to, text: 'The column \u201c' + from.trim() + '\u201d was read as \u201c' + to + '\u201d (' + PC_ROLES.find(r => r.col === to).what + '). Check that is right.' }));
    const orderCols = [C.UNIFORM, C.CUB_VEST, C.SPARKS_VEST, C.TNT_SHIRT];      // any one of these says who wants a uniform; the others (and the parent size question) are optional
    PC_ROLES.filter(r => !now.has(r.col) && r.level !== 'legacy' && !(r.level === 'uniformany' && orderCols.some(c => now.has(c)))).forEach(r => {
      const amb = ambiguous.get(r.col);
      out.push({ level: r.level === 'required' ? 'error' : r.level === 'minor' ? 'info' : 'warn', col: r.col,
        text: 'There is no \u201c' + r.col + '\u201d column (' + r.what + ')' + (amb ? ', and more than one column could be it (' + amb.map(c => '\u201c' + c.trim() + '\u201d').join(', ') + '), so none was used' : '') + '. ' + r.effect });
    });
    c0.forEach(c => { const t = c.trim(), bare = /^pc:/.test(t) ? t.slice(3) : ''; if (bare && isUserCol(bare)) out.push({ level: 'info', col: 'pc:' + bare, text: 'The export has a column named “' + bare + '”, which is a name this app uses for its own data; it is kept as “pc:' + bare + '” and the club’s own value is never touched.' }); });      // (R17)
    const fresh = c0.map(c => map.get(c) || c).filter(c => !PC_KNOWN.includes(c) && !PC_ROLES.some(r => r.col === c) && !isUserCol(c) && !c.startsWith('ov:'));
    fresh.filter(c => LOOKS_LIKE_UNIFORM.test(c)).forEach(c => out.push({ level: 'warn', col: c, text: 'New column \u201c' + c.trim() + '\u201d looks like a uniform item or a size question. The app tracks only the Cubbies vest, Sparks vest and T&T shirt orders, so this one is kept with each child (Roster, All fields) but not tracked on the Uniforms tab.' }));
    const other = fresh.filter(c => !LOOKS_LIKE_UNIFORM.test(c));
    if (other.length) out.push({ level: 'info', col: other[0], text: other.length + ' new column' + (other.length === 1 ? '' : 's') + ' since this app was built (' + other.slice(0, 6).map(c => '\u201c' + c.trim().slice(0, 60) + '\u201d').join(', ') + (other.length > 6 ? ', and ' + (other.length - 6) + ' more' : '') + '): kept with each child, not used by the app.' });
    return out;
  }
  // Accents are dropped first (Zoë = Zoe), or "José" and "Jos" would look the same and a spelling fix in Planning Center would look like a different person.
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const trim = s => String(s == null ? '' : s).trim();
  const matchKey = r => trim(r[C.REG]) + '|' + norm(r[C.LAST]) + '|' + norm(r[C.FIRST]);
  const nameKey = r => norm(r[C.LAST]) + '|' + norm(r[C.FIRST]);

  function eff(p, col) {
    const o = p['ov:' + col];
    return canon(o !== undefined && o !== '' ? o : (p[col] == null ? '' : p[col]));
  }
  // The phone number in the Emergency Contact box ("Name - phone"): '' unless it holds at least 7 digits. A name alone is not a contact number.
  function emergencyPhone(p) {
    const raw = String(eff(p, C.EMERG) || '').trim(), i = raw.lastIndexOf(' - '), v = i < 0 ? '' : raw.slice(i + 3).trim();
    return (v.match(/\d/g) || []).length >= 7 ? v : '';
  }
  // A phone is only a phone when it holds at least 7 digits: "N/A", "same" or "12" are not numbers (CR-02). One rule for To do, the binders and the Person tab.
  const hasPhoneDigits = v => (String(v == null ? '' : v).match(/\d/g) || []).length >= 7;
  const parentPhone = p => { const v = String(eff(p, C.PARENT_PHONE) || '').trim(); return hasPhoneDigits(v) ? v : ''; };      // the registration's "primary phone number for a parent"
  const regContactPhone = p => { const v = String(eff(p, 'Registration Contact Phone Number') || '').trim(); return hasPhoneDigits(v) ? v : ''; };
  // The club's chosen emergency phone (see X.EMERG_PHONE), '' when none is chosen. It is used only while the Emergency Contact box has no phone number: once that box holds a number, the registration's numbers are used and the choice is not shown or printed (it is kept, so it comes back if the number is removed).
  function clubPhone(p) {
    if (emergencyPhone(p)) return '';
    const v = String(p[X.EMERG_PHONE] == null ? '' : p[X.EMERG_PHONE]).trim();
    return hasPhoneDigits(v) ? v : '';
  }

  // Marking someone active or inactive by hand (Roster, Person). The import only brings back people it deactivated itself, so a hand change forgets who deactivated.
  function setActive(p, on) { p[X.ACTIVE] = on ? '1' : '0'; delete p[X.INACTIVE_BY]; }

  function setField(p, col, value) {
    if (isUserCol(col)) { p[col] = value; return; }
    // Setting a PC field back to its PC value clears the override.
    if (canon(value) === canon(p[col] || '')) delete p['ov:' + col]; else p['ov:' + col] = value;
  }

  // ---------- master construction / (de)serialization ----------
  function emptyMaster() { return { pcCols: [], userCols: BASE_USER_COLS.slice(), people: [] }; }

  function splitCols(cols) {
    const pcCols = cols.filter(c => !isUserCol(c));
    const userCols = cols.filter(isUserCol);
    BASE_USER_COLS.forEach(c => { if (!userCols.includes(c)) userCols.push(c); });
    return { pcCols, userCols };
  }

  function photoRequest(text) {
    return /\b(no\s*(photo|pic)|(photo|picture|pic)s?\s*(please|release)?\s*(no|not)\b|(photos?|pictures?|pics?)\s+please)/i.test(text) ||
      /\bno\s+(photos?|pics?|pictures?)\b/i.test(text);
  }

  function seedPerson(p, today) {
    p[X.ACTIVE] = p[X.ACTIVE] || '1';
    BASE_USER_COLS.forEach(c => { if (p[c] === undefined) p[c] = ''; });
    p[X.FIRST_SEEN] = p[X.FIRST_SEEN] || today;
    p[X.LAST_SEEN] = p[X.LAST_SEEN] || today;
    if (p[X.NOPHOTOS] === undefined || p[X.NOPHOTOS] === '') {
      p[X.NOPHOTOS] = photoRequest([p[C.MED], p[C.ALLERGY]].join(' ; ')) ? '1' : '';
    }
  }

  function freshId(master, rec) {
    const base = [trim(rec[C.REG]), trim(rec[C.FIRST]), trim(rec[C.LAST])].join('_');   // same as the Sheet's Unique ID
    const used = new Set(master.people.map(p => p[X.ID]));
    let id = base, n = 1;
    while (used.has(id)) id = base + '#' + (++n);
    return id;
  }

  // Parse either a Planning Center export or a previously saved extended CSV.
  function loadMaster(text, today) {
    const { cols, records, renamed } = readExport(text);
    if (!cols.includes(C.FIRST) || !cols.includes(C.LAST)) throw new Error('Not a roster CSV: missing First Name / Last Name columns.');
    const { pcCols, userCols } = splitCols(cols);
    const master = { pcCols, userCols, people: [], pcRenamed: renamed };
    records.forEach(r => {
      const p = Object.assign({}, r);
      if (!p[X.ID]) p[X.ID] = freshId(master, p);
      seedPerson(p, today);
      master.people.push(p);
    });
    return master;
  }

  function toRows(master) {
    const cols = master.pcCols.concat(master.userCols);
    return [cols].concat(master.people.map(p => cols.map(c => p[c] == null ? '' : p[c])));
  }
  function toCsv(master) { return Csv.serialize(toRows(master), true); }

  function addUserCol(master, col) {
    if (!master.pcCols.includes(col) && !master.userCols.includes(col)) master.userCols.push(col);
  }

  // ---------- import planning ----------
  function lev(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  function similarity(a, b) {
    a = norm(a); b = norm(b);
    const L = Math.max(a.length, b.length);
    return L ? 1 - lev(a, b) / L : 1;
  }
  const pcName = p => (p[C.FIRST] || '') + ' ' + (p[C.LAST] || '');

  // Compare a new Planning Center export to the master without changing it.
  function planImport(master, pc) {
    pc = normalizePc(pc);
    const index = new Map();
    master.people.forEach(p => {
      const k = matchKey(p);
      if (!index.has(k)) index.set(k, []);
      index.get(k).push(p);
    });
    const used = new Set(), matched = [], fresh = [];
    pc.records.forEach(rec => {
      const hit = (index.get(matchKey(rec)) || []).find(p => !used.has(p));
      if (hit) { used.add(hit); matched.push({ person: hit, rec }); } else fresh.push(rec);
    });
    // People added by hand have no Planning Center row to be missing from.
    const byHand = p => trim(p[C.REG]) === 'manual';
    const missing = master.people.filter(p => !used.has(p) && p[X.ACTIVE] !== '0' && !byHand(p));
    const away = master.people.filter(p => !used.has(p) && p[X.ACTIVE] === '0' && !byHand(p));
    const guests = master.people.filter(p => byHand(p) && p[X.ACTIVE] !== '0');      // inactive: only a returning child (same name) is paired with them

    matched.forEach(m => {
      m.changes = [];
      pc.cols.forEach(col => {
        if (HIDDEN_COLS.includes(col) || !master.pcCols.includes(col)) return;      // a roster loaded from the JSON only holds identity and room; the rest arrives with this export
        const from = trim(m.person[col]), to = trim(m.rec[col]);
        if (canon(from) !== canon(to)) m.changes.push({ col, from, to, important: IMPORTANT_COLS.includes(col) });
      });
      m.reactivate = m.person[X.ACTIVE] === '0';
      m.reactivateAuto = m.reactivate && m.person[X.INACTIVE_BY] === 'import';     // only people the import itself deactivated come back by themselves
      m.resolved = resolvedCols(m.person, m.rec);
      // Planning Center moved the field to a third value (not the one the leader asked for): the leader's pending change is out of date, and Planning Center wins.
      m.superseded = m.changes.filter(c => { const o = m.person['ov:' + c.col]; return o !== undefined && o !== '' && !sameVal(o, c.to); }).map(c => c.col);
    });

    // Pair new rows with missing people: same registration + similar first name, or same name under a new registration.
    // Every possible pair is scored first and the best pairs are taken first, so the file order does not decide who gets whom.
    // Within one registration the last name is shared by siblings and says nothing, so the first names are compared; a pair whose birthdates differ is offered but not pre-ticked.
    const pairs = [];
    fresh.forEach(rec => {
      missing.concat(away).forEach(p => {
        let s = 0, why = '';
        if (nameKey(p) === nameKey(rec)) { s = 1; why = p[X.ACTIVE] === '0' ? 'returning child, same name, new registration ID' : 'same name, new registration ID'; }
        else if (p[X.ACTIVE] !== '0' && trim(p[C.REG]) === trim(rec[C.REG])) {
          s = norm(p[C.LAST]) === norm(rec[C.LAST]) ? similarity(p[C.FIRST], rec[C.FIRST]) : similarity(pcName(p), pcName(rec));
          why = 'same registration, name changed';
        }
        if (s >= 0.5) pairs.push({ rec, p, s, why });
      });
    });
    // A guest (added by hand, not in Planning Center) is offered a Planning Center row with the same name (or very close); only an exact name with no birthdate clash is pre-ticked.
    fresh.forEach(rec => guests.forEach(p => {
      const exact = nameKey(p) === nameKey(rec), s = exact ? 1 : similarity(pcName(p), pcName(rec));
      if (s >= 0.8) pairs.push({ rec, p, s, why: 'guest, now in Planning Center' + (exact ? ', same name' : ', similar name'), guest: true, exact });
    }));
    pairs.sort((x, y) => y.s - x.s);
    const renames = [], taken = new Set(), usedRec = new Set();
    pairs.forEach(({ rec, p, s, why, guest, exact }) => {
      if (taken.has(p) || usedRec.has(rec)) return;
      taken.add(p); usedRec.add(rec);
      const sameBirthday = !trim(p[C.BDAY]) || !trim(rec[C.BDAY]) || trim(p[C.BDAY]) === trim(rec[C.BDAY]);
      renames.push({ person: p, rec, score: s, reason: why, guest: !!guest, accept: guest ? !!exact && sameBirthday : s >= 0.6 && sameBirthday });
    });
    renames.sort((x, y) => fresh.indexOf(x.rec) - fresh.indexOf(y.rec));
    usedRec.forEach(rec => fresh.splice(fresh.indexOf(rec), 1));
    return { matched, added: fresh, missing: missing.filter(p => !taken.has(p)), renames, pcCols: pc.cols };
  }

  const sameVal = (a, b) => canon(trim(a)).toLowerCase() === canon(trim(b)).toLowerCase();
  // Pending changes that Planning Center now reflects.
  const resolvedCols = (p, rec) => Object.keys(p).filter(k => k.startsWith('ov:') && p[k] !== '' && sameVal(p[k], rec[k.slice(3)]));
  const clearResolved = (p, rec) => resolvedCols(p, rec).forEach(k => delete p[k]);

  // decisions: { add: Set(rec), deactivate: Set(person), rename: Set(rename-object accepted) }
  function applyPlan(master, plan, decisions, today) {
    plan.pcCols.forEach(c => { if (!master.pcCols.includes(c)) master.pcCols.push(c); });
    const again = decisions.reactivate || new Set();
    // Someone marked inactive by hand stays inactive unless the review said "make active again"; one the import deactivated (they left the export) comes back by itself.
    const refresh = (p, rec, back, supersededCols) => {
      clearResolved(p, rec);
      (supersededCols || []).forEach(c => { delete p['ov:' + c]; });
      plan.pcCols.forEach(c => { p[c] = rec[c] == null ? '' : rec[c]; });
      p[X.LAST_SEEN] = today;
      if (p[X.ACTIVE] === '0' && !back) return false;
      p[X.ACTIVE] = '1'; delete p[X.INACTIVE_BY];
      return true;
    };
    // ids: every person this export's row now belongs to; loose: the records that belong to nobody (not added). Both feed the kept export record (captureExport).
    const out = { updated: 0, added: 0, deactivated: 0, renamed: 0, reactivated: 0, resolved: 0, superseded: 0, ids: [], loose: [] };
    plan.matched.forEach(m => {
      out.ids.push(m.person[X.ID]);
      // Keep mine (decisions.keep: person -> set of columns): the file takes Planning Center's value, but the pending change stays and is still listed as needing a change in Planning Center.
      const kept = (decisions.keep && decisions.keep.get(m.person)) || new Set();
      const drop = m.superseded.filter(c => !kept.has(c));
      out.resolved += m.resolved.length; out.superseded += drop.length; out.kept = (out.kept || 0) + (m.superseded.length - drop.length);
      const woke = refresh(m.person, m.rec, m.reactivateAuto || again.has(m.person), drop);
      if (m.reactivate && woke) out.reactivated++;
      out.updated++;
    });
    plan.renames.forEach(r => {
      if (decisions.rename.has(r)) {
        const old = pcName(r.person).trim();
        refresh(r.person, r.rec, true);          // accepting the pairing is the decision that this is the same child, so a returning child is active again
        out.ids.push(r.person[X.ID]);
        r.person[X.NOTES] = [r.person[X.NOTES], r.guest ? 'Was a guest' + (old ? ' ("' + old + '")' : '') + ' until ' + today : 'Was "' + old + '" until ' + today].filter(Boolean).join(' | ');
        out.renamed++;
      } else {
        decisions.add.add(r.rec);
        if (decisions.deactivate && r.person[X.ACTIVE] !== '0' && !r.guest) decisions.deactivate.add(r.person);       // a guest who is not linked stays a guest
      }
    });
    plan.added.concat(plan.renames.filter(r => !decisions.rename.has(r)).map(r => r.rec)).forEach(rec => {
      if (!decisions.add.has(rec)) { out.loose.push(rec); return; }      // a registration the leader chose not to add: kept whole in the export record
      const p = Object.assign({}, rec);
      p[X.ID] = freshId(master, p);
      seedPerson(p, today);
      master.people.push(p); out.added++; out.ids.push(p[X.ID]);
    });
    plan.missing.concat(plan.renames.filter(r => !decisions.rename.has(r)).map(r => r.person)).forEach(p => {
      if (decisions.deactivate.has(p) && p[X.ACTIVE] !== '0') { p[X.ACTIVE] = '0'; p[X.INACTIVE_BY] = 'import'; out.deactivated++; }
    });
    return out;
  }

  // ---- guests: people added by hand, tied to a Planning Center entry later ----
  const isGuest = p => trim(p[C.REG]) === 'manual';
  // Planning Center rows in an export that no one on the roster is matched to yet: the entries a guest can be linked to.
  function unlinkedRecords(master, pc) {
    const plan = planImport(master, pc), seen = new Set();
    return plan.added.concat(plan.renames.map(r => r.rec)).filter(r => !seen.has(r) && seen.add(r));
  }
  // Tie a guest to a Planning Center row: the guest keeps their ID, attendance, awards and notes; Planning Center's details replace the typed-in ones.
  function linkToPc(master, p, pc, rec, today) {
    const r = { person: p, rec, score: 1, reason: 'guest linked by hand', guest: true, accept: true };
    const res = applyPlan(master, { pcCols: pc.cols, matched: [], added: [], missing: [], renames: [r] }, { rename: new Set([r]), add: new Set(), deactivate: new Set() }, today);
    // The row the guest was linked to was kept whole among the rows that belong to nobody; it now belongs to them (R17).
    const cap = master.pcExport; if (cap && Array.isArray(cap.loose)) {
      const row = JSON.stringify((cap.names || []).map(n => rec[n] == null ? '' : String(rec[n]))), at = cap.loose.findIndex(l => JSON.stringify((cap.names || []).map((n, i) => l[i] == null ? '' : String(l[i]))) === row);
      if (at >= 0) { cap.loose.splice(at, 1); (cap.ids = cap.ids || {})[p[X.ID]] = 1; }
    }
    return res;
  }

  // ---------- the kept export (R17): roster.pcExport ----------
  // Everything the last export said is in the data file: the people's values (pc), and this record, which says which columns it had and in what order (names, header as exported), how many rows,
  // which people its rows belong to (ids), and the rows that belong to nobody (loose, cell for cell in names order). exportBack rebuilds the grid from it. Only the latest export is kept whole.
  const CAPTURE_KEYS = ['at', 'hash', 'header', 'names', 'rows', 'blankRows', 'ids', 'loose'];
  // "The same export again": FNV-1a 32-bit over the text (byte order mark removed) plus its length.
  function hashText(text) {
    let t = String(text == null ? '' : text); if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
    let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0') + '-' + t.length;
  }
  // result: what applyPlan returned ({ ids, loose }); for a first load pass { ids: every person's id, loose: [] }. opts: { text, at }.
  function captureExport(master, rx, result, opts) {
    const names = rx.names.slice(), ids = {}; (result.ids || []).forEach(id => { ids[id] = 1; });
    master.pcExport = { at: (opts && opts.at) || new Date().toISOString(), hash: hashText(opts && opts.text), header: rx.header.map(h => String(h)), names, rows: rx.rows, blankRows: rx.blankRows, ids,
      loose: (result.loose || []).map(rec => names.map(n => rec[n] == null ? '' : String(rec[n]))) };
    return master.pcExport;
  }
  // The export as the data file holds it: { header, rows } (one row per person in ids, then the rows that belong to nobody, then the blank rows), or null when no export was kept.
  function exportBack(roster) {
    const cap = roster && roster.pcExport; if (!cap) return null;
    const names = cap.names || [], people = roster.people || {}, rows = [];
    Object.keys(cap.ids || {}).forEach(id => { const e = people[id]; if (!e) return; const pc = e.pc || {}; rows.push(names.map(n => (pc[n] === undefined || pc[n] === null ? '' : String(pc[n])))); });
    (cap.loose || []).forEach(r => rows.push(names.map((n, i) => (r[i] == null ? '' : String(r[i])))));
    for (let i = 0; i < (cap.blankRows || 0); i++) rows.push(names.map(() => ''));
    return { header: (cap.header || []).slice(), rows };
  }

  // Everything that still has to be changed in Planning Center.
  function pendingChanges(master) {
    const out = [];
    master.people.forEach(p => {
      if (!isActive(p)) return;
      Object.keys(p).filter(k => k.startsWith('ov:') && p[k] !== '').forEach(k =>
        out.push({ person: p, col: k.slice(3), from: p[k.slice(3)] || '', to: p[k] }));
    });
    return out;
  }

  // The sentence for one pending change. A registered child's class change is a move; a guest added by hand is not in Planning Center at all, so the sentence says to register them (not to move them).
  function pendingText(c) {
    if (isGuest(c.person)) return 'Not in Planning Center yet. ' + (c.col === C.ROOM ? 'When you register them there, put them in ' + c.to + '.' : 'When you register them there, set ' + c.col + ' to ' + c.to + '.');
    return c.col === C.ROOM ? 'Move to ' + c.to + ' in Planning Center (it still says ' + (c.from || 'no class') + ' there).' : c.col + ': ' + (c.from || '(blank)') + ' \u2192 ' + c.to;
  }

  // ---------- roster section of the data JSON ----------
  const TRACKED = [C.REG, C.FIRST, C.LAST, C.ROOM, C.GRADE, C.SELECTION];      // what an old identity-only roster section holds
  function toRoster(master) {
    const people = {}, cols = [];
    master.people.forEach(p => {
      const pc = {}, v = {};
      master.pcCols.forEach(c => { if (p[c] !== undefined && p[c] !== null && p[c] !== '') pc[c] = p[c]; });      // a value of only spaces is a value (R17)
      Object.keys(p).forEach(c => {
        if (!isUserCol(c) || c === X.ID || p[c] === undefined || p[c] === '') return;
        v[c] = p[c]; if (!BASE_USER_COLS.includes(c) && !cols.includes(c)) cols.push(c);
      });
      people[p[X.ID]] = Object.assign({}, (master.personExtra || {})[p[X.ID]], { pc, v });      // keys of a person's entry this model does not own are written back as they were (R17)
    });
    master.userCols.forEach(c => { if (!BASE_USER_COLS.includes(c) && !cols.includes(c)) cols.push(c); });
    const out = Object.assign({}, master.rosterExtra ? JSON.parse(JSON.stringify(master.rosterExtra)) : {}, { cols, pcCols: master.pcCols.slice(), people });
    if (master.pcAsOf) out.pcAsOf = master.pcAsOf;
    if (master.pcSource) out.pcSource = master.pcSource;
    if (master.pcExport) out.pcExport = JSON.parse(JSON.stringify(master.pcExport));
    return out;
  }
  // Every key of roster this model knows; any other key is kept in master.rosterExtra and written back (R17).
  const ROSTER_KEYS = ['cols', 'pcCols', 'pcKeys', 'pcAsOf', 'pcSource', 'pcExport', 'people'];
  function fromRoster(roster) {
    const r = roster || {}, master = emptyMaster();
    master.pcCols = Array.isArray(r.pcCols) && r.pcCols.length ? r.pcCols.slice() : TRACKED.slice();
    if (r.pcAsOf) master.pcAsOf = r.pcAsOf;
    if (r.pcSource) master.pcSource = r.pcSource;
    if (r.pcExport && typeof r.pcExport === 'object' && !Array.isArray(r.pcExport)) master.pcExport = JSON.parse(JSON.stringify(r.pcExport));
    (r.cols || []).forEach(c => addUserCol(master, c));
    const entries = Object.keys(r.people || {}).map(id => [id, r.people[id]]);
    entries.forEach(([, e]) => { Object.keys(e.pc || {}).forEach(c => { if (!master.pcCols.includes(c)) master.pcCols.push(c); }); Object.keys(e.v || {}).forEach(c => addUserCol(master, c)); });
    entries.forEach(([id, e]) => {
      const p = {}; master.pcCols.concat(master.userCols).forEach(c => { p[c] = ''; });
      Object.assign(p, e.pc, e.v); p[X.ID] = id;
      master.people.push(p);
      const extra = Object.keys(e || {}).filter(k => k !== 'pc' && k !== 'v'); if (extra.length) { (master.personExtra = master.personExtra || {})[id] = {}; extra.forEach(k => { master.personExtra[id][k] = JSON.parse(JSON.stringify(e[k])); }); }
    });
    const rextra = Object.keys(r).filter(k => !ROSTER_KEYS.includes(k)); if (rextra.length) { master.rosterExtra = {}; rextra.forEach(k => { master.rosterExtra[k] = JSON.parse(JSON.stringify(r[k])); }); }
    return master;
  }
  // The date of a Planning Center export: a leading yyyymmdd in its file name, else the day it was opened.
  function exportDate(name, today) {
    const m = /^(\d{4})(\d{2})(\d{2})\b/.exec(String(name || '').trim());
    return m ? m[1] + '-' + m[2] + '-' + m[3] : today;
  }
  // Is this export dated before the Planning Center data the file already holds (R10)? exportDate is '' when the name has no real date; fileDate is '' when the file has no usable "as of". Same day is not older.
  function olderExport(fileAsOf, name) {
    const m = /^(\d{4})(\d{2})(\d{2})\b/.exec(String(name || '').trim()), d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
    const exportD = m && d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? m[1] + '-' + m[2] + '-' + m[3] : '';
    const fileDate = /^\d{4}-\d{2}-\d{2}$/.test(String(fileAsOf || '')) ? fileAsOf : '';
    return { older: !!exportD && !!fileDate && exportD < fileDate, exportDate: exportD, fileDate };
  }
  // Silent when this week's export only refreshes people we already know; a new, missing or renamed person, or a changed
  // name, room, grade, medical, allergy or emergency-contact entry, has to be looked at first.
  const needsReview = plan => plan.added.length || plan.missing.length || plan.renames.length ||
    plan.matched.some(m => m.reactivateAuto || m.superseded.length || m.changes.some(c => c.important)) ? true : false;

  function addManualPerson(master, fields, today) {
    const p = Object.assign({}, fields);
    p[C.REG] = p[C.REG] || 'manual';
    p[X.ID] = freshId(master, p);
    seedPerson(p, today);
    master.people.push(p);
    return p;
  }

  // ---------- derived values ----------
  const isActive = p => p[X.ACTIVE] !== '0';
  const isVolunteer = p => /volunteer/i.test(eff(p, C.SELECTION)) || eff(p, C.ROOM) === 'Volunteers';
  const isClubber = p => !isVolunteer(p);
  /* The "is this id a child?" test for a data file's own roster (CR-09), built the same way fromRoster builds a person (pc and v together), so a pending room or selection change counts. An id that is not on the roster counts as a child (an earlier year's person who has left). A fresh test per call: the roster may be edited in place. */
  function childTestOf(roster) {
    const people = (roster && roster.people) || {}, memo = new Map();
    return id => { if (memo.has(id)) return memo.get(id); const e = people[id]; let r = true; if (e) { const p = Object.assign({}, e.pc, e.v); p[X.ID] = id; r = isClubber(p); } memo.set(id, r); return r; };
  }
  const room = p => eff(p, C.ROOM) || 'Unassigned';
  const fullName = p => (eff(p, C.FIRST) + ' ' + eff(p, C.LAST)).trim();
  // Shared text helpers (used by the reports, the Person tab and the Progress sheets): a yyyy-mm-dd date as month/day ("10/4"); anything else is returned as it is.
  const md = d => { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(d || ''); return m ? (+m[1]) + '/' + (+m[2]) : (typeof d === 'string' ? d.replace(/[<>&"']/g, '') : d); };      // something that is not a date (a bad value in a file) is shown as it is, but never with the characters that make markup
  // Text for HTML: & < > " become entities.
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function groupOf(r) {
    if (/^puggles/i.test(r)) return 'Puggles';
    if (/^cubbies/i.test(r)) return 'Cubbies';
    if (/^sparks/i.test(r)) return 'Sparks';
    if (/^(t&t|tnt)/i.test(r)) return 'T&T';
    if (/^volunteers/i.test(r)) return 'Volunteers';
    return 'Unassigned';
  }
  const hasColorTeams = g => g === 'Sparks' || g === 'T&T';
  function roomRank(r) { const i = ROOM_ORDER.indexOf(r); return i < 0 ? 999 : i; }
  const byRoomThenName = (a, b) =>
    roomRank(room(a)) - roomRank(room(b)) || room(a).localeCompare(room(b)) ||
    eff(a, C.FIRST).localeCompare(eff(b, C.FIRST)) || eff(a, C.LAST).localeCompare(eff(b, C.LAST));
  const byFirstName = (a, b) => fullName(a).localeCompare(fullName(b));

  // Medical text for reports: PC puts a free-text note and a yes/no-ish allergy answer in two fields.
  const TRIVIAL = /^(no|n|na|n\/a|none|nka|nope|nothing|nil|-+|no allergies|no medical.*)$/i;
  function medicalText(p) {
    const parts = [];
    [eff(p, C.MED), eff(p, C.ALLERGY)].forEach(v => {
      v = trim(v).replace(/[;\s]+$/, '');
      if (!v || TRIVIAL.test(v)) return;
      if (photoRequest(v) && !/\b(allerg|gluten|dye|epi|asthma|seiz|diabet)/i.test(v) && v.replace(/\b(no|photos?|pics?|pictures?|please|\W)\b/gi, '').trim().length < 3) return;
      parts.push(v);
    });
    const kept = parts.filter((v, i) => !parts.some((w, j) => j !== i && w.length > v.length && w.toLowerCase().includes(v.toLowerCase())));
    return kept.filter((v, i) => kept.findIndex(w => w.toLowerCase() === v.toLowerCase()) === i).join('; ');
  }
  const noPhotos = p => p[X.NOPHOTOS] === '1';
  // Items a person bought through Planning Center registration.
  // What the child wears: their program's uniform. Next year's form does not ask which, so it is worked out from the class.
  const uniformKind = p => ({ Cubbies: 'Cubbies vest', Sparks: 'Sparks vest', 'T&T': 'T&T shirt' })[groupOf(room(p))] || 'Uniform';
  const NO_ORDER = /^\s*(no|none|n\/?a|na|0|\$?0(\.0+)?|-+|false|not ordered|declined)\s*$/i;
  const wantsUniform = v => { const t = String(v == null ? '' : v).trim(); return t !== '' && !NO_ORDER.test(t); };
  // Who has a uniform to track: the older form's per-program columns, or the one Uniform column (anything but blank or No means ordered and paid in Planning Center).
  function uniformItems(p) {
    const out = [];
    if (eff(p, C.CUB_VEST)) out.push('Cubbies vest');
    if (eff(p, C.SPARKS_VEST)) out.push('Sparks vest');
    if (eff(p, C.TNT_SHIRT)) out.push('T&T shirt');   // header is normalized to 'T&T shirt' on import
    if (!out.length && wantsUniform(eff(p, C.UNIFORM))) out.push(uniformKind(p));
    return out;
  }
  // Which uniform columns to show: the older ones (a size beside the order, the size at ordering and at giving out) only for a file that has data in them.
  const uniformLegacy = people => ({ sizes: people.some(p => p[UNI.SIZE_ORDERED] || p[UNI.SIZE_GIVEN]) });

  function teamOf(p, quarter) { return p['team:' + quarter] || ''; }
  // "No team" for a quarter: a child who joined after it began is deliberately left without a color. The color column stays blank (so the child earns no game points and counts for no team,
  // exactly as a blank always has), and this flag says the blank is on purpose: the To do tab, Assign blanks, the unassigned warning and the planner leave the child alone for that quarter.
  const NO_TEAM = '__none__';      // the value of the "No team" choice in a team drop-down
  const noTeam = (p, quarter) => p['x_noteam:' + quarter] === '1';
  function setTeamChoice(master, p, quarter, value) {      // a color, '' (blank: still to assign) or NO_TEAM
    addUserCol(master, 'team:' + quarter);
    if (value === NO_TEAM) { addUserCol(master, 'x_noteam:' + quarter); p['team:' + quarter] = ''; p['x_noteam:' + quarter] = '1'; }      // the flag column only exists once someone is marked
    else { p['team:' + quarter] = value || ''; if (p['x_noteam:' + quarter]) p['x_noteam:' + quarter] = ''; }      // choosing a color (or blank) takes the mark off
  }

  const api = {
    hasPhoneDigits, parentPhone, regContactPhone, C, X, UNI, uniHasGivenDate, setUniformField, uniGiven, uniToOrder, uniToReceive, canon, normalizePc, readExport, columnReport, PC_ROLES, PC_KNOWN, uniformItems, uniformKind, wantsUniform, uniformLegacy, BASE_USER_COLS, ROOM_ORDER, IMPORTANT_COLS, isUserCol, norm, eff, setField, clubPhone, emergencyPhone,
    HIDDEN_COLS, ROSTER_KEYS, isGuest, unlinkedRecords, linkToPc, emptyMaster, loadMaster, pendingChanges, pendingText, toRows, toCsv, toRoster, fromRoster, hashText, captureExport, exportBack, CAPTURE_KEYS, exportDate, olderExport, needsReview, setActive, TRACKED, addUserCol, planImport, applyPlan, addManualPerson,
    isActive, isVolunteer, isClubber, childTestOf, room, fullName, groupOf, hasColorTeams, roomRank,
    md, esc, byRoomThenName, byFirstName, medicalText, noPhotos, teamOf, NO_TEAM, noTeam, setTeamChoice, photoRequest, matchKey, similarity,
  };
  if (typeof module !== 'undefined') module.exports = api; else root.Model = api;
})(this);
