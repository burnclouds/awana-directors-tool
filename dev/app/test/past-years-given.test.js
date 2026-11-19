// "Mark past years given": awards earned before this season's first club night can be marked given with no date, per child or for the whole club. Invented test club only.
// Usage: node test/past-years-given.test.js
const assert = require('assert');
const S = require('../season.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const sign = (s, id, book, block, items, date) => items.forEach(i => S.setProgress(s, id, book, block + '.' + i, date));
function club() {
  const s = S.blank('2026-27');
  s.calendar = [{ Date: '2026-09-16', Quarter: 'Q1' }, { Date: '2026-09-23', Quarter: 'Q1' }, { Date: '2026-12-02', Type: 'Event', Quarter: 'Q2' }];
  sign(s, 'k1', 'common', 'FLT', ['1', '2', '3', '4', '5', '6'], '2025-03-05');        // the Flight 3:16 booklet, an earlier year (not an award: it earns nothing, N23)
  sign(s, 'k1', 'HG', 'RJ1', ['1', '2', '3', '4'], '2025-04-02');                       // Red Jewel 1 + Pilot Wing, an earlier year
  sign(s, 'k1', 'HG', 'GJ1', ['1', '2', '3', '4'], '2026-10-14');                       // Green Jewel 1, this year
  sign(s, 'k2', 'AoG', 'BE1', ['1.1', '1.2', '1.3'], '2025-10-08');                      // a T&T child, Blue Emblem 1 in an earlier year
  return s;
}
test('the first club night is the start of the season; an Event does not count', () => {
  const s = club(); assert.strictEqual(S.firstNight(s), '2026-09-16');
  assert.strictEqual(S.firstNight(S.blank('x')), '');
});
test('only awards finished before the first night are listed, and only the ones not yet given', () => {
  const s = club(); assert.deepStrictEqual(S.pastYearAwards(s, 'k1').sort(), ['HG Pilot Wing', 'HG Red Jewel 1']);
  S.setGiven(s, 'k1', 'HG Red Jewel 1', '2025-04-09'); assert.deepStrictEqual(S.pastYearAwards(s, 'k1').sort(), ['HG Pilot Wing']);
  assert.deepStrictEqual(S.pastYearAwards(s, 'k2'), ['AoG Blue Emblem 1']);
});
test('marking one child: given with no date, nothing shown as a date, this year\'s award untouched, an existing date kept', () => {
  const s = club(); S.setGiven(s, 'k1', 'HG Red Jewel 1', '2025-04-09');
  const r = S.markPastYearsGiven(s, '2026-11-04', ['k1']); assert.deepStrictEqual(r, { awards: 1, kids: 1 });
  assert.strictEqual(S.isGivenNoDate(s, 'k1', 'HG Pilot Wing'), true); assert.strictEqual(S.givenShown(s, 'k1', 'HG Pilot Wing'), '');
  assert.strictEqual(S.givenShown(s, 'k1', 'HG Red Jewel 1'), '2025-04-09', 'a real date stays');
  assert.strictEqual((s.given.k1 || {})['HG Green Jewel 1'], undefined, 'this year\'s award is not touched');
  assert.strictEqual((s.given.k2 || {})['Start Zone 1'], undefined, 'another child is not touched');
});
test('the whole club: everyone with a record; running it again changes nothing', () => {
  const s = club(); assert.deepStrictEqual(S.markPastYearsGiven(s, '2026-11-04'), { awards: 3, kids: 2 });
  assert.deepStrictEqual(S.markPastYearsGiven(s, '2026-11-04'), { awards: 0, kids: 0 });
});
test('an award marked this way is no longer offered for announcing, and it is not "waiting to give"', () => {
  const s = club(); assert.strictEqual(S.suggestedAwards(s, 'k1', 'Sparks').some(a => a.award === 'HG Red Jewel 1'), false, 'an earlier-year award is not offered even before marking');
  S.markPastYearsGiven(s, '2026-11-04');
  const left = S.suggestedAwards(s, 'k1', 'Sparks').map(a => a.award); assert.deepStrictEqual(left, ['HG Green Jewel 1'], 'this year\'s stays');
  assert.strictEqual(S.waitingToGive(s).length, 0);
});
test('an earlier-year award is never offered for announcing, marked or not, given with a date or not', () => {
  const s = club(); const names = () => S.suggestedAwards(s, 'k1', 'Sparks').map(a => a.award).sort();
  assert.deepStrictEqual(names(), ['HG Green Jewel 1'], 'only this year\'s');
  S.setGiven(s, 'k1', 'HG Red Jewel 1', '2025-04-09'); assert.deepStrictEqual(names(), ['HG Green Jewel 1'], 'given with a date: still not offered');
  S.markPastYearsGiven(s, '2026-11-04'); assert.deepStrictEqual(names(), ['HG Green Jewel 1']);
});
test('with no club nights on the calendar it refuses, rather than guessing a start', () => {
  const s = S.blank('x'); sign(s, 'k1', 'common', 'FLT', ['1', '2', '3', '4', '5', '6'], '2025-03-05');
  assert.throws(() => S.markPastYearsGiven(s, '2026-11-04'), /calendar/);
});
test('the file stays small and round trips', () => {
  const s = club(); S.markPastYearsGiven(s, '2026-11-04'); const t = S.fromJson(S.toJson(s));
  assert.strictEqual(S.isGivenNoDate(t, 'k1', 'HG Pilot Wing'), true); assert.deepStrictEqual(S.pastYearAwards(t, 'k1'), []);
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
