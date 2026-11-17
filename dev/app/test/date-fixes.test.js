// Dates that are not real in an opened data file: found, guessed, corrected or removed, with nights merged when a corrected date already exists.
// Usage: node test/date-fixes.test.js
const assert = require('assert'), S = require('../season.js'), V = require('../validate.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const D = '2026-09-09';
function broken() {
  const s = S.blank('2026-27');
  s.attendance = { [D]: { k1: { a: 1, t: 'Red' } }, '2026-9-9': { k1: { a: 1, t: 'Blue' }, k2: { a: 1 } }, soon: { k3: { a: 1 } } };
  s.awards = { '2026-13-45': { k1: ['Alpha'] } };
  s.given = { k1: { 'Blue Jewel 1': 'nope', Alpha: D } };
  s.progress = { k1: { HG: { '1.1': '2026-02-30' } } };
  s.teamMoves = { k1: [{ q: 'Q1', from: 'x', team: 'Red' }, { q: 'Q1', from: D, team: 'Red' }] };
  s.calendar = [{ Date: 'zzz', Theme: 'T' }, { Date: D }];
  return s;
}
const find = (items, v) => items.find(i => i.value === v);
const asJson = s => JSON.parse(S.toJson(s));

test('isRealDate rejects shapes and calendar impossibilities', () => {
  ['2026-09-09', '2028-02-29'].forEach(d => assert(S.isRealDate(d), d));
  ['2026-13-45', '2026-02-30', '2027-02-29', '2026-9-9', 'x', '', null, undefined, 20260909, '<b>'].forEach(d => assert(!S.isRealDate(d), String(d)));
});
test('needDate now refuses 2026-13-45 as well', () => { assert.throws(() => S.setMark(S.blank('x'), '2026-13-45', 'k1', 'a', 1)); });
test('badDates finds every place a date lives, and none for a clean file', () => {
  const items = S.badDates(broken());
  assert.deepStrictEqual(items.map(i => i.section + ':' + i.value).sort(), ['attendance:2026-9-9', 'attendance:soon', 'awards:2026-13-45', 'calendar:zzz', 'given:nope', 'progress:2026-02-30', 'teamMoves:x']);
  assert.strictEqual(S.badDates(S.blank('2026-27')).length, 0);
});
test('fromJson still opens a file with bad dates (so they can be repaired)', () => { assert.strictEqual(S.badDates(S.fromJson(S.toJson(broken()))).length, 7); });
test('guessDate: separators, US order, compact, clamped day; nothing for nonsense', () => {
  assert.strictEqual(S.guessDate('2026-9-9'), D); assert.strictEqual(S.guessDate('9/9/2026'), D); assert.strictEqual(S.guessDate('20260909'), D);
  assert.strictEqual(S.guessDate('2026-02-30'), '2026-02-28'); assert.strictEqual(S.guessDate('2026-09-09T12:00:00Z'), D);
  ['soon', '2026-13-45', '', null, undefined, '<img src=x>'].forEach(v => assert.strictEqual(S.guessDate(v), '', String(v)));
});
test('fix: a value is replaced, a night is re-keyed', () => {
  const s = broken(), it = S.badDates(s);
  S.fixDates(s, [{ item: find(it, '2026-02-30'), action: 'fix', to: '2026-02-28' }, { item: find(it, '2026-13-45'), action: 'fix', to: '2026-09-16' }]);
  assert.strictEqual(s.progress.k1.HG['1.1'], '2026-02-28'); assert.deepStrictEqual(s.awards, { '2026-09-16': { k1: ['Alpha'] } });
});
test('fix onto an existing night merges; a clash is decided by prefer', () => {
  const pick = prefer => { const s = broken(), it = S.badDates(s), i = find(it, '2026-9-9'); assert.strictEqual(S.dateClashes(s, i, D), 1); S.fixDates(s, [{ item: i, action: 'fix', to: D, prefer }]); return s.attendance[D]; };
  assert.deepStrictEqual(pick('existing'), { k1: { a: 1, t: 'Red' }, k2: { a: 1 } });
  assert.deepStrictEqual(pick('new'), { k1: { a: 1, t: 'Blue' }, k2: { a: 1 } });
});
test('merging award lists joins them without repeats and counts no clash', () => {
  const s = S.blank('x'); s.awards = { [D]: { k1: ['Alpha', 'Beta'] }, 'bad-1': { k1: ['Beta', 'Gamma'] } };
  const i = S.badDates(s)[0]; assert.strictEqual(S.dateClashes(s, i, D), 0);
  S.fixDates(s, [{ item: i, action: 'fix', to: D, prefer: 'existing' }]); assert.deepStrictEqual(s.awards[D].k1, ['Alpha', 'Beta', 'Gamma']);
});
test('remove: nights, values and list entries go; empty parents are tidied; later indexes stay right', () => {
  const s = broken(); s.teamMoves.k1.unshift({ q: 'Q1', from: 'y', team: 'Blue' }); s.calendar.unshift({ Date: 'also bad' });
  const n = S.fixDates(s, S.badDates(s).map(item => ({ item, action: 'remove' })));
  assert.strictEqual(n.removed, 9); assert.strictEqual(S.badDates(s).length, 0);
  assert.deepStrictEqual(s.teamMoves, { k1: [{ q: 'Q1', from: D, team: 'Red' }] }); assert.deepStrictEqual(s.calendar, [{ Date: D }]);
  assert.deepStrictEqual(s.given, { k1: { Alpha: D } }); assert.deepStrictEqual(s.progress, {}); assert.deepStrictEqual(Object.keys(s.attendance), [D]);
});
test('a fix to a date that is not real is refused, and nothing is half-applied', () => {
  const s = broken(), before = S.toJson(s), it = S.badDates(s);
  assert.throws(() => S.fixDates(s, [{ item: it[0], action: 'fix', to: D }, { item: it[1], action: 'fix', to: '2026-13-01' }]), /not a real date/);
  assert.strictEqual(S.toJson(s), before);
});
test('after fixing everything the file is clean, validates without date errors, and a script in a date never survives as a key', () => {
  const s = S.blank('x'); s.attendance = { '<img src=x onerror=alert(1)>': { k1: { a: 1 } } };
  const it = S.badDates(s); assert.strictEqual(it[0].value, '<img src=x onerror=alert(1)>');
  S.fixDates(s, [{ item: it[0], action: 'fix', to: D }]);
  assert(!S.toJson(s).includes('<img')); assert.strictEqual(S.badDates(S.fromJson(S.toJson(s))).length, 0);
  assert(!V.validate(S.toJson(s), 'x.json').findings.some(f => /real date/.test(f.msg)));
});
test('the history record of a fix shows only the date changes', () => {
  const s = broken(), before = S.snapshot(s), it = S.badDates(s);
  S.fixDates(s, [{ item: find(it, '2026-02-30'), action: 'fix', to: '2026-02-28' }]);
  const e = S.record(s, before, { separate: true }); assert.deepStrictEqual(e.changes.map(c => c.p), [['progress', 'k1', 'HG', '1.1']]);
});

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
