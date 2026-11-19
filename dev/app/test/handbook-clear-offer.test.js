// N38 follow-up: a handbook that is only a book code (no date) and names the book whose received date is cleared is an "orphan": the sheet would still open on it. Season.orphanHandbook finds it; Season.setHandbook clears it. Invented data only.
// Usage: node test/handbook-clear-offer.test.js
const assert = require('assert'), S = require('../season.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const fresh = () => S.blank('2026-27');
const ID = 'child-1';

test('a code-only handbook that names the book is an orphan', () => {
  const s = fresh(); s.handbooks[ID] = 'WR';
  assert.strictEqual(S.orphanHandbook(s, ID, 'WR'), true);
});
test('a handbook with a date is not an orphan (it says when the book came)', () => {
  const s = fresh(); s.handbooks[ID] = 'WR 261105';
  assert.strictEqual(S.orphanHandbook(s, ID, 'WR'), false);
});
test('a handbook for another book is not an orphan for this book', () => {
  const s = fresh(); s.handbooks[ID] = 'HG';
  assert.strictEqual(S.orphanHandbook(s, ID, 'WR'), false);
});
test('clearing the received date leaves the orphan in place; clearing the handbook removes it', () => {
  const s = fresh(); s.handbooks[ID] = 'WR'; S.setReceived(s, ID, 'WR', '2026-11-05');
  S.setReceived(s, ID, 'WR', ''); assert.strictEqual(S.orphanHandbook(s, ID, 'WR'), true, 'the handbook still names WR after the date is cleared');
  S.setHandbook(s, ID, { code: '', date: '' }); assert.strictEqual(s.handbooks[ID], undefined, 'handbook removed');
  assert.strictEqual(S.orphanHandbook(s, ID, 'WR'), false);
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
