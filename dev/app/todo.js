(this.AwanaVersions = this.AwanaVersions || {})['todo.js'] = '1.11.5';
// What still needs a person's attention after an import (or any time): classes to assign, colors, handbooks, uniforms, missing
// details. Pure: roster and season in, a list of groups out; the To do tab draws it and nothing here is stored.
//   compute({ master, season, quarter, today, newIds }) -> { groups: [{ id, title, level, hint, items: [{ id, name, text, fields, suggest? }] }], people: [{ id, name, room, items: [{ group, title, level, text, fields }] }], total }
// fields = the Person-tab fields an item is about (a Planning Center column name, 'team:Q2', 'handbook', or a club-record key), so that page can highlight them. 'people' is the same items regrouped per person.
// level 'action' = something to do, 'check' = something to look at, 'note' = worth knowing, not counted in total (a child with no emergency contact name but a parent's primary phone, which the binders print). newIds (a Set of people just added by an import) adds a medical review for them.
(function (root) {
  const M = root.Model || require('./model.js'), Intake = root.Intake || require('./intake.js'), Season = root.Season || require('./season.js'), Check = root.Check || require('./check.js'), Teams = root.Teams || require('./teams.js');
  const { C, X, UNI } = M;
  const TEAM_GROUPS = ['Sparks', 'T&T'];

  function compute(ctx) {
    const { master, season, quarter, today } = ctx, newIds = ctx.newIds || new Set();
    const people = master.people.filter(M.isActive).sort(M.byRoomThenName), groups = [];
    const add = (id, title, level, hint, rows) => { if (rows.length) groups.push({ id, title, level, hint, items: rows }); };
    const row = (p, text, extra) => Object.assign({ id: p[X.ID], name: M.fullName(p), room: M.room(p), text }, extra || {});
    const kids = people.filter(M.isClubber), gradeOf = p => M.eff(p, C.GRADE), selOf = p => M.eff(p, C.SELECTION), groupOf = p => M.groupOf(M.room(p));
    const known = r => M.ROOM_ORDER.includes(r);

    // 1. no class, or a class that is not one of ours
    add('class', 'Assign a class', 'action', 'Planning Center has no class for them, or one this club does not run. Pick one here (it is recorded as a pending Planning Center change) or set it in Planning Center.',
      people.filter(p => !known(M.room(p))).map(p => {
        const want = M.isVolunteer(p) ? 'Volunteers' : Intake.suggestGroup(selOf(p), gradeOf(p));
        const room = M.room(p), text = (room === 'Unassigned' ? 'No class assigned.' : 'Class "' + room + '" is not one of ours.') + (want === 'Older' ? ' ' + gradeOf(p) + ' is past T&T.' : want ? ' Suggested group: ' + want + '.' : ' Grade ' + (gradeOf(p) || 'unknown') + ', no suggestion.');
        return row(p, text, { suggest: want === 'Older' ? '' : want, fields: [C.ROOM] });
      }));

    // 2. a class that does not fit the grade
    add('classfit', 'Class does not match the grade', 'check', 'Usually a registration mistake or a child moved up. Change the class if it is wrong.',
      kids.filter(p => known(M.room(p)) && !Intake.classFits(selOf(p), gradeOf(p), groupOf(p))).map(p => {
        const want = Intake.suggestGroup(selOf(p), gradeOf(p));
        return row(p, (gradeOf(p) || selOf(p)) + ' is in ' + M.room(p) + (want && want !== 'Older' ? '; ' + want + ' is usual.' : '.'), { suggest: want, fields: [C.ROOM, C.GRADE] });
      }));

    // 3. colors, handbooks
    // The best choice for each child with no color: what Assign blanks on the Color teams tab would give them (the same Teams.assign, run without writing). A fixed seed keeps it from changing between redraws.
    const hist = season ? p => Season.colorHistory(season, String(p[X.ID]), q => M.teamOf(p, q), ctx.calendar || []) : undefined;      // a child whose color came from a move is not "without a color" (Fable review A4)
    const noColor = kids.filter(p => TEAM_GROUPS.includes(groupOf(p)) && !Teams.endIn(p, quarter, hist && hist(p)) && !M.noTeam(p, quarter)), best = {};
    if (noColor.length) {
      let a = 0x9e3779b9 ^ quarter.charCodeAt(1), seeded = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
      try { Teams.assign(master, quarter, { dry: true, rng: seeded, history: hist }).assigned.forEach(x => { best[x.person[X.ID]] = x.color; }); } catch (e) { /* no suggestion: the row still takes a choice */ }
    }
    add('teams', 'Needs a ' + quarter + ' color team', 'action', 'Pick a color on the row (the best choice is already selected: it is what Assign blanks on the Color teams tab would give), or use Assign blanks there for everyone (it keeps every color already set and evens out the teams).',
      noColor.map(p => row(p, groupOf(p) + ' child with no color for ' + quarter + '.', { fields: ['team:' + quarter], bestColor: best[p[X.ID]] || '' })));
    if (season) {
      add('handbook', 'Needs a handbook', 'check', 'Person tab, Progress: under the book\'s tab, enter the date received (the handbook box is on the Person tab too). Sparks need HG, WR or SS to land in the right slide column.',
        kids.filter(p => TEAM_GROUPS.includes(groupOf(p))).filter(p => {
          const code = Season.childBook(season, p[X.ID]);      // Sparks: worked out from the received dates and progress; the others: the handbook
          return groupOf(p) === 'Sparks' ? !['HG', 'WR', 'SS'].includes(code) : !code;
        }).map(p => { const h = season.handbooks[p[X.ID]]; return row(p, h ? 'Handbook "' + h + '" is not a Sparks book (HG, WR, SS).' : 'No book yet: type the book code here, then enter the date received on Progress.', { fields: ['handbook'], bookFix: '' }); }));      // bookFix: the book code can be typed on the row
      // A child who has a book but no day they received it (a "no date" tick counts: the book is received, the day just is not known).
      add('received', 'Needs a date received', 'check', 'Person tab, Progress: under the book\'s tab, type the date received, or tick no date when nobody knows the day.',
        kids.filter(p => TEAM_GROUPS.includes(groupOf(p))).map(p => ({ p, code: Season.childBook(season, p[X.ID]) }))
          .filter(x => x.code && (season.config.books || {})[x.code] && !Season.receivedOf(season, x.p[X.ID], x.code))
          .map(x => row(x.p, ((season.config.books[x.code] || {}).name || x.code) + ': no date received. Enter it on Progress, or tick no date.', { recvBook: x.code })));      // no field to highlight on the Person page: the date received is on the Progress sheet
    }

    // 4. uniforms: Planning Center says the family ordered and paid; everything after that (size, ordered, received, given) is recorded here
    add('uniform', 'Uniform to order', 'action', 'Uniforms tab. They ordered and paid for one in Planning Center and no order date is recorded here (a uniform already given out, with a date or the no-date box ticked, needs no order date).',
      kids.filter(p => M.uniformItems(p).length && M.uniToOrder(p)).map(p => row(p, M.uniformItems(p).join(', ') + (p[UNI.SIZE_VERIFIED] ? ', size ' + p[UNI.SIZE_VERIFIED] : M.eff(p, C.SHIRT) && !/^\s*(n\/?a|none|no|na|nka|-+)\s*$/i.test(M.eff(p, C.SHIRT)) ? ', parent says ' + M.eff(p, C.SHIRT) : ', no size recorded yet') + '.', { fields: [UNI.SIZE_VERIFIED, UNI.ORDERED] })));

    // 5. details missing
    const parentPhone = p => M.parentPhone(p), noName = [];      // the registration's "primary phone number for a parent" when it holds a real number (7 digits or more)
    add('details', 'Details missing', 'check', 'Ask the family, or fill it in on the Person tab (it becomes a pending Planning Center change).',
      kids.map(p => {
        const need = [], fields = [], g = groupOf(p), b = Intake.parseBirthdate(M.eff(p, C.BDAY));
        if (!M.eff(p, C.BDAY)) { need.push('birthdate'); fields.push(C.BDAY); } else if (!b) { need.push('a valid birthdate'); fields.push(C.BDAY); }
        if (!gradeOf(p) && g !== 'Puggles') { need.push('grade'); fields.push(C.GRADE); }
        // The emergency contact is given by a phone number: the parent's primary phone, the Emergency Contact box's own number, or a number the club chose. A name alone is not enough.
        if (!parentPhone(p) && !M.emergencyPhone(p) && !M.clubPhone(p)) { need.push('emergency phone'); fields.push(C.EMERG); }
        const contact = ['Mobile Phone Number', 'Home Phone Number', 'Other Phone Number', 'Registration Contact Phone Number', 'Home Email Address', 'Work Email Address', 'Other Email Address', 'Registration Contact Home Email Address']
          .some(c => M.eff(p, c));
        if (!contact) { need.push('any phone number or email'); fields.push('contact'); }
        return need.length ? row(p, 'Missing ' + need.join(', ') + '.', { fields }) : null;
      }).filter(Boolean));
    // 5a. no emergency phone: neither the attendee answer for a parent's phone nor the emergency contact's own number is on file. The binders then print the registration contact's number (marked †) or a bold warning.
    const emergPhone = p => { const raw = String(M.eff(p, C.EMERG) || ''), i = raw.lastIndexOf(' - '); const v = i < 0 ? '' : raw.slice(i + 3).trim(); return (v.match(/\d/g) || []).length >= 7 ? v : ''; };
    add('nophone', 'No emergency phone on file', 'action', 'Neither the parent’s primary phone nor the emergency contact’s number is on file. The binders print the registration contact’s number (marked †), or NO PHONE ON FILE when there is none. Ask the family for a parent’s phone and fill it in on the Person tab.',
      kids.filter(p => !parentPhone(p) && !emergPhone(p) && !M.clubPhone(p)).map(p => row(p, 'No parent phone and no emergency phone.', { fields: M.eff(p, C.EMERG) ? [C.EMERG] : ['club:emerg'] })));      // the Emergency phone card is highlighted (its own key); when the Emergency Contact box has a name, the box is the one to fix
    // 5b. what the data checks (check.js) found: a handbook code that is not one of your books, and values that are there but not valid
    if (season) {
      const found = Check.scan({ master, season, calendar: ctx.calendar || [] }), byId = new Map(people.map(p => [p[X.ID], p]));
      add('books', 'Unrecognized book', 'action', 'A handbook or progress record uses a book code that is not on the Options tab. Add the book there, or correct the code on the Person tab.',
        found.filter(f => f.area === 'Books' && f.id && byId.has(f.id)).map(f => row(byId.get(f.id), f.detail, { fields: ['handbook'], bookFix: f.fix === 'handbook' ? f.code : undefined })));      // bookFix: the child's handbook code can be corrected on the row
      add('data', 'Values that look wrong', 'check', 'A value that is typed in but does not look right (a birthdate that cannot be real, an email without an @, a phone number that is too short). Correct it on the Person tab.',
        found.filter(f => f.area === 'People' && byId.has(f.id)).map(f => row(byId.get(f.id), f.detail, { fields: [f.field] })));
    }
    // Medical notes: a note is read with its tick, stored in config.medRead with the text that was read. It comes back only if the text changes after that.
    const medRead = (season && season.config && season.config.medRead) || {};
    add('medical', 'New: medical or allergy notes to read', 'check', 'Medical report. Check the allergy answer and notes of anyone just added. Tick read once it is checked; a note that changes later comes back.',
      people.filter(p => { const t = M.medicalText(p), id = p[X.ID]; if (!t || medRead[id] === t) return false; return newIds.has(id) || medRead[id] !== undefined; })
        .map(p => row(p, M.medicalText(p).slice(0, 160), { fields: [C.MED, C.ALLERGY], medRead: true })));

    // A class binder's medical sheet is out of date when a child's note is new or has changed. A note counts as new or changed when the child was just added, or has been read (or printed) before and the text is different now.
    // "Open sheet" (To do page) opens the class's medical sheet and records the text printed in config.medPrinted, so the item goes away until the note changes again.
    const medPrinted = (season && season.config && season.config.medPrinted) || {};
    add('medprint', 'Print updated medical sheets', 'action', 'A medical or allergy note is new or has changed since the class binder sheet was last printed. Open the sheet for the class and print it; it is then marked printed.',
      people.filter(p => { const t = M.medicalText(p), id = p[X.ID]; return M.isClubber(p) && t && medPrinted[id] !== t && (newIds.has(id) || medRead[id] !== undefined || medPrinted[id] !== undefined); })
        .map(p => row(p, 'Medical or allergy note ' + (medPrinted[p[X.ID]] !== undefined || medRead[p[X.ID]] !== undefined ? 'changed' : 'added') + ': print the updated medical sheet for ' + M.room(p) + '.', { fields: [C.MED, C.ALLERGY], printRoom: M.room(p) })));

    // 6. registrations that need a decision
    add('status', 'Registration is not Active in Planning Center', 'check', 'Cancelled or waitlisted registrations still import as people. Mark them inactive on the Roster if they are not coming.',
      people.filter(p => { const s = M.eff(p, 'Status'); return s && s !== 'Active'; }).map(p => row(p, 'Status: ' + M.eff(p, 'Status') + '.', { fields: [X.ACTIVE] })));
    const byName = new Map();
    people.forEach(p => { const k = M.norm(M.eff(p, C.FIRST)) + '|' + M.norm(M.eff(p, C.LAST)); (byName.get(k) || byName.set(k, []).get(k)).push(p); });
    add('dups', 'Possible duplicates', 'check', 'The same name appears more than once. Mark one inactive on the Roster if it is the same person.',
      [...byName.values()].filter(l => l.length > 1).reduce((a, l) => a.concat(l.map(p => row(p, 'Appears ' + l.length + ' times (' + (p[C.REG] || 'no registration ID') + ').', { fields: [C.FIRST, C.LAST, X.ACTIVE] }))), []));
    add('pc', 'Changes to make in Planning Center', 'action', 'You changed these here; make the same change in Planning Center. They clear themselves when an export matches.',
      M.pendingChanges(master).map(c => row(c.person, M.pendingText(c), { fields: [c.col] })));

    // The same items regrouped per person, in class then name order, so everything for one child is in one place.
    const per = new Map();
    groups.forEach(g => g.items.forEach(i => {
      if (!per.has(i.id)) per.set(i.id, { id: i.id, name: i.name, room: i.room, items: [] });
      per.get(i.id).items.push({ group: g.id, title: g.title, level: g.level, text: i.text, fields: i.fields || [], suggest: i.suggest, recvBook: i.recvBook, bookFix: i.bookFix, medRead: i.medRead, bestColor: i.bestColor, printRoom: i.printRoom, name: i.name, id: i.id });
    }));
    const order = new Map(people.map((p, n) => [p[X.ID], n]));
    const byPerson = [...per.values()].sort((a, b) => order.get(a.id) - order.get(b.id));
    return { people: byPerson, groups, total: groups.filter(g => g.level !== 'note').reduce((n, g) => n + g.items.length, 0), notes: groups.filter(g => g.level === 'note').reduce((n, g) => n + g.items.length, 0), actions: groups.filter(g => g.level === 'action').reduce((n, g) => n + g.items.length, 0) };
  }

  const api = { compute };
  if (typeof module !== 'undefined') module.exports = api; else root.Todo = api;
})(this);
