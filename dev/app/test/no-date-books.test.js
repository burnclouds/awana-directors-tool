// N38 follow-up (Debug tool): a bare book code with no date of any kind is reset for Cubbies, Sparks and T&T alike; a child with any date is never touched. Invented data only.
// Usage: node test/no-date-books.test.js
const assert = require('assert'), S = require('../season.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const fresh = () => S.blank('2026-27');
const findings = s => S.oddballs(s).filter(r => r.check === 'bare-handbook');

test('a bare code with no dates is listed and reset, in every group', () => {
  const s = fresh(); s.handbooks = { sparks: 'WR', tnt: 'AoG', cub: 'HC' };
  assert.deepStrictEqual(S.noDateBookKids(s).sort(), ['cub', 'sparks', 'tnt']);
  assert.strictEqual(findings(s).filter(row => S.fixOddball(s, row)).length, 3);
  assert.deepStrictEqual(s.handbooks, {}, 'all three codes cleared');
});
test('a child with a sign-off is never touched', () => {
  const s = fresh(); s.handbooks = { a: 'WR' }; s.progress = { a: { WR: { 'WR1.1': '2026-11-05' } } };
  assert.deepStrictEqual(S.noDateBookKids(s), []);
  assert.deepStrictEqual(findings(s), []); assert.strictEqual(s.handbooks.a, 'WR');
});
test('a child with a received date, a finished book or an extra sheet is never touched', () => {
  const s = fresh(); s.handbooks = { a: 'WR', b: 'WR', c: 'WR' }; s.received = { a: { WR: '2026-11-05' } }; s.doneBooks = { b: ['HG'] }; s.extraSheets = { c: ['SS'] };
  assert.deepStrictEqual(S.noDateBookKids(s), []);
});
test('a child whose only record is "no date" on a received book is dated (kept)', () => {
  const s = fresh(); s.handbooks = { a: 'WR' }; s.received = { a: { WR: 'no date' } };
  assert.deepStrictEqual(S.noDateBookKids(s), [], 'a received "no date" is still a record that the book came');
});
test('a handbook with a date is not a bare code, so it is not reset', () => {
  const s = fresh(); s.handbooks = { a: 'WR 261105' };
  assert.deepStrictEqual(S.noDateBookKids(s), []);
});
test('the fix preserves a handbook note or receipt added after the check', () => {
  const s = fresh(); s.handbooks = { a: 'WR', b: 'HG' };
  const found = findings(s);
  S.setHandbook(s, 'a', { code: 'WR', note: 'Check with parent' });
  S.setReceived(s, 'b', 'HG', '', { noDate: true });
  assert.deepStrictEqual(findings(s), []);
  assert(found.every(row => !S.fixOddball(s, row)));
  assert.strictEqual(S.handbookParts(s.handbooks.a).note, 'Check with parent');
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
