// The generated test export (15 invented registrations): the export check, the import and the To do list each pick up what they should.
// Usage: node test/import-test-file.test.js <current-planning-center-export.csv>
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const M = require('../model.js'), Csv = require('../csv.js'), V = require('../validate.js'), Season = require('../season.js'), Todo = require('../todo.js');
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); }
}
// With no argument it uses the invented TEST export in dev/test-data.
const exportCsv = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'test-data', '20261028 -- demo-club-2026-27 TEST.csv')),tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'awana-testexport-'));
cp.execFileSync('node', [path.join(__dirname, '..', '..', 'tools', 'make-test-export.js'), exportCsv, tmp]);
const NAME = '20261103 -- demo-club-2026-27 TEST.csv', text = fs.readFileSync(path.join(tmp, NAME), 'utf8'), base = fs.readFileSync(exportCsv, 'utf8');
const rows = t => Csv.parse(t).filter(r => r.some(c => c !== '')).length - 1;
const findings = V.validate(text, NAME).findings, has = (level, re) => findings.some(f => f.level === level && re.test(f.msg));

test('the file is the current export plus 15 rows, deterministic, and shaped like Planning Center\'s', () => {
  assert.strictEqual(rows(text), rows(base) + 15);
  assert.deepStrictEqual(Csv.parse(text)[0], Csv.parse(base)[0]);
  const again = fs.mkdtempSync(path.join(os.tmpdir(), 'awana-testexport-')); cp.execFileSync('node', [path.join(__dirname, '..', '..', 'tools', 'make-test-export.js'), exportCsv, again]);
  assert.strictEqual(fs.readFileSync(path.join(again, NAME), 'utf8'), text);
  assert(!/@(?!example\.)/.test(Csv.parse(text).slice(rows(base) + 1).map(r => r.join(',')).join('\n').replace(/@example\.(com|org)/g, '')), 'added rows use only example.com / example.org addresses');
});
test('export check: every case that should be caught is, by name, and no error stops the import', () => {
  assert.strictEqual(findings.filter(f => f.level === 'error').length, 0);
  [['warn', /Nora\)?.*no room/], ['warn', /Nora\)?.*first name has extra spaces/], ['warn', /olivia mcdonald\): first name is all lower case/], ['warn', /Priya Raghunathan\).*not a valid email/],
    ['warn', /Caleb Whitaker\): 7th Grade is past T&T/], ['warn', /Ruby Castellano\): 4th Grade usually goes in T&T, but the room is Sparks D/], ['warn', /Dmitri Volkov\): the Age column says 5 but the birthdate makes them 9/],
    ['warn', /Sam Okafor\): no birthdate/], ['warn', /Sam Okafor\): no phone number or email at all/], ['warn', /Room "Trek\/Journey" is not one of the 11 known rooms/], ['warn', /1 person is not Active/], ['warn', /"Jordan Whitfield" appears 2 times/]]
    .forEach(([l, re]) => assert(has(l, re), String(re)));
  assert(!has('warn', /TnT Boys/), 'TnT is read as T&T');
  assert(!has('warn', /Zoë|Mateo|Theo|Wren|Linus|Marguerite/), 'the well-formed oddballs raise nothing');
});
// the import and the to-do list
const master = M.loadMaster(base, '2026-10-28'), before = new Set(master.people.map(p => p[M.X.ID]));
const plan = M.planImport(master, Csv.toRecords(Csv.parse(text)));
test('import: every registration of the real export matches, the 15 planted ones are new, nobody is missing or renamed, and a review is needed', () => {
  const baseRows = before.size;      // the export has grown since the test was written (140 on 10/28), so the count comes from the file it was made from
  assert.deepStrictEqual([plan.matched.length, plan.added.length, plan.missing.length, plan.renames.length, !!M.needsReview(plan)], [baseRows, 15, 0, 0, true]);
});
M.applyPlan(master, plan, { rename: new Set(), add: new Set(plan.added), deactivate: new Set() }, '2026-10-29');
const newIds = new Set(master.people.map(p => p[M.X.ID]).filter(id => !before.has(id)));
test('the doubly registered child gets two distinct IDs and nothing else collides', () => {
  assert.strictEqual(newIds.size, 15); assert.strictEqual(new Set(master.people.map(p => p[M.X.ID])).size, master.people.length);
  assert([...newIds].some(id => /Whitfield#2$/.test(id)));
});
const season = Season.blank('2026-27'), res = Todo.compute({ master, season, quarter: 'Q2', today: '2026-10-29', newIds });
const names = id => (res.groups.find(g => g.id === id) || { items: [] }).items.filter(i => newIds.has(i.id)).map(i => i.name.replace(/\s+/g, ' ')).sort();
test('to do: classes to assign, and a class that does not fit', () => {
  assert.deepStrictEqual(names('class'), ['Caleb Whitaker', 'Nora Fenwick', 'olivia mcdonald']);
  const sug = n => res.groups.find(g => g.id === 'class').items.find(i => i.name.replace(/\s+/g, ' ') === n).suggest;
  assert.deepStrictEqual([sug('Nora Fenwick'), sug('olivia mcdonald'), sug('Caleb Whitaker')], ['Puggles', 'Sparks', '']);
  assert.deepStrictEqual(names('classfit'), ['Ruby Castellano']);
});
test('to do: colors for new Sparks and T&T children only; adults, Cubbies and Puggles are left out', () => {
  assert.deepStrictEqual(names('teams'), ['Dmitri Volkov', 'Jordan Whitfield', 'Jordan Whitfield', 'Mateo Alejandro Hartwell-Quinn', 'Priya Raghunathan', 'Ruby Castellano', 'Theo Vandermeer', 'Zoë O\'Brien-Nuñez']);
});
test('to do: uniforms, missing details, status, duplicates, medical (no balance-due list: that is Planning Center\'s business)', () => {
  assert.deepStrictEqual(names('uniform'), ['Linus Fenwick', 'Mateo Alejandro Hartwell-Quinn', 'Theo Vandermeer', 'Zoë O\'Brien-Nuñez']);
  assert.strictEqual(names('balance').length, 0); assert(!Todo.compute({ master: M.loadMaster(base, '2026-11-04'), quarter: 'Q2', today: '2026-11-04' }).groups.some(g => g.id === 'balance'));
  assert.deepStrictEqual(names('details'), ['Sam Okafor']);
  assert.deepStrictEqual(names('status'), ['Jordan Whitfield']);
  assert.deepStrictEqual(names('dups'), ['Jordan Whitfield', 'Jordan Whitfield']);
  assert.deepStrictEqual(names('medical'), ['Theo Vandermeer', 'Wren Calloway']);
});
test('to do: the adult volunteer in a class room needs nothing', () => {
  assert(!res.groups.some(g => g.items.some(i => /Marguerite/.test(i.name))));
});
test('to do: assigning a class and a color clears those items', () => {
  const nora = master.people.find(p => p[M.C.FIRST].trim() === 'Nora' && p[M.C.LAST] === 'Fenwick'); M.setField(nora, M.C.ROOM, 'Puggles');
  const r2 = Todo.compute({ master, season, quarter: 'Q2', today: '2026-10-29', newIds });
  assert(!r2.groups.find(g => g.id === 'class').items.some(i => /^Nora\b/.test(i.name)));
  const theo = master.people.find(p => p[M.C.FIRST] === 'Theo' && p[M.C.LAST] === 'Vandermeer'); M.addUserCol(master, 'team:Q2'); theo['team:Q2'] = 'Red';
  assert(!Todo.compute({ master, season, quarter: 'Q2', today: '2026-10-29', newIds }).groups.find(g => g.id === 'teams').items.some(i => /^Theo Vandermeer/.test(i.name)));
});
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
