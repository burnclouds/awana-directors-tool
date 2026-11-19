// Earned -> Announced -> Given: the Given record, the upgrade of older files, history and undo of Given. Invented test club only.
// Usage: node test/awards-lifecycle.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const S = require('../season.js'), M = require('../model.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const dir = path.join(__dirname, '..', '..', 'test-data'), file = fs.readdirSync(dir).find(f => /TEST.*\.json$/.test(f));

test('an award can be marked given before it is announced; announcing, giving and un-giving round trip', () => {
  const s = S.blank('2026-27');
  S.setGiven(s, 'k1', 'Red Jewel 1', '2026-10-20'); assert.strictEqual((s.given.k1 || {})['Red Jewel 1'], '2026-10-20', 'handed over before the announcement'); S.setGiven(s, 'k1', 'Red Jewel 1', '');
  S.addAward(s, '2026-10-21', 'k1', 'Red Jewel 1'); S.addAward(s, '2026-10-21', 'k1', 'Green Jewel 1');
  assert.deepStrictEqual(S.waitingToGive(s).map(w => w.award), ['Green Jewel 1', 'Red Jewel 1']);
  S.setGiven(s, 'k1', 'Red Jewel 1', '2026-10-28'); assert.deepStrictEqual((s.given.k1 || {}), { 'Red Jewel 1': '2026-10-28' }); assert.deepStrictEqual(S.waitingToGive(s).map(w => w.award), ['Green Jewel 1']);
  S.setGiven(s, 'k1', 'Red Jewel 1', ''); assert.deepStrictEqual((s.given.k1 || {}), {}); assert.strictEqual(S.waitingToGive(s).length, 2);
  assert.throws(() => S.setGiven(s, 'k1', 'Red Jewel 1', 'tomorrow'), /Bad date/);
});
test('un-announcing an award leaves its Given date alone: Announced and Given are independent', () => {
  const s = S.blank('2026-27'); S.addAward(s, '2026-10-21', 'k1', 'Silver 1'); S.setGiven(s, 'k1', 'Silver 1', '2026-10-28');
  S.addAward(s, '2026-10-28', 'k1', 'Silver 1'); S.removeAward(s, '2026-10-21', 'k1', 'Silver 1'); assert.strictEqual((s.given.k1 || {})['Silver 1'], '2026-10-28');
  S.removeAward(s, '2026-10-28', 'k1', 'Silver 1'); assert.strictEqual((s.given.k1 || {})['Silver 1'], '2026-10-28', 'still given after the last announcement is removed');
});
test('a file from before the Given check opens with nothing given (Given is only ever entered by a person), and the next save writes the new version', () => {
  const old = S.blank('2025-26'); old.version = 2; delete old.given; old.awards = { '2025-10-14': { a1: ['Silver 1', 'Red Jewel 1'] }, '2025-10-21': { a1: ['Green Jewel 1'], a2: ['Silver 1'] } };
  const s = S.fromJson(JSON.stringify(old)); assert.deepStrictEqual(s.given, {}, 'no given dates made up');
  assert.strictEqual(S.waitingToGive(s).length, 4, 'everything announced waits to be given'); assert.strictEqual(JSON.parse(S.toJson(s)).version, S.VERSION);
});
test('Given dates nobody entered are found from the History and can be cleared; ticked ones are kept', () => {
  const s = S.blank('2026-27'); s.given = { a: { 'Red Jewel 1': '2026-10-28', 'Green Jewel 1': '2026-10-28' }, b: { 'Silver 1': '2026-10-21' } }; s.awards = { '2026-10-28': { a: ['Red Jewel 1', 'Green Jewel 1'] }, '2026-10-21': { b: ['Silver 1'] } };
  const before = S.snapshot(s); S.setGiven(s, 'a', 'Red Jewel 1', '2026-11-03'); S.record(s, before);      // a person set this one: it is in the History
  const list = S.assumedGiven(s).map(x => x.id + ':' + x.award).sort(); assert.deepStrictEqual(list, ['a:Green Jewel 1', 'b:Silver 1']);
  const n = S.clearAssumedGiven(s); assert.strictEqual(n, 2); assert.deepStrictEqual(s.given, { a: { 'Red Jewel 1': '2026-11-03' } }); assert.strictEqual(S.waitingToGive(s).length, 2, 'the cleared ones wait to be given');
  const b2 = S.snapshot(s); S.setGiven(s, 'a', 'Red Jewel 1', ''); S.record(s, b2); S.setGiven(s, 'a', 'Red Jewel 1', '2026-11-04'); S.record(s, S.snapshot({ ...s, given: {} }));      // given, then un-given, then given again: still a person's entry
  assert.deepStrictEqual(S.assumedGiven(s), [], 'nothing left that nobody entered');
});
test('the test club\'s file opens, and Given is part of history: a change is logged by name, can be rebuilt at any version, and undone', () => {
  const s = S.fromJson(fs.readFileSync(path.join(dir, file), 'utf8')), id = Object.keys(s.roster.people)[0], h0 = s.history.length;
  const b0 = S.snapshot(s); S.addAward(s, '2026-10-21', id, 'Test Award'); S.record(s, b0, { separate: true });
  const b1 = S.snapshot(s); S.setGiven(s, id, 'Test Award', '2026-10-28'); const e2 = S.record(s, b1, { prefix: 'Awards', separate: true });
  const change = e2.changes.find(c => c.p[0] === 'given'); assert(change, JSON.stringify(e2.changes)); assert(/given 10\/28/.test(S.describe(change, x => x)), S.describe(change, x => x)); assert(/Awards given/.test(e2.label), e2.label);
  assert.strictEqual(s.history.length, h0 + 2);
  assert(!(S.at(s, h0 + 1).given[id] || {})['Test Award'], 'the version before: not given'); assert.deepStrictEqual(S.snapshot(S.at(s, h0 + 2)), S.snapshot(s), 'the latest version is the file as it is');
  S.applyChanges(s, e2.changes, true); assert(!(s.given[id] || {})['Test Award'], 'undo removes the Given date');
});
test('a version-3 file (one "rev" box per jewel, SS Review Emblem - Yellow) opens with the new Sparks template and the red name; its dates stay', () => {
  const old = S.blank('2026-27'); old.version = 3;
  old.config.progress.Sparks.perBook.forEach(b => { if (b.items.includes('5')) b.items = ['1', '2', '3', '4', 'rev']; delete b.review; }); delete old.config.progress.Sparks.bookReview;
  old.config.awardLists.Sparks = old.config.awardLists.Sparks.map(a => a === 'SS Review Emblem - Red' ? 'SS Review Emblem - Yellow' : a);
  old.progress = { k1: { SS: { 'GJ1.1': '2026-10-14', 'GJ1.rev': '2026-10-14' } } }; old.awards = { '2026-10-21': { k1: ['SS Review Emblem - Yellow'] } }; old.given = { k1: { 'SS Review Emblem - Yellow': '2026-10-28' } };
  const s = S.fromJson(JSON.stringify(old));
  assert.deepStrictEqual(s.config.progress.Sparks.perBook[1].review, ['5', '6', '7', '8']); assert(s.config.progress.Sparks.bookReview);
  assert.deepStrictEqual(s.config.progress['T&T'], old.config.progress['T&T'], 'T&T is untouched');
  assert(s.config.awardLists.Sparks.includes('SS Review Emblem - Red') && !s.config.awardLists.Sparks.includes('SS Review Emblem - Yellow'));
  assert.deepStrictEqual(s.awards['2026-10-21'].k1, ['SS Review Emblem - Red']); assert.deepStrictEqual(s.given.k1, { 'SS Review Emblem - Red': '2026-10-28' });
  assert.strictEqual(s.progress.k1.SS['GJ1.rev'], '2026-10-14', 'the old single review date is kept'); assert.strictEqual(JSON.parse(S.toJson(s)).version, S.VERSION);
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
