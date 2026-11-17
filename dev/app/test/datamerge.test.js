// Merging another leader's data file into the open one (datamerge.js): what merges on its own, what is flagged for review, what the leader must decide, and the summary.
// Invented test club only. Usage: node test/datamerge.test.js
const assert = require('assert'), S = require('../season.js'), M = require('../datamerge.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const clone = o => JSON.parse(JSON.stringify(o));
// An edit that is logged in History, the way the app does it (the common starting point is found from the shared History).
const edit = (s, t, fn) => { const before = S.snapshot(s); fn(s); S.record(s, before, { separate: true, now: t }); };
function start() {
  const s = S.blank('2026-27');
  ['a', 'b', 'c', 'd'].forEach(id => { s.roster.people[id] = { pc: { 'First Name': 'Kid ' + id, 'Last Name': 'Test' }, v: {} }; });
  s.config.books = s.config.books || {};
  edit(s, '2026-10-20T20:00:00Z', x => { S.setMark(x, '2026-10-21', 'a', 'a', 1); S.setMark(x, '2026-10-21', 'b', 'a', 1); x.progress.a = { HG: { 'R.1': '2026-10-01' } }; });
  return s;
}
// Two leaders who both opened `start()`; mine is the open file, other is the file being merged in.
function fork(editMine, editOther) { const base = start(), mine = clone(base), other = clone(base); if (editMine) edit(mine, '2026-10-28T20:00:00Z', editMine); if (editOther) edit(other, '2026-10-28T20:05:00Z', editOther); return { mine, other }; }
const plan = (f, from) => M.plan(f.mine, f.other, { from: from || 'Sam', now: '2026-10-28T21:00:00Z', names: id => 'Kid ' + id });
const cat = (Sm, name) => (Sm.categories.find(c => c.name === name) || { rows: [] }).rows;

test('two leaders each record their own class on the same night: both merge, nothing is asked, the summary says Added', () => {
  const f = fork(x => S.setMark(x, '2026-10-28', 'c', 'a', 1), x => S.setMark(x, '2026-10-28', 'd', 'a', 1)), P = plan(f), Sm = M.summary(P);
  assert.strictEqual(P.conflicts.length, 0); const out = M.finish(P, {});
  assert.deepStrictEqual(out.attendance['2026-10-28'], { c: { a: 1 }, d: { a: 1 } }); assert.strictEqual(Sm.counts.Added, 1, JSON.stringify(Sm.counts)); assert.strictEqual(Sm.counts.Conflicts, 0);
  assert.strictEqual(cat(Sm, 'Attendance').length, 1); assert(/Kid d/.test(cat(Sm, 'Attendance')[0].where) && /10\/28/.test(cat(Sm, 'Attendance')[0].where), cat(Sm, 'Attendance')[0].where);
});
test('a progress date over a blank merges without a question and is tagged Added', () => {
  const f = fork(null, x => { x.progress.b = { HG: { 'R.2': '2026-10-27' } }; }), P = plan(f), Sm = M.summary(P);
  assert.strictEqual(P.conflicts.length, 0); assert.strictEqual(M.finish(P, {}).progress.b.HG['R.2'], '2026-10-27'); assert.strictEqual(cat(Sm, 'Progress')[0].tag, 'Added');
});
test('the same date entered on both sides is agreed: no row, no conflict, counted', () => {
  const f = fork(x => { x.progress.b = { HG: { 'R.2': '2026-10-27' } }; }, x => { x.progress.b = { HG: { 'R.2': '2026-10-27' } }; }), P = plan(f), Sm = M.summary(P);
  assert.strictEqual(P.conflicts.length, 0); assert(Sm.counts.Agreed >= 1); assert.strictEqual(Sm.rows.length, 0);
});
test('two different dates at the same place is a real conflict: nothing is picked for the leader, and finish needs a decision', () => {
  const f = fork(x => { x.progress.a.HG['R.1'] = '2026-10-02'; }, x => { x.progress.a.HG['R.1'] = '2026-10-03'; }), P = plan(f);
  assert.strictEqual(P.conflicts.length, 1); assert.deepStrictEqual(P.conflicts[0].p, ['progress', 'a', 'HG', 'R.1']); assert.strictEqual(P.conflicts[0].mine, '2026-10-02'); assert.strictEqual(P.conflicts[0].other, '2026-10-03');
  assert.throws(() => M.finish(P, {}), /every conflict/i); const id = P.conflicts[0].id;
  assert.strictEqual(M.finish(P, { [id]: { pick: 'mine' } }).progress.a.HG['R.1'], '2026-10-02');
  assert.strictEqual(M.finish(P, { [id]: { pick: 'other' } }).progress.a.HG['R.1'], '2026-10-03');
  assert.strictEqual(M.finish(P, { [id]: { pick: 'edit', value: '2026-10-09' } }).progress.a.HG['R.1'], '2026-10-09');
  assert.strictEqual(M.summary(P).counts.Undecided, 1); assert.strictEqual(M.summary(P, {}).counts.Undecided, 1); assert.strictEqual(M.summary(P, { [id]: { pick: 'other' } }).counts.Undecided, 0);
});
test('the summary after deciding lists a decided conflict as Changed, from "you chose"; Keep mine leaves no row', () => {
  const f = fork(x => { x.progress.a.HG['R.1'] = '2026-10-02'; }, x => { x.progress.a.HG['R.1'] = '2026-10-03'; }), P = plan(f), id = P.conflicts[0].id;
  const t = M.summary(P, { [id]: { pick: 'other' } }); assert.strictEqual(t.counts.Changed, 1); assert.strictEqual(cat(t, 'Progress')[0].from, 'you chose'); assert.strictEqual(cat(t, 'Progress')[0].after, '2026-10-03');
  assert.strictEqual(M.summary(P, { [id]: { pick: 'mine' } }).rows.length, 0);
});
test('a blank never beats a value: the other file cleared a date that is still here, so it is kept here and flagged Review', () => {
  const f = fork(null, x => { delete x.progress.a.HG['R.1']; }), P = plan(f), Sm = M.summary(P), out = M.finish(P, {});
  assert.strictEqual(P.conflicts.length, 0); assert.strictEqual(out.progress.a.HG['R.1'], '2026-10-01'); assert.strictEqual(Sm.counts.Review, 1); assert.strictEqual(cat(Sm, 'Progress')[0].tag, 'Review');
});
test('a mark the other file un-ticked stays ticked here, flagged Review, and is not a conflict', () => {
  const f = fork(null, x => { delete x.attendance['2026-10-21'].b; }), P = plan(f), Sm = M.summary(P);
  assert.strictEqual(P.conflicts.length, 0); assert.deepStrictEqual(M.finish(P, {}).attendance['2026-10-21'].b, { a: 1 }); assert(Sm.counts.Review >= 1);
});
test('a night the other file deleted that nobody here touched stays here (a removal does not win), flagged Review', () => {
  const f = fork(null, x => { delete x.attendance['2026-10-21']; }), P = plan(f), out = M.finish(P, {});
  assert(out.attendance['2026-10-21'].a); assert.strictEqual(P.conflicts.length, 0); assert(M.summary(P).counts.Review >= 1);
});
test('cleared here and changed in the other file: the entered value wins without a question, flagged Review', () => {
  const f = fork(x => { delete x.progress.a.HG['R.1']; }, x => { x.progress.a.HG['R.1'] = '2026-10-05'; }), P = plan(f), Sm = M.summary(P);
  assert.strictEqual(P.conflicts.length, 0); assert.strictEqual(M.finish(P, {}).progress.a.HG['R.1'], '2026-10-05'); assert.strictEqual(Sm.counts.Review, 1);
});
test('a whole night removed here while the other file marked a child on it is a real conflict for the whole night', () => {
  const f = fork(x => { delete x.attendance['2026-10-21']; }, x => S.setMark(x, '2026-10-21', 'a', 'h', 1)), P = plan(f);
  assert.strictEqual(P.conflicts.length, 1); assert.deepStrictEqual(P.conflicts[0].p, ['attendance', '2026-10-21']);
  assert.strictEqual(M.finish(P, { [P.conflicts[0].id]: { pick: 'mine' } }).attendance['2026-10-21'], undefined);
  assert.deepStrictEqual(M.finish(P, { [P.conflicts[0].id]: { pick: 'other' } }).attendance['2026-10-21'].a, { a: 1, h: 1 });
});
test('game scores: a score only the other file has merges (Game scores, Added); two different places for one team is a conflict', () => {
  const f = fork(x => { x.games = { '2026-10-28': { Sparks: { Green: { place: 1 } } } }; }, x => { x.games = { '2026-10-28': { 'T&T': { Green: { place: 2 }, Blue: { place: 1 } } } }; }), P = plan(f), Sm = M.summary(P), out = M.finish(P, {});
  assert.strictEqual(P.conflicts.length, 0); assert.strictEqual(out.games['2026-10-28'].Sparks.Green.place, 1); assert.strictEqual(out.games['2026-10-28']['T&T'].Blue.place, 1); assert.strictEqual(cat(Sm, 'Game scores').length, 2);
  const g = fork(x => { x.games = { '2026-10-28': { Sparks: { Green: { place: 1 } } } }; }, x => { x.games = { '2026-10-28': { Sparks: { Green: { place: 3 } } } }; }), Q = plan(g);
  assert.strictEqual(Q.conflicts.length, 1); assert.deepStrictEqual(Q.conflicts[0].p, ['games', '2026-10-28', 'Sparks', 'Green', 'place']);
});
test('files that never met (no shared History) use an empty base: a field filled on one side only takes the filled value, different values are a conflict', () => {
  const a = S.blank('2026-27'), b = S.blank('2026-27'); [a, b].forEach(s => ['a', 'b'].forEach(id => { s.roster.people[id] = { pc: {}, v: {} }; }));
  edit(a, '2026-10-28T20:00:00Z', x => { S.setMark(x, '2026-10-28', 'a', 'a', 1); x.progress.a = { HG: { 'R.1': '2026-10-01' } }; });
  edit(b, '2026-10-28T20:05:00Z', x => { S.setMark(x, '2026-10-28', 'b', 'a', 1); x.progress.a = { HG: { 'R.1': '2026-10-02', 'R.2': '2026-10-03' } }; });
  const P = M.plan(a, b, { from: 'Sam' }); assert.strictEqual(P.shared, 0); assert.strictEqual(P.conflicts.length, 1); assert.deepStrictEqual(P.conflicts[0].p, ['progress', 'a', 'HG', 'R.1']);
  const out = M.finish(P, { [P.conflicts[0].id]: { pick: 'mine' } }); assert.deepStrictEqual(out.attendance['2026-10-28'], { a: { a: 1 }, b: { a: 1 } }); assert.strictEqual(out.progress.a.HG['R.2'], '2026-10-03');
});
test('Planning Center fields are never merged, club fields are: a changed name is ignored, a uniform field merges under Uniforms', () => {
  const f = fork(null, x => { x.roster.people.a.pc['First Name'] = 'Changed'; x.roster.people.a.v.x_Uni_GivenFlag = '1'; }), P = plan(f), out = M.finish(P, {}), Sm = M.summary(P);
  assert.strictEqual(out.roster.people.a.pc['First Name'], 'Kid a'); assert.strictEqual(out.roster.people.a.v.x_Uni_GivenFlag, '1'); assert.strictEqual(cat(Sm, 'Uniforms').length, 1);
  assert.strictEqual(cat(Sm, 'Roster and Planning Center fields').length, 0);
});
test('a child that only the other file has comes in whole (club fields and Planning Center fields), listed as Added', () => {
  const f = fork(null, x => { x.roster.people.z = { pc: { 'First Name': 'New' }, v: { x_Uni_GivenFlag: '1' } }; }), P = plan(f), out = M.finish(P, {});
  assert.strictEqual(out.roster.people.z.pc['First Name'], 'New'); assert(M.summary(P).counts.Added >= 1);
});
test('the whole merge is one History entry named for the file, and undoing it gives the open file back', () => {
  const f = fork(x => S.setMark(x, '2026-10-28', 'c', 'a', 1), x => S.setMark(x, '2026-10-28', 'd', 'a', 1)), P = plan(f, 'Sam\'s copy'), out = M.finish(P, {});
  assert.strictEqual(out.history.length, f.mine.history.length + 1); assert(/^Merged \(Sam's copy\): /.test(out.history.at(-1).label), out.history.at(-1).label);
  assert.deepStrictEqual(S.snapshot(S.at(out, f.mine.history.length)), S.snapshot(f.mine));
});
test('planning and finishing never change the open file or the other file', () => {
  const f = fork(x => { x.progress.a.HG['R.1'] = '2026-10-02'; }, x => { x.progress.a.HG['R.1'] = '2026-10-03'; S.setMark(x, '2026-10-28', 'd', 'a', 1); }), m0 = JSON.stringify(f.mine), o0 = JSON.stringify(f.other), P = plan(f);
  M.summary(P); M.finish(P, { [P.conflicts[0].id]: { pick: 'other' } }); assert.strictEqual(JSON.stringify(f.mine), m0); assert.strictEqual(JSON.stringify(f.other), o0);
});
test('a merge with nothing new in the other file changes nothing and adds no History entry', () => {
  const f = fork(x => S.setMark(x, '2026-10-28', 'c', 'a', 1), null), P = plan(f), out = M.finish(P, {}); assert.strictEqual(out.history.length, f.mine.history.length); assert.strictEqual(M.summary(P).rows.length, 0);
});
test('conflicts list roster and club-record ones first', () => {
  const f = fork(x => { x.progress.a.HG['R.1'] = '2026-10-02'; x.roster.people.a.v.x_Uni_Size = 'M'; }, x => { x.progress.a.HG['R.1'] = '2026-10-03'; x.roster.people.a.v.x_Uni_Size = 'L'; }), P = plan(f);
  assert.strictEqual(P.conflicts.length, 2); assert.strictEqual(P.conflicts[0].p[0], 'roster'); assert.strictEqual(P.conflicts[1].p[0], 'progress');
});
test('the summary groups rows by category in a fixed order with counts that add up, and the text and CSV downloads carry every row', () => {
  const f = fork(null, x => { S.setMark(x, '2026-10-28', 'd', 'a', 1); x.progress.b = { HG: { 'R.2': '2026-10-27' } }; x.games = { '2026-10-28': { Sparks: { Green: { place: 1 } } } }; x.roster.people.a.v.x_Uni_GivenFlag = '1'; }), P = plan(f), Sm = M.summary(P);
  assert.deepStrictEqual(Sm.categories.map(c => c.name), ['Attendance', 'Game scores', 'Progress', 'Uniforms']); assert.strictEqual(Sm.counts.Added + Sm.counts.Changed + Sm.counts.Review, Sm.rows.length);
  const csv = M.toCsv(Sm).trim().split('\r\n'); assert.strictEqual(csv.length, Sm.rows.length + 1); assert.strictEqual(csv[0], 'Category,Tag,Where,Now,After,From');
  const txt = M.toText(P, Sm); assert(/Added 4/.test(txt) && /Game scores \(1\)/.test(txt) && /Merge summary \(Sam\)/.test(txt), txt.slice(0, 200));
});
test('the CSV download cannot carry a spreadsheet formula: a cell that starts with = + - @ tab or CR is made text with a leading quote, and quotes are still doubled', () => {
  const f = fork(null, x => { x.roster.people.a.v.x_Note = '=HYPERLINK("http://example.invalid","x")'; x.roster.people.b.v.x_Note = '+1+1'; x.roster.people.c.v.x_Note = '-2+3'; x.roster.people.d.v.x_Note = '@SUM(A1)'; x.progress.a = { HG: { 'R.2': '2026-10-27' } }; }), P = plan(f), Sm = M.summary(P), csv = M.toCsv(Sm);
  assert(Sm.rows.filter(r => /x_Note/.test(r.where)).length === 4, 'the four notes are rows in the summary');
  const cells = csv.split('\r\n').filter(Boolean).join('\n'); assert(!/(^|,|\n)"[=+\-@\t]/.test(cells), 'no cell starts with a formula character: ' + cells.slice(0, 200));
  assert(/"'=HYPERLINK\(""http:\/\/example\.invalid"",""x""\)"/.test(cells), 'the formula is text and its quotes are doubled: ' + cells.slice(0, 300)); assert(/"'\+1\+1"/.test(cells) && /"'-2\+3"/.test(cells) && /"'@SUM\(A1\)"/.test(cells));
  assert(/"2026-10-27"/.test(cells), 'ordinary dates are untouched');
});
test('a "__proto__" key in a data file is dropped on load and can never reach Object.prototype through a merge, an undo or a restore', () => {
  const evil = JSON.stringify(Object.assign(JSON.parse(S.toJson(start())), {})).replace('"attendance":{', '"attendance":{"__proto__":{"polluted":"yes"},');
  assert(/"__proto__"/.test(evil), 'the crafted file has the key'); const s = S.fromJson(evil); assert.strictEqual(Object.prototype.hasOwnProperty.call(s.attendance, '__proto__'), false, 'dropped on load');
  const f = fork(null, null); f.other = S.fromJson(evil); edit(f.other, '2026-10-28T20:05:00Z', x => { S.setMark(x, '2026-10-28', 'd', 'a', 1); }); const P = plan(f); M.finish(P, {});
  assert.strictEqual({}.polluted, undefined, 'Object.prototype is clean after a merge'); assert.strictEqual(Object.prototype.polluted, undefined);
  // the path helpers refuse the key even if one got through some other way (a file made with defineProperty, as no JSON parse would)
  const trap = S.blank('2026-27'), before = S.snapshot(trap); Object.defineProperty(trap.attendance, '__proto__', { value: { polluted: 'yes' }, enumerable: true, configurable: true, writable: true });
  const after = S.snapshot(trap); const changes = S.diff(before, after); assert(changes.some(c => c.p.includes('__proto__')), 'the diff does see the key');
  S.applyChanges(S.blank('2026-27'), changes, false); const leaked = ({}).polluted; delete Object.prototype.polluted; assert.strictEqual(leaked, undefined, 'applyChanges (a restore) never writes through the prototype');
  S.applyChanges(S.blank('2026-27'), changes, true); const leaked2 = ({}).polluted; delete Object.prototype.polluted; assert.strictEqual(leaked2, undefined, 'and neither does undoing it');
});
test('a date shown from a file never carries markup characters: a value that is not a date is shown without < > & " \'', () => {
  assert.strictEqual(require('../model.js').md('<img src=x onerror=alert(1)>'), 'img src=x onerror=alert(1)'); assert.strictEqual(require('../model.js').md('10/32/26 "x" & \'y\''), '10/32/26 x  y'); assert.strictEqual(require('../model.js').md('2026-10-28'), '10/28'); assert.strictEqual(require('../model.js').md(''), '');
});
test('category rules: where each part of the file is listed', () => {
  const c = M.categoryOf; assert.strictEqual(c(['attendance', 'd', 'a']), 'Attendance'); assert.strictEqual(c(['games', 'd', 'Sparks', 'Green', 'place']), 'Game scores'); assert.strictEqual(c(['received', 'a', 'HG']), 'Progress');
  assert.strictEqual(c(['given', 'a']), 'Awards'); assert.strictEqual(c(['flags', 'a']), 'Flags and notes'); assert.strictEqual(c(['teamMoves', 'a']), 'Color teams and class moves');
  assert.strictEqual(c(['roster', 'people', 'a', 'v', 'x_Uni_Size']), 'Uniforms'); assert.strictEqual(c(['roster', 'people', 'a', 'v', 'x_Team_Q1']), 'Color teams and class moves'); assert.strictEqual(c(['config', 'books']), 'Other');
});
// The Drive save: Drive's file is "mine", this copy is "other", the base is the file as this copy opened it, Planning Center changes and deletions made here are kept.
test('Drive options: an explicit base, Planning Center changes from this copy are kept, and a deletion made here is applied', () => {
  const f = fork(x => S.setMark(x, '2026-10-28', 'c', 'a', 1), x => { x.roster.people.a.pc['First Name'] = 'Imported'; delete x.attendance['2026-10-21'].b; });
  const base = S.snapshot(start()), P = M.plan(f.mine, f.other, { base, pc: true, removals: true, from: 'this copy', now: '2026-10-28T21:00:00Z' }), out = M.finish(P, {});
  assert.strictEqual(P.shared, 1); assert.strictEqual(out.roster.people.a.pc['First Name'], 'Imported', 'the import done here survives the save'); assert.strictEqual(out.attendance['2026-10-21'].b, undefined, 'the mark un-ticked here is gone');
  assert.deepStrictEqual(out.attendance['2026-10-28'], { c: { a: 1 } }, 'what is on Drive is kept'); assert(/^Merged \(this copy\)/.test(out.history.at(-1).label));
  const plain = M.finish(M.plan(f.mine, f.other, { base, from: 'x' }), {}); assert.strictEqual(plain.roster.people.a.pc['First Name'], 'Kid a', 'without the option Planning Center fields are not merged'); assert.deepStrictEqual(plain.attendance['2026-10-21'].b, { a: 1 }, 'and a removal does not win');
});
// ---- R17: the Planning Center block (pcCols, pcAsOf, pcSource, pcExport and every shared person's pc) moves as ONE unit and is never mixed ----
const imp = (x, asOf, tag) => {      // an import, as far as the data file shows it: this export's block and its values
  const names = ['First Name', 'Last Name', 'Times Attended']; x.roster.pcCols = names.slice(); x.roster.pcAsOf = asOf; x.roster.pcSource = asOf.replace(/-/g, '') + ' -- ' + tag + '.csv';
  Object.keys(x.roster.people).forEach(id => { x.roster.people[id].pc['Times Attended'] = tag; });
  x.roster.pcExport = { at: asOf + 'T19:00:00.000Z', hash: 'h' + tag + '-1', header: names.slice(), names, rows: 4, blankRows: 0, ids: { a: 1, b: 1, c: 1, d: 1 }, loose: [] };
};
const forkDrive = (mineFn, otherFn) => { const base = start(), mine = clone(base), other = clone(base); if (mineFn) edit(mine, '2026-10-28T20:00:00Z', mineFn); if (otherFn) edit(other, '2026-10-28T20:05:00Z', otherFn); return { base: S.snapshot(base), mine, other }; };
const drive = f => M.plan(f.mine, f.other, { base: f.base, pc: true, removals: true, from: 'this copy', now: '2026-10-28T21:00:00Z', names: id => 'Kid ' + id });
const pcRows = Sm => cat(Sm, 'Roster and Planning Center fields').filter(r => /Planning Center data/.test(r.where));
const rosterConflicts = P => P.conflicts.filter(c => c.p[0] === 'roster');
test('a file merge keeps this file\'s Planning Center block whole, and says when the other file\'s is newer', () => {
  const f = fork(x => imp(x, '2026-10-21', 'M'), x => imp(x, '2026-10-28', 'O')), P = plan(f), out = M.finish(P, {}), Sm = M.summary(P);
  assert.strictEqual(out.roster.pcExport.hash, 'hM-1'); assert.strictEqual(out.roster.pcAsOf, '2026-10-21'); assert.strictEqual(out.roster.pcSource, '20261021 -- M.csv'); assert(Object.values(out.roster.people).every(p => p.pc['Times Attended'] === 'M'), 'every value is this file\'s');
  assert.strictEqual(rosterConflicts(P).length, 0); assert.strictEqual(pcRows(Sm).length, 1, JSON.stringify(Sm.rows.filter(r => r.cat === 'Roster and Planning Center fields').map(r => r.where))); assert.strictEqual(pcRows(Sm)[0].tag, 'Review'); assert(/2026-10-28/.test(pcRows(Sm)[0].from + pcRows(Sm)[0].after), JSON.stringify(pcRows(Sm)[0]));
  const quiet = fork(x => imp(x, '2026-10-28', 'M'), x => imp(x, '2026-10-21', 'O')); assert.strictEqual(pcRows(M.summary(plan(quiet))).length, 0, 'an older export on the other side is not mentioned');
  const mineOnly = fork(x => imp(x, '2026-10-21', 'M'), null), P2 = plan(mineOnly); assert.strictEqual(M.finish(P2, {}).roster.pcExport.hash, 'hM-1');
});
test('Drive: only this copy imported since the base: its block is carried whole', () => {
  const f = forkDrive(null, x => imp(x, '2026-10-28', 'C')), P = drive(f), out = M.finish(P, {});
  assert.strictEqual(out.roster.pcExport.hash, 'hC-1'); assert.strictEqual(out.roster.pcAsOf, '2026-10-28'); assert(Object.values(out.roster.people).every(p => p.pc['Times Attended'] === 'C')); assert.strictEqual(rosterConflicts(P).length, 0);
  const d = forkDrive(x => imp(x, '2026-10-28', 'D'), null), Q = drive(d); assert.strictEqual(M.finish(Q, {}).roster.pcExport.hash, 'hD-1', 'only Drive imported: Drive\'s block stays');
});
test('Drive: both imported different exports: the newer wins whole, one Review row, no conflicts', () => {
  const f = forkDrive(x => imp(x, '2026-10-28', 'D'), x => imp(x, '2026-10-21', 'C')), P = drive(f), out = M.finish(P, {}), Sm = M.summary(P);
  assert.strictEqual(out.roster.pcExport.hash, 'hD-1'); assert(Object.values(out.roster.people).every(p => p.pc['Times Attended'] === 'D')); assert.strictEqual(rosterConflicts(P).length, 0); assert.strictEqual(pcRows(Sm).length, 1); assert.strictEqual(pcRows(Sm)[0].tag, 'Review'); assert(/newer export \(as of 2026-10-28\)/.test(pcRows(Sm)[0].from), pcRows(Sm)[0].from);
  const g = forkDrive(x => imp(x, '2026-10-21', 'D'), x => imp(x, '2026-10-28', 'C')), out2 = M.finish(drive(g), {}); assert.strictEqual(out2.roster.pcExport.hash, 'hC-1', 'this copy\'s is newer: it wins whole');
  const tie = forkDrive(x => imp(x, '2026-10-28', 'D'), x => imp(x, '2026-10-28', 'C')), out3 = M.finish(drive(tie), {}); assert.strictEqual(out3.roster.pcExport.hash, 'hD-1', 'a tie keeps what Drive holds');
});
test('a child only the other file has still comes in whole, and is not in this file\'s export record', () => {
  const f = fork(x => imp(x, '2026-10-21', 'M'), x => { x.roster.people.z = { pc: { 'First Name': 'New', 'Last Name': 'Kid', 'Times Attended': 'Z' }, v: {} }; }), out = M.finish(plan(f), {});
  assert.strictEqual(out.roster.people.z.pc['First Name'], 'New'); assert.strictEqual(out.roster.people.z.pc['Times Attended'], 'Z'); assert(!('z' in out.roster.pcExport.ids), 'not in this file\'s record');
});
test('club fields an import also writes still merge like edits', () => {
  const f = fork(x => imp(x, '2026-10-21', 'M'), x => { x.roster.people.a.v.x_Notes = 'from the other copy'; x.roster.people.b.v.x_Active = '0'; x.roster.people.b.v.x_InactiveBy = 'import'; }), out = M.finish(plan(f), {});      // (x_LastSeen is never compared by History or merge, by design)
  assert.strictEqual(out.roster.people.a.v.x_Notes, 'from the other copy'); assert.strictEqual(out.roster.people.b.v.x_Active, '0'); assert.strictEqual(out.roster.pcExport.hash, 'hM-1');
});

test('every category a path can give is in CATEGORIES; an added volunteer absence is listed in the summary (CR-04)', () => {
  const Season = require('../season.js'), M = require('../datamerge.js');
  Season.SECTIONS.forEach(k => assert(M.CATEGORIES.includes(M.categoryOf([k, 'x', 'y'])), k + ' -> ' + M.categoryOf([k, 'x', 'y'])));
  const open = () => Season.fromJson(Season.toJson(Season.blank('2026-27')));
  const base = open(), mine = open(), other = open(); Season.addAbsence(other, '70001_Ann_Lee', ['2026-11-18'], 'Trip', ['2026-11-18'], new Date(2026, 10, 16));
  const P = M.plan(mine, other, { base }), S = M.summary(P);
  const cat = S.categories.find(c => c.name === 'Volunteer absences');
  assert(cat && cat.rows.length >= 1, 'the absence rows are listed'); assert(/Volunteer absences \(/.test(M.toText(P, S)), 'the text summary lists them');
  assert.strictEqual(S.categories.reduce((n, c) => n + c.rows.length, 0), S.rows.length, 'every row is in some category');
});

console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
