// The saved file is compact (no indentation) and keeps each Planning Center field name once (roster.pcCols); older files, with a full record per person, still open.
// Usage: node test/compact-file.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const Season = require('../season.js'), Validate = require('../validate.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const dir = path.join(__dirname, '..', '..', 'test-data'), text = fs.readFileSync(path.join(dir, fs.readdirSync(dir).find(f => /TEST.*\.json$/.test(f))), 'utf8');
// The test files are saved in the current format, so the older one (an object per person, indented, version 4) is built here, without Season's own packing code.
const current = JSON.parse(text), names = current.roster.pcKeys || current.roster.pcCols;
const legacy = JSON.parse(text); legacy.version = 4; delete legacy.roster.pcKeys;
Object.keys(legacy.roster.people).forEach(id => { const e = legacy.roster.people[id]; if (Array.isArray(e.pc)) { const pc = {}; names.forEach((c, i) => { if (e.pc[i] !== null) pc[c] = e.pc[i]; }); e.pc = pc; } });
const legacyText = JSON.stringify(legacy, null, 1) + '\n';
const old = Season.fromJson(legacyText), packed = Season.toJson(old), raw = JSON.parse(packed);

test('the file is written without indentation and is smaller than the old pretty-printed one', () => {
  assert(!/\n\s/.test(packed.trim()), 'one line'); assert(packed.length < legacyText.length * 0.6, packed.length + ' vs ' + legacyText.length);
});
test('each person\'s Planning Center record is a list of values, with the field names once (roster.pcKeys when the file has no pcCols)', () => {
  const rawNames = raw.roster.pcKeys || raw.roster.pcCols; assert(Array.isArray(names) && rawNames.length > 10);
  const ids = Object.keys(raw.roster.people); assert(ids.length > 0); ids.forEach(id => { assert(Array.isArray(raw.roster.people[id].pc)); assert.strictEqual(raw.roster.people[id].pc.length, rawNames.length); });
  assert.strictEqual(raw.version, Season.VERSION);
});
test('loading it back gives exactly the same season as the one that was saved (and nothing extra in memory)', () => {
  const back = Season.fromJson(packed); assert.deepStrictEqual(back, old); assert(!('pcKeys' in back.roster));
  assert.strictEqual(Season.toJson(back), packed, 'saving again changes nothing');
});
test('an older file (objects per person, indented, version 4) still opens and gives the same season', () => {
  const v4 = JSON.parse(legacyText), first = v4.roster.people[Object.keys(v4.roster.people)[0]].pc;
  assert(first && !Array.isArray(first) && v4.version === 4); assert.deepStrictEqual(Season.fromJson(legacyText), old); assert.deepStrictEqual(Season.fromJson(text), old);
});
test('the export\'s column order (roster.pcCols) is kept as it is and is reused for the values, not overwritten or duplicated', () => {
  const s = Season.fromJson(packed), ids = Object.keys(s.roster.people), order = Object.keys(s.roster.people[ids[0]].pc).reverse().concat(['Unused Column']);
  ids.forEach(id => Object.keys(s.roster.people[id].pc).forEach(k => { if (!order.includes(k)) order.unshift(k); }));
  s.roster.pcCols = order;
  const o = JSON.parse(Season.toJson(s)); assert.deepStrictEqual(o.roster.pcCols, order); assert(!('pcKeys' in o.roster));
  const back = Season.fromJson(Season.toJson(s)); assert.deepStrictEqual(back.roster.pcCols, order); assert.deepStrictEqual(back.roster, s.roster);
  s.roster.pcCols = ['Only', 'Some'];      // does not cover the fields in use: the sorted list is added and pcCols is left alone
  const o2 = JSON.parse(Season.toJson(s)); assert.deepStrictEqual(o2.roster.pcCols, ['Only', 'Some']); assert(Array.isArray(o2.roster.pcKeys));
  assert.deepStrictEqual(Season.fromJson(Season.toJson(s)).roster, s.roster);
});
test('a person with a field that is not text keeps an object record, and a missing field stays missing', () => {
  const s = Season.fromJson(packed), ids = Object.keys(s.roster.people);
  s.roster.people[ids[0]].pc = Object.assign({}, s.roster.people[ids[0]].pc, { Odd: 5 }); delete s.roster.people[ids[1]].pc['Last Name'];
  const back = Season.fromJson(Season.toJson(s)); assert.deepStrictEqual(back.roster.people[ids[0]].pc, s.roster.people[ids[0]].pc); assert(!('Last Name' in back.roster.people[ids[1]].pc));
});
test('Validate raises no error on a packed file or an older one, and still flags a roster entry without a record', () => {
  const errs = t => Validate.validate(t, 'x.json').findings.filter(f => f.level === 'error');
  assert.deepStrictEqual(errs(packed), []); assert.deepStrictEqual(errs(legacyText), []);
  const bad = JSON.parse(packed), id = Object.keys(bad.roster.people)[0]; delete bad.roster.people[id].pc;
  assert(errs(JSON.stringify(bad)).some(f => /no Planning Center record/.test(f.msg)));
});
// ---- R17: the kept export record is small ----
test('the first capture adds under 15 KB to the test club\'s file; a second, different export adds under 2 KB beyond the changed values', () => {
  const M = require('../model.js'), Fx = require('./pc-fixture.js'), Csv = require('../csv.js'), exp = fs.readFileSync(path.join(dir, '20261103 -- demo-club-2026-27 TEST.csv'), 'utf8'), size = s => Season.toJson(s).length;
  const imp = (master, t, at) => { const rx = M.readExport(t), plan = M.planImport(master, { cols: rx.cols, records: rx.records }), res = M.applyPlan(master, plan, { rename: new Set(), add: new Set(plan.added), deactivate: new Set() }, '2026-11-10'); M.captureExport(master, rx, res, { text: t, at }); };
  const s0 = Season.fromJson(text), master = M.fromRoster(s0.roster); imp(master, exp, '2026-11-03T19:00:00.000Z');      // people are added and updated by this import, so measure the record alone:
  const withRec = Season.fromJson(text); withRec.roster = M.toRoster(master); const noRec = Season.fromJson(Season.toJson(withRec)); delete noRec.roster.pcExport;
  const first = size(withRec) - size(noRec); assert(first < 15000, 'the record adds ' + first + ' bytes');
  const before = Season.snapshot(withRec), rows = Csv.parse(exp); const second = Csv.serialize(rows.map((r, i) => i === 2 ? r.map((c, j) => (j === rows[0].indexOf('Times Attended') ? '99' : c)) : r));
  imp(master, second, '2026-11-10T19:00:00.000Z'); withRec.roster = M.toRoster(master); const e = Season.record(withRec, before, { now: '2026-11-10T19:00:00.000Z' }); assert(e, 'the second import is logged');
  const own = e.changes.filter(c => c.p[0] === 'roster' && c.p[1] === 'pcExport'), bytes = JSON.stringify(own).length; assert(bytes < 2000, 'the record\'s own History lines are ' + bytes + ' bytes: ' + own.map(c => c.p.join('/')).join(', '));
});

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
