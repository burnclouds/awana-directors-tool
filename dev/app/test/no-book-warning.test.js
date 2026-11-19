// N33: the "Needs a handbook" (no book) warning on To do. A child with no progress at all has no book, and that is legitimate: no warning.
// A child with some progress and no book still gets it. Invented names only.
// Usage: node test/no-book-warning.test.js
const assert = require('assert');
const M = require('../model.js'), S = require('../season.js'), T = require('../todo.js');
const { C, X } = M;
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const kid = (id, first, last, room) => { const p = {}; p[X.ID] = id; p[C.FIRST] = first; p[C.LAST] = last; p[C.ROOM] = room; p[C.SELECTION] = 'Clubber (Cubbies, Sparks & TnT only)'; p['team:Q2'] = 'Red'; return p; };
const noProgress = kid('a', 'Zed', 'Adams', 'T&T Boys (Group A)'), someProgress = kid('b', 'Amy', 'Young', 'T&T Boys (Group A)');
const master = { people: [noProgress, someProgress], pcCols: [], userCols: [] };
const season = S.blank('2026-27');
season.progress = { b: { common: {}, AS: { 'AS1.1': '2026-11-04' } } };      // a sign-off in a book: progress indicated
const warned = () => { const g = T.compute({ master, season, quarter: 'Q2', today: '2026-11-18' }).groups.find(x => x.id === 'handbook'); return g ? g.items.map(i => i.id) : []; };

test('a child with no progress and no book gets no no-book warning', () => { assert(!warned().includes('a'), 'warned: ' + warned().join(',')); });
test('a child with progress but no book still gets the warning', () => { assert(warned().includes('b'), 'not warned: ' + warned().join(',')); });
test('hasProgress: false for a fresh child, true once a date is signed', () => { assert.strictEqual(S.hasProgress(season, 'a'), false); assert.strictEqual(S.hasProgress(season, 'b'), true); });
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
