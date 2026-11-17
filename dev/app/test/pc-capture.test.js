// R17: everything Planning Center gives us is kept: every column (as exported and as stored), every row, blank rows counted, cells past the header, values of spaces,
// an export column named like a club column, and (task 4) the whole export can be rebuilt from the data file. Invented data only (the TEST export plus test/pc-fixture.js).
// Usage: node test/pc-capture.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const Csv = require('../csv.js'), M = require('../model.js'), Season = require('../season.js'), Fx = require('./pc-fixture.js');
const { C, X } = M;
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const td = path.join(__dirname, '..', '..', 'test-data'), files = fs.readdirSync(td);
const TEXT = fs.readFileSync(path.join(td, '20261103 -- demo-club-2026-27 TEST.csv'), 'utf8'), FIX = Fx.build(TEXT);
const dataText = () => fs.readFileSync(path.join(td, files.filter(f => /TEST.*\.json$/.test(f)).sort().pop()), 'utf8');
const testMaster = () => M.fromRoster(Season.fromJson(dataText()).roster);      // the TEST club as the app opens it
const asPc = rx => ({ cols: rx.cols, records: rx.records });
const decide = plan => ({ rename: new Set(), add: new Set(plan.added), deactivate: new Set() });

// ---- task 3: read the export without dropping anything ----
test('toTable keeps the header as written, counts blank rows and keeps every cell past the header', () => {
  const t = Csv.toTable(Csv.parse(' A ,B,,B\r\n1,2,3,4,5,6\r\n,,,\r\n\r\n7,8\r\n'));
  assert.deepStrictEqual(t.header, [' A ', 'B', '', 'B']); assert.strictEqual(t.blankRows, 2, 'a row of empty cells and an empty line'); assert.deepStrictEqual(t.body, [['1', '2', '3', '4', '5', '6'], ['7', '8']]);
  assert.deepStrictEqual(Csv.toTable([]), { header: [], body: [], blankRows: 0 });
});
test('readExport names every column: trimmed, numbered repeats, (no header N), pc: for a club-like name', () => {
  const rx = M.readExport(FIX), width = Math.max(...Csv.parse(FIX).map(r => r.length));
  assert(rx.names.includes('Grade') && rx.header.includes(' Grade'), 'trimmed name, header as written');
  assert(rx.names.includes('Selection (2)')); assert(rx.names.includes('pc:x_Notes'), 'club-like name');
  const nh = rx.names.filter(n => /^\(no header \d+\)$/.test(n)); assert.strictEqual(nh.length, 3, nh.join(','));
  assert.strictEqual(rx.names.length, width); assert.strictEqual(rx.cols, rx.names); assert.strictEqual(rx.blankRows, 1);
  const extra = rx.records.find(r => r['(no header ' + (rx.header.length + 1) + ')'] === 'extra1'); assert(extra && extra['(no header ' + (rx.header.length + 2) + ')'] === 'extra2', 'the long row keeps both extra cells');
  assert.strictEqual(rx.records.length, Csv.parse(FIX).length - 2 /* header and blank row */); assert.strictEqual(rx.rows, rx.records.length + 1);
  assert(rx.cells.every(c => c.length === rx.names.length) && rx.cells.length === rx.records.length);
});
test('normalizePc is idempotent (TEST export and fixture)', () => {
  [TEXT, FIX].forEach(t => { const x = M.normalizePc(Csv.toRecords(Csv.parse(t))); assert.deepStrictEqual(M.normalizePc({ cols: x.cols, records: x.records }).cols, x.cols); assert.deepStrictEqual(M.normalizePc({ cols: x.cols, records: x.records }).records, x.records); });
  const rx = M.readExport(FIX); assert.deepStrictEqual(M.normalizePc(asPc(rx)).cols, rx.cols);
});
test('an export column named like a club column is stored under pc: and never touches the club\'s value', () => {
  const master = testMaster(), rx = M.readExport(FIX), rec0 = rx.records[0], kid = master.people.find(p => p[C.REG] === rec0[C.REG] && p[C.FIRST] === rec0[C.FIRST]); assert(kid, 'the first row is a person of the TEST club');
  kid[X.NOTES] = 'leader note'; const plan = M.planImport(master, asPc(rx)); M.applyPlan(master, plan, decide(plan), '2026-11-10');
  assert.strictEqual(kid[X.NOTES], 'leader note'); assert.strictEqual(kid['pc:x_Notes'], 'from the export'); assert.strictEqual(M.isUserCol('pc:x_Notes'), false);
  const e = M.toRoster(master).people[kid[X.ID]]; assert.strictEqual(e.pc['pc:x_Notes'], 'from the export'); assert.strictEqual(e.v[X.NOTES], 'leader note'); assert(!('pc:x_Notes' in e.v));
});
test('a value of only spaces is kept', () => {
  const master = testMaster(), rx = M.readExport(FIX), plan = M.planImport(master, asPc(rx)); M.applyPlan(master, plan, decide(plan), '2026-11-10');
  const r = M.toRoster(master), spaced = Object.values(r.people).filter(e => e.pc['Home Phone Number'] === '   '); assert.strictEqual(spaced.length, 1, 'the person whose phone was three spaces keeps them');
});
test('the standard export still reads exactly as before', () => {
  const rx = M.readExport(TEXT), old = M.normalizePc(Csv.toRecords(Csv.parse(TEXT)));
  assert.deepStrictEqual(rx.cols, old.cols); assert.deepStrictEqual(rx.records, old.records); assert.strictEqual(rx.blankRows, 0); assert.deepStrictEqual(rx.header, Csv.parse(TEXT)[0]);
});
test('columnReport says when a column was renamed to pc:', () => {
  const rep = M.columnReport(M.readExport(FIX).reportCols);
  assert.deepStrictEqual(M.columnReport(['First Name', 'Last Name', 'x_Notes']).filter(i => /pc:/.test(i.text)), [], 'a raw club column of a loaded roster is not an export column');
  assert(rep.some(i => i.level === 'info' && /has a column named “x_Notes”, which is a name this app uses for its own data; it is kept as “pc:x_Notes”/.test(i.text)), rep.map(i => i.text).join(' | '));
});
test('Validate counts what an export holds: rows, blank rows, columns, cells past the header and columns with no header', () => {
  const V = require('../validate.js'), r = V.validate(FIX, '20261110 -- demo-club-2026-27 TEST extra.csv'), line = r.findings.find(f => f.level === 'info' && /rows/.test(f.msg) && /columns/.test(f.msg));
  assert(line, r.findings.map(f => f.msg).join(' | ')); assert(/1 blank/.test(line.msg) && /2 cell positions past the last header column/.test(line.msg) && /1 column with no header/.test(line.msg), line.msg);
  assert(r.findings.some(f => /pc:x_Notes/.test(f.msg)), 'the pc: rename is reported');
});
test('an old extended (master) CSV still loads with its own columns, not renamed to pc:', () => {
  const m = M.loadMaster(TEXT, '2026-10-29'), csv = M.toCsv(m), back = M.loadMaster(csv, '2026-10-29');
  assert(back.userCols.includes(X.NOTES) && back.userCols.includes('x_Active'), 'the club columns stay club columns'); assert(!back.pcCols.some(c => /^pc:/.test(c)));
});

// ---- task 4: roster.pcExport, format version 6, and the rebuild that proves nothing is lost ----
const sortRows = rows => rows.map(r => JSON.stringify(r)).sort();
const sameGrid = (back, text) => { const g = Fx.grid(text); assert.deepStrictEqual(back.header, g.header, 'the header as exported'); assert.deepStrictEqual(sortRows(back.rows), sortRows(g.rows), 'every row, cell for cell'); };
// Import `text` over `master` the way the app does (every new row added, except `skip` registration ids) and keep the record.
function importOver(master, text, at, skip) {
  const rx = M.readExport(text), plan = M.planImport(master, asPc(rx)), dec = { rename: new Set(), add: new Set(plan.added.filter(r => !(skip || []).includes(r['Registration ID']))), deactivate: new Set() };
  const res = M.applyPlan(master, plan, dec, '2026-11-10'); M.captureExport(master, rx, res, { text, at: at || '2026-11-10T19:00:00.000Z' }); master.pcAsOf = '2026-11-10'; master.pcSource = 'x.csv'; return { rx, res };
}
const asSeason = master => { const s = Season.fromJson(dataText()); s.roster = M.toRoster(master); return s; };
test('nothing is lost: the export can be rebuilt from the data file', () => {
  const master = testMaster(); importOver(master, FIX, null, [Fx.NOBODY]);
  const s = asSeason(master), cap = s.roster.pcExport; assert(cap, 'the record is written with the roster');
  const back = M.exportBack(Season.fromJson(Season.toJson(s)).roster); sameGrid(back, FIX);
  assert.strictEqual(cap.loose.length, 1); assert.strictEqual(cap.blankRows, 1); assert.strictEqual(cap.rows, Object.keys(cap.ids).length + cap.loose.length + cap.blankRows);
  assert.deepStrictEqual(Object.keys(cap).sort(), M.CAPTURE_KEYS.slice().sort()); assert(/^[0-9a-f]{8}-\d+$/.test(cap.hash), cap.hash); assert.strictEqual(cap.hash, M.hashText(FIX)); assert.notStrictEqual(cap.hash, M.hashText(TEXT)); assert.strictEqual(M.hashText('﻿abc'), M.hashText('abc'), 'the byte order mark does not count');
});
test('...and it survives edit, History, undo and restore', () => {
  const master = testMaster(), s = Season.fromJson(dataText()), n0 = s.history.length;
  const before = Season.snapshot(s); importOver(master, FIX, null, [Fx.NOBODY]); s.roster = M.toRoster(master); const e = Season.record(s, before, { now: '2026-11-10T19:00:00.000Z' }); assert(e, 'the import is logged');
  const b2 = Season.snapshot(s); s.attendance['2026-11-04'] = s.attendance['2026-11-04'] || {}; s.attendance['2026-11-04'][Object.keys(s.roster.people)[0]] = { a: 1 }; Season.record(s, b2, { now: '2026-11-10T19:30:00.000Z' });
  sameGrid(M.exportBack(Season.at(s, n0 + 1).roster), FIX); sameGrid(M.exportBack(Season.restoreTo(s, n0 + 1).season.roster), FIX); sameGrid(M.exportBack(Season.fromJson(Season.toJson(s)).roster), FIX);
  assert.strictEqual(M.exportBack(Season.at(s, n0).roster), null, 'before the import there is no record');
  e.changes.forEach(c => assert(!/undefined|\[object/.test(Season.describe(c, id => id)), 'describe: ' + Season.describe(c, id => id)));
  assert(e.changes.some(c => /Planning Center export kept: \d+ rows/.test(Season.describe(c, id => id))), 'the record is worded');
});
test('...a second, different export replaces it; a column the new export lacks keeps its values and is not in names; History logs one change per person who left', () => {
  const master = testMaster(); importOver(master, FIX, null, [Fx.NOBODY]);
  const s = asSeason(master), before = Season.snapshot(s), rows = Csv.parse(TEXT), gone = rows[1][rows[0].indexOf('First Name')], second = Csv.serialize([rows[0]].concat(rows.slice(2)));      // the first person is no longer in it
  importOver(master, second, '2026-11-17T19:00:00.000Z'); s.roster = M.toRoster(master); const e = Season.record(s, before, { now: '2026-11-17T19:00:00.000Z' }); assert(e);
  const cap = s.roster.pcExport; assert(!cap.names.includes(Fx.SNACK), 'a column the export lacks is not in names'); assert(s.roster.pcCols.includes(Fx.SNACK), 'but it is kept');
  assert(Object.values(s.roster.people).some(p => p.pc[Fx.SNACK] === 'Zebracakes 1'), 'with its last values');
  const idChanges = e.changes.filter(c => c.p[1] === 'pcExport' && c.p[2] === 'ids'); assert(idChanges.length >= 1 && idChanges.every(c => c.p.length === 4), 'one change per person, never the whole id list: ' + JSON.stringify(idChanges.map(c => c.p.length)));
  assert(!e.changes.some(c => c.p.join('/') === 'roster/pcExport/ids'), 'the id list is not logged whole'); assert(gone && idChanges.some(c => !('n' in c)), 'a person who left is a removal');
  sameGrid(M.exportBack(Season.fromJson(Season.toJson(s)).roster), second);
});
test('...linking a guest to a loose row moves it into ids', () => {
  const master = testMaster(), rx = M.readExport(FIX); importOver(master, FIX, null, [Fx.NOBODY]);
  const guest = Object.assign({}, master.people[0]); const id = 'manual_Guest_Kid'; Object.keys(guest).forEach(k => { guest[k] = ''; }); Object.assign(guest, { [C.REG]: 'manual', [C.FIRST]: 'Guest', [C.LAST]: 'Kid', [X.ID]: id, [X.ACTIVE]: '1' }); master.people.push(guest);
  const rec = M.unlinkedRecords(master, asPc(rx)).find(r => r[C.REG] === Fx.NOBODY); assert(rec, 'the nameless row is offered');
  assert.strictEqual(master.pcExport.loose.length, 1); M.linkToPc(master, guest, asPc(rx), rec, '2026-11-10');
  assert.strictEqual(master.pcExport.loose.length, 0, 'out of loose'); assert.strictEqual(master.pcExport.ids[id], 1, 'into ids');
  sameGrid(M.exportBack(M.toRoster(master)), FIX);
});
test('...the demo file\'s date shift moves loose rows and people\'s values alike', () => {
  const rows = Csv.parse(FIX), si = rows[0].indexOf(Fx.SNACK); rows[1][si] = '2026-10-05'; rows[rows.length - 1][si] = '2026-10-05'; const text = Csv.serialize(rows);
  const master = testMaster(); importOver(master, text, null, [Fx.NOBODY]); const s = asSeason(master);
  const moved = Season.fromJson(Season.toJson(Season.shiftDates(s, 14))); const back = M.exportBack(moved.roster);
  // what the demo shift does to a value: an ISO date moves by whole days, an ISO timestamp too; everything else stays
  const mv = v => /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(Date.parse(v + 'T12:00:00Z') + 14 * 86400000).toISOString().slice(0, 10) : v;
  const want = Csv.parse(text).map((r, i) => i === 0 ? r : r.map(mv)); assert.strictEqual(want[1][si], '2026-10-19'); assert.strictEqual(want[want.length - 1][si], '2026-10-19'); sameGrid(back, Csv.serialize(want));
});

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
