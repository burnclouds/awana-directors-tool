// Cubbies progress: Apple Acres, the Trail, six units of four Bear Hugs (one box per unit, or one per Bear Hug), the Trail and apple emblems, the Book Award medallions, switching between the two ways, and an older file. Invented test club only.
// Usage: node test/cubbies.test.js
const assert = require('assert');
const S = require('../season.js'), Catalog = require('../catalog.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const ids = list => list.map(b => b.key + ':' + b.items.length).join(' ');

test('the template: Apple Acres (no award), the Trail (Trail Emblem) and six units alternating Green and Red apples; 8 boxes by unit, 28 by Bear Hug', () => {
  const u = Catalog.cubbiesTemplate('unit'), b = Catalog.cubbiesTemplate('section');
  assert.strictEqual(ids(u.common.concat(u.perBook)), 'AA:1 TR:1 U1:1 U2:1 U3:1 U4:1 U5:1 U6:1');
  assert.strictEqual(b.common.concat(b.perBook).reduce((n, x) => n + x.items.length, 0), 28);
  assert.deepStrictEqual(b.perBook.find(x => x.key === 'U1').items, ['3', '4', '5', '6']); assert.deepStrictEqual(b.perBook.find(x => x.key === 'U6').items, ['23', '24', '25', '26']);
  assert.deepStrictEqual(u.common[0].awards, [], 'Apple Acres gives no award'); assert.deepStrictEqual(u.perBook[0].awards, ['{book} Trail Emblem']);
  assert.deepStrictEqual(u.perBook.slice(1).map(x => x.awards[0].replace('{book} ', '')), ['Unit 1 Green Apple Emblem', 'Unit 2 Red Apple Emblem', 'Unit 3 Green Apple Emblem', 'Unit 4 Red Apple Emblem', 'Unit 5 Green Apple Emblem', 'Unit 6 Red Apple Emblem']);
});
test('a new season has the Cubbies template, the two Book Awards, and them on the end-of-year list; one box per unit is the default and is not stored', () => {
  const s = S.blank('2026-27'); assert(s.config.progress.Cubbies); assert.deepStrictEqual(s.config.completion.Cubbies, ['AppleSeed Book Award Medallion', 'HoneyComb Book Award Medallion']);
  assert(s.config.endOfYear.Cubbies.includes('AppleSeed Book Award Medallion')); assert.strictEqual(s.config.cubbiesDetail, undefined);
});
test('finishing the Trail and a unit earns the Trail Emblem and the apple emblem, named with the book', () => {
  const s = S.blank('2026-27'); S.setProgress(s, 'k', 'AS', 'TR.1', '2026-10-28'); S.setProgress(s, 'k', 'AS', 'U1.1', '2026-11-04'); S.setProgress(s, 'k', 'AS', 'U2.1', '2026-11-11');
  const b = S.completedBlocks(s, 'k', 'Cubbies'); assert.deepStrictEqual(b.map(x => x.awards[0]), ['AS Trail Emblem', 'AS Unit 1 Green Apple Emblem', 'AS Unit 2 Red Apple Emblem']);
  assert.strictEqual(S.awardLabel(s, 'k', 'AS Unit 1 Green Apple Emblem'), 'AS Unit 1 Green Apple Emblem', 'no book on file: the code shows'); s.handbooks.k = 'AS 261028'; assert.strictEqual(S.awardLabel(s, 'k', 'AS Unit 1 Green Apple Emblem'), 'Unit 1 Green Apple Emblem', 'the child\'s own book: the code is dropped');
});
test('Apple Acres alone earns nothing and a unit left half done earns nothing (Bear Hug mode)', () => {
  const s = S.blank('2026-27'); S.setCubbiesDetail(s, 'section'); S.setProgress(s, 'k', 'common', 'AA.A', '2026-10-01'); S.setProgress(s, 'k', 'common', 'AA.B', '2026-10-08');
  S.setProgress(s, 'k', 'AS', 'U1.3', '2026-10-15'); S.setProgress(s, 'k', 'AS', 'U1.4', '2026-10-22');
  const b = S.completedBlocks(s, 'k', 'Cubbies'); assert.deepStrictEqual(b.map(x => [x.key, x.awards]), [['AA', []]]);
});
test('a finished book earns that book\'s Book Award medallion (AppleSeed or HoneyComb), dated by its last section', () => {
  const s = S.blank('2026-27'), all = Catalog.cubbiesTemplate('unit').perBook;
  all.forEach(b => S.setProgress(s, 'k', 'HC', b.key + '.1', '2026-11-04'));
  assert.deepStrictEqual(S.finishedBooks(s, 'k').map(b => b.book), ['HC']); assert.deepStrictEqual(S.completionAwards(s, 'k', 'Cubbies').map(a => a.award), ['HoneyComb Book Award Medallion']);
  all.forEach(b => S.setProgress(s, 'k', 'AS', b.key + '.1', '2026-11-11'));
  assert.deepStrictEqual(S.completionAwards(s, 'k', 'Cubbies').map(a => a.award).sort(), ['AppleSeed Book Award Medallion', 'HoneyComb Book Award Medallion']);
});
test('switching to one box per Bear Hug copies a unit\'s date to its four Bear Hugs; back to one per unit keeps finished units and refuses partly done ones', () => {
  const s = S.blank('2026-27'); S.setProgress(s, 'k', 'AS', 'TR.1', '2026-10-28'); S.setProgress(s, 'k', 'AS', 'U1.1', '2026-11-04');
  S.setCubbiesDetail(s, 'section'); assert.deepStrictEqual(s.progress.k.AS, { 'TR.1': '2026-10-28', 'TR.2': '2026-10-28', 'U1.3': '2026-11-04', 'U1.4': '2026-11-04', 'U1.5': '2026-11-04', 'U1.6': '2026-11-04' }); assert.strictEqual(s.config.cubbiesDetail, 'section');
  S.setProgress(s, 'k', 'AS', 'U2.7', '2026-11-11'); assert.throws(() => S.setCubbiesDetail(s, 'unit'), /partly done/); assert.strictEqual(s.config.cubbiesDetail, 'section', 'nothing changed');
  S.setProgress(s, 'k', 'AS', 'U2.7', ''); S.setCubbiesDetail(s, 'unit'); assert.deepStrictEqual(s.progress.k.AS, { 'TR.1': '2026-10-28', 'U1.1': '2026-11-04' }); assert.strictEqual(s.config.cubbiesDetail, undefined);
});
test('an older file (no Cubbies sheet, no Cubbies book awards) opens with them; the club\'s own end-of-year list is kept', () => {
  const old = JSON.parse(S.toJson(S.blank('2025-26'))); delete old.config.progress.Cubbies; delete old.config.completion.Cubbies; old.config.endOfYear.Cubbies = ['My Certificate'];
  const s = S.fromJson(JSON.stringify(old)); assert(s.config.progress.Cubbies); assert.deepStrictEqual(s.config.completion.Cubbies, ['AppleSeed Book Award Medallion', 'HoneyComb Book Award Medallion']);
  assert.deepStrictEqual(s.config.endOfYear.Cubbies, ['AppleSeed Book Award Medallion', 'HoneyComb Book Award Medallion', 'My Certificate']);
  const again = S.fromJson(S.toJson(s)); assert.deepStrictEqual(again.config.endOfYear.Cubbies, s.config.endOfYear.Cubbies, 'opening twice adds nothing more');
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
