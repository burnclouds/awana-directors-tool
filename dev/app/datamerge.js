(this.AwanaVersions = this.AwanaVersions || {})['datamerge.js'] = '1.1.6';
// Merging another leader's data file into the one that is open (BACKLOG item J). Nothing here touches the screen or the open file: plan() works out what a merge would do,
// summary() lists it as a categorized diff, and finish() builds the merged season once the leader has decided the real conflicts.
// Rules (Mike, 2026-11-12):
//   - The open file is "mine", the file being merged in is "other". Both carry their History, so the newest entry they share gives a real common starting point (the base).
//     Files that never met use an empty base.
//   - A value only one side changed is taken. The same value on both sides is "agreed". Dates, marks and scores over a blank merge without a question (two leaders, two classes, one night).
//   - A blank never beats a value: if the other file cleared something that this copy still holds, this copy's value is kept and the row is flagged Review.
//   - Planning Center fields (roster pc) are never merged; the Planning Center import owns them. Club-edited fields (roster v: team, uniform, flags, ...) merge like everything else.
//     The whole Planning Center block (pcCols, pcAsOf, pcSource, pcExport and every shared person's pc) moves as one unit from one side (alignPc, R17).
//   - A real conflict is two different non-empty values at the same place, or a whole night or child removed here that the other file edited. The leader decides each one.
(function (root) {
  const Season = root.Season || require('./season.js');
  const clone = o => JSON.parse(JSON.stringify(o)), isObj = o => !!o && typeof o === 'object' && !Array.isArray(o), same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const blankV = v => v === undefined || v === null || v === '';
  const getPath = (o, p) => { if (p.includes('__proto__')) return undefined; for (let i = 0; i < p.length; i++) { if (!isObj(o)) return undefined; o = o[p[i]]; } return o; };
  const setPath = (o, p, has, v) => { if (p.includes('__proto__')) return; for (let i = 0; i < p.length - 1; i++) o = o[p[i]] = isObj(o[p[i]]) ? o[p[i]] : {}; if (has) o[p[p.length - 1]] = clone(v); else delete o[p[p.length - 1]]; };
  const key = p => JSON.stringify(p);
  const SECTIONS = Season.SECTIONS;      // the one list of sections (season.js): History, undo and this merge must always see the same ones
  const CATEGORIES = ['Attendance', 'Game scores', 'Progress', 'Awards', 'Roster and Planning Center fields', 'Color teams and class moves', 'Uniforms', 'Flags and notes', 'Volunteer absences', 'Bug reports', 'Other'];
  const TAGS = ['Added', 'Changed', 'Review'];
  function categoryOf(p) {
    switch (p[0]) {
      case 'attendance': return 'Attendance';
      case 'games': return 'Game scores';
      case 'progress': case 'progressNoDate': case 'extraSheets': case 'received': case 'doneBooks': case 'handbooks': return 'Progress';
      case 'awards': case 'given': case 'givenNoDate': case 'announcedNoDate': case 'blueWings': case 'blueOverrides': case 'blueDrops': case 'held': case 'adults': return 'Awards';
      case 'teamMoves': case 'pastTurnout': return 'Color teams and class moves';
      case 'flags': return /^b/.test(String(p[1] || '')) ? 'Bug reports' : 'Flags and notes';      // a bug report's id starts with b
      case 'absences': return 'Volunteer absences';
      case 'roster': { const f = String(p[4] || ''); if (/uni/i.test(f)) return 'Uniforms'; if (/team|color|room|class/i.test(f)) return 'Color teams and class moves'; if (/flag/i.test(f)) return 'Flags and notes'; return 'Roster and Planning Center fields'; }
      default: return 'Other';
    }
  }
  // The newest history entry both files share (same time, same changes) is where they last agreed; the file as it was then is the base.
  function findBase(mine, other) {
    let k = 0; const a = mine.history || [], b = other.history || [];
    while (k < a.length && k < b.length && a[k].t === b[k].t && same(a[k].changes, b[k].changes)) k++;
    if (k) return { snap: Season.snapshot(Season.at(mine, k)), shared: k };
    const empty = {}; SECTIONS.forEach(s => { empty[s] = Array.isArray(mine[s]) ? [] : {}; }); empty.roster = { cols: [], people: {} };
    return { snap: empty, shared: 0 };
  }
  // The other file's changes that this merge may use. Planning Center fields are left as they are here; a removal never wins over a value that is still here.
  function prepare(mine, other, base, opts) {
    const A = clone(other), kept = [];
    if (!opts.pc) Object.keys(A.roster.people || {}).forEach(id => { const m = mine.roster.people[id]; if (m) A.roster.people[id].pc = clone(m.pc || {}); });
    if (!opts.removals) Season.diff(base, Season.snapshot(A)).forEach(c => {
      if (c.n !== undefined) return;
      setPath(A, c.p, true, c.o);      // act as if the other file had not removed it
      if (getPath(mine, c.p) !== undefined) kept.push({ p: c.p, mine: getPath(mine, c.p), other: undefined });
    });
    return { A, kept };
  }
  // ---------- the Planning Center block (R17) ----------
  // roster.pcCols, pcAsOf, pcSource, pcExport and the pc of every person both sides have are ONE unit: the import owns them, they say "as of this export", and mixing two exports' values
  // (or one side's "as of" over the other's values) would make the file say something no export said. So the block is carried whole from one side, never merged field by field.
  const PC_BLOCK = ['pcCols', 'pcAsOf', 'pcSource', 'pcExport'];
  const pcBlock = (r, ids) => { const o = { people: {} }; PC_BLOCK.forEach(k => { if (r && r[k] !== undefined) o[k] = r[k]; }); ids.forEach(id => { const e = r && r.people && r.people[id]; if (e) o.people[id] = e.pc; }); return o; };
  const setPcBlock = (r, from) => { PC_BLOCK.forEach(k => { if (from[k] === undefined) delete r[k]; else r[k] = clone(from[k]); }); Object.keys(from.people).forEach(id => { if (r.people && r.people[id]) r.people[id].pc = clone(from.people[id] === undefined ? {} : from.people[id]); }); };
  const stampOf = r => ({ asOf: (r && r.pcAsOf) || '', at: (r && r.pcExport && r.pcExport.at) || '' });
  const later = (a, b) => a.asOf !== b.asOf ? (a.asOf > b.asOf ? 1 : -1) : a.at !== b.at ? (a.at > b.at ? 1 : -1) : 0;
  // base: a snapshot; ours, theirs: seasons (merge3's orientation: what is applied, and what it is applied onto). Returns copies: { ours, theirs, took: 'ours' | 'theirs' | '', newer }.
  //   opts.keepTheirs (a file merge: theirs is the open file): ours' block is set to theirs'.  Otherwise the side that did not import since the base gets base's block, so merge3 carries the other side's whole;
  //   when both imported, the later export (pcAsOf, then pcExport.at; a tie keeps theirs, which is what Drive holds) wins and the loser gets base's block. `newer` says which export was later.
  function alignPc(base, ours, theirs, opts) {
    const A = clone(ours), B = clone(theirs), res = { ours: A, theirs: B, took: '', newer: null };
    if (!isObj(A.roster) || !isObj(B.roster)) return res;
    const ids = Object.keys(A.roster.people || {}).filter(id => id in (B.roster.people || {})), b = pcBlock(base && base.roster, ids), o = pcBlock(A.roster, ids), t = pcBlock(B.roster, ids);
    const oc = !same(o, b), tc = !same(t, b), so = stampOf(A.roster), st = stampOf(B.roster);
    if (opts && opts.keepTheirs) { if (!same(o, t)) { setPcBlock(A.roster, t); res.took = 'theirs'; if (later(so, st) > 0) res.newer = { asOf: so.asOf, at: so.at }; } return res; }
    if (oc && !tc) { setPcBlock(B.roster, b); res.took = 'ours'; }
    else if (tc && !oc) { setPcBlock(A.roster, b); res.took = 'theirs'; }
    else if (oc && tc && !same(o, t)) { if (later(so, st) > 0) { setPcBlock(B.roster, b); res.took = 'ours'; res.newer = { asOf: so.asOf, at: so.at }; } else { setPcBlock(A.roster, b); res.took = 'theirs'; res.newer = { asOf: st.asOf, at: st.at }; } res.both = true; }
    return res;
  }
  const isPcBlockPath = p => p[0] === 'roster' && (PC_BLOCK.includes(p[1]) || (p[1] === 'people' && p[3] === 'pc'));
  const norm = s => Season.fromJson(Season.toJson(s));      // what a saved file reads back as: keys in a fixed order, so the same data compares equal whether it was just edited or just opened
  function plan(mine, other, opts) {
    opts = opts || {}; mine = norm(mine); other = norm(other);
    // opts.base: the file as this copy opened it (the Drive save knows it exactly). opts.pc: also merge Planning Center fields (a Drive save must not lose an import done here).
    // opts.removals: a removal made in the other copy is a real edit and is applied (a Drive save: "other" is this very copy, and a night or mark deleted here was meant).
    const { snap: base, shared } = opts.base ? { snap: opts.base, shared: 1 } : findBase(mine, other), { A, kept } = prepare(mine, other, base, opts);
    const al = alignPc(base, A, mine, { keepTheirs: !opts.pc });      // the Planning Center block goes whole from one side: this file's in a file merge, the newer import's in a Drive save
    const r = Season.merge3(base, al.ours, al.theirs, { now: opts.now, from: opts.from });      // result: this copy plus what the other file added
    const state = clone(r.season); state.history = clone(mine.history || []);
    const conflicts = [], blanks = [];      // blanks: entered on one side and blank on the other: merged without a question, flagged Review
    r.conflicts.forEach(c => {
      const whole = isObj(c.ours) || isObj(c.theirs);
      if (!whole && blankV(c.ours) && !blankV(c.theirs)) { blanks.push({ p: c.path, mine: c.theirs, other: c.ours, took: 'mine' }); return; }
      if (!whole && !blankV(c.ours) && blankV(c.theirs)) { setPath(state, c.path, true, c.ours); blanks.push({ p: c.path, mine: c.theirs, other: c.ours, took: 'other' }); return; }
      conflicts.push({ id: key(c.path), p: c.path, mine: c.theirs, other: c.ours, base: c.base });
    });
    const P = { mine, other, base, shared, from: opts.from || '', state, applied: r.applied, agreed: r.agreed, conflicts, blanks, kept, pc: { took: al.took, newer: al.newer, both: !!al.both, keepTheirs: !opts.pc, mine: stampOf(mine.roster), other: stampOf(other.roster) }, names: opts.names || (id => id), bookName: opts.bookName || (c => c), now: opts.now };
    P.conflicts.sort((x, y) => (x.p[0] === 'roster' ? 0 : 1) - (y.p[0] === 'roster' ? 0 : 1) || x.id.localeCompare(y.id));
    return P;
  }
  // The merged season once the leader has decided: choices[conflict id] = { pick: 'mine' | 'other' | 'edit', value }. Every conflict needs a choice. One new History entry holds the whole merge.
  function finish(P, choices) {
    choices = choices || {}; const out = clone(P.state);
    P.conflicts.forEach(c => {
      const ch = choices[c.id]; if (!ch) throw new Error('Decide every conflict first.');
      if (ch.pick === 'other') setPath(out, c.p, c.other !== undefined, c.other); else if (ch.pick === 'edit') setPath(out, c.p, true, ch.value);
    });
    const e = Season.record(out, Season.snapshot(P.mine), { separate: true, now: P.now, prefix: 'Merged' });
    if (e) e.label = 'Merged' + (P.from ? ' (' + P.from + ')' : '') + ': ' + Season.labelOf(e.changes);
    return out;
  }
  // ---------- the summary: a categorized diff of what the merge does ----------
  const MD = d => { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(d || ''); return m ? (+m[1]) + '/' + (+m[2]) : (typeof d === 'string' ? d.replace(/[<>&"']/g, '') : d); };
  const MARK = { a: 'attended', h: 'handbook', p: 'prayer', x: 'excused' };
  function words(P, p) {
    if (p[0] === 'flags' && p[2] === 'hidden') return 'Note › hidden on To do';
    const people = Object.assign({}, P.other.roster.people, P.mine.roster.people), parts = [];
    p.slice(1).forEach((s, i) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) parts.push(MD(s));
      else if (people[s] && i < 2) parts.push(P.names(s));
      else if (p[0] === 'attendance' && MARK[s] && i === 2) parts.push(MARK[s]);
      else if (P.mine.config && P.mine.config.books && P.mine.config.books[s]) parts.push(P.bookName(s));
      else if (!(p[0] === 'roster' && (s === 'people' || s === 'v'))) parts.push(String(s));
    });
    return parts.join(' › ');
  }
  const shown = v => v === undefined ? '(blank)' : isObj(v) || Array.isArray(v) ? JSON.stringify(v) : String(v);
  function leaves(p, v, out) { if (isObj(v) && Object.keys(v).length) Object.keys(v).sort().forEach(k => leaves(p.concat(k), v[k], out)); else out.push({ p, v }); return out; }
  function rowsOf(P, state, chosen) {
    const rows = [], rev = new Set(P.blanks.map(b => key(b.p))), keptKeys = new Set(P.kept.map(k => key(k.p)));
    // The Planning Center block is one unit: its many field changes are not listed, one row says what happened to it (R17).
    const pcNote = P.pc && P.pc.keepTheirs && P.pc.newer ? { tag: 'Review', now: 'this file’s (as of ' + (P.pc.mine.asOf || 'unknown') + ')', after: 'this file’s (as of ' + (P.pc.mine.asOf || 'unknown') + '); the other file’s is as of ' + P.pc.newer.asOf, from: 'kept: this file’s Planning Center data stays whole' }
      : P.pc && !P.pc.keepTheirs && P.pc.took ? { tag: P.pc.both ? 'Review' : 'Changed', now: 'as of ' + (P.pc.mine.asOf || 'unknown'), after: 'as of ' + ((P.pc.took === 'ours' ? P.pc.other : P.pc.mine).asOf || 'unknown'), from: P.pc.both ? 'took the newer export (as of ' + P.pc.newer.asOf + ')' : 'this copy’s Planning Center import, carried whole' } : null;
    if (pcNote) rows.push({ cat: 'Roster and Planning Center fields', tag: pcNote.tag, where: 'Planning Center data', now: pcNote.now, after: pcNote.after, from: pcNote.from, p: ['roster', 'pcExport'] });
    Season.diff(Season.snapshot(P.mine), Season.snapshot(state)).filter(c => !isPcBlockPath(c.p)).forEach(c => {
      const list = c.n !== undefined && c.o === undefined && isObj(c.n) ? leaves(c.p, c.n, []).map(l => ({ p: l.p, o: undefined, n: l.v })) : [c];
      list.forEach(x => {
        const k = key(x.p), decided = chosen && chosen.has(k), tag = rev.has(k) ? 'Review' : x.o === undefined ? 'Added' : 'Changed';
        rows.push({ cat: categoryOf(x.p), tag: decided ? 'Changed' : tag, where: words(P, x.p), now: shown(x.o), after: shown(x.n), from: decided ? 'you chose' : 'the other file', p: x.p });
      });
    });
    P.kept.forEach(c => rows.push({ cat: categoryOf(c.p), tag: 'Review', where: words(P, c.p), now: shown(c.mine), after: shown(c.mine), from: 'kept: the other file cleared it, blank does not replace a value', p: c.p }));
    P.blanks.filter(b => b.took === 'mine').forEach(b => rows.push({ cat: categoryOf(b.p), tag: 'Review', where: words(P, b.p), now: shown(b.mine), after: shown(b.mine), from: 'kept: the other file has it blank', p: b.p }));
    unevenRows(P, state).forEach(r => rows.push(r));
    return rows;
  }
  // Team sizes are not re-checked by the merge itself: two leaders can each put a new child on what looked like the smallest team (a tie) and the merged file has both there (Fable review T3).
  // So each quarter and group whose merged sizes are uneven (more than one apart) AND differ from this copy's sizes gets one Review row. A size already uneven here that the merge did not change is not repeated.
  function unevenRows(P, state) {
    const Model = root.Model || require('./model.js'), Teams = root.Teams || require('./teams.js'), rows = [];
    let mine, merged; try { mine = Model.fromRoster(P.mine.roster); merged = Model.fromRoster(state.roster); } catch (e) { return rows; }
    ['Q1', 'Q2', 'Q3', 'Q4'].forEach(q => {
      const a = Teams.audit(mine, q).groups, b = Teams.audit(merged, q).groups;
      Object.keys(b).forEach(g => {
        const cb = b[g].counts, ca = a[g] ? a[g].counts : {}, text = c => Teams.COLORS.map(k => k + ' ' + (c[k] || 0)).join(' · ');
        if (b[g].spread > 1 && text(cb) !== text(ca)) rows.push({ cat: 'Color teams and class moves', tag: 'Review', where: q + ' ' + g + ' team sizes', now: text(ca), after: text(cb), from: 'the teams are uneven after the merge; open Color teams and move a child to even them', p: ['roster', 'teamSizes', q, g] });
      });
    });
    return rows;
  }
  // choices is optional: with it, the decided conflicts are in the list too (the final summary before Apply).
  function summary(P, choices) {
    const decided = new Set(), state = (choices && P.conflicts.every(c => choices[c.id])) ? finish(P, choices) : P.state;
    if (state !== P.state) P.conflicts.forEach(c => { if (choices[c.id].pick !== 'mine') decided.add(c.id); });
    const rows = rowsOf(P, state, decided), known = new Set(CATEGORIES), cats = CATEGORIES.map(n => ({ name: n, rows: rows.filter(r => r.cat === n || (n === 'Other' && !known.has(r.cat))) })).filter(c => c.rows.length);      // a row whose category is not listed still shows, under Other (CR-04)
    const counts = { Added: 0, Changed: 0, Review: 0, Agreed: P.agreed, Conflicts: P.conflicts.length, Undecided: choices ? P.conflicts.filter(c => !choices[c.id]).length : P.conflicts.length };
    rows.forEach(r => { counts[r.tag]++; });
    return { counts, categories: cats, rows, shared: P.shared };
  }
  const line = r => r.cat + ' | ' + r.tag + ' | ' + r.where + ' | now: ' + r.now + ' | after: ' + r.after + ' | ' + r.from;
  function toText(P, S) {
    const c = S.counts, head = 'Merge summary' + (P.from ? ' (' + P.from + ')' : '') + '\nAdded ' + c.Added + ', Changed ' + c.Changed + ', Review ' + c.Review + ', Agreed ' + c.Agreed + (c.Conflicts ? ', Conflicts ' + c.Conflicts : '') + '\n';
    return head + S.categories.map(k => '\n' + k.name + ' (' + k.rows.length + ')\n' + k.rows.map(r => '  ' + line(r)).join('\n')).join('\n') + '\n';
  }
  // A cell that starts with = + - @ (or a tab or carriage return) is read as a formula by a spreadsheet, and names and notes come from the data files: a single quote in front keeps it text.
  const csvCell = v => { const s = String(v); return '"' + (/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""') + '"'; };
  function toCsv(S) { return ['Category,Tag,Where,Now,After,From'].concat(S.rows.map(r => [r.cat, r.tag, r.where, r.now, r.after, r.from].map(csvCell).join(','))).join('\r\n') + '\r\n'; }
  const api = { plan, finish, summary, toText, toCsv, findBase, categoryOf, words, alignPc, CATEGORIES, TAGS, SECTIONS };
  if (typeof module !== 'undefined') module.exports = api; else root.DataMerge = api;
})(this);
