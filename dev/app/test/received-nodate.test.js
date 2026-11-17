// Book received, date unknown ("no date"): counts as received, shows no day, a real date replaces it, un-ticking clears it. Invented ids only.
// Usage: node test/received-nodate.test.js
const assert = require('assert');
const S = require('../season.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }

test('no date counts as received but shows no day', () => {
  const s = S.blank('2026-27'); S.setReceived(s, 'k1', 'HG', '', { noDate: true });
  assert.strictEqual(S.isReceivedNoDate(s, 'k1', 'HG'), true); assert(S.receivedOf(s, 'k1', 'HG'), 'still truthy: the child has the book'); assert.strictEqual(S.receivedShown(s, 'k1', 'HG'), '');
});
test('a real date typed later replaces the mark; clearing removes it', () => {
  const s = S.blank('2026-27'); S.setReceived(s, 'k1', 'HG', '', { noDate: true }); S.setReceived(s, 'k1', 'HG', '2026-09-16');
  assert.strictEqual(S.isReceivedNoDate(s, 'k1', 'HG'), false); assert.strictEqual(S.receivedShown(s, 'k1', 'HG'), '2026-09-16');
  S.setReceived(s, 'k1', 'HG', '', { noDate: true }); S.setReceived(s, 'k1', 'HG', ''); assert.deepStrictEqual(s.received, {}, 'un-ticking clears it');
});
test('a no-date book is the child\'s book when it is the only one received, and the oldest when two are', () => {
  const s = S.blank('2026-27'); S.setReceived(s, 'k1', 'HG', '', { noDate: true }); assert.strictEqual(S.sparksCurrent(s, 'k1'), 'HG');
  S.setReceived(s, 'k1', 'WR', '2026-10-14'); assert.strictEqual(S.sparksCurrent(s, 'k1'), 'WR', 'a dated, newer book wins over a no-date one');
});
test('the mark round-trips through the file and is one History line; Undo takes it back', () => {
  const s = S.blank('2026-27'), before = S.snapshot(s); S.setReceived(s, 'k1', 'WR', '', { noDate: true });
  assert.strictEqual(S.receivedOf(S.fromJson(S.toJson(s)), 'k1', 'WR'), 'no date');
  const ch = S.diff(before, S.snapshot(s)); assert.strictEqual(ch.length, 1); S.applyChanges(s, ch, true); assert.deepStrictEqual(s.received, {});
});
test('a bad book is still refused', () => { const s = S.blank('2026-27'); assert.throws(() => S.setReceived(s, 'ZZ', '', { noDate: true }), /not one of your books/); });
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
