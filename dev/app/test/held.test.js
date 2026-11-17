// Holds: an earned award held off the slides. Stored as held[id] = { award: 1 }, left out of the file while empty.
// Usage: node test/held.test.js
const assert = require('assert');
const S = require('../season.js');
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); }
}

test('setHold adds and removes a held award; an empty child is dropped', () => {
  const s = S.blank('2026-27');
  assert.deepStrictEqual(s.held, {});
  S.setHold(s, 'k1', 'Red Jewel 1', true); S.setHold(s, 'k1', 'Blue Jewel 1', true); S.setHold(s, 'k1', 'Red Jewel 1', true);
  assert.deepStrictEqual(s.held, { k1: { 'Blue Jewel 1': 1, 'Red Jewel 1': 1 } }, 'no duplicates');
  assert.strictEqual(S.isHeld(s, 'k1', 'Red Jewel 1'), true);
  S.setHold(s, 'k1', 'Red Jewel 1', false); assert.deepStrictEqual(s.held, { k1: { 'Blue Jewel 1': 1 } });
  S.setHold(s, 'k1', 'Blue Jewel 1', false); assert.deepStrictEqual(s.held, {}, 'the child is dropped with the last hold');
  assert.strictEqual(S.isHeld(s, 'k1', 'Blue Jewel 1'), false);
});

test('held is not written while empty, and round-trips when it is not', () => {
  const s = S.blank('2026-27');
  assert(!('held' in JSON.parse(S.toJson(s))), 'an empty hold list is not written');
  S.setHold(s, 'k1', 'Red Jewel 1', true);
  assert.deepStrictEqual(JSON.parse(S.toJson(s)).held, { k1: { 'Red Jewel 1': 1 } });
  assert.deepStrictEqual(S.fromJson(S.toJson(s)).held, { k1: { 'Red Jewel 1': 1 } });
});

test('an older file without held opens with none', () => {
  const o = JSON.parse(S.toJson(S.blank('2026-27'))); delete o.held;
  assert.deepStrictEqual(S.fromJson(JSON.stringify(o)).held, {});
});

test('a hold is a History change with words, and Undo takes it back', () => {
  const s = S.blank('2026-27'), before = S.snapshot(s);
  S.setHold(s, 'k1', 'Red Jewel 1', true);
  const changes = S.diff(before, S.snapshot(s));
  assert(changes.some(c => c.p[0] === 'held'), 'held is a tracked section');
  const text = S.describe(changes.find(c => c.p[0] === 'held'), id => id);
  assert(/held off the slides: Red Jewel 1/.test(text), text);
  S.applyChanges(s, changes, true); assert.deepStrictEqual(s.held, {});
});

test('renaming an award renames it inside held too', () => {
  const s = S.blank('2026-27'); S.setHold(s, 'k1', 'Old Name', true);
  S.renameAward(s, 'Old Name', 'New Name');
  assert.deepStrictEqual(s.held, { k1: { 'New Name': 1 } });
});

test('merging two people\'s holds for the same child keeps both', () => {
  const base = S.blank('2026-27'), ours = JSON.parse(JSON.stringify(base)), theirs = JSON.parse(JSON.stringify(base));
  S.setHold(ours, 'k1', 'Red Jewel 1', true); S.setHold(theirs, 'k1', 'Blue Jewel 1', true);
  const m = S.merge3(S.snapshot(base), ours, theirs);
  assert.deepStrictEqual(m.conflicts, [], 'two holds on one child are not a clash');
  assert.deepStrictEqual(Object.keys(m.season.held.k1).sort(), ['Blue Jewel 1', 'Red Jewel 1']);
});

test('the Blue Jewel counts are checked when a file is opened: a list of rising whole numbers is kept, anything else (text, markup, repeats) falls back to the defaults', () => {
  const open = w => { const o = JSON.parse(S.toJson(S.blank('2026-27'))); o.config.blueJewelWeeks = w; return S.fromJson(JSON.stringify(o)).config.blueJewelWeeks; };
  assert.deepStrictEqual(open([5, 10, 20, 30]), [5, 10, 20, 30]); assert.deepStrictEqual(open([6, 12]), [6, 12], 'fewer than four is still allowed');
  const dflt = S.blank('2026-27').config.blueJewelWeeks;
  [['<img src=x onerror=alert(1)>', 2, 3, 4], [6, 6, 7, 8], [0, 1, 2, 3], [1.5, 2, 3, 4], 'six', [], [1, 2, 3, 4, 5], [1, 2, 3, 100000]].forEach(w => assert.deepStrictEqual(open(w), dflt, JSON.stringify(w)));
});

test('renaming an award renames it inside "told to the group, no date" too (R20 side finding)', () => {
  const s = S.blank('2026-27'); S.setAnnNoDate(s, 'k1', 'Old Name', true); S.setAnnNoDate(s, 'k1', 'Other', true);
  S.renameAward(s, 'Old Name', 'New Name');
  assert.deepStrictEqual(s.announcedNoDate, { k1: ['New Name', 'Other'] });
});

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
