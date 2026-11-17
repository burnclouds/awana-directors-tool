(this.AwanaVersions = this.AwanaVersions || {})['check.js'] = '1.3.3';
// Data checks: one place that knows what a good value looks like, used where people type data (entry points) and to scan what is already in the file.
// Every check returns null (fine) or { level, msg }. level 'error' = impossible or malformed (an entry point refuses it); level 'warn' = a judgment call (saved as typed, then shown on the To do list
// and the Options tab for a person to fix by hand). Pure: no screen code here.
//   Check.field(col, value)           the check for a Planning Center / roster column, chosen by its name
//   Check.bookCode(code, books)       is this handbook code one of the books on the Options tab?
//   Check.bookList(books)             problems in the book list itself: [{ code, msg }]
//   Check.scan({ master, season, calendar }) -> [{ area, level, msg, id?, field? }]  everything found in the file now
(function (root) {
  const M = root.Model || require('./model.js'), Intake = root.Intake || require('./intake.js'), Catalog = root.Catalog || require('./catalog.js');
  const { C, X } = M;
  const COLORS = ['Red', 'Yellow', 'Green', 'Blue'], BOOK_GROUPS = ['Cubbies', 'Sparks', 'T&T'], QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
  const err = msg => ({ level: 'error', msg }), warn = msg => ({ level: 'warn', msg });
  const trim = v => String(v == null ? '' : v).trim();

  // 'YYYY-MM-DD', a date that exists, between 2000 and 2100.
  function date(v) {
    v = trim(v); if (!v) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v); if (!m) return err('"' + v + '" is not a date (use year-month-day).');
    const y = +m[1], t = new Date(Date.UTC(y, +m[2] - 1, +m[3]));
    if (t.getUTCFullYear() !== y || t.getUTCMonth() !== +m[2] - 1 || t.getUTCDate() !== +m[3]) return err(v + ' is not a real date.');
    if (y < 2000 || y > 2100) return err('The year ' + y + ' is outside 2000 to 2100.');
    return null;
  }
  // Month/day/year or year-month-day, a date that exists, not in the future; a child (a clubber) born after 1990, an adult after 1900.
  function birthdate(v, today, child) {
    v = trim(v); if (!v) return null;
    const b = Intake.parseBirthdate(v); if (!b) return err('"' + v + '" is not a real birthdate (use month/day/year).');
    if (b.y < (child ? 1990 : 1900)) return err('Born in ' + b.y + '? That is too long ago' + (child ? ' for a club child.' : '.'));
    const t = today || new Date().toISOString().slice(0, 10);
    if (b.y + '-' + String(b.m).padStart(2, '0') + '-' + String(b.d).padStart(2, '0') > t) return err('That birthdate is in the future.');
    return null;
  }
  function email(v) {
    v = trim(v); if (!v) return null;
    const bad = (Intake.emails ? Intake.emails(v) : [v]).filter(e => !Intake.validEmail(e));
    return bad.length ? err('"' + bad[0] + '" is not a valid email address.') : null;
  }
  // A phone box may hold one number or several, with names, labels and extensions around them ("Mom: 513-555-0147; Dad 937-555-0100 ext. 12"). Split on ; & / , new lines and the word "and" (a number written 937/555/0142, three groups of 3, 3 and 4 digits, is one number), drop an extension,
  // and judge each piece that has digits: 7 to 15 digits each. A box with no digits at all, or with one piece that is too short or too long, warns.
  const phone = (v, child) => {
    v = trim(v); if (!v) return null;
    if (!child && /^(n\/?a|n\.a\.|not applicable|none)$/i.test(v)) return null;      // an adult may say "N/A" (no number to share); a child's parent/emergency number is never optional, so N/A still warns there
    const joined = v.replace(/(\d{3})\s*\/\s*(\d{3})\s*\/\s*(\d{4})/g, '$1-$2-$3');      // 937/555/0142 is one number written with slashes (area / prefix / line), not three
    const pieces = joined.split(/[;&\/,\n]|\band\b/i).map(x => x.replace(/\b(?:ext\.?|extension|x)\s*\d+\s*$/i, '')).filter(x => /\d/.test(x));
    const ok = pieces.length > 0 && pieces.every(x => { const n = x.replace(/\D/g, '').length; return n >= 7 && n <= 15; });
    return ok ? null : warn('"' + v + '" does not look like a phone number (7 to 15 digits each; several numbers can be separated with ; & / or a comma, and names or ext. 12 are fine).');
  };
  const grade = v => { v = trim(v); return v && Intake.parseGrade(v) === null ? warn('"' + v + '" is not a grade this app recognises (Pre-K, Kindergarten, 1st to 12th).') : null; };
  const teamColor = v => { v = trim(v); return v && !COLORS.includes(v) ? err('"' + v + '" is not a team color (Red, Yellow, Green or Blue).') : null; };
  const quarter = v => QUARTERS.includes(trim(v)) ? null : err('"' + v + '" is not a quarter (Q1 to Q4).');

  // The check for a roster column, chosen by its name. Names are not judged here (the file check already does that).
  function field(col, value, today, child) {
    if (/birth/i.test(col)) return birthdate(value, today, child);
    if (/e-?mail/i.test(col)) return email(value);
    if (/phone/i.test(col) && !/emergency/i.test(col)) return phone(value, child);
    if (col === C.GRADE) return grade(value);
    if (/^team:Q[1-4]$/.test(col)) return teamColor(value);
    if (/^x_Uni_.*Date$/.test(col)) return date(value);
    return null;
  }

  // ---- books ----
  const bookKey = (code, books) => books ? Catalog.bookKeyOf(books, code) : trim(code);
  function bookCode(code, books) {
    code = trim(code); if (!code) return null;
    if (!/^[A-Za-z]{2,5}$/.test(code)) return warn('"' + code + '" is not a book code (2 or 3 letters).');
    return books && bookKey(code, books) ? null : warn('"' + code + '" is not one of your books. Add it on the Options tab, or correct the code.');
  }
  // Problems in the list itself. books = { CODE: { name, emblem, group } }.
  function bookList(books) {
    const out = [], seen = new Set();
    Object.keys(books || {}).forEach(code => {
      const b = books[code] || {};
      if (!/^[A-Za-z]{2,3}$/.test(code)) out.push({ code, msg: 'The code "' + code + '" must be 2 or 3 letters.' });
      if (seen.has(code.toUpperCase())) out.push({ code, msg: 'Two books use the code ' + code + '.' }); seen.add(code.toUpperCase());
      if (!trim(b.name)) out.push({ code, msg: code + ' has no name.' });
      if (b.group && !BOOK_GROUPS.includes(b.group)) out.push({ code, msg: code + ': the group must be Cubbies, Sparks or T&T.' });
    });
    return out;
  }

  // ---- everything in the file now ----
  function scan(ctx) {
    const { master, season, calendar } = ctx, out = [], add = (area, level, msg, extra) => out.push(Object.assign({ area, level, msg }, extra || {}));
    const people = master ? master.people.filter(M.isActive) : [], name = p => M.fullName(p);
    // books: handbook codes and progress records that name a book that is not in the list
    if (season) {
      const books = season.config.books || {};
      bookList(books).forEach(b => add('Books', 'error', b.msg, { code: b.code }));
      const byId = new Map((master ? master.people : []).map(p => [p[X.ID], p]));
      Object.keys(season.handbooks || {}).forEach(id => {
        const code = (/^\s*([A-Za-z]{2,5})(?=\s|\d|$)/.exec(season.handbooks[id]) || [])[1], p = byId.get(id); if (!code || !p || !M.isActive(p)) return;
        const r = bookCode(code, books); if (r) add('Books', 'warn', name(p) + ': ' + r.msg, { id, field: 'handbook', code, detail: r.msg, fix: 'handbook' });
      });
      Object.keys(season.progress || {}).forEach(id => Object.keys(season.progress[id] || {}).forEach(b => {
        const p = byId.get(id); if (b !== 'common' && !books[b] && p && M.isActive(p)) add('Books', 'warn', name(p) + ': progress is recorded for "' + b + '", which is not one of your books.', { id, field: 'handbook', code: b, detail: 'Progress is recorded for "' + b + '", which is not one of your books.' });
      }));
    }
    // people: values that are there but not valid
    people.forEach(p => {
      master.pcCols.concat(master.userCols).forEach(col => {
        const v = Object.prototype.hasOwnProperty.call(p, 'ov:' + col) && p['ov:' + col] !== '' ? p['ov:' + col] : p[col]; if (v === undefined || v === '') return;
        const r = field(col, v, undefined, M.isClubber(p)); if (r) add('People', r.level, name(p) + ' · ' + col + ': ' + r.msg, { id: p[X.ID], field: col, detail: col + ': ' + r.msg });
      });
    });
    // awards that are not in the group's list
    if (season && master) Object.keys(season.awards || {}).forEach(d => Object.keys(season.awards[d]).forEach(id => {
      const p = master.people.find(x => x[X.ID] === id); if (!p) return; const list = season.config.awardLists[M.groupOf(M.room(p))] || [];
      season.awards[d][id].forEach(a => { if (list.length && !list.includes(a) && !/Jewel|Emblem|Wing|Zone|Flight/.test(a)) add('Awards', 'warn', name(p) + ': "' + a + '" (' + d + ') is not in the ' + M.groupOf(M.room(p)) + ' award list.', { id }); });
    }));
    // calendar
    (calendar || []).forEach((r, i) => {
      const d = date(r.Date); if (d) add('Calendar', 'error', 'Calendar row ' + (i + 1) + ': ' + d.msg);
      if (r.Quarter && !QUARTERS.includes(r.Quarter)) add('Calendar', 'error', 'Calendar row ' + (i + 1) + ' (' + r.Date + '): ' + quarter(r.Quarter).msg);
    });
    const dup = {}; (calendar || []).forEach(r => { dup[r.Date] = (dup[r.Date] || 0) + 1; }); Object.keys(dup).filter(d => d && dup[d] > 1).forEach(d => add('Calendar', 'warn', 'The date ' + d + ' is on the calendar ' + dup[d] + ' times.'));
    return out;
  }

  const api = { COLORS, BOOK_GROUPS, QUARTERS, date, birthdate, email, phone, grade, teamColor, quarter, field, bookKey, bookCode, bookList, scan };
  if (typeof module !== 'undefined') module.exports = api; else root.Check = api;
})(this);
