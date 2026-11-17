// How far a child is in one book, for the colored book tabs (Season.bookStatus): not started, started, finished, finished with the Book Review. Invented children only. Usage: node test/book-status.test.js
const assert = require('assert'), S = require('../season.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const fresh = () => S.fromJson(S.toJson(S.blank('2026-27')));
const fill = (s, id, book, blocks, withReview, skip) => blocks.forEach(b => b.items.concat(withReview ? (b.review || []) : []).forEach(i => { if (!(skip && skip(b, i))) S.setProgress(s, id, book, b.key + '.' + i, '2026-10-07'); }));
const sparks = s => s.config.progress.Sparks.perBook, tnt = s => s.config.progress['T&T'].perBook.filter(b => !/^(SV|GD)/.test(b.key));

test('a book with nothing entered is not started', () => { const s = fresh(); assert.strictEqual(S.bookStatus(s, 'k', 'HG'), ''); });
test('one date entered makes it started (red unless it is the book they are working on)', () => {
  const s = fresh(); S.setProgress(s, 'k', 'HG', sparks(s)[0].key + '.' + sparks(s)[0].items[0], '2026-10-07'); assert.strictEqual(S.bookStatus(s, 'k', 'HG'), 'started'); assert.strictEqual(S.bookStatus(s, 'k', 'WR'), '', 'another book is untouched');
});
test('a date received alone makes it started', () => { const s = fresh(); S.setReceived(s, 'k', 'HG', '2026-09-16'); assert.strictEqual(S.bookStatus(s, 'k', 'HG'), 'started'); });
test('every core section dated is finished; with the reviews dated too it is finished with the Book Review (inverted green)', () => {
  const s = fresh(); fill(s, 'k', 'HG', sparks(s), false); assert.strictEqual(S.bookStatus(s, 'k', 'HG'), 'done', 'core only');
  fill(s, 'k', 'HG', sparks(s), true); assert.strictEqual(S.bookStatus(s, 'k', 'HG'), 'review', 'core and reviews');
});
test('one review section missing keeps it at finished (not with review)', () => {
  const s = fresh(), last = sparks(s).filter(b => (b.review || []).length).pop(), lastItem = last.review[last.review.length - 1]; fill(s, 'k', 'HG', sparks(s), true, (b, i) => b === last && i === lastItem);
  assert.strictEqual(S.bookStatus(s, 'k', 'HG'), 'done');
});
test('one core section missing is started, however much else is done', () => {
  const s = fresh(), b0 = sparks(s)[0]; fill(s, 'k', 'HG', sparks(s), true, (b, i) => b === b0 && i === b0.items[0]); assert.strictEqual(S.bookStatus(s, 'k', 'HG'), 'started');
});
test('a book ticked "finished before" is finished, never with review (there are no records to show it)', () => { const s = fresh(); S.setBookDone(s, 'k', 'HG', true); assert.strictEqual(S.bookStatus(s, 'k', 'HG'), 'done'); });
test('T&T books have no review: finished is as far as they go', () => { const s = fresh(); fill(s, 'k', 'AoG', tnt(s), true); assert.strictEqual(S.bookStatus(s, 'k', 'AoG'), 'done'); });
test('children are told apart: one child finishing a book does not change another\'s tab', () => { const s = fresh(); fill(s, 'a', 'HG', sparks(s), true); assert.strictEqual(S.bookStatus(s, 'a', 'HG'), 'review'); assert.strictEqual(S.bookStatus(s, 'b', 'HG'), ''); });
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
