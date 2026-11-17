// Book codes are 2 or 3 letters and are the key itself (HG, AoG): no separate "written as". Older files (AO written AoG) are moved to the new form when opened.
// Usage: node test/book-codes.test.js
const assert = require('assert'), Season = require('../season.js'), Check = require('../check.js'), Catalog = require('../catalog.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const fileWith = edit => { const o = JSON.parse(Season.toJson(Season.blank('2026-27'))); edit(o); return Season.fromJson(JSON.stringify(o)); };

test('the standard list has AoG (not AO) and no book carries a "written as"', () => {
  const b = Season.blank('2026-27').config.books; assert(b.AoG && !b.AO); Object.keys(b).forEach(k => assert(!('spell' in b[k]), k));
});
test('a typed code finds its book in any capitals; a 2-letter older spelling finds the one book it starts; names and unknown codes behave as before', () => {
  const s = Season.blank('2026-27');
  ['AoG', 'AOG', 'aog', 'AO', 'ao'].forEach(v => assert.strictEqual(Season.bookCode(s, v), 'AoG', v));
  assert.strictEqual(Season.bookCode(s, 'Agents of Grace'), 'AoG'); assert.strictEqual(Season.bookCode(s, 'QQ'), 'QQ'); assert.strictEqual(Season.bookKey(s, 'AG'), '', 'AG is not AoG');
  assert.strictEqual(Catalog.bookKeyOf({ HGX: {}, HGY: {} }, 'HG'), '', 'two books start like HG: no guess');
});
test('Check: a code of 2 or 3 letters in any capitals is a valid book code; other lengths or duplicates are not; an unknown handbook code is flagged, a known one is not', () => {
  assert.deepStrictEqual(Check.bookList({ HG: { name: 'a' }, AoG: { name: 'b' } }), []);
  assert.deepStrictEqual(Check.bookList({ A: { name: 'a' }, ABCD: { name: 'b' } }).map(x => x.code).sort(), ['A', 'ABCD']);
  const books = Season.blank('2026-27').config.books; assert.strictEqual(Check.bookCode('AOG', books), null); assert.strictEqual(Check.bookCode('AG', books).level, 'warn');
});
test('an older file (AO with "spell" AoG, year book AO, handbooks written AoG) opens with the book as AoG and everything still pointing at it', () => {
  const s = fileWith(o => { o.config.books = { HG: { name: 'Hangglider', group: 'Sparks' }, AO: { name: 'Agents of Grace', spell: 'AoG', emblem: '', group: 'T&T' } }; o.config.yearBook = { 'T&T': 'AO' }; o.handbooks = { a: 'AoG 260916', b: 'AO 260923' }; });
  assert.deepStrictEqual(Object.keys(s.config.books).sort(), ['AS', 'AoG', 'DoG', 'EoG', 'GiA', 'HG']);      // the standard books added in 1.50.13 join assert(!('spell' in s.config.books.AoG)); assert.strictEqual(Season.yearBook(s, 'T&T'), 'AoG');
  assert.deepStrictEqual(Season.handbookCounts(s, ['a', 'b']), { 'Agents of Grace': 2 }); assert.deepStrictEqual(Season.tidyHandbookCodes(s, false).map(x => x.id + ':' + x.from + '>' + x.to), ['b:AO>AoG']);
  const again = Season.fromJson(Season.toJson(s)); assert.deepStrictEqual(again.config.books, s.config.books);
});
test('an even older file with AO and no "spell" also becomes AoG; a club that renamed the book to its own code keeps it', () => {
  const s = fileWith(o => { o.config.books = { AO: { name: 'Agents of Grace', group: 'T&T' } }; });
  assert(s.config.books.AoG && !s.config.books.AO);
  const t = fileWith(o => { o.config.books = { AGR: { name: 'Agents of Grace', group: 'T&T' } }; }); assert(t.config.books.AGR && !t.config.books.AoG);
});
test('progress kept under an old book key moves with the book', () => {
  const s = fileWith(o => { o.config.books = { AO: { name: 'x', spell: 'AoG', group: 'T&T' } }; o.progress = { k1: { AO: { 'R.1': '2026-10-14' }, common: { 'SZ1.1': '2026-10-07' } } }; });
  assert.deepStrictEqual(Object.keys(s.progress.k1).sort(), ['AoG', 'common']); assert.strictEqual(s.progress.k1.AoG['R.1'], '2026-10-14');
});
test('the history follows the rename, so Validate sees no drift between the log and the data', () => {
  const Validate = require('../validate.js');
  const base = Season.blank('2026-27'); base.config.books = { AO: { name: 'Agents of Grace', spell: 'AoG', group: 'T&T' } };
  const o = JSON.parse(JSON.stringify(Object.assign({}, base, { history: [{ t: '2026-10-01T12:00:00.000Z', label: 'Options', changes: [{ p: ['config', 'books', 'AO', 'emblem'], o: '', n: 'Blue' }, { p: ['config', 'yearBook', 'T&T'], o: '', n: 'AO' }] }] })));
  o.config.books.AO.emblem = 'Blue'; o.config.yearBook = { 'T&T': 'AO' };
  const s = Season.fromJson(JSON.stringify(o)); assert.deepStrictEqual(s.history[0].changes[0].p, ['config', 'books', 'AoG', 'emblem']); assert.strictEqual(s.history[0].changes[1].n, 'AoG');
  assert.deepStrictEqual(Validate.validate(Season.toJson(s), 'x.json').findings.filter(f => /history says/.test(f.msg)), []);
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
