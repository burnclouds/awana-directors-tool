// N3 calendar maker, using invented schedules only.
const assert = require('node:assert/strict');
const test = require('node:test');
const Calendar = require('../calendar.js');

test('generate recommends editable closures and flags Easter without closing the meeting', () => {
  const first = '2026-09-09', last = '2027-05-12';
  const breaks = Calendar.recommendBreaks(first, last);
  const rows = Calendar.generate({ day: 3, first, last, breaks });
  assert.equal(rows.length, 36);
  assert.deepEqual(rows.filter(r => !Calendar.isNight(r)).map(r => r.Date), ['2026-11-25', '2026-12-23', '2026-12-30']);
  assert.deepEqual(rows.filter(r => r.Holiday === 'Easter week').map(r => r.Date), ['2027-03-24']);
  assert.equal(Calendar.recommendBreaks('2027-01-01', '2027-01-01')[0].name, 'Christmas break');
  const withoutBreaks = Calendar.generate({ day: 3, first, last, easterFlag: false });
  assert(withoutBreaks.every(r => Calendar.isNight(r) && !r.Holiday));
  assert.deepEqual(Calendar.suggestQuarters(rows), { Q2: '2026-11-04', Q3: '2027-01-06', Q4: '2027-03-03' });
});

test('generate uses UTC civil dates and rejects invalid input', () => {
  assert.deepEqual(Calendar.generate({ day: 4, first: '2027-03-10', last: '2027-03-19' }).map(r => r.Date), ['2027-03-11', '2027-03-18']);
  assert.throws(() => Calendar.generate({ day: 3, first: '2027-02-29', last: '2027-03-01' }), /valid first/);
  assert.throws(() => Calendar.generate({ day: 3, first: '2027-03-01', last: '2027-03-31', breaks: [{ name: 'Late', from: '2027-03-08', to: '2027-03-02' }] }), /valid date range/);
});

test('quarter starts split open nights and closures and events pick the next club night', () => {
  const first = '2026-09-09', last = '2026-09-30';
  const rows = Calendar.generate({ day: 3, first, last, breaks: [{ name: 'Break', from: '2026-09-16', to: '2026-09-16' }] });
  rows.push({ Date: '2026-09-20', Type: 'Event', Theme: 'Community day' });
  const starts = Calendar.suggestQuarters(rows);
  assert.deepEqual(starts, { Q2: '2026-09-23', Q3: '2026-09-30', Q4: '' });
  assert.deepEqual(Calendar.applyQuarters(rows, starts).map(r => r.Quarter), ['Q1', 'Q2', 'Q2', 'Q2', 'Q3']);
  assert.equal(rows[4].Quarter, undefined);
  assert.throws(() => Calendar.applyQuarters(rows, { Q2: '2026-09-16' }), /on separate club nights/);
});
