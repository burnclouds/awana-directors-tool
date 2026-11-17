// Uniforms next year: Planning Center says only that a family ordered and paid (one Uniform column, no size, no program); the kind comes from the class and everything else is recorded here.
// The older per-program columns still work. Invented test club only.
// Usage: node test/uniform-order.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const M = require('../model.js'), Csv = require('../csv.js'), Todo = require('../todo.js'), Reports = require('../reports.js'), Season = require('../season.js'), { C, UNI } = M;
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const dir = path.join(__dirname, '..', '..', 'test-data'), text = fs.readFileSync(path.join(dir, fs.readdirSync(dir).filter(f => /TEST.*\.csv$/.test(f)).sort()[0]), 'utf8');
// the standard export turned into next year's form: the four older uniform columns replaced by one (value by class group so the test can see the kind), the given values per child
const nextYear = (colName, valueOf) => { const rows = Csv.parse(text), h = rows[0].map(x => x.replace(/^﻿/, '')), drop = new Set(['Cubbies Vest', 'Sparks Vest', 'T&T shirt', C.SHIRT]), keep = h.map((c, i) => drop.has(c) ? -1 : i).filter(i => i >= 0), ri = h.indexOf('Assignment Area: Classes');
  return Csv.serialize([keep.map(i => h[i]).concat([colName])].concat(rows.slice(1).filter(r => r.some(v => v !== '')).map((r, n) => keep.map(i => r[i] || '').concat([valueOf(r[ri], n)]))), true); };
const yes = (room, n) => n % 3 === 0 ? 'Yes' : n % 3 === 1 ? 'No' : '';
const kids = m => m.people.filter(p => M.isClubber(p) && M.isActive(p));

test('the one Uniform column: anything but blank or No means ordered and paid; the kind comes from the class', () => {
  const m = M.loadMaster(nextYear('Uniform', yes), '2026-10-28'), want = kids(m).filter(p => M.uniformItems(p).length), by = {};
  assert(want.length > 5 && want.length < kids(m).length, 'some children, not all'); want.forEach(p => { assert.strictEqual(p[C.UNIFORM], 'Yes'); const k = M.uniformItems(p)[0]; by[M.groupOf(M.room(p))] = k; });
  Object.keys(by).forEach(g => assert.strictEqual(by[g], { Cubbies: 'Cubbies vest', Sparks: 'Sparks vest', 'T&T': 'T&T shirt' }[g] || 'Uniform', g + ' wears ' + by[g]));
  ['Yes', 'yes', 'Ordered', '$25', '1', 'Uniform ($25.00)'].forEach(v => assert(M.wantsUniform(v), v)); ['', ' ', 'No', 'no', 'None', 'N/A', '0', '$0', '$0.00', '-', 'false'].forEach(v => assert(!M.wantsUniform(v), JSON.stringify(v)));
  assert.strictEqual(M.uniformKind({ [C.ROOM]: 'Unassigned' }), 'Uniform', 'a child with no class yet is just a Uniform');
});
test('the Uniform column is found whatever it is called, and no older column or size question is needed', () => {
  ['Uniform', 'Uniform (Ordered & Paid)', 'Awana Uniform Ordered and Paid', 'Uniform order'].forEach(name => {
    const t = nextYear(name, yes), m = M.loadMaster(t, '2026-10-28'); assert(m.pcCols.includes(C.UNIFORM), name); assert(kids(m).some(p => M.uniformItems(p).length), name);
    assert.deepStrictEqual(M.columnReport(Csv.parse(t)[0]).filter(i => i.level !== 'info'), [], name + ': no warning (a rename is only a note)');
  });
  assert.deepStrictEqual(M.columnReport(Csv.parse(nextYear('Uniform', yes))[0]), [], 'a plain Uniform column: nothing to say');
});
test('no uniform column at all is one warning, and a size-looking column is not taken for the order', () => {
  const none = M.columnReport(Csv.parse(nextYear('Favorite Verse', yes))[0]); assert(none.some(i => i.col === 'Uniform' && i.level === 'warn' && /Uniforms tab will be empty/.test(i.text)), JSON.stringify(none)); assert.strictEqual(none.filter(i => i.level === 'warn').length, 1);
  const size = M.columnReport(Csv.parse(nextYear('Uniform Size', yes))[0]); assert(size.some(i => i.col === 'Uniform' && i.level === 'warn') && size.some(i => i.col === 'Uniform Size' && /looks like a uniform item or a size question/.test(i.text)));
});
test('the older per-program columns still work and take precedence over a Uniform column; a new polo column beside them is flagged, not read as the order', () => {
  const m = M.loadMaster(text, '2026-10-28'); assert(m.pcCols.includes('Cubbies Vest') && !m.pcCols.includes(C.UNIFORM)); const kid = kids(m).find(p => M.uniformItems(p).length), was = M.uniformItems(kid).join();
  kid[C.UNIFORM] = 'Yes'; assert.strictEqual(M.uniformItems(kid).join(), was, 'the per-program columns decide when they have a value'); const none = kids(m).find(p => !M.uniformItems(p).length); none[C.UNIFORM] = 'Yes'; assert.strictEqual(M.uniformItems(none).length, 1, 'a child with none of them but a Uniform value still counts');
  const polo = M.columnReport(Csv.parse(text)[0].map(x => x.replace(/^\uFEFF/, '')).concat(['Youth Polo'])); assert.deepStrictEqual(polo.map(i => i.level + ':' + i.col), ['warn:Youth Polo']);
});
test('the To do item says what Planning Center said and what is still missing: no size recorded yet, or the size', () => {
  const m = M.loadMaster(nextYear('Uniform', yes), '2026-10-28'), season = Season.blank('2026-27'), items = () => (Todo.compute({ master: m, season, quarter: 'Q2', today: '2026-10-29' }).groups.find(g => g.id === 'uniform') || { items: [] }).items;
  const first = items()[0]; assert(first && /no size recorded yet/.test(first.text), first && first.text); assert(/ordered and paid for one in Planning Center/.test(Todo.compute({ master: m, season, quarter: 'Q2', today: '2026-10-29' }).groups.find(g => g.id === 'uniform').hint), 'the hint says what the item means');
  const p = m.people.find(x => x[M.X.ID] === first.id); p[UNI.SIZE_VERIFIED] = 'Youth M'; assert(/size Youth M/.test(items().find(i => i.id === first.id).text)); p[UNI.ORDERED] = '2026-10-30'; assert(!items().some(i => i.id === first.id), 'an order date clears it');
});
test('the report and the columns: no parent-size or older size columns unless the file has them; rows line up with the heading', () => {
  const m = M.loadMaster(nextYear('Uniform', yes), '2026-10-28'); let h = Reports.uniformHead(m); assert.deepStrictEqual(h, ['Name', 'Class', 'Item', 'Size', 'Ordered', 'Received', 'Given', 'Notes']);
  Reports.uniformRows(m).forEach(r => assert.strictEqual(r.length, h.length)); const kid = kids(m).find(p => M.uniformItems(p).length); kid[UNI.SIZE_ORDERED] = 'M';
  h = Reports.uniformHead(m); assert.deepStrictEqual(h, ['Name', 'Class', 'Item', 'Size', 'Ordered', 'Size ordered', 'Received', 'Given', 'Size given', 'Notes'], 'a file with data in the older boxes keeps them'); Reports.uniformRows(m).forEach(r => assert.strictEqual(r.length, h.length));
  const std = M.loadMaster(text, '2026-10-28'); assert(!Reports.uniformHead(std).includes('Parent size'), 'the parent size is not shown: the club does not use it'); Reports.uniformRows(std).forEach(r => assert.strictEqual(r.length, Reports.uniformHead(std).length));
  assert(!Reports.uniformHead(m).some(x => /paid|balance|owe/i.test(x)), 'no money column');
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
