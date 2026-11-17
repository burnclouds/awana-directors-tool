// Settings kept in the data file for the Options tab: the team color order, this year's T&T book, game place points.
// Usage: node test/options.test.js
const assert = require('assert'), S = require('../season.js'), V = require('../validate.js'), Cat = require('../catalog.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const night = (Date, Quarter) => ({ Date, Type: 'Club night', Quarter, 'No Club': '' });
const cal = ['2026-09-09', '2026-09-16'].map(d => night(d, 'Q1'));

test('a new season lists the colors red, yellow, green, blue', () => {
  assert.deepStrictEqual(S.teamOrder(S.blank('2026-27')), ['Red', 'Yellow', 'Green', 'Blue']);
  assert.deepStrictEqual(Cat.defaultConfig().teamOrder, ['Red', 'Yellow', 'Green', 'Blue']);
});
test('an older file without the setting, or with a damaged one, falls back to the standard order', () => {
  const s = S.blank('2026-27'); delete s.config.teamOrder;
  assert.deepStrictEqual(S.teamOrder(s), ['Red', 'Yellow', 'Green', 'Blue']);
  const old = JSON.parse(S.toJson(S.blank('2026-27'))); delete old.config.teamOrder;
  assert.deepStrictEqual(S.teamOrder(S.fromJson(JSON.stringify(old))), ['Red', 'Yellow', 'Green', 'Blue']);
  s.config.teamOrder = ['Red', 'Red', 'Green', 'Blue']; assert.deepStrictEqual(S.teamOrder(s), ['Red', 'Yellow', 'Green', 'Blue']);
  assert.deepStrictEqual(S.teamOrder(null), ['Red', 'Yellow', 'Green', 'Blue']);
});
test('setTeamOrder keeps a permutation of the four colors and refuses anything else', () => {
  const s = S.blank('2026-27'); S.setTeamOrder(s, ['Blue', 'Green', 'Yellow', 'Red']);
  assert.deepStrictEqual(S.teamOrder(s), ['Blue', 'Green', 'Yellow', 'Red']);
  assert.throws(() => S.setTeamOrder(s, ['Blue', 'Green', 'Yellow']), /once each/);
  assert.throws(() => S.setTeamOrder(s, ['Blue', 'Blue', 'Yellow', 'Red']), /once each/);
  assert.throws(() => S.setTeamOrder(s, ['Blue', 'Green', 'Yellow', 'Purple']), /once each/);
  assert.deepStrictEqual(S.teamOrder(s), ['Blue', 'Green', 'Yellow', 'Red'], 'a refused change leaves the order alone');
});
test('the order survives the file and a new season, and the colors tied in the standings follow it', () => {
  const s = S.blank('2026-27'); S.setTeamOrder(s, ['Green', 'Blue', 'Red', 'Yellow']);
  assert.deepStrictEqual(S.teamOrder(S.fromJson(S.toJson(s))), ['Green', 'Blue', 'Red', 'Yellow']);
  assert.deepStrictEqual(S.teamOrder(S.newSeason(s, '2027-28')), ['Green', 'Blue', 'Red', 'Yellow']);
  assert.deepStrictEqual(S.standings(s, 'Sparks', 'Q1', cal).map(r => r.team), ['Green', 'Blue', 'Red', 'Yellow']);
});
test('this year\'s Cubbies and T&T books are chosen again each year; the other settings carry over; Sparks have none', () => {
  const s = S.blank('2026-27'); assert.deepStrictEqual(s.config.yearBook, { Cubbies: '', Sparks: '', 'T&T': '' }); assert.strictEqual(S.yearBook(s, 'T&T'), '');
  S.setYearBook(s, 'T&T', 'AoG'); S.setYearBook(s, 'Cubbies', 'HC'); s.config.placePoints = { 1: 5, 2: 3, 3: 1, 4: 0 };
  const back = S.fromJson(S.toJson(s)); assert.strictEqual(S.yearBook(back, 'T&T'), 'AoG'); assert.strictEqual(S.yearBook(back, 'Cubbies'), 'HC'); assert.strictEqual(back.config.placePoints[1], 5);
  const n = S.newSeason(s, '2027-28'); assert.strictEqual(S.yearBook(n, 'T&T'), ''); assert.strictEqual(S.yearBook(n, 'Cubbies'), ''); assert.strictEqual(n.config.placePoints[1], 5);
  assert.strictEqual(S.yearBook(s, 'Sparks'), '', 'Sparks work through their books in turn');
  assert.throws(() => S.setYearBook(s, 'Sparks', 'HG'), /All Together/);
  assert.throws(() => S.setYearBook(s, 'T&T', 'HG'), /not a T&T book/);
  assert.throws(() => S.setYearBook(s, 'Cubbies', 'AoG'), /not a Cubbies book/);
  S.setYearBook(s, 'T&T', ''); assert.strictEqual(S.yearBook(s, 'T&T'), '', 'cleared'); assert.strictEqual(S.yearBook(s, 'Cubbies'), 'HC', 'the other group is untouched');
});
test('a book moved to another group, or removed, is no longer the year\'s book; an old file\'s tntBook (1.32) becomes the T&T book', () => {
  const s = S.blank('2026-27'); S.setYearBook(s, 'T&T', 'AoG'); s.config.books.AoG.group = 'Sparks'; assert.strictEqual(S.yearBook(s, 'T&T'), '');
  delete s.config.books.AoG; assert.strictEqual(S.yearBook(s, 'T&T'), '');
  const o = JSON.parse(S.toJson(S.blank('2026-27'))); delete o.config.yearBook; o.config.tntBook = 'AoG';
  const old = S.fromJson(JSON.stringify(o)); assert.strictEqual(S.yearBook(old, 'T&T'), 'AoG'); assert.strictEqual(old.config.tntBook, undefined); assert.strictEqual(S.yearBook(old, 'Cubbies'), '');
});
test('Sparks books: in order by default; with All Together the club picks one Sparks book for the year (carried by the file, cleared by a new season)', () => {
  const s = S.blank('2026-27'); assert.strictEqual(s.config.sparksBooks, 'sequence'); assert(!S.usesYearBook(s, 'Sparks')); assert(S.usesYearBook(s, 'T&T') && S.usesYearBook(s, 'Cubbies'));
  S.setSparksBooks(s, 'together'); assert(S.usesYearBook(s, 'Sparks')); S.setYearBook(s, 'Sparks', 'WR'); assert.strictEqual(S.yearBook(s, 'Sparks'), 'WR');
  assert.throws(() => S.setYearBook(s, 'Sparks', 'AoG'), /not a Sparks book/); assert.throws(() => S.setSparksBooks(s, 'weekly'), /sequence/);
  const back = S.fromJson(S.toJson(s)); assert.strictEqual(back.config.sparksBooks, 'together'); assert.strictEqual(S.yearBook(back, 'Sparks'), 'WR');
  const n = S.newSeason(s, '2027-28'); assert.strictEqual(n.config.sparksBooks, 'together', 'the method is club policy and carries over'); assert.strictEqual(S.yearBook(n, 'Sparks'), '', 'the book is chosen again');
  S.setSparksBooks(s, 'sequence'); assert.strictEqual(S.yearBook(s, 'Sparks'), '', 'back to in order: no year book applies');
  const old = JSON.parse(S.toJson(S.blank('2026-27'))); delete old.config.sparksBooks; assert.strictEqual(S.fromJson(JSON.stringify(old)).config.sparksBooks, 'sequence', 'an older file works in order');
});
test('Validate: a bad color order or place points are errors, a T&T book that is not listed is a warning, and a normal file is clean', () => {
  const check = edit => { const o = JSON.parse(S.toJson(S.blank('2026-27'))); edit(o.config); return V.validate(JSON.stringify(o), 'awana-2026-27-20261029-214815.json'); };
  const text = r => JSON.stringify(r);
  assert(!/color order|place points|book for this year/.test(text(check(() => {}))), 'a normal file has none of these');
  assert(/color order/.test(text(check(c => { c.teamOrder = ['Red', 'Red', 'Green', 'Blue']; }))));
  assert(/place points/.test(text(check(c => { c.placePoints = { 1: 3, 2: -1, 3: 1, 4: 0 }; }))));
  assert(/book for this year for T&T/.test(text(check(c => { c.yearBook['T&T'] = 'ZZ'; }))));
  assert(/book for this year for T&T/.test(text(check(c => { c.yearBook['T&T'] = 'HG'; }))), 'a Sparks book is not a T&T book');
  assert(/Sparks books setting/.test(text(check(c => { c.sparksBooks = 'weekly'; }))));
  assert(!/book for this year/.test(text(check(c => { c.yearBook['T&T'] = 'AoG'; c.yearBook.Cubbies = 'HC'; }))));
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
