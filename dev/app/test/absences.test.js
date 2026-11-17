// Volunteer absences (S11): one absence per entry, one line per club night, kept with the person. Invented data only.
// Usage: node test/absences.test.js
const assert = require('assert');
const Season = require('../season.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n')[0]); } }
const PID = '70001_Ann_Lee', CLUB = ['2026-11-18', '2026-11-25', '2026-12-02'];
const fresh = () => Season.blank('2026-27');

test('an absence covers chosen club nights, one entry per night, kept with the person', () => {
  const s = fresh(); const id = Season.addAbsence(s, PID, ['2026-11-18', '2026-11-25'], 'Family trip', CLUB, new Date(2026, 10, 16));
  assert(/^a[0-9a-z]+$/.test(id), 'the id starts with a and has no date: ' + id);
  assert.deepStrictEqual(Object.keys(s.absences[PID][id].nights).sort(), ['2026-11-18', '2026-11-25']);
  assert.strictEqual(s.absences[PID][id].reason, 'Family trip'); assert.strictEqual(s.absences[PID][id].at, '2026-11-16');
});
test('a non-club date, or a range with no club night, is refused', () => {
  const s = fresh();
  assert.throws(() => Season.addAbsence(s, PID, ['2026-11-17'], '', CLUB), /Not a club night/);
  assert.throws(() => Season.addAbsence(s, PID, [], '', CLUB), /no club nights/);
  assert.throws(() => Season.addAbsence(s, '', ['2026-11-18'], '', CLUB), /needs a volunteer/);
  assert.strictEqual(s.absences, undefined, 'nothing was stored');
});
test('clearing one night keeps the others; clearing the last night removes the absence and then the person', () => {
  const s = fresh(); const id = Season.addAbsence(s, PID, ['2026-11-18', '2026-11-25'], '', CLUB);
  Season.clearAbsenceNights(s, PID, id, ['2026-11-18']); assert.deepStrictEqual(Object.keys(s.absences[PID][id].nights), ['2026-11-25']);
  Season.clearAbsenceNights(s, PID, id, ['2026-11-25']); assert.strictEqual(s.absences, undefined, 'the empty absence and person are gone');
});
test('clearing the whole absence removes every night of it; other absences stay', () => {
  const s = fresh(); const a = Season.addAbsence(s, PID, ['2026-11-18', '2026-11-25'], '', CLUB); const b = Season.addAbsence(s, PID, ['2026-12-02'], '', CLUB);
  Season.clearAbsence(s, PID, a); assert.deepStrictEqual(Object.keys(s.absences[PID]), [b]);
});
test('clearing the remaining nights (on or after a date) keeps the nights before it', () => {
  const s = fresh(); const id = Season.addAbsence(s, PID, CLUB, '', CLUB);
  Season.clearAbsenceNights(s, PID, id, ['2026-11-25', '2026-12-02']); assert.deepStrictEqual(Object.keys(s.absences[PID][id].nights), ['2026-11-18']);
});
test('the list gives one row per night, in date order', () => {
  const s = fresh(); Season.addAbsence(s, PID, ['2026-12-02', '2026-11-18'], '', CLUB); Season.addAbsence(s, '70002_Bo_Chu', ['2026-11-18'], '', CLUB);
  const rows = Season.absenceList(s); assert.deepStrictEqual(rows.map(r => r.date + ' ' + r.personId), ['2026-11-18 70001_Ann_Lee', '2026-11-18 70002_Bo_Chu', '2026-12-02 70001_Ann_Lee']);
});
test('the file leaves the section out while it is empty, and round-trips when not', () => {
  const s = fresh(); assert(!/"absences"/.test(Season.toJson(s)), 'omitted when empty');
  const id = Season.addAbsence(s, PID, ['2026-11-18'], 'Trip', CLUB, new Date(2026, 10, 16));
  const back = Season.fromJson(Season.toJson(s)); assert.strictEqual(back.absences[PID][id].reason, 'Trip');
});
test('absences are a History section with their own area label', () => {
  assert(Season.SECTIONS.includes('absences'), 'in SECTIONS');
});

test('a club night is held only when a child is present (volunteers do not count)', () => {
  const s = fresh(), cal = [{ Date: '2026-11-18', Type: 'Club night', Quarter: 'Q2' }];
  s.attendance['2026-11-18'] = { '70002_Vol': { a: 1 } };
  Season.setChildTest(id => id !== '70002_Vol');
  try { assert.deepStrictEqual(Season.heldNights(s, cal), [], 'a volunteer-only night is not held'); s.attendance['2026-11-18']['70001_Kid'] = { a: 1 }; assert.deepStrictEqual(Season.heldNights(s, cal), ['2026-11-18'], 'a night with a child is held'); }
  finally { Season.setChildTest(null); }
});

test('the validator: a good absence is clean; an empty one is an error; a night no longer on the calendar is a warning', () => {
  const V = require('../validate.js');
  const cal = [{ Date: '2026-11-18', Type: 'Club night', Quarter: 'Q2' }];
  const check = mut => { const s = fresh(); s.calendar = cal; Season.addAbsence(s, PID, ['2026-11-18'], 'Trip', ['2026-11-18'], new Date(2026, 10, 16)); mut(s); return V.validate(Season.toJson(s), 'awana-2026-27-20261116-000000.json').findings.filter(f => f.check === 'absences'); };
  assert.deepStrictEqual(check(() => {}).filter(f => f.level === 'error'), [], 'a good absence has no error');
  assert(check(s => { const id = Object.keys(s.absences[PID])[0]; s.absences[PID][id].nights = {}; }).some(f => f.level === 'error'), 'an empty absence is an error');
  assert(check(s => { s.calendar = []; }).some(f => f.level === 'warn' && /no longer a club night/.test(f.msg)), 'a night off the calendar is a warning');
});

test('volunteer status per night: present, planned, came anyway (present wins), and not marked; newest first; nothing stored', () => {
  const s = fresh(), V = '70002_Vol', n = ['2026-11-04', '2026-11-11', '2026-11-18'];
  s.attendance = { [n[0]]: { [V]: { a: 1 } }, [n[1]]: { [V]: { a: 1 } } };
  Season.addAbsence(s, V, [n[1]], 'Trip', n, new Date(2026, 10, 1));
  Season.addAbsence(s, V, [n[2]], 'Cover', n, new Date(2026, 10, 1));
  const before = JSON.stringify(s.absences);
  const rows = Season.volunteerNights(s, V, n, '2026-11-18');
  assert.deepStrictEqual(rows.map(r => r.date + ' ' + r.status), ['2026-11-18 planned', '2026-11-11 came', '2026-11-04 present']);
  assert.strictEqual(rows[0].reason, 'Cover'); assert.strictEqual(rows[0].clubNight, true);
  assert.strictEqual(Season.nightStatus(s, V, '2026-11-25').status, 'none', 'no mark, no absence');
  assert.strictEqual(JSON.stringify(s.absences), before, 'the helpers store nothing');
  const off = Season.volunteerNights(s, V, n.slice(0, 2), '2026-11-18').find(r => r.date === '2026-11-18');
  assert.strictEqual(off.clubNight, false, 'a planned night no longer on the calendar is still listed');
});

test('expected club nights: held, less planned-out nights not attended; a planned night with a Present mark stays expected', () => {
  const s = fresh(), V = '70002_Vol', cal = [0, 1, 2, 3, 4, 5, 6, 7].map(i => { const dt = new Date(Date.UTC(2026, 8, 9 + 7 * i)); return { Date: dt.toISOString().slice(0, 10), Type: 'Club night', Quarter: i < 4 ? 'Q1' : 'Q2' }; });
  const d = cal.map(r => r.Date), [n1, n2, n3, n4, n5, n6] = d;
  for (const x of [n1, n2, n3, n4, n5, n6]) { s.attendance[x] = { '70001_Kid': { a: 1 }, '70003_Kid': { a: 1 } }; }
  [n1, n2, n4, n6].forEach(x => { s.attendance[x][V] = { a: 1 }; });
  Season.addAbsence(s, V, [n3, n4, n5], 'Trip', d, new Date(2026, 8, 1));
  Season.setChildTest(id => id !== V);
  try {
    const e = Season.volunteerExpected(s, V, cal);
    assert.deepStrictEqual(e, { held: 6, present: 4, plannedOut: 2, expected: 4 });
    assert(e.present <= e.expected, 'present never exceeds expected');
  } finally { Season.setChildTest(null); }
});

console.log(passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0);
