// Sparks Blue Jewels in the book's wings (season.blueWingPlan): 4 slots per book; a gem with no room is held until the child finishes the book, then all held gems go into the next book at once; held gems are dropped at the end of the club year; overrides count as placed. Sparks only. Invented test club only.
// Usage: node test/blue-wings.test.js
const assert = require('assert');
const S = require('../season.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }

const BASE = Date.UTC(2026, 9, 7);            // a Wednesday in October 2026
const day = i => new Date(BASE + i * 86400000).toISOString().slice(0, 10);
const calRows = n => Array.from({ length: n }, (_, i) => ({ Date: day(i), Quarter: 'Q1', Type: 'Club' }));
// The child attends the first n club nights (nights 0..n-1)
function attend(s, id, n) { for (let i = 0; i < n; i++) { (s.attendance[day(i)] || (s.attendance[day(i)] = {}))[id] = { a: 1 }; } }
// Every section of a Sparks book is dated on the given day (the book is then finished)
function finish(s, id, book, date) { s.config.progress.Sparks.perBook.forEach(b => b.items.forEach(i => S.setProgress(s, id, book, b.key + '.' + i, date))); }
const sparks = s => Object.keys(s.config.books).filter(c => S.bookGroup(s, c) === 'Sparks');
const wingsFull = (book, id, year) => [1, 2, 3, 4].map(slot => ({ book, slot, n: slot, threshold: null, earned: '2026-01-01', date: '2026-01-01', year, override: false }));

test('Sparks books are HG, WR, SS in order (the set the rule uses)', () => {
  const s = S.blank('2026-27'); assert.deepStrictEqual(S.bookOrder(s, 'Sparks').slice(0, 3), ['HG', 'WR', 'SS']);
});

test('room in the current book: all four gems go straight into its wings, none held', () => {
  const s = S.blank('2026-27'); attend(s, 'k1', 27);
  const p = S.blueWingPlan(s, 'k1', calRows(27));
  assert.deepStrictEqual(p.placed.map(x => [x.book, x.slot, x.n]), [['HG', 1, 1], ['HG', 2, 2], ['HG', 3, 3], ['HG', 4, 4]]);
  assert.deepStrictEqual(p.held, []); assert.deepStrictEqual(p.dropped, []);
});

test('full wings: gems are held while the book is open, then go into the next book at once when it finishes', () => {
  const s = S.blank('2026-27'); attend(s, 'k1', 27);
  s.blueWings = { k1: wingsFull('HG', 'k1', '2025-26') };           // HG wings already full from last year
  let p = S.blueWingPlan(s, 'k1', calRows(27));
  assert.strictEqual(p.placed.length, 0, 'no room in HG, nothing placed yet');
  assert.strictEqual(p.held.length, 4, 'four gems held');
  finish(s, 'k1', 'HG', day(30));                                    // HG finished after the last night
  p = S.blueWingPlan(s, 'k1', calRows(27));
  assert.deepStrictEqual(p.placed.map(x => [x.book, x.slot, x.date]), [['WR', 1, day(30)], ['WR', 2, day(30)], ['WR', 3, day(30)], ['WR', 4, day(30)]], 'all four into WR on the finish day');
  assert.deepStrictEqual(p.held, []);
});

test('a late finish mid-year: gems earned before the finish wait for the next wings, then all go in together', () => {
  const s = S.blank('2026-27'); attend(s, 'k1', 19);                 // gems 1-3 (nights 6, 12, 19)
  s.blueWings = { k1: wingsFull('HG', 'k1', '2025-26').slice(0, 3) }; // HG has one slot left
  finish(s, 'k1', 'HG', day(15));                                    // HG finished after night 15: gem 1 (night 6) was earned while HG was open
  const p = S.blueWingPlan(s, 'k1', calRows(19));
  // Gem 1 (day 5) fills HG's last slot; gems 2 and 3 (day 11, day 18) go into WR, the book opened on day 15
  assert.deepStrictEqual(p.placed.filter(x => x.book === 'HG').map(x => x.n), [1]);
  assert.deepStrictEqual(p.placed.filter(x => x.book === 'WR').map(x => x.n), [2, 3], 'gem 2 was held while HG was full, goes into WR when HG finishes; gem 3 then has room in WR');
  assert.deepStrictEqual(p.placed.filter(x => x.book === 'WR').map(x => x.date), [day(15), day(18)]);
});

test('a gem earned on the night its book finishes goes into that book first', () => {
  const s = S.blank('2026-27'); attend(s, 'k1', 6);                  // gem 1 on day 5
  s.blueWings = { k1: wingsFull('HG', 'k1', '2025-26').slice(0, 3) };
  finish(s, 'k1', 'HG', day(5));
  const p = S.blueWingPlan(s, 'k1', calRows(6));
  assert.deepStrictEqual(p.placed.map(x => [x.book, x.n]), [['HG', 1]], 'the last HG slot takes it; WR opens with nothing held');
});

test('a club year that ends with gems still held drops them; they never carry across years', () => {
  const s = S.blank('2026-27'); attend(s, 'k1', 27);
  s.blueWings = { k1: wingsFull('HG', 'k1', '2025-26') };
  const p = S.blueWingPlan(s, 'k1', calRows(27), { yearEnded: true });
  assert.deepStrictEqual(p.held, []); assert.strictEqual(p.dropped.length, 4, 'all four dropped at year end');
});

test('an override counts as placed: it fills a slot in its book and is never dropped', () => {
  const s = S.blank('2026-27'); attend(s, 'k1', 6);                  // gem 1 earned, HG has room
  s.blueOverrides = { k1: [{ book: 'HG', n: 2, date: day(2), note: 'Given by hand, Mike' }] };
  const p = S.blueWingPlan(s, 'k1', calRows(6));
  const ov = p.placed.filter(x => x.override);
  assert.strictEqual(ov.length, 1); assert.strictEqual(ov[0].note, 'Given by hand, Mike');
  assert.deepStrictEqual(p.placed.filter(x => x.override).map(x => x.slot), [2], 'the grant keeps the slot it names (2)');
  assert.deepStrictEqual(p.placed.filter(x => !x.override).map(x => x.slot), [1], 'the earned gem takes the lowest free slot (1)');
});

test('a closed club year carries its placements into the new file, so the book keeps its slots', () => {
  const s = S.blank('2026-27'); attend(s, 'k1', 27); s.calendar = calRows(27);
  const n = S.newSeason(s, '2027-28');
  assert.deepStrictEqual((n.blueWings.k1 || []).map(x => x.book), ['HG', 'HG', 'HG', 'HG'], 'the four HG gems carried over');
  n.calendar = calRows(6); attend(n, 'k1', 6);
  const p = S.blueWingPlan(n, 'k1', calRows(6));
  assert.strictEqual(p.placed.length, 0, 'HG is full from last year: the new gem waits');
  assert.strictEqual(p.held.length, 1);
});

test('an override carries as a placement (not as an override) into the new file', () => {
  const s = S.blank('2026-27'); s.calendar = calRows(6); attend(s, 'k1', 6);
  s.blueOverrides = { k1: [{ book: 'HG', n: 1, date: day(0), note: 'Given by hand' }] };
  const n = S.newSeason(s, '2027-28');
  assert.strictEqual(n.blueWings.k1[0].override, true); assert.strictEqual(n.blueWings.k1[0].note, 'Given by hand');
  assert.strictEqual(n.blueOverrides, undefined, 'overrides are not copied; they are kept as placements');
});

test('placements survive a save and reload', () => {
  const s = S.blank('2026-27'); s.blueWings = { k1: [{ book: 'HG', slot: 1, n: 1, threshold: 6, earned: day(5), date: day(5), year: '2026-27', override: false }] };
  const t = S.fromJson(S.toJson(s)); assert.deepStrictEqual(t.blueWings, s.blueWings);
  const e = S.blank('2026-27'); assert(!('blueWings' in JSON.parse(S.toJson(e))), 'nothing written when there are none');
});

test('a leader can grant a Blue Jewel by hand: it takes its slot, carries its note, and never drops at year end', () => {
  const s = S.blank('2026-27'); S.grantBlue(s, 'k1', 'HG', 2, day(3), 'Earned on paper, missed the entry');
  const p = S.blueWingPlan(s, 'k1', calRows(6), { yearEnded: true });
  assert.deepStrictEqual(p.placed.map(x => [x.book, x.slot, x.override, x.note]), [['HG', 2, true, 'Earned on paper, missed the entry']]);
  assert.deepStrictEqual(p.dropped, []);
  assert.throws(() => S.grantBlue(s, 'k1', 'AS', 1, day(3), ''), /Sparks/, 'Cubbies books are refused');
  assert.throws(() => S.grantBlue(s, 'k1', 'HG', 5, day(3), ''), /slot 1 to 4/);
});

test('a leader can drop a hand-granted Blue Jewel, and then its slot is free again', () => {
  const s = S.blank('2026-27'); S.grantBlue(s, 'k1', 'HG', 2, day(3), 'x');
  S.dropBlue(s, 'k1', { kind: 'override', book: 'HG', n: 2, date: day(3) });
  assert.strictEqual(s.blueOverrides, undefined, 'the last one removed leaves nothing in the file');
  assert.strictEqual(S.blueWingPlan(s, 'k1', calRows(0)).placed.length, 0);
});

test('a leader can drop an earned Blue Jewel: it is not placed, takes no slot, and is not held', () => {
  const s = S.blank('2026-27'); attend(s, 'k1', 6);                  // gem 1 earned on day 5
  assert.strictEqual(S.blueWingPlan(s, 'k1', calRows(6)).placed.length, 1);
  S.dropBlue(s, 'k1', { kind: 'earned', gem: 1, date: day(5) });
  const p = S.blueWingPlan(s, 'k1', calRows(6));
  assert.strictEqual(p.placed.length, 0); assert.strictEqual(p.held.length, 0);
  const t = S.fromJson(S.toJson(s)); assert.strictEqual(S.blueWingPlan(t, 'k1', calRows(6)).placed.length, 0, 'the drop survives a save');
});

test('a grant for a slot already filled by an earlier year is reported as skipped, not placed', () => {
  const s = S.blank('2026-27'); s.blueWings = { k1: [{ book: 'HG', slot: 2, n: 2, threshold: null, earned: '2025-11-01', date: '2025-11-01', year: '2025-26', override: false }] };
  S.grantBlue(s, 'k1', 'HG', 2, day(3), 'clash');
  const p = S.blueWingPlan(s, 'k1', calRows(0));
  assert.strictEqual(p.placed.length, 0); assert.strictEqual(p.skipped.length, 1); assert.strictEqual(p.skipped[0].slot, 2);
});

test('dropping an earned gem also removes its announced and given award records (and the other gems keep theirs)', () => {
  const s = S.blank('2026-27'); attend(s, 'k1', 6);                  // gem 1 earned on day 5, placed in HG slot 1
  S.addAward(s, day(7), 'k1', 'HG Blue Jewel 1'); S.setGiven(s, 'k1', 'HG Blue Jewel 1', day(8));
  S.addAward(s, day(7), 'k1', 'WR Red Jewel 1');                      // an unrelated award must stay
  const removed = S.dropBlue(s, 'k1', { kind: 'earned', book: 'HG', slot: 1, gem: 1, date: day(5) });
  assert.deepStrictEqual(removed.sort(), ['HG Blue Jewel 1']);
  assert.deepStrictEqual(S.awardsOf(s, 'k1').map(a => a.award), ['WR Red Jewel 1'], 'the announce record is gone, the other stays');
  assert.strictEqual((s.given.k1 || {})['HG Blue Jewel 1'], undefined, 'the given mark is gone');
  assert.strictEqual(S.blueWingPlan(s, 'k1', calRows(6)).placed.length, 0);
});

console.log(passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
