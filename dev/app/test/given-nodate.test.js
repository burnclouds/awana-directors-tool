// "Given, date unknown": an award can be marked given with no date. The day the box was ticked is kept internally, but no report or screen shows it as a real given date. Invented test club only.
// Usage: node test/given-nodate.test.js
const assert = require('assert');
const S = require('../season.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }

test('marking given with no date keeps the ticked day inside, but the shown date is empty and it still counts as given', () => {
  const s = S.blank('2026-27'); S.addAward(s, '2026-10-21', 'k1', 'Red Jewel 1');
  assert.strictEqual(S.waitingToGive(s).length, 1);
  S.setGiven(s, 'k1', 'Red Jewel 1', '2026-11-03', { noDate: true });
  assert.strictEqual((s.given.k1 || {})['Red Jewel 1'], '2026-11-03', 'the ticked day is kept');
  assert.strictEqual(S.isGivenNoDate(s, 'k1', 'Red Jewel 1'), true); assert.strictEqual(S.givenShown(s, 'k1', 'Red Jewel 1'), '', 'no date to show');
  assert.strictEqual(S.waitingToGive(s).length, 0, 'counts as given: not waiting any more');
});
test('a real date replaces the no-date mark, and un-giving clears both', () => {
  const s = S.blank('2026-27'); S.setGiven(s, 'k1', 'Red Jewel 1', '2026-11-03', { noDate: true });
  S.setGiven(s, 'k1', 'Red Jewel 1', '2026-10-28'); assert.strictEqual(S.isGivenNoDate(s, 'k1', 'Red Jewel 1'), false); assert.strictEqual(S.givenShown(s, 'k1', 'Red Jewel 1'), '2026-10-28');
  S.setGiven(s, 'k1', 'Red Jewel 1', '2026-11-03', { noDate: true }); S.setGiven(s, 'k1', 'Red Jewel 1', ''); assert.deepStrictEqual(s.given, {}); assert.deepStrictEqual(s.givenNoDate, {}, 'the mark goes with the date');
});
test('un-announcing leaves the no-date mark, and renaming an award carries it along', () => {
  const s = S.blank('2026-27'); S.addAward(s, '2026-10-21', 'k1', 'Flight 3:16'); S.setGiven(s, 'k1', 'Flight 3:16', '2026-11-03', { noDate: true });
  S.removeAward(s, '2026-10-21', 'k1', 'Flight 3:16'); assert.deepStrictEqual(s.givenNoDate, { k1: ['Flight 3:16'] }, 'Given is independent of Announced');
  // Opening any file renames the old "SS Review Emblem - Yellow" to Red (renameAward); the mark moves with its award.
  const o = JSON.parse(S.toJson(S.blank('2026-27'))); o.given = { k2: { 'SS Review Emblem - Yellow': '2026-11-03' } }; o.givenNoDate = { k2: ['SS Review Emblem - Yellow'] };
  const t = S.fromJson(JSON.stringify(o)); assert.strictEqual(S.isGivenNoDate(t, 'k2', 'SS Review Emblem - Red'), true); assert.strictEqual(S.isGivenNoDate(t, 'k2', 'SS Review Emblem - Yellow'), false);
});
test('the file stays small: nothing is written when no award is marked no-date, and files with it round trip; an older file opens', () => {
  const s = S.blank('2026-27'); S.setGiven(s, 'k1', 'Red Jewel 1', '2026-10-28'); assert(!('givenNoDate' in JSON.parse(S.toJson(s))), 'an empty mark list is not written');
  S.setGiven(s, 'k1', 'Green Jewel 1', '2026-11-03', { noDate: true }); const t = S.fromJson(S.toJson(s)); assert.strictEqual(S.isGivenNoDate(t, 'k1', 'Green Jewel 1'), true); assert.strictEqual(S.isGivenNoDate(t, 'k1', 'Red Jewel 1'), false);
  const old = JSON.parse(S.toJson(S.blank('2026-27'))); delete old.givenNoDate; assert.deepStrictEqual(S.fromJson(JSON.stringify(old)).givenNoDate, {}, 'an older file has none');
});
test('history logs the mark by name and undo restores it', () => {
  const s = S.blank('2026-27'); s.roster.people.k1 = { 'First Name': 'Pat', 'Last Name': 'Test' };
  const b = S.snapshot(s); S.setGiven(s, 'k1', 'Red Jewel 1', '2026-11-03', { noDate: true }); const e = S.record(s, b, { prefix: 'Awards', separate: true });
  assert(e && e.changes.some(c => /no date/i.test(S.describe(c, id => id))), 'a history line says no date: ' + JSON.stringify((e || {}).changes));
  S.applyChanges(s, e.changes, true); assert.deepStrictEqual(s.given, {}); assert.deepStrictEqual(s.givenNoDate, {});
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
