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

const Safety = require('../calendar-safety.js');
const Season = require('../season.js');
const night = (Date, Quarter = 'Q1', fields = {}) => Object.assign(Calendar.blank(), { Date, Quarter }, fields);
const october = { day: 3, first: '2026-10-07', last: '2026-10-28' };
const later = '2026-10-22';

test('preserves recorded and empty historical nights with same-date events and lesson links', () => {
  const s = Season.blank('2026-27');
  s.attendance = { '2026-10-07': { child: { h: 1 } } };
  s.games = { '2026-10-21': { Red: 3 } };
  const rows = [
    night('2026-10-07', 'Q1', { 'Sparks Coloring PDF': 'https://example.org/one.pdf' }),
    night('2026-10-07', 'Q1', { Type: 'Event', Theme: 'First event' }),
    night('2026-10-07', 'Q1', { Type: 'Event', Theme: 'Second event' }),
    night('2026-10-14'),
    night('2026-10-21')
  ];
  const original = JSON.parse(JSON.stringify(rows));
  const proposal = Safety.propose(s, rows, { day: 4, first: '2026-10-22', last: '2026-10-29' }, later);
  assert.deepEqual(proposal.rows.slice(0, 5), original);
  assert.deepEqual(proposal.blocks, []);
  assert.deepEqual(proposal.kept.find(r => r.date === '2026-10-14').reasons, { 'previous schedule': 1, 'locked quarter': 1 });
  assert.deepEqual(rows, original);
});

test('reports orphan or closed activity without silently opening a meeting', () => {
  const s = Season.blank('2026-27');
  s.awards = { '2026-10-07': { child: ['Award'] } };
  s.adults = { '2026-10-14': [{ n: 'Test Leader', a: 'Award' }] };
  const closed = night('2026-10-14', 'Q1', { 'No Club': '1' });
  const proposal = Safety.propose(s, [closed], october, '2026-10-13');
  assert(!proposal.rows.some(r => r.Date === '2026-10-07'));
  assert.deepEqual(proposal.rows[0], closed);
  assert.deepEqual(proposal.existing, [
    { date: '2026-10-07', reason: 'activity missing from calendar' },
    { date: '2026-10-14', reason: 'activity on a closed night' }
  ]);
});

test('guards omissions, quarter reassignment, extending locked quarters and changing an earlier-years boundary', () => {
  const s = Season.blank('2026-27');
  const rows = [night('2026-10-07'), night('2026-10-14', 'Q2')];
  s.absences = { leader: { trip: { nights: { '2026-10-14': 1 } } } };
  s.teamMoves = { child: [{ from: '2026-10-14', q: 'Q2', color: 'Red' }] };
  s.flags = { note: { date: '2026-10-14', note: 'private content' } };
  s.progress = { child: { HG: { 'Rank.1': '2026-10-05' } } };
  const result = Safety.compare(s, rows, [night('2026-10-01', 'Q1'), night('2026-10-14', 'Q3')], '2026-10-10');
  assert.deepEqual(result.blocks.find(r => r.date === '2026-10-14').reasons, { 'volunteer absence': 1, 'team move': 1, 'dated note': 1 });
  assert(result.blocks.some(r => r.date === '2026-10-01' && r.reasons['locked quarter']));
  assert(result.blocks.some(r => r.date === '2026-10-05' && r.reasons['season classification would change']));
  assert(!JSON.stringify(result).includes('private content'));
});

test('rollover archives dates through the cutoff and keeps ambiguous later events', () => {
  const s = Season.blank('2026-27');
  s.config.carriedThrough = '2026-05-13';
  const rows = [night('2026-05-13'), night('2026-05-14', 'Q1', { Type: 'Event', Theme: 'Later event' })];
  const proposal = Safety.propose(s, rows, october, '2026-08-10');
  assert.deepEqual(proposal.archived, [rows[0]]);
  assert.deepEqual(proposal.rows[0], rows[1]);
  assert.deepEqual(proposal.blocks, []);
  assert.throws(() => Safety.propose(s, rows, { day: 3, first: '2026-05-13', last: '2026-05-20' }, '2026-08-10'), /previous season/);
});

test('repeating a generated schedule preserves the stored rows', () => {
  const s = Season.blank('2026-27');
  const before = Safety.propose(s, [], october, '2026-09-01');
  assert.deepEqual(Safety.propose(s, before.rows, october, '2026-09-01').rows, before.rows);
});

test('regeneration can reopen a generated future closure but preserves legacy or manually overridden breaks', () => {
  const s = Season.blank('2026-27');
  const without = { day: 3, first: '2026-10-07', last: '2026-10-21' };
  const config = { ...without, breaks: [{ name: 'Off', from: '2026-10-07', to: '2026-10-21' }] };
  const first = Calendar.generate(config);
  first[1]['No Club By Hand'] = '1';
  delete first[2]['Generated Break'];
  const next = Safety.propose(s, first, without, '2026-09-01');
  assert.deepEqual(next.rows.map(Calendar.isNight), [true, false, false]);
  assert(!Object.hasOwn(next.rows[0], 'Generated Break'));
});

test('merge detects new recorded activity suppressed by a calendar from another copy', () => {
  const local = Season.blank('2026-27'), remote = Season.blank('2026-27');
  local.calendar = [night('2026-10-07'), night('2026-10-14')];
  remote.calendar = [night('2026-10-07')];
  local.attendance = { '2026-10-14': { child: { a: 1 } } };
  const merged = Object.assign({}, local, { calendar: remote.calendar });
  const conflicts = Safety.mergeConflicts(local, remote, merged, '2026-10-15');
  assert(conflicts.some(r => r.date === '2026-10-14' && r.reasons.attendance));
  assert.deepEqual(Safety.mergeConflicts(local, remote, local, '2026-10-15'), []);
});

test('merge preserves accepted same-record corrections while rejecting new absence conflicts', () => {
  const local = Season.blank('2026-27'), remote = Season.blank('2026-27');
  local.calendar = [night('2026-10-07'), night('2026-10-14')];
  remote.calendar = [night('2026-10-07'), night('2026-10-14', 'Q1', { 'No Club': '1' })];
  local.attendance = remote.attendance = { '2026-10-14': { child: { a: 1 } } };
  assert.deepEqual(Safety.mergeConflicts(local, remote, remote, '2026-10-15'), []);
  local.absences = { leader: { trip: { nights: { '2026-10-14': 1 } } } };
  const merged = Object.assign({}, remote, { absences: local.absences });
  assert.deepEqual(Safety.mergeConflicts(local, remote, merged, '2026-10-15'), [
    { date: '2026-10-14', reasons: { 'volunteer absence': 1 } }
  ]);
});
