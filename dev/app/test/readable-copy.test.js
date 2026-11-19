// N40 Option A: Season.readableCopy(s) writes a second, read-only JSON with the file's codes spelled out for a person: the packed Planning Center fields as named fields, attendance marks as words,
// handbook strings split into code / date / note, blueDrops as gem and day, the color plan as quarters, History keys as words, and a name beside every child id. It never changes the data,
// it is lossless (every spelled-out value maps back to the stored one), and Season.fromJson refuses it with a plain sentence. Invented data only.
// Usage: node test/readable-copy.test.js
const assert = require('assert'), S = require('../season.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const fresh = () => {
  const s = S.blank('2026-27');
  s.roster.people = { '7000001_Test_Kid': { pc: { 'Registration ID': '7000001', 'First Name': 'Test', 'Last Name': 'Kid', Grade: '2' }, v: { 'team:Q1': 'Green', x_Active: '1' } }, '7000002_Other_Kid': { pc: { 'Registration ID': '7000002', 'First Name': 'Other', 'Last Name': 'Kid' }, v: {} } };
  s.handbooks = { '7000001_Test_Kid': 'HG 260916', '7000002_Other_Kid': "WR HG '25-26" };
  s.attendance = { '2026-09-09': { '7000001_Test_Kid': { a: 1, h: 1, p: 1, x: 1, g: 'Sparks', t: 'Red' } } };
  s.blueDrops = { '7000001_Test_Kid': ['1|2026-10-28'] };
  s.config.teamPlan = { proj: { '7000001_Test_Kid': '--BY', '7000002_Other_Kid': 'RGY-' } };
  s.history = [{ t: '2026-10-07T20:00:00.000Z', label: 'Awards 10/7', changes: [{ p: ['awards', '2026-10-07', '7000001_Test_Kid'], o: null, n: ['HG Red Jewel 1'] }] }];
  return s;
};
const ID = '7000001_Test_Kid';

test('it says plainly that it is a read-only copy, and keeps the year and version', () => {
  const r = S.readableCopy(fresh()); assert.strictEqual(r.readable, true); assert.strictEqual(r.readOnly, true); assert(/read/i.test(r.about) && /not/i.test(r.about), r.about); assert.strictEqual(r.year, '2026-27'); assert.strictEqual(r.version, S.VERSION);
});
test('every child id has a name beside it', () => { const r = S.readableCopy(fresh()); assert.strictEqual(r.who[ID], 'Test Kid'); assert.strictEqual(r.who['7000002_Other_Kid'], 'Other Kid'); });
test('the roster shows named Planning Center fields and the club\'s own fields', () => {
  const p = S.readableCopy(fresh()).roster.people[ID]; assert.strictEqual(p.name, 'Test Kid'); assert.strictEqual(p.planningCenter['First Name'], 'Test'); assert.strictEqual(p.planningCenter.Grade, '2'); assert.strictEqual(p.club['team:Q1'], 'Green');
});
test('a handbook string is split into code, date and note', () => {
  const r = S.readableCopy(fresh()); assert.deepStrictEqual(r.handbooks[ID], { code: 'HG', date: '2026-09-16', note: '' }); assert.deepStrictEqual(r.handbooks['7000002_Other_Kid'], { code: 'WR', date: '', note: "HG '25-26" });
});
test('attendance marks are words', () => {
  assert.deepStrictEqual(S.readableCopy(fresh()).attendance['2026-09-09'][ID], { present: true, handbook: true, participation: true, extra: true, group: 'Sparks', teamThatNight: 'Red' });
});
test('blueDrops are a gem and a day; the color plan names each quarter', () => {
  const r = S.readableCopy(fresh()); assert.deepStrictEqual(r.blueDrops[ID], [{ gem: 1, on: '2026-10-28' }]);
  assert.deepStrictEqual(r.config.teamPlan.proj[ID], { Q1: 'none', Q2: 'none', Q3: 'Blue', Q4: 'Yellow' }); assert.deepStrictEqual(r.config.teamPlan.proj['7000002_Other_Kid'], { Q1: 'Red', Q2: 'Green', Q3: 'Yellow', Q4: 'none' });
});
test('History keys are words', () => {
  const h = S.readableCopy(fresh()).history[0]; assert.strictEqual(h.time, '2026-10-07T20:00:00.000Z'); assert.strictEqual(h.label, 'Awards 10/7'); assert.deepStrictEqual(h.changes[0], { path: ['awards', '2026-10-07', ID], old: null, new: ['HG Red Jewel 1'] });
});
test('book codes are explained once, at the top', () => { const r = S.readableCopy(fresh()); assert.strictEqual(r.books.HG, 'Hangglider'); assert.strictEqual(r.books.AoG, 'Agents of Grace'); });
test('lossless: every spelled-out value maps back to the stored value', () => {
  const s = fresh(), r = S.readableCopy(s), L = { Red: 'R', Blue: 'B', Green: 'G', Yellow: 'Y', none: '-' }, MK = { present: 'a', handbook: 'h', participation: 'p', extra: 'x' };
  Object.keys(s.handbooks).forEach(id => assert.strictEqual(S.formatHandbook(r.handbooks[id]), s.handbooks[id], 'handbook ' + id));
  Object.keys(s.attendance).forEach(d => Object.keys(s.attendance[d]).forEach(id => { const m = r.attendance[d][id], back = {}; Object.keys(MK).forEach(w => { if (m[w]) back[MK[w]] = 1; }); if (m.group) back.g = m.group; if (m.teamThatNight) back.t = m.teamThatNight; assert.deepStrictEqual(back, s.attendance[d][id]); }));
  Object.keys(s.blueDrops).forEach(id => assert.deepStrictEqual(r.blueDrops[id].map(x => x.gem + '|' + x.on), s.blueDrops[id]));
  Object.keys(s.config.teamPlan.proj).forEach(id => assert.strictEqual(['Q1', 'Q2', 'Q3', 'Q4'].map(q => L[r.config.teamPlan.proj[id][q]]).join(''), s.config.teamPlan.proj[id]));
  assert.deepStrictEqual(r.history.map(h => ({ t: h.time, label: h.label, changes: h.changes.map(c => ({ p: c.path, o: c.old, n: c.new })) })), s.history);
});
test('making a copy never changes the data', () => { const s = fresh(), before = JSON.stringify(s); S.readableCopy(s); assert.strictEqual(JSON.stringify(s), before); });
test('a section the copy does not spell out is carried over unchanged', () => { const s = fresh(); s.awards = { '2026-10-07': { [ID]: ['HG Red Jewel 1'] } }; assert.deepStrictEqual(S.readableCopy(s).awards, s.awards); });
test('Season.fromJson refuses the copy with a plain sentence, and still opens the real file', () => {
  const s = fresh(); assert.throws(() => S.fromJson(JSON.stringify(S.readableCopy(s))), /readable copy.*(for reading|read only|reading only)/i);
  assert.doesNotThrow(() => S.fromJson(S.toJson(s)));
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
