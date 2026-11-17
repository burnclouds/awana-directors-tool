// Merging two people's saves of the shared data file (Season.merge3): what this copy changed since it opened is replayed onto the file as it is now.
// Usage: node test/merge.test.js
const assert = require('assert'), S = require('../season.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const clone = o => JSON.parse(JSON.stringify(o));
// A starting file with two children marked on 10/21 and 10/28, as the first person opened it.
function start() { const s = S.blank('2026-27'); ['a', 'b'].forEach(id => { s.roster.people[id] = { pc: {}, v: {} }; }); S.setMark(s, '2026-10-21', 'a', 'a', 1); S.setMark(s, '2026-10-21', 'b', 'a', 1); S.setMark(s, '2026-10-28', 'a', 'a', 1); S.record(s, S.snapshot(S.blank('2026-27')), { now: '2026-10-21T20:00:00Z' }); return s; }
// Two copies that both opened `start()`: edit each, then merge ours onto theirs.
function fork(editOurs, editTheirs) {
  const base = start(), baseSnap = S.snapshot(base), ours = clone(base), theirs = clone(base);
  editOurs(ours); editTheirs(theirs); return { baseSnap, ours, theirs, r: S.merge3(baseSnap, ours, theirs, { now: '2026-10-28T21:00:00Z', from: 'Sam' }) };
}
const att = (s, d, id) => (s.attendance[d] || {})[id];

test('edits in different places both survive; the result is theirs plus one new history entry that undoes cleanly', () => {
  const { r, theirs } = fork(s => S.setMark(s, '2026-10-28', 'b', 'a', 1), s => S.setMark(s, '2026-10-28', 'a', 'h', 1));
  assert.deepStrictEqual(att(r.season, '2026-10-28', 'b'), { a: 1 }); assert.deepStrictEqual(att(r.season, '2026-10-28', 'a'), { a: 1, h: 1 });
  assert.strictEqual(r.conflicts.length, 0); assert.strictEqual(r.season.history.length, theirs.history.length + 1);
  assert(/^Merged \(Sam\): /.test(r.season.history.at(-1).label), r.season.history.at(-1).label);
  assert.deepStrictEqual(S.snapshot(S.at(r.season, theirs.history.length)), S.snapshot(theirs), 'undoing the merge entry gives their file back');
});
test('the same edit made by both is not repeated, and with nothing of ours to add there is no new history entry', () => {
  const { r, theirs } = fork(s => S.setMark(s, '2026-10-28', 'b', 'a', 1), s => S.setMark(s, '2026-10-28', 'b', 'a', 1));
  assert.strictEqual(r.applied, 0); assert(r.agreed >= 1); assert.strictEqual(r.season.history.length, theirs.history.length);
  const none = fork(() => {}, s => S.setMark(s, '2026-10-28', 'b', 'h', 1)); assert.strictEqual(none.r.changed, 0); assert.deepStrictEqual(att(none.r.season, '2026-10-28', 'b'), { h: 1 });
});
test('the same place changed to different values is a conflict: theirs is kept and ours is listed', () => {
  const set = (s, v) => { s.progress.a = { HG: { 'R.1': v } }; };
  const base = start(); set(base, '2026-10-01'); const bs = S.snapshot(base), ours = clone(base), theirs = clone(base); set(ours, '2026-10-02'); set(theirs, '2026-10-03');
  const r = S.merge3(bs, ours, theirs); assert.strictEqual(r.season.progress.a.HG['R.1'], '2026-10-03');
  assert.strictEqual(r.conflicts.length, 1); assert.deepStrictEqual(r.conflicts[0].path, ['progress', 'a', 'HG', 'R.1']); assert.strictEqual(r.conflicts[0].ours, '2026-10-02');
});
test('a whole night removed here while someone marked a child on it: the night is kept, as one conflict', () => {
  const { r } = fork(s => { delete s.attendance['2026-10-21']; }, s => S.setMark(s, '2026-10-21', 'a', 'h', 1));
  assert.deepStrictEqual(att(r.season, '2026-10-21', 'a'), { a: 1, h: 1 }); assert.deepStrictEqual(att(r.season, '2026-10-21', 'b'), { a: 1 }, 'not half-deleted');
  assert.strictEqual(r.conflicts.length, 1); assert.deepStrictEqual(r.conflicts[0].path, ['attendance', '2026-10-21']);
});
test('a whole night or child removed here that nobody touched is removed, with no empty leftovers', () => {
  const { r } = fork(s => { delete s.attendance['2026-10-21']; delete s.attendance['2026-10-28'].a; }, s => S.setMark(s, '2026-10-28', 'b', 'a', 1));
  assert.strictEqual(r.season.attendance['2026-10-21'], undefined); assert.strictEqual(att(r.season, '2026-10-28', 'a'), undefined); assert.deepStrictEqual(att(r.season, '2026-10-28', 'b'), { a: 1 }); assert.strictEqual(r.conflicts.length, 0);
});
test('someone removed a night while this copy edited a mark inside it: a conflict, nothing of theirs is overwritten', () => {
  const { r } = fork(s => S.setMark(s, '2026-10-21', 'a', 'h', 1), s => { delete s.attendance['2026-10-21']; });
  assert.strictEqual(r.season.attendance['2026-10-21'], undefined); assert(r.conflicts.length >= 1 && r.conflicts[0].path[0] === 'attendance');
});
test('two people who both start the same new night each keep their own marks', () => {
  const base = start(), bs = S.snapshot(base), ours = clone(base), theirs = clone(base);
  S.setMark(ours, '2026-11-04', 'a', 'a', 1); S.setMark(theirs, '2026-11-04', 'b', 'a', 1); S.setMark(ours, '2026-11-04', 'b', 'h', 1);
  const r = S.merge3(bs, ours, theirs); assert.deepStrictEqual(att(r.season, '2026-11-04', 'a'), { a: 1 }); assert.deepStrictEqual(att(r.season, '2026-11-04', 'b'), { a: 1, h: 1 }, 'theirs was there, ours was added to it');
  assert.strictEqual(r.conflicts.length, 0, JSON.stringify(r.conflicts));
  const clash = S.merge3(bs, ((o) => { S.setMark(o, '2026-11-04', 'a', 'a', 1); return o; })(clone(base)), ((o) => { o.attendance['2026-11-04'] = { a: { a: 1, h: 1 } }; return o; })(clone(base)));
  assert.deepStrictEqual(att(clash.season, '2026-11-04', 'a'), { a: 1, h: 1 }); assert.strictEqual(clash.conflicts.length, 0, 'the same mark on the same child, plus theirs extra: nothing of ours is lost');
});
test('roster, calendar and settings edits by different people combine', () => {
  const { r } = fork(s => { s.roster.people.a.v.x_Notes = 'allergy'; s.config.clubDay = 4; }, s => { s.roster.people.b.v.team1 = 'Red'; s.calendar.push({ Date: '2026-11-04', Type: 'Club night', Quarter: 'Q2' }); });
  assert.strictEqual(r.season.roster.people.a.v.x_Notes, 'allergy'); assert.strictEqual(r.season.roster.people.b.v.team1, 'Red'); assert.strictEqual(r.season.config.clubDay, 4); assert.strictEqual(r.season.calendar.length, 1);
});
test('the merged file passes the same round trip as any other (JSON out and back, history still rebuilds every version)', () => {
  const { r } = fork(s => S.setMark(s, '2026-10-28', 'b', 'a', 1), s => S.setMark(s, '2026-10-28', 'a', 'h', 1));
  const back = S.fromJson(S.toJson(r.season)); assert.deepStrictEqual(S.snapshot(back), S.snapshot(r.season));
  for (let i = 0; i <= back.history.length; i++) S.at(back, i);
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
