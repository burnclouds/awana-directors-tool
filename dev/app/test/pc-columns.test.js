// Planning Center may rename, drop or add columns from year to year: a renamed column is found again by its meaning (and reported), a missing or ambiguous one is reported with what it affects,
// a new uniform-looking column is flagged, and nothing but a missing First or Last Name stops the import. Invented test club only.
// Usage: node test/pc-columns.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const M = require('../model.js'), Csv = require('../csv.js'), V = require('../validate.js'), { C } = M;
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const dir = path.join(__dirname, '..', '..', 'test-data'), file = fs.readdirSync(dir).filter(f => /TEST.*\.csv$/.test(f)).sort()[0], text = fs.readFileSync(path.join(dir, file), 'utf8');
const header = Csv.parse(text)[0].map(h => h.replace(/^﻿/, ''));
// the same export with its header edited: rename { from: to }, drop [names], add [names] (empty columns on the right)
const variant = (o) => { const rows = Csv.parse(text), h = rows[0].map(x => x.replace(/^﻿/, '')), keep = h.map((c, i) => (o.drop || []).includes(c) ? -1 : i).filter(i => i >= 0);
  const head = keep.map(i => (o.rename || {})[h[i]] || h[i]).concat(o.add || []); return Csv.serialize([head].concat(rows.slice(1).filter(r => r.some(v => v !== '')).map(r => keep.map(i => r[i] || '').concat((o.add || []).map(() => '')))), true); };
const rep = o => M.columnReport(Csv.parse(variant(o))[0]);
const levels = r => r.map(i => i.level + ':' + i.col);

test('the standard export is clean: every role is present and none of its 53 columns is new', () => {
  assert.deepStrictEqual(M.columnReport(header), []); assert.strictEqual(header.length, 53); M.PC_ROLES.filter(r => r.col !== C.UNIFORM).forEach(r => assert(header.includes(r.col), r.col + ' is a column of the standard export'));      // Uniform is next year\u2019s single column
  M.PC_KNOWN.forEach(c => assert(header.includes(c), c + ' is in the known list but not the export')); header.forEach(c => assert(M.PC_KNOWN.includes(c), c + ' is in the export but not the known list'));
});
test('a renamed column is found again by its meaning and its values carry over, and the change is reported as a note', () => {
  const cases = [['Assignment Area: Classes', 'Class Assignment'], ['Grade', 'School Grade'], ['Birthdate', 'Date of Birth'], ['Emergency Contact', 'Emergency Contact Name and Phone'], ['Medical Notes', 'Medical'],
    [C.ALLERGY, 'Any allergies or medical conditions?'], ['Cubbies Vest', 'Cubbies vest size'], ['Sparks Vest', 'Sparks Vest Size'], ['T&T shirt', 'TnT T-shirt size'], [C.SHIRT, 'Awana shirt size for a parent'], ['Registration ID', 'Registration Number'], ['Selection', 'Registration Selection']];
  cases.forEach(([from, to]) => {
    const t = variant({ rename: { [from]: to } }), m = M.loadMaster(t, '2026-10-28'), orig = M.loadMaster(text, '2026-10-28');
    assert(m.pcCols.includes(from), from + ' is the column name again after loading (was ' + to + ')'); assert(!m.pcCols.includes(to), to + ' is not a column of its own');
    assert.deepStrictEqual(m.people.map(p => p[from]), orig.people.map(p => p[from]), 'the values moved with the column: ' + from);
    assert.deepStrictEqual(m.pcRenamed, [{ from: to, to: from }]); const r = M.columnReport(Csv.parse(t)[0]); assert.deepStrictEqual(levels(r), ['info:' + from], from + ': ' + JSON.stringify(r));
  });
});
test('a renamed class column keeps every child in their class (no one becomes Unassigned)', () => {
  const m = M.loadMaster(variant({ rename: { 'Assignment Area: Classes': 'Class Assignment' } }), '2026-10-28'), o = M.loadMaster(text, '2026-10-28');
  assert.deepStrictEqual(m.people.map(p => M.room(p)), o.people.map(p => M.room(p))); assert(!m.people.some(p => M.room(p) === 'Unassigned'));
});
test('a missing column is reported with what it affects: core ones are warnings, gender is a note, a missing name is an error; the older uniform columns are never reported one by one', () => {
  const lvl = c => { const r = rep({ drop: [c] }); assert.strictEqual(r.length, 1, c + ': ' + JSON.stringify(r)); assert.strictEqual(r[0].col, c); assert(r[0].text.includes('There is no \u201c' + c + '\u201d column') && r[0].text.length > 40, r[0].text); return r[0].level; };
  ['Assignment Area: Classes', 'Grade', 'Birthdate', 'Selection', 'Emergency Contact', 'Medical Notes', C.ALLERGY, 'Registration ID'].forEach(c => assert.strictEqual(lvl(c), 'warn', c));
  assert.strictEqual(lvl('Gender'), 'info'); ['First Name', 'Last Name'].forEach(c => assert.strictEqual(lvl(c), 'error', c));
  assert(/shows as Unassigned/.test(rep({ drop: ['Assignment Area: Classes'] })[0].text));
  ['Cubbies Vest', 'Sparks Vest', 'T&T shirt', C.SHIRT].forEach(c => assert.deepStrictEqual(rep({ drop: [c] }), [], c + ': the older uniform columns are optional'));
  assert.deepStrictEqual(rep({ drop: ['Cubbies Vest', 'Sparks Vest'] }), [], 'one of the three is enough');
  const none = rep({ drop: ['Cubbies Vest', 'Sparks Vest', 'T&T shirt', C.SHIRT] }); assert.deepStrictEqual(levels(none), ['warn:Uniform']); assert(/No column says who wants a uniform/.test(none[0].text) || /There is no .Uniform. column/.test(none[0].text) && /Uniforms tab will be empty/.test(none[0].text), none[0].text);
});
test('the import still works with a column missing; only a missing First or Last Name is refused', () => {
  const m = M.loadMaster(variant({ drop: ['Assignment Area: Classes', 'Grade'] }), '2026-10-28'); assert.strictEqual(m.people.length, 140); assert(m.people.every(p => M.room(p) === 'Unassigned'));
  assert.throws(() => M.loadMaster(variant({ drop: ['Last Name'] }), '2026-10-28'), /First Name \/ Last Name/);
});
test('two columns that could both be the class are not guessed between: both are named and neither is used', () => {
  const r = rep({ rename: { 'Assignment Area: Classes': 'Class Assignment' }, add: ['Class Level Notes'] }); const w = r.find(i => i.col === 'Assignment Area: Classes');
  assert(w && w.level === 'warn' && /more than one column could be it/.test(w.text) && /Class Assignment/.test(w.text) && /Class Level Notes/.test(w.text), JSON.stringify(r)); assert(!r.some(i => i.level === 'info' && /read as/.test(i.text)));
});
test('a new column that looks like a uniform item or a size question is flagged; any other new column is one note; known columns and the app’s own are not flagged', () => {
  const r = rep({ add: ['Sparks Hoodie Size', 'Youth Polo', 'Favorite Bible Verse', 'Bus Route'] });
  assert.deepStrictEqual(levels(r).sort(), ['info:Favorite Bible Verse', 'warn:Sparks Hoodie Size', 'warn:Youth Polo'], 'with the older uniform columns present a polo is a new item, not the order');
  assert(/looks like a uniform item/.test(r.find(i => i.col === 'Youth Polo').text)); assert(/2 new columns/.test(r.find(i => i.level === 'info').text));
  assert.deepStrictEqual(M.columnReport(header.concat(['x_ClubberID', 'team:Q1', 'ov:Grade', 'x_Uni_OrderedDate'])), [], 'the app’s own columns are not new');
});
test('the older TnT spelling of the shirt column is still read as T&T shirt, with no warning', () => {
  const t = variant({ rename: { 'T&T shirt': 'TnT shirt' } }); assert.deepStrictEqual(M.columnReport(Csv.parse(t)[0]), []); assert(M.loadMaster(t, '2026-10-28').pcCols.includes('T&T shirt'));
});
test('a later export with a renamed column imports as the same people (no one is "missing", nothing changed)', () => {
  const m = M.loadMaster(text, '2026-10-28'), plan = M.planImport(m, Csv.toRecords(Csv.parse(variant({ rename: { 'Assignment Area: Classes': 'Class Assignment', Grade: 'School Grade' } }))));
  assert.strictEqual(plan.missing.length, 0); assert.strictEqual(plan.added.length, 0); assert.strictEqual(plan.matched.reduce((n, x) => n + x.changes.length, 0), 0);
});
test('Validate on an export reports the columns (notes, warnings) and stops only for a missing name', () => {
  const f = o => V.validate(variant(o), '20261028 -- demo.csv').findings, cols = o => f(o).filter(x => /^Columns:/.test(x.msg));
  assert.deepStrictEqual(cols({}), []); assert.deepStrictEqual(cols({ rename: { Grade: 'School Grade' } }).map(x => x.level), ['info']);
  assert.deepStrictEqual(cols({ drop: ['Cubbies Vest'], add: ['Youth Polo'] }).map(x => x.level), ['warn'], 'a missing vest column is nothing; a new polo column is a warning'); assert(!f({ drop: ['Cubbies Vest'] }).some(x => x.level === 'error'));
  const bad = f({ drop: ['First Name'] }); assert(bad.some(x => x.level === 'error' && /First Name/.test(x.msg))); assert(bad.length === 1, 'it stops there');
});
console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
