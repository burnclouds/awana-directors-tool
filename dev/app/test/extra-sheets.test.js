// "+ Add sheet" on the Person tab: the added sheet is kept in the file (extraSheets), survives a save and reload, and is among the child's sheets (so Progress shows it). Invented test club only.
// Usage: node test/extra-sheets.test.js
const assert = require('assert');
const S = require('../season.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }

test('adding a sheet stores it in the file, lists it among the child sheets, and survives a save and reload', () => {
  const s = S.blank('2026-27'); const book = Object.keys(s.config.books).find(c => S.bookGroup(s, c) === 'T&T');
  assert(book, 'the standard config has a T&T book');
  assert(!S.sheetsOf(s, 'k1', 'Sparks').includes(book), 'not a sheet before it is added');
  S.addExtraSheet(s, 'k1', book); assert.deepStrictEqual(s.extraSheets, { k1: [book] });
  assert(S.sheetsOf(s, 'k1', 'Sparks').includes(book), 'listed for the child, whatever their group');
  const t = S.fromJson(S.toJson(s)); assert(S.sheetsOf(t, 'k1', 'Sparks').includes(book), 'still there after a save and reload');
});

test('adding the same sheet twice keeps one; an unknown book is ignored; an empty list is not written', () => {
  const s = S.blank('2026-27'); const book = Object.keys(s.config.books)[0];
  S.addExtraSheet(s, 'k1', book); S.addExtraSheet(s, 'k1', book); assert.deepStrictEqual(s.extraSheets, { k1: [book] });
  S.addExtraSheet(s, 'k1', 'NOPE'); assert.deepStrictEqual(s.extraSheets, { k1: [book] });
  const e = S.blank('2026-27'); assert(!('extraSheets' in JSON.parse(S.toJson(e))), 'nothing written when no sheet was added');
});

console.log(passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
