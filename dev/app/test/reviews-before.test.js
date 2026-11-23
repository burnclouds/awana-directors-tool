// Reviews completed before another club: no review dates are invented, sections remain independent, and the Book Review is eligible only after sections are complete.
// Usage: node test/reviews-before.test.js
const assert = require('assert'), S = require('../season.js'), Catalog = require('../catalog.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const fresh = () => S.blank('2026-27'), template = Catalog.sparksTemplate();
const signCore = (s, id, book, skip) => template.perBook.forEach(b => b.items.forEach(i => { const key = b.key + '.' + i; if (key !== skip) S.setProgress(s, id, book, key, '2026-10-07'); }));

test('a prior Reviews marker has no date records and does not finish the book sections', () => {
  const s = fresh(); S.setReviewsDone(s, 'kid', 'HG', true);
  assert.deepStrictEqual(s.doneReviews, { kid: ['HG'] });
  assert.deepStrictEqual(s.progress, {});
  assert.strictEqual(S.bookStatus(s, 'kid', 'HG'), 'started');
  assert.strictEqual(S.hasProgress(s, 'kid'), true);
  assert.strictEqual(S.childBook(s, 'kid'), 'HG');
  assert(S.sheetsOf(s, 'kid', 'Sparks').includes('HG'));
  assert(S.booksStarted(s, 'kid', 'Sparks').includes('HG'));
  assert.strictEqual(S.completedBlocks(s, 'kid', 'Sparks').some(b => b.key === 'BOOKREVIEW'), false);
});

test('all four Reviews rows can be completed before and satisfy the Book Review after core sections are dated', () => {
  const s = fresh(); signCore(s, 'kid', 'HG'); S.setReviewsDone(s, 'kid', 'HG', true);
  const review = S.completedBlocks(s, 'kid', 'Sparks').find(b => b.key === 'BOOKREVIEW');
  assert(review, 'Book Review is completed');
  assert.strictEqual(review.noDate, true, 'the prior review completion has no review date');
  assert.strictEqual(review.date, '2026-10-07', 'the last required section supplies the eligibility date');
  assert.strictEqual(S.bookStatus(s, 'kid', 'HG'), 'review');
  assert(S.suggestedAwards(s, 'kid', 'Sparks').some(a => review.awards.includes(a.award) && a.noDate), 'earned list includes the Book Review without claiming a review date');
});

test('the prior Reviews marker does not hide a missing section requirement', () => {
  const s = fresh(), firstReviewBook = template.perBook.find(b => (b.review || []).length); signCore(s, 'kid', 'HG', firstReviewBook.key + '.' + firstReviewBook.items[0]); S.setReviewsDone(s, 'kid', 'HG', true);
  assert.strictEqual(S.completedBlocks(s, 'kid', 'Sparks').some(b => b.key === 'BOOKREVIEW'), false);
  assert.strictEqual(S.bookStatus(s, 'kid', 'HG'), 'started');
});

test('the marker round-trips, is carried to a new season, and can be removed', () => {
  const s = fresh(); S.setReviewsDone(s, 'kid', 'HG', true);
  const opened = S.fromJson(S.toJson(s)); assert.deepStrictEqual(opened.doneReviews, { kid: ['HG'] });
  assert.deepStrictEqual(S.newSeason(opened, '2027-28').doneReviews, { kid: ['HG'] });
  S.setReviewsDone(opened, 'kid', 'HG', false); assert.deepStrictEqual(opened.doneReviews, {});
  assert(!('doneReviews' in JSON.parse(S.toJson(opened))), 'empty section is omitted');
});

test('checking and unchecking the marker preserves any review dates already entered', () => {
  const s = fresh(); S.setProgress(s, 'kid', 'HG', 'RJ1.5', '2026-10-07');
  S.setReviewsDone(s, 'kid', 'HG', true); assert.strictEqual(s.progress.kid.HG['RJ1.5'], '2026-10-07');
  S.setReviewsDone(s, 'kid', 'HG', false); assert.strictEqual(s.progress.kid.HG['RJ1.5'], '2026-10-07');
});

test('History restore and merge track the marker as a season section', () => {
  const s = fresh(), before = S.snapshot(s); S.setReviewsDone(s, 'kid', 'HG', true);
  S.record(s, before, { now: '2026-10-07T20:00:00.000Z' });
  assert.deepStrictEqual((S.at(s, 0).doneReviews || {}).kid, undefined, 'restore removes the marker');
  const merged = S.merge3(before, s, JSON.parse(JSON.stringify(S.at(s, 0))), { now: '2026-10-07T21:00:00.000Z' }).season;
  assert.deepStrictEqual(merged.doneReviews, { kid: ['HG'] });
});

test('only Sparks books with a Reviews template accept the marker', () => {
  const s = fresh(); assert.throws(() => S.setReviewsDone(s, 'kid', 'AoG', true), /does not have Sparks reviews/); assert.throws(() => S.setReviewsDone(s, 'kid', 'ZZ', true), /does not have Sparks reviews/);
});

console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
