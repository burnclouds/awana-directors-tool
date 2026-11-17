// The data JSON holds the roster extras AND the full Planning Center export as of the last import; the export is the only CSV and is read-only.
// Usage: node test/roster.test.js <planning-center-export.csv>
const fs = require('fs'), assert = require('assert');
const M = require('../model.js'), Csv = require('../csv.js'), Teams = require('../teams.js'), R = require('../reports.js');
const { C, X } = M;
// With no argument it uses the invented TEST export in dev/test-data.
const exportText = fs.readFileSync(process.argv[2] || require('path').join(__dirname, '..', '..', 'test-data', '20261028 -- demo-club-2026-27 TEST.csv'), 'utf8'), today = '2026-10-29';
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const pcExport = () => Csv.toRecords(Csv.parse(exportText));      // { cols, records }
const fresh = () => M.loadMaster(exportText, today);
const kid = m => m.people.find(p => M.isClubber(p) && /^Sparks/.test(p[C.ROOM]));
const byId = (m, id) => m.people.find(p => p[X.ID] === id);
const edited = () => {             // a master with a bit of everything the app lets you change
  const m = fresh(), k = kid(m);
  k['team:Q1'] = 'Red'; k['team:Q2'] = 'Blue'; k[X.NOTES] = 'allergic to cats, ask mom'; k[M.UNI.ORDERED] = '2026-10-01';
  M.setField(k, C.ROOM, 'Sparks Z');                                        // pending Planning Center change
  M.setField(m.people[3], C.GRADE, '9th Grade');
  m.people[5][X.ACTIVE] = '0';
  M.addUserCol(m, 'award:2026-11-04'); m.people[7]['award:2026-11-04'] = 'Gold';
  M.addManualPerson(m, { [C.FIRST]: 'Zed', [C.LAST]: 'Walkin', [C.ROOM]: 'Cubbies', [C.GRADE]: 'Pre-K', [C.SELECTION]: 'Clubber (Cubbies, Sparks & T&T only)', [C.ALLERGY]: 'peanuts' }, today);
  return m;
};

test('the roster section holds each person by frozen ID: the whole Planning Center record plus the fields you own', () => {
  const m = edited(), r = M.toRoster(m), k = kid(m), e = r.people[k[X.ID]];
  assert.strictEqual(Object.keys(r.people).length, m.people.length);
  m.pcCols.forEach(c => assert.strictEqual(e.pc[c] || '', k[c] || '', c));
  assert(!Object.values(e.pc).includes(''), 'empty values are left out');
  assert.deepStrictEqual(r.pcCols, m.pcCols, 'column order is kept');
  assert.strictEqual(e.v['team:Q1'], 'Red'); assert.strictEqual(e.v['ov:' + C.ROOM], 'Sparks Z'); assert.strictEqual(e.v[X.NOTES], 'allergic to cats, ask mom');
  assert(!(X.ID in e.v), 'the ID is the key, not repeated');
  assert(!Object.values(e.v).includes(''), 'empty values are left out');
});

test('pending Planning Center changes survive a save (they were lost in the old CSV round trip)', () => {
  const m = edited(), back = M.fromRoster(JSON.parse(JSON.stringify(M.toRoster(m))));
  assert.strictEqual(M.pendingChanges(back).length, M.pendingChanges(m).length);
  assert.strictEqual(M.room(byId(back, kid(m)[X.ID])), 'Sparks Z');
});

test('the full export is stored: medical, allergy, emergency contact, phones, emails and addresses', () => {
  const m = fresh(), back = M.fromRoster(JSON.parse(JSON.stringify(M.toRoster(m))));
  let checked = 0;
  m.people.forEach(p => ['Medical Notes', C.ALLERGY, C.EMERG, 'Mobile Phone Number', 'Home Email Address', 'Home Address Street'].forEach(c => {
    if (!p[c]) return; checked++; assert.strictEqual(byId(back, p[X.ID])[c], p[c], p[X.ID] + ' ' + c);
  }));
  assert(checked > 100, 'the export should have plenty of detail: ' + checked);
});

test('olderExport: an export dated before the file\'s Planning Center data is older', () => {
  assert.deepStrictEqual(M.olderExport('2026-11-03', '20261028 -- demo-club-2026-27 TEST.csv'), { older: true, exportDate: '2026-10-28', fileDate: '2026-11-03' });
});
test('olderExport: same day and newer are not older', () => {
  const a = M.olderExport('2026-11-03', '20261103 -- x TEST.csv'), b = M.olderExport('2026-11-03', '20261104 -- x TEST.csv');
  assert.strictEqual(a.older, false); assert.strictEqual(a.exportDate, '2026-11-03'); assert.strictEqual(b.older, false); assert.strictEqual(b.exportDate, '2026-11-04');
});
test('olderExport: no date, a date that is not real, or no file date is never older', () => {
  assert.deepStrictEqual(M.olderExport('2026-11-03', 'export.csv'), { older: false, exportDate: '', fileDate: '2026-11-03' });
  assert.strictEqual(M.olderExport('2026-11-03', '20261399 -- x.csv').older, false); assert.strictEqual(M.olderExport('2026-11-03', '20261399 -- x.csv').exportDate, '');
  [undefined, '', 'Oct 28'].forEach(f => { const r = M.olderExport(f, '20261028 -- x.csv'); assert.strictEqual(r.older, false); assert.strictEqual(r.fileDate, ''); });
});
test('the export date and file name are kept: the date comes from a leading yyyymmdd in the file name, else today', () => {
  assert.strictEqual(M.exportDate('20261028 -- sc-awana-club-2026-27.csv', '2026-10-29'), '2026-10-28');
  assert.strictEqual(M.exportDate('export.csv', '2026-10-29'), '2026-10-29');
  const m = fresh(); m.pcAsOf = '2026-10-28'; m.pcSource = '20261028 -- sc.csv';
  const back = M.fromRoster(JSON.parse(JSON.stringify(M.toRoster(m))));
  assert.deepStrictEqual([back.pcAsOf, back.pcSource], ['2026-10-28', '20261028 -- sc.csv']);
});

test('rebuilding from the JSON gives back the same people, IDs, rooms and owned fields', () => {
  const m = edited(), back = M.fromRoster(JSON.parse(JSON.stringify(M.toRoster(m))));
  assert.strictEqual(back.people.length, m.people.length);
  m.people.forEach(p => {
    const b = byId(back, p[X.ID]); assert(b, 'missing ' + p[X.ID]);
    ['ID', 'ACTIVE', 'NOTES', 'FIRST_SEEN', 'LAST_SEEN'].forEach(k => assert.strictEqual(b[X[k]] || '', p[X[k]] || '', k));
    m.pcCols.forEach(c => assert.strictEqual(b[c] || '', p[c] || '', p[X.ID] + ' ' + c));
    assert.strictEqual(M.room(b), M.room(p));
    Object.keys(p).filter(M.isUserCol).forEach(c => assert.strictEqual(b[c] || '', p[c] || '', p[X.ID] + ' ' + c));
  });
  assert(back.userCols.includes('award:2026-11-04'));
});

test('a manually added person (not in Planning Center) keeps every field you typed', () => {
  const m = edited(), z = m.people.find(p => p[C.FIRST] === 'Zed');
  const b = byId(M.fromRoster(JSON.parse(JSON.stringify(M.toRoster(m)))), z[X.ID]);
  assert.strictEqual(b[C.ALLERGY], 'peanuts'); assert.strictEqual(M.room(b), 'Cubbies');
});

test('with only the JSON open, the medical, emergency-contact and volunteer reports are identical to the ones from the export', () => {
  const m = fresh(), back = M.fromRoster(JSON.parse(JSON.stringify(M.toRoster(m))));
  const ctx = x => ({ master: x, settings: { club: 'Club' }, calendar: [], rotation: [], season: null, opts: {} });
  ['binderClass', 'binderAll', 'volunteers', 'photos', 'uniforms'].forEach(id => {
    const def = R.LIST.find(r => r.id === id), a = def.render(ctx(m)), b = def.render(ctx(back));
    assert(a.length > 300, id + ' should have content'); assert.strictEqual(b, a, id);
  });
  assert(m.people.filter(p => M.medicalText(p)).length > 5);
});

test('opening this week\'s export against the JSON matches everyone silently: no new, missing or renamed people, no review needed', () => {
  const m = fresh(), back = M.fromRoster(M.toRoster(m)), plan = M.planImport(back, pcExport());
  assert.strictEqual(plan.matched.length, m.people.length);
  assert.deepStrictEqual([plan.added.length, plan.missing.length, plan.renames.length], [0, 0, 0]);
  assert.strictEqual(M.needsReview(plan), false);
  assert.strictEqual(plan.matched.filter(x => x.changes.length).length, 0, 'unchanged people must not show field changes');
});

test('an updated allergy in the export needs a review and shows old and new text; a changed phone number refreshes silently', () => {
  const back = M.fromRoster(JSON.parse(JSON.stringify(M.toRoster(fresh())))), pc = pcExport();
  const a = pc.records.find(x => x[C.ALLERGY] && x[C.ALLERGY].length > 3), was = a[C.ALLERGY]; a[C.ALLERGY] = was + ' (now also dairy)';
  let plan = M.planImport(back, pc);
  assert.strictEqual(M.needsReview(plan), true);
  const ch = plan.matched.find(x => x.changes.length).changes.find(c => c.col === C.ALLERGY);
  assert.deepStrictEqual([ch.from, ch.to, ch.important], [was, was + ' (now also dairy)', true]);
  a[C.ALLERGY] = was;
  pc.records[0]['Mobile Phone Number'] = '555-0100';
  plan = M.planImport(back, pc);
  assert.strictEqual(M.needsReview(plan), false);
  M.applyPlan(back, plan, { rename: new Set(), add: new Set(), deactivate: new Set() }, today);
  assert.strictEqual(M.toRoster(back).people[back.people.find(p => p['Mobile Phone Number'] === '555-0100')[X.ID]].pc['Mobile Phone Number'], '555-0100');
});

test('applying the export keeps IDs and everything you own', () => {
  const m = edited(), back = M.fromRoster(M.toRoster(m)), plan = M.planImport(back, pcExport());
  M.applyPlan(back, plan, { rename: new Set(), add: new Set(), deactivate: new Set() }, today);
  const b = byId(back, kid(m)[X.ID]);
  assert.strictEqual(b['team:Q2'], 'Blue'); assert.strictEqual(b['ov:' + C.ROOM], 'Sparks Z');
});

test('a room change in the export needs a review and shows old and new room', () => {
  const back = M.fromRoster(M.toRoster(fresh())), pc = pcExport();
  pc.records.find(x => x[C.ROOM] === 'Sparks A')[C.ROOM] = 'Sparks B';
  const plan = M.planImport(back, pc);
  assert.strictEqual(M.needsReview(plan), true);
  const ch = plan.matched.find(x => x.changes.length).changes.find(c => c.col === C.ROOM);
  assert.deepStrictEqual([ch.from, ch.to], ['Sparks A', 'Sparks B']);
});

test('a new, missing or renamed person needs a review; a rename keeps the original ID and everything attached to it', () => {
  const m = fresh(), k = kid(m); k['team:Q1'] = 'Green';
  const back = M.fromRoster(M.toRoster(m)), pc = Csv.toRecords(Csv.parse(exportText));
  pc.records.find(x => x[C.REG] === k[C.REG] && x[C.FIRST] === k[C.FIRST])[C.FIRST] = k[C.FIRST] + 'ie';
  const plan = M.planImport(back, pc);
  assert.strictEqual(plan.renames.length, 1); assert.strictEqual(M.needsReview(plan), true);
  M.applyPlan(back, plan, { rename: new Set(plan.renames), add: new Set(), deactivate: new Set() }, today);
  const b = byId(back, k[X.ID]);
  assert.strictEqual(b[C.FIRST], k[C.FIRST] + 'ie'); assert.strictEqual(b['team:Q1'], 'Green');
});

test('color teams still assign and audit on a roster loaded from the JSON', () => {
  const back = M.fromRoster(M.toRoster(fresh()));
  const r = Teams.assign(back, 'Q1', { rng: Teams.mulberry32(5) });
  assert(r.assigned.length > 50);
  assert.strictEqual(Teams.audit(back, 'Q1').unassigned.length, 0);
});

test('an old file with no roster section opens as an empty roster', () => {
  assert.strictEqual(M.fromRoster(undefined).people.length, 0);
});

test('keys of the roster and of a person that the model does not own survive fromRoster and toRoster (R17)', () => {
  const r = M.toRoster(fresh()), id = Object.keys(r.people)[0]; r.futureKey = [1, { a: 2 }]; r.people[id].extraBit = 'x';
  const back = M.toRoster(M.fromRoster(JSON.parse(JSON.stringify(r))));
  assert.deepStrictEqual(back.futureKey, [1, { a: 2 }]); assert.strictEqual(back.people[id].extraBit, 'x');
  assert.deepStrictEqual(Object.keys(back.people[id]).sort(), ['extraBit', 'pc', 'v']); assert.strictEqual(M.fromRoster(M.toRoster(fresh())).rosterExtra, undefined, 'absent when there is nothing');
  assert(M.ROSTER_KEYS.includes('people') && M.ROSTER_KEYS.includes('pcExport'));
});

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
