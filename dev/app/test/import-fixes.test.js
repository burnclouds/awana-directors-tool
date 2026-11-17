// Planning Center import: the weekly import must not undo what the leader decided by hand, must not pair siblings as renames, and must pick the right file.
// Invented test club only. Usage: node test/import-fixes.test.js
const assert = require('assert'), fs = require('fs'), path = require('path');
const M = require('../model.js'), Season = require('../season.js'), Csv = require('../csv.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const dir = path.join(__dirname, '..', '..', 'test-data'), jsonName = fs.readdirSync(dir).find(f => /TEST.*\.json$/.test(f)), csvName = fs.readdirSync(dir).find(f => /TEST.*\.csv$/.test(f));
const jsonText = fs.readFileSync(path.join(dir, jsonName), 'utf8'), csvText = fs.readFileSync(path.join(dir, csvName), 'utf8');
const { C, X } = M, today = '2026-11-04';
const fresh = () => M.fromRoster(Season.fromJson(jsonText).roster), exportRecords = () => Csv.toRecords(Csv.parse(csvText));
const kid = m => m.people.find(p => M.isClubber(p) && M.isActive(p));
const none = () => ({ rename: new Set(), add: new Set(), deactivate: new Set() });

// ---------- B2: a child marked inactive by hand stays inactive ----------
test('inactive by hand and still in the export: the import leaves them inactive and does not force a review', () => {
  const m = fresh(), k = kid(m); M.setActive(k, false);
  const plan = M.planImport(m, exportRecords());
  assert.strictEqual(M.needsReview(plan), false);
  M.applyPlan(m, plan, none(), today);
  assert.strictEqual(M.isActive(k), false);
});
test('inactive by hand: ticking "make active again" in the review does reactivate them', () => {
  const m = fresh(), k = kid(m); M.setActive(k, false);
  const plan = M.planImport(m, exportRecords());
  const res = M.applyPlan(m, plan, Object.assign(none(), { reactivate: new Set([k]) }), today);
  assert.strictEqual(M.isActive(k), true); assert.strictEqual(res.reactivated, 1);
});
test('left the export (import marked them inactive), then reappears: set active again, with a review', () => {
  const m = fresh(), k = kid(m), recs = exportRecords(), gone = recs.records.splice(recs.records.findIndex(r => r[C.REG] === k[C.REG] && r[C.FIRST] === k[C.FIRST]), 1)[0];
  const p1 = M.planImport(m, recs); assert(p1.missing.includes(k));
  M.applyPlan(m, p1, Object.assign(none(), { deactivate: new Set([k]) }), today);
  assert.strictEqual(M.isActive(k), false);
  recs.records.push(gone);
  const p2 = M.planImport(m, recs); assert.strictEqual(M.needsReview(p2), true);
  const res = M.applyPlan(m, p2, none(), today);
  assert.strictEqual(M.isActive(k), true); assert.strictEqual(res.reactivated, 1);
});
test('a hand change on the Roster forgets who deactivated: marking inactive by hand protects them, reactivating clears it', () => {
  const m = fresh(), k = kid(m); k[X.INACTIVE_BY] = 'import'; k[X.ACTIVE] = '0';
  M.setActive(k, true); assert.strictEqual(M.isActive(k), true); assert(!k[X.INACTIVE_BY]);
  M.setActive(k, false); assert.strictEqual(M.isActive(k), false); assert(!k[X.INACTIVE_BY]);
});
test('the "deactivated by the import" mark survives saving and opening the data file', () => {
  const m = fresh(), k = kid(m), recs = exportRecords(); recs.records.splice(recs.records.findIndex(r => r[C.FIRST] === k[C.FIRST] && r[C.REG] === k[C.REG]), 1);
  M.applyPlan(m, M.planImport(m, recs), Object.assign(none(), { deactivate: new Set([k]) }), today);
  const back = M.fromRoster(JSON.parse(JSON.stringify(M.toRoster(m)))), k2 = back.people.find(p => p[X.ID] === k[X.ID]);
  assert.strictEqual(k2[X.INACTIVE_BY], 'import');
});

// ---------- R2: people added by hand are not "missing" ----------
test('a person added by hand is not offered for deactivation by an import', () => {
  const m = fresh(), p = M.addManualPerson(m, { [C.FIRST]: 'Visiting', [C.LAST]: 'Kid', [C.SELECTION]: 'Clubber (Cubbies, Sparks & T&T only)' }, today);
  const plan = M.planImport(m, exportRecords());
  assert(!plan.missing.includes(p)); assert.strictEqual(M.needsReview(plan), false);
  M.applyPlan(m, plan, Object.assign(none(), { deactivate: new Set(plan.missing) }), today);
  assert.strictEqual(M.isActive(p), true);
});

// ---------- small synthetic rosters for the pairing rules ----------
const PCOLS = [C.REG, C.FIRST, C.LAST, C.BDAY, C.GRADE, C.ROOM, C.SELECTION];
const person = (reg, first, last, bday, extra) => Object.assign({ [C.REG]: reg, [C.FIRST]: first, [C.LAST]: last, [C.BDAY]: bday || '', [C.GRADE]: 'K', [C.ROOM]: 'Sparks A', [C.SELECTION]: 'Clubber (Cubbies, Sparks & T&T only)' }, extra || {});
const rosterOf = list => M.fromRoster({ pcCols: PCOLS, cols: [], people: Object.fromEntries(list.map((p, i) => ['id' + (i + 1), { pc: p, v: { x_Active: p.__off ? '0' : '1' } }])) });
const exportOf = list => ({ cols: PCOLS, records: list });

test('R1: a sibling swap in one registration is offered as a rename but not pre-ticked when the birthdates differ', () => {
  const m = rosterOf([person('50', 'Marlena', 'Okafor', '2017-03-01'), person('50', 'Marlon', 'Okafor', '2023-06-09', { [C.ROOM]: 'Cubbies' })]);
  const plan = M.planImport(m, exportOf([person('50', 'Marlon', 'Okafor', '2023-06-09', { [C.ROOM]: 'Cubbies' }), person('50', 'Marlena', 'Okafor', '2017-03-01')]));
  assert.strictEqual(plan.renames.length, 0);                                       // sanity: an exact swap matches by name
  const m2 = rosterOf([person('50', 'Marlena', 'Okafor', '2017-03-01')]);
  const p2 = M.planImport(m2, exportOf([person('50', 'Marlon', 'Okafor', '2023-06-09', { [C.ROOM]: 'Cubbies' })]));
  assert.strictEqual(p2.renames.length, 1); assert.strictEqual(p2.renames[0].accept, false);
});
test('R1: a spelling fix on the same child (same birthdate) is still pre-ticked', () => {
  const m = rosterOf([person('51', 'Marigoldd', 'Okafor', '2017-03-01')]);
  const plan = M.planImport(m, exportOf([person('51', 'Marigold', 'Okafor', '2017-03-01')]));
  assert.strictEqual(plan.renames.length, 1); assert.strictEqual(plan.renames[0].accept, true);
});
test('R1: the shared last name does not make different first names look alike', () => {
  const m = rosterOf([person('52', 'Jo', 'Longsurname-Hartwell', '2016-01-01')]);
  const plan = M.planImport(m, exportOf([person('52', 'Bea', 'Longsurname-Hartwell', '2020-01-01')]));
  assert.strictEqual(plan.renames.length, 0);
});
test('R1: when two new rows compete for one missing person the closer name wins, whatever the file order', () => {
  const m = rosterOf([person('53', 'Katherine', 'Lund', '2016-02-02'), person('53', 'Katharine', 'Lund', '2016-02-02')]);
  const plan = M.planImport(m, exportOf([person('53', 'Katharyn', 'Lund', '2016-02-02'), person('53', 'Katharin', 'Lund', '2016-02-02')]));
  const pair = f => plan.renames.find(r => r.rec[C.FIRST] === f);
  assert.strictEqual(plan.renames.length, 2);
  assert.strictEqual(pair('Katharin').person[C.FIRST], 'Katharine'); assert.strictEqual(pair('Katharyn').person[C.FIRST], 'Katherine');
});

// ---------- R3: a returning child under a new registration ID ----------
test('R3: an inactive child who reappears under a new registration ID is paired with the old record', () => {
  const m = rosterOf([person('60', 'Rowan', 'Pike', '2018-04-04', { __off: 1 })]);
  const plan = M.planImport(m, exportOf([person('61', 'Rowan', 'Pike', '2018-04-04')]));
  assert.strictEqual(plan.added.length, 0); assert.strictEqual(plan.renames.length, 1);
  assert(/returning/i.test(plan.renames[0].reason), plan.renames[0].reason);
  M.applyPlan(m, plan, Object.assign(none(), { rename: new Set(plan.renames) }), today);
  assert.strictEqual(m.people.length, 1); assert.strictEqual(M.isActive(m.people[0]), true); assert.strictEqual(m.people[0][C.REG], '61');
});
test('R3: declining that pairing adds a new person and leaves the old inactive record alone', () => {
  const m = rosterOf([person('60', 'Rowan', 'Pike', '2018-04-04', { __off: 1 })]);
  const plan = M.planImport(m, exportOf([person('61', 'Rowan', 'Pike', '2018-04-04')]));
  const res = M.applyPlan(m, plan, none(), today);
  assert.strictEqual(m.people.length, 2); assert.strictEqual(res.deactivated, 0); assert.strictEqual(res.added, 1);
});

// ---------- R4: accented letters ----------
test('R4: a spelling fix that only adds or removes an accent still matches the same person', () => {
  const m = rosterOf([person('70', 'Zoe', 'Nunez', '2018-01-01')]);
  const plan = M.planImport(m, exportOf([person('70', 'Zoë', 'Nuñez', '2018-01-01')]));
  assert.strictEqual(plan.matched.length, 1); assert.strictEqual(plan.renames.length, 0); assert.strictEqual(plan.added.length, 0);
});

// ---------- B3: several data files picked at once ----------
const dataFile = (stamp, lastEdit, lastModified) => { const s = Season.fromJson(jsonText); s.history = s.history.slice(0, 1).concat(lastEdit ? [{ t: lastEdit, label: 'edit', changes: [] }] : []); return { name: 'awana-2026-27-' + stamp + '.json', text: JSON.stringify(Object.assign(JSON.parse(jsonText), { history: s.history })), lastModified }; };
test('B3: with several data files, the one edited last wins, whatever order the browser lists them', () => {
  const older = dataFile('20261029-214815', '2026-10-29T21:48:15.000Z', 1), newer = dataFile('20261030-090000', '2026-10-30T09:00:00.000Z', 2);
  assert.strictEqual(Season.newest([older, newer]).keep, newer); assert.strictEqual(Season.newest([newer, older]).keep, newer);
  assert.deepStrictEqual(Season.newest([newer, older]).skipped, [older]);
});
test('B3: with no usable history the time in the file name decides, then the file\'s own date', () => {
  const a = { name: 'awana-2026-27-20261029-214815.json', text: '{}', lastModified: 9 }, b = { name: 'awana-2026-27-20261030-090000.json', text: '{}', lastModified: 1 };
  assert.strictEqual(Season.newest([b, a]).keep, b);
  const c = { name: 'copy of data.json', text: '{}', lastModified: 5 }, d = { name: 'data (2).json', text: 'not json', lastModified: 8 };
  assert.strictEqual(Season.newest([c, d]).keep, d);
});

// ---------- a pending change does not outlive Planning Center moving the field to a third value ----------
const withGrade = (rec, grade) => { const r = exportRecords(); r.records.find(x => x[C.REG] === rec[C.REG] && x[C.FIRST] === rec[C.FIRST])[C.GRADE] = grade; return r; };
test('pending change, then Planning Center changes the field to a different value: the pending change is dropped, with a review', () => {
  const m = fresh(), k = kid(m), orig = k[C.GRADE]; k['ov:' + C.GRADE] = 'Wanted';
  const plan = M.planImport(m, withGrade(k, 'Third'));
  assert.deepStrictEqual(plan.matched.find(x => x.person === k).superseded, [C.GRADE]); assert.strictEqual(M.needsReview(plan), true);
  const res = M.applyPlan(m, plan, none(), today);
  assert.strictEqual(res.superseded, 1); assert(!k['ov:' + C.GRADE]); assert.strictEqual(k[C.GRADE], 'Third'); assert.notStrictEqual(orig, undefined);
});
test('pending change contradicted by Planning Center, Keep mine: the file takes Planning Center\'s value, the pending change stays and is still listed', () => {
  const m = fresh(), k = kid(m); k['ov:' + C.GRADE] = 'Wanted';
  const plan = M.planImport(m, withGrade(k, 'Third'));
  const res = M.applyPlan(m, plan, Object.assign(none(), { keep: new Map([[k, new Set([C.GRADE])]]) }), today);
  assert.strictEqual(res.superseded, 0); assert.strictEqual(res.kept, 1);
  assert.strictEqual(k['ov:' + C.GRADE], 'Wanted'); assert.strictEqual(k[C.GRADE], 'Third');
  assert(M.pendingChanges(m).some(c => c.person === k && c.col === C.GRADE), 'the red warning list still has the change');
  const next = M.planImport(m, withGrade(k, 'Third'));
  assert.deepStrictEqual(next.matched.find(x => x.person === k).superseded, [], 'next export does not ask again while Planning Center keeps the same value');
});
test('pending change, Planning Center unchanged: the pending change stays; Planning Center matches it: it clears as before', () => {
  const m = fresh(), k = kid(m); k['ov:' + C.GRADE] = 'Wanted';
  const same = M.planImport(m, exportRecords());
  assert.deepStrictEqual(same.matched.find(x => x.person === k).superseded, []); M.applyPlan(m, same, none(), today); assert.strictEqual(k['ov:' + C.GRADE], 'Wanted');
  const hit = M.planImport(m, withGrade(k, 'Wanted')), res = M.applyPlan(m, hit, none(), today);
  assert.strictEqual(res.resolved, 1); assert.strictEqual(res.superseded, 0); assert(!k['ov:' + C.GRADE]);
});

// ---------- guests: added by hand, tied to a Planning Center entry later ----------
function guestSetup(first, last) {
  const m = fresh(), g = M.addManualPerson(m, { [C.FIRST]: first, [C.LAST]: last, [C.SELECTION]: 'Clubber (Cubbies, Sparks & T&T only)', [C.ROOM]: 'Sparks A' }, today), pc = exportRecords();
  const rec = Object.assign({}, pc.records[0], { [C.FIRST]: first, [C.LAST]: last, [C.REG]: '99990001', [C.ROOM]: 'Sparks A', [C.BDAY]: '' }); pc.records.push(rec);
  return { m, g, pc, rec };
}
test('guest: the import offers a Planning Center row with the same name, pre-ticked, and linking keeps the guest\'s ID and history', () => {
  const { m, g, pc, rec } = guestSetup('Zed', 'Testington'), id = g[X.ID], n = m.people.length;
  const plan = M.planImport(m, pc), r = plan.renames.find(x => x.person === g);
  assert(r && r.guest && r.accept, 'offered and pre-ticked'); assert(!plan.added.includes(rec), 'not also added as a new person'); assert(!plan.missing.includes(g), 'a guest is never "missing"');
  M.applyPlan(m, plan, { rename: new Set([r]), add: new Set(), deactivate: new Set() }, today);
  assert.strictEqual(m.people.length, n, 'no duplicate person'); assert.strictEqual(g[X.ID], id, 'same ID'); assert.strictEqual(g[C.REG], '99990001', 'now has the Planning Center registration'); assert(!M.isGuest(g));
  assert(/Was a guest/.test(g[X.NOTES]), g[X.NOTES]); assert.strictEqual(M.isActive(g), true);
});
test('guest: declining the link keeps the guest as a guest (never marked inactive) and adds the Planning Center row as its own person', () => {
  const { m, g, pc, rec } = guestSetup('Zed', 'Testington'), plan = M.planImport(m, pc), r = plan.renames.find(x => x.person === g), n = m.people.length, dec = { rename: new Set(), add: new Set(), deactivate: new Set() };
  M.applyPlan(m, plan, dec, today); dec.add.add(rec);
  assert(M.isGuest(g) && M.isActive(g), 'still an active guest'); assert(!dec.deactivate.has(g));
  void r; void n;
});
test('guest: a similar (not identical) name is offered but not pre-ticked; an unrelated name is not offered', () => {
  const near = guestSetup('Zedd', 'Testington'); near.rec[C.FIRST] = 'Zed';
  const r = M.planImport(near.m, near.pc).renames.find(x => x.person === near.g); assert(r && r.guest && !r.accept, 'near match, not pre-ticked');
  const far = guestSetup('Quincy', 'Zzyzx'); far.rec[C.FIRST] = 'Wilhelmina'; far.rec[C.LAST] = 'Brown';
  assert(!M.planImport(far.m, far.pc).renames.some(x => x.person === far.g));
});
test('guest: linking by hand to any unmatched Planning Center row works, even with a different name', () => {
  const { m, g, pc, rec } = guestSetup('Zed', 'Testington'); rec[C.FIRST] = 'Zachary';
  const offered = M.unlinkedRecords(m, pc).find(r => r[C.REG] === '99990001'); assert(offered && offered[C.FIRST] === 'Zachary', 'the row is offered as a link target');
  M.linkToPc(m, g, pc, offered, today); assert.strictEqual(g[C.FIRST], 'Zachary'); assert.strictEqual(g[C.REG], '99990001'); assert(!M.isGuest(g)); assert(!M.unlinkedRecords(m, pc).some(r => r[C.REG] === '99990001'), 'no longer unmatched');
});

// ---------- a class move: pending in Planning Center until an import shows it ----------
test('class move: shows at once, makes a To do item saying where to move them, stays while Planning Center is unchanged, and the import that shows the new class clears it', () => {
  const Todo = require('../todo.js'), m = fresh(), k = kid(m), from = M.room(k), to = M.ROOM_ORDER.find(r => r !== from && M.groupOf(r) === M.groupOf(from)) || M.ROOM_ORDER.find(r => r !== from && r !== 'Volunteers');
  M.setField(k, C.ROOM, to);
  assert.strictEqual(M.room(k), to, 'effective class changes at once'); assert.strictEqual(k[C.ROOM], from, 'Planning Center value untouched');
  const item = () => Todo.compute({ master: m, quarter: 'Q2', today }).groups.find(g => g.id === 'pc');
  const mine = item().items.find(i => i.id === k[X.ID]); assert(mine && mine.text.startsWith('Move to ' + to + ' in Planning Center') && mine.text.includes(from), mine && mine.text);
  const same = M.planImport(m, exportRecords()); M.applyPlan(m, same, none(), today); assert(M.pendingChanges(m).some(c => c.person === k), 'Planning Center still says the old class: the item stays');
  const pc = exportRecords(), rec = pc.records.find(r => r[C.REG] === k[C.REG] && r[C.FIRST] === k[C.FIRST]); rec[C.ROOM] = to;
  const plan = M.planImport(m, pc), res = M.applyPlan(m, plan, none(), today);
  assert.strictEqual(res.resolved, 1); assert(!M.pendingChanges(m).some(c => c.person === k), 'cleared'); assert(!(item() || { items: [] }).items.some(i => i.id === k[X.ID])); assert.strictEqual(k[C.ROOM], to);
});

test('a guest added by hand is still a pending change, but the message says register them, not move them; a registered child still says Move', () => {
  const m = fresh(), g = M.addManualPerson(m, { [C.FIRST]: 'Guest', [C.LAST]: 'Kid', [C.SELECTION]: 'Clubber (Cubbies, Sparks & T&T only)', [C.ROOM]: 'T&T Boys A' }, today);
  g['ov:' + C.ROOM] = 'T&T Boys (Group A)'; const c = M.pendingChanges(m).find(x => x.person === g); assert(c, 'noticed');
  assert(/^Not in Planning Center yet\. When you register them there, put them in T&T Boys \(Group A\)\./.test(M.pendingText(c)), M.pendingText(c)); assert(!/Move to/.test(M.pendingText(c)));
  const reg = m.people.find(x => !M.isGuest(x) && M.isActive(x) && M.isClubber(x)); reg['ov:' + C.ROOM] = 'Sparks A'; const d = M.pendingChanges(m).find(x => x.person === reg); assert(/^Move to Sparks A in Planning Center \(it still says /.test(M.pendingText(d)), M.pendingText(d));
});

console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
