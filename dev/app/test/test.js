// Usage: node test/test.js <planning-center-export.csv>
const fs = require('fs'), assert = require('assert');
const Csv = require('../csv.js'), M = require('../model.js');
const { C, X } = M;
const file = process.argv[2];
const text = fs.readFileSync(file, 'utf8');
const today = '2026-10-28';

// CSV round-trip incl. quotes, commas, newlines, BOM
const tricky = [['a', 'b,c', 'd"e', 'f\ng'], ['', ' x ', '', '1']];
assert.deepStrictEqual(Csv.parse(Csv.serialize(tricky)), tricky);

// Load: one person per data row, IDs unique, header preserved
const rows = Csv.parse(text).filter(r => r.some(c => c !== '')).length - 1;
const m = M.loadMaster(text, today);
assert.strictEqual(m.people.length, rows);
assert.strictEqual(new Set(m.people.map(p => p[X.ID])).size, rows);
const hdr = Csv.parse(text)[0];
assert.deepStrictEqual(m.pcCols, hdr);

// Extended CSV round-trip loses nothing
const m2 = M.loadMaster(M.toCsv(m), today);
assert(m2.people.every((p, i) => JSON.stringify(Object.entries(p).sort()) === JSON.stringify(Object.entries(m.people[i]).sort())), 'round-trip mismatch');
assert.deepStrictEqual(m2.pcCols.concat(m2.userCols), m.pcCols.concat(m.userCols));

assert(m.people.every(p => p[X.ID] === p[C.REG] + '_' + p[C.FIRST] + '_' + p[C.LAST] || /#\d+$/.test(p[X.ID])));

// TnT/T&T spelling and header alias are treated as the same
const tnt = M.loadMaster(text.replace(/T&T/g, 'TnT'), today);
assert.strictEqual(tnt.pcCols.includes('T&T shirt'), true);
assert.strictEqual(M.groupOf(M.room(tnt.people.find(p => /^T&T/.test(M.room(p))))), 'T&T');
const planTnt = M.planImport(m, Csv.toRecords(Csv.parse(text.replace(/T&T/g, 'TnT'))));
assert(planTnt.matched.every(x => x.changes.length === 0), 'spelling change should not look like a field change');
assert.strictEqual(planTnt.added.length + planTnt.missing.length, 0);

// Re-importing the same export: no changes, nothing new/missing
const plan = M.planImport(m2, Csv.toRecords(Csv.parse(text)));
assert.strictEqual(plan.matched.length, rows);
assert.strictEqual(plan.added.length + plan.missing.length + plan.renames.length, 0);
assert(plan.matched.every(x => x.changes.length === 0));

// Override survives import; editing PC value back clears it
const p0 = m2.people[0];
M.setField(p0, C.ROOM, 'Sparks D');
assert.strictEqual(M.room(p0), 'Sparks D');
M.applyPlan(m2, plan, { add: new Set(), deactivate: new Set(), rename: new Set() }, today);
assert.strictEqual(M.room(p0), 'Sparks D');
assert.strictEqual(M.pendingChanges(m2).length, 1);
M.setField(p0, C.ROOM, p0[C.ROOM]);
assert.strictEqual(p0['ov:' + C.ROOM], undefined);

// Pending change clears itself once the next export reflects it; PC columns are never edited locally
const pcR = Csv.toRecords(Csv.parse(text));
const target = pcR.records.find(r => M.matchKey(r) === M.matchKey(p0));
const pcBefore = p0[C.ROOM];
M.setField(p0, C.ROOM, 'Sparks D');
assert.strictEqual(p0[C.ROOM], pcBefore);                       // PC value untouched
target[C.ROOM] = 'Sparks D';                                      // PC caught up
const pl = M.planImport(m2, pcR);
assert.strictEqual(pl.matched.find(x => x.person === p0).resolved.length, 1);
const r2 = M.applyPlan(m2, pl, { add: new Set(), deactivate: new Set(), rename: new Set() }, today);
assert.strictEqual(r2.resolved, 1);
assert.strictEqual(M.pendingChanges(m2).length, 0);
assert.strictEqual(p0[C.ROOM], 'Sparks D');

// Rename + new + missing scenario
const pc = Csv.toRecords(Csv.parse(text));
// The people are picked from whatever export is given (no names are written into this test): a clubber to be renamed, and one from another registration to be withdrawn.
const isKid = r => !/volunteer/i.test(r[C.SELECTION] || '') && r[C.ROOM] !== 'Volunteers';
const victim = pc.records.find(r => isKid(r) && (r[C.FIRST] || '').length >= 4 && pc.records.filter(o => o[C.REG] === r[C.REG]).length === 1);
const gone = pc.records.find(r => isKid(r) && r !== victim && r[C.REG] !== victim[C.REG]);
const oldFirst = victim[C.FIRST];
victim[C.FIRST] = oldFirst + oldFirst.slice(-1);    // typo fix upstream (a doubled last letter)
pc.records.splice(pc.records.indexOf(gone), 1);       // withdrawn
pc.records.push(Object.assign({}, gone, { [C.REG]: '1', [C.FIRST]: 'Brand', [C.LAST]: 'New' }));
const m3 = M.loadMaster(text, today);
const idBefore = m3.people.find(p => p[C.REG] === victim[C.REG] && p[C.FIRST] === oldFirst)[X.ID];
const plan3 = M.planImport(m3, pc);
assert.strictEqual(plan3.renames.length, 1);
assert.strictEqual(plan3.added.length, 1);
assert.strictEqual(plan3.missing.length, 1);
const res = M.applyPlan(m3, plan3, { add: new Set(plan3.added), deactivate: new Set(plan3.missing), rename: new Set(plan3.renames.filter(r => r.accept)) }, '2026-11-04');
assert.deepStrictEqual(res, { updated: rows - 2, added: 1, deactivated: 1, renamed: 1, reactivated: 0, resolved: 0, superseded: 0 });
assert.strictEqual(m3.people.find(p => p[C.REG] === victim[C.REG] && p[C.FIRST] === victim[C.FIRST])[X.ID], idBefore);   // ID frozen across rename

// Per-room clubber counts + report logic
const counts = {};
m.people.filter(M.isClubber).forEach(p => counts[M.room(p)] = (counts[M.room(p)] || 0) + 1);
console.log('clubbers per room:', JSON.stringify(counts));
const med = m.people.filter(p => M.medicalText(p));
const nop = m.people.filter(M.noPhotos);
console.log('medical entries:', med.length, ' no-photos:', nop.length, nop.map(M.fullName).join(', '));
console.log('medical sample:', med.slice(0, 4).map(p => M.fullName(p) + ' => ' + M.medicalText(p).slice(0, 60)).join(' || '));
// Calendar: Q2 nights match the printed Sparks/T&T sheets; 11/25 is NO CLUB; shifting keeps weekday
if (process.argv[3]) {
  const Cal = require('../calendar.js');
  const cal = Cal.load(fs.readFileSync(process.argv[3], 'utf8'));
  assert.deepStrictEqual(Cal.nights(cal, 'Q2').map(r => Cal.short(r.Date)), ['10/28', '11/4', '11/11', '11/18', '12/2', '12/9', '12/16']);
  const rt = Cal.load(Cal.toCsv(cal));
  assert.deepStrictEqual(rt, cal);
  const before = new Date(cal[0].Date + 'T12:00:00Z').getUTCDay();
  Cal.shiftWeeks(rt, 52);
  assert.strictEqual(new Date(rt[0].Date + 'T12:00:00Z').getUTCDay(), before);
  assert.strictEqual(rt[0].Date, '2027-09-08');
  global.Model = M; global.Calendar = Cal;
  const R = require('../reports.js');
  const s = { quarter: 'Q2', dates: '' };
  const att = R.LIST.find(r => r.id === 'attendance').render({ master: m, settings: s, calendar: cal, opts: {} });
  assert.strictEqual((att.match(/class="date"/g) || []).length, 10 * 7);       // 10 rooms x 7 nights
  const uni = R.uniformRows(m);
  console.log('uniform rows:', uni.length);
  const med = R.LIST.find(r => r.id === 'binderAll').render({ master: m, settings: s, calendar: cal, opts: {} });
  const vol = m.people.find(M.isVolunteer);
  assert(vol && !med.includes(M.fullName(vol)), 'volunteer in the binder report');
  assert(!R.LIST.some(r => r.id === 'birthdays'));
  const set2 = Object.assign({ club: 'AWANA Club 2026-2027', motto: 'm' }, s);
  assert(!R.LIST.some(r => ['schedule', 'rotation', 'attendanceSummary', 'ecClass', 'ecName', 'medical', 'medicalClass', 'medicalAll'].includes(r.id)), 'the dropped and folded reports are gone');
  const les = R.LIST.find(r => r.id === 'lessons').render({ master: m, settings: set2, calendar: cal, opts: {} });
  assert(les.includes('Bear Hug 1') && les.includes('God Made the Light'));
  if (process.argv[4]) {
    const Rot = require('../rotation.js');
    const grid = Rot.load(fs.readFileSync(process.argv[4], 'utf8'));
    assert.deepStrictEqual(Rot.load(Rot.toCsv(grid)), grid);
    const rh = R.LIST.find(r => r.id === 'rotation').render({ master: m, settings: set2, rotation: grid, opts: {} });
    assert.strictEqual((rh.match(/rowspan="4"/g) || []).length, 2);              // Puggles + Cubbies all night
    assert.strictEqual((rh.match(/rowspan="2"/g) || []).length, 4);              // four T&T groups in the 7:10 block
    assert.strictEqual((rh.match(/<tr>/g) || []).length, 5);
  }
  // team list ordering: by name puts the name column before the color
  const tn = R.LIST.find(r => r.id === 'teams').render({ master: m, settings: set2, calendar: cal, opts: { order: 'name' } });
  assert(/<th>Group<\/th><th>Full name<\/th><th>Q2 Color Team<\/th>/.test(tn));
}
console.log('OK');
